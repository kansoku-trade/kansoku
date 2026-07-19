// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let capabilities: { features?: Record<string, string> } = { features: { 'deep-dive': 'active' } };
const note = vi.fn();

vi.mock('@web/capabilitiesStore', () => ({
  useCapabilities: () => capabilities,
}));
vi.mock('@web/client', () => ({
  client: {
    symbols: {
      note: (...args: unknown[]) => note(...args),
    },
  },
}));

const proSlotStub = vi.fn();
vi.mock('@web/host/useProSlot', () => ({
  useProSlot: (...args: unknown[]) => proSlotStub(...args),
}));

const { getLicenseModalStateForTests, resetLicenseModalStoreForTests } =
  await import('@web/licenseModalStore');
const { NoteTab } = await import('./NoteTab');

function StubControl(props: { symbol: string; note: { markdown?: string | null } | null }) {
  return (
    <div
      data-testid="stub-control"
      data-symbol={props.symbol}
      data-markdown={props.note?.markdown ?? ''}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  capabilities = { features: { 'deep-dive': 'active' } };
  resetLicenseModalStoreForTests();
  note.mockReset();
  proSlotStub.mockReset();
});

describe('NoteTab deep-dive slot gate', () => {
  it('hides the deep-dive button for a community build (feature absent) but keeps the note surface', async () => {
    capabilities = { features: { 'deep-dive': 'absent' } };
    note.mockResolvedValue({ markdown: null });
    proSlotStub.mockReturnValue(null);

    render(<NoteTab symbol="MRVL.US" />);

    expect(await screen.findByText(/还没有 MRVL.US 的研究笔记/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('stub-control')).toBeNull();
  });

  it('hides the deep-dive button while capabilities are still loading (pro:null)', async () => {
    capabilities = { features: undefined };
    note.mockResolvedValue({ markdown: null });
    proSlotStub.mockReturnValue(null);

    render(<NoteTab symbol="MRVL.US" />);

    expect(await screen.findByText(/还没有 MRVL.US 的研究笔记/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the license modal instead of loading the pro slot when locked', async () => {
    capabilities = { features: { 'deep-dive': 'locked' } };
    note.mockResolvedValue({ markdown: null });
    proSlotStub.mockReturnValue(null);

    render(<NoteTab symbol="MRVL.US" />);
    const button = await screen.findByRole('button', { name: /跑一次深度分析/ });
    fireEvent.click(button);

    expect(screen.queryByTestId('stub-control')).toBeNull();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('mounts the resolved pro slot component with symbol/note/onNoteReady props when active', async () => {
    capabilities = { features: { 'deep-dive': 'active' } };
    note.mockResolvedValue({ markdown: '深度分析内容' });
    proSlotStub.mockReturnValue(StubControl);

    render(<NoteTab symbol="MRVL.US" />);

    await screen.findByText('深度分析内容');
    const stub = await screen.findByTestId('stub-control');
    expect(proSlotStub).toHaveBeenCalledWith('deep-dive.action');
    expect(stub.dataset.symbol).toBe('MRVL.US');
    expect(stub.dataset.markdown).toBe('深度分析内容');
  });

  it('renders nothing for the deep-dive slot while active but the pro slot component has not resolved yet', async () => {
    capabilities = { features: { 'deep-dive': 'active' } };
    note.mockResolvedValue({ markdown: null });
    proSlotStub.mockReturnValue(null);

    render(<NoteTab symbol="MRVL.US" />);

    expect(await screen.findByText(/还没有 MRVL.US 的研究笔记/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('stub-control')).toBeNull();
  });
});
