import type { ChartDoc, ChartMeta } from "../../../../shared/types";
import { marketDate } from "../../../../shared/time";
import { useQuery } from "../../apiHooks";
import { SimpleChartView } from "../../charts/simple/SimpleChartView";
import { client } from "../../client";
import { useQueryParam } from "../../router";
import { Card, Empty, ErrorBox, SectionTitle } from "../../ui";

export const CROSS_SECTION_TYPES = "flow,cohort";

function ChartCard({ id }: { id: string }) {
  const { data: doc, error } = useQuery<ChartDoc>(`charts.get:${id}`, () => client.charts.get({ id }), {
    persist: false,
  });
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!doc || doc.built.kind !== "simple") return null;

  return (
    <Card className="cross-section-card">
      <div className="cross-section-card-title">{doc.title}</div>
      <div className="cross-section-card-body">
        <SimpleChartView built={doc.built} />
      </div>
    </Card>
  );
}

export function CrossSectionCharts({ date }: { date?: string } = {}) {
  const dateParam = useQueryParam("date");
  const { data: metas, error } = useQuery<ChartMeta[]>(`charts.list:${CROSS_SECTION_TYPES}`, () =>
    client.charts.list({ type: CROSS_SECTION_TYPES }),
  );

  const selected = date ?? dateParam ?? marketDate();
  const matches = (metas ?? []).filter((m) => marketDate(m.created_at) === selected);

  return (
    <div className="cross-section-charts">
      <SectionTitle>资金流向图表</SectionTitle>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!error && !metas && <div className="note-block">加载中…</div>}
      {!error && metas && matches.length === 0 && <Empty>{selected} 没有资金流向图表</Empty>}
      {matches.length > 0 && (
        <div className="cross-section-list">
          {matches.map((m) => (
            <ChartCard key={m.id} id={m.id} />
          ))}
        </div>
      )}
    </div>
  );
}
