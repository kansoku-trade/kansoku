import {
  AreaChart,
  Badge,
  BarChart,
  Callout,
  CandleChart,
  Compare,
  Canvas,
  Card,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Heading,
  LineChart,
  Link,
  Metric,
  Param,
  PieChart,
  Pill,
  RRPlan,
  Coverage,
  Row,
  Scenarios,
  Section,
  Select,
  Source,
  Sparkline,
  Stack,
  Stat,
  Table,
  Text,
  Timeline,
  Toggle,
  useCandles,
  useMemo,
  useQuote,
  useState,
} from '@kansoku/canvas';

const BARS = [
  { time: 1_756_000_800, open: 58.4, high: 59.6, low: 58.1, close: 59.2, volume: 12_400 },
  { time: 1_756_004_400, open: 59.2, high: 60.4, low: 59, close: 60.1, volume: 15_800 },
  { time: 1_756_008_000, open: 60.1, high: 60.3, low: 58.8, close: 59, volume: 18_200 },
  { time: 1_756_011_600, open: 59, high: 61.5, low: 58.9, close: 61.2, volume: 24_600 },
  { time: 1_756_015_200, open: 61.2, high: 61.8, low: 60.4, close: 60.7, volume: 16_100 },
  { time: 1_756_018_800, open: 60.7, high: 62.4, low: 60.5, close: 62.1, volume: 21_900 },
];

const EMA9 = BARS.map((bar, index) => ({
  time: bar.time,
  value: Number((bar.close - 0.4 + index * 0.05).toFixed(2)),
}));

const FLOW = [
  { x: '09:30', y: 12.4 },
  { x: '10:30', y: 18.1 },
  { x: '11:30', y: -6.2 },
  { x: '13:00', y: 4.8 },
  { x: '14:00', y: 22.7 },
  { x: '15:00', y: 31.5 },
];

const COHORT = [
  { x: 'MU', y: 31.5 },
  { x: 'TSM', y: 18.2 },
  { x: 'NVDA', y: -9.4 },
  { x: 'AMD', y: -14.8 },
];

const BREADTH = [
  { x: '08-25', y: 42 },
  { x: '08-26', y: 51 },
  { x: '08-27', y: 47 },
  { x: '08-28', y: 63 },
  { x: '08-29', y: 71 },
];

const WEIGHTS = [
  { label: '存储', value: 38 },
  { label: '代工', value: 26 },
  { label: 'GPU', value: 22 },
  { label: '设备', value: 14 },
];

const COMPARE_ROWS = [
  {
    symbol: 'MU',
    label: '美光',
    values: { change: 3.2, flow: -619, rel: 1.24 },
    trend: [58.4, 59.2, 59, 61.2, 60.7, 62.1],
    note: '现价接近前高',
  },
  {
    symbol: 'TSM',
    label: '台积电',
    values: { change: 1.1, flow: 128, rel: 0.82 },
    trend: [180.2, 181.4, 183, 182.4, 184.3],
  },
  {
    symbol: 'NVDA',
    label: '英伟达',
    values: { change: -0.6, flow: -94, rel: -0.31 },
    trend: [176, 175.2, 174.1, 174.8, 173.6],
  },
  {
    symbol: 'AMD',
    label: '超微',
    values: { change: -2.4, flow: -280, rel: -1.05 },
    trend: [146.2, 145.1, 143.4, 142, 141.8],
    note: '链条里最弱',
  },
];

const COMPARE_METRICS = [
  { key: 'change', label: '涨跌', align: 'right' as const, signed: true, suffix: '%' },
  { key: 'flow', label: '净流', align: 'right' as const, signed: true, suffix: '万' },
  { key: 'rel', label: '相对大盘', align: 'right' as const, signed: true, suffix: '%' },
];

const RANGE_OPTIONS = [
  { value: '1d', label: '当日' },
  { value: '5d', label: '五日' },
];

// eslint-disable-next-line no-restricted-syntax -- canvas sources must have exactly one default export
export default function App() {
  const [showVolume, setShowVolume] = useState(true);
  const [range, setRange] = useState('1d');
  const [entry, setEntry] = useState(61.2);
  const [stop, setStop] = useState(59.4);
  const [shares, setShares] = useState(100);
  const risk = useMemo(() => (entry - stop) * shares, [entry, stop, shares]);
  const quote = useQuote('MU.US');
  const candles = useCandles('MU.US');

  const flow = useMemo(
    () => (range === '1d' ? FLOW : FLOW.map((point) => ({ ...point, y: point.y * 2.3 }))),
    [range],
  );

  return (
    <Canvas title="Canvas 组件总览" caption="示例数据 · 非真实行情 · 用于组件回归">
      <Row gap="lg" align="center" justify="between">
        <Row gap="sm" align="center">
          <Pill tone="up">up</Pill>
          <Pill tone="down">down</Pill>
          <Pill>neutral</Pill>
          <Badge tone="up">Badge</Badge>
        </Row>
        <Row gap="sm" align="center">
          <Toggle label="显示成交量" value={showVolume} onChange={setShowVolume} />
          <Select label="区间" value={range} options={RANGE_OPTIONS} onChange={setRange} />
        </Row>
      </Row>

      <Section title="数字">
        <Grid columns={4}>
          <Stat label="最新价" value="62.10" delta="+3.2%" tone="up" />
          <Stat label="日内低点" value="58.10" delta="-1.8%" tone="down" />
          <Stat label="成交额" value="19.6B" />
          <Metric label="量比" value="1.84" delta="放量" tone="up" />
        </Grid>
      </Section>

      <Section title="文字层级">
        <Stack gap="sm">
          <H1>H1 标题</H1>
          <H2>H2 标题</H2>
          <H3>H3 标题</H3>
          <Heading level={2}>Heading level=2</Heading>
          <Text>正文：一段普通描述，用来看行高和字号在深色底上的可读性。</Text>
          <Text muted>次要文字：数据口径、时间戳这类补充说明放这里。</Text>
          <Link href="https://example.com">一条外链</Link>
        </Stack>
      </Section>

      <Callout tone="warn">Callout warn：盈亏比不够，先等回踩。</Callout>
      <Callout tone="up">Callout up：站上前高且量能放大。</Callout>
      <Callout tone="down">Callout down：跌破止损位，计划作废。</Callout>
      <Callout>Callout neutral：中性提示。</Callout>

      <Divider />

      <Section title="当场算">
        <Stack gap="sm">
          <Param
            label="入场"
            value={entry}
            onChange={setEntry}
            min={55}
            max={65}
            step={0.05}
            unit="USD"
          />
          <Param
            label="止损"
            value={stop}
            onChange={setStop}
            min={55}
            max={65}
            step={0.05}
            unit="USD"
          />
          <Param label="股数" value={shares} onChange={setShares} step={1} unit="股" />
          <Stat label="单笔风险" value={risk.toFixed(2)} />
        </Stack>
      </Section>

      <Section title="场景与计划">
        <Grid columns={2}>
          <Scenarios
            items={[
              {
                label: 'Bull 乐观',
                probability: 30,
                trigger: '收盘站上 62.4 且成交量高于五日均量',
                note: '看到 65 一线的前高。',
              },
              {
                label: 'Base 基准',
                probability: 45,
                trigger: '在 59—62.4 之间反复',
                note: '不动，等方向。',
              },
              {
                label: 'Bear 悲观',
                probability: 25,
                trigger: '失守 58.8 且当日不收回',
                note: '回到上一个平台 55。',
              },
            ]}
          />
          <Stack gap="sm">
            <RRPlan
              entry={entry}
              stop={stop}
              targets={[64.5, 68]}
              unit="USD"
              note="按 1R 算，两档目标都过 1.5 下限。"
            />
            <RRPlan entry={61.2} stop={58} targets={62.5} unit="USD" note="这一档故意做成不合格。" />
          </Stack>
        </Grid>
      </Section>

      <Section title="对照">
        <Card>
          <Compare metrics={COMPARE_METRICS} rows={COMPARE_ROWS} sortBy="change" />
        </Card>
        <Row gap="sm" align="center" style={{ marginTop: 8 }}>
          <Text muted>单独的 Sparkline：</Text>
          <Sparkline data={[58.4, 59.2, 59, 61.2, 60.7, 62.1]} />
          <Sparkline data={[146.2, 145.1, 143.4, 142, 141.8]} />
        </Row>
      </Section>

      <Section title="事件轴与覆盖度">
        <Grid columns={2}>
          <Card>
            <Timeline
              items={[
                { at: '08-25', label: '财报前最后一个平台', price: 55.4 },
                { at: '08-27', label: '盘后财报，超预期', price: 58.9, tone: 'up' },
                { at: '08-28', label: '跳空高开后回落', price: 59, detail: '当日振幅 4.1%，收在中位。' },
                { at: '08-29', label: '放量站上前高', price: 62.1, tone: 'up', current: true },
              ]}
            />
          </Card>
          <Card>
            <Coverage
              items={[
                { label: '日线 K 线', status: 'ok', note: 'Longbridge，截至 08-29 收盘' },
                { label: '资金流', status: 'partial', note: '只有 10:15 之后的分笔' },
                { label: '期权持仓', status: 'missing', note: '该账户未授权逐合约行情' },
                { label: '同业对照', status: 'ok', note: 'TSM / NVDA / AMD' },
              ]}
            />
            <Divider />
            <Source from="Longbridge" at="2026-08-29 16:00 ET" note="示例数据" />
          </Card>
        </Grid>
      </Section>

      <Section title="表格">
        <Card>
          <Table
            columns={[
              { key: 'symbol', header: '标的' },
              { key: 'close', header: '收盘', align: 'right' },
              { key: 'change', header: '涨跌', align: 'right' },
              { key: 'tag', header: '标记' },
            ]}
            rows={[
              { symbol: 'MU', close: '62.10', change: '+3.2%', tag: <Pill tone="up">主线</Pill> },
              { symbol: 'TSM', close: '184.30', change: '+1.1%', tag: <Pill>跟随</Pill> },
              { symbol: 'AMD', close: '141.80', change: '-2.4%', tag: <Pill tone="down">走弱</Pill> },
            ]}
          />
        </Card>
      </Section>

      <Section title="分析图">
        <Grid columns={2}>
          <LineChart title="资金流曲线" data={flow} xUnit="时间" yUnit="百万美元" />
          <BarChart title="同业净流入对比" data={COHORT} yUnit="百万美元" signed />
          <AreaChart title="板块上涨家数占比" data={BREADTH} xUnit="日期" yUnit="%" />
          <PieChart title="持仓权重" data={WEIGHTS} />
        </Grid>
      </Section>

      <Section title="交易图">
        <CandleChart
          title="示例 1h"
          bars={BARS}
          volume={showVolume}
          ema={[{ label: 'EMA9', points: EMA9 }]}
          priceLines={[
            { price: 62.4, label: '前高' },
            { price: 58.8, label: '止损' },
          ]}
          zones={[{ low: 59, high: 60.4, kind: 'range', label: '密集区' }]}
          markers={[{ time: 1_756_011_600, price: 61.2, bias: 'bullish', label: '入场' }]}
        />
      </Section>

      <Section title="实时行情">
        <Grid columns={2}>
          {quote ? (
            <Stat
              label="MU 最新价"
              value={quote.last.toFixed(2)}
              delta={quote.pct === null ? undefined : `${quote.pct >= 0 ? '+' : ''}${quote.pct.toFixed(2)}%`}
              tone={quote.pct === null ? undefined : quote.pct >= 0 ? 'up' : 'down'}
            />
          ) : null}
          <CandleChart title="MU 5 分钟实时" source={candles} tf="m5" />
        </Grid>
      </Section>
    </Canvas>
  );
}
