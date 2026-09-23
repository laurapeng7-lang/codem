import { useEffect, useMemo, useState } from 'react';
import assets from './assets.json';
import type { Conversation } from './conversation-history';
import { createWorkItemConversation, getNavigationConversationHistory, resolveConversation, subscribeConversationHistory, workItemQueries, type WorkItemChatSource } from './work-item-chat';
import { applicationFromPath, getWorkItemTitleIcon } from './work-item-navigation';
import { getWorkItemView } from './work-items-data';

export type CodeMNavigationDraft = { source: WorkItemChatSource; title: string };
type Source = { href: string; title: string; icon: string; color: string };
export type SourceEntry = { id: string; title: string; conversation?: Conversation };
export type SourceGroup = { source: Source; entries: SourceEntry[] };

// Shared examples appear on first use without writing to the user's saved history.
const defaultWorkItemConversations = workItemQueries.slice(0, 3).map(query =>
  createWorkItemConversation('epic', getWorkItemView('epic').items[0], query.title));

function workItemSource(source: { href: string; title: string }): Source | undefined {
  const application = applicationFromPath(source.href);
  if (!application) return;
  const icon = getWorkItemTitleIcon(application);
  return { ...source, icon: assets[icon.icon], color: icon.color };
}

// Group by the stable source address, so equal titles never merge unrelated items.
export function buildCodeMSourceGroups(history: readonly Conversation[], selected: string | null, draft?: CodeMNavigationDraft): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  const add = (source: Source, entry: SourceEntry) => {
    let group = groups.get(source.href);
    if (!group) { group = { source, entries: [] }; groups.set(source.href, group); }
    group.entries.push(entry);
  };
  if (draft) {
    const source = workItemSource({ href: `/apps/${draft.source.slug}/${draft.source.item.id}`, title: draft.source.item.title });
    if (source) add(source, { id: `draft:${source.href}`, title: draft.title.trim() || '新对话' });
  }
  const current = resolveConversation(selected);
  const candidates = current && !history.some(entry => entry.id === current.id) ? [current, ...history] : history;
  const seen = new Set<string>();
  for (const entry of [...defaultWorkItemConversations, ...candidates]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const conversation = resolveConversation(entry.id);
    const source = conversation?.workItem ? workItemSource(conversation.workItem)
      : conversation?.view ? workItemSource(conversation.view)
      : conversation?.settings ? { ...conversation.settings, icon: '/assets/settings/settings.svg', color: '#646a73' }
      : conversation?.home ? { ...conversation.home, icon: assets['sidebar/imgIconHomeFilled'], color: '#0046fe' } : undefined;
    if (source && conversation) add(source, { id: conversation.id, title: conversation.title, conversation });
  }
  return [...groups.values()];
}

export function useCodeMSourceGroups(selected: string | null, draft?: CodeMNavigationDraft) {
  const [history, setHistory] = useState(getNavigationConversationHistory);
  useEffect(() => {
    const update = () => setHistory(getNavigationConversationHistory());
    const unsubscribe = subscribeConversationHistory(update);
    update();
    return unsubscribe;
  }, []);
  const groups = useMemo(() => buildCodeMSourceGroups(history, selected, draft), [history, selected, draft]);
  return groups;
}
