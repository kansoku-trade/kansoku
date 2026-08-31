import {
  Callout,
  Canvas,
  Compare,
  Coverage,
  Grid,
  Scenarios,
  Section,
  Source,
  Stat,
} from '@kansoku/canvas';

const ROWS = [
  { symbol: 'MU', label: '个股', values: { close: -2.4 }, trend: [58.4, 59.2, 61.2] },
  { symbol: 'SMH', label: '板块', values: { close: -0.8 }, trend: [551, 552, 553] },
];

const METRICS = [{ key: 'close', label: '收盘涨跌', align: 'right' as const, signed: true, suffix: '%' }];

// eslint-disable-next-line no-restricted-syntax -- canvas sources must have exactly one default export
export default function App() {
  return (
    <Canvas title="MU vs 板块强弱" caption="Longbridge · 08-28 收盘 · 5 分钟 K 线">
      {/* 1 结论 —— 必有，放第一屏 */}
      <Callout>MU 跌 2.4%，同期板块只跌 0.8%，是个股自己的事。</Callout>

      {/* 2 关键数字 —— 最多 4 个 */}
      <Grid columns={3}>
        <Stat label="MU 收盘" value="61.20" delta="-2.4%" tone="down" />
        <Stat label="相对板块" value="-1.6%" tone="down" />
        <Stat label="成交额" value="19.6B" />
      </Grid>

      {/* 3 证据 */}
      <Section title="对照">
        <Compare metrics={METRICS} rows={ROWS} sortBy="close" />
      </Section>

      {/* 4 前瞻 —— 没有方向判断就整段删掉 */}
      <Section title="下一步">
        <Scenarios
          items={[
            { label: 'Base 基准', probability: 60, trigger: '在 59—62 之间反复', note: '不动。' },
            { label: 'Bear 悲观', probability: 40, trigger: '失守 58.8 且当日不收回' },
          ]}
        />
      </Section>

      {/* 5 边界 —— 必有 */}
      <Section title="数据边界">
        <Coverage items={[{ label: '期权持仓', status: 'missing', note: '该账户未授权' }]} />
        <Source from="Longbridge" at="2026-08-28 16:00 ET" />
      </Section>
    </Canvas>
  );
}
