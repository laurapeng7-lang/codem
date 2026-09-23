import { settingsCodeFiles } from './settings-code-data';

// Trees renders in a shadow root. Use its styling API and the original Figma
// exports for the two icon slots instead of the library's single default icon.
export const settingsCodeTreeTheme = `
  :host {
    color-scheme: light;
    --trees-fg-override: #333940;
    --trees-fg-muted-override: #939fb8;
    --trees-bg-override: #fff;
    --trees-bg-muted-override: #2b2f360f;
    --trees-selected-fg-override: #333940;
    --trees-selected-bg-override: #2b2f360f;
    --trees-selected-focused-border-color-override: transparent;
    --trees-focus-ring-color-override: #3250eb66;
    --trees-border-radius-override: 4px;
    --trees-font-family-override: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
    --trees-font-size-override: 13px;
    --trees-font-weight-regular-override: 500;
    --trees-font-weight-semibold-override: 600;
    --trees-item-padding-x-override: 4px;
    --trees-item-margin-x-override: 0px;
    --trees-item-row-gap-override: 6px;
    --trees-icon-width-override: 34px;
    --trees-icon-nudge-override: 0px;
    --trees-padding-inline-override: 8px;
    --trees-scrollbar-gutter-override: 6px;
  }
  [data-type="item"] { font-weight: 500; }
  [data-item-section="spacing"] { gap: 0; padding: 0; margin: 0 -6px 0 0; }
  [data-item-section="spacing-item"] { flex: 0 0 20px; width: 20px; margin: 0; border: 0; background: url('/assets/settings/code/indent-guide.svg') left center / 14px 24px no-repeat; transform: none; opacity: 1; transition: none; }
  [data-item-section="icon"] { display: flex; gap: 6px; flex: 0 0 34px; }
  [data-item-section="icon"] > svg { display: none; }
  [data-item-section="icon"]::before,
  [data-item-section="icon"]::after { content: ''; width: 14px; height: 14px; flex: 0 0 14px; background-position: center; background-repeat: no-repeat; background-size: contain; }
  [data-item-section="icon"]::before { background-image: url('/assets/settings/code/leaf.svg'); }
  [data-item-type="folder"] [data-item-section="icon"]::before { background-image: url('/assets/settings/code/chevron-right.svg'); }
  [aria-expanded="true"] [data-item-section="icon"]::before { background-image: url('/assets/settings/code/chevron-down.svg'); }
  [data-item-section="icon"]::after { background-image: var(--settings-tree-file-icon, url('/assets/settings/code/folder.svg')); }
  [aria-expanded="true"] [data-item-section="icon"]::after { background-image: var(--settings-tree-open-icon, url('/assets/settings/code/folder-open.svg')); }
  [data-item-path="自动化/"] { --settings-tree-open-icon: url('/assets/settings/code/folder.svg'); }
  [data-item-path="空间关联/"] [data-item-section="icon"],
  [data-item-parent-path][data-item-type="folder"]:not([data-item-path="工作项管理/工作项高级配置/"]) [data-item-section="icon"] {
    flex-basis: 32.59035px;
    --settings-tree-file-icon: url('/assets/settings/code/folder-nested.svg');
    --settings-tree-open-icon: url('/assets/settings/code/folder-nested.svg');
  }
  [data-item-path="工作项管理/需求/字段管理/"] { font-weight: 600; }
  ${settingsCodeFiles.filter(file => file.icon !== 'folder').map(file => `[data-item-path="${file.path}"] { --settings-tree-file-icon: url('/assets/settings/code/${file.icon}.svg'); --settings-tree-open-icon: url('/assets/settings/code/${file.icon}.svg'); }`).join('\n')}
`;
