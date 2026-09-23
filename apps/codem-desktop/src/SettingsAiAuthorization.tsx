import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { aiApplicationSpaces, type AiApplicationSpaceId } from './settings-ai';
import { useWorkItemTableMenu } from './useWorkItemTableMenu';

export function SettingsAiAuthorization({ authorizedSpaces, onAuthorize }: {
  authorizedSpaces: AiApplicationSpaceId[];
  onAuthorize: (space: AiApplicationSpaceId) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const available = aiApplicationSpaces.filter(space => !authorizedSpaces.includes(space.id));
  const position = useWorkItemTableMenu({ open, anchorRef: trigger, menuRef: menu, width: 256, height: available.length * 40 + 14, scrollContainerSelector: '.settings-ai-panel', onClose: () => setOpen(false) });
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (open) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open]);

  return <section className="settings-ai-group settings-ai-authorizations" aria-labelledby="settings-ai-authorizations-title">
    <div className="settings-ai-option"><div className="settings-ai-option-copy">
      <h3 id="settings-ai-authorizations-title">AI 应用空间授权</h3>
      <p>授权后，相应空间内的 AI 助手应用可以通过您的身份运行</p>
    </div></div>
    <div className="settings-ai-authorization-list">
      <ul aria-label="已授权空间">{aiApplicationSpaces.filter(space => authorizedSpaces.includes(space.id)).map(space => <li key={space.id} className="settings-ai-authorized-space" data-authorized-space={space.id}>
        <img src={space.icon} width="24" height="24" alt="" /><div><span>{space.name}</span><span>已授权</span></div>
      </li>)}</ul>
      <button ref={trigger} type="button" className="settings-ai-authorize-add" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'settings-ai-authorization-menu' : undefined} aria-disabled={!available.length} title={available.length ? '添加授权空间' : '所有空间均已授权'}
        onClick={() => { if (available.length) setOpen(value => !value); }} onKeyDown={event => { if (available.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
        <img src="/assets/figma/work-items/plus.svg" width="16" height="16" alt="" /><span>添加授权空间</span>
      </button>
    </div>
    {open && createPortal(<div ref={menu} id="settings-ai-authorization-menu" role="menu" aria-label="选择授权空间" className="settings-ai-menu settings-ai-authorization-menu" style={position} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === 'Tab') close();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>{available.map(space => <button key={space.id} type="button" role="menuitem" aria-label={`授权 ${space.name}`} onClick={() => { onAuthorize(space.id); close(); }}>
      <img src={space.icon} width="24" height="24" alt="" /><span>{space.name}</span>
    </button>)}</div>, document.body)}
  </section>;
}
