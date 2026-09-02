import { useEffect, useState } from 'react';
import { useAppProcessMetrics } from './appProcessMetrics';
import { readoutClass } from './readoutStyles';

interface Sample {
  heapUsedMB: number;
  heapLimitMB: number;
  footprintMB: number | null;
  sharedMB: number;
}

interface RendererMemoryInfo {
  private: number;
  shared: number;
}

type DesktopWithDevtools = {
  desktop?: { devtools?: { getMemoryInfo(): Promise<RendererMemoryInfo> } };
};

function readHeap(): Pick<Sample, 'heapUsedMB' | 'heapLimitMB'> | null {
  const memory = (
    performance as Performance & { memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number } }
  ).memory;
  if (!memory) return null;
  return {
    heapUsedMB: memory.usedJSHeapSize / 1048576,
    heapLimitMB: memory.jsHeapSizeLimit / 1048576,
  };
}

async function sample(): Promise<Sample | null> {
  const heap = readHeap();
  if (!heap) return null;
  let footprintMB: number | null = null;
  let sharedMB = 0;
  try {
    const info = await (window as DesktopWithDevtools).desktop?.devtools?.getMemoryInfo();
    if (info) {
      footprintMB = info.private / 1024;
      sharedMB = info.shared / 1024;
    }
  } catch {
    /* preload without devtools: JS heap alone is still useful */
  }
  return { ...heap, footprintMB, sharedMB };
}

export function MemoryWidget() {
  const [memory, setMemory] = useState<Sample | null>(null);
  const residentMB = useAppProcessMetrics()?.rendererResidentMB ?? null;

  useEffect(() => {
    let disposed = false;
    const tick = () => void sample().then((next) => !disposed && setMemory(next));
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  if (!memory) return null;
  const percent = (memory.heapUsedMB / memory.heapLimitMB) * 100;
  // macOS keeps madvise(MADV_FREE_REUSABLE) pages in the resident set until it needs them,
  // so resident minus footprint is what the allocator already gave back.
  const reclaimableMB =
    residentMB !== null && memory.footprintMB !== null
      ? Math.max(0, residentMB - memory.footprintMB - memory.sharedMB)
      : null;
  return (
    <span
      className={readoutClass(percent >= 90 ? 'high' : percent >= 70 ? 'mid' : 'ok')}
      title={
        memory.footprintMB === null
          ? 'JS 堆已用 / 上限'
          : '渲染进程实际占用（phys_footprint）· 待回收 = 常驻集减实际占用减共享，主要是已释放待系统回收的页，含少量只读库页 · JS 堆已用 / 上限'
      }
    >
      {memory.footprintMB !== null && `渲染 ${Math.round(memory.footprintMB)} MB · `}
      {reclaimableMB !== null && `待回收 ${Math.round(reclaimableMB)} MB · `}
      JS {memory.heapUsedMB.toFixed(0)} MB · {percent.toFixed(1)}%
    </span>
  );
}
