import { useEffect, useState } from "react";
import type { OverviewBoard, PortfolioSummary } from "@kansoku/shared/types";
import { useQuery } from "../apiHooks";
import { client } from "../client";
import { listRecentSymbols } from "../recentCharts";
import { Input } from "../ui";
import { buildPaletteCommands, type PaletteCommand } from "./commands";
import { usePalette } from "./usePalette";

const optionId = (commandId: string) => `palette-option-${commandId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

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
  const { data: board } = useQuery<OverviewBoard>("overview.board", () => client.overview.board());
  const { data: portfolio } = useQuery<PortfolioSummary>("positions.list", () => client.positions.list());
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const symbols = [
    ...(board?.rows.map((r) => r.symbol) ?? []),
    ...(portfolio?.positions.map((p) => p.symbol) ?? []),
    ...listRecentSymbols().map((s) => s.symbol),
  ];
  const commands = buildPaletteCommands(query, symbols);
  const active = Math.max(0, Math.min(index, commands.length - 1));
  const activeId = commands[active]?.id;

  useEffect(() => {
    if (activeId) document.getElementById(optionId(activeId))?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const run = (cmd: PaletteCommand) => {
    onClose();
    onOpenRoute(cmd.route);
  };

  const moveDown = () => setIndex((i) => Math.min(i + 1, commands.length - 1));
  const moveUp = () => setIndex((i) => Math.max(i - 1, 0));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const ctrlKey = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (e.key === "ArrowDown" || (ctrlKey && (e.key === "j" || e.key === "n"))) {
      e.preventDefault();
      moveDown();
    } else if (e.key === "ArrowUp" || (ctrlKey && (e.key === "k" || e.key === "p"))) {
      e.preventDefault();
      e.stopPropagation();
      moveUp();
    } else if (e.key === "Enter") {
      const cmd = commands[active];
      if (cmd) run(cmd);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div
        className="palette-panel"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          autoFocus
          className="palette-input"
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
        <div className="palette-list" id="palette-listbox" role="listbox" aria-label="候选命令">
          {commands.map((cmd, i) => (
            <button
              key={cmd.id}
              id={optionId(cmd.id)}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              className={`palette-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(cmd)}
            >
              <span>{cmd.title}</span>
              {cmd.hint && <span className="palette-hint">{cmd.hint}</span>}
            </button>
          ))}
          {commands.length === 0 && <div className="palette-empty">没有匹配项</div>}
        </div>
      </div>
    </div>
  );
}
