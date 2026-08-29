import { ArrowRight } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import {
  AUTO_SIGNAL_META,
  type DivergencePair,
  type IntradayPriceZone,
  type IntradayTargetContext,
  type Pattern123,
} from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { theme } from '@web/lib/theme';
import { Badge, MarketTime } from '@web/ui';
import { colors, fontSizes } from '../../../../theme/tokens.stylex';

const styles = stylex.create({
  targetContext: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    marginBottom: '6px',
    padding: '8px',
  },
  targetHead: {
    alignItems: 'baseline',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.base,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    justifyContent: 'space-between',
  },
  zoneBorder: (color: string) => ({
    borderLeftColor: color,
  }),
  zoneLabel: (color: string) => ({
    color,
    fontSize: fontSizes.base,
    fontWeight: 600,
  }),
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
  autoSignalIcon: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    lineHeight: 1,
    paddingTop: '1px',
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
  p123Badge: { marginLeft: '6px' },
  zoneItem: {
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '3px',
    display: 'block',
    marginBottom: '6px',
    padding: '8px 10px',
  },
  zoneItemCompact: {
    marginBottom: '5px',
    padding: '6px 8px',
  },
  zoneHead: {
    alignItems: 'baseline',
    display: 'flex',
    justifyContent: 'space-between',
  },
  zoneRange: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  zoneMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 1.45,
    marginTop: '3px',
  },
  zoneMetaMd: { fontSize: fontSizes.sm },
  zoneSources: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.35,
    marginTop: '4px',
  },
  gridKey: { color: colors.textSecondary },
  gridValue: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  gridValueLeft: { textAlign: 'left' },
});

const ZONE_KIND_LABEL: Record<string, string> = {
  entry: '入场区',
  stop: '止损/失效',
  target: '目标区',
  support: '支撑区',
  resistance: '压力/阻力区',
  invalidation: '失效区',
  watch: '观察区',
};

function BarTime({ value }: { value: number }) {
  return <MarketTime value={value} format="month-day-time" includeZone />;
}

export function Pattern123Item({ pat }: { pat: Pattern123 }) {
  const confirmed = pat.status === 'confirmed';
  return (
    <div className={`check-item signal ${stylex.props(styles.checkItem).className}`}>
      <div
        className={`check-icon auto-signal-icon ${stylex.props(styles.checkIcon, styles.autoSignalIcon).className}`}
      >
        🔢
      </div>
      <div>
        <div className={`check-label ${stylex.props(styles.checkLabel).className}`}>
          {pat.label}
          <Badge
            tone={confirmed ? 'up' : 'accent'}
            className={`p123-badge ${stylex.props(styles.p123Badge).className}`}
          >
            {confirmed ? '已确认' : '酝酿中'}
          </Badge>
        </div>
        <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
          ① <BarTime value={pat.p1.time} /> ${fmt(pat.p1.price)}{' '}
          <ArrowRight className="icon" size={12} /> ② ${fmt(pat.p2.price)}{' '}
          <ArrowRight className="icon" size={12} /> ③ <BarTime value={pat.p3.time} /> $
          {fmt(pat.p3.price)}
        </div>
        <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
          {pat.implication}
        </div>
        {confirmed && pat.confirm && (
          <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
            <BarTime value={pat.confirm.time} /> 收盘 ${fmt(pat.confirm.price)} 突破触发线 $
            {fmt(pat.trigger)}
          </div>
        )}
      </div>
    </div>
  );
}

export function AutoSignalItem({ kindKey, pair }: { kindKey: string; pair: DivergencePair }) {
  const meta = AUTO_SIGNAL_META[kindKey];
  if (!meta) return null;
  return (
    <div className={`check-item signal ${stylex.props(styles.checkItem).className}`}>
      <div
        className={`check-icon auto-signal-icon ${stylex.props(styles.checkIcon, styles.autoSignalIcon).className}`}
      >
        {meta.icon}
      </div>
      <div>
        <div className={`check-label ${stylex.props(styles.checkLabel).className}`}>
          {meta.title}
        </div>
        <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
          <BarTime value={pair.a.time} /> ${fmt(pair.a.price)}{' '}
          <ArrowRight className="icon" size={12} /> <BarTime value={pair.b.time} /> $
          {fmt(pair.b.price)}
        </div>
        <div className={`check-val ${stylex.props(styles.checkValue).className}`}>
          {meta.impact}
        </div>
      </div>
    </div>
  );
}

export function PriceZoneCard({
  zone,
  compact = false,
}: {
  zone: IntradayPriceZone;
  compact?: boolean;
}) {
  const color = zone.color ?? theme.textSecondary;
  const isBand = Math.abs(zone.high - zone.low) >= 0.0001;
  const zoneStyle = stylex.props(
    styles.zoneItem,
    compact && styles.zoneItemCompact,
    styles.zoneBorder(color),
  );
  const zoneHeadStyle = stylex.props(styles.zoneHead);
  const zoneLabelStyle = stylex.props(styles.zoneLabel(color));
  const zoneRangeStyle = stylex.props(styles.zoneRange);
  const zoneMetaStyle = stylex.props(styles.zoneMeta);
  const zoneSourcesStyle = stylex.props(styles.zoneSources);
  return (
    <div
      className={`zone-item ${compact ? 'compact' : ''} ${zoneStyle.className ?? ''}`}
    >
      <div className={`zone-head ${zoneHeadStyle.className ?? ''}`}>
        <span {...zoneLabelStyle} className={`zone-label ${zoneLabelStyle.className ?? ''}`}>
          {zone.label}
        </span>
        <span className={`zone-range ${zoneRangeStyle.className ?? ''}`}>
          {isBand ? `$${fmt(zone.low)} - $${fmt(zone.high)}` : `$${fmt(zone.low)}`}
        </span>
      </div>
      <div className={`zone-meta ${zoneMetaStyle.className ?? ''}`}>
        {ZONE_KIND_LABEL[zone.kind] ?? zone.kind}
        {zone.note ? ` · ${zone.note}` : ''}
      </div>
      {zone.sources && zone.sources.length > 0 && (
        <div className={`zone-sources ${zoneSourcesStyle.className ?? ''}`}>
          {zone.sources.join(' / ')}
        </div>
      )}
    </div>
  );
}

export function TargetContextCard({ target }: { target: IntradayTargetContext }) {
  return (
    <div {...stylex.props(styles.targetContext)}>
      <div {...stylex.props(styles.targetHead)}>
        <span>{target.label}</span>
        <span>${fmt(target.price)}</span>
      </div>
      {target.zone && <PriceZoneCard zone={target.zone} compact />}
      {target.note && (
        <div
          className={`zone-meta md ${stylex.props(styles.zoneMeta, styles.zoneMetaMd).className}`}
        >
          {target.note}
        </div>
      )}
      {target.condition && (
        <div className={`zone-meta ${stylex.props(styles.zoneMeta).className}`}>
          条件：{target.condition}
        </div>
      )}
    </div>
  );
}

export function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className={`k ${stylex.props(styles.gridKey).className}`}>
        {label} DIF/DEA/HIST
      </div>
      <div className={`v left ${stylex.props(styles.gridValue, styles.gridValueLeft).className}`}>
        {value}
      </div>
    </>
  );
}
