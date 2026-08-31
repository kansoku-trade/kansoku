// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasCard } from './CanvasCard';

afterEach(() => cleanup());

describe('CanvasCard chrome', () => {
  it('uses link-button actions instead of bare system buttons', () => {
    render(
      <CanvasCard slug="acceptance-mu-panel" title="MU 验收面板" onOpen={() => {}} />,
    );
    for (const label of ['打开', '新窗口']) {
      expect(screen.getByRole('button', { name: label }).className).toContain('link-button');
    }
    expect(screen.queryByRole('button', { name: '源码' })).toBeNull();
  });
});
