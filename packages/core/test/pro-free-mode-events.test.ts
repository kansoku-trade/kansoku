import { describe, expect, it, vi } from "vitest";
import type { MacroEventItem } from "@kansoku/shared/types";

const runLongbridgeJson = vi.fn();

vi.mock("../src/services/longbridgeCli.js", () => ({
  runLongbridgeJson: (...args: unknown[]) => runLongbridgeJson(...args),
}));

const { getEventRisk } = await import("../src/services/events.js");
const { isProPresent } = await import("../src/pro/registry.js");

function macroPayload(now: Date): unknown {
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

describe("pro free-mode fallback for events.ts (no builtin registered)", () => {
  it("has nothing registered so the default hooks apply", () => {
    expect(isProPresent()).toBe(false);
  });

  it("passes macro items through unchanged without calling any AI filter", async () => {
    const now = new Date("2026-07-10T15:00:00.000Z");
    runLongbridgeJson.mockImplementation((args: string[]) => {
      return Promise.resolve(args.includes("macrodata") ? macroPayload(now) : { list: [] });
    });

    const risk = await getEventRisk("FREEEVT.US", now);
    expect(risk?.macro).toHaveLength(1);
    expect((risk?.macro as MacroEventItem[])[0]?.title).toBe("CPI");
  });
});
