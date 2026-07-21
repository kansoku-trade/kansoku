import type {
  LeaderboardDetailCardView,
  LeaderboardDetailRow,
  LeaderboardDetailSection,
  LeaderboardGauge,
  LeaderboardModelRowView,
  LeaderboardReportViewData,
  ToneClass,
} from '@kansoku/bench-report-ui/types';
import type { ModelAggregate } from '../score/aggregate.js';
import type { Scores } from '../schema/scores.js';
import type { ReportConfigSnapshot } from './render.js';
import { fmtCost, fmtCount, fmtDelta, fmtDuration, fmtNum, fmtRate, fmtScore } from './htmlFormat.js';
import { buildScatterView, type ScatterInputPoint } from './scatterGeometry.js';

interface ModelKind {
  kind: 'model' | 'baseline' | 'gold';
  vendor: string;
  name: string;
}

const BASELINE_LABEL: Record<string, string> = {
  'buy-hold': '买入持有',
  'coin-flip': '抛硬币',
  'always-neutral': '永远观望',
};

const MODE_LABEL: Record<string, string> = { blind: '盲盘', live: '实盘' };

function classifyModel(id: string): ModelKind {
  if (id.startsWith('baseline/')) {
    return { kind: 'baseline', vendor: 'baseline', name: id.slice('baseline/'.length) };
  }
  if (id.startsWith('gold/')) {
    return { kind: 'gold', vendor: 'gold', name: id.slice('gold/'.length) };
  }
  const slash = id.indexOf('/');
  if (slash === -1) return { kind: 'model', vendor: '', name: id };
  return { kind: 'model', vendor: id.slice(0, slash), name: id.slice(slash + 1) };
}

function displayName(kind: ModelKind): string {
  if (kind.kind === 'baseline') return BASELINE_LABEL[kind.name] ?? kind.name;
  if (kind.kind === 'gold') return `黄金 · ${kind.name}`;
  return kind.name;
}

function findBuyHold(models: ModelAggregate[]): ModelAggregate | null {
  return models.find((m) => m.model === 'baseline/buy-hold') ?? null;
}

function sortModels(models: ModelAggregate[]): ModelAggregate[] {
  return [...models].sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));
}

function gauge(value: number | null | undefined, kind: LeaderboardGauge['kind']): LeaderboardGauge {
  const clamped = value != null && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return { fillRatio: clamped, text: fmtScore(value), kind };
}

function buildRow(
  agg: ModelAggregate,
  rank: number | null,
  isBaseline: boolean,
  buyHoldJudgment: number | null,
): LeaderboardModelRowView {
  const kind = classifyModel(agg.model);
  return {
    id: agg.model,
    rank,
    isBaseline,
    name: displayName(kind),
    vendor: kind.vendor && kind.kind === 'model' ? kind.vendor : null,
    baselineBadge: isBaseline,
    total: fmtScore(agg.total),
    delta:
      isBaseline || buyHoldJudgment == null
        ? null
        : {
            tone: agg.judgment - buyHoldJudgment >= 0 ? 'pos' : 'neg',
            text: fmtDelta(agg.judgment - buyHoldJudgment),
          },
    judgment: gauge(agg.judgment, isBaseline ? 'muted' : 'j'),
    efficiency: agg.efficiency != null ? gauge(agg.efficiency, 'e') : null,
    winRate: fmtRate(agg.winRate),
    abstainRate: fmtRate(agg.abstainRate),
    cost: fmtCost(agg.meanCostUsd),
    duration: fmtDuration(agg.meanDurationMs),
    violationRate: fmtRate(agg.formatViolationRate),
  };
}

function detailRows(entries: Array<[string, string, ToneClass | '']>): LeaderboardDetailRow[] {
  return entries.map(([label, value, tone]) => ({ label, value, tone }));
}

function buildDetailCard(agg: ModelAggregate): LeaderboardDetailCardView {
  const kind = classifyModel(agg.model);
  const blind = agg.modes.blind;
  const live = agg.modes.live;
  const up = agg.regimes.up;
  const down = agg.regimes.down;
  const noiseTone: ToneClass | '' = agg.noiseDelta == null ? '' : agg.noiseDelta >= 0 ? 'positive' : 'negative';

  const sections: LeaderboardDetailSection[] = [
    {
      title: '盲盘 vs 实盘',
      rows: detailRows([
        ['盲盘 判断分', blind ? fmtScore(blind.judgment) : '—', ''],
        ['实盘 判断分', live ? fmtScore(live.judgment) : '—', ''],
        ['抗噪分（差值）', agg.noiseDelta != null ? fmtDelta(agg.noiseDelta) : '—', noiseTone],
        ['一致性（越低越稳）', fmtNum(agg.consistency, 2), ''],
      ]),
    },
    {
      title: '涨段 vs 跌段',
      rows: detailRows([
        ['上涨段 判断分', up ? fmtScore(up.judgment) : '—', up ? 'positive' : ''],
        ['下跌段 判断分', down ? fmtScore(down.judgment) : '—', down ? 'negative' : ''],
        ['观望正确率', fmtRate(agg.neutralAccuracy), ''],
        ['赢单平均盈亏比', fmtNum(agg.avgWinnerR, 2), ''],
      ]),
    },
    {
      title: '效率画像',
      rows: detailRows([
        ['平均成本 / 题', fmtCost(agg.meanCostUsd), ''],
        ['平均耗时 / 题', fmtDuration(agg.meanDurationMs), ''],
        ['工具调用 p50 / p90', `${fmtCount(agg.toolCalls.p50, 0)} / ${fmtCount(agg.toolCalls.p90, 0)}`, ''],
        ['违规率', fmtRate(agg.formatViolationRate), ''],
        ['未成交率', fmtRate(agg.noFillRate), ''],
        ['超时率', fmtRate(agg.timeoutRate), ''],
        ['API 出错率', fmtRate(agg.apiErrorRate), ''],
      ]),
    },
  ];

  return {
    id: agg.model,
    name: displayName(kind),
    vendor: kind.kind === 'model' && kind.vendor ? kind.vendor : kind.kind,
    did: `${agg.model} · ${agg.cellCount} cells · avg ${fmtCount(agg.toolCalls.mean)} tool-calls`,
    sections,
  };
}

export function buildLeaderboardReportViewData(
  scores: Scores,
  config: ReportConfigSnapshot,
  generatedAt: string,
): LeaderboardReportViewData {
  const sorted = sortModels(scores.models);
  const realModels = sorted.filter((m) => !m.model.startsWith('baseline/') && !m.model.startsWith('gold/'));
  const baselines = sorted.filter((m) => m.model.startsWith('baseline/') || m.model.startsWith('gold/'));
  const buyHold = findBuyHold(scores.models);
  const buyHoldJ = buyHold?.judgment ?? null;

  const scatterPoints: ScatterInputPoint[] = realModels
    .filter((m) => m.efficiency != null)
    .map((m, idx) => ({
      id: m.model,
      name: displayName(classifyModel(m.model)),
      judgment: m.judgment,
      efficiency: m.efficiency as number,
      lead: idx === 0,
    }));

  const runId = config.runId ?? scores.runId;
  const datasetVersion = config.datasetVersion ?? scores.datasetVersion;
  const modes = config.config?.modes ?? config.modes ?? [];
  const modeLabel = modes.length ? modes.map((m) => MODE_LABEL[m] ?? m).join(' · ') : '—';
  const repeat = config.config?.repeat;
  const weights = scores.weights;
  const beatenCount = buyHoldJ == null ? null : realModels.filter((m) => m.judgment > buyHoldJ).length;
  const beatenLabel = beatenCount != null ? `${beatenCount}/${realModels.length}` : null;

  const kvs = [
    { label: 'DATASET', value: String(datasetVersion) },
    { label: 'MODES', value: modeLabel },
    { label: 'REP', value: repeat != null ? `×${repeat}` : '—' },
    { label: 'WEIGHTS', value: `J ${weights.judgment.toFixed(1)} / E ${weights.efficiency.toFixed(1)}` },
    { label: 'UPDATED', value: generatedAt.slice(0, 10).replaceAll('-', '·') },
  ];

  const initialSelectedId = realModels[0]?.model ?? sorted[0]?.model ?? null;

  const details: Record<string, LeaderboardDetailCardView> = {};
  for (const model of sorted) details[model.model] = buildDetailCard(model);

  const scatter = buildScatterView(scatterPoints, buyHoldJ, '买入持有基线');

  return {
    runId,
    generatedAt,
    title: '模型交易判断力总榜',
    subtitle: {
      prefix: `${realModels.length} 个模型 · ${baselines.length} 条基线 · ${scores.cells.length} cells`,
      beatenLabel,
    },
    n: sorted.length,
    kvs,
    realRows: realModels.map((m, i) => buildRow(m, i + 1, false, buyHoldJ)),
    baselineRows: baselines.map((m) => buildRow(m, null, true, buyHoldJ)),
    passLineLabel: buyHold != null ? `BUY & HOLD 基线 · 判断分 ${fmtScore(buyHold.judgment)}` : null,
    scatter,
    scatterLegend: { belowLabel: buyHoldJ != null ? '低于买入持有基线' : null },
    details,
    initialSelectedId,
    footer: { datasetVersion: String(datasetVersion), runId, generatedAt },
  };
}
