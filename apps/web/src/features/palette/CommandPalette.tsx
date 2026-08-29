import { useEffect, useState } from 'react';
import type { OverviewBoard, PortfolioSummary } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { listRecentSymbols } from '../charts/recentCharts';
import { Input } from '../../ui';
import { getOpenTrainerBridge } from '../desktop/desktopWindowsBridge';
import { useCapabilities } from '../edition/capabilitiesStore';
import { requestTrainerWindow } from '../training/requestTrainerWindow';
import { buildPaletteCommands, type PaletteCommand } from './commands';
import { usePalette } from './usePalette';

const optionId = (commandId: string) => `palette-option-${commandId.replaceAll(/[^\w-]/g, '_')}`;

const styles = stylex.create({
  backdrop: {
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundBackdrop,
    display: 'flex',
    inset: 0,
    justifyContent: 'center',
    padding: '32px',
    paddingTop: '15vh',
    position: 'fixed',
    zIndex: 100,
  },
  panel: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    width: 'min(520px, 100%)',
  },
  input: {
    'borderBottomColor': colors.border,
    'borderRadius': 0,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'borderLeftStyle': 'none',
    'borderLeftWidth': 0,
    'borderRightStyle': 'none',
    'borderRightWidth': 0,
    'borderTopStyle': 'none',
    'borderTopWidth': 0,
    'boxShadow': 'none',
    'fontSize': fontSizes.md,
    'padding': '12px 14px',
    ':focus:not(:focus-visible)': {
      borderColor: colors.border,
      boxShadow: 'none',
      outline: 'none',
    },
    ':focus-visible': {
      borderColor: colors.focusBorder,
      boxShadow: colors.focusRing,
      outline: colors.focusOutline,
      outlineOffset: '2px',
    },
  },
  list: {
    maxHeight: '320px',
    overflowY: 'auto',
    padding: '6px',
  },
  item: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    borderBottomStyle: 'none',
    borderBottomWidth: 0,
    borderLeftStyle: 'none',
    borderLeftWidth: 0,
    borderRightStyle: 'none',
    borderRightWidth: 0,
    borderTopStyle: 'none',
    borderTopWidth: 0,
    color: colors.textPrimary,
    cursor: 'pointer',
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '12px',
    justifyContent: 'space-between',
    padding: '8px 10px',
    textAlign: 'left',
    width: '100%',
  },
  itemActive: {
    backgroundColor: colors.backgroundHover,
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    padding: '16px',
    textAlign: 'center',
  },
});

export function CommandPalette({ onOpenRoute }: { onOpenRoute: (route: string) => void }) {
  const { open, close } = usePalette();
  if (!open) return null;
  return <PalettePanel onClose={close} onOpenRoute={onOpenRoute} />;
}

function PalettePanel({
  onClose,
  onOpenRoute,
}: {
  onClose: () => void;
  onOpenRoute: (route: string) => void;
}) {
  const { data: board } = useQuery<OverviewBoard>('overview.board', () => client.overview.board());
  const { data: portfolio } = useQuery<PortfolioSummary>('positions.list', () =>
    client.positions.list(),
  );
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const trainerBridge = getOpenTrainerBridge();
  const { pro, licensed } = useCapabilities();

  const symbols = [
    ...(board?.rows.map((r) => r.symbol) ?? []),
    ...(portfolio?.positions.map((p) => p.symbol) ?? []),
    ...listRecentSymbols().map((s) => s.symbol),
  ];
  const commands = buildPaletteCommands(query, symbols, trainerBridge !== null);
  const active = Math.max(0, Math.min(index, commands.length - 1));
  const activeId = commands[active]?.id;

  useEffect(() => {
    if (activeId) document.getElementById(optionId(activeId))?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const run = (cmd: PaletteCommand) => {
    onClose();
    if (cmd.kind === 'trainer') {
      requestTrainerWindow(trainerBridge, { pro, licensed });
      return;
    }
    if (cmd.route) onOpenRoute(cmd.route);
  };

  const moveDown = () => setIndex((i) => Math.min(i + 1, commands.length - 1));
  const moveUp = () => setIndex((i) => Math.max(i - 1, 0));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const ctrlKey = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (e.key === 'ArrowDown' || (ctrlKey && (e.key === 'j' || e.key === 'n'))) {
      e.preventDefault();
      moveDown();
    } else if (e.key === 'ArrowUp' || (ctrlKey && (e.key === 'k' || e.key === 'p'))) {
      e.preventDefault();
      e.stopPropagation();
      moveUp();
    } else if (e.key === 'Enter') {
      const cmd = commands[active];
      if (cmd) run(cmd);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className={`modal-backdrop ${stylex.props(styles.backdrop).className}`} onClick={onClose}>
      <div
        {...stylex.props(styles.panel)}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          autoFocus
          {...stylex.props(styles.input)}
          placeholder="输入代码或命令，如 MRVL"
          role="combobox"
          aria-expanded={commands.length > 0}
          aria-controls="palette-listbox"
          aria-activedescendant={commands[active] ? optionId(commands[active].id) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <div
          {...stylex.props(styles.list)}
          id="palette-listbox"
          role="listbox"
          aria-label="候选命令"
        >
          {commands.map((cmd, i) => (
            <button
              key={cmd.id}
              id={optionId(cmd.id)}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              {...stylex.props(styles.item, i === active && styles.itemActive)}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(cmd)}
            >
              <span>{cmd.title}</span>
              {cmd.hint && <span {...stylex.props(styles.hint)}>{cmd.hint}</span>}
            </button>
          ))}
          {commands.length === 0 && <div {...stylex.props(styles.empty)}>没有匹配项</div>}
        </div>
      </div>
    </div>
  );
}
