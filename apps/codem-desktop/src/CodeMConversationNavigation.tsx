import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { conversations, conversationDisplayTitle, type Conversation } from './conversation-history';
import { getNavigationConversationHistory, resolveConversation, subscribeConversationHistory } from './work-item-chat';

function standaloneConversations(selected: string | null): Conversation[] {
  const history = getNavigationConversationHistory();
  const current = resolveConversation(selected);
  if (current?.home && !history.some(entry => entry.id === current.id)) history.unshift(current);
  const seen = new Set<string>();
  return [...history, ...conversations].flatMap(entry => {
    const conversation = resolveConversation(entry.id);
    if (!conversation || conversation.workItem || conversation.settings || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [conversation];
  });
}

export function CodeMConversationNavigation({ selected, active, onOpenConversation }: {
  selected: string | null; active: boolean; onOpenConversation: (conversation: Conversation) => void;
}) {
  const [history, setHistory] = useState(() => standaloneConversations(selected));
  const selectedRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const update = () => setHistory(standaloneConversations(selected));
    const unsubscribe = subscribeConversationHistory(update);
    update();
    return unsubscribe;
  }, [selected]);
  useLayoutEffect(() => {
    if (active) selectedRow.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, selected]);
  return <>{history.map(conversation => {
    const device = conversation.environment?.device;
    const environment = device ? `${device}${conversation.environment?.project ? ` · ${conversation.environment.project}` : ' · Chat mode'}` : 'Cloud';
    return <button key={conversation.id} type="button" className="codem-nav-row codem-conversation-row"
      ref={selected === conversation.id ? selectedRow : undefined} data-conversation-id={conversation.id}
      title={`${conversation.title}\n${environment}`} aria-current={selected === conversation.id ? 'page' : undefined}
      onClick={() => { if (selected !== conversation.id) onOpenConversation(conversation); }}>
      <span className="codem-nav-glyph"><img className="codem-nav-chat-icon" src="/assets/figma/work-item-drawer/chat.svg"
        width="16" height="16" alt="" draggable="false" /></span>
      <span className="codem-nav-label">{conversationDisplayTitle(conversation.title)}</span>
    </button>;
  })}</>;
}
