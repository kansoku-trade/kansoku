import { Popover } from '@base-ui/react/popover';
import { GraduationCap, LayoutDashboard, Library, MessageCircle, Plus, Search } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { normalizeSymbol } from '../../lib/symbol';
import { Kbd } from '../../ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  trigger: {
    'alignItems': 'center',
    'alignSelf': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '40px',
    'justifyContent': 'center',
    'marginLeft': 0,
    'padding': 0,
    'transitionDuration': '120ms',
    'transitionProperty': 'color, scale',
    'transitionTimingFunction': 'ease-out',
    'WebkitAppRegion': 'no-drag',
    ':hover': {
      color: colors.textPrimary,
    },
    ':active': {
      scale: 0.96,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  triggerActive: {
    color: colors.textPrimary,
  },
  visual: {
    alignItems: 'center',
    borderRadius: radii.md,
    display: 'inline-flex',
    height: '28px',
    justifyContent: 'center',
    transitionDuration: '120ms',
    transitionProperty: 'background-color',
    transitionTimingFunction: 'ease-out',
    width: '28px',
  },
  visualActive: {
    backgroundColor: colors.backgroundHover,
  },
  positioner: {
    outline: 'none',
    zIndex: 300,
  },
  popup: {
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textPrimary,
    'outline': 'none',
    'padding': '4px',
    'transformOrigin': 'top left',
    'transitionDuration': '120ms',
    'transitionProperty': 'opacity, transform',
    'transitionTimingFunction': 'cubic-bezier(0.2, 0, 0, 1)',
    'width': '196px',
    'WebkitAppRegion': 'no-drag',
    'boxShadow': '0 10px 28px rgba(0, 0, 0, 0.45)',
    '[data-starting-style]': {
      opacity: 0,
      transform: 'translateY(-3px)',
    },
    '[data-ending-style]': {
      opacity: 0,
      transform: 'translateY(-3px)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  search: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'color': colors.textMuted,
    'display': 'flex',
    'gap': '6px',
    'height': '32px',
    'padding': '0 8px',
    ':focus-within': {
      color: colors.textSecondary,
    },
  },
  searchInput: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textPrimary,
    'flex': 1,
    'font': 'inherit',
    'fontSize': fontSizes.sm,
    'height': '100%',
    'minWidth': 0,
    'outline': 'none',
    'padding': 0,
    'textTransform': 'uppercase',
    ':focus-visible': {
      boxShadow: colors.focusRing,
      outline: 'none',
    },
    '::placeholder': {
      color: colors.textMuted,
      textTransform: 'none',
    },
  },
  menu: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '4px',
  },
  menuButton: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderRadius': radii.default,
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'grid',
    'fontSize': fontSizes.sm,
    'gap': '7px',
    'gridTemplateColumns': '16px 1fr auto',
    'minHeight': '32px',
    'padding': '0 7px',
    'textAlign': 'left',
    'transitionDuration': '120ms',
    'transitionProperty': 'color, background-color, scale',
    'transitionTimingFunction': 'ease-out',
    'width': '100%',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    ':active': {
      scale: 0.96,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  menuIcon: {
    opacity: 0.75,
  },
  menuKbd: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  divider: {
    backgroundColor: colors.border,
    height: '1px',
    margin: '4px 0',
  },
});

interface NewTabLauncherProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onOpenChat(): void;
  onOpenHome(): void;
  onOpenResearch(): void;
  onOpenSymbol(route: string): void;
  onOpenTrainer?: (() => void) | null;
}

export function NewTabLauncher({
  open,
  onOpenChange,
  onOpenChat,
  onOpenHome,
  onOpenResearch,
  onOpenSymbol,
  onOpenTrainer,
}: NewTabLauncherProps) {
  const [symbol, setSymbol] = useState('');
  const [triggerHovered, setTriggerHovered] = useState(false);

  const close = () => {
    onOpenChange(false);
    setSymbol('');
  };

  const run = (action: () => void) => {
    close();
    action();
  };

  const openSymbol = () => {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return;
    run(() => onOpenSymbol(`/symbol/${encodeURIComponent(normalized)}`));
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setSymbol('');
      }}
    >
      <Popover.Trigger
        {...stylex.props(styles.trigger, open && styles.triggerActive)}
        aria-label="新建标签"
        title="新建标签"
        onMouseEnter={() => setTriggerHovered(true)}
        onMouseLeave={() => setTriggerHovered(false)}
      >
        <span {...stylex.props(styles.visual, (open || triggerHovered) && styles.visualActive)}>
          <Plus size={13} />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className={stylex.props(styles.positioner).className}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <Popover.Popup {...stylex.props(styles.popup)} aria-label="新建标签">
            <div {...stylex.props(styles.search)}>
              <Search size={13} aria-hidden />
              <input
                {...stylex.props(styles.searchInput)}
                autoFocus
                aria-label="输入股票代码"
                placeholder="输入股票代码"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openSymbol();
                }}
              />
            </div>
            <div {...stylex.props(styles.menu)}>
              <button
                {...stylex.props(styles.menuButton)}
                type="button"
                onClick={() => run(onOpenHome)}
              >
                <LayoutDashboard {...stylex.props(styles.menuIcon)} size={14} aria-hidden />
                <span>盘面</span>
              </button>
              <button
                {...stylex.props(styles.menuButton)}
                type="button"
                onClick={() => run(onOpenChat)}
              >
                <MessageCircle {...stylex.props(styles.menuIcon)} size={14} aria-hidden />
                <span>AI 对话</span>
                <Kbd className={stylex.props(styles.menuKbd).className} keys={['mod', 'L']} />
              </button>
              <button
                {...stylex.props(styles.menuButton)}
                type="button"
                onClick={() => run(onOpenResearch)}
              >
                <Library {...stylex.props(styles.menuIcon)} size={14} aria-hidden />
                <span>研究库</span>
                <Kbd
                  className={stylex.props(styles.menuKbd).className}
                  keys={['shift', 'mod', 'L']}
                />
              </button>
              {onOpenTrainer && (
                <>
                  <span {...stylex.props(styles.divider)} aria-hidden />
                  <button
                    {...stylex.props(styles.menuButton)}
                    type="button"
                    onClick={() => run(onOpenTrainer)}
                  >
                    <GraduationCap {...stylex.props(styles.menuIcon)} size={14} aria-hidden />
                    <span>盲盘训练</span>
                    <Kbd
                      className={stylex.props(styles.menuKbd).className}
                      keys={['shift', 'mod', 'B']}
                    />
                  </button>
                </>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
