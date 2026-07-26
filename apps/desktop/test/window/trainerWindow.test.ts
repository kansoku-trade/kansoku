import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  private readyHandlers: Handler[] = [];
  loadedUrl: string | null = null;

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  on(): void {}

  once(event: string, cb: Handler): void {
    if (event === 'ready-to-show') this.readyHandlers.push(cb);
  }

  loadURL(url: string): void {
    this.loadedUrl = url;
  }

  show(): void {}
}

const createdWindows: FakeWindow[] = [];
const BrowserWindow = vi.fn(function (this: unknown, options: Record<string, unknown>) {
  const win = new FakeWindow(options);
  createdWindows.push(win);
  return win;
});

const app = { getAppPath: vi.fn(() => '/app') };

vi.mock('electron', () => ({ app, BrowserWindow }));
vi.mock('@desktop/boot/env.js', () => ({ IS_DEV: false }));

const { createTrainerWindow, trainerUrl } = await import('@desktop/shell/window/trainerWindow.js');

describe('trainerUrl', () => {
  it('resolves against the prod app:// origin outside dev', () => {
    expect(trainerUrl()).toBe('app://-/train.html');
  });
});

describe('createTrainerWindow', () => {
  beforeEach(() => {
    createdWindows.length = 0;
    BrowserWindow.mockClear();
  });

  it('creates a sandboxed, independently sized, fullscreenable window and loads the trainer entry', () => {
    const win = createTrainerWindow();

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1280,
        height: 860,
        minWidth: 960,
        minHeight: 640,
        fullscreenable: true,
        webPreferences: expect.objectContaining({
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        }),
      }),
    );
    expect((win as unknown as FakeWindow).loadedUrl).toBe('app://-/train.html');
  });
});
