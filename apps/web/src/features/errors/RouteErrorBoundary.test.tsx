// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const removeClient = vi.fn(() => Promise.resolve());

vi.mock('@web/lib/queryClient', () => ({ persister: { removeClient } }));

const { RouteErrorBoundary } = await import('./RouteErrorBoundary');

function Boom({ error }: { error: unknown }): never {
  throw error;
}

function renderAt(error: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/', Component: () => <div data-testid="home" /> },
      {
        path: '/broken',
        Component: () => <Boom error={error} />,
        ErrorBoundary: RouteErrorBoundary,
      },
    ],
    { initialEntries: ['/broken'] },
  );
  return render(<RouterProvider router={router} />);
}

// Only a throw from a loader becomes an ErrorResponse; one from render stays the raw value.
function renderThrownFromLoader(thrown: unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => {
          throw thrown;
        },
        Component: () => null,
        ErrorBoundary: RouteErrorBoundary,
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  removeClient.mockClear();
});

describe('RouteErrorBoundary', () => {
  it('leads with the failure and keeps the stack folded away', () => {
    const error = new Error("Cannot read properties of undefined (reading 'map')");
    error.stack = `TypeError: ${error.message}\n    at Fce (router.js:758:125168)`;

    renderAt(error);

    expect(screen.getByText('这个页面崩了')).toBeTruthy();
    expect(screen.getByText("Cannot read properties of undefined (reading 'map')")).toBeTruthy();
    const details = screen.getByText('技术细节').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('at Fce (router.js:758:125168)');
  });

  it('drops the persisted query cache before reloading, so a poisoned snapshot cannot come back', () => {
    renderAt(new Error('boom'));

    screen.getByRole('button', { name: /清掉本地缓存/ }).click();

    expect(removeClient).toHaveBeenCalledOnce();
  });

  it('names a missing route as missing rather than as a crash', async () => {
    renderThrownFromLoader(new Response('', { status: 404, statusText: 'Not Found' }));

    expect(await screen.findByText('这个页面不存在')).toBeTruthy();
    expect(screen.queryByText('技术细节')).toBeNull();
  });

  it('sends 回首页 through the router rather than reloading the window', async () => {
    renderAt(new Error('boom'));

    screen.getByRole('button', { name: '回首页' }).click();

    expect(await screen.findByTestId('home')).toBeTruthy();
  });
});
