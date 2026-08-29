import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { IndustryPanorama, PortfolioSummary, QuoteCell } from '@kansoku/shared/types';
import { industryOf, UNCLASSIFIED_INDUSTRY } from '@kansoku/shared/industryMap';
import { signed } from '@web/lib/format';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { NoteBlock, Tooltip } from '@web/ui';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import { INDEX_SYMBOLS } from './HomeTopStrip';
import { isCardWorthySymbol } from './SymbolGrid';
import { squarify, type TreemapRect } from './treemap';

interface PanoramaTile {
  symbol: string;
  pct: number | null;
  turnover: number;
  cap: number | null;
  owned: boolean;
}

export interface PanoramaGroup {
  industry: string;
  turnover: number;
  cap: number;
  weightedPct: number | null;
  tiles: PanoramaTile[];
}

export function heatClass(pct: number | null): string {
  if (pct == null) return 'heat-0';
  if (pct >= 4) return 'heat-g3';
  if (pct >= 1.5) return 'heat-g2';
  if (pct > 0.2) return 'heat-g1';
  if (pct <= -4) return 'heat-r3';
  if (pct <= -1.5) return 'heat-r2';
  if (pct < -0.2) return 'heat-r1';
  return 'heat-0';
}

export function buildPanoramaGroups(
  quotes: QuoteCell[],
  portfolio: PortfolioSummary | null,
  caps: Record<string, number> = {},
): PanoramaGroup[] {
  const owned = new Set((portfolio?.positions ?? []).map((p) => p.symbol));
  const indexSet = new Set(INDEX_SYMBOLS);
  const byIndustry = new Map<string, PanoramaTile[]>();
  for (const q of quotes) {
    if (indexSet.has(q.symbol) || !isCardWorthySymbol(q.symbol)) continue;
    const tile: PanoramaTile = {
      symbol: q.symbol,
      pct: q.pct,
      turnover: q.turnover ?? 0,
      cap: caps[q.symbol] ?? null,
      owned: owned.has(q.symbol),
    };
    const industry = industryOf(q.symbol);
    const list = byIndustry.get(industry);
    if (list) list.push(tile);
    else byIndustry.set(industry, [tile]);
  }
  const groups = [...byIndustry.entries()].map(([industry, tiles]) => {
    tiles.sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || b.turnover - a.turnover);
    const turnover = tiles.reduce((s, t) => s + t.turnover, 0);
    const cap = tiles.reduce((s, t) => s + (t.cap ?? 0), 0);
    const weighted = tiles.filter((t) => t.pct != null && t.turnover > 0);
    const weightSum = weighted.reduce((s, t) => s + t.turnover, 0);
    const weightedPct = weightSum
      ? weighted.reduce((s, t) => s + t.pct! * t.turnover, 0) / weightSum
      : null;
    return { industry, turnover, cap, weightedPct, tiles };
  });
  return groups.sort((a, b) => {
    if ((a.industry === UNCLASSIFIED_INDUSTRY) !== (b.industry === UNCLASSIFIED_INDUSTRY)) {
      return a.industry === UNCLASSIFIED_INDUSTRY ? 1 : -1;
    }
    return b.cap - a.cap || b.turnover - a.turnover;
  });
}

const TOOL_INDUSTRIES = new Set(['现金类', '波动率', UNCLASSIFIED_INDUSTRY]);
const MERGE_BELOW = 3;

export function splitPanorama(groups: PanoramaGroup[]): {
  main: PanoramaGroup[];
  tools: PanoramaGroup[];
} {
  const tools = groups.filter((g) => TOOL_INDUSTRIES.has(g.industry));
  const rest = groups.filter((g) => !TOOL_INDUSTRIES.has(g.industry));
  const main = rest.filter((g) => g.tiles.length >= MERGE_BELOW);
  const small = rest.filter((g) => g.tiles.length < MERGE_BELOW);
  if (small.length === 1) main.push(small[0]);
  else if (small.length > 1) {
    const tiles = small
      .flatMap((g) => g.tiles)
      .sort((a, b) => (b.cap ?? 0) - (a.cap ?? 0) || b.turnover - a.turnover);
    main.push({
      industry: small.map((g) => g.industry).join(' · '),
      turnover: small.reduce((s, g) => s + g.turnover, 0),
      cap: small.reduce((s, g) => s + g.cap, 0),
      weightedPct: null,
      tiles,
    });
  }
  return { main, tools };
}

export function panoramaReadLine(groups: PanoramaGroup[]): string | null {
  const rated = groups.filter((g) => g.weightedPct != null && !TOOL_INDUSTRIES.has(g.industry));
  if (rated.length < 2) return null;
  const top = rated.reduce((a, b) => (b.weightedPct! > a.weightedPct! ? b : a));
  const bottom = rated.reduce((a, b) => (b.weightedPct! < a.weightedPct! ? b : a));
  if (top === bottom) return null;
  return `${top.industry}最强(${signed(top.weightedPct!)}%)、${bottom.industry}最弱(${signed(bottom.weightedPct!)}%)`;
}

const styles = stylex.create({
  number: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  positive: {
    color: colors.up,
  },
  negative: {
    color: colors.down,
  },
  tabs: {
    display: 'flex',
    gap: '6px',
    marginBottom: '8px',
  },
  tab: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: 0,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontFamily: fonts.ui,
    fontSize: fontSizes.sm,
    padding: '3px 12px',
  },
  tabActive: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.borderStrong,
    color: colors.textPrimary,
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  row: {
    'display': 'grid',
    'gap': '6px',
    'gridTemplateColumns': '1fr 1fr',
    '@media (max-width: 640px)': {
      gridTemplateColumns: '1fr',
    },
  },
  sector: {
    aspectRatio: '1 / 1',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: 0,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  sectorHead: {
    alignItems: 'baseline',
    backgroundColor: colors.backgroundElement,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    fontSize: fontSizes.sm,
    justifyContent: 'space-between',
    padding: '3px 8px',
  },
  sectorName: {
    color: colors.textSecondary,
    fontWeight: 600,
  },
  sectorBody: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  industryWrap: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    position: 'relative',
  },
  treemap: {
    position: 'relative',
  },
  industryTreemap: {
    inset: 0,
    position: 'absolute',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    justifyContent: 'center',
    outlineColor: colors.border,
    outlineOffset: '-1px',
    outlineStyle: 'solid',
    outlineWidth: '1px',
    overflow: 'hidden',
    padding: '3px 6px',
    position: 'absolute',
    textDecoration: 'none',
    transition: 'background-color 150ms ease',
    fontVariantNumeric: 'tabular-nums',
  },
  tileDense: {
    justifyContent: 'flex-start',
    padding: '2px 4px',
  },
  tileOwned: {
    outlineColor: colors.accent,
    outlineOffset: '-1.5px',
    outlineWidth: '1.5px',
  },
  tileHeat0: {
    backgroundColor: colors.backgroundElement,
    color: colors.textSecondary,
  },
  tileHeatG1: {
    backgroundColor: '#14532d',
    color: '#a7e3c0',
  },
  tileHeatG2: {
    backgroundColor: '#15803d',
    color: '#d9f5e4',
  },
  tileHeatG3: {
    backgroundColor: '#16a34a',
    color: '#eafff2',
  },
  tileHeatR1: {
    backgroundColor: '#58151c',
    color: '#f0b1b1',
  },
  tileHeatR2: {
    backgroundColor: '#b91c1c',
    color: '#ffdada',
  },
  tileHeatR3: {
    backgroundColor: '#dc2626',
    color: '#ffecec',
  },
  sym: {
    fontSize: fontSizes.sm,
    fontWeight: 700,
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  symDense: {
    fontSize: fontSizes.xs,
    lineHeight: 1.15,
  },
  pct: {
    fontSize: fontSizes.xs,
    opacity: 0.9,
  },
  tileSub: {
    color: 'currentColor',
    fontSize: fontSizes.xs,
    lineHeight: 1.1,
    marginTop: '1px',
    opacity: 0.72,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chips: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px',
  },
  chip: {
    alignItems: 'center',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    display: 'inline-flex',
    fontFamily: fonts.ui,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '8px',
    padding: '3px 9px',
  },
  chipLink: {
    color: colors.textSecondary,
    textDecoration: 'none',
  },
  chipLabel: {
    fontWeight: 600,
  },
  sectorRead: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '6px',
  },
});

function heatStyle(pct: number | null): stylex.StyleXStyles {
  if (pct == null || (pct > -0.2 && pct <= 0.2)) return styles.tileHeat0;
  if (pct >= 4) return styles.tileHeatG3;
  if (pct >= 1.5) return styles.tileHeatG2;
  if (pct > 0.2) return styles.tileHeatG1;
  if (pct <= -4) return styles.tileHeatR3;
  if (pct <= -1.5) return styles.tileHeatR2;
  return styles.tileHeatR1;
}

function sortByPct(tiles: PanoramaTile[]): PanoramaTile[] {
  return [...tiles].sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));
}

function ToolChips({ tools }: { tools: PanoramaGroup[] }) {
  if (!tools.length) return null;
  return (
    <div className={`pano-chips ${stylex.props(styles.chips).className}`}>
      {tools.map((g) => (
        <span className={`pano-chip ${stylex.props(styles.chip).className}`} key={g.industry}>
          <span className={`pano-chip-label ${stylex.props(styles.chipLabel).className}`}>
            {g.industry}
          </span>
          {sortByPct(g.tiles).map((t) => (
            <a
              key={t.symbol}
              className={
                stylex.props(
                  styles.number,
                  styles.chipLink,
                  t.pct != null && t.pct > 0.2 && styles.positive,
                  t.pct != null && t.pct < -0.2 && styles.negative,
                ).className
              }
              href={`/symbol/${encodeURIComponent(t.symbol)}`}
            >
              {t.symbol.replace(/\.US$/, '')} {t.pct == null ? '—' : `${signed(t.pct)}%`}
            </a>
          ))}
        </span>
      ))}
    </div>
  );
}

function useMeasured(): [React.RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function pairRows(groups: PanoramaGroup[]): PanoramaGroup[][] {
  const out: PanoramaGroup[][] = [];
  for (let i = 0; i < groups.length; i += 2) out.push(groups.slice(i, i + 2));
  return out;
}

interface TileRenderProps {
  rect: TreemapRect;
  dense: boolean;
}

function tileRects(
  tiles: PanoramaTile[],
  size: { w: number; h: number },
): Map<string, TileRenderProps> {
  if (size.w <= 0 || size.h <= 0) return new Map();
  const rects = squarify(
    tiles.map((t) => ({
      key: t.symbol,
      value: t.cap && t.cap > 0 ? t.cap : t.turnover > 0 ? t.turnover : 1,
    })),
    size.w,
    size.h,
  );
  const map = new Map<string, TileRenderProps>();
  for (const r of rects) {
    map.set(r.key, { rect: r, dense: r.w * r.h < 900 });
  }
  return map;
}

function SectorPanel({ group }: { group: PanoramaGroup }) {
  const [ref, size] = useMeasured();
  const { w, h } = size;
  const rectMap = useMemo(() => tileRects(group.tiles, { w, h }), [group.tiles, w, h]);
  return (
    <div className={`pano-sector ${stylex.props(styles.sector).className}`}>
      <div className={`pano-sector-head ${stylex.props(styles.sectorHead).className}`}>
        <span className={`pano-sector-name ${stylex.props(styles.sectorName).className}`}>
          {group.industry}
        </span>
        {group.weightedPct != null && (
          <span
            {...stylex.props(
              styles.number,
              group.weightedPct >= 0 ? styles.positive : styles.negative,
            )}
          >
            {signed(group.weightedPct)}%
          </span>
        )}
      </div>
      <div className={`pano-sector-body ${stylex.props(styles.sectorBody).className}`} ref={ref}>
        {group.tiles.map((t) => {
          const info = rectMap.get(t.symbol);
          if (!info || info.rect.w < 4 || info.rect.h < 4) return null;
          const { rect, dense } = info;
          const label = t.symbol.replace(/\.US$/, '');
          const pctLabel = t.pct == null ? '—' : `${signed(t.pct)}%`;
          return (
            <Tooltip
              key={t.symbol}
              content={`${t.symbol}\n${pctLabel}`}
              renderTrigger={
                <a
                  aria-label={`${t.symbol} ${pctLabel}`}
                  className={`pano-tile ${heatClass(t.pct)}${t.owned ? ' pano-tile--owned' : ''}${dense ? ' pano-tile--dense' : ''} ${stylex.props(styles.tile, heatStyle(t.pct), t.owned && styles.tileOwned, dense && styles.tileDense).className}`}
                  href={`/symbol/${encodeURIComponent(t.symbol)}`}
                  style={{
                    left: `${rect.x}px`,
                    top: `${rect.y}px`,
                    width: `${rect.w}px`,
                    height: `${rect.h}px`,
                  }}
                />
              }
            >
              <span
                className={`pano-sym ${stylex.props(styles.sym, dense && styles.symDense).className}`}
              >
                {label}
              </span>
              {!dense && (
                <span className={`pano-pct ${stylex.props(styles.number, styles.pct).className}`}>
                  {pctLabel}
                </span>
              )}
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function WatchPanorama({
  quotes,
  portfolio,
  caps,
}: {
  quotes: QuoteCell[];
  portfolio: PortfolioSummary | null;
  caps: Record<string, number>;
}) {
  const groups = buildPanoramaGroups(quotes, portfolio, caps);
  if (!groups.length) return <NoteBlock>行情就绪后展示全景图</NoteBlock>;
  const { main, tools } = splitPanorama(groups);
  const line = panoramaReadLine(groups);
  const rows = pairRows(main);
  return (
    <>
      <div className={`pano-rows ${stylex.props(styles.rows).className}`}>
        {rows.map((pair, idx) => (
          <div
            className={`pano-row ${stylex.props(styles.row).className}`}
            key={pair.map((g) => g.industry).join('|') || `row-${idx}`}
          >
            {pair.map((g) => (
              <SectorPanel key={g.industry} group={g} />
            ))}
          </div>
        ))}
      </div>
      <ToolChips tools={tools} />
      {line && (
        <div className={`sector-read ${stylex.props(styles.sectorRead).className}`}>↳ {line}</div>
      )}
    </>
  );
}

function IndustryTreemap({ items }: { items: IndustryPanorama['items'] }) {
  const [ref, size] = useMeasured();
  const { w, h } = size;
  const rects = useMemo(() => {
    if (w <= 0 || h <= 0) return [];
    return squarify(
      items.map((r) => ({ key: r.name, value: Math.abs(r.chg ?? 0) + 0.01 })),
      w,
      h,
    );
  }, [items, w, h]);
  const byKey = new Map(rects.map((r) => [r.key, r]));
  return (
    <div
      className={`pano-treemap ${stylex.props(styles.treemap, styles.industryTreemap).className}`}
      ref={ref}
    >
      {items.map((row) => {
        const rect = byKey.get(row.name);
        if (!rect || rect.w < 4 || rect.h < 4) return null;
        const dense = rect.w * rect.h < 1600;
        return (
          <div
            key={row.name}
            className={`pano-tile ${heatClass(row.chg)}${dense ? ' pano-tile--dense' : ''} ${stylex.props(styles.tile, heatStyle(row.chg), dense && styles.tileDense).className}`}
            style={{
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.w}px`,
              height: `${rect.h}px`,
            }}
            title={`${row.name}${row.chg == null ? '' : ` ${signed(row.chg)}%`}${row.leading_ticker ? ` · 领涨 ${row.leading_ticker}${row.leading_chg != null ? ` ${signed(row.leading_chg)}%` : ''}` : ''}`}
          >
            <span
              className={`pano-sym ${stylex.props(styles.sym, dense && styles.symDense).className}`}
            >
              {row.name}
            </span>
            {!dense && (
              <span className={`pano-pct ${stylex.props(styles.number, styles.pct).className}`}>
                {row.chg == null ? '—' : `${signed(row.chg)}%`}
              </span>
            )}
            {!dense && row.leading_ticker && (
              <span className={`pano-tile-sub ${stylex.props(styles.tileSub).className}`}>
                {row.leading_ticker}
                {row.leading_chg != null ? ` ${signed(row.leading_chg)}%` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function IndustryPanoramaView() {
  const { data, error } = usePollingQuery<IndustryPanorama>(
    'overview.industries',
    () => client.overview.industries(),
    10 * 60_000,
  );
  if (error) return <NoteBlock>行业数据获取失败，正在重试</NoteBlock>;
  if (!data) return <NoteBlock>行业数据加载中…</NoteBlock>;
  if (!data.items.length) return <NoteBlock>暂无行业数据</NoteBlock>;
  return (
    <div
      className={`pano-industry-wrap ${stylex.props(styles.industryWrap).className}`}
      style={{ height: '320px' }}
    >
      <IndustryTreemap items={data.items} />
    </div>
  );
}

export function MarketPanorama({
  quotes,
  portfolio,
  caps = {},
}: {
  quotes: QuoteCell[];
  portfolio: PortfolioSummary | null;
  caps?: Record<string, number>;
}) {
  const [tab, setTab] = useState<'watch' | 'market'>('watch');
  return (
    <div className="market-panorama">
      <div className={`pano-tabs ${stylex.props(styles.tabs).className}`}>
        <button
          type="button"
          className={`pano-tab${tab === 'watch' ? ' pano-tab--active' : ''} ${stylex.props(styles.tab, tab === 'watch' && styles.tabActive).className}`}
          onClick={() => setTab('watch')}
        >
          自选 + 持仓
        </button>
        <button
          type="button"
          className={`pano-tab${tab === 'market' ? ' pano-tab--active' : ''} ${stylex.props(styles.tab, tab === 'market' && styles.tabActive).className}`}
          onClick={() => setTab('market')}
        >
          全市场
        </button>
      </div>
      {tab === 'watch' ? (
        <WatchPanorama quotes={quotes} portfolio={portfolio} caps={caps} />
      ) : (
        <IndustryPanoramaView />
      )}
    </div>
  );
}
