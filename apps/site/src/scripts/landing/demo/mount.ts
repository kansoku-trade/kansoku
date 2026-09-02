import { mountReplicaChart, type ReplicaChart } from '../replica/chart';
import type { DrawingTool } from '../replica/drawingShapes';
import type { Tier } from '../tier';
import { applyState, collectRefs } from './director';
import { mountCanvasControls } from './canvasControls';
import { mountChatControls } from './chatControls';
import { mountResearchControls } from './researchControls';
import {
  CHAPTERS,
  chapterIndexOfView,
  chapterStart,
  createTimeline,
  TOTAL_SECONDS,
} from './timeline';
import { mountToolbarControls } from './toolbarControls';
import { mountTrainerControls } from './trainerControls';

export interface DemoScene {
  destroy: () => void;
}

export const mountDemoScene = async (root: ParentNode, tier: Tier): Promise<DemoScene | null> => {
  const scene = root.querySelector<HTMLElement>('[data-demo-scene]');
  if (!scene) return null;

  const refs = collectRefs(scene);
  const timeline = createTimeline();
  timeline.setPlaying(false);
  const teardown: Array<() => void> = [];

  let chart: ReplicaChart | null = null;
  if (tier !== 'still') {
    const chartView = scene.querySelector<HTMLElement>('[data-app-view="chart"]');
    const trainerView = scene.querySelector<HTMLElement>('[data-app-view="train"]');
    const [mainChart, trainerChart] = await Promise.all([
      chartView ? mountReplicaChart(chartView) : Promise.resolve(null),
      trainerView ? mountReplicaChart(trainerView, { variant: 'trainer' }) : Promise.resolve(null),
    ]);
    chart = mainChart;
    const trainerControls = trainerView ? mountTrainerControls(trainerView, trainerChart) : null;
    if (trainerChart) teardown.push(() => trainerChart.destroy());
    if (trainerControls) teardown.push(trainerControls.destroy);

    const own = (): void => {
      scene.dataset.toolsOwned = 'true';
    };
    const chartToolbar = chartView ? mountToolbarControls(chartView, mainChart, own) : null;
    const trainerToolbar = trainerView ? mountToolbarControls(trainerView, trainerChart) : null;
    if (chartToolbar) {
      refs.selectTool = (tool) => chartToolbar.select(tool as DrawingTool);
      teardown.push(chartToolbar.destroy);
    }
    if (trainerToolbar) teardown.push(trainerToolbar.destroy);
  }

  const span = (): number => scene.offsetHeight - window.innerHeight;

  const scrollToView = (view: (typeof CHAPTERS)[number]['view']): void => {
    const index = chapterIndexOfView(view);
    if (index < 0) return;
    const total = span();
    if (total <= 0) return;
    // Land a third into the chapter rather than on its boundary — the boundary is exactly where
    // the previous chapter is still one rounding error away from winning.
    const seconds = chapterStart(index) + CHAPTERS[index].seconds / 3;
    const top = scene.offsetTop + (seconds / TOTAL_SECONDS) * total;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const research = mountResearchControls(scene);
  if (research) teardown.push(research.destroy);
  const canvas = mountCanvasControls(scene);
  if (canvas) teardown.push(canvas.destroy);
  const chat = mountChatControls(scene);
  if (chat) teardown.push(chat.destroy);

  const unsubscribe = timeline.subscribe((state) => applyState(refs, state));
  teardown.push(unsubscribe);
  if (chart) teardown.push(() => chart?.destroy());

  const sync = (): void => {
    const rect = scene.getBoundingClientRect();
    const total = span();
    if (total <= 0) return;
    const raw = Math.min(1, Math.max(0, -rect.top / total));
    timeline.seek(raw * TOTAL_SECONDS);
  };

  if (tier === 'still') {
    timeline.seek(TOTAL_SECONDS);
    return { destroy: () => teardown.forEach((fn) => fn()) };
  }

  const onScroll = (): void => {
    sync();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  teardown.push(() => window.removeEventListener('scroll', onScroll));
  teardown.push(() => window.removeEventListener('resize', onScroll));
  sync();

  const tabbar = scene.querySelector<HTMLElement>('.app-tabbar');
  const onTab = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-app-tab]');
    const view = button?.dataset.appTab;
    if (view) scrollToView(view as (typeof CHAPTERS)[number]['view']);
  };
  tabbar?.addEventListener('click', onTab);
  teardown.push(() => tabbar?.removeEventListener('click', onTab));

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
  teardown.push(() => tfButtons?.removeEventListener('click', onTf));

  return {
    destroy: () => teardown.forEach((fn) => fn()),
  };
};
