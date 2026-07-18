import { useState } from "react";
import { Library, MessageCircle, Settings } from "lucide-react";
import { normalizeSymbol } from "../../lib/symbol";
import { navigate } from "../../router";
import { listRecentSymbols } from "../../recentCharts";
import { Chip, Input } from "../../ui";

export function QuickBar({
  shortcuts,
  showGlobalActions = true,
}: {
  shortcuts: string[];
  showGlobalActions?: boolean;
}) {
  const [input, setInput] = useState("");
  const shortcutSet = new Set(shortcuts);
  const recent = listRecentSymbols().filter((s) => !shortcutSet.has(s.symbol));

  const go = () => {
    const sym = normalizeSymbol(input);
    if (!sym) return;
    setInput("");
    navigate(`/symbol/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="quickbar">
      <Input
        className="quickbar-input"
        placeholder="代码直达，如 MRVL"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
      />
      {shortcuts.map((sym) => (
        <Chip key={sym} className="quickbar-shortcut" href={`/symbol/${encodeURIComponent(sym)}`}>
          {sym.replace(/\.US$/, "")}
        </Chip>
      ))}
      {recent.length > 0 && (
        <span className="quickbar-recent">
          最近：
          {recent.map((s) => (
            <a key={s.symbol} href={`/symbol/${encodeURIComponent(s.symbol)}`}>
              {s.symbol.replace(/\.US$/, "")}
            </a>
          ))}
        </span>
      )}
      {showGlobalActions ? (
        <span className="quickbar-actions">
          <a className="icon-action" href="/research?view=journal" aria-label="研究库" title="研究库">
            <Library size={16} />
          </a>
          <a className="icon-action" href="/chat" aria-label="AI 对话" title="AI 对话">
            <MessageCircle size={16} />
          </a>
          <a className="icon-action" href="/settings" aria-label="设置" title="设置">
            <Settings size={16} />
          </a>
        </span>
      ) : null}
    </div>
  );
}
