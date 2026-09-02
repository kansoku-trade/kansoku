import type { CSSProperties, ReactNode } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  AreaChart as ReAreaChart,
  BarChart as ReBarChart,
  LineChart as ReLineChart,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { seriesPalette, theme, type } from './theme.js';

type Point = { x: string | number; y: number; [key: string]: string | number };
type Series = { key: string; label?: string; color?: string };

function normalizeSeries(series?: (string | Series)[]): Series[] {
  return (series ?? []).map((item) => (typeof item === 'string' ? { key: item } : item));
}

const tooltipStyle: CSSProperties = {
  backgroundColor: theme.bgSurface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  color: theme.textPrimary,
  fontSize: type.caption,
};

function ChartFrame({
  title,
  xUnit,
  height = 220,
  children,
}: {
  title?: string;
  xUnit?: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: type.caption, fontWeight: 500, color: theme.textSecondary }}>
          {title?.trim() ? title : 'Untitled'}
        </span>
        {xUnit ? (
          <span style={{ fontSize: type.small, color: theme.textMuted }}>横轴：{xUnit}</span>
        ) : null}
      </div>
      <div style={{ width: '100%', height }}>{children}</div>
    </div>
  );
}

// Recharts 的 axis label 无论放哪个 position 都会压住端点刻度，所以单位并进刻度文字。
function axisProps(unit?: string) {
  return {
    tick: { fill: theme.textSecondary, fontSize: type.small },
    tickLine: false as const,
    axisLine: { stroke: theme.borderStrong },
    tickFormatter: unit ? (value: string | number) => `${value}${unit}` : undefined,
  };
}

export function LineChart({
  title,
  data,
  xUnit,
  yUnit,
  series,
}: {
  title?: string;
  data: Point[];
  xUnit?: string;
  yUnit?: string;
  series?: (string | Series)[];
}) {
  const normalized = normalizeSeries(series);
  const lines = normalized.length > 0 ? normalized : [{ key: 'y', label: yUnit ?? 'y' }];
  return (
    <ChartFrame title={title} xUnit={xUnit}>
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.gridLine} vertical={false} />
          <XAxis dataKey="x" {...axisProps()} minTickGap={28} />
          <YAxis {...axisProps(yUnit)} width={48} />
          <Tooltip contentStyle={tooltipStyle} />
          {lines.length > 1 ? <Legend /> : null}
          {lines.map((item, index) => (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              name={item.label ?? item.key}
              stroke={item.color ?? seriesPalette[index % seriesPalette.length]}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BarChart({
  title,
  data,
  xUnit,
  yUnit,
  signed = false,
}: {
  title?: string;
  data: Point[];
  xUnit?: string;
  yUnit?: string;
  signed?: boolean;
}) {
  return (
    <ChartFrame title={title} xUnit={xUnit}>
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.gridLine} vertical={false} />
          <XAxis dataKey="x" {...axisProps()} minTickGap={28} />
          <YAxis {...axisProps(yUnit)} width={48} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="y" isAnimationActive={false} fill={theme.accent}>
            {signed
              ? data.map((point, index) => (
                  <Cell key={index} fill={Number(point.y) >= 0 ? theme.up : theme.down} />
                ))
              : null}
          </Bar>
        </ReBarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function AreaChart({
  title,
  data,
  xUnit,
  yUnit,
}: {
  title?: string;
  data: Point[];
  xUnit?: string;
  yUnit?: string;
}) {
  return (
    <ChartFrame title={title} xUnit={xUnit}>
      <ResponsiveContainer width="100%" height="100%">
        <ReAreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.gridLine} vertical={false} />
          <XAxis dataKey="x" {...axisProps()} minTickGap={28} />
          <YAxis {...axisProps(yUnit)} width={48} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area
            type="monotone"
            dataKey="y"
            stroke={theme.accent}
            fill={theme.accent}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        </ReAreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function PieChart({
  title,
  data,
}: {
  title?: string;
  data: { label: string; value: number; color?: string }[];
}) {
  const rows = data.map((item) => ({ name: item.label, value: item.value, color: item.color }));
  return (
    <ChartFrame title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <RePieChart>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={46}
            outerRadius={72}
            isAnimationActive={false}
          >
            {rows.map((item, index) => (
              <Cell
                key={item.name}
                fill={item.color ?? seriesPalette[index % seriesPalette.length]}
              />
            ))}
          </Pie>
        </RePieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function Sparkline({
  data,
  width = 56,
  height = 16,
  tone,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: 'up' | 'down' | 'neutral';
}) {
  if (data.length < 2) return null;
  const low = Math.min(...data);
  const high = Math.max(...data);
  const span = high - low || 1;
  const step = width / (data.length - 1);
  const points = data
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - ((value - low) / span) * height).toFixed(1)}`,
    )
    .join(' ');
  const drift = data.at(-1)! - data[0];
  const resolved = tone ?? (drift > 0 ? 'up' : drift < 0 ? 'down' : 'neutral');
  const stroke =
    resolved === 'up' ? theme.up : resolved === 'down' ? theme.down : theme.textSecondary;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.2} />
    </svg>
  );
}
