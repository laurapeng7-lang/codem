export type PromptSegment = { text: string; emphasized?: boolean };
export const promptText = (segments: readonly PromptSegment[]) => segments.map(segment => segment.text).join('');

export function workItemPromptSegments(itemTitle: string, fieldName: string): PromptSegment[] {
  return [
    { text: '请帮我根据项目上下文和历史数据，给出 ' },
    { text: itemTitle, emphasized: true },
    { text: ' 的 ' },
    { text: fieldName, emphasized: true },
    { text: ' 最佳建议值，我的额外要求是：' },
  ];
}

// Restore emphasis for saved and shared prompts, which also exist as plain text.
export function sentPromptSegments(prompt: string): PromptSegment[] {
  const match = /^(请帮我根据项目上下文和历史数据，给出 )([\s\S]+?)( 的 )([^\r\n]+?)( 最佳建议值，我的额外要求是：)([\s\S]*)$/.exec(prompt);
  return match ? [
    { text: match[1] }, { text: match[2], emphasized: true },
    { text: match[3] }, { text: match[4], emphasized: true },
    { text: match[5] + match[6] },
  ] : [{ text: prompt }];
}

// Keep the editor's plain text and emphasis together, including native line breaks.
export function readPromptSegments(root: HTMLElement): PromptSegment[] {
  const segments: PromptSegment[] = [];
  function append(text: string, emphasized = false) {
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous && Boolean(previous.emphasized) === emphasized) previous.text += text;
    else segments.push({ text, ...(emphasized ? { emphasized: true } : {}) });
  }
  function children(parent: Node, emphasized: boolean) {
    const nodes = Array.from(parent.childNodes);
    nodes.forEach((node, index) => {
      if (node.nodeType === 3) { append((node.textContent ?? '').replace(/\u00a0/g, ' '), emphasized); return; }
      if (!(node instanceof HTMLElement)) return;
      if (node.tagName === 'BR') {
        // Browsers leave a final BR as a caret placeholder in an empty line.
        if (index < nodes.length - 1) append('\n');
        return;
      }
      const block = node.tagName === 'DIV' || node.tagName === 'P';
      if (block && index > 0) append('\n');
      children(node, emphasized || node.tagName === 'STRONG');
      if (block && index < nodes.length - 1 && !(nodes[index + 1] instanceof HTMLElement && ['DIV', 'P'].includes((nodes[index + 1] as HTMLElement).tagName))) append('\n');
    });
  }
  children(root, false);
  return segments;
}
