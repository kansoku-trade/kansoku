import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface LayerItem {
  key: string;
  label: string;
  color: string;
  toggle: (v: boolean) => void;
}

export interface LayerGroup {
  title?: string;
  items: LayerItem[];
}

export interface LayerPanelProps {
  groups: LayerGroup[];
  checked?: Record<string, boolean>;
  defaultChecked?: boolean;
  title?: string;
  defaultCollapsed?: boolean;
}

export function LayerPanel({
  groups,
  checked: checkedProp,
  defaultChecked = true,
  title = "图层",
  defaultCollapsed = true,
}: LayerPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [internal, setInternal] = useState<Record<string, boolean>>({});
  const controlled = checkedProp !== undefined;

  const isOn = (key: string) => {
    if (controlled) return checkedProp[key] ?? defaultChecked;
    return internal[key] ?? defaultChecked;
  };

  if (!groups.length) return null;

  const allItems = groups.flatMap((g) => g.items);
  const totalCount = allItems.length;
  const onCount = allItems.filter((it) => isOn(it.key)).length;
  const headerLabel = `${title} ${onCount}/${totalCount}`;

  const toggleCollapsed = () => setCollapsed((c) => !c);

  return (
    <div className={`layer-panel${collapsed ? " collapsed" : ""}`} aria-label={title}>
      <div
        className="lp-header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleCollapsed();
          }
        }}
      >
        <span>{headerLabel}</span>
        <span className="lp-arrow">
          {collapsed ? <ChevronRight className="icon" size={12} /> : <ChevronDown className="icon" size={12} />}
        </span>
      </div>
      <div className="lp-body">
        {groups.map((g, gi) => (
          <div key={g.title ?? `g${gi}`} className="lp-group">
            {g.title ? <div className="lp-group-title">{g.title}</div> : null}
            {g.items.map((it) => (
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
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
