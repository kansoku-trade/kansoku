import { ClientError } from "../../errors.js";

const SYMBOL_RE = /^[A-Z0-9.]+$/;
const NOTE_NAME_RE = /^[A-Z0-9._-]+$/;

export function normalizeSymbol(raw: string): string {
  let sym = raw.trim().toUpperCase();
  if (!sym.includes(".")) sym += ".US";
  if (!SYMBOL_RE.test(sym)) {
    throw new ClientError(`invalid symbol: ${raw}`, "e.g. MU or MU.US");
  }
  return sym;
}

export function noteFileName(raw: string): string {
  const name = raw.trim().replace(/\.US$/i, "").toUpperCase();
  if (!NOTE_NAME_RE.test(name) || name.includes("..")) {
    throw new ClientError(`invalid symbol: ${raw}`, "expected a plain ticker like MU or MU.US");
  }
  return name;
}
