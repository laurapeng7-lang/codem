import { useLayoutEffect, useRef, type HTMLAttributes, type RefObject } from 'react';
import { getCommentMentions } from './work-item-comment-mentions';
import { getWorkItemAgent } from './work-item-agents';

export type CommentEditorHandle = { focus: (options?: FocusOptions) => void; setSelectionRange: (start: number, end: number) => void };

function textOffset(root: Node, target: Node, offset: number) {
  let result = 0;
  function visit(node: Node): boolean {
    if (node === target) {
      result += node.nodeType === 3 ? offset : Array.from(node.childNodes).slice(0, offset).reduce((length, child) => length + (child.textContent?.length ?? 0), 0);
      return true;
    }
    if (node.nodeType === 3) result += node.textContent?.length ?? 0;
    else for (const child of Array.from(node.childNodes)) if (visit(child)) return true;
    return false;
  }
  visit(root);
  return result;
}

export function readCommentEditorSelection(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
    const end = editor.textContent?.length ?? 0;
    return { start: end, end };
  }
  const anchor = textOffset(editor, selection.anchorNode, selection.anchorOffset);
  const focus = textOffset(editor, selection.focusNode, selection.focusOffset);
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

function setSelection(editor: HTMLElement, start: number, end: number) {
  const textNodes: Node[] = [];
  function visit(node: Node) {
    if (node.nodeType === 3) textNodes.push(node);
    else Array.from(node.childNodes).forEach(visit);
  }
  visit(editor);
  function point(offset: number): [Node, number] {
    for (const node of textNodes) {
      const length = node.textContent?.length ?? 0;
      if (offset <= length) return [node, offset];
      offset -= length;
    }
    return [editor, editor.childNodes.length];
  }
  const [anchor, anchorOffset] = point(start);
  const [focus, focusOffset] = point(end);
  window.getSelection()?.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
}

/** Keep native editing/IME, adding the same mention spans used by sent comments. */
export function CommentMentionEditor({ value, inputRef, onChange, onSelectionChange, placeholder, onBlur, onKeyDown, ...aria }: {
  value: string;
  inputRef: RefObject<CommentEditorHandle | null>;
  onChange: (value: string, start: number, end: number) => void;
  onSelectionChange: (value: string, start: number, end: number) => void;
  placeholder: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>) {
  const editorRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);

  function sync(editor: HTMLElement, text: string) {
    const nodes: Node[] = [];
    let cursor = 0;
    for (const mention of getCommentMentions(text)) {
      if (mention.start > cursor) nodes.push(document.createTextNode(text.slice(cursor, mention.start)));
      const span = document.createElement('span');
      span.className = 'work-comment-mention';
      span.style.color = getWorkItemAgent(mention.person)?.color ?? '#611fd6';
      span.textContent = text.slice(mention.start, mention.end);
      nodes.push(span);
      cursor = mention.end;
    }
    if (cursor < text.length) nodes.push(document.createTextNode(text.slice(cursor)));
    const previous = Array.from(editor.childNodes);
    if (previous.length === nodes.length && previous.every((node, index) => node.isEqualNode(nodes[index]))) return;
    const selection = readCommentEditorSelection(editor);
    const focused = document.activeElement === editor;
    editor.replaceChildren(...nodes);
    if (focused) setSelection(editor, Math.min(selection.start, text.length), Math.min(selection.end, text.length));
  }

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    inputRef.current = { focus: options => editor.focus(options), setSelectionRange: (start, end) => setSelection(editor, start, end) };
    if (!composing.current) sync(editor, value);
    return () => { inputRef.current = null; };
  }, [value, inputRef]);

  function update(editor: HTMLDivElement) {
    const text = (editor.textContent ?? '').replace(/[\r\n]+/g, ' ').slice(0, 2000);
    const selection = readCommentEditorSelection(editor);
    if (!composing.current) sync(editor, text);
    onChange(text, Math.min(selection.start, text.length), Math.min(selection.end, text.length));
  }
  return <div {...aria} ref={editorRef} className="work-comment-input" contentEditable suppressContentEditableWarning spellCheck={false} data-placeholder={placeholder} data-empty={!value || undefined}
    onInput={event => update(event.currentTarget)} onBlur={onBlur}
    onSelect={event => { const editor = event.currentTarget; const selection = readCommentEditorSelection(editor); onSelectionChange(editor.textContent ?? '', selection.start, selection.end); }}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; update(event.currentTarget); }}
    onPaste={event => {
      event.preventDefault();
      const editor = event.currentTarget;
      const selection = readCommentEditorSelection(editor);
      const room = Math.max(0, 2000 - (editor.textContent?.length ?? 0) + selection.end - selection.start);
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain').replace(/[\r\n]+/g, ' ').slice(0, room));
      update(editor);
    }} onKeyDown={event => { if (!composing.current) onKeyDown?.(event); }} />;
}
