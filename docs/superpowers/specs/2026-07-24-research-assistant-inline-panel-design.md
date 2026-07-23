# 研究库 AI 助手回归内嵌面板：composition 面板槽

日期：2026-07-24
范围：`apps/web`（公开仓）+ `apps/pro/overlays`（私有仓，单独提交）。后端 / contract / core service 不动。

## 背景

2026-07-14 的重设计（`2026-07-14-research-assistant-ui-redesign-design.md`）把研究页右侧定为「统一对话流」内嵌面板。2026-07-20 的单图 overlay 重构（`cd08c50`）为了让付费代码进加密 `__pro__` chunk，把完整面板挪到了独立路由 `/research/assistant`（pro overlay 的 `ResearchAssistantPage.pro.tsx`），右侧只剩「打开 AI 助手」跳转链接。本设计恢复内嵌，同时删掉独立页面。

## 为什么不能 overlay `ResearchAssistant.tsx` 或 `ResearchPage.tsx`

- overlay 是**构建期**同名替换：pro 构建的模块图里 default 文件不存在。而产物是单一 dmg 走四态（激活 / 未激活 / 错 key / 社区），未激活时必须降级成完整免费版——免费那半必须留在公开 chunk 里活着，不能被构建期二选一换掉。
- `ResearchPage` 含研究库浏览与正文阅读（免费功能），overlay 它会把免费功能拖进加密 chunk，未激活用户研究页直接消失。
- 公开代码到 pro 的运行时边界全仓只允许组合点（`features/edition/pro.ts`）的那一个带 catch 的动态 `import()`；ESLint `no-explicit-pro-import` 禁止任何对 `.pro.*` 的显式 import。

结论：页面与骨架留公开，右侧开一个**运行时面板槽**，授权态经组合点动态取 pro 面板，取不到自动落回免费降级视图。

## 公开仓改动（kansoku）

### 1. `WebProComposition` 换字段

`apps/web/src/features/edition/types.ts`：

```ts
import type { ComponentType } from 'react';
import type { ResearchAssistantProps } from '@web/features/research/ResearchAssistant';

export interface WebProComposition {
  researchAssistantPanel: ComponentType<ResearchAssistantProps>;
}
```

`routes` 字段删除——`/research/assistant` 是唯一的 pro 路由，删掉后机制没有消费者，连着删（YAGNI，git 可找回）。props 是 type-only import，不产生运行时边。

### 2. `useProRoutes` → `useProComposition`

`apps/web/src/features/edition/useProRoutes.ts` 改名 `useProComposition.ts`。保持原结构：module 级缓存 promise、动态 `import('./pro')`、`.catch(() => null)`。区别只是把整个 composition 交出来：

```ts
export type ProCompositionState =
  | { status: 'loading'; composition: null }
  | { status: 'ready'; composition: WebProComposition | null };
```

`resetProRoutesForTests` 相应改名。头部那条「must stay dynamic」注释保留。

### 3. 壳 `ResearchAssistant.tsx` 的 available 分支

`absent` / `locked` 分支不动。`available` 分支改为：

- 从 `useProComposition()` 取面板；
- `loading` 或 `composition` 为 null（解密失败等异常兜底）→ 渲染关联资料卡（与 absent 同视图）；
- 取到 → `<Panel document={…} selected={…} related={…} onSelect={…} onDocumentChanged={…} />`，整个替换（面板自带关联资料折叠卡，壳不再另渲染，避免双份）。

「打开 AI 助手」链接删除。组件从 composition 拿到时模块已加载完，直接条件渲染即可，不需要 `React.lazy` / `Suspense`。

### 4. 删除独立页面

- 删 `apps/web/src/pages/research/assistant.tsx`（约定路由文件，删文件即删路由；`generated-routes.ts` 由 route-builder 重新生成）。
- 删 `apps/web/src/features/research/ResearchAssistantPage.tsx`（redirect 壳）。
- `apps/web/src/styles.css` 删 `research-assistant-page*`、`research-assistant-open-link` 相关样式；内嵌面板样式（`research-assistant*`）本来就在，不动。

### 5. 测试

- `ResearchAssistant.test.tsx`：mock `useProComposition`，断言四种情况——loading 降级、ready+panel 挂载（props 透传）、ready+null 降级、absent/locked 现状不变。
- `routes.test.tsx`：删「pro-supplied /research/assistant route」describe 块；`resetProRoutesForTests` 引用随改名调整。

## 私有仓改动（kansoku-pro，`apps/pro` worktree 单独提交）

### 6. 整页壳改造成纯面板文件

`overlays/apps/web/src/features/research/ResearchAssistantPage.pro.tsx` 改名为 `researchAssistantPanel.pro.tsx`：

- 删 `ResearchAssistantPage` 整页壳（header、返回按钮、`useQueryParam` / `useTitle` / 自取数据的 `useQuery`、`navigate`、`ErrorBox` 分支）；
- 保留 `AssistantPanel` 并以 `ResearchAssistantPanel` 为名导出，`ProposalFlowCard`、`ResearchHistoryModal`、`openHistoryModal` 保持内部私有；
- props 已与公开壳 `ResearchAssistantProps` 一致，组件本体零改造。

改名后没有公开默认兄弟文件，登记进 `apps/pro/overlay.private-only.json` 的 `files` 数组（同步与 lint 都会校验）。

### 7. 组合点 `pro.pro.ts`

`overlays/apps/web/src/features/edition/pro.pro.ts`：

- 删 `routes` 与 `/research/assistant` 注册；
- 返回 `{ researchAssistantPanel: ResearchAssistantPanel }`；
- `import '@pro/entries/canary.js'` 保留。

## 数据流

`ResearchPage`（公开，不动）已把 `document / selected / related / onSelect / onDocumentChanged` 传给壳；壳原样透传给 pro 面板。`onSelect` 从此走页面内切换文档，不再 navigate——整页版里那个 `navigate('/research/assistant?…')` 随整页壳一起删除。

## 失败路径

| 状态 | 行为 |
| --- | --- |
| 社区构建 / 无投影 | `useFeature('research-ai')` 为 absent，壳只渲染关联资料，不触碰组合点 |
| 有 pro 未授权 | locked 分支，关联资料 + 授权提示 |
| 已授权但解密失败 / chunk 缺失 | 组合点 catch 落 null，壳降级为关联资料卡，不崩 |
| 已授权且正常 | 内嵌完整对话流面板 |

四态验证矩阵不受影响；leak guard 两条断言维持满足（pro 面板只经组合点动态 import 到达）。

## 执行顺序与验证

1. pro 仓先建分支改 overlay 两个文件 + private-only 登记；
2. 公开仓改 types / hook / 壳 / 删页面 / 样式 / 测试;
3. `pnpm overlay:sync` 重新投影（旧 `ResearchAssistantPage.pro.tsx` 软链接会被清理）;
4. 只对改动文件跑 lint 与 typecheck；`pnpm --filter @kansoku/web test` 跑 research / routes / edition 相关套件;
5. 手工验证：`pnpm dev:desktop:unlocked` 看内嵌面板（聊天、刷新研究、审阅弹窗、历史弹窗）；`KANSOKU_FORCE_FREE=1` 或免 key 状态看降级视图；确认 `/research/assistant` 路由已不存在。

## 明确不做

- 不保留 `/research/assistant` 的兼容跳转（应用内已无入口，外部无书签场景）。
- 不为将来的 pro 整页预留 routes 机制。
- 不改 `ResearchPage` 布局与左侧正文。
