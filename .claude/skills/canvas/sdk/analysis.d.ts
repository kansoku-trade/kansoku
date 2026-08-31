import type { ReactNode } from 'react';
export interface Scenario {
    label: string;
    probability: number;
    trigger: string;
    note?: ReactNode;
    tone?: 'up' | 'down' | 'neutral';
}
export declare function Scenarios({ items }: {
    items: Scenario[];
}): import("react").JSX.Element;
export interface RRPlanProps {
    entry: number;
    stop: number;
    targets: number | number[];
    minRr?: number;
    unit?: string;
    note?: ReactNode;
}
export declare function RRPlan({ entry, stop, targets, minRr, unit, note }: RRPlanProps): import("react").JSX.Element;
export interface TimelineItem {
    at: string;
    label: string;
    detail?: ReactNode;
    price?: number;
    tone?: 'up' | 'down' | 'neutral';
    current?: boolean;
}
export declare function Timeline({ items }: {
    items: TimelineItem[];
}): import("react").JSX.Element;
