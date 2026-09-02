import { useAppProcessMetrics } from './appProcessMetrics';
import { readoutClass } from './readoutStyles';

export function CpuWidget() {
  const metrics = useAppProcessMetrics();
  if (!metrics) return null;
  const percent = metrics.cpuPercent;
  return (
    <span
      className={readoutClass(percent >= 200 ? 'high' : percent >= 100 ? 'mid' : 'ok')}
      title="整个 app 所有进程的 CPU 占用之和，100% = 一个核心"
    >
      CPU {percent.toFixed(1)}%
    </span>
  );
}
