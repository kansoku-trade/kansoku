import type { CSSProperties, ReactNode } from 'react';
import { Sparkline } from './charts.js';
import { Card, Stack } from './layout.js';
import { space, theme, type } from './theme.js';

export function Stat({
  label,
  value,
  delta,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  delta?: string;
  note?: ReactNode;
  tone?: 'up' | 'down' | 'neutral';
}) {
  const toneColor = tone === 'up' ? theme.up : tone === 'down' ? theme.down : theme.textPrimary;
  return (
    <Card>
      <div style={{ fontSize: type.small, color: theme.textSecondary, marginBottom: 3 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: type.stat,
          fontWeight: 400,
          letterSpacing: '-0.01em',
          fontFamily: theme.fontMono,
          fontVariantNumeric: 'tabular-nums',
          color: toneColor,
        }}
      >
        {value}
      </div>
      {delta ? (
        <div
          style={{
            fontSize: type.caption,
            marginTop: 2,
            color: toneColor,
            fontFamily: theme.fontMono,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {delta}
        </div>
      ) : null}
      {note ? (
        <div style={{ fontSize: type.small, marginTop: 3, color: theme.textSecondary }}>{note}</div>
      ) : null}
    </Card>
  );
}

export function Metric({
  label,
  value,
  delta,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  delta?: string;
  note?: ReactNode;
  tone?: 'up' | 'down' | 'neutral';
}) {
  return <Stat label={label} value={value} delta={delta} note={note} tone={tone} />;
}

type TableColumn = { key: string; header: string; align?: 'left' | 'right' };

function headCell(align: 'left' | 'right', first = false): CSSProperties {
  return {
    textAlign: align,
    fontWeight: 400,
    color: theme.textMuted,
    fontSize: type.small,
    padding: first ? `0 0 ${space.cellY}px` : `0 0 ${space.cellY}px ${space.cellX}px`,
    borderBottom: `1px solid ${theme.border}`,
  };
}

function bodyCell(align: 'left' | 'right', first = false): CSSProperties {
  return {
    textAlign: align,
    padding: first ? `${space.cellY}px 0` : `${space.cellY}px 0 ${space.cellY}px ${space.cellX}px`,
    borderBottom: '1px solid #1a1a1a',
    color: theme.textPrimary,
  };
}

function normalizeColumns(columns: Array<string | TableColumn>): TableColumn[] {
  return columns.map((col, index) =>
    typeof col === 'string' ? { key: String(index), header: col } : col,
  );
}

function normalizeRows(
  columns: TableColumn[],
  rows: Array<Record<string, ReactNode> | ReactNode[]>,
): Record<string, ReactNode>[] {
  return rows.map((row) => {
    if (!Array.isArray(row)) return row;
    const rec: Record<string, ReactNode> = {};
    for (const [index, col] of columns.entries()) rec[col.key] = row[index];
    return rec;
  });
}

export function Table({
  columns,
  rows,
}: {
  columns: Array<string | TableColumn>;
  rows: Array<Record<string, ReactNode> | ReactNode[]>;
}) {
  const cols = normalizeColumns(columns);
  const data = normalizeRows(cols, rows);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: type.caption }}>
      <thead>
        <tr>
          {cols.map((col, index) => (
            <th key={col.key} style={headCell(col.align ?? 'left', index === 0)}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={index}>
            {cols.map((col, index) => (
              <td
                key={col.key}
                style={{
                  ...bodyCell(col.align ?? 'left', index === 0),
                  fontFamily: col.align === 'right' ? theme.fontMono : undefined,
                  fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : undefined,
                }}
              >
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface CompareMetric {
  key: string;
  label: string;
  align?: 'left' | 'right';
  signed?: boolean;
  suffix?: string;
}

export interface CompareRow {
  symbol: string;
  label?: string;
  values: Record<string, string | number>;
  trend?: number[];
  note?: ReactNode;
}

function signedColor(value: string | number): string | undefined {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric === 0) return undefined;
  return numeric > 0 ? theme.up : theme.down;
}

export function Compare({
  metrics,
  rows,
  sortBy,
  trendLabel = '走势',
}: {
  metrics: CompareMetric[];
  rows: CompareRow[];
  sortBy?: string;
  trendLabel?: string;
}) {
  const ordered = sortBy
    ? [...rows].sort((a, b) => Number(b.values[sortBy] ?? 0) - Number(a.values[sortBy] ?? 0))
    : rows;
  const hasTrend = ordered.some((row) => (row.trend?.length ?? 0) > 1);
  const hasNote = ordered.some((row) => row.note != null);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: type.caption }}>
      <thead>
        <tr>
          <th style={headCell('left', true)}>标的</th>
          {hasTrend ? <th style={headCell('left')}>{trendLabel}</th> : null}
          {metrics.map((metric) => (
            <th key={metric.key} style={headCell(metric.align ?? 'right')}>
              {metric.label}
            </th>
          ))}
          {hasNote ? <th style={headCell('left')}>备注</th> : null}
        </tr>
      </thead>
      <tbody>
        {ordered.map((row) => (
          <tr key={row.symbol}>
            <td style={bodyCell('left', true)}>
              <span style={{ fontFamily: theme.fontMono }}>{row.symbol}</span>
              {row.label ? (
                <span style={{ color: theme.textMuted, marginLeft: 6 }}>{row.label}</span>
              ) : null}
            </td>
            {hasTrend ? (
              <td style={bodyCell('left')}>
                {row.trend && row.trend.length > 1 ? <Sparkline data={row.trend} /> : null}
              </td>
            ) : null}
            {metrics.map((metric) => {
              const value = row.values[metric.key];
              const align = metric.align ?? 'right';
              return (
                <td
                  key={metric.key}
                  style={{
                    ...bodyCell(align),
                    color: metric.signed
                      ? (signedColor(value) ?? theme.textPrimary)
                      : theme.textPrimary,
                    fontFamily: align === 'right' ? theme.fontMono : undefined,
                    fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined,
                  }}
                >
                  {value == null ? '—' : `${value}${metric.suffix ?? ''}`}
                </td>
              );
            })}
            {hasNote ? (
              <td style={{ ...bodyCell('left'), color: theme.textSecondary }}>{row.note}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const COVERAGE_TONE = {
  ok: { color: theme.up, mark: '有' },
  partial: { color: theme.accent, mark: '部分' },
  missing: { color: theme.down, mark: '无' },
} as const;

export function Coverage({
  items,
}: {
  items: { label: string; status: 'ok' | 'partial' | 'missing'; note?: ReactNode }[];
}) {
  return (
    <Stack gap="sm">
      {items.map((item) => {
        const tone = COVERAGE_TONE[item.status];
        return (
          <div key={item.label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span
              style={{
                flex: '0 0 34px',
                fontSize: 11,
                color: tone.color,
                fontFamily: theme.fontMono,
              }}
            >
              {tone.mark}
            </span>
            <span style={{ fontSize: 12, color: theme.textPrimary, flex: '0 0 auto' }}>
              {item.label}
            </span>
            {item.note ? (
              <span style={{ fontSize: 12, color: theme.textMuted }}>{item.note}</span>
            ) : null}
          </div>
        );
      })}
    </Stack>
  );
}
