import { mountReplicaChart, type ReplicaChart } from '../replica/chart';
import type { Tier } from '../tier';
import { applyState, collectRefs } from './director';
import { CHAPTERS, createTimeline, TOTAL_SECONDS } from './timeline';

export interface DemoScene {
  destroy: () => void;
}

export const mountDemoScene = (root: ParentNode, tier: Tier): DemoScene | null => {
  const scene = root.querySelector<HTMLElement>('[data-demo-scene]');
  if (!scene) return null;

  const refs = collectRefs(scene);
  const timeline = createTimeline();
  timeline.setPlaying(false);

  let chart: ReplicaChart | null = null;
  if (tier !== 'still') chart = mountReplicaChart(scene);

  const unsubscribe = timeline.subscribe((state) => applyState(refs, state));

  const sync = (): void => {
    const rect = scene.getBoundingClientRect();
    const span = scene.offsetHeight - window.innerHeight;
    if (span <= 0) return;
    const raw = Math.min(1, Math.max(0, -rect.top / span));
    timeline.seek(raw * TOTAL_SECONDS);
  };

  if (tier === 'still') {
    timeline.seek(TOTAL_SECONDS);
    return {
      destroy: () => {
        unsubscribe();
        chart?.destroy();
      },
    };
  }

  const onScroll = (): void => {
    sync();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  sync();

  const tfButtons = scene.querySelector<HTMLElement>('[data-demo-tfs]');
  const onTf = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !tfButtons) return;
    for (const other of tfButtons.querySelectorAll('button')) {
      other.setAttribute('aria-selected', String(other === button));
    }
    if (button.dataset.tf) chart?.setTimeframe(button.dataset.tf);
  };
  tfButtons?.addEventListener('click', onTf);

  return {
    destroy: () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      tfButtons?.removeEventListener('click', onTf);
      unsubscribe();
      chart?.destroy();
    },
  };
};

export { CHAPTERS };
