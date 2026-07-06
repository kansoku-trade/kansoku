import { useState } from "react";
import type { ChartDoc, ChartMeta } from "../../../../shared/types";
import { marketDate } from "../../../../shared/time";
import { useQuery } from "../../apiHooks";
import { SimpleChartView } from "../../charts/simple/SimpleChartView";
import { useQueryParam } from "../../router";
import { Card, Chip, Empty, ErrorBox, SectionTitle } from "../../ui";

const CROSS_SECTION_TYPES = "flow,cohort";

function ChartCard({ id }: { id: string }) {
  const { data: doc, error } = useQuery<ChartDoc>(`/api/charts/${encodeURIComponent(id)}`);
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

export function CrossSectionCharts() {
  const dateParam = useQueryParam("date");
  const [manualDate, setManualDate] = useState<string | null>(null);
  const { data: metas, error } = useQuery<ChartMeta[]>(`/api/charts?type=${CROSS_SECTION_TYPES}`);

  const dates = [...new Set((metas ?? []).map((m) => marketDate(m.created_at)))].sort().reverse();
  const selected = manualDate ?? dateParam ?? marketDate();
  const matches = (metas ?? []).filter((m) => marketDate(m.created_at) === selected);

  return (
    <div className="cross-section-charts">
      <SectionTitle>资金流向图表</SectionTitle>
      {error && <ErrorBox>{error}</ErrorBox>}
      {dates.length > 0 && (
        <div className="cross-section-switcher">
          {dates.map((d) => (
            <Chip key={d} active={d === selected} onClick={() => setManualDate(d)}>
              {d}
            </Chip>
          ))}
        </div>
      )}
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
