import { useEffect, useState } from 'react';
import type { TrainerBridge } from '../desktop/desktopTrainerBridge';
import type { AmendDraft } from './orderDraft';

export interface AmendVerdict {
  stop: number;
  target: number;
  cursor: number;
  allowed: boolean;
  error: string | null;
}

// `settled` is an identity trigger, not just a value: the caller hands over a fresh object only
// once the trader has stopped moving the stop (pointer-up, keystroke), which is what keeps the
// engine round-trip out of the drag path.
export function useAmendCheck(
  bridge: TrainerBridge,
  sessionId: string,
  cursor: number,
  settled: AmendDraft | null,
): AmendVerdict | null {
  const [verdict, setVerdict] = useState<AmendVerdict | null>(null);

  useEffect(() => {
    if (!settled) {
      setVerdict(null);
      return;
    }
    let cancelled = false;
    const ask = async () => {
      const asked = { stop: settled.stop, target: settled.target, cursor };
      try {
        const envelope = await bridge.validateAmend({
          sessionId,
          stop: settled.stop,
          target: settled.target,
        });
        if (cancelled) return;
        setVerdict(
          envelope.ok
            ? { ...asked, allowed: envelope.data.allowed, error: envelope.data.error }
            : { ...asked, allowed: false, error: envelope.error },
        );
      } catch (error) {
        if (cancelled) return;
        setVerdict({
          ...asked,
          allowed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void ask();
    return () => {
      cancelled = true;
    };
  }, [bridge, sessionId, cursor, settled]);

  return verdict;
}

export function freshVerdict(
  verdict: AmendVerdict | null,
  draft: AmendDraft | null,
  cursor: number,
): AmendVerdict | null {
  if (!verdict || !draft) return null;
  const matches =
    verdict.stop === draft.stop && verdict.target === draft.target && verdict.cursor === cursor;
  return matches ? verdict : null;
}
