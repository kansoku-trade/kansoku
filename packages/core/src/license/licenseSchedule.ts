import { getLicenseManager, type LicenseManager } from "./licenseState.js";

const REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface LicenseSchedule {
  start(): void;
  stop(): void;
}

export function createLicenseSchedule(
  manager: LicenseManager = getLicenseManager(),
  intervalMs: number = REVALIDATE_INTERVAL_MS,
): LicenseSchedule {
  let timer: ReturnType<typeof setInterval> | null = null;

  const runRevalidate = () => {
    void manager.revalidate().catch((err) => {
      console.error("[license-schedule] revalidate failed:", err instanceof Error ? err.message : String(err));
    });
  };

  return {
    start(): void {
      if (timer) return;
      runRevalidate();
      timer = setInterval(runRevalidate, intervalMs);
      timer.unref?.();
    },
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

let singleton: LicenseSchedule | null = null;

export function startLicenseRevalidation(manager?: LicenseManager): void {
  if (!singleton) singleton = createLicenseSchedule(manager);
  singleton.start();
}

export function stopLicenseRevalidation(): void {
  singleton?.stop();
  singleton = null;
}
