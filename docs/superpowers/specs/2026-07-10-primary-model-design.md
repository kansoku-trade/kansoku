# 主模型 + 设置页 UI 迭代设计

日期：2026-07-10
状态：待评审
前置：`2026-07-10-ai-model-settings-design.md`（已实现）

## 背景与目标

设置页现状是四个用途各配一份模型，实际使用中四行配置完全相同，重复且啰嗦。本迭代引入「主模型」：一份公共模型配置，各用途默认跟随，只有例外才单独自定义。同步做一轮配套 UI 重构和一个当日花费列。

## 需求决策（已与用户确认）

| 维度         | 决策                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 跟随语义     | 四用途统一三态：跟随主模型（默认）/ 自定义 / 停用；追问的「跟随升级分析」删除 |
| 本轮范围     | 主模型 + 配套 UI 重构 + 每用途当日花费列；key 有效性常驻状态不做              |
| 主模型未设置 | 跟随中的用途视为未配置（该层停用 + 界面黄字），不报错不回退                   |

## 非目标

- 不做 key 有效性定时探测/常驻状态。
- 不做花费轮询——页面加载取一次。
- 不做主模型的多套预设/切换。

## 语义与数据模型

- 主模型是一份独立配置（provider / modelId / thinkingLevel），自己不发请求，只被跟随；可以未设置。
- 复用 `ai_role_settings` 表：新增一行 `role = "primary"`，`mode` 仅允许 `custom`（已设置）/ `disabled`（未设置），禁止 `inherit`。
- `mode = "inherit"` 的含义从「chat 跟随 analyst」改为「跟随主模型」，对 comment / analyst / deepDive / chat 全部合法。
- `aiConfig()` 解析：先解析 primary（custom → 目录查找 → 副本 + thinkingLevel；disabled 或 stale → null）；各用途 inherit → 直接取 primary 的解析结果（含 null）；custom / disabled 行为不变。chat 与 analyst 不再有任何特殊关联。
- settingsStore：`AiRole` 类型扩为含 `"primary"`（或单独常量集合，实现自定）；`setRole` 校验矩阵按上述放开/收紧；缺行默认统一钉死：primary 缺行 = disabled；四个用途缺行 = inherit（语义即「装好就跟随」，原 comment/analyst/deepDive 的 disabled 缺行默认作废），写测试固定。

## 一次性迁移

新 `app_meta` 标志 `primary_model_v1 = "completed"`，套用 env 搬家的全部纪律（标志唯一触发、单事务、onConflictDoUpdate 幂等、直接 drizzle 写、失败整体回滚下次重试）：

1. 选主模型：analyst 行为 custom → 取其配置；否则按 comment → deepDive → chat 顺序取第一个 custom 行的配置；一个都没有 → primary 写 disabled。
2. 凡 custom 且配置（provider/modelId/thinkingLevel 三元组）与主模型完全相同的用途行 → 改写为 inherit。
3. 原 chat 的 inherit 行保持 inherit（语义自动变为跟随主模型）。
4. 配置不同的 custom 行与 disabled 行不动。
5. 写标志，提交。

现状数据（四行同款 DeepSeek V4 Pro/off）迁移后 = primary custom + 四行 inherit，行为完全等价。

## API

- `GET /api/settings/ai`：`roles` 增加 `primary` 条目（同 shape 含 `stale`）。
- `PUT /api/settings/ai/roles/primary`：`custom`（全套校验）或 `disabled`；`inherit` → 400。`DELETE /roles/primary` → disabled。
- 其余四用途 PUT：`inherit` 不再限 chat。
- 新增 `GET /api/settings/ai/usage-today`：按美东今日聚合 `ai_usage`，返回 `{ ok: true, data: { roles: { comment: { calls, cost }, analyst: …, deepDive: …, chat: … }, total: { calls, cost } } }`。layer→用途映射对照 `attachAiUsageLogger` 调用方的实际 layer 值；`event-filter` 层并入 comment。未知 layer 计入 total 不计入任何行。

## UI（模型分配卡重排）

- **主模型行置顶**，与用途行视觉区隔（底色/分隔线）：三个下拉 + 「测试」+ 保存状态。未设置时下拉空占位，选 provider 即按原子快照规则创建（provider + 首个模型 + 关闭思考，一次 PUT）。行尾「清除」文字按钮 → Modal 确认（文案提醒：跟随中的用途将变为未配置）→ DELETE。
- **四个用途行统一分段控件**：跟随主模型｜自定义｜停用（现追问行形态推广）。
  - 跟随态：一行灰字「跟随主模型 · <解析出的模型名> · <档位中文>」；主模型未设置或 stale → 黄字「主模型未设置，此用途暂停」。无下拉、无测试按钮。
  - 自定义态：现有完整控件行。
  - 停用态：仅分段控件。
- **思考档位显示中文化**（存储值不变）：off→关闭思考、minimal→最简、low→低、medium→中、high→高、xhigh→极高。主模型行与自定义行的下拉、跟随态灰字统一用此映射。
- **花费列**：每用途行尾灰字「今日 $X.XX · N 次」（零调用显示「今日 —」）；卡片底部总计一行。页面加载时与 settings/catalog 并行取一次。
- saveQueue 机制原样复用；主模型行持有自己的队列实例。

## 测试

server（vitest）：

- settingsStore：primary 拒收 inherit；四用途 inherit 全放开；缺行默认（primary=disabled，四用途=inherit）。
- aiConfig：inherit→primary 解析；primary 未设置/stale → 跟随者 null；chat 与 analyst 解耦的回归（chat inherit + analyst custom ≠ analyst 模型，除非 primary 同款）；自定义/停用不变。
- 迁移：四行同款收拢主模型 + 全 inherit；异款保留 custom；无 custom → primary disabled；标志幂等 + 表非空无标志仍执行 + 事务回滚。
- 路由：PUT primary 校验矩阵（inherit 400、custom 全校验、disabled/DELETE）；GET 含 primary；usage-today：造多行 ai_usage（含 event-filter、未知 layer、非今日行）断言分组、并入与排除。
- 既有测试更新：chat inherit 相关断言改为 primary 语义。

web：saveQueue 无改动不加测；组件照旧不测。

人工验收：

1. 迁移后打开 /settings：主模型行 = DeepSeek V4 Pro/关闭思考，四用途全为「跟随主模型」，行为与迁移前无差别（发一条追问验证）。
2. 主模型换成另一模型 → 四个跟随行的灰字即时更新，下一轮分析用新模型（ai_usage 核对）。
3. 「清除」主模型 → 确认框 → 四行黄字「主模型未设置」；重新设置恢复。
4. 某用途切自定义配不同模型 → 只影响该用途；切回跟随恢复。
5. 花费列数字与总览页 usage 对得上；零调用显示「今日 —」。
6. 思考档位处处显示中文。

## UI/UX 后续备忘（不在本轮）

- provider 行 key 有效性常驻状态（需探测机制或沉淀上次测试结果）。
- 花费列点击跳转总览页用量明细。
- 启用/停用双按钮如仍有残留场景，统一为分段控件形态（本轮重排后应已消除）。
