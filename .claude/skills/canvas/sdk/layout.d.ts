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
