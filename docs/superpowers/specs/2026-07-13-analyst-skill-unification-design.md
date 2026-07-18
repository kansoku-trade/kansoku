# 自动重估直读 intraday-signal skill（逻辑只做一套）

日期：2026-07-13
状态：已批准待实现

## 背景与问题

server 端自动重估（`packages/core/src/ai/analyst.ts`）目前维护一份手写的
`SYSTEM_PROMPT`，内容是 `.claude/skills/intraday-signal/SKILL.md` 判读纪律的
人工翻译版。两份纪律并行演化：skill 已要求"先查 X 再定催化日/平静日"，而
自动重估既没有 X 访问能力，提示词里也没有这条规则。SKILL.md 里甚至写着
"in-app 自动重估拿不到账户数据，故意不给仓位"这样的分歧注解。

目标：**纪律只写一份**。自动重估直接读 SKILL.md，行为对齐 Claude Code
手动跑 skill——查 X、跑 options-levels、算仓位、写 journal 全部一致。

## 范围

- 只改自动重估（`analyst.ts` 及其装配）。
- `chat.ts`（图表聊天）与 `deepDive.ts`（deep-dive 代理）不动。
- `deepDiveTools.ts` 里可复用的工具实现抽成共享导出，不复制代码。

## 设计

### 提示词构建

每次 run 开始时，server 用现成的 `services/skills.ts` 直接读取
`intraday-signal` 的 SKILL.md 全文，嵌入系统提示——不依赖模型自己调
`read_skill` 去拿，保证纪律必定在场。

系统提示 = SKILL.md 全文 + 一段薄适配层。适配层只做环境映射，不含任何
判读逻辑：

| SKILL.md 步骤                                                               | in-app 映射                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Step 3：curl POST `/api/charts` preview                                     | 改用 `read_data_pack` 工具（同一份聚合数据）；**禁止**用 bash curl 本机图表接口，避免重复建图 |
| Step 5：curl PATCH prediction                                               | 改用 `submit_prediction` 工具（含硬校验，打回必须修正重交）                                   |
| Step 7：写 journal                                                          | 改用 `write_journal` 工具                                                                     |
| 其余步骤（查 X、options-levels、finance-calendar、portfolio 仓位、lessons） | 照 SKILL.md 用 `bash` 执行                                                                    |

手写 `SYSTEM_PROMPT` 中与 SKILL.md 重复的判读纪律全部删除。

### 工具面

现有五个工具保留不动，`validatePrediction` 校验逻辑原样：

- `read_data_pack` / `fetch_news` / `fetch_kline` / `append_comment` / `submit_prediction`

新增三个，实现复用 `deepDiveTools.ts`（抽公共模块共享）：

- `bash` — 同 deep-dive：cwd = repo root、只读命令、拒绝重定向 / `rm` /
  `mv` / `cp` / `tee`、输出截断。
- `read_skill` / `read_file` — 供模型按需加载关联 skill（`twitter-reader`、
  `options-levels`、`chart`）和读 `journal/lessons.md` 等仓库文件。
- `write_journal` — 新工具，仿 `write_note`：
  - 只允许写 `journal/YYYY-MM-DD-<SYM>-intraday.md`；路径由服务端按
    美东交易日日期拼死，模型只提供内容。
  - 同日文件已存在则**追加**时间戳分节，绝不覆盖（符合仓库既有约定）。

### SKILL.md 修改

删除 Step 5 里的分歧注解：

> (Sizing applies to this skill's manual runs only — the in-app
> auto-reassess analyst has no account data and deliberately gives no
> size; its output is direction + levels, and sizing stays a human-run
> step.)

分歧不再存在。不往 SKILL.md 加任何 in-app 专属内容——环境映射只活在
代码里的适配层。

同时删除现手写提示词中"不要给仓位建议——自动重估拿不到账户资金数据"
一条（随整段 SYSTEM_PROMPT 一起消失）。

### 运行与失败模式

- **超时**：流程变长（X + 脚本 + journal），analyst 超时提到 15 分钟，
  对齐 deep-dive。
- **`opencli` 不可用 / 未登录**：按 SKILL.md 既有降级规则——报"X 未查"、
  催化日/平静日判级标为临时，不中断本次 run。
- **SKILL.md 读不到**：立即失败并写 error 点评。纪律缺席时不允许裸跑。
- 现有 run lock、escalation 冷却、"分析员未提交预测"兜底逻辑全部不变。

## 测试

- `analyst` 现有测试改为注入假 exec / 假 skill 文本，跑通全流程。
- 新增单测：
  - 提示词构建（SKILL.md 全文嵌入 + 适配层拼接；文件缺失时报错）。
  - `write_journal` 追加语义（新建 / 同日追加 / 路径逃逸拒绝）。
- 手动验证：触发一次真实重估，确认 cockpit 出图、journal 落文件、
  agent 日志中出现 X 查询。
