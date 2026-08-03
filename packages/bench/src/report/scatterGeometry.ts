import type { LeaderboardScatterDot, LeaderboardScatterView } from '@kansoku/bench-report-ui/types';

export interface ScatterInputPoint {
  id: string;
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
}

export function niceStep(range: number): number {
  const raw = range / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const rel = raw / pow;
  const step = rel >= 5 ? 10 : rel >= 2 ? 5 : rel >= 1 ? 2 : 1;
  return step * pow;
}

export function niceTicks(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
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

function projectPoint(x: number, y: number, geom: ScatterGeometry): { cx: number; cy: number } {
  const { width, height, padL, padR, padT, padB, xMin, xMax, yMin, yMax } = geom;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const cx = padL + ((x - xMin) / (xMax - xMin || 1)) * innerW;
  const cy = padT + (1 - (y - yMin) / (yMax - yMin || 1)) * innerH;
  return { cx, cy };
}

function buildScatterGeometry(
  points: ScatterInputPoint[],
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
  const jRange = niceTicks(
    jVals.length ? Math.min(...jVals) : 0,
    jVals.length ? Math.max(...jVals) : 1,
  );
  const eRange = niceTicks(
    eVals.length ? Math.min(...eVals) : 0,
    eVals.length ? Math.max(...eVals) : 1,
  );
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
  };
  if (baseline != null) {
    geom.baselineY = projectPoint(geom.xMin, baseline, geom).cy;
  }
  return geom;
}

function fmtNum(v: number, digits = 0): string {
  return v.toFixed(digits);
}

function fmtScore(v: number): string {
  return (v * 100).toFixed(1);
}

export function buildScatterView(
  points: ScatterInputPoint[],
  baseline: number | null,
  baselineLabel: string,
): LeaderboardScatterView {
  const geom = buildScatterGeometry(points, baseline);
  const { width, height, padL, padR, padT, padB, xMin, yMin } = geom;
  const innerRight = width - padR;
  const innerBottom = height - padB;

  const yTicks = geom.yTicks.map((v) => ({
    cy: projectPoint(xMin, v, geom).cy,
    label: fmtNum(v * 100, 0),
  }));
  const xTicks = geom.xTicks.map((v) => ({
    cx: projectPoint(v, yMin, geom).cx,
    label: fmtNum(v * 100, 0),
  }));

  const dots: LeaderboardScatterDot[] = points.map((p) => {
    const { cx, cy } = projectPoint(p.efficiency, p.judgment, geom);
    const below = baseline != null && p.judgment < baseline;
    const anchor: 'start' | 'end' = cx > (padL + innerRight) / 2 ? 'end' : 'start';
    return {
      id: p.id,
      name: p.name,
      cx,
      cy,
      r: p.lead ? 7 : 6,
      lead: p.lead,
      below,
      labelX: anchor === 'end' ? cx - 9 : cx + 9,
      labelY: cy - 8,
      anchor,
    };
  });

  return {
    width,
    height,
    padL,
    padT,
    innerRight,
    innerBottom,
    xTicks,
    yTicks,
    baseline:
      geom.baselineY != null && baseline != null
        ? { y: geom.baselineY, label: `${baselineLabel} · ${fmtScore(baseline)}` }
        : null,
    dots,
  };
}
