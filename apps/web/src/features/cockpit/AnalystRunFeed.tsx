import type {
  AnalystActivity,
  ContextSection,
  ReassessPhase,
  TechnicalSection,
} from '@kansoku/core/contract/symbols';
import { money } from '@web/lib/format';
import { marketOfSymbol } from '@web/lib/market';
import { Badge, Card, Dot, Empty, ErrorBox, MarketTime, SectionTitle } from '@web/ui';
import { PHASE_LABEL } from './AnalysisRunDetails';
import { useAnalystRunLastEnded, useAnalystRunStatus } from './analystRunsStore';

const TIMEFRAME_LABEL: Record<string, string> = {
  m5: '5 分钟',
  m15: '15 分钟',
  h1: '1 小时',
  day: '日线',
};

const TREND_LABEL: Record<string, string> = {
  up: '向上',
  down: '向下',
  sideways: '震荡',
};

const BIAS_LABEL: Record<string, string> = {
  bullish: '利多',
  bearish: '利空',
  neutral: '中性',
};

const BIAS_TONE: Record<string, 'up' | 'down' | 'muted'> = {
  bullish: 'up',
  bearish: 'down',
  neutral: 'muted',
};

const SKELETON_WIDTHS = ['', ' analyst-run-skeleton-bone--r1', ' analyst-run-skeleton-bone--r2'];
const ACTIVITY_LIMIT = 8;

function MidReadBadge() {
  return (
    <Badge tone="muted" className="analyst-run-mid-badge" title="最终结论可能修正">
      中间读数
    </Badge>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="analyst-run-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`app-skeleton-bone analyst-run-skeleton-bone${SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]}`}
        />
      ))}
    </div>
  );
}

function TechnicalCard({ section }: { section: TechnicalSection | undefined }) {
  return (
    <Card className="analyst-run-card analyst-run-card--technical">
      <div className="analyst-run-card-head">
        <SectionTitle>技术面读数</SectionTitle>
        <MidReadBadge />
      </div>
      {section ? (
        <>
          {section.trends.length > 0 && (
            <div className="analyst-run-trends">
              {section.trends.map((t) => (
                <span key={t.timeframe} className="chip analyst-run-trend-chip">
                  {TIMEFRAME_LABEL[t.timeframe] ?? t.timeframe} · {TREND_LABEL[t.trend] ?? t.trend}
                </span>
              ))}
            </div>
          )}
          {section.levels.length > 0 && (
            <div className="analyst-run-levels">
              {section.levels.map((lvl, i) => (
                <div key={i} className="analyst-run-level">
                  <span className="analyst-run-level-price">{money(lvl.price)}</span>
                  <span className="analyst-run-level-label">{lvl.label}</span>
                </div>
              ))}
            </div>
          )}
          {section.summary && <p className="analyst-run-summary">{section.summary}</p>}
        </>
      ) : (
        <CardSkeleton rows={3} />
      )}
    </Card>
  );
}

function ContextCard({ section }: { section: ContextSection | undefined }) {
  return (
    <Card className="analyst-run-card analyst-run-card--context">
      <div className="analyst-run-card-head">
        <SectionTitle>消息与资金面</SectionTitle>
        <MidReadBadge />
      </div>
      {section ? (
        <>
          <Badge tone={BIAS_TONE[section.bias]} className="analyst-run-bias-badge">
            {BIAS_LABEL[section.bias] ?? section.bias}
          </Badge>
          {section.summary && <p className="analyst-run-summary">{section.summary}</p>}
        </>
      ) : (
        <CardSkeleton rows={2} />
      )}
    </Card>
  );
}

function ActivityFeed({
  sym,
  activities,
  running,
  phase,
  activity,
}: {
  sym: string;
  activities: AnalystActivity[];
  running: boolean;
  phase?: ReassessPhase;
  activity?: string;
}) {
  const market = marketOfSymbol(sym);
  const visible = activities.slice().reverse().slice(0, ACTIVITY_LIMIT);

  return (
    <div className="analyst-run-feed-section">
      <SectionTitle>分析进度</SectionTitle>
      {running && activity && (
        <div className="analyst-run-feed-phase">
          {phase && <span className="analyst-run-feed-phase-label">{PHASE_LABEL[phase]} · </span>}
          <span className="analyst-run-feed-phase-activity">{activity}</span>
        </div>
      )}
      {visible.length === 0 ? (
        <Empty>还没有动态</Empty>
      ) : (
        <div className="analyst-run-feed-list">
          {visible.map((entry, i) => (
            <div key={`${entry.at}-${i}`} className="analyst-run-feed-item">
              {i === 0 && running ? (
                <Dot tone="accent" pulse className="analyst-run-feed-dot" />
              ) : (
                <span
                  className="analyst-run-feed-dot analyst-run-feed-dot--static"
                  aria-hidden="true"
                />
              )}
              <MarketTime
                className="analyst-run-feed-time"
                value={entry.at}
                format="clock"
                market={market}
              />
              <span className="analyst-run-feed-text">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalystRunFeed({ sym }: { sym: string }) {
  const status = useAnalystRunStatus(sym);
  const lastEnded = useAnalystRunLastEnded(sym);
  const source = status ?? lastEnded;
  if (!source) return null;

  const running = status !== null;
  const activities = source.activities ?? [];
  const sections = source.sections ?? {};

  return (
    <div className="analyst-run-feed">
      {!running && <ErrorBox className="analyst-run-feed-banner">分析未完成</ErrorBox>}
      <TechnicalCard section={sections.technical} />
      <ContextCard section={sections.context} />
      <ActivityFeed
        sym={sym}
        activities={activities}
        running={running}
        phase={status?.phase}
        activity={status?.activity}
      />
    </div>
  );
}
