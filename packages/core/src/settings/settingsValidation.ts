import type { Api, Model, ModelThinkingLevel, MutableModels } from '@earendil-works/pi-ai';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import { z } from 'zod';
import { ClientError } from '../platform/errors.js';
import { SINGLE_KEY_PROVIDERS } from '../ai/runtime/modelsRuntime.js';
import { LOBEHUB_PROVIDER } from '../ai/lobehub/types.js';
import type { AiRole, RoleMode, RoleSetting } from '../ai/settings/settingsStore.js';

export const CODEX_PROVIDER = 'openai-codex';
export const ROLES: AiRole[] = ['primary', 'comment', 'analyst', 'deepDive', 'chat', 'title'];
const MODES: [RoleMode, ...RoleMode[]] = ['custom', 'disabled', 'inherit'];
const roleSchema = z.enum(ROLES as [AiRole, ...AiRole[]]);
const modeSchema = z.enum(MODES);
const nonEmptyStringSchema = z.string().min(1);

export function allowedProviders(): string[] {
  return [...SINGLE_KEY_PROVIDERS, CODEX_PROVIDER, LOBEHUB_PROVIDER];
}

export function parseRole(raw: string): AiRole {
  const result = roleSchema.safeParse(raw);
  if (!result.success) {
    throw new ClientError(`unknown role: ${raw}`, `expected one of ${ROLES.join(', ')}`);
  }
  return result.data;
}

interface CustomRefBody {
  provider?: unknown;
  modelId?: unknown;
  thinkingLevel?: unknown;
}

export interface ValidatedCustomRef {
  provider: string;
  modelId: string;
  thinkingLevel: ModelThinkingLevel;
  model: Model<Api>;
}

export function validateCustomRef(body: CustomRefBody, models: MutableModels): ValidatedCustomRef {
  const provider = body.provider;
  const allowed = allowedProviders();
  if (typeof provider !== 'string' || !allowed.includes(provider)) {
    throw new ClientError(
      `unknown provider: ${String(provider)}`,
      `expected one of ${allowed.join(', ')}`,
    );
  }

  const modelIdResult = nonEmptyStringSchema.safeParse(body.modelId);
  if (!modelIdResult.success) {
    throw new ClientError('"modelId" is required for mode "custom"');
  }
  const modelId = modelIdResult.data;

  const model = models.getModel(provider, modelId);
  if (!model) {
    throw new ClientError(
      `unknown model: ${provider}/${modelId}`,
      'GET /api/settings/ai/catalog lists available models',
    );
  }

  const supported = getSupportedThinkingLevels(model);
  const thinkingLevel = body.thinkingLevel;
  if (
    typeof thinkingLevel !== 'string' ||
    !supported.includes(thinkingLevel as ModelThinkingLevel)
  ) {
    throw new ClientError(
      `unsupported thinkingLevel: ${String(thinkingLevel)}`,
      `expected one of ${supported.join(', ')}`,
    );
  }

  return { provider, modelId, thinkingLevel: thinkingLevel as ModelThinkingLevel, model };
}

interface RoleSettingBody extends CustomRefBody {
  mode?: unknown;
}

export function validateRoleSetting(
  role: AiRole,
  body: RoleSettingBody,
  models: MutableModels,
): RoleSetting {
  const modeResult = modeSchema.safeParse(body.mode);
  if (!modeResult.success) {
    throw new ClientError(
      `unknown mode: ${String(body.mode)}`,
      `expected one of ${MODES.join(', ')}`,
    );
  }
  const mode = modeResult.data;
  if (mode === 'inherit' && role === 'primary') {
    throw new ClientError(
      'mode "inherit" is not allowed for role "primary"',
      'role "primary" only supports "custom" or "disabled"',
    );
  }
  if (mode !== 'custom') {
    return { mode: mode as RoleMode, provider: null, modelId: null, thinkingLevel: null };
  }
  const { provider, modelId, thinkingLevel } = validateCustomRef(body, models);
  return { mode: 'custom', provider, modelId, thinkingLevel };
}

const BEARER_RE = /bearer\s+[\w.-]+/gi;
const SK_KEY_RE = /sk-[\w-]{8,}/g;
const AUTH_HEADER_RE = /"authorization"\s*:\s*"[^"]*"/gi;

export function sanitizeAuthError(message: string, secrets: string[]): string {
  let sanitized = message;
  for (const secret of secrets) {
    if (!secret) continue;
    sanitized = sanitized.split(secret).join('[redacted]');
  }
  sanitized = sanitized.replaceAll(BEARER_RE, 'Bearer [redacted]');
  sanitized = sanitized.replaceAll(SK_KEY_RE, '[redacted]');
  sanitized = sanitized.replaceAll(AUTH_HEADER_RE, '"authorization": "[redacted]"');
  return sanitized;
}

export function categorizeTestError(message: string): 'auth' | 'request_failed' {
  return /401|403|unauthori[sz]ed|invalid[ _]?api[ _]?key|authentication/i.test(message)
    ? 'auth'
    : 'request_failed';
}
