import { useState } from "react";
import { normalizeSymbol } from "./lib/symbol";
import { listRecentSymbols } from "./recentCharts";
import { navigate } from "./router";
import { Button, Chip, Input, openModal } from "./ui";

function OpenSymbolForm({ onOpen, onDone }: { onOpen: (route: string) => void; onDone: () => void }) {
  const [input, setInput] = useState("");
  const recent = listRecentSymbols();
  const symbol = normalizeSymbol(input);

  const open = (sym: string) => {
    onDone();
    onOpen(`/symbol/${encodeURIComponent(sym)}`);
  };

  return (
    <div className="open-symbol-form">
      <Input
        autoFocus
        className="open-symbol-input"
        placeholder="如 MRVL、700.HK、600519.SH"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && symbol) open(symbol);
        }}
      />
      {recent.length > 0 && (
        <div className="open-symbol-recent">
          <span className="open-symbol-recent-label">最近：</span>
          {recent.map((s) => (
            <Chip key={s.symbol} onClick={() => open(s.symbol)}>
              {s.symbol.replace(/\.US$/, "")}
            </Chip>
          ))}
        </div>
      )}
      <div className="open-symbol-actions">
        <Button onClick={onDone}>取消</Button>
        <Button accent disabled={!symbol} onClick={() => symbol && open(symbol)}>
          打开
        </Button>
      </div>
    </div>
  );
}

export function openSymbolDialog(onOpen: (route: string) => void = navigate): void {
  openModal({
    title: "打开个股",
    body: (close) => <OpenSymbolForm onOpen={onOpen} onDone={close} />,
  });
}
