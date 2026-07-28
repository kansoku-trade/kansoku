import { buildCandles, type Candle } from '../kline';
import { deriveLevels, ema, macd, type PriceLevel } from './indicators';

const UP = '#26a69a';
const DOWN = '#ef5350';
const AMBER = '#ffb000';
const EMA_COLORS = ['#e3c14a', '#b18cf0', '#c9c9c9'];
const EMA_PERIODS = [9, 21, 55];

const AXIS_WIDTH = 62;
const MACD_HEIGHT = 132;
const VOLUME_HEIGHT = 74;
const TIME_HEIGHT = 22;
const PREMARKET_FRACTION = 0.42;

export interface ReplicaChart {
  setTimeframe: (timeframe: string) => void;
  destroy: () => void;
}

interface Series {
  candles: Candle[];
  emas: Array<Array<number | null>>;
  macd: ReturnType<typeof macd>;
  levels: PriceLevel[];
}

const TIMEFRAME_SEEDS: Record<string, { seed: number; volatility: number }> = {
  '5m': { seed: 424242, volatility: 1.5 },
  '15m': { seed: 20260714, volatility: 2.4 },
  '1h': { seed: 991127, volatility: 4.1 },
};

const buildSeries = (timeframe: string, count: number): Series => {
  const config = TIMEFRAME_SEEDS[timeframe] ?? TIMEFRAME_SEEDS['15m'];
  const candles = buildCandles(count, {
    seed: config.seed,
    start: 930,
    volatility: config.volatility,
  });
  const closes = candles.map((candle) => candle.close);
  return {
    candles,
    emas: EMA_PERIODS.map((period) => ema(closes, period)),
    macd: macd(closes),
    levels: deriveLevels(candles),
  };
};

export const mountReplicaChart = (root: HTMLElement): ReplicaChart | null => {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-replica-canvas]');
  const legend = root.querySelector<HTMLElement>('[data-replica-legend]');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let series = buildSeries('15m', 96);
  let hoverX = -1;
  let rafId = 0;
  let dirty = true;

  const layout = (): void => {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  };

  const priceArea = () => ({
    top: 8,
    bottom: height - MACD_HEIGHT - VOLUME_HEIGHT - TIME_HEIGHT,
  });

  const draw = (): void => {
    const plotWidth = width - AXIS_WIDTH;
    const { top, bottom } = priceArea();
    const visible = series.candles;
    const step = plotWidth / visible.length;
    const bodyWidth = Math.max(2, step * 0.62);

    let high = -Infinity;
    let low = Infinity;
    for (const candle of visible) {
      if (candle.high > high) high = candle.high;
      if (candle.low < low) low = candle.low;
    }
    for (const level of series.levels) {
      if (level.value > high) high = level.value;
      if (level.value < low) low = level.value;
    }
    const pad = (high - low) * 0.06;
    high += pad;
    low -= pad;
    const yOf = (price: number): number =>
      bottom - ((price - low) / (high - low)) * (bottom - top);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0c0d10';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(58, 96, 168, 0.13)';
    ctx.fillRect(plotWidth * PREMARKET_FRACTION, 0, plotWidth * (1 - PREMARKET_FRACTION), bottom);

    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 9; i++) {
      const y = Math.round(top + ((bottom - top) / 9) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();
    }

    visible.forEach((candle, i) => {
      const cx = i * step + step / 2;
      const color = candle.up ? UP : DOWN;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, yOf(candle.high));
      ctx.lineTo(Math.round(cx) + 0.5, yOf(candle.low));
      ctx.stroke();
      const bodyTop = yOf(Math.max(candle.open, candle.close));
      const bodyHeight = Math.max(1, Math.abs(yOf(candle.open) - yOf(candle.close)));
      ctx.fillRect(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    });

    series.emas.forEach((line, index) => {
      ctx.strokeStyle = EMA_COLORS[index];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      line.forEach((value, i) => {
        if (value === null) return;
        const cx = i * step + step / 2;
        const cy = yOf(value);
        if (started) ctx.lineTo(cx, cy);
        else {
          ctx.moveTo(cx, cy);
          started = true;
        }
      });
      ctx.stroke();
    });

    const volumeTop = bottom + 10;
    let maxVolume = 0;
    const volumes = visible.map((candle) => Math.abs(candle.close - candle.open) * 900 + 240);
    for (const value of volumes) if (value > maxVolume) maxVolume = value;
    visible.forEach((candle, i) => {
      const cx = i * step + step / 2;
      const h = (volumes[i] / maxVolume) * (VOLUME_HEIGHT - 14);
      ctx.fillStyle = candle.up ? 'rgba(38,166,154,0.62)' : 'rgba(239,83,80,0.62)';
      ctx.fillRect(cx - bodyWidth / 2, volumeTop + (VOLUME_HEIGHT - 14) - h, bodyWidth, h);
    });

    const macdTop = volumeTop + VOLUME_HEIGHT;
    const macdBottom = macdTop + MACD_HEIGHT - 24;
    let macdMax = 0;
    for (const value of series.macd.hist) {
      if (value !== null && Math.abs(value) > macdMax) macdMax = Math.abs(value);
    }
    for (const value of series.macd.dif) {
      if (value !== null && Math.abs(value) > macdMax) macdMax = Math.abs(value);
    }
    const macdMid = (macdTop + macdBottom) / 2;
    const macdScale = (macdBottom - macdTop) / 2 / (macdMax || 1);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(0, Math.round(macdMid) + 0.5);
    ctx.lineTo(plotWidth, Math.round(macdMid) + 0.5);
    ctx.stroke();

    series.macd.hist.forEach((value, i) => {
      if (value === null) return;
      const cx = i * step + step / 2;
      const h = value * macdScale;
      ctx.fillStyle = value >= 0 ? 'rgba(38,166,154,0.75)' : 'rgba(239,83,80,0.75)';
      ctx.fillRect(cx - bodyWidth / 2, macdMid - Math.max(0, h), bodyWidth, Math.abs(h));
    });

    (['dif', 'dea'] as const).forEach((key, index) => {
      ctx.strokeStyle = index === 0 ? '#e3c14a' : '#c9c9c9';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      series.macd[key].forEach((value, i) => {
        if (value === null) return;
        const cx = i * step + step / 2;
        const cy = macdMid - value * macdScale;
        if (started) ctx.lineTo(cx, cy);
        else {
          ctx.moveTo(cx, cy);
          started = true;
        }
      });
      ctx.stroke();
    });

    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    for (let i = 0; i <= 8; i++) {
      const price = low + ((high - low) / 8) * i;
      ctx.fillText(price.toFixed(2), plotWidth + 8, yOf(price));
    }

    for (const level of series.levels) {
      const y = yOf(level.value);
      const isLast = level.tone === 'last';
      const color = isLast ? DOWN : level.tone === 'anchor' ? AMBER : 'rgba(190,190,190,0.85)';
      ctx.strokeStyle = isLast
        ? 'rgba(239,83,80,0.7)'
        : level.tone === 'anchor'
          ? 'rgba(255,176,0,0.55)'
          : 'rgba(255,255,255,0.16)';
      ctx.setLineDash(isLast ? [4, 3] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(plotWidth, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      const text = level.value.toFixed(2);
      const tagWidth = ctx.measureText(text).width + 12;
      ctx.fillStyle = isLast ? DOWN : level.tone === 'anchor' ? AMBER : 'rgba(70,70,70,0.95)';
      ctx.fillRect(plotWidth + 2, y - 8, tagWidth, 16);
      ctx.fillStyle = isLast || level.tone === 'anchor' ? '#0a0a0a' : '#e8e8e8';
      ctx.fillText(text, plotWidth + 8, y);

      if (level.label) {
        const labelWidth = ctx.measureText(level.label).width + 14;
        ctx.fillStyle = 'rgba(38,38,42,0.92)';
        ctx.fillRect(plotWidth - labelWidth - 6, y - 8, labelWidth, 16);
        ctx.fillStyle = 'rgba(220,220,220,0.9)';
        ctx.fillText(level.label, plotWidth - labelWidth, y);
      }
    }

    if (hoverX >= 0 && hoverX < plotWidth) {
      const index = Math.min(visible.length - 1, Math.floor(hoverX / step));
      const candle = visible[index];
      const cx = index * step + step / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, 0);
      ctx.lineTo(Math.round(cx) + 0.5, macdBottom);
      ctx.stroke();
      ctx.setLineDash([]);
      if (legend) {
        legend.textContent = `O ${candle.open.toFixed(2)}  H ${candle.high.toFixed(2)}  L ${candle.low.toFixed(2)}  C ${candle.close.toFixed(2)}`;
        legend.dataset.tone = candle.up ? 'up' : 'down';
      }
    } else if (legend) {
      const emaValues = series.emas.map((line) => {
        for (let i = line.length - 1; i >= 0; i--) if (line[i] !== null) return line[i] as number;
        return 0;
      });
      legend.textContent = EMA_PERIODS.map(
        (period, i) => `EMA${period} ${emaValues[i].toFixed(2)}`,
      ).join('   ');
      legend.dataset.tone = 'idle';
    }
  };

  const loop = (): void => {
    if (dirty) {
      draw();
      dirty = false;
    }
    rafId = window.requestAnimationFrame(loop);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    hoverX = event.clientX - rect.left;
    dirty = true;
  };
  const onPointerLeave = (): void => {
    hoverX = -1;
    dirty = true;
  };

  layout();
  window.addEventListener('resize', layout);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  rafId = window.requestAnimationFrame(loop);

  return {
    setTimeframe: (timeframe: string) => {
      series = buildSeries(timeframe, timeframe === '1h' ? 72 : 96);
      dirty = true;
    },
    destroy: () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', layout);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    },
  };
};
