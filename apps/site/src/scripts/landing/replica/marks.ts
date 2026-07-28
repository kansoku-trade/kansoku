import type { Candle } from '../kline';
import type { CandlePattern, Divergence, Structure123 } from './annotations';
import { theme } from './theme';

export type MarkerPosition = 'aboveBar' | 'belowBar' | 'inBar';
export type MarkerShape = 'circle' | 'arrowUp' | 'arrowDown';

export interface Marker {
  time: number;
  position: MarkerPosition;
  color: string;
  shape: MarkerShape;
  text: string;
}

export interface ConnectorPoint {
  time: number;
  value: number;
}

export interface Connector {
  color: string;
  pane: 'price' | 'macd';
  data: ConnectorPoint[];
}

export interface Marks {
  markers: Marker[];
  connectors: Connector[];
}

export interface Detected {
  structure: Structure123 | null;
  patterns: CandlePattern[];
  divergence: Divergence | null;
}

const NUMERALS = ['①', '②', '③'];

const structureMarks = (candles: Candle[], structure: Structure123): Marks => {
  const bullish = structure.kind === 'bullish';
  const color = bullish ? theme.up : theme.down;
  const points = [structure.p1, structure.p2, structure.p3];

  const markers: Marker[] = points.map((point, i) => ({
    time: candles[point.index].time,
    position: point.isHigh ? 'aboveBar' : 'belowBar',
    color,
    shape: 'circle',
    text: structure.confirmIndex === null && i === 2 ? `${NUMERALS[i]}?` : NUMERALS[i],
  }));

  const connectors: Connector[] = [
    {
      color,
      pane: 'price',
      data: points.map((point) => ({ time: candles[point.index].time, value: point.price })),
    },
  ];

  const triggerEnd = structure.confirmIndex ?? candles.length - 1;
  if (triggerEnd > structure.p3.index) {
    connectors.push({
      color,
      pane: 'price',
      data: [
        { time: candles[structure.p3.index].time, value: structure.trigger },
        { time: candles[triggerEnd].time, value: structure.trigger },
      ],
    });
  }

  if (structure.confirmIndex !== null) {
    markers.push({
      time: candles[structure.confirmIndex].time,
      position: bullish ? 'belowBar' : 'aboveBar',
      color,
      shape: bullish ? 'arrowUp' : 'arrowDown',
      text: '123✓',
    });
  }

  return { markers, connectors };
};

const patternMarker = (candles: Candle[], pattern: CandlePattern): Marker => {
  const bullish = pattern.bias === 'bullish';
  return {
    time: candles[pattern.index].time,
    position: bullish ? 'belowBar' : 'aboveBar',
    color: bullish ? theme.up : theme.down,
    shape: bullish ? 'arrowUp' : 'arrowDown',
    text: `${pattern.label}${pattern.status === 'confirmed' ? '✓' : '?'}`,
  };
};

const divergenceMarks = (candles: Candle[], divergence: Divergence): Marks => {
  const top = divergence.kind === 'top';
  const color = top ? theme.down : theme.up;
  const legs = [divergence.a, divergence.b];
  return {
    markers: legs.map((leg) => ({
      time: candles[leg.index].time,
      position: top ? 'aboveBar' : 'belowBar',
      color,
      shape: top ? 'arrowDown' : 'arrowUp',
      text: '⚡',
    })),
    connectors: [
      {
        color,
        pane: 'price',
        data: legs.map((leg) => ({ time: candles[leg.index].time, value: leg.price })),
      },
      {
        color,
        pane: 'macd',
        data: legs.map((leg) => ({ time: candles[leg.index].time, value: leg.macd })),
      },
    ],
  };
};

export const buildMarks = (candles: Candle[], detected: Detected): Marks => {
  const markers: Marker[] = [];
  const connectors: Connector[] = [];

  if (detected.structure) {
    const marks = structureMarks(candles, detected.structure);
    markers.push(...marks.markers);
    connectors.push(...marks.connectors);
  }
  for (const pattern of detected.patterns) markers.push(patternMarker(candles, pattern));
  if (detected.divergence) {
    const marks = divergenceMarks(candles, detected.divergence);
    markers.push(...marks.markers);
    connectors.push(...marks.connectors);
  }

  markers.sort((a, b) => a.time - b.time);
  return { markers, connectors };
};

export const markCount = (detected: Detected): number =>
  detected.patterns.length + (detected.structure ? 1 : 0) + (detected.divergence ? 1 : 0);
