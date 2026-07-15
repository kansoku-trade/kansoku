import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MacroEventItem } from "../../../shared/types.js";

const filterMacroForSymbol = vi.fn(async (_symbol: string, items: MacroEventItem[]) => items);

vi.mock("../src/ai/eventFilter.js", () => ({
  filterMacroForSymbol: (...args: [string, MacroEventItem[]]) => filterMacroForSymbol(...args),
}));

const runLongbridgeJson = vi.fn();

vi.mock("../src/services/longbridgeCli.js", () => ({
  runLongbridgeJson: (...args: unknown[]) => runLongbridgeJson(...args),
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
            star: 3,
          },
        ],
      },
    ],
  };
}

describe("getEventRisk provider wiring", () => {
  const now = new Date("2026-07-10T15:00:00.000Z");

  beforeEach(() => {
    filterMacroForSymbol.mockClear();
  });

  afterEach(() => {
    setActiveSettingsStore(null);
  });

  it("resolves next earnings and macro releases through the routed provider", async () => {
    runLongbridgeJson.mockImplementation((args: string[]) => {
      if (args.includes("report")) {
        return Promise.resolve({
          list: [{ date: "2026-07-20", infos: [{ counter_id: "NVDA.US", content: "NVDA Q2 2026" }] }],
        });
      }
      return Promise.resolve(macroPayload(now));
    });

    const risk = await getEventRisk("NVDA.US", now);
    expect(risk?.next_earnings).toEqual({ date: "2026-07-20", title: "NVDA Q2 2026" });
    expect(risk?.macro).toHaveLength(1);
    expect(risk?.macro[0]?.title).toBe("CPI");
  });

  it("gates non-US symbols before touching the provider", async () => {
    runLongbridgeJson.mockClear();
    const risk = await getEventRisk("700.HK", now);
    expect(risk).toBeNull();
    expect(runLongbridgeJson).not.toHaveBeenCalled();
  });
});

describe("getEventRisk relevance cache", () => {
  const now = new Date("2026-07-10T15:00:00.000Z");

  beforeEach(() => {
    filterMacroForSymbol.mockClear();
    runLongbridgeJson.mockImplementation((args: string[]) => {
      return Promise.resolve(args.includes("macrodata") ? macroPayload(now) : { list: [] });
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
