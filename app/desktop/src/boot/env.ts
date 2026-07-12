import { join } from "node:path";
import { app } from "electron";
import { resolveDataRoot, scaffoldDataRoot } from "./paths.js";

// package.json's "name" is the scoped npm id ("@trade/desktop"), which
// Electron would otherwise use verbatim for app.getPath("userData") — the
// "/" turns into a nested folder. Pin it to productName before any path
// resolution runs.
app.setName("TradeCharts");

export const dataRoot = resolveDataRoot({
  isPackaged: app.isPackaged,
  envOverride: process.env.TRADE_PROJECT_ROOT,
  userDataPath: app.getPath("userData"),
});

if (app.isPackaged) {
  scaffoldDataRoot(dataRoot);
  process.env.TRADE_MIGRATIONS_DIR = join(process.resourcesPath, "drizzle");
}
process.env.TRADE_PROJECT_ROOT = dataRoot;

export const IS_DEV = process.env.ELECTRON_DEV === "1";
