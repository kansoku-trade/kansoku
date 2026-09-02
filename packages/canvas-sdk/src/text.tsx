import type { ReactNode } from 'react';
import type { Box } from './layout.js';
import { space, theme, type } from './theme.js';

export function H1({ children }: Box) {
  return (
    <h1 style={{ margin: 0, fontSize: type.title, fontWeight: 600, color: theme.textPrimary }}>
      {children}
    </h1>
  );
}

export function H2({ children }: Box) {
  return (
    <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: theme.textPrimary }}>
      {children}
    </h2>
  );
}

export function H3({ children }: Box) {
  return (
    <h3 style={{ margin: 0, fontSize: type.section, fontWeight: 500, color: theme.textPrimary }}>
      {children}
    </h3>
  );
}

export function Heading({ level = 2, children }: Box & { level?: 1 | 2 | 3 }) {
  if (level === 1) return <H1>{children}</H1>;
  if (level === 3) return <H3>{children}</H3>;
  return <H2>{children}</H2>;
}

export function Text({ children, style, muted }: Box & { muted?: boolean }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: muted ? type.caption : type.body,
        lineHeight: type.lineHeight,
        color: muted ? theme.textSecondary : theme.textPrimary,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function Link({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      style={{ color: theme.accent, fontSize: type.body, textDecoration: 'underline' }}
    >
      {children}
    </a>
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
    tone === 'up'
      ? theme.up
      : tone === 'down'
        ? theme.down
        : tone === 'warn'
          ? theme.accent
          : theme.borderStrong;
  return (
    <div
      style={{
        borderLeft: `3px solid ${accent}`,
        background: theme.bgSurface,
        padding: `${space.cardY}px ${space.cardX}px`,
        fontSize: type.body,
        lineHeight: type.lineHeight,
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
        fontSize: type.small,
        lineHeight: '16px',
        padding: '0 6px',
        borderRadius: theme.radius,
        border: `1px solid ${theme.border}`,
        color,
        background: theme.bgElement,
      }}
    >
      {children}
    </span>
  );
}

export function Badge({ children, tone }: { children?: ReactNode; tone?: string }) {
  const mapped = tone === 'up' || tone === 'down' ? tone : 'neutral';
  return <Pill tone={mapped}>{children}</Pill>;
}

export function Source({ from, at, note }: { from: string; at?: string; note?: ReactNode }) {
  return (
    <span style={{ fontSize: type.small, color: theme.textMuted, fontFamily: theme.fontMono }}>
      {from}
      {at ? ` · ${at}` : ''}
      {note ? <> · {note}</> : null}
    </span>
  );
}
