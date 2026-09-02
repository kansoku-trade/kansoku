# 固定 Agent Workspace、升级迁移与 Pro iCloud —— 设计

> 2026-09-02 · 已与用户对齐，按本设计实施
>
> 取代：[桌面版可配置数据目录（项目根绑定）](./2026-07-13-desktop-data-root-design.md)
>
> 相关现状：`apps/desktop/src/boot/env.ts`、`apps/desktop/src/data/dataRoot/`、`apps/desktop/src/agent-kit/`、`packages/core/src/platform/env.ts`、`packages/core/src/db/index.ts`

## 1. 背景：原需求是 Agent-first，不是文件选择器

Kansoku 在 App 之前是一组 trade skills：用户在一个项目目录里启动 Codex、Claude Code
或其他 Agent，Agent 读取 `journal/`、`stocks/`，调用 skills 取数，再把研究结果写回同一棵
目录树。纯 Agent 不依赖 App 进程，也能完成完整工作。

App 出现后，默认数据放进 macOS `Application Support`。如果 Agent 仍在原项目目录工作，
它读不到 App 新产生的数据，App 也看不到 Agent 的输出。2026-07-13 的自定义数据目录因此
让安装版绑定到原项目根；安装版、开发态、Server 和 Agent 便能共用 `journal/`、`stocks/`
及 `app.db`。

“选择任意目录”只是当时实现 Agent-first 的手段，不是产品目标。它同时引入了这些问题：

- 路径可能消失、变成只读、位于移动磁盘或网络盘；
- 切换路径等于切换整个数据库，用户很容易误以为数据丢失；
- 安装版和 Server 同时运行时会争用同一个 WAL 数据库；
- Agent Kit 目录、用户文件目录和数据库目录被绑成一个概念；
- iCloud 还要处理任意本地路径与云容器之间的组合。

本设计删除“用户选择任意数据目录”的能力，但保留更根本的保证：

> App 和纯 Agent 始终操作同一份用户内容；纯 Agent 不需要 App 正在运行。

## 2. 决策摘要

1. 打包版只有一个由 Kansoku 管理的 **Agent Workspace**，不再提供数据目录选择器。
2. Agent Workspace 只放用户内容和 Agent 工作文件；数据库、凭证、密钥、缓存与同步状态
   永远放在本地内部状态区。
3. 现有自定义数据目录用户升级时必须执行**复制迁移**。迁移成功前不能切换到空目录，
   旧目录永远不由 App 自动删除。
4. Agent Kit 可以安装在 Workspace，也可以安装进另一个 Agent 项目；后一种情况通过明确的
   Workspace 路径和 CLI 操作同一份数据，不再让 Agent Kit 目录冒充数据目录。
5. Free 的 Workspace 固定在本机。只有 Pro 可以主动启用 iCloud Workspace 和 CloudKit
   记录同步。
6. iCloud 启用后，用户文件以 iCloud 容器为唯一工作副本；App 不维护第二份业务镜像。
   macOS 自己保留的按需本地缓存不算 App 冗余副本。

## 3. 目标与非目标

### 3.1 目标

1. 旧版配置了自定义数据目录的用户升级后，原有文件和数据库完整可用。
2. 默认目录用户也平滑进入新的 Workspace / State 分离布局。
3. 在 Agent Workspace 中启动 Codex/Claude Code，仍能直接读写研究文件并调用 skills。
4. 在其他项目中安装 Agent Kit 时，Agent 仍能通过同一套 CLI 操作 Kansoku 数据。
5. Free 永远使用本地 Workspace；Pro 可显式迁入 iCloud，并按记录同步选定的数据库数据。
6. 迁移可重复运行、可在中断后继续，不静默覆盖或删除用户文件。

### 3.2 非目标

- 不保留多套数据根、快速切换或任意路径绑定。
- 不让安装版和 Server 长期共享同一个 `app.db`。
- 不自动删除旧自定义目录、旧仓库或用户自己创建的文件。
- 不同步凭证、AI master key、行情缓存、日志或临时任务状态。
- 不在第一版自动合并两个内容不同的 SQLite 数据库。
- 不为 iCloud 再实现一套 App 自己维护的文件上传队列。

## 4. 存储模型

### 4.1 三个概念

| 概念               | 职责                                     | Agent 是否直接可见     |
| ------------------ | ---------------------------------------- | ---------------------- |
| Agent Workspace    | 用户内容、skills 入口和 Agent 项目说明   | 是                     |
| Local State        | SQLite、凭证、密钥、缓存、迁移和同步状态 | 否                     |
| Agent Kit Location | Agent Kit 安装到哪个项目                 | 是，但不等于 Workspace |

内部代码可以暂时继续使用 `dataRoot` / `TRADE_PROJECT_ROOT` 这些兼容名称，避免为了改名触碰
整个内核；产品文案和新接口统一称“Agent Workspace”。

### 4.2 固定路径

打包版 Free，以及尚未启用 iCloud 的 Pro：

```text
~/Library/Application Support/Kansoku/
  Workspace/                         # Agent Workspace
    AGENTS.md
    CLAUDE.md
    .agent/skill/
    .claude/skills/
    .kansoku-agent-kit/
    journal/
      charts/data/*.json
      charts/annotations/
      canvases/
    stocks/

  State/                             # Local State
    app.db
    storage-migration-v1.json
    cloud-sync/

  ai-master-key.json                 # 现有本地状态，位置可保持
  agent-kit.json
  onboarding-state.json
  tabs.json
  ...
```

启用 Pro iCloud 后：

```text
<Kansoku iCloud container>/Documents/Workspace/
  AGENTS.md
  CLAUDE.md
  .agent/skill/
  .claude/skills/
  .kansoku-agent-kit/
  journal/
  stocks/

~/Library/Application Support/Kansoku/State/
  app.db
  cloud-sync/
```

开发态继续使用仓库根作为 Workspace；Server / CLI 继续支持显式的
`TRADE_PROJECT_ROOT`。这是开发和部署接口，不再对应设置页中的产品功能。

### 4.3 路径解析

打包版：

```text
1. TRADE_PROJECT_ROOT（仅调试/自动化覆盖；存在时不消费旧迁移配置）
2. 已启用且可访问的 Pro iCloud Workspace
3. {userData}/Workspace
```

开发态：

```text
1. TRADE_PROJECT_ROOT
2. 仓库根
```

数据库路径独立解析：

```text
1. KANSOKU_DB_PATH
2. 开发/Server 兼容路径：{Workspace}/journal/charts/data/app.db
```

打包版启动时设置：

```text
TRADE_PROJECT_ROOT={effectiveWorkspace}
KANSOKU_DB_PATH={userData}/State/app.db
```

Agent Kit 的 `runtime.env` 同时写入这两个值，保证 App 未运行时 CLI 仍能操作同一个本地库。

## 5. 启动顺序：迁移是内核之前的硬门

当前 `boot/env.ts` 在模块求值时同步决定数据根，随后内核模块读取环境变量。新的顺序必须是：

```text
┌──────────────────────┐
│ Electron 基础初始化 │
└──────────┬───────────┘
           ▼
┌────────────────────────────┐
│ 解析 userData 与旧配置     │
└──────────┬─────────────────┘
           ▼
┌────────────────────────────┐
│ 运行/继续 storage migration │
└──────────┬─────────────────┘
           ▼
      ◆ 迁移成功？ ◆
       /          \
      ▼            ▼
 设置环境变量    进入恢复界面
      │            不加载内核
      ▼
 动态加载内核与主窗口
```

任何可能导入 `packages/core/src/platform/env.ts` 或 `packages/core/src/db/index.ts` 的模块，
都不能在迁移门之前求值。实现上把当前主进程入口拆成一个很薄的 bootstrap，再动态加载实际
应用入口；不靠“静态 import 恰好排在第一行”维持正确性。

## 6. 升级复制迁移

### 6.1 谁需要迁移

打包版、没有调试环境变量且尚无 `storage-migration-v1` 完成标记时：

| 旧状态                                 | 源目录                                     | 处理                                 |
| -------------------------------------- | ------------------------------------------ | ------------------------------------ |
| `data-root.json.path` 为可用自定义路径 | 该自定义路径为主，旧版 `userData` 根为补充 | 两处都复制，冲突时自定义目录版本为主 |
| 没有自定义路径                         | 旧版 `userData` 根                         | 迁入 `userData/Workspace` 与 `State` |
| 自定义路径等于新 Workspace             | 新 Workspace                               | 只做数据库分离与完成标记             |
| 自定义路径不存在/不可读                | 暂无                                       | 进入恢复流程，不启动空数据           |
| 存在 `TRADE_PROJECT_ROOT`              | 环境变量路径                               | 本次跳过迁移，下次正常启动再处理     |

### 6.2 迁移范围

从旧根复制：

- `journal/**`
- `stocks/**`

排除：

- `journal/charts/data/app.db`
- `journal/charts/data/app.db-wal`
- `journal/charts/data/app.db-shm`
- 根目录下旧的 `.claude/`、`.agent/`、`.kansoku-agent-kit/`、`AGENTS.md`、`CLAUDE.md`
- 源目录中的符号链接

Agent 文件由当前版本重新生成，避免把已过期的内置 skill 或指向旧 App bundle 的软链接复制
到新 Workspace。遇到符号链接时不跟随，迁移报告列出其相对路径；旧源仍在，因此不会删除
链接指向的数据。

### 6.3 文件复制与冲突

每个普通文件独立处理：

1. 目标不存在：先复制到同目录临时文件，再原子改名。
2. 目标存在且 SHA-256 相同：记为 `identical`，不重复复制。
3. 目标存在且内容不同：保留目标，并把源复制为冲突副本。

冲突副本命名：

```text
<原文件名>.migration-conflict-<UTC时间>-<源文件短哈希>.<扩展名>
```

迁移不提供“覆盖全部”选项。目标里可能是用户在失败重试期间新写的内容，静默覆盖不安全。
配置过自定义目录时先复制自定义目录，再复制旧版默认目录；因此两处同名不同内容时，自定义
目录版本占用原文件名，默认目录版本成为冲突副本，两份都保留。

### 6.4 SQLite 迁移

旧库位置：

```text
{legacyRoot}/journal/charts/data/app.db
```

新库位置：

```text
{userData}/State/app.db
```

规则：

1. 数据库迁移发生在内核创建连接之前。
2. 使用 `node:sqlite` 的 backup 能力生成一致快照，不直接复制 `app.db`、`-wal`、`-shm`。
3. 先写临时数据库，确认可打开且 `PRAGMA integrity_check` 返回 `ok` 后原子替换目标。
4. 自定义目录和旧版默认目录都有数据库时，自定义库是权威版本；默认库先备份到
   `{userData}/State/backups/`，再迁入自定义库。
5. 自定义目录没有数据库、默认目录有数据库时，使用默认库，避免产生空库。
6. 如果新目标库已经存在，先备份到 `{userData}/State/backups/` 后再替换。
7. 第一版不逐表合并两个数据库。被替换库完整保留，避免错误合并会话、设置或任务状态。
8. 两处源库都不存在时创建新库；选中的源库损坏时迁移失败，不切到空库。

### 6.5 可恢复状态

`{userData}/State/storage-migration-v1.json` 至少记录：

```ts
type StorageMigrationState = {
  version: 1;
  sourceRoot: string;
  workspaceRoot: string;
  databasePath: string;
  phase: 'detected' | 'files-copied' | 'database-backed-up' | 'verified' | 'complete';
  startedAt: string;
  updatedAt: string;
  files: {
    copied: number;
    identical: number;
    conflicts: string[];
    skippedSymlinks: string[];
    failed: Array<{ path: string; error: string }>;
  };
};
```

状态文件使用临时文件 + 原子改名。重复启动读取现有状态，从已完成阶段继续；文件步骤本身按
哈希幂等，因此在任意一次复制中断后重跑都不会覆盖已落地内容。

### 6.6 完成与清理

只有同时满足以下条件才能写入 `complete`：

- 所有可复制文件已复制、判定相同或生成冲突副本；
- 没有未处理的复制失败；
- 新数据库通过完整性检查；
- 新 Workspace 的必需目录已建立；
- Agent Kit 已能在新 Workspace 生成运行配置。

完成后：

- 删除 App 自己的 `data-root.json`；
- App 以后不再读取它作为偏好，只把它当作尚未迁移的旧版输入；
- 显示迁移摘要和旧目录路径；
- 提供“打开旧目录”和“打开 Agent Workspace”；
- 不删除旧目录及其中任何文件。

### 6.7 恢复流程

旧自定义路径丢失、无权限、数据库损坏或磁盘空间不足时：

1. 不加载内核，不创建一套看起来正常的空数据。
2. 显示具体源路径和错误。
3. 用户可以重新选择旧目录后重试。
4. 用户可以退出 App。
5. “从空 Workspace 开始”必须是明确的二次确认动作；执行后仍保留旧路径记录，方便以后重试。

## 7. Agent Workspace 与 Agent Kit

### 7.1 Workspace 是完整 Agent 项目

新 Workspace 初始化后包含当前版本生成的：

- `AGENTS.md` / `CLAUDE.md`
- `.claude/skills` / `.agent/skill`
- `.kansoku-agent-kit/bin/kansoku-cli`
- `.kansoku-agent-kit/runtime.env`
- `journal/` / `stocks/`

用户在该目录启动 Agent，直接文件读写和 CLI 都不依赖 App 进程。

### 7.2 Agent Kit 仍可装进其他项目

“自定义 Agent Kit 位置”不是“自定义数据目录”，可以保留。其语义改为：把 Kansoku 工具
接入当前 Agent 项目，但用户内容仍在固定 Workspace。

生成内容必须修正：

- 模板不再称 Agent Kit 目录为“Kansoku 数据目录”；
- `KANSOKU_DATA_ROOT` 指向固定 Workspace；
- `KANSOKU_DB_PATH` 指向本地 State 数据库；
- PATH 示例使用 `$KANSOKU_AGENT_KIT_DIR/.kansoku-agent-kit/bin`，不再误用
  `$KANSOKU_DATA_ROOT`；
- 文件输出明确写到 Workspace 的 `journal/` / `stocks/`，不假设当前工作目录就是数据根；
- SQLite 路径不再写成错误的 `charts/data/app.db`，统一要求经 `kansoku-cli` 访问。

如果 Agent 的沙箱不允许跨项目写文件，产品说明必须要求用户直接打开 Agent Workspace；
不能假装绝对路径一定可写。

### 7.3 产品入口

删除：

- 设置页“数据目录”区块；
- 菜单“选择数据目录…”；
- `dataRoot.get/pick/reset` IPC；
- 自定义根校验、重启提示和 degraded 回退状态。

保留并改造：

- “从 repo 导入数据…”：改为“导入 Kansoku 数据…”，覆盖 `journal/**`、`stocks/**`，
  使用与迁移相同的安全文件复制规则，不导入 SQLite；
- Agent Kit 设置：默认可以跟随固定 Workspace，不再因 Application Support 而阻止；
- 新增“在 Finder 中显示 Agent Workspace”入口和当前完整路径；
- 开发态继续明确显示“当前使用仓库 Workspace”。

## 8. Pro iCloud

### 8.1 付费边界

Free：

- 只能使用 `{userData}/Workspace`；
- 没有启用 iCloud 的 UI；
- 没有 CloudKit 记录同步引擎。

Pro：

- 可把 Workspace 从本地迁入 Kansoku 的 iCloud ubiquity container；
- 可启用选定 SQLite 记录的 CloudKit 私有数据库同步；
- 负责启用、暂停、状态和冲突 UI。

宿主公共代码负责启动时读取已经存在的 Workspace 模式，避免 Pro bundle 尚未解锁时错误切回
空本地目录；只有 Pro 代码可以从 UI 写入 `local -> iCloud` 的启用动作。

### 8.2 文件同步

启用流程：

1. 验证 Pro 权限、iCloud 登录状态和容器可用性。
2. 使用原生 `FileManager.url(forUbiquityContainerIdentifier:)` 得到容器 URL，不拼接
   `~/Library/Mobile Documents` 私有路径。
3. 通过 `NSFileCoordinator` 把本地 Workspace 复制到 iCloud Workspace。
4. 复用 §6.3 的哈希与冲突副本规则。
5. 验证完成后原子写入 Workspace 模式，重启 App。
6. 此后 `TRADE_PROJECT_ROOT` 直接指向 iCloud Workspace，App 不再维护本地业务镜像。
7. 对尚未下载的文件使用 `startDownloadingUbiquitousItem`，UI 显示等待状态。
8. `NSFileVersion` 出现未解决冲突时保留双方版本，不自动覆盖。

Agent 对 Markdown / JSON 的直接写入仍落在这棵 iCloud Workspace。App 自己的批量修改使用文件
协调；Agent/CLI 写入使用临时文件 + 原子改名，减少同步到半个文件的概率。

### 8.3 Pro 到期

“只有 Pro 支持 iCloud”控制的是**启用动作、CloudKit 同步引擎和管理 UI**，不能让已经迁入
iCloud 的用户突然看见空数据。

- 已启用的 iCloud Workspace 保持可读写，直到用户明确迁回本地；
- CloudKit 记录同步在许可证失效时暂停；
- 公共恢复入口允许把 iCloud Workspace 安全复制回本地；
- 不静默切换根目录。

macOS 对 iCloud 文件的系统级同步可能继续发生，App 无法在保留该目录访问的同时伪装它已经
停止；产品文案不能作相反承诺。

## 9. CloudKit 私有数据库按记录同步

### 9.1 初始同步范围

只同步耐久、用户拥有的记录：

- `comments`
- `outcomes`
- `chat_sessions` / `chat_messages`
- `research_chat_sessions`
- `assistant_sessions`
- `ai_role_settings`
- `symbol_follows`
- `watched_markets_settings`
- `provider_endpoints`

不进入 CloudKit：

- `provider_credentials`
- `ai_usage`
- `symbol_candle_cache`
- `market_events` / `event_source_cursors`
- 正在运行或可重新生成的 research / training task 状态
- `chart_meta`（由 iCloud 中的图表 JSON 重建）
- `app_meta` 中没有明确列入白名单的键

后续新增表默认不同步，必须显式加入白名单。

### 9.2 同步信封

每个 CloudKit record 对应一条业务记录，至少包含：

```ts
type CloudRecordEnvelope = {
  entity: string;
  entityId: string;
  payload: string | null;
  modifiedAt: string;
  deviceId: string;
  deletedAt: string | null;
  revision: number;
};
```

本地另有 Pro 私有同步元数据表，记录 CloudKit change tag、最近上传 revision、删除标记和拉取
游标；不要求给每张公共业务表都添加 CloudKit 字段。

### 9.3 删除标记

业务删除先写本地 tombstone，再从业务表隐藏；同步成功前不物理删除 tombstone。远端删除也先
落本地 tombstone，防止离线旧设备重新上传已经删除的记录。

tombstone 保留期首版固定为 90 天。清理只删除所有已知设备都已越过的标记；没有足够确认时
宁可保留，不猜测设备已经消失。

### 9.4 冲突副本

CloudKit 返回 `serverRecordChanged` 时：

1. 不直接用最后写入时间覆盖。
2. 服务端版本作为当前主版本落地。
3. 本地未上传版本完整写入 Pro 私有 `cloud_sync_conflicts` 表。
4. 冲突记录包含 entity、id、server payload、client payload、时间和设备。
5. UI 提供保留服务端、恢复本地为新 revision 两种动作。

删除与修改冲突同样保留副本：删除标记可以成为主状态，但被修改的 payload 仍可从冲突记录
恢复。

### 9.5 同步时机

- App 启动并完成本地迁移后；
- App 回到前台；
- 本地耐久记录变化后的短延迟批次；
- 用户手动“立即同步”。

纯 Agent/CLI 在 App 关闭时只修改本地文件或数据库；下一次 App 启动后再同步 CloudKit，
不要求 Agent Kit 链接或加载 CloudKit 框架。

## 10. 公共 / 私有仓库边界

公共 `kansoku`：

- Workspace / State 路径模型；
- 旧数据根复制迁移；
- 独立数据库路径；
- Agent Kit 路由与模板修正；
- Workspace 状态/打开入口；
- iCloud 模式的宿主启动兼容与公共恢复入口；
- Pro 使用的最小类型契约。

私有 `kansoku-pro`：

- Pro 权限检查；
- iCloud 启用和状态 UI；
- 原生 iCloud / CloudKit 实现；
- 记录白名单适配、tombstone、冲突副本和同步调度。

任何公共契约变化都必须在同一阶段检查 `apps/pro` 并分别提交。

## 11. 分阶段实施

每一步都能独立验证，前一步通过后再进入下一步：

1. **存储基础**
   - 新增固定 Workspace / State 路径；
   - `KANSOKU_DB_PATH`；
   - 主进程 pre-kernel 启动门。
2. **升级复制迁移**
   - 文件 manifest、哈希冲突、SQLite backup、可恢复状态；
   - 自定义路径丢失的恢复流程。
3. **删除旧产品能力**
   - 删除数据目录设置、菜单、IPC 与旧状态；
   - 把导入改成安全的用户内容导入；
   - 更新 README 和旧设计状态。
4. **Agent Workspace / Agent Kit 连续性**
   - 默认 Workspace 可直接成为 Agent 项目；
   - 修正模板、runtime.env 与设置文案；
   - 提供打开 Workspace 入口。
5. **Pro iCloud 文件 Workspace**
   - entitlement / native bridge；
   - local -> iCloud 与 iCloud -> local 安全迁移；
   - 可用性、下载和文件冲突状态。
6. **Pro CloudKit 记录同步**
   - 私有同步表、白名单、tombstone、冲突副本；
   - 启动/前台/变更调度和管理 UI。
7. **整体验收**
   - 真实旧版目录升级；
   - 纯 Agent 在 Workspace 读写；
   - Free 无 iCloud 入口；
   - Pro 两台设备文件与记录同步、删除和冲突验证。

## 12. 验证

### 12.1 行为测试

- 自定义根有 `journal/`、`stocks/`、WAL 数据库时，迁移后文件和数据库记录都存在。
- 中途终止再启动，迁移继续且不产生重复文件。
- 同文件同内容跳过；同名不同内容保留冲突副本。
- 自定义根丢失时不启动空库，重新定位后可继续。
- 默认旧布局迁入 `Workspace/` 与 `State/app.db`。
- 新版启动不再读取 `data-root.json` 作为持续偏好。
- Agent Kit 位于 Workspace 和位于另一个项目时，CLI 都命中同一 Workspace / DB。
- Free 构建没有启用 iCloud 的产品入口。
- Pro iCloud 文件冲突和 CloudKit record 冲突都能保留双方内容。

### 12.2 构建与类型检查

- `pnpm --filter @kansoku/desktop test`
- `pnpm --filter @kansoku/desktop typecheck`
- `pnpm --filter @kansoku/web test`
- `pnpm --filter @kansoku/web typecheck`
- `pnpm --filter @kansoku/core test`
- `pnpm --filter @kansoku/core typecheck`
- `pnpm --filter @kansoku/pro typecheck`
- `./scripts/verify.sh --typecheck`

### 12.3 产品验收

1. 用旧版写出自定义根配置和真实数据，再安装新版；首次启动显示迁移结果，历史研究和数据库
   内容可见，旧目录仍在。
2. 在新 Workspace 中启动纯 Agent，不启动 App，完成一次读取旧研究、调用 CLI、写入新研究；
   随后打开 App 能看到结果。
3. 设置和菜单里没有任意数据目录选择器，只有固定 Workspace 状态和打开入口。
4. Free 组合没有 iCloud 启用入口；Pro 组合能迁入 iCloud，并在另一台设备看到文件与记录。
5. 制造同名文件和同 record 并发修改，双方内容都可恢复；删除不会被离线设备复活。

## 13. 成功标准

1. 删除任意数据目录后，现有用户没有“升级后数据消失”的路径。
2. Kansoku Workspace 仍是一个纯 Agent 可以独立工作的完整项目。
3. Agent 不需要读取含密钥的 `Application Support/Kansoku` 根目录。
4. App、Agent Kit 和 CLI 对 Workspace / DB 的解析一致。
5. Free 只用本地 Workspace；Pro iCloud 不维护第二份 App 业务镜像。
6. 文件冲突、数据库迁移失败、CloudKit 冲突和删除都优先保留数据，不静默覆盖。
