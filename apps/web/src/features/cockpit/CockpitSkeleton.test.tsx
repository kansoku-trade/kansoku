// @vitest-environment jsdom
import * as stylex from '@stylexjs/stylex';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CockpitSkeleton } from './CockpitSkeleton';

const probe = stylex.create({
  sidebarPadding: {
    padding: 16,
  },
});

describe('CockpitSkeleton', () => {
  it('pads the right sidebar bone stack like the live sidebar', () => {
    const { container } = render(<CockpitSkeleton />);
    const sidebar = container.querySelector('.sidebar');
    expect(sidebar).toBeTruthy();

    const scroll = sidebar?.lastElementChild as HTMLElement | undefined;
    expect(scroll).toBeTruthy();

    const paddingClass = stylex.props(probe.sidebarPadding).className ?? '';
    expect(paddingClass).toBeTruthy();
    const applied = new Set(scroll!.className.split(/\s+/).filter(Boolean));
    for (const cls of paddingClass.split(/\s+/).filter(Boolean)) {
      expect(applied).toContain(cls);
    }
  });
});
