import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CapitalBucket, CockpitFlow } from "../../../../shared/types";
import { fullTime, hhmm, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "../../charts/simple/theme";
import { signed, upDown } from "../../format";
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

function FlowMiniChart({ flow }: { flow: CockpitFlow }) {
  const data = flow.curve
    .map((p) => ({ t: p.time, v: p.value }))
    .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.v));
  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#21262d" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={hhmm}
            tick={{ fill: "#8b949e", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "#30363d" }}
            minTickGap={40}
          />
          <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            labelFormatter={(t) => fullTime(Number(t))}
            formatter={(value) => [Number(value).toLocaleString(), "净流入"]}
          />
          <ReferenceLine y={0} stroke="#30363d" />
          <Bar dataKey="v" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.t} fill={d.v >= 0 ? "#26a69a" : "#ef5350"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FlowTab({ symbol }: { symbol: string }) {
  const { data: flow, error } = useIntervalFetch<CockpitFlow>(`/api/symbols/${encodeURIComponent(symbol)}/flow`, 60_000);

  if (error) return <div className="note-block">资金流数据获取失败：{error}</div>;
  if (!flow) return <div className="note-block">加载中…</div>;

  return (
    <>
      <div className="section-title">资金净流入（原始数值，单位未知）</div>
      <FlowMiniChart flow={flow} />
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
