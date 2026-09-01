import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ChevronDown, Eye, EyeOff, Plus, X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { fmt } from '@web/lib/format';
import { colors, fontSizes, radii } from '../../../theme/tokens.stylex';
import { useIntradayControls } from './controlsContext';
import { MAX_MA_LINES, MAX_MA_PERIOD, MIN_MA_PERIOD, useMaSeries, type MaLine } from './useMaLines';

const styles = stylex.create({
  icon: {
    verticalAlign: '-2px',
  },
  trigger: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderColor': colors.border,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'fontSize': fontSizes.control,
    'gap': '4px',
    'height': '26px',
    'padding': '0 8px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  positioner: {
    zIndex: 200,
  },
  popup: {
    backgroundColor: 'rgb(10 10 10 / 0.96)',
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.6)',
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    padding: '7px 0',
    width: '224px',
  },
  title: {
    color: colors.textSecondary,
    padding: '0 10px 6px',
  },
  row: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '7px',
    'padding': '3px 10px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  rowControl: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'padding': 0,
    ':hover': {
      color: colors.textPrimary,
    },
  },
  rowDelete: {
    marginLeft: 'auto',
  },
  rowColor: {
    'backgroundColor': 'transparent',
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'cursor': 'pointer',
    'height': '14px',
    'padding': 0,
    'width': '14px',
    '::-webkit-color-swatch-wrapper': {
      padding: 0,
    },
    '::-webkit-color-swatch': {
      borderStyle: 'none',
      borderWidth: 0,
    },
  },
  rowPeriod: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    fontSize: fontSizes.control,
    fontVariantNumeric: 'tabular-nums',
    padding: '1px 5px',
    width: '46px',
  },
  rowLast: {
    color: colors.textSecondary,
    fontVariantNumeric: 'tabular-nums',
  },
  add: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderTopColor': colors.border,
    'borderTopStyle': 'solid',
    'borderTopWidth': '1px',
    'color': colors.accent,
    'cursor': 'pointer',
    'display': 'flex',
    'fontSize': fontSizes.sm,
    'gap': '4px',
    'marginTop': '4px',
    'padding': '5px 10px',
    'width': '100%',
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
    },
  },
  foot: {
    color: colors.textMuted,
    lineHeight: 1.5,
    padding: '4px 10px 0',
  },
});

interface MaRowProps {
  line: MaLine;
  last: number | null | undefined;
  takenPeriods: number[];
  onChange: (patch: Partial<Omit<MaLine, 'id'>>) => void;
  onRemove: () => void;
}

function MaRow({ line, last, takenPeriods, onChange, onRemove }: MaRowProps) {
  const [draft, setDraft] = useState(String(line.period));
  const [syncedPeriod, setSyncedPeriod] = useState(line.period);

  if (line.period !== syncedPeriod) {
    setSyncedPeriod(line.period);
    setDraft(String(line.period));
  }

  // The period is committed on blur/Enter rather than per keystroke: mid-edit
  // states ("", "1" on the way to "144") are neither valid periods nor worth
  // recomputing the line for, and rejecting them inside a controlled onChange
  // makes the last character undeletable.
  const commit = () => {
    const period = Math.trunc(Number(draft));
    const valid =
      draft.trim() !== '' &&
      Number.isFinite(period) &&
      period >= MIN_MA_PERIOD &&
      period <= MAX_MA_PERIOD &&
      !takenPeriods.includes(period);
    if (valid) onChange({ period });
    else setDraft(String(line.period));
  };

  return (
    <div className={`ma-row ${stylex.props(styles.row).className}`}>
      <button
        type="button"
        className={`ma-row-eye ${stylex.props(styles.rowControl).className}`}
        aria-label={line.visible ? `隐藏 EMA${line.period}` : `显示 EMA${line.period}`}
        onClick={() => onChange({ visible: !line.visible })}
      >
        {line.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <input
        type="color"
        className={`ma-row-color ${stylex.props(styles.rowColor).className}`}
        aria-label={`EMA${line.period} 颜色`}
        value={line.color}
        onChange={(e) => onChange({ color: e.target.value })}
      />
      <input
        type="number"
        className={`ma-row-period ${stylex.props(styles.rowPeriod).className}`}
        aria-label={`EMA${line.period} 周期`}
        min={MIN_MA_PERIOD}
        max={MAX_MA_PERIOD}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') setDraft(String(line.period));
        }}
      />
      <span className={`ma-row-last ${stylex.props(styles.rowLast).className}`}>
        {last != null ? `$${fmt(last)}` : '—'}
      </span>
      <button
        type="button"
        className={`ma-row-del ${stylex.props(styles.rowControl, styles.rowDelete).className}`}
        aria-label={`删除 EMA${line.period}`}
        onClick={onRemove}
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function MaLinesMenu({ candles }: { candles: { time: number; close: number }[] }) {
  const { maLines, addMaLine, removeMaLine, updateMaLine } = useIntradayControls();
  const [open, setOpen] = useState(false);
  const series = useMaSeries(candles, maLines);
  const visibleCount = maLines.filter((l) => l.visible).length;
  const lastByLineId = new Map(series.map((s) => [s.line.id, s.last]));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="均线设置"
        className={`ma-menu-trigger ${stylex.props(styles.trigger).className}`}
      >
        均线 {visibleCount}
        <ChevronDown className={`icon ${stylex.props(styles.icon).className}`} size={11} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          className={`ma-menu-positioner ${stylex.props(styles.positioner).className}`}
          side="bottom"
          sideOffset={4}
        >
          <Popover.Popup
            aria-label="均线设置"
            className={`ma-menu-popup ${stylex.props(styles.popup).className}`}
          >
            <div className={`ma-menu-title ${stylex.props(styles.title).className}`}>
              均线（EMA）
            </div>
            {maLines.map((line) => (
              <MaRow
                key={line.id}
                line={line}
                last={lastByLineId.get(line.id)}
                takenPeriods={maLines.filter((l) => l.id !== line.id).map((l) => l.period)}
                onChange={(patch) => updateMaLine(line.id, patch)}
                onRemove={() => removeMaLine(line.id)}
              />
            ))}
            <button
              type="button"
              className={`ma-menu-add ${stylex.props(styles.add).className}`}
              disabled={maLines.length >= MAX_MA_LINES}
              onClick={addMaLine}
            >
              <Plus size={11} /> 添加均线
            </button>
            <div className={`ma-menu-foot ${stylex.props(styles.foot).className}`}>
              最多 {MAX_MA_LINES} 条；只影响画线，不影响 AI 判断。
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
