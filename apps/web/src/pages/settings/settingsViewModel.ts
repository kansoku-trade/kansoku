import {
  ROLE_LABEL,
  ROLES,
  thinkingLabel,
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
    usageLabel: string;
  };
  roles: Record<Role, RoleView>;
  issues: SettingsIssue[];
}

const formatUsage = (usage: RoleUsage | undefined): string =>
  !usage || (usage.calls === 0 && usage.cost === 0)
    ? "今日 —"
    : `今日 $` + usage.cost.toFixed(2) + ` · ` + usage.calls + ` 次`;

export function deriveSettingsViewModel(input: {
  settings: AiSettings;
  catalog: Catalog;
  usage: UsageToday | null;
  roles: AiSettings["roles"];
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
          id: `stale-model-` + role,
          title: ROLE_LABEL[role] + "模型已失效",
          detail: "当前模型或思考档位已经不在目录，请重新选择。",
          targetId: `settings-role-` + role,
          tone: "warning",
          priority: 1,
        });
      }
      return {
        effectiveLabel: "模型已不在目录，请改选",
        tone: "warning",
        usageLabel: formatUsage(input.usage?.roles[role]),
      };
    }

    if (provider.auth.status !== "configured") {
      const usedBy = authRoles.get(provider.id) ?? [];
      if (!usedBy.includes(role)) usedBy.push(role);
      authRoles.set(provider.id, usedBy);
      return {
        effectiveLabel: provider.name + " 未配置认证，此用途暂停",
        tone: provider.auth.status === "error" ? "error" : "warning",
        usageLabel: formatUsage(input.usage?.roles[role]),
      };
    }

    return {
      effectiveLabel: model.name + " · " + thinkingLabel(setting.thinkingLevel),
      tone: "default",
      usageLabel: formatUsage(input.usage?.roles[role]),
    };
  };

  for (const role of ROLES) {
    const setting = input.roles[role];
    if (setting.mode === "disabled") {
      roleViews[role] = {
        effectiveLabel: "已停用，不会发起调用",
        tone: "muted",
        usageLabel: formatUsage(input.usage?.roles[role]),
      };
      continue;
    }

    if (setting.mode === "inherit") {
      const primary = input.roles.primary;
      if (
        primary.mode !== "custom" ||
        !primary.provider ||
        !primary.modelId ||
        !primary.thinkingLevel
      ) {
        missingPrimaryRoles.push(role);
        roleViews[role] = {
          effectiveLabel: "主模型未设置，此用途暂停",
          tone: "warning",
          usageLabel: formatUsage(input.usage?.roles[role]),
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
    const skipForInvalidMasterKey =
      input.settings.masterKey === "invalid" && provider.auth.kind === "api_key";
    if (skipForInvalidMasterKey) continue;
    issues.push({
      id: (authError ? "auth-error-" : "missing-auth-") + providerId,
      title: provider.name + (authError ? "认证异常" : "未配置认证"),
      detail: roles.map((role) => ROLE_LABEL[role]).join("、") + "当前依赖此 Provider。",
      targetId: `settings-provider-` + providerId,
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

  const enabledCount = ROLES.filter((role) => input.roles[role].mode !== "disabled").length;

  return {
    summary: {
      statusLabel: issues.length === 0 ? "配置完整" : issues.length + " 项需要处理",
      statusTone: issues.some((issue) => issue.tone === "error")
        ? "down"
        : issues.length
          ? "accent"
          : "up",
      enabledLabel: enabledCount + "/" + ROLES.length + " 用途启用",
      usageLabel: input.usage
        ? "$" + input.usage.total.cost.toFixed(2) + " · " + input.usage.total.calls + " 次"
        : "暂不可用",
    },
    roles: roleViews,
    issues,
  };
}
