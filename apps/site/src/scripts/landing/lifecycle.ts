type Teardown = () => void;

export const onPageLive = (mount: () => Teardown | void): void => {
  let teardown: Teardown | null = null;

  const start = (): void => {
    if (teardown) return;
    teardown = mount() ?? (() => {});
  };

  const stop = (): void => {
    if (!teardown) return;
    const run = teardown;
    teardown = null;
    run();
  };

  start();

  document.addEventListener('astro:page-load', start);
  document.addEventListener('astro:before-swap', stop);
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    stop();
  });
};
