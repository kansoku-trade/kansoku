import { canvasExportNames } from '@kansoku/canvas/names';
import {
  canvasImportBindings,
  jsxElements,
  parseCanvasTsx,
  sdkComponentProps,
} from './canvasAst.js';

export const CANVAS_MAX_SOURCE_BYTES = 65536;
export const CANVAS_MAX_LIVE_SUBSCRIPTIONS = 6;

const IMPORT_RE =
  /(?:^|[\n;])\s*import\s+(?:type\s+)?(?:[^'"\n]+from\s+)?['"]([^'"]+)['"]/g;

const DATA_IMPORT_RE = /^\.\/([a-z0-9-]+)\.json$/;
const DEFAULT_IMPORT_CLAUSE_RE = /^[\s;]*import\s+\w+\s+from\s+['"]/;

const BANNED = [
  'fetch(',
  'XMLHttpRequest',
  'import(',
  'require(',
  'setInterval',
  'setTimeout',
  'document.',
  'window.',
] as const;

export function canvasDataImports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const name = DATA_IMPORT_RE.exec(match[1])?.[1];
    if (name && DEFAULT_IMPORT_CLAUSE_RE.test(match[0])) names.push(name);
  }
  return names;
}

export function checkCanvasSource(source: string): string[] {
  const issues: string[] = [];

  if (source.length > CANVAS_MAX_SOURCE_BYTES) {
    issues.push(`source exceeds 64 KB (${source.length} bytes)`);
  }

  const defaults = source.match(/\bexport\s+default\b/g) ?? [];
  if (defaults.length !== 1) {
    issues.push('must have exactly one export default');
  }

  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1];
    if (spec === '@kansoku/canvas') continue;
    if (spec.startsWith('.') || spec.startsWith('/')) {
      if (DATA_IMPORT_RE.test(spec)) {
        if (DEFAULT_IMPORT_CLAUSE_RE.test(match[0])) continue;
        issues.push(`data imports must be default imports: import bars from '${spec}'`);
        continue;
      }
      issues.push(`relative imports are not allowed: ${spec}`);
      continue;
    }
    if (spec.startsWith('node:')) {
      issues.push(`node: imports are not allowed: ${spec}`);
      continue;
    }
    issues.push(`import must be from @kansoku/canvas, not ${spec}`);
  }

  for (const token of BANNED) {
    if (source.includes(token)) {
      issues.push(`forbidden: ${token}`);
    }
  }

  if (/\b(?:function|const)\s+(?:useQuote|useCandles)\b/.test(source)) {
    issues.push('useQuote / useCandles must come from @kansoku/canvas');
  }

  const liveSubscriptions =
    (source.match(/\buseCandles\(/g)?.length ?? 0) + (source.match(/\buseQuote\(/g)?.length ?? 0);
  if (liveSubscriptions > CANVAS_MAX_LIVE_SUBSCRIPTIONS) {
    issues.push(`at most ${CANVAS_MAX_LIVE_SUBSCRIPTIONS} live subscriptions per canvas`);
  }

  return issues;
}

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
