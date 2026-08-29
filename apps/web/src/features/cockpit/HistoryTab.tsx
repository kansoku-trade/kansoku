import type { CSSProperties } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Check, CircleX, Clock, NotebookText } from 'lucide-react';
import type { OutcomeStatus, SymbolAnalysisRow } from '@kansoku/shared/types';
import { marketDate } from '@kansoku/shared/time';
import { fmt, signed } from '@web/lib/format';
import { marketOfSymbol } from '@web/lib/market';
import { symbolUrl } from './analysisMode';
import { DIRECTION_COLOR, DIRECTION_LABEL } from '@web/features/charts/intraday/directionLabels';
import { theme } from '@web/lib/theme';
import { Badge, MarketTime, SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  item: {
    'display': 'block',
    'padding': '8px 10px',
    'marginBottom': '6px',
    'backgroundColor': colors.backgroundSurface,
    'borderLeftStyle': 'solid',
    'borderLeftWidth': '3px',
    ':hover': {
      textDecoration: 'none',
      backgroundColor: colors.backgroundHover,
    },
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: fontSizes.base,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  range: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  meta: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '3px',
    lineHeight: 1.45,
  },
  linkButton: {
    'backgroundColor': 'transparent',
    'border': 'none',
    'padding': 0,
    'color': colors.accent,
    'fontSize': 'inherit',
    'cursor': 'pointer',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  icon: {
    verticalAlign: '-2px',
  },
});

const OUTCOME_LABEL: Record<OutcomeStatus, { icon: typeof Check; tone: string; label: string }> = {
  hit_target: { icon: Check, tone: 'up', label: '到目标' },
  hit_stop: { icon: CircleX, tone: 'down', label: '到止损' },
  held_range: { icon: Check, tone: 'up', label: '守住区间' },
  broke_range: { icon: CircleX, tone: 'down', label: '破区间' },
  open: { icon: Clock, tone: '', label: '进行中' },
};

function OutcomeText({ status }: { status: OutcomeStatus }) {
  const { icon: Icon, tone, label } = OUTCOME_LABEL[status];
  return (
    <span className={tone}>
      <Icon className="icon" size={13} /> {label}
    </span>
  );
}

interface HistoryTabProps {
  symbol: string;
  rows: SymbolAnalysisRow[];
  currentId: string | null;
  journalByDate?: Map<string, string>;
  onOpenJournal?: (name: string) => void;
}

export function HistoryTab({
  symbol,
  rows,
  currentId,
  journalByDate,
  onOpenJournal,
}: HistoryTabProps) {
  const market = marketOfSymbol(symbol);
  const journalFor = (row: SymbolAnalysisRow): string | undefined =>
    journalByDate?.get(marketDate(row.created_at));
  return (
    <>
      <SectionTitle>历史分析</SectionTitle>
      {rows.map((row) => (
        <a
          key={row.id}
          className={`zone-item ${stylex.props(styles.item).className}`}
          style={
            { '--zc': DIRECTION_COLOR[row.direction ?? ''] ?? theme.textSecondary } as CSSProperties
          }
          href={symbolUrl(symbol, row.id)}
        >
          <div className={`zone-head ${stylex.props(styles.head).className}`}>
            <span className={`zone-label plain ${stylex.props(styles.label).className}`}>
              <MarketTime value={row.created_at} market={market} />
              {row.id === currentId && (
                <Badge tone="up" className="p123-badge">
                  当前
                </Badge>
              )}
            </span>
            <span className={`zone-range ${stylex.props(styles.range).className}`}>
              {row.direction ? DIRECTION_LABEL[row.direction] : '—'}
            </span>
          </div>
          <div className={`zone-meta md ${stylex.props(styles.meta).className}`}>
            {row.anchor ? `锚点 $${fmt(row.anchor.price)}` : '无锚点'}
            {' · '}
            {row.outcome ? <OutcomeText status={row.outcome.status} /> : '—'}
            {row.outcome && ` · ${signed(row.outcome.pct_since_anchor)}%`}
            {journalFor(row) && onOpenJournal && (
              <>
                {' · '}
                <button
                  className={`link-button ${stylex.props(styles.linkButton).className}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenJournal(journalFor(row)!);
                  }}
                >
                  <NotebookText
                    className={`icon ${stylex.props(styles.icon).className}`}
                    size={13}
                  />{' '}
                  日志
                </button>
              </>
            )}
          </div>
        </a>
      ))}
    </>
  );
}
