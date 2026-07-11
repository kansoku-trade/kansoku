export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RouteMeta {
  method: HttpMethod;
  path: string;
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

