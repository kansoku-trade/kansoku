import { createChart, type IChartApiBase, type IPrimitivePaneView, type ISeriesApi, type ISeriesPrimitive, type SeriesAttachedParameter, type Time } from 'lightweight-charts';
import type { IntradayTfData, OffSessionSegment } from '@kansoku/shared/types';
export declare class OffSessionPrimitive implements ISeriesPrimitive<Time> {
    private chart;
    private requestUpdate?;
    private segments;
    private readonly paneView;
    attached(param: SeriesAttachedParameter<Time>): void;
    detached(): void;
    setData(segments: OffSessionSegment[]): void;
    updateAllViews(): void;
    paneViews(): readonly IPrimitivePaneView[];
    state(): {
        chart: IChartApiBase<Time> | null;
        segments: OffSessionSegment[];
    };
}
export interface FeedChart {
    chart: ReturnType<typeof createChart>;
    candle: ISeriesApi<'Candlestick'>;
    volume: ISeriesApi<'Histogram'>;
    hist: ISeriesApi<'Histogram'>;
    dif: ISeriesApi<'Line'>;
    dea: ISeriesApi<'Line'>;
    emas: ISeriesApi<'Line'>[];
    session: OffSessionPrimitive;
    lastTime: number | null;
}
export declare function createFeedChart(host: HTMLElement): FeedChart | null;
export declare function applyFeed(handles: FeedChart, data: IntradayTfData): void;
