import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { Annotation } from "../../../shared/types.js";
import { ANNOTATIONS_DIR } from "../env.js";
import { ClientError } from "../errors.js";

const SYMBOL_RE = /^[A-Z0-9.\-]+$/;

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(normalized)) {
    throw new ClientError(`invalid symbol: ${symbol}`, "symbols may only contain letters, digits, '.' and '-'");
  }
  return normalized;
}

function annotationPath(symbol: string): string {
  return join(ANNOTATIONS_DIR, `${normalizeSymbol(symbol)}.json`);
}

export async function loadAnnotations(symbol: string): Promise<Annotation[]> {
  const path = annotationPath(symbol);
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return [];
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAnnotations(symbol: string, annotations: Annotation[]): Promise<void> {
  const path = annotationPath(symbol);
  await fs.mkdir(ANNOTATIONS_DIR, { recursive: true });
  await fs.writeFile(path, JSON.stringify(annotations, null, 2));
}
