import { useEffect, useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { CockpitComment } from '@kansoku/shared/types';
import { marketDate } from '@kansoku/shared/time';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { marketOfSymbol } from '@web/lib/market';
import { Button, MarketTime, Select, Spinner } from '@web/ui';
import { AliveLine } from './AliveLine';
import { AnalysisRunDetails } from './AnalysisRunDetails';
import { buildFeed, type FeedRow } from './aiFeed';
import { CommentEntry } from './CommentEntry';
import { ExplainAction } from './ExplainAction';
import { FollowAction } from './FollowAction';
import { useAnalystRun } from './useAnalystRun';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  runControl: {
    marginBottom: '12px',
  },
  reassess: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: 0,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
  },
  toolbarEnd: {
    alignItems: 'center',
    display: 'inline-flex',
    flexWrap: 'nowrap',
    gap: '10px',
    marginLeft: 'auto',
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.4,
    marginTop: '6px',
  },
  tab: {
    minWidth: 0,
    maxWidth: '100%',
  },
  feed: {
    minWidth: 0,
    maxWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'hidden',
  },
  fold: {
    'padding': '7px 2px',
    'fontSize': fontSizes.control,
    'color': colors.textMuted,
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'cursor': 'pointer',
    ':hover': {
      color: colors.textSecondary,
    },
  },
  foldOpen: {
    color: colors.textSecondary,
  },
});

export function AiTab({
  symbol,
  comments,
  error,
  readOnly = false,
  loaded = true,
  analysisRevision,
}: {
  symbol: string;
  comments: CockpitComment[];
  error: string | null;
  readOnly?: boolean;
  loaded?: boolean;
  analysisRevision?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const run = useAnalystRun(symbol, !readOnly);

  const today = marketDate();
  const { data: dates } = useQuery<string[]>(
    readOnly ? null : `symbols.commentDates:${symbol}`,
    () => client.symbols.commentDates({ sym: symbol }),
  );
  const pastDates = useMemo(() => (dates ?? []).filter((d) => d < today), [dates, today]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const autoFellBack = useRef(false);
  useEffect(() => {
    setSelectedDate(null);
    autoFellBack.current = false;
  }, [symbol]);
  useEffect(() => {
    if (readOnly || autoFellBack.current || selectedDate !== null) return;
    if (loaded && comments.length === 0 && pastDates.length > 0) {
      autoFellBack.current = true;
      setSelectedDate(pastDates[0]);
    }
  }, [readOnly, loaded, comments.length, pastDates, selectedDate]);
  const { data: pastComments, error: pastError } = useQuery<CockpitComment[]>(
    selectedDate ? `symbols.comments:${symbol}:${selectedDate}` : null,
    () => client.symbols.comments({ sym: symbol, date: selectedDate! }),
  );
  const shownComments = selectedDate ? (pastComments ?? []) : comments;
  const shownError = selectedDate ? pastError : error;

  const rows = useMemo(() => buildFeed(shownComments).reverse(), [shownComments]);
  const market = marketOfSymbol(symbol);

  const toggleFold = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div {...stylex.props(styles.tab)}>
      {!readOnly && (
        <div className={`ai-run-control ${stylex.props(styles.runControl).className}`}>
          <div className={`ai-reassess ${stylex.props(styles.reassess).className}`}>
            <Button onClick={run.start} disabled={run.pending || run.running}>
              {run.running && <Spinner />}
              {run.running ? '重估进行中…' : '重新分析'}
            </Button>
            {run.hint && (
              <span className={`ai-hint ${stylex.props(styles.hint).className}`}>{run.hint}</span>
            )}
            <ExplainAction symbol={symbol} />
            {(analysisRevision || pastDates.length > 0) && (
              <div className={`ai-toolbar-end ${stylex.props(styles.toolbarEnd).className}`}>
                {analysisRevision && <FollowAction symbol={symbol} revision={analysisRevision} />}
                {pastDates.length > 0 && (
                  <Select
                    className="ai-date-select"
                    value={selectedDate ?? 'today'}
                    options={[
                      { value: 'today', label: '今天' },
                      ...pastDates.map((d) => ({ value: d, label: d })),
                    ]}
                    onChange={(v) => setSelectedDate(v === 'today' ? null : v)}
                  />
                )}
              </div>
            )}
          </div>
          {run.status && <AnalysisRunDetails status={run.status} />}
        </div>
      )}

      {!readOnly && !selectedDate && <AliveLine symbol={symbol} revision={analysisRevision} />}

      {selectedDate && (
        <div className={`note-block ${stylex.props(styles.note).className}`}>
          显示 {selectedDate} 的点评（今天暂无新点评）
        </div>
      )}

      {renderFeed()}
    </div>
  );

  function renderRow(row: FeedRow) {
    if (row.kind === 'comment') {
      return (
        <CommentEntry
          key={`${row.comment.ts}-${row.comment.text}`}
          symbol={symbol}
          comment={row.comment}
        />
      );
    }
    if (!expanded.has(row.id)) {
      return (
        <div key={row.id} {...stylex.props(styles.fold)} onClick={() => toggleFold(row.id)}>
          <MarketTime value={row.from} format="clock" market={market} /> –{' '}
          <MarketTime value={row.to} format="clock" market={market} /> 无事 ×{row.count}（点击展开）
        </div>
      );
    }
    return (
      <div key={row.id}>
        <div {...stylex.props(styles.fold, styles.foldOpen)} onClick={() => toggleFold(row.id)}>
          <MarketTime value={row.from} format="clock" market={market} /> –{' '}
          <MarketTime value={row.to} format="clock" market={market} /> 无事 ×{row.count}（收起）
        </div>
        {[...row.comments].reverse().map((c) => (
          <CommentEntry key={`${c.ts}-${c.text}`} symbol={symbol} comment={c} />
        ))}
      </div>
    );
  }

  function renderFeed() {
    if (shownError)
      return (
        <div className={`note-block ${stylex.props(styles.note).className}`}>
          点评获取失败：{shownError}
        </div>
      );
    if (rows.length === 0) {
      return (
        <div className={`note-block ${stylex.props(styles.note).className}`}>
          {selectedDate
            ? `${selectedDate} 没有点评`
            : '暂无点评。盘面出现触发事件时，AI 会在这里给出研判；也可以点上面「重新分析」手动跑一次重估'}
        </div>
      );
    }
    return <div {...stylex.props(styles.feed)}>{rows.map(renderRow)}</div>;
  }
}
