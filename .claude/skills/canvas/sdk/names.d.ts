export declare const CANVAS_COMPONENT_NAMES: {
    readonly layout: readonly ['Canvas', 'Section', 'Grid', 'Row', 'Stack', 'Card', 'Divider'];
    readonly text: readonly ['H1', 'H2', 'H3', 'Heading', 'Text', 'Link', 'Callout', 'Pill', 'Badge', 'Source'];
    readonly data: readonly ['Stat', 'Metric', 'Table', 'Compare', 'Coverage'];
    readonly analysis: readonly ['Scenarios', 'RRPlan', 'Timeline'];
    readonly control: readonly ['Toggle', 'Select'];
    readonly chart: readonly ['LineChart', 'BarChart', 'AreaChart', 'PieChart', 'Sparkline', 'CandleChart'];
};
export declare const CANVAS_NON_COMPONENT_EXPORTS: readonly ['theme', 'useMemo', 'useState'];
export declare function canvasComponentNames(groups: readonly (keyof typeof CANVAS_COMPONENT_NAMES)[]): string[];
