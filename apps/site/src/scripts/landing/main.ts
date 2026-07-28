import { mountDensityWall } from './densityWall';
import { mountHeroScene } from './scenes/hero';
import { mountNoRetractScene } from './scenes/noRetract';
import { mountOutroScene } from './scenes/outro';
import { mountScorecardScene } from './scenes/scorecard';
import { mountSourcedScene } from './scenes/sourced';
import type { Tier } from './tier';

interface Destroyable {
  destroy: () => void;
}

const cleanups: Array<() => void> = [];
let disposed = false;

const registerCleanup = (scene: Destroyable | null): void => {
  if (!scene) return;
  if (disposed) {
    scene.destroy();
    return;
  }
  cleanups.push(scene.destroy);
};

const mountGuarded = <T extends Destroyable>(label: string, mount: () => T | null): void => {
  try {
    registerCleanup(mount());
  } catch (error) {
    console.error(`[landing] ${label} scene failed to mount`, error);
  }
};

const readTier = (): Tier => {
  const value = document.documentElement.dataset.tier;
  return value === 'full' || value === 'lite' ? value : 'still';
};

const mountLanding = (): void => {
  document.documentElement.setAttribute('data-landing-live', '');
  const tier = readTier();
  const root = document.body;

  void (async () => {
    try {
      const stageCanvas = document.querySelector<HTMLCanvasElement>('[data-stage-canvas]');
      if (!stageCanvas) return;
      const { mountStage } = await import('./stage/stage');
      const stage = await mountStage(stageCanvas, tier);
      if (stage) document.documentElement.setAttribute('data-stage-live', '');
      registerCleanup(stage);
    } catch (error) {
      console.error('[landing] stage failed to mount', error);
    }
  })();

  void (async () => {
    try {
      const heroRoot = document.querySelector<HTMLElement>('[data-hero-scene]');
      registerCleanup(heroRoot ? await mountHeroScene(heroRoot, tier) : null);
    } catch (error) {
      console.error('[landing] hero scene failed to mount', error);
    }
  })();

  mountGuarded('sourced', () => mountSourcedScene(root, tier));
  mountGuarded('noRetract', () => mountNoRetractScene(root, tier));
  mountGuarded('scorecard', () => mountScorecardScene(root, tier));
  mountGuarded('densityWall', () => mountDensityWall(root, tier));
  mountGuarded('outro', () => mountOutroScene(root, tier));
};

mountLanding();

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
});
