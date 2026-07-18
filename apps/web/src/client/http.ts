import type { AppApi, RouteGroup, TransportEnvelope } from "@kansoku/core/contract/index";
import { ApiError } from "../api";
import { unwrapEnvelope } from "./envelope";

type RouteMap = Record<string, RouteGroup<Record<string, unknown>>>;
type AnyMethod = (input?: Record<string, unknown>) => Promise<unknown>;

const BODY_METHODS = new Set(["POST", "PATCH", "PUT"]);

function fillPath(group: string, path: string, input: Record<string, unknown>): { url: string; rest: Record<string, unknown> } {
  const rest = { ...input };
  const filled = path.replace(/:([a-zA-Z0-9_]+)/g, (_, key: string) => {
    const value = rest[key];
    delete rest[key];
    return encodeURIComponent(String(value));
  });
  return { url: `/api/${group}${filled === "/" ? "" : filled}`, rest };
}

function toQueryString(rest: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isEnvelope = (value: unknown): value is TransportEnvelope<unknown> => {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return "data" in value;
  return typeof value.error === "string";
};

export function createHttpClient(routes: RouteMap): AppApi {
  const client: Record<string, Record<string, AnyMethod>> = {};

  for (const [key, group] of Object.entries(routes)) {
    const methods: Record<string, AnyMethod> = {};
    for (const [methodName, meta] of Object.entries(group.routes)) {
      methods[methodName] = async (input = {}) => {
        const { url, rest } = fillPath(group.group, meta.path, input);
        const isBody = BODY_METHODS.has(meta.method);
        const fullUrl = isBody ? url : url + toQueryString(rest);
        const headers = new Headers({ accept: "application/json" });
        const init: RequestInit = { method: meta.method, headers };
        if (isBody) {
          headers.set("content-type", "application/json");
          init.body = JSON.stringify(rest);
        }

        const res = await fetch(fullUrl, init);
        let json: unknown;
        try {
          json = await res.json();
        } catch {
          const status = res.status || 0;
          const label = status > 0 ? `HTTP ${status}${res.statusText ? ` ${res.statusText}` : ""}` : "API";
          throw new ApiError(`${label}: invalid JSON response`, status);
        }

        if (meta.raw === "statusBody") return { status: res.status, body: json };

        if (meta.raw === "body") {
          if (!res.ok) throw new ApiError(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`, res.status);
          return json;
        }

        if (!isEnvelope(json)) throw new ApiError("Malformed API response", res.status);

        const { data, meta: metaOut } = unwrapEnvelope(json, res.status);
        if (!res.ok) throw new ApiError(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`, res.status);
        return meta.withMeta ? { data, meta: metaOut ?? {} } : data;
      };
    }
    client[key] = methods;
  }

  return client as unknown as AppApi;
}
