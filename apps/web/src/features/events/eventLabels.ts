import type { MarketEventClass, MarketEventSeverity, MarketEventTrust } from '@kansoku/shared/types';

export const EVENT_CLASS_LABEL: Record<MarketEventClass, string> = {
  macro: '宏观',
  earnings: '财报',
  filing: '备案',
  news: '新闻',
  policy: '政策',
  flow: '资金',
  technical: '技术',
};

export const EVENT_TRUST_LABEL: Record<MarketEventTrust, string> = {
  official: '官方',
  verified: '已核实',
  unverified: '未核实',
};

export const EVENT_SEVERITY_LABEL: Record<MarketEventSeverity, string> = {
  info: '一般',
  notable: '重要',
  critical: '重大',
};

const SOURCE_LABEL: Record<string, string> = {
  'sec-edgar': 'SEC',
  'market-calendar': '日历',
  'longbridge-news': '长桥新闻',
  'kernel-triggers': '本机信号',
  'fed-monetary': '美联储货币',
  'fed-press': '美联储新闻',
  'bls-rss': '劳工统计局',
};

// An unknown source id is still a source: showing the raw id beats hiding a row
// that the collector is genuinely producing.
export function eventSourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source.toUpperCase();
}

export function shortSymbol(symbol: string): string {
  return symbol.replace(/\.US$/, '');
}
