import { useLayoutEffect, useRef, type RefObject } from 'react';
import { readPromptSegments, type PromptSegment } from './prompt-content';

export function RichPromptEditor({ segments, inputRef, onChange, onSubmit, placeholder = '今天有什么可以帮到你？' }: {
  segments: PromptSegment[]; inputRef: RefObject<HTMLDivElement | null>;
  onChange: (segments: PromptSegment[]) => void; onSubmit: () => void;
  placeholder?: string;
}) {
  const synced = useRef<PromptSegment[] | null>(null);
  const composing = useRef(false);
  useLayoutEffect(() => {
    const editor = inputRef.current;
    if (!editor || segments === synced.current) return;
    // User edits already live in this DOM: only write it for a new/external draft.
    editor.replaceChildren(...segments.map(segment => {
      if (!segment.emphasized) return document.createTextNode(segment.text);
      const strong = document.createElement('strong');
      strong.textContent = segment.text;
      return strong;
    }));
    synced.current = segments;
  }, [segments, inputRef]);
  function update(editor: HTMLDivElement) {
    const next = readPromptSegments(editor);
    synced.current = next;
    onChange(next);
  }
  return <div ref={inputRef} className="rich-prompt-editor" role="textbox" aria-label="消息输入框" aria-multiline="true"
    contentEditable suppressContentEditableWarning data-placeholder={placeholder} data-empty={!segments.some(segment => segment.text) || undefined}
    onInput={event => update(event.currentTarget)}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={event => { composing.current = false; update(event.currentTarget); }}
    onPaste={event => {
      event.preventDefault();
      // Insert text through the browser's editing transaction, retaining undo/redo.
      document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
      update(event.currentTarget);
    }}
    onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
        event.preventDefault(); onSubmit();
      }
    }} />;
}
