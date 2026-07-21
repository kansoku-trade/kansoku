export type ToneClass = 'positive' | 'negative' | 'neutral';

export type EpisodeReportChartTimeframe = 'h1' | 'day' | 'week';

export interface EpisodeReportMetricCell {
  label: string;
  value: string;
  note: string;
  tone: ToneClass;
}

export interface EpisodeReportHeaderChip {
  text: string;
}

export interface EpisodeReportAuditChip {
  label: string;
  tone: 'pass' | 'fail' | 'neutral';
}

export interface EpisodeReportConfigStripItem {
  label: string;
  value: string;
}

export interface EpisodeReportReasonActionBreakdownItem {
  action: string;
  actionLabel: string;
  count: number;
}

export interface EpisodeReportReasonStatView {
  model: string;
  category: string;
  categoryLabel: string;
  actions: number;
  actionBreakdown: EpisodeReportReasonActionBreakdownItem[];
  entries: number;
  trades: number;
  winRate: number | null;
  averageNetR: number | null;
  totalNetR: number;
  tone: ToneClass;
}

export interface EpisodeReportModelRowView {
  rank: number;
  model: string;
  cases: number;
  trades: number;
  avgNetRPerCase: number | null;
  tone: ToneClass;
  winRate: number | null;
  tradeWinRate: number | null;
  directionAccuracy: number | null;
  fillRate: number | null;
  avgCostUsd: number | null;
}

export interface EpisodeReportCaseRowView {
  index: number;
  anchorId: string;
  symbol: string;
  provenanceSymbol: string | null;
  provenanceDate: string | null;
  questionId: string;
  model: string;
  mode: string;
  modeLabel: string;
  rep: number;
  direction: string;
  directionLabel: string;
  firstDecisionLabel: string;
  planEntry: number | null;
  planStop: number | null;
  planTarget: number | null;
  actualEntry: number | null;
  actualExit: number | null;
  tradeCount: number;
  outcome: string;
  outcomeLabel: string;
  netR: number | null;
  tone: ToneClass;
  mfeR: number | null;
  maeR: number | null;
  costUsd: number | null;
  durationLabel: string;
  filterSearch: string;
}

export interface EpisodeReportChartTradeTimes {
  decision: number | string | null;
  entry: number | string | null;
  exit: number | string | null;
}

export interface EpisodeReportChartBar {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EpisodeReportChartMarker {
  time: number | string;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
}

export interface EpisodeReportChartTradeRef {
  tradeId: number;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  netR: number;
  times: Record<EpisodeReportChartTimeframe, EpisodeReportChartTradeTimes>;
}

export interface EpisodeReportChartPayload {
  id: string;
  symbol: string;
  finalBarIndex: number;
  baseRanges: Record<EpisodeReportChartTimeframe, EpisodeReportChartBar[]>;
  replayH1: EpisodeReportChartBar[];
  snapshotPatches: Record<string, { day: EpisodeReportChartBar[]; week: EpisodeReportChartBar[] }>;
  markers: Record<EpisodeReportChartTimeframe, EpisodeReportChartMarker[]>;
  levels: Array<{ title: string; price: number; color: string }>;
  trades: EpisodeReportChartTradeRef[];
  availableTimeframes: EpisodeReportChartTimeframe[];
  defaultTimeframe: EpisodeReportChartTimeframe;
}

export interface EpisodeReportProcessEventView {
  sequence: number;
  tool: string;
  label: string;
  detail: string;
  kind: 'data' | 'observe' | 'decision' | 'manage' | 'warning' | 'other';
  barLabel: string;
  transitionLabel: string;
  timeframe: EpisodeReportChartTimeframe | null;
  durationLabel: string | null;
  snapshotBar: number;
  isError: boolean;
}

export interface EpisodeReportProcessCheckView {
  label: string;
  pass: boolean;
  detail: string;
}

export interface EpisodeReportTradeLedgerItem {
  tradeId: number;
  direction: string;
  directionLabel: string;
  decisionBar: number;
  entryBar: number | null;
  exitBar: number | null;
  exitLabel: string;
  entryReasonCategoryLabel: string | null;
  entryReasonSummary: string | null;
  entryPrice: number;
  initialStop: number;
  finalStop: number;
  target: number;
  exitPrice: number;
  netR: number;
  tone: ToneClass;
}

export interface EpisodeReportActionRecordView {
  step: number;
  actionType: string;
  actionLabel: string;
  reasonCategoryLabel: string | null;
  reasonSummary: string | null;
  timeLabel: string;
  chartTimes: Record<EpisodeReportChartTimeframe, number | string> | null;
}

export interface EpisodeReportFactItem {
  label: string;
  value: string;
  tone: ToneClass | '';
}

export interface EpisodeReportCaseDetailView {
  index: number;
  anchorId: string;
  chartId: string;
  symbol: string;
  provenanceSymbol: string | null;
  provenanceLine: string | null;
  questionId: string;
  model: string;
  modeLabel: string;
  outcome: string;
  outcomeLabel: string;
  netR: number | null;
  tone: ToneClass;
  availableTimeframes: EpisodeReportChartTimeframe[];
  defaultTimeframe: EpisodeReportChartTimeframe;
  planFacts: EpisodeReportFactItem[];
  planReasonCategoryLabel: string | null;
  planReasonSummary: string | null;
  planRationale: string | null;
  resultFacts: EpisodeReportFactItem[];
  trades: EpisodeReportTradeLedgerItem[];
  actions: EpisodeReportActionRecordView[];
  process: {
    timingLabel: string;
    hasTrace: boolean;
    events: EpisodeReportProcessEventView[];
    checks: EpisodeReportProcessCheckView[];
  };
}

export interface EpisodeReportAuditCheckView {
  status: 'pass' | 'fail';
  label: string;
  questionId: string;
  checkId: string;
  detail: string | null;
}

export interface EpisodeReportViewData {
  runId: string;
  generatedAt: string;
  gitSha: string | null;
  header: {
    datasetChip: string;
    modelsChip: string;
    modesChip: string;
    costChip: string;
    auditChip: EpisodeReportAuditChip;
  };
  summarySubtitle: string;
  metrics: EpisodeReportMetricCell[];
  configStrip: EpisodeReportConfigStripItem[];
  reasonTable: {
    coverageLabel: string;
    rows: EpisodeReportReasonStatView[];
  };
  modelTable: EpisodeReportModelRowView[];
  filters: {
    models: string[];
    modes: Array<{ value: string; label: string }>;
    outcomes: Array<{ value: string; label: string }>;
  };
  cases: EpisodeReportCaseRowView[];
  caseDetails: EpisodeReportCaseDetailView[];
  charts: EpisodeReportChartPayload[];
  audit: {
    attached: boolean;
    passed: number;
    total: number;
    checks: EpisodeReportAuditCheckView[];
  };
}

export interface LeaderboardReportViewData {
  title: string;
  generatedAt: string;
}

declare global {
  interface Window {
    __KANSOKU_REPORT_DATA__?: EpisodeReportViewData | LeaderboardReportViewData;
  }
}
