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
