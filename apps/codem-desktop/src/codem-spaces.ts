export const codeMSpaces = [
  { id: 'codem', name: 'CodeM Space', icon: '/assets/figma/new-chat-context/codem-space.svg' },
  { id: 'meego', name: 'Meego', icon: '/assets/figma/new-chat-spaces/meego.svg' },
  { id: 'lark-office', name: 'Lark Office', icon: '/assets/figma/new-chat-spaces/lark-office.svg' },
  { id: 'aily', name: 'Aily', icon: '/assets/figma/new-chat-spaces/aily.svg' },
] as const;

export type CodeMSpaceId = typeof codeMSpaces[number]['id'];
export const defaultCodeMSpace = codeMSpaces[0];

export function resolveCodeMSpace(id: unknown) {
  return codeMSpaces.find(space => space.id === id) ?? defaultCodeMSpace;
}
