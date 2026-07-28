import { useMemo, useState } from 'react';
import type { TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { IntradayChartOnly } from '../charts/intraday/IntradayChartOnly';
import { tfDataOf, tfLabel, type ChartTf } from '../charts/intraday/timeframes';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { getShellRpc } from '../desktop/shellRpc';
import {
  buildTrainerIntradayBuilt,
  isTrainerLadderTf,
  TRAINER_PERIOD_TO_CHART_TF,
  trainerAdvancePeriod,
} from './payloadToIntradayBuilt';
import { remainingBarsAt } from './remainingBars';
import { replayBands, replayDivider } from './replayBands';
import { TrainerOverlayLayer, TrainerOverlayProvider } from './trainerOverlay';
import { TrainerAdvanceControls } from './TrainerAdvanceControls';
import { TrainerDrawingTools } from './TrainerDrawingTools';
import { TrainerOrderPanel } from './TrainerOrderPanel';
import { TrainerPeriodSwitch } from './TrainerPeriodSwitch';
import { TrainerBandLegend, TrainerSettlement } from './TrainerSettlement';
import { TrainerThumbnail } from './TrainerThumbnail';
import { useTrainerDrawings } from './useTrainerDrawings';
import { useTrainerReviewOverlay } from './useTrainerReviewOverlay';

const STORAGE_NAMESPACE = 'trainer';

export interface TrainerChartProps {
  view: TrainerView;
  sessionId?: string;
  bridge?: TrainerBridge;
  onViewChange?: (view: TrainerView) => void;
}

export function TrainerChart({ view, sessionId, bridge, onViewChange }: TrainerChartProps) {
  const [epilogueBars, setEpilogueBars] = useState<RawBar[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Reset during render (see TrainerOrderPanel's amend-draft reset for the same idiom): the
  // epilogue is revealed post-cursor data for one specific case, so it must never survive into a
  // render for a different case, not even for the one frame an effect-based reset would take.
  const [epilogueCaseId, setEpilogueCaseId] = useState(view.caseId);
  if (epilogueCaseId !== view.caseId) {
    setEpilogueCaseId(view.caseId);
    setEpilogueBars(null);
    setExpanded(false);
  }
  const built = useMemo(() => buildTrainerIntradayBuilt(view, epilogueBars), [view, epilogueBars]);
  const baseTf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
  const [requestedTf, setRequestedTf] = useState<ChartTf>(baseTf);
  const activeTf = isTrainerLadderTf(view.ladder, requestedTf) ? requestedTf : baseTf;
  const [chartHandle, setChartHandle] = useState<DrawingChartHandle | null>(null);
  const isDesktop = getShellRpc() !== null;

  const barTimes = useMemo(
    () => (tfDataOf(built, activeTf)?.candles ?? []).map((candle) => candle.time),
    [built, activeTf],
  );
  const drawings = useTrainerDrawings(view.terminal ? null : chartHandle, barTimes, view.caseId);

  const bands = useMemo(
    () => (view.terminal ? replayBands(view, epilogueBars) : []),
    [view, epilogueBars],
  );
  // Everything left of this line is the case as it was handed over; everything right of it is a bar
  // the trader stepped into. Shown during the episode too, not just at settlement, so they can see
  // which part of the chart they are actually trading.
  const dividers = useMemo(() => {
    const anchor = replayDivider(view);
    return anchor === null ? [] : [{ ...anchor, label: '题目到此 · 从这里开始操作' }];
  }, [view]);
  const overlayTrades = view.terminal ? view.trades : NO_TRADES;
  useTrainerReviewOverlay(chartHandle, overlayTrades, bands, dividers);

  const advancePeriod = trainerAdvancePeriod(view.ladder, activeTf);
  const remaining = remainingBarsAt(view, advancePeriod);

  const settling = view.terminal && bridge != null && sessionId != null && onViewChange != null;
  const shellMode = settling
    ? expanded
      ? ' trainer-shell--review'
      : ' trainer-shell--settle'
    : '';

  return (
    <TrainerOverlayProvider>
      <div className={`trainer-shell${shellMode}`}>
        <IntradayControlsProvider storageNamespace={STORAGE_NAMESPACE}>
          <div className="trainer-header">
            {isDesktop && <div className="popout-traffic-spacer" />}
            <span className="trainer-title">盲盘训练</span>
            {/* Both halves describe the tier actually on screen. Naming the base period while
                quoting a base-bar count made the header read as 5m no matter what was displayed,
                and the count silently meant something else on every other tier. */}
            <span className="trainer-meta">
              {view.symbol} · {tfLabel(activeTf)} ·{' '}
              {view.terminal
                ? '已收盘'
                : `剩余 ${remaining.approximate ? '约 ' : ''}${remaining.count} 根`}
            </span>
            <TrainerPeriodSwitch
              ladder={view.ladder}
              activeTf={activeTf}
              onChange={setRequestedTf}
            />
          </div>
          <div className="trainer-body">
            {settling && !expanded ? (
              <>
                <TrainerThumbnail
                  built={built}
                  activeTf={activeTf}
                  onChartHandle={setChartHandle}
                />
                <button className="trainer-thumb-cover" onClick={() => setExpanded(true)}>
                  <TrainerBandLegend />
                  <span className="trainer-thumb-expand">展开复盘 ⤢</span>
                </button>
              </>
            ) : (
              <IntradayChartOnly
                symbol={view.symbol}
                built={built}
                activeTf={activeTf}
                drawings={false}
                storageNamespace={STORAGE_NAMESPACE}
                onChartHandle={setChartHandle}
              />
            )}
            {!view.terminal && <TrainerOverlayLayer />}
          </div>
        </IntradayControlsProvider>
        {bridge && sessionId && onViewChange && (
          // key remounts these panels (and their draft state) on a new case instead of
          // syncing them with an effect.
          <>
            {view.terminal ? (
              <TrainerSettlement
                key={`settlement-${view.caseId}`}
                view={view}
                bridge={bridge}
                sessionId={sessionId}
                expanded={expanded}
                onCollapse={() => setExpanded(false)}
                onEpilogueBarsChange={setEpilogueBars}
              />
            ) : (
              <>
                <TrainerDrawingTools api={drawings} />
                <TrainerAdvanceControls
                  key={`advance-${view.caseId}`}
                  view={view}
                  period={advancePeriod}
                  bridge={bridge}
                  sessionId={sessionId}
                  onViewChange={onViewChange}
                />
                <TrainerOrderPanel
                  key={`order-${view.caseId}`}
                  view={view}
                  handle={chartHandle}
                  bridge={bridge}
                  sessionId={sessionId}
                  onViewChange={onViewChange}
                  drawingActive={drawings.tool !== 'off'}
                  onTakeChart={() => drawings.setTool('off')}
                />
              </>
            )}
          </>
        )}
      </div>
    </TrainerOverlayProvider>
  );
}

const NO_TRADES: TrainerView['trades'] = [];
