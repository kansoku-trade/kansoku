import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, Notification, shell } from "electron";

const OWNER_REPO = "Innei/trade-skills";
const RELEASES_URL = `https://api.github.com/repos/${OWNER_REPO}/releases/latest`;
const THROTTLE_MS = 24 * 60 * 60 * 1000;
const CHECK_DELAY_MS = 10_000;
const FETCH_TIMEOUT_MS = 5_000;

export interface ReleaseInfo {
  version: string;
  htmlUrl: string;
}

export interface UpdaterDeps {
  currentVersion: string;
  now: () => string;
  fetchJson: (url: string) => Promise<unknown>;
  readLastCheck: () => Promise<string | null>;
  writeLastCheck: (iso: string) => Promise<void>;
  notify: (release: ReleaseInfo) => void;
  log?: (message: string) => void;
}

function normalizeVersion(raw: string): number[] {
  const stripped = raw.replace(/^desktop-v/i, "").replace(/^v/i, "");
  return stripped.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isNaN(n) ? 0 : n;
  });
}

export function isNewerVersion(current: string, latest: string): boolean {
  const a = normalizeVersion(current);
  const b = normalizeVersion(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false;
}

export function shouldCheck(lastCheckIso: string | null, nowIso: string): boolean {
  if (!lastCheckIso) return true;
  const last = Date.parse(lastCheckIso);
  if (Number.isNaN(last)) return true;
  return Date.parse(nowIso) - last >= THROTTLE_MS;
}

export function parseLatestRelease(json: unknown): ReleaseInfo | null {
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  if (record.draft === true) return null;
  const { tag_name, html_url } = record;
  if (typeof tag_name !== "string" || typeof html_url !== "string") return null;
  return { version: tag_name, htmlUrl: html_url };
}

export async function checkForUpdate(deps: UpdaterDeps): Promise<void> {
  const nowIso = deps.now();
  const lastCheck = await deps.readLastCheck();
  if (!shouldCheck(lastCheck, nowIso)) {
    deps.log?.("skipped: throttled");
    return;
  }

  let json: unknown;
  try {
    json = await deps.fetchJson(RELEASES_URL);
  } catch (err) {
    deps.log?.(`skipped: fetch failed (${(err as Error).message})`);
    return;
  }

  await deps.writeLastCheck(nowIso);

  const release = parseLatestRelease(json);
  if (!release) {
    deps.log?.("no-op: no usable release found");
    return;
  }
  if (!isNewerVersion(deps.currentVersion, release.version)) {
    deps.log?.(`no-op: up to date (current ${deps.currentVersion}, latest ${release.version})`);
    return;
  }
  deps.notify(release);
  deps.log?.(`notified: ${release.version} available`);
}

interface PersistedState {
  lastCheckIso?: string;
}

async function readLastCheckFile(filePath: string): Promise<string | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const state = JSON.parse(raw) as PersistedState;
    return typeof state.lastCheckIso === "string" ? state.lastCheckIso : null;
  } catch {
    return null;
  }
}

async function writeLastCheckFile(filePath: string, iso: string): Promise<void> {
  const state: PersistedState = { lastCheckIso: iso };
  await writeFile(filePath, JSON.stringify(state));
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "trade-desktop-updater",
      },
    });
    if (!res.ok) return { message: `http ${res.status}` };
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface InitUpdaterOptions {
  delayMs?: number;
}

export function initUpdater(options: InitUpdaterOptions = {}): void {
  if (process.env.ELECTRON_DEV === "1") return;

  setTimeout(() => {
    void runElectronCheck();
  }, options.delayMs ?? CHECK_DELAY_MS);
}

async function runElectronCheck(): Promise<void> {
  const stateFile = join(app.getPath("userData"), "updater.json");
  const log = (message: string) => console.debug(`[updater] ${message}`);

  const deps: UpdaterDeps = {
    currentVersion: app.getVersion(),
    now: () => new Date().toISOString(),
    fetchJson: fetchJsonWithTimeout,
    readLastCheck: () => readLastCheckFile(stateFile),
    writeLastCheck: (iso) => writeLastCheckFile(stateFile, iso),
    notify: (release) => {
      const notification = new Notification({
        title: "trade update available",
        body: `${release.version} is ready — click to view the release`,
      });
      notification.on("click", () => {
        shell.openExternal(release.htmlUrl).catch((err) => {
          log(`skipped: openExternal failed (${(err as Error).message})`);
        });
      });
      notification.show();
    },
    log,
  };

  try {
    await checkForUpdate(deps);
  } catch (err) {
    log(`skipped: unexpected error (${(err as Error).message})`);
  }
}
