import { transform } from 'sucrase';
import { checkCanvasSource } from './check.js';

const SDK = '@kansoku/canvas';
const INJECTED = '__kansoku_canvas__';

export function compileCanvasSource(
  source: string,
): { ok: true; code: string } | { ok: false; issues: string[] } {
  const issues = checkCanvasSource(source);
  if (issues.length) return { ok: false, issues };

  const rewritten = source.replaceAll(SDK, INJECTED);
  try {
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

export function instantiateCanvas(
  code: string,
  sdk: Record<string, unknown>,
  react: unknown,
): unknown {
  const factory = new Function(INJECTED, 'React', code);
  return factory(sdk, react);
}

function toFactoryBody(code: string): string {
  let body = code.replace(
    /import\s+([\s\S]*?)\s+from\s+['"]__kansoku_canvas__['"];?/,
    (_match, spec: string) => `const ${spec.trim()} = ${INJECTED};`,
  );
  const named = body.match(/export\s+default\s+function\s+(\w+)/);
  if (named) {
    body = body.replace(/export\s+default\s+function\s+/, 'function ');
    return `${body}\nreturn ${named[1]};`;
  }
  return body.replace(/export\s+default\s+/, 'return ');
}
