import type { CSSProperties } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Slider } from '@base-ui/react/slider';
import { theme } from './theme.js';

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
        fontSize: 13,
        color: theme.textPrimary,
        cursor: 'pointer',
      }}
    >
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

const triggerStyle: CSSProperties = {
  alignItems: 'center',
  background: theme.bgElement,
  border: `1px solid ${theme.borderStrong}`,
  borderRadius: theme.radius,
  boxSizing: 'border-box',
  color: theme.textSecondary,
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  gap: 5,
  height: 26,
  padding: '0 9px',
  whiteSpace: 'nowrap',
};

const popupStyle: CSSProperties = {
  background: theme.bgSurface,
  border: `1px solid ${theme.border}`,
  borderRadius: theme.radius,
  boxShadow: '0 6px 20px rgb(0 0 0 / 0.35)',
  maxHeight: 'min(320px, var(--available-height))',
  minWidth: 'var(--anchor-width)',
  overflowY: 'auto',
  padding: 3,
};

const itemStyle: CSSProperties = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: theme.radius,
  color: theme.textSecondary,
  cursor: 'pointer',
  display: 'flex',
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  gap: 10,
  justifyContent: 'space-between',
  minHeight: 24,
  padding: '4px 8px',
  whiteSpace: 'nowrap',
};

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function Tick() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      {label ? <span style={{ color: theme.textSecondary }}>{label}</span> : null}
      <BaseSelect.Root
        items={options}
        value={value || null}
        onValueChange={(next) => onChange(next as string)}
      >
        <BaseSelect.Trigger className="kc-select-trigger" style={triggerStyle} aria-label={label}>
          <BaseSelect.Value />
          <BaseSelect.Icon style={{ display: 'inline-flex' }}>
            <Chevron />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        <BaseSelect.Portal>
          <BaseSelect.Positioner style={{ zIndex: 60 }} sideOffset={4}>
            <BaseSelect.Popup style={popupStyle}>
              <BaseSelect.List>
                {options.map((option) => (
                  <BaseSelect.Item
                    key={option.value}
                    value={option.value}
                    className="kc-select-item"
                    style={itemStyle}
                  >
                    <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                    <BaseSelect.ItemIndicator style={{ color: theme.accent, display: 'inline-flex' }}>
                      <Tick />
                    </BaseSelect.ItemIndicator>
                  </BaseSelect.Item>
                ))}
              </BaseSelect.List>
            </BaseSelect.Popup>
          </BaseSelect.Positioner>
        </BaseSelect.Portal>
      </BaseSelect.Root>
    </span>
  );
}

function fractionDigits(step: number): number {
  const text = String(step);
  const exp = text.indexOf('e-');
  if (exp !== -1) return Number(text.slice(exp + 2));
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

function snap(n: number, step: number, min?: number, max?: number): number {
  const snapped = Math.round(n / step) * step;
  const rounded = Number(snapped.toFixed(fractionDigits(step)));
  if (min != null && rounded < min) return min;
  if (max != null && rounded > max) return max;
  return rounded;
}

const paramRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 8,
  minHeight: 26,
  width: '100%',
};

const paramLabelStyle: CSSProperties = {
  color: theme.textSecondary,
  flex: '0 0 4em',
  fontSize: 13,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const paramInputStyle: CSSProperties = {
  background: theme.bgElement,
  border: `1px solid ${theme.borderStrong}`,
  borderRadius: theme.radius,
  boxSizing: 'border-box',
  color: theme.textPrimary,
  fontFamily: theme.fontMono,
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  height: 26,
  padding: '0 9px',
  width: '9ch',
};

const paramUnitStyle: CSSProperties = {
  color: theme.textMuted,
  flex: '0 0 auto',
  fontSize: 13,
};

const sliderRootStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flex: 1,
  height: 26,
  minWidth: 80,
};

const sliderControlStyle: CSSProperties = {
  display: 'flex',
  flex: 1,
  height: 26,
  alignItems: 'center',
  position: 'relative',
};

const sliderTrackStyle: CSSProperties = {
  background: theme.bgHover,
  borderRadius: theme.radius,
  height: 2,
  width: '100%',
};

const sliderIndicatorStyle: CSSProperties = {
  background: theme.accent,
  borderRadius: theme.radius,
  height: 2,
};

const sliderThumbStyle: CSSProperties = {
  background: theme.accent,
  border: 'none',
  borderRadius: 2,
  height: 10,
  width: 10,
};

export function Param({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  if (!Number.isFinite(value)) throw new Error('Param: value must be a finite number');
  if (!Number.isFinite(step) || step <= 0) throw new Error('Param: step must be > 0');
  const ranged = Number.isFinite(min) && Number.isFinite(max);
  if (ranged && min! > max!) throw new Error('Param: min must be <= max');

  const digits = fractionDigits(step);
  const commit = (next: number | null) => {
    if (next == null || !Number.isFinite(next)) return;
    const snapped = snap(next, step, ranged ? min : undefined, ranged ? max : undefined);
    if (snapped !== value) onChange(snapped);
  };

  return (
    <div style={paramRowStyle}>
      <span style={paramLabelStyle}>{label}</span>
      {ranged ? (
        <Slider.Root
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={commit}
          style={sliderRootStyle}
        >
          <Slider.Control style={sliderControlStyle}>
            <Slider.Track style={sliderTrackStyle}>
              <Slider.Indicator style={sliderIndicatorStyle} />
            </Slider.Track>
            <Slider.Thumb style={sliderThumbStyle} />
          </Slider.Control>
        </Slider.Root>
      ) : null}
      <NumberField.Root
        value={value}
        min={ranged ? min : undefined}
        max={ranged ? max : undefined}
        step={step}
        snapOnStep
        locale="en-US"
        format={{
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
          useGrouping: false,
        }}
        onValueChange={(next, details) => {
          if (details.reason === 'input-change' || details.reason === 'input-clear') return;
          commit(next);
        }}
        onValueCommitted={commit}
      >
        <NumberField.Input aria-label={label} style={paramInputStyle} />
      </NumberField.Root>
      {unit ? <span style={paramUnitStyle}>{unit}</span> : null}
    </div>
  );
}
