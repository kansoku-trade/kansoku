import { ClientError } from "../errors.js";
import { getPro, isProPresent } from "./registry.js";

export function requirePro(): void {
  if (!isProPresent()) {
    throw new ClientError("AI features are not available in this build", undefined, 404);
  }
}

export async function isProLicensed(): Promise<boolean> {
  const license = getPro()?.license;
  if (!license) return false;
  return license.isLicensed();
}

export async function requireProLicensed(): Promise<void> {
  requirePro();
  if (!(await isProLicensed())) {
    throw new ClientError("AI features require an active license", undefined, 403, "LICENSE_REQUIRED");
  }
}
