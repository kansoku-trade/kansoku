const supportsScrollTimeline = (): boolean => {
  try {
    return CSS.supports('animation-timeline: view()');
  } catch {
    return false;
  }
};

export const mountReveal = (root: ParentNode): (() => void) => {
  if (supportsScrollTimeline()) return () => {};

  try {
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (targets.length === 0) return () => {};

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.dataset.in = 'true';
          observer.unobserve(target);
        }
      },
      { threshold: 0.25, rootMargin: '0px 0px -10% 0px' },
    );

    for (const target of targets) observer.observe(target);

    return () => observer.disconnect();
  } catch {
    return () => {};
  }
};
