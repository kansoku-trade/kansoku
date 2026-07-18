export type LicenseState = "unlicensed" | "licensed" | "grace" | "expired" | "invalid";

export interface LicenseSnapshot {
  state: LicenseState;
  graceUntil?: string;
  deviceName?: string;
  maskedKey?: string;
}

export type LicenseActivateResult = { activated: true } | { activated: false; error: string };
