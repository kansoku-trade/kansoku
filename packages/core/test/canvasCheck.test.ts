import { describe, expect, it } from 'vitest';
import {
  CANVAS_MAX_SOURCE_BYTES,
  canvasDataImports,
  checkCanvasSource,
  reviewCanvasStructure,
} from '../src/canvas/check.js';

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

  it('allows a relative import of ./<name>.json', () => {
    const issues = checkCanvasSource(`import bars from './bars.json';\n${valid}`);
    expect(issues).toEqual([]);
  });

  it('rejects a relative json import that escapes the canvas directory', () => {
    const issues = checkCanvasSource(`import bars from '../bars.json';\n${valid}`);
    expect(issues.some((issue) => /relative/i.test(issue))).toBe(true);
  });

  it('rejects a relative import that is not json', () => {
    const issues = checkCanvasSource(`import bars from './bars.ts';\n${valid}`);
    expect(issues.some((issue) => /relative/i.test(issue))).toBe(true);
  });

  it('rejects a data file name with uppercase letters', () => {
    const issues = checkCanvasSource(`import bars from './Bars.json';\n${valid}`);
    expect(issues.some((issue) => /relative/i.test(issue))).toBe(true);
  });

  it('rejects a locally declared useQuote or useCandles', () => {
    for (const decl of [
      'function useQuote() { return null; }',
      'function useCandles() { return null; }',
      'const useQuote = () => null;',
      'const useCandles = () => null;',
    ]) {
      const issues = checkCanvasSource(`${valid}\n${decl}\n`);
      expect(issues, decl).toContain('useQuote / useCandles must come from @kansoku/canvas');
    }
  });

  it('allows up to 6 live subscriptions and rejects more', () => {
    const six = `import { Canvas, Text, useCandles, useQuote } from '@kansoku/canvas';
export default function App() {
  useCandles('MU.US'); useCandles('NVDA.US'); useCandles('TSM.US');
  useQuote('MU.US'); useQuote('NVDA.US'); useQuote('TSM.US');
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
`;
    expect(checkCanvasSource(six)).toEqual([]);

    const seven = six.replace("useQuote('TSM.US');", "useQuote('TSM.US'); useQuote('AAPL.US');");
    expect(checkCanvasSource(seven)).toContain('at most 6 live subscriptions per canvas');
  });
});

describe('canvasDataImports', () => {
  it('extracts data file names from ./<name>.json imports', () => {
    expect(
      canvasDataImports(`import bars from './bars.json';\nimport more from './more-data.json';\n`),
    ).toEqual(['bars', 'more-data']);
  });

  it('ignores non-json and non-relative imports', () => {
    expect(
      canvasDataImports(`import { Canvas } from '@kansoku/canvas';\nimport x from './x.ts';\n`),
    ).toEqual([]);
  });
});

describe('reviewCanvasStructure', () => {
  const wrap = (body: string, root = '<Canvas title="T" caption="C">') =>
    `import { Canvas } from '@kansoku/canvas';\nexport default function App() {\n  return ${root}${body}</Canvas>;\n}\n`;

  it('accepts a canvas with a titled root, a conclusion, and charts inside the limits', () => {
    expect(
      reviewCanvasStructure(
        wrap('<Callout>结论</Callout><Grid columns={4}><Stat /></Grid><LineChart title="资金流" data={[]} />'),
      ),
    ).toEqual([]);
  });

  it('demands a title and a caption on the root', () => {
    expect(reviewCanvasStructure(wrap('<Text>x</Text>', '<Canvas>'))).toEqual([
      'Canvas needs a title',
      'Canvas needs a caption: source · data basis · cutoff time',
    ]);
  });

  it('demands a title on every chart', () => {
    expect(reviewCanvasStructure(wrap('<Text>x</Text><BarChart data={[]} />'))).toEqual([
      'BarChart needs a title',
    ]);
  });

  it('caps Grid columns and chart count', () => {
    const charts = Array.from({ length: 7 }, (_, i) => `<LineChart title="c${i}" data={[]} />`).join('');
    const issues = reviewCanvasStructure(wrap(`<Text>x</Text><Grid columns={6}></Grid>${charts}`));
    expect(issues).toContain('Grid columns must be <= 4, found 6');
    expect(issues).toContain('at most 6 charts per canvas, found 7 — split it in two');
  });

  it('rejects a canvas that states no conclusion', () => {
    expect(reviewCanvasStructure(wrap('<Stat label="a" value="1" />'))).toEqual([
      'no Callout or Text: a canvas states a conclusion, it is not a pile of numbers',
    ]);
  });

  it('reads props past nested braces that contain > and }', () => {
    const source = wrap(
      '<Text>x</Text><CandleChart bars={[{ time: 1, open: 2 }]} markers={[{ bias: "bullish" }]} title="MU 5m" />',
    );
    expect(reviewCanvasStructure(source)).toEqual([]);
  });
});
