# 桌面版可配置数据目录（项目根绑定）

日期：2026-07-13  
状态：已与用户对齐，待实施  
相关：`2026-07-11-electron-app-design.md`、`2026-07-11-electron-phase3-distribution-design.md`、`app/desktop` 数据导入

## 背景与目标

安装版 Kansoku 默认把数据写在 macOS `userData`（`~/Library/Application Support/Kansoku/`），开发态 / Server 态则写在 trade 仓库根下的 `journal/`、`stocks/`。个人使用者若同时用 CLI skill、`pnpm dev` 与安装版，会得到两套互不同步的图和库。

**目标**：打包桌面版支持在设置里手动指定**数据目录（项目根）**。指到本机 trade 仓库根后，安装版与 Server / 开发桌面共用同一棵目录树，磨平个人场景下的 A/B/C 分叉。

**非目标（第一期不做）**

- 切换时自动迁移图表 JSON 或 `app.db`
- 不重启的热切换
- 多套数据根配置档 / 快速切换列表
- 绑定 git 远程或自动同步
- Server / Linux 自部署的设置 UI（继续用环境变量即可）
- 改动 `@trade/core` 的相对路径布局（仍镜像仓库树）
- 首启引导里询问数据目录（陌生人默认 `userData` 即可）

## 产品语义

### 数据目录 = 项目根，不是图表子目录

用户选择的是与仓库根同级的目录，内核相对路径不变：

```text
{root}/journal/charts/data/     # 图表 JSON + app.db
{root}/journal/charts/annotations/
{root}/stocks/
```

UI 文案用「数据目录」，说明里写清：请选含 `journal/` 的仓库根（或空目录，启动时会自动建结构）。不要引导用户直接选 `journal/charts/data`。

### 谁用默认、谁用自定义

| 用户 | 行为 |
|------|------|
| 普通分发用户 | 不碰设置，一直用系统默认 `userData` |
| 个人 + 本仓库 | 设置里选一次 `…/trade`，重启后与 skill / server 共用 |

### 与「从 repo 导入数据」分工

| | 绑定数据目录（本设计） | 从 repo 导入（已有） |
|--|------------------------|----------------------|
| 作用 | 之后读写哪一棵树 | 往**当前**数据根拷贝图表 JSON |
| 是否重启 | 要 | 否 |
| 是否动 `app.db` | 否（整个库随根切换） | 否（仍不拷贝） |
| 个人主路径 | 是 | 否（搬家 / 合并用） |

绑到仓库后，再对「自己」执行导入应继续走现有 `self` 校验：提示已是当前目录、无需导入。

## 解析与存储

### 真 userData vs 数据根

下列内容**永远**在 Electron 真 `app.getPath("userData")`（应用名 `Kansoku`），不随数据根搬家：

- `data-root.json`（本设计新增的偏好）
- 长桥凭证、onboarding、updater 状态
- AI master key 的 safeStorage 包装（现有 `ai-master-key.json` 等）

下列内容在**数据根**下：

- 图表 JSON、`app.db`、annotations、`stocks/*.md`

账号密钥留在本机 App 配置；研究数据可放进 git 工作区。避免把密钥写进仓库树。

### 偏好文件

路径：`{userData}/data-root.json`

```json
{ "path": "/Users/innei/git/trade" }
```

- `path` 为绝对路径字符串：使用自定义项目根
- 文件不存在，或 `path` 为 `null`：使用系统默认（打包态 = `userData` 本身）

读写方式对齐现有桌面文件 store（onboarding / external-api：JSON、容错默认、权限尽量收紧）。

### 解析优先级

**打包版：**

```text
1. 进程环境变量 TRADE_PROJECT_ROOT（调试 / 最高优先级）
2. data-root.json 中的自定义 path，且启动时判定可用
3. app.getPath("userData")
```

**开发态（未打包，第一期）：**

- 不读自定义偏好；行为与现在一致，数据根 = 仓库根（`resolveRepoRoot()`）
- 设置项 / 菜单在 dev 隐藏，或点击后提示「开发模式已使用仓库目录」

实现上扩展现有 `resolveDataRoot`（`app/desktop/src/boot/paths.ts`），启动时在 `boot/env.ts` 里先读偏好再解析，最后 `process.env.TRADE_PROJECT_ROOT = dataRoot` 并 `scaffoldDataRoot`。

内核 `@trade/core` **不改语义**：继续只认 `TRADE_PROJECT_ROOT` → `CHART_DATA_DIR` 等。数据根是宿主责任。

## 交互

### 入口

1. **设置页（主入口）**  
   - 区块：数据目录  
   - 展示当前**生效**路径（完整路径）  
   - 角标：`系统默认` / `自定义` /（若 env 覆盖）`环境变量`  
   - 按钮：选择…、恢复默认（仅自定义时可用）  
   - 小字：修改后需重启 App；同一数据根不要同时开安装版与 `pnpm start`（避免抢 `app.db`）

2. **应用菜单（可选，与导入并列）**  
   - `Kansoku` → 选择数据目录…（与设置同一 flow）  
   - 保留「从 repo 导入数据…」

3. **首启引导**  
   - 第一期不问数据目录

### 选择流程

```text
选目录
  → 校验
  → （必要时）二次确认 scaffold
  → 写入 data-root.json
  → 提示需重启：[稍后] [立即重启]
  → 立即重启：app.relaunch() + app.quit()
```

恢复默认：清空偏好中的 path → 同样提示重启。

**不做热切换**：`app.db` 与内核单例在启动时绑定路径。

### 校验规则

对候选路径 `P`（相对当前生效根 `current`）：

| 结果 | 条件 | UI |
|------|------|-----|
| 拒绝 | 不存在或不是目录 | 错误说明 |
| 拒绝 | 不可写（无法保证可创建 `journal/charts/data`） | 错误说明 |
| 无操作 | `P` 已是当前生效根 | 提示已是当前目录 |
| 通过 | 已有 `journal/charts/data`，或目录为空 / 仅需 scaffold | 直接写入偏好 |
| 需确认 | 非空且没有 `journal/charts/data` | 警告：将在此创建 `journal/`、`stocks/`；确认后写入 |

不要求是 git 仓库，不要求目录名是 `trade`。

### 启动时坏路径

若偏好里有自定义 path，但启动时目录消失、不可读或不可写：

1. **回退**到系统默认 `userData`，保证 App 能打开  
2. **保留**偏好中的配置（或附加 `lastError` 供展示），不要静默删掉用户选择  
3. 向 UI 暴露 `degraded: true` + 原因  
4. 设置页或主界面黄条：自定义数据目录不可用，已临时使用系统默认；请重新选择或恢复默认  

禁止：坏路径导致进程起不来。

## 实现落点

| 职责 | 建议位置 |
|------|----------|
| 偏好读写 | `app/desktop/src/dataRoot/store.ts` |
| 选目录 / 校验 / 写偏好 / 问重启 | `app/desktop/src/dataRoot/flow.ts`（参考 `dataImport/flow.ts`） |
| 解析扩展 | `app/desktop/src/boot/paths.ts` |
| 启动接入 | `app/desktop/src/boot/env.ts` |
| 菜单 | `app/desktop/src/menu/sections/appSection.ts` |
| IPC + preload | `dataRoot.get` / `pick` / `reset`（命名可微调，壳能力不进 core） |
| 设置 UI | `app/web` 设置页数据目录区块（仅桌面有意义；server 模式可隐藏或只读展示） |

### IPC `get` 建议载荷

```ts
{
  effectivePath: string;           // 本进程实际使用的根
  configuredPath: string | null; // 偏好中的 path；null = 默认
  mode: "default" | "custom" | "env" | "dev-repo";
  degraded: boolean;
  degradedReason?: string;
  restartPending?: boolean;        // 本进程内已写偏好尚未重启（可选）
}
```

### 与现有 `TRADE_PROJECT_ROOT` 的关系

- 启动完成后，进程内 `TRADE_PROJECT_ROOT` 始终等于 `effectivePath`（与现在一致）。  
- 用户通过环境变量启动时，`mode: "env"`，设置页可展示路径但第一期可不允许在 env 覆盖下用 UI 再改（或改了写偏好，但下次无 env 时才显现——实现选简单：`env` 时禁用选择按钮并说明）。

## 测试

### 单测

- `resolveDataRoot`：env > 可用自定义 > userData；dev 固定 repo  
- `data-root` store 读写与恢复默认  
- 候选校验：self / 非目录 / 需确认 scaffold / 已有 journal 结构  
- 坏路径启动：degraded + 回退（临时目录模拟）

### 手动验收

1. 默认：图表在 userData 树下  
2. 选本机 trade 仓库根 → 重启 → 能看到仓库内已有图表  
3. 开启外部 API 时，skill `POST /api/charts` 落在仓库 `journal/charts/data/`  
4. 恢复默认 → 重启 → 回到 userData；仓库内文件仍在  
5. 偏好指向已删除路径 → 能启动 + 黄条 + 可重选  
6. 开发态不误导改路径  

## 文档

- 更新 `app/desktop/README.md`：增加「数据目录」说明（默认位置、如何绑仓库、与导入的区别、并发警告）  
- chart skill / 外部 API 文档若提到桌面路径，补一句「取决于设置中的数据目录」

## 成功标准

1. 打包版可将数据根指到 trade 仓库，重启后读写与 `pnpm dev` / server 一致。  
2. 未配置时行为与现在完全一致（userData）。  
3. 坏路径不阻止启动，并有明确恢复路径。  
4. 内核包无需为「换根」增加业务分支。  
5. 「导入」与「绑定」文案、菜单职责不混淆。
