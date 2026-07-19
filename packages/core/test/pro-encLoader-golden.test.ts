import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EncDecryptError, decryptProBlob } from "../src/pro/encLoader.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "fixtures", "golden-pro.enc");
const GOLDEN_KEY_HEX = "0c51d8ccfe03a90977ca5eb03c27d1bcaa00224426d4d61cd4cef136bb33f63f";

const EXPECTED_FILES = {
  "index.mjs": 'import { greet } from "./sub/hello.mjs";\n\nexport function main() {\n  return greet("golden fixture");\n}\n',
  "sub/hello.mjs": 'export function greet(name) {\n  return `hello, ${name}`;\n}\n',
  "manifest.json": '{"note": "dummy pro.enc golden fixture payload, not real pro code"}\n',
};

describe("pro.enc golden fixture (cross-repo byte-format contract)", () => {
  it("decrypts the real packEnc.mjs output with the golden test key", () => {
    const blob = readFileSync(FIXTURE_PATH);
    const manifest = decryptProBlob(blob, GOLDEN_KEY_HEX);
    expect(manifest.keyId).toBe("golden-1");
    for (const [rel, source] of Object.entries(EXPECTED_FILES)) {
      expect(manifest.files[rel]).toBeDefined();
      expect(Buffer.from(manifest.files[rel], "base64").toString("utf8")).toBe(source);
    }
  });

  it("rejects the golden fixture with the wrong key", () => {
    const blob = readFileSync(FIXTURE_PATH);
    expect(() => decryptProBlob(blob, "ff".repeat(32))).toThrow(EncDecryptError);
  });
});
