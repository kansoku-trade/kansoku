import type { CSSProperties, ReactNode } from 'react';
import { theme } from './theme.js';

export type Box = { children?: ReactNode; style?: CSSProperties };

const font = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

// The canvas renders inside its own iframe, so a plain media query measures the pane
// width the user actually dragged to — no container queries needed. Without this a
// four-column Grid keeps four columns at 320px and the numbers overflow their cards.
const RESPONSIVE_CSS = `
.kc-grid { display: grid; gap: 8px; grid-template-columns: repeat(var(--kc-cols), minmax(0, 1fr)); }
@media (max-width: 620px) { .kc-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); } }
`;

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
        {title?.trim() ? title : 'Untitled'}
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
      <style>{RESPONSIVE_CSS}</style>
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
    <div className="kc-grid" style={{ ['--kc-cols' as string]: columns }}>
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
        flexWrap: 'wrap',
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

export function Divider() {
  return <hr style={{ border: 0, borderTop: `1px solid ${theme.border}`, margin: '14px 0' }} />;
}
