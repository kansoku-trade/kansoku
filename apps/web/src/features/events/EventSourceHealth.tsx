import type { EventSourceStatus } from '@kansoku/core/contract/events';
import type { EventSourceHealth as SourceHealthValue } from '@kansoku/shared/types';
import { MarketTime } from '@web/ui';
import { eventSourceLabel } from './eventLabels';

const HEALTH_LABEL: Record<SourceHealthValue, string> = {
  active: '运行中',
  disabled: '已关闭',
  degraded: '异常',
};

export interface EventSourceHealthProps {
  sources: EventSourceStatus[] | null;
  error: string | null;
  loading: boolean;
}

function Stamp({ label, at, none }: { label: string; at: string | null; none: string }) {
  if (at === null)
    return <span className="evt-src-stamp evt-src-stamp--none num">{`${label} ${none}`}</span>;
  return (
    <span className="evt-src-stamp num">
      {label} <MarketTime value={at} format="month-day-time" zone="market" />
    </span>
  );
}

function SourceRow({ status }: { status: EventSourceStatus }) {
  return (
    <li className={`evt-src evt-src--${status.health}`}>
      <span className="evt-src-name">{eventSourceLabel(status.source)}</span>
      <span className={`evt-src-state evt-src-state--${status.health}`}>
        {HEALTH_LABEL[status.health]}
      </span>
      <span className="evt-src-stamps">
        {/* A source that polls fine but never emits is quiet, not healthy, so the two
            timestamps are always shown side by side instead of collapsed into one. */}
        <Stamp label="最近轮询" at={status.lastPolledAt} none="尚未开始" />
        <Stamp label="最近事件" at={status.lastEventAt} none="尚无" />
      </span>
      {status.health === 'disabled' && (
        <span className="evt-src-note evt-src-note--off">
          {status.disabledReason ?? '未说明关闭原因'}
        </span>
      )}
      {status.health !== 'disabled' && status.lastError && (
        <span className="evt-src-note evt-src-note--error">{status.lastError}</span>
      )}
      {status.health === 'degraded' && (
        <span className="evt-src-retry num">
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
    <section aria-label="事件来源状态" className="evt-src-panel" role="group">
      <div className="evt-src-summary num">
        {active} 运行 · {degraded} 异常 · {disabled} 关闭
      </div>
      <ul className="evt-src-list">
        {sources.map((status) => (
          <SourceRow key={status.source} status={status} />
        ))}
      </ul>
    </section>
  );
}
