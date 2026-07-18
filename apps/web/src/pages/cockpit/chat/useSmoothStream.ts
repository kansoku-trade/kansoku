import { useCallback, useEffect, useRef, useState } from "react";
import { drainBudget, safeCut } from "./smoothStreamPacing.js";

export interface SmoothStream {
  text: string;
  push: (delta: string) => void;
  flush: (fullText?: string) => void;
  finish: (onDrained: () => void) => void;
  reset: () => void;
}

export function useSmoothStream(): SmoothStream {
  const [text, setText] = useState("");
  const shownRef = useRef("");
  const bufferRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const onDrainedRef = useRef<(() => void) | null>(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const settleIfDrained = useCallback(() => {
    if (bufferRef.current.length > 0) return;
    stopLoop();
    const onDrained = onDrainedRef.current;
    if (onDrained) {
      onDrainedRef.current = null;
      onDrained();
    }
  }, [stopLoop]);

  const tick = useCallback(
    (ts: number) => {
      rafRef.current = null;
      const elapsed = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;
      const buffer = bufferRef.current;
      const budget = drainBudget(buffer.length, elapsed);
      if (budget > 0) {
        const cut = safeCut(buffer, budget);
        bufferRef.current = buffer.slice(cut);
        shownRef.current += buffer.slice(0, cut);
        setText(shownRef.current);
      }
      if (bufferRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        settleIfDrained();
      }
    },
    [settleIfDrained],
  );

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const push = useCallback(
    (delta: string) => {
      if (!delta) return;
      bufferRef.current += delta;
      startLoop();
    },
    [startLoop],
  );

  const flush = useCallback(
    (fullText?: string) => {
      stopLoop();
      if (fullText !== undefined) {
        bufferRef.current = "";
        shownRef.current = fullText;
      } else {
        shownRef.current += bufferRef.current;
        bufferRef.current = "";
      }
      setText(shownRef.current);
      settleIfDrained();
    },
    [settleIfDrained, stopLoop],
  );

  const finish = useCallback(
    (onDrained: () => void) => {
      onDrainedRef.current = onDrained;
      if (bufferRef.current.length > 0) startLoop();
      else settleIfDrained();
    },
    [settleIfDrained, startLoop],
  );

  const reset = useCallback(() => {
    stopLoop();
    bufferRef.current = "";
    shownRef.current = "";
    onDrainedRef.current = null;
    setText("");
  }, [stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  return { text, push, flush, finish, reset };
}
