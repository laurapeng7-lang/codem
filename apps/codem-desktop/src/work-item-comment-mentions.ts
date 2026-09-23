import { workItemPeople, type WorkItemOwner } from './WorkItemOwnerPicker';
import { getWorkItemAgent, workItemAgents } from './work-item-agents';

export const commentMentionPeople: readonly WorkItemOwner[] = [...workItemAgents, ...workItemPeople];
export type CommentMentionQuery = { start: number; end: number; query: string };
export type CommentMention = { start: number; end: number; person: WorkItemOwner };
export type WorkItemCommentTask = { id: string; agentId: string; prompt: string };
export type WorkItemComment = { id: string; text: string; mentions: CommentMention[]; tasks: WorkItemCommentTask[] };
export const initialCommentTask: WorkItemCommentTask = { id: 'initial-codem', agentId: 'agent-codem', prompt: '@CodeM 帮我找一下这个反馈关联的原声' };
export const commentReplyDelay = 1600;
export const commentReplyStagger = 350;

const emailPrefix = /[a-zA-Z0-9_.+\-]/;
const tokenSeparator = /[\s@，。！？、；：,!?;:()[\]{}]/;

/** Match the @ token at the caret, excluding email addresses and selected text. */
export function getCommentMentionQuery(value: string, caret: number, selectionEnd = caret): CommentMentionQuery | null {
  if (caret !== selectionEnd) return null;
  const start = value.lastIndexOf('@', caret - 1);
  if (start < 0 || caret <= start || (start > 0 && emailPrefix.test(value[start - 1]))) return null;
  const query = value.slice(start + 1, caret);
  if (tokenSeparator.test(query)) return null;
  // Replacing an existing known mention consumes its name, but inserting @ in the
  // middle of a sentence must preserve the text that follows the caret.
  const existing = query && commentMentionPeople.find(person => value.slice(start + 1, start + 1 + person.name.length).toLowerCase() === person.name.toLowerCase()
    && !/[a-zA-Z0-9_]/.test(value[start + 1 + person.name.length] ?? ''));
  const end = existing ? Math.max(caret, start + 1 + existing.name.length) : caret;
  return { start, end, query };
}

export function insertCommentMention(value: string, query: CommentMentionQuery, person: WorkItemOwner) {
  const prefix = value.slice(0, query.start);
  const suffix = value.slice(query.end);
  const mention = `@${person.name}`;
  const space = suffix.startsWith(' ') ? '' : ' ';
  return { value: `${prefix}${mention}${space}${suffix}`, caret: prefix.length + mention.length + 1 };
}

export function getCommentMentions(value: string): CommentMention[] {
  const mentions: CommentMention[] = [];
  // Names are fixed local identities; compare exact tokens so @CodeMing is not CodeM.
  const names = commentMentionPeople.map(person => person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const pattern = new RegExp(`@(${names})(?![a-zA-Z0-9_])`, 'gi');
  for (const match of value.matchAll(pattern)) {
    const start = match.index;
    if (start > 0 && emailPrefix.test(value[start - 1])) continue;
    const person = commentMentionPeople.find(person => person.name.toLowerCase() === match[1].toLowerCase());
    if (person) mentions.push({ start, end: start + match[0].length, person });
  }
  return mentions;
}

export function createWorkItemComment(value: string, id: string): WorkItemComment {
  const text = value.trim();
  const mentions = getCommentMentions(text);
  const agents = [...new Map(mentions.flatMap(({ person }) => {
    const agent = getWorkItemAgent(person);
    return agent ? [[agent.id, agent] as const] : [];
  })).values()];
  return { id, text, mentions, tasks: agents.map(agent => ({ id: `${id}:${agent.id}`, agentId: agent.id, prompt: text })) };
}
