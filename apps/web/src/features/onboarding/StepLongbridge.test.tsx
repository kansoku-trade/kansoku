// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepLongbridge } from './StepLongbridge';

afterEach(() => {
  cleanup();
});

describe('StepLongbridge', () => {
  it('renders the skip action and its hint line under the primary connect flow', () => {
    render(<StepLongbridge status={null} onRecheck={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByText('暂时跳过，先用免费行情')).toBeTruthy();
    expect(
      screen.getByText('免费行情为轮询更新，可能有延迟；之后可以在设置里接入长桥。'),
    ).toBeTruthy();
  });

  it('persists the skip via the bridge callback when clicked', async () => {
    const onSkip = vi.fn().mockResolvedValue(undefined);
    render(<StepLongbridge status={null} onRecheck={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByText('暂时跳过，先用免费行情'));

    expect(onSkip).toHaveBeenCalledTimes(1);
    await Promise.resolve();
  });

  it('shows an error and re-enables the action when persisting the skip fails', async () => {
    const onSkip = vi.fn().mockRejectedValue(new Error('磁盘写入失败'));
    render(<StepLongbridge status={null} onRecheck={vi.fn()} onSkip={onSkip} />);

    const button = screen.getByText('暂时跳过，先用免费行情') as HTMLButtonElement;
    fireEvent.click(button);

    expect(await screen.findByText('磁盘写入失败')).toBeTruthy();
    expect(button.disabled).toBe(false);
  });
});
