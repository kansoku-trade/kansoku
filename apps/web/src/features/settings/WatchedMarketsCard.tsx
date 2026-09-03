import { useState } from 'react';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Switch } from '@web/ui';
import { MARKET_LABEL, type Market } from './types';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { toggleMarket } from './watchedMarkets';
import { useSaveQueue } from './useSaveQueue';

const MARKET_ORDER: Market[] = ['US', 'HK', 'CN'];

export function WatchedMarketsCard() {
  const { data, error, reload } = useQuery<{ markets: Market[] }>(
    'settings.getWatchedMarkets',
    () => client.settings.getWatchedMarkets(),
  );

  if (!data) return null;
  return <WatchedMarketsCardLoaded initial={data.markets} onReload={reload} error={error} />;
}

function WatchedMarketsCardLoaded({
  initial,
  onReload,
  error,
}: {
  initial: Market[];
  onReload: () => void;
  error: string | null;
}) {
  const [markets, setMarkets] = useState<Market[]>(initial);
  const [blockedHint, setBlockedHint] = useState(false);

  const queue = useSaveQueue<Market[]>({
    initial,
    save: async (snapshot) => {
      const res = await client.settings.putWatchedMarkets({ markets: snapshot });
      return res.markets;
    },
    onError: (_err, rolledBackTo) => {
      setMarkets(rolledBackTo ?? initial);
      onReload();
    },
  });

  const handleToggle = (market: Market, next: boolean) => {
    const result = toggleMarket(markets, market, next);
    if (result === null) {
      setBlockedHint(true);
      return;
    }
    setBlockedHint(false);
    setMarkets(result);
    queue.push(result);
  };

  const notice = blockedHint ? '至少保留一个市场' : error;

  return (
    <SettingsGroup name="关注市场">
      {MARKET_ORDER.map((market) => (
        <SettingsRow key={market} label={MARKET_LABEL[market]}>
          <Switch
            ariaLabel={MARKET_LABEL[market]}
            checked={markets.includes(market)}
            onCheckedChange={(checked) => handleToggle(market, checked)}
          />
        </SettingsRow>
      ))}
      {notice ? <SettingsRow error={notice} /> : null}
    </SettingsGroup>
  );
}
