import {
  AUTO_SIGNAL_META,
  type ChanStructure,
  type Connector,
  type DivergencePair,
  type IntradayPrediction,
  type OverlayGroup,
  type Pattern123,
  type SeriesMarker,
  type SwingPoint,
  type TimeframeKey,
} from '@kansoku/shared/types';
import { buySellPointMarkerText, buySellPointTooltip, fenxingTooltip } from '../chanlun/tooltip.js';
import { toTs } from '../indicators.js';
import {
  AI_AUTO_MERGE_BAR_WINDOW,
  AI_ICON_TO_AUTO_GROUP,
  barTimeShort,
  SIGNAL_BIAS_STYLE,
  SIGNAL_ICON,
  TIMEFRAME_ORDER,
} from './constants.js';

export { capMarkersPerBar, dedupeMarkers } from '@kansoku/shared/markerPolicy';

export interface TfOverlay {
  markers: SeriesMarker[];
  priceConnectors: Connector[];
  macdConnectors: Connector[];
}

export function buildIntradaySignals(
  signals: IntradayPrediction['signals'],
): Record<TimeframeKey, TfOverlay> {
  const perTf = Object.fromEntries(
    TIMEFRAME_ORDER.map((k) => [
      k,
      { markers: [], priceConnectors: [], macdConnectors: [] } as TfOverlay,
    ]),
  ) as Record<TimeframeKey, TfOverlay>;
  for (const sig of signals ?? []) {
    const tf = sig.timeframe;
    if (!tf || !(tf in perTf)) continue;
    const stype = sig.type ?? sig.kind ?? 'other';
    const bias = sig.bias;
    const { color, shape } = SIGNAL_BIAS_STYLE[bias ?? 'neutral'];

    const tooltip = `${SIGNAL_ICON[stype] ?? '•'} AI 标注信号\n${sig.label ?? stype}`;
    if (stype === 'macd_divergence') {
      const points = sig.points ?? [];
      for (const p of points) {
        perTf[tf].markers.push({
          time: toTs(p.time),
          position: bias === 'bullish' ? 'belowBar' : 'aboveBar',
          color,
          shape,
          text: SIGNAL_ICON[stype] ?? '•',
          tooltip,
          group: 'ai',
        });
      }
      if (points.length === 2) {
        perTf[tf].priceConnectors.push({
          color,
          group: 'ai',
          data: [
            { time: toTs(points[0].time), value: Number(points[0].price) },
            { time: toTs(points[1].time), value: Number(points[1].price) },
          ],
        });
        if (points[0].macd_value != null && points[1].macd_value != null) {
          perTf[tf].macdConnectors.push({
            color,
            group: 'ai',
            data: [
              { time: toTs(points[0].time), value: Number(points[0].macd_value) },
              { time: toTs(points[1].time), value: Number(points[1].macd_value) },
            ],
          });
        }
      }
    } else {
      if (sig.time == null) continue;
      perTf[tf].markers.push({
        time: toTs(sig.time),
        position: bias === 'bullish' ? 'belowBar' : 'aboveBar',
        color,
        shape,
        text: SIGNAL_ICON[stype] ?? '•',
        tooltip,
        group: 'ai',
      });
    }
  }
  return perTf;
}

export function mergeAiAutoMarkers(
  aiMarkers: SeriesMarker[],
  autoMarkers: SeriesMarker[],
  barIndex: Map<number, number>,
): SeriesMarker[] {
  const merged = aiMarkers.map((m) => ({ ...m }));
  const kept: SeriesMarker[] = [];
  for (const auto of autoMarkers) {
    const autoIdx = barIndex.get(auto.time);
    const near =
      autoIdx === undefined
        ? undefined
        : merged.find((ai) => {
            if (!ai.text || AI_ICON_TO_AUTO_GROUP[ai.text] !== auto.group) return false;
            const aiIdx = barIndex.get(ai.time);
            return aiIdx !== undefined && Math.abs(aiIdx - autoIdx) <= AI_AUTO_MERGE_BAR_WINDOW;
          });
    if (!near) {
      kept.push(auto);
      continue;
    }
    const autoTitle = auto.tooltip?.split('\n')[0]?.replaceAll(/（[^）]*）/g, '');
    const note = autoTitle ? `✓ 自动检测同步确认（${autoTitle}）` : null;
    if (note && !near.tooltip?.includes(note)) near.tooltip = `${near.tooltip}\n${note}`;
  }
  return [...merged, ...kept];
}

export function autoPatternMarkers(
  items: DivergencePair[],
  group: 'divergence' | 'macdBeichi',
  color: string,
  recentCount = 2,
): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  const macdConnectors: Connector[] = [];
  for (const [idx, it] of items.entries()) {
    const recent = idx >= items.length - recentCount;
    const { a, b } = it;
    const meta = AUTO_SIGNAL_META[`${group}-${it.kind}`];
    const position = it.kind === 'top' ? 'aboveBar' : 'belowBar';
    const tooltip =
      `${meta.icon} 自动·${meta.title}（简化算法，仅供参考）\n` +
      `${barTimeShort(a.time)} $${a.price} → ${barTimeShort(b.time)} $${b.price}\n` +
      meta.impact;
    for (const p of [a, b]) {
      markers.push({
        time: p.time,
        position,
        color,
        shape: 'circle',
        text: '',
        tooltip,
        group,
        recent,
      });
    }
    priceConnectors.push({
      color,
      group,
      recent,
      data: [
        { time: a.time, value: a.price },
        { time: b.time, value: b.price },
      ],
    });
    macdConnectors.push({
      color,
      group,
      recent,
      data: [
        { time: a.time, value: a.macd_value },
        { time: b.time, value: b.macd_value },
      ],
    });
  }
  return { markers, priceConnectors, macdConnectors };
}

export function pattern123Overlay(
  patterns: Pattern123[],
  lastBarTime: number,
  recentCount = 2,
): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  for (const [idx, pat] of patterns.entries()) {
    const recent = idx >= patterns.length - recentCount;
    const bullish = pat.kind === 'bullish';
    const color = bullish ? '#26a69a' : '#ef5350';
    const breakVerb = bullish ? '站上' : '跌破';
    const statusText = pat.confirm
      ? `已于 ${barTimeShort(pat.confirm.time)} 收盘${breakVerb} ②，结构确认`
      : `酝酿中：等待收盘${breakVerb} ② $${pat.trigger.toFixed(2)}`;
    const tooltip =
      `🔢 自动·${pat.label}（简化算法，仅供参考）\n` +
      `① ${barTimeShort(pat.p1.time)} $${pat.p1.price} → ② ${barTimeShort(pat.p2.time)} $${pat.p2.price} → ③ ${barTimeShort(pat.p3.time)} $${pat.p3.price}\n` +
      `${pat.implication}\n${statusText}`;
    const pts: [SwingPoint, string][] = [
      [pat.p1, '①'],
      [pat.p2, '②'],
      [pat.p3, '③'],
    ];
    for (const [p, text] of pts) {
      const isTrough = bullish !== (text === '②');
      markers.push({
        time: p.time,
        position: isTrough ? 'belowBar' : 'aboveBar',
        color,
        shape: 'circle',
        text: pat.confirm || text !== '③' ? text : `${text}?`,
        tooltip,
        group: 'pattern123',
        recent,
      });
    }
    if (pat.confirm) {
      markers.push({
        time: pat.confirm.time,
        position: bullish ? 'belowBar' : 'aboveBar',
        color,
        shape: bullish ? 'arrowUp' : 'arrowDown',
        text: '123✓',
        tooltip: `🔢 123 结构确认\n${barTimeShort(pat.confirm.time)} 收盘 $${pat.confirm.price.toFixed(2)} ${breakVerb}触发线 $${pat.trigger.toFixed(2)}\n${pat.implication}`,
        group: 'pattern123',
        recent,
      });
    }
    priceConnectors.push({
      color,
      group: 'pattern123',
      recent,
      data: [
        { time: pat.p1.time, value: pat.p1.price },
        { time: pat.p2.time, value: pat.p2.price },
        { time: pat.p3.time, value: pat.p3.price },
      ],
    });
    const triggerEnd = pat.confirm ? pat.confirm.time : lastBarTime;
    if (triggerEnd > pat.p3.time) {
      priceConnectors.push({
        color,
        group: 'pattern123',
        recent,
        data: [
          { time: pat.p3.time, value: pat.trigger },
          { time: triggerEnd, value: pat.trigger },
        ],
      });
    }
  }
  return { markers, priceConnectors, macdConnectors: [] };
}

export function chanOverlay(chan: ChanStructure, timeframe: TimeframeKey): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];

  for (const f of chan.fenxings) {
    markers.push({
      time: f.time,
      position: f.kind === 'top' ? 'aboveBar' : 'belowBar',
      color: f.kind === 'top' ? '#ef5350' : '#26a69a',
      shape: 'circle',
      text: f.confirmed ? '' : '?',
      tooltip: fenxingTooltip(f, timeframe),
      group: 'fenxing',
    });
  }

  for (const b of chan.bis) {
    priceConnectors.push({
      color: b.direction === 'up' ? '#26a69a' : '#ef5350',
      group: 'bi',
      data: [
        { time: b.start.time, value: b.start.price },
        { time: b.end.time, value: b.end.price },
      ],
    });
  }

  for (const x of chan.xianduans) {
    const firstBi = x.bis[0];
    const lastBi = x.bis[x.bis.length - 1];
    priceConnectors.push({
      color: x.direction === 'up' ? '#00695c' : '#c62828',
      group: 'xianduan',
      data: [
        { time: firstBi.start.time, value: firstBi.start.price },
        { time: lastBi.end.time, value: lastBi.end.price },
      ],
    });
  }

  for (const p of chan.buySellPoints) {
    const isBuy = p.kind.startsWith('buy');
    markers.push({
      time: p.time,
      position: isBuy ? 'belowBar' : 'aboveBar',
      color: isBuy ? '#26a69a' : '#ef5350',
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      text: buySellPointMarkerText(p.kind),
      tooltip: buySellPointTooltip(p),
      group: `chan-${p.kind}` as OverlayGroup,
    });
  }

  return { markers, priceConnectors, macdConnectors: [] };
}
