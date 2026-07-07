import { AlignJustify, Minus, MousePointer2, Ruler, Square, Trash2, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DrawingsApi } from "./useDrawings";
import type { DrawingTool } from "./drawingsMachine";

const TOOLS: { tool: DrawingTool; icon: typeof MousePointer2; label: string }[] = [
  { tool: "cursor", icon: MousePointer2, label: "选择" },
  { tool: "measure", icon: Ruler, label: "测量" },
  { tool: "trendline", icon: TrendingUp, label: "趋势线" },
  { tool: "hline", icon: Minus, label: "水平线" },
  { tool: "rect", icon: Square, label: "矩形" },
  { tool: "fib", icon: AlignJustify, label: "斐波那契" },
];

const CLEAR_ARM_MS = 3000;

export function DrawingToolbar({ api }: { api: DrawingsApi }) {
  const [armed, setArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (armTimerRef.current !== null) clearTimeout(armTimerRef.current);
    };
  }, []);

  const onClearClick = () => {
    if (api.count === 0) return;
    if (!armed) {
      setArmed(true);
      armTimerRef.current = setTimeout(() => setArmed(false), CLEAR_ARM_MS);
      return;
    }
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current);
    setArmed(false);
    api.clearAll();
  };

  return (
    <div className="drawing-toolbar" aria-label="标注工具">
      {TOOLS.map(({ tool, icon: Icon, label }) => (
        <button
          key={tool}
          aria-pressed={api.activeTool === tool}
          onClick={() => api.setActiveTool(tool)}
          title={label}
        >
          <Icon size={16} />
        </button>
      ))}
      <div className="drawing-toolbar-sep" />
      <button
        className={armed ? "drawing-toolbar-clear-armed" : undefined}
        disabled={api.count === 0}
        onClick={onClearClick}
        title={armed ? "再次点击确认清空标注" : "清空标注"}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
