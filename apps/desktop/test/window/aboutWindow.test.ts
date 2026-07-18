import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: never[]) => unknown;

class FakeWindow {
  options: Record<string, unknown>;
  loadedUrl: string | null = null;
  focused = 0;
  destroyed = false;
  private closedHandlers: Handler[] = [];

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  on(event: string, cb: Handler): void {
    if (event === "closed") this.closedHandlers.push(cb);
  }

  once(): void {}

  loadURL(url: string): void {
    this.loadedUrl = url;
  }

  focus(): void {
    this.focused += 1;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  show(): void {}

  emitClosed(): void {
    this.destroyed = true;
    for (const cb of this.closedHandlers) cb();
  }
}

const createdWindows: FakeWindow[] = [];
const BrowserWindow = vi.fn(function (this: unknown, options: Record<string, unknown>) {
  const win = new FakeWindow(options);
  createdWindows.push(win);
  return win;
});

const app = { getVersion: vi.fn(() => "9.9.9") };
const applyWindowSecurity = vi.fn();

vi.mock("electron", () => ({ app, BrowserWindow }));
vi.mock("../../src/window/mainWindow.js", () => ({
  APP_ICON_PNG: "/nonexistent/icon.png",
  applyWindowSecurity,
}));

const { buildAboutHtml, isAboutWindow, openAboutWindow } = await import("../../src/window/aboutWindow.js");

describe("buildAboutHtml", () => {
  it("includes version, copyright, license name, and credits", () => {
    const html = buildAboutHtml({ version: "1.2.3", iconUrl: "" });
    expect(html).toContain("版本 1.2.3");
    expect(html).toContain("© 2026 Innei");
    expect(html).toContain("AGPL-3.0 + Commons Clause");
    expect(html).toContain("Commons Clause");
    expect(html).toContain("第三方开源组件");
  });

  it("escapes markup in the version string", () => {
    const html = buildAboutHtml({ version: "<script>", iconUrl: "" });
    expect(html).not.toContain("版本 <script>");
    expect(html).toContain("版本 &lt;script&gt;");
  });
});

describe("openAboutWindow", () => {
  beforeEach(() => {
    createdWindows.length = 0;
    BrowserWindow.mockClear();
    applyWindowSecurity.mockClear();
  });

  afterEach(() => {
    for (const win of createdWindows) {
      if (!win.destroyed) win.emitClosed();
    }
  });

  it("creates a fixed, sandboxed window and loads the about document", () => {
    openAboutWindow();
    expect(createdWindows).toHaveLength(1);
    const win = createdWindows[0];
    expect(win.options).toMatchObject({
      resizable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    expect(win.loadedUrl).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(win.loadedUrl ?? "")).toContain("版本 9.9.9");
    expect(applyWindowSecurity).toHaveBeenCalledOnce();
  });

  it("focuses the existing window instead of creating a second one", () => {
    openAboutWindow();
    openAboutWindow();
    expect(createdWindows).toHaveLength(1);
    expect(createdWindows[0].focused).toBe(1);
  });

  it("creates a fresh window after the previous one closed", () => {
    openAboutWindow();
    createdWindows[0].emitClosed();
    openAboutWindow();
    expect(createdWindows).toHaveLength(2);
  });

  it("identifies the live about window and forgets it after close", () => {
    const win = openAboutWindow();
    expect(isAboutWindow(win)).toBe(true);
    expect(isAboutWindow({} as never)).toBe(false);
    createdWindows[0].emitClosed();
    expect(isAboutWindow(win)).toBe(false);
  });
});
