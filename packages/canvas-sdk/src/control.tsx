import type { CSSProperties } from 'react';
import { Select as BaseSelect } from '@base-ui/react/select';
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
