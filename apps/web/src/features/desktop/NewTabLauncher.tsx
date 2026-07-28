import { Popover } from '@base-ui/react/popover';
import { GraduationCap, LayoutDashboard, Library, MessageCircle, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { normalizeSymbol } from '../../lib/symbol';
import { Kbd } from '../../ui';

interface NewTabLauncherProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onOpenChat(): void;
  onOpenHome(): void;
  onOpenResearch(): void;
  onOpenSymbol(route: string): void;
  onOpenTrainer?: (() => void) | null;
}

export function NewTabLauncher({
  open,
  onOpenChange,
  onOpenChat,
  onOpenHome,
  onOpenResearch,
  onOpenSymbol,
  onOpenTrainer,
}: NewTabLauncherProps) {
  const [symbol, setSymbol] = useState('');

  const close = () => {
    onOpenChange(false);
    setSymbol('');
  };

  const run = (action: () => void) => {
    close();
    action();
  };

  const openSymbol = () => {
    const normalized = normalizeSymbol(symbol);
    if (!normalized) return;
    run(() => onOpenSymbol(`/symbol/${encodeURIComponent(normalized)}`));
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) setSymbol('');
      }}
    >
      <Popover.Trigger
        className={`desktop-tab-new${open ? ' desktop-tab-new--active' : ''}`}
        aria-label="新建标签"
        title="新建标签"
      >
        <span className="desktop-tab-new-visual">
          <Plus size={13} />
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="desktop-new-tab-positioner"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          <Popover.Popup className="desktop-new-tab-popup" aria-label="新建标签">
            <div className="desktop-new-tab-search">
              <Search size={13} aria-hidden />
              <input
                autoFocus
                aria-label="输入股票代码"
                placeholder="输入股票代码"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openSymbol();
                }}
              />
            </div>
            <div className="desktop-new-tab-menu">
              <button type="button" onClick={() => run(onOpenHome)}>
                <LayoutDashboard size={14} aria-hidden />
                <span>盘面</span>
              </button>
              <button type="button" onClick={() => run(onOpenChat)}>
                <MessageCircle size={14} aria-hidden />
                <span>AI 对话</span>
                <Kbd keys={['mod', 'L']} />
              </button>
              <button type="button" onClick={() => run(onOpenResearch)}>
                <Library size={14} aria-hidden />
                <span>研究库</span>
                <Kbd keys={['shift', 'mod', 'L']} />
              </button>
              {onOpenTrainer && (
                <>
                  <span className="desktop-new-tab-divider" aria-hidden />
                  <button type="button" onClick={() => run(onOpenTrainer)}>
                    <GraduationCap size={14} aria-hidden />
                    <span>盲盘训练</span>
                    <Kbd keys={['shift', 'mod', 'B']} />
                  </button>
                </>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
