import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// dist-main/main.mjs is the fixed on-disk output location of this module
// (tsdown's entry file, never inlined into another chunk), so this path
// math stays correct regardless of what else tsdown bundles into it.
export function resolveRepoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..");
}
