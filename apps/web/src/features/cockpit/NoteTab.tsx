import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { Lock, Maximize2 } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { Button, Empty, ErrorBox, MarketTime, Spinner, TimeAgo } from '@web/ui';
import { marketOfSymbol } from '@web/lib/market';
import { useFeature } from '@web/features/edition/useFeature';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { Markdown, openMarkdownModal } from './markdown';
import { bareSymbol, useDeepDive } from './useDeepDive';
import { useNote } from './useNote';

const styles = stylex.create({
  tab: {
    maxWidth: '100%',
    minWidth: 0,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    justifyContent: 'space-between',
    marginBottom: '10px',
    paddingBottom: '10px',
  },
  headerCenter: {
    borderBottomStyle: 'none',
    justifyContent: 'center',
  },
  headerAction: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    flexShrink: 0,
    gap: '12px',
  },
  mtime: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    whiteSpace: 'nowrap',
  },
});

export function NoteTab({ symbol }: { symbol: string }) {
  const market = marketOfSymbol(symbol);
  const { note, error, reload } = useNote(symbol);
  const onNoteReady = useCallback(() => reload(), [reload]);
  const deepDive = useDeepDive(symbol, onNoteReady);
  const { state, locked, guard } = useFeature('deep-dive');

  const confirmAndStart = () => {
    const confirmed = window.confirm('深度分析会跑数分钟，并消耗一次 AI 额度，确定要开始吗？');
    if (confirmed) void deepDive.start();
  };

  if (error) return <ErrorBox>{error}</ErrorBox>;

  const runningElsewhere =
    deepDive.running &&
    deepDive.runningSymbol &&
    bareSymbol(deepDive.runningSymbol) !== bareSymbol(symbol);

  let buttonLabel: ReactNode = note?.markdown ? '重新深度分析' : '跑一次深度分析';
  if (deepDive.running) {
    buttonLabel = runningElsewhere ? (
      `有分析进行中（${deepDive.runningSymbol}）`
    ) : (
      <>
        分析中…
        <TimeAgo since={deepDive.startedAt} format="duration" />
      </>
    );
  }

  const button =
    state !== 'absent' ? (
      <Button
        className={stylex.props(styles.headerAction).className}
        onClick={locked ? () => guard(() => {}) : confirmAndStart}
        disabled={deepDive.pending || deepDive.running || deepDive.disabled}
      >
        {(deepDive.pending || deepDive.running) && <Spinner />}
        {locked && <Lock size={13} />}
        {buttonLabel}
      </Button>
    ) : null;

  const openFullscreen = () => {
    if (!note?.markdown) return;
    openMarkdownModal({ title: `${symbol} 研究笔记`, markdown: note.markdown });
  };

  return (
    <div className={`note-tab ${stylex.props(styles.tab).className}`}>
      {note?.markdown ? (
        <>
          <div className={`note-tab-header ${stylex.props(styles.header).className}`}>
            <span className={`note-tab-mtime ${stylex.props(styles.mtime).className}`}>
              更新于 {note.mtime ? <MarketTime value={note.mtime} market={market} /> : '—'}
            </span>
            <div className={`note-tab-actions ${stylex.props(styles.actions).className}`}>
              <button
                className={`link-button ${stylex.props(styles.headerAction).className}`}
                onClick={openFullscreen}
              >
                <Maximize2 className="icon" size={13} /> 全屏阅读
              </button>
              {button}
            </div>
          </div>
          {deepDive.inlineMessage && <span className="ai-hint">{deepDive.inlineMessage}</span>}
          {deepDive.successNote && <span className="ai-hint">{deepDive.successNote}</span>}
          <Markdown>{note.markdown}</Markdown>
        </>
      ) : (
        <>
          <Empty>还没有 {symbol} 的研究笔记</Empty>
          {button && (
            <div
              className={`note-tab-header note-tab-header--center ${stylex.props(styles.header, styles.headerCenter).className}`}
            >
              {button}
            </div>
          )}
          {deepDive.inlineMessage && <span className="ai-hint">{deepDive.inlineMessage}</span>}
          {deepDive.successNote && <span className="ai-hint">{deepDive.successNote}</span>}
        </>
      )}
    </div>
  );
}
