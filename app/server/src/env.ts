import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Electron bundles this module into desktop/dist-main/main.mjs, which moves
// "here" away from its real source location — TRADE_PROJECT_ROOT lets the
// desktop host pin the repo root explicitly instead of relying on it.
const rootOverride = process.env.TRADE_PROJECT_ROOT;

export const APP_ROOT = rootOverride ? join(rootOverride, "app") : join(here, "..", "..");
export const PROJECT_ROOT = rootOverride ?? join(APP_ROOT, "..");
export const JOURNAL_DIR = join(PROJECT_ROOT, "journal");
export const STOCKS_DIR = join(PROJECT_ROOT, "stocks");
export const CHART_DATA_DIR = join(PROJECT_ROOT, "journal", "charts", "data");
export const ANNOTATIONS_DIR = join(PROJECT_ROOT, "journal", "charts", "annotations");
export const LEGACY_CHARTS_DIR = join(PROJECT_ROOT, "journal", "charts");
export const WEB_ROOT = join(APP_ROOT, "web");
export const PORT = Number(process.env.PORT || 5199);
export const KERNEL_PORT = Number(process.env.KERNEL_PORT || 5200);
export const HOST_MODE: "dev" | "prod" = process.env.HOST_MODE === "dev" ? "dev" : "prod";
export const BASE_URL = `http://localhost:${PORT}`;
export const WEB_DIST = join(WEB_ROOT, "dist");
