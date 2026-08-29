import { useEffect, useMemo, useState } from 'react';
import type { TrainerCoachCall, TrainerLesson, TrainerReviewPayload } from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { IntradayControlsProvider } from '../charts/intraday/controlsContext';
import { IntradayChartOnly } from '../charts/intraday/IntradayChartOnly';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { getPopoutBridge } from '../desktop/desktopWindowsBridge';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import { TRAINER_CASE_TAG_LABEL } from './caseTagLabels';
import {
  buildReviewBuilt,
  reviewBands,
  reviewChartTf,
  reviewMaxBrush,
  reviewTrades,
} from './reviewChart';
import { TrainerCoachCompare } from './TrainerCoachCompare';
import { TrainerReviewFacts } from './TrainerReviewFacts';
import { TrainerReviewLesson } from './TrainerReviewLesson';
import { TrainerReviewTimeline } from './TrainerReviewTimeline';
import { useTrainerReviewOverlay } from './useTrainerReviewOverlay';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const STORAGE_NAMESPACE = 'trainer-review';

const styles = stylex.create({
  root: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '14px',
    padding: '14px 16px',
  },
  reveal: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  revealKey: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  revealSymbol: {
    fontSize: fontSizes.xl,
    fontWeight: 700,
  },
  revealDate: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
  },
  revealJump: {
    'borderColor': colors.borderStrong,
    'color': colors.accent,
    'marginLeft': 'auto',
    ':hover:not(:disabled)': {
      borderColor: colors.accent,
    },
  },
  stage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  chart: {
    borderColor: colors.border,
    borderStyle: 'solid',
    borderWidth: '1px',
    height: '320px',
  },
  legendRow: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    justifyContent: 'space-between',
  },
  bandLegend: {
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.xs,
    gap: '12px',
  },
  bandSwatch: {
    display: 'inline-block',
    height: '8px',
    marginRight: '4px',
    verticalAlign: '-1px',
    width: '8px',
  },
  bandSwatchGiven: {
    backgroundColor: '#161616',
  },
  bandSwatchPlayed: {
    backgroundColor: '#14211f',
  },
  bandSwatchFog: {
    backgroundColor: '#202020',
  },
  bandSwatchEpilogue: {
    backgroundColor: '#241a10',
  },
  epilogueToggle: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '6px',
  },
  epilogueInput: {
    accentColor: colors.accent,
  },
  settleHint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
  },
  status: {
    color: colors.textSecondary,
  },
  error: {
    color: colors.down,
    fontSize: fontSizes.sm,
  },
});

export interface TrainerReviewProps {
  bridge: TrainerBridge;
  sessionId: string;
}

export function TrainerReview({ bridge, sessionId }: TrainerReviewProps) {
  const [payload, setPayload] = useState<TrainerReviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void bridge.review({ sessionId }).then((result) => {
      if (!active) return;
      if (result.ok) setPayload(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [bridge, sessionId]);

  if (error)
    return (
      <div className={`trainer-order-error ${stylex.props(styles.error).className}`}>{error}</div>
    );
  if (!payload)
    return (
      <div className={`trainer-order-panel--status ${stylex.props(styles.status).className}`}>
        正在整理这一局…
      </div>
    );
  return (
    <ReviewBody
      key={payload.sessionId}
      payload={payload}
      bridge={bridge}
      sessionId={sessionId}
      onPayloadChange={setPayload}
    />
  );
}

interface ReviewBodyProps {
  payload: TrainerReviewPayload;
  bridge: TrainerBridge;
  sessionId: string;
  onPayloadChange: (payload: TrainerReviewPayload) => void;
}

function ReviewBody({ payload, bridge, sessionId, onPayloadChange }: ReviewBodyProps) {
  const max = reviewMaxBrush(payload);
  // Parked at the end so the whole case is on screen at once — the played run, the stretch never
  // reached, and the epilogue. Dragging left is what rewinds it.
  const [brush, setBrush] = useState(max);
  const [showEpilogue, setShowEpilogue] = useState(true);
  const [handle, setHandle] = useState<DrawingChartHandle | null>(null);

  const built = useMemo(
    () => buildReviewBuilt(payload, brush, showEpilogue),
    [payload, brush, showEpilogue],
  );
  const bands = useMemo(
    () => reviewBands(payload, brush, showEpilogue),
    [payload, brush, showEpilogue],
  );
  const trades = useMemo(() => reviewTrades(payload, brush), [payload, brush]);
  useTrainerReviewOverlay(handle, trades, bands);

  const seekToCoach = (coachId: string): void => {
    const at = payload.coach.find((call) => call.id === coachId)?.cursor;
    if (at !== undefined && at >= 0) setBrush(Math.min(at, max));
  };

  const replaceCall = (updated: TrainerCoachCall): void => {
    onPayloadChange({
      ...payload,
      coach: payload.coach.map((call) => (call.id === updated.id ? updated : call)),
    });
  };

  const replaceLesson = (lesson: TrainerLesson): void => {
    onPayloadChange({ ...payload, lesson });
  };

  return (
    <div
      className={`trainer-review ${stylex.props(styles.root).className}`}
      data-testid="trainer-review"
    >
      <section className={`trainer-review-reveal ${stylex.props(styles.reveal).className}`}>
        <span className={`trainer-reveal-key ${stylex.props(styles.revealKey).className}`}>
          真身
        </span>
        <span className={`num trainer-reveal-sym ${stylex.props(styles.revealSymbol).className}`}>
          {payload.provenance.sourceSymbol}
        </span>
        <span className={`num trainer-reveal-date ${stylex.props(styles.revealDate).className}`}>
          {payload.provenance.sourceCutoff.slice(0, 10)}
        </span>
        <span className="trainer-chip">
          标签：{payload.tag ? TRAINER_CASE_TAG_LABEL[payload.tag] : '未标注'}
        </span>
        <OpenRealChartButton symbol={payload.provenance.sourceSymbol} />
      </section>

      <section className={`trainer-review-stage ${stylex.props(styles.stage).className}`}>
        <IntradayControlsProvider storageNamespace={STORAGE_NAMESPACE}>
          <div className={`trainer-review-chart ${stylex.props(styles.chart).className}`}>
            <IntradayChartOnly
              symbol={payload.symbol}
              built={built}
              activeTf={reviewChartTf(payload)}
              drawings={false}
              storageNamespace={STORAGE_NAMESPACE}
              onChartHandle={setHandle}
            />
          </div>
        </IntradayControlsProvider>
        <TrainerReviewTimeline
          max={max}
          brush={brush}
          playedThrough={payload.playedThrough}
          events={payload.events}
          onBrush={setBrush}
        />
        <div className={`trainer-review-legend-row ${stylex.props(styles.legendRow).className}`}>
          <ReviewLegend />
          <label
            className={`trainer-settlement-epilogue-toggle ${stylex.props(styles.epilogueToggle).className}`}
          >
            <input
              className={stylex.props(styles.epilogueInput).className}
              type="checkbox"
              checked={showEpilogue}
              disabled={brush < max || payload.epilogue.length === 0}
              onChange={(e) => setShowEpilogue(e.target.checked)}
            />
            显示收盘后走势
            <span className={`trainer-settle-hint ${stylex.props(styles.settleHint).className}`}>
              （尾声段，不计入成绩，只用于看结构）
            </span>
          </label>
        </div>
      </section>

      <TrainerReviewFacts facts={payload.facts} />

      <TrainerCoachCompare
        calls={payload.coach}
        bridge={bridge}
        sessionId={sessionId}
        onAnnotated={replaceCall}
        onSeek={seekToCoach}
      />

      <TrainerReviewLesson
        lesson={payload.lesson}
        bridge={bridge}
        sessionId={sessionId}
        onChange={replaceLesson}
      />
    </div>
  );
}

function ReviewLegend() {
  return (
    <div className={`trainer-band-legend ${stylex.props(styles.bandLegend).className}`}>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--given ${stylex.props(styles.bandSwatch, styles.bandSwatchGiven).className}`}
        />
        开局给的历史
      </span>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--played ${stylex.props(styles.bandSwatch, styles.bandSwatchPlayed).className}`}
        />
        你打过的段
      </span>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--fog ${stylex.props(styles.bandSwatch, styles.bandSwatchFog).className}`}
        />
        被雾遮住的段
      </span>
      <span>
        <i
          className={`trainer-band-swatch trainer-band-swatch--epilogue ${stylex.props(styles.bandSwatch, styles.bandSwatchEpilogue).className}`}
        />
        尾声段
      </span>
    </div>
  );
}

function OpenRealChartButton({ symbol }: { symbol: string }) {
  const bridge = getPopoutBridge();
  if (!bridge) return null;
  return (
    <button
      className={`btn trainer-reveal-jump ${stylex.props(styles.revealJump).className}`}
      onClick={() => void bridge.openPopout(symbol)}
    >
      在行情页打开真图 →
    </button>
  );
}
