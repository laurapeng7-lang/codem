export type RipplePoint = { x: number; y: number };

export function startSettingsProRipple({ header, layer, circle, trigger, point }: {
  header: HTMLElement;
  layer: HTMLElement;
  circle: HTMLElement;
  trigger: HTMLElement;
  point: RipplePoint | null;
}) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || typeof circle.animate !== 'function') return () => {};

  // Measure after Pro Mode has mounted its tools, including wrapped headers.
  const bounds = header.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return () => {};
  const button = trigger.getBoundingClientRect();
  const x = Math.max(0, Math.min(bounds.width, (point?.x ?? button.left + button.width / 2) - bounds.left));
  const y = Math.max(0, Math.min(bounds.height, (point?.y ?? button.top + button.height / 2) - bounds.top));
  const radius = Math.ceil(Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y))) + 1;
  Object.assign(circle.style, { width: `${radius * 2}px`, height: `${radius * 2}px`, left: `${x - radius}px`, top: `${y - radius}px` });

  const animation = circle.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
    duration: 420,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    fill: 'forwards',
  });
  layer.hidden = false;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    layer.hidden = true;
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
    observer.disconnect();
    motion.removeEventListener('change', onMotionChange);
  };
  const onMotionChange = () => { if (motion.matches) finish(); };
  const observer = new ResizeObserver(() => {
    const next = header.getBoundingClientRect();
    if (next.width !== bounds.width || next.height !== bounds.height) finish();
  });
  observer.observe(header);
  motion.addEventListener('change', onMotionChange);
  animation.onfinish = finish;
  animation.oncancel = finish;
  return finish;
}
