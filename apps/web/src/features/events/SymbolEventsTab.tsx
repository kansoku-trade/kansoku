import type { MarketEvent } from '@kansoku/shared/types';
import { shortSymbol } from './eventLabels';
import { MarketEventTape } from './MarketEventTape';
import { useMarketEventFeed } from './useMarketEventFeed';

export function SymbolEventsTab({
  symbol,
  onGenerateCanvas,
}: {
  symbol: string;
  onGenerateCanvas?: (event: MarketEvent) => void;
}) {
  const feed = useMarketEventFeed({ symbol, live: true });
  return (
    <MarketEventTape
      emptyText={`${shortSymbol(symbol)} 还没有采集到事件`}
      feed={feed}
      onGenerateCanvas={onGenerateCanvas}
    />
  );
}
