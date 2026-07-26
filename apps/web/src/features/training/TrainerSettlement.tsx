import { useEffect, useState } from 'react';
import type {
  TrainerClosedTrade,
  TrainerReveal,
  TrainerResult,
  TrainerView,
} from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { formatRewardRisk } from './orderDraft';
import { settlementSummary, settlementTradeRows } from './settlementStats';

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
  onEpilogueBarsChange?: (bars: RawBar[] | null) => void;
}

export function TrainerSettlement({
  view,
  bridge,
  sessionId,
  onEpilogueBarsChange,
}: TrainerSettlementProps) {
  const [reveal, setReveal] = useState<TrainerReveal | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [showEpilogue, setShowEpilogue] = useState(false);

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

  return (
    <div className="trainer-settlement">
      <div className="trainer-settlement-row">
        {reveal ? (
          <span>
            真实代号 {reveal.provenance.sourceSymbol} · 真实日期{' '}
            {reveal.provenance.sourceCutoff.slice(0, 10)}
          </span>
        ) : revealError ? (
          <span className="trainer-order-error">{revealError}</span>
        ) : (
          <span className="trainer-order-panel--status">正在揭晓真身…</span>
        )}
      </div>
      <div className="trainer-settlement-stats" data-testid="trainer-settlement-stats">
        {summary && (
          <div className="trainer-settlement-row">
            {TERMINATION_LABEL[summary.terminationReason]} · 净 R {summary.netR.toFixed(2)} · 共{' '}
            {summary.tradeCount} 笔（{summary.winCount} 胜 {summary.lossCount} 负）
          </div>
        )}
        {rows.length === 0 ? (
          <div className="trainer-order-panel--status">本局没有成交记录</div>
        ) : (
          rows.map((row) => (
            <div className="trainer-settlement-row trainer-settlement-trade" key={row.tradeId}>
              <span>
                {row.direction === 'long' ? '多' : '空'} @{row.entryPrice} → {row.exitPrice}（
                {EXIT_REASON_LABEL[row.exitReason]}）
              </span>
              <span>
                计划盈亏比{' '}
                {row.plannedRewardRisk === null
                  ? '—'
                  : `${formatRewardRisk(row.plannedRewardRisk)} : 1`}
              </span>
              <span>净 R（实际拿到）{row.netR.toFixed(2)}</span>
              <span>最大浮盈回吐 {row.mfeGivebackR.toFixed(2)} R</span>
            </div>
          ))
        )}
      </div>
      <label className="trainer-settlement-row trainer-settlement-epilogue-toggle">
        <input
          type="checkbox"
          checked={showEpilogue}
          disabled={!reveal}
          onChange={(e) => setShowEpilogue(e.target.checked)}
        />
        显示收盘后走势（尾声段，不计入成绩，只用于看结构）
      </label>
    </div>
  );
}
