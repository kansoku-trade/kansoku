# Web 端查询缓存改造：TanStack Query + 冷启动旧数据直出

日期：2026-07-15
范围：`apps/web`（纯前端，不动 server / core 的接口）

## 背景与目标

首页每次冷进（刷新或新开页面）所有板块都要从零等一轮网络请求，出现「盘面加载中…」「加载中…」。现有缓存全在内存里：手写 `useQuery` 的 module 级 Map（`apiHooks.ts`）刷新即失；WS 盘面要等连接建立、服务端构建首帧。

目标：冷启动立刻渲染上一次的旧数据（哪怕过时），后台自动刷新，新数据到达后无感替换；行情类板块渲染旧数据时标注数据时点（TD-DATA-02）。

## 决策摘要

- 全量替换：整个 `apps/web` 的 HTTP 请求层换成 TanStack Query，删掉手写 Map 缓存，不留两套并存。
- WS 首帧一起做：盘面 / 行情类 WS 频道的最后一帧持久化到 localStorage，冷启动先渲染旧帧。
- 旧数据展示：行情类板块带「数据为 X 分钟前」时间角标，新数据到达即消失；无最大龄限制，多旧都先展示。
- 顺手清理：`useSSE.ts` 删除（名字与实际不符，现在全是 WS），换成 `useWsChannel`。

## 技术选型

用官方持久化插件组合，不自己造：

- `@tanstack/react-query`（v5）
- `@tanstack/query-sync-storage-persister`（localStorage 同步 persister）
- `@tanstack/react-query-persist-client`（`PersistQueryClientProvider`）

备选方案「每个查询手动读 localStorage 做 `initialData`」被否：等于重写插件已有的能力。

## 设计

### 1. 查询层替换

- 新建 `apps/web/src/queryClient.ts`：
  - 创建 `QueryClient`，默认 `staleTime` 按数据类型区分，落实现时对齐现有轮询间隔（持仓 30s、复盘 60s、图表列表 5min 量级）。
  - `createSyncStoragePersister({ storage: localStorage })`，`maxAge` 7 天（超龄整体作废），`buster` 为一个手工维护的版本串——序列化结构变更时改它作废旧缓存。
  - 应用根部（`App` / 入口）用 `PersistQueryClientProvider` 包裹。
- 改写 `apiHooks.ts`：
  - `useQuery` / `usePollingQuery` 保持现有调用签名（字符串 key + fetcher），内部改为 TanStack Query 薄封装；`usePollingQuery` 的间隔映射到 `refetchInterval`。
  - queryKey 沿用现在的字符串 key 规则，行为可对照。
  - 删除 module 级 `queryCache` Map 与手写 in-flight 去重（TanStack Query 自带）。
  - 返回值补充数据时点（`dataUpdatedAt`），供角标使用。
- `pages/cockpit/useIntervalFetch.ts` 同步适配（仍是「ms 为 null 则一次性」的语义）。
- 各调用点（cockpit / research / assistant / settings / onboarding / home 等约 25 个文件）预期大多不需要改动；确需改动的仅限返回值形状差异。

### 2. useSSE 删除，换成 useWsChannel + 快照持久化

- 新建 `apps/web/src/useWsChannel.ts`，接口与原 `useSSE` 一致：`useWsChannel<T>(spec, onData) => { degraded, connected, snapshotAt? }`。
- 删除 `useSSE.ts`，6 个调用点全部迁移：`pages/Home.tsx`（board）、`QuoteBar.tsx`（quotes）、`useLiveQuote.ts`（quotes+symbol）、`charts/intraday/useIntradayDoc.ts`、`pages/cockpit/useCockpitEnv.ts`（position、benchmark）。
- 快照持久化（独立小模块 `wsSnapshot.ts`）：
  - 白名单频道（`board`、无 symbol 的 `quotes`）每收到一帧数据，节流（约 5s 一次）写 localStorage，带时间戳；key 按频道 spec 序列化。
  - 订阅建立、真实数据到达之前，hook 先回放本地旧帧并给出 `snapshotAt`；真实帧到达后 `snapshotAt` 清空。
  - 带 symbol 的动态频道（position / benchmark / intraday / 单标的 quotes）不持久化，避免 localStorage 膨胀，行为不变。

### 3. 旧数据时间角标

- 行情类板块渲染旧数据时显示小角标「数据为 X 分钟前」：
  - 盘面（`Home.tsx` 的 board 区）、行情条（`QuoteBar.tsx`）用 WS 的 `snapshotAt`。
  - 持仓（`Home.tsx` 的 portfolio 区）用查询的 `dataUpdatedAt`，仅当数据来自持久化恢复且尚未 refetch 成功时显示。
- 新鲜数据到达即消失。样式用既有 design tokens（`--radius` / `--control-h`），不用 `--up` / `--down` 色。
- 非行情数据（图表列表、复盘日期、设置等）不加角标，静默后台刷新。

### 4. 错误与降级

- localStorage 读写全部 try/catch（隐私模式 / 配额满时静默降级为现状行为）。
- WS 断线 / degraded 逻辑不变；只是空态「加载中…」的出现频率大幅降低。
- persister 恢复失败（JSON 损坏等）由插件自动丢弃缓存，正常走网络。

### 5. 测试

- `apiHooks` 薄封装：缓存命中先出旧值、轮询间隔映射、`dataUpdatedAt` 透出。
- `wsSnapshot`：写入节流、回放、时间戳、白名单外频道不写。
- 跑 `pnpm test` 现有用例保证无回归。

## 明确不做

- 不动 server / core 的任何接口与缓存策略。
- 不做 service worker、不做 IndexedDB。
- 不给旧数据设最大龄（角标已标明时点，展示无限龄）。
- 动态 symbol 频道的 WS 快照不持久化。
