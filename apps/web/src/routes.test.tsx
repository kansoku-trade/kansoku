// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './generated-routes';
import {
  getLicenseModalStateForTests,
  resetLicenseModalStoreForTests,
} from './features/edition/licenseModalStore';
import { resetProCompositionForTests } from './features/edition/useProComposition';
import { setActiveRouter } from './lib/router';

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };

vi.mock('@web/features/edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('@web/features/home/Home', () => ({ Home: () => <div data-testid="home" /> }));
vi.mock('@web/features/cockpit/SymbolCockpit', () => ({
  SymbolCockpit: ({ sym }: { sym: string }) => <div data-testid="symbol-cockpit">{sym}</div>,
}));
vi.mock('@web/features/charts/sepa/SepaSymbolPage', () => ({
  SepaSymbolPage: ({ sym, analysisId }: { sym: string; analysisId: string | null }) => (
    <div data-testid="sepa-symbol-page">
      {sym}:{analysisId ?? 'latest'}
    </div>
  ),
}));
vi.mock('@web/features/research/ResearchPage', () => ({
  ResearchPage: () => <div data-testid="research-page" />,
}));
vi.mock('@web/features/assistant/AssistantChatPage', () => ({
  AssistantChatPage: () => <div data-testid="chat-page" />,
}));

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  setActiveRouter(router);
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  setActiveRouter(null);
  capabilities = { pro: null, licensed: false };
  resetProCompositionForTests();
  resetLicenseModalStoreForTests();
});

describe('symbol route', () => {
  it('passes the canonical symbol to the cockpit', async () => {
    renderRoute('/symbol/mu?analysis=latest');
    expect((await screen.findByTestId('symbol-cockpit')).textContent).toBe('MU.US');
  });

  it('does not crash on a malformed encoded symbol', async () => {
    renderRoute('/symbol/%ZZ');
    expect(await screen.findByTestId('home')).toBeTruthy();
  });
});

describe('symbol sepa route', () => {
  it('routes /symbol/sepa/:sym to the dedicated SEPA page instead of the generic cockpit', async () => {
    renderRoute('/symbol/sepa/tsm');
    expect((await screen.findByTestId('sepa-symbol-page')).textContent).toBe('TSM.US:latest');
    expect(screen.queryByTestId('symbol-cockpit')).toBeNull();
  });

  it('passes a pinned ?analysis= id through to the SEPA page', async () => {
    renderRoute('/symbol/sepa/tsm?analysis=2026-07-20-tsm-sepa');
    expect((await screen.findByTestId('sepa-symbol-page')).textContent).toBe(
      'TSM.US:2026-07-20-tsm-sepa',
    );
  });
});

describe('redirect routes', () => {
  it('redirects /overview to home', async () => {
    renderRoute('/overview');
    expect(await screen.findByTestId('home')).toBeTruthy();
  });

  it('redirects /charts to home', async () => {
    renderRoute('/charts');
    expect(await screen.findByTestId('home')).toBeTruthy();
  });
});

describe('unknown route falls back to home', () => {
  it('renders home for an unmatched multi-segment path', async () => {
    renderRoute('/no/such/place');
    expect(await screen.findByTestId('home')).toBeTruthy();
  });
});

describe('AI routes render unconditionally', () => {
  it('renders the real research page for a community build (pro:false)', async () => {
    capabilities = { pro: false, licensed: false };
    renderRoute('/research');
    expect(await screen.findByTestId('research-page')).toBeTruthy();
    expect(screen.queryByText('此构建不含 AI 功能')).toBeNull();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('renders the real chat page for a community build (pro:false)', async () => {
    capabilities = { pro: false, licensed: false };
    renderRoute('/chat');
    expect(await screen.findByTestId('chat-page')).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('redirects /canvases into the research library shelf', async () => {
    capabilities = { pro: false, licensed: false };
    renderRoute('/canvases');
    expect(await screen.findByTestId('research-page')).toBeTruthy();
  });

  it('redirects /canvases/:slug into the research library with the canvas path', async () => {
    capabilities = { pro: false, licensed: false };
    const router = renderRoute('/canvases/acceptance-mu-panel');
    expect(await screen.findByTestId('research-page')).toBeTruthy();
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/research?view=canvases&path=journal%2Fcanvases%2Facceptance-mu-panel.canvas.tsx',
    );
  });

  it('renders the real research page when pro but unlicensed', async () => {
    capabilities = { pro: true, licensed: false };
    renderRoute('/research');
    expect(await screen.findByTestId('research-page')).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('renders the real chat page when pro but unlicensed', async () => {
    capabilities = { pro: true, licensed: false };
    renderRoute('/chat');
    expect(await screen.findByTestId('chat-page')).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('renders the real research page when pro and licensed', async () => {
    capabilities = { pro: true, licensed: true };
    renderRoute('/research');
    expect(await screen.findByTestId('research-page')).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
