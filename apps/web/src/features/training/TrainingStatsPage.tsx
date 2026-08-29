import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import * as stylex from '@stylexjs/stylex';
import type { TrainerStatBlock, TrainerStats } from '@kansoku/pro-api';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { fmt, signed } from '@web/lib/format';
import { Card, SectionTitle } from '@web/ui';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';
import { TRAINER_CASE_TAG_LABEL } from './caseTagLabels';

const pct = (value: number | null): string => (value === null ? '—' : `${fmt(value * 100, 0)}%`);

const styles = stylex.create({
  orderStatus: {
    color: colors.textSecondary,
  },
  orderError: {
    color: colors.down,
    fontSize: fontSizes.sm,
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
  },
  back: {
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'marginLeft': '10px',
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  grid: {
    display: 'grid',
    gap: '10px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  },
  keyValue: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '10px',
    justifyContent: 'space-between',
    padding: '3px 0',
  },
  keyValueValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  settleHint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  figures: {
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  },
  figure: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    margin: 0,
    padding: '12px 15px',
  },
  figureCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  figureValue: {
    fontFamily: fonts.mono,
    fontSize: '26px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  },
  figureSub: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  locked: {
    backgroundImage:
      'repeating-linear-gradient(135deg, transparent, transparent 5px, rgb(255 255 255 / 0.028) 5px, rgb(255 255 255 / 0.028) 10px)',
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'dashed',
    borderWidth: '1px',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    padding: '12px 10px',
    textAlign: 'center',
  },
  guardNote: {
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    paddingLeft: '10px',
  },
});

export function TrainingStatsPage() {
  const bridge = useMemo(() => getTrainerBridge(), []);
  const [stats, setStats] = useState<TrainerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.stats().then((result) => {
      if (!active) return;
      if (result.ok) setStats(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [bridge]);

  if (!bridge)
    return (
      <div className={`trainer-order-error ${stylex.props(styles.orderError).className}`}>
        训练统计只在桌面端可用
      </div>
    );
  if (error)
    return (
      <div className={`trainer-order-error ${stylex.props(styles.orderError).className}`}>
        {error}
      </div>
    );
  if (!stats)
    return (
      <div className={`trainer-order-panel--status ${stylex.props(styles.orderStatus).className}`}>
        正在统计…
      </div>
    );

  const periods = Object.entries(stats.sessionsByBasePeriod)
    .map(([period, count]) => `${period} ${count}`)
    .join(' / ');

  return (
    <div className={`training-stats ${stylex.props(styles.root).className}`}>
      <SectionTitle>
        训练统计
        <Link className={`training-stats-back ${stylex.props(styles.back).className}`} to="/">
          ← 回首页
        </Link>
      </SectionTitle>
      <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
        共 {stats.completedSessions} 局打完{periods && ` · ${periods}`}
        {stats.unfinishedSessions > 0 && ` · 另有 ${stats.unfinishedSessions} 局开了没打完，不计入`}
      </p>

      <Card className="training-stats-overview">
        <Guard block={stats.overview} unit="完成的局">
          <div className={`trainer-review-figs ${stylex.props(styles.figures).className}`}>
            <Figure label="累计净 R" value={signed(stats.overview.netR)} />
            <Figure label="胜率" value={pct(stats.overview.winRate)} />
            <Figure
              label="计划盈亏比 → 实际拿到"
              value={`${fmt(stats.overview.plannedRewardRisk ?? 0)} → ${fmt(stats.overview.realizedRewardRisk ?? 0)}`}
              hint="这一栏最该先看：它分开「位置选得差」和「拿不住」"
            />
            <Figure label="最大浮盈回吐比例" value={pct(stats.overview.mfeGivebackRate)} />
          </div>
        </Guard>
      </Card>

      <div className={`training-stats-grid ${stylex.props(styles.grid).className}`}>
        <Card>
          <h4>按结构标签</h4>
          {stats.byTag.length === 0 && (
            <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
              还没有打完的局。
            </p>
          )}
          {stats.byTag.map((row) => (
            <div
              className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}
              key={row.tag ?? 'untagged'}
            >
              <span>{row.tag ? TRAINER_CASE_TAG_LABEL[row.tag] : '未标注'}</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {row.locked
                  ? `${row.samples} 局，样本不足`
                  : `${signed(row.netR)}R · ${pct(row.winRate)}`}
              </b>
            </div>
          ))}
        </Card>

        <Card>
          <h4>止损体检</h4>
          <Guard block={stats.stopHealth} unit="被止损的局">
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>被止损后仍到过目标</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.stopHealth.reachedTargetAfterStopRate)}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>止损被打的平均超出</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {fmt(stats.stopHealth.averageOvershootPct ?? 0)}%
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            实盘被止损后没有平行世界，看不到这个数。
          </p>
        </Card>

        <Card>
          <h4>AI 陪练影响</h4>
          <Guard block={stats.coachInfluence} unit="有分歧的召唤">
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>被说服改主意</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachInfluence.persuadedWinRate)}（{stats.coachInfluence.persuadedCount}
                次）
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>坚持自己判断</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachInfluence.heldWinRate)}（{stats.coachInfluence.heldCount} 次）
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            只统计有分歧的召唤，同向的不计 —— 否则「AI 附和我」会被灌水成「AI 说服我」。
          </p>
        </Card>

        <Card>
          <h4>推进方式影响</h4>
          <Guard block={stats.advanceStyle} unit="成交的笔">
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>逐根推进期间持仓</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.advanceStyle.barByBarWinRate)}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>大周期快进期间持仓</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.advanceStyle.fastForwardWinRate)}
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            放弃观察权的代价。
          </p>
        </Card>

        <Card>
          <h4>AI 成绩单</h4>
          <Guard block={stats.coachScorecard} unit="召唤">
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>方向准确率</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachScorecard.directionAccuracy)}（{stats.coachScorecard.settled}
                次有结果）
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>其中理由站得住</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachScorecard.soundReasonRate)}
              </b>
            </div>
            <div className={`training-stats-kv ${stylex.props(styles.keyValue).className}`}>
              <span>结论对但理由错</span>
              <b className={stylex.props(styles.keyValueValue).className}>
                {pct(stats.coachScorecard.rightCallWrongReasonRate)}
              </b>
            </div>
          </Guard>
          <p className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
            靠错逻辑蒙对的，下次必错。
          </p>
        </Card>
      </div>

      <p
        className={`trainer-settle-hint training-stats-guard-note ${stylex.props(styles.settleHint, styles.guardNote).className}`}
      >
        任何一块样本不足 10 就只报个数，不报比率。刷了 3 局赢 3 局显示「胜率
        100%」，那个数字唯一的作用是骗你。
      </p>
    </div>
  );
}

/**
 * A locked block says how many samples it has and stops. It does not render a zero, a dash in
 * place of a ratio, or a bar at 0% — each of those reads as a measurement, and there isn't one.
 */
function Guard({
  block,
  unit,
  children,
}: {
  block: TrainerStatBlock;
  unit: string;
  children: React.ReactNode;
}) {
  if (!block.locked) return <>{children}</>;
  return (
    <div
      className={`training-stats-locked ${stylex.props(styles.locked).className}`}
      data-testid="training-stats-locked"
    >
      只有 <b>{block.samples}</b> {unit}
      <br />
      样本太少，不出比率
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <figure className={`trainer-fig ${stylex.props(styles.figure).className}`}>
      <figcaption className={stylex.props(styles.figureCaption).className}>{label}</figcaption>
      <div className={`num trainer-fig-val ${stylex.props(styles.figureValue).className}`}>
        {value}
      </div>
      {hint && (
        <div className={`trainer-fig-sub ${stylex.props(styles.figureSub).className}`}>{hint}</div>
      )}
    </figure>
  );
}
