import { useEffect, useRef } from 'react';
import { OrderZonePrimitive, type OrderZoneData } from '../charts/intraday/orderZonePrimitive';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

export function useOrderZone(handle: DrawingChartHandle | null, data: OrderZoneData | null): void {
  const primitiveRef = useRef<OrderZonePrimitive | null>(null);

  useEffect(() => {
    if (!handle) return;
    const primitive = new OrderZonePrimitive();
    handle.series.attachPrimitive(primitive);
    primitiveRef.current = primitive;
    return () => {
      handle.series.detachPrimitive(primitive);
      primitiveRef.current = null;
    };
  }, [handle]);

  useEffect(() => {
    primitiveRef.current?.setData(data);
  }, [handle, data]);
}
