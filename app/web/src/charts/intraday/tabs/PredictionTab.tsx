import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import type { IntradayBuilt, TimeframeKey } from "../../../../../shared/types";
import { fmt, signed } from "../../../format";
import { TF_LABELS } from "../IntradayDashboard";
import { DIRECTION_COLOR, DIRECTION_LABEL } from "../directionLabels";
import { useMinutesAgo } from "../predictionAge";
import { AutoSignalItem, Pattern123Item, PriceZoneCard, TargetContextCard, TechRow } from "./predictionTabParts";
import { theme } from "../../../theme";
import { MarketTime, SectionTitle } from "../../../ui";

const SIGNAL_ICON: Record<string, string> = { pin_bar: "📌", macd_divergence: "⚡", macd_beichi: "🌀" };
const TF_ORDER: TimeframeKey[] = ["m5", "m15", "h1"];

function rrTone(ep: { rr_great: boolean; rr_ok: boolean }): string {
  if (ep.rr_great) return "up";
  return ep.rr_ok ? "" : "down";
}

interface PredictionTabProps {
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
}

export function PredictionTab({ built, activeTf, predictionUpdatedAt, predictionStale }: PredictionTabProps) {
  const minutesAgo = useMinutesAgo(predictionUpdatedAt);
  const s = built.sidebar;
  const p = s.prediction;
  const ep = s.entryPlan;
  const scenarios = (p?.scenarios ?? []).map((sc) => {
    const raw = sc as unknown as Record<string, unknown>;
    const label =
      typeof sc.label === "string" && sc.label
        ? sc.label
        : typeof raw.name === "string"
          ? (raw.name as string)
          : "";
    const probRaw =
      typeof sc.probability === "number" && Number.isFinite(sc.probability)
        ? sc.probability
        : typeof raw.prob === "number" && Number.isFinite(raw.prob as number)
          ? (raw.prob as number)
          : 0;
    const probability = probRaw > 0 && probRaw <= 1 ? probRaw * 100 : probRaw;
    return { ...sc, label, probability };
  });
  const totalProb = scenarios.reduce((acc, sc) => acc + Number(sc.probability || 0), 0);
  const rbp = p?.range_bound_plan;
  const signals = p?.signals ?? [];
  const targetContexts = ep?.target_contexts ?? [];
  const priceZones = (ep?.price_zones ?? []).filter((zone) => zone.kind === "resistance");

  return (
    <>
      {p ? (
        <div className="verdict" style={{ "--vc": DIRECTION_COLOR[p.direction] ?? theme.textSecondary } as CSSProperties}>
          <div className="verdict-label">
            短线方向判断
            {predictionStale ? (
              <span className="stale-badge">
                <TriangleAlert className="icon" size={13} /> 盘中已过期
              </span>
            ) : (
              predictionUpdatedAt && (
                <span className="prediction-age">
                  更新于 <MarketTime value={predictionUpdatedAt} format="clock" includeZone />（{minutesAgo} 分钟前）
                </span>
              )
            )}
          </div>
          <div className="verdict-text">{DIRECTION_LABEL[p.direction] ?? "🤔 观望"}</div>
          {p.anchor && (
            <div className="verdict-reason">
              预测点：{TF_LABELS[p.anchor.timeframe] ?? p.anchor.timeframe} ·{" "}
              <MarketTime value={p.anchor.time} /> · ${fmt(Number(p.anchor.price))}
            </div>
          )}
        </div>
      ) : (
        <div className="verdict" style={{ "--vc": theme.textSecondary } as CSSProperties}>
          <div className="verdict-label">模式</div>
          <div className="verdict-text">👀 预览模式</div>
          <div className="verdict-reason">仅技术面，暂无预测结论——供分析前读数用</div>
        </div>
      )}

      {p && scenarios.length > 0 && (
        <>
          <SectionTitle>
            情景推演
            {Math.abs(totalProb - 100) >= 1 && (
              <span className="warn-red">
                {" "}
                <TriangleAlert className="icon" size={13} /> 概率合计 {fmt(totalProb, 0)}%，未凑够100
              </span>
            )}
          </SectionTitle>
          {scenarios.map((sc, i) => (
            <div key={i} className="zone-item" style={{ "--zc": theme.accent } as CSSProperties}>
              <div className="zone-head">
                <span className="zone-label plain">{sc.label}</span>
                <span className="zone-range accent">{fmt(Number(sc.probability || 0), 0)}%</span>
              </div>
              <div className="zone-meta md">
                {sc.path ?? ""}
                {sc.trigger ? ` · 触发：${sc.trigger}` : ""}
              </div>
            </div>
          ))}
        </>
      )}

      {p && rbp && (
        <>
          <SectionTitle>震荡应对</SectionTitle>
          <div className="zone-meta md" style={{ marginBottom: 6 }}>
            {rbp.condition ?? ""}
          </div>
          <div className="grid2">
            <div className="k">若做多</div>
            <div className="v left">{rbp.long_tactic ?? ""}</div>
            <div className="k">若做空</div>
            <div className="v left">{rbp.short_tactic ?? ""}</div>
          </div>
        </>
      )}

      {p && ep && (
        <>
          <SectionTitle>入场计划</SectionTitle>
          {ep.entry_status_note && (
            <div className={`note-block${ep.entry_status === "invalidated" || ep.entry_status === "stopped" ? " down" : ""}`}>
              {ep.entry_status_note}
            </div>
          )}
          <div className="grid2">
            <div className="k">入场</div>
            <div className="v">${fmt(ep.entry)}</div>
            <div className="k">止损</div>
            <div className="v down">${fmt(ep.stop)}</div>
            <div className="k">目标1 ({signed(ep.target1_pct, 1)}%)</div>
            <div className="v up">${fmt(ep.target1)}</div>
            <div className="k">目标2 ({signed(ep.target2_pct, 1)}%)</div>
            <div className="v up">${fmt(ep.target2)}</div>
            <div className="k">R/R</div>
            <div className={`v ${rrTone(ep)}`}>
              {fmt(ep.rr)} : 1
              {!ep.rr_ok && (
                <span className="warn-red">
                  {" "}
                  <TriangleAlert className="icon" size={13} /> &lt;2:1
                </span>
              )}
            </div>
          </div>
          {(ep.rationale || ep.stop_note) && (
            <div className="plan-explain">
              {ep.rationale && (
                <>
                  <div className="section-subtitle">入场理由</div>
                  <div className="note-block strong">{ep.rationale}</div>
                </>
              )}
              {ep.stop_note && (
                <>
                  <div className="section-subtitle">止损理由</div>
                  <div className="note-block">{ep.stop_note}</div>
                </>
              )}
            </div>
          )}
          {targetContexts.length > 0 && (
            <>
              <div className="section-subtitle">目标依据</div>
              {targetContexts.map((target) => (
                <TargetContextCard key={target.key} target={target} />
              ))}
            </>
          )}
          {priceZones.length > 0 && (
            <>
              <div className="section-subtitle">关键区间</div>
              {priceZones.map((zone, i) => (
                <PriceZoneCard key={`${zone.kind}-${zone.label}-${i}`} zone={zone} compact />
              ))}
            </>
          )}
          {ep.note && <div className="note-block">{ep.note}</div>}
        </>
      )}

      {p && signals.length > 0 && (
        <>
          <SectionTitle>关键标注</SectionTitle>
          {signals.map((sig, i) => (
            <div key={i} className="check-item signal">
              <div className="check-icon">{SIGNAL_ICON[sig.type ?? sig.kind ?? "other"] ?? "•"}</div>
              <div>
                <div className="check-label">{sig.label ?? ""}</div>
                <div className="check-val">
                  {TF_LABELS[sig.timeframe] ?? sig.timeframe}
                  {sig.price != null ? ` · $${fmt(sig.price)}` : ""}
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
          ...(tfData?.autoDivergence ?? []).map((d) => ({ kindKey: `divergence-${d.kind}`, pair: d })),
          ...(tfData?.autoBeichi ?? []).map((d) => ({ kindKey: `beichi-${d.kind}`, pair: d })),
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
            <div className="note-block">简化算法自动检测（基于已确认摆动点），仅供参考，不构成买卖依据</div>
          </>
        );
      })()}

      {!p && (
        <>
          <SectionTitle>技术面摘要</SectionTitle>
          <div className="grid2">
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
