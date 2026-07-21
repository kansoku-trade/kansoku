// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './generated-routes';
import {
  getLicenseModalStateForTests,
  resetLicenseModalStoreForTests,
} from './features/edition/licenseModalStore';
import { resetProRoutesForTests } from './features/edition/useProRoutes';

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };

vi.mock('@web/features/edition/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('@web/features/home/Home', () => ({ Home: () => <div data-testid="home" /> }));
vi.mock('@web/features/cockpit/SymbolCockpit', () => ({
  SymbolCockpit: ({ sym }: { sym: string }) => <div data-testid="symbol-cockpit">{sym}</div>,
}));
vi.mock('@web/features/research/ResearchPage', () => ({
  ResearchPage: () => <div data-testid="research-page" />,
}));
vi.mock('@web/features/assistant/AssistantChatPage', () => ({
  AssistantChatPage: () => <div data-testid="chat-page" />,
}));
vi.mock('@web/features/research/ResearchAssistantPage', () => ({
  ResearchAssistantPage: () => <div data-testid="research-assistant-stub" />,
}));

const loadProComposition = vi.hoisted(() => vi.fn());
vi.mock('@web/features/edition/pro', () => ({ loadProComposition }));

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  capabilities = { pro: null, licensed: false };
  loadProComposition.mockReset();
  resetProRoutesForTests();
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

describe('pro-supplied /research/assistant route', () => {
  it('renders the pro component once the composition supplies it', async () => {
    loadProComposition.mockResolvedValue({
      routes: { '/research/assistant': () => <div data-testid="pro-research-assistant" /> },
    });
    renderRoute('/research/assistant');
    await waitFor(() => expect(screen.getByTestId('pro-research-assistant')).toBeTruthy());
  });

  it('falls back to the free stub when the composition supplies no routes', async () => {
    loadProComposition.mockResolvedValue({ routes: {} });
    renderRoute('/research/assistant');
    await waitFor(() => expect(loadProComposition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('research-assistant-stub')).toBeTruthy());
    expect(screen.queryByTestId('pro-research-assistant')).toBeNull();
  });
});
