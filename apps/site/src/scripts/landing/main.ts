import { mountDemoScene } from './demo/mount';
import { onPageLive } from './lifecycle';
import { mountHeroAtmosphere } from './scenes/heroAtmosphere';
import { mountHeroScene } from './scenes/hero';
import { mountOutroScene } from './scenes/outro';
import type { Tier } from './tier';

interface Destroyable {
  destroy: () => void;
}

const readTier = (): Tier => {
  const value = document.documentElement.dataset.tier;
  return value === 'full' || value === 'lite' ? value : 'still';
};

const mountLanding = (): (() => void) => {
  document.documentElement.setAttribute('data-landing-live', '');
  const tier = readTier();
  const root = document.body;

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

  const mountGuarded = (label: string, mount: () => Destroyable | null): void => {
    try {
      registerCleanup(mount());
    } catch (error) {
      console.error(`[landing] ${label} scene failed to mount`, error);
    }
  };

  const mountAsyncGuarded = (
    label: string,
    mount: () => Promise<Destroyable | null>,
  ): void => {
    void (async () => {
      try {
        registerCleanup(await mount());
      } catch (error) {
        console.error(`[landing] ${label} scene failed to mount`, error);
      }
    })();
  };

  mountAsyncGuarded('hero-atmosphere', () => mountHeroAtmosphere(root, tier));
  mountAsyncGuarded('hero', async () => {
    const heroRoot = document.querySelector<HTMLElement>('[data-hero-scene]');
    return heroRoot ? await mountHeroScene(heroRoot, tier) : null;
  });
  mountAsyncGuarded('demo', () => mountDemoScene(root, tier));
  mountGuarded('outro', () => mountOutroScene(root, tier));

  return () => {
    disposed = true;
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
};

onPageLive(() => {
  if (!document.querySelector('[data-landing-root]')) return;
  return mountLanding();
});
