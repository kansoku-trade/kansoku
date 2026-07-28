import type { Tier } from '../tier';
import { mountReplicaChart, type ReplicaChart } from './chart';

export interface ReplicaScene {
  destroy: () => void;
}

const wireTabList = (
  container: HTMLElement | null,
  onSelect?: (value: string) => void,
  attribute = 'tab',
): (() => void) => {
  if (!container) return () => {};
  const onClick = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target) return;
    for (const button of container.querySelectorAll('button')) {
      button.setAttribute('aria-selected', String(button === target));
    }
    const value = target.dataset[attribute];
    if (value && onSelect) onSelect(value);
  };
  container.addEventListener('click', onClick);
  return () => container.removeEventListener('click', onClick);
};

export const mountReplicaScene = (root: ParentNode, tier: Tier): ReplicaScene | null => {
  const scene = root.querySelector<HTMLElement>('[data-replica-scene]');
  if (!scene) return null;

  let chart: ReplicaChart | null = null;
  if (tier !== 'still') chart = mountReplicaChart(scene);

  const unbindTfs = wireTabList(
    scene.querySelector<HTMLElement>('[data-replica-tfs]'),
    (value) => chart?.setTimeframe(value),
    'tf',
  );
  const unbindTabs = wireTabList(scene.querySelector<HTMLElement>('[data-replica-tabs]'));

  const tools = scene.querySelectorAll<HTMLButtonElement>('.app-tool');
  const onToolClick = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.app-tool');
    if (!target) return;
    for (const tool of tools) tool.dataset.active = String(tool === target);
  };
  scene.querySelector('.app-tools')?.addEventListener('click', onToolClick);

  return {
    destroy: () => {
      chart?.destroy();
      unbindTfs();
      unbindTabs();
      scene.querySelector('.app-tools')?.removeEventListener('click', onToolClick);
    },
  };
};
