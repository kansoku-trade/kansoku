import { useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { TriangleAlert } from 'lucide-react';
import type { IntradayBuilt, QuoteCell, TimeframeKey } from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { marketOfSymbol } from '@web/lib/market';
import { MarketTime } from '@web/ui';
import type { SidebarTab } from '../SidebarTabs';
import { SidebarTabs } from '../SidebarTabs';
import { ConclusionCard, type ConclusionReassess } from './ConclusionCard';
import { EventRiskCard } from './EventRiskCard';
import { NewsTab } from './tabs/NewsTab';
import { PositionTab } from './tabs/PositionTab';
import { PredictionTab } from './tabs/PredictionTab';
import { colors, fontSizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  sidebar: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    fontSize: fontSizes.md,
    overflow: 'hidden',
  },
  sidebarScroll: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: 16,
  },
  header: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    marginBottom: 14,
    paddingBottom: 12,
  },
  symbol: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
  },
  name: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    marginTop: 2,
  },
  price: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginTop: 8,
  },
  priceDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: 2,
  },
  disclaimer: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.4,
    marginTop: 16,
    paddingTop: 10,
  },
  icon: {
    verticalAlign: '-2px',
  },
});

interface IntradaySidebarProps {
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  conclusionReassess?: ConclusionReassess;
  tabsOverride?: SidebarTab[];
  extraTabs?: SidebarTab[];
  active?: string;
  onActiveChange?: (key: string) => void;
  dock?: ReactNode;
  liveQuote?: QuoteCell | null;
}

export function resolveSidebarQuote(
  sidebar: IntradayBuilt['sidebar'],
  liveQuote?: QuoteCell | null,
) {
  const current = liveQuote?.symbol === sidebar.symbol ? liveQuote : null;
  return {
    last: current?.last ?? sidebar.last,
    asOf: current?.asOf ?? sidebar.asOf,
  };
}

export function IntradaySidebar({
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  conclusionReassess,
  tabsOverride,
  extraTabs,
  active: activeProp,
  onActiveChange,
  dock,
  liveQuote,
}: IntradaySidebarProps) {
  const s = built.sidebar;
  const market = marketOfSymbol(s.symbol);
  const displayedQuote = resolveSidebarQuote(s, liveQuote);
  const [internalActive, setInternalActive] = useState('prediction');
  const active = activeProp ?? internalActive;
  const setActive = onActiveChange ?? setInternalActive;

  const hasNews = Boolean(s.context?.news?.length) || Boolean(s.news?.length) || Boolean(s.symbol);
  const hasPosition = s.position !== null;

  const defaultTabs: SidebarTab[] = [
    {
      key: 'prediction',
      label: '预测',
      content: (
        <PredictionTab
          built={built}
          activeTf={activeTf}
          predictionUpdatedAt={predictionUpdatedAt}
          predictionStale={predictionStale}
          reassess={conclusionReassess}
        />
      ),
    },
    {
      key: 'news',
      label: '消息',
      hidden: !hasNews,
      content: <NewsTab context={s.context} news={s.news ?? []} sym={s.symbol} />,
    },
    {
      key: 'position',
      label: '持仓',
      hidden: !hasPosition,
      content: <PositionTab position={s.position} />,
    },
  ];
  const tabs = tabsOverride ?? [...defaultTabs, ...(extraTabs ?? [])];

  return (
    <div className={`sidebar ${stylex.props(styles.sidebar).className}`}>
      <div className={`sidebar-scroll ${stylex.props(styles.sidebarScroll).className}`}>
        <div className={`header ${stylex.props(styles.header).className}`}>
          <div className={`symbol ${stylex.props(styles.symbol).className}`}>{s.symbol}</div>
          <div className={`name ${stylex.props(styles.name).className}`}>{s.name}</div>
          <div className={`price ${stylex.props(styles.price).className}`}>
            ${fmt(displayedQuote.last)}
          </div>
          <div className={`price-date ${stylex.props(styles.priceDate).className}`}>
            {displayedQuote.asOf ? <MarketTime value={displayedQuote.asOf} market={market} /> : ''}{' '}
            · 长桥证券
          </div>
        </div>

        <ConclusionCard
          context={s.context}
          predictionStale={predictionStale}
          reassess={conclusionReassess}
        />

        <EventRiskCard eventRisk={s.eventRisk} />

        <SidebarTabs active={active} onChange={setActive} tabs={tabs} />

        <div className={`disclaimer ${stylex.props(styles.disclaimer).className}`}>
          <TriangleAlert className={`icon ${stylex.props(styles.icon).className}`} size={12} />{' '}
          仅供学习参考，不构成投资建议。数据来源：长桥证券。
          <br />
          方向判断、情景推演和入场计划为 AI 分析结论；Pin Bar、MACD 背离标注及 MACD
          数值由服务端算法自动计算。
        </div>
      </div>

      {dock}
    </div>
  );
}
