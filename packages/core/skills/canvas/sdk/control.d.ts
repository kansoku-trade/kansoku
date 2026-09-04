export declare function Toggle({ label, value, onChange }: {
    label: string;
    value: boolean;
    onChange: (next: boolean) => void;
}): import("react").JSX.Element;
export declare function Select({ label, value, options, onChange }: {
    label?: string;
    value: string;
    options: {
        value: string;
        label: string;
    }[];
    onChange: (next: string) => void;
}): import("react").JSX.Element;
