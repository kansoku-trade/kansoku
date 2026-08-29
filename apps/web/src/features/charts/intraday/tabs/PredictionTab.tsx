import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type { IntradayBuilt, TimeframeKey } from '@kansoku/shared/types';
import { fmt, signed } from '@web/lib/format';
import { TF_LABELS } from '../IntradayDashboard';
import { conclusionOutdated, ReassessCta, type ConclusionReassess } from '../ConclusionCard';
import { DIRECTION_LABEL } from '../directionLabels';
import {
  AutoSignalItem,
  Pattern123Item,
  PriceZoneCard,
  TargetContextCard,
  TechRow,
} from './predictionTabParts';
import { MarketTime, SectionTitle, TimeAgo } from '@web/ui';
import { colors, fontSizes, radii } from '../../../../theme/tokens.stylex';

const SIGNAL_ICON: Record<string, string> = {
  pin_bar: '📌',
  macd_divergence: '⚡',
  macd_beichi: '🌀',
};
const TF_ORDER: TimeframeKey[] = ['m5', 'm15', 'h1'];

const styles = stylex.create({
  verdict: {
    borderStyle: 'solid',
    borderWidth: '1px',
    marginBottom: '14px',
    padding: '12px',
  },
  verdictUp: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.up} 14%, transparent), color-mix(in srgb, ${colors.up} 4%, transparent))`,
    borderColor: colors.up,
  },
  verdictDown: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.down} 14%, transparent), color-mix(in srgb, ${colors.down} 4%, transparent))`,
    borderColor: colors.down,
  },
  verdictNeutral: {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${colors.textSecondary} 14%, transparent), color-mix(in srgb, ${colors.textSecondary} 4%, transparent))`,
    borderColor: colors.textSecondary,
  },
  verdictLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  predictionAge: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: 'normal',
    marginLeft: '6px',
    textTransform: 'none',
  },
  staleBadge: {
    backgroundColor: 'rgba(255, 176, 0, 0.15)',
    borderColor: 'rgba(255, 176, 0, 0.4)',
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.accent,
    fontSize: fontSizes.xs,
    fontWeight: 600,
    letterSpacing: 'normal',
    marginLeft: '6px',
    padding: '1px 6px',
    textTransform: 'none',
  },
  verdictText: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginTop: '4px',
  },
  verdictTextUp: { color: colors.up },
  verdictTextDown: { color: colors.down },
  verdictTextNeutral: { color: colors.textSecondary },
  verdictReason: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    marginTop: '6px',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    letterSpacing: '0.06em',
    marginBottom: '6px',
    marginTop: '10px',
    textTransform: 'uppercase',
  },
  planExplain: {
    marginTop: '8px',
  },
  grid: {
    display: 'grid',
    fontSize: fontSizes.base,
    gap: '6px 10px',
    gridTemplateColumns: 'auto 1fr',
  },
  gridKey: { color: colors.textSecondary },
  gridValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  gridValueLeft: { textAlign: 'left' },
  toneUp: { color: colors.up },
  toneDown: { color: colors.down },
  gridAfterNote: { marginTop: '6px' },
  checkItem: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    display: 'flex',
    gap: '10px',
    marginBottom: '4px',
    padding: '7px 8px',
  },
  checkIcon: {
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSizes.md,
  },
  checkLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  checkValue: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: '2px',
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.4,
    marginTop: '6px',
  },
  noteStrong: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.textPrimary,
    padding: '7px 8px',
  },
  warning: { color: colors.down },
  zoneItem: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '3px',
    display: 'block',
    marginBottom: '6px',
    padding: '8px 10px',
  },
  zoneHead: {
    alignItems: 'baseline',
    display: 'flex',
    justifyContent: 'space-between',
  },
  zoneLabel: {
    color: colors.accent,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  zoneLabelPlain: { color: colors.textPrimary },
  zoneRange: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  zoneRangeAccent: {
    color: colors.accent,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  zoneMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 1.45,
    marginTop: '3px',
  },
  zoneMetaMd: { fontSize: fontSizes.sm },
  zoneMetaAfter: { marginBottom: '6px' },
});

function directionStyles(direction: string | undefined) {
  if (direction === 'long') {
    return { frame: styles.verdictUp, text: styles.verdictTextUp };
  }
  if (direction === 'short') {
    return { frame: styles.verdictDown, text: styles.verdictTextDown };
  }
  return { frame: styles.verdictNeutral, text: styles.verdictTextNeutral };
}

function rrTone(ep: { rr_great: boolean; rr_ok: boolean }): string {
  if (ep.rr_great) return 'up';
  return ep.rr_ok ? '' : 'down';
}

interface PredictionTabProps {
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
  reassess?: ConclusionReassess;
  emptyCta?: ReactNode;
}

export function PredictionTab({
  built,
  activeTf,
  predictionUpdatedAt,
  predictionStale,
  reassess,
  emptyCta,
}: PredictionTabProps) {
  const s = built.sidebar;
  const p = s.prediction;
  const ep = s.entryPlan;
  const scenarios = (p?.scenarios ?? []).map((sc) => {
    const raw = sc as unknown as Record<string, unknown>;
    const label =
      typeof sc.label === 'string' && sc.label
        ? sc.label
        : typeof raw.name === 'string'
          ? (raw.name as string)
          : '';
    const probRaw =
      typeof sc.probability === 'number' && Number.isFinite(sc.probability)
        ? sc.probability
        : typeof raw.prob === 'number' && Number.isFinite(raw.prob as number)
          ? (raw.prob as number)
          : 0;
    const probability = probRaw > 0 && probRaw <= 1 ? probRaw * 100 : probRaw;
    return { ...sc, label, probability };
  });
  const totalProb = scenarios.reduce((acc, sc) => acc + Number(sc.probability || 0), 0);
  const rbp = p?.range_bound_plan;
  const signals = p?.signals ?? [];
  const targetContexts = ep?.target_contexts ?? [];
  const priceZones = (ep?.price_zones ?? []).filter((zone) => zone.kind === 'resistance');
  const verdictTone = directionStyles(p?.direction);

  return (
    <>
      {p ? (
        <div className={`verdict ${stylex.props(styles.verdict, verdictTone.frame).className}`}>
          <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>
            短线方向判断
            {predictionStale ? (
              <span className={`stale-badge ${stylex.props(styles.staleBadge).className}`}>
                <TriangleAlert className="icon" size={13} /> 盘中已过期
              </span>
            ) : (
              predictionUpdatedAt && (
                <span className={`prediction-age ${stylex.props(styles.predictionAge).className}`}>
                  更新于 <MarketTime value={predictionUpdatedAt} format="clock" includeZone />（
                  <TimeAgo since={predictionUpdatedAt} />）
                </span>
              )
            )}
          </div>
          <div
            className={`verdict-text ${stylex.props(styles.verdictText, verdictTone.text).className}`}
          >
            {DIRECTION_LABEL[p.direction] ?? '🤔 观望'}
          </div>
          {p.anchor && (
            <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
              预测点：{TF_LABELS[p.anchor.timeframe] ?? p.anchor.timeframe} ·{' '}
              <MarketTime value={p.anchor.time} /> · ${fmt(Number(p.anchor.price))}
            </div>
          )}
          {reassess &&
            conclusionOutdated(
              predictionUpdatedAt ?? p.anchor?.time,
              predictionStale,
              Date.now(),
            ) && <ReassessCta reassess={reassess} />}
        </div>
      ) : (
        <div className={`verdict ${stylex.props(styles.verdict, styles.verdictNeutral).className}`}>
          <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>模式</div>
          <div
            className={`verdict-text ${stylex.props(styles.verdictText, styles.verdictTextNeutral).className}`}
          >
            👀 预览模式
          </div>
          <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
            仅技术面，暂无预测结论——供分析前读数用
          </div>
        </div>
      )}
      {!p && emptyCta}

      {p && scenarios.length > 0 && (
        <>
          <SectionTitle>
            情景推演
            {Math.abs(totalProb - 100) >= 1 && (
              <span className={`warn-red ${stylex.props(styles.warning).className}`}>
                {' '}
                <TriangleAlert className="icon" size={13} /> 概率合计 {fmt(totalProb, 0)}
                %，未凑够100
              </span>
            )}
          </SectionTitle>
          {scenarios.map((sc, i) => (
            <div key={i} className={`zone-item ${stylex.props(styles.zoneItem).className}`}>
              <div className={`zone-head ${stylex.props(styles.zoneHead).className}`}>
                <span
                  className={`zone-label plain ${stylex.props(styles.zoneLabelPlain).className}`}
                >
                  {sc.label}
                </span>
                <span
                  className={`zone-range accent ${stylex.props(styles.zoneRangeAccent).className}`}
                >
                  {fmt(Number(sc.probability || 0), 0)}%
                </span>
              </div>
              <div
                className={`zone-meta md ${stylex.props(styles.zoneMeta, styles.zoneMetaMd).className}`}
              >
                {sc.path ?? ''}
                {sc.trigger ? ` · 触发：${sc.trigger}` : ''}
              </div>
            </div>
          ))}
        </>
      )}

      {p && rbp && (
        <>
          <SectionTitle>震荡应对</SectionTitle>
          <div
            className={`zone-meta md ${stylex.props(styles.zoneMeta, styles.zoneMetaMd, styles.zoneMetaAfter).className}`}
          >
            {rbp.low != null && rbp.high != null && (
              <>
                预判区间 ${fmt(Number(rbp.low))} – ${fmt(Number(rbp.high))}
                {rbp.condition ? ' · ' : ''}
              </>
            )}
            {rbp.condition ?? ''}
          </div>
          <div className={`grid2 ${stylex.props(styles.grid).className}`}>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>若做多</div>
            <div
              className={`v left ${stylex.props(styles.gridValue, styles.gridValueLeft).className}`}
            >
              {rbp.long_tactic ?? ''}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>若做空</div>
            <div
              className={`v left ${stylex.props(styles.gridValue, styles.gridValueLeft).className}`}
            >
              {rbp.short_tactic ?? ''}
            </div>
          </div>
        </>
      )}

      {p && ep && (
        <>
          <SectionTitle>入场计划</SectionTitle>
          {ep.entry_status_note && (
            <div
              className={`note-block ${stylex.props(styles.note).className}${ep.entry_status === 'invalidated' || ep.entry_status === 'stopped' ? ` down ${stylex.props(styles.toneDown).className}` : ''}`}
            >
              {ep.entry_status_note}
            </div>
          )}
          <div
            className={`grid2 ${stylex.props(styles.grid, ep.entry_status_note && styles.gridAfterNote).className}`}
          >
            <div className={`k ${stylex.props(styles.gridKey).className}`}>入场</div>
            <div className={`v ${stylex.props(styles.gridValue).className}`}>${fmt(ep.entry)}</div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>止损</div>
            <div
              className={`v down ${stylex.props(styles.gridValue, styles.toneDown).className}`}
            >
              ${fmt(ep.stop)}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              目标1 ({signed(ep.target1_pct, 1)}%)
            </div>
            <div
              className={`v up ${stylex.props(styles.gridValue, styles.toneUp).className}`}
            >
              ${fmt(ep.target1)}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>
              目标2 ({signed(ep.target2_pct, 1)}%)
            </div>
            <div
              className={`v up ${stylex.props(styles.gridValue, styles.toneUp).className}`}
            >
              ${fmt(ep.target2)}
            </div>
            <div className={`k ${stylex.props(styles.gridKey).className}`}>R/R</div>
            <div
              className={`v ${rrTone(ep)} ${stylex.props(styles.gridValue, rrTone(ep) === 'up' ? styles.toneUp : rrTone(ep) === 'down' ? styles.toneDown : null).className}`}
            >
              {fmt(ep.rr)} : 1
              {!ep.rr_ok && (
                <span className={`warn-red ${stylex.props(styles.warning).className}`}>
                  {' '}
                  <TriangleAlert className="icon" size={13} /> &lt;2:1
                </span>
              )}
            </div>
          </div>
          {(ep.rationale || ep.stop_note) && (
            <div className={`plan-explain ${stylex.props(styles.planExplain).className}`}>
              {ep.rationale && (
                <>
                  <div
                    className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}
                  >
                    入场理由
                  </div>
                  <div
                    className={`note-block strong ${stylex.props(styles.note, styles.noteStrong).className}`}
                  >
                    {ep.rationale}
                  </div>
                </>
              )}
              {ep.stop_note && (
                <>
                  <div
                    className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}
                  >
                    止损理由
                  </div>
                  <div className={`note-block ${stylex.props(styles.note).className}`}>
                    {ep.stop_note}
                  </div>
                </>
              )}
            </div>
          )}
          {targetContexts.length > 0 && (
            <>
              <div className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}>
                目标依据
              </div>
              {targetContexts.map((target) => (
                <TargetContextCard key={target.key} target={target} />
              ))}
            </>
          )}
          {priceZones.length > 0 && (
            <>
              <div className={`section-subtitle ${stylex.props(styles.sectionSubtitle).className}`}>
                关键区间
              </div>
              {priceZones.map((zone, i) => (
                <PriceZoneCard key={`${zone.kind}-${zone.label}-${i}`} zone={zone} compact />
              ))}
            </>
          )}
          {ep.note && (
            <div className={`note-block ${stylex.props(styles.note).className}`}>{ep.note}</div>
          )}
        </>
      )}

      {p && signals.length > 0 && (
        <>
          <SectionTitle>关键标注</SectionTitle>
          {signals.map((sig, i) => (
            <div
              key={i}
              className={`check-item signal ${stylex.props(styles.checkItem).className}`}
            >
              <div className={`check-icon ${stylex.props(styles.checkIcon).className}`}>
                {SIGNAL_ICON[sig.type ?? sig.kind ?? 'other'] ?? '•'}
              </div>
              <div>
                <div className={`check-label ${stylex.props(styles.checkLabel).className}`}>
                  {sig.label ?? ''}
                </div>
                <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
                  {TF_LABELS[sig.timeframe] ?? sig.timeframe}
                  {sig.price != null ? ` · $${fmt(sig.price)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {(() => {
        const tfData = built.timeframes[activeTf];
        const patterns123 = tfData?.pattern123 ?? [];
        const autoItems = [
          ...(tfData?.autoDivergence ?? []).map((d) => ({
            kindKey: `divergence-${d.kind}`,
            pair: d,
          })),
          ...(tfData?.autoBeichi ?? []).map((d) => ({ kindKey: `macdBeichi-${d.kind}`, pair: d })),
        ];
        if (!autoItems.length && !patterns123.length) return null;
        return (
          <>
            <SectionTitle>自动信号 · {TF_LABELS[activeTf]}</SectionTitle>
            {patterns123.map((pat, i) => (
              <Pattern123Item key={`p123-${i}`} pat={pat} />
            ))}
            {autoItems.map((it, i) => (
              <AutoSignalItem key={i} kindKey={it.kindKey} pair={it.pair} />
            ))}
            <div className={`note-block ${stylex.props(styles.note).className}`}>
              简化算法自动检测（基于已确认摆动点），仅供参考，不构成买卖依据
            </div>
          </>
        );
      })()}

      {!p && (
        <>
          <SectionTitle>技术面摘要</SectionTitle>
          <div className={`grid2 ${stylex.props(styles.grid).className}`}>
            {TF_ORDER.map((k) => {
              const t = s.technicals[k];
              if (!t || t.last_dif === null) return null;
              return (
                <TechRow
                  key={k}
                  label={TF_LABELS[k]}
                  value={`${fmt(t.last_dif)} / ${fmt(t.last_dea ?? 0)} / ${fmt(t.last_hist ?? 0)}`}
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
