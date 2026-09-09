import { canvasExportNames } from '@kansoku/canvas/names';
import {
  canvasImportBindings,
  jsxElements,
  parseCanvasTsx,
  sdkComponentProps,
} from './canvasAst.js';

const CHART_TAGS = new Set(['LineChart', 'BarChart', 'AreaChart', 'PieChart', 'CandleChart']);
const MAX_GRID_COLUMNS = 4;
const MAX_CHARTS = 6;
const ALWAYS_ALLOWED_PROPS = new Set(['key']);

/**
 * Layout rules from the canvas skill, enforced at save time only. Deliberately NOT part of
 * `checkCanvasSource`: that one also gates `compileCanvasSource`, so tightening it there
 * would stop already-saved canvases from rendering.
 */
export function reviewCanvasStructure(source: string): string[] {
  const parsed = parseCanvasTsx(source);
  if (!parsed.ok) return [parsed.error];
  const { locals } = canvasImportBindings(parsed.ast);
  const elements = jsxElements(parsed.ast).map((element) => ({
    ...element,
    exported: locals.get(element.local) ?? element.local,
  }));
  const issues: string[] = [];

  const roots = elements.filter((element) => element.exported === 'Canvas');
  if (roots.length === 0) issues.push('Canvas must be the root component');
  for (const root of roots) {
    if (!root.props.includes('title')) issues.push('Canvas needs a title');
    if (!root.props.includes('caption')) {
      issues.push('Canvas needs a caption: source · data basis · cutoff time');
    }
  }

  const charts = elements.filter((element) => CHART_TAGS.has(element.exported));
  for (const chart of charts) {
    if (!chart.props.includes('title')) issues.push(`${chart.exported} needs a title`);
  }
  if (charts.length > MAX_CHARTS) {
    issues.push(`at most ${MAX_CHARTS} charts per canvas, found ${charts.length} — split it in two`);
  }

  for (const grid of elements.filter((element) => element.exported === 'Grid')) {
    const columns = grid.values.columns;
    if (typeof columns === 'number' && columns > MAX_GRID_COLUMNS) {
      issues.push(`Grid columns must be <= ${MAX_GRID_COLUMNS}, found ${columns}`);
    }
  }

  if (!elements.some((element) => element.exported === 'Callout' || element.exported === 'Text')) {
    issues.push('no Callout or Text: a canvas states a conclusion, it is not a pile of numbers');
  }

  if (/<(input|textarea)\b/i.test(source)) {
    issues.push('use Param / Toggle / Select, not native input');
  }

  for (const param of elements.filter((element) => element.exported === 'Param')) {
    if (param.props.includes('min') !== param.props.includes('max')) {
      issues.push('Param min and max must both be set, or neither');
    }
  }

  return issues;
}

/**
 * Unknown SDK exports, JSX tags, and invented props. Save-time only — same reason as
 * `reviewCanvasStructure`: already-saved canvases must still compile.
 */
export function reviewCanvasBindings(source: string): string[] {
  const parsed = parseCanvasTsx(source);
  if (!parsed.ok) return [];
  const allowedExports = new Set(canvasExportNames());
  const allowedProps = sdkComponentProps();
  const { issues, locals } = canvasImportBindings(parsed.ast);
  for (const exported of new Set(locals.values())) {
    if (!allowedExports.has(exported)) {
      issues.push(`unknown export from @kansoku/canvas: ${exported}`);
    }
  }

  const seen = new Set<string>();
  for (const element of jsxElements(parsed.ast)) {
    if (seen.has(element.local)) continue;
    seen.add(element.local);
    const exported = locals.get(element.local);
    if (!exported || !allowedExports.has(exported)) {
      issues.push(`unknown component <${element.local}>`);
      continue;
    }
    const allowed = allowedProps[exported];
    if (!allowed) continue;
    const allow = new Set([...allowed, ...ALWAYS_ALLOWED_PROPS]);
    for (const prop of element.props) {
      if (allow.has(prop)) continue;
      issues.push(
        `${exported} does not accept prop "${prop}" (has: ${allowed.join(', ') || 'none'})`,
      );
    }
  }
  return issues;
}
