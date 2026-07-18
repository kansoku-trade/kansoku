import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: never[]) => unknown;

class FakeWebContents {
  listeners = new Map<string, Handler[]>();
  on(event: string, cb: Handler): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }
  setWindowOpenHandler(): void {}
}

class FakeWindow {
  webContents = new FakeWebContents();
  options: Record<string, unknown>;
  private closedHandlers: Handler[] = [];
  private readyHandlers: Handler[] = [];
  loadedUrl: string | null = null;

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  on(event: string, cb: Handler): void {
    if (event === "closed") this.closedHandlers.push(cb);
  }

  once(event: string, cb: Handler): void {
    if (event === "ready-to-show") this.readyHandlers.push(cb);
  }

  loadURL(url: string): void {
    this.loadedUrl = url;
  }

  show(): void {}

  emitClosed(): void {
    for (const cb of this.closedHandlers) cb();
  }
}

const createdWindows: FakeWindow[] = [];
const BrowserWindow = vi.fn(function (this: unknown, options: Record<string, unknown>) {
  const win = new FakeWindow(options);
  createdWindows.push(win);
  return win;
});

const app = { getAppPath: vi.fn(() => "/app") };
const screen = { getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })) };

vi.mock("electron", () => ({ app, BrowserWindow, screen }));
vi.mock("@desktop/boot/env.js", () => ({ IS_DEV: false }));

const { createPopoutWindow, cascadePosition, isPopoutWindow, isValidPopoutSymbol, popoutRoute, popoutUrl } =
  await import("@desktop/window/popoutWindow.js");

describe("isValidPopoutSymbol", () => {
  it("accepts plain tickers and dotted/suffixed forms", () => {
    expect(isValidPopoutSymbol("NVDA")).toBe(true);
    expect(isValidPopoutSymbol("nvda")).toBe(true);
    expect(isValidPopoutSymbol("BRK.B")).toBe(true);
    expect(isValidPopoutSymbol("700.HK")).toBe(true);
    expect(isValidPopoutSymbol("SPX-500")).toBe(true);
  });

  it("rejects empty, oversized, or shell-hostile input", () => {
    expect(isValidPopoutSymbol("")).toBe(false);
    expect(isValidPopoutSymbol("A".repeat(21))).toBe(false);
    expect(isValidPopoutSymbol("NVDA; rm -rf /")).toBe(false);
    expect(isValidPopoutSymbol("../../etc/passwd")).toBe(false);
    expect(isValidPopoutSymbol("<script>")).toBe(false);
  });

  it("rejects dot-only input that URL normalization would escape the popout route with", () => {
    expect(isValidPopoutSymbol("..")).toBe(false);
    expect(isValidPopoutSymbol(".")).toBe(false);
    expect(isValidPopoutSymbol("...")).toBe(false);
    expect(isValidPopoutSymbol("--")).toBe(false);
  });
});

describe("popoutRoute / popoutUrl", () => {
  it("builds an encoded /popout/symbol route", () => {
    expect(popoutRoute("BRK.B")).toBe("/popout/symbol/BRK.B");
    expect(popoutRoute("700.HK")).toBe("/popout/symbol/700.HK");
  });

  it("resolves against the prod app:// origin outside dev", () => {
    expect(popoutUrl("NVDA.US")).toBe("app://-/popout/symbol/NVDA.US");
  });
});

describe("cascadePosition", () => {
  it("offsets each successive popout by the given step from the anchor", () => {
    const anchor = { x: 100, y: 80 };
    expect(cascadePosition(anchor, 0)).toEqual({ x: 100, y: 80 });
    expect(cascadePosition(anchor, 1)).toEqual({ x: 124, y: 104 });
    expect(cascadePosition(anchor, 2)).toEqual({ x: 148, y: 128 });
  });
});

describe("createPopoutWindow", () => {
  beforeEach(() => {
    createdWindows.length = 0;
    BrowserWindow.mockClear();
  });

  it("throws for a symbol that fails validation before touching BrowserWindow", () => {
    expect(() => createPopoutWindow("../evil")).toThrow(/invalid popout symbol/);
    expect(BrowserWindow).not.toHaveBeenCalled();
  });

  it("creates a sandboxed window sized per contract and loads the popout route", () => {
    const win = createPopoutWindow("NVDA.US");

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 520,
        height: 420,
        minWidth: 360,
        minHeight: 300,
        webPreferences: expect.objectContaining({ sandbox: true, contextIsolation: true, nodeIntegration: false }),
      }),
    );
    expect((win as unknown as FakeWindow).loadedUrl).toBe("app://-/popout/symbol/NVDA.US");
    expect(isPopoutWindow(win)).toBe(true);
  });

  it("cascades successive popouts and forgets them once closed", () => {
    const win1 = createPopoutWindow("NVDA.US");
    const win2 = createPopoutWindow("MU.US");

    const opts1 = (win1 as unknown as FakeWindow).options;
    const opts2 = (win2 as unknown as FakeWindow).options;
    expect(opts2.x).toBe((opts1.x as number) + 24);
    expect(opts2.y).toBe((opts1.y as number) + 24);

    (win1 as unknown as FakeWindow).emitClosed();
    expect(isPopoutWindow(win1)).toBe(false);
    expect(isPopoutWindow(win2)).toBe(true);
  });
});
