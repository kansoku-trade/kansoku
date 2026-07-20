import { useState } from 'react';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import { SegmentedControl } from '@web/ui';

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

export type LayerRange = 'recent' | 'all';

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
}

const RANGE_LABELS: Record<LayerRange, string> = { recent: '近期', all: '全部' };
const RANGE_ORDER: LayerRange[] = ['recent', 'all'];

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
  const activePreset = hasPresets
    ? (presets!.find((p) => allItems.every((it) => effectiveOn(it) === p.on.includes(it.key)))
        ?.key ?? null)
    : null;

  const toggleCollapsed = () => setCollapsed((c) => !c);

  const rangeControl =
    range !== undefined ? (
      <div className="lp-range">
        <span className="lp-range-label">标注范围</span>
        <SegmentedControl
          ariaLabel="标注范围"
          className="lp-seg"
          value={range}
          onChange={(r) => onRangeChange?.(r)}
          options={RANGE_ORDER.map((r) => ({ value: r, label: RANGE_LABELS[r] }))}
        />
      </div>
    ) : null;

  const body = groups.map((g, gi) => (
    <div key={g.title ?? `g${gi}`} className="lp-group">
      {g.title ? <div className="lp-group-title">{g.title}</div> : null}
      {g.items.map((it) =>
        it.locked ? (
          <div
            key={it.key}
            className="lp-locked"
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
            <Lock className="lp-lock-icon" size={11} />
            <span className="lp-swatch" style={{ background: it.color }} />
            {it.label}
          </div>
        ) : (
          <label key={it.key}>
            <input
              type="checkbox"
              checked={isOn(it.key)}
              onChange={(e) => {
                const next = e.target.checked;
                if (!controlled) {
                  setInternal((prev) => ({ ...prev, [it.key]: next }));
                }
                it.toggle(next);
              }}
            />
            <span className="lp-swatch" style={{ background: it.color }} />
            {it.label}
          </label>
        ),
      )}
    </div>
  ));

  return (
    <div className={`layer-panel${collapsed ? ' collapsed' : ''}`} aria-label={title}>
      <div
        className="lp-header"
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
        <span className="lp-arrow">
          {collapsed ? (
            <ChevronRight className="icon" size={12} />
          ) : (
            <ChevronDown className="icon" size={12} />
          )}
        </span>
      </div>
      <div className="lp-body">
        {hasPresets ? (
          <>
            <SegmentedControl
              ariaLabel="预设档"
              className="lp-seg lp-presets"
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
              className="lp-custom-toggle"
              aria-expanded={customOpen}
              onClick={() => setCustomOpen((o) => !o)}
            >
              <span className="lp-arrow">
                {customOpen ? (
                  <ChevronDown className="icon" size={11} />
                ) : (
                  <ChevronRight className="icon" size={11} />
                )}
              </span>
              自定义图层
              {activePreset === null && <span className="lp-custom-flag">已修改</span>}
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
