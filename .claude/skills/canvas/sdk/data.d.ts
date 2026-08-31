import type { ReactNode } from 'react';
export declare function Stat({ label, value, delta, tone }: {
    label: string;
    value: string;
    delta?: string;
    tone?: 'up' | 'down' | 'neutral';
}): import("react").JSX.Element;
export declare function Metric({ label, value, delta, tone }: {
    label: string;
    value: string;
    delta?: string;
    tone?: 'up' | 'down' | 'neutral';
}): import("react").JSX.Element;
type TableColumn = {
    key: string;
    header: string;
    align?: 'left' | 'right';
};
export declare function Table({ columns, rows }: {
    columns: Array<string | TableColumn>;
    rows: Array<Record<string, ReactNode> | ReactNode[]>;
}): import("react").JSX.Element;
export interface CompareMetric {
    key: string;
    label: string;
    align?: 'left' | 'right';
    signed?: boolean;
    suffix?: string;
}
export interface CompareRow {
    symbol: string;
    label?: string;
    values: Record<string, string | number>;
    trend?: number[];
    note?: ReactNode;
}
export declare function Compare({ metrics, rows, sortBy, trendLabel }: {
    metrics: CompareMetric[];
    rows: CompareRow[];
    sortBy?: string;
    trendLabel?: string;
}): import("react").JSX.Element;
export declare function Coverage({ items }: {
    items: {
        label: string;
        status: 'ok' | 'partial' | 'missing';
        note?: ReactNode;
    }[];
}): import("react").JSX.Element;
export {};
