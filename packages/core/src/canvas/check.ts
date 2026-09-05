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

const CHART_TAGS = ['LineChart', 'BarChart', 'AreaChart', 'PieChart', 'CandleChart'] as const;
const MAX_GRID_COLUMNS = 4;
const MAX_CHARTS = 6;

/**
 * Reads the attribute region of a JSX opening tag. A regex cannot do this: props like
 * `markers={[{ time: 1, price: 2 }]}` contain `>` and `}` inside nested braces and strings.
 */
function openingTags(source: string, tag: string): string[] {
  const found: string[] = [];
  const opener = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  for (const match of source.matchAll(opener)) {
    let depth = 0;
    let quote: string | null = null;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== '\\') quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    found.push(source.slice(match.index + match[0].length, i));
  }
  return found;
}

function hasProp(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*=`).test(attrs);
}

/**
 * Layout rules from the canvas skill, enforced at save time only. Deliberately NOT part of
 * `checkCanvasSource`: that one also gates `compileCanvasSource`, so tightening it there
 * would stop already-saved canvases from rendering.
 */
export function reviewCanvasStructure(source: string): string[] {
  const issues: string[] = [];

  const roots = openingTags(source, 'Canvas');
  if (roots.length === 0) {
    issues.push('Canvas must be the root component');
  }
  for (const attrs of roots) {
    if (!hasProp(attrs, 'title')) issues.push('Canvas needs a title');
    if (!hasProp(attrs, 'caption')) {
      issues.push('Canvas needs a caption: source · data basis · cutoff time');
    }
  }

  let charts = 0;
  for (const tag of CHART_TAGS) {
    const tags = openingTags(source, tag);
    charts += tags.length;
    for (const attrs of tags) {
      if (!hasProp(attrs, 'title')) issues.push(`${tag} needs a title`);
    }
  }
  if (charts > MAX_CHARTS) {
    issues.push(`at most ${MAX_CHARTS} charts per canvas, found ${charts} — split it in two`);
  }

  for (const attrs of openingTags(source, 'Grid')) {
    const columns = attrs.match(/\bcolumns\s*=\s*\{\s*(\d+)\s*\}/);
    if (columns && Number(columns[1]) > MAX_GRID_COLUMNS) {
      issues.push(`Grid columns must be <= ${MAX_GRID_COLUMNS}, found ${columns[1]}`);
    }
  }

  if (!/<(?:Callout|Text)(?=[\s/>])/.test(source)) {
    issues.push('no Callout or Text: a canvas states a conclusion, it is not a pile of numbers');
  }

  if (/<(input|textarea)\b/i.test(source)) {
    issues.push('use Param / Toggle / Select, not native input');
  }

  for (const attrs of openingTags(source, 'Param')) {
    const hasMin = hasProp(attrs, 'min');
    const hasMax = hasProp(attrs, 'max');
    if (hasMin !== hasMax) {
      issues.push('Param min and max must both be set, or neither');
    }
  }

  return issues;
}
