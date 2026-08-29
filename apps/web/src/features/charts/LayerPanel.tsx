import { useState } from 'react';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { Checkbox, SegmentedControl } from '@web/ui';
import * as stylex from '@stylexjs/stylex';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

export interface LayerItem {
  key: string;
  label: string;
  color: string;
  toggle: (v: boolean) => void;
  locked?: boolean;
  onLockedClick?: () => void;
}

export interface LayerGroup {
  title?: string;
  items: LayerItem[];
}

export interface LayerPreset {
  key: string;
  label: string;
  on: string[];
}

type LayerRange = 'recent' | 'all';

export interface LayerPanelProps {
  groups: LayerGroup[];
  checked?: Record<string, boolean>;
  defaultChecked?: boolean;
  title?: string;
  defaultCollapsed?: boolean;
  presets?: LayerPreset[];
  onPreset?: (on: string[]) => void;
  range?: LayerRange;
  onRangeChange?: (range: LayerRange) => void;
  inline?: boolean;
}

const RANGE_LABELS: Record<LayerRange, string> = { recent: '近期', all: '全部' };
const RANGE_ORDER: LayerRange[] = ['recent', 'all'];

const styles = stylex.create({
  panel: {
    position: 'absolute',
    top: '8px',
    right: '64px',
    zIndex: 20,
    backgroundColor: 'rgba(10, 10, 10, 0.94)',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    fontSize: fontSizes.xs,
    minWidth: '132px',
    maxWidth: '180px',
  },
  panelCollapsed: {
    minWidth: 0,
    maxWidth: 'none',
  },
  panelInline: {
    position: 'relative',
    top: 'auto',
    right: 'auto',
    zIndex: 'auto',
    backgroundColor: 'transparent',
    borderWidth: 0,
    minWidth: 0,
    maxWidth: 'none',
    fontSize: fontSizes.sm,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '3px 8px',
    color: colors.textPrimary,
    fontSize: fontSizes.xs,
    fontWeight: 500,
    cursor: 'pointer',
    userSelect: 'none',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  headerInline: {
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    padding: '2px 8px',
    whiteSpace: 'nowrap',
    fontSize: fontSizes.sm,
  },
  arrow: {
    display: 'inline-flex',
    opacity: 0.6,
  },
  body: {
    padding: '4px 8px 6px',
    maxHeight: '70vh',
    overflowY: 'auto',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  bodyCollapsed: {
    display: 'none',
  },
  bodyInline: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 30,
    width: '196px',
    backgroundColor: 'rgba(10, 10, 10, 0.96)',
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: radii.default,
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.6)',
    fontSize: fontSizes.xs,
  },
  group: {
    marginBottom: '5px',
  },
  groupLast: {
    marginBottom: 0,
  },
  groupTitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    textTransform: 'uppercase',
    marginBottom: '1px',
    letterSpacing: '0.06em',
  },
  groupLabel: {
    display: 'flex',
    alignItems: 'center',
    color: colors.textPrimary,
    padding: '1px 0',
    cursor: 'pointer',
    userSelect: 'none',
    lineHeight: 1.25,
    fontSize: fontSizes.sm,
    ':hover': {
      color: colors.textPrimary,
    },
  },
  groupLabelOff: {
    color: colors.textMuted,
  },
  checkbox: {
    margin: '0 5px 0 0',
  },
  swatch: {
    display: 'inline-block',
    width: '7px',
    height: '7px',
    marginRight: '4px',
    borderRadius: radii.default,
    flexShrink: 0,
  },
  locked: {
    display: 'flex',
    alignItems: 'center',
    color: colors.textMuted,
    padding: '1px 0',
    cursor: 'pointer',
    userSelect: 'none',
    lineHeight: 1.25,
    fontSize: fontSizes.sm,
    ':hover': {
      color: colors.textSecondary,
    },
  },
  lockIcon: {
    margin: '0 5px 0 0',
    flexShrink: 0,
    opacity: 0.7,
  },
  presets: {
    marginBottom: '4px',
  },
  range: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '4px',
  },
  rangeLabel: {
    color: colors.textMuted,
    marginRight: 'auto',
  },
  customToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    width: '100%',
    padding: '3px 0 2px',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    cursor: 'pointer',
    userSelect: 'none',
    ':hover': {
      color: colors.textPrimary,
    },
  },
  customFlag: {
    marginLeft: 'auto',
    color: colors.accent,
  },
});

export function LayerPanel({
  groups,
  checked: checkedProp,
  defaultChecked = true,
  title = '图层',
  defaultCollapsed = true,
  presets,
  onPreset,
  range,
  onRangeChange,
  inline = false,
}: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [customOpen, setCustomOpen] = useState(false);
  const [internal, setInternal] = useState<Record<string, boolean>>({});
  const controlled = checkedProp !== undefined;

  const isOn = (key: string) => {
    if (controlled) return checkedProp[key] ?? defaultChecked;
    return internal[key] ?? defaultChecked;
  };

  const effectiveOn = (it: LayerItem) => (it.locked ? false : isOn(it.key));

  if (!groups.length) return null;

  const allItems = groups.flatMap((g) => g.items);
  const unlockedItems = allItems.filter((it) => !it.locked);
  const totalCount = unlockedItems.length;
  const onCount = unlockedItems.filter((it) => isOn(it.key)).length;
  const headerLabel = `${title} ${onCount}/${totalCount}`;

  const hasPresets = Boolean(presets?.length);
  const presetKeys = hasPresets ? new Set(presets!.flatMap((preset) => preset.on)) : null;
  const activePreset = hasPresets
    ? (presets!.find((p) =>
        allItems
          .filter((item) => presetKeys!.has(item.key))
          .every((item) => effectiveOn(item) === p.on.includes(item.key)),
      )?.key ?? null)
    : null;

  const toggleCollapsed = () => setCollapsed((c) => !c);

  const rangeControl =
    range !== undefined ? (
      <div className={`lp-range ${stylex.props(styles.range).className}`}>
        <span className={`lp-range-label ${stylex.props(styles.rangeLabel).className}`}>
          标注范围
        </span>
        <SegmentedControl
          ariaLabel="标注范围"
          size="sm"
          fit
          value={range}
          onChange={(r) => onRangeChange?.(r)}
          options={RANGE_ORDER.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
        />
      </div>
    ) : null;

  const body = groups.map((g, gi) => (
    <div
      key={g.title ?? `g${gi}`}
      className={`lp-group ${stylex.props(gi === groups.length - 1 ? styles.groupLast : styles.group).className}`}
    >
      {g.title ? (
        <div className={`lp-group-title ${stylex.props(styles.groupTitle).className}`}>{g.title}</div>
      ) : null}
      {g.items.map((it) =>
        it.locked ? (
          <div
            key={it.key}
            className={`lp-locked ${stylex.props(styles.locked).className}`}
            role="button"
            tabIndex={0}
            onClick={() => it.onLockedClick?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                it.onLockedClick?.();
              }
            }}
          >
            <Lock className={`lp-lock-icon ${stylex.props(styles.lockIcon).className}`} size={11} />
            <span className={`lp-swatch ${stylex.props(styles.swatch).className}`} style={{ background: it.color }} />
            {it.label}
          </div>
        ) : (
          <label
            key={it.key}
            className={`lp-group-label ${stylex.props(styles.groupLabel, !isOn(it.key) && styles.groupLabelOff).className}`}
          >
            <Checkbox
              size="sm"
              className={stylex.props(styles.checkbox).className}
              checked={isOn(it.key)}
              onCheckedChange={(next) => {
                if (!controlled) {
                  setInternal((prev) => ({ ...prev, [it.key]: next }));
                }
                it.toggle(next);
              }}
            />
            <span className={`lp-swatch ${stylex.props(styles.swatch).className}`} style={{ background: it.color }} />
            {it.label}
          </label>
        ),
      )}
    </div>
  ));

  return (
    <div
      className={`layer-panel${collapsed ? ' collapsed' : ''}${inline ? ' layer-panel--inline' : ''} ${stylex.props(styles.panel, collapsed && styles.panelCollapsed, inline && styles.panelInline).className}`}
      aria-label={title}
    >
      <div
        className={`lp-header ${stylex.props(styles.header, inline && styles.headerInline).className}`}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
      >
        <span>{headerLabel}</span>
        <span className={`lp-arrow ${stylex.props(styles.arrow).className}`}>
          {collapsed ? (
            <ChevronRight className="icon" size={12} />
          ) : (
            <ChevronDown className="icon" size={12} />
          )}
        </span>
      </div>
      <div className={`lp-body ${stylex.props(styles.body, collapsed && styles.bodyCollapsed, inline && styles.bodyInline).className}`}>
        {hasPresets ? (
          <>
            <SegmentedControl
              ariaLabel="预设档"
              className={`lp-presets ${stylex.props(styles.presets).className}`}
              size="sm"
              value={activePreset ?? ''}
              onChange={(key) => {
                const preset = presets!.find((p) => p.key === key);
                if (preset) onPreset?.(preset.on);
              }}
              options={presets!.map((p) => ({ value: p.key, label: p.label }))}
            />
            {rangeControl}
            <button
              type="button"
              className={`lp-custom-toggle ${stylex.props(styles.customToggle).className}`}
              aria-expanded={customOpen}
              onClick={() => setCustomOpen((o) => !o)}
            >
              <span className={`lp-arrow ${stylex.props(styles.arrow).className}`}>
                {customOpen ? (
                  <ChevronDown className="icon" size={11} />
                ) : (
                  <ChevronRight className="icon" size={11} />
                )}
              </span>
              自定义图层
              {activePreset === null && (
                <span className={`lp-custom-flag ${stylex.props(styles.customFlag).className}`}>
                  已修改
                </span>
              )}
            </button>
            {customOpen && body}
          </>
        ) : (
          <>
            {rangeControl}
            {body}
          </>
        )}
      </div>
    </div>
  );
}
