import { checkCanvasSource } from './check.js';

const SDK = '@kansoku/canvas';
const INJECTED = '__kansoku_canvas__';
const INJECTED_DATA = '__kansoku_canvas_data__';

// sucrase is ~900KB of parser tables; loading it on first compile keeps it
// off the kernel boot path.
export async function compileCanvasSource(
  source: string,
): Promise<{ ok: true; code: string } | { ok: false; issues: string[] }> {
  const issues = checkCanvasSource(source);
  if (issues.length) return { ok: false, issues };

  const rewritten = source.replaceAll(SDK, INJECTED);
  try {
    const { transform } = await import('sucrase');
    const { code } = transform(rewritten, {
      transforms: ['typescript', 'jsx'],
      production: true,
    });
    return { ok: true, code: toFactoryBody(code) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, issues: [message] };
  }
}

function toFactoryBody(code: string): string {
  let body = code.replace(
    /import\s+([\s\S]*?)\s+from\s+['"]__kansoku_canvas__['"];?/g,
    (_match, spec: string) => `const ${spec.trim()} = ${INJECTED};`,
  );
  body = body.replace(
    /import\s+(\w+)\s+from\s+['"]\.\/([a-z0-9-]+)\.json['"];?/g,
    (_match, name: string, dataName: string) =>
      `const ${name} = ${INJECTED_DATA}[${JSON.stringify(dataName)}];`,
  );
  const named = body.match(/export\s+default\s+function\s+(\w+)/);
  if (named) {
    body = body.replace(/export\s+default\s+function\s+/, 'function ');
    return `${body}\nreturn ${named[1]};`;
  }
  return body.replace(/export\s+default\s+/, 'return ');
}
