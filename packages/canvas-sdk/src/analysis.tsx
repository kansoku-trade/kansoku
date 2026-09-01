import type { ReactNode } from 'react';
import { Card, Stack } from './layout.js';
import { theme } from './theme.js';

function num(value: number): string {
  return String(Number(value.toFixed(4)));
}

function ratio(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function toneColor(tone: 'up' | 'down' | 'neutral'): string {
  return tone === 'up' ? theme.up : tone === 'down' ? theme.down : theme.textSecondary;
}

function inferTone(label: string): 'up' | 'down' | 'neutral' {
  const normalized = label.toLowerCase();
  if (normalized.includes('bull') || label.includes('乐观') || label.includes('多')) return 'up';
  if (normalized.includes('bear') || label.includes('悲观') || label.includes('空')) return 'down';
  return 'neutral';
}

export interface Scenario {
  label: string;
  probability: number;
  trigger: string;
  note?: ReactNode;
  tone?: 'up' | 'down' | 'neutral';
}

export function Scenarios({ items }: { items: Scenario[] }) {
  const total = items.reduce((sum, item) => sum + item.probability, 0);
  return (
    <Stack gap="sm">
      {items.map((item) => {
        const color = toneColor(item.tone ?? inferTone(item.label));
        return (
          <Card key={item.label}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color }}>{item.label}</span>
              <span
                style={{
                  fontSize: 13,
                  color,
                  fontFamily: theme.fontMono,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {num(item.probability)}%
              </span>
            </div>
            <div
              style={{
                height: 3,
                margin: '6px 0 7px',
                background: theme.bgElement,
                borderRadius: theme.radius,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(0, Math.min(100, item.probability))}%`,
                  background: color,
                  borderRadius: theme.radius,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
              触发：{item.trigger}
            </div>
            {item.note ? (
              <div style={{ fontSize: 12, color: theme.textPrimary, lineHeight: 1.55, marginTop: 4 }}>
                {item.note}
              </div>
            ) : null}
          </Card>
        );
      })}
      {Math.round(total) === 100 ? null : (
        <div style={{ fontSize: 11, color: theme.down, fontFamily: theme.fontMono }}>
          概率合计 {num(total)}%，不是 100%
        </div>
      )}
    </Stack>
  );
}

export interface RRPlanProps {
  entry: number;
  stop: number;
  targets: number | number[];
  minRr?: number;
  unit?: string;
  note?: ReactNode;
}

export function RRPlan({ entry, stop, targets, minRr = 1.5, unit, note }: RRPlanProps) {
  const list = (Array.isArray(targets) ? targets : [targets]).filter((value) =>
    Number.isFinite(value),
  );
  const risk = Math.abs(entry - stop);
  const rows = list.map((target, index) => ({
    label: list.length > 1 ? `T${index + 1}` : '目标',
    price: target,
    rr: risk === 0 ? null : Math.abs(target - entry) / risk,
  }));
  const marks = [
    { label: '止损', price: stop, color: theme.down },
    { label: '入场', price: entry, color: theme.textPrimary },
    ...rows.map((row) => ({ label: row.label, price: row.price, color: theme.up })),
  ];
  const prices = marks.map((mark) => mark.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const span = high - low;

  return (
    <Card>
      <div style={{ position: 'relative', height: 34, margin: '0 30px 6px' }}>
        <div
          style={{
            position: 'absolute',
            top: 21,
            left: 0,
            right: 0,
            height: 1,
            background: theme.borderStrong,
          }}
        />
        {marks.map((mark) => (
          <div
            key={`${mark.label}-${mark.price}`}
            style={{
              position: 'absolute',
              top: 0,
              left: `${span === 0 ? 50 : ((mark.price - low) / span) * 100}%`,
              transform: 'translateX(-50%)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontSize: 10, color: theme.textMuted }}>{mark.label}</div>
            <div
              style={{
                fontSize: 12,
                color: mark.color,
                fontFamily: theme.fontMono,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {num(mark.price)}
            </div>
            <div style={{ width: 1, height: 6, margin: '0 auto', background: mark.color }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: theme.textSecondary }}>
          风险 {num(risk)}
          {unit ? ` ${unit}` : ''}
        </span>
        {rows.map((row) => (
          <span
            key={row.label}
            style={{
              fontSize: 11,
              fontFamily: theme.fontMono,
              fontVariantNumeric: 'tabular-nums',
              color: row.rr !== null && row.rr < minRr ? theme.down : theme.up,
            }}
          >
            {row.label} 盈亏比 {row.rr === null ? 'n/a' : `${ratio(row.rr)}:1`}
          </span>
        ))}
      </div>
      {rows.some((row) => row.rr !== null && row.rr < minRr) ? (
        <div style={{ fontSize: 11, color: theme.down, marginTop: 5 }}>
          低于下限 {ratio(minRr)}:1，不该进场
        </div>
      ) : null}
      {note ? (
        <div style={{ fontSize: 12, color: theme.textPrimary, lineHeight: 1.55, marginTop: 6 }}>
          {note}
        </div>
      ) : null}
    </Card>
  );
}

export interface TimelineItem {
  at: string;
  label: string;
  detail?: ReactNode;
  price?: number;
  tone?: 'up' | 'down' | 'neutral';
  current?: boolean;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <Stack gap={0}>
      {items.map((item, index) => {
        const color = toneColor(item.tone ?? 'neutral');
        const last = index === items.length - 1;
        return (
          <div key={`${item.at}-${item.label}`} style={{ display: 'flex', gap: 10 }}>
            <div
              style={{
                flex: '0 0 68px',
                fontSize: 11,
                color: theme.textMuted,
                fontFamily: theme.fontMono,
                paddingTop: 2,
                textAlign: 'right',
              }}
            >
              {item.at}
            </div>
            <div style={{ flex: '0 0 9px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span
                style={{
                  width: item.current ? 9 : 6,
                  height: item.current ? 9 : 6,
                  marginTop: 5,
                  borderRadius: '50%',
                  background: item.current ? color : theme.bgCanvas,
                  border: `1px solid ${color}`,
                }}
              />
              {last ? null : <span style={{ flex: '1 1 auto', width: 1, background: theme.borderStrong }} />}
            </div>
            <div style={{ flex: '1 1 auto', paddingBottom: last ? 0 : 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: theme.textPrimary }}>{item.label}</span>
                {item.price === undefined ? null : (
                  <span
                    style={{
                      fontSize: 12,
                      color,
                      fontFamily: theme.fontMono,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {num(item.price)}
                  </span>
                )}
              </div>
              {item.detail ? (
                <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5, marginTop: 2 }}>
                  {item.detail}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </Stack>
  );
}
