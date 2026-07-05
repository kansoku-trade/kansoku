import { useState } from "react";
import { navigate } from "../../router";
import { listRecentCharts } from "../../recentCharts";

function normalizeSymbol(raw: string): string | null {
  let sym = raw.trim().toUpperCase();
  if (!sym) return null;
  if (!sym.includes(".")) sym += ".US";
  return /^[A-Z0-9.]+$/.test(sym) ? sym : null;
}

export function QuickBar({ shortcuts }: { shortcuts: string[] }) {
  const [input, setInput] = useState("");
  const recent = listRecentCharts();

  const go = () => {
    const sym = normalizeSymbol(input);
    if (!sym) return;
    setInput("");
    navigate(`/symbol/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="quickbar">
      <input
        className="quickbar-search"
        placeholder="代码直达，如 MRVL"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
      />
      {shortcuts.map((sym) => (
        <a key={sym} className="quickbar-chip" href={`#/symbol/${encodeURIComponent(sym)}`}>
          {sym.replace(/\.US$/, "")}
        </a>
      ))}
      {recent.length > 0 && (
        <span className="quickbar-recent">
          最近：
          {recent.map((c) => (
            <a key={c.id} href={`#/charts/${encodeURIComponent(c.id)}`} title={c.title}>
              {c.title.length > 14 ? `${c.title.slice(0, 14)}…` : c.title}
            </a>
          ))}
        </span>
      )}
      <a className="quickbar-all" href="#/charts">
        全部图表 →
      </a>
    </div>
  );
}
