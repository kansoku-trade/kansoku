export interface Throttle {
  isThrottled(licenseKey: string, now: number): boolean;
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

export function createThrottle(): Throttle {
  const windows = new Map<string, { windowStart: number; count: number }>();

  return {
    isThrottled(licenseKey: string, now: number): boolean {
      const entry = windows.get(licenseKey);
      if (!entry || now - entry.windowStart >= WINDOW_MS) {
        windows.set(licenseKey, { windowStart: now, count: 1 });
        return false;
      }
      entry.count += 1;
      return entry.count > MAX_REQUESTS_PER_WINDOW;
    },
  };
}
