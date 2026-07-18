import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const CHART_DATA_REL = join("journal", "charts", "data");

export type DataRootCandidateResult =
  | { ok: true }
  | { ok: false; reason: "self" | "not-dir" | "not-writable" | "needs-confirm-scaffold" };

export function validateDataRootCandidate(path: string, currentRoot: string): DataRootCandidateResult {
  if (realpathOrSelf(path) === realpathOrSelf(currentRoot)) {
    return { ok: false, reason: "self" };
  }

  if (!existsSync(path)) {
    return { ok: false, reason: "not-dir" };
  }

  let isDir = false;
  try {
    isDir = statSync(path).isDirectory();
  } catch {
    return { ok: false, reason: "not-dir" };
  }
  if (!isDir) {
    return { ok: false, reason: "not-dir" };
  }

  if (!isWritableDir(path)) {
    return { ok: false, reason: "not-writable" };
  }

  if (existsSync(join(path, CHART_DATA_REL))) {
    return { ok: true };
  }

  let entries: string[];
  try {
    entries = readdirSync(path);
  } catch {
    return { ok: false, reason: "not-writable" };
  }

  if (entries.length === 0) {
    return { ok: true };
  }

  return { ok: false, reason: "needs-confirm-scaffold" };
}

function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
  } catch {
    return false;
  }

  const probe = join(dir, `.data-root-write-probe-${process.pid}`);
  try {
    writeFileSync(probe, "");
    unlinkSync(probe);
    return true;
  } catch {
    try {
      mkdirSync(probe);
      rmdirSync(probe);
      return true;
    } catch {
      return false;
    }
  }
}

function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
