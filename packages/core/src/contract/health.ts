import { defineRoutes } from "./defineRoutes.js";

export interface HealthStatus {
  status: string;
  port: number;
  dataDir: string;
}

export interface HealthApi {
  get(): Promise<HealthStatus>;
}

export const healthRoutes = defineRoutes<HealthApi>("health", {
  get: { method: "GET", path: "/" },
});
