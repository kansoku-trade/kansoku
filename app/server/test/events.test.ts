import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MacroEventItem } from "../../shared/types.js";

const filterMacroForSymbol = vi.fn(async (_symbol: string, items: MacroEventItem[]) => items);

vi.mock("../src/ai/eventFilter.js", () => ({
  filterMacroForSymbol: (...args: [string, MacroEventItem[]]) => filterMacroForSymbol(...args),
}));

const execFile = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFile(...args),
}));

const { getEventRisk } = await import("../src/services/events.js");
const { createSettingsStore, setActiveSettingsStore } = await import("../src/ai/settingsStore.js");
const { createDb } = await import("../src/db/index.js");

function macroPayload(now: Date) {
  return {
    list: [
      {
        date: now.toISOString().slice(0, 10),
        infos: [
          {
            content: "CPI",
            datetime: String(Math.floor(now.getTime() / 1000) + 3600),
            data_kv: [],
          },
        ],
      },
    ],
  };
}

describe("getEventRisk relevance cache", () => {
  const now = new Date("2026-07-10T15:00:00.000Z");

  beforeEach(() => {
    filterMacroForSymbol.mockClear();
    execFile.mockImplementation((_cmd: string, args: string[], _opts: unknown, cb: (err: unknown, stdout: string) => void) => {
      const payload = args.includes("macrodata") ? macroPayload(now) : { list: [] };
      cb(null, JSON.stringify(payload));
    });
  });

  afterEach(() => {
    setActiveSettingsStore(null);
  });

  it("reuses the cached filter result on a second call, and re-runs after a settings revision bump", async () => {
    await getEventRisk("MU.US", now);
    expect(filterMacroForSymbol).toHaveBeenCalledTimes(1);

    await getEventRisk("MU.US", now);
    expect(filterMacroForSymbol).toHaveBeenCalledTimes(1);

    const dir = mkdtempSync(join(tmpdir(), "events-cache-"));
    try {
      const store = createSettingsStore(createDb(join(dir, "app.db")));
      setActiveSettingsStore(store);
      store.setRole("comment", { mode: "disabled", provider: null, modelId: null, thinkingLevel: null });

      await getEventRisk("MU.US", now);
      expect(filterMacroForSymbol).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
