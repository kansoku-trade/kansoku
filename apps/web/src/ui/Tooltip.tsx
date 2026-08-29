import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../theme/tokens.stylex';

type TooltipPlacement = 'top' | 'bottom';

interface TooltipProps {
  children: ReactNode;
  className?: string;
  content: ReactNode;
  disabled?: boolean;
  focusable?: boolean;
  placement?: TooltipPlacement;
  renderTrigger?: ReactElement<{ className?: string; tabIndex?: number }>;
}

function hasContent(content: ReactNode): boolean {
  return content !== null && content !== undefined && content !== false && content !== '';
}

const styles = stylex.create({
  anchor: {
    alignItems: 'baseline',
    display: 'inline-flex',
    maxWidth: '100%',
    minWidth: 0,
  },
  positioner: {
    zIndex: 1000,
  },
  panel: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: `0 4px 14px ${colors.backgroundSunken}`,
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 0,
    lineHeight: 1.45,
    maxWidth: 'min(320px, calc(100vw - 16px))',
    padding: '6px 8px',
    whiteSpace: 'pre-line',
    width: 'max-content',
  },
});

export function Tooltip({
  children,
  className,
  content,
  disabled,
  focusable = false,
  placement = 'top',
  renderTrigger,
}: TooltipProps) {
  const active = !disabled && hasContent(content);
  if (!active && !renderTrigger) return <>{children}</>;

  const trigger = renderTrigger ?? (
    <span
      className={[
        stylex.props(styles.anchor).className,
        'tooltip-anchor',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      tabIndex={focusable ? 0 : undefined}
    />
  );

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={100} disabled={!active} render={trigger}>
        {children}
      </BaseTooltip.Trigger>
      {active && (
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner
            className={['tooltip-positioner', stylex.props(styles.positioner).className]
              .filter(Boolean)
              .join(' ')}
            side={placement}
            sideOffset={8}
          >
            <BaseTooltip.Popup
              className={['tooltip-panel', stylex.props(styles.panel).className]
                .filter(Boolean)
                .join(' ')}
            >
              {content}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      )}
    </BaseTooltip.Root>
  );
}
