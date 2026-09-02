import type { CandleFeedTf, IntradayTfData } from '@kansoku/shared/types';

export const CANDLE_FEED_TF_KEYS = [
  'candles',
  'volumes',
  'emas',
  'macdDif',
  'macdDea',
  'macdHist',
  'offSession',
] as const;

const SNAPSHOT_BARS = 300;

export function projectCandleFeedTf(tf: IntradayTfData, limit = SNAPSHOT_BARS): CandleFeedTf {
  const candles = tf.candles.slice(-limit);
  const from = candles[0]?.time ?? Number.POSITIVE_INFINITY;
  const keep = <T extends { time: number }>(rows: T[]): T[] =>
    rows.filter((row) => row.time >= from);
  return {
    candles,
    volumes: keep(tf.volumes),
    emas: tf.emas.map((ema) => ({ ...ema, data: keep(ema.data) })),
    macdDif: keep(tf.macdDif),
    macdDea: keep(tf.macdDea),
    macdHist: keep(tf.macdHist),
    ...(tf.offSession
      ? { offSession: tf.offSession.filter((segment) => segment.endTime >= from) }
      : {}),
  };
}
