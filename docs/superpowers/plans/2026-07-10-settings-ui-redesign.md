# Settings UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 Settings 页面重构为“顶部状态总览 + 左侧模型分配 + 右侧 Provider 与问题清单”的高密度双工作区，并保持现有 API、数据库和即时保存语义不变。

**Architecture:** SettingsPage 并行读取 settings、catalog 与 usage，并持有五个角色的前端草稿。新增纯函数 deriveSettingsViewModel，统一计算生效模型、配置完整度、顶部摘要和问题清单；展示组件只消费该视图模型。角色修改继续通过每行独立的 saveQueue 串行保存，凭据修改后重新读取 settings 与 catalog。

**Tech Stack:** React 19、TypeScript 6、Vitest 4、Base UI Select、lucide-react、原生 CSS 与现有 UI Kit。

---

## 工作区约束

当前工作区已有用户未提交修改，且与本任务部分重叠：

- apps/web/src/pages/settings/PrimaryRow.tsx
- apps/web/src/pages/settings/RoleRow.tsx
- apps/web/src/pages/settings/roleShared.ts
- apps/web/src/styles.css
- apps/server/package.json、pnpm-lock.yaml、pnpm-workspace.yaml
- AGENTS.md

实施时必须保留这些改动。除计划文档外，本轮不执行实现提交，避免把无法安全归因的用户修改纳入提交。完成后通过逐文件 diff 和测试交付。

## 文件结构

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| apps/web/src/pages/settings/settingsViewModel.ts | 新建 | 纯计算顶部摘要、角色生效状态和问题清单 |
| apps/web/src/pages/settings/settingsViewModel.test.ts | 新建 | 验证配置完整度、问题优先级和生效模型 |
| apps/web/src/pages/settings/RoleModeControl.tsx | 新建 | 使用原生 radio 实现三态分配控件 |
| apps/web/src/pages/settings/SettingsStatusStrip.tsx | 新建 | 展示配置、主模型、Provider 和今日用量摘要 |
| apps/web/src/pages/settings/SettingsIssuesPanel.tsx | 新建 | 展示可处理问题与锚点入口 |
| apps/web/src/pages/settings/SettingsPage.tsx | 修改 | 数据加载、角色草稿、错误恢复与页面编排 |
| apps/web/src/pages/settings/RoleModelsCard.tsx | 修改 | 编排主模型和用途表 |
| apps/web/src/pages/settings/PrimaryRow.tsx | 修改 | 改为受控草稿，增加失败回滚与重试 |
| apps/web/src/pages/settings/RoleRow.tsx | 修改 | 紧凑行、自定义展开、语义化三态、失败重试 |
| apps/web/src/pages/settings/ProviderCredentialsCard.tsx | 修改 | 按 Provider 展示事实状态并原地编辑凭据 |
| apps/web/src/pages/settings/types.ts | 修改 | 增加 AiRoles 与视图模型需要的共享类型 |
| apps/web/src/pages/settings/saveQueue.ts | 修改 | 错误回调提供可重试的最后用户意图 |
| apps/web/src/pages/settings/useSaveQueue.ts | 修改 | 透传失败快照 |
| apps/web/src/pages/settings/saveQueue.test.ts | 修改 | 验证失败后的重试快照 |
| apps/web/src/styles.css | 修改 | 双栏、状态条、用途表、Provider 与响应式样式 |

### Task 1: 用纯计算层固定页面状态语义

**Files:**
- Create: `apps/web/src/pages/settings/settingsViewModel.test.ts`
- Create: `apps/web/src/pages/settings/settingsViewModel.ts`
- Modify: `apps/web/src/pages/settings/types.ts`

- [ ] **Step 1: 写失败测试**

建立最小目录与角色夹具，验证以下用户可观察结果：

```ts
import { describe, expect, it } from "vitest";
import { deriveSettingsViewModel } from "./settingsViewModel";
import type { AiRoles, AiSettings, Catalog, UsageToday } from "./types";

const custom = (provider: string, modelId: string) => ({
  mode: "custom" as const,
  provider,
  modelId,
  thinkingLevel: "off",
  stale: false,
});

const roles: AiRoles = {
  primary: custom("deepseek", "deepseek-v4"),
  comment: { mode: "inherit", provider: null, modelId: null, thinkingLevel: null, stale: false },
  analyst: custom("anthropic", "claude-opus"),
  deepDive: { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false },
  chat: { mode: "inherit", provider: null, modelId: null, thinkingLevel: null, stale: false },
};

const settings: AiSettings = {
  roles,
  credentials: [{ provider: "deepseek", masked: "sk-••••9A2F", updatedAt: "2026-07-10", ok: true }],
  masterKey: "ready",
};

const catalog: Catalog = {
  providers: [
    {
      id: "deepseek",
      name: "DeepSeek",
      auth: { kind: "api_key", status: "configured" },
      models: [{ id: "deepseek-v4", name: "DeepSeek V4", thinkingLevels: ["off"] }],
    },
    {
      id: "anthropic",
      name: "Anthropic",
      auth: { kind: "api_key", status: "missing" },
      models: [{ id: "claude-opus", name: "Claude Opus", thinkingLevels: ["off", "high"] }],
    },
    {
      id: "openai-codex",
      name: "OpenAI Codex",
      auth: { kind: "oauth", status: "missing" },
      models: [{ id: "gpt-5.4", name: "GPT-5.4", thinkingLevels: ["off", "high"] }],
    },
  ],
};

const usage: UsageToday = {
  roles: {
    comment: { calls: 91, cost: 0.42 },
    analyst: { calls: 8, cost: 0.76 },
    deepDive: { calls: 0, cost: 0 },
    chat: { calls: 28, cost: 0.64 },
  },
  total: { calls: 127, cost: 1.82 },
};

describe("deriveSettingsViewModel", () => {
  it("resolves inherited and custom models while excluding disabled roles from issues", () => {
    const view = deriveSettingsViewModel({ settings, catalog, usage, roles });
    expect(view.roles.comment.effectiveLabel).toBe("DeepSeek V4 · 关闭思考");
    expect(view.roles.analyst.effectiveLabel).toBe("Claude Opus · 关闭思考");
    expect(view.roles.deepDive.effectiveLabel).toBe("已停用，不会发起调用");
  });

  it("groups missing auth by provider and only reports providers used by enabled roles", () => {
    const view = deriveSettingsViewModel({ settings, catalog, usage, roles });
    expect(view.issues.map((issue) => issue.id)).toEqual(["missing-auth-anthropic"]);
    expect(view.summary.statusLabel).toBe("1 项需要处理");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
pnpm --filter @trade/web exec vitest run src/pages/settings/settingsViewModel.test.ts
```

Expected: FAIL，提示无法解析 `./settingsViewModel` 或找不到 `AiRoles`。

- [ ] **Step 3: 实现共享类型和纯函数**

在 types.ts 增加：

```ts
export type AiRoles = Record<Role | "primary", RoleSetting>;
```

在 settingsViewModel.ts 定义：

```ts
import {
  CODEX_PROVIDER,
  ROLE_LABEL,
  ROLES,
  thinkingLabel,
  type AiRoles,
  type AiSettings,
  type Catalog,
  type Role,
  type RoleSetting,
  type RoleUsage,
  type UsageToday,
} from "./types";

export type SettingsIssueTone = "warning" | "error";

export interface SettingsIssue {
  id: string;
  title: string;
  detail: string;
  targetId: string;
  tone: SettingsIssueTone;
  priority: number;
}

export interface RoleView {
  effectiveLabel: string;
  tone: "default" | "muted" | "warning" | "error";
  usageLabel: string;
}

export interface SettingsViewModel {
  summary: {
    statusLabel: string;
    statusTone: "up" | "accent" | "down";
    enabledLabel: string;
    primaryLabel: string;
    providerLabel: string;
    usageLabel: string;
  };
  roles: Record<Role, RoleView>;
  issues: SettingsIssue[];
}

const usageLabel = (usage: RoleUsage | undefined): string =>
  !usage || (usage.calls === 0 && usage.cost === 0)
    ? "今日 —"
    : "今日 $" + usage.cost.toFixed(2) + " · " + usage.calls + " 次";

export function deriveSettingsViewModel(input: {
  settings: AiSettings;
  catalog: Catalog;
  usage: UsageToday | null;
  roles: AiRoles;
}): SettingsViewModel {
  const providers = new Map(input.catalog.providers.map((provider) => [provider.id, provider]));
  const issues: SettingsIssue[] = [];
  const missingPrimaryRoles: Role[] = [];
  const stalePrimaryRoles: Role[] = [];
  const authRoles = new Map<string, Role[]>();
  const roleViews = {} as Record<Role, RoleView>;

  if (input.settings.masterKey === "invalid") {
    issues.push({
      id: "master-key-invalid",
      title: "主密钥异常",
      detail: "已存凭据无法解密，需要重置后重新填写。",
      targetId: "settings-provider-panel",
      tone: "error",
      priority: 0,
    });
  }

  const validateSetting = (role: Role, setting: RoleSetting, inherited: boolean): RoleView => {
    const provider = setting.provider ? providers.get(setting.provider) : undefined;
    const model = provider?.models.find((entry) => entry.id === setting.modelId);
    const thinkingValid = Boolean(
      setting.thinkingLevel && model?.thinkingLevels.includes(setting.thinkingLevel),
    );

    if (setting.stale || !provider || !model || !thinkingValid) {
      if (inherited) {
        stalePrimaryRoles.push(role);
      } else {
        issues.push({
          id: "stale-model-" + role,
          title: ROLE_LABEL[role] + "模型已失效",
          detail: "当前模型或思考档位已经不在目录，请重新选择。",
          targetId: "settings-role-" + role,
          tone: "warning",
          priority: 1,
        });
      }
      return {
        effectiveLabel: "模型已不在目录，请改选",
        tone: "warning",
        usageLabel: usageLabel(input.usage?.roles[role]),
      };
    }

    if (provider.auth.status !== "configured") {
      const usedBy = authRoles.get(provider.id) ?? [];
      if (!usedBy.includes(role)) usedBy.push(role);
      authRoles.set(provider.id, usedBy);
      return {
        effectiveLabel: provider.name + " 未配置认证，此用途暂停",
        tone: provider.auth.status === "error" ? "error" : "warning",
        usageLabel: usageLabel(input.usage?.roles[role]),
      };
    }

    return {
      effectiveLabel: model.name + " · " + thinkingLabel(setting.thinkingLevel),
      tone: "default",
      usageLabel: usageLabel(input.usage?.roles[role]),
    };
  };

  for (const role of ROLES) {
    const setting = input.roles[role];
    if (setting.mode === "disabled") {
      roleViews[role] = {
        effectiveLabel: "已停用，不会发起调用",
        tone: "muted",
        usageLabel: usageLabel(input.usage?.roles[role]),
      };
      continue;
    }

    if (setting.mode === "inherit") {
      const primary = input.roles.primary;
      if (primary.mode !== "custom" || !primary.provider || !primary.modelId || !primary.thinkingLevel) {
        missingPrimaryRoles.push(role);
        roleViews[role] = {
          effectiveLabel: "主模型未设置，此用途暂停",
          tone: "warning",
          usageLabel: usageLabel(input.usage?.roles[role]),
        };
      } else {
        roleViews[role] = validateSetting(role, primary, true);
      }
      continue;
    }

    roleViews[role] = validateSetting(role, setting, false);
  }

  if (stalePrimaryRoles.length > 0) {
    issues.push({
      id: "stale-model-primary",
      title: "主模型已失效",
      detail: stalePrimaryRoles.map((role) => ROLE_LABEL[role]).join("、") + "正在跟随主模型。",
      targetId: "settings-role-primary",
      tone: "warning",
      priority: 1,
    });
  }

  for (const [providerId, roles] of authRoles) {
    const provider = providers.get(providerId);
    if (!provider) continue;
    const authError = provider.auth.status === "error";
    const skipForInvalidMasterKey = input.settings.masterKey === "invalid" && provider.auth.kind === "api_key";
    if (skipForInvalidMasterKey) continue;
    issues.push({
      id: (authError ? "auth-error-" : "missing-auth-") + providerId,
      title: provider.name + (authError ? "认证异常" : "未配置认证"),
      detail: roles.map((role) => ROLE_LABEL[role]).join("、") + "当前依赖此 Provider。",
      targetId: "settings-provider-" + providerId,
      tone: authError ? "error" : "warning",
      priority: 2,
    });
  }

  if (missingPrimaryRoles.length > 0) {
    issues.push({
      id: "missing-primary",
      title: "主模型未设置",
      detail: missingPrimaryRoles.map((role) => ROLE_LABEL[role]).join("、") + "当前正在跟随主模型。",
      targetId: "settings-role-primary",
      tone: "warning",
      priority: 3,
    });
  }

  issues.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  const primary = input.roles.primary;
  const primaryProvider = primary.provider ? providers.get(primary.provider) : undefined;
  const primaryModel = primaryProvider?.models.find((model) => model.id === primary.modelId);
  const primaryLabel =
    primary.mode === "custom" && primaryModel
      ? primaryModel.name + " · " + thinkingLabel(primary.thinkingLevel)
      : primary.mode === "custom"
        ? "模型已失效"
        : "未设置";
  const apiKeyCount = input.catalog.providers.filter(
    (provider) => provider.auth.kind === "api_key" && provider.auth.status === "configured",
  ).length;
  const codex = providers.get(CODEX_PROVIDER);
  const codexLabel = codex
    ? codex.auth.status === "configured"
      ? "Codex 已登录"
      : codex.auth.status === "error"
        ? "Codex 登录异常"
        : "Codex 未登录"
    : null;
  const enabledCount = ROLES.filter((role) => input.roles[role].mode !== "disabled").length;

  return {
    summary: {
      statusLabel: issues.length === 0 ? "配置完整" : issues.length + " 项需要处理",
      statusTone: issues.some((issue) => issue.tone === "error") ? "down" : issues.length ? "accent" : "up",
      enabledLabel: enabledCount + "/" + ROLES.length + " 用途启用",
      primaryLabel,
      providerLabel: apiKeyCount + " 个 key" + (codexLabel ? " · " + codexLabel : ""),
      usageLabel: input.usage
        ? "$" + input.usage.total.cost.toFixed(2) + " · " + input.usage.total.calls + " 次"
        : "暂不可用",
    },
    roles: roleViews,
    issues,
  };
}
```

- [ ] **Step 4: 补齐行为测试并运行**

增加并通过以下场景：

- 主模型未设置且存在 inherit；
- stale 模型；
- 主密钥 invalid；
- Codex 被角色使用时 missing/error；
- 未使用 Provider 不进入 issues；
- disabled 不进入 issues；
- usage 为 null 时显示“暂不可用”；
- 问题排序稳定。

Run:

```bash
pnpm --filter @trade/web exec vitest run src/pages/settings/settingsViewModel.test.ts
```

Expected: PASS。

### Task 2: 让保存失败携带可重试的最后用户意图

**Files:**
- Modify: `apps/web/src/pages/settings/saveQueue.test.ts`
- Modify: `apps/web/src/pages/settings/saveQueue.ts`
- Modify: `apps/web/src/pages/settings/useSaveQueue.ts`

- [ ] **Step 1: 写失败测试**

```ts
it("reports the latest user intent as retry snapshot when an earlier save fails", async () => {
  const d1 = defer<void>();
  const save = vi.fn(() => d1.promise);
  const onError = vi.fn();
  const queue = createSaveQueue({ save, initial: { v: 0 }, onError });

  queue.push({ v: 1 });
  queue.push({ v: 2 });
  d1.reject(new Error("boom"));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  expect(onError).toHaveBeenCalledWith(expect.any(Error), { v: 0 }, { v: 2 });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```bash
pnpm --filter @trade/web exec vitest run src/pages/settings/saveQueue.test.ts
```

Expected: FAIL，onError 只收到两个参数。

- [ ] **Step 3: 实现失败快照**

把回调改为：

```ts
onError?: (err: unknown, rolledBackTo: T | null, retrySnapshot: T) => void;
```

在 run(snapshot) 的拒绝分支中，先计算：

```ts
const retrySnapshot = pending ?? snapshot;
pending = null;
flushing = false;
notify();
opts.onError?.(err, confirmed, retrySnapshot);
```

useSaveQueue 使用同一签名透传。

- [ ] **Step 4: 运行保存队列测试**

Run:

```bash
pnpm --filter @trade/web exec vitest run src/pages/settings/saveQueue.test.ts
```

Expected: 全部 PASS。

### Task 3: 建立受控角色草稿与语义化三态控件

**Files:**
- Create: `apps/web/src/pages/settings/RoleModeControl.tsx`
- Modify: `apps/web/src/pages/settings/SettingsPage.tsx`
- Modify: `apps/web/src/pages/settings/RoleModelsCard.tsx`
- Modify: `apps/web/src/pages/settings/PrimaryRow.tsx`
- Modify: `apps/web/src/pages/settings/RoleRow.tsx`

- [ ] **Step 1: 实现原生 radio 三态控件**

```tsx
const OPTIONS: Array<{ mode: RoleMode; label: string }> = [
  { mode: "inherit", label: "跟随主模型" },
  { mode: "custom", label: "自定义" },
  { mode: "disabled", label: "停用" },
];

export function RoleModeControl(props: {
  role: Role;
  value: RoleMode;
  onChange: (mode: RoleMode) => void;
}) {
  return (
    <div className="settings-role-mode" role="radiogroup" aria-label={ROLE_LABEL[props.role] + "分配方式"}>
      {OPTIONS.map((option) => (
        <label className="settings-role-mode-option" key={option.mode}>
          <input
            checked={props.value === option.mode}
            name={"settings-role-mode-" + props.role}
            onChange={() => props.onChange(option.mode)}
            type="radio"
            value={option.mode}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 把角色草稿提升到 SettingsPage**

使用 `useState<AiRoles | null>(null)` 和初始化 effect。首次 settings 到达时写入草稿；凭据刷新不得覆盖已有草稿。

```tsx
useEffect(() => {
  if (settings) setRoleDrafts((current) => current ?? settings.roles);
}, [settings]);

const updateRoleDraft = useCallback((role: Role | "primary", next: RoleSetting) => {
  setRoleDrafts((current) => (current ? { ...current, [role]: next } : current));
}, []);
```

- [ ] **Step 3: 改造 PrimaryRow 与 RoleRow 为受控组件**

PrimaryRow 接收 draft 和 onDraftChange；RoleRow 接收 draft、primary、view 与 onDraftChange。删除组件内部的角色 useState，但保留测试状态、失败快照和保存队列。

失败回调必须执行：

```tsx
onError: (error, rolledBackTo, retrySnapshot) => {
  if (rolledBackTo) onDraftChange(rolledBackTo);
  setFailure({ message: errorMessage(error), retrySnapshot });
}
```

“重试”按钮调用现有 push(failure.retrySnapshot)。

- [ ] **Step 4: 运行类型检查**

Run:

```bash
pnpm --filter @trade/web typecheck
```

Expected: PASS。

### Task 4: 加入状态条、问题清单与双工作区

**Files:**
- Create: `apps/web/src/pages/settings/SettingsStatusStrip.tsx`
- Create: `apps/web/src/pages/settings/SettingsIssuesPanel.tsx`
- Modify: `apps/web/src/pages/settings/SettingsPage.tsx`
- Modify: `apps/web/src/pages/settings/RoleModelsCard.tsx`

- [ ] **Step 1: 实现顶部状态条**

SettingsStatusStrip 渲染四个固定单元，配置状态使用 Badge 或语义 class，同时保留完整文字。usage 加载失败时显示“暂不可用”和局部重试按钮。

```tsx
export function SettingsStatusStrip({ summary, usageError, onRetryUsage }: Props) {
  return (
    <section className="settings-status-strip" aria-label="设置状态总览">
      <StatusCell label="配置状态" tone={summary.statusTone} value={summary.statusLabel} meta={summary.enabledLabel} />
      <StatusCell label="主模型" value={summary.primaryLabel} />
      <StatusCell label="Provider 配置" value={summary.providerLabel} />
      <StatusCell label="今日用量" value={summary.usageLabel} action={usageError ? onRetryUsage : undefined} />
    </section>
  );
}
```

- [ ] **Step 2: 实现问题清单**

```tsx
export function SettingsIssuesPanel({ issues }: { issues: SettingsIssue[] }) {
  return (
    <Card className="settings-issues-card">
      <SectionTitle>需处理</SectionTitle>
      {issues.length === 0 ? (
        <div className="settings-issues-empty">没有需要处理的配置问题</div>
      ) : (
        issues.map((issue) => (
          <div className={"settings-issue settings-issue--" + issue.tone} key={issue.id}>
            <strong>{issue.title}</strong>
            <span>{issue.detail}</span>
            <a href={"#" + issue.targetId}>处理</a>
          </div>
        ))
      )}
    </Card>
  );
}
```

- [ ] **Step 3: 重排 SettingsPage**

页面顺序固定为标题、状态条、双工作区、即时生效说明。左栏为 RoleModelsCard；右栏为 ProviderCredentialsCard 和 SettingsIssuesPanel。

settings/catalog 首次加载错误显示 ErrorBox 与重试按钮。usage 错误不阻塞页面。

- [ ] **Step 4: 运行视图模型测试与类型检查**

Run:

```bash
pnpm --filter @trade/web exec vitest run src/pages/settings/settingsViewModel.test.ts
pnpm --filter @trade/web typecheck
```

Expected: PASS。

### Task 5: 重构模型分配行的紧凑与展开状态

**Files:**
- Modify: `apps/web/src/pages/settings/RoleModelsCard.tsx`
- Modify: `apps/web/src/pages/settings/PrimaryRow.tsx`
- Modify: `apps/web/src/pages/settings/RoleRow.tsx`
- Preserve: `apps/web/src/pages/settings/roleShared.ts` 中用户新增的 selectableProviders 逻辑

- [ ] **Step 1: 建立用途表头**

RoleModelsCard 在主模型之后渲染统一表头：用途、分配方式、当前生效模型、今日用量。四个 RoleRow 使用相同 grid。

- [ ] **Step 2: 紧凑渲染跟随与停用**

跟随状态只渲染一行生效模型。停用状态显示“已停用，不会发起调用”，使用 muted 样式，不渲染下拉框。

- [ ] **Step 3: 自定义状态原地展开**

自定义状态在当前行下展开 Provider、模型、思考档位、测试按钮、测试结果、保存状态与重试。Provider 选项继续使用：

```ts
selectableProviders(catalog, draft.provider)
```

以保留用户当前选择，同时不让未配置 Provider 出现在新选择中。

- [ ] **Step 4: 固定异步状态区域**

保存中显示 Spinner；保存失败显示 errorMessage 和重试；测试成功显示耗时；修改任一选择清除旧测试结果。状态容器使用 aria-live="polite"。

- [ ] **Step 5: 运行前端测试与类型检查**

Run:

```bash
pnpm --filter @trade/web test
pnpm --filter @trade/web typecheck
```

Expected: PASS。

### Task 6: 重构 Provider 面板并补齐局部错误

**Files:**
- Modify: `apps/web/src/pages/settings/ProviderCredentialsCard.tsx`

- [ ] **Step 1: 渲染相关 Provider 与紧凑添加入口**

从 catalog.providers 中固定渲染已保存凭据、Codex 和当前角色草稿正在引用的 Provider。其余未配置 API key Provider 收进一行 Select + Input + Button，避免目录数量较多时把问题清单推出首屏。

- [ ] **Step 2: 原地添加或更新 key**

同一 Provider 行内展开 Input、保存和取消。保存失败保留输入值并显示局部错误；成功后关闭编辑区并调用 onChanged。

- [ ] **Step 3: 补齐删除与重置错误**

删除期间只禁用当前行按钮。删除失败保持原记录并显示错误。重置主密钥失败时不关闭确认框，并在警告区域显示安全错误文案。

- [ ] **Step 4: 保持 Codex 事实文案**

configured 显示“已登录”；missing 显示“未登录，终端运行 codex 登录”；error 显示“登录态异常”。不渲染 key 输入框。

- [ ] **Step 5: 运行类型检查**

Run:

```bash
pnpm --filter @trade/web typecheck
```

Expected: PASS。

### Task 7: 落地终端风布局与响应式

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 保留用户已有全局样式改动**

不得覆盖 focus token、28px 控件高度、topbar 右侧留白和全局设置入口位置。只重写 settings 专属样式段。

- [ ] **Step 2: 实现页面与双栏**

```css
.settings-page { max-width: 1180px; }
.settings-status-strip {
  display: grid;
  grid-template-columns: 1.25fr 1.1fr 0.9fr 0.9fr;
  border: 1px solid var(--border-strong);
  background: var(--bg-surface);
  margin-bottom: 12px;
}
.settings-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(280px, 0.9fr);
  gap: 12px;
  align-items: start;
}
```

- [ ] **Step 3: 实现用途表、三态控件和展开区**

使用共享 grid 列，radio input 视觉隐藏但保留可访问性；focus-within 使用用户新增的 focus token。停用使用 text-muted，警告使用 accent，错误使用 down。

- [ ] **Step 4: 实现 Provider、问题清单和窄屏**

```css
@media (max-width: 900px) {
  .settings-workspace { grid-template-columns: 1fr; }
  .settings-status-strip { grid-template-columns: 1fr 1fr; }
  .settings-roles-scroll { overflow-x: auto; }
}
```

窄屏下 Provider 位于模型分配之后，用途表保留最小宽度并允许面板内横向滚动。

- [ ] **Step 5: 运行类型检查和完整前端测试**

Run:

```bash
pnpm --filter @trade/web typecheck
pnpm --filter @trade/web test
```

Expected: PASS。

### Task 8: 浏览器验收与最终差异审计

**Files:**
- Verify: `apps/web/src/pages/settings/*.tsx`
- Verify: `apps/web/src/pages/settings/*.ts`
- Verify: `apps/web/src/styles.css`

- [ ] **Step 1: 启动本地应用**

Run:

```bash
pnpm start
```

Expected: Fastify/Vite 服务在 http://localhost:5199 可访问。

- [ ] **Step 2: 验证完整流程**

在 /settings 检查：

1. 首屏同时显示四项摘要和双工作区；
2. 主模型修改后跟随行立即更新；
3. 自定义行展开，跟随与停用不展开；
4. 模型测试成功或失败只影响当前测试状态；
5. 缺认证问题可以跳转到对应 Provider；
6. Provider 输入失败时输入值不丢失；
7. usage 失败不阻塞配置区域；
8. 键盘可以操作三态 radio；
9. 900px 以下布局改为单栏。

- [ ] **Step 3: 运行完整 app 验证**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: 与本任务相关的前端测试和类型检查通过；若出现仓库既有无关失败，记录准确命令、文件和错误，不把它描述为本任务回归。

- [ ] **Step 4: 审计工作区**

Run:

```bash
git diff --check
git status --short
git diff -- apps/web/src/pages/settings apps/web/src/styles.css
```

Expected: 无空白错误；依赖升级与 AGENTS.md 保持原样；最终报告明确区分本轮修改与已有用户修改。
