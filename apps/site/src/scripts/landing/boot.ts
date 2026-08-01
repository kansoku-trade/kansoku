const BOOT_KEY = 'kansoku-booted';

interface BootTiming {
  lineInterval: number;
  hold: number;
  fade: number;
}

const TIMING: Record<'full' | 'lite', BootTiming> = {
  full: { lineInterval: 165, hold: 200, fade: 200 },
  lite: { lineInterval: 80, hold: 100, fade: 100 },
};

const readBooted = (): boolean => {
  try {
    return localStorage.getItem(BOOT_KEY) === '1';
  } catch {
    return false;
  }
};

const persistBooted = (): void => {
  try {
    localStorage.setItem(BOOT_KEY, '1');
  } catch {}
};

export const initBoot = (): (() => void) | void => {
  const overlay = document.querySelector<HTMLElement>('[data-boot-overlay]');

  const finish = () => {
    overlay?.remove();
    document.body.dataset.booted = '';
  };

  if (!overlay) {
    finish();
    return;
  }

  const tier = document.documentElement.dataset.tier;
  if (tier === 'still' || readBooted()) {
    finish();
    return;
  }

  const timing = tier === 'lite' ? TIMING.lite : TIMING.full;
  overlay.style.setProperty('--boot-fade', `${timing.fade}ms`);

  const lines = Array.from(overlay.querySelectorAll<HTMLElement>('[data-boot-line]'));
  const skipButton = overlay.querySelector<HTMLElement>('[data-boot-skip]');

  const timers = new Set<number>();
  const later = (run: () => void, delay: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      run();
    }, delay);
    timers.add(id);
  };

  const end = () => {
    overlay.classList.remove('is-active');
    overlay.classList.add('is-done');
    later(finish, timing.fade);
  };

  let index = 0;
  const showNext = () => {
    lines[index]?.classList.add('is-visible');
    index += 1;
    if (index < lines.length) {
      later(showNext, timing.lineInterval);
      return;
    }
    persistBooted();
    later(end, timing.hold);
  };

  skipButton?.addEventListener('click', () => {
    persistBooted();
    end();
  });

  overlay.classList.add('is-active');
  showNext();

  return () => {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  };
};
