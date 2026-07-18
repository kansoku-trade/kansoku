import { Area, AreaChart, Brush, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FlowRow } from "@kansoku/shared/types";
import {
  AXIS_COLOR,
  AXIS_LINE_COLOR,
  DOWN_COLOR,
  GRID_COLOR,
  ZERO_LINE_COLOR,
  UP_COLOR,
  hhmm,
  tooltipTime,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "./theme";
import { theme } from "@web/theme";

export function FlowChart({ rows }: { rows: FlowRow[] }) {
  const data = rows
    .map((r) => ({ t: Date.parse(r.time), v: Number(r.inflow) }))
    .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.v));
  if (!data.length) return <div className="error-box">没有可渲染的数据行</div>;

  const values = data.map((d) => d.v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  let zeroOffset = max / (max - min);
  if (max <= 0) zeroOffset = 0;
  else if (min >= 0) zeroOffset = 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 20, right: 24, bottom: 4, left: 12 }}>
        <defs>
          <linearGradient id="flow-split" x1="0" y1="0" x2="0" y2="1">
            <stop offset={zeroOffset} stopColor={UP_COLOR} />
            <stop offset={zeroOffset} stopColor={DOWN_COLOR} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={hhmm}
          stroke={AXIS_LINE_COLOR}
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
        />
        <YAxis
          stroke={AXIS_LINE_COLOR}
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          tickFormatter={(v: number) => v.toLocaleString()}
          width={72}
          label={{ value: "累计主力净流入", angle: -90, position: "insideLeft", fill: AXIS_COLOR, fontSize: 11 }}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          labelFormatter={(t) => tooltipTime(Number(t))}
          formatter={(value) => [Number(value).toLocaleString(), "净流入"]}
        />
        <ReferenceLine y={0} stroke={ZERO_LINE_COLOR} strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="v"
          stroke="url(#flow-split)"
          strokeWidth={2}
          fill="url(#flow-split)"
          fillOpacity={0.18}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
        <Brush dataKey="t" height={18} travellerWidth={8} stroke={theme.borderStrong} fill={theme.bgElement} tickFormatter={hhmm} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
