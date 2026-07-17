import type { LicenseSnapshot } from "@kansoku/pro-api";
import { defineRoutes } from "./defineRoutes.js";

export interface CapabilitiesOut {
  pro: boolean;
  licensed: boolean;
  license?: LicenseSnapshot;
}

export interface CapabilitiesApi {
  get(): Promise<CapabilitiesOut>;
}

export const capabilitiesRoutes = defineRoutes<CapabilitiesApi>("capabilities", {
  get: { method: "GET", path: "/" },
});
