import { useParams } from 'react-router';
import { PopoutChartWindow } from '@web/features/charts/PopoutChartWindow';

export function Component() {
  const { sym } = useParams();
  return <PopoutChartWindow sym={decodeURIComponent(sym ?? '')} />;
}
