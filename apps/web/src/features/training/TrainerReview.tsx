import { useEffect, useMemo, useState } from 'react';
import type { TrainerCoachCall, TrainerLesson, TrainerReviewPayload } from '@kansoku/pro-api';
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

const STORAGE_NAMESPACE = 'trainer-review';

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

  if (error) return <div className="trainer-order-error">{error}</div>;
  if (!payload) return <div className="trainer-order-panel--status">正在整理这一局…</div>;
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
    <div className="trainer-review" data-testid="trainer-review">
      <section className="trainer-review-reveal">
        <span className="trainer-reveal-key">真身</span>
        <span className="num trainer-reveal-sym">{payload.provenance.sourceSymbol}</span>
        <span className="num trainer-reveal-date">
          {payload.provenance.sourceCutoff.slice(0, 10)}
        </span>
        <span className="trainer-chip">
          标签：{payload.tag ? TRAINER_CASE_TAG_LABEL[payload.tag] : '未标注'}
        </span>
        <OpenRealChartButton symbol={payload.provenance.sourceSymbol} />
      </section>

      <section className="trainer-review-stage">
        <IntradayControlsProvider storageNamespace={STORAGE_NAMESPACE}>
          <div className="trainer-review-chart">
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
        <div className="trainer-review-legend-row">
          <ReviewLegend />
          <label className="trainer-settlement-epilogue-toggle">
            <input
              type="checkbox"
              checked={showEpilogue}
              disabled={brush < max || payload.epilogue.length === 0}
              onChange={(e) => setShowEpilogue(e.target.checked)}
            />
            显示收盘后走势
            <span className="trainer-settle-hint">（尾声段，不计入成绩，只用于看结构）</span>
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
    <div className="trainer-band-legend">
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--given" />
        开局给的历史
      </span>
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--played" />
        你打过的段
      </span>
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--fog" />
        被雾遮住的段
      </span>
      <span>
        <i className="trainer-band-swatch trainer-band-swatch--epilogue" />
        尾声段
      </span>
    </div>
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
