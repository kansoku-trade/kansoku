import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import { seriesPalette, theme } from './theme.js';

type Point = { x: string | number; y: number; [key: string]: string | number };
type Series = { key: string; label?: string; color?: string };

const tooltipStyle: CSSProperties = {
  backgroundColor: theme.bgSurface,
  border: `1px solid ${theme.border}`,
  borderRadius: 4,
  color: theme.textPrimary,
  fontSize: 12,
};

function ChartFrame({
  title,
  height = 220,
  children,
}: {
  title?: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div style={{ margin: '8px 0 16px' }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: theme.textPrimary,
          marginBottom: 8,
        }}
      >
        {title?.trim() ? title : 'Untitled'}
      </div>
      <div style={{ width: '100%', height }}>{children}</div>
    </div>
  );
}

function axisProps(unit?: string) {
  return {
    tick: { fill: theme.textSecondary, fontSize: 10 },
    tickLine: false as const,
    axisLine: { stroke: theme.borderStrong },
    label: unit
      ? { value: unit, position: 'insideTopRight' as const, fill: theme.textMuted, fontSize: 10 }
      : undefined,
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
  series?: Series[];
}) {
  const lines = series?.length ? series : [{ key: 'y', label: yUnit ?? 'y' }];
  return (
    <ChartFrame title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.gridLine} vertical={false} />
          <XAxis dataKey="x" {...axisProps(xUnit)} minTickGap={28} />
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
    <ChartFrame title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.gridLine} vertical={false} />
          <XAxis dataKey="x" {...axisProps(xUnit)} minTickGap={28} />
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
    <ChartFrame title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <ReAreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.gridLine} vertical={false} />
          <XAxis dataKey="x" {...axisProps(xUnit)} minTickGap={28} />
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
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} isAnimationActive={false}>
            {rows.map((item, index) => (
              <Cell key={item.name} fill={item.color ?? seriesPalette[index % seriesPalette.length]} />
            ))}
          </Pie>
        </RePieChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function Callout({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'up' | 'down' | 'warn';
  children: ReactNode;
}) {
  const accent =
    tone === 'up' ? theme.up : tone === 'down' ? theme.down : tone === 'warn' ? theme.accent : theme.borderStrong;
  return (
    <div
      style={{
        borderLeft: `3px solid ${accent}`,
        background: theme.bgSurface,
        padding: '8px 11px',
        margin: '8px 0',
        fontSize: 12,
        lineHeight: 1.55,
        color: theme.textPrimary,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'up' | 'down' | 'neutral';
}) {
  const color = tone === 'up' ? theme.up : tone === 'down' ? theme.down : theme.textSecondary;
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        lineHeight: '16px',
        padding: '0 6px',
        borderRadius: 999,
        border: `1px solid ${theme.border}`,
        color,
        background: theme.bgElement,
      }}
    >
      {children}
    </span>
  );
}

export function Divider() {
  return <hr style={{ border: 0, borderTop: `1px solid ${theme.border}`, margin: '14px 0' }} />;
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: theme.textPrimary,
        cursor: 'pointer',
      }}
    >
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.textPrimary }}>
      {label ? <span style={{ color: theme.textSecondary }}>{label}</span> : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: theme.bgElement,
          color: theme.textPrimary,
          border: `1px solid ${theme.border}`,
          borderRadius: 4,
          padding: '3px 6px',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useToggle(initial = false): [boolean, (next?: boolean) => void] {
  const [value, setValue] = useState(initial);
  const toggle = useMemo(
    () => (next?: boolean) => setValue((current) => (next === undefined ? !current : next)),
    [],
  );
  return [value, toggle];
}
