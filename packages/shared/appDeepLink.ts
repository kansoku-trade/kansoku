import { symbolAnalysisPath, symbolLivePath, symbolSepaPath } from './chartUrl.js';

const RELATIVE_APP_ORIGIN = 'https://kansoku.internal';
const LOCAL_APP_HOSTS = new Set(['localhost', '127.0.0.1']);

export type AppDeepLink =
  | { kind: 'symbol-analysis'; route: string; symbol: string; analysisId: string }
  | { kind: 'symbol-cockpit'; route: string; symbol: string; analysisId: null }
  | { kind: 'symbol-sepa'; route: string; symbol: string; analysisId: string | null }
  | { kind: 'chart'; route: string; chartId: string };

function isKnownAppOrigin(url: URL, relative: boolean): boolean {
  if (relative) return url.origin === RELATIVE_APP_ORIGIN;
  if (url.protocol === 'app:' && url.host === '-') return true;
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    LOCAL_APP_HOSTS.has(url.hostname) &&
    url.port === '5199'
  );
}

export function parseAppDeepLink(href: string | undefined): AppDeepLink | null {
  if (!href) return null;
  const relative = href.startsWith('/');
  let url: URL;
  try {
    url = new URL(href, relative ? RELATIVE_APP_ORIGIN : undefined);
  } catch {
    return null;
  }
  if (!isKnownAppOrigin(url, relative)) return null;

  const chartMatch = url.pathname.match(/^\/charts\/([^/]+)\/?$/);
  if (chartMatch) {
    try {
      const chartId = decodeURIComponent(chartMatch[1]);
      return chartId
        ? { kind: 'chart', route: `/charts/${encodeURIComponent(chartId)}`, chartId }
        : null;
    } catch {
      return null;
    }
  }

  const sepaMatch = url.pathname.match(/^\/symbol\/sepa\/([^/]+)\/?$/);
  if (sepaMatch) {
    let sepaSymbol: string;
    try {
      sepaSymbol = decodeURIComponent(sepaMatch[1]);
    } catch {
      return null;
    }
    if (!sepaSymbol || !/^[\w.-]+$/.test(sepaSymbol)) return null;

    const sepaAnalysisId = url.searchParams.get('analysis')?.trim() || null;
    return {
      kind: 'symbol-sepa',
      route: symbolSepaPath(sepaSymbol, sepaAnalysisId),
      symbol: sepaSymbol,
      analysisId: sepaAnalysisId,
    };
  }

  const symbolMatch = url.pathname.match(/^\/symbol\/([^/]+)\/?$/);
  if (!symbolMatch) return null;

  let symbol: string;
  try {
    symbol = decodeURIComponent(symbolMatch[1]);
  } catch {
    return null;
  }
  if (!symbol || !/^[\w.-]+$/.test(symbol)) return null;

  const analysisId = url.searchParams.get('analysis')?.trim() || null;
  const live = url.searchParams.get('view') === 'live';
  if (analysisId) {
    return {
      kind: 'symbol-analysis',
      route: symbolAnalysisPath(symbol, analysisId),
      symbol,
      analysisId,
    };
  }
  return {
    kind: 'symbol-cockpit',
    route: live ? symbolLivePath(symbol) : symbolAnalysisPath(symbol, null),
    symbol,
    analysisId: null,
  };
}
