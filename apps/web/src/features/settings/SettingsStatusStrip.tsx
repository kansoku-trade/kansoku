import type { SettingsViewModel } from './settingsViewModel';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  numeric: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  root: {
    'alignItems': 'baseline',
    'color': colors.textSecondary,
    'display': 'flex',
    'fontSize': fontSizes.control,
    'gap': '10px',
    'marginBottom': '12px',
    'padding': '0 2px',
    '@media (max-width: 560px)': { flexWrap: 'wrap' },
  },
  state: { fontWeight: 600 },
  up: { color: colors.up },
  accent: { color: colors.accent },
  down: { color: colors.down },
  separator: { color: colors.textMuted },
  usage: {
    alignItems: 'baseline',
    color: colors.textMuted,
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    gap: '8px',
    marginLeft: 'auto',
  },
  retry: {
    backgroundColor: 'transparent',
    border: 'none',
    color: { 'default': colors.textSecondary, ':hover': colors.textPrimary },
    cursor: 'pointer',
    fontSize: fontSizes.sm,
    padding: 0,
    textDecoration: 'underline',
  },
});

type Summary = SettingsViewModel['summary'];

export function SettingsStatusStrip({
  summary,
  usageError,
  onRetryUsage,
}: {
  summary: Summary;
  usageError: string | null;
  onRetryUsage: () => void;
}) {
  return (
    <div {...stylex.props(styles.root)} aria-label="设置状态总览">
      <span
        {...stylex.props(
          styles.state,
          summary.statusTone === 'up'
            ? styles.up
            : summary.statusTone === 'accent'
              ? styles.accent
              : styles.down,
        )}
      >
        {summary.statusLabel}
      </span>
      <span {...stylex.props(styles.separator)}>·</span>
      <span>{summary.enabledLabel}</span>
      <span className={`num ${stylex.props(styles.numeric, styles.usage).className}`}>
        {usageError ? (
          <>
            今日用量读取失败
            <button {...stylex.props(styles.retry)} type="button" onClick={onRetryUsage}>
              重试
            </button>
          </>
        ) : summary.usageLabel === '暂不可用' ? (
          '今日用量暂不可用'
        ) : (
          '今日 ' + summary.usageLabel
        )}
      </span>
    </div>
  );
}
