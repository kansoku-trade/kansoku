import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("bundled boot ordering", () => {
  const bundlePath = join(import.meta.dirname, "..", "..", "dist-main", "main.mjs");

  it.skipIf(!existsSync(bundlePath))(
    "sets TRADE_PROJECT_ROOT before packages/core/src/env.ts's top-level APP_ROOT const evaluates",
    () => {
      const content = readFileSync(bundlePath, "utf8");
      const bootEnvIndex = content.indexOf("process.env.TRADE_PROJECT_ROOT = dataRoot");
      const envConstIndex = content.indexOf("const APP_ROOT =");

      expect(bootEnvIndex).toBeGreaterThanOrEqual(0);
      expect(envConstIndex).toBeGreaterThanOrEqual(0);
      expect(bootEnvIndex).toBeLessThan(envConstIndex);
    },
  );
});
