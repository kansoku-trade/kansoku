// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CanvasCard } from './CanvasCard';

afterEach(() => cleanup());

describe('CanvasCard chrome', () => {
  it('uses link-button actions instead of bare system buttons', () => {
    render(
      <CanvasCard
        slug="acceptance-mu-panel"
        title="MU 验收面板"
        onOpen={() => {}}
        onSource={() => {}}
      />,
    );
    for (const label of ['打开', '新窗口', '源码']) {
      expect(screen.getByRole('button', { name: label }).className).toContain('link-button');
    }
  });
});
