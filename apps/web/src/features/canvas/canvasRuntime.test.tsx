// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCanvasComponent } from './canvasRuntime';

afterEach(() => {
  cleanup();
});

const valid = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Runtime demo" caption="test"><Text>hello canvas</Text></Canvas>;
}
`;

describe('loadCanvasComponent', () => {
  it('renders a compiled canvas', () => {
    const result = loadCanvasComponent(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    render(<result.Component />);
    expect(screen.getByRole('heading', { name: 'Runtime demo' })).toBeTruthy();
    expect(screen.getByText('hello canvas')).toBeTruthy();
  });

  it('injects data files a canvas imports', () => {
    const source = `import { Canvas, Text } from '@kansoku/canvas';
import bars from './bars.json';
export default function App() {
  return <Canvas title="Data demo"><Text>{bars.symbol}</Text></Canvas>;
}
`;
    const result = loadCanvasComponent(source, { bars: { symbol: 'MU.US' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    render(<result.Component />);
    expect(screen.getByText('MU.US')).toBeTruthy();
  });

  it('returns static-check issues without throwing', () => {
    const result = loadCanvasComponent('export function App() { return null; }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => /export default/i.test(issue))).toBe(true);
  });

  it('renders the names a model actually writes: Badge, Heading, Metric, Link, and array Table', () => {
    const source = `import { Canvas, Stack, Row, Card, Heading, Text, Metric, Link, Table, Badge } from "@kansoku/canvas";
export default function EventCanvas() {
  return (
    <Canvas title="Minutes of the FOMC">
      <Stack gap="lg">
        <Card>
          <Row>
            <Badge tone="blue">OFFICIAL</Badge>
            <Heading level={2}>FOMC minutes body</Heading>
            <Text muted>Published 19 Aug 2026</Text>
            <Link href="https://federalreserve.gov/minutes">Open primary source</Link>
          </Row>
        </Card>
        <Metric label="Instrument" value="SPY.US" />
        <Table
          columns={["Time", "Close"]}
          rows={[["18:20", "770.09"], ["19:20", "770.02"]]}
        />
      </Stack>
    </Canvas>
  );
}
`;
    const result = loadCanvasComponent(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    render(<result.Component />);
    expect(screen.getByRole('heading', { name: 'Minutes of the FOMC' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'FOMC minutes body' })).toBeTruthy();
    expect(screen.getByText('OFFICIAL')).toBeTruthy();
    expect(screen.getByText('Published 19 Aug 2026')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open primary source' }).getAttribute('href')).toBe(
      'https://federalreserve.gov/minutes',
    );
    expect(screen.getByText('SPY.US')).toBeTruthy();
    expect(screen.getByText('770.09')).toBeTruthy();
  });
});
