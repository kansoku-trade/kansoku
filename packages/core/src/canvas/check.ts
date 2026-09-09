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
