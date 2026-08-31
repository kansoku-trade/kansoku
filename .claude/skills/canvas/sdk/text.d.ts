import type { ReactNode } from 'react';
import type { Box } from './layout.js';
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
