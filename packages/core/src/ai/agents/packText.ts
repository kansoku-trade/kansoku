import { encodeKlineText, type SessionFilter } from '@kansoku/shared/klineText';
import type { RawBar, TimeframeKey } from '@kansoku/shared/types';
import type { CommentPack, CommentUpdate, ReassessPack } from './datapack.js';

const TIMEFRAME_PERIOD: Record<TimeframeKey, string> = { m5: '5m', m15: '15m', h1: '1h' };

// The tables stay outside the JSON so their newlines are not escaped: embedding a
// 700-line table as a JSON string value costs an extra byte per line and hands the
// model one unbroken line of literal "\n".
export function withKlineTables(envelope: unknown, tables: string[]): string {
  return [JSON.stringify(envelope), ...tables].join('\n\n');
}

export function klineTable(
  symbol: string,
  period: string,
  bars: RawBar[],
  indicators?: Record<string, readonly (number | null)[]>,
  sessions?: SessionFilter,
): string {
  return encodeKlineText({ symbol, period, bars, indicators, sessions });
}

// The envelope key is load-bearing: the commentator prompt tells the model that a
// "pack" is a full snapshot and an "update" carries only the new bars. Collapsing
// both into one key would leave it unable to tell them apart.
export function commentPackPromptText(pack: CommentPack, trigger: unknown): string {
  const { m5, ...rest } = pack;
  return withKlineTables({ pack: rest, trigger }, [
    klineTable(pack.symbol, '5m', m5.bars, m5.macd),
  ]);
}

export function commentUpdatePromptText(update: CommentUpdate, trigger: unknown): string {
  const { m5, ...rest } = update;
  return withKlineTables({ update: rest, trigger }, [
    klineTable(update.symbol, '5m', m5.bars, m5.macd),
  ]);
}

export function explainerPackPromptText(pack: CommentPack): string {
  const { m5, ...rest } = pack;
  return withKlineTables({ pack: rest }, [klineTable(pack.symbol, '5m', m5.bars, m5.macd)]);
}

// buildDataPackTool serves more than one producer: the bench mock pack ships
// pre-summarised kline_summary and carries no bar arrays at all. Nothing to
// encode there, so it goes out as plain JSON — tables appear only when bars do.
export function reassessPackPromptText(pack: ReassessPack): string {
  const { timeframes, ...rest } = pack;
  if (!timeframes) return JSON.stringify(pack);
  const summaries: Record<string, unknown> = {};
  const tables: string[] = [];
  for (const key of Object.keys(timeframes) as TimeframeKey[]) {
    const frame = timeframes[key];
    summaries[key] = { summary: frame.summary };
    tables.push(klineTable(pack.symbol, TIMEFRAME_PERIOD[key] ?? key, frame.bars));
  }
  return withKlineTables({ ...rest, timeframes: summaries }, tables);
}
