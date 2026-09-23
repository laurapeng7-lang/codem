import { useEffect, useRef, useState } from 'react';
import { conversationDisplayTitle, conversationGroups, type Conversation } from './conversation-history';
import { getConversationHistory, subscribeConversationHistory } from './work-item-chat';

export function ConversationHistoryMenu({ selected, onSelect, onClose, triggerId = 'history-trigger', menuId = 'conversation-history-menu' }: {
  selected: string | null;
  onSelect: (conversation: Conversation) => void;
  onClose: () => void;
  triggerId?: string;
  menuId?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState(getConversationHistory);
  useEffect(() => {
    const update = () => setConversations(getConversationHistory());
    const unsubscribe = subscribeConversationHistory(update);
    update();
    return unsubscribe;
  }, []);
  useEffect(() => {
    const selectedItem = menu.current?.querySelector<HTMLButtonElement>('[aria-current="true"]') ?? menu.current?.querySelector<HTMLButtonElement>('button');
    selectedItem?.focus({ preventScroll: true });
    selectedItem?.scrollIntoView({ block: 'nearest' });
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!menu.current?.contains(event.target) && !document.getElementById(triggerId)?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose, triggerId]);

  return <div ref={menu} id={menuId} className="popover history-popover" role="menu" aria-label="对话历史" onKeyDown={event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      document.getElementById(triggerId)?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>
    {conversationGroups.map(group => <div className="history-group" role="group" aria-label={group} key={group}>
      <div className="history-group-label">{group}</div>
      {conversations.filter(conversation => conversation.group === group).map(conversation => <button
        type="button" role="menuitem" key={conversation.id} aria-current={selected === conversation.id ? 'true' : undefined}
        className="history-item" title={conversation.title} onClick={() => onSelect(conversation)}
      >{conversationDisplayTitle(conversation.title)}</button>)}
    </div>)}
  </div>;
}
