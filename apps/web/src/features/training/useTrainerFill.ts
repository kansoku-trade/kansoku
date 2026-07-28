import { useCallback, useEffect, useState } from 'react';
import type { TrainerBasePeriod, TrainerFillState, TrainerFillTask } from '@kansoku/pro-api';
import { subscribeChannel } from '@web/lib/ws/wsHub';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';

type FillEnvelope =
  { type: 'init'; state: TrainerFillState } | { type: 'task'; task: TrainerFillTask };

const EMPTY: TrainerFillState = { task: null, autoRefillEnabled: true, autoRefillSuspended: false };

export interface TrainerFill {
  state: TrainerFillState;
  pending: boolean;
  error: string | null;
  startFill(basePeriod: TrainerBasePeriod, count: number): void;
  abortFill(): void;
}

export function useTrainerFill(enabled: boolean): TrainerFill {
  const [state, setState] = useState<TrainerFillState>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const bridge = getTrainerBridge();
    if (!bridge) return;
    let active = true;
    bridge
      .getFill()
      .then((result) => {
        if (active && result.ok) setState(result.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeChannel(
      { kind: 'training-fill' },
      (payload) => {
        const envelope = payload as FillEnvelope;
        if (envelope.type === 'init') setState(envelope.state);
        // A task push carries only the row; the auto-refill flags come from the
        // init frame and stay as they were until the next connect.
        else setState((prev) => ({ ...prev, task: envelope.task }));
      },
      () => {},
    );
  }, [enabled]);

  const startFill = useCallback((basePeriod: TrainerBasePeriod, count: number) => {
    const bridge = getTrainerBridge();
    if (!bridge) return;
    setPending(true);
    setError(null);
    bridge
      .startFill({ basePeriod, count })
      .then((result) => {
        if (result.ok) setState((prev) => ({ ...prev, task: result.data }));
        else setError(result.error);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPending(false));
  }, []);

  const abortFill = useCallback(() => {
    const bridge = getTrainerBridge();
    const id = state.task?.id;
    if (!bridge || !id) return;
    bridge
      .abortFill({ id })
      .then((result) => {
        if (result.ok) setState((prev) => ({ ...prev, task: result.data }));
      })
      .catch(() => {});
  }, [state.task?.id]);

  return { state, pending, error, startFill, abortFill };
}
