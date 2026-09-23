// Retain the entrance animations so an early close reverses from the current frame.
export function createTemplateDiscoveryMotion(surface: HTMLElement | null, body: HTMLElement | null, onExited: () => void) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let animations: Animation[] = [];
  let exiting = false;
  let disposed = false;
  let completed = false;
  const cancel = () => {
    animations.forEach(animation => animation.cancel());
    animations = [];
  };
  const finish = () => {
    if (disposed || completed) return;
    completed = true;
    cancel();
    onExited();
  };
  const reduceMotion = () => {
    if (!preference.matches) return;
    if (exiting) finish();
    else cancel();
  };
  preference.addEventListener?.('change', reduceMotion);

  if (!preference.matches && surface?.animate && body?.animate) {
    animations = [
      surface.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 280, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'both',
      }),
      body.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], {
        duration: 320, delay: 30, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both',
      }),
    ];
  }

  return {
    exit() {
      if (disposed || exiting) return;
      exiting = true;
      if (preference.matches || !animations.length) { finish(); return; }
      const pending = animations.map(animation => {
        // play() would rewind a zero-time reverse animation to its end and flash.
        if (Number(animation.currentTime) <= 0) { animation.pause(); return Promise.resolve(); }
        animation.updatePlaybackRate(-1.5);
        animation.play();
        return animation.finished.catch(() => {});
      });
      void Promise.all(pending).then(finish);
    },
    dispose() {
      disposed = true;
      preference.removeEventListener?.('change', reduceMotion);
      cancel();
    },
  };
}
