import { useEffect, useRef } from 'react';
import assets from './assets.json';

const groups = [
  [{ label: '企业管理平台', icon: 'globe' }, { label: '开放平台', icon: 'terminal' }],
  [{ label: '偏好设置', icon: 'settings' }, { label: 'MCP 配置', icon: 'mcp' }],
];

export function ProfileMenu({ open, onOpenChange, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (label: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusLast = useRef(false);

  useEffect(() => {
    if (!open) return;
    const items = container.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[focusLast.current ? items.length - 1 : 0]?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      trigger.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onOpenChange]);

  return <div className="profile-container" ref={container} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false);
  }}>
    <button type="button" className="profile" id="profile-menu-trigger" ref={trigger}
      aria-label="当前用户" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'profile-menu' : undefined}
      onClick={() => { focusLast.current = false; onOpenChange(!open); }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        focusLast.current = event.key === 'ArrowUp';
        if (open) {
          const items = container.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
          items?.[focusLast.current ? items.length - 1 : 0]?.focus({ preventScroll: true });
        } else onOpenChange(true);
      }}
    ><img src={assets['sidebar/img']} alt="用户头像" width="24" height="24" /></button>
    {open && <div id="profile-menu" className="profile-menu" role="menu" aria-labelledby="profile-menu-trigger" onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus({ preventScroll: true });
    }}>
      {groups.map((group, index) => <div className="profile-menu-group" role="group" key={index}>
        {group.map(item => <button type="button" role="menuitem" key={item.icon} onClick={() => {
          onOpenChange(false);
          onSelect(item.label);
          trigger.current?.focus({ preventScroll: true });
        }}>
          <img src={`/assets/figma/profile-menu/${item.icon}.svg`} width="20" height="20" alt="" draggable="false" />
          <span>{item.label}</span>
        </button>)}
      </div>)}
    </div>}
  </div>;
}
