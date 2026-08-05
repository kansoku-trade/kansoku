import type { AnalyticsScreen } from './analytics';

interface DesktopTelemetryBridge {
  telemetry?: { trackScreen?: (name: string) => void };
}

export function trackDesktopScreen(screen: AnalyticsScreen): void {
  const desktop = (window as unknown as { desktop?: DesktopTelemetryBridge }).desktop;
  desktop?.telemetry?.trackScreen?.(screen);
}
