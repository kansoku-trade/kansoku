import type { ChanStructure, RawBar, TimeframeKey } from '@kansoku/shared/types';
import { toTs } from '../indicators.js';
import { detectBeichi } from './beichi.js';
import { detectBi } from './bi.js';
import { detectBuySellPoints } from './buysellpoints.js';
import { detectFenxing } from './fenxing.js';
import { mergeInclusion } from './inclusion.js';
import { detectXianduan } from './xianduan.js';
import { detectZhongshu } from './zhongshu.js';

export function computeChanStructure(
  candles: RawBar[],
  macdHist: (number | null)[],
  timeframe: TimeframeKey,
): ChanStructure {
  const merged = mergeInclusion(candles);
  const fenxings = detectFenxing(merged);
  const bis = detectBi(fenxings);
  const xianduans = detectXianduan(bis);
  const zhongshus = detectZhongshu(xianduans);
  const barTimes = candles.map((c) => toTs(c.time));
  const beichis = detectBeichi(xianduans, barTimes, macdHist);
  const buySellPoints = detectBuySellPoints(xianduans, zhongshus, beichis, timeframe);
  return { fenxings, bis, xianduans, zhongshus, buySellPoints };
}
