import type { CSSProperties } from "react";
import { AUTO_SIGNAL_META, type DivergencePair, type IntradayBuilt, type TimeframeKey } from "../../../../shared/types";
import { fmt, signed, upDown } from "../../format";
import { NewsSection } from "../NewsSection";
import { TF_LABELS } from "./IntradayDashboard";

const DIRECTION_LABEL: Record<string, string> = { long: "📈 做多", short: "📉 做空", neutral: "🤔 观望" };
const DIRECTION_COLOR: Record<string, string> = { long: "#26a69a", short: "#ef5350", neutral: "#8b949e" };
const SIGNAL_ICON: Record<string, string> = { pin_bar: "📌", macd_divergence: "⚡", macd_beichi: "🌀" };
const TF_ORDER: TimeframeKey[] = ["m5", "m15", "h1"];

const barTime = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");

function predictionAgeText(updatedAt: string): string {
  const updated = new Date(updatedAt);
  const hh = String(updated.getHours()).padStart(2, "0");
  const mm = String(updated.getMinutes()).padStart(2, "0");
  const minutesAgo = Math.max(0, Math.floor((Date.now() - updated.getTime()) / 60_000));
  return `更新于 ${hh}:${mm}（${minutesAgo} 分钟前）`;
}

function AutoSignalItem({ kindKey, pair }: { kindKey: string; pair: DivergencePair }) {
  const meta = AUTO_SIGNAL_META[kindKey];
  if (!meta) return null;
  return (
    <div className="check-item signal">
      <div className="check-icon">{meta.icon}</div>
      <div>
        <div className="check-label">{meta.title}</div>
        <div className="check-val">
          {barTime(pair.a.time)} ${fmt(pair.a.price)} → {barTime(pair.b.time)} ${fmt(pair.b.price)}
        </div>
        <div className="check-val">{meta.impact}</div>
      </div>
    </div>
  );
}

interface IntradaySidebarProps {
  built: IntradayBuilt;
  activeTf: TimeframeKey;
  predictionUpdatedAt?: string;
  predictionStale?: boolean;
}

export function IntradaySidebar({ built, activeTf, predictionUpdatedAt, predictionStale }: IntradaySidebarProps) {
  const s = built.sidebar;
  const p = s.prediction;
  const ep = s.entryPlan;
  const scenarios = p?.scenarios ?? [];
  const totalProb = scenarios.reduce((acc, sc) => acc + Number(sc.probability || 0), 0);
  const rbp = p?.range_bound_plan;
  const signals = p?.signals ?? [];

  return (
    <div className="sidebar">
      <div className="header">
        <div className="symbol">{s.symbol}</div>
        <div className="name">{s.name}</div>
        <div className="price">${fmt(s.last)}</div>
        <div className="price-date">{s.asOf} · 长桥证券</div>
      </div>

      {p ? (
        <div className="verdict" style={{ "--vc": DIRECTION_COLOR[p.direction] ?? "#8b949e" } as CSSProperties}>
          <div className="verdict-label">
            短线方向判断
            {predictionStale ? (
              <span className="stale-badge">⚠ 盘中已过期</span>
            ) : (
              predictionUpdatedAt && <span className="prediction-age">{predictionAgeText(predictionUpdatedAt)}</span>
            )}
          </div>
          <div className="verdict-text">{DIRECTION_LABEL[p.direction] ?? "🤔 观望"}</div>
          {p.anchor && (
            <div className="verdict-reason">
              预测点：{TF_LABELS[p.anchor.timeframe] ?? p.anchor.timeframe} ·{" "}
              {String(p.anchor.time).slice(0, 16).replace("T", " ")} · ${fmt(Number(p.anchor.price))}
            </div>
          )}
        </div>
      ) : (
        <div className="verdict" style={{ "--vc": "#8b949e" } as CSSProperties}>
          <div className="verdict-label">模式</div>
          <div className="verdict-text">👀 预览模式</div>
          <div className="verdict-reason">仅技术面，暂无预测结论——供分析前读数用</div>
        </div>
      )}

      {p && scenarios.length > 0 && (
        <>
          <div className="section-title">
            情景推演
            {Math.abs(totalProb - 100) >= 1 && <span className="warn-red"> ⚠ 概率合计 {fmt(totalProb, 0)}%，未凑够100</span>}
          </div>
          {scenarios.map((sc, i) => (
            <div key={i} className="zone-item" style={{ "--zc": "#58a6ff" } as CSSProperties}>
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
          <div className="section-title">震荡应对</div>
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
          <div className="section-title">入场计划</div>
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
            <div className={`v ${ep.rr_great ? "up" : ep.rr_ok ? "" : "down"}`}>
              {fmt(ep.rr)} : 1{!ep.rr_ok && <span className="warn-red"> ⚠ &lt;2:1</span>}
            </div>
          </div>
          {ep.note && <div className="note-block">{ep.note}</div>}
        </>
      )}

      {p && signals.length > 0 && (
        <>
          <div className="section-title">支撑信号</div>
          {signals.map((sig, i) => (
            <div key={i} className="check-item signal">
              <div className="check-icon">{SIGNAL_ICON[sig.type] ?? "•"}</div>
              <div>
                <div className="check-label">{sig.label ?? ""}</div>
                <div className="check-val">{TF_LABELS[sig.timeframe] ?? sig.timeframe}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {(() => {
        const tfData = built.timeframes[activeTf];
        const autoItems = [
          ...(tfData?.autoDivergence ?? []).map((d) => ({ kindKey: `divergence-${d.kind}`, pair: d })),
          ...(tfData?.autoBeichi ?? []).map((d) => ({ kindKey: `beichi-${d.kind}`, pair: d })),
        ];
        if (!autoItems.length) return null;
        return (
          <>
            <div className="section-title">自动信号 · {TF_LABELS[activeTf]}</div>
            {autoItems.map((it, i) => (
              <AutoSignalItem key={i} kindKey={it.kindKey} pair={it.pair} />
            ))}
            <div className="note-block">简化算法自动检测（仅比较相邻确认摆动点），仅供参考，不构成买卖依据</div>
          </>
        );
      })()}

      {!p && (
        <>
          <div className="section-title">技术面摘要</div>
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

      {s.position && (
        <>
          <div className="section-title">持仓视角</div>
          <div className="grid2">
            <div className="k">持仓</div>
            <div className="v">{s.position.shares} sh</div>
            <div className="k">成本</div>
            <div className="v">${fmt(s.position.cost)}</div>
            <div className="k">浮{s.position.unrealized >= 0 ? "盈" : "亏"}</div>
            <div className={`v ${upDown(s.position.unrealized)}`}>
              {signed(s.position.unrealized)} ({signed(s.position.unrealizedPct)}%)
            </div>
          </div>
        </>
      )}

      <NewsSection news={s.news ?? []} />

      <div className="disclaimer">
        ⚠️ 仅供学习参考，不构成投资建议。数据来源：长桥证券。
        <br />
        方向判断、情景推演、入场计划、Pin Bar/MACD 背离标注均为 AI 分析结论；MACD 数值本身由脚本计算。
      </div>
    </div>
  );
}

function TechRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="k">{label} DIF/DEA/HIST</div>
      <div className="v left">{value}</div>
    </>
  );
}
