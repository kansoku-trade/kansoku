const KLINE_PERIOD_LABELS: Record<string, string> = Object.assign(Object.create(null), {
  m5: '5 分钟',
  m15: '15 分钟',
  h1: '1 小时',
});

const FIXED_TOOL_ACTIVITIES: Record<string, string> = Object.assign(Object.create(null), {
  read_data_pack: '正在读取数据包',
  fetch_news: '正在查最新新闻',
  append_comment: '正在记录阶段点评',
  write_journal: '正在写观察日志',
  submit_prediction: '正在提交预测',
  submit_section: '正在提交中间读数',
});

const RESEARCH_TOOL_ARG_KEYS: Record<string, string> = Object.assign(Object.create(null), {
  bash: 'command',
  read_file: 'path',
  list_files: 'path',
  grep: 'pattern',
  read_skill: 'name',
});

const ARG_SUMMARY_MAX_CHARS = 40;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeResearchArgs(name: string, args: unknown): string | null {
  const key = RESEARCH_TOOL_ARG_KEYS[name];
  if (!key || !isPlainObject(args)) return null;
  const value = args[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, ARG_SUMMARY_MAX_CHARS);
}

function describeFetchKline(args: unknown): string {
  const period = isPlainObject(args) && typeof args.period === 'string' ? args.period : undefined;
  if (period === 'day') return '正在读日 K 线';
  const label = period ? KLINE_PERIOD_LABELS[period] : undefined;
  return label ? `正在读 ${label} K 线` : '正在读 K 线';
}

export function describeToolCall(name: string, args: unknown): string {
  if (name === 'fetch_kline') return describeFetchKline(args);

  const fixed = FIXED_TOOL_ACTIVITIES[name];
  if (fixed) return fixed;

  if (name in RESEARCH_TOOL_ARG_KEYS) {
    const summary = summarizeResearchArgs(name, args);
    return summary ? `正在检索资料：${summary}` : '正在检索资料';
  }

  return `正在调用 ${name}`;
}

export function describeTurnStart(turnNumber: number): string {
  return `第 ${turnNumber} 轮推理中`;
}
