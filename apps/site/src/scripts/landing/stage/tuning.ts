export interface StageTuning {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  exposure: number;
  baseAlpha: number;
  speedAlpha: number;
  pointScale: number;
  coolColor: number;
  warmColor: number;
  hotColor: number;
  hotFrom: number;
  cycleSeconds: number;
}

const DEFAULTS: StageTuning = {
  bloomStrength: 0.42,
  bloomRadius: 0.8,
  bloomThreshold: 0.62,
  exposure: 0.82,
  baseAlpha: 0.035,
  speedAlpha: 0.2,
  pointScale: 1,
  coolColor: 0x2a1604,
  warmColor: 0x9c5c12,
  hotColor: 0xd98f14,
  hotFrom: 0.55,
  cycleSeconds: 15,
};

const PARAM_KEYS: Record<string, keyof StageTuning> = {
  bloom: 'bloomStrength',
  radius: 'bloomRadius',
  thresh: 'bloomThreshold',
  exp: 'exposure',
  alpha: 'baseAlpha',
  salpha: 'speedAlpha',
  psize: 'pointScale',
  cool: 'coolColor',
  warm: 'warmColor',
  hot: 'hotColor',
  hotfrom: 'hotFrom',
  cycle: 'cycleSeconds',
};

const COLOR_KEYS = new Set<keyof StageTuning>(['coolColor', 'warmColor', 'hotColor']);

export const readTuning = (): StageTuning => {
  const tuning: StageTuning = { ...DEFAULTS };
  try {
    const params = new URLSearchParams(window.location.search);
    for (const [param, key] of Object.entries(PARAM_KEYS)) {
      const raw = params.get(param);
      if (raw === null) continue;
      const value = COLOR_KEYS.has(key)
        ? Number.parseInt(raw.replace('#', ''), 16)
        : Number.parseFloat(raw);
      if (Number.isFinite(value)) tuning[key] = value;
    }
  } catch {
    return { ...DEFAULTS };
  }
  return tuning;
};
