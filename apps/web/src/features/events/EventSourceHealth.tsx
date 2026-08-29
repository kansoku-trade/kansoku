import type { EventSourceStatus } from '@kansoku/core/contract/events';
import type { EventSourceHealth as SourceHealthValue } from '@kansoku/shared/types';
import * as stylex from '@stylexjs/stylex';
import { MarketTime } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { eventSourceLabel } from './eventLabels';

const HEALTH_LABEL: Record<SourceHealthValue, string> = {
  active: '运行中',
  disabled: '已关闭',
  degraded: '异常',
};

const styles = stylex.create({
  panel: {
    borderTopColor: colors.border,
    borderTopStyle: 'dashed',
    borderTopWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingTop: '6px',
  },
  summary: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    letterSpacing: '0.02em',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  row: {
    'display': 'grid',
    'fontSize': fontSizes.xs,
    'gap': '2px 8px',
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  name: {
    color: colors.textSecondary,
  },
  state: {
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  active: {
    color: colors.ok,
  },
  degraded: {
    color: colors.down,
  },
  disabled: {
    color: colors.textMuted,
  },
  detail: {
    color: colors.textMuted,
    gridColumn: '1 / -1',
  },
  error: {
    color: colors.down,
  },
});

export interface EventSourceHealthProps {
  sources: EventSourceStatus[] | null;
  error: string | null;
  loading: boolean;
}

function Stamp({ label, at, none }: { label: string; at: string | null; none: string }) {
  if (at === null) return <span className="num">{`${label} ${none}`}</span>;
  return (
    <span className="num">
      {label} <MarketTime value={at} format="month-day-time" zone="market" />
    </span>
  );
}

function SourceRow({ status }: { status: EventSourceStatus }) {
  const stateStyle =
    status.health === 'active'
      ? styles.active
      : status.health === 'degraded'
        ? styles.degraded
        : styles.disabled;

  return (
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.name)}>{eventSourceLabel(status.source)}</span>
      <span {...stylex.props(styles.state, stateStyle)}>{HEALTH_LABEL[status.health]}</span>
      <span {...stylex.props(styles.detail)}>
        {/* A source that polls fine but never emits is quiet, not healthy, so the two
            timestamps are always shown side by side instead of collapsed into one. */}
        <Stamp label="最近轮询" at={status.lastPolledAt} none="尚未开始" />
        <Stamp label="最近事件" at={status.lastEventAt} none="尚无" />
      </span>
      {status.health === 'disabled' && (
        <span {...stylex.props(styles.detail)}>{status.disabledReason ?? '未说明关闭原因'}</span>
      )}
      {status.health !== 'disabled' && status.lastError && (
        <span {...stylex.props(styles.detail, styles.error)}>{status.lastError}</span>
      )}
      {status.health === 'degraded' && (
        <span className={`num ${stylex.props(styles.detail, styles.error).className}`}>
          连续失败 {status.failureStreak} 次
          {status.nextAttemptAt && (
            <>
              {' · 下次重试 '}
              <MarketTime value={status.nextAttemptAt} format="clock" zone="market" />
            </>
          )}
        </span>
      )}
    </li>
  );
}

export function EventSourceHealth({ sources, error, loading }: EventSourceHealthProps) {
  if (error) return <div className="note-block">来源状态获取失败，正在重试</div>;
  if (loading && !sources) return <div className="note-block">来源状态加载中…</div>;
  if (!sources) return null;
  if (sources.length === 0) return <div className="note-block">还没有登记任何事件来源</div>;

  const active = sources.filter((s) => s.health === 'active').length;
  const degraded = sources.filter((s) => s.health === 'degraded').length;
  const disabled = sources.filter((s) => s.health === 'disabled').length;

  return (
    <section aria-label="事件来源状态" {...stylex.props(styles.panel)} role="group">
      <div className={`num ${stylex.props(styles.summary).className}`}>
        {active} 运行 · {degraded} 异常 · {disabled} 关闭
      </div>
      <ul {...stylex.props(styles.list)}>
        {sources.map((status) => (
          <SourceRow key={status.source} status={status} />
        ))}
      </ul>
    </section>
  );
}
