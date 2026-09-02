import type { CSSProperties, ReactNode } from 'react';
export type Box = {
    children?: ReactNode;
    style?: CSSProperties;
};
export declare function Canvas({ title, caption, children }: {
    title: string;
    caption?: string;
} & Box): import("react").JSX.Element;
export declare function Section({ title, children }: {
    title: string;
} & Box): import("react").JSX.Element;
export declare function Grid({ columns, children }: {
    columns?: number;
} & Box): import("react").JSX.Element;
export declare function Row({ children, style, gap, justify, align }: Box & {
    gap?: string | number;
    justify?: string;
    align?: string;
}): import("react").JSX.Element;
export declare function Stack({ children, style, gap }: Box & {
    gap?: string | number;
}): import("react").JSX.Element;
export declare function Card({ children, style }: Box): import("react").JSX.Element;
export declare function Divider(): import("react").JSX.Element;

export declare function H1({ children }: Box): import("react").JSX.Element;
export declare function H2({ children }: Box): import("react").JSX.Element;
export declare function H3({ children }: Box): import("react").JSX.Element;
export declare function Heading({ level, children }: Box & {
    level?: 1 | 2 | 3;
}): import("react").JSX.Element;
export declare function Text({ children, style, muted }: Box & {
    muted?: boolean;
}): import("react").JSX.Element;
export declare function Link({ href, children }: {
    href?: string;
    children?: ReactNode;
}): import("react").JSX.Element;
export declare function Callout({ tone, children }: {
    tone?: 'neutral' | 'up' | 'down' | 'warn';
    children: ReactNode;
}): import("react").JSX.Element;
export declare function Pill({ children, tone }: {
    children: ReactNode;
    tone?: 'up' | 'down' | 'neutral';
}): import("react").JSX.Element;
export declare function Badge({ children, tone }: {
    children?: ReactNode;
    tone?: string;
}): import("react").JSX.Element;
export declare function Source({ from, at, note }: {
    from: string;
    at?: string;
    note?: ReactNode;
}): import("react").JSX.Element;

export declare function Stat({ label, value, delta, note, tone }: {
    label: string;
    value: string;
    delta?: string;
    note?: ReactNode;
    tone?: 'up' | 'down' | 'neutral';
}): import("react").JSX.Element;
export declare function Metric({ label, value, delta, note, tone }: {
    label: string;
    value: string;
    delta?: string;
    note?: ReactNode;
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
