// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchCreateResult } from '@kansoku/core/contract/index';

const create = vi.fn();
const navigateMock = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    research: {
      create: (...args: unknown[]) => create(...args),
    },
  },
}));
vi.mock('@web/lib/router', () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));

const { CreateResearchDialog } = await import('./CreateResearchDialog');

function stockResult(overrides: Partial<ResearchCreateResult> = {}): ResearchCreateResult {
  return {
    document: {
      path: 'stocks/MRVL.md',
      kind: 'stock',
      type: 'stock',
      title: 'MRVL',
      date: null,
      symbols: ['MRVL'],
      mtime: '2026-07-23T00:00:00.000Z',
      excerpt: '',
      markdown: '# MRVL',
      revision: 'r1',
    },
    sepaChartId: 'chart-1',
    existed: false,
    ...overrides,
  };
}

function journalResult(overrides: Partial<ResearchCreateResult> = {}): ResearchCreateResult {
  return {
    document: {
      path: 'journal/2026-07-23-thesis-check.md',
      kind: 'journal',
      type: 'journal',
      title: 'Thesis check',
      date: '2026-07-23',
      symbols: [],
      mtime: '2026-07-23T00:00:00.000Z',
      excerpt: '',
      markdown: '# Thesis check',
      revision: 'r1',
    },
    sepaChartId: null,
    existed: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  create.mockReset();
  navigateMock.mockReset();
});

describe('CreateResearchDialog', () => {
  it('creates a stock profile, navigates to it, and closes on success', async () => {
    create.mockResolvedValue(stockResult());
    const close = vi.fn();
    const onCreated = vi.fn();

    render(<CreateResearchDialog initialKind="stock" close={close} onCreated={onCreated} />);

    fireEvent.change(screen.getByPlaceholderText('如 MRVL、700.HK'), {
      target: { value: 'mrvl' },
    });
    fireEvent.click(screen.getByText('建立'));

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({ kind: 'stock', symbol: 'MRVL' });
    expect(navigateMock).toHaveBeenCalledWith('/research?view=stocks&path=stocks%2FMRVL.md');
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ existed: false }));
  });

  it('uppercases the symbol as it is typed', () => {
    render(<CreateResearchDialog initialKind="stock" close={vi.fn()} onCreated={vi.fn()} />);
    const input = screen.getByPlaceholderText('如 MRVL、700.HK') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'mrvl' } });
    expect(input.value).toBe('MRVL');
  });

  it('shows the busy caption with a day-kline hint while building a stock profile', async () => {
    let resolveCreate: (value: ResearchCreateResult) => void = () => {};
    create.mockReturnValue(
      new Promise<ResearchCreateResult>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const onCreated = vi.fn();

    render(<CreateResearchDialog initialKind="stock" close={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('如 MRVL、700.HK'), {
      target: { value: 'MRVL' },
    });
    fireEvent.click(screen.getByText('建立'));

    expect(await screen.findByText('正在建立档案并生成 SEPA 仪表盘…')).toBeTruthy();

    await act(async () => {
      resolveCreate(stockResult());
      await Promise.resolve();
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('invokes onCreated with existed:true and still closes so the caller can show the hint', async () => {
    create.mockResolvedValue(stockResult({ existed: true, sepaChartId: null }));
    const close = vi.fn();
    const onCreated = vi.fn();

    render(<CreateResearchDialog initialKind="stock" close={close} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('如 MRVL、700.HK'), {
      target: { value: 'MRVL' },
    });
    fireEvent.click(screen.getByText('建立'));

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ existed: true }));
    expect(navigateMock).toHaveBeenCalledWith('/research?view=stocks&path=stocks%2FMRVL.md');
  });

  it('shows the backend error and keeps the dialog open on failure', async () => {
    create.mockRejectedValue(new Error('股票代码无效'));
    const close = vi.fn();
    const onCreated = vi.fn();

    render(<CreateResearchDialog initialKind="stock" close={close} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText('如 MRVL、700.HK'), {
      target: { value: 'ZZZZ' },
    });
    fireEvent.click(screen.getByText('建立'));

    expect(await screen.findByText('股票代码无效')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('creates a journal entry with the entered title and date', async () => {
    create.mockResolvedValue(journalResult());
    const close = vi.fn();
    const onCreated = vi.fn();

    render(<CreateResearchDialog initialKind="journal" close={close} onCreated={onCreated} />);

    fireEvent.change(screen.getByPlaceholderText('研究日志标题'), {
      target: { value: 'Thesis check' },
    });
    fireEvent.change(screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}$/), {
      target: { value: '2026-07-01' },
    });
    fireEvent.click(screen.getByText('建立'));

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith({
      kind: 'journal',
      title: 'Thesis check',
      date: '2026-07-01',
    });
    expect(navigateMock).toHaveBeenCalledWith(
      '/research?view=journal&path=journal%2F2026-07-23-thesis-check.md',
    );
  });

  it('disables submit until the required field is non-empty', () => {
    render(<CreateResearchDialog initialKind="stock" close={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByText('建立').closest('button')?.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('如 MRVL、700.HK'), {
      target: { value: 'MRVL' },
    });
    expect(screen.getByText('建立').closest('button')?.disabled).toBe(false);
  });
});
