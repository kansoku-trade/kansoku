import { useParams } from 'react-router';
import { SepaSymbolPage } from '@web/features/charts/sepa/SepaSymbolPage';
import { Home } from '@web/features/home/Home';
import { useQueryParam } from '@web/lib/router';
import { normalizeSymbol } from '@web/lib/symbol';

function safeNormalizeSymbol(raw: string): string | null {
  try {
    return normalizeSymbol(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

export function Component() {
  const { sym } = useParams();
  const analysisId = useQueryParam('analysis');
  const symbol = safeNormalizeSymbol(sym ?? '');
  if (!symbol) return <Home />;
  return <SepaSymbolPage sym={symbol} analysisId={analysisId} />;
}
