import { useAppProcessMetrics } from './appProcessMetrics';
import { readoutClass } from './readoutStyles';

export function GpuWidget() {
  const gpu = useAppProcessMetrics()?.gpu;
  if (!gpu) return null;
  return (
    <span
      className={readoutClass(gpu.cpuPercent >= 100 ? 'high' : gpu.cpuPercent >= 50 ? 'mid' : 'ok')}
      title="GPU 进程的 CPU 占用和常驻内存，Chromium 不提供 GPU 利用率"
    >
      GPU {gpu.cpuPercent.toFixed(1)}% · {Math.round(gpu.memoryMB)} MB
    </span>
  );
}
