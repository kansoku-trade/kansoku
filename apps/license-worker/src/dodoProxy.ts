import type { Env } from "./env.js";
import type { Throttle } from "./throttle.js";

export interface ProxyDeps {
  fetch: typeof globalThis.fetch;
  env: Env;
  throttle: Throttle;
  now: () => number;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readLicenseKey(request: Request): Promise<{ bodyText: string; licenseKey?: string } | null> {
  const bodyText = await request.text();
  try {
    const parsed = JSON.parse(bodyText) as { license_key?: string };
    return { bodyText, licenseKey: parsed.license_key };
  } catch {
    return null;
  }
}

async function forwardToDodo(deps: ProxyDeps, path: string, bodyText: string): Promise<Response> {
  return deps.fetch(`${deps.env.DODO_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bodyText,
  });
}

async function withBundleKey(response: Response, env: Env): Promise<Response> {
  const data = (await response.json()) as Record<string, unknown>;
  return jsonResponse({ ...data, bundleKey: env.BUNDLE_KEY, keyId: env.BUNDLE_KEY_ID }, response.status);
}

async function passthrough(response: Response): Promise<Response> {
  const bodyText = await response.text();
  return new Response(bodyText, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

export async function handleActivate(request: Request, deps: ProxyDeps): Promise<Response> {
  const parsed = await readLicenseKey(request);
  if (!parsed) return jsonResponse({ error: "invalid_json" }, 400);
  if (parsed.licenseKey && deps.throttle.isThrottled(parsed.licenseKey, deps.now())) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }
  const response = await forwardToDodo(deps, "/licenses/activate", parsed.bodyText);
  if (response.status === 201) return withBundleKey(response, deps.env);
  return passthrough(response);
}

export async function handleValidate(request: Request, deps: ProxyDeps): Promise<Response> {
  const parsed = await readLicenseKey(request);
  if (!parsed) return jsonResponse({ error: "invalid_json" }, 400);
  if (parsed.licenseKey && deps.throttle.isThrottled(parsed.licenseKey, deps.now())) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }
  const response = await forwardToDodo(deps, "/licenses/validate", parsed.bodyText);
  if (!response.ok) return passthrough(response);
  const clone = response.clone();
  const data = (await clone.json()) as { valid?: boolean };
  if (data.valid === true) return withBundleKey(response, deps.env);
  return passthrough(response);
}

export async function handleDeactivate(request: Request, deps: ProxyDeps): Promise<Response> {
  const parsed = await readLicenseKey(request);
  if (!parsed) return jsonResponse({ error: "invalid_json" }, 400);
  if (parsed.licenseKey && deps.throttle.isThrottled(parsed.licenseKey, deps.now())) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }
  const response = await forwardToDodo(deps, "/licenses/deactivate", parsed.bodyText);
  return passthrough(response);
}
