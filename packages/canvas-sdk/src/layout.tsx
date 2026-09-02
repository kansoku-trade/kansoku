import type { CSSProperties, ReactNode } from 'react';
import { space, theme, type } from './theme.js';

export type Box = { children?: ReactNode; style?: CSSProperties };

const font = theme.fontUi;

// The canvas renders inside its own iframe, so a plain media query measures the pane
// width the user actually dragged to — no container queries needed. Without this a
// four-column Grid keeps four columns at 320px and the numbers overflow their cards.
const RESPONSIVE_CSS = `
.kc-grid { display: grid; gap: ${space.grid}px; grid-template-columns: repeat(var(--kc-cols), minmax(0, 1fr)); }
@media (max-width: 620px) { .kc-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); } }
.kc-select-trigger:hover, .kc-select-trigger[data-popup-open] { background: ${theme.bgHover}; color: ${theme.textPrimary}; }
.kc-select-trigger:focus-visible { border-color: #7a7a7a; box-shadow: 0 0 0 2px rgb(232 232 232 / 0.12); outline: none; }
.kc-select-item[data-highlighted] { background: ${theme.bgHover}; color: ${theme.textPrimary}; }
.kc-select-item[data-selected] { color: ${theme.textPrimary}; }
.kc-select-item:focus-visible { outline: none; }
`;

function flow(gap: number): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap };
}

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
        background: theme.bgCanvas,
        color: theme.textPrimary,
        fontFamily: font,
        boxSizing: 'border-box',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: type.title,
          fontWeight: 600,
          color: theme.textPrimary,
        }}
      >
        {title?.trim() ? title : 'Untitled'}
      </h1>
      {caption ? (
        <p
          style={{
            margin: '3px 0 0',
            fontSize: type.small,
            color: theme.textMuted,
          }}
        >
          {caption}
        </p>
      ) : null}
      <div style={{ ...flow(space.flow), marginTop: space.flow }}>{children}</div>
      <style>{RESPONSIVE_CSS}</style>
    </div>
  );
}

export function Section({ title, children }: { title: string } & Box) {
  return (
    <section style={{ paddingTop: 8 }}>
      <div
        style={{
          fontSize: type.section,
          fontWeight: 600,
          color: theme.textPrimary,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={flow(space.section)}>{children}</div>
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
        borderRadius: theme.radius,
        padding: `${space.cardY}px ${space.cardX}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Divider() {
  return <hr style={{ border: 0, borderTop: `1px solid ${theme.border}`, margin: 0 }} />;
}
