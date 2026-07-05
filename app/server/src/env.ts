import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const APP_ROOT = join(here, "..", "..");
export const PROJECT_ROOT = join(APP_ROOT, "..");
export const JOURNAL_DIR = join(PROJECT_ROOT, "journal");
export const STOCKS_DIR = join(PROJECT_ROOT, "stocks");
export const CHART_DATA_DIR = join(PROJECT_ROOT, "journal", "charts", "data");
export const LEGACY_CHARTS_DIR = join(PROJECT_ROOT, "journal", "charts");
export const WEB_ROOT = join(APP_ROOT, "web");
export const PORT = Number(process.env.PORT || 5199);
export const BASE_URL = `http://localhost:${PORT}`;
