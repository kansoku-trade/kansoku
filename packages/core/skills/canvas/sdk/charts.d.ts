type Point = {
    x: string | number;
    y: number;
    [key: string]: string | number;
};
type Series = {
    key: string;
    label?: string;
    color?: string;
};
export declare function LineChart({ title, data, xUnit, yUnit, series, }: {
    title?: string;
    data: Point[];
    xUnit?: string;
    yUnit?: string;
    series?: (string | Series)[];
}): import("react").JSX.Element;
export declare function BarChart({ title, data, xUnit, yUnit, signed, }: {
    title?: string;
    data: Point[];
    xUnit?: string;
    yUnit?: string;
    signed?: boolean;
}): import("react").JSX.Element;
export declare function AreaChart({ title, data, xUnit, yUnit, }: {
    title?: string;
    data: Point[];
    xUnit?: string;
    yUnit?: string;
}): import("react").JSX.Element;
export declare function PieChart({ title, data, }: {
    title?: string;
    data: {
        label: string;
        value: number;
        color?: string;
    }[];
}): import("react").JSX.Element;
export declare function Sparkline({ data, width, height, tone, }: {
    data: number[];
    width?: number;
    height?: number;
    tone?: 'up' | 'down' | 'neutral';
}): import("react").JSX.Element | null;
export {};
