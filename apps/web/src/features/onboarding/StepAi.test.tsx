// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../settings/types';

const getCatalog = vi.fn();
const putCredential = vi.fn();
const putProviderBaseUrl = vi.fn();
const putRole = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    settings: {
      getCatalog: (...args: unknown[]) => getCatalog(...args),
      putCredential: (...args: unknown[]) => putCredential(...args),
      putProviderBaseUrl: (...args: unknown[]) => putProviderBaseUrl(...args),
      putRole: (...args: unknown[]) => putRole(...args),
    },
  },
}));

const { StepAi } = await import('./StepAi');

const catalog: Catalog = {
  providers: [
    {
      id: 'openai',
      name: 'OpenAI',
      auth: { kind: 'api_key', status: 'missing' },
      models: [{ id: 'gpt-test', name: 'GPT Test', thinkingLevels: [] }],
    },
  ],
};

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

async function openApiKeyForm() {
  fireEvent.click(await screen.findByRole('button', { name: '填入' }));
}

function enterApiKey(value = 'sk-test') {
  fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value } });
}

describe('StepAi', () => {
  afterEach(() => {
    cleanup();
    for (const mock of [getCatalog, putCredential, putProviderBaseUrl, putRole]) {
      mock.mockReset();
    }
  });

  it('saves a custom Base URL before refreshing the catalog and assigning the primary model', async () => {
    getCatalog.mockResolvedValue(catalog);
    putCredential.mockResolvedValue({ provider: 'openai', masked: '••••test' });
    putProviderBaseUrl.mockResolvedValue({
      provider: 'openai',
      baseUrl: 'https://gateway.example.com/v1',
    });
    putRole.mockResolvedValue({
      mode: 'custom',
      provider: 'openai',
      modelId: 'gpt-test',
      thinkingLevel: 'off',
    });
    const onNext = vi.fn();

    renderWithClient(<StepAi onNext={onNext} />);
    await openApiKeyForm();
    expect(document.querySelectorAll('.onboarding-apikey-row')).toHaveLength(2);
    enterApiKey();
    fireEvent.change(screen.getByLabelText('Base URL（可选）'), {
      target: { value: 'https://gateway.example.com/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并使用' }));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(putCredential).toHaveBeenCalledWith({ provider: 'openai', key: 'sk-test' });
    expect(putProviderBaseUrl).toHaveBeenCalledWith({
      provider: 'openai',
      baseUrl: 'https://gateway.example.com/v1',
    });
    expect(putRole).toHaveBeenCalledWith({
      role: 'primary',
      mode: 'custom',
      provider: 'openai',
      modelId: 'gpt-test',
      thinkingLevel: 'off',
    });
    expect(putCredential.mock.invocationCallOrder[0]).toBeLessThan(
      putProviderBaseUrl.mock.invocationCallOrder[0],
    );
    expect(putProviderBaseUrl.mock.invocationCallOrder[0]).toBeLessThan(
      getCatalog.mock.invocationCallOrder[1],
    );
    expect(getCatalog.mock.invocationCallOrder[1]).toBeLessThan(
      putRole.mock.invocationCallOrder[0],
    );
  });

  it('keeps the official endpoint when Base URL is left blank', async () => {
    getCatalog.mockResolvedValue(catalog);
    putCredential.mockResolvedValue({ provider: 'openai', masked: '••••test' });
    putProviderBaseUrl.mockResolvedValue({ provider: 'openai', baseUrl: null });
    putRole.mockResolvedValue({
      mode: 'custom',
      provider: 'openai',
      modelId: 'gpt-test',
      thinkingLevel: 'off',
    });
    const onNext = vi.fn();

    renderWithClient(<StepAi onNext={onNext} />);
    await openApiKeyForm();
    enterApiKey();
    fireEvent.click(screen.getByRole('button', { name: '保存并使用' }));

    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(putProviderBaseUrl).toHaveBeenCalledWith({ provider: 'openai', baseUrl: '' });
  });

  it('shows Base URL validation errors and does not finish onboarding', async () => {
    getCatalog.mockResolvedValue(catalog);
    putCredential.mockResolvedValue({ provider: 'openai', masked: '••••test' });
    putProviderBaseUrl.mockRejectedValue(
      new Error('invalid baseUrl: gateway.example.com — expected a full http(s) URL'),
    );
    const onNext = vi.fn();

    renderWithClient(<StepAi onNext={onNext} />);
    await openApiKeyForm();
    enterApiKey();
    fireEvent.change(screen.getByLabelText('Base URL（可选）'), {
      target: { value: 'gateway.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并使用' }));

    expect(
      await screen.findByText('invalid baseUrl: gateway.example.com — expected a full http(s) URL'),
    ).toBeTruthy();
    expect(onNext).not.toHaveBeenCalled();
    expect(putRole).not.toHaveBeenCalled();
  });
});
