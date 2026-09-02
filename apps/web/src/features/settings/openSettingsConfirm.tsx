import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { TriangleAlert } from 'lucide-react';
import { Button, openModal } from '@web/ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  notice: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: '12px',
  },
  icon: {
    alignItems: 'center',
    backgroundColor: 'rgb(239 83 80 / 0.12)',
    borderRadius: radii.md,
    color: colors.down,
    display: 'flex',
    flex: '0 0 auto',
    height: '32px',
    justifyContent: 'center',
    width: '32px',
  },
  iconWarning: {
    backgroundColor: 'rgb(255 176 0 / 0.12)',
    color: colors.accent,
  },
  message: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.6,
    margin: '3px 0 0',
    textWrap: 'pretty',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
});

export function SettingsConfirmDialog({
  message,
  danger = false,
  children,
}: {
  message: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.notice)}>
        <span {...stylex.props(styles.icon, !danger && styles.iconWarning)}>
          <TriangleAlert aria-hidden size={16} />
        </span>
        <p {...stylex.props(styles.message)}>{message}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsConfirmActions({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.actions)}>{children}</div>;
}

export function openSettingsConfirm({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  openModal({
    title,
    size: 'sm',
    body: (closeModal) => (
      <SettingsConfirmDialog message={message} danger={danger}>
        <SettingsConfirmActions>
          <Button onClick={closeModal}>取消</Button>
          <Button
            accent={!danger}
            danger={danger}
            onClick={() => {
              closeModal();
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </SettingsConfirmActions>
      </SettingsConfirmDialog>
    ),
  });
}
