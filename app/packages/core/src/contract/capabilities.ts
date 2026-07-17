import { defineRoutes } from "./defineRoutes.js";

export interface CapabilitiesOut {
  pro: boolean;
  licensed: boolean;
}

export interface CapabilitiesApi {
  get(): Promise<CapabilitiesOut>;
}

export const capabilitiesRoutes = defineRoutes<CapabilitiesApi>("capabilities", {
  get: { method: "GET", path: "/" },
});
