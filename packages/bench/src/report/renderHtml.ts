import type { ModelAggregate } from '../score/aggregate.js';
import type { Scores } from '../schema/scores.js';
import type { ReportConfigSnapshot } from './render.js';

export interface RenderHtmlOptions {
  now?: () => Date;
}

export interface RenderHtmlResult {
  html: string;
}

interface ModelKind {
  kind: 'model' | 'baseline' | 'gold';
  vendor: string;
  name: string;
}

interface ScatterPoint {
  id: string;
  vendor: string;
  name: string;
  judgment: number;
  efficiency: number;
  lead: boolean;
}

interface ScatterGeometry {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  baselineY: number | null;
  baselineJudgment: number | null;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(value: string): string {
  return value.replaceAll(/["&'<>]/g, (c) => HTML_ESCAPE[c] ?? c);
}

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

const BASELINE_LABEL: Record<string, string> = {
  'buy-hold': '买入持有',
  'coin-flip': '抛硬币',
  'always-neutral': '永远观望',
};

function displayName(kind: ModelKind): string {
  if (kind.kind === 'baseline') return BASELINE_LABEL[kind.name] ?? kind.name;
  if (kind.kind === 'gold') return `黄金 · ${kind.name}`;
  return kind.name;
}

const MODE_LABEL: Record<string, string> = { blind: '盲盘', live: '实盘' };

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function fmtScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return (v * 100).toFixed(1);
}

function fmtRate(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtCost(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `$${v.toFixed(4)}`;
}

function fmtDuration(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const s = v / 1000;
  return s >= 10 ? `${s.toFixed(0)}s` : `${s.toFixed(1)}s`;
}

function fmtCount(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(digits);
}

function fmtDelta(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  const scaled = v * 100;
  const sign = scaled > 0 ? '+' : scaled < 0 ? '−' : '';
  return `${sign}${Math.abs(scaled).toFixed(1)}`;
}

function niceStep(range: number): number {
  const raw = range / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const rel = raw / pow;
  const step = rel >= 5 ? 10 : rel >= 2 ? 5 : rel >= 1 ? 2 : 1;
  return step * pow;
}

function niceTicks(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return { lo: min - pad, hi: min + pad, ticks: [min - pad, min, min + pad] };
  }
  const step = niceStep(max - min);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) ticks.push(Number(v.toFixed(6)));
  return { lo, hi, ticks };
}

function projectPoint(
  x: number,
  y: number,
  geom: ScatterGeometry,
): { cx: number; cy: number } {
  const { width, height, padL, padR, padT, padB, xMin, xMax, yMin, yMax } = geom;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const cx = padL + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const cy = padT + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;
  return { cx, cy };
}

function buildScatterGeometry(
  points: ScatterPoint[],
  baseline: number | null,
): ScatterGeometry {
  const width = 460;
  const height = 320;
  const padL = 56;
  const padR = 20;
  const padT = 20;
  const padB = 44;
  const jVals = points.map((p) => p.judgment);
  if (baseline != null) jVals.push(baseline);
  const eVals = points.map((p) => p.efficiency);
  const jRange = niceTicks(jVals.length ? Math.min(...jVals) : 0, jVals.length ? Math.max(...jVals) : 1);
  const eRange = niceTicks(eVals.length ? Math.min(...eVals) : 0, eVals.length ? Math.max(...eVals) : 1);
  const geom: ScatterGeometry = {
    width,
    height,
    padL,
    padR,
    padT,
    padB,
    xMin: eRange.lo,
    xMax: eRange.hi,
    yMin: jRange.lo,
    yMax: jRange.hi,
    xTicks: eRange.ticks,
    yTicks: jRange.ticks,
    baselineY: null,
    baselineJudgment: baseline,
  };
  if (baseline != null) {
    geom.baselineY = projectPoint(geom.xMin, baseline, geom).cy;
  }
  return geom;
}

function renderScatterSvg(
  points: ScatterPoint[],
  baseline: number | null,
  selectedId: string | null,
): string {
  const geom = buildScatterGeometry(points, baseline);
  const { width, height, padL, padR, padT, padB, xMin, yMin } = geom;
  const innerRight = width - padR;
  const innerBottom = height - padB;
  const yTickLines = geom.yTicks
    .map((v) => {
      const { cy } = projectPoint(xMin, v, geom);
      return `<line class="gridln dash" x1="${padL}" y1="${cy.toFixed(1)}" x2="${innerRight}" y2="${cy.toFixed(1)}"/>` +
        `<text class="axlab" x="${padL - 8}" y="${(cy + 3).toFixed(1)}" text-anchor="end">${fmtNum(v * 100, 0)}</text>`;
    })
    .join('');
  const xTickLines = geom.xTicks
    .map((v) => {
      const { cx } = projectPoint(v, yMin, geom);
      return `<line class="gridln dash" x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${innerBottom}"/>` +
        `<text class="axlab" x="${cx.toFixed(1)}" y="${(innerBottom + 14).toFixed(1)}" text-anchor="middle">${fmtNum(v * 100, 0)}</text>`;
    })
    .join('');
  const baselineNode = geom.baselineY != null && baseline != null
    ? `<line class="baseln" x1="${padL}" y1="${geom.baselineY.toFixed(1)}" x2="${innerRight}" y2="${geom.baselineY.toFixed(1)}"/>` +
      `<text class="baslab" x="${(padL + 4).toFixed(1)}" y="${(geom.baselineY - 4).toFixed(1)}">买入持有基线 · ${fmtScore(baseline)}</text>`
    : '';
  const dots = points
    .map((p) => {
      const { cx, cy } = projectPoint(p.efficiency, p.judgment, geom);
      const sel = p.id === selectedId ? ' sel' : '';
      const lead = p.lead ? ' lead' : '';
      const below = baseline != null && p.judgment < baseline ? ' below' : '';
      const anchor = cx > (padL + innerRight) / 2 ? 'end' : 'start';
      const labelX = anchor === 'end' ? cx - 9 : cx + 9;
      const labelY = cy - 8;
      return (
        `<circle class="dot${sel}${lead}${below}" data-model="${esc(p.id)}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${p.lead ? 7 : 6}"/>` +
        `<text class="dotlab${sel}${below ? ' dim' : ''}" x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${esc(displayName(classifyModel(p.id)))}</text>`
      );
    })
    .join('');
  return (
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="判断分对效率分散点图">` +
      `<line class="gridln" x1="${padL}" y1="${padT}" x2="${padL}" y2="${innerBottom}"/>` +
      `<line class="gridln" x1="${padL}" y1="${innerBottom}" x2="${innerRight}" y2="${innerBottom}"/>` +
      xTickLines +
      yTickLines +
      baselineNode +
      dots +
      `<text class="axtitle" x="${padL - 32}" y="${padT - 6}">Judgment ↑</text>` +
      `<text class="axtitle" x="${innerRight}" y="${height - 6}" text-anchor="end">Efficiency →</text>` +
      `</svg>`
  );
}

function gaugeCell(fillRatio: number, valueText: string, kind: 'j' | 'e' | 'muted' = 'j'): string {
  const clamped = Number.isFinite(fillRatio) ? Math.max(0, Math.min(1, fillRatio)) : 0;
  return (
    `<span class="bar"><span class="bartrack ${kind}"><i style="width:${(clamped * 100).toFixed(0)}%"></i></span>` +
    `<span class="num">${esc(valueText)}</span></span>`
  );
}

function renderLeaderboardRow(
  agg: ModelAggregate,
  rank: number,
  isBaseline: boolean,
  isSelected: boolean,
  buyHoldJudgment: number | null,
): string {
  const kind = classifyModel(agg.model);
  const name = displayName(kind);
  const rankCell = isBaseline ? '—' : String(rank);
  const deltaHtml = (() => {
    if (isBaseline || buyHoldJudgment == null) return '';
    const diff = agg.judgment - buyHoldJudgment;
    const cls = diff >= 0 ? 'pos' : 'neg';
    const sign = diff >= 0 ? '+' : '−';
    return `<span class="delta ${cls}">${sign}${Math.abs(diff * 100).toFixed(1)}</span>`;
  })();
  const rowClass = ['row', isBaseline ? 'base' : '', isSelected ? 'sel' : ''].filter(Boolean).join(' ');
  const vendorTag = kind.vendor && kind.kind === 'model' ? `<span class="mvend">${esc(kind.vendor)}</span>` : '';
  const baselineBadge = isBaseline ? '<span class="btag">baseline</span>' : '';
  const effCell =
    agg.efficiency != null
      ? gaugeCell(agg.efficiency, fmtScore(agg.efficiency), 'e')
      : '<span class="num muted">—</span>';
  return (
    `<tr class="${rowClass}" data-model="${esc(agg.model)}">` +
      `<td>${esc(rankCell)}</td>` +
      `<td><span class="mname">${esc(name)} ${vendorTag}${baselineBadge}</span></td>` +
      `<td><span class="total">${fmtScore(agg.total)}</span>${deltaHtml}</td>` +
      `<td>${gaugeCell(agg.judgment, fmtScore(agg.judgment), isBaseline ? 'muted' : 'j')}</td>` +
      `<td>${effCell}</td>` +
      `<td><span class="num">${fmtRate(agg.winRate)}</span></td>` +
      `<td><span class="num">${fmtRate(agg.abstainRate)}</span></td>` +
      `<td><span class="num">${fmtCost(agg.meanCostUsd)}</span></td>` +
      `<td><span class="num">${fmtDuration(agg.meanDurationMs)}</span></td>` +
      `<td><span class="num">${fmtRate(agg.formatViolationRate)}</span></td>` +
    `</tr>`
  );
}

function renderDetailCard(agg: ModelAggregate, isSelected: boolean): string {
  const kind = classifyModel(agg.model);
  const name = displayName(kind);
  const vendor = kind.kind === 'model' && kind.vendor ? esc(kind.vendor) : esc(kind.kind);
  const blind = agg.modes.blind;
  const live = agg.modes.live;
  const up = agg.regimes.up;
  const down = agg.regimes.down;
  const rows = (entries: [string, string][]) =>
    entries
      .map(
        ([k, v]) =>
          `<div class="drow"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`,
      )
      .join('');
  const noiseTone = agg.noiseDelta == null ? '' : agg.noiseDelta >= 0 ? 'pos' : 'neg';
  const modesSection = rows([
    ['盲盘 判断分', blind ? fmtScore(blind.judgment) : '—'],
    ['实盘 判断分', live ? fmtScore(live.judgment) : '—'],
    [
      '抗噪分（差值）',
      agg.noiseDelta != null
        ? `<span class="v ${noiseTone}">${fmtDelta(agg.noiseDelta)}</span>`
        : '—',
    ],
    ['一致性（越低越稳）', fmtNum(agg.consistency, 2)],
  ] as [string, string][]);
  const regimesSection = rows([
    ['上涨段 判断分', up ? `<span class="v pos">${fmtScore(up.judgment)}</span>` : '—'],
    ['下跌段 判断分', down ? `<span class="v neg">${fmtScore(down.judgment)}</span>` : '—'],
    ['观望正确率', fmtRate(agg.neutralAccuracy)],
    ['赢单平均盈亏比', fmtNum(agg.avgWinnerR, 2)],
  ] as [string, string][]);
  const efficiencySection = rows([
    ['平均成本 / 题', fmtCost(agg.meanCostUsd)],
    ['平均耗时 / 题', fmtDuration(agg.meanDurationMs)],
    [
      '工具调用 p50 / p90',
      `${fmtCount(agg.toolCalls.p50, 0)} / ${fmtCount(agg.toolCalls.p90, 0)}`,
    ],
    ['违规率', fmtRate(agg.formatViolationRate)],
    ['未成交率', fmtRate(agg.noFillRate)],
    ['超时率', fmtRate(agg.timeoutRate)],
    ['API 出错率', fmtRate(agg.apiErrorRate)],
  ] as [string, string][]);
  const hiddenAttr = isSelected ? '' : ' hidden';
  return (
    `<div class="detail" data-model-detail="${esc(agg.model)}"${hiddenAttr}>` +
      `<h4>${esc(name)} <span class="mvend">${vendor}</span></h4>` +
      `<div class="did">${esc(agg.model)} · ${agg.cellCount} cells · avg ${fmtCount(agg.toolCalls.mean)} tool-calls</div>` +
      `<div class="detailgrid">` +
        `<div class="dsec">盲盘 vs 实盘</div>${modesSection}` +
        `<div class="dsec">涨段 vs 跌段</div>${regimesSection}` +
        `<div class="dsec">效率画像</div>${efficiencySection}` +
      `</div>` +
    `</div>`
  );
}

function findBuyHold(models: ModelAggregate[]): ModelAggregate | null {
  return models.find((m) => m.model === 'baseline/buy-hold') ?? null;
}

function sortModels(models: ModelAggregate[]): ModelAggregate[] {
  return [...models].sort(
    (a, b) => b.total - a.total || a.model.localeCompare(b.model),
  );
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#fafafa;--panel:#fff;--ink:#0a0a0a;--ink-2:#404040;--ink-3:#737373;--ink-4:#a3a3a3;
  --line:#e5e5e5;--line-2:#d4d4d4;--hover:#f5f5f5;--sel:#eff6ff;
  --accent:#2563eb;--pos:#0f766e;--neg:#dc2626;}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{background:var(--bg);color:var(--ink);
  font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB",sans-serif;
  font-size:13px;line-height:1.45;letter-spacing:-.005em;}
.mono,.num{font-family:ui-monospace,"SF Mono","Menlo","JetBrains Mono",Consolas,monospace;
  font-variant-numeric:tabular-nums lining-nums;letter-spacing:0;}
.muted{color:var(--ink-4);}
.top{border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:10;}
.top .inner{max-width:1440px;margin:0 auto;padding:10px 24px;display:flex;align-items:center;gap:24px;}
.brand{font-weight:700;font-size:14px;letter-spacing:-.02em;display:flex;align-items:center;gap:8px;}
.brand::before{content:"";width:6px;height:6px;background:var(--accent);border-radius:1px;}
.brand span{color:var(--ink-3);font-weight:400;}
.nav{display:flex;gap:2px;margin-left:8px;}
.nav a{padding:6px 10px;font-size:12.5px;color:var(--ink-3);text-decoration:none;border-radius:5px;}
.nav a.on{color:var(--ink);background:var(--hover);font-weight:500;}
.nav a:hover{color:var(--ink);}
.top .r{margin-left:auto;display:flex;gap:14px;font-size:11.5px;color:var(--ink-3);align-items:center;}
.top .r kbd{font-family:ui-monospace,monospace;font-size:10.5px;border:1px solid var(--line-2);border-radius:3px;padding:1px 5px;background:var(--bg);color:var(--ink-2);}
.page{max-width:1440px;margin:0 auto;padding:20px 24px 60px;}
.mstrip{display:flex;align-items:baseline;gap:18px;padding:6px 0 18px;flex-wrap:wrap;}
.mstrip h1{font-size:20px;font-weight:600;letter-spacing:-.02em;}
.mstrip .sub{color:var(--ink-3);font-size:13px;}
.mstrip .kvs{margin-left:auto;display:flex;gap:0;font-size:11.5px;color:var(--ink-3);border:1px solid var(--line);background:var(--panel);overflow:hidden;}
.mstrip .kvs span{padding:6px 12px;border-right:1px solid var(--line);white-space:nowrap;}
.mstrip .kvs span:last-child{border-right:0;}
.mstrip .kvs b{color:var(--ink);font-weight:500;margin-left:6px;font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.shell{border:1px solid var(--line);}
.shell>*+*{margin-top:10px;}
.shell>:first-child{border-top:0;}
.fbar,.panel,.plotpanel,.detailcard{border-left:0;border-right:0;}
.fbar{display:flex;gap:6px;padding:10px;border:1px solid var(--line);background:var(--panel);align-items:center;flex-wrap:wrap;}
.fg{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-3);padding-right:10px;border-right:1px solid var(--line);}
.fg:last-of-type{border-right:0;}
.pill{font-size:11.5px;padding:4px 9px;border-radius:5px;border:1px solid var(--line-2);background:var(--panel);color:var(--ink-2);cursor:pointer;user-select:none;font-family:inherit;}
.pill.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.pill:hover:not(.on){background:var(--hover);}
.fbar .r{margin-left:auto;display:flex;gap:6px;}
.search{border:1px solid var(--line-2);border-radius:5px;padding:4px 9px;font-size:11.5px;background:var(--bg);color:var(--ink);font-family:inherit;width:200px;}
.grid{display:grid;grid-template-columns:1fr 440px;gap:10px;align-items:start;}
@media(max-width:1180px){.grid{grid-template-columns:1fr;}.plotwrap{position:static !important;}}
.panel{background:var(--panel);border:1px solid var(--line);overflow:hidden;}
.panelhead{padding:11px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;}
.panelhead h3{font-size:12.5px;font-weight:600;letter-spacing:-.005em;}
.panelhead .desc{font-size:11.5px;color:var(--ink-3);}
.panelhead .r{margin-left:auto;font-size:11px;color:var(--ink-3);font-family:ui-monospace,monospace;}
.tblwrap{overflow-x:auto;}
.tbl{width:100%;border-collapse:collapse;font-size:13px;}
.tbl thead th{position:sticky;top:53px;background:var(--panel);z-index:5;font-weight:500;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);
  text-align:right;padding:9px 12px;border-bottom:1px solid var(--line-2);white-space:nowrap;user-select:none;}
.tbl thead th:first-child{width:42px;text-align:center;}
.tbl thead th:nth-child(2){text-align:left;}
.tbl thead th.sorted{color:var(--ink);}
.tbl thead th.sorted::after{content:" ↓";color:var(--accent);}
.tbl tbody td{padding:0 12px;border-bottom:1px solid var(--line);height:44px;text-align:right;vertical-align:middle;}
.tbl tbody td:first-child{text-align:center;color:var(--ink-4);font-family:ui-monospace,monospace;font-size:12px;font-weight:500;}
.tbl tbody td:nth-child(2){text-align:left;}
.tbl tbody tr{cursor:pointer;}
.tbl tbody tr:hover{background:var(--hover);}
.tbl tbody tr.sel{background:var(--sel);}
.tbl tbody tr.sel td:first-child{color:var(--accent);font-weight:700;}
.mname{font-weight:600;font-size:13.5px;letter-spacing:-.01em;display:inline-flex;align-items:center;gap:8px;}
.mvend{display:inline-block;font-size:10.5px;color:var(--ink-3);font-family:ui-monospace,monospace;background:var(--bg);padding:1px 6px;border-radius:3px;border:1px solid var(--line);font-weight:400;}
.num{font-size:12.5px;}
.total{font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;font-weight:600;font-size:13.5px;color:var(--ink);}
.delta{display:inline-block;font-family:ui-monospace,monospace;font-size:10.5px;padding:1px 5px;border-radius:3px;margin-left:6px;}
.delta.pos{color:var(--pos);background:#f0fdfa;}
.delta.neg{color:var(--neg);background:#fef2f2;}
.bar{display:inline-flex;align-items:center;gap:8px;min-width:120px;justify-content:flex-end;}
.bartrack{width:60px;height:4px;background:var(--line);border-radius:2px;overflow:hidden;position:relative;}
.bartrack i{display:block;height:100%;background:var(--accent);}
.bartrack.e i{background:var(--ink-2);}
.bartrack.muted i{background:var(--ink-4);}
.btag{font-family:ui-monospace,monospace;font-size:9.5px;color:var(--ink-3);border:1px solid var(--line-2);border-radius:3px;padding:1px 5px;background:var(--bg);}
tr.base{background:#fafafa;}
tr.base .mname{font-weight:500;color:var(--ink-2);font-size:12.5px;}
tr.base td:first-child{color:var(--ink-4);}
tr.base .total{color:var(--ink-3);}
tr.passline td{height:0;padding:0;border-top:1px dashed var(--neg);border-bottom:0;position:relative;}
tr.passline td::after{content:attr(data-label);position:absolute;right:12px;top:-9px;background:var(--panel);padding:0 8px;
  font-family:ui-monospace,monospace;font-size:9.5px;letter-spacing:.08em;color:var(--neg);}
.plotwrap{position:sticky;top:66px;display:flex;flex-direction:column;gap:10px;}
.plotpanel{background:var(--panel);border:1px solid var(--line);padding:14px;}
.plotpanel .head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.plotpanel .head h3{font-size:12.5px;font-weight:600;}
.plotpanel .head .note{font-size:11px;color:var(--ink-3);}
.plotpanel svg{width:100%;height:auto;display:block;}
.axlab{font-family:ui-monospace,monospace;font-size:9.5px;fill:var(--ink-3);letter-spacing:.04em;}
.axtitle{font-family:ui-monospace,monospace;font-size:10px;fill:var(--ink-2);letter-spacing:.08em;text-transform:uppercase;}
.gridln{stroke:var(--line);stroke-width:1;}
.gridln.dash{stroke-dasharray:2 3;stroke:var(--line-2);}
.baseln{stroke:var(--neg);stroke-width:1.2;stroke-dasharray:4 3;}
.baslab{font-family:ui-monospace,monospace;font-size:9.5px;fill:var(--neg);letter-spacing:.04em;}
.dot{fill:var(--accent);stroke:#fff;stroke-width:1.5;cursor:pointer;transition:r .12s;}
.dot.sel{fill:var(--ink);}
.dot.lead{fill:var(--accent);}
.dot.below{fill:var(--ink-4);opacity:.6;}
.dotlab{font-family:system-ui,sans-serif;font-size:10px;fill:var(--ink-2);font-weight:500;pointer-events:none;}
.dotlab.sel{fill:var(--ink);font-weight:700;}
.dotlab.dim{fill:var(--ink-4);}
.plotlegend{margin-top:10px;padding-top:10px;border-top:1px solid var(--line);display:flex;gap:14px;font-size:11px;color:var(--ink-3);flex-wrap:wrap;}
.plotlegend span{display:inline-flex;align-items:center;gap:5px;}
.plotlegend .sw{width:8px;height:8px;border-radius:50%;background:var(--accent);}
.plotlegend .sw.below{background:var(--ink-4);opacity:.6;}
.detailcard{background:var(--panel);border:1px solid var(--line);padding:14px 16px;}
.detail h4{font-size:12.5px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;margin-bottom:2px;}
.detail .did{font-family:ui-monospace,monospace;font-size:11px;color:var(--ink-3);margin-bottom:12px;}
.detailgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;}
.drow{display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px dotted var(--line);}
.drow .k{color:var(--ink-3);}
.drow .v{font-family:ui-monospace,monospace;font-variant-numeric:tabular-nums;color:var(--ink);font-weight:500;}
.drow .v.pos{color:var(--pos);}
.drow .v.neg{color:var(--neg);}
.dsec{grid-column:span 2;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);padding-top:10px;margin-top:6px;border-top:1px solid var(--line);}
.dsec:first-of-type{padding-top:0;margin-top:0;border-top:0;}
.foot{margin-top:20px;padding:14px 0;font-size:11.5px;color:var(--ink-3);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;}
.foot a{color:var(--accent);text-decoration:none;}
.foot a:hover{text-decoration:underline;}
`.trim();

const JS = `
(function(){
  function select(id){
    document.querySelectorAll('[data-model].sel').forEach(function(el){el.classList.remove('sel');});
    document.querySelectorAll('[data-model="'+CSS.escape(id)+'"]').forEach(function(el){el.classList.add('sel');});
    document.querySelectorAll('[data-model-detail]').forEach(function(el){
      if (el.getAttribute('data-model-detail') === id) el.removeAttribute('hidden');
      else el.setAttribute('hidden','');
    });
  }
  document.querySelectorAll('[data-model]').forEach(function(el){
    el.addEventListener('click', function(){
      var id = el.getAttribute('data-model');
      if (id) select(id);
    });
  });
})();
`.trim();

export function renderReportHtml(
  scores: Scores,
  config: ReportConfigSnapshot,
  options: RenderHtmlOptions = {},
): RenderHtmlResult {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const sorted = sortModels(scores.models);
  const realModels = sorted.filter((m) => !m.model.startsWith('baseline/') && !m.model.startsWith('gold/'));
  const baselines = sorted.filter((m) => m.model.startsWith('baseline/') || m.model.startsWith('gold/'));
  const buyHold = findBuyHold(scores.models);
  const buyHoldJ = buyHold?.judgment ?? null;

  const scatterPoints: ScatterPoint[] = realModels
    .filter((m) => m.efficiency != null)
    .map((m, idx) => {
      const kind = classifyModel(m.model);
      return {
        id: m.model,
        vendor: kind.vendor,
        name: kind.name,
        judgment: m.judgment,
        efficiency: m.efficiency as number,
        lead: idx === 0,
      };
    });

  const runId = config.runId ?? scores.runId;
  const datasetVersion = config.datasetVersion ?? scores.datasetVersion;
  const modes = config.config?.modes ?? config.modes ?? [];
  const modeLabel = modes.length ? modes.map((m) => MODE_LABEL[m] ?? m).join(' · ') : '—';
  const repeat = config.config?.repeat;
  const weights = scores.weights;
  const beatenCount = buyHoldJ == null ? null : realModels.filter((m) => m.judgment > buyHoldJ).length;
  const beatenLabel =
    beatenCount != null
      ? `${beatenCount}/${realModels.length}`
      : `${realModels.length}`;

  const kvs = [
    ['DATASET', datasetVersion],
    ['MODES', modeLabel],
    ['REP', repeat != null ? `×${repeat}` : '—'],
    ['WEIGHTS', `J ${weights.judgment.toFixed(1)} / E ${weights.efficiency.toFixed(1)}`],
    ['UPDATED', generatedAt.slice(0, 10).replaceAll('-', '·')],
  ];

  const passLineRow =
    buyHold != null
      ? `<tr class="passline"><td colspan="10" data-label="BUY & HOLD 基线 · 判断分 ${fmtScore(buyHold.judgment)}"></td></tr>`
      : '';

  const initialSelected = realModels[0]?.model ?? sorted[0]?.model ?? null;
  const rows =
    realModels
      .map((m, i) =>
        renderLeaderboardRow(m, i + 1, false, m.model === initialSelected, buyHoldJ),
      )
      .join('') +
    passLineRow +
    baselines
      .map((m) => renderLeaderboardRow(m, 0, true, m.model === initialSelected, buyHoldJ))
      .join('');

  const details = sorted.map((m) => renderDetailCard(m, m.model === initialSelected)).join('');
  const scatterSvg = renderScatterSvg(scatterPoints, buyHoldJ, initialSelected);

  const body = `
<div class="top"><div class="inner">
  <div class="brand">Kansoku <span>/ Trading Benchmark</span></div>
  <nav class="nav">
    <a href="#" class="on">总榜</a>
    <a href="#" title="即将上线">分层</a>
    <a href="#" title="即将上线">题目难度</a>
    <a href="#" title="即将上线">同质化</a>
    <a href="#" title="即将上线">评分口径</a>
  </nav>
  <div class="r"><span>run <kbd>${esc(runId)}</kbd></span></div>
</div></div>

<div class="page">
  <div class="mstrip">
    <h1>模型交易判断力总榜</h1>
    <span class="sub">${realModels.length} 个模型 · ${baselines.length} 条基线 · ${scores.cells.length} cells${
      beatenCount != null ? ` · <b>${beatenLabel}</b> 判断分跑赢买入持有` : ''
    }</span>
    <div class="kvs mono">
      ${kvs.map(([k, v]) => `<span>${esc(k)}<b>${esc(String(v))}</b></span>`).join('')}
    </div>
  </div>

  <div class="shell">
  <div class="fbar">
    <div class="fg"><label>模式</label>
      <button class="pill on">全部</button>
      <button class="pill">盲盘</button>
      <button class="pill">实盘</button>
    </div>
    <div class="fg"><label>基线</label>
      <button class="pill on">显示</button>
      <button class="pill">隐藏</button>
    </div>
    <div class="r"><input class="search" placeholder="搜索模型…" disabled /></div>
  </div>

  <div class="grid">
    <div class="panel">
      <div class="panelhead">
        <h3>总榜</h3>
        <span class="desc">按总分排序 · 点行下钻画像</span>
        <span class="r">n = ${sorted.length}</span>
      </div>
      <div class="tblwrap">
      <table class="tbl">
        <thead><tr>
          <th>#</th><th>模型</th>
          <th class="sorted">总分</th><th>判断分</th><th>效率分</th>
          <th>胜率</th><th>观望率</th>
          <th>成本</th><th>耗时</th><th>违规</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
    </div>

    <div class="plotwrap">
      <div class="plotpanel">
        <div class="head"><h3>判断分 vs 效率分</h3><span class="note">点选联动</span></div>
        ${scatterSvg}
        <div class="plotlegend">
          <span><span class="sw"></span>模型（accent = 榜首）</span>
          ${buyHoldJ != null ? '<span><span class="sw below"></span>低于买入持有基线</span>' : ''}
        </div>
      </div>
      <div class="detailcard">${details}</div>
    </div>
  </div>
  </div>

  <div class="foot">
    <span>Kansoku Trading Benchmark · <span class="mono">${esc(String(datasetVersion))}</span> · run <span class="mono">${esc(runId)}</span></span>
    <span>generated <span class="mono">${esc(generatedAt)}</span></span>
  </div>
</div>
`;

  const html = `<!doctype html>
<html lang="zh"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kansoku Trading Benchmark · ${esc(runId)}</title>
<style>${CSS}</style>
</head><body>${body}
<script>${JS}</script>
</body></html>
`;
  return { html };
}
