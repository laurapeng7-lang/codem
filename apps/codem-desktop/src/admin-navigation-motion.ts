export const reorderDuration = 220;
export const reorderEasing = 'cubic-bezier(0.25, 1, 0.5, 1)';

export type NavigationDrag = {
  pointerId: number;
  from: number;
  to: number;
  step: number;
  pointerOffset: number;
  delta: number;
};

export function projectNavigationDrag(drag: NavigationDrag, pointerY: number, listTop: number, count: number): NavigationDrag {
  // Keep the moving row within the three configurable slots, even outside the list.
  const delta = Math.max((2 - drag.from) * drag.step, Math.min((count - 1 - drag.from) * drag.step, pointerY - listTop - drag.pointerOffset));
  return { ...drag, delta, to: drag.from + Math.round(delta / drag.step) };
}

export function navigationOffset(index: number, drag: NavigationDrag | null) {
  if (!drag) return 0;
  if (index === drag.from) return drag.delta;
  if (index > drag.from && index <= drag.to) return -drag.step;
  if (index < drag.from && index >= drag.to) return drag.step;
  return 0;
}
