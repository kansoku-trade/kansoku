import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, ErrorBox, Spinner } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { AnalysisRunDetails } from './AnalysisRunDetails';
import { openMarkdownModal } from './markdown';
import { useAnalystRun } from './useAnalystRun';

const RUN_POLL_MS = 5_000;

const styles = stylex.create({
  section: {
    marginTop: '18px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '10px',
  },
  entry: {
    'alignItems': 'baseline',
    'backgroundColor': 'transparent',
    'borderLeftColor': colors.border,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '2px',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textPrimary,
    'cursor': 'pointer',
    'display': 'flex',
    'fontSize': fontSizes.sm,
    'gap': '10px',
    'padding': '5px 8px',
    'textAlign': 'left',
    ':hover': {
      backgroundColor: colors.backgroundSurface,
    },
  },
  entryActive: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
  },
  entryLoading: {
    borderLeftColor: colors.accent,
  },
  entryDisabled: {
    cursor: 'progress',
  },
  entryName: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.4,
    marginTop: '6px',
  },
});

export interface JournalEntryMeta {
  name: string;
  date: string;
}

export function JournalSection({
  symbol,
  entries,
  selected,
  onSelect,
  reloadJournal,
}: {
  symbol: string;
  entries: JournalEntryMeta[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  reloadJournal: () => void;
}) {
  const [loadingName, setLoadingName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = useAnalystRun(symbol);
  const wasRunningRef = useRef(false);

  useEffect(() => {
    if (!run.running) return;
    const timer = window.setInterval(reloadJournal, RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [run.running, reloadJournal]);

  useEffect(() => {
    if (wasRunningRef.current && !run.running) reloadJournal();
    wasRunningRef.current = run.running;
  }, [run.running, reloadJournal]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setLoadingName(selected);
    setErr(null);
    client.symbols
      .journalEntry({ sym: symbol, name: selected })
      .then((data) => {
        if (!alive) return;
        setLoadingName(null);
        openMarkdownModal({
          title: data.name,
          markdown: data.markdown,
          documentPath: `journal/${data.name}`,
          onClose: () => onSelect(null),
        });
      })
      .catch((e) => {
        if (!alive) return;
        setLoadingName(null);
        setErr(errorMessage(e));
        onSelect(null);
      });
    return () => {
      alive = false;
    };
  }, [selected, symbol, onSelect]);

  return (
    <div className={`journal-section ${stylex.props(styles.section).className}`}>
      <div className="ai-run-control">
        <div className="ai-reassess">
          <Button onClick={run.start} disabled={run.pending || run.running}>
            {run.running && <Spinner />}
            {run.running ? '分析进行中…' : '跑一次分析'}
          </Button>
          {run.hint && (
            <span className={`ai-hint ${stylex.props(styles.hint).className}`}>{run.hint}</span>
          )}
        </div>
        {run.status && <AnalysisRunDetails status={run.status} />}
      </div>
      {entries.length === 0 ? (
        <p className={`note-block ${stylex.props(styles.note).className}`}>
          还没有分析日志——点上面的按钮跑一次
        </p>
      ) : (
        <div className={`journal-list ${stylex.props(styles.list).className}`}>
          {entries.map((e) => {
            const busy = loadingName === e.name;
            const active = selected === e.name;
            return (
              <button
                key={e.name}
                className={`journal-entry${active ? ' active' : ''}${busy ? ' loading' : ''} ${stylex.props(styles.entry, active && styles.entryActive, busy && styles.entryLoading, busy && styles.entryDisabled).className}`}
                onClick={() => onSelect(e.name)}
                disabled={busy}
              >
                <span>{e.date}</span>
                <span className={`journal-entry-name ${stylex.props(styles.entryName).className}`}>
                  {e.name}
                </span>
                {busy && <Spinner />}
              </button>
            );
          })}
        </div>
      )}
      {err && <ErrorBox>{err}</ErrorBox>}
    </div>
  );
}
