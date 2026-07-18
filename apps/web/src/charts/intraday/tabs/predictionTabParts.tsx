import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { AUTO_SIGNAL_META, type DivergencePair, type IntradayPriceZone, type IntradayTargetContext, type Pattern123 } from "@kansoku/shared/types";
import { fmt } from "@web/format";
import { theme } from "@web/theme";
import { Badge, MarketTime } from "@web/ui";

const ZONE_KIND_LABEL: Record<string, string> = {
  entry: "入场区",
  stop: "止损/失效",
  target: "目标区",
  support: "支撑区",
  resistance: "压力/阻力区",
  invalidation: "失效区",
  watch: "观察区",
};

function BarTime({ value }: { value: number }) {
  return <MarketTime value={value} format="month-day-time" includeZone />;
}

export function Pattern123Item({ pat }: { pat: Pattern123 }) {
  const confirmed = pat.status === "confirmed";
  return (
    <div className="check-item signal">
      <div className="check-icon auto-signal-icon">🔢</div>
      <div>
        <div className="check-label">
          {pat.label}
          <Badge tone={confirmed ? "up" : "accent"} className="p123-badge">
            {confirmed ? "已确认" : "酝酿中"}
          </Badge>
        </div>
        <div className="check-val">
          ① <BarTime value={pat.p1.time} /> ${fmt(pat.p1.price)} <ArrowRight className="icon" size={12} /> ② $
          {fmt(pat.p2.price)} <ArrowRight className="icon" size={12} /> ③ <BarTime value={pat.p3.time} /> $
          {fmt(pat.p3.price)}
        </div>
        <div className="check-val">{pat.implication}</div>
        {confirmed && pat.confirm && (
          <div className="check-val">
            <BarTime value={pat.confirm.time} /> 收盘 ${fmt(pat.confirm.price)} 突破触发线 ${fmt(pat.trigger)}
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
    <div className="check-item signal">
      <div className="check-icon auto-signal-icon">{meta.icon}</div>
      <div>
        <div className="check-label">{meta.title}</div>
        <div className="check-val">
          <BarTime value={pair.a.time} /> ${fmt(pair.a.price)} <ArrowRight className="icon" size={12} /> <BarTime value={pair.b.time} />{" "}
          ${fmt(pair.b.price)}
        </div>
        <div className="check-val">{meta.impact}</div>
      </div>
    </div>
  );
}

export function PriceZoneCard({ zone, compact = false }: { zone: IntradayPriceZone; compact?: boolean }) {
  const color = zone.color ?? theme.textSecondary;
  const isBand = Math.abs(zone.high - zone.low) >= 0.0001;
  return (
    <div className={`zone-item ${compact ? "compact" : ""}`} style={{ "--zc": color } as CSSProperties}>
      <div className="zone-head">
        <span className="zone-label">{zone.label}</span>
        <span className="zone-range">
          {isBand ? `$${fmt(zone.low)} - $${fmt(zone.high)}` : `$${fmt(zone.low)}`}
        </span>
      </div>
      <div className="zone-meta">
        {ZONE_KIND_LABEL[zone.kind] ?? zone.kind}
        {zone.note ? ` · ${zone.note}` : ""}
      </div>
      {zone.sources && zone.sources.length > 0 && <div className="zone-sources">{zone.sources.join(" / ")}</div>}
    </div>
  );
}

export function TargetContextCard({ target }: { target: IntradayTargetContext }) {
  return (
    <div className="target-context">
      <div className="target-head">
        <span>{target.label}</span>
        <span>${fmt(target.price)}</span>
      </div>
      {target.zone && <PriceZoneCard zone={target.zone} compact />}
      {target.note && <div className="zone-meta md">{target.note}</div>}
      {target.condition && <div className="zone-meta">条件：{target.condition}</div>}
    </div>
  );
}

export function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="k">{label} DIF/DEA/HIST</div>
      <div className="v left">{value}</div>
    </>
  );
}
