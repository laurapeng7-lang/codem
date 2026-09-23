import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { search, searchKeymap } from '@codemirror/search';
import { tags } from '@lezer/highlight';
import { initialCodePath, type SettingsCodeFile } from './settings-code-data';

export const codeWrapping = new Compartment();
const codeTheme = EditorView.theme({
  '&': { height: '100%', color: '#6e6b5e', backgroundColor: '#fff', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  // Figma rounds the 150% line height to 20px (91 lines / 1820px).
  '.cm-scroller': { overflow: 'auto', fontFamily: '"JetBrains Mono", monospace', lineHeight: '20px', fontWeight: '500' },
  '.cm-content': { padding: '12px 0', minHeight: '100%', caretColor: '#333940', backgroundImage: 'linear-gradient(#4d6b9914, #4d6b9914), linear-gradient(#4d6b9914, #4d6b9914)', backgroundSize: '1px 100%, 1px 100%', backgroundPosition: '8px 0, 24px 0', backgroundRepeat: 'no-repeat' },
  '.cm-line': { padding: '0 24px 0 32px' },
  '.cm-gutters': { color: '#617080', backgroundColor: '#fff', border: 'none', fontWeight: '400' },
  '.cm-lineNumbers .cm-gutterElement': { boxSizing: 'border-box', minWidth: '72px', padding: '0 28px 0 8px' },
  '.cm-activeLine': { backgroundColor: '#2b2f360f' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#3250eb24' },
  '.cm-content ::selection': { backgroundColor: '#3250eb24' },
  '.cm-searchMatch': { backgroundColor: '#ffcf6055', outline: '1px solid #ffcf60' },
  '.cm-searchMatch-selected': { backgroundColor: '#ffcf6099' },
  '.cm-panels': { font: '12px Inter, "PingFang SC", sans-serif', color: '#333940', backgroundColor: '#f7f8fa' },
  '.cm-panel.cm-search': { padding: '8px 32px 8px 12px' },
  '.cm-textfield': { background: '#fff', border: '1px solid #dfe2e7', borderRadius: '4px' },
  '.cm-button': { background: '#fff', border: '1px solid #dfe2e7', borderRadius: '4px', fontSize: '12px' },
  '.cm-panel.cm-search [name=close]': { fontSize: '0', width: '24px', height: '24px', top: '6px', right: '4px', background: 'url("/assets/settings/code/close.svg") center / 16px no-repeat' },
});

export function createSettingsCodeState(file: SettingsCodeFile, wrap = false) {
  const activeLine = file.path === initialCodePath ? 21 : 1;
  const doc = EditorState.create({ doc: file.code }).doc;
  return EditorState.create({
    doc,
    selection: { anchor: doc.line(Math.min(activeLine, doc.lines)).from },
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.contentAttributes.of({ tabindex: '0', 'aria-label': `${file.name} JSON 代码预览` }),
      EditorState.phrases.of({ 'Find': '查找', 'next': '下一个', 'previous': '上一个', 'all': '全部', 'match case': '区分大小写', 'regexp': '正则表达式', 'by word': '全字匹配' }),
      lineNumbers(), highlightActiveLine(), json(), search({ top: true }), keymap.of(searchKeymap),
      syntaxHighlighting(HighlightStyle.define([
        { tag: [tags.propertyName, tags.punctuation, tags.brace, tags.squareBracket], color: '#6e6b5e' },
        { tag: tags.string, color: '#60ac39' },
        { tag: [tags.bool, tags.null, tags.number], color: '#b65611' },
      ])),
      codeWrapping.of(wrap ? EditorView.lineWrapping : []), codeTheme,
    ],
  });
}
