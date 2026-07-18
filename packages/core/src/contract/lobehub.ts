import type {
  LobeHubAccount,
  LobeHubCredits,
  LobeHubDeviceLogin,
  LobeHubDevicePollResult,
} from "@kansoku/pro-api";
import { defineRoutes } from "./defineRoutes.js";

export interface LobeHubApi {
  startDeviceLogin(): Promise<LobeHubDeviceLogin>;
  pollDeviceLogin(): Promise<LobeHubDevicePollResult>;
  getAccount(): Promise<LobeHubAccount>;
  getCredits(): Promise<LobeHubCredits>;
  deleteSession(): Promise<{ deleted: true }>;
}

export const lobehubRoutes = defineRoutes<LobeHubApi>("ai/providers/lobehub", {
  startDeviceLogin: { method: "POST", path: "/device-login" },
  pollDeviceLogin: { method: "POST", path: "/device-login/poll" },
  getAccount: { method: "GET", path: "/account" },
  getCredits: { method: "GET", path: "/credits" },
  deleteSession: { method: "DELETE", path: "/session" },
});
