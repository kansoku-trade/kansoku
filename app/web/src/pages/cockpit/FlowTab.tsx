import type { CapitalBucket, CockpitFlow } from "../../../../shared/types";
import { signed, upDown } from "../../format";
import { MiniEChart } from "./MiniEChart";
import { useIntervalFetch } from "./useIntervalFetch";

const BUCKET_LABEL: Record<string, string> = { large: "大单", medium: "中单", small: "小单" };

function BucketRow({ label, bucket }: { label: string; bucket: CapitalBucket }) {
  return (
    <>
      <div className="k">{label}</div>
      <div className={`v ${upDown(bucket.net)}`}>{signed(bucket.net, 0)}</div>
    </>
  );
}

function buildFlowOption(flow: CockpitFlow) {
  return {
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: { type: "time", axisLabel: { color: "#8b949e", fontSize: 10 } },
    yAxis: { type: "value", axisLabel: { color: "#8b949e", fontSize: 10 }, splitLine: { lineStyle: { color: "#21262d" } } },
    series: [
      {
        type: "bar",
        data: flow.curve.map((p) => [p.time, p.value]),
        itemStyle: {
          color: (params: { value: [number, number] }) => (params.value[1] >= 0 ? "#26a69a" : "#ef5350"),
        },
        markLine: { silent: true, symbol: "none", lineStyle: { color: "#30363d" }, data: [{ yAxis: 0 }] },
      },
    ],
    tooltip: { trigger: "axis" },
  };
}

export function FlowTab({ symbol }: { symbol: string }) {
  const { data: flow, error } = useIntervalFetch<CockpitFlow>(`/api/symbols/${encodeURIComponent(symbol)}/flow`, 60_000);

  if (error) return <div className="note-block">资金流数据获取失败：{error}</div>;
  if (!flow) return <div className="note-block">加载中…</div>;

  return (
    <>
      <div className="section-title">资金净流入（原始数值，单位未知）</div>
      <MiniEChart option={buildFlowOption(flow)} height={180} />
      {flow.distribution ? (
        <>
          <div className="section-title">大/中/小单净额</div>
          <div className="grid2">
            <BucketRow label={BUCKET_LABEL.large} bucket={flow.distribution.large} />
            <BucketRow label={BUCKET_LABEL.medium} bucket={flow.distribution.medium} />
            <BucketRow label={BUCKET_LABEL.small} bucket={flow.distribution.small} />
          </div>
        </>
      ) : (
        <div className="note-block">分布暂不可用</div>
      )}
    </>
  );
}
