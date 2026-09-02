import { useEffect, useState } from 'react';
import { readoutClass } from './readoutStyles';

export function FpsWidget() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let windowStart = performance.now();
    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (fps === null) return null;
  return (
    <span className={readoutClass(fps < 30 ? 'high' : fps < 50 ? 'mid' : 'ok')} title="每秒帧数">
      {fps} FPS
    </span>
  );
}
