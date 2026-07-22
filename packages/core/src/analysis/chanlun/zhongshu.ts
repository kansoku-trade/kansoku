import type { Xianduan, Zhongshu } from '@kansoku/shared/types';

function segmentPriceRange(seg: Xianduan): { low: number; high: number } {
  const prices = [seg.bis[0].start.price];
  for (const bi of seg.bis) prices.push(bi.end.price);
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

export function detectZhongshu(xianduans: Xianduan[]): Zhongshu[] {
  const zhongshus: Zhongshu[] = [];
  let i = 0;

  while (i + 2 < xianduans.length) {
    const a = xianduans[i];
    const b = xianduans[i + 1];
    const c = xianduans[i + 2];

    const ra = segmentPriceRange(a);
    const rb = segmentPriceRange(b);
    const rc = segmentPriceRange(c);

    const priceLow = Math.max(ra.low, rb.low, rc.low);
    const priceHigh = Math.min(ra.high, rb.high, rc.high);

    if (priceLow >= priceHigh) {
      i += 1;
      continue;
    }

    const coreSegments = [a, b, c];
    const extendedBy: Xianduan[] = [];
    let j = i + 3;

    while (j < xianduans.length) {
      const s = xianduans[j];
      const r = segmentPriceRange(s);
      if (r.high < priceLow || r.low > priceHigh) break;
      extendedBy.push(s);
      j += 1;
    }

    const terminated = j < xianduans.length;
    const last = extendedBy.length > 0 ? extendedBy[extendedBy.length - 1] : c;

    zhongshus.push({
      coreSegments,
      extendedBy,
      priceLow,
      priceHigh,
      startTime: a.startTime,
      endTime: terminated ? last.endTime : null,
    });

    i = j;
  }

  return zhongshus;
}
