import { defineRoutes } from "./defineRoutes.js";

export interface CredentialsStatus {
  configured: boolean;
  method: string | null;
  lastError: string | null;
  state: "ready" | "cli_missing" | "login_required" | "token_unreadable";
  cliPath: string | null;
}

export interface OpencliStatus {
  state: "ready" | "not_installed" | "extension_missing" | "no_session";
  cliPath: string | null;
  lastError: string | null;
}

export interface CredentialsApi {
  status(): Promise<CredentialsStatus>;
  opencliStatus(): Promise<OpencliStatus>;
}

export const credentialsRoutes = defineRoutes<CredentialsApi>("credentials", {
  status: { method: "GET", path: "/status" },
  opencliStatus: { method: "GET", path: "/opencli" },
});
