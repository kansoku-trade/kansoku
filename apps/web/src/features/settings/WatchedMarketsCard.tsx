import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Card, SectionTitle, Switch } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { MARKET_LABEL, type Market } from './types';
import { toggleMarket } from './watchedMarkets';
import { useSaveQueue } from './useSaveQueue';

const MARKET_ORDER: Market[] = ['US', 'HK', 'CN'];

const styles = stylex.create({
  displayCard: {
    minWidth: 0,
    overflow: 'hidden',
    padding: 0,
  },
  cardHeading: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    minHeight: '34px',
    padding: '0 11px',
  },
  cardTitle: {
    margin: 0,
  },
  preference: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '12px',
    'justifyContent': 'space-between',
    'padding': '11px',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  preferenceCopy: {
    minWidth: 0,
  },
  preferenceName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  preferenceDescription: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
});

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

  return (
    <Card className={`settings-display-card ${stylex.props(styles.displayCard).className}`}>
      <div className={`settings-card-heading ${stylex.props(styles.cardHeading).className}`}>
        <SectionTitle className={stylex.props(styles.cardTitle).className}>关注市场</SectionTitle>
      </div>
      <div className={`settings-time-preference ${stylex.props(styles.preference).className}`}>
        <div
          className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}
        >
          <div
            className={`settings-preference-description ${stylex.props(styles.preferenceDescription).className}`}
          >
            全市场轮动与盘中巡检仅覆盖已勾选的市场
          </div>
        </div>
      </div>
      {MARKET_ORDER.map((market) => (
        <div
          className={`settings-time-preference ${stylex.props(styles.preference).className}`}
          key={market}
        >
          <div
            className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}
          >
            <div
              className={`settings-preference-name ${stylex.props(styles.preferenceName).className}`}
            >
              {MARKET_LABEL[market]}
            </div>
          </div>
          <Switch
            ariaLabel={MARKET_LABEL[market]}
            checked={markets.includes(market)}
            onCheckedChange={(checked) => handleToggle(market, checked)}
          />
        </div>
      ))}
      {blockedHint ? (
        <div className={`settings-time-preference ${stylex.props(styles.preference).className}`}>
          <div
            className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}
          >
            <div
              className={`settings-preference-description ${stylex.props(styles.preferenceDescription).className}`}
            >
              至少保留一个市场
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className={`settings-time-preference ${stylex.props(styles.preference).className}`}>
          <div
            className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}
          >
            <div
              className={`settings-preference-description ${stylex.props(styles.preferenceDescription).className}`}
            >
              {error}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
