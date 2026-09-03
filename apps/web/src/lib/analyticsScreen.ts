import type { AnalyticsScreen } from './analytics';

/**
 * Longest-prefix-first: `/symbol/sepa/NVDA` is a sepa_symbol, not a symbol, and only the order of
 * these entries keeps it that way. The popout window shows the same symbol page in its own frame,
 * so it counts as the same screen rather than a thirteenth one the Worker would reject.
 */
const PREFIX_SCREENS: readonly (readonly [string, AnalyticsScreen])[] = [
  ['/symbol/sepa/', 'sepa_symbol'],
  ['/popout/symbol/', 'symbol'],
  ['/symbol/', 'symbol'],
  ['/charts/', 'chart'],
  ['/training/stats', 'training_stats'],
  ['/settings/', 'settings'],
];

const EXACT_SCREENS: Readonly<Record<string, AnalyticsScreen>> = {
  '/': 'home',
  '/overview': 'overview',
  '/charts': 'charts',
  '/research': 'research',
  '/chat': 'assistant',
  '/settings': 'settings',
  '/about': 'about',
  '/logs': 'logs',
};

export function analyticsScreenOf(pathname: string): AnalyticsScreen {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const exact = EXACT_SCREENS[path];
  if (exact) return exact;
  for (const [prefix, screen] of PREFIX_SCREENS) {
    if (path.startsWith(prefix)) return screen;
  }
  return 'other';
}
