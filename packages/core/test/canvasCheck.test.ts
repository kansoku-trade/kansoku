import { describe, expect, it } from 'vitest';
import { CANVAS_MAX_SOURCE_BYTES, checkCanvasSource } from '../src/canvas/check.js';

const valid = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
`;

describe('checkCanvasSource', () => {
  it('accepts a default-exported canvas that only imports @kansoku/canvas', () => {
    expect(checkCanvasSource(valid)).toEqual([]);
  });

  it('rejects source without a default export', () => {
    const issues = checkCanvasSource(`import { Text } from '@kansoku/canvas';
export function App() { return <Text>x</Text>; }
`);
    expect(issues.some((issue) => /export default/i.test(issue))).toBe(true);
  });

  it('rejects a second default export', () => {
    const issues = checkCanvasSource(`${valid}\nexport default function Other() { return null; }\n`);
    expect(issues.some((issue) => /only one|exactly one/i.test(issue))).toBe(true);
  });

  it('rejects imports that are not @kansoku/canvas', () => {
    const issues = checkCanvasSource(`import x from 'react';
${valid}`);
    expect(issues.some((issue) => /@kansoku\/canvas/.test(issue))).toBe(true);
  });

  it('rejects relative imports', () => {
    const issues = checkCanvasSource(`import x from './other';
${valid}`);
    expect(issues.some((issue) => /relative/i.test(issue))).toBe(true);
  });

  it('rejects node: imports', () => {
    const issues = checkCanvasSource(`import fs from 'node:fs';
${valid}`);
    expect(issues.some((issue) => /node:/.test(issue))).toBe(true);
  });

  it('rejects fetch, timers, and host globals', () => {
    for (const banned of [
      'fetch(',
      'XMLHttpRequest',
      'import(',
      'require(',
      'setInterval',
      'setTimeout',
      'document.',
      'window.',
    ]) {
      const issues = checkCanvasSource(`${valid}\nvoid ${banned}\n`);
      expect(issues.length, banned).toBeGreaterThan(0);
    }
  });

  it('rejects source over 64 KB', () => {
    const issues = checkCanvasSource(`${valid}\n${'x'.repeat(CANVAS_MAX_SOURCE_BYTES)}\n`);
    expect(issues.some((issue) => /64/.test(issue))).toBe(true);
  });
});
