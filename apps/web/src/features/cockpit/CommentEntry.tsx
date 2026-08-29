import type { CockpitComment, CommentStance } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { marketOfSymbol } from '@web/lib/market';
import { Badge, MarketTime } from '@web/ui';
import { symbolUrl } from './analysisMode';
import { Markdown } from './markdown';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  item: {
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '10px',
    minWidth: 0,
    padding: '9px 2px',
    width: '100%',
  },
  time: {
    color: colors.textSecondary,
    flexBasis: '38px',
    flexGrow: 0,
    flexShrink: 0,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    paddingTop: '2px',
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%',
    minWidth: 0,
  },
  paragraph: {
    lineHeight: 1.55,
    margin: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  textPrimary: {
    color: colors.textPrimary,
  },
  dimText: {
    color: colors.textMuted,
  },
  levelBadge: {
    marginRight: '6px',
    verticalAlign: '1px',
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    marginTop: '4px',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  metaLink: {
    'color': colors.textPrimary,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
      textDecoration: 'underline',
    },
  },
  metaSeparator: {
    color: colors.borderStrong,
  },
  fact: {
    margin: 0,
  },
  subLine: {
    margin: '4px 0 0',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  read: {
    color: colors.textSecondary,
  },
  stanceBadge: {
    marginRight: '6px',
    verticalAlign: '1px',
  },
  explainerCard: {
    marginTop: '4px',
  },
});

const LEVEL_LABEL: Record<string, string> = {
  info: 'info',
  warn: 'warn',
  alert: 'alert',
  error: 'error',
};
const LEVEL_TONE: Record<string, 'up' | 'down' | 'accent' | 'solid' | undefined> = {
  info: undefined,
  warn: 'accent',
  alert: 'down',
  error: 'solid',
};
const SOURCE_LABEL: Record<string, string> = { analyst: '分析员', system: '系统' };

const STANCE_LABEL: Record<CommentStance, string> = {
  act_per_plan: '按计划执行',
  wait_confirm: '等确认',
  no_action: '不构成动作',
};
const STANCE_TONE: Record<CommentStance, 'up' | 'accent' | 'muted'> = {
  act_per_plan: 'up',
  wait_confirm: 'accent',
  no_action: 'muted',
};

function LevelBadge({ level }: { level: string }) {
  return (
    <Badge
      tone={LEVEL_TONE[level]}
      className={`level-badge ${stylex.props(styles.levelBadge).className}`}
    >
      {LEVEL_LABEL[level] ?? level}
    </Badge>
  );
}

function StanceLine({
  stance,
  note,
  dim = false,
}: {
  stance: CommentStance;
  note?: string;
  dim?: boolean;
}) {
  return (
    <p
      className={`ai-stance ${stylex.props(styles.paragraph, styles.subLine, !dim && styles.textPrimary, dim && styles.dimText).className}`}
    >
      <Badge
        tone={STANCE_TONE[stance]}
        className={`stance-badge ${stylex.props(styles.stanceBadge).className}`}
      >
        {STANCE_LABEL[stance]}
      </Badge>
      {note}
    </p>
  );
}

function CommentMeta({ symbol, comment }: { symbol: string; comment: CockpitComment }) {
  const meta: React.ReactNode[] = [];
  if (comment.trigger) meta.push(<span key="trigger">触发：{comment.trigger}</span>);
  if (comment.escalated) meta.push(<span key="escalated">已升级重估</span>);
  if (comment.chartId)
    meta.push(
      <a
        key="chart"
        href={symbolUrl(symbol, comment.chartId)}
        className={stylex.props(styles.metaLink).className}
      >
        查看图表
      </a>,
    );
  if (SOURCE_LABEL[comment.source])
    meta.push(<span key="source">{SOURCE_LABEL[comment.source]}</span>);
  if (meta.length === 0) return null;

  return (
    <div className={`ai-meta ${stylex.props(styles.meta).className}`}>
      {meta.map((m, i) => (
        <span key={i}>
          {i > 0 && (
            <span className={`sep ${stylex.props(styles.metaSeparator).className}`}> · </span>
          )}
          {m}
        </span>
      ))}
    </div>
  );
}

export function CommentEntry({ symbol, comment }: { symbol: string; comment: CockpitComment }) {
  const market = marketOfSymbol(symbol);
  const dim = comment.source === 'commentator' && comment.level === 'info';

  if (comment.source === 'explainer') {
    return (
      <div className={`ai-item ai-item--explainer ${stylex.props(styles.item).className}`}>
        <MarketTime
          className={`t ${stylex.props(styles.time).className}`}
          value={comment.ts}
          format="clock"
          market={market}
        />
        <div className={`body ${stylex.props(styles.body).className}`}>
          {comment.stance && <StanceLine stance={comment.stance} note={comment.stanceNote} />}
          <div className={`ai-explainer-card ${stylex.props(styles.explainerCard).className}`}>
            <Markdown variant="report">{comment.text}</Markdown>
          </div>
          <CommentMeta symbol={symbol} comment={comment} />
        </div>
      </div>
    );
  }

  if (comment.read != null && comment.stance != null) {
    return (
      <div className={`ai-item${dim ? ' dim' : ''} ${stylex.props(styles.item).className}`}>
        <MarketTime
          className={`t ${stylex.props(styles.time, dim && styles.dimText).className}`}
          value={comment.ts}
          format="clock"
          market={market}
        />
        <div className={`body ${stylex.props(styles.body).className}`}>
          <p
            className={`ai-fact ${stylex.props(styles.paragraph, styles.fact, !dim && styles.textPrimary, dim && styles.dimText).className}`}
          >
            <LevelBadge level={comment.level} />
            {comment.text}
          </p>
          <p
            className={`ai-read ${stylex.props(styles.paragraph, styles.subLine, !dim && styles.read, dim && styles.dimText).className}`}
          >
            {comment.read}
          </p>
          <StanceLine stance={comment.stance} note={comment.stanceNote} dim={dim} />
          <CommentMeta symbol={symbol} comment={comment} />
        </div>
      </div>
    );
  }

  return (
    <div className={`ai-item${dim ? ' dim' : ''} ${stylex.props(styles.item).className}`}>
      <MarketTime
        className={`t ${stylex.props(styles.time, dim && styles.dimText).className}`}
        value={comment.ts}
        format="clock"
        market={market}
      />
      <div className={`body ${stylex.props(styles.body).className}`}>
        <p
          className={
            stylex.props(styles.paragraph, !dim && styles.textPrimary, dim && styles.dimText)
              .className
          }
        >
          <LevelBadge level={comment.level} />
          {comment.text}
        </p>
        <CommentMeta symbol={symbol} comment={comment} />
      </div>
    </div>
  );
}
