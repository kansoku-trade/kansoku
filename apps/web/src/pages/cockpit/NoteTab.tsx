import { useCallback } from 'react';
import { Lock, Maximize2 } from 'lucide-react';
import { Button, Empty, ErrorBox, MarketTime } from '@web/ui';
import { marketOfSymbol } from '@web/lib/market';
import { useFeature } from '@web/useFeature';
import { useProSlot } from '@web/host/useProSlot';
import { Markdown, openMarkdownModal } from './markdown';
import { useNote, type NoteResponse } from './useNote';

interface DeepDiveActionProps {
  symbol: string;
  note: NoteResponse | null;
  onNoteReady: () => void;
}

function DeepDiveAction({ symbol, note, onNoteReady }: DeepDiveActionProps) {
  const { state, locked, guard } = useFeature('deep-dive');
  const Control = useProSlot<DeepDiveActionProps>('deep-dive.action');

  if (state === 'absent') return null;
  if (locked) {
    return (
      <Button onClick={() => guard(() => {})}>
        <Lock size={13} />
        {note?.markdown ? '重新深度分析' : '跑一次深度分析'}
      </Button>
    );
  }
  if (!Control) return null;
  return <Control symbol={symbol} note={note} onNoteReady={onNoteReady} />;
}

export function NoteTab({ symbol }: { symbol: string }) {
  const market = marketOfSymbol(symbol);
  const { note, error, reload } = useNote(symbol);
  const onNoteReady = useCallback(() => reload(), [reload]);

  if (error) return <ErrorBox>{error}</ErrorBox>;

  const openFullscreen = () => {
    if (!note?.markdown) return;
    openMarkdownModal({ title: `${symbol} 研究笔记`, markdown: note.markdown });
  };

  return (
    <div className="note-tab">
      {note?.markdown ? (
        <>
          <div className="note-tab-header">
            <span className="note-tab-mtime">
              更新于 {note.mtime ? <MarketTime value={note.mtime} market={market} /> : '—'}
            </span>
            <div className="note-tab-actions">
              <button className="link-button" onClick={openFullscreen}>
                <Maximize2 className="icon" size={13} /> 全屏阅读
              </button>
              <DeepDiveAction symbol={symbol} note={note} onNoteReady={onNoteReady} />
            </div>
          </div>
          <Markdown>{note.markdown}</Markdown>
        </>
      ) : (
        <>
          <Empty>还没有 {symbol} 的研究笔记</Empty>
          <div className="note-tab-header note-tab-header--center">
            <DeepDiveAction symbol={symbol} note={note} onNoteReady={onNoteReady} />
          </div>
        </>
      )}
    </div>
  );
}
