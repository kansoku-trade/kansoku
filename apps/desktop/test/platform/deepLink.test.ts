import { describe, expect, it, vi } from 'vitest';
import {
  DEEP_LINK_NAVIGATE_CHANNEL,
  dispatchDeepLink,
  findDeepLinkArg,
  parseDeepLink,
  type DeepLinkWindow,
} from '@desktop/platform/deepLink/deepLink.js';

function mockWindow(overrides: Partial<DeepLinkWindow> = {}): DeepLinkWindow {
  return {
    webContents: { send: vi.fn() },
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  };
}

describe('parseDeepLink', () => {
  it('parses a symbol analysis deep link', () => {
    expect(parseDeepLink('kansoku://route/symbol/NVDA?analysis=abc123')).toEqual({
      path: '/symbol/NVDA',
      search: '?analysis=abc123',
    });
  });

  it('parses a home date deep link', () => {
    expect(parseDeepLink('kansoku://route/?date=2026-07-22')).toEqual({
      path: '/',
      search: '?date=2026-07-22',
    });
  });

  it('rejects a mismatched scheme', () => {
    expect(parseDeepLink('http://route/symbol/NVDA')).toBeNull();
  });

  it('rejects a mismatched host', () => {
    expect(parseDeepLink('kansoku://other/symbol/NVDA')).toBeNull();
  });

  it('rejects an unparsable url', () => {
    expect(parseDeepLink('not a url')).toBeNull();
  });
});

describe('findDeepLinkArg', () => {
  it('finds the kansoku:// argument among argv', () => {
    expect(findDeepLinkArg(['electron', '--flag', 'kansoku://route/?date=2026-07-22'])).toBe(
      'kansoku://route/?date=2026-07-22',
    );
  });

  it('returns undefined when no argument matches', () => {
    expect(findDeepLinkArg(['electron', '--flag'])).toBeUndefined();
  });
});

describe('dispatchDeepLink', () => {
  it('sends the parsed target to the window and focuses it', () => {
    const win = mockWindow();
    const ok = dispatchDeepLink(win, 'kansoku://route/symbol/NVDA?analysis=abc123');
    expect(ok).toBe(true);
    expect(win.webContents.send).toHaveBeenCalledWith(DEEP_LINK_NAVIGATE_CHANNEL, {
      path: '/symbol/NVDA',
      search: '?analysis=abc123',
    });
    expect(win.focus).toHaveBeenCalled();
    expect(win.restore).not.toHaveBeenCalled();
  });

  it('restores a minimized window before focusing', () => {
    const win = mockWindow({ isMinimized: vi.fn(() => true) });
    dispatchDeepLink(win, 'kansoku://route/?date=2026-07-22');
    expect(win.restore).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it('bails without sending or focusing when the url does not match the scheme', () => {
    const win = mockWindow();
    const ok = dispatchDeepLink(win, 'https://example.com/');
    expect(ok).toBe(false);
    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });
});
