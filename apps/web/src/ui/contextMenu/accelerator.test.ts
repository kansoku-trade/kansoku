import { describe, expect, it } from 'vitest';
import { formatAcceleratorForDisplay, resolveShortcutDisplay } from './accelerator.js';

describe('formatAcceleratorForDisplay', () => {
  it('formats mac symbols without plus separators', () => {
    expect(formatAcceleratorForDisplay('CmdOrCtrl+W', 'mac')).toBe('⌘W');
    expect(formatAcceleratorForDisplay('Shift+CmdOrCtrl+]', 'mac')).toBe('⇧⌘]');
    expect(formatAcceleratorForDisplay('Alt+Shift+K', 'mac')).toBe('⌥⇧K');
  });

  it('formats non-mac with plus separators', () => {
    expect(formatAcceleratorForDisplay('CmdOrCtrl+W', 'other')).toBe('Ctrl+W');
    expect(formatAcceleratorForDisplay('Shift+CmdOrCtrl+]', 'other')).toBe('Shift+Ctrl+]');
  });
});

describe('resolveShortcutDisplay', () => {
  it('prefers explicit shortcut over accelerator', () => {
    expect(resolveShortcutDisplay({ accelerator: 'CmdOrCtrl+W', shortcut: '自定义' }, 'mac')).toBe(
      '自定义',
    );
  });

  it('falls back to formatted accelerator', () => {
    expect(resolveShortcutDisplay({ accelerator: 'CmdOrCtrl+W' }, 'mac')).toBe('⌘W');
  });
});
