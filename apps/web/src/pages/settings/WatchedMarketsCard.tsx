import { useState } from "react";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { Card, SectionTitle, Switch } from "../../ui";
import { MARKET_LABEL, type Market } from "./types";
import { toggleMarket } from "./watchedMarkets";
import { useSaveQueue } from "./useSaveQueue";

const MARKET_ORDER: Market[] = ["US", "HK", "CN"];

export function WatchedMarketsCard() {
  const { data, error, reload } = useQuery<{ markets: Market[] }>("settings.getWatchedMarkets", () =>
    client.settings.getWatchedMarkets(),
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

  return (
    <Card className="settings-display-card">
      <div className="settings-card-heading">
        <SectionTitle>关注市场</SectionTitle>
      </div>
      <div className="settings-time-preference">
        <div className="settings-preference-copy">
          <div className="settings-preference-description">
            全市场级扫描（资金流轮动、盘中巡检等）只覆盖这里勾选的市场；单个标的的分析始终跟随该标的自身所在的市场。
          </div>
        </div>
      </div>
      {MARKET_ORDER.map((market) => (
        <div className="settings-time-preference" key={market}>
          <div className="settings-preference-copy">
            <div className="settings-preference-name">{MARKET_LABEL[market]}</div>
          </div>
          <Switch
            ariaLabel={MARKET_LABEL[market]}
            checked={markets.includes(market)}
            onCheckedChange={(checked) => handleToggle(market, checked)}
          />
        </div>
      ))}
      {blockedHint ? (
        <div className="settings-time-preference">
          <div className="settings-preference-copy">
            <div className="settings-preference-description">至少保留一个市场</div>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="settings-time-preference">
          <div className="settings-preference-copy">
            <div className="settings-preference-description">{error}</div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
