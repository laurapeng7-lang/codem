import { FileTree, type FileTreeSelectionChangeListener } from '@pierre/trees';
import { initialCodePath, initialExpandedCodePaths, settingsCodeFiles } from './settings-code-data';
import { settingsCodeTreeTheme } from './settings-code-tree-theme';

const order = new Map(settingsCodeFiles.map((file, index) => [file.path.replace(/\/$/, ''), index]));

export function createSettingsCodeTree(onSelectionChange?: FileTreeSelectionChangeListener, selectedPath = initialCodePath) {
  const tree = new FileTree({
    paths: settingsCodeFiles.map(file => file.path),
    sort: (left, right) => (order.get(left.path.replace(/\/$/, '')) ?? 0) - (order.get(right.path.replace(/\/$/, '')) ?? 0),
    initialSelectedPaths: [selectedPath], initialExpansion: 'closed',
    flattenEmptyDirectories: false, itemHeight: 24, initialVisibleRowCount: 34,
    overscan: 10, stickyFolders: false, icons: { set: 'none' },
    unsafeCSS: settingsCodeTreeTheme, onSelectionChange,
  });
  // In Trees beta.6, initialExpandedPaths uses lexical lookup even with a
  // custom sort. Expanding via handles preserves the design's branch order.
  for (const path of initialExpandedCodePaths) {
    const item = tree.getItem(path);
    if (item && 'expand' in item) item.expand();
  }
  return tree;
}
