export type ChartType = 'flow' | 'cohort' | 'sepa' | 'intraday';

export interface RawBar {
  time: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export interface ColoredPoint extends LinePoint {
  color?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type MarkerPosition = 'aboveBar' | 'belowBar' | 'inBar';
export type MarkerShape = 'circle' | 'arrowUp' | 'arrowDown' | 'square';
export type OverlayGroup =
  | 'ai'
  | 'divergence'
  | 'macdBeichi'
  | 'pattern123'
  | 'sb'
  | 'candle'
  | 'fenxing'
  | 'bi'
  | 'xianduan'
  | 'zhongshu'
  | 'chan-buy1'
  | 'chan-sell1'
  | 'chan-buy2'
  | 'chan-sell2'
  | 'chan-buy3'
  | 'chan-sell3';

export interface SeriesMarker {
  time: number;
  position: MarkerPosition;
  color: string;
  shape: MarkerShape;
  text: string;
  id?: string;
  tooltip?: string;
  group?: OverlayGroup;
  /** false = only visible in "全部" marker range; undefined/true = always visible */
  recent?: boolean;
}

export const AUTO_SIGNAL_META: Record<string, { icon: string; title: string; impact: string }> = {
  'divergence-top': {
    icon: '⚡',
    title: '顶背离',
    impact: '价格创新高但 MACD 动能走弱——上涨动力在衰减，警惕滞涨回调；若随后跌破前低即确认转弱',
  },
  'divergence-bottom': {
    icon: '⚡',
    title: '底背离',
    impact: '价格创新低但 MACD 动能走强——抛压在衰减，反弹概率上升；若放量收复前高即确认反转',
  },
  'macdBeichi-top': {
    icon: '🌀',
    title: '顶 MACD 背离（K 线级）',
    impact: '这波上冲的推动力比前一波明显缩小——趋势进入末段，追高风险大',
  },
  'macdBeichi-bottom': {
    icon: '🌀',
    title: '底 MACD 背离（K 线级）',
    impact: '这波下杀的推动力比前一波明显缩小——下跌动能趋于枯竭，接近阶段性底部',
  },
};

export interface Connector {
  color: string;
  data: LinePoint[];
  group?: OverlayGroup;
  recent?: boolean;
}

export interface SupportZone {
  low: number;
  high: number;
  tier: string;
  label: string;
  fill: string;
  border: string;
  axis_color: string;
  note: string;
  sources: string[];
}

export interface VolumeProfileBin {
  low: number;
  high: number;
  weight: number;
  pct: number;
}

export interface VolumeProfile {
  bins: VolumeProfileBin[];
  max_weight: number;
  lookback: number;
}

export interface SepaEntryPlan {
  pivot: number;
  buy_zone_high: number;
  stop: number;
  stop_pct: number;
  target1: number;
  target1_pct: number;
  target2: number;
  target2_pct: number;
  rr: number;
  rr_ok: boolean;
  rr_great: boolean;
  note: string;
  hypothetical: boolean;
}

export type CheckStatus = 'pass' | 'fail' | 'unknown';

export interface SepaCheck {
  label: string;
  status: CheckStatus;
  val: string;
}

export interface SepaVerdict {
  tier: string;
  label: string;
  color: string;
  reason: string;
}

export interface SepaChartData {
  candles: Candle[];
  ma50: LinePoint[];
  ma150: LinePoint[];
  ma200: LinePoint[];
  volumes: ColoredPoint[];
  volRatio: ColoredPoint[];
  rs21: LinePoint[];
  rs63: LinePoint[];
  rs126: LinePoint[];
  markers: SeriesMarker[];
  high52w: number;
  low52w: number;
  extendedLine: number;
  entryPlan: SepaEntryPlan | null;
  supportZones: SupportZone[];
  volumeProfile: VolumeProfile;
}

export interface NewsItem {
  id: string;
  title: string;
  published_at: string;
  url: string;
}

export interface PositionView {
  shares: number;
  cost: number;
  unrealized: number;
  unrealizedPct: number;
}

export interface SepaSidebar {
  symbol: string;
  name: string;
  asOf: string;
  last: number;
  chgPct: number;
  verdict: SepaVerdict;
  checks: SepaCheck[];
  stage: { k: string; v: string }[];
  keyValues: {
    high52w: number;
    h52Pct: number;
    low52w: number;
    l52Pct: number;
    ma50: number;
    ma150: number;
    ma200: number;
    ma50Pct: number;
    ma200Pct: number;
    rs21d: number | null;
    rs126d: number | null;
  };
  position: PositionView | null;
  ma50Now: number;
  news: NewsItem[];
}

export interface SepaBuilt {
  kind: 'sepa';
  chart: SepaChartData;
  sidebar: SepaSidebar;
}

export type TimeframeKey = 'm5' | 'm15' | 'h1';

export interface EmaLine {
  period: number;
  data: LinePoint[];
}

export type SessionKind = 'regular' | 'pre' | 'post' | 'overnight';

export interface OffSessionSegment {
  startTime: number;
  endTime: number;
  kind: Exclude<SessionKind, 'regular'>;
}

export interface IntradayTfData {
  candles: Candle[];
  volumes: ColoredPoint[];
  emas: EmaLine[];
  vwap?: LinePoint[];
  macdDif: LinePoint[];
  macdDea: LinePoint[];
  macdHist: ColoredPoint[];
  macdCrossMarkers: SeriesMarker[];
  markers: SeriesMarker[];
  priceConnectors: Connector[];
  macdConnectors: Connector[];
  autoDivergence: DivergencePair[];
  autoBeichi: DivergencePair[];
  pattern123?: Pattern123[];
  secondBreakouts?: SecondBreakout[];
  offSession?: OffSessionSegment[];
  fvgZones?: IntradayFvgZone[];
  chanStructure?: ChanStructure;
}

export interface IntradayFvgZone {
  startTime: number;
  low: number;
  high: number;
  kind: 'bullish' | 'bearish';
  /** 尚未被价格成交覆盖的有效区间下沿；旧图表数据缺省时回退到 low。 */
  activeLow?: number;
  /** 尚未被价格成交覆盖的有效区间上沿；旧图表数据缺省时回退到 high。 */
  activeHigh?: number;
  /** 已回补比例，范围为 0–1。 */
  mitigationRatio?: number;
  /** 从形成到最新 K 线的根数。 */
  ageBars?: number;
  /** 原始缺口宽度相对中线价的比例。 */
  gapRatio?: number;
}

export interface Fenxing {
  time: number;
  price: number;
  kind: 'top' | 'bottom';
  confirmed: boolean;
  barIndex: number;
}

export interface Bi {
  start: Fenxing;
  end: Fenxing;
  direction: 'up' | 'down';
  bars: number;
}

export interface Xianduan {
  bis: Bi[];
  direction: 'up' | 'down';
  startTime: number;
  endTime: number | null; // null = pending
  broken: boolean;
}

export interface Zhongshu {
  coreSegments: Xianduan[];
  extendedBy: Xianduan[];
  priceLow: number;
  priceHigh: number;
  startTime: number;
  endTime: number | null;
}

export type BuySellPointKind = 'buy1' | 'sell1' | 'buy2' | 'sell2' | 'buy3' | 'sell3';

export interface BuySellPoint {
  time: number;
  price: number;
  kind: BuySellPointKind;
  timeframe: string;
  refBeichi?: { fromSegmentIdx: number; toSegmentIdx: number };
  refFirstPoint?: { time: number; price: number };
  refZhongshu?: { startTime: number; endTime: number };
  confirmed: boolean;
}

export interface ChanStructure {
  fenxings: Fenxing[];
  bis: Bi[];
  xianduans: Xianduan[];
  zhongshus: Zhongshu[];
  buySellPoints: BuySellPoint[];
}

export interface PriceRectangle {
  startTime: number;
  endTime: number;
  priceLow: number;
  priceHigh: number;
  color: string;
  group: string; // matches SeriesMarker.group (OverlayGroup) values
}

export interface SwingPoint {
  time: number;
  price: number;
}

export interface DivergencePoint extends SwingPoint {
  macd_value: number;
}

export interface DivergencePair {
  kind: 'top' | 'bottom';
  a: DivergencePoint;
  b: DivergencePoint;
}

export interface MacdCross {
  time: number;
  type: 'golden' | 'death';
}

export type MacdStructureKind =
  | 'golden_above'
  | 'golden_below'
  | 'death_above'
  | 'death_below'
  | 'double_golden_below'
  | 'double_golden_above'
  | 'double_death_above'
  | 'double_death_below'
  | 'zero_cross_up'
  | 'zero_cross_down';

export interface MacdStructureSignal {
  kind: MacdStructureKind;
  time: number;
  dif: number;
  bias: 'bullish' | 'bearish';
  label: string;
  implication: string;
  confirmed: boolean;
}

export type CandlePatternKind =
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'morning_star'
  | 'evening_star'
  | 'hammer'
  | 'hanging_man'
  | 'inverted_hammer'
  | 'shooting_star'
  | 'pin_bar_lower'
  | 'pin_bar_upper'
  | 'dark_cloud_cover'
  | 'piercing_line'
  | 'bullish_harami'
  | 'bearish_harami'
  | 'three_white_soldiers'
  | 'three_black_crows'
  | 'doji'
  | 'long_legged_doji'
  | 'gravestone_doji'
  | 'dragonfly_doji'
  | 'tweezer_top'
  | 'tweezer_bottom'
  | 'bullish_marubozu'
  | 'bearish_marubozu';

export type CandlePatternStatus = 'pending' | 'confirmed' | 'invalidated' | 'expired';

export interface CandlePatternStats {
  sample: number;
  wins: number;
}

export interface CandlePattern {
  kind: CandlePatternKind;
  time: number;
  price: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  label: string;
  implication: string;
  span?: number;
  confirm_price?: number | null;
  invalidate_price?: number | null;
  score?: number;
  status?: CandlePatternStatus | null;
  stats?: CandlePatternStats | null;
}

export interface Pattern123 {
  kind: 'bullish' | 'bearish';
  status: 'forming' | 'confirmed';
  p1: SwingPoint;
  p2: SwingPoint;
  p3: SwingPoint;
  trigger: number;
  invalidation: number;
  confirm: SwingPoint | null;
  label: string;
  implication: string;
}

export interface SecondBreakout {
  kind: 'H2' | 'L2';
  status: 'forming' | 'confirmed';
  first: SwingPoint;
  signal: SwingPoint;
  trigger: SwingPoint | null;
}

export interface IntradayTfSummary {
  last_dif: number | null;
  last_dea: number | null;
  last_hist: number | null;
  last_vwap?: number | null;
  emas: { period: number; last: number | null }[];
  recent_swing_highs: SwingPoint[];
  recent_swing_lows: SwingPoint[];
  last_cross: MacdCross | null;
  divergence_candidates: DivergencePair[];
  beichi_candidates: DivergencePair[];
  structure_signals?: MacdStructureSignal[];
  zero_tangle?: boolean;
  candle_patterns?: CandlePattern[];
  pattern_123?: Pattern123[];
  second_breakouts?: SecondBreakout[];
}

export interface IntradayEntryPlan {
  entry: number;
  stop: number;
  target1: number;
  target1_pct: number;
  target2: number;
  target2_pct: number;
  rr: number;
  rr_ok: boolean;
  rr_great: boolean;
  note: string;
  rationale: string;
  stop_note: string;
  entry_zone: IntradayPriceZone | null;
  target_contexts: IntradayTargetContext[];
  price_zones: IntradayPriceZone[];
  entry_status?: EntryPlanStatus | null;
  entry_status_note?: string | null;
}

export type EntryPlanStatus = 'waiting' | 'triggered' | 'invalidated' | 'stopped';

export type IntradayPriceZoneKind =
  'entry' | 'stop' | 'target' | 'support' | 'resistance' | 'invalidation' | 'watch';

export interface IntradayPriceZone {
  kind: IntradayPriceZoneKind;
  label: string;
  low: number;
  high: number;
  note?: string;
  source?: string;
  sources?: string[];
  color?: string;
}

export interface IntradayTargetContext {
  key: 'target1' | 'target2';
  label: string;
  price: number;
  zone: IntradayPriceZone | null;
  note?: string;
  condition?: string;
}

export interface PredictionScenario {
  label: string;
  probability: number;
  path?: string;
  trigger?: string;
}

export interface PredictionSignal {
  type?: string;
  kind?: string;
  timeframe: TimeframeKey;
  time?: string;
  price?: number;
  bias?: 'bullish' | 'bearish' | 'neutral';
  label?: string;
  points?: { time: string; price: number; macd_value?: number }[];
}

export interface RangeBoundPlan {
  condition?: string;
  long_tactic?: string;
  short_tactic?: string;
  low?: number;
  high?: number;
}

export interface IntradayPrediction {
  direction: 'long' | 'short' | 'neutral';
  anchor?: { timeframe: TimeframeKey; time: string; price: number };
  scenarios?: PredictionScenario[];
  range_bound_plan?: RangeBoundPlan;
  range_plan?: RangeBoundPlan;
  entry_plan?: {
    entry: number;
    stop: number;
    target1?: number;
    target2?: number;
    target1_pct?: number;
    target2_pct?: number;
    note?: string;
    rationale?: string;
    stop_note?: string;
    entry_zone?: Partial<IntradayPriceZone>;
    target1_label?: string;
    target1_note?: string;
    target1_condition?: string;
    target1_zone?: Partial<IntradayPriceZone>;
    target2_label?: string;
    target2_note?: string;
    target2_condition?: string;
    target2_zone?: Partial<IntradayPriceZone>;
  };
  price_zones?: Partial<IntradayPriceZone>[];
  signals?: PredictionSignal[];
}

export type ContextStance = 'long' | 'short' | 'neutral';
export type ContextNewsSource = 'longbridge' | 'x' | 'trump' | 'sec' | 'gdelt';
export type ContextNewsTag = 'catalyst' | 'regulatory' | 'sentiment' | 'macro';

export interface ContextConclusion {
  stance: ContextStance;
  summary: string;
  action: string;
}

export interface ContextNewsItem {
  time: string;
  source: ContextNewsSource;
  tag: ContextNewsTag;
  title: string;
  note: string;
  url?: string;
}

export interface IntradayContext {
  generated_at: string;
  conclusion: ContextConclusion;
  news: ContextNewsItem[];
  sources_used: string[];
}

export interface DayLevelRange {
  high: number;
  low: number;
}

export interface IntradayDayContext {
  daily_trend: 'up' | 'down' | 'range' | null;
  daily_close: number | null;
  daily_ma20: number | null;
  daily_ma50: number | null;
  high_20d: number | null;
  low_20d: number | null;
  prev_day: { high: number; low: number; close: number } | null;
  pre_market: DayLevelRange | null;
  opening_range: DayLevelRange | null;
  vwap: number | null;
}

export interface OptionsWallLevel {
  strike: number;
  call_oi: number;
  put_oi: number;
  dominant: 'call' | 'put';
}

export interface IntradayOptionsLevels {
  spot: number | null;
  put_call_oi_ratio: number | null;
  expiries: string[];
  walls: OptionsWallLevel[];
  updated_at: string;
}

export interface MacroEventItem {
  ts: string;
  title: string;
  estimate: string | null;
  previous: string | null;
  actual?: string | null;
}

export interface IntradayEventRisk {
  next_earnings: { date: string; title: string } | null;
  macro: MacroEventItem[];
  updated_at: string;
}

export interface IntradaySidebar {
  symbol: string;
  name: string;
  asOf: string;
  last: number;
  prediction: IntradayPrediction | null;
  entryPlan: IntradayEntryPlan | null;
  position: PositionView | null;
  technicals: Record<TimeframeKey, IntradayTfSummary>;
  dayContext?: IntradayDayContext | null;
  optionsLevels?: IntradayOptionsLevels | null;
  eventRisk?: IntradayEventRisk | null;
  news: NewsItem[];
  context: IntradayContext | null;
}

export interface IntradayBuilt {
  kind: 'intraday';
  timeframes: Record<TimeframeKey, IntradayTfData>;
  defaultTf: TimeframeKey;
  entryPlan: IntradayEntryPlan | null;
  sidebar: IntradaySidebar;
  previewLevels?: Array<{ price: number; label: string }>;
}

export interface FlowRow {
  time: string;
  inflow: string | number;
}

export interface CohortPoint {
  label: string;
  value: number;
}

export type SimpleBuilt =
  | { kind: 'simple'; chartType: 'flow'; rows: FlowRow[]; subtitle: string }
  | { kind: 'simple'; chartType: 'cohort'; rows: CohortPoint[]; subtitle: string };

export type ChartBuilt = SimpleBuilt | SepaBuilt | IntradayBuilt;

export const CURRENT_SCHEMA_VERSION = 2;

export interface ChartMeta {
  id: string;
  schema_version: number;
  type: ChartType;
  title: string;
  symbol: string | null;
  created_at: string;
  updated_at: string;
  prediction_updated_at?: string;
}

export interface ChartDoc extends ChartMeta {
  input: Record<string, unknown>;
  built: ChartBuilt;
}

export interface QuoteCell {
  symbol: string;
  session: string;
  last: number;
  /** null = prev close unknown (snapshot fetch failed); render as "—", not 0 */
  pct: number | null;
  regularLast: number;
  regularPct: number | null;
  turnover?: number;
  asOf?: string;
}

export interface QuoteSnapshot {
  ts: number;
  quotes: QuoteCell[];
}

export interface LegacyChart {
  file: string;
  url: string;
  date: string;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErr {
  ok: false;
  error: string;
  hint?: string;
  code?: string;
}

export type ApiResult<T> = ApiOk<T> | ApiErr;

export interface CapitalBucket {
  in: number;
  out: number;
  net: number;
}

export interface CockpitFlow {
  curve: LinePoint[];
  distribution: { large: CapitalBucket; medium: CapitalBucket; small: CapitalBucket } | null;
  timestamp: string | null;
}

export interface BenchmarkPoint {
  time: number;
  pct: number;
}

export interface BenchmarkSeries {
  symbol: string;
  points: BenchmarkPoint[];
}

export interface CockpitPosition {
  symbol: string;
  shares: number;
  cost: number;
  last: number;
  unrealized: number;
  unrealizedPct: number;
  distances: {
    stop_pct: number | null;
    target1_pct: number | null;
    target2_pct: number | null;
  } | null;
}

export type OutcomeStatus = 'hit_target' | 'hit_stop' | 'held_range' | 'broke_range' | 'open';

export interface AnalysisOutcome {
  status: OutcomeStatus;
  pct_since_anchor: number;
  resolved_at: number | null;
  r_multiple?: number | null;
}

export interface SymbolAnalysisRow extends ChartMeta {
  url: string;
  direction: 'long' | 'short' | 'neutral' | null;
  anchor: { time: string; price: number } | null;
  outcome: AnalysisOutcome | null;
}

export interface RelativeVolume {
  ratio: number;
  today_cum: number;
  baseline_avg: number;
  days_used: number;
  cutoff_minute: number;
}

export interface StatsBucket {
  total: number;
  hit_target: number;
  hit_stop: number;
  held_range: number;
  broke_range: number;
  open: number;
  unjudged: number;
  win_rate: number | null;
  avg_pct: number | null;
  avg_r: number | null;
}

export interface PredictionStats {
  total: number;
  overall: StatsBucket;
  by_direction: { long: StatsBucket; short: StatsBucket; neutral: StatsBucket };
  by_origin: { analyst: StatsBucket; manual: StatsBucket };
}

export interface AiUsageLayerSummary {
  runs: number;
  total_tokens: number;
  cost_total: number;
}

export interface AiUsageSummary {
  date: string;
  runs: number;
  calls: number;
  total_tokens: number;
  cost_total: number;
  by_layer: Record<string, AiUsageLayerSummary>;
}

export interface OverviewRow {
  symbol: string;
  chart_id: string;
  url: string;
  title: string;
  direction: 'long' | 'short' | 'neutral' | null;
  last: number | null;
  pct: number | null;
  session: string | null;
  entry: number | null;
  stop: number | null;
  target1: number | null;
  stop_distance_pct: number | null;
  target1_distance_pct: number | null;
  prediction_stale: boolean;
  ai_following: boolean;
  latest_comment: { ts: string; level: CommentLevel; text: string } | null;
  alert_count: number;
}

export interface MarketTemp {
  temperature: number;
  valuation: number | null;
  sentiment: number | null;
  description: string | null;
}

export interface OverviewBoard {
  date: string;
  session: SessionKind;
  rows: OverviewRow[];
  flows?: Record<string, number | null>;
  flows_at?: number | null;
  market?: MarketTemp | null;
  caps?: Record<string, number>;
}

export interface HomeEventItem {
  date: string;
  ts: string | null;
  kind: 'earnings' | 'macro';
  symbol: string | null;
  title: string;
  estimate: string | null;
  previous: string | null;
  actual: string | null;
  owned: boolean;
}

export interface HomeEvents {
  date: string;
  items: HomeEventItem[];
}

export interface IndustryRankRow {
  name: string;
  chg: number | null;
  leading_ticker: string | null;
  leading_chg: number | null;
}

export interface IndustryPanorama {
  at: number;
  items: IndustryRankRow[];
}

export interface PortfolioPositionRow {
  symbol: string;
  name: string;
  quantity: number;
  cost_price: number;
  last: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
}

export interface PortfolioSummary {
  currency: string;
  total_asset: number;
  market_cap: number;
  cash: number;
  total_pl: number;
  today_pl: number;
  positions: PortfolioPositionRow[];
}

export interface RecapSettlementRow {
  symbol: string;
  chart_id: string;
  direction: 'long' | 'short' | 'neutral' | null;
  day_pct: number | null;
  outcome: AnalysisOutcome | null;
}

export interface OverviewRecap {
  date: string;
  settlements: RecapSettlementRow[];
  alerts: { ts: string; symbol: string; level: CommentLevel; text: string }[];
  usage: AiUsageSummary;
}

export type CommentLevel = 'info' | 'warn' | 'alert' | 'error';
export type CommentSource = 'commentator' | 'analyst' | 'system';

export interface CockpitComment {
  ts: string;
  symbol: string;
  level: CommentLevel;
  text: string;
  trigger?: string;
  source: CommentSource;
  escalated?: boolean;
  chartId?: string;
}

export type NoticeKind = 'analysis_done' | 'deep_dive_done' | 'deep_dive_failed';

export interface Notice {
  symbol: string;
  kind: NoticeKind;
  title: string;
  body: string;
  at: string;
}

export type AnnotationKind = 'trendline' | 'hline' | 'rect' | 'fib' | 'polyline';

export interface AnnotationPoint {
  time: number;
  price: number;
}

export interface AnnotationStyle {
  color?: string;
  width?: 1 | 2 | 3;
  dash?: boolean;
  arrow?: boolean;
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  points: AnnotationPoint[];
  createdAt: number;
  source?: 'user' | 'ai';
  label?: string;
  style?: AnnotationStyle;
}
