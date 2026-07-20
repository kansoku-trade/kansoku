// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetProRoutesForTests } from './edition/useProRoutes';
import { Router } from './PageRouter';

const loadProComposition = vi.hoisted(() => vi.fn());
vi.mock('./edition/pro', () => ({ loadProComposition }));
vi.mock('./pages/Home', () => ({ Home: () => <div data-testid="home" /> }));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  loadProComposition.mockReset();
  resetProRoutesForTests();
});

describe('Router renders a pro-supplied route', () => {
  it('renders the /research/assistant route once the composition supplies it', async () => {
    loadProComposition.mockResolvedValue({
      routes: { '/research/assistant': () => <div data-testid="pro-research-assistant" /> },
    });
    window.history.replaceState({}, '', '/research/assistant');

    render(<Router />);

    await waitFor(() => expect(screen.getByTestId('pro-research-assistant')).toBeTruthy());
  });

  it('falls through to Home for /research/assistant when the composition supplies no routes', async () => {
    loadProComposition.mockResolvedValue({ routes: {} });
    window.history.replaceState({}, '', '/research/assistant');

    render(<Router />);

    await waitFor(() => expect(loadProComposition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy());
    expect(screen.queryByTestId('pro-research-assistant')).toBeNull();
  });
});
