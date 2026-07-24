import { useParams } from 'react-router';
import { Home } from '@web/features/home/Home';
import { SymbolCockpit } from '@web/features/cockpit/SymbolCockpit';
import { normalizeSymbol } from '@web/lib/symbol';

export function Component() {
  const { sym } = useParams();
  let symbol: string | null = null;
  try {
    symbol = normalizeSymbol(decodeURIComponent(sym ?? ''));
  } catch {
    symbol = null;
  }
  if (!symbol) return <Home />;
  return <SymbolCockpit sym={symbol} />;
}
