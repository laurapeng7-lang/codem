import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { FileTree, preloadFileTree } from '@pierre/trees';

// Check the real library models without opening or automating a browser.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(path) {
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === '@pierre/trees') return { FileTree };
    if (!id.startsWith('.')) return require(id);
    const base = resolve(dirname(path), id);
    return load([base, `${base}.ts`, `${base}.json`].find(existsSync));
  } }, { filename: path });
  return module.exports;
}

const { settingsCodeFiles: files, settingsCodeFileMap: fileMap, initialCodePath, initialCodeTabs, settingsCodeTabsReducer: reduce } = load(resolve(root, 'src/settings-code-data.ts'));
assert.equal(new Set(files.map(file => file.path)).size, files.length);
for (const file of files) assert.ok(JSON.parse(file.code), `${file.path} contains valid JSON`);
assert.equal(fileMap.get(initialCodePath).code, JSON.stringify(JSON.parse(readFileSync(resolve(root, 'src/settings-code-fixture.json'), 'utf8')), null, 2), 'The initial code matches the Figma text export');

const { createSettingsCodeTree } = load(resolve(root, 'src/settings-code-tree.ts'));
const tree = createSettingsCodeTree();
const visible = () => tree.getVisibleRows(0, tree.getVisibleCount() - 1);
assert.deepEqual(visible().map(row => row.name), ['空间信息', '工作项管理', '需求', '字段管理', '优先级', '描述', '文档', '创建者', '流程管理', '角色管理', 'PM', 'UI Design', 'DA', 'Tech Owner', '页面布局', '表格列配置', '缺陷', '版本', '迭代', '项目', '工作项高级配置', '权限管理', '插件管理', '空间关联', '自动化', '动态时间任务', '私有化延期提醒', '性能问题临期提醒', '测试准出到期信息填写', '节点字段值修改', '插件', '定时循环']);
assert.deepEqual(visible().slice(0, 6).map(row => row.depth), [0, 0, 1, 2, 3, 3]);
assert.equal(tree.getItemHeight(), 24);
assert.deepEqual([...tree.getSelectedPaths()], [initialCodePath]);
tree.getItem('工作项管理/需求/字段管理/').collapse();
assert.equal(visible().some(row => row.name === '优先级'), false);
tree.getItem('工作项管理/需求/字段管理/').expand();
assert.equal(visible().some(row => row.name === '优先级'), true);
tree.getItem('工作项管理/缺陷/').expand();
assert.ok(visible().some(row => row.path === '工作项管理/缺陷/字段管理'), 'Initially closed groups contain usable configurations');
tree.focusPath(initialCodePath);
tree.focusNextItem();
assert.equal(tree.getFocusedPath(), '工作项管理/');
tree.focusNextItem();
tree.focusNextItem();
tree.focusNextItem();
assert.equal(tree.getFocusedPath(), '工作项管理/需求/字段管理/优先级');
tree.focusParentItem();
assert.equal(tree.getFocusedPath(), '工作项管理/需求/字段管理/');
const { settingsCodeTreeTheme } = load(resolve(root, 'src/settings-code-tree-theme.ts'));
const ssr = preloadFileTree({ paths: files.map(file => file.path), initialExpansion: 'open', initialVisibleRowCount: files.length, unsafeCSS: settingsCodeTreeTheme });
assert.ok(ssr.shadowHtml.includes('role="treeitem"'));
assert.ok(ssr.shadowHtml.includes('/assets/settings/code/field.svg'), 'The shadow tree includes the exported Figma icon theme');
tree.cleanUp();

const paths = ['工作项管理/需求/字段管理/优先级', '工作项管理/需求/角色管理/PM'];
let tabs = initialCodeTabs;
for (const path of paths) tabs = reduce(tabs, { type: 'open', path });
assert.equal(tabs.paths.length, 3);
assert.equal(tabs.activePath, paths[1]);
tabs = reduce(tabs, { type: 'open', path: paths[0] });
assert.equal(tabs.paths.length, 3, 'Reopening a file reuses its tab');
assert.equal(tabs.activePath, paths[0]);
tabs = reduce(tabs, { type: 'close', path: paths[0] });
assert.equal(tabs.activePath, paths[1], 'Closing the active tab selects its right neighbor');
tabs = reduce(tabs, { type: 'close', path: paths[1] });
assert.equal(tabs.activePath, initialCodePath, 'Closing the last tab selects its left neighbor');
assert.equal(reduce(tabs, { type: 'open', path: 'missing' }), tabs);
tabs = reduce(tabs, { type: 'close', path: initialCodePath });
assert.equal(tabs.paths.length, 0);
assert.equal(tabs.activePath, null);
tabs = reduce(tabs, { type: 'open', path: paths[0] });
assert.equal(tabs.paths.length, 1, 'A closed workspace can reopen files');
assert.equal(reduce(tabs, { type: 'close-all' }).activePath, null);

const { createSettingsCodeState, codeWrapping } = load(resolve(root, 'src/settings-code-editor.ts'));
const { syntaxTree } = require('@codemirror/language');
const { EditorView } = require('@codemirror/view');
for (const file of files) {
  const state = createSettingsCodeState(file);
  assert.equal(state.doc.toString(), file.code);
  assert.equal(state.readOnly, true);
  assert.equal(state.facet(EditorView.editable), false);
  assert.equal(state.doc.lineAt(state.selection.main.head).number, file.path === initialCodePath ? 21 : 1);
  let errors = 0;
  syntaxTree(state).iterate({ enter(node) { if (node.type.isError) errors++; } });
  assert.equal(errors, 0, `${file.path} parses successfully with CodeMirror's JSON grammar`);
  const wrapped = state.update({ effects: codeWrapping.reconfigure(EditorView.lineWrapping) }).state;
  assert.equal(wrapped.doc.toString(), state.doc.toString(), 'Wrapping preserves the configuration');
}

const folder = resolve(root, 'public/assets/settings/code');
const provenance = JSON.parse(readFileSync(resolve(folder, 'provenance.json'), 'utf8'));
for (const asset of provenance.assets) {
  const bytes = readFileSync(resolve(folder, asset.file));
  assert.equal(bytes.length, asset.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  assert.ok(bytes.equals(readFileSync(resolve(root, 'dist/assets/settings/code', asset.file))));
}
assert.equal(createHash('sha256').update(readFileSync(resolve(root, provenance.codeFixture.file))).digest('hex'), provenance.codeFixture.sha256);
console.log(`Settings Code checks passed: ${files.length} valid configurations, Figma tree ordering, expand/collapse, keyboard focus, shadow-tree asset rendering, tab lifecycle, read-only JSON parsing, wrapping, and ${provenance.assets.length} unchanged exported icons.`);
