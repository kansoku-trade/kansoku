import {
  AUTO_SIGNAL_META,
  type Connector,
  type DivergencePair,
  type IntradayPrediction,
  type Pattern123,
  type SeriesMarker,
  type SwingPoint,
  type TimeframeKey,
} from '@kansoku/shared/types';
import { toTs } from '../indicators.js';
import {
  AI_AUTO_MERGE_BAR_WINDOW,
  AI_ICON_TO_AUTO_GROUP,
  barTimeShort,
  MARKER_GROUP_RANK,
  MAX_MARKERS_PER_BAR,
  SIGNAL_BIAS_STYLE,
  SIGNAL_ICON,
  TIMEFRAME_ORDER,
} from './constants.js';

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

export function capMarkersPerBar(
  markers: SeriesMarker[],
  cap = MAX_MARKERS_PER_BAR,
): SeriesMarker[] {
  const bySlot = new Map<string, SeriesMarker>();
  const deduped: SeriesMarker[] = [];
  for (const m of markers) {
    const slot = `${m.time}|${m.group ?? ''}|${m.text ?? ''}`;
    const prev = bySlot.get(slot);
    if (!prev) {
      const copy = { ...m };
      bySlot.set(slot, copy);
      deduped.push(copy);
    } else if (m.tooltip && prev.tooltip !== m.tooltip && !prev.tooltip?.includes(m.tooltip)) {
      prev.tooltip = `${prev.tooltip}\n———\n${m.tooltip}`;
    }
  }
  const byTime = new Map<number, SeriesMarker[]>();
  for (const m of deduped) {
    const list = byTime.get(m.time);
    if (list) list.push(m);
    else byTime.set(m.time, [m]);
  }
  const out: SeriesMarker[] = [];
  for (const group of byTime.values()) {
    if (group.length <= cap) {
      out.push(...group);
      continue;
    }
    const ranked = [...group].sort(
      (a, b) => (MARKER_GROUP_RANK[a.group ?? ''] ?? 9) - (MARKER_GROUP_RANK[b.group ?? ''] ?? 9),
    );
    const keep = ranked.slice(0, cap).map((m) => ({ ...m }));
    const dropped = ranked
      .slice(cap)
      .map((m) => m.tooltip?.split('\n')[0])
      .filter((t): t is string => Boolean(t));
    if (dropped.length) {
      const last = keep.at(-1)!;
      last.tooltip = `${last.tooltip}\n———\n本根另有：${dropped.join('；')}`;
    }
    out.push(...keep);
  }
  return out.sort((a, b) => a.time - b.time);
}

export function autoPatternMarkers(
  items: DivergencePair[],
  group: 'divergence' | 'beichi',
  color: string,
): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  const macdConnectors: Connector[] = [];
  for (const it of items) {
    const { a, b } = it;
    const meta = AUTO_SIGNAL_META[`${group}-${it.kind}`];
    const position = it.kind === 'top' ? 'aboveBar' : 'belowBar';
    const tooltip =
      `${meta.icon} 自动·${meta.title}（简化算法，仅供参考）\n` +
      `${barTimeShort(a.time)} $${a.price} → ${barTimeShort(b.time)} $${b.price}\n` +
      meta.impact;
    for (const p of [a, b]) {
      markers.push({ time: p.time, position, color, shape: 'circle', text: '', tooltip, group });
    }
    priceConnectors.push({
      color,
      group,
      data: [
        { time: a.time, value: a.price },
        { time: b.time, value: b.price },
      ],
    });
    macdConnectors.push({
      color,
      group,
      data: [
        { time: a.time, value: a.macd_value },
        { time: b.time, value: b.macd_value },
      ],
    });
  }
  return { markers, priceConnectors, macdConnectors };
}

export function pattern123Overlay(patterns: Pattern123[], lastBarTime: number): TfOverlay {
  const markers: SeriesMarker[] = [];
  const priceConnectors: Connector[] = [];
  for (const pat of patterns) {
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
      });
    }
    priceConnectors.push({
      color,
      group: 'pattern123',
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
        data: [
          { time: pat.p3.time, value: pat.trigger },
          { time: triggerEnd, value: pat.trigger },
        ],
      });
    }
  }
  return { markers, priceConnectors, macdConnectors: [] };
}
