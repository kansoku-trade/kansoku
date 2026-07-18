import type { FeatureKey } from "@kansoku/pro-api/features";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RouteMeta {
  method: HttpMethod;
  path: string;
  withMeta?: true;
  // "body": HTTP response body IS the return value directly, not wrapped in {ok,data}.
  // "statusBody": the return type is itself {status,body} — caller branches on the HTTP status.
  raw?: "body" | "statusBody";
  feature?: FeatureKey;
}

export type RouteTable<Api> = { [K in keyof Api]: RouteMeta };

export interface RouteGroup<Api> {
  group: string;
  routes: RouteTable<Api>;
}

export function defineRoutes<Api>(group: string, routes: RouteTable<Api>): RouteGroup<Api> {
  return { group, routes };
}

export interface WithMeta<T> {
  data: T;
  meta: Record<string, unknown>;
}

export type TransportEnvelope<T> =
  | { ok: true; data: T; meta?: Record<string, unknown> }
  | { ok: false; error: string; code?: string; hint?: string; status?: number };

