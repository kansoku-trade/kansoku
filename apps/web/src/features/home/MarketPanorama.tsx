import { useEffect, useMemo, useRef, useState } from 'react';
import type { IndustryPanorama, PortfolioSummary, QuoteCell } from '@kansoku/shared/types';
import { industryOf, UNCLASSIFIED_INDUSTRY } from '@kansoku/shared/industryMap';
import { signed } from '@web/lib/format';
import { usePollingQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Tooltip } from '@web/ui';
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

function sortByPct(tiles: PanoramaTile[]): PanoramaTile[] {
  return [...tiles].sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));
}

function ToolChips({ tools }: { tools: PanoramaGroup[] }) {
  if (!tools.length) return null;
  return (
    <div className="pano-chips">
      {tools.map((g) => (
        <span className="pano-chip" key={g.industry}>
          <span className="pano-chip-label">{g.industry}</span>
          {sortByPct(g.tiles).map((t) => (
            <a
              key={t.symbol}
              className={`num ${t.pct != null && t.pct > 0.2 ? 'up' : t.pct != null && t.pct < -0.2 ? 'down' : ''}`}
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
    <div className="pano-sector">
      <div className="pano-sector-head">
        <span className="pano-sector-name">{group.industry}</span>
        {group.weightedPct != null && (
          <span className={`num ${group.weightedPct >= 0 ? 'up' : 'down'}`}>
            {signed(group.weightedPct)}%
          </span>
        )}
      </div>
      <div className="pano-sector-body" ref={ref}>
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
                  className={`pano-tile ${heatClass(t.pct)}${t.owned ? ' pano-tile--owned' : ''}${dense ? ' pano-tile--dense' : ''}`}
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
              <span className="pano-sym">{label}</span>
              {!dense && <span className="pano-pct num">{pctLabel}</span>}
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
  if (!groups.length) return <div className="note-block">行情就绪后展示全景图</div>;
  const { main, tools } = splitPanorama(groups);
  const line = panoramaReadLine(groups);
  const rows = pairRows(main);
  return (
    <>
      <div className="pano-rows">
        {rows.map((pair, idx) => (
          <div className="pano-row" key={pair.map((g) => g.industry).join('|') || `row-${idx}`}>
            {pair.map((g) => (
              <SectorPanel key={g.industry} group={g} />
            ))}
          </div>
        ))}
      </div>
      <ToolChips tools={tools} />
      {line && <div className="sector-read">↳ {line}</div>}
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
    <div className="pano-treemap" ref={ref}>
      {items.map((row) => {
        const rect = byKey.get(row.name);
        if (!rect || rect.w < 4 || rect.h < 4) return null;
        const dense = rect.w * rect.h < 1600;
        return (
          <div
            key={row.name}
            className={`pano-tile ${heatClass(row.chg)}${dense ? ' pano-tile--dense' : ''}`}
            style={{
              left: `${rect.x}px`,
              top: `${rect.y}px`,
              width: `${rect.w}px`,
              height: `${rect.h}px`,
            }}
            title={`${row.name}${row.chg == null ? '' : ` ${signed(row.chg)}%`}${row.leading_ticker ? ` · 领涨 ${row.leading_ticker}${row.leading_chg != null ? ` ${signed(row.leading_chg)}%` : ''}` : ''}`}
          >
            <span className="pano-sym">{row.name}</span>
            {!dense && (
              <span className="pano-pct num">{row.chg == null ? '—' : `${signed(row.chg)}%`}</span>
            )}
            {!dense && row.leading_ticker && (
              <span className="pano-tile-sub">
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
  if (error) return <div className="note-block">行业数据获取失败，正在重试</div>;
  if (!data) return <div className="note-block">行业数据加载中…</div>;
  if (!data.items.length) return <div className="note-block">暂无行业数据</div>;
  return (
    <div className="pano-industry-wrap" style={{ height: '320px' }}>
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
      <div className="pano-tabs">
        <button
          type="button"
          className={tab === 'watch' ? 'pano-tab pano-tab--active' : 'pano-tab'}
          onClick={() => setTab('watch')}
        >
          自选 + 持仓
        </button>
        <button
          type="button"
          className={tab === 'market' ? 'pano-tab pano-tab--active' : 'pano-tab'}
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
