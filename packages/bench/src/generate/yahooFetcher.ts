import type { FetchEpisodeKlineHistory } from '../episode/generate.js';
import type { QuoteBar } from './assemble.js';
import type { EpisodeKlinePeriod } from './source.js';

const YAHOO_INTERVAL: Record<EpisodeKlinePeriod, string> = {
  '1h': '60m',
  day: '1d',
  week: '1wk',
};

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v7/finance/chart';

interface YahooQuoteBlock {
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface YahooChartResult {
  timestamp?: number[];
  indicators?: { quote?: YahooQuoteBlock[] };
  meta?: { symbol?: string; currency?: string; exchangeTimezoneName?: string };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
    error?: { code?: string; description?: string } | null;
  };
}

async function fetchYahooChart(
  symbol: string,
  interval: string,
  start: string,
  end: string,
): Promise<YahooChartResult> {
  const period1 = Math.floor(Date.parse(`${start}T00:00:00Z`) / 1000);
  const period2 = Math.floor(Date.parse(`${end}T23:59:59Z`) / 1000);
  const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=${interval}&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`yahoo ${symbol}: HTTP ${res.status}`);
  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];
  if (!result) {
    const err = data.chart?.error;
    throw new Error(`yahoo ${symbol}: ${err?.description ?? err?.code ?? 'no data'}`);
  }
  return result;
}

export const fetchKlineHistoryYahoo: FetchEpisodeKlineHistory = async (
  symbol,
  period,
  start,
  end,
) => {
  const interval = YAHOO_INTERVAL[period];
  if (!interval) throw new Error(`yahoo fetcher does not support period: ${period}`);
  const result = await fetchYahooChart(symbol, interval, start, end);
  const ts = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: QuoteBar[] = [];
  for (let i = 0; i < ts.length; i += 1) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      !Number.isFinite(open) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    const volume = quote.volume?.[i];
    bars.push({
      time: new Date(ts[i] * 1000).toISOString(),
      open: String(open),
      high: String(high),
      low: String(low),
      close: String(close),
      volume: String(volume ?? 0),
    });
  }
  return bars.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
};
