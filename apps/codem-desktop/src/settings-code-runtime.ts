import { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import type { EditorState } from '@codemirror/state';
import { initialCodePath, settingsCodeFiles, type SettingsCodeFile } from './settings-code-data';
import { codeWrapping, createSettingsCodeState } from './settings-code-editor';
import { createSettingsCodeTree } from './settings-code-tree';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';

export function mountSettingsCode({ treeContainer, editorContainer, file, onOpen }: {
  treeContainer: HTMLElement;
  editorContainer: HTMLElement;
  file: SettingsCodeFile;
  onOpen: (path: string) => void;
}) {
  let synchronizing = false;
  let currentPath: string | null = file.path;
  let wrap = false;
  const states = new Map<string, { state: EditorState; top: number; left: number }>();
  const tree = createSettingsCodeTree(paths => {
    const selected = paths.at(-1);
    if (!synchronizing && selected) onOpen(selected);
  }, file.path);
  const editor = new EditorView({ parent: editorContainer, state: createSettingsCodeState(file) });
  try {
    tree.render({ containerWrapper: treeContainer });
  } catch (error) {
    tree.cleanUp();
    editor.destroy();
    throw error;
  }

  function rememberEditor() {
    if (currentPath) states.set(currentPath, { state: editor.state, top: editor.scrollDOM.scrollTop, left: editor.scrollDOM.scrollLeft });
  }
  return {
    setFile(next: SettingsCodeFile | undefined) {
      const path = next?.path ?? null;
      if (path !== currentPath) {
        rememberEditor();
        currentPath = path;
        if (next) {
          const saved = states.get(next.path);
          editor.setState(saved?.state ?? createSettingsCodeState(next, wrap));
          editor.dispatch({ effects: codeWrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
          editor.scrollDOM.scrollTop = saved?.top ?? 0;
          editor.scrollDOM.scrollLeft = saved?.left ?? 0;
        }
      }
      synchronizing = true;
      try {
        for (const selected of tree.getSelectedPaths()) if (selected !== path) tree.getItem(selected)?.deselect();
        if (path && !tree.getSelectedPaths().includes(path)) tree.getItem(path)?.select();
      } finally { synchronizing = false; }
    },
    setExpanded(expanded: boolean) {
      for (const entry of settingsCodeFiles) {
        const item = tree.getItem(entry.path);
        if (item && 'expand' in item) expanded ? item.expand() : item.collapse();
      }
    },
    setWrapping(enabled: boolean) {
      wrap = enabled;
      editor.dispatch({ effects: codeWrapping.reconfigure(enabled ? EditorView.lineWrapping : []) });
    },
    search() { openSearchPanel(editor); },
    reveal(path: string) { tree.scrollToPath(path, { offset: 'nearest' }); },
    destroy() { tree.cleanUp(); editor.destroy(); states.clear(); },
  };
}

export type SettingsCodeRuntime = ReturnType<typeof mountSettingsCode>;
export const defaultSettingsCodeFile = settingsCodeFiles.find(file => file.path === initialCodePath)!;
