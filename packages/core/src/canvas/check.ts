export const CANVAS_MAX_SOURCE_BYTES = 65536;

const IMPORT_RE =
  /(?:^|[\n;])\s*import\s+(?:type\s+)?(?:[^'"\n]+from\s+)?['"]([^'"]+)['"]/g;

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

  return issues;
}
