import { Lock } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { openLicenseModal } from '../edition/licenseModalStore';

const styles = stylex.create({
  root: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '8px',
    padding: '10px 12px',
  },
  icon: {
    color: colors.accent,
    flexShrink: 0,
    verticalAlign: '-2px',
  },
  cta: {
    'backgroundColor': 'transparent',
    'borderColor': colors.accent,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.accent,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'marginLeft': 'auto',
    'padding': '4px 10px',
    'whiteSpace': 'nowrap',
    ':hover': {
      backgroundColor: colors.accent,
      color: colors.backgroundSurface,
    },
  },
});

export function LockedAiNotice({
  message = 'AI 功能需要有效授权才能使用',
  className,
}: {
  message?: string;
  className?: string;
}) {
  const noticeClassName = [
    'locked-ai-notice',
    stylex.props(styles.root).className,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={noticeClassName}>
      <Lock className={`icon ${stylex.props(styles.icon).className}`} size={14} />
      <span>{message}</span>
      <button
        type="button"
        className={`locked-ai-notice-cta ${stylex.props(styles.cta).className}`}
        onClick={() => openLicenseModal('guard')}
      >
        订阅解锁
      </button>
    </div>
  );
}
