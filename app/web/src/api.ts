import type { ApiResult } from "../../shared/types";
import { isCredentialsErrorCode, markRestricted } from "./restrictedMode";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isApiResult = <T>(value: unknown): value is ApiResult<T> => {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return "data" in value;
  return typeof value.error === "string";
};

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const res = await fetch(path, { ...init, headers });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    const status = res.status || 0;
    const label = status > 0 ? `HTTP ${status}${res.statusText ? ` ${res.statusText}` : ""}` : "API";
    throw new ApiError(`${label}: invalid JSON response`, status);
  }

  if (!isApiResult<T>(json)) {
    throw new ApiError("Malformed API response", res.status);
  }

  if (!json.ok) {
    if (isCredentialsErrorCode(res.status, json.code)) markRestricted();
    throw new ApiError(json.hint ? `${json.error} (${json.hint})` : json.error, res.status, json.code);
  }
  if (!res.ok) throw new ApiError(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`, res.status);
  return json.data;
}
