import { ClientError } from "../errors.js";
import { isProPresent } from "./registry.js";

export function requirePro(): void {
  if (!isProPresent()) {
    throw new ClientError("AI features are not available in this build", undefined, 404);
  }
}
