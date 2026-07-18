import { randomUUID } from "node:crypto";
import type {
  AssistantMessage,
  Context,
  Credential,
  Model,
  StreamOptions,
  ToolCall,
  Usage,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AppCredentialStore } from "../credentialStore.js";
import {
  LOBEHUB_API,
  LOBEHUB_PROVIDER,
  LobeHubCloudError,
  type LobeHubAccount,
  type LobeHubCloudGateway,
  type LobeHubCredits,
  type LobeHubDeviceLogin,
  type LobeHubDevicePollResult,
} from "./types.js";

const CREDIT_UNIT = 1_000_000;
const REFRESH_BUFFER_MS = 60_000;
const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

interface GatewayOptions {
  baseUrl: string;
  clientId?: string;
  credentials: AppCredentialStore;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

interface PendingDeviceLogin {
  deviceCode: string;
  expiresAt: number;
  intervalSeconds: number;
}

interface OidcDiscovery {
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function number(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function mapHttpError(status: number, body: string): LobeHubCloudError {
  if (status === 401 || status === 403) return new LobeHubCloudError("refresh_required", "LobeHub Cloud 登录已失效", status);
  if (status === 402) return new LobeHubCloudError("insufficient_credits", "LobeHub Cloud 额度不足", status);
  if (status === 404) return new LobeHubCloudError("model_unavailable", "LobeHub Cloud 模型不可用", status);
  if (status === 429) return new LobeHubCloudError("rate_limited", "LobeHub Cloud 请求过于频繁", status);
  if (status >= 500) return new LobeHubCloudError("cloud_unavailable", `LobeHub Cloud 暂时不可用：${body}`, status);
  return new LobeHubCloudError("protocol_incompatible", `LobeHub Cloud 请求失败：${status} ${body}`, status);
}

async function jsonResponse(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!response.ok) throw mapHttpError(response.status, raw.slice(0, 500));
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    throw new LobeHubCloudError("protocol_incompatible", "LobeHub Cloud 返回了无法解析的数据");
  }
}

function tokenCredential(body: JsonObject, currentRefresh = "", now = Date.now()): Credential {
  const access = text(body.access_token);
  if (!access) throw new LobeHubCloudError("protocol_incompatible", "LobeHub Cloud token 响应缺少 access_token");
  return {
    type: "oauth",
    access,
    refresh: text(body.refresh_token) ?? currentRefresh,
    expires: now + number(body.expires_in, 3600) * 1000,
  };
}

function decodeJwtClaims(token: string): JsonObject {
  try {
    const payload = token.split(".")[1];
    return object(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))) ?? {};
  } catch {
    return {};
  }
}

// DeepSeek v4 upstream accepts effort low|medium|high|xhigh|max — "minimal" is
// rejected with a 471 ProviderBizError. Which effort knob a model uses is
// announced via settings.extendParams in /webapi/lobehub-model-config.
const DEFAULT_THINKING_MAP = { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "high" } as const;
const DEEPSEEK_V4_THINKING_MAP = { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" } as const;

function thinkingLevelMapFromSettings(settings: JsonObject | null) {
  const extendParams = Array.isArray(settings?.extendParams) ? settings.extendParams : [];
  return extendParams.includes("deepseekV4ReasoningEffort") ? DEEPSEEK_V4_THINKING_MAP : DEFAULT_THINKING_MAP;
}

function modelFromCloud(raw: unknown, baseUrl: string): Model<typeof LOBEHUB_API> | null {
  const item = object(raw);
  if (!item || item.type !== "chat" || item.enabled === false) return null;
  const id = text(item.id);
  if (!id) return null;
  const abilities = object(item.abilities);
  const reasoning = abilities?.reasoning === true;
  return {
    id,
    name: text(item.displayName) ?? id,
    api: LOBEHUB_API,
    provider: LOBEHUB_PROVIDER,
    baseUrl,
    reasoning,
    thinkingLevelMap: reasoning ? thinkingLevelMapFromSettings(object(item.settings)) : undefined,
    input: abilities?.vision === true ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: number(item.contextWindowTokens, 128_000),
    maxTokens: number(item.maxOutput, 8_192),
  };
}

function cloudMessages(context: Context): JsonObject[] {
  const messages: JsonObject[] = [];
  if (context.systemPrompt) messages.push({ role: "system", content: context.systemPrompt });
  for (const message of context.messages) {
    if (message.role === "user") {
      const content = typeof message.content === "string"
        ? message.content
        : message.content.map((part) =>
            part.type === "text"
              ? { type: "text", text: part.text }
              : { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } },
          );
      messages.push({ role: "user", content });
      continue;
    }
    if (message.role === "toolResult") {
      messages.push({
        role: "tool",
        tool_call_id: message.toolCallId,
        content: message.content.map((part) => (part.type === "text" ? part.text : `[image:${part.mimeType}]`)).join("\n"),
      });
      continue;
    }
    const toolCalls = message.content.filter((part): part is ToolCall => part.type === "toolCall");
    messages.push({
      role: "assistant",
      content: message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
      ...(toolCalls.length
        ? { tool_calls: toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) }
        : {}),
    });
  }
  return messages;
}

interface ParsedSseEvent {
  event: string | null;
  data: string;
}

function parseSseChunk(buffer: string): { events: ParsedSseEvent[]; rest: string } {
  const normalized = buffer.replaceAll("\r\n", "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  return {
    rest,
    events: blocks.flatMap((block) => {
      const event = block
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim() ?? null;
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return data ? [{ event, data }] : [];
    }),
  };
}

function trpcData(value: unknown): unknown {
  const root = Array.isArray(value) ? value[0] : value;
  const result = object(root)?.result;
  const data = object(result)?.data;
  return object(data)?.json ?? data;
}

function availableCredits(subscription: unknown): { credits: number; plan: string | null } {
  const root = object(subscription);
  const usage = object(root?.usage);
  const buckets = [usage?.free, usage?.subscription, usage?.referral, ...(Array.isArray(usage?.packages) ? usage.packages : [])];
  const credits = buckets.reduce((sum, raw) => {
    const bucket = object(raw);
    return sum + Math.max(0, number(bucket?.limit) - number(bucket?.boundedSpend ?? bucket?.spend));
  }, 0);
  return { credits, plan: text(root?.plan) };
}

export class WebApiLobeHubCloudGateway implements LobeHubCloudGateway {
  readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly credentials: AppCredentialStore;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly now: () => number;
  private pending: PendingDeviceLogin | null = null;
  private discovery: Promise<OidcDiscovery> | null = null;

  constructor(options: GatewayOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.clientId = options.clientId?.trim() || undefined;
    this.credentials = options.credentials;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  get available(): boolean {
    return Boolean(this.clientId);
  }

  private requireClientId(): string {
    if (!this.clientId) throw new LobeHubCloudError("cloud_unavailable", "尚未配置 LobeHub Cloud Client ID");
    return this.clientId;
  }

  private discover(): Promise<OidcDiscovery> {
    this.discovery ??= this.fetcher(`${this.baseUrl}/.well-known/openid-configuration`)
      .then(async (response) => (response.ok ? (object(await response.json()) as OidcDiscovery) ?? {} : {}))
      .catch(() => ({}));
    return this.discovery;
  }

  private async postForm(path: string, form: Record<string, string>): Promise<JsonObject> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form),
      });
    } catch (error) {
      throw new LobeHubCloudError("network_error", error instanceof Error ? error.message : String(error));
    }
    const raw = await response.text();
    let body: JsonObject;
    try {
      body = object(raw ? JSON.parse(raw) : null) ?? {};
    } catch {
      throw new LobeHubCloudError("protocol_incompatible", "LobeHub Cloud 返回了无法解析的数据");
    }
    if (!response.ok && !text(body.error)) throw mapHttpError(response.status, raw.slice(0, 500));
    return body;
  }

  async startDeviceLogin(): Promise<LobeHubDeviceLogin> {
    const body = await this.postForm("/oidc/device/auth", {
      client_id: this.requireClientId(),
      resource: "urn:lobehub:chat",
      scope: "openid profile email offline_access",
    });
    const deviceCode = text(body.device_code);
    const userCode = text(body.user_code);
    const verificationUri = text(body.verification_uri);
    if (!deviceCode || !userCode || !verificationUri) {
      throw new LobeHubCloudError("protocol_incompatible", "LobeHub Cloud 设备登录响应不完整");
    }
    const intervalSeconds = Math.max(1, number(body.interval, 5));
    const expiresAt = this.now() + number(body.expires_in, 600) * 1000;
    this.pending = { deviceCode, intervalSeconds, expiresAt };
    return {
      userCode,
      verificationUri,
      verificationUriComplete: text(body.verification_uri_complete) ?? undefined,
      expiresAt: new Date(expiresAt).toISOString(),
      intervalSeconds,
    };
  }

  async pollDeviceLogin(): Promise<LobeHubDevicePollResult> {
    const pending = this.pending;
    if (!pending || this.now() >= pending.expiresAt) {
      this.pending = null;
      return { status: "expired" };
    }
    const body = await this.postForm("/oidc/token", {
      client_id: this.requireClientId(),
      device_code: pending.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const error = text(body.error);
    if (error === "authorization_pending") return { status: "pending", intervalSeconds: pending.intervalSeconds };
    if (error === "slow_down") {
      pending.intervalSeconds += 5;
      return { status: "pending", intervalSeconds: pending.intervalSeconds };
    }
    if (error === "access_denied") {
      this.pending = null;
      return { status: "denied" };
    }
    if (error === "expired_token") {
      this.pending = null;
      return { status: "expired" };
    }
    if (error) throw new LobeHubCloudError("protocol_incompatible", `LobeHub Cloud 授权失败：${error}`);
    const credential = tokenCredential(body, "", this.now());
    await this.credentials.modify(LOBEHUB_PROVIDER, async () => credential);
    this.pending = null;
    return { status: "connected" };
  }

  async refreshCredential(credential: { access: string; refresh: string; expires: number }) {
    if (!credential.refresh) throw new LobeHubCloudError("refresh_required", "LobeHub Cloud 登录缺少 refresh token");
    const body = await this.postForm("/oidc/token", {
      client_id: this.requireClientId(),
      grant_type: "refresh_token",
      refresh_token: credential.refresh,
    });
    const error = text(body.error);
    if (error) throw new LobeHubCloudError("refresh_required", `LobeHub Cloud 登录刷新失败：${error}`);
    const next = tokenCredential(body, credential.refresh, this.now());
    if (next.type !== "oauth") throw new LobeHubCloudError("protocol_incompatible", "无效的 OAuth 凭据");
    return next;
  }

  private async accessToken(): Promise<string> {
    const next = await this.credentials.modify(LOBEHUB_PROVIDER, async (current) => {
      if (!current || current.type !== "oauth") throw new LobeHubCloudError("not_authenticated", "尚未登录 LobeHub Cloud");
      if (current.expires > this.now() + REFRESH_BUFFER_MS) return undefined;
      return this.refreshCredential(current);
    });
    if (!next || next.type !== "oauth") throw new LobeHubCloudError("not_authenticated", "尚未登录 LobeHub Cloud");
    return next.access;
  }

  async getAccount(): Promise<LobeHubAccount> {
    if (!this.available) return { status: "unavailable", email: null, name: null, userId: null, updatedAt: null, baseUrl: this.baseUrl };
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (!credential || credential.type !== "oauth") {
      return { status: "disconnected", email: null, name: null, userId: null, updatedAt: null, baseUrl: this.baseUrl };
    }
    try {
      const token = await this.accessToken();
      let claims = decodeJwtClaims(token);
      const discovery = await this.discover();
      if (discovery.userinfo_endpoint) {
        const response = await this.fetcher(discovery.userinfo_endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) claims = object(await response.json()) ?? claims;
      }
      const entry = this.credentials.list().find((item) => item.provider === LOBEHUB_PROVIDER);
      return {
        status: "connected",
        email: text(claims.email),
        name: text(claims.name) ?? text(claims.preferred_username),
        userId: text(claims.sub),
        updatedAt: entry?.updatedAt ?? null,
        baseUrl: this.baseUrl,
      };
    } catch (error) {
      if (error instanceof LobeHubCloudError && error.code === "refresh_required") {
        return { status: "refresh_required", email: null, name: null, userId: null, updatedAt: null, baseUrl: this.baseUrl };
      }
      throw error;
    }
  }

  private async trpcQuery(path: string, input: unknown): Promise<unknown> {
    const token = await this.accessToken();
    const url = new URL(`${this.baseUrl}/trpc/lambda/${path}`);
    url.searchParams.set("input", JSON.stringify({ json: input }));
    const response = await this.fetcher(url, { headers: { "Oidc-Auth": token } });
    return trpcData(await jsonResponse(response));
  }

  private async currentMonthSpend(startTime: string, endTime: string): Promise<number> {
    const pageSize = 200;
    let current = 1;
    let total = Number.POSITIVE_INFINITY;
    let spend = 0;
    while ((current - 1) * pageSize < total) {
      const page = object(await this.trpcQuery("spend.getList", {
        params: { startTime, endTime, current, pageSize },
        sorts: {},
      }));
      const rows = Array.isArray(page?.data) ? page.data : [];
      spend += rows.reduce((sum, row) => sum + number(object(row)?.spend), 0);
      total = number(page?.total, rows.length);
      if (rows.length < pageSize || current >= 100) break;
      current += 1;
    }
    return spend;
  }

  async getCredits(): Promise<LobeHubCredits> {
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (!this.available || !credential || credential.type !== "oauth") {
      return {
        availableCredits: 0,
        availableUsd: 0,
        currentMonthCredits: 0,
        currentMonthUsd: 0,
        plan: null,
        updatedAt: new Date(this.now()).toISOString(),
      };
    }
    const now = new Date(this.now());
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [subscription, currentMonthCredits] = await Promise.all([
      this.trpcQuery("subscription.getSubscription", null),
      this.currentMonthSpend(monthStart.toISOString(), now.toISOString()),
    ]);
    const available = availableCredits(subscription);
    return {
      availableCredits: available.credits,
      availableUsd: available.credits / CREDIT_UNIT,
      currentMonthCredits,
      currentMonthUsd: currentMonthCredits / CREDIT_UNIT,
      plan: available.plan,
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  async logout(): Promise<void> {
    this.pending = null;
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (credential?.type === "oauth" && credential.refresh) {
      try {
        const discovery = await this.discover();
        if (discovery.revocation_endpoint) {
          await this.fetcher(discovery.revocation_endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: this.requireClientId(),
              token: credential.refresh,
              token_type_hint: "refresh_token",
            }),
          });
        }
      } catch {
        // Local logout must still succeed if Cloud revocation is unavailable.
      }
    }
    await this.credentials.delete(LOBEHUB_PROVIDER);
  }

  async listModels(): Promise<readonly Model<typeof LOBEHUB_API>[]> {
    const headers: Record<string, string> = {};
    const credential = await this.credentials.read(LOBEHUB_PROVIDER);
    if (credential?.type === "oauth") {
      try {
        headers["Oidc-Auth"] = await this.accessToken();
      } catch (error) {
        if (!(error instanceof LobeHubCloudError) || error.code !== "not_authenticated") throw error;
      }
    }
    const response = await this.fetcher(`${this.baseUrl}/webapi/lobehub-model-config`, { headers });
    const body = object(await jsonResponse(response));
    const models = Array.isArray(body?.models) ? body.models : [];
    return models.flatMap((item) => {
      const model = modelFromCloud(item, this.baseUrl);
      return model ? [model] : [];
    });
  }

  stream(model: Model<typeof LOBEHUB_API>, context: Context, options?: StreamOptions) {
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: LOBEHUB_API,
      provider: LOBEHUB_PROVIDER,
      model: model.id,
      usage: structuredClone(EMPTY_USAGE),
      stopReason: "stop",
      timestamp: this.now(),
    };
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => void this.runChatStream(stream, output, model, context, options));
    return stream;
  }

  private async runChatStream(
    stream: ReturnType<typeof createAssistantMessageEventStream>,
    output: AssistantMessage,
    model: Model<typeof LOBEHUB_API>,
    context: Context,
    options?: StreamOptions,
  ): Promise<void> {
    let activeText: number | null = null;
    let activeThinking: number | null = null;
    const toolCalls = new Map<string, ToolCall>();
    let requestedStopReason: string | null = null;
    try {
      stream.push({ type: "start", partial: structuredClone(output) });
      const token = options?.apiKey || (await this.accessToken());
      const traceId = randomUUID();
      const trace = Buffer.from(JSON.stringify({
        enabled: true,
        traceId,
        sessionId: options?.sessionId ? `trade:${options.sessionId}` : `trade:${traceId}`,
        topicId: `trade:${model.id}`,
        tags: ["client:trade"],
      })).toString("base64");
      const payload: JsonObject = {
        model: model.id,
        messages: cloudMessages(context),
        stream: true,
        ...(context.tools?.length ? { tools: context.tools.map((tool) => ({ type: "function", function: tool })) } : {}),
        ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
        ...(options?.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
        ...(() => {
          const requested = (options as Record<string, unknown> | undefined)?.reasoning;
          if (typeof requested !== "string") return {};
          const mapped = model.thinkingLevelMap ? model.thinkingLevelMap[requested as keyof typeof model.thinkingLevelMap] : requested;
          return mapped ? { reasoning_effort: mapped } : {};
        })(),
      };
      const changed = await options?.onPayload?.(payload, model);
      const response = await this.fetcher(`${this.baseUrl}/webapi/chat/lobehub`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Oidc-Auth": token, "X-lobe-trace": trace },
        body: JSON.stringify(changed ?? payload),
        signal: options?.signal,
      });
      await options?.onResponse?.({ status: response.status, headers: Object.fromEntries(response.headers.entries()) }, model);
      if (!response.ok) throw mapHttpError(response.status, (await response.text()).slice(0, 500));
      if (!response.body) throw new LobeHubCloudError("protocol_incompatible", "LobeHub Cloud 流式响应为空");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const rawEvent of parsed.events) {
          if (rawEvent.data === "[DONE]") continue;
          const decoded = JSON.parse(rawEvent.data) as unknown;
          const event = object(decoded) ?? {};
          const type = rawEvent.event ?? text(event.type);
          const delta = text(decoded) ?? text(event.text) ?? text(event.content) ?? text(event.delta) ?? "";
          if ((type === "text" || type === "content_part") && delta) {
            if (activeText === null) {
              activeText = output.content.length;
              output.content.push({ type: "text", text: "" });
              stream.push({ type: "text_start", contentIndex: activeText, partial: structuredClone(output) });
            }
            const block = output.content[activeText];
            if (block?.type === "text") block.text += delta;
            stream.push({ type: "text_delta", contentIndex: activeText, delta, partial: structuredClone(output) });
          } else if ((type === "reasoning" || type === "reasoning_part") && delta) {
            if (activeThinking === null) {
              activeThinking = output.content.length;
              output.content.push({ type: "thinking", thinking: "" });
              stream.push({ type: "thinking_start", contentIndex: activeThinking, partial: structuredClone(output) });
            }
            const block = output.content[activeThinking];
            if (block?.type === "thinking") block.thinking += delta;
            stream.push({ type: "thinking_delta", contentIndex: activeThinking, delta, partial: structuredClone(output) });
          } else if (type === "usage") {
            const usage = object(event.usage) ?? object(event.data) ?? event;
            output.usage = {
              input: number(usage.totalInputTokens ?? usage.inputTokens ?? usage.input),
              output: number(usage.totalOutputTokens ?? usage.outputTokens ?? usage.output),
              cacheRead: number(usage.inputCachedTokens ?? usage.cacheRead),
              cacheWrite: number(usage.cacheWrite),
              reasoning: number(usage.outputReasoningTokens ?? usage.reasoning),
              totalTokens: number(usage.totalTokens),
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: number(usage.cost ?? usage.totalCost) },
            };
          } else if (type === "tool_calls") {
            const calls = Array.isArray(decoded) ? decoded : Array.isArray(event.tool_calls) ? event.tool_calls : [];
            for (const [position, rawCall] of calls.entries()) {
              const call = object(rawCall);
              const fn = object(call?.function);
              const index = number(call?.index, position);
              const key = String(index);
              const existing = toolCalls.get(key);
              const id = text(call?.id) ?? existing?.id ?? `tool-${index}`;
              const rawArgs = text(fn?.arguments);
              const combinedArgs = existing && rawArgs && "_raw" in existing.arguments
                ? String(existing.arguments._raw) + rawArgs
                : rawArgs;
              toolCalls.set(key, {
                type: "toolCall",
                id,
                name: text(fn?.name) ?? existing?.name ?? "unknown_tool",
                arguments: (() => {
                  if (!combinedArgs) return existing?.arguments ?? {};
                  try {
                    return JSON.parse(combinedArgs) as Record<string, unknown>;
                  } catch {
                    return { _raw: combinedArgs };
                  }
                })(),
              });
            }
          } else if (type === "stop") {
            requestedStopReason = text(decoded) ?? text(event.reason);
          } else if (type === "error") {
            throw new LobeHubCloudError(
              "cloud_unavailable",
              text(decoded) ?? text(event.message) ?? text(event.error) ?? "LobeHub Cloud 流式调用失败",
            );
          }
        }
        if (done) break;
      }
      if (activeText !== null) {
        const block = output.content[activeText];
        stream.push({ type: "text_end", contentIndex: activeText, content: block?.type === "text" ? block.text : "", partial: structuredClone(output) });
      }
      if (activeThinking !== null) {
        const block = output.content[activeThinking];
        stream.push({ type: "thinking_end", contentIndex: activeThinking, content: block?.type === "thinking" ? block.thinking : "", partial: structuredClone(output) });
      }
      for (const toolCall of toolCalls.values()) {
        const contentIndex = output.content.length;
        output.content.push(toolCall);
        stream.push({ type: "toolcall_start", contentIndex, partial: structuredClone(output) });
        stream.push({
          type: "toolcall_delta",
          contentIndex,
          delta: JSON.stringify(toolCall.arguments),
          partial: structuredClone(output),
        });
        stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: structuredClone(output) });
      }
      output.stopReason = toolCalls.size > 0 ? "toolUse" : requestedStopReason === "length" ? "length" : "stop";
      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end(output);
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage = error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end(output);
    }
  }
}
