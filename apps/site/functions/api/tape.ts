import { TAPE_SYMBOLS } from '../../src/scripts/landing/tape';

const UPSTREAM = 'https://cdn.cboe.com/api/global/delayed_quotes/quotes';

interface CboeQuote {
  data?: {
    current_price?: unknown;
    price_change_percent?: unknown;
    last_trade_time?: unknown;
  };
}

const fetchQuote = async (cboe: string, symbol: string) => {
  try {
    const res = await fetch(`${UPSTREAM}/${cboe}.json`, {
      cf: { cacheTtl: 60, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;

    const body = (await res.json()) as CboeQuote;
    const data = body.data;
    if (typeof data?.current_price !== 'number' || typeof data.price_change_percent !== 'number') {
      return null;
    }

    return {
      symbol,
      last: data.current_price,
      changePercent: data.price_change_percent,
      asOf: typeof data.last_trade_time === 'string' ? data.last_trade_time : null,
    };
  } catch {
    return null;
  }
};

export const onRequestGet = async (): Promise<Response> => {
  const results = await Promise.all(
    TAPE_SYMBOLS.map(({ cboe, symbol }) => fetchQuote(cboe, symbol)),
  );
  const quotes = results.filter((quote) => quote !== null);

  if (quotes.length === 0) {
    return new Response(JSON.stringify({ error: 'upstream unavailable' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ delayedMinutes: 15, quotes }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=30, s-maxage=60',
    },
  });
};
