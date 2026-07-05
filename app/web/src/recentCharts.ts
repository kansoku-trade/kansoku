const KEY = "trade.recent-charts";
const MAX = 5;

export interface RecentChart {
  id: string;
  title: string;
  type: string;
}

export function listRecentCharts(): RecentChart[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === "string") : [];
  } catch {
    return [];
  }
}

export function recordRecentChart(chart: RecentChart): void {
  try {
    const list = [chart, ...listRecentCharts().filter((c) => c.id !== chart.id)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return;
  }
}
