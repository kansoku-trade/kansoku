import { defineRoutes } from "./defineRoutes.js";

export interface CredentialsStatus {
  configured: boolean;
  method: string | null;
  lastError: string | null;
}

export interface CredentialsApi {
  status(): Promise<CredentialsStatus>;
}

export const credentialsRoutes = defineRoutes<CredentialsApi>("credentials", {
  status: { method: "GET", path: "/status" },
});
