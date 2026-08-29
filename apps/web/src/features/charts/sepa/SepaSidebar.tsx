import * as stylex from '@stylexjs/stylex';
import { Check, TriangleAlert, X } from 'lucide-react';
import type { SepaBuilt } from '@kansoku/shared/types';
import { fmt, signed, upDown } from '@web/lib/format';
import { colors, fontSizes } from '../../../theme/tokens.stylex';
import { NewsSection } from '../NewsSection';
import { Badge, Num, SectionTitle } from '@web/ui';

const styles = stylex.create({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.backgroundSurface,
    fontSize: fontSizes.md,
    overflow: 'hidden',
  },
  scroll: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
  },
  header: {
    marginBottom: '14px',
    paddingBottom: '12px',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  symbol: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    color: colors.textPrimary,
  },
  name: {
    fontSize: fontSizes.base,
    color: colors.textSecondary,
    marginTop: '2px',
  },
  price: {
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginTop: '8px',
    color: colors.textPrimary,
  },
  priceChange: {
    fontSize: fontSizes.md,
    marginLeft: '8px',
  },
  priceUp: {
    color: colors.up,
  },
  priceDown: {
    color: colors.down,
  },
  priceDate: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '2px',
  },
  verdict: (color: string) => ({
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${color} 14%, transparent), color-mix(in srgb, ${color} 4%, transparent))`,
    borderColor: color,
    borderStyle: 'solid',
    borderWidth: '1px',
    padding: '12px',
    marginBottom: '14px',
  }),
  verdictLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  verdictText: (color: string) => ({
    fontSize: fontSizes.xl,
    fontWeight: 600,
    color,
    marginTop: '4px',
  }),
  verdictReason: {
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    marginTop: '6px',
    lineHeight: 1.5,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '6px 10px',
    fontSize: fontSizes.base,
  },
  key: {
    color: colors.textSecondary,
  },
  value: {
    color: colors.textPrimary,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  valueLeft: {
    textAlign: 'left',
  },
  valueUp: {
    color: colors.up,
  },
  valueDown: {
    color: colors.down,
  },
  checkItem: {
    display: 'flex',
    gap: '10px',
    padding: '7px 8px',
    marginBottom: '4px',
    backgroundColor: colors.backgroundSurface,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
  },
  checkPass: {
    borderLeftColor: colors.up,
  },
  checkFail: {
    borderLeftColor: colors.down,
  },
  checkUnknown: {
    borderLeftColor: colors.textMuted,
  },
  checkIcon: {
    display: 'flex',
    alignItems: 'center',
    fontSize: fontSizes.md,
  },
  icon: {
    verticalAlign: '-2px',
  },
  checkIconUp: {
    color: colors.up,
  },
  checkIconDown: {
    color: colors.down,
  },
  checkIconUnknown: {
    color: colors.textPrimary,
  },
  checkLabel: {
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    fontWeight: 500,
  },
  checkVal: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '2px',
  },
  zone: (color: string) => ({
    display: 'block',
    padding: '8px 10px',
    marginBottom: '6px',
    backgroundColor: colors.backgroundSurface,
    borderLeftColor: color,
    borderLeftStyle: 'solid',
    borderLeftWidth: '3px',
  }),
  zoneHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  zoneLabel: (color: string) => ({
    fontSize: fontSizes.base,
    fontWeight: 600,
    color,
  }),
  zoneRange: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  zoneMeta: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: '3px',
    lineHeight: 1.45,
  },
  zoneSourcesInline: {
    color: colors.textMuted,
  },
  noteBlock: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: '6px',
    lineHeight: 1.4,
  },
  ruleBlock: {
    borderLeftColor: colors.border,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    marginTop: '8px',
    paddingLeft: '8px',
  },
  hypoBadge: {
    marginLeft: '6px',
  },
  warnRed: {
    color: colors.down,
  },
  disclaimer: {
    marginTop: '16px',
    paddingTop: '10px',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 1.4,
  },
});

const CHECK_ICON: Record<string, { icon: typeof Check; tone: string }> = {
  pass: { icon: Check, tone: 'up' },
  fail: { icon: X, tone: 'down' },
  unknown: { icon: TriangleAlert, tone: '' },
};

function rrTone(ep: { rr_great: boolean; rr_ok: boolean }): string {
  if (ep.rr_great) return 'up';
  return ep.rr_ok ? '' : 'down';
}

export function SepaSidebar({ built }: { built: SepaBuilt }) {
  const s = built.sidebar;
  const ep = built.chart.entryPlan;
  const zones = built.chart.supportZones;
  const kv = s.keyValues;

  return (
    <div className={`sidebar ${stylex.props(styles.sidebar).className}`}>
      <div className={`sidebar-scroll ${stylex.props(styles.scroll).className}`}>
        <div className={`header ${stylex.props(styles.header).className}`}>
          <div className={`symbol ${stylex.props(styles.symbol).className}`}>{s.symbol}</div>
          <div className={`name ${stylex.props(styles.name).className}`}>{s.name}</div>
          <div className={`price ${stylex.props(styles.price).className}`}>
            ${fmt(s.last)}
            <span
              className={`price-change ${upDown(s.chgPct)} ${stylex.props(styles.priceChange, s.chgPct >= 0 ? styles.priceUp : styles.priceDown).className}`}
            >
              {signed(s.chgPct)}%
            </span>
          </div>
          <div className={`price-date ${stylex.props(styles.priceDate).className}`}>
            {s.asOf} · 长桥证券
          </div>
        </div>

        <div
          className={`verdict ${stylex.props(styles.verdict(s.verdict.color)).className}`}
          style={stylex.props(styles.verdict(s.verdict.color)).style}
        >
          <div className={`verdict-label ${stylex.props(styles.verdictLabel).className}`}>
            SEPA 结论
          </div>
          <div
            className={`verdict-text ${stylex.props(styles.verdictText(s.verdict.color)).className}`}
            style={stylex.props(styles.verdictText(s.verdict.color)).style}
          >
            {s.verdict.label}
          </div>
          <div className={`verdict-reason ${stylex.props(styles.verdictReason).className}`}>
            {s.verdict.reason}
          </div>
        </div>

        {s.stage.length > 0 && (
          <>
            <SectionTitle>阶段判断</SectionTitle>
            <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
              {s.stage.map((row) => (
                <StageRow key={row.k} k={row.k} v={row.v} />
              ))}
            </div>
          </>
        )}

        <SectionTitle>趋势模板 8 条</SectionTitle>
        {s.checks.map((c) => {
          const status = CHECK_ICON[c.status] ?? CHECK_ICON.unknown;
          const StatusIcon = status.icon;
          return (
            <div
              key={c.label}
              className={`check-item ${c.status} ${stylex.props(styles.checkItem, c.status === 'pass' ? styles.checkPass : c.status === 'fail' ? styles.checkFail : styles.checkUnknown).className}`}
            >
              <div
                className={`check-icon ${status.tone} ${stylex.props(styles.checkIcon, status.tone === 'up' ? styles.checkIconUp : status.tone === 'down' ? styles.checkIconDown : styles.checkIconUnknown).className}`}
              >
                <StatusIcon className={stylex.props(styles.icon).className} size={14} />
              </div>
              <div>
                <div className={`check-label ${stylex.props(styles.checkLabel).className}`}>
                  {c.label}
                </div>
                <div className={`check-val ${stylex.props(styles.checkVal).className}`}>
                  {c.val}
                </div>
              </div>
            </div>
          );
        })}

        <SectionTitle>关键数值</SectionTitle>
        <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
          <div className={`k ${stylex.props(styles.key).className}`}>
            距 52w 高 ${fmt(kv.high52w)}
          </div>
          <div className={`v down ${stylex.props(styles.value, styles.valueDown).className}`}>
            {signed(kv.h52Pct)}%
          </div>
          <div className={`k ${stylex.props(styles.key).className}`}>
            距 52w 低 ${fmt(kv.low52w)}
          </div>
          <div className={`v up ${stylex.props(styles.value, styles.valueUp).className}`}>
            {signed(kv.l52Pct, 0)}%
          </div>
          <div className={`k ${stylex.props(styles.key).className}`}>距 MA50</div>
          <div className={`v ${stylex.props(styles.value).className}`}>
            <Num value={kv.ma50Pct} diff suffix="%" />
          </div>
          <div className={`k ${stylex.props(styles.key).className}`}>距 MA200</div>
          <div className={`v ${stylex.props(styles.value).className}`}>
            <Num value={kv.ma200Pct} diff suffix="%" />
          </div>
          {kv.rs21d !== null && (
            <>
              <div className={`k ${stylex.props(styles.key).className}`}>RS 21d (vs SPY)</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                <Num value={kv.rs21d} diff digits={1} suffix=" pp" />
              </div>
            </>
          )}
          {kv.rs126d !== null && (
            <>
              <div className={`k ${stylex.props(styles.key).className}`}>RS 126d (vs SPY)</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                <Num value={kv.rs126d} diff digits={1} suffix=" pp" />
              </div>
            </>
          )}
        </div>

        {zones.length > 0 && (
          <>
            <SectionTitle>支撑区</SectionTitle>
            {zones.map((z, i) => (
              <div
                key={i}
                className={`zone-item ${stylex.props(styles.zone(z.axis_color)).className}`}
                style={stylex.props(styles.zone(z.axis_color)).style}
              >
                <div className={`zone-head ${stylex.props(styles.zoneHead).className}`}>
                  <span
                    className={`zone-label ${stylex.props(styles.zoneLabel(z.axis_color)).className}`}
                    style={stylex.props(styles.zoneLabel(z.axis_color)).style}
                  >
                    {z.label}
                  </span>
                  <span className={`zone-range ${stylex.props(styles.zoneRange).className}`}>
                    ${fmt(z.low)} – ${fmt(z.high)} (
                    {signed(((z.high + z.low) / 2 / s.last) * 100 - 100, 1)}%)
                  </span>
                </div>
                <div className={`zone-meta ${stylex.props(styles.zoneMeta).className}`}>
                  {z.note}
                  {z.sources.length > 0 && (
                    <span
                      className={`zone-sources-inline ${stylex.props(styles.zoneSourcesInline).className}`}
                    >
                      {' · '}
                      {z.sources.join(' / ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {ep && (
          <>
            <SectionTitle>
              入场计划
              {ep.hypothetical && (
                <Badge className={`hypo-badge ${stylex.props(styles.hypoBadge).className}`}>
                  假设性
                </Badge>
              )}
            </SectionTitle>
            <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
              <div className={`k ${stylex.props(styles.key).className}`}>买入区间 (pivot+5%)</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                ${fmt(ep.pivot)} – ${fmt(ep.buy_zone_high)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>止损</div>
              <div className={`v down ${stylex.props(styles.value, styles.valueDown).className}`}>
                ${fmt(ep.stop)} ({signed(ep.stop_pct, 1)}%)
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                第一目标 (+{fmt(ep.target1_pct, 0)}%)
              </div>
              <div className={`v up ${stylex.props(styles.value, styles.valueUp).className}`}>
                ${fmt(ep.target1)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                第二目标 (+{fmt(ep.target2_pct, 0)}%)
              </div>
              <div className={`v up ${stylex.props(styles.value, styles.valueUp).className}`}>
                ${fmt(ep.target2)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>R/R 比例 (基于 T2)</div>
              <div
                className={`v ${rrTone(ep)} ${stylex.props(styles.value, rrTone(ep) === 'up' ? styles.valueUp : rrTone(ep) === 'down' ? styles.valueDown : null).className}`}
              >
                {fmt(ep.rr)} : 1
                {!ep.rr_ok && (
                  <span className={`warn-red ${stylex.props(styles.warnRed).className}`}>
                    {' '}
                    <TriangleAlert className={stylex.props(styles.icon).className} size={13} /> &lt;2:1 SEPA 不入场
                  </span>
                )}
              </div>
            </div>
            {ep.note && (
              <div className={`note-block ${stylex.props(styles.noteBlock).className}`}>
                {ep.note}
              </div>
            )}
            <div className={`rule-block ${stylex.props(styles.ruleBlock).className}`}>
              <b>三阶段止损（SEPA 规则）</b>
              <br />① 入场后硬止损 −7~8%，绝不下移
              <br />② 涨 +8%：卖一半，止损上移到本钱（不再亏）
              <br />③ 涨 +15%：再卖 25%，剩仓沿 20MA 跟踪；跌破 20MA 全清
            </div>
          </>
        )}

        {s.position && (
          <>
            <SectionTitle>持仓视角</SectionTitle>
            <div className={`grid2 ${stylex.props(styles.grid2).className}`}>
              <div className={`k ${stylex.props(styles.key).className}`}>持仓</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                {s.position.shares} sh
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>成本</div>
              <div className={`v ${stylex.props(styles.value).className}`}>
                ${fmt(s.position.cost)}
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>
                浮{s.position.unrealized >= 0 ? '盈' : '亏'}
              </div>
              <div
                className={`v ${upDown(s.position.unrealized)} ${stylex.props(styles.value, s.position.unrealized >= 0 ? styles.valueUp : styles.valueDown).className}`}
              >
                {signed(s.position.unrealized)} ({signed(s.position.unrealizedPct)}%)
              </div>
              <div className={`k ${stylex.props(styles.key).className}`}>守仓边界 (50MA)</div>
              <div className={`v ${stylex.props(styles.value).className}`}>${fmt(s.ma50Now)}</div>
            </div>
          </>
        )}

        <NewsSection news={s.news ?? []} />

        <div className={`disclaimer ${stylex.props(styles.disclaimer).className}`}>
          <TriangleAlert className={stylex.props(styles.icon).className} size={12} />{' '}
          仅供学习参考，不构成投资建议。数据来源：长桥证券。
          <br />
          SEPA 框架基于 Mark Minervini 方法。Verdict 自动检测 trend template + extended
          警戒；形态（VCP / 杯柄 / 平台 / 旗形）需人工目视确认。
        </div>
      </div>
    </div>
  );
}

function StageRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className={`k ${stylex.props(styles.key).className}`}>{k}</div>
      <div className={`v left ${stylex.props(styles.value, styles.valueLeft).className}`}>{v}</div>
    </>
  );
}
