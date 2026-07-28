import { mountReplicaChart, type ReplicaChart } from '../replica/chart';
import type { Tier } from '../tier';
import { applyState, collectRefs } from './director';
import { chapterStart, CHAPTERS, createTimeline, resolve, TOTAL_SECONDS } from './timeline';

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

  const head = scene.querySelector<HTMLElement>('[data-scrub-head]');
  const track = scene.querySelector<HTMLElement>('[data-scrub-track]');
  const clock = scene.querySelector<HTMLElement>('[data-scrub-clock]');
  const markers = Array.from(scene.querySelectorAll<HTMLElement>('[data-scrub-marker]'));

  const paint = (time: number): void => {
    const ratio = time / TOTAL_SECONDS;
    if (head) head.style.width = `${ratio * 100}%`;
    if (clock) clock.textContent = `${time.toFixed(1)}s / ${TOTAL_SECONDS}s`;
    const active = resolve(time).chapterIndex;
    markers.forEach((marker, i) => {
      marker.dataset.active = String(i === active);
    });
  };

  const sync = (): void => {
    const rect = scene.getBoundingClientRect();
    const span = scene.offsetHeight - window.innerHeight;
    if (span <= 0) return;
    const raw = Math.min(1, Math.max(0, -rect.top / span));
    const time = raw * TOTAL_SECONDS;
    timeline.seek(time);
    paint(time);
  };

  const sceneTop = (): number => scene.getBoundingClientRect().top + window.scrollY;

  const scrollToTime = (time: number): void => {
    const span = scene.offsetHeight - window.innerHeight;
    if (span <= 0) return;
    window.scrollTo({ top: sceneTop() + (time / TOTAL_SECONDS) * span, behavior: 'smooth' });
  };

  const onMarkerClick = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-scrub-marker]');
    if (!button) return;
    const index = markers.indexOf(button);
    if (index < 0) return;
    scrollToTime(chapterStart(index) + 0.05);
  };

  const onTrackClick = (event: PointerEvent): void => {
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    scrollToTime(ratio * TOTAL_SECONDS);
  };

  if (tier === 'still') {
    timeline.seek(TOTAL_SECONDS);
    paint(TOTAL_SECONDS);
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
  scene.querySelector('[data-scrub-markers]')?.addEventListener('click', onMarkerClick);
  track?.addEventListener('pointerdown', onTrackClick as EventListener);
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
      scene.querySelector('[data-scrub-markers]')?.removeEventListener('click', onMarkerClick);
      track?.removeEventListener('pointerdown', onTrackClick as EventListener);
      tfButtons?.removeEventListener('click', onTf);
      unsubscribe();
      chart?.destroy();
    },
  };
};

export { CHAPTERS };
