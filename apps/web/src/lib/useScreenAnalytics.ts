import { useEffect, useRef } from 'react';
import { trackFeatureUsed, trackScreenViewed } from './analytics';
import { analyticsScreenOf } from './analyticsScreen';
import { routePathname, useRoute } from './router';

/**
 * One event per screen the trader lands on, not per navigation: several routes collapse onto the
 * same screen (every `/charts/:id` is `chart`), and paging through them is one visit to that
 * screen rather than a dozen. Deduping here rather than in the Worker keeps the daily event count
 * proportional to what someone actually looked at.
 */
export function useScreenAnalytics(): void {
  const route = useRoute();
  const screen = analyticsScreenOf(routePathname(route));
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (sent.current === screen) return;
    sent.current = screen;
    trackScreenViewed(screen);
  }, [screen]);
}

/**
 * Fires once per launch that lands on the gate, so the pair with `completed` reads as a funnel:
 * how many first runs reached setup against how many got through it. Gated on a ref rather than
 * on mount because the gate re-renders as each credential check resolves.
 */
export function useOnboardingAnalytics(shown: boolean): void {
  const sent = useRef(false);

  useEffect(() => {
    if (!shown || sent.current) return;
    sent.current = true;
    trackFeatureUsed('onboarding', { stage: 'started' });
  }, [shown]);
}
