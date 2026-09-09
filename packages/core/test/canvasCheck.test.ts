import { describe, expect, it } from 'vitest';
import {
  CANVAS_COMPONENT_NAMES,
  canvasComponentNames,
} from '@kansoku/canvas/names';
import {
  CANVAS_MAX_SOURCE_BYTES,
  canvasDataImports,
  checkCanvasSource,
  reviewCanvasBindings,
  reviewCanvasStructure,
} from '../src/canvas/check.js';
import { parseCanvasTsx, sdkComponentProps } from '../src/canvas/canvasAst.js';

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

  it('rejects a named import of a data file', () => {
    const issues = checkCanvasSource(`import { bars } from './bars.json';\n${valid}`);
    expect(issues).toContain("data imports must be default imports: import bars from './bars.json'");
  });

  it('rejects a namespace import of a data file', () => {
    const issues = checkCanvasSource(`import * as bars from './bars.json';\n${valid}`);
    expect(issues).toContain("data imports must be default imports: import bars from './bars.json'");
  });

  it('rejects a side-effect import of a data file', () => {
    const issues = checkCanvasSource(`import './bars.json';\n${valid}`);
    expect(issues).toContain("data imports must be default imports: import bars from './bars.json'");
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

  it('rejects native input and textarea', () => {
    expect(reviewCanvasStructure(wrap('<Text>x</Text><input value={1} />'))).toContain(
      'use Param / Toggle / Select, not native input',
    );
    expect(reviewCanvasStructure(wrap('<Text>x</Text><textarea></textarea>'))).toContain(
      'use Param / Toggle / Select, not native input',
    );
    expect(reviewCanvasStructure(wrap('<Text>x</Text><Input value={1} />'))).toContain(
      'use Param / Toggle / Select, not native input',
    );
  });

  it('rejects Param with only min or only max', () => {
    expect(
      reviewCanvasStructure(wrap('<Text>x</Text><Param label="止损" value={58} min={50} />')),
    ).toContain('Param min and max must both be set, or neither');
    expect(
      reviewCanvasStructure(wrap('<Text>x</Text><Param label="止损" value={58} max={70} />')),
    ).toContain('Param min and max must both be set, or neither');
  });

  it('allows Param with both ends of the range, or with neither', () => {
    expect(
      reviewCanvasStructure(
        wrap('<Text>x</Text><Param label="止损" value={58} min={50} max={70} />'),
      ),
    ).toEqual([]);
    expect(reviewCanvasStructure(wrap('<Text>x</Text><Param label="股数" value={100} />'))).toEqual(
      [],
    );
  });
});

describe('reviewCanvasBindings', () => {
  const canvas = (imports: string, body: string) =>
    `import { Canvas, Text, ${imports} } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="T" caption="C"><Text>ok</Text>${body}</Canvas>;
}
`;

  it('rejects an unknown SDK import, component, and prop', () => {
    const issues = reviewCanvasBindings(`import { Canvas, Text, Heatmap } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="T" caption="C"><Text>ok</Text><Heatmap /><Stat label="a" value="1" color="red" /></Canvas>;
}
`);
    expect(issues).toContain('unknown export from @kansoku/canvas: Heatmap');
    expect(issues).toContain('unknown component <Heatmap>');
    expect(issues).toContain('unknown component <Stat>');
  });

  it('rejects a prop the component does not accept', () => {
    const issues = reviewCanvasBindings(canvas('Stat', '<Stat label="a" value="1" color="red" />'));
    expect(issues.some((issue) => /Stat does not accept prop "color"/.test(issue))).toBe(true);
  });

  it('accepts boolean shorthand props', () => {
    expect(reviewCanvasBindings(canvas('BarChart', '<BarChart title="净流入" data={[]} signed />'))).toEqual(
      [],
    );
  });

  it('rejects namespace and default imports from the sdk', () => {
    expect(
      reviewCanvasBindings(`import * as sdk from '@kansoku/canvas';
export default function App() { return null; }
`),
    ).toContain('import * from @kansoku/canvas is not allowed; use named imports');
    expect(
      reviewCanvasBindings(`import Canvas from '@kansoku/canvas';
export default function App() { return null; }
`),
    ).toContain('default import from @kansoku/canvas is not allowed; use named imports');
  });

  it('checks props against the exported name after an import alias', () => {
    const issues = reviewCanvasBindings(`import { Canvas, Stat as MetricCard, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="T" caption="C"><Text>ok</Text><MetricCard label="a" value="1" color="red" /></Canvas>;
}
`);
    expect(issues.some((issue) => /Stat does not accept prop "color"/.test(issue))).toBe(true);
    expect(issues.some((issue) => /MetricCard/.test(issue))).toBe(false);
  });

  it('allows key and Box intersection props from the skill declarations', () => {
    expect(
      reviewCanvasBindings(`import { Canvas, Row, Text } from '@kansoku/canvas';
export default function App() {
  return (
    <Canvas title="T" caption="C" key="root">
      <Text>ok</Text>
      <Row gap="sm" justify="between" style={{ marginTop: 8 }}>
        <Text muted>x</Text>
      </Row>
    </Canvas>
  );
}
`),
    ).toEqual([]);
  });

  it('ignores type-only imports', () => {
    expect(
      reviewCanvasBindings(`import { Canvas, Text } from '@kansoku/canvas';
import type { Heatmap } from '@kansoku/canvas';
import { type Stat } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="T" caption="C"><Text>ok</Text></Canvas>;
}
`),
    ).toEqual([]);
  });

  it('reads JSX props that sit inside nested object literals', () => {
    expect(
      reviewCanvasBindings(
        canvas(
          'CandleChart',
          '<CandleChart title="MU" bars={[{ time: 1, open: 2, high: 3, low: 1, close: 2 }]} markers={[{ time: 1, price: 2, bias: "bullish" }]} />',
        ),
      ),
    ).toEqual([]);
  });

  it('does not treat a parse failure as an unknown binding', () => {
    expect(reviewCanvasBindings('export default function App() { return <Canvas')).toEqual([]);
  });
});

describe('canvasAst', () => {
  it('returns a syntax error instead of throwing', () => {
    const parsed = parseCanvasTsx('export default function App() { return <Canvas');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  it('extracts a props entry for every exported component from the skill d.ts', () => {
    const props = sdkComponentProps();
    expect(Object.keys(props).sort()).toEqual(
      canvasComponentNames(
        Object.keys(CANVAS_COMPONENT_NAMES) as (keyof typeof CANVAS_COMPONENT_NAMES)[],
      ).sort(),
    );
    expect(props.Stat).toEqual(expect.arrayContaining(['label', 'value', 'delta', 'note', 'tone']));
    expect(props.Row).toEqual(expect.arrayContaining(['children', 'style', 'gap', 'justify', 'align']));
    expect(props.CandleChart).toEqual(
      expect.arrayContaining(['title', 'bars', 'markers', 'sessions']),
    );
    expect(props.Divider).toEqual([]);
  });
});
