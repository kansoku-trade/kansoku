export const CANVAS_COMPONENT_NAMES = {
  layout: ['Canvas', 'Section', 'Grid', 'Row', 'Stack', 'Card', 'Divider'],
  text: ['H1', 'H2', 'H3', 'Heading', 'Text', 'Link', 'Callout', 'Pill', 'Badge', 'Source'],
  data: ['Stat', 'Metric', 'Table', 'Compare', 'Coverage'],
  analysis: ['Scenarios', 'RRPlan', 'Timeline'],
  control: ['Toggle', 'Select'],
  chart: ['LineChart', 'BarChart', 'AreaChart', 'PieChart', 'Sparkline', 'CandleChart'],
} as const;

export const CANVAS_NON_COMPONENT_EXPORTS = [
  'theme',
  'useCandles',
  'useMemo',
  'useQuote',
  'useState',
] as const;

export function canvasComponentNames(
  groups: readonly (keyof typeof CANVAS_COMPONENT_NAMES)[],
): string[] {
  return groups.flatMap((group) => [...CANVAS_COMPONENT_NAMES[group]]);
}
