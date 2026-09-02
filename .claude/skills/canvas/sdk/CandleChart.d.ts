import type { CandleFeed, TimeframeKey } from '@kansoku/shared/types';
export interface CanvasBar {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
export interface CanvasMacdPoint {
    time: number;
    macd: number;
    signal: number;
    hist: number;
}
export interface CanvasEmaSeries {
    label?: string;
    points: {
        time: number;
        value: number;
    }[];
}
export interface CandleChartProps {
    title?: string;
    bars?: CanvasBar[];
    source?: CandleFeed | null;
    tf?: TimeframeKey;
    volume?: boolean | {
        time: number;
        value: number;
    }[];
    macd?: CanvasMacdPoint[];
    ema?: number[] | CanvasEmaSeries[];
    priceLines?: {
        price: number;
        label: string;
    }[];
    zones?: {
        low: number;
        high: number;
        kind?: string;
        label?: string;
    }[];
    markers?: {
        time: number;
        price?: number;
        bias?: 'bullish' | 'bearish' | string;
        label?: string;
    }[];
    sessions?: boolean | {
        start: number;
        end: number;
        kind?: string;
    }[];
}
export declare function CandleChart({ title, bars, source, tf, volume, macd, ema, priceLines, zones, markers }: CandleChartProps): import("react").JSX.Element;
