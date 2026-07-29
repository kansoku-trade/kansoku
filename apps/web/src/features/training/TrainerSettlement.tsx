import { useEffect, useState } from 'react';
import type {
  TrainerClosedTrade,
  TrainerReveal,
  TrainerResult,
  TrainerView,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { fmt } from '@web/lib/format';
import { getPopoutBridge } from '../desktop/desktopWindowsBridge';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { formatPositionSize, formatRewardRisk } from './orderDraft';
import { unreachedBars } from './replayBands';
import {
  settlementSummary,
  settlementTradeRows,
  settlementTrack,
  trackGeometry,
  type SettlementTrack,
} from './settlementStats';

const TERMINATION_LABEL: Record<TrainerResult['terminationReason'], string> = {
  abstain: '观望，未参与',
  no_decision: '未做出决定',
  cancelled: '挂单被取消',
  no_fill: '挂单未成交',
  stop: '止损离场',
  target: '止盈离场',
  manual: '手动离场',
  horizon: '到期强平',
  no_trade: '本局未交易',
};

const EXIT_REASON_LABEL: Record<TrainerClosedTrade['exitReason'], string> = {
  stop: '止损',
  target: '止盈',
  manual: '手动',
  horizon: '到期',
};

export interface TrainerSettlementProps {
  view: TrainerView;
  bridge: TrainerBridge;
  sessionId: string;
  expanded?: boolean;
  onCollapse?: () => void;
  onEpilogueBarsChange?: (bars: RawBar[] | null) => void;
}

export function TrainerSettlement({
  view,
  bridge,
  sessionId,
  expanded = false,
  onCollapse,
  onEpilogueBarsChange,
}: TrainerSettlementProps) {
  const [reveal, setReveal] = useState<TrainerReveal | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  // On by default: the session is over, so there is nothing left to decide against and the point of
  // a post-mortem is to see what happened next. What the epilogue must never do is enter a
  // statistic — that isolation lives in settlementStats.ts, which never receives these bars.
  const [showEpilogue, setShowEpilogue] = useState(true);

  // Guarded on view.terminal even though this component is only ever mounted from the terminal
  // branch of TrainerChart — reveal() throwing before terminal is a rule this UI must never even
  // attempt to trigger, not just avoid exposing a button for.
  useEffect(() => {
    if (!view.terminal) return;
    let active = true;
    void bridge.reveal({ sessionId }).then((result) => {
      if (!active) return;
      if (result.ok) setReveal(result.data);
      else setRevealError(result.error);
    });
    return () => {
      active = false;
    };
  }, [bridge, sessionId, view.terminal]);

  useEffect(() => {
    onEpilogueBarsChange?.(showEpilogue && reveal ? reveal.epilogue : null);
  }, [showEpilogue, reveal, onEpilogueBarsChange]);

  const summary = settlementSummary(view.result);
  const rows = settlementTradeRows(view.trades);
  const track = settlementTrack(view.trades);
  const missed = unreachedBars(view);
  const sourceSymbol = reveal?.provenance.sourceSymbol ?? null;
  const sourceDate = reveal?.provenance.sourceCutoff.slice(0, 10) ?? null;

  if (expanded) {
    return (
      <div className="trainer-review-bar">
        <span className="num trainer-review-sym">{sourceSymbol ?? view.symbol}</span>
        {sourceDate && <span className="num trainer-review-date">{sourceDate}</span>}
        {track && (
          <>
            <span>
              实际拿到 <span className="num">{fmt(track.gotR)}</span> R
            </span>
            <span>
              计划 <span className="num">{formatRewardRisk(track.plannedR)}</span> R
            </span>
          </>
        )}
        <TrainerBandLegend />
        <EpilogueToggle checked={showEpilogue} disabled={!reveal} onChange={setShowEpilogue} />
        <button className="btn trainer-review-collapse" onClick={onCollapse}>
          收起 ⤡
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="trainer-settle-stage">
        <div className="trainer-reveal">
          <span className="trainer-reveal-key">真身</span>
          {sourceSymbol ? (
            <>
              <span className="num trainer-reveal-sym">{sourceSymbol}</span>
              <span className="num trainer-reveal-date">{sourceDate}</span>
              <OpenRealChartButton symbol={sourceSymbol} />
            </>
          ) : revealError ? (
            <span className="trainer-order-error">{revealError}</span>
          ) : (
            <span className="trainer-order-panel--status">正在揭晓真身…</span>
          )}
        </div>

        <div className="trainer-settlement-stats" data-testid="trainer-settlement-stats">
          {track ? (
            <>
              <PlanTrack track={track} summary={summary} />
              <TrainerFigures track={track} summary={summary} />
            </>
          ) : (
            <div className="trainer-order-panel--status">
              {summary ? TERMINATION_LABEL[summary.terminationReason] : '本局没有成交记录'}
            </div>
          )}
        </div>
      </div>

      <div className="trainer-settle-tail">
        {rows.length > 0 && (
          <table className="trainer-trade-table" data-testid="trainer-settlement-trades">
            <thead>
              <tr>
                <th>方向</th>
                <th>入场</th>
                <th>离场</th>
                <th className="r">计划盈亏比</th>
                <th className="r">实际拿到 R</th>
                <th className="r">最大浮盈回吐</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tradeId}>
                  <td>
                    <span className="badge badge--muted">
                      {row.direction === 'long' ? '多' : '空'}
                    </span>
                  </td>
                  <td>
                    <ul className="trainer-fill-list">
                      {row.entries.map((fill, index) => (
                        <FillLine
                          key={index}
                          price={fill.price}
                          size={fill.size}
                          label={index === 0 ? '建仓' : '加仓'}
                        />
                      ))}
                    </ul>
                  </td>
                  <td>
                    <ul className="trainer-fill-list">
                      {row.exits.map((fill, index) => (
                        <FillLine
                          key={index}
                          price={fill.price}
                          size={fill.size}
                          label={EXIT_REASON_LABEL[fill.reason]}
                          stop={fill.reason === 'stop'}
                        />
                      ))}
                    </ul>
                  </td>
                  <td className="r num">
                    {row.plannedRewardRisk === null
                      ? '—'
                      : `${formatRewardRisk(row.plannedRewardRisk)} : 1`}
                  </td>
                  <td className="r num">{fmt(row.netR)}</td>
                  <td className="r num">{fmt(row.mfeGivebackR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="trainer-settle-foot">
          <EpilogueToggle
            checked={showEpilogue}
            disabled={!reveal}
            onChange={setShowEpilogue}
            hint
          />
          {missed > 0 && (
            <span className="trainer-settle-hint">
              本局提前结束，案例还剩 {missed} 根没走到，图上没有它们
            </span>
          )}
          <div className="trainer-ghost-slots">
            <span>AI 对照与教训沉淀在「复盘」页签</span>
          </div>
        </div>
      </div>
    </>
  );
}

function EpilogueToggle({
  checked,
  disabled,
  onChange,
  hint = false,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  hint?: boolean;
}) {
  return (
    <label className="trainer-settlement-epilogue-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      显示收盘后走势
      {hint && <span className="trainer-settle-hint">（尾声段，不计入成绩，只用于看结构）</span>}
    </label>
  );
}

function FillLine({
  price,
  size,
  label,
  stop = false,
}: {
  price: number;
  size: number;
  label: string;
  stop?: boolean;
}) {
  return (
    <li className="trainer-fill">
      <span className="num trainer-fill-price">{fmt(price)}</span>
      <span className={`trainer-fill-tag${stop ? ' trainer-tag--stop' : ''}`}>{label}</span>
      <span className="num trainer-fill-size">{formatPositionSize(size)}</span>
    </li>
  );
}

function OpenRealChartButton({ symbol }: { symbol: string }) {
  const bridge = getPopoutBridge();
  if (!bridge) return null;
  return (
    <button className="btn trainer-reveal-jump" onClick={() => void bridge.openPopout(symbol)}>
      在行情页打开真图 →
    </button>
  );
}

interface TrackProps {
  track: SettlementTrack;
  summary: ReturnType<typeof settlementSummary>;
}

function PlanTrack({ track, summary }: TrackProps) {
  const geom = trackGeometry(track);
  const caption = trackCaption(track, summary);
  return (
    <div className="trainer-leak">
      <div className="trainer-leak-head">
        <h2>计划拿到多少，实际拿到多少</h2>
        <em>这一局的差距就是这条轨</em>
      </div>
      <div className="trainer-track">
        <div className="trainer-track-plan" />
        <div
          className={`trainer-track-got${geom.gotNegative ? ' trainer-track-got--loss' : ''}`}
          style={{ width: `${geom.gotPct}%` }}
        />
        <div
          className="trainer-track-give"
          style={{ left: `${geom.giveLeftPct}%`, width: `${geom.givePct}%` }}
        />
        <div className="trainer-track-zero" />
        <div className="trainer-track-caption">{caption}</div>
      </div>
      <div className="trainer-track-scale">
        <span className="num">0R</span>
        <span className="num">计划上限 {formatRewardRisk(track.plannedR)}R</span>
      </div>
    </div>
  );
}

function trackCaption(track: SettlementTrack, summary: TrackProps['summary']): string {
  const ending = summary ? TERMINATION_LABEL[summary.terminationReason] : '本局结束';
  const plan = `计划 ${formatRewardRisk(track.plannedR)}R 的空间`;
  if (track.gotR < 0) return `${plan}，最后倒亏 ${fmt(Math.abs(track.gotR))}R —— ${ending}`;
  if (track.gotR === 0) return `${plan}，一分没拿到 —— ${ending}`;
  if (track.givebackR > 0) {
    return `${plan}，拿到 ${fmt(track.gotR)}R，浮盈里回吐了 ${fmt(track.givebackR)}R —— ${ending}`;
  }
  return `${plan}，拿到 ${fmt(track.gotR)}R —— ${ending}`;
}

function TrainerFigures({ track, summary }: TrackProps) {
  const single = track.tradeCount === 1;
  const perTrade = single ? track.plannedR : track.plannedR / track.tradeCount;
  return (
    <div className="trainer-figures">
      <figure className="trainer-fig">
        <figcaption>计划盈亏比</figcaption>
        <div className="num trainer-fig-val">
          {formatRewardRisk(perTrade)}
          <span className="trainer-fig-unit"> : 1</span>
        </div>
        <div className="trainer-fig-sub">
          {single
            ? '按首次成交价计'
            : `${track.tradeCount} 笔平均，合计 ${formatRewardRisk(track.plannedR)}R`}
        </div>
      </figure>
      <figure className="trainer-fig">
        <figcaption>实际拿到</figcaption>
        <div
          className={`num trainer-fig-val${track.gotR === 0 ? ' trainer-fig-val--zero' : ''}${track.gotR < 0 ? ' down' : ''}`}
        >
          {fmt(track.gotR)}
          <span className="trainer-fig-unit"> R</span>
        </div>
        <div className="trainer-fig-sub">
          {summary
            ? `${TERMINATION_LABEL[summary.terminationReason]} · ${summary.winCount} 胜 ${summary.lossCount} 负`
            : ''}
        </div>
      </figure>
      <figure className="trainer-fig">
        <figcaption>最大浮盈回吐</figcaption>
        <div
          className={`num trainer-fig-val${track.givebackR === 0 ? ' trainer-fig-val--zero' : ''}`}
        >
          {fmt(track.givebackR)}
          <span className="trainer-fig-unit"> R</span>
        </div>
        <div className="trainer-fig-sub">
          {track.givebackR === 0 ? '没有浮盈被还回去' : '这些是曾经浮出来又还回去的'}
        </div>
      </figure>
    </div>
  );
}

export function TrainerBandLegend() {
  return (
    <div className="trainer-band-legend">
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--given" />
        开局给的历史
      </span>
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--played" />
        打过的段
      </span>
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--epilogue" />
        尾声段
      </span>
    </div>
  );
}
