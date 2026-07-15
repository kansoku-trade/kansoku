import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { buildDataRootStatus } from "../dataRoot/status.js";
import { isDataRootUsable } from "../dataRoot/usability.js";
import { resolveDataRoot, scaffoldDataRoot } from "./paths.js";
import { bundledSkillsPath, ensureBundledSkills } from "./skills.js";

// package.json's "name" is the scoped npm id ("@kansoku/desktop"), which
// Electron would otherwise use verbatim for app.getPath("userData") — the
// "/" turns into a nested folder. Pin it to productName before any path
// resolution runs.
app.setName("Kansoku");

const envOverride = process.env.TRADE_PROJECT_ROOT;
const isPackaged = app.isPackaged;
const userDataPath = app.getPath("userData");

const configuredPath = isPackaged ? readConfiguredPath(userDataPath) : null;
const customPathUsable = configuredPath !== null ? isDataRootUsable(configuredPath) : false;

export const dataRoot = resolveDataRoot({
  isPackaged,
  envOverride,
  userDataPath,
  customPath: configuredPath,
  customPathUsable,
});

export const dataRootStatus = buildDataRootStatus({
  isPackaged,
  envOverride,
  userDataPath,
  configuredPath,
  effectivePath: dataRoot,
  customPathUsable,
});

if (isPackaged) {
  scaffoldDataRoot(dataRoot);
  process.env.TRADE_MIGRATIONS_DIR = join(process.resourcesPath, "drizzle");
  const skillsDir = bundledSkillsPath(process.resourcesPath);
  process.env.TRADE_SKILLS_DIR = skillsDir;
  ensureBundledSkills(dataRoot, skillsDir);
}
process.env.TRADE_PROJECT_ROOT = dataRoot;

export const IS_DEV = process.env.ELECTRON_DEV === "1";

function readConfiguredPath(userDataPath: string): string | null {
  try {
    const raw = readFileSync(join(userDataPath, "data-root.json"), "utf8");
    const parsed = JSON.parse(raw) as { path?: unknown };
    return typeof parsed.path === "string" ? parsed.path : null;
  } catch {
    return null;
  }
}
