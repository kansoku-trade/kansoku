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

export interface CandleFeedTf {
  candles: Candle[];
  volumes: ColoredPoint[];
  emas: EmaLine[];
  macdDif: LinePoint[];
  macdDea: LinePoint[];
  macdHist: ColoredPoint[];
  offSession?: OffSessionSegment[];
}

export interface CandleFeed {
  symbol: string;
  asOf: string;
  timeframes: Record<TimeframeKey, CandleFeedTf>;
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
