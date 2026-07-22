import type { Bi, Fenxing } from '@kansoku/shared/types';

export function detectBi(fenxings: Fenxing[]): Bi[] {
  const endpoints: Fenxing[] = [];

  for (const f of fenxings) {
    const last = endpoints[endpoints.length - 1];

    if (!last) {
      endpoints.push(f);
      continue;
    }

    if (last.kind === f.kind) {
      const isMoreExtreme = f.kind === 'top' ? f.price > last.price : f.price < last.price;
      if (isMoreExtreme) endpoints[endpoints.length - 1] = f;
      continue;
    }

    if (f.barIndex - last.barIndex < 4) continue;

    endpoints.push(f);
  }

  return endpoints.slice(1).map((end, i) => {
    const start = endpoints[i];
    return {
      start,
      end,
      direction: start.kind === 'bottom' ? 'up' : 'down',
      bars: end.barIndex - start.barIndex + 1,
    };
  });
}
