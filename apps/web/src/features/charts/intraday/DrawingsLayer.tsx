import { DrawingToolbar } from '../drawings/DrawingToolbar';
import { useDrawings, type DrawingsHandle } from '../drawings/useDrawings';

export interface DrawingsLayerProps {
  symbol: string;
  handle: DrawingsHandle | null;
  barTimes: number[];
}

export function DrawingsLayer({ symbol, handle, barTimes }: DrawingsLayerProps) {
  const drawingsApi = useDrawings(handle, symbol, barTimes);
  return <DrawingToolbar api={drawingsApi} />;
}
