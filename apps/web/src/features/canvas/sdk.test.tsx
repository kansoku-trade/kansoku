// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Canvas, Card, Grid, Section, Stat, Table, Text } from '@kansoku/canvas';

afterEach(() => {
  cleanup();
});

describe('@kansoku/canvas', () => {
  it('renders a titled canvas with caption, stats, and a table', () => {
    render(
      <Canvas title="MU 多周期" caption="Longbridge · 15m">
        <Section title="关键读数">
          <Grid columns={2}>
            <Stat label="最新价" value="61.20" delta="+1.4%" tone="up" />
            <Stat label="盈亏比" value="0.8 : 1" tone="down" />
          </Grid>
        </Section>
        <Card>
          <Table
            columns={[
              { key: 'sym', header: '标的' },
              { key: 'chg', header: '涨跌', align: 'right' },
            ]}
            rows={[
              { sym: 'MU', chg: '+1.4%' },
              { sym: 'WDC', chg: '-0.9%' },
            ]}
          />
        </Card>
        <Text>反弹到位再动</Text>
      </Canvas>,
    );

    expect(screen.getByRole('heading', { name: 'MU 多周期' })).toBeTruthy();
    expect(screen.getByText('Longbridge · 15m')).toBeTruthy();
    expect(screen.getByText('关键读数')).toBeTruthy();
    expect(screen.getByText('61.20')).toBeTruthy();
    expect(screen.getAllByText('+1.4%').length).toBeGreaterThan(0);
    expect(screen.getByText('标的')).toBeTruthy();
    expect(screen.getByText('WDC')).toBeTruthy();
    expect(screen.getByText('反弹到位再动')).toBeTruthy();
  });
});
