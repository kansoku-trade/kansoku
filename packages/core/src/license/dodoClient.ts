import type { BundleKeyWrap } from "./bundleKeyWrap.js";

export interface DodoInstance {
  id: string;
  bundleKey?: string;
  keyId?: string;
  bundleKeyWrap?: BundleKeyWrap;
  [key: string]: unknown;
}

export interface DodoValidateResult {
  valid: boolean;
  bundleKey?: string;
  keyId?: string;
  bundleKeyWrap?: BundleKeyWrap;
}

export type DodoResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface DodoClient {
  activate(input: { licenseKey: string; name: string; devicePublicKey?: string }): Promise<DodoResult<DodoInstance>>;
  validate(input: {
    licenseKey: string;
    instanceId?: string;
    devicePublicKey?: string;
  }): Promise<DodoResult<DodoValidateResult>>;
  deactivate(input: { licenseKey: string; instanceId: string }): Promise<DodoResult<void>>;
}

export interface DodoClientOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LICENSE_API_URL = "https://kansoku-portal.innei.dev";

export function resolveLicenseApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.KANSOKU_LICENSE_API_URL ?? DEFAULT_LICENSE_API_URL;
}

export function createDodoClient(opts: DodoClientOptions = {}): DodoClient {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? resolveLicenseApiUrl(opts.env ?? process.env);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(path: string, body: Record<string, unknown>, parseJson: boolean): Promise<DodoResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, error: `dodo ${path} responded ${res.status}` };
      if (!parseJson) return { ok: true, data: undefined as T };
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    activate: ({ licenseKey, name, devicePublicKey }) =>
      request<DodoInstance>(
        "/licenses/activate",
        {
          license_key: licenseKey,
          name,
          ...(devicePublicKey ? { device_public_key: devicePublicKey } : {}),
        },
        true,
      ),
    validate: ({ licenseKey, instanceId, devicePublicKey }) =>
      request<DodoValidateResult>(
        "/licenses/validate",
        {
          license_key: licenseKey,
          license_key_instance_id: instanceId,
          ...(devicePublicKey ? { device_public_key: devicePublicKey } : {}),
        },
        true,
      ),
    deactivate: ({ licenseKey, instanceId }) =>
      request<void>("/licenses/deactivate", { license_key: licenseKey, license_key_instance_id: instanceId }, false),
  };
}
