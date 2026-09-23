import { cloudEnvironment, conversations, type Conversation, type ConversationEnvironment } from './conversation-history';
import { codemNavigationConversations, codemNavigationDirectories } from './codem-navigation-data';
import { codeMSpaces } from './codem-spaces';
import { getWorkItemView, isWorkItemSlug, type WorkItem } from './work-items-data';
import type { ApplicationSlug } from './work-item-navigation';
import { resolveSettingsConversation, type SettingsConversation } from './settings-chat';
import { buildWorkViewConversation, restoreWorkViewContext, type WorkViewContext, type WorkViewConversation } from './work-view-chat';

export const workItemQueries = [
  { id: 'workflow', title: '看下流程上哪些环节可以托管给 CodeM', summary: '可以先从流程进度跟踪、评审材料整理和待办提醒开始托管。需要人工决策的评审结论、验收与节点流转，保留负责人确认。' },
  { id: 'delays', title: '本周可能延期的任务有哪些', summary: '建议先检查本周到期但尚未完成的任务，再对照剩余工作量、负责人排期和前置依赖整理风险清单，并逐项确认新的预计完成时间。' },
  { id: 'blockers', title: '哪些任务阻塞了，分析原因并提供解决方案', summary: '可以从前置依赖、评审反馈和资源安排三个方面排查阻塞。为每个阻塞项记录原因、影响范围、解决动作与负责人，并约定下一次跟进时间。' },
  { id: 'impact', title: '如果某项任务延期 2 天会有什么影响', summary: '建议沿任务的后续依赖检查两天延期是否会消耗排期缓冲、影响评审或推迟发布，再与相关负责人确认并行推进、调整范围或重新排期的方案。' },
  { id: 'forecast', title: '生成一份未来 2 周的延期风险预告，并提供纠偏方案', summary: '风险预告可以按未来两周的交付节点整理，列出风险事项、当前进度、关键依赖与影响范围。纠偏方案分别明确提前评审、拆分交付和调整资源的负责人及完成时间。' },
] as const;

export const wbsQueries = [
  { id: 'wbsbreakdown', title: '根据项目目标拆分阶段、任务和里程碑', summary: '建议按交付目标拆分阶段，为每个阶段列出任务、负责人和验收标准，再确定关键里程碑与完成条件。' },
  { id: 'wbsschedule', title: '根据截止日期生成任务排期', summary: '可以从目标交付日期倒排里程碑，结合任务工作量、工作日和负责人可用时间安排开始与结束日期，并预留评审和风险缓冲。' },
  { id: 'wbsdependencies', title: '检查任务依赖，找出冲突和遗漏', summary: '建议逐项核对前序依赖、依赖类型和时间间隔，检查循环依赖、前置任务缺失及开始日期冲突，再整理需要调整的排期。' },
  { id: 'wbsworkload', title: '根据负责人工作量平衡任务安排', summary: '可以按负责人汇总同一时间段的任务，识别负载重叠，并通过调整任务顺序、拆分工作或重新分配负责人平衡安排。' },
  { id: 'wbsreplan', title: '调整延期任务并重新编排后续计划', summary: '建议沿延期任务的依赖链重新计算后续日期，保留可并行任务，标明受影响的里程碑，并在发布调整后的计划前确认负责人和交付时间。' },
] as const;
const allWorkItemQueries = [...workItemQueries, ...wbsQueries];

export type WorkItemConversation = Conversation & { workItem: { title: string; href: string } };
export type HomeConversation = Conversation & { home: { title: 'Home'; href: '/home' } };
export type WorkItemChatSource = { slug: ApplicationSlug; item: WorkItem };

const chatStoragePrefix = 'meego:work-item-chat:v1:';
const chatHistoryKey = `${chatStoragePrefix}history`;
const workspaceVisitsKey = `${chatStoragePrefix}workspace-visits`;
const chatStorageFallback = new Map<string, string>();
const historyListeners = new Set<() => void>();
type HistoryEntry = { id: string; updatedAt: number; navigationOrder: number };
type ContextConversation = Conversation & { workItem?: WorkItemConversation['workItem']; view?: WorkViewConversation['view']; settings?: SettingsConversation['settings']; home?: HomeConversation['home'] };
function conversationSource(conversation: ContextConversation | undefined) {
  return conversation?.workItem ?? conversation?.view ?? conversation?.settings ?? conversation?.home;
}
function readChatStorage(key: string) {
  if (chatStorageFallback.has(key)) return chatStorageFallback.get(key)!;
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}
function writeChatStorage(key: string, value: string) {
  try { window.localStorage.setItem(key, value); chatStorageFallback.delete(key); }
  catch { chatStorageFallback.set(key, value); }
}

function readHistoryEntries(): HistoryEntry[] {
  const entries = new Map<string, HistoryEntry>();
  try {
    const saved: unknown = JSON.parse(readChatStorage(chatHistoryKey) ?? '[]');
    if (Array.isArray(saved)) for (const [index, entry] of saved.entries()) {
      if (entry && typeof entry.id === 'string' && Number.isFinite(entry.updatedAt) && entry.updatedAt >= 0 && conversationSource(resolveConversation(entry.id))) {
        if ((entries.get(entry.id)?.updatedAt ?? -1) < entry.updatedAt) entries.set(entry.id, {
          id: entry.id, updatedAt: entry.updatedAt,
          navigationOrder: Number.isSafeInteger(entry.navigationOrder) ? entry.navigationOrder : -index,
        });
      }
    }
  } catch { /* A malformed history index must not hide the original conversations. */ }

  // Older versions saved source associations and messages without a history index.
  const keys = new Set(chatStorageFallback.keys());
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(chatStoragePrefix)) keys.add(key);
    }
  } catch { /* The in-memory fallback remains available when storage is blocked. */ }
  for (const key of keys) {
    const suffix = key.slice(chatStoragePrefix.length);
    const isSource = suffix.startsWith('/apps/') || suffix === '/settings' || suffix === '/home';
    const id = isSource ? readChatStorage(key) : suffix.startsWith('messages:') ? suffix.slice('messages:'.length) : null;
    const conversation = resolveConversation(id);
    const source = conversationSource(conversation);
    if (!conversation || !source || (isSource && suffix !== source.href)) continue;
    if (!entries.has(conversation.id)) entries.set(conversation.id, { id: conversation.id, updatedAt: 0, navigationOrder: -entries.size });
  }
  return [...entries.values()].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getConversationHistory(now = new Date()): Conversation[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today);
  week.setDate(week.getDate() - (week.getDay() + 6) % 7);
  return [...readHistoryEntries().map(entry => ({
    ...resolveConversation(entry.id)!,
    group: entry.updatedAt >= today.getTime() ? '今天' as const : entry.updatedAt >= week.getTime() ? '本周' as const : '更早' as const,
  })), ...conversations];
}

// Sidebar order is assigned once; opening a chat only updates its recent-history time.
export function getNavigationConversationHistory(): Conversation[] {
  return readHistoryEntries().sort((left, right) => right.navigationOrder - left.navigationOrder || left.id.localeCompare(right.id))
    .map(entry => resolveConversation(entry.id)!);
}

function readWorkspaceVisits(): [string, number][] {
  try {
    const saved: unknown = JSON.parse(readChatStorage(workspaceVisitsKey) ?? '[]');
    return Array.isArray(saved) ? saved.filter((entry): entry is [string, number] => Array.isArray(entry)
      && typeof entry[0] === 'string' && Boolean(entry[0]) && Number.isFinite(entry[1]) && entry[1] >= 0) : [];
  } catch { return []; }
}

// Recent activity is independent of the sidebar's stable navigation order.
export function getRecentWorkspaceIds(): string[] {
  const activity = readWorkspaceVisits();
  for (const entry of readHistoryEntries()) {
    const source = conversationSource(resolveConversation(entry.id));
    if (source) activity.push([`source:${source.href}`, entry.updatedAt]);
  }
  activity.sort((left, right) => right[1] - left[1]);
  return [...new Set(activity.map(([id]) => id))];
}

export function rememberWorkspaceVisit(id: string) {
  writeChatStorage(workspaceVisitsKey, JSON.stringify([[id, Date.now()], ...readWorkspaceVisits().filter(([savedId]) => savedId !== id)]));
  historyListeners.forEach(listener => listener());
}

export function subscribeConversationHistory(listener: () => void) {
  historyListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(chatStoragePrefix)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => { historyListeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

export function rememberWorkItemConversation(conversation: Conversation) {
  const resolved = resolveConversation(conversation.id);
  const source = conversationSource(resolved);
  if (!resolved) return;
  if (!source) {
    const directory = codemNavigationDirectories.find(project => project.conversations.some(chat => chat.id === resolved.id));
    if (directory) rememberWorkspaceVisit(directory.id);
    return;
  }
  const history = readHistoryEntries();
  const navigationOrder = history.find(entry => entry.id === resolved.id)?.navigationOrder
    ?? history.reduce((maximum, entry) => Math.max(maximum, entry.navigationOrder), 0) + 1;
  const entries = history.filter(entry => entry.id !== resolved.id);
  writeChatStorage(`${chatStoragePrefix}${source.href}`, resolved.id);
  writeChatStorage(chatHistoryKey, JSON.stringify([{ id: resolved.id, updatedAt: Date.now(), navigationOrder }, ...entries]));
  historyListeners.forEach(listener => listener());
}

export function findWorkItemConversation({ slug, item }: WorkItemChatSource) {
  const href = `/apps/${slug}/${item.id}`;
  const conversation = resolveConversation(readChatStorage(`${chatStoragePrefix}${href}`));
  return conversation?.workItem?.href === href ? conversation : undefined;
}

export function loadWorkItemMessages(conversationId: string | null): string[] {
  if (!canContinueConversation(conversationId)) return [];
  try {
    const messages: unknown = JSON.parse(readChatStorage(`${chatStoragePrefix}messages:${conversationId}`) ?? '[]');
    return Array.isArray(messages) ? messages.filter((message): message is string => typeof message === 'string' && Boolean(message.trim())) : [];
  } catch { return []; }
}

export function appendWorkItemMessage(conversationId: string, prompt: string) {
  const existing = loadWorkItemMessages(conversationId);
  if (!canContinueConversation(conversationId) || !prompt.trim()) return existing;
  const messages = [...existing, prompt.trim()];
  writeChatStorage(`${chatStoragePrefix}messages:${conversationId}`, JSON.stringify(messages));
  const conversation = resolveConversation(conversationId);
  if (conversation) rememberWorkItemConversation(conversation);
  return messages;
}

// Sidebar development tasks use the same persisted follow-up flow as source conversations.
export function canContinueConversation(conversationId: string | null) {
  return Boolean(conversationSource(resolveConversation(conversationId))
    || codemNavigationConversations.some(conversation => conversation.id === conversationId));
}

export function createWorkItemConversation(slug: ApplicationSlug, item: WorkItem, prompt: string, context: 'work-item' | 'wbs' = 'work-item'): WorkItemConversation {
  const title = prompt.trim();
  const query = allWorkItemQueries.find(query => query.title === title);
  // Include the source and question in the address so a shared URL also works on a fresh device.
  const id = `work-item--${slug}--${item.id}--${query?.id ?? `${context === 'wbs' ? 'wbsask' : 'ask'}--${title}`}`;
  return {
    id, group: '今天', title,
    summary: query?.summary ?? (context === 'wbs' ? '可以结合当前工作项的 WBS 计划表，梳理阶段、任务拆分、负责人、计划日期和前序依赖，再形成可确认的排期调整建议。' : '可以结合这个工作项的目标、当前流程和关联任务梳理需求，明确需要补充的信息、建议的下一步行动及负责人。'),
    workItem: { title: item.title, href: `/apps/${slug}/${item.id}` },
  };
}

export function createWorkViewConversation(context: WorkViewContext, prompt: string): WorkViewConversation {
  const conversation = buildWorkViewConversation(context, prompt);
  writeChatStorage(`${chatStoragePrefix}view:${conversation.id}`, JSON.stringify(context));
  return conversation;
}

function homeConversation(id: string, prompt: string): HomeConversation {
  return {
    id, group: '今天', title: prompt,
    summary: '已记录你的需求。你可以继续补充相关背景、时间要求或期望的产出。',
    home: { title: 'Home', href: '/home' },
  };
}

export function createHomeConversation(prompt: string, environment = cloudEnvironment): HomeConversation | undefined {
  const title = prompt.trim();
  if (!title) return;
  const id = `home--${crypto.randomUUID()}`;
  writeChatStorage(`${chatStoragePrefix}conversation:${id}`, JSON.stringify({ prompt: title }));
  writeChatStorage(`${chatStoragePrefix}environment:${id}`, JSON.stringify(environment));
  return { ...homeConversation(id, title), environment };
}

export function resolveConversation(id: string | null): ContextConversation | undefined {
  const conversation = resolveConversationContext(id);
  if (!conversation) return;
  let environment = conversation.environment ?? cloudEnvironment;
  try {
    const saved = JSON.parse(readChatStorage(`${chatStoragePrefix}environment:${id}`) ?? 'null');
    if (saved?.device === null) environment = cloudEnvironment;
    else if (saved && typeof saved.device === 'string' && saved.device.trim()) {
      environment = { device: saved.device, project: typeof saved.project === 'string' && saved.project.trim() ? saved.project : null };
    }
    const space = codeMSpaces.find(space => space.id === saved?.spaceId);
    if (space) environment = { ...environment, spaceId: space.id };
  } catch { /* Keep the conversation's default when saved metadata is invalid. */ }
  return { ...conversation, environment };
}

export function setConversationEnvironment(id: string, environment: ConversationEnvironment) {
  if (!resolveConversation(id)) return;
  writeChatStorage(`${chatStoragePrefix}environment:${id}`, JSON.stringify(environment));
  historyListeners.forEach(listener => listener());
}

function resolveConversationContext(id: string | null): ContextConversation | undefined {
  const existing = conversations.find(conversation => conversation.id === id) ?? codemNavigationConversations.find(conversation => conversation.id === id);
  if (existing) return existing;
  const settings = resolveSettingsConversation(id);
  if (settings) return settings;
  if (id?.startsWith('work-view--')) {
    const match = /^work-view--([a-z0-9]+(?:-[a-z0-9]+)*)--ask--([\s\S]+)$/.exec(id);
    if (!match || !isWorkItemSlug(match[1]) || !match[2].trim() || match[2].length > 2000) return;
    let saved: unknown;
    try { saved = JSON.parse(readChatStorage(`${chatStoragePrefix}view:${id}`) ?? 'null'); } catch { /* Shared URLs can fall back to the current view data. */ }
    const conversation = buildWorkViewConversation(restoreWorkViewContext(match[1], saved), match[2]);
    return conversation.id === id ? conversation : undefined;
  }
  if (id?.startsWith('home--')) {
    try {
      const saved = JSON.parse(readChatStorage(`${chatStoragePrefix}conversation:${id}`) ?? 'null');
      if (saved && typeof saved.prompt === 'string' && saved.prompt.trim()) return homeConversation(id, saved.prompt.trim());
    } catch { /* An invalid saved chat must not prevent other conversations from loading. */ }
    return;
  }
  const match = /^work-item--([a-z0-9-]+)--([1-9]\d*)--([a-z]+)(?:--([\s\S]+))?$/.exec(id ?? '');
  if (!match || !isWorkItemSlug(match[1])) return;
  const item = getWorkItemView(match[1]).items.find(item => item.id === Number(match[2]));
  const prompt = ['ask', 'wbsask'].includes(match[3]) ? match[4]?.trim() : !match[4] ? allWorkItemQueries.find(query => query.id === match[3])?.title : undefined;
  if (!item || !prompt || prompt.length > 2000) return;
  const conversation = createWorkItemConversation(match[1], item, prompt, match[3].startsWith('wbs') ? 'wbs' : 'work-item');
  return conversation.id === id ? conversation : undefined;
}
