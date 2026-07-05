import type { ChartMeta } from "../../../../shared/types";
import { useQuery } from "../../apiHooks";

export function TodayCharts({ date }: { date: string | null }) {
  const { data: charts } = useQuery<ChartMeta[]>("/api/charts");
  if (!date || !charts) return null;
  const today = charts.filter((m) => m.id.startsWith(date));
  if (today.length === 0) return null;

  return (
    <div className="today-charts">
      <div className="section-title">今日图表</div>
      <div className="today-charts-row">
        {today.map((m) => (
          <a key={m.id} className="today-chart-chip" href={`#/charts/${encodeURIComponent(m.id)}`}>
            <span className={`badge ${m.type}`}>{m.type}</span>
            <span className="title">{m.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
