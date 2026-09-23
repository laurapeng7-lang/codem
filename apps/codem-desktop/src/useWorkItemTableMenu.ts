import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type TableMenuAnchorPoint = { x: number; y: number };

// Table menus escape the horizontal scroller, but track and stay near their cell.
export function useWorkItemTableMenu({ open, anchorRef, menuRef, width, height, onClose, scrollContainerSelector, anchorPoint, placement = 'auto', gap = 4, align = 'start' }: {
  open: boolean; anchorRef?: RefObject<HTMLElement | null>; menuRef: RefObject<HTMLElement | null>;
  width: number; height: number; onClose: () => void;
  scrollContainerSelector?: string;
  anchorPoint?: TableMenuAnchorPoint;
  placement?: 'auto' | 'top' | 'bottom';
  gap?: number;
  align?: 'start' | 'center';
}) {
  const [position, setPosition] = useState({ left: 0, top: 0, width, maxHeight: height });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    if (!open || !anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const horizontal = anchor.closest(scrollContainerSelector ?? '.work-table-scroll')?.getBoundingClientRect();
      const vertical = anchor.closest(scrollContainerSelector ?? '.work-items-content')?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const left = rect.left + (anchorPoint?.x ?? 0);
      const top = rect.top + (anchorPoint?.y ?? 0);
      const right = anchorPoint ? left + 1 : rect.right;
      const bottom = anchorPoint ? top : rect.bottom;
      if (right <= Math.max(0, horizontal?.left ?? 0) || left >= Math.min(viewportWidth, horizontal?.right ?? viewportWidth)
        || bottom <= Math.max(0, vertical?.top ?? 0) || top >= Math.min(viewportHeight, vertical?.bottom ?? viewportHeight)) {
        closeRef.current(); return;
      }
      const menuWidth = Math.min(width, Math.max(0, viewportWidth - 24));
      const below = Math.max(0, viewportHeight - bottom - 12);
      const above = Math.max(0, top - 12);
      const flip = placement === 'top' || (placement === 'auto' && below < height && above > below);
      const maxHeight = Math.min(height, flip ? above : below);
      const alignedLeft = align === 'center' ? (left + right - menuWidth) / 2 : left;
      const next = { left: Math.max(12, Math.min(alignedLeft, viewportWidth - menuWidth - 12)), top: flip ? top - maxHeight - gap : bottom + gap, width: menuWidth, maxHeight };
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !anchor.contains(event.target) && !menuRef.current?.contains(event.target)) closeRef.current();
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(anchor);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    document.addEventListener('pointerdown', dismiss, { capture: true });
    document.addEventListener('focusin', dismiss);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, { capture: true });
      document.removeEventListener('pointerdown', dismiss, { capture: true });
      document.removeEventListener('focusin', dismiss);
    };
  }, [open, anchorRef, menuRef, width, height, scrollContainerSelector, anchorPoint, placement, gap, align]);
  return { ...position, position: 'fixed' as const, height };
}
