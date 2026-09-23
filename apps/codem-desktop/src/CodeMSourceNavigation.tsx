import { useLayoutEffect, useRef, useState } from 'react';
import { conversationDisplayTitle, type Conversation } from './conversation-history';
import { useCodeMSourceGroups, type CodeMNavigationDraft, type SourceEntry, type SourceGroup } from './codem-source-groups';

export { buildCodeMSourceGroups, type CodeMNavigationDraft } from './codem-source-groups';

function CodeMSourceGroup({ group, selected, active, onOpenConversation }: {
  group: SourceGroup; selected: string | null; active: boolean;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  const [expanded, setExpanded] = useState(() => group.source.href !== '/settings');
  const [showAll, setShowAll] = useState(false);
  const selectedRow = useRef<HTMLButtonElement>(null);
  const selectedEntry = group.entries.find(entry => !entry.conversation || entry.id === selected);
  const selectedId = selectedEntry?.id;
  const selectedIndex = selectedEntry ? group.entries.indexOf(selectedEntry) : -1;
  const listId = `codem-source-${encodeURIComponent(group.source.href)}`;
  const isWorkItem = group.source.href.startsWith('/apps/');
  useLayoutEffect(() => {
    if (!selectedId) return;
    setExpanded(true);
    if (selectedIndex >= 5) setShowAll(true);
  }, [selectedId, selectedIndex]);
  useLayoutEffect(() => {
    if (active && expanded && selectedId) selectedRow.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, expanded, showAll, selectedId]);
  const row = (entry: SourceEntry) => <button type="button" key={entry.id}
    ref={entry.id === selectedId ? selectedRow : undefined}
    className="codem-nav-row codem-conversation-row is-nested" title={entry.title}
    data-conversation-id={entry.id} aria-current={entry.id === selectedId ? 'page' : undefined}
    onClick={() => { if (entry.conversation && entry.id !== selected) onOpenConversation(entry.conversation); }}>
    <span className="codem-nav-glyph"><img className={isWorkItem ? 'codem-nav-chat-icon' : undefined}
      src={isWorkItem ? '/assets/figma/work-item-drawer/chat.svg' : '/assets/figma/codem-navigation/codem-cyan.png'} width="16" height="16" alt="" draggable="false" /></span>
    <span className="codem-nav-label">{conversationDisplayTitle(entry.title)}</span>
    {!entry.conversation && <span className="codem-nav-draft-label">草稿</span>}
  </button>;
  return <div className="codem-nav-project codem-nav-source" data-source-href={group.source.href}>
    <button type="button" className="codem-nav-row" title={group.source.title} aria-expanded={expanded}
      aria-controls={listId} onClick={() => setExpanded(value => !value)}>
      <span className="codem-nav-glyph"><span className="codem-nav-source-icon" style={{ background: group.source.color }}>
        <img src={group.source.icon} width="10" height="10" alt="" draggable="false" />
      </span></span>
      <span className="codem-nav-label">{group.source.title}</span>
    </button>
    <div id={listId} className="codem-nav-project-conversations" hidden={!expanded}>
      {group.entries.slice(0, 5).map(row)}
      {group.entries.length > 5 && <>
        <div id={`${listId}-extra`} className="codem-nav-extra-conversations" hidden={!showAll}>{group.entries.slice(5).map(row)}</div>
        <button type="button" className="codem-nav-row codem-nav-more" aria-expanded={showAll} aria-controls={`${listId}-extra`}
          onClick={() => setShowAll(value => !value)}>{showAll ? '收起' : '展开更多'}</button>
      </>}
    </div>
  </div>;
}

export function CodeMSourceNavigation({ selected, draft, active, onOpenConversation }: {
  selected: string | null; draft?: CodeMNavigationDraft; active: boolean;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  const groups = useCodeMSourceGroups(selected, draft).filter(group => group.source.href !== '/home');
  return <>{groups.map(group => <CodeMSourceGroup key={group.source.href} group={group} selected={selected}
    active={active} onOpenConversation={onOpenConversation} />)}</>;
}
