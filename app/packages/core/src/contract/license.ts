import type { LicenseActivateResult, LicenseSnapshot } from "@kansoku/pro-api";
import { defineRoutes } from "./defineRoutes.js";

export type { LicenseActivateResult, LicenseSnapshot } from "@kansoku/pro-api";

export interface LicenseApi {
  status(): Promise<LicenseSnapshot>;
  activate(input: { key: string }): Promise<LicenseActivateResult>;
  deactivate(): Promise<{ deactivated: true }>;
}

export const licenseRoutes = defineRoutes<LicenseApi>("license", {
  status: { method: "GET", path: "/status" },
  activate: { method: "POST", path: "/activate" },
  deactivate: { method: "POST", path: "/deactivate" },
});
