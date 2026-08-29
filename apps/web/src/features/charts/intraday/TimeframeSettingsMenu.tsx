import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Popover } from '@base-ui/react/popover';
import { Settings2 } from 'lucide-react';
import { Checkbox } from '@web/ui';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { useIntradayControls } from './controlsContext';
import { TF_OPTIONS } from './timeframes';

const styles = stylex.create({
  trigger: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'border': 0,
    'borderRadius': radii.default,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '20px',
    'justifyContent': 'center',
    'minWidth': '22px',
    'padding': '0 5px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
  },
  positioner: {
    zIndex: 200,
  },
  popup: {
    backgroundColor: 'rgb(10 10 10 / 0.96)',
    border: `1px solid ${colors.border}`,
    borderRadius: radii.default,
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.6)',
    color: colors.textPrimary,
    fontSize: fontSizes.xs,
    padding: '7px 0',
    width: '196px',
  },
  title: {
    color: colors.textSecondary,
    padding: '0 10px 6px',
  },
  row: {
    'alignItems': 'center',
    'cursor': 'pointer',
    'display': 'flex',
    'gap': '7px',
    'padding': '3px 10px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  rowFixed: {
    color: colors.textSecondary,
    cursor: 'default',
  },
  tag: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginLeft: 'auto',
  },
  foot: {
    borderTop: `1px solid ${colors.border}`,
    color: colors.textMuted,
    lineHeight: 1.5,
    marginTop: '4px',
    padding: '6px 10px 0',
  },
});

export function TimeframeSettingsMenu() {
  const { visibleTfs, toggleTf } = useIntradayControls();
  const [open, setOpen] = useState(false);
  const shown = new Set(visibleTfs);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={`tf-settings-trigger ${stylex.props(styles.trigger).className}`}
        aria-label="周期设置"
        title="周期设置"
      >
        <Settings2 size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className={`tf-settings-positioner ${stylex.props(styles.positioner).className}`}
          side="bottom"
          align="start"
          sideOffset={4}
        >
          <Popover.Popup
            className={`tf-settings-popup ${stylex.props(styles.popup).className}`}
            aria-label="周期设置"
          >
            <div className={`tf-settings-title ${stylex.props(styles.title).className}`}>
              显示哪些周期
            </div>
            {TF_OPTIONS.map((option) => (
              <label
                key={option.key}
                className={`tf-settings-row${option.analysis ? ' tf-settings-row--fixed' : ''} ${stylex.props(styles.row, option.analysis && styles.rowFixed).className}`}
              >
                <Checkbox
                  size="sm"
                  checked={shown.has(option.key)}
                  disabled={option.analysis}
                  onCheckedChange={() => toggleTf(option.key)}
                />
                {option.label}
                {option.analysis && (
                  <span className={`tf-settings-tag ${stylex.props(styles.tag).className}`}>
                    分析档
                  </span>
                )}
              </label>
            ))}
            <div className={`tf-settings-foot ${stylex.props(styles.foot).className}`}>
              分析档固定三个；其余现拉现算，不写进存档。
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
