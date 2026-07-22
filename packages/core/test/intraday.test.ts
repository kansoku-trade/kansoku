import { describe, expect, it } from 'vitest';
import type { RawBar, TimeframeKey } from '@kansoku/shared/types';
import {
  computeIntradayEntryPlan,
  resolveEntryPlanStatus,
} from '../src/analysis/intraday/entryPlan.js';
import { capMarkersPerBar, mergeAiAutoMarkers } from '../src/analysis/intraday/markers.js';
import { buildIntraday, type IntradayInput } from '../src/analysis/intraday/orchestrator.js';
import { coerceIntradayTimeframe } from '../src/analysis/intraday/timeframe.js';
import { approxDiff, loadFixture } from './helpers.js';

type TfExpected = Record<
  TimeframeKey,
  {
    candles: unknown;
    volumes: unknown;
    macdDif: unknown;
    macdDea: unknown;
    macdHist: unknown;
    macdCrosses: unknown;
    autoDivergence: unknown;
    autoBeichi: unknown;
    last_close: number;
    summary: unknown;
  }
>;

describe('intraday parity vs python golden fixture', () => {
  const input = loadFixture<IntradayInput>('intraday-input.json');
  const expected = loadFixture<TfExpected>('intraday-expected.json');

  for (const key of ['m5', 'm15', 'h1'] as TimeframeKey[]) {
    it(`timeframe ${key} matches (annotation detectors absent by default)`, () => {
      const tf = coerceIntradayTimeframe(input.timeframes[key] as RawBar[], key);
      const exp = expected[key];
      expect(approxDiff(tf.candles, exp.candles)).toBeNull();
      expect(approxDiff(tf.volumes, exp.volumes)).toBeNull();
      expect(approxDiff(tf.macdDif, exp.macdDif)).toBeNull();
      expect(approxDiff(tf.macdDea, exp.macdDea)).toBeNull();
      expect(approxDiff(tf.macdHist, exp.macdHist)).toBeNull();
      expect(approxDiff(tf.macdCrosses, exp.macdCrosses)).toBeNull();
      expect(approxDiff(tf.lastClose, exp.last_close)).toBeNull();

      // Free build: the six pro annotation detectors are absent, so every
      // detection field degrades to empty. Everything else still matches golden.
      expect(tf.autoDivergence).toEqual([]);
      expect(tf.autoBeichi).toEqual([]);
      expect(tf.pattern123).toEqual([]);
      expect(tf.secondBreakouts).toEqual([]);
      expect(tf.candlePatterns).toEqual([]);

      const expectedSummary = {
        ...(exp.summary as Record<string, unknown>),
        divergence_candidates: [],
        beichi_candidates: [],
        candle_patterns: [],
        pattern_123: [],
        second_breakouts: [],
      };
      expect(approxDiff(tf.summary, expectedSummary)).toBeNull();
    });
  }

  it('full build works in preview mode', () => {
    const { built, meta } = buildIntraday(input);
    expect(meta.mode).toBe('preview');
    expect(built.defaultTf).toBe('m15');
    expect(Object.keys(built.timeframes).sort()).toEqual(['h1', 'm15', 'm5']);
    expect(built.sidebar.position?.shares).toBe(1);
  });

  it('keeps explicit target prices and level context in prediction mode', () => {
    const plan = computeIntradayEntryPlan(
      {
        entry: 61.1,
        stop: 62.52,
        target1: 60,
        target2: 57.92,
        rationale: '反弹到压力带后受阻才入场。',
        stop_note: '站回上一段反弹高点则计划失效。',
        entry_zone: { kind: 'resistance', label: '反弹压力带', low: 60.9, high: 61.35 },
        target1_zone: { kind: 'support', label: '日内低点', low: 60, high: 60 },
        target1_note: '整数位和日内低点。',
        target2_zone: { kind: 'support', label: '深一档支撑', low: 57.9, high: 58 },
        target2_condition: '60 跌破后才成立。',
      },
      'short',
      [
        { kind: 'invalidation', label: '空头失效区', low: 62.52, high: 62.52 },
        { kind: 'resistance', label: '上方阻力区', low: 62.8, high: 63.2, source: '前高密集区' },
      ],
    );

    expect(plan.target1).toBe(60);
    expect(plan.target2).toBe(57.92);
    expect(plan.target1_pct).toBeCloseTo(1.8003, 4);
    expect(plan.entry_zone?.label).toBe('反弹压力带');
    expect(plan.target_contexts[0].note).toBe('整数位和日内低点。');
    expect(plan.target_contexts[1].condition).toBe('60 跌破后才成立。');
    expect(plan.price_zones.map((z) => z.label)).toEqual(['上方阻力区']);
    expect(plan.price_zones[0].sources).toEqual(['前高密集区']);
  });

  it('carries a valid context through to sidebar.context', () => {
    const context = {
      generated_at: '2026-07-05T14:00:00.000Z',
      conclusion: {
        stance: 'long' as const,
        summary: '多头结构未破坏',
        action: '回踩不破前低可加仓',
      },
      news: [
        {
          time: '2026-07-05T13:00:00.000Z',
          source: 'longbridge' as const,
          tag: 'catalyst' as const,
          title: '订单超预期',
          note: '利好持续性待验证',
        },
      ],
      sources_used: ['longbridge-news'],
    };
    const { built } = buildIntraday({ ...input, context });
    expect(built.sidebar.context).toEqual(context);
  });

  it('defaults sidebar.context to null when input.context is absent', () => {
    const { built } = buildIntraday(input);
    expect(built.sidebar.context).toBeNull();
  });

  it('throws ClientError on a missing generated_at', () => {
    const context = {
      generated_at: '',
      conclusion: { stance: 'long' as const, summary: 'x', action: 'y' },
      news: [],
      sources_used: [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/generated_at/);
  });

  it('throws ClientError on an invalid stance', () => {
    const context = {
      generated_at: '2026-07-05T14:00:00.000Z',
      conclusion: { stance: 'sideways' as unknown as 'long', summary: 'x', action: 'y' },
      news: [],
      sources_used: [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/stance/);
  });

  it('throws ClientError when news is not an array', () => {
    const context = {
      generated_at: '2026-07-05T14:00:00.000Z',
      conclusion: { stance: 'long' as const, summary: 'x', action: 'y' },
      news: 'nope' as unknown as [],
      sources_used: [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/news/);
  });

  it('walks the entry plan lifecycle from the anchor bar', () => {
    const plan = { entry: 1014, stop: 990.5 };
    const bar = (i: number, high: number, low: number, close: number) => ({
      time: 1000 + i * 300,
      high,
      low,
      close,
    });

    // never touches entry, closes below the entry-stop midpoint (1002.25) → invalidated
    const falling = [bar(0, 1010, 1005, 1006), bar(1, 1006, 998, 999.5)];
    expect(resolveEntryPlanStatus(plan, 'long', 1000, falling)?.status).toBe('invalidated');

    // touches entry then holds → triggered
    const held = [bar(0, 1015, 1010, 1012), bar(1, 1013, 1008, 1010)];
    expect(resolveEntryPlanStatus(plan, 'long', 1000, held)?.status).toBe('triggered');

    // touches entry then hits the stop → stopped
    const stoppedOut = [bar(0, 1015, 1010, 1012), bar(1, 1012, 990, 991)];
    expect(resolveEntryPlanStatus(plan, 'long', 1000, stoppedOut)?.status).toBe('stopped');

    // hovers between midpoint and entry → waiting
    const hovering = [bar(0, 1012, 1006, 1010)];
    expect(resolveEntryPlanStatus(plan, 'long', 1000, hovering)?.status).toBe('waiting');

    // bars before the anchor are ignored
    expect(resolveEntryPlanStatus(plan, 'long', 2000, falling)?.status).toBe('waiting');

    // short mirror: entry 990, stop 1000, price rallies past midpoint 995 without touching entry
    const shortPlan = { entry: 990, stop: 1000 };
    const rally = [bar(0, 993, 991, 992), bar(1, 998, 992, 997)];
    expect(resolveEntryPlanStatus(shortPlan, 'short', 1000, rally)?.status).toBe('invalidated');

    expect(resolveEntryPlanStatus(plan, 'neutral', 1000, falling)).toBeNull();
    expect(resolveEntryPlanStatus(plan, 'long', null, falling)).toBeNull();
  });

  it('caps visible markers per bar in built output', () => {
    const { built } = buildIntraday(input);
    for (const tf of Object.values(built.timeframes)) {
      const perBar = new Map<number, number>();
      for (const m of tf.markers) perBar.set(m.time, (perBar.get(m.time) ?? 0) + 1);
      for (const count of perBar.values()) expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('throws ClientError when sources_used is not an array', () => {
    const context = {
      generated_at: '2026-07-05T14:00:00.000Z',
      conclusion: { stance: 'long' as const, summary: 'x', action: 'y' },
      news: [],
      sources_used: 'nope' as unknown as [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/sources_used/);
  });
});

describe('marker consolidation helpers', () => {
  const barIndex = new Map<number, number>(
    Array.from({ length: 10 }, (_, i) => [1000 + i * 60, i] as [number, number]),
  );
  const marker = (time: number, group: string | undefined, text: string, tooltip: string) =>
    ({ time, position: 'aboveBar', color: '#fff', shape: 'circle', text, tooltip, group }) as never;

  it('merges an auto divergence marker into a nearby AI divergence marker of the same type', () => {
    const ai = [marker(1060, 'ai', '⚡', '⚡ AI 标注信号\n15m 顶背离')];
    const auto = [marker(1120, 'divergence', '📉', '📉 自动·顶背离（简化算法，仅供参考）\n详情')];
    const out = mergeAiAutoMarkers(ai, auto, barIndex);
    expect(out).toHaveLength(1);
    expect(out[0].group).toBe('ai');
    expect(out[0].tooltip).toContain('自动检测同步确认');
    expect(out[0].tooltip).not.toContain('简化算法');
  });

  it('keeps auto markers of a different type or beyond the merge window', () => {
    const ai = [marker(1000, 'ai', '⚡', '⚡ AI 标注信号\n顶背离')];
    const auto = [
      marker(1000, 'macdBeichi', '🌀', '🌀 自动·顶 MACD 背离（K 线级）（简化算法，仅供参考）\n详情'),
      marker(1240, 'divergence', '📉', '📉 自动·顶背离（简化算法，仅供参考）\n详情'),
    ];
    const out = mergeAiAutoMarkers(ai, auto, barIndex);
    expect(out).toHaveLength(3);
  });

  it('merges same-bar same-group duplicate markers into one with combined tooltip', () => {
    const out = capMarkersPerBar([
      marker(1000, 'divergence', '', '📉 自动·顶背离\nA 段详情'),
      marker(1000, 'divergence', '', '📉 自动·顶背离\nB 段详情'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].tooltip).toContain('A 段详情');
    expect(out[0].tooltip).toContain('B 段详情');
  });

  it('caps same-bar markers at 2 by group priority and folds dropped ones into the tooltip', () => {
    const stacked = [
      marker(1000, 'candle', '十字星', '🕯️ 自动·十字星\n详情'),
      marker(1000, 'ai', '🌀', '🌀 AI 标注信号\n背驰'),
      marker(1000, 'divergence', '📉', '📉 自动·顶背离\n详情'),
      marker(1000, 'pattern123', '③', '🔢 自动·顶部123\n详情'),
    ];
    const out = capMarkersPerBar(stacked);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.group)).toEqual(['ai', 'divergence']);
    expect(out[1].tooltip).toContain('本根另有');
    expect(out[1].tooltip).toContain('顶部123');
    expect(out[1].tooltip).toContain('十字星');
  });
});
