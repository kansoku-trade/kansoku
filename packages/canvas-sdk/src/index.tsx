import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { theme } from './theme.js';

export { useMemo, useState };
export { theme };
import { Pill } from './charts.js';

export {
  AreaChart,
  BarChart,
  Callout,
  Divider,
  LineChart,
  PieChart,
  Pill,
  Select,
  Toggle,
} from './charts.js';
export { CandleChart } from './CandleChart.js';

type Box = { children?: ReactNode; style?: CSSProperties };

const font =
  'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

export function Canvas({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
} & Box) {
  return (
    <div
      style={{
        minHeight: '100%',
        background: theme.bgCanvas,
        color: theme.textPrimary,
        fontFamily: font,
        padding: '18px 20px 28px',
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 500,
          color: theme.textPrimary,
        }}
      >
        {title}
      </h1>
      {caption ? (
        <p
          style={{
            margin: '3px 0 0',
            fontSize: 10.5,
            color: theme.textMuted,
          }}
        >
          {caption}
        </p>
      ) : null}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string } & Box) {
  return (
    <section style={{ margin: '20px 0 8px' }}>
      <div
        style={{
          fontSize: 10,
          color: theme.textMuted,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

export function Grid({ columns = 2, children }: { columns?: number } & Box) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function gapSize(gap?: string | number): number {
  if (typeof gap === 'number') return gap;
  if (gap === 'lg') return 16;
  if (gap === 'sm') return 8;
  return 12;
}

export function Row({
  children,
  style,
  gap,
  justify,
  align,
}: Box & { gap?: string | number; justify?: string; align?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: gapSize(gap),
        alignItems: align === 'center' ? 'center' : 'flex-start',
        justifyContent: justify === 'between' ? 'space-between' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Stack({ children, style, gap }: Box & { gap?: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: gapSize(gap), ...style }}>
      {children}
    </div>
  );
}

export function Card({ children, style }: Box) {
  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: 6,
        padding: '9px 11px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function H1({ children }: Box) {
  return (
    <h1 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: theme.textPrimary }}>{children}</h1>
  );
}

export function H2({ children }: Box) {
  return (
    <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: theme.textPrimary }}>{children}</h2>
  );
}

export function H3({ children }: Box) {
  return (
    <h3 style={{ margin: 0, fontSize: 12, fontWeight: 500, color: theme.textPrimary }}>{children}</h3>
  );
}

export function Text({ children, style, muted }: Box & { muted?: boolean }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12,
        lineHeight: 1.55,
        color: muted ? theme.textMuted : theme.textPrimary,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function Heading({
  level = 2,
  children,
}: Box & { level?: 1 | 2 | 3 }) {
  if (level === 1) return <H1>{children}</H1>;
  if (level === 3) return <H3>{children}</H3>;
  return <H2>{children}</H2>;
}

export function Badge({
  children,
  tone,
}: {
  children?: ReactNode;
  tone?: string;
}) {
  const mapped = tone === 'up' || tone === 'down' ? tone : 'neutral';
  return <Pill tone={mapped}>{children}</Pill>;
}

export function Metric({
  label,
  value,
  delta,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: 'up' | 'down' | 'neutral';
}) {
  return <Stat label={label} value={value} delta={delta} tone={tone} />;
}

export function Link({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      style={{ color: theme.accent, fontSize: 12, textDecoration: 'underline' }}
    >
      {children}
    </a>
  );
}

export function Stat({
  label,
  value,
  delta,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: 'up' | 'down' | 'neutral';
}) {
  const toneColor =
    tone === 'up' ? theme.up : tone === 'down' ? theme.down : theme.textPrimary;
  return (
    <Card>
      <div style={{ fontSize: 10, color: theme.textSecondary, marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontSize: 19,
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
            fontSize: 10,
            marginTop: 2,
            color: toneColor,
            fontFamily: theme.fontMono,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {delta}
        </div>
      ) : null}
    </Card>
  );
}

type TableColumn = { key: string; header: string; align?: 'left' | 'right' };

function normalizeColumns(
  columns: Array<string | TableColumn>,
): TableColumn[] {
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
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr>
          {cols.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: col.align ?? 'left',
                fontWeight: 400,
                color: theme.textMuted,
                fontSize: 9.5,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                padding: '0 0 5px',
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={index}>
            {cols.map((col) => (
              <td
                key={col.key}
                style={{
                  textAlign: col.align ?? 'left',
                  padding: '5px 0',
                  borderBottom: '1px solid #1a1a1a',
                  color: theme.textPrimary,
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
