import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CohortPoint } from "@kansoku/shared/types";
import {
  AXIS_COLOR,
  AXIS_LINE_COLOR,
  DOWN_COLOR,
  GRID_COLOR,
  UP_COLOR,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "./theme";
import { theme } from "@web/theme";

export function CohortChart({ rows }: { rows: CohortPoint[] }) {
  if (!rows.length) return <div className="error-box">没有可渲染的数据行</div>;
  const data = [...rows].reverse();
  const height = Math.max(220, data.length * 32 + 60);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 12, right: 72, bottom: 8, left: 16 }}>
        <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
        <XAxis
          type="number"
          stroke={AXIS_LINE_COLOR}
          tick={{ fill: AXIS_COLOR, fontSize: 11 }}
          tickLine={false}
          tickFormatter={(v: number) => v.toLocaleString()}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={92}
          stroke={AXIS_LINE_COLOR}
          tick={{ fill: theme.textPrimary, fontSize: 12 }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipContentStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          formatter={(value) => [Number(value).toLocaleString(), "净额"]}
        />
        <ReferenceLine x={0} stroke={AXIS_LINE_COLOR} />
        <Bar dataKey="value" barSize={18} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.value >= 0 ? UP_COLOR : DOWN_COLOR} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            fill={theme.textPrimary}
            fontSize={11}
            formatter={(v: unknown) => Number(v).toLocaleString()}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
