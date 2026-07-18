import type { CSSProperties } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import type { SepaBuilt } from "@kansoku/shared/types";
import { fmt, signed, upDown } from "@web/format";
import { NewsSection } from "../NewsSection";
import { Badge, Num, SectionTitle } from "@web/ui";

const CHECK_ICON: Record<string, { icon: typeof Check; tone: string }> = {
  pass: { icon: Check, tone: "up" },
  fail: { icon: X, tone: "down" },
  unknown: { icon: TriangleAlert, tone: "" },
};

function rrTone(ep: { rr_great: boolean; rr_ok: boolean }): string {
  if (ep.rr_great) return "up";
  return ep.rr_ok ? "" : "down";
}

export function SepaSidebar({ built }: { built: SepaBuilt }) {
  const s = built.sidebar;
  const ep = built.chart.entryPlan;
  const zones = built.chart.supportZones;
  const kv = s.keyValues;

  return (
    <div className="sidebar">
      <div className="sidebar-scroll">
        <div className="header">
          <div className="symbol">{s.symbol}</div>
          <div className="name">{s.name}</div>
          <div className="price">
            ${fmt(s.last)}
            <span className={`price-change ${upDown(s.chgPct)}`}>{signed(s.chgPct)}%</span>
          </div>
          <div className="price-date">{s.asOf} · 长桥证券</div>
        </div>

        <div className="verdict" style={{ "--vc": s.verdict.color } as CSSProperties}>
          <div className="verdict-label">SEPA 结论</div>
          <div className="verdict-text">{s.verdict.label}</div>
          <div className="verdict-reason">{s.verdict.reason}</div>
        </div>

        {s.stage.length > 0 && (
          <>
            <SectionTitle>阶段判断</SectionTitle>
            <div className="grid2">
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
            <div key={c.label} className={`check-item ${c.status}`}>
              <div className={`check-icon ${status.tone}`}>
                <StatusIcon className="icon" size={14} />
              </div>
              <div>
                <div className="check-label">{c.label}</div>
                <div className="check-val">{c.val}</div>
              </div>
            </div>
          );
        })}

        <SectionTitle>关键数值</SectionTitle>
        <div className="grid2">
          <div className="k">距 52w 高 ${fmt(kv.high52w)}</div>
          <div className="v down">{signed(kv.h52Pct)}%</div>
          <div className="k">距 52w 低 ${fmt(kv.low52w)}</div>
          <div className="v up">{signed(kv.l52Pct, 0)}%</div>
          <div className="k">距 MA50</div>
          <div className="v"><Num value={kv.ma50Pct} diff suffix="%" /></div>
          <div className="k">距 MA200</div>
          <div className="v"><Num value={kv.ma200Pct} diff suffix="%" /></div>
          {kv.rs21d !== null && (
            <>
              <div className="k">RS 21d (vs SPY)</div>
              <div className="v"><Num value={kv.rs21d} diff digits={1} suffix=" pp" /></div>
            </>
          )}
          {kv.rs126d !== null && (
            <>
              <div className="k">RS 126d (vs SPY)</div>
              <div className="v"><Num value={kv.rs126d} diff digits={1} suffix=" pp" /></div>
            </>
          )}
        </div>

        {zones.length > 0 && (
          <>
            <SectionTitle>支撑区</SectionTitle>
            {zones.map((z, i) => (
              <div key={i} className="zone-item" style={{ "--zc": z.axis_color } as CSSProperties}>
                <div className="zone-head">
                  <span className="zone-label">{z.label}</span>
                  <span className="zone-range">
                    ${fmt(z.low)} – ${fmt(z.high)} ({signed(((z.high + z.low) / 2 / s.last) * 100 - 100, 1)}%)
                  </span>
                </div>
                <div className="zone-meta">
                  {z.note}
                  {z.sources.length > 0 && <span className="zone-sources-inline"> · {z.sources.join(" / ")}</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {ep && (
          <>
            <SectionTitle>
              入场计划
              {ep.hypothetical && <Badge className="hypo-badge">假设性</Badge>}
            </SectionTitle>
            <div className="grid2">
              <div className="k">买入区间 (pivot+5%)</div>
              <div className="v">
                ${fmt(ep.pivot)} – ${fmt(ep.buy_zone_high)}
              </div>
              <div className="k">止损</div>
              <div className="v down">
                ${fmt(ep.stop)} ({signed(ep.stop_pct, 1)}%)
              </div>
              <div className="k">第一目标 (+{fmt(ep.target1_pct, 0)}%)</div>
              <div className="v up">${fmt(ep.target1)}</div>
              <div className="k">第二目标 (+{fmt(ep.target2_pct, 0)}%)</div>
              <div className="v up">${fmt(ep.target2)}</div>
              <div className="k">R/R 比例 (基于 T2)</div>
              <div className={`v ${rrTone(ep)}`}>
                {fmt(ep.rr)} : 1
                {!ep.rr_ok && (
                  <span className="warn-red">
                    {" "}
                    <TriangleAlert className="icon" size={13} /> &lt;2:1 SEPA 不入场
                  </span>
                )}
              </div>
            </div>
            {ep.note && <div className="note-block">{ep.note}</div>}
            <div className="rule-block">
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
            <div className="grid2">
              <div className="k">持仓</div>
              <div className="v">{s.position.shares} sh</div>
              <div className="k">成本</div>
              <div className="v">${fmt(s.position.cost)}</div>
              <div className="k">浮{s.position.unrealized >= 0 ? "盈" : "亏"}</div>
              <div className={`v ${upDown(s.position.unrealized)}`}>
                {signed(s.position.unrealized)} ({signed(s.position.unrealizedPct)}%)
              </div>
              <div className="k">守仓边界 (50MA)</div>
              <div className="v">${fmt(s.ma50Now)}</div>
            </div>
          </>
        )}

        <NewsSection news={s.news ?? []} />

        <div className="disclaimer">
          <TriangleAlert className="icon" size={12} /> 仅供学习参考，不构成投资建议。数据来源：长桥证券。
          <br />
          SEPA 框架基于 Mark Minervini 方法。Verdict 自动检测 trend template + extended 警戒；形态（VCP / 杯柄 / 平台 / 旗形）需人工目视确认。
        </div>
      </div>
    </div>
  );
}

function StageRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="k">{k}</div>
      <div className="v left">{v}</div>
    </>
  );
}
