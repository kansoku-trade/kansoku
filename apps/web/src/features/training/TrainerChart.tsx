import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
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
import { TrainerCoachPanel } from './TrainerCoachPanel';
import { TrainerDrawingTools } from './TrainerDrawingTools';
import { TrainerReview } from './TrainerReview';
import { TrainerOrderPanel } from './TrainerOrderPanel';
import { TrainerPeriodSwitch } from './TrainerPeriodSwitch';
import { TrainerBandLegend, TrainerSettlement } from './TrainerSettlement';
import { TrainerThumbnail } from './TrainerThumbnail';
import { useTrainerDrawings } from './useTrainerDrawings';
import { useTrainerReviewOverlay } from './useTrainerReviewOverlay';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const STORAGE_NAMESPACE = 'trainer';

const styles = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  scrollableShell: {
    overflowY: 'auto',
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flexShrink: 0,
    gap: '10px',
    padding: '8px 12px',
    userSelect: 'none',
    WebkitAppRegion: 'drag',
  },
  headerContext: {
    ':not(#\\#) .chart-timeframe-switch': {
      marginLeft: 'auto',
      WebkitAppRegion: 'no-drag',
    },
  },
  trafficSpacer: {
    flex: '0 0 66px',
  },
  stickyHeader: {
    order: 0,
    position: 'sticky',
    top: 0,
    zIndex: 20,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
  },
  body: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  bodyContext: {
    ':not(#\\#) .charts-col': {
      borderRightStyle: 'none',
      borderRightWidth: 0,
      height: '100%',
    },
  },
  settledBody: {
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    flex: '0 0 118px',
    margin: '0 16px',
    order: 2,
  },
  laneRow: {
    alignItems: 'stretch',
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    display: 'flex',
    flex: '0 0 auto',
    height: '38px',
  },
  tabs: {
    WebkitAppRegion: 'no-drag',
    display: 'flex',
    gap: '4px',
    marginLeft: 'auto',
  },
  tab: {
    backgroundColor: 'transparent',
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textSecondary,
    cursor: 'pointer',
    font: 'inherit',
    fontSize: fontSizes.sm,
    padding: '3px 10px',
  },
  tabOn: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  thumbCover: {
    'alignItems': 'flex-start',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'flex',
    'font': 'inherit',
    'inset': 0,
    'position': 'absolute',
    'zIndex': 12,
    ':hover': {
      backgroundColor: 'rgb(232 232 232 / 0.03)',
    },
  },
  thumbExpand: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgb(10 10 10 / 0.86)',
    borderColor: colors.borderStrong,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    padding: '3px 9px',
  },
});

type TrainerTab = 'settlement' | 'review';

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
  const [tab, setTab] = useState<TrainerTab>('settlement');
  const reviewing = settling && tab === 'review';
  const shellMode = reviewing
    ? ' trainer-shell--postmortem'
    : settling
      ? expanded
        ? ' trainer-shell--review'
        : ' trainer-shell--settle'
      : '';

  return (
    <TrainerOverlayProvider>
      <div
        className={`trainer-shell${shellMode} ${stylex.props(styles.shell, settling && styles.scrollableShell).className}`}
      >
        <IntradayControlsProvider storageNamespace={STORAGE_NAMESPACE}>
          <div
            className={`trainer-header ${stylex.props(styles.header, styles.headerContext, settling && styles.stickyHeader).className}`}
          >
            {isDesktop && (
              <div
                className={`popout-traffic-spacer ${stylex.props(styles.trafficSpacer).className}`}
              />
            )}
            <span className={`trainer-title ${stylex.props(styles.title).className}`}>
              盲盘训练
            </span>
            {/* Both halves describe the tier actually on screen. Naming the base period while
                quoting a base-bar count made the header read as 5m no matter what was displayed,
                and the count silently meant something else on every other tier. */}
            <span className={`trainer-meta ${stylex.props(styles.meta).className}`}>
              {view.symbol} · {tfLabel(activeTf)} ·{' '}
              {view.terminal
                ? '已收盘'
                : `剩余 ${remaining.approximate ? '约 ' : ''}${remaining.count} 根`}
            </span>
            {settling ? (
              <div className={`trainer-tabs ${stylex.props(styles.tabs).className}`}>
                <button
                  className={`trainer-tab${tab === 'settlement' ? ' trainer-tab--on' : ''} ${stylex.props(styles.tab, tab === 'settlement' && styles.tabOn).className}`}
                  onClick={() => setTab('settlement')}
                >
                  本局结算
                </button>
                <button
                  className={`trainer-tab${tab === 'review' ? ' trainer-tab--on' : ''} ${stylex.props(styles.tab, tab === 'review' && styles.tabOn).className}`}
                  onClick={() => setTab('review')}
                >
                  复盘
                </button>
              </div>
            ) : (
              <TrainerPeriodSwitch
                ladder={view.ladder}
                activeTf={activeTf}
                onChange={setRequestedTf}
              />
            )}
          </div>
          <div
            className={`trainer-body ${stylex.props(styles.body, styles.bodyContext, settling && !reviewing && styles.settledBody).className}`}
            hidden={reviewing}
          >
            {settling && !expanded ? (
              <>
                <TrainerThumbnail
                  built={built}
                  activeTf={activeTf}
                  onChartHandle={setChartHandle}
                />
                <button
                  className={`trainer-thumb-cover ${stylex.props(styles.thumbCover).className}`}
                  onClick={() => setExpanded(true)}
                >
                  <TrainerBandLegend />
                  <span
                    className={`trainer-thumb-expand ${stylex.props(styles.thumbExpand).className}`}
                  >
                    展开复盘 ⤢
                  </span>
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
            {/* The review tab is a sibling of the play chart rather than a replacement for it:
                unmounting that chart would tear down lightweight-charts and rebuild it on every
                switch back. */}
            {reviewing ? (
              <TrainerReview bridge={bridge} sessionId={sessionId} />
            ) : view.terminal ? (
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
                {/* One row, not two. The order panel renders exactly one inline element per
                    state — every other thing it draws goes through the overlay — so wrapping it
                    here puts the coach button on the end of whichever lane is showing without
                    each of those states having to remember to carry it. */}
                <div className={`trainer-lane-row ${stylex.props(styles.laneRow).className}`}>
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
                  <TrainerCoachPanel
                    key={`coach-${view.caseId}`}
                    bridge={bridge}
                    sessionId={sessionId}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </TrainerOverlayProvider>
  );
}

const NO_TRADES: TrainerView['trades'] = [];
