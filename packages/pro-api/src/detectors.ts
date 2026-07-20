import type {
  CandlePattern,
  DivergencePair,
  DivergencePoint,
  IntradayFvgZone,
  IntradayOptionsLevels,
  Pattern123,
  SecondBreakout,
  SwingPoint,
} from '@kansoku/shared/types';

export interface PatternScoringContext {
  highs: number[];
  lows: number[];
  closes: number[];
  vols: number[];
  timesTs: number[];
  emaArrs: { period: number; arr: (number | null)[] }[];
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
  fvgZones: IntradayFvgZone[];
}

export interface ProDetectors {
  findPriceDivergence(points: DivergencePoint[], isTop: boolean): DivergencePair[];
  findMacdBeichi(
    hist: (number | null)[],
    highs: number[],
    lows: number[],
    timesTs: number[],
  ): DivergencePair[];
  detect123Patterns(
    highs: number[],
    lows: number[],
    closes: number[],
    timesTs: number[],
  ): Pattern123[];
  detectSecondBreakouts(
    highs: number[],
    lows: number[],
    closes: number[],
    timesTs: number[],
  ): SecondBreakout[];
  detectCandlePatterns(
    opens: number[],
    highs: number[],
    lows: number[],
    closes: number[],
    timesTs: number[],
  ): CandlePattern[];
  enrichCandlePatterns(patterns: CandlePattern[], ctx: PatternScoringContext): CandlePattern[];
  getOptionsLevels(symbol: string): Promise<IntradayOptionsLevels | null>;
}
