import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the components' actual event handlers without opening a browser.
// This small hook host checks state transitions; layout/effects remain manual acceptance.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let activeHost;
let appElement;
const testWindow = Object.assign(new EventTarget(), { location: new URL('https://example.test/') });
const testDocument = Object.assign(new EventTarget(), { activeElement: null, getElementById: () => null });
const copiedLinks = [];
let clipboardUnavailable = false;
const testNavigator = { clipboard: { async writeText(text) {
  if (clipboardUnavailable) throw new Error('Clipboard unavailable');
  copiedLinks.push(text);
} } };
let timerId = 0;
let timerClock = 0;
const pendingTimers = new Map();
const scheduleTimer = (callback, delay) => {
  const id = ++timerId;
  pendingTimers.set(id, { callback, due: timerClock + delay });
  return id;
};
function advanceTimers(milliseconds) {
  timerClock += milliseconds;
  for (const [id, timer] of [...pendingTimers]) {
    if (timer.due > timerClock) continue;
    pendingTimers.delete(id);
    timer.callback();
  }
}
class TestNode {
  constructor(children = []) { this.children = children; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest() { return null; }
  focus() { testDocument.activeElement = this; }
  querySelector() { return null; }
  scrollIntoView(options) { this.lastScrollOptions = options; }
}
let historyEntries = [testWindow.location.href];
let historyIndex = 0;
testWindow.history = {
  replaceState(_state, _unused, href) {
    testWindow.location = new URL(href, testWindow.location.href);
    historyEntries[historyIndex] = testWindow.location.href;
  },
  pushState(_state, _unused, href) {
    testWindow.location = new URL(href, testWindow.location.href);
    historyEntries = [...historyEntries.slice(0, historyIndex + 1), testWindow.location.href];
    historyIndex++;
  },
  go(delta) {
    const previousHash = testWindow.location.hash;
    historyIndex += delta;
    testWindow.location = new URL(historyEntries[historyIndex]);
    testWindow.dispatchEvent(new Event('popstate'));
    if (previousHash !== testWindow.location.hash) testWindow.dispatchEvent(new Event('hashchange'));
  },
};
function setLocation(href) {
  testWindow.location = new URL(href);
  historyEntries = [href];
  historyIndex = 0;
}
const react = {
  useState(initial) {
    const host = activeHost;
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [host.slots[index], value => { host.slots[index] = typeof value === 'function' ? value(host.slots[index]) : value; }];
  },
  useReducer(reducer, initial, init) { const [state, setState] = react.useState(() => init ? init(initial) : initial); return [state, action => setState(value => reducer(value, action))]; },
  useRef(initial) { return react.useState(() => ({ current: initial }))[0]; },
  useMemo(factory) { return factory(); },
  useCallback(callback) { return callback; },
  useSyncExternalStore(subscribe, getSnapshot) { react.useEffect(() => subscribe(() => {})); return getSnapshot(); },
  useEffect(effect) { activeHost.effects.push(effect); },
  useLayoutEffect(effect) { activeHost.layoutEffects.push(effect); },
};
const modules = new Map();
function load(path) {
  if (extname(path) === '.json') return JSON.parse(readFileSync(path, 'utf8'));
  if (extname(path) === '.css') return {};
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: path,
  }).outputText;
  runInNewContext(code, {
    module, exports: module.exports,
    require(id) {
      if (id === 'react') return react;
      if (id === 'react-dom') return { createPortal: children => children };
      if (id === 'react-dom/client') return { createRoot: () => ({ render: element => { appElement = element; } }) };
      if (!id.startsWith('.')) return require(id);
      const base = resolve(dirname(path), id);
      return load([base, `${base}.ts`, `${base}.tsx`, `${base}.json`].find(existsSync));
    },
    document: testDocument,
    crypto: { randomUUID },
    navigator: testNavigator,
    Node: TestNode, Event,
    Element: TestNode, HTMLElement: TestNode,
    window: testWindow,
    performance: { now: () => timerClock },
    URL, URLSearchParams, setTimeout: scheduleTimer, clearTimeout: id => pendingTimers.delete(id),
    ResizeObserver: class { observe() {} disconnect() {} },
  }, { filename: path });
  return module.exports;
}
function mount(Component) {
  const host = { slots: [], cursor: 0, effects: [], layoutEffects: [] };
  const render = props => { activeHost = host; host.cursor = 0; host.effects = []; host.layoutEffects = []; const tree = Component(props); activeHost = null; return tree; };
  render.flushLayoutEffects = () => {
    const cleanups = host.layoutEffects.map(effect => effect()).filter(cleanup => typeof cleanup === 'function');
    host.layoutEffects = [];
    return () => cleanups.forEach(cleanup => cleanup());
  };
  render.flushEffects = () => {
    const cleanups = host.effects.map(effect => effect()).filter(cleanup => typeof cleanup === 'function');
    host.effects = [];
    return () => cleanups.forEach(cleanup => cleanup());
  };
  return render;
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object' || !tree.props) return [];
  return [tree, ...nodes(tree.props.children)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
const byName = name => node => node.type?.name === name;
const avatarChoices = tree => { const component = find(tree, byName('AgentAvatarChoices')); return component ? mount(component.type)(component.props) : undefined; };
const sentMessages = tree => nodes(tree).filter(byName('SentMessage'));
const textContent = tree => Array.isArray(tree) ? tree.map(textContent).join('') : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree?.props ? textContent(tree.props.children) : '';
const input = start => find(start.props.composer, node => node.type === 'textarea');
const send = start => find(start.props.composer, node => node.props.className === 'send-button');
const submit = start => find(start.props.composer, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
load(resolve(root, 'src/main.tsx'));
assert.equal(testWindow.location.pathname, '/home', 'Root startup redirects before rendering');
assert.equal(historyEntries.length, 1, 'Landing redirects replace the current history entry');
assert.ok(find(mount(appElement.type)(), byName('HomePage')));
setLocation('https://example.test/chat/project-report');
const renderApp = mount(appElement.type);
let app = renderApp();

// The host switch drives the existing report controller and follows iframe events.
{
  const renderModes = mount(appElement.type);
  let view = renderModes();
  const modeTab = mode => find(view, node => node.props.id === `report-mode-${mode}`);
  assert.equal(modeTab('reading').props.children, '报告');
  assert.equal(modeTab('slides').props.children, '演示');
  assert.ok(modeTab('slides').props.disabled, 'Modes are unavailable until the report is ready');
  assert.ok(!find(view, node => ['preview-tab', 'code-tab'].includes(node.props.id)));
  assert.ok(!find(view, node => node.props.className === 'presentation-button'));
  const preview = find(view, byName('ReportPreview'));
  const doc = Object.assign(new EventTarget(), { getElementById: () => ({}) });
  let state = { mode: 'reading', theme: 'signal' };
  const modeCalls = [];
  const controller = {
    getState: () => ({ ...state }),
    setMode(mode) { modeCalls.push(mode); state = { ...state, mode }; doc.dispatchEvent(new Event('report-mode-change')); },
  };
  preview.props.frameRef.current = { contentDocument: doc, contentWindow: { projectRiskReport: controller } };
  modeTab('slides').props.onClick();
  assert.equal(modeCalls.length, 0, 'An unfinished report must not receive mode changes');
  const renderPreview = mount(preview.type);
  const iframe = tree => find(tree, node => node.type === 'iframe');
  iframe(renderPreview(preview.props)).props.onLoad();
  const originalFrame = iframe(renderPreview(preview.props));
  const stopSync = renderPreview.flushEffects();
  view = renderModes();
  assert.equal(modeTab('slides').props.disabled, false);
  modeTab('slides').props.onClick();
  view = renderModes();
  assert.deepEqual(modeCalls, ['slides']);
  assert.ok(modeTab('slides').props['aria-selected']);
  assert.equal(modeTab('reading').props.tabIndex, -1);
  const slidesPreview = find(view, byName('ReportPreview'));
  const slidesTree = renderPreview(slidesPreview.props);
  assert.equal(slidesPreview.props.mode, 'slides');
  assert.equal(iframe(slidesTree).key, originalFrame.key, 'Changing mode must keep the loaded iframe');
  assert.equal(iframe(slidesTree).props.src, originalFrame.props.src);
  assert.ok(!find(slidesTree, node => node.props.className === 'report-frame-wrap').props.hidden);
  assert.equal(find(slidesTree, node => node.props.id === 'report-content').props['aria-labelledby'], 'report-mode-slides');
  modeTab('slides').props.onClick();
  assert.equal(modeCalls.length, 1, 'Selecting the active mode must preserve its current slide');
  modeTab('reading').props.onClick();
  view = renderModes();
  assert.ok(modeTab('reading').props['aria-selected']);
  assert.equal(state.theme, 'signal', 'Switching modes must retain the report theme');

  const getElementById = testDocument.getElementById;
  const focusTargets = { reading: new TestNode(), slides: new TestNode() };
  testDocument.getElementById = id => focusTargets[id.replace('report-mode-', '')];
  for (const [key, from, to] of [['ArrowRight', 'reading', 'slides'], ['ArrowLeft', 'slides', 'reading'], ['End', 'reading', 'slides'], ['Home', 'slides', 'reading']]) {
    let prevented = false;
    modeTab(from).props.onKeyDown({ key, preventDefault() { prevented = true; } });
    view = renderModes();
    assert.ok(prevented);
    assert.ok(modeTab(to).props['aria-selected']);
    assert.equal(testDocument.activeElement, focusTargets[to]);
  }
  testDocument.getElementById = getElementById;
  testDocument.activeElement = null;
  modeTab('slides').props.onClick();
  controller.setMode('reading'); // The iframe's Escape handler follows this same path.
  view = renderModes();
  assert.ok(modeTab('reading').props['aria-selected'], 'Iframe mode changes must update the switch');
  stopSync();
}

function newConversation() {
  find(app, node => node.props.label === '新建对话').props.onClick();
  app = renderApp();
  const start = find(app, byName('NewConversation'));
  assert.equal(testWindow.location.searchParams.get('view'), 'new-chat');
  assert.equal(input(start).props.value, '');
  assert.equal(input(start).props.readOnly, false);
  assert.equal(send(start).props.disabled, true);
  assert.ok(!find(app, byName('ReportPreview')), 'Starting a conversation must close the preview');
  return start;
}
function library(start) {
  const render = mount(start.type);
  let tree = render(start.props);
  find(tree, node => node.props['aria-label'] === '查看模板').props.onClick();
  tree = render(start.props);
  assert.equal(find(tree, node => node.props.id === 'new-conversation-templates').type, 'dialog');
  assert.equal(find(tree, node => node.props['aria-label'] === '查看模板').props['aria-expanded'], true);
  const content = find(tree, byName('NewConversationContent'));
  return mount(content.type)(content.props);
}
const catalog = load(resolve(root, 'src/deep-report-content.json'));
const conversationCatalog = load(resolve(root, 'src/conversation-template-content.json'));
const lightAppCatalog = load(resolve(root, 'src/light-app-content.json'));
const provenance = load(resolve(root, 'public/assets/report-templates/provenance.json'));
function checkLaunch(start, expectedTheme) {
  assert.equal(send(start).props.type, 'submit');
  assert.equal(send(start).props.disabled, false);
  submit(start);
  app = renderApp();
  assert.equal(testWindow.location.searchParams.has('view'), false, 'Sending must remove the new-conversation parameter');
  assert.equal(testWindow.location.pathname, '/chat/project-report', 'The generated report has its own conversation URL');
  assert.ok(!find(app, byName('NewConversation')));
  assert.equal(find(app, node => node.type === 'h1').props.children, '生成项目总结报告');
  const preview = find(app, byName('ReportPreview'));
  assert.equal(preview.props.active, true);
  assert.equal(preview.props.mode, 'reading');
  assert.equal(preview.props.initialTheme, expectedTheme);
  assert.equal(find(app, node => node.type === 'textarea').props.readOnly, true);
  const state = { theme: 'neon-cyber', mode: 'slides' };
  preview.props.frameRef.current = {
    contentDocument: { getElementById: () => ({}) },
    contentWindow: { projectRiskReport: {
      getState: () => state,
      setTheme: theme => { state.theme = theme; },
      setMode: mode => { state.mode = mode; },
    } },
  };
  const renderPreview = mount(preview.type);
  find(renderPreview(preview.props), node => node.type === 'iframe').props.onLoad();
  assert.equal(state.theme, expectedTheme, 'A remembered theme must not override the selected cover');
  assert.equal(state.mode, 'reading');
  const frameWrap = find(renderPreview(preview.props), node => node.props.className === 'report-frame-wrap');
  assert.ok(!find(frameWrap, node => node.props.className === 'report-load-state'));
  preview.props.onReadyChange(true);
  app = renderApp();
  assert.equal(find(app, byName('ReportPreview')).props.initialTheme, undefined, 'Apply the launch theme once so later theme changes remain available');
}
for (const template of catalog.templates) {
  newConversation().props.onModeChange('deep-report');
  app = renderApp();
  const start = find(app, byName('NewConversation'));
  const cards = nodes(library(start)).filter(node => node.props.className === 'template-card');
  const card = cards.find(node => find(node, child => child.type === 'h3')?.props.children === template.title);
  card.props.onClick();
  app = renderApp();
  const selected = find(app, byName('NewConversation'));
  assert.ok(input(selected).props.value.includes(template.title));
  assert.ok(input(selected).props.value.includes(template.method));
  assert.ok(input(selected).props.value.length > 100);
  assert.equal(template.theme, provenance.assets.find(asset => asset.file === `${template.id}.png`).theme);
  input(selected).props.onChange({ target: { value: `${input(selected).props.value}重点关注本周。` } });
  app = renderApp();
  checkLaunch(find(app, byName('NewConversation')), template.theme);
}
{
  newConversation().props.onModeChange('deep-report');
  app = renderApp();
  const list = library(find(app, byName('NewConversation')));
  assert.ok(!find(list, node => node.props.className === 'deep-report-queries'), 'Report filters no longer show suggested questions');
  assert.ok(!find(find(app, byName('NewConversation')).props.composer, node => node.props.className === 'new-chat-context'));
}
// Light-app mode shares the existing start-page transitions and preserves the draft.
{
  const content = load(resolve(root, 'src/light-app-content.json'));
  const exported = load(resolve(root, 'public/assets/figma/light-app/provenance.json'));
  const defaultStart = newConversation();
  input(defaultStart).props.onChange({ target: { value: '我的搭建需求' } });
  find(library(defaultStart), node => node.type === 'button' && node.props.children?.includes('轻应用搭建')).props.onClick();
  app = renderApp();
  const currentStart = () => find(app, byName('NewConversation'));
  assert.equal(currentStart().props.mode, 'light-app');
  assert.equal(input(currentStart()).props.value, '我的搭建需求');
  assert.ok(!find(app, byName('ReportPreview')));
  assert.ok(!find(currentStart().props.composer, node => node.props['aria-label'] === '退出轻应用搭建'));
  let page = library(currentStart());
  assert.ok(find(page, node => node.props.className === 'new-conversation-shortcuts'), 'All five filters remain available in light-app mode');
  assert.ok(!find(page, node => node.props.className === 'deep-report-queries'));
  assert.deepEqual(nodes(page).filter(node => node.props.role === 'tab').map(node => node.props.children.at(-1)), content.categories);
  const cards = nodes(page).filter(node => node.props.className === 'template-card light-app-card');
  assert.equal(cards.length, content.templates.length);
  for (const [index, card] of cards.entries()) {
    const template = content.templates[index];
    assert.equal(find(card, node => node.type === 'h3').props.children, template.title);
    assert.ok(!find(card, node => node.type === 'p'), 'App cards use the title-only Figma layout');
    const cover = find(card, node => node.type === 'img');
    const asset = exported.assets.find(item => cover.props.src.endsWith(`/${item.file}`));
    const bytes = readFileSync(resolve(root, `public${cover.props.src}`));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [849, 438], 'Figma covers are exported at 3x');
    assert.deepEqual(readFileSync(resolve(root, `dist${cover.props.src}`)), bytes, 'Production includes the complete cover');
    card.props.onClick();
    app = renderApp();
    assert.equal(input(currentStart()).props.value, template.prompt);
    assert.equal(currentStart().props.mode, 'light-app');
  }
  const rootView = mount(currentStart().type)(currentStart().props);
  const section = find(rootView, byName('NewConversationContent'));
  const renderContent = mount(section.type);
  page = renderContent(section.props);
  find(page, node => node.props.role === 'tab' && node.props.children.at(-1) === '项目质量').props.onClick();
  page = renderContent(section.props);
  assert.deepEqual(nodes(page).filter(node => node.type === 'h3').map(node => node.props.children), Array.from(content.templates.filter(template => template.category === '项目质量'), template => template.title));
  find(page, node => node.type === 'button' && node.props.children?.includes('轻应用搭建')).props.onClick();
  app = renderApp();
  assert.equal(currentStart().props.mode, 'default');
  assert.equal(input(currentStart()).props.value, content.templates.at(-1).prompt);
  assert.ok(find(library(currentStart()), node => node.props.className === 'new-conversation-shortcuts'));
  find(library(currentStart()), node => node.type === 'button' && node.props.children?.includes('深度报告')).props.onClick();
  app = renderApp();
  assert.equal(currentStart().props.mode, 'deep-report');
  assert.ok(!find(currentStart().props.composer, node => node.props['aria-label'] === '退出轻应用搭建'));
  assert.equal(newConversation().props.mode, 'default');

  const media = Object.assign(new EventTarget(), { matches: false });
  const previousMatchMedia = testWindow.matchMedia;
  testWindow.matchMedia = () => media;
  const renderAnimated = mount(defaultStart.type);
  const animations = [];
  const props = { ...defaultStart.props, mode: 'default' };
  const tree = renderAnimated(props);
  find(tree, node => node.props.className === 'new-conversation-content').props.ref.current = {
    querySelector: () => ({ animate(frames, options) { const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } }; animations.push(animation); return animation; } }),
  };
  renderAnimated.flushLayoutEffects();
  assert.equal(animations.length, 0, 'Initial content does not animate');
  find(tree, node => node.props['aria-label'] === '查看模板').props.onClick();
  renderAnimated(props); renderAnimated.flushLayoutEffects();
  for (const mode of ['light-app', 'default', 'deep-report', 'default']) {
    renderAnimated({ ...props, mode });
    const cleanup = renderAnimated.flushLayoutEffects();
    const animation = animations.at(-1);
    assert.equal(animation.options.duration, 200);
    assert.equal(animation.frames[0].opacity, 0);
    assert.equal(animation.frames.at(-1).opacity, 1);
    cleanup();
    assert.equal(animation.cancelled, true);
  }
  assert.equal(animations.length, 4, 'Both modes animate on entry and exit');
  media.matches = true;
  renderAnimated({ ...props, mode: 'light-app' });
  renderAnimated.flushLayoutEffects();
  assert.equal(animations.length, 4, 'Reduced-motion preferences suppress the transition');
  testWindow.matchMedia = previousMatchMedia;
  console.log('Light-app checks passed: toggleable filters, preserved draft, removed queries/composer tag, six Figma covers, category filtering, shared transitions and reduced motion.');
}
let start = newConversation();
input(start).props.onChange({ target: { value: '   \n' } });
app = renderApp();
start = find(app, byName('NewConversation'));
assert.equal(send(start).props.disabled, true);
submit(start);
app = renderApp();
assert.ok(find(app, byName('NewConversation')), 'Whitespace must not open a report');
let submissions = 0;
const keyEvent = { key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault() {}, currentTarget: { form: { requestSubmit() { submissions++; } } } };
const keyDown = input(start).props.onKeyDown;
keyDown({ ...keyEvent, nativeEvent: { isComposing: true, keyCode: 13 } });
keyDown({ ...keyEvent, nativeEvent: { isComposing: false, keyCode: 229 } });
keyDown({ ...keyEvent, shiftKey: true });
assert.equal(submissions, 0, 'IME confirmation and Shift+Enter must not submit');
keyDown(keyEvent);
assert.equal(submissions, 1);
const normalCards = nodes(library(start)).filter(node => node.props.className === 'template-card');
normalCards[0].props.onClick();
app = renderApp();
checkLaunch(find(app, byName('NewConversation')), 'vintage-editorial');

// Direct navigation and refresh must initialize the entire workspace from the URL.
for (const href of ['https://example.test/?view=new-chat', 'https://example.test/?source=share&view=new-chat#report']) {
  setLocation(href);
  const linked = mount(appElement.type)();
  assert.ok(find(linked, byName('NewConversation')));
  assert.ok(!find(linked, byName('ReportPreview')));
  assert.ok(linked.props.className.includes('mobile-chat'));
}
setLocation('https://example.test/?view=unknown');
load(resolve(root, 'src/conversation-url.ts')).redirectRootToHome();
assert.ok(find(mount(appElement.type)(), byName('HomePage')), 'Unknown root views use the Home landing page');

setLocation('https://example.test/?source=share#report');
const renderRoute = mount(appElement.type);
let route = renderRoute();
const cleanup = renderRoute.flushEffects();
assert.ok(route.props.className.includes('mobile-preview'), 'Existing report links should keep working');
find(route, node => node.props.label === '新建对话').props.onClick();
route = renderRoute();
assert.equal(testWindow.location.searchParams.get('source'), 'share', 'Keep unrelated URL parameters');
assert.equal(testWindow.location.searchParams.get('view'), 'new-chat');
assert.equal(testWindow.location.hash, '', 'New-conversation links must not retain the report anchor');
const count = historyEntries.length;
find(route, node => node.props.label === '新建对话').props.onClick();
route = renderRoute();
assert.equal(historyEntries.length, count, 'Repeated new-conversation clicks should not duplicate navigation entries');
assert.equal(testWindow.location.searchParams.getAll('view').length, 1);
testWindow.history.go(-1);
route = renderRoute();
assert.ok(!find(route, byName('NewConversation')));
assert.ok(find(route, byName('ReportPreview')));
assert.ok(route.props.className.includes('mobile-preview'));
testWindow.history.go(1);
route = renderRoute();
assert.ok(find(route, byName('NewConversation')));
assert.ok(!find(route, byName('ReportPreview')));
find(route, byName('Sidebar')).props.onOpenConversation(load(resolve(root, 'src/conversation-history.ts')).conversations[0]);
route = renderRoute();
assert.equal(testWindow.location.searchParams.has('view'), false, 'Selecting history must remove the new-conversation parameter');
assert.equal(testWindow.location.searchParams.get('source'), 'share');
assert.ok(find(route, byName('ReportPreview')));
cleanup();

// Each conversation has a durable URL; CodeM always returns to the new-chat page.
{
  const { conversations } = load(resolve(root, 'src/conversation-history.ts'));
  for (const path of ['/', '/chat/project-report', '/chat/delivery-risks', '/marketplace', '/admin', '/settings', '/apps/2025-ybr/2']) {
    setLocation(`https://example.test${path}`);
    const render = mount(appElement.type);
    let page = render();
    if (path === '/admin') find(page, byName('AdminPage')).props.onExit();
    else find(page, byName('Sidebar')).props.onNavigate('CodeM');
    page = render();
    assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat');
    assert.equal(find(page, byName('Sidebar')).props.active, 'CodeM');
    assert.ok(find(page, byName('NewConversation')) && !find(page, byName('ReportPreview')));
    assert.ok(!find(page, node => node.props.label === '复制会话链接'));
    const count = historyEntries.length;
    find(page, byName('Sidebar')).props.onNavigate('CodeM');
    assert.equal(historyEntries.length, count, 'Repeated CodeM clicks do not add duplicate history');
  }
  for (const conversation of conversations) {
    for (const suffix of ['', '/', '?view=new-chat#report']) {
      setLocation(`https://example.test/chat/${conversation.id}${suffix}`);
      const page = mount(appElement.type)();
      assert.equal(find(page, node => node.type === 'h1').props.children, conversation.title, 'Direct loads and refresh restore the linked conversation');
      assert.equal(find(page, byName('Sidebar')).props.active, 'CodeM');
      assert.ok(!find(page, byName('NewConversation')));
      assert.equal(Boolean(find(page, byName('ReportPreview'))), conversation.id === 'project-report');
      if (conversation.id !== 'project-report') {
        const response = find(page, byName('AssistantMessage'));
        assert.ok(find(response.type(response.props), node => node.props.children === conversation.summary));
      }
    }
  }
  for (const path of ['/chat/missing', '/chat/%E0%A4%A', '/chat/weekly-update/extra', '/chat/']) {
    setLocation(`https://example.test${path}`);
    const page = mount(appElement.type)();
    assert.ok(find(page, byName('NewConversation')) && !find(page, byName('ReportPreview')), 'Invalid IDs cannot open another conversation');
  }
  setLocation('https://example.test/?source=share&view=new-chat');
  const render = mount(appElement.type);
  let page = render();
  const stop = render.flushEffects();
  function select(conversation) {
    if (find(page, byName('NewConversation'))) find(page, byName('Sidebar')).props.onOpenConversation(conversation);
    else {
      find(page, node => node.type === 'button' && node.props['aria-label'] === '对话历史').props.onClick(); page = render();
      find(page, byName('ConversationHistoryMenu')).props.onSelect(conversation);
    }
    page = render();
  }
  for (const conversation of conversations) {
    select(conversation);
    assert.equal(testWindow.location.pathname, `/chat/${conversation.id}`);
    assert.equal(testWindow.location.search, '?source=share');
    assert.equal(find(page, node => node.type === 'h1').props.children, conversation.title);
    assert.equal(Boolean(find(page, byName('ReportPreview'))), conversation.id === 'project-report');
    assert.ok(!find(page, node => node.props.label === '复制会话链接'));
    assert.ok(!find(page, node => node.props.children === '示例对话'));
    const count = historyEntries.length;
    select(conversation);
    assert.equal(historyEntries.length, count, 'Selecting the current conversation does not duplicate history');
  }
  testWindow.history.go(-1); page = render();
  assert.equal(find(page, node => node.type === 'h1').props.children, conversations.at(-2).title);
  testWindow.history.go(1); page = render();
  assert.equal(find(page, node => node.type === 'h1').props.children, conversations.at(-1).title);
  find(page, byName('Sidebar')).props.onNavigate('CodeM'); page = render();
  testWindow.history.go(-1); page = render();
  assert.equal(find(page, node => node.type === 'h1').props.children, conversations.at(-1).title);
  assert.ok(!find(page, byName('ReportPreview')), 'Back must not substitute the default report');
  testWindow.history.go(1); page = render();
  assert.ok(find(page, byName('NewConversation')));
  select(conversations[0]);
  find(page, node => node.props.label === '更多产物操作').props.onClick(); page = render();
  find(page, byName('ReportActionsMenu')).props.onCopyLink();
  await new Promise(resolve => setImmediate(resolve)); page = render();
  assert.equal(copiedLinks.at(-1), 'https://example.test/chat/project-report?source=share#report');
  clipboardUnavailable = true;
  find(page, node => node.props.label === '更多产物操作').props.onClick(); page = render();
  find(page, byName('ReportActionsMenu')).props.onCopyLink();
  await new Promise(resolve => setImmediate(resolve)); page = render();
  assert.ok(find(page, node => node.props.children === '无法访问剪贴板，请检查浏览器权限'));
  clipboardUnavailable = false;
  stop();
  const vercel = load(resolve(root, 'vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/chat/:path*' && rule.destination === '/index.html'));
  console.log('Conversation URL checks passed: CodeM entry, 13 direct/refresh links, selected content, removed conversation copy button, report links, duplicate navigation, back/forward, invalid IDs and hosting rewrites.');
}

// Marketplace is a real route, including direct links and navigation back to chat.
for (const href of ['https://example.test/marketplace', 'https://example.test/marketplace/', 'https://example.test/marketplace?view=new-chat#report']) {
  setLocation(href);
  const linked = mount(appElement.type)();
  assert.ok(find(linked, byName('Marketplace')));
  assert.ok(!find(linked, byName('ReportPreview')));
  assert.ok(!find(linked, byName('NewConversation')));
  assert.equal(find(linked, byName('Sidebar')).props.active, 'Marketplace');
}
setLocation('https://example.test/?source=share&view=new-chat');
const renderMarketRoute = mount(appElement.type);
let marketRoute = renderMarketRoute();
const cleanupMarketRoute = renderMarketRoute.flushEffects();
input(find(marketRoute, byName('NewConversation'))).props.onChange({ target: { value: '保留这段报告提示词' } });
marketRoute = renderMarketRoute();
function chooseNavigation(label) {
  const sidebar = find(marketRoute, byName('Sidebar'));
  const sidebarTree = mount(sidebar.type)(sidebar.props);
  find(sidebarTree, node => node.type === 'button' && node.props.title === label).props.onClick();
  marketRoute = renderMarketRoute();
}
chooseNavigation('Marketplace');
assert.equal(testWindow.location.pathname, '/marketplace');
assert.equal(testWindow.location.searchParams.has('view'), false);
assert.equal(testWindow.location.searchParams.get('source'), 'share');
assert.ok(find(marketRoute, byName('Marketplace')));
assert.ok(!find(marketRoute, byName('ReportPreview')));
const marketplaceHistoryLength = historyEntries.length;
chooseNavigation('Marketplace');
assert.equal(historyEntries.length, marketplaceHistoryLength);
chooseNavigation('CodeM');
assert.equal(testWindow.location.pathname, '/');
assert.equal(testWindow.location.searchParams.get('view'), 'new-chat');
assert.equal(input(find(marketRoute, byName('NewConversation'))).props.value, '保留这段报告提示词');
testWindow.history.go(-1);
marketRoute = renderMarketRoute();
assert.ok(find(marketRoute, byName('Marketplace')));
testWindow.history.go(1);
marketRoute = renderMarketRoute();
assert.ok(find(marketRoute, byName('NewConversation')));
chooseNavigation('Marketplace');
find(marketRoute, node => node.props.label === '新建对话').props.onClick();
marketRoute = renderMarketRoute();
assert.equal(testWindow.location.pathname, '/');
assert.equal(testWindow.location.searchParams.get('view'), 'new-chat');
assert.ok(find(marketRoute, byName('NewConversation')));
cleanupMarketRoute();

// Exercise catalog filters and navigation against the real component handlers.
const { Marketplace } = load(resolve(root, 'src/Marketplace.tsx'));
const { agentSkills, marketplaceCatalogs } = load(resolve(root, 'src/marketplace-data.ts'));
for (const [source, skills] of [['Discover', agentSkills], ['Agent Skills', marketplaceCatalogs['Agent Skills'].items]]) {
  for (const skill of skills) {
    setLocation('https://example.test/marketplace?source=skill');
    const renderSkillRoute = mount(appElement.type);
    let skillRoute = renderSkillRoute();
    const marketplace = find(skillRoute, byName('Marketplace'));
    const renderSkillMarket = mount(marketplace.type);
    let skillPage = renderSkillMarket(marketplace.props);
    if (source === 'Agent Skills') {
      find(skillPage, node => node.props.role === 'tab' && node.props.children === source).props.onClick();
      skillPage = renderSkillMarket(marketplace.props);
      const component = find(skillPage, byName('MarketplaceCatalog'));
      skillPage = mount(component.type)(component.props);
    }
    const card = find(skillPage, node => node.type === 'button' && nodes(node).some(child => child.type === 'strong' && child.props.children === skill.title));
    card.props.onClick();
    skillRoute = renderSkillRoute();
    let start = find(skillRoute, byName('NewConversation'));
    assert.ok(start, `${source}: ${skill.title} opens a new conversation`);
    assert.equal(testWindow.location.pathname, '/');
    assert.equal(testWindow.location.searchParams.get('view'), 'new-chat');
    assert.equal(testWindow.location.searchParams.get('source'), 'skill');
    assert.equal(find(skillRoute, byName('Sidebar')).props.active, 'CodeM');
    assert.ok(!find(skillRoute, byName('Marketplace')));
    assert.ok(!find(skillRoute, byName('ReportPreview')), 'Picking a skill only prefills; sending opens the report');
    assert.equal(start.props.mode, 'default', 'Skill prefills do not preselect a template filter');
    assert.equal(input(start).props.readOnly, false);
    assert.ok(input(start).props.value.includes(skill.title));
    assert.ok(input(start).props.value.includes(skill.description));
    assert.equal(send(start).props.disabled, false);
    const editedPrompt = `${input(start).props.value}\n请重点关注最近两周的数据。`;
    input(start).props.onChange({ target: { value: editedPrompt } });
    skillRoute = renderSkillRoute();
    start = find(skillRoute, byName('NewConversation'));
    assert.equal(input(start).props.value, editedPrompt);
    submit(start);
    skillRoute = renderSkillRoute();
    assert.equal(testWindow.location.searchParams.has('view'), false);
    assert.ok(!find(skillRoute, byName('NewConversation')));
    assert.ok(find(skillRoute, byName('ChatHistory')));
    assert.equal(find(skillRoute, node => node.type === 'h1').props.children, '生成项目总结报告');
    const preview = find(skillRoute, byName('ReportPreview'));
    assert.equal(preview.props.active, true);
    assert.equal(preview.props.mode, 'reading');
    assert.ok(load(resolve(root, 'src/report-themes.json')).some(theme => theme.id === preview.props.initialTheme));
  }
}
let selectedSkillPrompt;
const renderMarketplaceState = mount(Marketplace);
const renderMarketplace = () => renderMarketplaceState({ onChooseSkill: selection => { selectedSkillPrompt = selection; } });
let market = renderMarketplace();
const sectionIds = tree => nodes(tree).filter(byName('Section')).map(node => node.props.id);
assert.deepEqual(sectionIds(market), ['templates', 'skills', 'apps', 'plugins', 'academy']);
const marketAssets = load(resolve(root, 'public/assets/figma/marketplace/provenance.json'));
const displayedAssets = new Set(nodes(market).filter(node => node.type === 'img').map(node => node.props.src));
assert.deepEqual(nodes(market).filter(node => node.props.role === 'tab').map(node => node.props.children), ['Discover', 'AI Apps', 'Agent Skills', 'Plugins', 'Templates']);
const selectMarketCategory = label => {
  find(market, node => node.props.role === 'tab' && node.props.children === label).props.onClick();
  market = renderMarketplace();
};
for (const [label, count, scenario, expectedTitle] of [
  ['AI Apps', 20, 'AI 字段', '项目预算展示'],
  ['Agent Skills', 16, '项目复盘', '项目结项复盘报告'],
  ['Plugins', 24, 'API 授权', 'API 连接器'],
  ['Templates', 16, '软件研发', 'Agile 敏捷开发流程'],
]) {
  selectMarketCategory(label);
  assert.deepEqual(sectionIds(market), []);
  assert.equal(nodes(market).filter(node => node.props.role === 'tab' && node.props['aria-selected']).length, 1);
  const component = find(market, byName('MarketplaceCatalog'));
  assert.equal(component.props.category, label);
  assert.equal(component.key, label, 'Switching categories remounts the catalog and resets its filter');
  const renderCatalog = mount(component.type);
  let listing = renderCatalog(component.props);
  const cards = tree => nodes(tree).filter(node => node.props['data-catalog-card']);
  assert.equal(cards(listing).length, count);
  assert.equal(new Set(cards(listing).map(node => node.key)).size, count);
  if (label === 'Agent Skills' || label === 'AI Apps') {
    const names = cards(listing).map(card => find(card, node => node.type === 'strong').props.children);
    const descriptions = cards(listing).map(card => label === 'AI Apps'
      ? find(card, node => node.props.className === 'marketplace-catalog-app-description').props.children
      : find(card, node => node.props.className === 'marketplace-skill-copy').props.children[1].props.children);
    assert.equal(new Set(names).size, count, `${label} names are distinct`);
    assert.equal(new Set(descriptions).size, count, `${label} descriptions are distinct`);
    assert.ok(descriptions.every(description => /[\u4e00-\u9fff]/.test(description)), 'Descriptions use meaningful Chinese copy');
  }
  if (label === 'AI Apps') {
    const images = cards(listing).map(card => find(card, node => node.type === 'img').props.src);
    assert.equal(new Set(images).size, count, 'AI Apps use distinct icon assets');
    const addedApps = marketplaceCatalogs['AI Apps'].items.slice(9);
    assert.equal(addedApps.length, 11);
    for (const item of addedApps) {
      assert.match(item.color, /^#[0-9a-f]{6}$/i, 'New app icon tiles use a solid color');
      const channels = item.color.slice(1).match(/../g).map(value => parseInt(value, 16));
      const saturation = (Math.max(...channels) - Math.min(...channels)) / Math.max(...channels);
      assert.ok(saturation >= .55, `${item.title}: preserve saturated icon backgrounds`);
      const svg = readFileSync(resolve(root, 'public/assets/figma/marketplace', item.image), 'utf8');
      assert.ok(svg.includes('fill="white"'), `${item.title}: use the exported white glyph`);
      const card = cards(listing).find(node => node.key === item.id);
      const tile = find(card, node => node.props.className === 'marketplace-catalog-app-icon');
      assert.equal(tile.props.style.backgroundColor, item.color);
      assert.equal(find(tile, node => node.type === 'img').props.width, 20);
      assert.ok(item.scenarios.every(scenario => marketplaceCatalogs['AI Apps'].filters.includes(scenario)));
    }
  }
  if (label === 'Plugins') {
    const addedPlugins = marketplaceCatalogs.Plugins.items.slice(16);
    assert.equal(addedPlugins.length, 8);
    for (const item of addedPlugins) {
      assert.match(item.color, /^#[0-9a-f]{6}$/i, 'New plugin icons use solid-color backgrounds');
      const channels = item.color.slice(1).match(/../g).map(value => parseInt(value, 16));
      assert.ok((Math.max(...channels) - Math.min(...channels)) / Math.max(...channels) >= .55, `${item.title}: saturated background`);
      const svg = readFileSync(resolve(root, 'public/assets/figma/marketplace', item.image), 'utf8');
      assert.ok(svg.includes('fill="white"'), `${item.title}: existing Figma white glyph`);
      assert.ok(item.scenarios.length > 0 && item.scenarios.every(scenario => marketplaceCatalogs.Plugins.filters.includes(scenario)));
      const card = cards(listing).find(node => node.key === item.id);
      const icon = find(card, node => node.props.className === 'marketplace-plugin-icon');
      assert.equal(icon.props.style.backgroundColor, item.color);
      assert.equal(find(icon, node => node.type === 'img').props.width, 26);
      card.props.onClick();
      market = renderMarketplace();
      const detail = find(market, byName('ItemDetail'));
      assert.equal(detail.props.item.title, item.title);
      assert.equal(detail.props.item.description, item.description);
      assert.equal(detail.props.item.image, item.image);
      assert.equal(detail.props.item.color, item.color);
      detail.props.onClose();
    }
    market = renderMarketplace();
    for (const read of [
      card => find(card, node => node.type === 'strong').props.children,
      card => find(card, node => node.props.className === 'marketplace-plugin-description').props.children,
      card => find(card, node => node.type === 'img').props.src,
      card => find(card, node => node.props.className === 'marketplace-downloads').props.children[1],
    ]) {
      const values = cards(listing).map(read);
      assert.ok(values.every(value => typeof value === 'string' && value.length > 0));
      assert.equal(new Set(values).size, count, 'Plugin names, descriptions, icons and download counts are distinct');
    }
  }
  nodes(listing).filter(node => node.type === 'img').forEach(node => displayedAssets.add(node.props.src));
  const defaultFilter = find(listing, node => node.props['aria-pressed'] === true).props.children;
  if (label === 'Agent Skills') {
    const scenarioButtons = nodes(listing).filter(node => node.props['aria-pressed'] === false);
    const matchedSkills = new Set();
    for (const button of scenarioButtons) {
      button.props.onClick();
      listing = renderCatalog(component.props);
      assert.equal(cards(listing).length, 2, `${button.props.children} offers two relevant skills`);
      cards(listing).forEach(card => {
        assert.ok(!matchedSkills.has(card.key), 'Each skill belongs to its primary scenario');
        matchedSkills.add(card.key);
      });
    }
    assert.equal(matchedSkills.size, count, 'All skills are discoverable through the scenario filters');
  }
  find(listing, node => node.type === 'button' && node.props.children === scenario).props.onClick();
  listing = renderCatalog(component.props);
  assert.ok(cards(listing).length > 0 && cards(listing).length < count, `${label} filters the displayed cards`);
  assert.equal(nodes(listing).filter(node => node.props['aria-pressed'] === true).length, 1);
  assert.ok(find(listing, node => node.type === 'strong' && node.props.children === expectedTitle));
  const selectedCard = cards(listing).find(card => nodes(card).some(node => node.type === 'strong' && node.props.children === expectedTitle));
  selectedCard.props.onClick();
  market = renderMarketplace();
  const detail = find(market, byName('ItemDetail'));
  if (label === 'Agent Skills') {
    assert.ok(!detail);
    assert.ok(selectedSkillPrompt.prompt.includes(expectedTitle));
  } else {
    assert.equal(detail.props.item.title, expectedTitle);
    assert.equal(`/assets/figma/marketplace/${detail.props.item.image}`, find(selectedCard, node => node.type === 'img').props.src);
    if (label === 'AI Apps') {
      const description = find(selectedCard, node => node.props.className === 'marketplace-catalog-app-description').props.children;
      assert.equal(detail.props.item.description, description, 'Details match the selected card description');
    }
    detail.props.onClose();
  }
  market = renderMarketplace();
  find(listing, node => node.type === 'button' && node.props.children === defaultFilter).props.onClick();
  assert.equal(cards(renderCatalog(component.props)).length, count);
}
for (const item of marketAssets.assets) {
  const relative = `assets/figma/marketplace/${item.file}`;
  assert.ok(displayedAssets.has(`/${relative}`), `Export is used by the marketplace: ${item.file}`);
  const bytes = readFileSync(resolve(root, 'public', relative));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  if (item.reusedFrom) assert.deepEqual(bytes, readFileSync(resolve(root, 'public', item.reusedFrom.slice(1))), 'Reused Figma glyph bytes remain unchanged');
  assert.ok(existsSync(resolve(root, 'dist', relative)), `Production build includes ${item.file}`);
  if (item.sectionNodeId === '19:34723' || item.sectionNodeId === '19:33642') {
    assert.equal(item.exportScale, 3);
    assert.equal(bytes.readUInt32BE(16), item.width);
    assert.equal(bytes.readUInt32BE(20), item.height);
  }
}
find(market, node => node.props.role === 'tab' && node.props.children === 'Templates').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
market = renderMarketplace();
assert.deepEqual(sectionIds(market), ['templates', 'skills', 'apps', 'plugins', 'academy']);
assert.equal(nodes(market).filter(node => node.props.className === 'marketplace-skill-card marketplace-card').length, 4);
find(market, node => node.type?.name === 'Section' && node.props.id === 'skills').props.onMore();
market = renderMarketplace();
assert.equal(find(market, byName('MarketplaceCatalog')).props.category, 'Agent Skills');
assert.equal(find(market, node => node.props.role === 'tab' && node.props['aria-selected']).props.children, 'Agent Skills');
const skillCatalog = find(market, byName('MarketplaceCatalog'));
const skillListing = mount(skillCatalog.type)(skillCatalog.props);
find(skillListing, node => node.props['data-catalog-card'] === 'skill').props.onClick();
market = renderMarketplace();
assert.ok(!find(market, byName('ItemDetail')));
assert.ok(selectedSkillPrompt.prompt.includes('项目结项复盘报告'));
find(market, node => node.props.role === 'tab' && node.props.children === 'Discover').props.onClick();
market = renderMarketplace();
assert.deepEqual(sectionIds(market), ['templates', 'skills', 'apps', 'plugins', 'academy']);
find(market, node => node.props.className === 'marketplace-template-card marketplace-card').props.onClick();
market = renderMarketplace();
assert.equal(find(market, byName('ItemDetail')).props.item.title, '整车制造解决方案');
find(market, byName('ItemDetail')).props.onClose();
market = renderMarketplace();
assert.ok(!find(market, byName('ItemDetail')));
find(market, node => node.type?.name === 'Section' && node.props.id === 'plugins').props.onMore();
market = renderMarketplace();
assert.equal(find(market, byName('MarketplaceCatalog')).props.category, 'Plugins');
const rewrites = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')).rewrites;
assert.ok(rewrites.some(rule => rule.source === '/marketplace' && rule.destination === '/index.html'));
assert.ok(rewrites.some(rule => rule.source === '/marketplace/' && rule.destination === '/index.html'));

// Exercise the avatar entry, menu focus, outside dismissal and Escape cleanup.
const sidebarComponent = find(renderApp(), byName('Sidebar'));
const renderSidebar = mount(sidebarComponent.type);
let sidebar = renderSidebar(sidebarComponent.props);
const profileComponent = find(sidebar, byName('ProfileMenu'));
const renderProfile = mount(profileComponent.type);
const profileTrigger = new TestNode();
const profileItems = Array.from({ length: 4 }, () => new TestNode());
const profileContainer = new TestNode([profileTrigger, ...profileItems]);
profileContainer.querySelectorAll = () => profileItems;
function profileTree() {
  sidebar = renderSidebar(sidebarComponent.props);
  const tree = renderProfile(find(sidebar, byName('ProfileMenu')).props);
  tree.props.ref.current = profileContainer;
  find(tree, node => node.props.id === 'profile-menu-trigger').props.ref.current = profileTrigger;
  return tree;
}
const avatar = tree => find(tree, node => node.props.id === 'profile-menu-trigger');
let profile = profileTree();
assert.equal(avatar(profile).props['aria-expanded'], false);
assert.ok(!find(profile, node => node.props.role === 'menu'));
avatar(profile).props.onClick();
profile = profileTree();
assert.ok(find(sidebar, node => node.type === 'aside').props.className.includes('has-profile-menu'));
assert.equal(avatar(profile).props['aria-expanded'], true);
const menuItems = nodes(profile).filter(node => node.props.role === 'menuitem');
assert.deepEqual(menuItems.map(item => find(item, node => node.type === 'span').props.children), ['企业管理平台', '开放平台', '偏好设置', 'MCP 配置']);
assert.equal(nodes(profile).filter(node => node.props.role === 'group').length, 2);
let cleanupProfile = renderProfile.flushEffects();
assert.equal(testDocument.activeElement, profileItems[0]);
const key = value => ({ key: value, preventDefault() {} });
const profileMenu = find(profile, node => node.props.role === 'menu');
profileMenu.props.onKeyDown(key('ArrowUp'));
assert.equal(testDocument.activeElement, profileItems[3]);
profileMenu.props.onKeyDown(key('Home'));
assert.equal(testDocument.activeElement, profileItems[0]);
profileMenu.props.onKeyDown(key('End'));
assert.equal(testDocument.activeElement, profileItems[3]);
const escapeProfile = new Event('keydown', { cancelable: true });
Object.defineProperty(escapeProfile, 'key', { value: 'Escape' });
testDocument.dispatchEvent(escapeProfile);
profile = profileTree();
assert.equal(avatar(profile).props['aria-expanded'], false);
assert.equal(testDocument.activeElement, profileTrigger);
assert.equal(escapeProfile.defaultPrevented, true);
cleanupProfile();
avatar(profile).props.onKeyDown(key('ArrowUp'));
profile = profileTree();
cleanupProfile = renderProfile.flushEffects();
assert.equal(testDocument.activeElement, profileItems[3]);
const pointer = target => { const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: target }); testDocument.dispatchEvent(event); };
pointer(profileItems[0]);
assert.equal(avatar(profileTree()).props['aria-expanded'], true);
pointer(new TestNode());
profile = profileTree();
assert.equal(avatar(profile).props['aria-expanded'], false);
cleanupProfile();
avatar(profile).props.onClick();
profile = profileTree();
avatar(profile).props.onClick();
assert.equal(avatar(profileTree()).props['aria-expanded'], false);
const profileAssets = load(resolve(root, 'public/assets/figma/profile-menu/provenance.json'));
for (const asset of profileAssets.assets) {
  const original = readFileSync(resolve(root, 'public/assets/figma/profile-menu', asset.file));
  assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
  assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/profile-menu', asset.file)), original);
}
console.log('Avatar menu checks passed: four items, two groups, toggle, keyboard focus, Escape, outside dismissal and Figma asset integrity.');

// Navigate into the independent admin shell from both supported workspaces.
for (const startUrl of ['https://example.test/?view=new-chat&source=admin#report', 'https://example.test/marketplace?source=admin']) {
  setLocation(startUrl);
  const renderAdminRoute = mount(appElement.type);
  let route = renderAdminRoute();
  const cleanupRoute = renderAdminRoute.flushEffects();
  const sidebarNode = find(route, byName('Sidebar'));
  const renderAdminSidebar = mount(sidebarNode.type);
  let sidebarTree = renderAdminSidebar(sidebarNode.props);
  find(sidebarTree, byName('ProfileMenu')).props.onOpenChange(true);
  sidebarTree = renderAdminSidebar(sidebarNode.props);
  const profileNode = find(sidebarTree, byName('ProfileMenu'));
  const openedProfile = mount(profileNode.type)(profileNode.props);
  find(openedProfile, node => node.props.role === 'menuitem').props.onClick();
  route = renderAdminRoute();
  assert.equal(testWindow.location.pathname, '/admin');
  assert.equal(testWindow.location.searchParams.get('source'), 'admin');
  assert.equal(testWindow.location.searchParams.has('view'), false);
  assert.equal(testWindow.location.hash, '');
  assert.ok(find(route, byName('AdminPage')));
  assert.ok(!find(route, byName('Sidebar')) && !find(route, byName('ReportPreview')) && !find(route, byName('Marketplace')));
  testWindow.history.go(-1);
  route = renderAdminRoute();
  assert.ok(find(route, byName(startUrl.includes('/marketplace') ? 'Marketplace' : 'NewConversation')));
  testWindow.history.go(1);
  route = renderAdminRoute();
  assert.ok(find(route, byName('AdminPage')));
  find(route, byName('AdminPage')).props.onExit();
  route = renderAdminRoute();
  assert.equal(testWindow.location.pathname, '/');
  assert.ok(find(route, byName('Sidebar')) && !find(route, byName('AdminPage')));
  cleanupRoute();
}
for (const path of ['/admin', '/admin/', '/admin?view=new-chat#report']) {
  setLocation(`https://example.test${path}`);
  const freshRoute = mount(appElement.type)();
  assert.ok(find(freshRoute, byName('AdminPage')), `${path} opens the admin page directly`);
  assert.ok(!find(freshRoute, byName('ReportPreview')));
}
for (const path of ['/admin', '/admin/']) assert.ok(rewrites.some(rule => rule.source === path && rule.destination === '/index.html'));

const adminStorage = new Map();
testWindow.localStorage = { getItem: key => adminStorage.get(key) ?? null, setItem: (key, value) => adminStorage.set(key, value), get length() { return adminStorage.size; }, key: index => [...adminStorage.keys()][index] ?? null };
const { AdminPage } = load(resolve(root, 'src/AdminPage.tsx'));
const { adminSettingsKey, loadAdminSettings, defaultAdminSettings, moveNavigation } = load(resolve(root, 'src/admin-settings.ts'));
const adminMessages = [];
const adminProps = { onExit() {}, notify: message => adminMessages.push(message) };
const renderAdmin = mount(AdminPage);
let adminPage = renderAdmin(adminProps);
const adminSwitches = tree => nodes(tree).filter(byName('SettingsSwitch'));
const adminOrder = tree => nodes(tree).filter(node => node.props['data-admin-nav-id']).map(node => node.props['data-admin-nav-id']);
const adminAnimationCalls = [];
let reduceAdminMotion = false;
testWindow.matchMedia = () => ({ matches: reduceAdminMotion });
function bindAdminRows(tree) {
  const list = find(tree, node => node.props.className?.startsWith('admin-navigation-settings'));
  list.props.ref.current = {
    getBoundingClientRect: () => ({ top: 100 }),
    children: nodes(tree).filter(node => node.props['data-admin-nav-id']).map((row, index) => ({
      dataset: { adminNavId: row.props['data-admin-nav-id'] }, offsetTop: index * 36,
      getBoundingClientRect: () => ({ top: 100 + index * 36 + Number(row.props.style.transform.match(/translateY\(([-\d.]+)px\)/)[1]) }),
      animate: (frames, options) => { adminAnimationCalls.push({ id: row.props['data-admin-nav-id'], frames, options }); return { cancel() {} }; },
    })),
  };
}
bindAdminRows(adminPage);
assert.deepEqual(nodes(adminPage).filter(node => node.type === 'h2').map(node => node.props.children), ['空间列表展示范围', '任务设置', '模版共享', '主导航入口配置']);
assert.equal(adminSwitches(adminPage).length, 8);
assert.ok(adminSwitches(adminPage).every(control => control.props.checked));
for (const label of ['显示主页', '显示CodeM']) {
  const control = adminSwitches(adminPage).find(node => node.props.label === label);
  assert.equal(mount(control.type)(control.props).props.disabled, true);
}
const spaceControl = adminSwitches(adminPage)[0];
mount(spaceControl.type)(spaceControl.props).props.onClick();
adminPage = renderAdmin(adminProps);
assert.equal(adminSwitches(adminPage)[0].props.checked, false);
renderAdmin.flushEffects()();
assert.equal(adminSwitches(mount(AdminPage)(adminProps))[0].props.checked, false, 'Settings survive remounts');
find(adminPage, node => node.props['aria-label'] === '调整我的工作顺序').props.onKeyDown(key('ArrowDown'));
adminPage = renderAdmin(adminProps);
bindAdminRows(adminPage);
renderAdmin.flushLayoutEffects();
assert.deepEqual(adminOrder(adminPage), ['home', 'agent', 'team', 'my-work', 'marketplace']);
assert.deepEqual(adminAnimationCalls.map(call => [call.id, call.frames[0].transform]), [['team', 'translateY(36px)'], ['my-work', 'translateY(-36px)']], 'Keyboard reorders animate both displaced rows from their previous positions');
const teamHandle = find(adminPage, node => node.props['aria-label'] === '调整团队顺序');
teamHandle.props.onKeyDown(key('ArrowUp'));
assert.deepEqual(adminOrder(renderAdmin(adminProps)), ['home', 'agent', 'team', 'my-work', 'marketplace'], 'Configurable entries cannot move ahead of fixed entries');
const pointerStart = (clientY, pointerId = 1) => ({ button: 0, clientY, pointerId, preventDefault() {}, currentTarget: { focus() {}, setPointerCapture() {} } });
teamHandle.props.onPointerDown(pointerStart(188));
teamHandle.props.onPointerMove({ pointerId: 2, clientY: 251 });
adminPage = renderAdmin(adminProps);
assert.equal(find(adminPage, node => node.props['data-admin-nav-id'] === 'team').props.style.transform, 'translateY(0px)', 'Another pointer cannot move the captured row');
teamHandle.props.onPointerMove({ pointerId: 1, clientY: 251 });
adminPage = renderAdmin(adminProps);
bindAdminRows(adminPage);
assert.deepEqual(adminOrder(adminPage), ['home', 'agent', 'team', 'my-work', 'marketplace'], 'Dragging previews positions without moving DOM nodes or committing the order');
assert.equal(find(adminPage, node => node.props['data-admin-nav-id'] === 'team').props.style.transform, 'translateY(63px)');
assert.equal(find(adminPage, node => node.props['data-admin-nav-id'] === 'my-work').props.style.transform, 'translateY(-36px)');
teamHandle.props.onPointerUp({ pointerId: 1 });
adminPage = renderAdmin(adminProps);
bindAdminRows(adminPage);
renderAdmin.flushLayoutEffects();
assert.deepEqual(adminOrder(adminPage), ['home', 'agent', 'my-work', 'marketplace', 'team']);
assert.equal(adminAnimationCalls.at(-1).frames[0].transform, 'translateY(-9px)', 'The dropped row settles from the exact pointer position');
assert.equal(adminAnimationCalls.at(-1).options.duration, 220);

// Interrupted drags restore the existing order; reduced motion skips settling animations.
const cancelledHandle = find(adminPage, node => node.props['aria-label'] === '调整团队顺序');
cancelledHandle.props.onPointerDown(pointerStart(260));
cancelledHandle.props.onPointerMove({ pointerId: 1, clientY: 100 });
adminPage = renderAdmin(adminProps);
bindAdminRows(adminPage);
assert.equal(find(adminPage, node => node.props['data-admin-nav-id'] === 'team').props.style.transform, 'translateY(-72px)', 'Dragging cannot enter the fixed slots');
reduceAdminMotion = true;
const animationCount = adminAnimationCalls.length;
cancelledHandle.props.onPointerCancel({ pointerId: 1 });
adminPage = renderAdmin(adminProps);
bindAdminRows(adminPage);
renderAdmin.flushLayoutEffects();
assert.deepEqual(adminOrder(adminPage), ['home', 'agent', 'my-work', 'marketplace', 'team']);
assert.equal(adminAnimationCalls.length, animationCount);
assert.ok(!find(adminPage, node => node.props.className?.includes('is-dragging')));
reduceAdminMotion = false;

// Both fixed rows expose the exact explanation on hover/focus and dismiss on Escape.
const tooltipCopy = '飞书项目系统默认启用并置顶，暂不支持修改';
for (const id of ['home', 'agent']) {
  const fixedRow = find(adminPage, node => node.props['data-admin-nav-id'] === id);
  assert.equal(fixedRow.props.tabIndex, 0);
  fixedRow.props.onPointerEnter();
  adminPage = renderAdmin(adminProps);
  const tooltip = find(adminPage, node => node.props.id === `admin-fixed-tooltip-${id}`);
  assert.equal(tooltip.props.children, tooltipCopy);
  assert.equal(tooltip.props['aria-hidden'], false);
  fixedRow.props.onPointerLeave({ currentTarget: { contains: () => false } });
  adminPage = renderAdmin(adminProps);
  assert.equal(find(adminPage, node => node.props.id === `admin-fixed-tooltip-${id}`).props['aria-hidden'], true);
  fixedRow.props.onFocus();
  adminPage = renderAdmin(adminProps);
  const cleanupTooltip = renderAdmin.flushEffects();
  assert.equal(find(adminPage, node => node.props.id === `admin-fixed-tooltip-${id}`).props['aria-hidden'], false);
  testDocument.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  adminPage = renderAdmin(adminProps);
  assert.equal(find(adminPage, node => node.props.id === `admin-fixed-tooltip-${id}`).props['aria-hidden'], true);
  cleanupTooltip();
}
const teamControl = adminSwitches(adminPage).find(node => node.props.label === '显示团队');
mount(teamControl.type)(teamControl.props).props.onClick();
adminPage = renderAdmin(adminProps);
renderAdmin.flushEffects()();
const persistedAdmin = mount(AdminPage)(adminProps);
assert.deepEqual(adminOrder(persistedAdmin), ['home', 'agent', 'my-work', 'marketplace', 'team']);
assert.equal(adminSwitches(persistedAdmin).find(node => node.props.label === '显示团队').props.checked, false);
const initialAdmin = defaultAdminSettings();
assert.equal(moveNavigation(initialAdmin, 'home', 'team'), initialAdmin);
assert.equal(moveNavigation(initialAdmin, 'team', 'agent'), initialAdmin);
testWindow.localStorage.setItem(adminSettingsKey, '{invalid');
assert.deepEqual(loadAdminSettings(), initialAdmin);
testWindow.localStorage.setItem(adminSettingsKey, JSON.stringify({ navigation: [{ id: 'home', visible: false }, { id: 'team', visible: false }, { id: 'team' }, { id: 'unknown' }] }));
const repairedAdmin = loadAdminSettings();
assert.deepEqual(repairedAdmin.navigation.slice(0, 2), initialAdmin.navigation.slice(0, 2));
assert.equal(new Set(repairedAdmin.navigation.map(item => item.id)).size, 5);
find(adminPage, node => node.props['aria-label'] === '收起管理导航').props.onClick();
adminPage = renderAdmin(adminProps);
assert.ok(adminPage.props.className.includes('admin-nav-collapsed'));
find(adminPage, node => node.props['aria-label'] === '打开管理导航').props.onClick();
adminPage = renderAdmin(adminProps);
assert.equal(find(adminPage, node => node.props.id === 'admin-navigation').props['aria-modal'], true);
assert.ok(!adminPage.props.className.includes('admin-nav-collapsed'));
find(adminPage, node => node.props['aria-label'] === '关闭管理导航').props.onClick();
adminPage = renderAdmin(adminProps);
assert.equal(find(adminPage, node => node.props.id === 'admin-navigation').props['aria-modal'], undefined);
const adminAssets = load(resolve(root, 'public/assets/figma/admin/provenance.json'));
assert.equal(adminAssets.assets.length, 15);
for (const asset of adminAssets.assets) {
  const original = readFileSync(resolve(root, 'public/assets/figma/admin', asset.file));
  assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
  assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/admin', asset.file)), original);
}
console.log('Admin checks passed: routes, switches, fixed entries, animated keyboard/pointer reorder, cancelled drags, reduced motion, fixed-entry tooltips, persistence, mobile drawer and 15 Figma assets.');
// Apps use stable identities, even after filtering duplicate navigation labels.
{
  const { workItemApplications: applications, applicationFromPath } = load(resolve(root, 'src/work-item-navigation.ts'));
  assert.equal(new Set(applications.map(item => item.slug)).size, 8);
  assert.equal(applicationFromPath('/apps/unknown'), undefined);
  for (const application of applications) {
    setLocation('https://example.test/?view=new-chat&utm_source=share');
    const render = mount(appElement.type);
    let page = render();
    find(page, byName('Sidebar')).props.onNavigate(application.id);
    page = render();
    assert.equal(testWindow.location.pathname, `/apps/${application.slug}`);
    assert.equal(testWindow.location.searchParams.get('utm_source'), 'share');
    assert.equal(testWindow.location.searchParams.has('view'), false);
    assert.ok(find(page, byName('WorkItemsPage')));
    assert.equal(find(page, byName('WorkItemsPage')).key, application.id, 'Switching Apps remounts the work-item page and clears its drawer');
    assert.ok(!find(page, byName('ReportPreview')));
    assert.ok(!find(page, byName('NewConversation')));
    assert.equal(find(page, byName('Sidebar')).props.active, application.id);
    setLocation(`https://example.test/apps/${application.slug}/`);
    assert.ok(find(mount(appElement.type)(), byName('WorkItemsPage')), 'Direct and trailing-slash loads show the work-item page');
  }
  setLocation('https://example.test/apps/story-list');
  const page = mount(appElement.type)();
  const sidebarElement = find(page, byName('Sidebar'));
  const render = mount(sidebarElement.type);
  let sidebar = render(sidebarElement.props);
  find(sidebar, node => node.props['aria-label'] === '搜索导航').props.onChange({ target: { value: 'Story' } });
  sidebar = render(sidebarElement.props);
  const stories = nodes(sidebar).filter(node => node.type === 'button' && node.props.className?.includes('app-row'));
  assert.equal(stories.length, 2);
  assert.equal(stories[0].props['aria-current'], undefined);
  assert.equal(stories[1].props['aria-current'], 'page');
  const choices = [];
  const selectable = render({ ...sidebarElement.props, onNavigate: id => choices.push(id) });
  nodes(selectable).filter(node => node.type === 'button' && node.props.className?.includes('app-row')).forEach(node => node.props.onClick());
  assert.deepEqual(choices, ['Story-3', 'Story-5']);

  setLocation('https://example.test/?view=new-chat');
  const renderHistory = mount(appElement.type);
  let historyPage = renderHistory();
  const cleanup = renderHistory.flushEffects();
  find(historyPage, byName('Sidebar')).props.onNavigate('Epic-0');
  historyPage = renderHistory();
  find(historyPage, byName('Sidebar')).props.onNavigate('Marketplace');
  testWindow.history.go(-1);
  historyPage = renderHistory();
  assert.ok(find(historyPage, byName('WorkItemsPage')));
  assert.equal(find(historyPage, byName('Sidebar')).props.active, 'Epic-0');
  testWindow.history.go(-1);
  assert.ok(find(renderHistory(), byName('NewConversation')));
  testWindow.history.go(1);
  assert.ok(find(renderHistory(), byName('WorkItemsPage')));
  find(renderHistory(), byName('Sidebar')).props.onNavigate('CodeM');
  assert.equal(testWindow.location.pathname, '/');
  assert.ok(!find(renderHistory(), byName('WorkItemsPage')));
  cleanup();

  const exported = load(resolve(root, 'public/assets/figma/work-items/provenance.json'));
  assert.equal(exported.assets.length, 24);
  for (const asset of exported.assets) {
    const original = readFileSync(resolve(root, 'public/assets/figma/work-items', asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-items', asset.file)), original);
    if (asset.file.endsWith('.png')) assert.deepEqual([original.readUInt32BE(16), original.readUInt32BE(20)], [60, 60]);
  }
}
console.log('Work-item checks passed: eight routes, direct loads, duplicate Story identities, browser history and 24 Figma assets.');
// Work-item detail URLs restore the table, sidebar selection and drawer together.
{
  const { workItemApplications: applications, applicationFromPath, workItemIdFromPath, navigateWorkItem, navigateApplication, subscribeWorkItemNavigation } = load(resolve(root, 'src/work-item-navigation.ts'));
  for (const application of applications) {
    for (const id of [1, 3, 8]) {
      for (const suffix of ['', '/']) {
        setLocation(`https://example.test/apps/${application.slug}/${id}${suffix}?utm_source=share`);
        const app = mount(appElement.type)();
        assert.equal(find(app, byName('Sidebar')).props.active, application.id);
        const pageElement = find(app, byName('WorkItemsPage'));
        assert.ok(pageElement, 'Direct detail URLs resolve to the correct application');
        const renderPage = mount(pageElement.type);
        const page = renderPage(pageElement.props);
        const drawer = find(page, byName('WorkItemDrawer'));
        assert.equal(drawer.props.item.id, id, 'A direct or refreshed link opens the requested drawer');
        assert.equal(nodes(page).filter(node => node.props['data-selected']).length, 1);
        assert.equal(find(page, node => node.props['data-selected']).props['data-work-item-row'], id);
        const trigger = new TestNode();
        const getElement = testDocument.getElementById;
        testDocument.getElementById = target => target === `work-item-title-${application.slug}-${id}` ? trigger : null;
        drawer.props.onClose();
        testDocument.getElementById = getElement;
        assert.equal(testWindow.location.pathname, `/apps/${application.slug}`);
        assert.equal(testWindow.location.searchParams.get('utm_source'), 'share');
        assert.equal(testDocument.activeElement, trigger, 'Closing a shared link focuses its own row');
        assert.ok(!find(renderPage(pageElement.props), byName('WorkItemDrawer')));
      }
    }
    for (const invalid of ['999', 'no-such-item', '0', '-1', '1.5', '01', '1e0', '9007199254740992', '%31']) {
      setLocation(`https://example.test/apps/${application.slug}/${invalid}`);
      const app = mount(appElement.type)();
      const pageElement = find(app, byName('WorkItemsPage'));
      assert.ok(pageElement, 'An invalid item keeps its application table available');
      assert.ok(!find(mount(pageElement.type)(pageElement.props), byName('WorkItemDrawer')), 'Invalid links never open a different item');
      if (invalid !== '999') assert.equal(workItemIdFromPath(testWindow.location.pathname, application.slug), null);
    }
  }
  assert.equal(applicationFromPath('/apps/epic/1/extra'), undefined);
  assert.equal(applicationFromPath('/apps/unknown/1'), undefined);
  assert.equal(workItemIdFromPath('/apps/epic/3', 'version'), null);

  setLocation('https://example.test/apps/epic?utm_source=share');
  const renderApp = mount(appElement.type);
  const app = () => renderApp();
  app();
  const stopApp = renderApp.flushEffects();
  const pageElement = find(app(), byName('WorkItemsPage'));
  const renderPage = mount(pageElement.type);
  const page = () => renderPage(pageElement.props);
  const drawer = () => find(page(), byName('WorkItemDrawer'));
  const openRow = id => find(page(), node => node.props['data-work-item-row'] === id).props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  page(); const stopPage = renderPage.flushEffects();
  let notifications = 0;
  const unsubscribe = subscribeWorkItemNavigation(() => notifications++);
  openRow(1);
  assert.equal(testWindow.location.pathname, '/apps/epic/1');
  assert.equal(notifications, 1);
  const historySize = historyEntries.length;
  openRow(1);
  assert.equal(historyEntries.length, historySize, 'Clicking the selected row does not duplicate history');
  openRow(3);
  assert.equal(testWindow.location.pathname, '/apps/epic/3');
  assert.equal(drawer().props.item.id, 3);
  testWindow.history.go(-1);
  assert.equal(drawer().props.item.id, 1);
  testWindow.history.go(-1);
  assert.ok(!drawer(), 'Back to the list closes the drawer');
  testWindow.history.go(1);
  assert.equal(drawer().props.item.id, 1, 'Forward restores the drawer');
  find(app(), byName('Sidebar')).props.onNavigate('Epic-0');
  assert.equal(testWindow.location.pathname, '/apps/epic');
  assert.ok(!drawer(), 'Clicking the active sidebar entry closes its detail too');
  openRow(8); drawer().props.onClose(false);
  assert.equal(testWindow.location.pathname, '/apps/epic');
  assert.ok(!drawer());
  openRow(3);
  find(app(), byName('Sidebar')).props.onNavigate('Marketplace');
  assert.ok(find(app(), byName('Marketplace')));
  testWindow.history.go(-1);
  const restored = find(app(), byName('WorkItemsPage'));
  assert.equal(restored.props.application.slug, 'epic');
  assert.equal(find(mount(restored.type)(restored.props), byName('WorkItemDrawer')).props.item.id, 3, 'Returning from another page restores the shared detail route');
  unsubscribe(); stopPage(); stopApp();
  const before = notifications;
  navigateApplication('Epic-0'); navigateWorkItem('Epic-0', 2); testWindow.history.go(-1);
  assert.equal(notifications, before, 'Unmount removes all navigation subscriptions');
  const location = testWindow.location.href;
  navigateWorkItem('unknown', 1); navigateWorkItem('Epic-0', NaN); navigateWorkItem('Epic-0', -1);
  assert.equal(testWindow.location.href, location);
  const vercel = load(resolve(root, 'vercel.json'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/apps/:path*' && rule.destination === '/index.html'), 'Hosting rewrites include direct detail links');
  setLocation('https://example.test/');
}
console.log('Work-item URL checks passed: eight applications, direct/trailing-slash links, selected rows, invalid IDs, open/close, same-app navigation, back/forward, query preservation, focus restoration and listener cleanup.');
// Click real table-row handlers, then exercise the detail component and its keyboard cleanup.
{
  const { workItemApplications: applications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const navigationAssets = load(resolve(root, 'src/assets.json'));
  for (const application of applications) {
    const render = mount(WorkItemsPage);
    let tablePage = render({ application });
    assert.ok(!find(tablePage, byName('WorkItemDrawer')));
    const rows = nodes(tablePage).filter(node => node.type === 'tr' && node.props['data-work-item-row']);
    assert.equal(rows.length, 8);
    let previousDialogTitle;
    for (const row of rows) {
      const trigger = new TestNode();
      const titleButton = find(row, node => node.type === 'button');
      assert.equal(titleButton.props['aria-haspopup'], 'dialog', 'Row titles expose the detail action to keyboards and screen readers');
      row.props.onClick({ currentTarget: { querySelector: () => trigger } });
      tablePage = render({ application });
      const detail = find(tablePage, byName('WorkItemDrawer'));
      assert.equal(detail.props.item.title, titleButton.props.children);
      assert.notEqual(detail.props.item.title, previousDialogTitle);
      previousDialogTitle = detail.props.item.title;
      const selectedRows = nodes(tablePage).filter(node => node.type === 'tr' && node.props['data-selected']);
      assert.equal(selectedRows.length, 1);
      assert.equal(selectedRows[0].props['data-work-item-row'], row.props['data-work-item-row']);
      assert.equal(find(selectedRows[0], node => node.type === 'button').props['aria-controls'], 'work-item-detail');

      const renderDetail = mount(detail.type);
      const drawer = renderDetail(detail.props);
      assert.equal(drawer.props.role, 'dialog');
      assert.equal(drawer.props['aria-modal'], undefined, 'Other table rows stay available while the non-modal drawer is open');
      assert.equal(find(drawer, node => node.props.id === drawer.props['aria-labelledby']).props.children, titleButton.props.children);
      const glyph = find(drawer, node => node.props.className === 'work-view-glyph');
      const tableGlyph = find(tablePage, node => node.props.className === 'work-view-glyph');
      const expectedTitleIcon = application.slug.endsWith('-ybr') ? applications.find(item => item.slug === 'story') : application;
      assert.equal(glyph.props.style.background, expectedTitleIcon.color);
      assert.equal(find(glyph, node => node.type === 'img').props.src, navigationAssets[expectedTitleIcon.icon]);
      assert.equal(glyph.props.style.background, tableGlyph.props.style.background);
      assert.equal(find(glyph, node => node.type === 'img').props.src, find(tableGlyph, node => node.type === 'img').props.src, 'Drawer and table titles use the same icon');
      const drawerNode = new TestNode();
      drawer.props.ref.current = drawerNode;
      const cleanup = renderDetail.flushEffects();
      assert.equal(testDocument.activeElement, drawerNode);
      testDocument.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowDown' }));
      assert.ok(find(render({ application }), byName('WorkItemDrawer')), 'Other keyboard actions leave the drawer open');
      if (row.props['data-work-item-row'] % 2) {
        const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
        testDocument.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, true);
      } else {
        find(drawer, node => node.props['aria-label'] === '关闭工作项详情').props.onClick();
      }
      assert.ok(!find(render({ application }), byName('WorkItemDrawer')));
      assert.equal(testDocument.activeElement, trigger, 'Closing restores focus to the selected row');
      cleanup();
      const afterUnmount = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
      testDocument.dispatchEvent(afterUnmount);
      assert.equal(afterUnmount.defaultPrevented, false, 'Unmount removes the Escape handler');
    }

    // A second visible row replaces the open item without mounting multiple drawers.
    rows[0].props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
    rows[1].props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
    tablePage = render({ application });
    const details = nodes(tablePage).filter(byName('WorkItemDrawer'));
    assert.equal(details.length, 1);
    assert.equal(details[0].props.item.title, find(rows[1], node => node.type === 'button').props.children);

    const renderDetail = mount(details[0].type);
    const detail = renderDetail(details[0].props);
    const insideButton = new TestNode();
    detail.props.ref.current = new TestNode([insideButton]);
    const cleanup = renderDetail.flushEffects();
    const pointerDown = target => {
      const event = new Event('pointerdown', { cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      testDocument.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false, 'Outside dismissal must not block the clicked control');
    };
    pointerDown(insideButton);
    assert.ok(find(render({ application }), byName('WorkItemDrawer')), 'Clicking inside keeps the drawer open');
    const rowTarget = new TestNode();
    rowTarget.closest = selector => selector === '[data-work-item-row]' ? rowTarget : null;
    pointerDown(rowTarget);
    assert.ok(find(render({ application }), byName('WorkItemDrawer')), 'Pointer down on another row preserves the drawer for row selection');
    rows[2].props.onClick({ currentTarget: { querySelector: () => rowTarget } });
    assert.equal(find(render({ application }), byName('WorkItemDrawer')).props.item.id, 3);
    const outsideControl = new TestNode();
    outsideControl.focus();
    pointerDown(outsideControl);
    assert.ok(!find(render({ application }), byName('WorkItemDrawer')), 'Clicking outside closes the drawer');
    assert.equal(testDocument.activeElement, outsideControl, 'Outside dismissal does not move focus back to the table');
    cleanup();
    rows[0].props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
    pointerDown(outsideControl);
    assert.ok(find(render({ application }), byName('WorkItemDrawer')), 'Unmount removes the outside-pointer listener');
  }
  const exported = load(resolve(root, 'public/assets/figma/work-item-drawer/provenance.json'));
  assert.equal(exported.sourceNode, '44:16783');
  assert.equal(exported.assets.length, 18);
  for (const asset of exported.assets) {
    const original = readFileSync(resolve(root, 'public/assets/figma/work-item-drawer', asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-drawer', asset.file)), original);
    if (asset.file.endsWith('.png')) {
      assert.equal(original.readUInt32BE(16), asset.width * 3);
      assert.equal(original.readUInt32BE(20), asset.height * 3);
    }
  }
}
console.log('Work-item drawer checks passed: all 64 rows, eight matching navigation icons, row replacement, close/Escape, outside dismissal, focus restoration, listener cleanup and 18 original Figma assets.');
{
  const { WorkItemWorkflow } = load(resolve(root, 'src/WorkItemWorkflow.tsx'));
  const render = mount(WorkItemWorkflow);
  const tree = render();
  const steps = nodes(tree).filter(node => node.type === 'li');
  assert.equal(steps.length, 28, 'Every Figma workflow step is an independent DOM node');
  assert.equal(new Set(steps.map(node => node.key)).size, steps.length);
  assert.ok(steps.every(node => find(node, child => child.type === 'span' && typeof child.props.children === 'string')));
  const current = steps.filter(node => node.props['aria-current'] === 'step');
  assert.equal(current.length, 1);
  assert.equal(current[0].props['aria-label'], 'Detail Review，进行中');
  assert.equal(steps.filter(node => node.props['aria-label'].endsWith('已完成')).length, 5);
  assert.equal(steps.filter(node => node.props['aria-label'].endsWith('未开始')).length, 22);
  const branded = steps.filter(node => find(node, child => child.props.className === 'work-flow-logo'));
  assert.deepEqual(branded.map(node => find(node, child => child.props.className === 'work-flow-label').props.children), ['DA Tracking', 'Tech Design', 'FE Dev', 'Server Dev', 'QA JAB', 'PM Audit', 'Pre release']);
  assert.equal(branded.filter(node => find(node, child => child.props.className === 'work-flow-agent-badge')).length, 7);
  assert.ok(!nodes(tree).some(node => node.type === 'img' && node.props.src.endsWith('.png')), 'The graph no longer embeds a raster screenshot');
  const viewport = Object.assign(new TestNode(), { scrollLeft: 0 });
  tree.props.ref.current = viewport;
  const focusedBefore = testDocument.activeElement;
  const cleanup = render.flushLayoutEffects();
  assert.equal(viewport.scrollLeft, 236.5, 'Opening preserves the UX Design position from the existing drawer');
  assert.equal(testDocument.activeElement, focusedBefore, 'Initializing the graph does not steal drawer focus');
  assert.equal(tree.props.tabIndex, 0, 'The full workflow can be reached with keyboard scrolling');
  cleanup();
  const assetDir = resolve(root, 'public/assets/figma/work-item-workflow');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(createHash('sha256').update(readFileSync(resolve(root, provenance.layout.file))).digest('hex'), provenance.layout.sha256);
  for (const asset of provenance.assets) {
    const original = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.ok(readFileSync(resolve(root, 'dist/assets/figma/work-item-workflow', asset.file)).equals(original));
  }
  const source = readFileSync(resolve(root, 'src/WorkItemDrawer.tsx'), 'utf8');
  assert.ok(source.includes('<WorkItemWorkflow ') && !source.includes('workflow.png'));
  console.log('Workflow DOM checks passed: 28 text nodes, seven branded nodes, states, opening position, keyboard access, unchanged focus and 45 Figma SVGs with cleaned connector handles.');
}
// Node content growth must move complete columns and their existing connector endpoints together.
{
  const baseline = load(resolve(root, 'src/work-item-workflow.json'));
  const { layoutWorkflow, workflowLogoWidth } = load(resolve(root, 'src/work-item-workflow-layout.ts'));
  const identity = layoutWorkflow(Object.fromEntries(baseline.nodes.map(node => [node.id, node.width - 16])));
  assert.equal(identity.width, baseline.width);
  for (const node of identity.nodes) {
    const original = baseline.nodes.find(item => item.id === node.id);
    assert.equal(node.x, original.x);
    assert.equal(node.width, original.width);
  }
  const branded = layoutWorkflow();
  const added = workflowLogoWidth + 4;
  const tech = branded.nodes.find(node => node.label === 'Tech Design');
  const fe = branded.nodes.find(node => node.label === 'FE Dev');
  assert.ok(Math.abs(tech.width - (101 + added)) < .01);
  assert.ok(Math.abs(fe.width - (94 + added)) < .01);
  assert.ok(Math.abs(branded.width - baseline.width - 6 * added) < .01);
  assert.equal(branded.connectors.length, baseline.connectors.length);
  assert.deepEqual(branded.connectors.filter(line => line.scaleX !== 1).map(line => line.id), ['44:17295', '44:17301', '44:17307', '44:17312', '44:17324', '44:17330'], 'Only edges spanning expanded intermediate columns need to stretch');
  for (const extra of [20, 100, 400]) {
    const measured = Object.fromEntries(branded.nodes.map(node => [node.id, node.width - 16]));
    measured['44:21063'] += extra;
    measured['44:21538'] += extra;
    measured['44:20392'] += extra;
    measured['44:22583'] += extra;
    measured['44:20077'] += extra;
    const expanded = layoutWorkflow(measured);
    const columns = [...new Set(baseline.nodes.map(node => node.x))].sort((a, b) => a - b);
    for (let i = 0; i < columns.length; i++) {
      const before = baseline.nodes.filter(node => node.x === columns[i]);
      const after = before.map(node => expanded.nodes.find(item => item.id === node.id));
      assert.ok(after.every(node => node.x === after[0].x && node.width === after[0].width));
      for (const node of after) assert.ok(node.width >= measured[node.id] + 16 - .01, 'Intrinsic content always fits');
      if (!i) continue;
      const previous = baseline.nodes.find(node => node.x === columns[i - 1]);
      const previousAfter = expanded.nodes.find(node => node.id === previous.id);
      const originalGap = before[0].x - previous.x - previous.width;
      assert.ok(Math.abs(after[0].x - previousAfter.x - previousAfter.width - originalGap) < .01, 'Column growth preserves the branch corridor');
    }
    for (const [source, target, ids] of [
      ['44:21063', '44:21348', ['44:20569', '44:20563', '44:20557']],
      ['44:21538', '44:21918', ['44:20527', '44:20521', '44:20515', '44:20509', '44:20503']],
      ['44:20392', '44:22583', ['44:20384', '44:20378', '44:20372', '44:20366']],
      ['44:22583', '44:20267', ['44:19932', '44:19926', '44:19920', '44:19914']],
      ['44:20077', '44:19976', ['44:20069']],
      ['44:22203', '44:22583', ['44:17295', '44:17301', '44:17307']],
      ['44:22203', '44:19976', ['44:17312']],
      ['44:20267', '44:19976', ['44:17324', '44:17330']],
    ]) {
      const sourceBefore = baseline.nodes.find(node => node.id === source);
      const targetBefore = baseline.nodes.find(node => node.id === target);
      const sourceAfter = expanded.nodes.find(node => node.id === source);
      const targetAfter = expanded.nodes.find(node => node.id === target);
      const sourceShift = sourceAfter.x + sourceAfter.width - sourceBefore.x - sourceBefore.width;
      const targetShift = targetAfter.x - targetBefore.x;
      for (const id of ids) {
        const line = expanded.connectors.find(line => line.id === id);
        const original = baseline.connectors.find(line => line.id === id);
        assert.ok(Math.abs(line.x - original.x - sourceShift) < .01);
        assert.ok(Math.abs(line.x + line.width * line.scaleX - original.x - original.width - targetShift) < .01);
        assert.equal(line.y, original.y);
        assert.equal(line.height, original.height);
      }
    }
  }
  const invalid = layoutWorkflow({ '44:21063': NaN, '44:21538': Infinity, '44:21633': -1 });
  assert.equal(invalid.width, branded.width);
  for (const line of baseline.connectors) {
    const svg = readFileSync(resolve(root, 'public/assets/figma/work-item-workflow', line.asset), 'utf8');
    assert.doesNotMatch(svg, /<(?:circle|ellipse|marker)\b/, 'Prototype handles must stay removed');
  }
  console.log('Workflow layout checks passed: intrinsic width growth, aligned parallel nodes, preserved branch gaps, adjacent/bypass connector endpoints at +20/+100/+400px, fallback sizing and no prototype handles.');
}
{
  const { applications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const application = applications[0];
  const renderTable = mount(WorkItemsPage);
  const row = id => find(renderTable({ application }), node => node.type === 'tr' && node.props['data-work-item-row'] === id);
  const trigger = new TestNode();
  const openRow = id => row(id).props.onClick({ currentTarget: { querySelector: () => trigger } });
  const detailElement = () => find(renderTable({ application }), byName('WorkItemDrawer'));
  openRow(1);
  const stopTable = renderTable.flushEffects();
  const renderDetail = mount(detailElement().type);
  const detail = renderDetail(detailElement().props);
  const planningFields = nodes(detail).filter(byName('WorkItemPlanningPicker'));
  assert.deepEqual(planningFields.map(node => node.props.field), ['pd', 'schedule', 'review-team', 'finish-date']);
  assert.ok(planningFields.slice(0, 2).every(node => node.props.value === undefined), 'PD and Schedule start empty');
  assert.equal(planningFields[2].props.value, 'ipmt');
  assert.equal(planningFields[3].props.value, '2024-06-30');
  const pickerElement = find(detail, byName('WorkItemOwnerPicker'));
  assert.equal(pickerElement.props.owner, undefined, 'Owner starts empty');
  const renderPicker = mount(pickerElement.type);
  let pickerProps = pickerElement.props;
  let view = renderPicker(pickerProps);
  const inputNode = new TestNode();
  const insideDrawer = new TestNode();
  const menuNode = new TestNode();
  const fieldNode = new TestNode([inputNode]);
  let drawerBounds = { left: 500, top: 0, width: 920, bottom: 900 };
  let fieldBounds = { left: 548, top: 407.436, bottom: 439.436 };
  const scrollNode = { getBoundingClientRect: () => ({ top: 132, bottom: drawerBounds.bottom }) };
  fieldNode.getBoundingClientRect = () => fieldBounds;
  fieldNode.closest = () => scrollNode;
  const drawerEvents = new EventTarget();
  const drawerNode = Object.assign(new TestNode([fieldNode, menuNode, insideDrawer]), {
    getBoundingClientRect: () => drawerBounds,
    addEventListener: drawerEvents.addEventListener.bind(drawerEvents),
    removeEventListener: drawerEvents.removeEventListener.bind(drawerEvents),
  });
  detail.props.ref.current = drawerNode;
  const stopDrawer = renderDetail.flushEffects();
  view.props.ref.current = fieldNode;
  const ownerInput = () => find(view, node => node.type === 'input');
  ownerInput().props.ref.current = inputNode;
  const options = () => nodes(view).filter(node => node.props.role === 'option');
  const rerender = () => { view = renderPicker(pickerProps); };
  const pointerDown = target => {
    const event = new Event('pointerdown', { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    testDocument.dispatchEvent(event);
  };
  const press = (key, isComposing = false) => {
    const nativeEvent = Object.assign(new Event('keydown', { cancelable: true }), { key, isComposing });
    ownerInput().props.onKeyDown({ key, nativeEvent, currentTarget: inputNode, preventDefault: () => nativeEvent.preventDefault(), stopPropagation: () => nativeEvent.stopPropagation() });
    return nativeEvent;
  };
  assert.equal(ownerInput().props.value, '');
  assert.ok(find(view, node => node.props.className?.includes('work-owner-placeholder')));
  inputNode.focus();
  ownerInput().props.onFocus();
  rerender();
  find(view, node => node.props.className === 'work-owner-menu').props.ref.current = menuNode;
  let stopPicker = renderPicker.flushEffects();
  let stopPosition = renderPicker.flushLayoutEffects();
  rerender();
  assert.equal(ownerInput().props['aria-expanded'], true);
  assert.deepEqual(options().map(option => find(option, node => node.props.className === 'work-owner-name').props.children), ['CodeM', 'Reviewer', 'Designer', '梁楠楠', '叶娜', '谭恬美', '郭琩']);
  const placement = () => find(view, node => node.props.className === 'work-owner-menu').props.style;
  assert.equal(placement().left, 48);
  assert.equal(placement().top, 443.436);
  assert.equal(placement().width, 320);
  assert.equal(placement().maxHeight, drawerBounds.bottom - fieldBounds.bottom - 12, 'The expanded menu is capped to available drawer space');
  pointerDown(menuNode);
  rerender();
  assert.equal(ownerInput().props['aria-expanded'], true, 'The menu portal is part of the drawer and picker');
  assert.ok(detailElement());

  drawerBounds = { left: 100, top: 0, width: 360, bottom: 500 };
  fieldBounds = { left: 128, top: 240, bottom: 272 };
  testWindow.dispatchEvent(new Event('resize'));
  rerender();
  assert.ok(placement().left >= 0 && placement().left + placement().width <= 360, 'Menu stays inside narrow drawers');
  assert.ok(placement().top + placement().maxHeight <= 500, 'Menu scrolls within short viewports');
  drawerBounds = { left: 500, top: 0, width: 920, bottom: 650 };
  fieldBounds = { left: 548, top: 580, bottom: 612 };
  testWindow.dispatchEvent(new Event('resize'));
  rerender();
  assert.ok(placement().top + placement().maxHeight < fieldBounds.top, 'Menu flips above an input near the bottom');

  ownerInput().props.onChange({ target: { value: 'FLUTTERING' } });
  rerender();
  assert.equal(options().length, 1);
  assert.equal(find(options()[0], node => node.props.className === 'work-owner-name').props.children, '叶娜');
  press('ArrowDown');
  rerender();
  assert.equal(ownerInput().props['aria-activedescendant'], options()[0].props.id);
  press('Enter', true);
  rerender();
  assert.equal(ownerInput().props['aria-expanded'], true, 'IME confirmation does not select a person');
  press('Enter');
  pickerProps = { ...pickerProps, owner: detailElement().props.owner };
  rerender();
  assert.equal(ownerInput().props.value, '叶娜');
  assert.equal(ownerInput().props['aria-expanded'], false);
  assert.equal(testDocument.activeElement, drawerNode, 'Selecting a person moves focus out of the Owner field');
  stopPicker(); stopPosition();

  ownerInput().props.onClick(); rerender();
  stopPicker = renderPicker.flushEffects();
  stopPosition = renderPicker.flushLayoutEffects();
  ownerInput().props.onChange({ target: { value: 'does-not-match' } }); rerender();
  assert.equal(options().length, 0);
  assert.equal(find(view, node => node.props.className === 'work-owner-no-results').props.children, '未找到匹配的人员或 Agent');
  const escape = press('Escape');
  testDocument.dispatchEvent(escape);
  rerender();
  assert.equal(ownerInput().props['aria-expanded'], false);
  assert.ok(detailElement(), 'First Escape closes only the Owner menu');
  stopPicker(); stopPosition();

  ownerInput().props.onClick(); rerender();
  stopPicker = renderPicker.flushEffects();
  stopPosition = renderPicker.flushLayoutEffects();
  const firstOption = options().find(option => option.props.id === 'work-owner-liang-nannan');
  firstOption.props.onClick();
  assert.equal(detailElement().props.owner.name, '梁楠楠', 'Clicking a person fills the Owner value');
  stopPicker(); stopPosition();
  pickerProps = { ...pickerProps, owner: detailElement().props.owner }; rerender();

  ownerInput().props.onClick(); rerender();
  stopPicker = renderPicker.flushEffects();
  stopPosition = renderPicker.flushLayoutEffects();
  insideDrawer.focus();
  pointerDown(insideDrawer); rerender();
  assert.equal(ownerInput().props['aria-expanded'], false, 'Clicking elsewhere in the drawer dismisses only the Owner menu');
  assert.ok(detailElement());
  assert.equal(testDocument.activeElement, insideDrawer);
  stopPicker(); stopPosition();
  testDocument.dispatchEvent(press('Escape'));
  assert.ok(!detailElement(), 'Escape still closes the drawer after the menu is dismissed');
  stopDrawer();
  openRow(1);
  assert.equal(detailElement().props.owner.name, '梁楠楠', 'Selection survives closing and reopening the same row');
  openRow(2);
  assert.equal(detailElement().props.owner, undefined, 'Owner selections do not leak into other rows');
  openRow(1);
  assert.equal(detailElement().props.owner.name, '梁楠楠');
  stopTable();

  const assetsPath = 'public/assets/figma/work-item-owner';
  const exported = load(resolve(root, assetsPath, 'provenance.json'));
  assert.equal(exported.assets.length, 4);
  for (const asset of [...exported.assets, ...exported.reusedAssets]) {
    const original = readFileSync(resolve(root, assetsPath, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-owner', asset.file)), original);
    if (asset.file.endsWith('.png')) assert.deepEqual([original.readUInt32BE(16), original.readUInt32BE(20)], [72, 72]);
  }
  const agentAssets = 'public/assets/figma/work-item-agents';
  const agentExports = load(resolve(root, agentAssets, 'provenance.json'));
  assert.equal(agentExports.sourceNode, '514:20968');
  assert.equal(agentExports.assets.length, 4);
  for (const asset of agentExports.assets) {
    const original = readFileSync(resolve(root, agentAssets, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-agents', asset.file)), original);
  }
}
console.log('Owner picker checks passed: empty values, Figma menu content, focus/open, search, keyboard/pointer selection, IME, layered dismissal, per-row values, responsive positioning and original avatars.');
// AI suggestions use cancellable local loading, and never pick a hidden list option.
{
  const { WorkItemOwnerPicker } = load(resolve(root, 'src/WorkItemOwnerPicker.tsx'));
  function fixture(initialOwner = { id: 'existing', name: 'Existing owner', email: '', avatar: 'ye-na.png' }, onChange = () => {}, roleProps = {}) {
    const render = mount(WorkItemOwnerPicker);
    const inputNode = new TestNode();
    const acceptNode = new TestNode();
    const menuNode = Object.assign(new TestNode([acceptNode]), { querySelector: () => acceptNode });
    const fieldNode = Object.assign(new TestNode([inputNode]), {
      getBoundingClientRect: () => ({ left: 548, top: 407.436, bottom: 439.436 }),
    });
    const drawerEvents = new EventTarget();
    const bounds = { left: 500, top: 0, width: 920, bottom: 900 };
    const drawerNode = Object.assign(new TestNode([fieldNode, menuNode]), {
      getBoundingClientRect: () => bounds,
      addEventListener: drawerEvents.addEventListener.bind(drawerEvents),
      removeEventListener: drawerEvents.removeEventListener.bind(drawerEvents),
    });
    const changes = [];
    const props = { ...roleProps, drawerRef: { current: drawerNode }, owner: initialOwner ?? undefined, onChange(value) { changes.push(value); if (props.role) props.members = value; else props.owner = value; onChange(value); } };
    let tree;
    let stopEffects = () => {};
    let stopLayout = () => {};
    const input = () => find(tree, node => node.type === 'input');
    const menu = () => find(tree, node => node.props.className?.split(' ').includes('work-owner-menu'));
    const button = label => find(tree, node => node.type === 'button' && node.props.children === label);
    function renderOnly() {
      tree = render(props);
      tree.props.ref.current = fieldNode;
      input().props.ref.current = inputNode;
      if (menu()) menu().props.ref.current = menuNode;
    }
    function settle() {
      stopEffects(); stopLayout();
      renderOnly();
      stopEffects = render.flushEffects();
      stopLayout = render.flushLayoutEffects();
      renderOnly();
    }
    function start() {
      if (!input().props['aria-expanded']) { input().props.onClick(); settle(); }
      find(tree, node => node.props.className === 'work-owner-suggestion').props.onClick();
      settle();
    }
    function press(key) {
      input().props.onKeyDown({ key, currentTarget: inputNode, nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() {} });
      renderOnly();
    }
    renderOnly();
    return { input, menu, button, start, settle, renderOnly, press, changes, bounds, acceptNode, drawerNode, tree: () => tree, cleanup() { stopEffects(); stopLayout(); } };
  }
  const valueTag = picker => find(picker.tree(), node => node.props.className?.split(' ').includes('work-owner-value-tag'));
  const emptyPlaceholder = picker => find(picker.tree(), node => node.props.className?.split(' ').includes('work-owner-placeholder'));
  const picker = fixture();
  picker.start();
  assert.equal(picker.input().props['aria-haspopup'], 'dialog');
  assert.ok(find(picker.tree(), node => node.props.className === 'work-owner-ai-loading'));
  assert.equal(picker.menu().props.style.width, 398);
  assert.equal(picker.menu().props.style.height, 172);
  assert.equal(picker.menu().props.style.maxHeight, 172);
  const loadingTitle = () => find(picker.tree(), node => node.props.className === 'visually-hidden').props.children;
  const titleTransform = () => find(picker.tree(), node => node.props.className === 'work-owner-ai-title-track').props.style.transform;
  assert.equal(loadingTitle(), 'AI 智能建议');
  assert.equal(titleTransform(), 'translateY(-0px)');
  assert.equal(nodes(picker.tree()).filter(node => node.props.role === 'option').length, 0);
  picker.press('ArrowDown'); picker.press('Enter');
  assert.equal(picker.changes.length, 0, 'Loading cannot select hidden people');
  advanceTimers(1499); picker.renderOnly();
  assert.equal(loadingTitle(), 'AI 智能建议');
  advanceTimers(1); picker.renderOnly();
  assert.equal(loadingTitle(), '分析项目上下文');
  assert.equal(titleTransform(), 'translateY(-16px)');
  advanceTimers(1500); picker.renderOnly();
  assert.equal(loadingTitle(), '匹配历史经验');
  assert.equal(titleTransform(), 'translateY(-32px)');
  advanceTimers(1500); picker.renderOnly();
  assert.equal(loadingTitle(), '生成负责人建议');
  assert.equal(titleTransform(), 'translateY(-48px)');
  advanceTimers(1499); picker.renderOnly();
  assert.ok(!picker.button('Accept'), 'The extended loading lasts six seconds');
  advanceTimers(1); picker.settle();
  assert.ok(picker.button('Accept'));
  assert.deepEqual(nodes(picker.tree()).filter(node => node.type === 'button' && typeof node.props.children === 'string').map(node => node.props.children), ['Accept', 'Ignore', 'Continue in chat']);
  assert.equal(picker.menu().props.style.height, 341);
  assert.equal(picker.menu().props.style.maxHeight, 341);
  assert.equal(picker.menu().props.style.top, 443.436);
  picker.press('ArrowDown');
  assert.equal(testDocument.activeElement, picker.acceptNode, 'ArrowDown enters the suggestion actions from the Owner field');
  assert.ok(find(picker.tree(), node => node.type === 'li' && node.props.children.includes('MCP list_issues')));
  assert.equal(nodes(picker.tree()).filter(node => node.props.className === 'work-detail-person').length, 1);
  picker.button('Accept').props.onFocus(); picker.renderOnly();
  assert.ok(valueTag(picker).props.className.includes('is-preview'), 'Keyboard focus also previews the suggested owner');
  picker.button('Accept').props.onPointerEnter({ pointerType: 'mouse' });
  picker.button('Accept').props.onPointerLeave(); picker.renderOnly();
  assert.ok(valueTag(picker), 'Pointer leave preserves a keyboard-focused preview');
  picker.button('Ignore').props.onClick(); picker.settle();
  assert.equal(nodes(picker.tree()).filter(node => node.props.role === 'option').length, 7);
  assert.equal(picker.changes.length, 0, 'Ignore leaves the current owner unchanged');
  assert.ok(!valueTag(picker), 'Ignore clears the temporary preview');
  picker.start();
  assert.equal(loadingTitle(), 'AI 智能建议', 'Each new analysis restarts the title carousel');
  advanceTimers(6000); picker.settle();
  picker.button('Accept').props.onClick(); picker.settle();
  assert.equal(picker.changes[0].name, 'Nannan');
  assert.equal(picker.input().props.value, 'Nannan');
  assert.equal(picker.input().props['aria-expanded'], false);
  assert.equal(picker.input().props.readOnly, true, 'Accept exits editing');
  assert.equal(testDocument.activeElement, picker.drawerNode, 'Accept moves focus out of the Owner input');
  assert.ok(!picker.tree().props.className.includes('is-open'));
  assert.ok(valueTag(picker) && !valueTag(picker).props.className.includes('is-preview'), 'Accepted owner displays an opaque person tag');
  assert.ok(find(valueTag(picker), node => node.type === 'img').props.src.endsWith('/work-item-owner-ai/nannan.png'));
  picker.input().props.onClick(); picker.settle();
  assert.equal(picker.input().props.readOnly, false, 'Clicking the owner reopens editing');
  picker.press('Escape'); picker.settle();
  assert.ok(valueTag(picker), 'Closing editing preserves the accepted person tag');
  picker.cleanup();

  const empty = fixture(null);
  empty.start(); advanceTimers(6000); empty.settle();
  assert.ok(emptyPlaceholder(empty));
  empty.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); empty.renderOnly();
  assert.ok(valueTag(empty).props.className.includes('is-preview'));
  assert.ok(!emptyPlaceholder(empty), 'Hover preview replaces the empty text');
  assert.equal(empty.changes.length, 0, 'Hover does not assign an owner');
  empty.button('Accept').props.onPointerLeave(); empty.renderOnly();
  assert.ok(emptyPlaceholder(empty) && !valueTag(empty), 'Pointer leave restores empty');
  empty.button('Accept').props.onPointerEnter({ pointerType: 'touch' }); empty.renderOnly();
  assert.ok(!valueTag(empty), 'Touch does not leave a sticky hover preview');
  empty.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); empty.renderOnly();
  empty.press('Escape'); empty.settle();
  assert.ok(emptyPlaceholder(empty) && !valueTag(empty), 'Closing the menu clears the preview without committing');
  assert.equal(empty.changes.length, 0);
  empty.cleanup();

  for (const action of ['escape', 'outside', 'typing', 'unmount']) {
    const picker = fixture();
    picker.start();
    advanceTimers(1500); picker.renderOnly();
    const staleResponses = [...pendingTimers.values()].map(timer => timer.callback);
    if (action === 'escape') picker.press('Escape');
    if (action === 'outside') {
      const event = new Event('pointerdown');
      Object.defineProperty(event, 'target', { value: new TestNode() });
      testDocument.dispatchEvent(event);
    }
    if (action === 'typing') picker.input().props.onChange({ target: { value: '叶' } });
    if (action === 'unmount') picker.cleanup(); else picker.settle();
    assert.equal(pendingTimers.size, 0, `${action} cancels the pending analysis`);
    staleResponses.forEach(callback => callback()); picker.renderOnly();
    assert.ok(!picker.button('Accept'), `${action} ignores stale results`);
    assert.equal(picker.changes.length, 0);
    if (action === 'typing') assert.equal(nodes(picker.tree()).filter(node => node.props.role === 'option').length, 1);
    if (action === 'escape' || action === 'outside') {
      assert.ok(!picker.menu());
      picker.input().props.onClick(); picker.settle();
      assert.equal(nodes(picker.tree()).filter(node => node.props.role === 'option').length, 7, 'Reopening restores people and agents');
    }
    picker.cleanup();
  }
  const narrow = fixture();
  narrow.bounds.width = 360;
  narrow.bounds.bottom = 650;
  narrow.start(); advanceTimers(6000); narrow.settle();
  const style = narrow.menu().props.style;
  assert.ok(style.left >= 12 && style.left + style.width <= 348);
  assert.ok(style.top >= 0 && style.top + style.maxHeight <= 650, 'Suggestions remain inside a short, narrow drawer');
  narrow.cleanup();

  // Verify the actual picker -> drawer -> page callback and the toast's independent lifetime.
  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const { applications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const renderPage = mount(WorkItemsPage);
  const page = () => renderPage({ application: applications[0] });
  const toast = () => find(page(), node => node.props.className === 'work-owner-toast');
  const row = find(page(), node => node.type === 'tr' && node.props['data-work-item-row'] === 1);
  row.props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  const stopPage = renderPage.flushEffects();
  const drawer = () => find(page(), byName('WorkItemDrawer'));
  const detail = mount(drawer().type)(drawer().props);
  const pickerProps = find(detail, byName('WorkItemOwnerPicker')).props;
  const integrated = fixture(null, pickerProps.onChange);
  const displayedAvatar = tree => {
    const animated = find(tree, byName('AgentAvatar'));
    return find(animated ? mount(animated.type)(animated.props) : tree, node => node.type === 'img').props.src;
  };
  for (const name of ['梁楠楠', '叶娜', '谭恬美', '郭琩', 'CodeM', 'Reviewer', 'Designer']) {
    integrated.input().props.onClick(); integrated.settle();
    const option = find(integrated.tree(), node => node.props.role === 'option' && find(node, child => child.props.className === 'work-owner-name')?.props.children === name);
    const avatar = displayedAvatar(option);
    option.props.onClick(); integrated.settle();
    assert.equal(drawer().props.owner.name, name, 'Each person and agent is saved to Owner');
    assert.equal(integrated.input().props.value, name);
    assert.equal(integrated.input().props.readOnly, true);
    assert.equal(integrated.input().props['aria-expanded'], false);
    assert.equal(testDocument.activeElement, integrated.drawerNode);
    assert.ok(find(valueTag(integrated), node => node.type === 'span' && node.props.children === name));
    assert.equal(displayedAvatar(valueTag(integrated)), avatar);
    assert.ok(toast(), 'Manual selection shows the same success toast as Accept');
    advanceTimers(1999);
    assert.ok(toast());
    advanceTimers(1);
    assert.ok(!toast(), 'Manual selection toast disappears after two seconds');
  }
  integrated.start(); advanceTimers(6000); integrated.settle();
  integrated.button('Ignore').props.onClick(); integrated.settle();
  assert.ok(!toast(), 'Ignore does not show a success toast');
  integrated.start(); advanceTimers(6000); integrated.settle();
  integrated.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); integrated.renderOnly();
  assert.ok(!toast(), 'Hover preview does not show a success toast');
  integrated.button('Accept').props.onClick(); integrated.settle();
  assert.equal(drawer().props.owner.name, 'Nannan');
  assert.equal(toast().props.role, 'status');
  assert.ok(find(toast(), node => node.type === 'span' && node.props.children === 'Workflow owner updated'));
  assert.ok(find(toast(), node => node.type === 'img' && node.props.src.endsWith('/success.svg')));
  assert.equal(integrated.input().props.readOnly, true);
  advanceTimers(1999);
  assert.ok(toast(), 'Success toast remains visible until two seconds');
  advanceTimers(1);
  assert.ok(!toast(), 'Success toast disappears at two seconds');
  const acceptedOwner = drawer().props.owner;
  drawer().props.onOwnerChange(acceptedOwner);
  advanceTimers(1000);
  drawer().props.onOwnerChange(acceptedOwner);
  advanceTimers(1000);
  assert.ok(toast(), 'Another acceptance restarts the two-second timer');
  drawer().props.onClose();
  assert.ok(toast(), 'Closing the drawer does not prematurely dismiss the page toast');
  advanceTimers(1000);
  assert.ok(!toast());
  pickerProps.onChange(acceptedOwner);
  assert.equal(pendingTimers.size, 1);
  integrated.cleanup(); stopPage();
  assert.equal(pendingTimers.size, 0, 'Leaving the page cancels its toast timer');

  // The three review roles reuse the picker while preserving their independent values and multi-person membership.
  const { defaultReviewMembers, reviewRoleConfigs } = load(resolve(root, 'src/work-item-role-data.ts'));
  const sameRoleValues = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
  const roleNames = ['review-owner', 'ipmt-leader', 'engineer-leader'];
  const roleTags = picker => find(picker.tree(), node => node.props.className?.split(' ').includes('work-role-value-tags'));
  const roleTagNames = picker => nodes(roleTags(picker)).filter(node => node.type === 'span' && typeof node.props.children === 'string').map(node => node.props.children);
  const optionNamed = (picker, name) => find(picker.tree(), node => node.props.role === 'option' && find(node, child => child.props.className === 'work-owner-name')?.props.children === name);
  const roleReasons = picker => nodes(picker.tree()).filter(node => node.type === 'li').map(node => node.props.children);
  const roleReasonSets = [];
  const roleInputIds = [];
  const rolePanelIds = [];
  for (const role of roleNames) {
    const config = reviewRoleConfigs[role];
    const picker = fixture(null, () => {}, { role, members: defaultReviewMembers[role] });
    sameRoleValues(roleTagNames(picker), defaultReviewMembers[role].map(person => person.name));
    assert.ok(nodes(roleTags(picker)).filter(node => node.type === 'img').every(node => node.props.src.includes('/work-item-drawer/')), 'Keep the original role avatar exports');
    assert.equal(picker.input().props['aria-label'], config.label);
    roleInputIds.push(picker.input().props.id);
    picker.input().props.onClick(); picker.settle();
    rolePanelIds.push(picker.input().props['aria-controls']);
    const options = nodes(picker.tree()).filter(node => node.props.role === 'option');
    assert.equal(options.length, 10);
    assert.ok(options.filter(option => !option.props.className.includes('work-owner-agent-option')).every(option => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(find(option, node => node.props.className === 'work-owner-email')?.props.children)), 'Every person has a visible email address');
    assert.ok(!find(picker.tree(), node => node.props.className === 'work-role-picker-footer'));
    assert.ok(!picker.button('确定'), 'Multi-selection has no confirmation toolbar');
    assert.equal(picker.menu().props.style.height, 454, 'Menu reserves room for agent groups and people');
    assert.equal(find(picker.tree(), node => node.props.role === 'listbox').props['aria-multiselectable'], config.multiple || undefined);
    picker.input().props.onChange({ target: { value: 'nannan@example.com' } }); picker.renderOnly();
    assert.equal(nodes(picker.tree()).filter(node => node.props.role === 'option').length, 1);
    assert.ok(optionNamed(picker, 'Nannan'), 'Newly added emails participate in search');
    picker.input().props.onChange({ target: { value: 'fluttering@' } }); picker.renderOnly();
    assert.equal(nodes(picker.tree()).filter(node => node.props.role === 'option').length, 1);
    picker.press('ArrowDown'); picker.press('Enter'); picker.settle();
    if (config.multiple) assert.ok(optionNamed(picker, '叶娜').props['aria-selected']);
    assert.equal(picker.changes.length, 1, 'Both single and multi-selection save immediately');
    sameRoleValues(picker.changes[0].map(person => person.name), config.multiple ? ['Nannan', 'Lei', '叶娜'] : ['叶娜']);
    if (!config.multiple) assert.equal(testDocument.activeElement, picker.drawerNode);
    assert.equal(picker.input().props['aria-expanded'], config.multiple, 'Multi-selection stays open for additional toggles');
    picker.start();
    advanceTimers(4500); picker.renderOnly();
    assert.equal(find(picker.tree(), node => node.props.className === 'visually-hidden').props.children, config.loadingTitles[3]);
    assert.ok(!picker.button('Accept'));
    advanceTimers(1500); picker.settle();
    roleReasonSets.push(roleReasons(picker).join(' '));
    picker.button('Accept').props.onFocus(); picker.renderOnly();
    assert.ok(roleTags(picker).props.className.includes('is-preview'));
    assert.equal(picker.changes.length, 1, 'Focus previews without writing');
    picker.button('Accept').props.onBlur(); picker.renderOnly();
    assert.ok(!roleTags(picker));
    const recommended = config.suggestions[config.primary].owner.name;
    const expectedMembers = config.multiple ? [...new Set([...picker.changes[0].map(person => person.name), recommended])] : [recommended];
    assert.ok(!find(picker.tree(), node => node.props.children === 'Alternative'));
    assert.equal(roleReasons(picker).join(' '), roleReasonSets.at(-1));
    picker.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); picker.renderOnly();
    sameRoleValues(roleTagNames(picker), expectedMembers);
    picker.button('Accept').props.onPointerLeave(); picker.renderOnly();
    assert.ok(!roleTags(picker));
    picker.button('Accept').props.onClick(); picker.settle();
    assert.equal(picker.changes.length, 2);
    sameRoleValues(picker.changes[1].map(person => person.name), expectedMembers);
    assert.equal(picker.input().props.readOnly, true);
    assert.equal(testDocument.activeElement, picker.drawerNode);
    picker.start(); advanceTimers(6000); picker.settle();
    picker.button('Ignore').props.onClick(); picker.settle();
    assert.equal(picker.changes.length, 2);
    picker.press('Escape'); picker.settle();
    sameRoleValues(roleTagNames(picker), picker.changes[1].map(person => person.name));
    picker.cleanup();
  }
  assert.equal(new Set(roleInputIds).size, 3);
  assert.equal(new Set(rolePanelIds).size, 3, 'Each role has its own accessible menu IDs');
  assert.equal(new Set(roleReasonSets).size, 3, 'AI explanations are specific to each role');

  const multi = fixture(null, () => {}, { role: 'ipmt-leader', members: defaultReviewMembers['ipmt-leader'] });
  multi.start(); advanceTimers(6000); multi.settle();
  multi.button('Accept').props.onClick(); multi.settle();
  sameRoleValues(roleTagNames(multi), ['Nannan', 'Lei'], 'Accepting an existing member never duplicates or drops tags');
  multi.input().props.onClick(); multi.settle();
  optionNamed(multi, 'Nannan').props.onClick(); multi.renderOnly();
  assert.equal(optionNamed(multi, 'Nannan').props['aria-selected'], false);
  multi.press('Escape'); multi.settle();
  sameRoleValues(roleTagNames(multi), ['Lei'], 'Escape preserves an immediately saved removal');
  assert.equal(multi.changes.length, 2);
  multi.input().props.onClick(); multi.settle();
  optionNamed(multi, 'Lei').props.onClick(); multi.renderOnly();
  sameRoleValues(multi.changes.at(-1), [], 'Removing the last member saves empty immediately');
  multi.press('Escape'); multi.settle();
  assert.ok(emptyPlaceholder(multi), 'An empty multi-selection displays empty after closing');
  multi.input().props.onClick(); multi.settle();
  optionNamed(multi, 'Maikou').props.onClick(); multi.renderOnly();
  const outside = new Event('focusin');
  Object.defineProperty(outside, 'target', { value: new TestNode() });
  testDocument.dispatchEvent(outside); multi.settle();
  assert.equal(multi.changes.length, 4);
  sameRoleValues(roleTagNames(multi), ['Maikou'], 'Moving focus away keeps the last saved selection');
  multi.cleanup();

  const agentPicker = fixture(null, () => {}, { role: 'ipmt-leader', members: defaultReviewMembers['ipmt-leader'] });
  agentPicker.input().props.onClick(); agentPicker.settle();
  const agentGroup = () => find(agentPicker.tree(), node => node.props.role === 'group' && node.props['aria-label'] === '空间智能体');
  const codemGroup = () => find(agentPicker.tree(), node => node.props.role === 'group' && node.props['aria-label'] === 'CodeM');
  sameRoleValues(nodes(codemGroup()).filter(node => node.props.className === 'work-owner-name').map(node => node.props.children), ['CodeM']);
  sameRoleValues(nodes(agentGroup()).filter(node => node.props.className === 'work-owner-name').map(node => node.props.children), ['Reviewer', 'Designer']);
  assert.equal(nodes(codemGroup()).filter(node => node.props.className === 'work-owner-agent-badge' && node.props.children === 'Agent').length, 1);
  assert.equal(nodes(agentGroup()).filter(node => node.props.className === 'work-owner-agent-badge' && node.props.children === 'Agent · 空间').length, 2);
  assert.equal(nodes(agentPicker.tree()).filter(node => node.props.className === 'work-owner-group-divider').length, 2);
  assert.ok(find(agentPicker.tree(), node => node.props.className === 'work-owner-group-divider'));
  agentPicker.input().props.onChange({ target: { value: '  DESIGNER ' } }); agentPicker.settle();
  assert.equal(nodes(agentPicker.tree()).filter(node => node.props.role === 'option').length, 1, 'Agent search is case-insensitive and trims whitespace');
  assert.ok(!find(agentPicker.tree(), node => node.props.className === 'work-owner-group-divider'), 'Search does not leave an orphan separator');
  agentPicker.press('ArrowDown'); agentPicker.settle();
  assert.ok(agentPicker.input().props['aria-activedescendant'].endsWith('-agent-space-foundation'));
  assert.equal(agentPicker.acceptNode.lastScrollOptions.block, 'nearest', 'Keyboard navigation brings clipped options into view');
  agentPicker.press('Enter'); agentPicker.settle();
  sameRoleValues(agentPicker.changes.at(-1).map(person => person.name), ['Nannan', 'Lei', 'Designer'], 'Multi-select preserves people when adding an agent');
  assert.equal(optionNamed(agentPicker, 'Designer').props['aria-selected'], true);
  agentPicker.press('Enter'); agentPicker.settle();
  sameRoleValues(agentPicker.changes.at(-1).map(person => person.name), ['Nannan', 'Lei'], 'An agent can be removed without changing people');
  agentPicker.button('团队').props.onClick(); agentPicker.settle();
  assert.ok(!agentGroup(), 'Agents belong to the people picker, not the team panel');
  assert.equal(agentPicker.input().props['aria-activedescendant'], undefined, 'Changing tabs clears keyboard selection');
  agentPicker.press('Enter'); agentPicker.settle();
  assert.equal(agentPicker.changes.length, 2, 'Hidden agent results cannot be selected');
  agentPicker.button('人员').props.onClick(); agentPicker.settle();
  agentPicker.input().props.onChange({ target: { value: 'Agent' } }); agentPicker.settle();
  assert.equal(nodes(agentGroup()).filter(node => node.props.role === 'option').length, 2, 'Agent keyword finds the entire space group');
  agentPicker.input().props.onChange({ target: { value: '' } }); agentPicker.settle();
  for (let i = 0; i < 4; i++) agentPicker.press('ArrowDown');
  assert.ok(agentPicker.input().props['aria-activedescendant'].endsWith('-nannan'), 'Keyboard navigation crosses from Agent to the first person');
  agentPicker.press('Escape'); agentPicker.settle();
  sameRoleValues(roleTagNames(agentPicker), ['Nannan', 'Lei']);
  agentPicker.cleanup();

  const { settingsAiStorageKey, loadSettingsAiPreferences, saveSettingsAiPreferences } = load(resolve(root, 'src/settings-ai.ts'));
  const { getWorkItemAgent, getSelectableWorkItemAgents } = load(resolve(root, 'src/work-item-agents.ts'));
  const originalSettings = loadSettingsAiPreferences();
  const savedAiValue = adminStorage.get(settingsAiStorageKey);
  const configured = fixture(null);
  const configuredOptions = () => nodes(configured.tree()).filter(node => node.props.role === 'option' && node.props.className.includes('work-owner-agent-option'));
  const reopenConfigured = () => { configured.press('Escape'); configured.input().props.onClick(); configured.settle(); };
  saveSettingsAiPreferences({ ...originalSettings, agents: [
    { id: 'custom-reviewer', name: 'Review specialist', spaceId: 'backend', memberId: 'reviewer', avatarBackground: '#8533FF' },
    { id: 'other-reviewer', name: 'Review specialist', spaceId: 'frontend', memberId: 'tester' },
    { id: 'disabled', name: 'Disabled agent', spaceId: 'frontend', memberId: 'release' },
    { id: 'unfinished', name: 'Unfinished agent', spaceId: null, memberId: 'sheriff' },
  ], disabledAgents: ['disabled'] });
  configured.input().props.onClick(); configured.settle();
  assert.deepEqual(configuredOptions().map(option => find(option, node => node.props.className === 'work-owner-name').props.children), ['CodeM', 'Review specialist', 'Review specialist']);
  assert.equal(new Set(configuredOptions().map(option => option.props.id)).size, 3, 'Same-name agents keep separate identities');
  const configuredOption = configuredOptions()[1];
  const avatar = find(configuredOption, byName('AgentAvatar'));
  assert.equal(avatar.props.src, '/assets/settings/create-agent/reviewer-avatar.png');
  assert.equal(avatar.props.background, '#8533FF');
  const avatarTree = mount(avatar.type)(avatar.props);
  assert.equal(find(avatarTree, node => node.type === 'img').props.src, '/assets/settings/animated/reviewer.webp');
  configuredOption.props.onClick(); configured.settle();
  const assigned = configured.changes.at(-1);
  assert.equal(getWorkItemAgent(assigned).id, 'agent-space-custom-reviewer', 'Configured agents enter the existing execution flow');
  assert.equal(find(valueTag(configured), byName('AgentAvatar')).props.background, '#8533FF', 'Assigned values preserve the configured appearance');
  const changedSettings = loadSettingsAiPreferences();
  saveSettingsAiPreferences({ ...changedSettings, agents: changedSettings.agents.map(agent => agent.id === 'custom-reviewer'
    ? { ...agent, name: 'Design partner', memberId: 'architect', avatarBackground: '#FE2B98' } : agent) });
  reopenConfigured();
  assert.equal(find(configuredOptions()[1], node => node.props.className === 'work-owner-name').props.children, 'Design partner', 'Reopening a mounted picker reads the latest committed Settings names');
  assert.equal(find(configuredOptions()[1], byName('AgentAvatar')).props.src, '/assets/settings/architect.png');
  assert.equal(find(configuredOptions()[1], byName('AgentAvatar')).props.background, '#FE2B98');
  assert.equal(configuredOptions()[1].props.id, configuredOption.props.id, 'Renaming and changing an avatar preserve selection identity');
  saveSettingsAiPreferences({ ...loadSettingsAiPreferences(), agents: [], disabledAgents: [] });
  reopenConfigured();
  assert.equal(configuredOptions().length, 1, 'Removed agents disappear; CodeM remains in its own group');
  assert.equal(getWorkItemAgent(assigned).name, 'Review specialist', 'Removal keeps already assigned execution identities intact');
  saveSettingsAiPreferences({ ...originalSettings, independentTasks: false });
  reopenConfigured();
  assert.equal(configuredOptions().length, 1, 'Disabling independent agent tasks hides space agents from assignment');
  configured.cleanup();
  saveSettingsAiPreferences({ ...originalSettings, agents: originalSettings.agents.map(agent => ({ ...agent,
    name: agent.id === 'platform' ? '平台业务智能体' : 'Foundation产研协同空间',
  })) });
  assert.deepEqual(Array.from(loadSettingsAiPreferences().agents, agent => agent.name), ['Reviewer', 'Designer'], 'Legacy defaults upgrade to the new personal role names');
  saveSettingsAiPreferences({ ...originalSettings, agents: originalSettings.agents.map(agent => ({ ...agent, name: `${agent.name} Custom` })) });
  assert.deepEqual(Array.from(getSelectableWorkItemAgents(), agent => agent.name), ['CodeM', 'Reviewer Custom', 'Designer Custom'], 'Custom names are preserved in Settings and assignment menus');
  if (savedAiValue === undefined) adminStorage.delete(settingsAiStorageKey); else adminStorage.set(settingsAiStorageKey, savedAiValue);

  for (const role of roleNames) {
    const cancelled = fixture(null, () => {}, { role, members: defaultReviewMembers[role] });
    cancelled.start(); advanceTimers(1500); cancelled.renderOnly();
    const stale = [...pendingTimers.values()].map(timer => timer.callback);
    cancelled.press('Escape'); cancelled.settle();
    stale.forEach(callback => callback()); cancelled.renderOnly();
    assert.ok(!cancelled.menu());
    assert.equal(cancelled.changes.length, 0, 'Closing role editing cancels pending AI results');
    cancelled.cleanup();
  }

  const renderRolesPage = mount(WorkItemsPage);
  const rolesPage = () => renderRolesPage({ application: applications[0] });
  const openRoleRow = id => find(rolesPage(), node => node.type === 'tr' && node.props['data-work-item-row'] === id).props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  const roleDrawer = () => find(rolesPage(), byName('WorkItemDrawer'));
  const roleToast = () => find(rolesPage(), node => node.props.className === 'work-owner-toast');
  openRoleRow(1);
  const stopRolesPage = renderRolesPage.flushEffects();
  const stored = {};
  for (const role of roleNames) {
    const detail = mount(roleDrawer().type)(roleDrawer().props);
    const pickerProps = find(detail, node => node.type?.name === 'WorkItemOwnerPicker' && node.props.role === role).props;
    assert.equal(find(detail, node => node.type === 'label' && node.props.htmlFor === `work-item-${role}`).props.children, role === 'review-owner' ? 'owner' : reviewRoleConfigs[role].label);
    const integrated = fixture(null, pickerProps.onChange, { role, members: pickerProps.members });
    integrated.input().props.onClick(); integrated.settle();
    optionNamed(integrated, '梁楠楠').props.onClick(); integrated.renderOnly();
    integrated.settle();
    stored[role] = roleDrawer().props.reviewMembers[role];
    assert.equal(stored[role].at(-1).name, '梁楠楠');
    assert.ok(find(roleToast(), node => node.props.children === `Workflow ${reviewRoleConfigs[role].label} updated`));
    assert.equal(roleDrawer().props.owner, undefined, 'Review roles never overwrite the workflow Owner');
    advanceTimers(1999); assert.ok(roleToast());
    advanceTimers(1); assert.ok(!roleToast());
    integrated.start(); advanceTimers(6000); integrated.settle();
    integrated.button('Accept').props.onClick(); integrated.settle();
    stored[role] = roleDrawer().props.reviewMembers[role];
    assert.ok(roleToast(), 'AI acceptance also shows the shared toast');
    advanceTimers(2000); assert.ok(!roleToast());
    integrated.cleanup();
  }
  roleDrawer().props.onClose();
  openRoleRow(2);
  assert.equal(roleDrawer().props.reviewMembers, undefined, 'Role changes do not leak into another work item');
  openRoleRow(1);
  sameRoleValues(roleDrawer().props.reviewMembers, stored, 'All three independent roles survive closing/reopening the row');
  const completeDetail = mount(roleDrawer().type)(roleDrawer().props);
  const allPickers = nodes(completeDetail).filter(node => node.type?.name === 'WorkItemOwnerPicker');
  assert.equal(allPickers.length, 4);
  assert.ok(allPickers.slice(1).every(node => String(node.key).includes('-1')), 'Role picker editing resets when switching work items');
  stopRolesPage();
  assert.equal(pendingTimers.size, 0);
  console.log('Review personnel checks passed: three independent roles, original avatars, email display/search, immediate multi-selection, role-specific AI, preview, cancellation, per-row persistence and two-second toast.');

  const assetsPath = 'public/assets/figma/work-item-owner-ai';
  const exported = load(resolve(root, assetsPath, 'provenance.json'));
  assert.equal(exported.assets.length, 6);
  for (const asset of exported.assets) {
    const original = readFileSync(resolve(root, assetsPath, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-owner-ai', asset.file)), original);
    if (asset.file.endsWith('.png')) assert.deepEqual([original.readUInt32BE(16), original.readUInt32BE(20)], [60, 60]);
  }
}
console.log('Owner AI suggestion checks passed: loading, primary recommendation, preview/Accept, Ignore, two-second success toast and cleanup, keyboard safety, responsive placement and original assets.');
{
  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const { applications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { getSelectableWorkItemAgents } = load(resolve(root, 'src/work-item-agents.ts'));
  const { settingsAiStorageKey, loadSettingsAiPreferences, saveSettingsAiPreferences } = load(resolve(root, 'src/settings-ai.ts'));
  const originalAiSettings = loadSettingsAiPreferences();
  saveSettingsAiPreferences({ ...originalAiSettings, agents: ['planner', 'reviewer', 'architect'].map(memberId => ({
    id: memberId, memberId, name: memberId[0].toUpperCase() + memberId.slice(1), spaceId: 'platform',
  })) });
  const workItemAgents = getSelectableWorkItemAgents();
  const { workItemPeople } = load(resolve(root, 'src/WorkItemOwnerPicker.tsx'));
  const { defaultReviewMembers } = load(resolve(root, 'src/work-item-role-data.ts'));
  const renderPage = mount(WorkItemsPage);
  const page = () => renderPage({ application: applications[0] });
  const openRow = id => find(page(), node => node.type === 'tr' && node.props['data-work-item-row'] === id).props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  const drawer = () => find(page(), byName('WorkItemDrawer'));
  openRow(1);
  const stopPage = renderPage.flushEffects();
  const renderDrawer = mount(drawer().type);
  const detail = () => { const tree = renderDrawer(drawer().props); tree.props.ref.current = new TestNode(); return tree; };
  const summary = () => find(detail(), node => node.props.className?.split(' ').includes('work-detail-summary'));
  const rows = () => nodes(summary()).filter(node => node.props.className === 'work-detail-agent-row');
  const names = () => rows().map(row => find(row, node => node.props.className === 'work-detail-agent-name').props.children);
  const normalFields = () => nodes(summary()).filter(byName('WorkItemPlanningPicker'));
  const schedule = { start: '2026-05-05', end: '2026-06-14' };
  drawer().props.onPDChange('4.5PD');
  drawer().props.onScheduleChange(schedule);
  assert.equal(normalFields().length, 2);
  // Switching the viewed step must not mutate the review's saved fields or the workflow's execution state.
  const renderWorkflow = mount(load(resolve(root, 'src/WorkItemWorkflow.tsx')).WorkItemWorkflow);
  const selectStep = label => {
    const workflow = find(detail(), byName('WorkItemWorkflow'));
    const graph = renderWorkflow(workflow.props);
    find(graph, node => node.type === 'button' && node.props['aria-label'] === `查看 ${label} 节点`).props.onClick();
  };
  selectStep('Initial Review');
  assert.equal(textContent(find(detail(), node => node.props.id === 'work-detail-review-title')), 'Initial Review');
  const initialSummary = find(detail(), byName('WorkItemInitialReviewSummary'));
  assert.ok(initialSummary, 'Initial Review displays its own expanded owner summary');
  assert.ok(!summary(), 'Initial Review does not render the Detail Review summary');
  const renderInitialSummary = mount(initialSummary.type);
  const initial = () => renderInitialSummary(initialSummary.props);
  const initialDetails = () => find(initial(), node => node.props.id === 'initial-review-owner-details');
  const initialCollapse = () => find(initial(), node => node.type === 'button' && node.props['aria-controls'] === 'initial-review-owner-details');
  const assignmentToggle = () => find(initial(), node => node.type === 'button' && node.props['aria-controls'] === 'initial-review-assigned-agent');
  assert.equal(initialDetails().props.hidden, false);
  assert.equal(nodes(initial()).filter(byName('AgentProgress')).length, 2);
  assignmentToggle().props.onClick();
  assert.equal(assignmentToggle().props['aria-expanded'], false);
  assert.ok(!find(initial(), node => node.props.id === 'initial-review-assigned-agent'));
  assert.equal(nodes(initial()).filter(byName('AgentProgress')).length, 1, 'Collapsing an assignment preserves the standalone agent');
  initialCollapse().props.onClick();
  assert.equal(initialDetails().props.hidden, true);
  assert.equal(textContent(initialCollapse()), 'Expand');
  assert.ok(find(initial(), node => node.props.className === 'work-initial-total'), 'Collapsed summaries retain aggregate owners and dates');
  initialCollapse().props.onClick();
  assert.equal(initialDetails().props.hidden, false);
  assert.equal(assignmentToggle().props['aria-expanded'], false, 'Expanding the list preserves the individual assignment state');
  assignmentToggle().props.onClick();
  assert.equal(nodes(initial()).filter(byName('AgentProgress')).length, 2);
  const initialAssetPath = 'public/assets/figma/work-item-initial-review';
  const initialAssets = load(resolve(root, initialAssetPath, 'provenance.json'));
  for (const asset of initialAssets.assets) {
    const original = readFileSync(resolve(root, initialAssetPath, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-initial-review', asset.file)), original);
    if (asset.file.endsWith('.png')) assert.deepEqual([original.readUInt32BE(16), original.readUInt32BE(20)], [asset.pixelWidth, asset.pixelHeight]);
  }
  assert.ok(find(detail(), byName('WorkItemOwnerPicker')));
  assert.ok(find(detail(), node => node.props.id === 'work-detail-context-title'));
  assert.ok(find(detail(), node => node.props.id === 'work-detail-team-title'));
  const initialGraph = renderWorkflow(find(detail(), byName('WorkItemWorkflow')).props);
  assert.deepEqual(nodes(initialGraph).filter(node => node.type === 'button' && node.props['aria-pressed']).map(node => node.props['aria-label']), ['查看 Initial Review 节点']);
  assert.equal(find(initialGraph, node => node.props['aria-current'] === 'step').props['aria-label'], 'Detail Review，进行中', 'Viewing Initial Review preserves the running workflow step');
  selectStep('DA Tracking');
  assert.ok(find(detail(), byName('WorkItemDATracking')));
  assert.ok(!find(detail(), byName('WorkItemOwnerPicker')), 'DA Tracking replaces the review form');
  const graph = renderWorkflow(find(detail(), byName('WorkItemWorkflow')).props);
  assert.equal(find(graph, node => node.props['aria-current'] === 'step').props['aria-label'], 'Detail Review，进行中', 'Viewing a completed node does not change the running workflow step');
  selectStep('Detail Review');
  assert.ok(!find(detail(), byName('WorkItemDATracking')));
  assert.equal(textContent(find(detail(), node => node.props.id === 'work-detail-review-title')), 'Detail Review');
  assert.equal(normalFields()[0].props.value, '4.5PD');
  assert.deepEqual(normalFields()[1].props.value, schedule);
  assert.ok(!find(detail(), byName('WorkItemInitialReviewSummary')), 'Detail Review keeps its existing editable summary');
  selectStep('DA Tracking');
  openRow(2);
  assert.ok(!find(detail(), byName('WorkItemDATracking')), 'Another work item starts on its own review node');
  openRow(1);
  selectStep('Detail Review');
  const renderTracking = mount(load(resolve(root, 'src/WorkItemDATracking.tsx')).WorkItemDATracking);
  const tracking = () => renderTracking();
  assert.equal(textContent(find(tracking(), node => node.props.role === 'status')), 'CodeM has finished task.');
  find(tracking(), node => node.props['aria-label'] === '重新运行 DA Tracking').props.onClick();
  assert.equal(textContent(find(tracking(), node => node.props.role === 'status')), 'CodeM is working...');
  const stopTracking = renderTracking.flushEffects();
  advanceTimers(2400);
  assert.equal(textContent(find(tracking(), node => node.props.role === 'status')), 'CodeM has finished task.');
  stopTracking();
  function chooseOwner(id) {
    let picker = find(summary(), byName('WorkItemOwnerPicker'));
    const fromTable = !picker;
    if (fromTable) {
      const ownerCell = () => nodes(page()).find(node => node.type?.name === 'WorkItemTableCell' && node.props.field === 'owner' && node.props.item.id === 1);
      ownerCell().props.onEdit();
      const cell = ownerCell();
      const cellTree = mount(cell.type)(cell.props);
      cellTree.props.ref.current = new TestNode();
      picker = find(cellTree, byName('WorkItemOwnerPicker'));
    }
    const renderPicker = mount(picker.type);
    let tree = renderPicker(picker.props);
    const field = find(tree, node => node.type === 'input');
    field.props.ref.current = new TestNode();
    field.props.onClick(); tree = renderPicker(picker.props);
    find(tree, node => node.props.role === 'option' && node.props.id.endsWith(`-${id}`)).props.onClick();
    assert.equal(find(renderPicker(picker.props), node => node.type === 'input').props['aria-expanded'], false);
    if (fromTable) openRow(1);
  }
  workItemAgents.forEach((agent, index) => {
    chooseOwner(agent.id);
    assert.equal(rows().length, index + 1, 'Each newly selected agent adds one execution row');
    assert.deepEqual(names(), Array.from(workItemAgents.slice(0, index + 1), agent => agent.name));
    assert.ok(rows().every(row => find(row, node => node.props.className === 'work-detail-agent-working').props.children === 'is working...'));
    assert.equal(normalFields().length, 0, 'Running layout replaces PD and Schedule');
    assert.ok(!find(summary(), node => node.props.className === 'work-detail-complete'), 'Complete is hidden in the Figma running layout');
    const assigner = find(summary(), node => node.props.className === 'work-detail-agent-assigner');
    assert.equal(textContent(assigner), 'Mei已分配给智能体');
    assert.ok(!find(summary(), byName('WorkItemOwnerPicker')), 'Running summary does not contain an editable Owner picker');
    assert.ok(nodes(assigner).every(node => !['button', 'input', 'label'].includes(node.type) && node.props.onClick === undefined && node.props.tabIndex === undefined), 'Assigned-by is plain content without pointer or keyboard activation');
    assert.equal(nodes(summary()).filter(node => node.props.className === 'work-detail-agent-branch').length, 1, 'Only CodeM retains the assignment connector in a mixed list');
    assert.ok(rows().slice(1).every(row => row.props['data-space-agent'] === true));
  });
  chooseOwner(workItemAgents[0].id);
  assert.equal(rows().length, 4, 'Reassigning an existing agent does not duplicate execution rows');
  const agentRow = id => rows().find(row => row.props['data-agent-id'] === id);
  const agentAction = (id, name) => find(agentRow(id), node => node.props.className === `work-detail-agent-${name}`).props.onClick();
  agentAction('agent-codem', 'stop');
  assert.equal(agentRow('agent-codem').props['data-status'], 'canceled');
  assert.equal(find(agentRow('agent-codem'), node => node.props.className === 'work-detail-agent-canceled').props.children, 'task canceled');
  assert.ok(!find(agentRow('agent-codem'), node => node.props.className === 'work-detail-agent-working'), 'Stopped status does not shimmer');
  assert.deepEqual(nodes(agentRow('agent-codem')).filter(node => node.type === 'button' && node.props.className !== 'work-detail-agent-open').map(textContent), ['rerun', 'remove']);
  assert.ok(rows().slice(1).every(row => row.props['data-status'] === 'working'), 'Stopping one agent leaves the others running');
  drawer().props.onClose(); openRow(2);
  assert.equal(rows().length, 0, 'Stopped execution does not leak into another work item');
  openRow(1);
  assert.equal(agentRow('agent-codem').props['data-status'], 'canceled', 'Stopped state survives reopening the drawer');
  agentAction('agent-codem', 'rerun');
  assert.equal(agentRow('agent-codem').props['data-status'], 'working');
  assert.ok(find(agentRow('agent-codem'), node => node.props.className === 'work-detail-agent-stop'));
  agentAction('agent-codem', 'stop');
  agentAction('agent-codem', 'cancel');
  assert.deepEqual(names(), ['Planner', 'Reviewer', 'Architect'], 'Cancel removes just the selected agent assignment');
  assert.ok(!find(summary(), node => node.props.className === 'work-detail-agent-assigner'), 'Space agents do not show an assigned-by row');
  assert.ok(!find(summary(), node => node.props.className === 'work-detail-agent-branch'), 'Space agents have no assignment connectors');
  drawer().props.onClose(); openRow(1);
  assert.ok(!agentRow('agent-codem'), 'Canceled assignment stays removed after reopening');
  chooseOwner('agent-codem');
  assert.equal(agentRow('agent-codem').props['data-status'], 'working', 'An agent can be assigned again after cancellation');
  assert.equal(drawer().props.pd, '4.5PD');
  assert.equal(drawer().props.schedule, schedule, 'Hidden planning values are preserved');
  drawer().props.onClose(); openRow(2);
  assert.equal(rows().length, 0, 'Execution rows do not leak into another work item');
  openRow(1);
  assert.equal(rows().length, 4, 'Execution state survives closing and reopening a work item');
  chooseOwner(workItemPeople[0].id);
  assert.equal(rows().length, 0, 'Assigning a person returns to the standard summary');
  assert.equal(normalFields().find(node => node.props.field === 'pd').props.value, '4.5PD');
  assert.equal(normalFields().find(node => node.props.field === 'schedule').props.value, schedule);

  drawer().props.onReviewMembersChange('ipmt-leader', [...defaultReviewMembers['ipmt-leader'], ...workItemAgents.slice(0, 2)]);
  assert.deepEqual(names(), ['CodeM', 'Planner'], 'Agents selected in review roles also run in the node summary');
  chooseOwner(workItemAgents[0].id);
  assert.deepEqual(names(), ['CodeM', 'Planner'], 'The same agent in multiple roles appears once');
  agentAction('agent-codem', 'stop');
  agentAction('agent-codem', 'cancel');
  assert.deepEqual(names(), ['Planner'], 'Cancel clears the same agent from both Owner and review roles');
  assert.ok(!drawer().props.reviewMembers['ipmt-leader'].some(person => person.id === 'agent-codem'));
  chooseOwner(workItemAgents[0].id);
  drawer().props.onReviewMembersChange('ipmt-leader', defaultReviewMembers['ipmt-leader']);
  assert.deepEqual(names(), ['CodeM'], 'Removing role agents keeps independent Owner assignments');
  chooseOwner(workItemPeople[0].id);
  assert.equal(rows().length, 0);
  const tableOwner = nodes(page()).find(node => node.type?.name === 'WorkItemTableCell' && node.props.field === 'owner' && node.props.item.id === 1);
  tableOwner.props.onChange(workItemAgents[3]);
  assert.deepEqual(names(), ['Architect'], 'Primary table Owner assignments use the same execution state');
  assert.ok(!find(summary(), node => node.props.className === 'work-detail-agent-assigner'));
  assert.ok(!find(summary(), node => node.props.className === 'work-detail-agent-branch'));
  agentAction('agent-space-architect', 'stop');
  agentAction('agent-space-architect', 'cancel');
  assert.equal(rows().length, 0, 'Canceling the last execution restores the normal summary');
  assert.equal(normalFields().length, 2);
  assert.equal(drawer().props.pd, '4.5PD');
  assert.equal(drawer().props.schedule, schedule);
  chooseOwner('agent-codem');
  chooseOwner('agent-space-planner');
  const openAgent = id => find(agentRow(id), node => node.props.className === 'work-detail-agent-open').props.onClick();
  const panel = () => find(detail(), byName('WorkItemAgentPanel'));
  assert.ok(!panel());
  agentAction('agent-codem', 'stop');
  assert.ok(!panel(), 'Task action buttons do not activate the row opener');
  agentAction('agent-codem', 'rerun');
  openAgent('agent-codem');
  assert.equal(panel().props.agent.id, 'agent-codem');
  assert.equal(agentRow('agent-codem').props['data-selected'], true);
  assert.ok(detail().props.className.includes('has-agent-panel'), 'Opening the panel activates the drawer shift');
  panel().props.onDraftChange('先确认验收标准');
  openAgent('agent-space-planner');
  assert.equal(panel().props.draft, '', 'Different agents have independent drafts');
  assert.ok(!agentRow('agent-codem').props['data-selected']);
  panel().props.onDraftChange('检查计划依赖');
  openAgent('agent-codem');
  assert.equal(panel().props.draft, '先确认验收标准');

  const renderPanel = mount(panel().type);
  const panelView = () => renderPanel(panel().props);
  const composerInput = () => find(panelView(), node => node.type === 'textarea');
  assert.equal(find(panelView(), node => node.props.className === 'work-agent-context-title').props.children, drawer().props.item.title);
  assert.equal(panelView().props['data-work-item-layer'], drawer().props.item.id);
  const pressComposer = (isComposing = false, shiftKey = false) => composerInput().props.onKeyDown({ key: 'Enter', shiftKey, nativeEvent: { isComposing }, preventDefault() {} });
  pressComposer(true); pressComposer(false, true);
  assert.equal(panel().props.messages.length, 0, 'IME Enter and Shift+Enter do not submit');
  pressComposer();
  assert.deepEqual(Array.from(panel().props.messages), ['先确认验收标准']);
  assert.equal(panel().props.draft, '');
  find(panelView(), node => node.props.className === 'work-agent-stop').props.onClick();
  assert.equal(agentRow('agent-codem').props['data-status'], 'canceled', 'Panel stop synchronizes with the summary row');
  assert.equal(find(panelView(), node => node.props.className === 'work-agent-execution-status').props.children, 'task canceled');
  assert.ok(find(panelView(), node => node.props.className === 'work-agent-send').props.disabled);
  agentAction('agent-codem', 'rerun');
  assert.equal(find(panelView(), node => node.props.className === 'work-agent-execution-status').props.children, 'Working 00:00');

  const lastInput = composerInput();
  lastInput.props.ref.current = { style: {}, clientWidth: 400, scrollHeight: 500 };
  const stopInputLayout = renderPanel.flushLayoutEffects();
  assert.equal(lastInput.props.ref.current.style.height, '144px', 'Long input is capped and scrolls internally');
  stopInputLayout();
  find(panelView(), node => node.props.className === 'work-agent-panel-history').props.onClick();
  const sessions = find(panelView(), node => node.props.id === 'work-agent-session-menu');
  nodes(sessions).find(node => node.type === 'button' && textContent(node).includes('Planner')).props.onClick();
  assert.equal(panel().props.agent.name, 'Planner');
  assert.equal(panel().props.draft, '检查计划依赖');
  assert.ok(!find(panelView(), node => node.props.id === 'work-agent-session-menu'));
  panelView().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.ok(!panel(), 'Escape closes the side panel without closing the work item');
  assert.ok(!detail().props.className.includes('has-agent-panel'));
  openAgent('agent-codem');
  assert.deepEqual(Array.from(panel().props.messages), ['先确认验收标准'], 'Panel messages survive closing and reopening');

  // The portal remains part of this work item for outside-click dismissal.
  const cleanupDrawer = renderDrawer.flushEffects();
  const portalTarget = Object.assign(new TestNode(), { closest: selector => selector === '[data-work-item-layer]' ? { getAttribute: () => '1' } : null });
  const pointer = new Event('pointerdown');
  Object.defineProperty(pointer, 'target', { value: portalTarget });
  testDocument.dispatchEvent(pointer);
  assert.ok(drawer(), 'Clicking inside the portal keeps its drawer open');
  cleanupDrawer();
  agentAction('agent-codem', 'stop');
  agentAction('agent-codem', 'cancel');
  assert.ok(!panel(), 'Removing the selected agent closes its panel');
  chooseOwner('agent-codem');
  assert.ok(!panel(), 'Reassigning a removed agent does not reopen a stale panel');
  openAgent('agent-codem');
  openRow(2);
  assert.ok(!panel(), 'Panel state is isolated by work item');
  openRow(1);
  advanceTimers(2000); stopPage();

  const assetDir = 'public/assets/figma/work-item-agent-summary';
  const provenance = load(resolve(root, assetDir, 'provenance.json'));
  assert.equal(provenance.sourceNode, '109:36386');
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(root, assetDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-agent-summary', asset.file)), bytes);
    if (asset.file.endsWith('.png')) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [60, 60]);
  }
  adminStorage.delete(settingsAiStorageKey);
  const panelDir = 'public/assets/figma/work-item-agent-panel';
  const panelAssets = load(resolve(root, panelDir, 'provenance.json'));
  assert.equal(panelAssets.sourceNode, '109:39391');
  assert.equal(panelAssets.selectedRowNode, '109:38953');
  for (const asset of panelAssets.assets) {
    const bytes = readFileSync(resolve(root, panelDir, asset.file));
    assert.ok(bytes.length > 0, 'Exported panel assets must not be empty');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-agent-panel', asset.file)), bytes);
  }
}
console.log('Agent execution checks passed: cumulative selection, static assigned-by content, stop/rerun/cancel, isolated persistent states, assignment removal, planning preservation, role deduplication, table sync and original Figma assets.');
{
  const { WorkItemAgentPanel } = load(resolve(root, 'src/WorkItemAgentPanel.tsx'));
  const { workItemAgents } = load(resolve(root, 'src/work-item-agents.ts'));
  const { formatAgentWorkingTime, getAgentExecutionFrame } = load(resolve(root, 'src/work-item-agent-execution.ts'));
  const render = mount(WorkItemAgentPanel);
  let props = {
    item: { id: 1, title: 'Streaming review' }, agent: workItemAgents[0], agents: workItemAgents,
    canceledAgents: [], draft: '', messages: [], onDraftChange() {}, onSubmit() {}, onSelect() {}, onAgentAction() {}, onClose() {},
  };
  const view = () => render(props);
  const status = tree => find(tree, node => node.props.className === 'work-agent-execution-status').props.children;
  const logs = tree => nodes(tree).filter(byName('ExecutionLog'));
  assert.equal(status(view()), 'Working 00:00');
  assert.equal(logs(view()).length, 0, 'Tool calls wait for the preceding narration');
  let cleanup = render.flushEffects();
  advanceTimers(1000);
  let tree = view();
  assert.equal(status(tree), 'Working 00:01');
  const partial = textContent(find(tree, node => node.props.className === 'work-agent-execution-intro'));
  assert.ok(partial.startsWith('需要先获取') && partial.length < 94, 'Narration streams rather than appearing all at once');
  advanceTimers(4000);
  tree = view();
  assert.equal(logs(tree).length, 1);
  assert.equal(logs(tree)[0].props.running, true);
  assert.equal(logs(tree)[0].props.children, 'exploring 2 files');
  cleanup();
  props = { ...props, canceledAgents: [workItemAgents[0].id] };
  const stopped = view();
  cleanup = render.flushEffects();
  assert.equal(status(stopped), 'task canceled');
  assert.equal(logs(stopped)[0].props.running, false, 'Stop removes the active tool shimmer');
  assert.equal(logs(stopped)[0].props.canceled, true);
  advanceTimers(5000);
  assert.equal(textContent(view()), textContent(stopped), 'Stop freezes output and pending steps');
  cleanup();
  props = { ...props, canceledAgents: [] };
  view();
  cleanup = render.flushEffects();
  assert.equal(status(view()), 'Working 00:00', 'Rerun resets the clock');
  assert.equal(logs(view()).length, 0, 'Rerun starts the narration sequence again');
  advanceTimers(8000);
  tree = view();
  assert.equal(logs(tree)[0].props.running, false, 'Completed tools become static before the next narration');
  assert.equal(logs(tree)[0].props.children, 'explored 2 files');
  const paragraph = find(tree, node => node.props.className === 'work-agent-execution-paragraph');
  assert.ok(textContent(paragraph).startsWith('I’ll use the Hatch pet'));
  assert.equal(find(paragraph, node => node.props.className === 'work-agent-inline-tag').props.children, 'Hatch pet', 'Inline tags survive streaming');
  advanceTimers(60000);
  tree = view();
  assert.equal(status(tree), 'Working 01:08', 'The clock catches up after delayed timers and rolls seconds into minutes');
  assert.equal(logs(tree).filter(node => node.props.running).length, 1);
  assert.equal(logs(tree).at(-1).props.terminal, true);
  assert.ok(logs(tree).at(-1).props.children.includes('running 2 orders'));
  cleanup();
  props = { ...props, agent: workItemAgents[1] };
  assert.equal(status(view()), 'Working 00:00', 'Switching agents cannot show another agent’s elapsed time');
  cleanup = render.flushEffects();
  advanceTimers(1000);
  assert.equal(status(view()), 'Working 00:01');
  cleanup();
  advanceTimers(5000);
  assert.equal(status(view()), 'Working 00:01', 'Unmount cleanup stops the timer');
  assert.equal(formatAgentWorkingTime(59999), '00:59');
  assert.equal(formatAgentWorkingTime(60000), '01:00');
  assert.equal(formatAgentWorkingTime(3600000), '60:00');
  assert.equal(getAgentExecutionFrame(60000).nextTickMs, 1000, 'Once narration ends, only the second counter needs updates');
}
console.log('Agent streaming checks passed: ordered narration/tools, rich text, active shimmer state, stop/freeze, rerun/reset, timer rollover/catch-up, agent isolation and timer cleanup.');
{
  const { WorkItemPlanningPicker } = load(resolve(root, 'src/WorkItemPlanningPicker.tsx'));
  function fixture(field, onChange = () => {}, initial = {}) {
    const render = mount(WorkItemPlanningPicker);
    const inputNode = new TestNode();
    const acceptNode = new TestNode();
    const menuNode = Object.assign(new TestNode([acceptNode]), { querySelector: () => acceptNode });
    const anchor = { left: 848, top: 407, bottom: 439 };
    const fieldNode = Object.assign(new TestNode([inputNode]), { getBoundingClientRect: () => anchor });
    const bounds = { left: 500, top: 0, width: 920, bottom: 900 };
    const drawerEvents = new EventTarget();
    const drawerNode = Object.assign(new TestNode([fieldNode, menuNode]), {
      getBoundingClientRect: () => bounds,
      addEventListener: drawerEvents.addEventListener.bind(drawerEvents),
      removeEventListener: drawerEvents.removeEventListener.bind(drawerEvents),
    });
    const changes = [];
    const props = { ...initial, field, drawerRef: { current: drawerNode }, onChange(value) { changes.push(value); props.value = value; onChange(value); } };
    let tree;
    let stopEffects = () => {};
    let stopLayout = () => {};
    const input = () => find(tree, node => node.type === 'input');
    const menu = () => find(tree, node => node.props.id === `work-${field}-menu`);
    const button = text => find(tree, node => node.type === 'button' && node.props.children === text);
    function renderOnly() {
      tree = render(props);
      tree.props.ref.current = fieldNode;
      input().props.ref.current = inputNode;
      if (menu()) menu().props.ref.current = menuNode;
    }
    function settle() {
      stopEffects(); stopLayout(); renderOnly();
      stopEffects = render.flushEffects(); stopLayout = render.flushLayoutEffects(); renderOnly();
    }
    function open() { input().props.onClick(); settle(); }
    function start() {
      if (!input().props['aria-expanded']) open();
      find(tree, node => node.props.className === 'work-owner-suggestion').props.onClick(); settle();
    }
    function press(key, isComposing = false) {
      let prevented = false;
      input().props.onKeyDown({ key, nativeEvent: { isComposing }, currentTarget: inputNode, preventDefault() { prevented = true; }, stopPropagation() {} });
      renderOnly(); return prevented;
    }
    function calendar() {
      const element = find(tree, byName('ScheduleCalendar'));
      return mount(element.type)(element.props);
    }
    function date(value) {
      find(calendar(), node => node.type === 'button' && node.props['aria-label'] === value).props.onClick(); renderOnly();
    }
    renderOnly();
    return { tree: () => tree, input, menu, button, open, start, press, calendar, date, settle, renderOnly, changes, bounds, anchor, drawerNode, acceptNode, cleanup() { stopEffects(); stopLayout(); } };
  }
  for (const field of ['pd', 'schedule']) {
    const picker = fixture(field);
    assert.equal(picker.input().props.value, '');
    assert.ok(find(picker.tree(), node => node.props.className?.includes('work-owner-placeholder')));
    picker.open();
    assert.equal(picker.menu().props.style.height, field === 'pd' ? 56 : 365);
    assert.equal(picker.menu().props.style.width, field === 'pd' ? 320 : 520);
    assert.equal(picker.menu().props.style.left, picker.anchor.left - picker.bounds.left, 'Planning menus align with their inputs');
    picker.start();
    assert.equal(picker.menu().props.style.height, 172);
    assert.equal(picker.menu().props.style.width, 398);
    advanceTimers(1500); picker.renderOnly();
    assert.equal(find(picker.tree(), node => node.props.className === 'work-owner-ai-title-track').props.style.transform, 'translateY(-16px)');
    advanceTimers(4499); picker.renderOnly();
    assert.ok(!picker.button('Accept'), 'The full analysis takes six seconds');
    advanceTimers(1); picker.settle();
    assert.equal(picker.menu().props.style.height, 337);
    assert.ok(find(picker.tree(), node => node.props.children === (field === 'pd' ? '5PD' : '03-04 ~ 03-08')));
    picker.press('ArrowDown');
    assert.equal(testDocument.activeElement, picker.acceptNode);
    picker.button('Accept').props.onPointerEnter({ pointerType: 'touch' }); picker.renderOnly();
    assert.equal(picker.input().props.value, '', 'Touch does not leave a hover preview');
    picker.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); picker.renderOnly();
    assert.equal(picker.input().props.value, field === 'pd' ? '5PD' : '03-04 ~ 03-08');
    assert.equal(picker.input().props.className, 'work-planning-preview');
    assert.equal(picker.changes.length, 0, 'Hover previews without saving');
    picker.button('Accept').props.onPointerLeave(); picker.renderOnly();
    assert.equal(picker.input().props.value, '');
    picker.button('Accept').props.onFocus(); picker.renderOnly();
    assert.equal(picker.input().props.className, 'work-planning-preview', 'Keyboard focus also previews');
    picker.button('Ignore').props.onClick(); picker.settle();
    assert.equal(picker.menu().props.style.height, field === 'pd' ? 56 : 365);
    assert.equal(picker.input().props.value, '');
    assert.equal(picker.changes.length, 0);
    picker.start(); advanceTimers(6000); picker.settle();
    picker.button('Accept').props.onClick(); picker.settle();
    assert.equal(picker.changes.length, 1);
    assert.equal(picker.input().props.value, field === 'pd' ? '5PD' : '03-04 ~ 03-08');
    assert.equal(picker.input().props.readOnly, true);
    assert.equal(picker.input().props['aria-expanded'], false);
    assert.equal(testDocument.activeElement, picker.drawerNode, 'Accept exits editing and removes focus from the input');
    picker.cleanup();

    for (const action of ['escape', 'outside', 'unmount']) {
      const cancelled = fixture(field); cancelled.start();
      const stale = [...pendingTimers.values()].map(timer => timer.callback);
      if (action === 'escape') { assert.equal(cancelled.press('Escape'), true); cancelled.settle(); }
      if (action === 'outside') {
        const event = new Event('pointerdown');
        Object.defineProperty(event, 'target', { value: new TestNode() });
        testDocument.dispatchEvent(event); cancelled.settle();
      }
      if (action === 'unmount') cancelled.cleanup();
      assert.equal(pendingTimers.size, 0);
      stale.forEach(callback => callback()); cancelled.renderOnly();
      assert.ok(!cancelled.button('Accept'), `${field}: ${action} cannot resurrect a stale result`);
      assert.equal(cancelled.changes.length, 0);
      cancelled.cleanup();
    }
    const narrow = fixture(field);
    narrow.bounds.width = 360; narrow.bounds.bottom = 650;
    narrow.open();
    assert.equal(narrow.menu().props.style.width, field === 'pd' ? 320 : 336);
    narrow.start(); advanceTimers(6000); narrow.settle();
    const position = narrow.menu().props.style;
    assert.ok(position.left >= 12 && position.left + position.width <= 348);
    assert.ok(position.top >= 0 && position.top + position.maxHeight <= 650);
    narrow.cleanup();
  }
  const alignedSchedule = fixture('schedule');
  alignedSchedule.bounds.width = 760;
  alignedSchedule.open();
  assert.equal(alignedSchedule.menu().props.style.left, 348, 'Schedule keeps the input left edge when right-side space is limited');
  assert.equal(alignedSchedule.menu().props.style.width, 400, 'Schedule narrows to available space instead of shifting left');
  alignedSchedule.cleanup();
  const pd = fixture('pd'); pd.open();
  for (const value of ['abc', '-1', '0', '2..5']) {
    pd.input().props.onChange({ target: { value } }); pd.renderOnly(); pd.press('Enter');
    assert.equal(pd.changes.length, 0, 'Invalid work estimates must not be committed');
  }
  pd.input().props.onChange({ target: { value: '2.5' } }); pd.renderOnly();
  pd.press('Enter', true); assert.equal(pd.changes.length, 0, 'IME composition cannot commit a draft');
  pd.press('Enter'); pd.settle();
  assert.equal(pd.changes[0], '2.5PD');
  assert.equal(testDocument.activeElement, pd.drawerNode);
  pd.start();
  const stalePD = [...pendingTimers.values()].map(timer => timer.callback);
  pd.input().props.onChange({ target: { value: '3' } }); pd.settle();
  assert.equal(pendingTimers.size, 0);
  stalePD.forEach(callback => callback()); pd.renderOnly();
  assert.ok(!pd.button('Accept'), 'Typing during analysis cancels it');
  pd.cleanup();

  const schedule = fixture('schedule'); schedule.open();
  assert.equal(nodes(schedule.calendar()).filter(node => node.type === 'button' && /^2026-\d\d-\d\d$/.test(node.props['aria-label'])).length, 61);
  const nextMonth = find(schedule.calendar(), node => node.props['aria-label'] === '右侧日历下个月');
  nextMonth.props.onClick(); schedule.renderOnly();
  assert.ok(find(schedule.calendar(), node => node.props['aria-label'] === '2026年5月'));
  schedule.date('2026-04-10');
  assert.equal(schedule.changes.length, 0, 'Selecting only the start date does not save an incomplete range');
  schedule.date('2026-04-06'); schedule.settle();
  assert.equal(JSON.stringify(schedule.changes[0]), JSON.stringify({ start: '2026-04-06', end: '2026-04-10' }));
  assert.equal(schedule.input().props.value, '04-06 ~ 04-10');
  assert.equal(testDocument.activeElement, schedule.drawerNode);
  schedule.start(); advanceTimers(6000); schedule.settle();
  assert.ok(!find(schedule.tree(), node => node.props.children === 'Alternative'));
  assert.ok(find(schedule.tree(), node => node.props.children === 'seems a perfect schedule'));
  schedule.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); schedule.renderOnly();
  assert.equal(schedule.input().props.value, '03-04 ~ 03-08');
  schedule.button('Accept').props.onClick(); schedule.settle();
  assert.equal(JSON.stringify(schedule.changes[1]), JSON.stringify({ start: '2026-03-04', end: '2026-03-08' }));
  schedule.cleanup();

  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const { applications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const renderPage = mount(WorkItemsPage);
  const page = () => renderPage({ application: applications[0] });
  const openRow = id => find(page(), node => node.props['data-work-item-row'] === id).props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  const drawer = () => find(page(), byName('WorkItemDrawer'));
  const toast = () => find(page(), node => node.props.className === 'work-owner-toast');
  openRow(1);
  const stopPage = renderPage.flushEffects();
  for (const field of ['pd', 'schedule']) {
    const detail = mount(drawer().type)(drawer().props);
    const pickerProps = find(detail, node => byName('WorkItemPlanningPicker')(node) && node.props.field === field).props;
    const integrated = fixture(field, pickerProps.onChange);
    integrated.start(); advanceTimers(6000); integrated.settle();
    integrated.button('Accept').props.onClick(); integrated.settle();
    assert.ok(find(toast(), node => node.props.children === `Workflow ${field === 'pd' ? 'PD' : 'schedule'} updated`));
    assert.ok(drawer().props[field], 'The actual picker callback saves its value on the page');
    advanceTimers(1999); assert.ok(toast());
    advanceTimers(1); assert.ok(!toast());
    integrated.cleanup();
  }
  openRow(2);
  assert.equal(drawer().props.pd, undefined); assert.equal(drawer().props.schedule, undefined);
  openRow(1);
  assert.equal(drawer().props.pd, '5PD'); assert.equal(drawer().props.schedule.start, '2026-03-04');
  drawer().props.onPDChange('3PD'); advanceTimers(1000);
  drawer().props.onScheduleChange({ start: '2026-03-11', end: '2026-03-15' }); advanceTimers(1000);
  assert.ok(toast(), 'Updating another field resets the shared toast lifetime');
  stopPage(); assert.equal(pendingTimers.size, 0);

  const team = fixture('review-team');
  assert.equal(team.input().props.value, 'IPMT 团队');
  assert.ok(find(team.tree(), node => node.props.className?.includes('work-review-value-tag')));
  for (const id of ['ipmt', 'product', 'engineering', 'design', 'quality']) {
    team.open();
    const options = nodes(team.tree()).filter(node => node.props.role === 'option');
    assert.equal(options.length, 5);
    assert.equal(options.filter(node => node.props['aria-selected']).length, 1, 'Review teams are single-select');
    find(team.tree(), node => node.props.id === `work-review-team-${id}`).props.onClick(); team.settle();
    assert.equal(team.changes.at(-1), id);
    assert.equal(team.input().props['aria-expanded'], false);
    assert.equal(testDocument.activeElement, team.drawerNode);
  }
  team.open();
  team.input().props.onChange({ target: { value: '技术' } }); team.settle();
  assert.equal(nodes(team.tree()).filter(node => node.props.role === 'option').length, 1);
  team.press('ArrowDown');
  assert.equal(team.input().props['aria-activedescendant'], 'work-review-team-engineering');
  const beforeIME = team.changes.length;
  team.press('Enter', true); assert.equal(team.changes.length, beforeIME);
  team.press('Enter'); team.settle();
  assert.equal(team.input().props.value, '技术评审团队');
  team.open(); team.input().props.onChange({ target: { value: '不存在' } }); team.settle();
  assert.ok(find(team.tree(), node => node.props.children === '未找到匹配的团队'));
  team.press('Escape'); team.settle();
  assert.equal(team.input().props.value, '技术评审团队', 'Cancelling a search preserves the saved team');
  team.cleanup();

  const finish = fixture('finish-date'); finish.open();
  assert.equal(finish.input().props.value, '2024-06-30');
  assert.equal(finish.menu().props.style.width, 284);
  assert.equal(nodes(finish.calendar()).filter(node => node.props.className === 'work-schedule-month').length, 1);
  assert.equal(find(finish.calendar(), node => node.props['aria-label'] === '2024-06-30').props['aria-pressed'], true);
  find(finish.calendar(), node => node.props['aria-label'] === '左侧日历下个月').props.onClick(); finish.renderOnly();
  finish.date('2024-07-12'); finish.settle();
  assert.equal(finish.changes[0], '2024-07-12', 'One date click saves a complete date value');
  assert.equal(finish.input().props['aria-expanded'], false);
  assert.equal(testDocument.activeElement, finish.drawerNode);
  finish.open();
  assert.ok(find(finish.calendar(), node => node.props['aria-label'] === '2024年7月'));
  assert.equal(find(finish.calendar(), node => node.props['aria-label'] === '2024-07-12').props['aria-pressed'], true);
  finish.cleanup();
  const leapDate = fixture('finish-date', () => {}, { value: '2028-02-29' }); leapDate.open();
  assert.equal(nodes(leapDate.calendar()).filter(node => node.type === 'button' && /^2028-02-\d\d$/.test(node.props['aria-label'])).length, 29);
  leapDate.date('2028-02-29'); leapDate.settle();
  assert.equal(leapDate.input().props.value, '2028-02-29'); leapDate.cleanup();

  for (const field of ['review-team', 'finish-date']) {
    const picker = fixture(field, () => {}, { reviewContext: { application: 'bug', pd: '3PD' } });
    picker.start();
    advanceTimers(1500); picker.renderOnly();
    assert.equal(find(picker.tree(), node => node.props.className === 'work-owner-ai-title-track').props.style.transform, 'translateY(-16px)');
    advanceTimers(4499); picker.renderOnly(); assert.ok(!picker.button('Accept'));
    advanceTimers(1); picker.settle();
    picker.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); picker.renderOnly();
    assert.equal(picker.changes.length, 0);
    assert.equal(picker.input().props.value, field === 'review-team' ? '质量保障团队' : '2024-07-03');
    if (field === 'review-team') assert.ok(find(picker.tree(), node => node.props.className?.includes('work-review-value-tag is-preview')));
    else assert.equal(picker.input().props.className, 'work-planning-preview');
    picker.button('Accept').props.onPointerLeave(); picker.renderOnly();
    assert.equal(picker.input().props.value, field === 'review-team' ? '' : '2024-06-30');
    picker.button('Ignore').props.onClick(); picker.settle();
    assert.equal(picker.changes.length, 0);
    assert.equal(picker.menu().props.style.height, field === 'review-team' ? 277 : 365);
    picker.start(); advanceTimers(6000); picker.settle();
    assert.ok(!find(picker.tree(), node => node.props.children === 'Alternative'));
    picker.button('Accept').props.onFocus(); picker.renderOnly();
    assert.equal(picker.input().props.value, field === 'review-team' ? '质量保障团队' : '2024-07-03');
    picker.button('Accept').props.onClick(); picker.settle();
    assert.equal(picker.changes[0], field === 'review-team' ? 'quality' : '2024-07-03');
    assert.equal(testDocument.activeElement, picker.drawerNode);
    assert.equal(picker.input().props['aria-expanded'], false);
    picker.cleanup();

    for (const action of ['escape', 'outside', 'focus-away', 'unmount']) {
      const cancelled = fixture(field); cancelled.start();
      const stale = [...pendingTimers.values()].map(timer => timer.callback);
      if (action === 'escape') { cancelled.press('Escape'); cancelled.settle(); }
      if (action === 'outside' || action === 'focus-away') {
        const event = new Event(action === 'outside' ? 'pointerdown' : 'focusin');
        Object.defineProperty(event, 'target', { value: new TestNode() });
        testDocument.dispatchEvent(event); cancelled.settle();
      }
      if (action === 'unmount') cancelled.cleanup();
      assert.equal(pendingTimers.size, 0);
      stale.forEach(callback => callback()); cancelled.renderOnly();
      assert.ok(!cancelled.button('Accept')); assert.equal(cancelled.changes.length, 0);
      cancelled.cleanup();
    }
    const narrow = fixture(field);
    narrow.bounds.width = 360; narrow.bounds.bottom = 650;
    narrow.anchor.top = 560; narrow.anchor.bottom = 592;
    narrow.start(); advanceTimers(6000); narrow.settle();
    const style = narrow.menu().props.style;
    assert.ok(style.left >= 12 && style.left + style.width <= 348);
    assert.ok(style.top >= 0 && style.top < narrow.anchor.top && style.top + style.maxHeight <= 650, 'Lower form fields open above when space below is limited');
    narrow.cleanup();
  }

  const { suggestedReviewTeam, suggestedFinishDates } = load(resolve(root, 'src/work-item-review-data.ts'));
  const mappings = { epic: 'ipmt', version: 'quality', sprint: 'engineering', story: 'product', bug: 'quality', 'story-list': 'design' };
  for (const [application, expected] of Object.entries(mappings)) assert.equal(suggestedReviewTeam({ application }), expected);
  assert.equal(suggestedFinishDates({ application: 'epic', pd: '2.5PD' }).primary.date, '2024-07-03');
  assert.equal(suggestedFinishDates({ application: 'epic', pd: '6PD' }).primary.date, '2024-07-08', 'PD-based estimates skip weekends');
  assert.equal(suggestedFinishDates({ application: 'epic', schedule: { start: '2026-04-01', end: '2026-04-10' } }).primary.date, '2026-04-10');

  // Actual picker -> drawer -> page callbacks, including manual and AI confirmation.
  const reviewPage = mount(WorkItemsPage);
  const reviewView = () => reviewPage({ application: applications[0] });
  const reviewRow = id => find(reviewView(), node => node.props['data-work-item-row'] === id).props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  const reviewDrawer = () => find(reviewView(), byName('WorkItemDrawer'));
  const reviewToast = () => find(reviewView(), node => node.props.className === 'work-owner-toast');
  reviewRow(1); const stopReviewPage = reviewPage.flushEffects();
  reviewDrawer().props.onPDChange('3PD');
  reviewDrawer().props.onScheduleChange({ start: '2026-04-01', end: '2026-04-10' });
  advanceTimers(2000);
  for (const field of ['review-team', 'finish-date']) {
    const detail = mount(reviewDrawer().type)(reviewDrawer().props);
    const pickerProps = find(detail, node => byName('WorkItemPlanningPicker')(node) && node.props.field === field).props;
    assert.equal(pickerProps.reviewContext.pd, '3PD');
    assert.equal(pickerProps.reviewContext.schedule.end, '2026-04-10');
    const integrated = fixture(field, pickerProps.onChange, pickerProps);
    integrated.open();
    if (field === 'review-team') find(integrated.tree(), node => node.props.id === 'work-review-team-design').props.onClick();
    else integrated.date('2024-06-28');
    integrated.settle();
    const message = field === 'review-team' ? 'Workflow review team updated' : 'Workflow finish date updated';
    assert.ok(find(reviewToast(), node => node.props.children === message));
    assert.equal(reviewDrawer().props[field === 'review-team' ? 'reviewTeam' : 'finishDate'], field === 'review-team' ? 'design' : '2024-06-28');
    advanceTimers(1999); assert.ok(reviewToast()); advanceTimers(1); assert.ok(!reviewToast());
    integrated.start(); advanceTimers(6000); integrated.settle();
    integrated.button('Accept').props.onClick(); integrated.settle();
    assert.equal(reviewDrawer().props[field === 'review-team' ? 'reviewTeam' : 'finishDate'], field === 'review-team' ? 'ipmt' : '2026-04-10');
    assert.ok(find(reviewToast(), node => node.props.children === message));
    advanceTimers(2000); assert.ok(!reviewToast());
    integrated.cleanup();
  }
  reviewRow(2);
  assert.equal(reviewDrawer().props.reviewTeam, undefined); assert.equal(reviewDrawer().props.finishDate, undefined);
  reviewRow(1);
  assert.equal(reviewDrawer().props.reviewTeam, 'ipmt'); assert.equal(reviewDrawer().props.finishDate, '2026-04-10');
  reviewDrawer().props.onClose(); reviewRow(1);
  assert.equal(reviewDrawer().props.finishDate, '2026-04-10', 'Review edits survive closing and reopening the same work item');
  stopReviewPage(); assert.equal(pendingTimers.size, 0);

  const assetsPath = 'public/assets/figma/work-item-planning';
  const exported = load(resolve(root, assetsPath, 'provenance.json'));
  assert.equal(exported.sourceNode, '61:37889');
  for (const asset of [...exported.assets, ...exported.reusedAssets]) {
    const original = readFileSync(resolve(root, assetsPath, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-planning', asset.file)), original);
  }
}
console.log('PD and Schedule checks passed: Figma panels, six-second loading, preview/Accept/Ignore, manual values, date ranges, primary recommendation, cancellation, focus, per-row persistence, two-second toast, responsive positioning and original SVG assets.');
console.log('Review-field checks passed: five single-select teams, search and IME, single-date calendar and leap years, context-based suggestions, preview/Accept/Ignore, cancellation, manual/AI toast, per-row values and responsive positioning.');
console.log(`Checks passed: ${catalog.templates.length} themed cards, editable prompts, IME guards, preview initialization, share URLs, history navigation; Marketplace direct loads, five tabs, four catalogs, 20 skill entry points through prefill and send, scenario filters, details and ${marketAssets.assets.length} original Figma assets.`);
// Table cell editing uses the same local recommendation lifecycle without opening a browser.
{
  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const { WorkItemOwnerPicker } = load(resolve(root, 'src/WorkItemOwnerPicker.tsx'));
  const { WorkItemPlanningPicker } = load(resolve(root, 'src/WorkItemPlanningPicker.tsx'));
  const { WorkItemAppPicker } = load(resolve(root, 'src/WorkItemAppPicker.tsx'));
  const { applications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { tablePeople, tableOwnerRecommendations } = load(resolve(root, 'src/work-item-table-data.ts'));
  const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
  testWindow.innerWidth = 1440; testWindow.innerHeight = 900;
  testDocument.body = new TestNode();
  const item = getWorkItemView('epic').items[0];
  function fixture(field, value, onChange = () => {}, onClose = () => {}) {
    const inputNode = new TestNode();
    const acceptNode = new TestNode();
    const menuNode = Object.assign(new TestNode([acceptNode]), { querySelector: () => acceptNode });
    const anchor = { left: 800, right: 930, top: 210, bottom: 254 };
    const horizontal = { left: 240, right: 1440 };
    const vertical = { top: 100, bottom: 900 };
    const cellNode = Object.assign(new TestNode([inputNode]), {
      getBoundingClientRect: () => anchor,
      closest: selector => selector === '.work-table-scroll' ? { getBoundingClientRect: () => horizontal } : { getBoundingClientRect: () => vertical },
    });
    const anchorRef = { current: cellNode };
    let closed = 0;
    const close = () => { closed++; onClose(); };
    const changes = [];
    const props = field === 'app'
      ? { id: 'test-table-app', item, value, anchorRef, onClose: close, onChange(value) { props.value = value; changes.push(value); onChange(value); } }
      : field === 'pd' || field === 'schedule'
      ? { field, value, drawerRef: { current: null }, onChange(value) { props.value = value; changes.push(value); onChange(value); }, table: { id: `test-table-${field}`, anchorRef, onClose: close, itemTitle: item.title } }
      : { owner: value, drawerRef: { current: null }, onChange(value) { props.owner = value; changes.push(value); onChange(value); }, table: { id: 'test-table-owner', anchorRef, onClose: close, people: tablePeople, recommendations: tableOwnerRecommendations(item) } };
    const render = mount(field === 'app' ? WorkItemAppPicker : field === 'pd' || field === 'schedule' ? WorkItemPlanningPicker : WorkItemOwnerPicker);
    let tree;
    let stopEffects = () => {};
    let stopLayout = () => {};
    const input = () => find(tree, node => node.type === 'input');
    const menu = () => find(tree, node => node.props.className?.split(' ').includes('work-table-menu'));
    function renderOnly() {
      tree = render(props);
      if (tree.props.ref) tree.props.ref.current = cellNode;
      input().props.ref.current = inputNode;
      if (menu()) menu().props.ref.current = menuNode;
    }
    function settle() { stopEffects(); stopLayout(); renderOnly(); stopLayout = render.flushLayoutEffects(); stopEffects = render.flushEffects(); renderOnly(); }
    const button = label => find(tree, node => node.type === 'button' && node.props.children === label);
    function start() { find(tree, node => node.props.className === 'work-owner-suggestion').props.onClick(); settle(); }
    function press(key, composing = false) { input().props.onKeyDown({ key, nativeEvent: { isComposing: composing }, currentTarget: inputNode, preventDefault() {}, stopPropagation() {} }); renderOnly(); }
    function calendar() { const element = find(tree, byName('ScheduleCalendar')); return mount(element.type)(element.props); }
    function date(value) { find(calendar(), node => node.type === 'button' && node.props['aria-label'] === value).props.onClick(); renderOnly(); }
    settle();
    return { calendar, date, input, menu, button, start, press, renderOnly, settle, changes, anchor, horizontal, vertical, cellNode, menuNode, acceptNode, tree: () => tree, closed: () => closed, cleanup() { stopEffects(); stopLayout(); } };
  }
  setLocation('https://example.test/apps/epic');
  const renderPage = mount(WorkItemsPage);
  const page = () => renderPage({ application: applications[0] });
  const cells = () => nodes(page()).filter(byName('WorkItemTableCell'));
  const cell = (field, rowId = 1) => cells().find(node => node.props.field === field && node.props.item.id === rowId);
  const toast = () => find(page(), node => node.props.className === 'work-owner-toast');
  assert.equal(cells().length, 40, 'APP, Schedule, PD and both Owner columns are editable across all eight rows');
  assert.equal(nodes(page()).filter(node => node.type === 'th').length, 7, 'Tags is removed from the table');
  assert.ok(find(page(), node => node.props.className === 'work-column-sort' && node.props.children[0] === 'Schedule'));
  assert.ok(!nodes(page()).some(node => node.type === 'th' && node.props.children === 'Tags'));
  const renderCell = mount(cell('app').type);
  const target = Object.assign(new TestNode(), { blur() {} });
  const cellTree = () => { const tree = renderCell(cell('app').props); tree.props.ref.current = target; return tree; };
  let stopped = false;
  cellTree().props.onClick({ currentTarget: target, target, stopPropagation() { stopped = true; } });
  assert.ok(stopped, 'A cell click does not bubble into the row drawer');
  assert.equal(cell('app').props.selected, true);
  assert.equal(cell('app').props.editing, false, 'Single click selects without editing');
  assert.equal(testWindow.location.pathname, '/apps/epic');
  assert.equal(cellTree().props['data-cell-selected'], true);
  const arrow = () => find(cellTree(), node => node.props.className === 'work-cell-edit-arrow');
  assert.equal(find(arrow(), node => node.type === 'img').props.src, '/assets/figma/work-item-table-edit/cell-arrow.svg');
  arrow().props.onClick({ stopPropagation() {} });
  assert.equal(cell('app').props.editing, true, 'Arrow enters editing');
  assert.ok(find(cellTree(), byName('WorkItemAppPicker')));
  const stopPage = renderPage.flushEffects();
  cell('app').props.onClose();
  assert.equal(cell('app').props.selected, true, 'Closing editing retains selection and the arrow');
  cellTree().props.onDoubleClick({ currentTarget: target, target, stopPropagation() {}, preventDefault() {} });
  assert.equal(cell('app').props.editing, true, 'Double click enters editing');
  cell('app').props.onClose();
  cellTree().props.onKeyDown({ currentTarget: target, target, key: 'Enter', nativeEvent: { isComposing: true }, stopPropagation() {}, preventDefault() {} });
  assert.equal(cell('app').props.editing, false, 'IME composition does not activate editing');
  cellTree().props.onKeyDown({ currentTarget: target, target, key: 'F2', nativeEvent: { isComposing: false }, stopPropagation() {}, preventDefault() {} });
  assert.equal(cell('app').props.editing, true);
  const appPicker = fixture('app', cell('app').props.value, cell('app').props.onChange, cell('app').props.onClose);
  assert.equal(appPicker.menu().props.style.position, 'fixed');
  assert.equal(appPicker.menu().props.style.top, 258);
  const appOption = id => find(appPicker.tree(), node => node.props.role === 'option' && node.props.id === `test-table-app-${id}`);
  assert.equal(find(appPicker.tree(), node => node.props.role === 'listbox').props['aria-multiselectable'], 'true');
  const appOptions = nodes(appPicker.tree()).filter(node => node.props.role === 'option');
  assert.equal(appOptions.length, 4);
  same(appOptions.map(option => nodes(option).filter(node => node.type === 'span').map(node => node.props.children)), [['飞书'], ['飞书项目'], ['CodeM'], ['开放平台']], 'Options contain only their real app names, without subtitles');
  assert.equal(appPicker.menu().props.style.height, 227, 'Four compact options fit the menu');
  appOption('codem').props.onClick(); appPicker.renderOnly();
  same(cell('app').props.value, ['project'], 'Multi-select removal writes immediately to the table');
  assert.equal(appOption('codem').props['aria-selected'], false);
  assert.equal(appPicker.closed(), 0, 'Keep the menu open for consecutive selections');
  assert.ok(toast()); advanceTimers(2000); assert.ok(!toast());
  appPicker.input().props.onChange({ target: { value: 'CodeM' } }); appPicker.renderOnly();
  assert.equal(nodes(appPicker.tree()).filter(node => node.props.role === 'option').length, 1);
  appPicker.press('ArrowDown'); appPicker.press('Enter', true);
  assert.equal(appPicker.changes.length, 1);
  appPicker.press('Enter'); appPicker.renderOnly();
  same(cell('app').props.value, ['project', 'codem']);
  advanceTimers(2000);
  appPicker.start();
  appPicker.press('ArrowDown'); appPicker.press('Enter');
  assert.equal(appPicker.changes.length, 2, 'Loading never selects hidden options');
  advanceTimers(4500); appPicker.renderOnly();
  assert.equal(find(appPicker.tree(), node => node.props.className === 'visually-hidden').props.children, '生成应用建议');
  assert.ok(!appPicker.button('Accept'));
  advanceTimers(1500); appPicker.settle();
  assert.ok(appPicker.button('Accept'));
  assert.ok(!find(appPicker.tree(), node => node.props.children === 'Alternative'));
  assert.ok(find(appPicker.tree(), node => node.props.children === 'is the best match'));
  appPicker.button('Accept').props.onFocus(); appPicker.renderOnly();
  assert.ok(find(appPicker.tree(), node => node.props.className === 'work-app-tags work-table-app-preview'));
  assert.equal(appPicker.changes.length, 2, 'Preview never writes the table value');
  appPicker.button('Ignore').props.onClick(); appPicker.settle();
  assert.equal(appPicker.changes.length, 2);
  assert.ok(!find(appPicker.tree(), node => node.props.className === 'work-app-tags work-table-app-preview'));
  appPicker.start(); advanceTimers(6000); appPicker.settle();
  appPicker.button('Accept').props.onClick(); appPicker.renderOnly();
  same(cell('app').props.value, ['project', 'codem'], 'AI acceptance does not duplicate existing tags');
  assert.equal(cell('app').props.editing, false);
  assert.equal(cell('app').props.selected, true);
  assert.equal(testDocument.activeElement, appPicker.cellNode);
  assert.ok(toast()); advanceTimers(1999); assert.ok(toast()); advanceTimers(1); assert.ok(!toast());
  appPicker.cleanup();

  cell('owner').props.onEdit();
  assert.equal(cell('app').props.selected, false, 'Selecting another cell clears the old highlight');
  const owner = fixture('owner', cell('owner').props.value, cell('owner').props.onChange, cell('owner').props.onClose);
  assert.equal(nodes(owner.tree()).filter(node => node.props.role === 'option').length, 12);
  assert.ok(nodes(owner.tree()).filter(node => node.props.role === 'option' && !node.props.className.includes('work-owner-agent-option')).every(node => find(node, child => child.props.className === 'work-owner-email')?.props.children));
  owner.input().props.onChange({ target: { value: 'john.du@example.com' } }); owner.renderOnly();
  owner.press('ArrowDown'); owner.press('Enter');
  assert.equal(testDocument.activeElement, owner.cellNode, 'Committing a person restores cell focus before the editor unmounts');
  owner.settle();
  assert.equal(cell('owner').props.value.name, 'John Du');
  assert.equal(cell('owner').props.editing, false);
  assert.equal(cell('secondary-owner').props.value.name, 'Jane', 'The two Owner columns retain independent values');
  assert.equal(cell('owner', 2).props.value.name, 'Jane', 'Edits do not leak to another row');
  assert.ok(toast()); advanceTimers(2000); owner.cleanup();
  const tableAgent = fixture('owner', cell('secondary-owner').props.value, cell('secondary-owner').props.onChange, cell('secondary-owner').props.onClose);
  tableAgent.input().props.onChange({ target: { value: 'Reviewer' } }); tableAgent.renderOnly();
  tableAgent.press('ArrowDown'); tableAgent.press('Enter', true);
  assert.equal(tableAgent.changes.length, 0, 'IME confirmation does not assign an agent');
  tableAgent.press('Enter');
  assert.equal(testDocument.activeElement, tableAgent.cellNode);
  tableAgent.settle();
  assert.equal(cell('secondary-owner').props.value.name, 'Reviewer', 'Agent selection also fills table Owner cells');
  assert.equal(cell('secondary-owner').props.value.spaceAgent.memberId, 'planner');
  assert.equal(cell('owner').props.value.name, 'John Du', 'Selecting an agent keeps the other Owner independent');
  advanceTimers(2000); tableAgent.cleanup();
  const row = find(page(), node => node.type === 'tr' && node.props['data-work-item-row'] === 1);
  row.props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  assert.equal(find(page(), byName('WorkItemDrawer')).props.owner.name, 'John Du', 'Primary Owner stays in sync with the drawer');
  find(page(), byName('WorkItemDrawer')).props.onOwnerChange(tablePeople[0]);
  assert.equal(cell('owner').props.value.name, 'Jane', 'Drawer changes also appear in the table');
  advanceTimers(2000);
  cell('owner').props.onEdit();
  assert.equal(testWindow.location.pathname, '/apps/epic', 'Cell editing closes the row drawer');
  assert.ok(!find(page(), byName('WorkItemDrawer')));
  const suggestedOwner = fixture('owner', cell('owner').props.value, cell('owner').props.onChange, cell('owner').props.onClose);
  suggestedOwner.start(); advanceTimers(6000); suggestedOwner.settle();
  assert.ok(nodes(suggestedOwner.tree()).some(node => node.type === 'li' && node.props.children.includes(item.title)));
  assert.ok(!find(suggestedOwner.tree(), node => node.props.children === 'Alternative'));
  const recommendedOwner = tableOwnerRecommendations(item);
  suggestedOwner.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); suggestedOwner.renderOnly();
  assert.ok(find(suggestedOwner.tree(), node => node.props.className?.includes('work-owner-value-tag is-preview')));
  assert.equal(cell('owner').props.value.name, 'Jane');
  suggestedOwner.button('Accept').props.onClick(); suggestedOwner.renderOnly();
  assert.equal(cell('owner').props.value.name, recommendedOwner.values[recommendedOwner.primary].owner.name);
  assert.equal(cell('owner').props.editing, false);
  advanceTimers(2000); suggestedOwner.cleanup();
  // The two newly editable columns use the same page state as the drawer.
  cell('pd').props.onEdit();
  const pdCellRender = mount(cell('pd').type);
  const pdEditor = find(pdCellRender(cell('pd').props), byName('WorkItemPlanningPicker'));
  assert.equal(pdEditor.props.field, 'pd');
  assert.equal(pdEditor.props.table.itemTitle, item.title);
  const pd = fixture('pd', cell('pd').props.value, cell('pd').props.onChange, cell('pd').props.onClose);
  assert.equal(pd.input().props.value, '2.5');
  assert.equal(pd.menu().props.style.width, 320, 'PD entry stays compact');
  assert.equal(pd.input().props['aria-controls'], pd.menu().props.id);
  for (const value of ['abc', '-1', '0', '2..5']) {
    pd.input().props.onChange({ target: { value } }); pd.renderOnly(); pd.press('Enter');
    assert.equal(pd.changes.length, 0, 'Invalid estimates do not save');
  }
  pd.input().props.onChange({ target: { value: '3.5' } }); pd.renderOnly();
  pd.press('Enter', true); assert.equal(pd.changes.length, 0);
  pd.press('Enter');
  assert.equal(testDocument.activeElement, pd.cellNode);
  assert.equal(cell('pd').props.value, '3.5PD');
  assert.equal(cell('pd').props.editing, false);
  assert.equal(cell('pd').props.selected, true);
  assert.equal(cell('pd', 2).props.value, '2.5PD');
  assert.ok(toast()); advanceTimers(1999); assert.ok(toast()); advanceTimers(1); assert.ok(!toast());
  pd.cleanup();

  cell('schedule').props.onEdit();
  const schedule = fixture('schedule', cell('schedule').props.value, cell('schedule').props.onChange, cell('schedule').props.onClose);
  assert.equal(schedule.menu().props.style.width, 520);
  assert.equal(schedule.input().props.readOnly, true);
  assert.equal(schedule.input().props['aria-controls'], schedule.menu().props.id);
  const marchDays = find(schedule.calendar(), node => node.props.className === 'work-schedule-days').props.children;
  assert.equal(marchDays[0].props['aria-label'], '2026-03-01', 'Table date ranges align dates to real weekdays');
  schedule.date('2026-03-14');
  assert.equal(schedule.changes.length, 0, 'One date does not commit an incomplete range');
  schedule.date('2026-03-10');
  same(cell('schedule').props.value, { start: '2026-03-10', end: '2026-03-14' }, 'Reverse selection normalizes the date range');
  assert.equal(testDocument.activeElement, schedule.cellNode);
  assert.equal(cell('schedule').props.editing, false);
  assert.equal(cell('schedule', 2).props.value, undefined);
  assert.ok(toast()); advanceTimers(2000); schedule.cleanup();
  const scheduleDisplay = mount(cell('schedule').type)(cell('schedule').props);
  assert.ok(find(scheduleDisplay, node => node.props.children === '2026-03-10 ~ 2026-03-14'));
  row.props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
  let planningDrawer = find(page(), byName('WorkItemDrawer'));
  assert.equal(planningDrawer.props.pd, '3.5PD');
  same(planningDrawer.props.schedule, { start: '2026-03-10', end: '2026-03-14' });
  planningDrawer.props.onPDChange('4PD');
  planningDrawer.props.onScheduleChange({ start: '2026-04-02', end: '2026-04-06' });
  assert.equal(cell('pd').props.value, '4PD');
  same(cell('schedule').props.value, { start: '2026-04-02', end: '2026-04-06' });
  advanceTimers(2000);

  for (const field of ['pd', 'schedule']) {
    cell(field).props.onEdit();
    const saved = cell(field).props.value;
    const planning = fixture(field, saved, cell(field).props.onChange, cell(field).props.onClose);
    if (field === 'schedule') {
      assert.ok(find(planning.calendar(), node => node.props['aria-label'] === '2026年4月'), 'Reopening navigates to the saved range');
      assert.equal(find(planning.calendar(), node => node.props['aria-label'] === '2026-04-02').props['aria-pressed'], true);
    }
    planning.start();
    assert.equal(planning.menu().props.style.width, 398);
    advanceTimers(1500); planning.renderOnly();
    assert.equal(find(planning.tree(), node => node.props.className === 'work-owner-ai-title-track').props.style.transform, 'translateY(-16px)');
    advanceTimers(4499); planning.renderOnly(); assert.ok(!planning.button('Accept'));
    advanceTimers(1); planning.settle();
    assert.ok(nodes(planning.tree()).some(node => node.type === 'li' && node.props.children.includes(item.title)), 'AI reasons reference the selected row');
    assert.ok(!find(planning.tree(), node => node.props.children === 'Alternative'));
    planning.button('Accept').props.onPointerEnter({ pointerType: 'mouse' }); planning.renderOnly();
    assert.equal(planning.input().props.className, 'work-planning-preview');
    assert.equal(planning.input().props.value, field === 'pd' ? '5PD' : '2026-03-04 ~ 2026-03-08');
    same(cell(field).props.value, saved, 'Preview never saves the value');
    planning.button('Ignore').props.onClick(); planning.settle();
    assert.equal(planning.changes.length, 0);
    assert.notEqual(planning.input().props.className, 'work-planning-preview');
    planning.start(); advanceTimers(6000); planning.settle();
    planning.button('Accept').props.onFocus(); planning.renderOnly();
    assert.equal(planning.input().props.className, 'work-planning-preview');
    planning.button('Accept').props.onClick(); planning.renderOnly();
    same(cell(field).props.value, field === 'pd' ? '5PD' : { start: '2026-03-04', end: '2026-03-08' });
    assert.equal(cell(field).props.editing, false);
    assert.equal(cell(field).props.selected, true);
    assert.equal(testDocument.activeElement, planning.cellNode);
    assert.ok(toast()); advanceTimers(2000); assert.ok(!toast());
    planning.cleanup();
  }
  const outside = new Event('pointerdown'); Object.defineProperty(outside, 'target', { value: new TestNode() }); testDocument.dispatchEvent(outside);
  assert.ok(cells().every(node => !node.props.selected));
  stopPage();

  for (const field of ['app', 'owner', 'pd', 'schedule']) {
    const picker = fixture(field, field === 'app' ? [] : field === 'owner' ? tablePeople[0] : undefined);
    picker.start(); advanceTimers(1500); picker.renderOnly();
    const stale = [...pendingTimers.values()].map(timer => timer.callback);
    picker.press('Escape'); picker.cleanup();
    stale.forEach(callback => callback()); picker.renderOnly();
    assert.equal(picker.closed(), 1);
    assert.equal(picker.changes.length, 0);
    assert.ok(!picker.button('Accept'), 'Closing a table editor cancels the old AI result');
  }
  const narrow = fixture('app', []);
  testWindow.innerWidth = 360; testWindow.innerHeight = 650;
  narrow.anchor.left = 210; narrow.anchor.right = 340; narrow.anchor.top = 570; narrow.anchor.bottom = 614;
  narrow.horizontal.left = 0; narrow.horizontal.right = 360;
  testWindow.dispatchEvent(new Event('resize')); narrow.renderOnly();
  let position = narrow.menu().props.style;
  assert.ok(position.left >= 12 && position.left + position.width <= 348);
  assert.ok(position.top < narrow.anchor.top && position.top + position.height <= narrow.anchor.top, 'Bottom cells open upwards');
  narrow.anchor.left = 100; narrow.anchor.right = 230;
  testWindow.dispatchEvent(new Event('scroll')); narrow.renderOnly();
  position = narrow.menu().props.style;
  assert.ok(position.left + position.width <= 348);
  narrow.anchor.left = -150; narrow.anchor.right = -20;
  testWindow.dispatchEvent(new Event('scroll')); narrow.renderOnly();
  assert.equal(narrow.closed(), 1, 'A horizontally hidden anchor closes its menu');
  narrow.cleanup(); testWindow.innerWidth = 1440; testWindow.innerHeight = 900;
  assert.equal(pendingTimers.size, 0);
  const provenance = load(resolve(root, 'public/assets/figma/work-item-table-edit/provenance.json'));
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(root, 'public/assets/figma/work-item-table-edit', asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-table-edit', asset.file)), bytes);
  }
  console.log('Table editing checks passed: Tags removal, named APP options, Schedule/PD manual and AI editing, shared drawer values, selection, arrow/double-click/keyboard, propagation, APP multi-select, Owner email search, context AI, preview/Accept/Ignore, toast, drawer sync, cancellation, viewport/scroll positioning and original Figma arrow.');
}

// Continue in chat carries the exact row title and visible field label through the real component callbacks.
{
  const { createWorkItemConversation, rememberWorkItemConversation } = load(resolve(root, 'src/work-item-chat.ts'));
  const tableFields = [
    ['app', 'APP'], ['owner', 'Owner'], ['secondary-owner', 'Owner'], ['pd', 'PD'], ['schedule', 'Schedule'],
  ];
  const drawerFields = [
    ['owner', 'Owner'], ['pd', 'PD'], ['schedule', 'Schedule'], ['review-team', 'review team'],
    ['finish-date', 'estimate finish time'], ['review-owner', 'owner'], ['ipmt-leader', 'IPMT Leader'], ['engineer-leader', 'Engineer Leader'],
  ];
  function clickContinue(picker) {
    let writes = 0;
    const props = { ...picker.props, onChange: () => { writes++; } };
    if (props.drawerRef) props.drawerRef.current = new TestNode();
    const renderPicker = mount(picker.type);
    const inputNode = new TestNode();
    let tree;
    function render() {
      tree = renderPicker(props);
      find(tree, node => node.type === 'input').props.ref.current = inputNode;
    }
    render();
    find(tree, node => node.type === 'input').props.onClick?.(); render();
    find(tree, node => node.props.className === 'work-owner-suggestion').props.onClick(); render();
    const cleanup = renderPicker.flushEffects();
    advanceTimers(6000); cleanup(); render();
    const continueButton = find(tree, node => node.type === 'button' && node.props.children === 'Continue in chat');
    assert.ok(continueButton, 'Every recommendation result includes the chat action');
    continueButton.props.onClick();
    assert.equal(writes, 0, 'Continuing in chat does not accept or change the suggested field value');
    assert.equal(pendingTimers.size, 0);
  }
  for (const reuse of [false, true]) for (const [appId, rowId] of [['Epic-0', 1], ['Bug-4', 7]]) {
    for (const [source, fields] of [['table', tableFields], ['drawer', drawerFields]]) {
      for (const [field, label] of fields) {
        setLocation('https://example.test/?view=new-chat');
        const renderRoute = mount(appElement.type);
        let route = renderRoute();
        const initialChat = find(route, byName('NewConversation'));
        initialChat.props.onModeChange(source === 'table' ? 'deep-report' : 'light-app');
        input(initialChat).props.onChange({ target: { value: '旧的会话草稿' } });
        route = renderRoute();
        find(route, byName('Sidebar')).props.onNavigate(appId);
        route = renderRoute();
        const pageComponent = find(route, byName('WorkItemsPage'));
        assert.ok(pageComponent);
        const renderPage = mount(pageComponent.type);
        let page = renderPage(pageComponent.props);
        const selectedCell = () => nodes(page).find(node => byName('WorkItemTableCell')(node) && node.props.item.id === rowId && node.props.field === (source === 'table' ? field : 'owner'));
        const item = selectedCell().props.item;
        const title = item.title;
        const existingConversation = reuse ? createWorkItemConversation(pageComponent.props.application.slug, item, '之前已讨论的项目问题') : undefined;
        if (existingConversation) rememberWorkItemConversation(existingConversation);
        let picker;
        if (source === 'table') {
          selectedCell().props.onEdit(); page = renderPage(pageComponent.props);
          const cell = selectedCell();
          const cellTree = mount(cell.type)(cell.props);
          picker = find(cellTree, node => ['WorkItemAppPicker', 'WorkItemOwnerPicker', 'WorkItemPlanningPicker'].includes(node.type?.name));
        } else {
          find(page, node => node.props['data-work-item-row'] === rowId).props.onClick({ currentTarget: { querySelector: () => new TestNode() } });
          page = renderPage(pageComponent.props);
          const drawer = find(page, byName('WorkItemDrawer'));
          const detail = mount(drawer.type)(drawer.props);
          picker = find(detail, node => ['WorkItemOwnerPicker', 'WorkItemPlanningPicker'].includes(node.type?.name) && (node.props.field ?? node.props.role ?? 'owner') === field);
        }
        const origin = testWindow.location.href;
        const historyCount = historyEntries.length;
        clickContinue(picker);
        route = renderRoute();
        const chat = find(route, byName('NewConversation'));
        const expected = `请帮我根据项目上下文和历史数据，给出 ${title} 的 ${label} 最佳建议值，我的额外要求是：`;
        assert.equal(testWindow.location.pathname + testWindow.location.search, existingConversation ? `/chat/${encodeURIComponent(existingConversation.id)}` : '/?view=new-chat');
        assert.equal(historyEntries.length, historyCount + 1, 'Chat navigation adds a single history entry');
        const editor = find(chat?.props.composer ?? route, byName('RichPromptEditor'));
        assert.equal(editor.props.segments.map(segment => segment.text).join(''), expected, `${source}/${field} uses its own row title and displayed field name`);
        assert.deepEqual(Array.from(editor.props.segments.filter(segment => segment.emphasized), segment => segment.text), [title, label]);
        if (chat) assert.equal(chat.props.mode, 'default', 'A previous special mode does not leak into the new chat');
        if (existingConversation) {
          assert.ok(!chat, 'Reuse opens the existing chat instead of the new-chat screen');
          assert.equal(sentMessages(route)[0].props.text, existingConversation.title, 'Prefill preserves the existing conversation history');
          assert.equal(sentMessages(route).length, 1, 'Prefilling never sends a message');
        }
        assert.equal(find(route, byName('Sidebar')).props.active, 'CodeM');
        const sourceSidebar = find(route, byName('Sidebar')).props;
        const sourceGroups = load(resolve(root, 'src/CodeMSourceNavigation.tsx')).buildCodeMSourceGroups(
          load(resolve(root, 'src/work-item-chat.ts')).getConversationHistory(), sourceSidebar.selectedConversation, sourceSidebar.workItemDraft);
        const sourceGroup = sourceGroups.find(group => group.source.href === `/apps/${pageComponent.props.application.slug}/${item.id}`);
        assert.equal(sourceGroup.source.title, title, 'Every Continue in chat field appears under its source work item');
        assert.ok(sourceGroup.entries.some(entry => existingConversation ? entry.id === existingConversation.id : !entry.conversation && entry.title === expected));
        assert.ok(!find(route, byName('WorkItemsPage')) && !find(route, byName('ReportPreview')) && !find(route, byName('ChatHistory')), 'Only prefill, without auto-sending or opening a report');
        let rangeTarget, collapsed, activeRange;
        const previousCreateRange = testDocument.createRange;
        const previousGetSelection = testWindow.getSelection;
        const range = { selectNodeContents(node) { rangeTarget = node; }, collapse(toStart) { collapsed = toStart; } };
        testDocument.createRange = () => range;
        testWindow.getSelection = () => ({ removeAllRanges() {}, addRange(value) { activeRange = value; } });
        const editorNode = Object.assign(new TestNode(), { style: {}, scrollHeight: 84 });
        editor.props.inputRef.current = editorNode;
        renderRoute.flushLayoutEffects()();
        assert.equal(testDocument.activeElement, editorNode, 'The rich composer receives focus');
        assert.equal(rangeTarget, editorNode);
        assert.equal(activeRange, range);
        assert.equal(collapsed, false, 'Caret lands at the end of the prefilled prompt');
        testDocument.createRange = previousCreateRange;
        testWindow.getSelection = previousGetSelection;
        editor.props.onChange([...editor.props.segments, { text: '优先考虑下周可投入的资源。' }]);
        route = renderRoute();
        const updatedChat = find(route, byName('NewConversation'));
        assert.equal(find(updatedChat?.props.composer ?? route, byName('RichPromptEditor')).props.segments.map(segment => segment.text).join(''), `${expected}优先考虑下周可投入的资源。`);
        const cleanup = renderRoute.flushEffects();
        testWindow.history.go(-1); route = renderRoute();
        assert.equal(testWindow.location.href, origin, 'Back returns directly to the originating table or drawer URL');
        assert.ok(find(route, byName('WorkItemsPage')));
        cleanup();
      }
    }
  }
  assert.equal(pendingTimers.size, 0);
  console.log('Continue in chat checks passed: all 13 table/drawer fields across different rows, new and reused conversations, exact prompt and URL, fresh mode, no auto-send or field mutation, composer focus and caret, editable extra requirements and back navigation.');
}

// The shared history menu includes new chats, old source mappings and saved messages.
{
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { createWorkItemConversation, rememberWorkItemConversation, getConversationHistory, appendWorkItemMessage, subscribeConversationHistory } = load(resolve(root, 'src/work-item-chat.ts'));
  const { ConversationHistoryMenu } = load(resolve(root, 'src/ConversationHistoryMenu.tsx'));
  const { WorkItemAskCodeM } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const storageBefore = new Map(adminStorage);
  const prefix = 'meego:work-item-chat:v1:';
  for (const key of adminStorage.keys()) if (key.startsWith(prefix)) adminStorage.delete(key);
  const item = getWorkItemView('epic').items[0];
  const old = createWorkItemConversation('epic', item, '旧版本创建的会话');
  const withMessages = createWorkItemConversation('epic', item, '另一个保存了消息的会话');
  const latest = createWorkItemConversation('epic', item, '新创建的会话');
  adminStorage.set(`${prefix}${old.workItem.href}`, old.id);
  adminStorage.set(`${prefix}messages:${withMessages.id}`, JSON.stringify(['保存的后续消息']));
  adminStorage.set(`${prefix}history`, '{broken');
  adminStorage.set(`${prefix}/apps/bug/1`, old.id);
  adminStorage.set(`${prefix}messages:missing`, '[]');
  let entries = getConversationHistory();
  assert.equal(entries.filter(entry => entry.id === old.id).length, 1, 'Legacy source mappings are recovered once, even if another mapping is corrupt');
  assert.ok(entries.some(entry => entry.id === withMessages.id), 'Old chats with saved messages are recovered');
  assert.ok(!entries.some(entry => entry.id === 'missing'));

  const renderMenu = mount(ConversationHistoryMenu);
  let selected;
  const props = { selected: latest.id, onSelect: value => { selected = value; }, onClose() {} };
  renderMenu(props);
  const stopMenu = renderMenu.flushEffects();
  rememberWorkItemConversation(latest);
  let menu = renderMenu(props);
  let items = nodes(menu).filter(node => node.props.role === 'menuitem');
  assert.equal(items[0].props.title, latest.title, 'A menu already open receives a newly created chat immediately');
  assert.equal(items[0].props['aria-current'], 'true');
  items[0].props.onClick();
  assert.equal(selected.id, latest.id);
  assert.ok(items.some(node => node.props.title === old.title), 'Creating another chat for the same source preserves the old history entry');
  rememberWorkItemConversation(latest);
  appendWorkItemMessage(latest.id, '继续检查项目进度');
  assert.equal(getConversationHistory().filter(entry => entry.id === latest.id).length, 1, 'Reopening and follow-ups do not duplicate a chat');
  assert.equal(nodes(mount(ConversationHistoryMenu)(props)).filter(node => node.props.role === 'menuitem' && node.props.title === latest.title).length, 1, 'A newly mounted menu restores stored chats');

  // The menu in each Ask CodeM context uses the same persisted history and selection path.
  for (const context of ['work-item', 'wbs']) {
    const renderAsk = mount(WorkItemAskCodeM);
    const askProps = { application: workItemApplications.find(app => app.slug === 'epic'), item, context, triggerRef: { current: null }, onClose() {}, onOpenConversation: value => { selected = value; } };
    let ask = renderAsk(askProps);
    find(ask, node => node.props['aria-label'] === '对话历史').props.onClick();
    ask = renderAsk(askProps);
    const history = find(ask, byName('ConversationHistoryMenu'));
    const list = mount(history.type)(history.props);
    selected = undefined;
    find(list, node => node.props.role === 'menuitem' && node.props.title === latest.title).props.onClick();
    assert.equal(selected.id, latest.id);
  }
  setLocation('https://example.test/chat/project-report');
  const renderRoute = mount(appElement.type);
  let page = renderRoute();
  find(page, node => node.type === 'button' && node.props['aria-label'] === '对话历史').props.onClick(); page = renderRoute();
  const history = find(page, byName('ConversationHistoryMenu'));
  const list = mount(history.type)(history.props);
  find(list, node => node.props.role === 'menuitem' && node.props.title === latest.title).props.onClick(); page = renderRoute();
  assert.equal(testWindow.location.pathname, `/chat/${encodeURIComponent(latest.id)}`);
  assert.equal(sentMessages(page)[0].props.text, latest.title);
  assert.equal(sentMessages(page)[1].props.text, '继续检查项目进度');
  assert.ok(!find(page, node => node.props.children === '示例对话'));
  assert.ok(!find(page, node => node.props.label === '复制会话链接'));

  let notifications = 0;
  const stopSubscription = subscribeConversationHistory(() => notifications++);
  const today = new Date(2026, 8, 17, 12);
  adminStorage.set(`${prefix}history`, JSON.stringify([
    { id: latest.id, updatedAt: new Date(2026, 8, 17, 10).getTime() },
    { id: latest.id, updatedAt: 0 },
    { id: old.id, updatedAt: new Date(2026, 8, 15, 10).getTime() },
    { id: withMessages.id, updatedAt: 0 },
    { id: 'missing', updatedAt: today.getTime() },
    { id: old.id, updatedAt: 'invalid' },
  ]));
  testWindow.dispatchEvent(Object.assign(new Event('storage'), { key: `${prefix}history` }));
  assert.equal(notifications, 1, 'Cross-tab history changes notify open menus');
  assert.equal(getConversationHistory(today).find(entry => entry.id === latest.id).group, '今天');
  assert.equal(getConversationHistory(today).find(entry => entry.id === old.id).group, '本周');
  assert.equal(getConversationHistory(today).find(entry => entry.id === withMessages.id).group, '更早');
  assert.equal(getConversationHistory(today).filter(entry => entry.id === latest.id).length, 1);
  testWindow.dispatchEvent(Object.assign(new Event('storage'), { key: 'unrelated-setting' }));
  assert.equal(notifications, 1);
  stopSubscription(); stopMenu();
  adminStorage.clear();
  for (const [key, value] of storageBefore) adminStorage.set(key, value);
  console.log('Conversation history checks passed: legacy recovery, new chats, deduplication, stored follow-ups, recency groups, open menu updates, cross-tab updates, main/Ask/WBS selection and removed sample/copy UI.');
}

// Sent messages retain their exact content, emphasis and source link after reload.
{
  const { SentMessage } = load(resolve(root, 'src/SentMessage.tsx'));
  const { workItemPromptSegments, promptText } = load(resolve(root, 'src/prompt-content.ts'));
  const source = { title: 'Unified Project Workspace', href: '/apps/epic/1' };
  const prompt = promptText(workItemPromptSegments(source.title, 'Schedule')) + '\n优先考虑联调时间。';
  const bubble = SentMessage({ text: prompt, workItem: source });
  assert.equal(textContent(bubble), prompt, 'Rendering emphasis preserves the original prompt and line breaks');
  assert.equal(bubble.props['data-message-role'], 'user');
  assert.equal(find(bubble, node => node.type === 'a').props.href, source.href);
  assert.equal(find(bubble, node => node.type === 'a').props.children, source.title);
  assert.equal(find(bubble, node => node.type === 'strong').props.children, 'Schedule');
  for (const text of ['本周可能延期的任务有哪些', '<script>alert(1)</script>\n保留原始文本', '长文本 '.repeat(300)]) {
    const plain = SentMessage({ text, workItem: source });
    assert.equal(textContent(plain), text);
    assert.equal(nodes(plain).length, 1, 'Ordinary messages remain text without invented markup');
  }
  console.log('Sent message checks passed: exact plain/rich text, retained line breaks, emphasized work item and field, source navigation and long text.');
}

// Local AI replies follow the requested field, preserve follow-up context and share the Figma completion row.
{
  const { createMockChatReply } = load(resolve(root, 'src/work-item-chat-replies.ts'));
  const { AssistantMessage, ReplyCompletion } = load(resolve(root, 'src/AssistantMessage.tsx'));
  const { workItemPromptSegments, promptText } = load(resolve(root, 'src/prompt-content.ts'));
  const source = { title: 'Unified Project Workspace', href: '/apps/epic/1' };
  const prompt = field => promptText(workItemPromptSegments(source.title, field));
  const fields = [
    ['Owner', 'owner', 'Nannan'], ['owner', 'review-owner', 'Maikou'],
    ['IPMT Leader', 'ipmt-leader', 'Lei'], ['Engineer Leader', 'engineer-leader', 'Nannan'],
    ['PD', 'pd', '5 PD'], ['Schedule', 'schedule', '2026-03-04'],
    ['review team', 'review-team', 'IPMT 团队'], ['estimate finish time', 'finish-date', '2026-03-08'],
    ['APP', 'app', '飞书项目'],
  ];
  for (const [field, scenario, value] of fields) {
    const question = prompt(field);
    const reply = createMockChatReply(question, source);
    assert.equal(reply.scenario, scenario);
    assert.ok(reply.introduction.includes(source.title));
    assert.ok(reply.recommendation.includes(value), `${field} provides a relevant recommendation`);
    assert.ok(reply.sections.length >= 2 && reply.sections.every(section => section.items.length >= 2));
    assert.ok(reply.conclusion);
    const component = AssistantMessage({ prompt: question, workItem: source });
    assert.equal(component.props['data-reply-scenario'], scenario);
    assert.ok(textContent(component).length > 300, `${field} provides a substantive response, not the previous short summary`);
    const completion = find(component, byName('ReplyCompletion'));
    assert.equal(completion.props.durationSeconds, reply.durationSeconds);
    assert.match(textContent(ReplyCompletion(completion.props)), /^已完成（\d+ 分 \d+ 秒）$/);
    assert.equal(JSON.stringify(createMockChatReply(question, JSON.parse(JSON.stringify(source)))), JSON.stringify(reply), 'Replies and illustrative duration remain stable after refresh');
  }
  const reviewSource = { title: 'V3.8 · Collaboration Update', href: '/apps/version/1' };
  assert.ok(createMockChatReply(prompt('review team'), reviewSource).recommendation.includes('质量保障团队'), 'Team recommendations follow the source application');
  const appSource = { title: 'Open Integration Ecosystem', href: '/apps/epic/6' };
  assert.ok(createMockChatReply(prompt('APP'), appSource).recommendation.includes('开放平台'), 'APP advice follows the selected item');
  const extra = '请额外预留联调时间。\n保留核心验收范围。';
  const withExtra = createMockChatReply(prompt('PD') + extra, source);
  assert.equal(withExtra.requirement.text, extra);
  assert.ok(withExtra.requirement.response.includes('联调与回归'));
  const followup = createMockChatReply('优先考虑下周可投入的资源。', source, [prompt('Owner'), prompt('PD')]);
  assert.equal(followup.scenario, 'pd', 'An unqualified follow-up retains the most recent field rather than reverting to the first question');
  assert.ok(followup.requirement.response.includes('可投入时间'));
  const switched = createMockChatReply(prompt('Schedule'), source, [prompt('PD')]);
  assert.equal(switched.scenario, 'schedule', 'An explicit new field switches the reply scenario');
  assert.equal(createMockChatReply('继续细化一下', source, [prompt('PD'), prompt('Schedule')]).scenario, 'schedule');
  assert.equal(createMockChatReply('生成一份延期风险预告', source).scenario, 'risk');
  assert.equal(createMockChatReply('根据项目目标拆分阶段和任务', source).scenario, 'breakdown');
  assert.equal(createMockChatReply('梳理下一步行动', source).scenario, 'general');

  const complete = ReplyCompletion({ durationSeconds: 192 });
  assert.equal(textContent(complete), '已完成（3 分 12 秒）');
  assert.ok(!find(complete, node => node.type === 'button'), 'The completion label is informational');
  const image = find(complete, node => node.type === 'img');
  const assetDir = resolve(root, 'public/assets/figma/chat-completion');
  const provenance = load(resolve(assetDir, 'provenance.json'));
  assert.equal(provenance.sourceNode, '103:33211');
  assert.equal(image.props.src, '/assets/figma/chat-completion/divider.svg');
  for (const asset of provenance.assets) {
    const original = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.ok(readFileSync(resolve(root, 'dist/assets/figma/chat-completion', asset.file)).equals(original));
  }
  console.log('AI reply checks passed: nine field scenarios, contextual values, detailed explanations, completion time, follow-up context/switching, extra requirements, refresh stability and original Figma divider.');
}

// A submitted work-item draft and an Ask CodeM chat can both be resumed after reload.
{
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { createWorkItemConversation, findWorkItemConversation, rememberWorkItemConversation, loadWorkItemMessages } = load(resolve(root, 'src/work-item-chat.ts'));
  const source = { slug: 'version', item: getWorkItemView('version').items[3] };
  const appId = workItemApplications.find(app => app.slug === source.slug).id;
  setLocation(`https://example.test/apps/${source.slug}/${source.item.id}`);
  const renderRoute = mount(appElement.type);
  let route = renderRoute();
  find(route, byName('WorkItemsPage')).props.onContinueInChat(source, 'Owner');
  route = renderRoute();
  const newChat = find(route, byName('NewConversation'));
  const editor = find(newChat.props.composer, byName('RichPromptEditor'));
  const firstPrompt = editor.props.segments.map(segment => segment.text).join('');
  assert.equal(findWorkItemConversation(source), undefined, 'A draft alone does not create a conversation');
  editor.props.onSubmit(); route = renderRoute();
  const created = findWorkItemConversation(source);
  assert.ok(created);
  const chatUrl = testWindow.location.href;
  assert.equal(sentMessages(route)[0].props.text, firstPrompt);
  assert.equal(find(sentMessages(route)[0].type(sentMessages(route)[0].props), node => node.type === 'a').props.href, `/apps/${source.slug}/${source.item.id}`);
  assert.ok(!find(route, byName('ReportPreview')), 'Sending a work-item draft creates its own chat');
  find(route, byName('Sidebar')).props.onNavigate(appId); route = renderRoute();
  find(route, byName('WorkItemsPage')).props.onContinueInChat(source, 'PD'); route = renderRoute();
  assert.equal(testWindow.location.href, chatUrl, 'Another field of the same item reuses the created URL');
  const resumedEditor = find(route, byName('RichPromptEditor'));
  const followup = resumedEditor.props.segments.map(segment => segment.text).join('') + '请考虑联调时间。';
  resumedEditor.props.onChange([{ text: followup }]); route = renderRoute();
  assert.equal(find(route, node => node.props.className === 'send-button').props.disabled, false);
  find(route, byName('RichPromptEditor')).props.onSubmit(); route = renderRoute();
  assert.equal(testWindow.location.href, chatUrl, 'Sending in the resumed chat retains its URL');
  assert.equal(sentMessages(route)[0].props.text, firstPrompt, 'Sending a follow-up retains previous messages');
  assert.equal(sentMessages(route)[1].props.text, followup);
  const responses = nodes(route).filter(byName('AssistantMessage'));
  assert.equal(responses.length, 2, 'Each sent work-item message has its own reply');
  assert.equal(responses[0].type(responses[0].props).props['data-reply-scenario'], 'owner');
  assert.equal(responses[1].type(responses[1].props).props['data-reply-scenario'], 'pd');
  assert.equal(find(route, node => node.props.className === 'send-button').props.disabled, true);
  assert.deepEqual(Array.from(loadWorkItemMessages(created.id)), [followup]);

  const refreshed = mount(appElement.type);
  route = refreshed();
  const cleanup = refreshed.flushEffects();
  assert.equal(sentMessages(route)[1].props.text, followup);
  const restoredReplies = nodes(route).filter(byName('AssistantMessage'));
  assert.equal(restoredReplies.length, 2);
  assert.equal(restoredReplies[1].type(restoredReplies[1].props).props['data-reply-scenario'], 'pd', 'Refreshing retains the reply for the sent follow-up');
  find(route, byName('Sidebar')).props.onNavigate(appId); route = refreshed();
  find(route, byName('WorkItemsPage')).props.onContinueInChat({ ...source, item: { ...source.item, title: '更新后的工作项标题' } }, 'Schedule'); route = refreshed();
  assert.equal(testWindow.location.href, chatUrl, 'Refreshing and renaming an item preserve the identity-based association');
  assert.ok(find(route, byName('RichPromptEditor')).props.segments.some(segment => segment.text === '更新后的工作项标题'));
  assert.equal(sentMessages(route).length, 2, 'A repeated prefill does not append to chat history');
  assert.equal(findWorkItemConversation({ slug: 'bug', item: { ...source.item } }), undefined, 'The same numeric ID and title in another application is unrelated');
  assert.equal(findWorkItemConversation({ ...source, item: { ...source.item, id: 5 } }), undefined, 'Another row with the same title is unrelated');
  cleanup();

  const askSource = { slug: 'sprint', item: getWorkItemView('sprint').items[4] };
  const ask = createWorkItemConversation(askSource.slug, askSource.item, '检查任务依赖，找出冲突和遗漏', 'wbs');
  setLocation(`https://example.test/chat/${encodeURIComponent(ask.id)}`);
  const direct = mount(appElement.type);
  direct(); const stopDirect = direct.flushEffects();
  assert.equal(findWorkItemConversation(askSource).id, ask.id, 'A directly opened Ask CodeM URL is remembered');
  const newer = createWorkItemConversation(askSource.slug, askSource.item, '本周可能延期的任务有哪些');
  rememberWorkItemConversation(newer);
  assert.equal(findWorkItemConversation(askSource).id, newer.id, 'Use the most recently opened chat when the item has several chats');
  stopDirect();

  const key = `meego:work-item-chat:v1:/apps/${askSource.slug}/${askSource.item.id}`;
  testWindow.localStorage.setItem(key, created.id);
  assert.equal(findWorkItemConversation(askSource), undefined, 'A corrupt cross-item mapping is rejected');
  testWindow.localStorage.setItem(key, 'missing-chat');
  assert.equal(findWorkItemConversation(askSource), undefined, 'An unresolved mapping falls back to a new draft');
  const storage = testWindow.localStorage;
  testWindow.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  rememberWorkItemConversation(ask);
  assert.equal(findWorkItemConversation(askSource).id, ask.id, 'Unavailable storage still supports reuse in this session');
  testWindow.localStorage = { getItem: key => storage.getItem(key), setItem() { throw new Error('quota'); } };
  rememberWorkItemConversation(newer);
  assert.equal(findWorkItemConversation(askSource).id, newer.id, 'A failed write uses the newest in-memory association instead of stale storage');
  testWindow.localStorage = storage;
  console.log('Work-item chat reuse checks passed: first send, same-item reuse, editable prefill, explicit follow-up, retained history, reload, renamed items, source isolation, Ask/WBS URLs, latest chat, invalid storage and storage fallback.');
}

// Personal YBR entries share the work-item page without moving into the Apps group.
{
  const { personalApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  setLocation('https://example.test/apps/epic');
  const renderRoute = mount(appElement.type);
  let route = renderRoute();
  const cleanup = renderRoute.flushEffects();
  const sidebarComponent = () => find(route, byName('Sidebar'));
  const renderSidebar = mount(sidebarComponent().type);
  const sidebar = () => renderSidebar(sidebarComponent().props);
  const personalRows = () => nodes(sidebar()).filter(node => node.type === 'button' && node.props.className?.includes('personal-row'));
  assert.equal(personalRows().length, 2);
  assert.equal(nodes(sidebar()).filter(node => node.type === 'button' && node.props.className?.includes('app-row')).length, 6);
  for (const entry of personalApplications) {
    const button = personalRows().find(node => find(node, child => child.type === 'span' && child.props.children === entry.label));
    assert.equal(find(button, byName('Icon')).props.name, entry.icon, 'The original sidebar icon is retained');
    button.props.onClick(); route = renderRoute();
    assert.equal(testWindow.location.pathname, `/apps/${entry.slug}`);
    const page = find(route, byName('WorkItemsPage'));
    const table = mount(page.type)(page.props);
    assert.equal(find(table, node => node.type === 'h1').props.children, entry.label, 'Table title matches its navigation label exactly');
    const selected = personalRows().filter(node => node.props['aria-current'] === 'page');
    assert.equal(selected.length, 1);
    assert.ok(find(selected[0], node => node.props.children === entry.label));
    assert.ok(selected[0].props.className.includes('active'));
    assert.ok(nodes(sidebar()).filter(node => node.props.className?.includes('app-row')).every(node => !node.props['aria-current']));
    find(sidebar(), node => node.props['aria-label'] === '搜索导航').props.onChange({ target: { value: entry.label } });
    assert.equal(personalRows().length, 1, 'Searching keeps the selected personal route available');
    assert.equal(personalRows()[0].props['aria-current'], 'page');
    find(sidebar(), node => node.props['aria-label'] === '搜索导航').props.onChange({ target: { value: '' } });
  }
  testWindow.history.go(-1); route = renderRoute();
  assert.equal(find(route, byName('WorkItemsPage')).props.application.label, '2025 YBR');
  assert.equal(sidebarComponent().props.active, '2025 YBR');
  testWindow.history.go(-1); route = renderRoute();
  assert.equal(find(route, byName('WorkItemsPage')).props.application.slug, 'epic');
  testWindow.history.go(1); route = renderRoute();
  assert.equal(find(route, byName('WorkItemsPage')).props.application.label, '2025 YBR');
  cleanup();
  console.log('Personal YBR checks passed: sidebar clicks, exact page titles, original icons, selected states, search, separate navigation groups and back/forward history.');
}

// Settings is an independent route and its enabled filter reflects agent actions.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  for (const path of ['/settings', '/settings/', '/settings?view=new-chat#report']) {
    setLocation(`https://example.test${path}`);
    const direct = mount(appElement.type)();
    assert.ok(find(direct, byName('SettingsPage')), `${path} opens settings directly`);
    assert.equal(find(direct, byName('Sidebar')).props.active, 'Settings');
    assert.ok(!find(direct, byName('ReportPreview')) && !find(direct, byName('NewConversation')) && !find(direct, byName('WorkItemsPage')));
  }
  setLocation('https://example.test/?view=new-chat&source=settings');
  const renderRoute = mount(appElement.type);
  let route = renderRoute();
  input(find(route, byName('NewConversation'))).props.onChange({ target: { value: '保留会话草稿' } });
  route = renderRoute();
  const cleanup = renderRoute.flushEffects();
  const sidebarComponent = () => find(route, byName('Sidebar'));
  const renderSidebar = mount(sidebarComponent().type);
  const sidebar = () => renderSidebar(sidebarComponent().props);
  const settingsEntry = () => find(sidebar(), node => node.props.className?.includes('settings-nav-row'));
  assert.ok(settingsEntry());
  assert.equal(find(settingsEntry(), byName('NavGlyph')).props.icon, 'sidebar/settings');
  settingsEntry().props.onClick(); route = renderRoute();
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/settings?source=settings');
  assert.equal(settingsEntry().props['aria-current'], 'page');
  assert.ok(find(route, byName('SettingsPage')));
  const entryCount = historyEntries.length;
  settingsEntry().props.onClick(); route = renderRoute();
  assert.equal(historyEntries.length, entryCount, 'Selecting the current route does not add history');
  find(sidebar(), node => node.props['aria-label'] === '搜索导航').props.onChange({ target: { value: 'settings' } });
  assert.ok(settingsEntry(), 'Settings supports case-insensitive navigation search');
  assert.ok(!find(sidebar(), node => node.props.className === 'no-results'));
  testWindow.history.go(-1); route = renderRoute();
  assert.ok(find(route, byName('NewConversation')));
  input(find(route, byName('NewConversation'))).props.onChange({ target: { value: '保留会话草稿' } });
  route = renderRoute();
  testWindow.history.go(1); route = renderRoute();
  assert.ok(find(route, byName('SettingsPage')));
  sidebarComponent().props.onNavigate('Epic-0'); route = renderRoute();
  assert.equal(testWindow.location.pathname, '/apps/epic');
  assert.ok(find(route, byName('WorkItemsPage')));
  sidebarComponent().props.onNavigate('Settings'); route = renderRoute();
  sidebarComponent().props.onNavigate('CodeM'); route = renderRoute();
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?source=settings&view=new-chat');
  assert.equal(input(find(route, byName('NewConversation'))).props.value, '保留会话草稿');
  cleanup();
  for (const path of ['/settings', '/settings/']) assert.ok(rewrites.some(rule => rule.source === path && rule.destination === '/index.html'));

  const render = mount(SettingsPage);
  const props = { notify() {} };
  const page = () => render(props);
  const cards = () => nodes(page()).filter(node => node.type === 'article');
  const button = text => find(page(), node => node.type === 'button' && node.props.children === text);
  const action = label => find(page(), node => node.props['aria-label'] === label);
  // Exercise the retained agent grid through its hidden entry, outside the default AI flow.
  find(page(), node => node.props.id === 'settings-agents-tab').props.onClick();
  assert.equal(cards().length, 7);
  const tabs = nodes(page()).filter(node => node.props.role === 'tab');
  assert.equal(tabs.length, 8);
  assert.equal(tabs.filter(node => !node.props.disabled).length, 3);
  assert.equal(tabs.find(node => node.props['aria-selected']).props.children, '智能体');
  assert.ok(tabs.filter(node => node.props.disabled).every(node => !node.props.onClick));
  button('已启用').props.onClick();
  assert.equal(cards().length, 6);
  action('停用 Planner').props.onClick();
  assert.equal(cards().length, 5);
  button('全部').props.onClick();
  assert.equal(cards().length, 7);
  assert.ok(action('启用 Planner'));
  action('启用 Planner').props.onClick();
  action('启用 Radar').props.onClick();
  button('已启用').props.onClick();
  assert.equal(cards().length, 7);
  for (const name of ['Planner', 'Architect', 'Reviewer', 'Tester', 'Sheriff', 'Release', 'Radar']) action(`停用 ${name}`).props.onClick();
  assert.equal(cards().length, 0);
  assert.ok(find(page(), node => node.props.role === 'status' && node.props.children === '暂无已启用的智能体'));
  const professional = () => find(page(), node => node.type === 'input' && node.props.type === 'checkbox');
  professional().props.onChange({ target: { checked: true } });
  assert.equal(professional().props.checked, true);
  assert.ok(page().props.className.includes('is-pro-mode'));
  assert.equal(find(page(), node => node.type === 'h1').props.children, 'Settings');
  assert.ok(textContent(find(page(), node => node.props.className === 'settings-header')).includes('Pro Mode'));
  assert.ok(action('Version') && action('New') && action('Ask CodeM'));
  const codeWorkspace = () => find(page(), byName('SettingsCodeWorkspace'));
  assert.equal(button('Code').props['aria-pressed'], true, 'Pro Mode opens in Code');
  assert.equal(codeWorkspace().props.active, true, 'Enabling Pro Mode mounts and opens the Code workspace');
  assert.equal(nodes(page()).filter(node => node.props.role === 'tab').length, 0);
  button('GUI').props.onClick();
  assert.equal(nodes(page()).filter(node => node.props.role === 'tab').length, 8, 'GUI retains all category tabs');
  assert.equal(find(page(), node => node.props.role === 'tab' && node.props['aria-selected']).props.children, '智能体');
  assert.equal(find(page(), node => node.props.id === 'settings-agents-panel').props['aria-labelledby'], 'settings-agents-tab');
  assert.equal(button('GUI').props['aria-pressed'], true, 'GUI remains manually selectable');
  for (const view of ['GUI', 'Split', 'Code']) {
    button(view).props.onClick();
    for (const candidate of ['Code', 'GUI', 'Split']) assert.equal(button(candidate).props['aria-pressed'], candidate === view);
  }
  assert.equal(codeWorkspace().props.active, true, 'Code opens the configuration workspace');
  assert.equal(nodes(page()).filter(node => node.props.role === 'tab').length, 0, 'Code uses the file tabs in place of GUI categories');
  assert.ok(!find(page(), node => node.props.id === 'settings-agents-panel'));
  button('GUI').props.onClick();
  assert.equal(codeWorkspace().props.active, false, 'Returning to GUI keeps the code workspace mounted to preserve open files');
  assert.equal(nodes(page()).filter(node => node.props.role === 'tab').length, 8);
  button('Code').props.onClick();
  assert.equal(codeWorkspace().props.active, true);
  const renderCode = mount(codeWorkspace().type);
  const code = () => renderCode(codeWorkspace().props);
  assert.equal(find(code(), node => node.props.role === 'tab').props.children[1].props.children, '空间信息');
  find(code(), node => node.props['aria-label'] === '关闭 空间信息').props.onClick();
  assert.equal(nodes(code()).filter(node => node.props.role === 'tab').length, 0, 'Closing the last file clears the file strip');
  const workspaceToggle = () => find(code(), node => node.props.className === 'settings-code-workspace-toggle');
  workspaceToggle().props.onClick();
  assert.equal(workspaceToggle().props['aria-expanded'], false);
  assert.equal(find(code(), node => node.props.id === 'settings-code-tree').props.hidden, true);
  assert.ok(action('下载配置') && action('运行配置'));
  assert.ok(find(page(), node => node.type === 'button' && textContent(node) === 'Publish'));
  action('Ask CodeM').props.onClick();
  assert.equal(find(page(), byName('WorkItemAskCodeM')).props.context, 'settings');
  action('Ask CodeM').props.onClick();
  professional().props.onChange({ target: { checked: false } });
  assert.ok(!find(page(), node => node.props['aria-label'] === 'Pro Mode 工具栏'));
  assert.equal(nodes(page()).filter(node => node.props.role === 'tab').length, 8);
  assert.equal(cards().length, 0, 'Mode changes preserve the enabled filter and agent states');
  for (const previousView of ['GUI', 'Split']) {
    professional().props.onChange({ target: { checked: true } });
    button(previousView).props.onClick();
    professional().props.onChange({ target: { checked: false } });
    assert.equal(codeWorkspace().props.active, false);
    professional().props.onChange({ target: { checked: true } });
    assert.equal(button('Code').props['aria-pressed'], true, `Reopening Pro Mode resets ${previousView} to Code`);
    assert.equal(codeWorkspace().props.active, true);
    professional().props.onChange({ target: { checked: false } });
  }
  action('New').props.onClick();
  assert.ok(find(page(), byName('CreateAgentDialog')), 'New retains the existing create-agent action');
  find(page(), byName('CreateAgentDialog')).props.onClose();

  const proAssets = JSON.parse(readFileSync(resolve(root, 'public/assets/settings/pro-mode/provenance.json'), 'utf8'));
  assert.equal(proAssets.nodeId, '135:65665');
  for (const asset of proAssets.assets) {
    const original = readFileSync(resolve(root, 'public/assets/settings/pro-mode', asset.file));
    assert.equal(original.length, asset.bytes);
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.ok(original.equals(readFileSync(resolve(root, 'dist/assets/settings/pro-mode', asset.file))));
  }
  console.log('Pro Mode header checks passed: default Code on every activation, retained GUI tabs, Code/GUI/Split selection, Ask CodeM/New integration, preserved agent state and original Figma assets.');

  const exported = JSON.parse(readFileSync(resolve(root, 'public/assets/settings/provenance.json'), 'utf8'));
  assert.equal(exported.assets.length, 15);
  for (const asset of exported.assets) {
    const bytes = readFileSync(resolve(root, `public${asset.path}`));
    assert.equal(bytes.length, asset.sizeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    if (asset.path.endsWith('.png')) {
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(bytes.readUInt32BE(16), 128);
      assert.equal(bytes.readUInt32BE(20), 128);
    } else assert.ok(bytes.toString().includes('<svg'));
  }
  console.log('Settings checks passed: direct routes, sidebar selection/search, history, draft preservation, inactive tabs, enabled filtering/toggling, empty state and 15 original Figma assets.');
}

// Basic information follows the Figma content and remains mounted across tab / Pro Mode changes.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { SettingsBasicInfo } = load(resolve(root, 'src/SettingsBasicInfo.tsx'));
  const messages = [];
  const props = { notify: message => messages.push(message), onOpenConversation() {} };
  const renderPage = mount(SettingsPage);
  const page = () => renderPage(props);
  const tab = label => find(page(), node => node.props.role === 'tab' && node.props.children === label);
  assert.equal(tab('基本信息').props['aria-selected'], true, 'Settings opens basic information by default');
  assert.equal(tab('基本信息').props.tabIndex, 0);
  const basicComponent = () => find(page(), byName('SettingsBasicInfo'));
  const render = mount(SettingsBasicInfo);
  const panel = () => render(basicComponent().props);
  const control = label => find(panel(), node => node.props['aria-label'] === label);
  const button = label => find(panel(), node => node.type === 'button' && textContent(node) === label);
  const field = id => find(panel(), node => node.props.id === id);
  const trigger = { focus() {} };
  const popup = () => {
    const component = find(panel(), byName('BasicMenu'));
    return mount(component.type)(component.props);
  };
  const option = label => find(popup(), node => node.type === 'button' && textContent(node) === label);
  assert.equal(panel().props['aria-labelledby'], tab('基本信息').props.id);
  assert.equal(panel().props.hidden, false);
  assert.deepEqual(nodes(panel()).filter(byName('BasicGroup')).map(node => node.props.title), ['基础信息', '空间访问设置', '导航配置', '语言配置', '基准时区', '业务线配置', '数据管理']);
  field('settings-basic-space-name').props.onChange({ target: { value: '测试空间' } });
  tab('AI 配置').props.onClick();
  assert.equal(basicComponent().props.active, false);
  assert.equal(panel().props.hidden, true);
  tab('AI 配置').props.onKeyDown({ key: 'Home', preventDefault() {} });
  assert.equal(field('settings-basic-space-name').props.value, '测试空间', 'Name edits survive tab switching');
  control('按姓名搜索').props.onChange({ target: { value: '李梅' } });
  assert.deepEqual(nodes(panel()).filter(node => node.props.className === 'settings-basic-person').map(textContent), ['李梅antinuclear@outlook.com']);
  control('按姓名搜索').props.onChange({ target: { value: '没有匹配' } });
  assert.ok(textContent(panel()).includes('未找到匹配的审批人'));
  control('按姓名搜索').props.onChange({ target: { value: '' } });
  control('李梅的更多操作').props.onClick({ currentTarget: trigger });
  option('移除审批人').props.onClick();
  assert.ok(textContent(panel()).includes('共 1 人'));
  button('添加').props.onClick({ currentTarget: trigger });
  option('李梅').props.onClick();
  assert.ok(textContent(panel()).includes('共 2 人'));
  const checkboxes = () => nodes(panel()).filter(node => node.type === 'input' && node.props.type === 'checkbox');
  checkboxes()[0].props.onChange({ target: { checked: true } });
  assert.equal(checkboxes()[0].props.checked, true);
  assert.equal(checkboxes()[1].props.checked, false, 'Language settings toggle independently');
  control('基准时区').props.onClick({ currentTarget: trigger });
  option('(GMT+09:00) 日本标准时间-东京').props.onClick();
  assert.equal(textContent(control('基准时区')), '(GMT+09:00) 日本标准时间-东京');
  control('搜索业务线名称').props.onChange({ target: { value: 'video' } });
  assert.deepEqual(nodes(panel()).filter(node => node.props.className?.startsWith('settings-basic-tag')).map(textContent), ['Video']);
  button('添加业务线').props.onClick();
  assert.equal(control('搜索业务线名称').props.value, '');
  control('业务线名称').props.onChange({ target: { value: 'Design' } });
  control('业务线名称').props.onKeyDown({ key: 'Enter' });
  assert.ok(textContent(panel()).includes('Design'));
  control('编辑业务线 Design').props.onClick();
  control('业务线名称').props.onChange({ target: { value: 'Discard' } });
  control('业务线名称').props.onKeyDown({ key: 'Escape' });
  assert.ok(textContent(panel()).includes('Design') && !textContent(panel()).includes('Discard'), 'Escape cancels a business line rename');
  control('删除空间').props.onClick();
  assert.equal(messages.at(-1), '删除空间暂未接入', 'Destructive server actions are not simulated');
  control('基准时区').props.onClick({ currentTarget: trigger });
  find(page(), node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
  assert.equal(panel().props.hidden, true);
  assert.ok(!find(panel(), byName('BasicMenu')), 'The popup closes when switching to Code view');
  const provenance = JSON.parse(readFileSync(resolve(root, 'public/assets/figma/settings-basic/provenance.json'), 'utf8'));
  for (const asset of provenance.assets) {
    const source = readFileSync(resolve(root, 'public/assets/figma/settings-basic', asset.file));
    assert.equal(createHash('sha256').update(source).digest('hex'), asset.sha256);
    assert.ok(source.equals(readFileSync(resolve(root, 'dist/assets/figma/settings-basic', asset.file))), `${asset.file} is bundled without modification`);
  }
  console.log('Basic settings checks passed: tabs, retained edits, search, approvers, language controls, timezone, business line editing, Pro Mode isolation and original Figma assets.');
}

// AI configuration shares the existing Settings layout and stores independent workspace preferences.
{
  const savedStorage = new Map(adminStorage);
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { SettingsAiConfig } = load(resolve(root, 'src/SettingsAiConfig.tsx'));
  const { settingsAiStorageKey, availableSpaceAgents, loadSettingsAiPreferences } = load(resolve(root, 'src/settings-ai.ts'));
  adminStorage.delete(settingsAiStorageKey);
  const messages = [];
  const props = { notify: message => messages.push(message), onOpenConversation() {} };
  const renderPage = mount(SettingsPage);
  const page = () => renderPage(props);
  const tab = label => find(page(), node => node.props.role === 'tab' && node.props.children === label);
  assert.equal(tab('智能体').props.hidden, true, 'The legacy agent entry is hidden');
  assert.equal(tab('基本信息').props['aria-selected'], true, 'The initial tab is basic information');
  tab('AI 配置').props.onClick();
  assert.equal(tab('AI 配置').props['aria-selected'], true);
  assert.equal(tab('AI 配置').props.tabIndex, 0);
  assert.ok(!find(page(), node => node.props.id === 'settings-agents-panel'));
  const render = mount(SettingsAiConfig);
  const panel = () => render(find(page(), byName('SettingsAiConfig')).props);
  const controls = () => nodes(panel()).filter(byName('SettingsSwitch'));
  const rows = () => nodes(panel()).filter(node => node.props['data-space-agent']);
  const popup = () => find(panel(), node => node.props.role === 'menu');
  const manage = id => find(rows().find(row => row.props['data-space-agent'] === id), node => node.props.className === 'settings-ai-more');
  const rowAction = (id, label) => find(rows().find(row => row.props['data-space-agent'] === id), node => node.type === 'button' && textContent(node) === label);
  assert.equal(panel().props.id, tab('AI 配置').props['aria-controls']);
  assert.equal(panel().props['aria-labelledby'], tab('AI 配置').props.id);
  assert.deepEqual(controls().map(control => control.props.label), ['启用AI工作建议', '支持智能体在本空间内独立执行任务']);
  assert.ok(controls().every(control => control.props.checked), 'Both screenshot settings default to enabled');
  for (const control of controls()) {
    const element = mount(control.type)(control.props);
    assert.equal(element.props.role, 'switch');
    assert.equal(element.props['aria-checked'], true);
    assert.ok(find(panel(), node => node.props.id === element.props['aria-describedby']), 'Each switch has an accessible explanation');
  }
  controls()[0].props.onChange();
  assert.equal(controls()[0].props.checked, false);
  assert.equal(controls()[1].props.checked, true, 'The two settings toggle independently');
  controls()[1].props.onChange();
  const reloaded = mount(SettingsAiConfig)(props);
  assert.ok(nodes(reloaded).filter(byName('SettingsSwitch')).every(control => !control.props.checked), 'Preferences survive a fresh page mount');
  assert.deepEqual(rows().map(row => row.props['data-space-agent']), ['platform', 'foundation']);
  assert.ok(textContent(rows()[0]).includes('Reviewer'));
  assert.ok(!find(panel(), node => node.type === 'input' || node.props.role === 'combobox'), 'Existing rows are read-only by default');
  assert.ok(!find(panel(), node => node.type === 'h2'), 'The duplicate AI heading is removed');
  assert.ok(nodes(panel()).filter(byName('AgentAvatar')).every(node => node.props.size === 40), 'Avatars are enlarged to 40px');
  const authorizationComponent = () => find(panel(), byName('SettingsAiAuthorization'));
  const renderAuthorization = mount(authorizationComponent().type);
  const authorization = () => renderAuthorization(authorizationComponent().props);
  const authorizedRows = () => nodes(authorization()).filter(node => node.props['data-authorized-space']);
  const authorizeAdd = () => find(authorization(), node => node.props.className === 'settings-ai-authorize-add');
  const authorizationMenu = () => find(authorization(), node => node.props.role === 'menu');
  assert.ok(textContent(authorization()).includes('AI 应用空间授权'));
  assert.ok(textContent(authorization()).includes('授权后，相应空间内的 AI 助手应用可以通过您的身份运行'));
  assert.deepEqual(authorizedRows().map(row => row.props['data-authorized-space']), ['meego']);
  assert.ok(textContent(authorizedRows()[0]).includes('Meego已授权'));
  assert.equal(find(authorizedRows()[0], node => node.type === 'img').props.src, '/assets/figma/admin/logo.svg');
  const authorizationTrigger = Object.assign(new TestNode(), { getBoundingClientRect: () => ({ left: 320, right: 900, top: 500, bottom: 540 }) });
  authorizeAdd().props.ref.current = authorizationTrigger;
  authorizeAdd().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(authorizeAdd().props['aria-expanded'], true);
  assert.deepEqual(nodes(authorizationMenu()).filter(node => node.props.role === 'menuitem').map(textContent), ['Lark Office', 'Aily'], 'Already authorized spaces are excluded');
  const authorizationItems = [new TestNode(), new TestNode()];
  const authorizationMenuNode = Object.assign(new TestNode(authorizationItems), { querySelector: () => authorizationItems[0], querySelectorAll: () => authorizationItems });
  authorizationMenu().props.ref.current = authorizationMenuNode;
  const stopAuthorizationMenu = renderAuthorization.flushLayoutEffects();
  assert.equal(testDocument.activeElement, authorizationItems[0]);
  authorizationMenu().props.onKeyDown({ key: 'End', preventDefault() {} });
  assert.equal(testDocument.activeElement, authorizationItems[1]);
  authorizationMenu().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.ok(!authorizationMenu());
  assert.equal(testDocument.activeElement, authorizationTrigger);
  stopAuthorizationMenu();
  authorizeAdd().props.onClick();
  authorizationMenu().props.ref.current = authorizationMenuNode;
  const stopAuthorizationOutside = renderAuthorization.flushLayoutEffects();
  testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: new TestNode() }));
  assert.ok(!authorizationMenu(), 'The space picker dismisses on outside clicks');
  stopAuthorizationOutside();
  const agentsBeforeAuthorization = JSON.stringify(loadSettingsAiPreferences().agents);
  authorizeAdd().props.onClick();
  find(authorizationMenu(), node => node.props['aria-label'] === '授权 Lark Office').props.onClick();
  assert.ok(!authorizationMenu());
  assert.deepEqual(authorizedRows().map(row => row.props['data-authorized-space']), ['meego', 'lark-office']);
  authorizationComponent().props.onAuthorize('lark-office');
  assert.equal(JSON.stringify(loadSettingsAiPreferences().authorizedSpaces), '["meego","lark-office"]', 'Adding the same authorization never creates duplicates');
  assert.equal(JSON.stringify(loadSettingsAiPreferences().agents), agentsBeforeAuthorization);
  assert.equal(loadSettingsAiPreferences().workSuggestions, false, 'Authorization changes preserve the other AI settings');
  const restoredAuthorizationProps = find(mount(SettingsAiConfig)(props), byName('SettingsAiAuthorization')).props;
  assert.equal(JSON.stringify(restoredAuthorizationProps.authorizedSpaces), '["meego","lark-office"]', 'Authorized spaces survive reload');
  authorizeAdd().props.onClick();
  find(authorizationMenu(), node => node.props['aria-label'] === '授权 Aily').props.onClick();
  assert.equal(authorizedRows().length, 3);
  assert.equal(authorizeAdd().props['aria-disabled'], true);
  authorizeAdd().props.onClick();
  assert.ok(!authorizationMenu(), 'The picker does not reopen after all available spaces are authorized');
  assert.ok(textContent(rows()[0]).includes('CodeM·平台业务空间'));
  assert.ok(textContent(rows()[1]).includes('CodeM·Foundation产研协同空间'));
  for (const agent of availableSpaceAgents) {
    assert.ok(existsSync(resolve(root, `public${agent.icon}`)) && existsSync(resolve(root, `dist${agent.icon}`)), 'Source and display avatars reuse local exported assets');
  }
  const trigger = new TestNode();
  trigger.getBoundingClientRect = () => ({ left: 420, right: 452, top: 340, bottom: 372 });
  manage('platform').props.onKeyDown({ key: 'ArrowDown', currentTarget: trigger, preventDefault() {} });
  assert.equal(manage('platform').props['aria-expanded'], true);
  assert.equal(manage('platform').props['aria-controls'], popup().props.id);
  const menuItem = new TestNode();
  const menuNode = new TestNode([menuItem]);
  menuNode.querySelector = () => menuItem;
  popup().props.ref.current = menuNode;
  const stopMenu = render.flushLayoutEffects();
  assert.equal(testDocument.activeElement, menuItem, 'Opening the menu focuses its action');
  popup().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(popup(), undefined);
  assert.equal(testDocument.activeElement, trigger, 'Escape restores focus to the trigger');
  stopMenu();
  manage('platform').props.onClick({ currentTarget: trigger });
  assert.deepEqual(nodes(popup()).filter(node => node.props.role === 'menuitem').map(textContent), ['编辑智能体', '停用智能体', '移除智能体']);
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '停用智能体').props.onClick();
  assert.equal(popup(), undefined);
  assert.ok(textContent(rows()[0]).includes('已停用'));
  assert.ok(!textContent(rows()[1]).includes('已停用'), 'Availability changes affect only the selected agent');
  assert.equal(JSON.stringify(loadSettingsAiPreferences().disabledAgents), '["platform"]');
  assert.ok(textContent(mount(SettingsAiConfig)(props)).includes('已停用'), 'Agent availability survives reload');
  manage('platform').props.onClick({ currentTarget: trigger });
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '启用智能体').props.onClick();
  assert.ok(!textContent(rows()[0]).includes('已停用'));
  manage('platform').props.onClick({ currentTarget: trigger });
  popup().props.ref.current = menuNode;
  const stopOutside = render.flushLayoutEffects();
  testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: new TestNode() }));
  assert.equal(popup(), undefined, 'Clicking outside dismisses the menu');
  stopOutside();

  const detail = () => find(panel(), byName('AgentDetailDrawer'));
  const rowOpener = Object.assign(new TestNode(), { isConnected: true });
  const viewAgent = id => find(rows().find(row => row.props['data-space-agent'] === id), node => node.props.id === `settings-ai-open-${id}`);
  viewAgent('platform').props.onClick({ currentTarget: rowOpener });
  assert.equal(detail().props.agent.name, 'Reviewer');
  assert.equal(detail().props.agent.memberId, 'planner');
  assert.equal(viewAgent('platform').props['aria-expanded'], true);
  const { AgentDetailDrawer } = load(resolve(root, 'src/AgentDetailDrawer.tsx'));
  const renderDetail = mount(AgentDetailDrawer);
  const drawerTree = renderDetail(detail().props);
  const drawerNode = new TestNode();
  find(drawerTree, node => node.props.role === 'dialog').props.ref.current = drawerNode;
  const stopDetail = renderDetail.flushEffects();
  assert.equal(testDocument.activeElement, drawerNode, 'Opening a row focuses the existing detail drawer');
  assert.equal(find(drawerTree, node => node.props.id === 'agent-detail-name').props.children, 'Reviewer');
  assert.equal(find(drawerTree, node => node.props['aria-label'] === '编辑 Reviewer').props.children, '编辑');
  assert.equal(find(drawerTree, node => node.props.className === 'agent-detail-heatmap-grid').props.children.length, 196);
  testDocument.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.ok(!detail());
  assert.equal(testDocument.activeElement, rowOpener, 'Closing details restores focus to the opening row');
  stopDetail();
  rows()[1].props.onClick({ target: new TestNode(), currentTarget: rowOpener });
  assert.equal(detail().props.agent.id, 'foundation', 'Clicking non-control row content opens its details');
  detail().props.onToggle();
  assert.equal(detail().props.enabled, false);
  assert.equal(find(rows()[1], byName('AgentAvatar')).props.src, '/assets/settings/radar.png');
  detail().props.onToggle();
  detail().props.onConfigure();
  assert.ok(detail().props.editor, 'Configuring activates an editor inside the same drawer');
  assert.ok(!find(panel(), node => node.type === 'input'), 'Drawer editing never activates table inputs');
  const drawer = () => mount(AgentDetailDrawer)(detail().props);
  assert.ok(!find(drawer(), node => node.props.className === 'agent-detail-description'), 'Description is replaced by source');
  assert.ok(textContent(drawer()).includes('CodeM·Foundation产研协同空间'));
  assert.ok(find(drawer(), node => node.props.className === 'agent-detail-edit-actions agent-edit-actions'));
  assert.ok(!find(drawer(), node => node.props['aria-label'] === '关闭智能体详情'), 'Cancel and confirm replace the top-right close button while editing');
  const originalFoundation = JSON.stringify(loadSettingsAiPreferences().agents.find(agent => agent.id === 'foundation'));
  detail().props.editor.onNameChange('架构协作助手');
  const drawerSourceTrigger = Object.assign(new TestNode(), { getBoundingClientRect: () => ({ left: 500, right: 820, top: 600, bottom: 632, width: 320 }) });
  detail().props.editor.source.props.onClick({ currentTarget: drawerSourceTrigger });
  find(panel(), node => node.props.role === 'option' && textContent(node).includes('服务端研发')).props.onClick();
  assert.ok(textContent(detail().props.editor.source).includes('CodeM·服务端研发'));
  detail().props.editor.avatar.props.onClick({ currentTarget: trigger });
  find(avatarChoices(panel()), node => node.props['aria-label'] === 'Tester 形象').props.onClick();
  find(avatarChoices(panel()), node => node.props['aria-label'] === '粉色背景').props.onClick();
  assert.equal(JSON.stringify(loadSettingsAiPreferences().agents.find(agent => agent.id === 'foundation')), originalFoundation, 'Editing drawer fields never writes unconfirmed values');
  assert.ok(textContent(rows()[1]).includes('Designer'), 'The table keeps committed data while drawer drafts change');
  detail().props.editor.onCancel();
  assert.ok(detail() && !detail().props.editor, 'Cancel returns the drawer to read-only without closing');
  assert.equal(JSON.stringify(loadSettingsAiPreferences().agents.find(agent => agent.id === 'foundation')), originalFoundation);
  detail().props.onConfigure();
  assert.equal(detail().props.editor.name, 'Designer');
  assert.ok(textContent(detail().props.editor.source).includes('CodeM·Foundation产研协同空间'));
  assert.equal(find(detail().props.editor.avatar, byName('AgentAvatar')).props.src, '/assets/settings/architect.png');
  detail().props.editor.onNameChange('架构协作助手');
  detail().props.editor.source.props.onClick({ currentTarget: drawerSourceTrigger });
  find(panel(), node => node.props.role === 'option' && textContent(node).includes('服务端研发')).props.onClick();
  detail().props.editor.avatar.props.onClick({ currentTarget: trigger });
  find(avatarChoices(panel()), node => node.props['aria-label'] === 'Tester 形象').props.onClick();
  find(avatarChoices(panel()), node => node.props['aria-label'] === '粉色背景').props.onClick();
  find(drawer(), node => node.type === 'button' && textContent(node) === '确认').props.onClick();
  assert.ok(!detail().props.editor && !find(panel(), byName('AgentAvatarChoices')));
  assert.equal(detail().props.agent.name, '架构协作助手');
  assert.equal(detail().props.agent.spaceId, 'backend');
  assert.equal(detail().props.agent.memberId, 'tester');
  assert.equal(detail().props.agent.avatarBackground, '#FE2B98');
  assert.ok(textContent(rows()[1]).includes('架构协作助手') && textContent(rows()[1]).includes('CodeM·服务端研发'));
  assert.equal(loadSettingsAiPreferences().agents.find(agent => agent.id === 'foundation').name, '架构协作助手', 'Confirm commits all drawer fields and updates the table');
  detail().props.onConfigure();
  detail().props.editor.onNameChange('不可保存的草稿');
  const renderEditingDrawer = mount(AgentDetailDrawer);
  renderEditingDrawer(detail().props);
  const stopEditingDrawer = renderEditingDrawer.flushEffects();
  testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: new TestNode() }));
  assert.ok(detail().props.editor, 'Outside clicks do not discard an active drawer draft');
  testDocument.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape', isComposing: true }));
  assert.ok(detail().props.editor, 'Escape during IME composition keeps the drawer draft');
  testDocument.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.ok(detail() && !detail().props.editor, 'Escape cancels editing but keeps details open');
  assert.equal(detail().props.agent.name, '架构协作助手');
  stopEditingDrawer();
  detail().props.onClose();
  manage('platform').props.onClick({ currentTarget: trigger });
  rows()[0].props.onClick({ target: Object.assign(new TestNode(), { closest: () => trigger }), currentTarget: rowOpener });
  assert.ok(!detail(), 'Menu clicks do not bubble into opening the row');
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '编辑智能体').props.onClick();
  assert.ok(!popup());
  const existingInput = () => find(rows()[0], node => node.type === 'input');
  assert.equal(existingInput().props.value, 'Reviewer');
  const editingFocus = new TestNode();
  existingInput().props.ref.current = editingFocus;
  render.flushLayoutEffects()();
  assert.equal(testDocument.activeElement, editingFocus, 'Edit focuses the selected row name');
  rows()[0].props.onClick({ target: new TestNode(), currentTarget: rowOpener });
  assert.ok(!detail(), 'An editable row does not open details while interacting with fields');
  existingInput().props.onChange({ target: { value: 'Reviewer（新）' } });
  existingInput().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {} });
  assert.ok(existingInput(), 'IME confirmation does not prematurely finish editing');
  rows()[0].props.onKeyDown({ key: 'Escape', nativeEvent: { isComposing: true }, preventDefault() {}, stopPropagation() {} });
  assert.ok(existingInput(), 'IME cancellation does not discard the row draft');
  assert.ok(!manage('platform'), 'Cancel and confirm replace the more button');
  assert.ok(rowAction('platform', '取消') && rowAction('platform', '确认'));
  assert.equal(loadSettingsAiPreferences().agents[0].name, 'Reviewer', 'Row changes remain uncommitted');
  const beforeRowEdit = JSON.stringify(loadSettingsAiPreferences().agents[0]);
  find(rows()[0], node => node.props.role === 'combobox').props.onClick({ currentTarget: drawerSourceTrigger });
  find(panel(), node => node.props.role === 'option' && textContent(node).includes('服务端研发')).props.onClick();
  find(rows()[0], node => node.props.className === 'settings-ai-avatar-trigger').props.onClick({ currentTarget: trigger });
  find(avatarChoices(panel()), node => node.props['aria-label'] === 'Sheriff 形象').props.onClick();
  rowAction('platform', '取消').props.onClick();
  assert.ok(!existingInput() && manage('platform'));
  assert.equal(JSON.stringify(loadSettingsAiPreferences().agents[0]), beforeRowEdit, 'Cancel restores name, avatar and source together');
  assert.ok(textContent(rows()[0]).includes('CodeM·平台业务空间'));
  assert.equal(find(rows()[0], byName('AgentAvatar')).props.src, '/assets/settings/planner.png');
  manage('platform').props.onClick({ currentTarget: trigger });
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '编辑智能体').props.onClick();
  existingInput().props.onChange({ target: { value: '平台协作智能体' } });
  rowAction('platform', '确认').props.onClick();
  assert.ok(!existingInput(), 'Confirm returns the row to read-only');
  assert.equal(loadSettingsAiPreferences().agents[0].name, '平台协作智能体');
  manage('platform').props.onClick({ currentTarget: trigger });
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '编辑智能体').props.onClick();
  existingInput().props.onChange({ target: { value: 'Reviewer' } });
  rowAction('platform', '确认').props.onClick();

  const addAgent = () => find(panel(), node => node.type === 'button' && textContent(node) === '添加智能体').props.onClick();
  addAgent();
  const cancelledId = rows().at(-1).props['data-space-agent'];
  assert.equal(rowAction(cancelledId, '确认').props.disabled, true, 'An empty row cannot be confirmed');
  rowAction(cancelledId, '取消').props.onClick();
  assert.equal(rows().length, 2, 'Cancel removes an unconfirmed new row');
  assert.ok(!loadSettingsAiPreferences().agents.some(agent => agent.id === cancelledId));
  addAgent();
  assert.equal(rows().length, 3, 'Adding an agent inserts a draft row immediately');
  const addedId = rows()[2].props['data-space-agent'];
  const addedRow = () => rows().find(row => row.props['data-space-agent'] === addedId);
  const nameInput = () => find(addedRow(), node => node.type === 'input');
  const spaceSelect = () => find(addedRow(), node => node.props.role === 'combobox');
  assert.equal(nameInput().props.value, '');
  assert.equal(spaceSelect().props['aria-expanded'], false);
  assert.ok(textContent(spaceSelect()).includes('选择 CodeM 空间'));
  const focusedName = new TestNode();
  nameInput().props.ref.current = focusedName;
  render.flushLayoutEffects()();
  assert.equal(testDocument.activeElement, focusedName, 'The new row starts ready to enter a name');
  nameInput().props.onChange({ target: { value: '研发协作助手' } });
  const sourceTrigger = Object.assign(new TestNode(), { getBoundingClientRect: () => ({ left: 500, right: 820, top: 600, bottom: 632, width: 320 }) });
  spaceSelect().props.onClick({ currentTarget: sourceTrigger });
  const sourceMenu = () => find(panel(), node => node.props.role === 'listbox');
  assert.equal(spaceSelect().props['aria-expanded'], true);
  assert.equal(nodes(sourceMenu()).filter(node => node.props.role === 'option').length, 4);
  const key = key => spaceSelect().props.onKeyDown({ key, currentTarget: sourceTrigger, preventDefault() {}, stopPropagation() {} });
  key('End'); key('Enter');
  assert.equal(sourceMenu(), undefined);
  assert.equal(testDocument.activeElement, sourceTrigger, 'Selecting a space restores trigger focus');
  assert.ok(textContent(spaceSelect()).includes('CodeM·服务端研发'));
  spaceSelect().props.onClick({ currentTarget: sourceTrigger });
  key('Home'); key('Escape');
  assert.equal(sourceMenu(), undefined, 'Escape closes the custom dropdown without changing the selection');
  assert.ok(textContent(spaceSelect()).includes('CodeM·服务端研发'));
  assert.equal(nameInput().props.value, '研发协作助手', 'Selecting a space preserves the edited name');
  assert.ok(!loadSettingsAiPreferences().agents.some(agent => agent.id === addedId), 'A new row is not stored before confirmation');
  const avatarButton = () => find(addedRow(), node => node.props['aria-label'] === '编辑 研发协作助手 头像');
  const avatarTrigger = new TestNode();
  avatarButton().props.onClick({ currentTarget: avatarTrigger });
  assert.equal(avatarButton().props['aria-expanded'], true);
  find(avatarChoices(panel()), node => node.props['aria-label'] === 'Tester 形象').props.onClick();
  find(avatarChoices(panel()), node => node.props['aria-label'] === '粉色背景').props.onClick();
  const rowAvatar = () => find(addedRow(), byName('AgentAvatar'));
  assert.equal(rowAvatar().props.src, '/assets/settings/tester.png');
  assert.equal(rowAvatar().props.background, '#FE2B98');
  nameInput().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {} });
  assert.ok(!nameInput(), 'Enter confirms name editing');
  const restoredRow = find(mount(SettingsAiConfig)(props), node => node.props['data-space-agent'] === addedId);
  assert.ok(textContent(restoredRow).includes('研发协作助手') && textContent(restoredRow).includes('CodeM·服务端研发'));
  assert.ok(!find(restoredRow, node => node.type === 'input' || node.props.role === 'combobox'), 'Confirmed entries reload as read-only');
  viewAgent(addedId).props.onClick({ currentTarget: rowOpener });
  assert.equal(detail().props.agent.name, '研发协作助手');
  assert.equal(detail().props.agent.memberId, 'tester');
  assert.equal(detail().props.agent.avatarBackground, '#FE2B98', 'Custom row details share the edited appearance');
  detail().props.onClose();
  manage(addedId).props.onClick({ currentTarget: trigger });
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '编辑智能体').props.onClick();
  assert.ok(find(mount(rowAvatar().type)(rowAvatar().props), node => node.type === 'img' && node.props.src === '/assets/settings/animated/tester.webp'), 'Row avatars reuse native animated WebP rendering');
  assert.equal(nameInput().props.value, '研发协作助手', 'Avatar edits preserve the name');
  assert.ok(textContent(spaceSelect()).includes('CodeM·服务端研发'), 'Avatar edits preserve the source');
  assert.equal(loadSettingsAiPreferences().agents.at(-1).memberId, 'tester');
  assert.equal(loadSettingsAiPreferences().agents.at(-1).avatarBackground, '#FE2B98');
  spaceSelect().props.onClick({ currentTarget: sourceTrigger });
  assert.ok(!find(panel(), byName('AgentAvatarChoices')), 'Switching field editors closes the previous popup');
  key('Escape');
  rowAction(addedId, '确认').props.onClick();
  manage(addedId).props.onClick({ currentTarget: trigger });
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '停用智能体').props.onClick();
  assert.equal(rowAvatar().props.src, '/assets/settings/radar.png');
  manage(addedId).props.onClick({ currentTarget: trigger });
  find(popup(), node => node.props.role === 'menuitem' && textContent(node) === '启用智能体').props.onClick();
  assert.equal(rowAvatar().props.src, '/assets/settings/tester.png', 'Re-enabling restores the configured avatar');
  assert.equal(rowAvatar().props.background, '#FE2B98');
  addAgent();
  assert.equal(rows().length, 4);
  assert.equal(new Set(rows().map(row => row.props['data-space-agent'])).size, 4, 'Each new row has an independent identity');
  assert.ok(textContent(rows()[0]).includes('Reviewer'), 'Adding rows preserves existing entries');
  assert.ok(!find(addedRow(), node => node.type === 'input'), 'Only one row is editable at a time');
  rowAction(rows().at(-1).props['data-space-agent'], '取消').props.onClick();
  assert.equal(rows().length, 3);
  manage(addedId).props.onClick({ currentTarget: trigger });
  const removeItem = new TestNode();
  const menuItems = [menuItem, new TestNode(), removeItem];
  menuNode.querySelectorAll = () => menuItems;
  popup().props.ref.current = menuNode;
  menuItem.focus();
  popup().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(testDocument.activeElement, menuItems[1]);
  popup().props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(testDocument.activeElement, removeItem, 'All three actions are keyboard reachable');
  popup().props.onKeyDown({ key: 'Home', preventDefault() {} });
  assert.equal(testDocument.activeElement, menuItem);
  find(popup(), node => textContent(node) === '停用智能体' && node.type === 'button').props.onClick();
  manage(addedId).props.onClick({ currentTarget: trigger });
  find(popup(), node => textContent(node) === '移除智能体' && node.type === 'button').props.onClick();
  assert.equal(rows().length, 2);
  assert.equal(addedRow(), undefined);
  assert.ok(!loadSettingsAiPreferences().disabledAgents.includes(addedId), 'Removing an agent cleans up its disabled state');
  assert.ok(!loadSettingsAiPreferences().agents.some(agent => agent.id === addedId), 'Removed rows stay removed after reload');
  const addButton = find(panel(), node => node.type === 'button' && textContent(node) === '添加智能体');
  const addFocus = new TestNode();
  addButton.props.ref.current = addFocus;
  for (const row of rows()) {
    manage(row.props['data-space-agent']).props.onClick({ currentTarget: trigger });
    find(popup(), node => textContent(node) === '移除智能体' && node.type === 'button').props.onClick();
  }
  assert.equal(rows().length, 0);
  assert.equal(testDocument.activeElement, addFocus, 'Removing the last row focuses the add button');
  assert.ok(find(panel(), node => node.props.role === 'status'));
  assert.equal(loadSettingsAiPreferences().agents.length, 0, 'An intentionally empty list stays empty');
  addAgent();
  assert.equal(rows().length, 1, 'The empty list can be repopulated');

  const professional = () => find(page(), node => node.type === 'input' && node.props.type === 'checkbox');
  professional().props.onChange({ target: { checked: true } });
  assert.ok(!find(page(), byName('SettingsAiConfig')), 'Code view hides the GUI settings');
  find(page(), node => node.type === 'button' && node.props.children === 'GUI').props.onClick();
  assert.ok(find(page(), byName('SettingsAiConfig')), 'Returning to GUI retains the AI tab');
  professional().props.onChange({ target: { checked: false } });
  tab('AI 配置').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(tab('基本信息').props['aria-selected'], true, 'Tab navigation wraps to basic information, skipping the hidden agent entry');
  for (const key of ['ArrowLeft', 'Home', 'End']) tab('AI 配置').props.onKeyDown({ key, preventDefault() {} });
  assert.equal(tab('AI 配置').props['aria-selected'], true);

  adminStorage.set(settingsAiStorageKey, '{broken');
  assert.equal(loadSettingsAiPreferences().workSuggestions, true, 'Malformed saved settings recover defaults');
  adminStorage.set(settingsAiStorageKey, JSON.stringify({ workSuggestions: 'false', independentTasks: false, disabledAgents: ['platform', 'platform', 'unknown'] }));
  const restoredLegacy = loadSettingsAiPreferences();
  assert.equal(restoredLegacy.workSuggestions, true);
  assert.equal(restoredLegacy.independentTasks, false);
  assert.equal(JSON.stringify(restoredLegacy.disabledAgents), '["platform"]', 'Saved values are validated and unknown agents are ignored');
  assert.equal(JSON.stringify(restoredLegacy.agents.map(agent => agent.id)), '["platform","foundation"]', 'Existing settings retain the original agents when upgrading');
  assert.equal(JSON.stringify(restoredLegacy.authorizedSpaces), '["meego"]', 'Existing saved settings receive the screenshot authorization default');
  adminStorage.set(settingsAiStorageKey, JSON.stringify({ authorizedSpaces: ['meego', 'unknown', 'meego', 'aily', null] }));
  assert.equal(JSON.stringify(loadSettingsAiPreferences().authorizedSpaces), '["meego","aily"]', 'Unknown and duplicate authorization entries are ignored');
  adminStorage.set(settingsAiStorageKey, JSON.stringify({ authorizedSpaces: [] }));
  assert.equal(loadSettingsAiPreferences().authorizedSpaces.length, 0, 'An intentionally empty authorization list stays empty');
  adminStorage.set(settingsAiStorageKey, JSON.stringify({ agents: [{ id: 'saved-custom', name: '之前的智能体', spaceId: 'backend' }] }));
  const oldRow = loadSettingsAiPreferences().agents[0];
  assert.equal(oldRow.name, '之前的智能体');
  assert.equal(oldRow.spaceId, 'backend');
  assert.equal(oldRow.memberId, 'reviewer', 'Existing rows receive an editable avatar without losing their settings');
  const storage = testWindow.localStorage;
  testWindow.localStorage = { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } };
  const renderWithoutStorage = mount(SettingsAiConfig);
  const noStorage = () => renderWithoutStorage(props);
  nodes(noStorage()).filter(byName('SettingsSwitch'))[0].props.onChange();
  assert.equal(nodes(noStorage()).filter(byName('SettingsSwitch'))[0].props.checked, false, 'A failed save keeps controls usable in the current page');
  assert.ok(messages.at(-1).includes('无法保存'));
  testWindow.localStorage = storage;
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Settings AI checks passed: explicit row and in-drawer confirm/cancel, isolated name/source/avatar drafts, source display, new-row cancellation, persistence and legacy settings, keyboard/IME, enablement, focus/dismissal and Pro Mode/tab continuity. Visual acceptance remains manual.');
}

// Agent cards open independent details; enablement stays shared with the grid.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { AgentDetailDrawer } = load(resolve(root, 'src/AgentDetailDrawer.tsx'));
  const { draftForMember } = load(resolve(root, 'src/settings-agents.ts'));
  const renderPage = mount(SettingsPage);
  const notices = [];
  const page = () => renderPage({ notify: message => notices.push(message) });
  const detail = () => find(page(), byName('AgentDetailDrawer'));
  const card = id => find(page(), node => node.props['data-settings-agent-card'] === id);
  const opener = Object.assign(new TestNode(), { isConnected: true });
  const open = id => find(card(id), node => node.props.className === 'settings-agent-open').props.onClick({ currentTarget: opener });
  // Exercise the retained agent grid through its hidden entry, outside the default AI flow.
  find(page(), node => node.props.id === 'settings-agents-tab').props.onClick();
  assert.ok(!detail());
  find(card('planner'), node => node.props['aria-label'] === '配置 Planner').props.onClick();
  assert.ok(!detail(), 'Card actions do not also open details');
  assert.equal(find(page(), byName('CreateAgentDialog')).props.initialValues.id, 'planner');
  find(page(), byName('CreateAgentDialog')).props.onClose();
  for (const id of ['planner', 'architect', 'reviewer', 'tester', 'sheriff', 'release', 'radar']) {
    open(id);
    assert.equal(detail().props.agent.id, id);
    assert.equal(detail().props.enabled, id !== 'radar');
    const tree = mount(AgentDetailDrawer)(detail().props);
    assert.equal(find(tree, node => node.props.id === 'agent-detail-name').props.children, detail().props.agent.name);
    assert.equal(find(tree, byName('AgentAvatar')).props.src, `/assets/settings/agent-detail/avatar-${id === 'radar' ? 'radar' : id}.png`);
    assert.equal(find(card(id), node => node.props.className === 'settings-agent-open').props['aria-expanded'], true);
  }
  open('planner');
  detail().props.onToggle();
  assert.equal(detail().props.enabled, false);
  assert.equal(find(card('planner'), byName('AgentAvatar')).props.src, '/assets/settings/radar.png');
  assert.equal(find(mount(AgentDetailDrawer)(detail().props), byName('AgentAvatar')).props.src, '/assets/settings/agent-detail/avatar-radar.png');
  detail().props.onToggle();
  assert.equal(detail().props.enabled, true);
  detail().props.onClose();
  assert.ok(!detail());
  assert.equal(testDocument.activeElement, opener, 'Closing restores focus to the opening card');
  open('architect');
  find(page(), node => node.props.className === 'settings-action settings-create-agent').props.onClick();
  assert.ok(!detail(), 'The create form and detail drawer cannot overlap');
  const custom = { ...draftForMember('release'), name: '发布协调员', description: '跟踪发布审批', avatarBackground: '#243CC7' };
  find(page(), byName('CreateAgentDialog')).props.onCreate(custom);
  open('custom-agent-1');
  assert.equal(detail().props.agent.name, custom.name);
  const customTree = mount(AgentDetailDrawer)(detail().props);
  assert.equal(find(customTree, byName('AgentAvatar')).props.background, custom.avatarBackground);
  assert.equal(find(customTree, byName('AgentAvatar')).props.src, '/assets/settings/agent-detail/avatar-release.png');
  assert.ok(!find(customTree, node => node.props.className === 'agent-detail-description'));
  assert.ok(textContent(find(customTree, node => node.props.className === 'agent-detail-source')).includes('CodeM·前端研发'));

  const closed = [];
  const renderDetail = mount(AgentDetailDrawer);
  const tree = renderDetail({ ...detail().props, onClose: restoreFocus => closed.push(restoreFocus) });
  const inside = new TestNode();
  const drawer = new TestNode([inside]);
  find(tree, node => node.props.role === 'dialog').props.ref.current = drawer;
  const cleanup = renderDetail.flushEffects();
  assert.equal(testDocument.activeElement, drawer);
  // Event.target is read-only; define it explicitly for the outside-click simulation.
  const click = target => {
    const event = new Event('pointerdown');
    Object.defineProperty(event, 'target', { value: target });
    testDocument.dispatchEvent(event);
  };
  click(inside);
  click(Object.assign(new TestNode(), { closest: () => new TestNode() }));
  assert.equal(closed.length, 0, 'Inside interaction and switching cards do not dismiss details');
  click(new TestNode());
  assert.equal(closed.pop(), false, 'Outside dismissal leaves focus with the clicked control');
  testDocument.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.equal(closed.length, 1);
  cleanup();
  click(new TestNode());
  assert.equal(closed.length, 1, 'Unmount removes outside and keyboard listeners');
  assert.equal(find(tree, node => node.props.className === 'agent-detail-heatmap-grid').props.children.length, 196);
  assert.equal(nodes(tree).filter(node => node.props.className === 'agent-detail-task').length, 7);
  const exported = JSON.parse(readFileSync(resolve(root, 'public/assets/settings/agent-detail/provenance.json'), 'utf8'));
  for (const asset of exported.assets) {
    const bytes = readFileSync(resolve(root, `public${asset.path}`));
    assert.equal(bytes.length, asset.sizeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    if (asset.name.startsWith('avatar-')) {
      assert.equal(bytes.readUInt32BE(16), 160);
      assert.equal(bytes.readUInt32BE(20), 160);
    }
  }
  console.log('Agent detail checks passed: seven cards, custom profile, shared enablement, modal separation, focus/escape/outside dismissal, heatmap/tasks and original 2x assets.');
}

// Initially disabled Radar saves an awake avatar independently of its sleeping display.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { AgentDetailDrawer } = load(resolve(root, 'src/AgentDetailDrawer.tsx'));
  const { CreateAgentDialog } = load(resolve(root, 'src/CreateAgentDialog.tsx'));
  const render = mount(SettingsPage);
  const page = () => render({ notify() {} });
  const card = () => find(page(), node => node.props['data-settings-agent-card'] === 'radar');
  const cardAvatar = () => find(card(), byName('AgentAvatar')).props;
  const detail = () => find(page(), byName('AgentDetailDrawer'));
  const detailAvatar = () => find(mount(AgentDetailDrawer)(detail().props), byName('AgentAvatar')).props;
  const modal = () => find(page(), byName('CreateAgentDialog'));
  // Exercise the retained agent grid through its hidden entry, outside the default AI flow.
  find(page(), node => node.props.id === 'settings-agents-tab').props.onClick();
  assert.equal(cardAvatar().src, '/assets/settings/radar.png');
  find(card(), node => node.props.className === 'settings-agent-open').props.onClick({ currentTarget: new TestNode() });
  assert.equal(detailAvatar().src, '/assets/settings/agent-detail/avatar-radar.png');
  detail().props.onConfigure();
  const savedAvatar = modal().props.initialValues.avatar;
  assert.notEqual(savedAvatar, cardAvatar().src, 'The disabled placeholder must not become Radar\'s saved avatar');
  const form = mount(CreateAgentDialog)(modal().props);
  assert.equal(find(form, node => node.props.className === 'create-agent-avatar').props.src, savedAvatar);
  modal().props.onClose();
  find(card(), node => node.props['aria-label'] === '启用 Radar').props.onClick();
  assert.equal(cardAvatar().src, savedAvatar);
  assert.equal(detailAvatar().src, '/assets/settings/agent-detail/avatar-release.png');
  detail().props.onToggle();
  assert.equal(cardAvatar().src, '/assets/settings/radar.png');
  detail().props.onToggle();
  assert.equal(cardAvatar().src, savedAvatar, 'Repeated enablement restores the original active avatar');
  detail().props.onConfigure();
  modal().props.onSave({ ...modal().props.initialValues, memberId: 'tester', avatar: '/assets/settings/tester.png', avatarBackground: '#243CC7' });
  detail().props.onToggle();
  detail().props.onToggle();
  assert.equal(cardAvatar().src, '/assets/settings/tester.png', 'A configured avatar takes precedence over the initial default');
  assert.equal(detailAvatar().src, '/assets/settings/agent-detail/avatar-tester.png');
  assert.equal(cardAvatar().background, '#243CC7');
  assert.equal(detailAvatar().background, '#243CC7');
  assert.equal(detail().props.agent.id, 'radar');
  assert.equal(detail().props.agent.name, 'Radar');
  console.log('Radar avatar checks passed: saved awake default, disabled placeholder, card/drawer enablement, configuration prefill and custom avatar restoration.');
}

// The create-agent form uses a native modal and only adds cards after confirmation.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { CreateAgentDialog } = load(resolve(root, 'src/CreateAgentDialog.tsx'));
  const { agentAvatarColors, codemSpaces, defaultAgentInstructions } = load(resolve(root, 'src/settings-agents.ts'));
  const notices = [];
  const renderPage = mount(SettingsPage);
  const page = () => renderPage({ notify: message => notices.push(message) });
  const cards = () => nodes(page()).filter(node => node.type === 'article');
  const modal = () => find(page(), byName('CreateAgentDialog'));
  const trigger = className => find(page(), node => node.props.className === className);
  // Exercise the retained agent grid through its hidden entry, outside the default AI flow.
  find(page(), node => node.props.id === 'settings-agents-tab').props.onClick();
  assert.equal(cards().length, 7);
  assert.ok(!modal());
  trigger('settings-action settings-create-agent').props.onClick();
  assert.ok(modal());
  assert.equal(trigger('settings-action settings-create-agent').props['aria-expanded'], true);
  modal().props.onClose();
  assert.equal(cards().length, 7);
  assert.ok(!modal());
  trigger('settings-action settings-new').props.onClick();
  const render = mount(CreateAgentDialog);
  const tree = () => render(modal().props);
  const field = id => find(tree(), node => node.props.id === id);
  const form = () => find(tree(), node => node.type === 'form');
  const reviewer = tree();
  assert.equal(reviewer.type, 'dialog');
  assert.equal(field('create-agent-name').props.value, 'Reviewer');
  assert.equal(field('create-agent-description').props.value, '辅助架构设计与技术评审');
  assert.equal(field('create-agent-instructions').props.value, defaultAgentInstructions);
  assert.equal(field('create-agent-space-label').props.children, '选择 CodeM 空间');
  assert.equal(field('create-agent-space').props['aria-expanded'], false);
  assert.equal(find(reviewer, node => node.props.name === 'agent-source').props.defaultChecked, true);

  const previousFocus = testDocument.activeElement;
  const opener = Object.assign(new TestNode(), { isConnected: true });
  let shown = 0, closed = 0;
  const dialogNode = Object.assign(new TestNode(), { showModal() { shown++; }, close() { closed++; } });
  testDocument.activeElement = opener;
  reviewer.props.ref.current = dialogNode;
  const cleanup = render.flushEffects();
  assert.equal(shown, 1, 'showModal provides native focus containment and an inert background');
  assert.equal(testDocument.activeElement, dialogNode);

  const nameNode = new TestNode();
  field('create-agent-name').props.ref.current = nameNode;
  field('create-agent-name').props.onChange({ target: { value: '   ' } });
  form().props.onSubmit({ preventDefault() {} });
  assert.equal(cards().length, 7);
  assert.equal(field('create-agent-name').props['aria-invalid'], true);
  assert.equal(testDocument.activeElement, nameNode);
  field('create-agent-name').props.onChange({ target: { value: '自定义审查助手' } });
  field('create-agent-instructions').props.onChange({ target: { value: '所有变更先由负责人确认。' } });
  const spaceNode = new TestNode();
  field('create-agent-space').props.ref.current = spaceNode;
  field('create-agent-space').props.onClick();
  const spaceOptions = () => nodes(tree()).filter(node => node.props.role === 'option');
  assert.equal(spaceOptions().length, codemSpaces.length);
  assert.equal(spaceOptions()[0].props['aria-selected'], true);
  spaceOptions()[1].props.onClick();
  assert.equal(field('create-agent-space').props['aria-expanded'], false);
  assert.equal(testDocument.activeElement, spaceNode);
  assert.ok(find(field('create-agent-space'), node => node.props.children === '服务端研发'));
  assert.equal(field('create-agent-name').props.value, '自定义审查助手', 'Changing spaces preserves the form draft');
  assert.equal(field('create-agent-description').props.value, '辅助架构设计与技术评审');
  assert.equal(field('create-agent-instructions').props.value, '所有变更先由负责人确认。');
  const spaceKey = key => { let prevented = false; field('create-agent-space').props.onKeyDown({ key, preventDefault() { prevented = true; } }); assert.ok(prevented); };
  spaceKey('ArrowDown');
  spaceKey('Home');
  assert.equal(field('create-agent-space').props['aria-activedescendant'], 'create-agent-space-option-0');
  spaceKey('Enter');
  assert.ok(find(field('create-agent-space'), node => node.props.children === '前端研发'));
  field('create-agent-space').props.onClick();
  tree().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.ok(modal(), 'Escape closes the menu before the modal');
  assert.equal(field('create-agent-space').props['aria-expanded'], false);
  const avatarButton = () => find(tree(), node => node.props['aria-label'] === '切换头像形象和背景色');
  avatarButton().props.onClick();
  assert.equal(nodes(avatarChoices(tree())).filter(node => node.props['aria-label']?.endsWith(' 形象')).length, 6);
  assert.equal(nodes(avatarChoices(tree())).filter(node => node.props['aria-label']?.endsWith('背景')).length, agentAvatarColors.length);
  find(avatarChoices(tree()), node => node.props['aria-label'] === 'Tester 形象').props.onClick();
  find(avatarChoices(tree()), node => node.props['aria-label'] === '蓝色背景').props.onClick();
  assert.equal(find(tree(), node => node.props.className === 'create-agent-avatar').props.src, '/assets/settings/tester.png');
  assert.equal(find(tree(), node => node.props.className === 'create-agent-avatar').props.background, '#3067FF');
  assert.equal(field('create-agent-name').props.value, '自定义审查助手', 'Avatar choices never overwrite the name');
  find(avatarChoices(tree()), node => node.props['aria-label'] === 'Architect 形象').props.onClick();
  assert.equal(find(tree(), node => node.props.className === 'create-agent-avatar').props.background, '#3067FF', 'Shape and background are independent');
  find(avatarChoices(tree()), node => node.props['aria-label'] === 'Tester 形象').props.onClick();
  field('create-agent-space').props.onClick();
  assert.ok(!field('create-agent-avatar-options'), 'Only one popup is open at a time');
  spaceOptions()[1].props.onClick();
  field('create-agent-description').props.onChange({ target: { value: '测'.repeat(210) } });
  assert.equal(field('create-agent-description').props.value.length, 200);
  assert.equal(field('create-agent-description-count').props.children.join(''), '200/200');
  field('create-agent-description').props.onChange({ target: { value: '负责移动端版本回归测试' } });
  field('create-agent-name').props.onChange({ target: { value: ' Mobile QA ' } });
  const submit = form().props.onSubmit;
  submit({ preventDefault() {} });
  submit({ preventDefault() {} });
  assert.equal(cards().length, 8, 'Repeated confirmation creates one card');
  assert.ok(!modal());
  assert.deepEqual(notices, ['智能体已添加']);
  const added = cards().find(card => find(card, node => node.type === 'h2' && node.props.children === 'Mobile QA'));
  assert.ok(find(added, node => node.type === 'p' && node.props.children === '负责移动端版本回归测试'));
  assert.ok(find(added, node => node.props['aria-label'] === '停用 Mobile QA'));
  assert.equal(find(added, node => node.props.className === 'settings-agent-avatar').props.src, '/assets/settings/tester.png');
  assert.equal(find(added, node => node.props.className === 'settings-agent-avatar').props.background, '#3067FF');
  find(added, node => node.props['aria-label'] === '停用 Mobile QA').props.onClick();
  const savedAvatar = () => find(cards().find(card => find(card, node => node.type === 'h2' && node.props.children === 'Mobile QA')), node => node.props.className === 'settings-agent-avatar');
  assert.equal(savedAvatar().props.src, '/assets/settings/radar.png');
  assert.equal(savedAvatar().props.background, undefined);
  find(page(), node => node.props['aria-label'] === '启用 Mobile QA').props.onClick();
  assert.equal(savedAvatar().props.src, '/assets/settings/tester.png');
  assert.equal(savedAvatar().props.background, '#3067FF', 'Re-enabling restores the chosen appearance');
  find(page(), node => node.type === 'button' && node.props.children === '已启用').props.onClick();
  assert.equal(cards().length, 7, 'New cards appear in the enabled filter immediately');
  cleanup();
  assert.equal(closed, 1);
  assert.equal(testDocument.activeElement, opener, 'Closing restores focus to the invoking button');
  testDocument.activeElement = previousFocus;

  for (const method of ['close', 'cancel', 'escape', 'backdrop']) {
    trigger('settings-action settings-create-agent').props.onClick();
    const fresh = mount(CreateAgentDialog)(modal().props);
    assert.equal(find(fresh, node => node.props.id === 'create-agent-name').props.value, 'Reviewer', 'Reopening starts a fresh draft');
    if (method === 'close') find(fresh, node => node.props['aria-label'] === '关闭添加智能体').props.onClick();
    if (method === 'cancel') find(fresh, node => node.type === 'button' && node.props.children === '取消').props.onClick();
    if (method === 'escape') { let prevented = false; fresh.props.onCancel({ preventDefault() { prevented = true; } }); assert.ok(prevented); }
    if (method === 'backdrop') {
      const outside = { target: dialogNode, currentTarget: dialogNode };
      fresh.props.onPointerDown({ target: nameNode, currentTarget: dialogNode });
      fresh.props.onClick(outside);
      assert.ok(modal(), 'Dragging from the form to the backdrop does not discard edits');
      fresh.props.onPointerDown(outside); fresh.props.onClick(outside);
    }
    assert.ok(!modal());
    assert.equal(cards().length, 7, 'Dismissal never creates an extra card');
  }
  const exported = JSON.parse(readFileSync(resolve(root, 'public/assets/settings/create-agent/provenance.json'), 'utf8'));
  assert.equal(exported.assets.length, 8);
  for (const asset of exported.assets) {
    const bytes = readFileSync(resolve(root, `public${asset.path}`));
    assert.equal(bytes.length, asset.sizeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(existsSync(resolve(root, `dist${asset.path}`)));
  }
  const spaceAssets = JSON.parse(readFileSync(resolve(root, 'public/assets/settings/create-agent/space-provenance.json'), 'utf8'));
  for (const asset of spaceAssets.assets) {
    const bytes = readFileSync(resolve(root, `public${asset.path}`));
    assert.equal(bytes.length, asset.sizeBytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(readFileSync(resolve(root, `dist${asset.path}`)).equals(bytes));
  }
  console.log('Create-agent checks passed: space selection and keyboard controls, independent avatar shape/background, draft preservation, disable/re-enable appearance, editable fields, limits, validation, submission, dismissal, focus restoration and original Figma assets.');
}

// Configuration reuses the creation form but updates the existing agent only on save.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { CreateAgentDialog } = load(resolve(root, 'src/CreateAgentDialog.tsx'));
  const { AgentDetailDrawer } = load(resolve(root, 'src/AgentDetailDrawer.tsx'));
  const { initialSettingsAgents } = load(resolve(root, 'src/settings-agents.ts'));
  const notices = [];
  const renderPage = mount(SettingsPage);
  const page = () => renderPage({ notify: message => notices.push(message) });
  const card = id => find(page(), node => node.props['data-settings-agent-card'] === id);
  const modal = () => find(page(), byName('CreateAgentDialog'));
  const detail = () => find(page(), byName('AgentDetailDrawer'));
  const configure = id => find(card(id), node => node.props['aria-label']?.startsWith('配置 ')).props.onClick();
  const field = (tree, id) => find(tree, node => node.props.id === `create-agent-${id}`);
  const cardName = id => find(card(id), node => node.type === 'h2').props.children;
  // Exercise the retained agent grid through its hidden entry, outside the default AI flow.
  find(page(), node => node.props.id === 'settings-agents-tab').props.onClick();

  // The modal and portal-backed drawer are siblings even though their DOM locations differ.
  // Sharing an agent ID as their key leaves orphaned dialogs during React reconciliation.
  for (const agent of initialSettingsAgents) {
    find(card(agent.id), node => node.props.className === 'settings-agent-open').props.onClick({ currentTarget: new TestNode() });
    detail().props.onConfigure();
    assert.notEqual(modal().key, detail().key, 'Configuration and details must have independent React identities');
    modal().props.onClose();
    assert.ok(!modal());
    assert.equal(detail().props.agent.id, agent.id, 'Closing configuration preserves the selected drawer');
    assert.equal(detail().props.suspended, false);
    detail().props.onClose(false);
  }

  for (const agent of initialSettingsAgents) {
    configure(agent.id);
    const tree = mount(CreateAgentDialog)(modal().props);
    assert.equal(field(tree, 'title').props.children, '配置智能体');
    assert.equal(find(tree, node => node.props.type === 'submit').props.children, '保存');
    for (const name of ['name', 'description', 'instructions']) assert.equal(field(tree, name).props.value, agent[name]);
    assert.equal(find(tree, node => node.props.className === 'create-agent-avatar').props.src, agent.avatar);
    assert.equal(modal().props.initialValues.spaceId, agent.spaceId);
    modal().props.onClose();
  }
  configure('planner');
  const cancelled = mount(CreateAgentDialog);
  field(cancelled(modal().props), 'name').props.onChange({ target: { value: '未保存名称' } });
  assert.equal(cardName('planner'), 'Planner', 'Draft changes do not mutate the card before saving');
  find(cancelled(modal().props), node => node.props.children === '取消').props.onClick();
  configure('planner');
  const render = mount(CreateAgentDialog);
  const tree = () => render(modal().props);
  assert.equal(field(tree(), 'name').props.value, 'Planner', 'Reopening discards cancelled edits');
  field(tree(), 'name').props.onChange({ target: { value: ' 发布规划助手 ' } });
  field(tree(), 'description').props.onChange({ target: { value: '统筹发布计划与依赖' } });
  field(tree(), 'instructions').props.onChange({ target: { value: '发布前检查阻塞项，并由负责人确认。' } });
  field(tree(), 'space').props.onClick();
  find(tree(), node => node.props.id === 'create-agent-space-option-1').props.onClick();
  find(tree(), node => node.props.className === 'create-agent-avatar-trigger').props.onClick();
  find(avatarChoices(tree()), node => node.props['aria-label'] === 'Release 形象').props.onClick();
  find(avatarChoices(tree()), node => node.props['aria-label'] === '深蓝色背景').props.onClick();
  const submit = find(tree(), node => node.type === 'form').props.onSubmit;
  submit({ preventDefault() {} });
  submit({ preventDefault() {} });
  assert.ok(!modal());
  assert.equal(nodes(page()).filter(node => node.type === 'article').length, 7, 'Save updates the existing card, never creates another');
  assert.equal(cardName('planner'), '发布规划助手');
  assert.equal(cardName('reviewer'), 'Reviewer', 'Other agents remain unchanged');
  assert.equal(find(card('planner'), byName('AgentAvatar')).props.src, '/assets/settings/release.png');
  assert.equal(find(card('planner'), byName('AgentAvatar')).props.background, '#243CC7');
  assert.deepEqual(notices, ['智能体配置已保存'], 'Repeated submit saves once');
  configure('planner');
  const saved = mount(CreateAgentDialog)(modal().props);
  assert.equal(field(saved, 'name').props.value, '发布规划助手');
  assert.equal(field(saved, 'description').props.value, '统筹发布计划与依赖');
  assert.equal(field(saved, 'instructions').props.value, '发布前检查阻塞项，并由负责人确认。');
  assert.equal(modal().props.initialValues.spaceId, 'backend');
  assert.equal(find(saved, node => node.props.className === 'create-agent-avatar').props.background, '#243CC7');
  modal().props.onClose();

  find(card('planner'), node => node.props['aria-label'] === '停用 发布规划助手').props.onClick();
  const opener = Object.assign(new TestNode(), { isConnected: true });
  find(card('planner'), node => node.props.className === 'settings-agent-open').props.onClick({ currentTarget: opener });
  detail().props.onConfigure();
  assert.equal(detail().props.suspended, true);
  let dismissed = 0;
  const renderDetail = mount(AgentDetailDrawer);
  renderDetail({ ...detail().props, onClose() { dismissed++; } });
  const cleanup = renderDetail.flushEffects();
  const click = new Event('pointerdown');
  Object.defineProperty(click, 'target', { value: new TestNode() });
  testDocument.dispatchEvent(click);
  testDocument.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
  assert.equal(dismissed, 0, 'The modal owns outside clicks and Escape while the detail drawer is suspended');
  cleanup();
  const editDetail = mount(CreateAgentDialog);
  let form = editDetail(modal().props);
  assert.equal(find(form, node => node.props.className === 'create-agent-avatar').props.src, '/assets/settings/release.png', 'Disabled agents still edit their saved avatar');
  field(form, 'name').props.onChange({ target: { value: '发布协调助手' } });
  form = editDetail(modal().props);
  find(form, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(detail().props.agent.name, '发布协调助手', 'The open detail drawer reflects saved fields');
  assert.equal(detail().props.agent.id, 'planner');
  assert.equal(detail().props.enabled, false, 'Configuration preserves disabled state');
  assert.equal(detail().props.suspended, false);
  assert.equal(find(card('planner'), byName('AgentAvatar')).props.src, '/assets/settings/radar.png');
  detail().props.onToggle();
  assert.equal(find(card('planner'), byName('AgentAvatar')).props.background, '#243CC7');
  find(page(), node => node.props.className === 'settings-action settings-create-agent').props.onClick();
  assert.equal(field(mount(CreateAgentDialog)(modal().props), 'name').props.value, 'Reviewer', 'Creation keeps its independent default values');
  console.log('Agent configuration checks passed: complete prefills, isolated drafts/cancel, saved fields/avatar/space, stable identity, one update, unchanged enablement, drawer sync and modal event isolation.');
}

// Background changes preserve the original face, accessories and transparent pixels.
{
  const { recolorAvatarBackground } = load(resolve(root, 'src/agent-avatar-pixels.ts'));
  const width = 10, height = 10;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set([255, 105, 36, 255], i * 4);
  const center = (5 * width + 5) * 4;
  pixels.set([246, 245, 253, 255], center);
  pixels.set([52, 24, 10, 255], center + 4);
  pixels.set([0, 0, 0, 0], 0);
  const original = pixels.slice();
  const changed = recolorAvatarBackground(pixels, width, height, '#3067FF');
  assert.deepEqual(Array.from(changed.slice(4, 8)), [48, 103, 255, 255]);
  assert.deepEqual(Array.from(changed.slice(center, center + 8)), Array.from(original.slice(center, center + 8)));
  assert.deepEqual(Array.from(changed.slice(0, 4)), [0, 0, 0, 0]);
  assert.deepEqual(pixels, original, 'Original exported pixels remain unchanged');
  assert.deepEqual(Array.from(recolorAvatarBackground(pixels, width, height, 'invalid')), Array.from(original));
  const overlay = recolorAvatarBackground(pixels, width, height, '#3067FF', true);
  assert.deepEqual(Array.from(overlay.slice(4, 8)), [48, 103, 255, 255]);
  assert.equal(overlay[center + 3], 0, 'The color overlay leaves the animated face visible');
  assert.equal(overlay[center + 7], 0, 'The color overlay leaves accessories visible');
  assert.equal(overlay[3], 0, 'Transparent avatar edges stay transparent');
  console.log('Avatar color checks passed: recolored background, preserved face/accessories/alpha and immutable source.');
}

// Use the supplied WebP bytes in every avatar surface without flattening the animation.
{
  const { AgentAvatar } = load(resolve(root, 'src/AgentAvatar.tsx'));
  const folder = resolve(root, 'public/assets/settings/animated');
  const provenance = JSON.parse(readFileSync(resolve(folder, 'provenance.json'), 'utf8'));
  assert.equal(provenance.assets.length, 7);
  assert.equal(provenance.assets.filter(asset => asset.frames > 1).length, 5);
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(folder, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    let frames = 0, duration = 0;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const length = bytes.readUInt32LE(offset + 4);
      if (bytes.toString('ascii', offset, offset + 4) === 'ANMF') {
        frames++;
        duration += bytes.readUIntLE(offset + 20, 3);
      }
      offset += 8 + length + length % 2;
    }
    assert.equal(Math.max(1, frames), asset.frames);
    assert.equal(duration, asset.durationMs);
    const sources = [`/assets/settings/${asset.name}.png`, `/assets/settings/agent-detail/avatar-${asset.name}.png`];
    if (asset.name === 'reviewer') sources.push('/assets/settings/create-agent/reviewer-avatar.png');
    for (const src of sources) {
      for (const background of [undefined, '#3067FF']) {
        const tree = mount(AgentAvatar)({ src, background });
        assert.equal(find(tree, node => node.type === 'img').props.src, `/assets/settings/animated/${asset.file}`);
        const reducedMotion = find(tree, node => node.type === 'source');
        assert.equal(reducedMotion.props.media, '(prefers-reduced-motion: reduce)');
        assert.equal(reducedMotion.props.srcSet, src);
        assert.equal(Boolean(find(tree, node => node.type === 'canvas')), Boolean(background));
      }
    }
  }
  console.log('WebP avatar checks passed: seven original assets, five looping animations, list/detail/configuration mapping, native animated images under color overlays and reduced-motion fallbacks.');
}

// Styled prompt editing keeps native text selection and passes plain text to submission.
{
  const { RichPromptEditor } = load(resolve(root, 'src/RichPromptEditor.tsx'));
  const { workItemPromptSegments, promptText, readPromptSegments } = load(resolve(root, 'src/prompt-content.ts'));
  const textNode = text => ({ nodeType: 3, textContent: text });
  function element(tagName, children = []) {
    const node = Object.assign(new TestNode(children), { nodeType: 1, tagName, writes: 0,
      replaceChildren(...next) { this.children = next; this.writes++; },
    });
    Object.defineProperties(node, {
      childNodes: { get() { return this.children; } },
      textContent: { get() { return this.children.map(child => child.textContent).join(''); }, set(value) { this.children = [textNode(value)]; } },
    });
    return node;
  }
  const previousCreateTextNode = testDocument.createTextNode;
  const previousCreateElement = testDocument.createElement;
  const previousExecCommand = testDocument.execCommand;
  testDocument.createTextNode = textNode;
  testDocument.createElement = name => element(name.toUpperCase());
  const editorNode = element('DIV');
  const props = { segments: workItemPromptSegments('Enterprise Access Control', 'APP'), inputRef: { current: editorNode },
    onChange(segments) { props.segments = segments; }, onSubmit() { submissions.push(promptText(props.segments)); },
  };
  const submissions = [];
  const render = mount(RichPromptEditor);
  let editor = render(props); render.flushLayoutEffects()();
  assert.equal(editor.props.contentEditable, true);
  assert.equal(editor.props.role, 'textbox');
  assert.equal(editor.props['aria-multiline'], 'true');
  assert.equal(editorNode.textContent, '请帮我根据项目上下文和历史数据，给出 Enterprise Access Control 的 APP 最佳建议值，我的额外要求是：');
  assert.deepEqual(editorNode.children.filter(node => node.tagName === 'STRONG').map(node => node.textContent), ['Enterprise Access Control', 'APP']);
  const titleNode = editorNode.children.find(node => node.tagName === 'STRONG');
  titleNode.textContent = 'Updated Access Control';
  editorNode.children.push(textNode('优先考虑跨团队协作。'));
  editor.props.onInput({ currentTarget: editorNode }); editor = render(props); render.flushLayoutEffects()();
  assert.equal(editorNode.writes, 1, 'Typing must not replace the contenteditable DOM or move its caret');
  assert.equal(props.segments.filter(segment => segment.emphasized)[0].text, 'Updated Access Control');
  assert.ok(promptText(props.segments).endsWith('优先考虑跨团队协作。'));
  function key(shiftKey = false, isComposing = false, keyCode = 13) {
    let prevented = false;
    editor.props.onKeyDown({ key: 'Enter', shiftKey, nativeEvent: { isComposing, keyCode }, preventDefault() { prevented = true; } });
    return prevented;
  }
  assert.equal(key(true), false, 'Shift+Enter keeps native line breaks');
  assert.equal(key(false, true), false);
  assert.equal(key(false, false, 229), false);
  editor.props.onCompositionStart(); assert.equal(key(), false, 'IME confirmation does not submit');
  editor.props.onCompositionEnd({ currentTarget: editorNode }); editor = render(props); render.flushLayoutEffects()();
  assert.equal(editorNode.writes, 1, 'Composition preserves the editing DOM');
  const commands = [];
  testDocument.execCommand = (...args) => { commands.push(args); editorNode.children.push(textNode(args[2])); return true; };
  let pastePrevented = false;
  editor.props.onPaste({ currentTarget: editorNode, preventDefault() { pastePrevented = true; }, clipboardData: { getData(type) { assert.equal(type, 'text/plain'); return '<img src=x>\n补充要求'; } } });
  assert.ok(pastePrevented);
  assert.deepEqual(commands, [['insertText', false, '<img src=x>\n补充要求']]);
  assert.ok(!editorNode.children.some(node => node.tagName === 'IMG'), 'Paste inserts text, never HTML');
  editor = render(props); render.flushLayoutEffects()();
  assert.equal(editorNode.writes, 1);
  assert.equal(key(), true);
  assert.deepEqual(submissions, [promptText(props.segments)], 'Submission uses edited plain text without formatting markers');
  assert.equal(promptText(readPromptSegments(element('DIV', [textNode('第一行'), element('BR'), element('BR')]))), '第一行\n');
  assert.equal(promptText(readPromptSegments(element('DIV', [textNode('第一行'), element('DIV', [element('BR')]), element('DIV', [textNode('第三行')])]))), '第一行\n\n第三行');
  assert.equal(promptText(readPromptSegments(element('DIV', [element('BR')]))), '');
  assert.equal(promptText(readPromptSegments(element('DIV', [textNode('完整替换')]))) , '完整替换');
  editorNode.children = [element('BR')];
  editor.props.onInput({ currentTarget: editorNode }); editor = render(props); render.flushLayoutEffects()();
  assert.equal(editor.props['data-empty'], true, 'Deleting all text restores the placeholder even with a native caret BR');
  assert.equal(promptText(props.segments), '');
  props.segments = workItemPromptSegments('<script>literal title</script>', 'Schedule');
  editor = render(props); render.flushLayoutEffects()();
  assert.equal(editorNode.writes, 2, 'A replacement draft rebuilds its emphasis');
  assert.equal(editorNode.children.find(node => node.tagName === 'STRONG').textContent, '<script>literal title</script>');
  const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
  assert.match(css, /\.rich-prompt-editor strong\s*\{[^}]*font-weight:\s*500;[^}]*color:\s*#243CC7;/);
  testDocument.createTextNode = previousCreateTextNode;
  testDocument.createElement = previousCreateElement;
  testDocument.execCommand = previousExecCommand;
  console.log('Rich prompt checks passed: comma/spacing, two bold blue values, plain-text submission, editable emphasis, stable caret DOM, IME, line breaks, paste/HTML escaping and replacement drafts.');
}

// Ask CodeM carries the selected work item into a directly addressable conversation.
{
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { workItemQueries, createWorkItemConversation, resolveConversation } = load(resolve(root, 'src/work-item-chat.ts'));
  const { conversationUrl, conversationIdFromUrl } = load(resolve(root, 'src/conversation-url.ts'));
  const { WorkItemAskCodeM } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const conversationsSeen = new Set();
  for (const application of workItemApplications) for (const item of getWorkItemView(application.slug).items) for (const query of workItemQueries) {
    const conversation = createWorkItemConversation(application.slug, item, query.title);
    assert.ok(!conversationsSeen.has(conversation.id), 'Different items and queries have independent links');
    conversationsSeen.add(conversation.id);
    const url = conversationUrl('https://example.test/?view=new-chat#report', false, conversation.id);
    assert.equal(url.search + url.hash, '');
    assert.equal(conversationIdFromUrl(url.pathname, url.search), conversation.id);
    assert.equal(resolveConversation(conversation.id).workItem.title, item.title);
    assert.equal(resolveConversation(conversation.id).workItem.href, `/apps/${application.slug}/${item.id}`);
  }
  for (const invalid of ['work-item--missing--1--workflow', 'work-item--epic--99--workflow', 'work-item--epic--1--unknown', 'work-item--epic--1--ask-- ', 'work-item--epic--1--workflow--extra', 'work-item--epic--01--workflow']) {
    assert.equal(resolveConversation(invalid), undefined);
    assert.equal(conversationIdFromUrl(`/chat/${encodeURIComponent(invalid)}`, ''), null);
  }

  for (const slug of ['2024-ybr', 'story']) for (const query of workItemQueries) {
    const origin = `https://example.test/apps/${slug}/3`;
    setLocation(origin);
    const renderRoute = mount(appElement.type);
    let route = renderRoute();
    const routeCleanup = renderRoute.flushEffects();
    const page = find(route, byName('WorkItemsPage'));
    const drawerComponent = find(mount(page.type)(page.props), byName('WorkItemDrawer'));
    const renderDrawer = mount(drawerComponent.type);
    let drawer = renderDrawer(drawerComponent.props);
    const trigger = find(drawer, node => node.props.className === 'work-detail-ask');
    assert.equal(trigger.props['aria-expanded'], false);
    trigger.props.onClick();
    drawer = renderDrawer(drawerComponent.props);
    const ask = find(drawer, byName('WorkItemAskCodeM'));
    assert.equal(ask.props.item.title, drawerComponent.props.item.title);
    const panel = mount(ask.type)(ask.props);
    const queryList = find(panel, node => node.props['aria-label'] === '快捷提问');
    assert.equal(nodes(queryList).filter(node => node.type === 'button').length, 5);
    find(queryList, node => node.type === 'button' && node.props.children === query.title).props.onClick();
    const chatUrl = testWindow.location.href;
    assert.match(testWindow.location.pathname, /^\/chat\/work-item--/);
    route = renderRoute();
    assert.equal(find(route, byName('Sidebar')).props.active, 'CodeM');
    assert.ok(!find(route, byName('WorkItemsPage')));
    assert.equal(sentMessages(route)[0].props.text, query.title);
    assert.equal(sentMessages(route)[0].props.workItem.title, drawerComponent.props.item.title);
    assert.ok(!find(route, node => node.props.label === '复制会话链接'));
    assert.equal(testWindow.location.href, chatUrl);
    testWindow.history.go(-1);
    assert.equal(testWindow.location.href, origin);
    assert.ok(find(renderRoute(), byName('WorkItemsPage')));
    testWindow.history.go(1);
    assert.equal(sentMessages(renderRoute())[0].props.text, query.title);
    assert.equal(sentMessages(mount(appElement.type)())[0].props.text, query.title, 'Fresh direct loads restore the selected query without storage');
    routeCleanup();
  }

  // Closing the popup must leave the work-item drawer open and restore its trigger.
  setLocation('https://example.test/apps/2024-ybr/3');
  const page = find(mount(appElement.type)(), byName('WorkItemsPage'));
  const detail = find(mount(page.type)(page.props), byName('WorkItemDrawer'));
  const renderDrawer = mount(detail.type);
  const triggerNode = new TestNode();
  let drawer = renderDrawer(detail.props);
  const trigger = () => find(drawer, node => node.props.className === 'work-detail-ask');
  trigger().props.ref.current = triggerNode;
  trigger().props.onClick(); drawer = renderDrawer(detail.props);
  let ask = find(drawer, byName('WorkItemAskCodeM'));
  const renderAsk = mount(WorkItemAskCodeM);
  let panel = renderAsk(ask.props);
  panel.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  drawer = renderDrawer(detail.props);
  assert.ok(!find(drawer, byName('WorkItemAskCodeM')));
  assert.equal(testWindow.location.pathname, '/apps/2024-ybr/3');
  assert.equal(testDocument.activeElement, triggerNode);
  trigger().props.onClick(); drawer = renderDrawer(detail.props);
  ask = find(drawer, byName('WorkItemAskCodeM'));
  panel = renderAsk(ask.props);
  const inside = new TestNode();
  panel.props.ref.current = new TestNode([inside]);
  const stopPanel = renderAsk.flushEffects();
  const pointerDown = target => { const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: target }); testDocument.dispatchEvent(event); };
  pointerDown(inside);
  assert.ok(find(renderDrawer(detail.props), byName('WorkItemAskCodeM')));
  pointerDown(triggerNode);
  assert.ok(find(renderDrawer(detail.props), byName('WorkItemAskCodeM')), 'Trigger handles its own toggle');
  pointerDown(new TestNode());
  assert.ok(!find(renderDrawer(detail.props), byName('WorkItemAskCodeM')));
  assert.equal(testWindow.location.pathname, '/apps/2024-ybr/3');
  stopPanel();

  const submitted = [];
  const props = { ...ask.props, onOpenConversation: value => submitted.push(value) };
  const renderInput = mount(WorkItemAskCodeM);
  let inputPanel = renderInput(props);
  const textInput = () => find(inputPanel, node => node.type === 'textarea');
  const form = () => find(inputPanel, node => node.type === 'form');
  form().props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.length, 0);
  textInput().props.onChange({ target: { value: '分析延期 / #? 中文 & "<内容>"\n给出计划' } });
  inputPanel = renderInput(props);
  textInput().props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true }, preventDefault() {} });
  assert.equal(submitted.length, 0, 'IME confirmation does not send');
  form().props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.length, 1);
  const customUrl = conversationUrl('https://example.test/', false, submitted[0].id);
  assert.equal(resolveConversation(conversationIdFromUrl(customUrl.pathname, customUrl.search)).title, submitted[0].title);
  assert.equal(submitted[0].workItem.title, props.item.title);
  const assetDir = resolve(root, 'public/assets/figma/ask-codem');
  const provenance = load(resolve(assetDir, 'provenance.json'));
  assert.equal(provenance.sourceNode, '88:6344');
  for (const asset of provenance.assets) {
    const original = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256);
    assert.ok(readFileSync(resolve(root, 'dist/assets/figma/ask-codem', asset.file)).equals(original));
  }
  setLocation('https://example.test/');
  console.log('Ask CodeM checks passed: 320 shareable query links, drawer popup, selected-item context, query navigation, direct loads, back/forward, Escape/outside dismissal, custom prompts, IME and original Figma assets.');
}

// The header comments popover keeps its own draft and does not dismiss the drawer or Agent panel.
{
  const { WorkItemDrawer } = load(resolve(root, 'src/WorkItemDrawer.tsx'));
  const { WorkItemComments } = load(resolve(root, 'src/WorkItemComments.tsx'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { workItemAgents } = load(resolve(root, 'src/work-item-agents.ts'));
  for (const application of workItemApplications) {
    const render = mount(WorkItemDrawer);
    const props = { application, item: getWorkItemView(application.slug).items[0], onClose() {} };
    const trigger = () => find(render(props), node => node.props.className === 'work-detail-comment');
    assert.equal(trigger().props['aria-expanded'], false);
    trigger().props.onClick();
    assert.equal(trigger().props['aria-expanded'], true);
    assert.equal(find(render(props), byName('WorkItemComments')).props.open, true);
    trigger().props.onClick();
    assert.equal(trigger().props['aria-expanded'], false, 'The same header button toggles comments in every drawer');
  }
  let dismissed = 0;
  let bounds = { top: 0, left: 500, width: 920, height: 900 };
  let anchorBottom = 38;
  const drawerNode = Object.assign(new TestNode(), { getBoundingClientRect: () => bounds });
  const triggerNode = Object.assign(new TestNode(), { getBoundingClientRect: () => ({ bottom: anchorBottom }) });
  const renderDrawer = mount(WorkItemDrawer);
  const props = { application: workItemApplications[0], item: getWorkItemView(workItemApplications[0].slug).items[0], workingAgents: [workItemAgents[0]], onClose() { dismissed++; } };
  const drawer = () => { const tree = renderDrawer(props); tree.props.ref.current = drawerNode; find(tree, node => node.props.className === 'work-detail-comment').props.ref.current = triggerNode; return tree; };
  const trigger = () => find(drawer(), node => node.props.className === 'work-detail-comment');
  const commentProps = () => find(drawer(), byName('WorkItemComments')).props;
  const render = mount(WorkItemComments);
  const view = () => render(commentProps());
  assert.equal(view(), null);
  find(drawer(), node => node.props.className === 'work-detail-ask').props.onClick();
  trigger().props.onClick();
  assert.ok(!find(drawer(), byName('WorkItemAskCodeM')), 'Opening comments closes Ask CodeM');
  let tree = view();
  const cleanupLayout = render.flushLayoutEffects();
  tree = view();
  assert.equal(tree.props.style.top, 42);
  assert.equal(tree.props.style.width, 460);
  assert.equal(tree.props.style.height, 583);
  const rows = () => nodes(view()).filter(byName('CommentRow'));
  assert.equal(rows().length, 5);
  assert.equal(rows().filter(row => row.props.reply).length, 2);
  assert.equal(rows().at(-1).props.agent.id, 'agent-codem');
  const sidebarAvatar = load(resolve(root, 'src/assets.json'))['sidebar/img'];
  for (const row of rows().filter(row => !row.props.agent)) {
    const avatar = find(row.type(row.props), node => node.props.className === 'work-comment-avatar');
    assert.equal(avatar.props.src, row.props.name === 'Wangbing' ? '/assets/figma/work-item-comments/wangbing.png' : sidebarAvatar);
  }
  assert.ok(!textContent(view()).includes('Related Stories'));
  assert.ok(textContent(view()).includes('好像是线上问题，最后一个工作项有分组就会这样'));
  assert.ok(textContent(view()).includes('这里看到进展'));
  const list = () => find(view(), node => node.props.className === 'work-comments-list');
  const sort = () => find(view(), node => node.props.className === 'work-comments-sort');
  sort().props.onClick();
  assert.equal(list().props.children[0].key, 'agent', 'Sorting reverses threads while keeping nested replies together');
  sort().props.onClick();
  const input = () => find(view(), byName('CommentMentionEditor'));
  const enter = (isComposing = false, keyCode = 13) => input().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing, keyCode }, preventDefault() {} });
  enter();
  assert.equal(rows().length, 5, 'Empty comments are not added');
  input().props.onChange('  已确认复现步骤  ', 11, 11);
  enter(true); enter(false, 229);
  assert.equal(rows().length, 5, 'Composing Enter must not submit a comment');
  enter();
  assert.equal(rows().length, 6);
  assert.equal(textContent(rows().at(-1)), '已确认复现步骤');
  assert.equal(input().props.value, '');
  input().props.onChange('保留这份草稿', 6, 6);
  trigger().props.onClick();
  assert.equal(view(), null);
  trigger().props.onClick();
  assert.equal(input().props.value, '保留这份草稿');
  assert.equal(rows().length, 6, 'Closing the popover preserves locally added comments');
  bounds = { top: 0, left: 0, width: 360, height: 420 }; anchorBottom = 78;
  testWindow.dispatchEvent(new Event('resize'));
  tree = view();
  assert.equal(tree.props.style.top, 82);
  assert.equal(tree.props.style.width, 328);
  assert.equal(tree.props.style.height, 326, 'Compact viewports keep the composer within the drawer');
  cleanupLayout();
  const panelNode = new TestNode();
  view().props.ref.current = panelNode;
  const cleanup = render.flushEffects();
  const pointer = target => { const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: target }); testDocument.dispatchEvent(event); };
  pointer(panelNode); pointer(triggerNode);
  assert.ok(commentProps().open);
  pointer(new TestNode());
  assert.equal(commentProps().open, false, 'Outside clicks close the comments popover');
  cleanup();
  find(drawer(), node => node.props.className === 'work-detail-agent-open').props.onClick();
  trigger().props.onClick();
  assert.ok(find(drawer(), byName('WorkItemAgentPanel')), 'Comments can open while the Agent sidebar stays visible');
  view().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(commentProps().open, false);
  assert.ok(find(drawer(), byName('WorkItemAgentPanel')), 'Escape closes only the top comments layer');
  assert.equal(testDocument.activeElement, triggerNode, 'Escape restores focus to the comments button');
  assert.equal(dismissed, 0);

  // Comment executions must also work before an Owner/role has assigned CodeM.
  for (const assigned of [[], [workItemAgents[1]], [workItemAgents[0]]]) {
    let ownerChanges = 0;
    const renderDetail = mount(WorkItemDrawer);
    const replyTrigger = new TestNode();
    const detailNode = Object.assign(new TestNode(), { querySelector: selector => selector === '[data-comment-task="initial-codem"] .work-comment-agent-open' ? replyTrigger : null });
    const detailProps = { ...props, workingAgents: assigned, onOwnerChange() { ownerChanges++; } };
    const detail = () => { const tree = renderDetail(detailProps); tree.props.ref.current = detailNode; return tree; };
    const commentsProps = () => find(detail(), byName('WorkItemComments')).props;
    const renderComments = mount(WorkItemComments);
    const comments = () => renderComments(commentsProps());
    const panel = () => find(detail(), byName('WorkItemAgentPanel'));
    const reply = () => { const row = nodes(comments()).find(node => byName('CommentRow')(node) && node.props.agent); return row.type(row.props); };
    const openReply = () => find(reply(), node => node.props.className === 'work-comment-agent-open');
    find(detail(), node => node.props.className === 'work-detail-comment').props.onClick();
    assert.equal(reply().props['data-selected'], undefined, 'The agent reply is not highlighted by default');
    assert.equal(openReply().type, 'button', 'The whole reply supports native pointer, Enter and Space activation');
    assert.equal(openReply().props['aria-expanded'], false);
    openReply().props.onClick();
    assert.equal(panel().props.agent.id, 'agent-codem');
    assert.equal(panel().props.agents.filter(agent => agent.id === 'agent-codem').length, 1);
    assert.ok(detail().props.className.includes('has-agent-panel'));
    assert.ok(commentsProps().open, 'Opening an execution keeps its source comment visible');
    assert.equal(reply().props['data-selected'], true);
    assert.equal(openReply().props['aria-controls'], 'work-item-agent-panel');
    assert.equal(nodes(detail()).filter(node => node.props.className === 'work-detail-agent-row').length, assigned.length, 'Reading a comment execution does not create an assignment');
    assert.equal(ownerChanges, 0);
    comments().props.ref.current = new TestNode();
    const cleanupComments = renderComments.flushEffects();
    const portalNode = Object.assign(new TestNode(), { closest: selector => selector === '#work-item-agent-panel' ? {} : null });
    pointer(portalNode);
    assert.ok(commentsProps().open, 'Interacting with the comment execution keeps its highlighted reply visible');
    cleanupComments();
    panel().props.onDraftChange('检查反馈的原声');
    panel().props.onClose();
    assert.ok(!panel());
    assert.equal(reply().props['data-selected'], undefined, 'Closing the execution clears the comment highlight');
    assert.equal(testDocument.activeElement, replyTrigger);
    openReply().props.onClick();
    assert.equal(panel().props.draft, '检查反馈的原声', 'Reopening the same execution preserves its draft');
    if (assigned.some(agent => agent.id === 'agent-planner')) {
      panel().props.onSelect(workItemAgents[1]);
      assert.equal(panel().props.agent.id, 'agent-planner');
      assert.equal(reply().props['data-selected'], undefined, 'Switching to another agent clears the CodeM comment highlight');
    }
    detailProps.item = { ...props.item, id: props.item.id + 1 };
    assert.ok(!panel(), 'Comment executions stay scoped to their work item');
    assert.equal(commentsProps().selectedTaskId, undefined);
  }
  {
    const { commentMentionPeople, commentReplyDelay, commentReplyStagger, getCommentMentionQuery, insertCommentMention, createWorkItemComment } = load(resolve(root, 'src/work-item-comment-mentions.ts'));
    const planner = workItemAgents[1];
    assert.equal(getCommentMentionQuery('email@example.com', 17), null);
    assert.equal(getCommentMentionQuery('@Planner', 4, 8), null, 'Selecting text does not open a mention query');
    assert.equal(insertCommentMention('请@核对排期', getCommentMentionQuery('请@核对排期', 2), planner).value, '请@Planner 核对排期', 'Inserting at the caret preserves following text');
    assert.equal(insertCommentMention('请@Planner 确认', getCommentMentionQuery('请@Planner 确认', 5), workItemAgents[0]).value, '请@CodeM 确认', 'Replacing a known mention removes the complete previous name');
    const mentions = createWorkItemComment('@CodeM @codem @Planner @梁楠楠 me@Reviewer @Architecting', 'one');
    assert.deepEqual(Array.from(mentions.tasks, task => task.agentId), ['agent-codem', 'agent-planner'], 'Agent replies are deduplicated; people, emails and unknown names do not create tasks');

    let assignmentActions = 0;
    const renderDetail = mount(WorkItemDrawer);
    const detailProps = { ...props, workingAgents: [], onAgentAction() { assignmentActions++; } };
    const detail = () => renderDetail(detailProps);
    const commentsProps = () => find(detail(), byName('WorkItemComments')).props;
    const renderComments = mount(WorkItemComments);
    const comments = () => renderComments(commentsProps());
    const panel = () => find(detail(), byName('WorkItemAgentPanel'));
    find(detail(), node => node.props.className === 'work-detail-comment').props.onClick();
    const editorNode = Object.assign(new TestNode(), { setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; } });
    const editor = () => { const node = find(comments(), byName('CommentMentionEditor')); node.props.inputRef.current = editorNode; return node; };
    const edit = (value, caret = value.length) => editor().props.onChange(value, caret, caret);
    const key = (key, isComposing = false, keyCode = 13) => editor().props.onKeyDown({ key, nativeEvent: { isComposing, keyCode }, preventDefault() {} });
    const options = () => nodes(comments()).filter(node => node.props.role === 'option');
    const send = () => find(comments(), node => node.props.className === 'work-comments-send');
    const allRows = () => nodes(comments()).filter(byName('CommentRow'));
    const replies = () => allRows().filter(row => row.props.agent);
    const openReply = row => find(row.type(row.props), node => node.props.className === 'work-comment-agent-open').props.onClick();
    assert.ok(!send());
    edit('   '); assert.ok(!send());
    edit('@');
    assert.equal(options().length, 8);
    assert.ok(!find(comments(), node => node.props.role === 'tablist'));
    assert.ok(!find(comments(), node => node.props.className === 'work-owner-suggestion'));
    assert.deepEqual(options().map(node => node.props.id), Array.from(commentMentionPeople, person => `comment-mention-${person.id}`));
    key('ArrowUp');
    assert.equal(editor().props['aria-activedescendant'], 'comment-mention-guo-chang');
    key('ArrowDown'); key('ArrowDown');
    assert.equal(editor().props['aria-activedescendant'], 'comment-mention-agent-planner');
    key('Enter', true); key('Enter', false, 229);
    assert.equal(editor().props.value, '@', 'IME Enter neither selects nor sends');
    key('Enter');
    assert.equal(editor().props.value, '@Planner ');
    assert.equal(replies().length, 1, 'Selecting an agent only edits the draft');
    editor();
    const cleanupCaret = renderComments.flushLayoutEffects();
    assert.equal(editorNode.selectionStart, '@Planner '.length);
    cleanupCaret();
    assert.equal(options().length, 0);
    edit('@Planner 梳理计划');
    assert.ok(send());
    send().props.onClick();
    assert.equal(editor().props.value, '');
    assert.ok(!send());
    assert.equal(replies().length, 1, 'The agent reply is not immediate');
    advanceTimers(commentReplyDelay - 1);
    assert.equal(replies().length, 1);
    advanceTimers(1);
    assert.equal(replies().length, 2);
    assert.equal(replies().at(-1).props.agent.id, 'agent-planner');
    assert.ok(!panel(), 'An agent acknowledgment does not open its task automatically');
    assert.equal(replies().at(-1).props.selected, false);
    const firstTask = replies().at(-1).props.taskId;
    openReply(replies().at(-1));
    assert.equal(panel().props.agent.id, 'agent-planner');
    assert.equal(commentsProps().selectedTaskId, firstTask);
    panel().props.onDraftChange('优先确认依赖');
    panel().props.onAgentAction('agent-planner', 'stop');
    assert.ok(panel().props.canceledAgents.includes('agent-planner'));
    assert.equal(assignmentActions, 0, 'Comment tasks do not mutate node assignments');
    panel().props.onClose();
    edit('@Planner'); key('Escape');
    comments().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(options().length, 0, 'Escape dismisses only the mention menu first');
    assert.ok(commentsProps().open);
    edit('@Planner 再检查资源'); key('Enter');
    advanceTimers(commentReplyDelay);
    const secondTask = replies().at(-1).props.taskId;
    assert.notEqual(secondTask, firstTask);
    openReply(replies().at(-1));
    assert.equal(panel().props.draft, '');
    assert.ok(!panel().props.canceledAgents.includes('agent-planner'), 'Separate comments create independent agent tasks');
    assert.equal(replies().filter(row => row.props.selected).length, 1);
    openReply(replies().find(row => row.props.taskId === firstTask));
    assert.equal(panel().props.draft, '优先确认依赖');
    assert.ok(panel().props.canceledAgents.includes('agent-planner'));

    edit('@antinuclear');
    assert.equal(options().length, 1, 'Mention search matches personnel email addresses');
    options()[0].props.onClick();
    assert.equal(editor().props.value, '@梁楠楠 ');
    const replyCount = replies().length;
    key('Enter');
    assert.equal(replies().length, replyCount, 'Mentioning a person does not create an agent reply');
    edit('@no-such-person');
    assert.equal(options().length, 0);
    assert.ok(textContent(comments()).includes('未找到匹配的人员或 Agent'));
    edit('@Architect'); options()[0].props.onClick();
    edit('已经取消提及'); key('Enter');
    assert.equal(replies().length, replyCount, 'Removing a mention before sending prevents its reply');
    edit('@CodeM @Planner @Reviewer @Architect @CodeM 请协作'); send().props.onClick();
    assert.equal(replies().length, replyCount);
    advanceTimers(commentReplyDelay);
    assert.equal(replies().length, replyCount + 1, 'Multiple mentioned agents respond one at a time');
    advanceTimers(commentReplyStagger);
    assert.equal(replies().length, replyCount + 2);
    advanceTimers(commentReplyStagger * 2);
    assert.equal(replies().length, replyCount + 4);
    for (const row of replies().slice(-4)) {
      openReply(row);
      assert.equal(panel().props.agent.id, row.props.agent.id);
      assert.equal(commentsProps().selectedTaskId, row.props.taskId);
      assert.equal(replies().filter(row => row.props.selected).length, 1);
    }
    edit('   '); key('Enter');
    const finalRowCount = allRows().length;
    assert.equal(assignmentActions, 0);
    panel().props.onClose();
    find(detail(), node => node.props.className === 'work-detail-comment').props.onClick();
    find(detail(), node => node.props.className === 'work-detail-comment').props.onClick();
    assert.equal(allRows().length, finalRowCount, 'Comments and generated replies survive closing and reopening');
  }
  const assetDir = resolve(root, 'public/assets/figma/work-item-comments');
  const provenance = load(resolve(assetDir, 'provenance.json'));
  assert.equal(provenance.sourceNode, '117:42807');
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/work-item-comments', asset.file)), bytes);
  }
  console.log('Comments checks passed: @ menu/search/caret/keyboard, Figma send button, IME safety, deduplicated agent acknowledgments, per-comment task/draft/stop isolation, shared sidebar avatar, retained drafts/replies, responsive placement, dismissal and original assets.');
}

// Mention formatting keeps native DOM edits, caret offsets and IME composition safe.
{
  const { CommentMentionEditor, readCommentEditorSelection } = load(resolve(root, 'src/CommentMentionEditor.tsx'));
  class EditorNode extends TestNode {
    constructor(type, value = '') { super(); this.nodeType = type; this.value = value; this.style = {}; this.className = ''; this.writes = 0; }
    get childNodes() { return this.children; }
    get textContent() { return this.nodeType === 3 ? this.value : this.children.map(child => child.textContent).join(''); }
    set textContent(value) { if (this.nodeType === 3) this.value = value; else this.children = value ? [new EditorNode(3, value)] : []; }
    replaceChildren(...children) { this.children = children; this.writes++; }
    isEqualNode(other) { return this.nodeType === other.nodeType && this.textContent === other.textContent && this.className === other.className && this.style.color === other.style.color && this.children.length === other.children.length && this.children.every((child, index) => child.isEqualNode(other.children[index])); }
  }
  const previous = { text: testDocument.createTextNode, element: testDocument.createElement, selection: testWindow.getSelection, exec: testDocument.execCommand, focus: testDocument.activeElement };
  testDocument.createTextNode = text => new EditorNode(3, text);
  testDocument.createElement = () => new EditorNode(1);
  const selection = { anchorNode: null, focusNode: null, anchorOffset: 0, focusOffset: 0, setBaseAndExtent(anchor, start, focus, end) { Object.assign(this, { anchorNode: anchor, anchorOffset: start, focusNode: focus, focusOffset: end }); } };
  testWindow.getSelection = () => selection;
  const editor = new EditorNode(1);
  let value = '@Planner 确认一下';
  let pressed = 0;
  const inputRef = { current: null };
  const render = mount(CommentMentionEditor);
  const view = () => { const tree = render({ value, inputRef, onChange(text) { value = text; }, onSelectionChange() {}, placeholder: '输入评论', onKeyDown() { pressed++; } }); tree.props.ref.current = editor; return tree; };
  view(); render.flushLayoutEffects();
  assert.equal(editor.children[0].className, 'work-comment-mention');
  assert.equal(editor.children[0].style.color, '#333dcc');
  assert.equal(editor.children[0].textContent, '@Planner');
  assert.equal(editor.textContent, value);
  const writes = editor.writes;
  view(); render.flushLayoutEffects();
  assert.equal(editor.writes, writes, 'Unchanged drafts do not rewrite editable DOM');
  inputRef.current.focus();
  inputRef.current.setSelectionRange(2, 5);
  assert.equal(readCommentEditorSelection(editor).start, 2);
  assert.equal(readCommentEditorSelection(editor).end, 5, 'Caret ranges work within colored mention spans');
  editor.children[1].textContent = ' 核对排期';
  selection.setBaseAndExtent(editor.children[1], 3, editor.children[1], 3);
  view().props.onInput({ currentTarget: editor });
  assert.equal(value, '@Planner 核对排期');
  assert.equal(editor.writes, writes, 'Ordinary typing preserves native editable nodes');
  view().props.onCompositionStart();
  editor.replaceChildren(new EditorNode(3, '@Reviewer 中文输入'));
  selection.setBaseAndExtent(editor.children[0], editor.textContent.length, editor.children[0], editor.textContent.length);
  const composingWrites = editor.writes;
  view().props.onInput({ currentTarget: editor });
  view(); render.flushLayoutEffects();
  assert.equal(editor.writes, composingWrites, 'Composition is never replaced by formatting');
  view().props.onKeyDown({ key: 'Enter' });
  assert.equal(pressed, 0);
  view().props.onCompositionEnd({ currentTarget: editor });
  assert.equal(editor.children[0].style.color, '#7f4401');
  assert.equal(editor.children[0].textContent, '@Reviewer');
  assert.equal(readCommentEditorSelection(editor).start, value.length, 'Formatting restores the caret after IME completion');
  editor.replaceChildren(new EditorNode(3, '删除了提及'));
  view().props.onInput({ currentTarget: editor });
  assert.ok(!editor.children.some(child => child.className === 'work-comment-mention'));
  let pasted;
  testDocument.execCommand = (command, _ui, text) => { pasted = { command, text }; editor.replaceChildren(new EditorNode(3, text)); };
  view().props.onPaste({ currentTarget: editor, preventDefault() {}, clipboardData: { getData: () => '@Architect\n<script>alert(1)</script>' } });
  assert.equal(pasted.command, 'insertText');
  assert.equal(pasted.text, '@Architect <script>alert(1)</script>');
  assert.equal(editor.children[0].style.color, '#9d1562');
  assert.equal(editor.children[1].nodeType, 3, 'Pasted HTML stays text');
  value = '';
  const empty = view(); render.flushLayoutEffects();
  assert.equal(editor.textContent, '');
  assert.equal(empty.props['data-empty'], true);
  testDocument.createTextNode = previous.text;
  testDocument.createElement = previous.element;
  testWindow.getSelection = previous.selection;
  testDocument.execCommand = previous.exec;
  testDocument.activeElement = previous.focus;
  console.log('Comment editor checks passed: colored mention spans, native edit preservation, caret offsets, IME safety, plain-text paste and clearing.');
}

// WBS has an isolated edit draft and its own planning assistant inside the block.
{
  const { WorkItemWBS } = load(resolve(root, 'src/WorkItemWBS.tsx'));
  const { WorkItemDrawer } = load(resolve(root, 'src/WorkItemDrawer.tsx'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { createWorkItemConversation, resolveConversation, wbsQueries } = load(resolve(root, 'src/work-item-chat.ts'));
  for (const application of workItemApplications) {
    const item = getWorkItemView(application.slug).items[0];
    const renderDrawer = mount(WorkItemDrawer);
    const props = { application, item, onClose() {}, onOpenConversation() {}, onContinueInChat() {} };
    const drawer = renderDrawer(props);
    const scroll = find(drawer, node => node.props.className === 'work-detail-scroll');
    assert.ok(!find(scroll, node => node.props.className === 'work-detail-header'));
    for (const className of ['work-detail-roles', 'work-detail-checks', 'work-detail-review']) assert.ok(find(scroll, node => node.props.className === className));
    assert.ok(find(scroll, byName('WorkItemWorkflow')));
    const wbsProps = find(scroll, byName('WorkItemWBS')).props;
    assert.equal(wbsProps.application.slug, application.slug);
    assert.equal(wbsProps.item.id, item.id);
    assert.equal(wbsProps.onOpenConversation, props.onOpenConversation);
    assert.ok(!find(drawer, byName('WorkItemAskCodeM')));
    for (const question of [...wbsQueries.map(query => query.title), '将前置评审安排在本周五，重新计算下游排期']) {
      const conversation = createWorkItemConversation(application.slug, item, question, 'wbs');
      assert.equal(resolveConversation(conversation.id)?.title, question);
      assert.equal(resolveConversation(conversation.id)?.workItem.href, `/apps/${application.slug}/${item.id}`);
    }
  }
  let conversation;
  const props = { application: workItemApplications[0], item: getWorkItemView(workItemApplications[0].slug).items[0], onOpenConversation: value => { conversation = value; } };
  const render = mount(WorkItemWBS);
  let tree = render(props);
  const label = value => find(tree, node => node.props['aria-label'] === value);
  const button = value => find(tree, node => node.type === 'button' && (node.props.children === value || node.props.children?.includes?.(value)));
  const rows = () => nodes(find(tree, node => node.type === 'tbody')).filter(node => node.type === 'tr');
  const aiRows = () => rows().filter(node => node.props.className?.includes('is-ai-added'));
  const fullscreen = () => find(tree, node => node.props.className === 'work-wbs work-wbs-fullscreen');
  const escape = () => { tree.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); tree = render(props); };
  assert.equal(rows().length, 28);
  assert.ok(!button('添加子级') && !button('添加节点'), 'Read-only drawers hide all add rows');
  for (const name of ['Filters', 'Search', '仅显示计划表', '图例']) {
    assert.ok(button(name));
    assert.equal(button(name).props.onClick, undefined);
    assert.equal(button(name).props['aria-expanded'], undefined);
  }
  assert.equal(label('更多 WBS 操作').props.onClick, undefined);
  label('收起 概念阶段').props.onClick(); tree = render(props);
  assert.ok(rows().length < 28);
  label('展开 概念阶段').props.onClick(); tree = render(props);
  assert.equal(rows().length, 28);
  label('收起 新版智慧屏').props.onClick(); tree = render(props);
  assert.equal(rows().length, 1);
  label('展开 新版智慧屏').props.onClick(); tree = render(props);
  label('选择全部 WBS 任务').props.onChange(); tree = render(props);
  assert.equal(label('选择全部 WBS 任务').props.checked, true);
  label('选择 项目立项').props.onChange(); tree = render(props);
  assert.equal(label('选择全部 WBS 任务').props.checked, false);
  button('Ask CodeM').props.onClick(); tree = render(props);
  const anchor = find(tree, node => node.props.className === 'work-wbs-ask-anchor');
  const ask = find(anchor, byName('WorkItemAskCodeM'));
  assert.equal(ask.props.context, 'wbs');
  assert.equal(ask.props.item.id, props.item.id);
  const askTree = mount(ask.type)(ask.props);
  assert.ok(find(askTree, node => node.type === 'h2' && node.props.children === 'CodeM 帮你编排项目计划'));
  find(askTree, node => node.type === 'button' && node.props.children === wbsQueries[0].title).props.onClick();
  assert.equal(conversation.id, createWorkItemConversation(props.application.slug, props.item, wbsQueries[0].title, 'wbs').id);
  escape();
  assert.ok(!find(tree, byName('WorkItemAskCodeM')));
  button('Edit').props.onClick(); tree = render(props);
  assert.ok(fullscreen());
  assert.equal(rows().length, 34);
  assert.ok(button('Exit'));
  assert.ok(button('Publish'));
  assert.ok(!button('Edit'));
  assert.equal(fullscreen().props['data-work-item-layer'], props.item.id);
  label('任务名称 2').props.onChange({ target: { value: '未发布的修改' } }); tree = render(props);
  button('Exit').props.onClick(); tree = render(props);
  assert.ok(!fullscreen());
  assert.ok(find(tree, node => node.props.title === '项目立项'));
  assert.ok(!find(tree, node => node.props.title === '未发布的修改'));
  button('Edit').props.onClick(); tree = render(props);
  label('任务名称 2').props.onChange({ target: { value: '更新后的项目立项' } }); tree = render(props);
  button('Publish').props.onClick(); tree = render(props);
  assert.ok(!fullscreen());
  assert.ok(find(tree, node => node.props.title === '更新后的项目立项'));
  button('Edit').props.onClick(); tree = render(props);
  assert.equal(label('任务名称 2').props.value, '更新后的项目立项');
  button('Ask CodeM').props.onClick(); tree = render(props);
  escape();
  assert.ok(fullscreen(), 'Escape closes the planning popup before leaving the editor');
  assert.ok(!find(tree, byName('WorkItemAskCodeM')));
  escape();
  assert.ok(!fullscreen());
  button('Edit').props.onClick(); tree = render(props);
  button('添加节点').props.onClick(); tree = render(props);
  assert.ok(fullscreen());
  assert.equal(rows().length, 35);
  assert.equal(aiRows().length, 0, 'Manually added nodes have no AI highlight');
  button('Exit').props.onClick(); tree = render(props);
  assert.equal(rows().length, 28, 'Exit discards new draft rows and hides add controls');
  button('Edit').props.onClick(); tree = render(props);
  button('添加节点').props.onClick(); tree = render(props);
  button('Publish').props.onClick(); tree = render(props);
  assert.equal(rows().length, 29);
  assert.ok(!button('添加子级') && !button('添加节点'));
  button('Edit').props.onClick(); tree = render(props);
  fullscreen().props.ref.current = new TestNode();
  const childRow = find(tree, node => node.type === 'tr' && node.props.className?.includes('is-child-add'));
  const childTrigger = new TestNode();
  childTrigger.getBoundingClientRect = () => ({ left: 160, top: 300, bottom: 332 });
  const rowElement = new TestNode([childTrigger]);
  rowElement.getBoundingClientRect = () => ({ left: 16, top: 300, bottom: 332 });
  rowElement.querySelector = () => childTrigger;
  childRow.props.onClick({ currentTarget: rowElement, detail: 1, clientX: 600, clientY: 316 }); tree = render(props);
  const childMenu = find(tree, byName('WorkItemWBSAddMenu'));
  assert.equal(childMenu.props.parent.name, '子任务');
  assert.equal(childMenu.props.anchorRef.current, rowElement);
  assert.equal(childMenu.props.anchorPoint.x, 584);
  assert.equal(childMenu.props.anchorPoint.y, 16);
  assert.equal(rows().length, 35, 'Opening the child menu does not insert a task');
  const { suggestWBSChildren } = load(resolve(root, 'src/work-item-wbs-children.ts'));
  childMenu.props.onAdd(suggestWBSChildren(childMenu.props.parent, childMenu.props.rows), true); tree = render(props);
  assert.equal(rows().length, 39);
  assert.equal(label('任务名称 2.1.1').props.value, '更新后的项目立项 · 梳理立项目标与范围');
  assert.equal(aiRows().length, 4, 'Only the accepted CodeM children receive a draft highlight');
  assert.ok(aiRows().every(row => find(row, node => node.props['aria-label']?.startsWith('任务名称 2.1.'))));
  label('更新后的项目立项 · 梳理立项目标与范围 owner').props.onChange({ target: { value: '修改后的负责人' } }); tree = render(props);
  label('选择 更新后的项目立项 · 梳理立项目标与范围').props.onChange(); tree = render(props);
  assert.equal(aiRows().length, 4, 'Editing and selecting accepted rows preserves their highlight');
  assert.ok(!find(tree, byName('WorkItemWBSAddMenu')));
  button('Publish').props.onClick(); tree = render(props);
  assert.equal(rows().length, 33, 'Accepted children survive Publish; control rows remain hidden');
  assert.equal(aiRows().length, 0, 'Publish removes the draft highlight');
  button('Edit').props.onClick(); tree = render(props);
  assert.equal(aiRows().length, 0, 'Published children stay unhighlighted when editing again');
  const addChildren = (count, linked) => {
    fullscreen().props.ref.current = new TestNode();
    find(tree, node => node.type === 'tr' && node.props.className?.includes('is-child-add')).props.onClick({ currentTarget: rowElement, detail: 1, clientX: 600, clientY: 316 }); tree = render(props);
    const menu = find(tree, byName('WorkItemWBSAddMenu'));
    menu.props.onAdd(suggestWBSChildren(menu.props.parent, menu.props.rows).slice(0, count), linked); tree = render(props);
  };
  addChildren(1, false);
  assert.equal(aiRows().length, 0, 'Manual child creation does not add an AI highlight');
  addChildren(2, true);
  assert.equal(aiRows().length, 2);
  addChildren(1, true);
  assert.equal(aiRows().length, 3, 'Multiple Accept actions preserve all unpublished AI highlights');
  button('Exit').props.onClick(); tree = render(props);
  assert.equal(rows().length, 33, 'Exit discards the pending children');
  button('Edit').props.onClick(); tree = render(props);
  assert.equal(aiRows().length, 0, 'Discarded draft highlights do not return in a new edit session');
  button('Exit').props.onClick(); tree = render(props);
  assert.equal(nodes(mount(WorkItemWBS)(props)).filter(node => node.props.title === '更新后的项目立项').length, 0, 'Another drawer starts with its own data');
  const assetDir = resolve(root, 'public/assets/figma/work-item-wbs');
  const provenance = load(resolve(assetDir, 'provenance.json'));
  assert.equal(provenance.nodeId, '97:31242');
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(readFileSync(resolve(root, 'dist/assets/figma/work-item-wbs', asset.file)).equals(bytes));
  }
  console.log('WBS checks passed: all eight drawer types, fixed-header structure, hierarchy, selection, static toolbar, fullscreen draft/exit/publish, add task, independent planning popup, 48 shareable planning queries and original Figma assets.');
}

// Child breakdown reuses the timed recommendation flow and only applies on Accept.
{
  const { WorkItemWBSAddMenu } = load(resolve(root, 'src/WorkItemWBSAddMenu.tsx'));
  const { getWBSChildNumbers, suggestWBSChildren, insertWBSChildren, manualWBSChild, wbsChildKinds } = load(resolve(root, 'src/work-item-wbs-children.ts'));
  const sourceRows = load(resolve(root, 'src/work-item-wbs-data.json'));
  const sourceSnapshot = JSON.stringify(sourceRows);
  const parent = sourceRows.find(row => row.number === '2.1');
  const anchor = sourceRows.find(row => row.kind === 'add' && row.parent === parent.id);
  const suggested = suggestWBSChildren(parent, sourceRows);
  assert.equal(suggested.length, 4);
  assert.ok(suggested.every(row => row.name.startsWith('项目立项 · ') && row.owner === parent.owner));
  assert.equal(suggested[0].schedule.split(' ~ ')[0], '2026-05-05');
  assert.equal(suggested.at(-1).schedule.split(' ~ ')[1], '2026-06-14');
  const inserted = insertWBSChildren(sourceRows, anchor.id, suggested, true);
  const added = inserted.filter(row => !sourceRows.some(source => source.id === row.id));
  assert.equal(added.length, 4);
  assert.deepEqual(Array.from(added, row => row.number), ['2.1.1', '2.1.2', '2.1.3', '2.1.4']);
  assert.ok(added.every(row => row.parent === parent.id && row.indent === parent.indent + 1));
  assert.equal(added[1].dependency, '2.1.1FS');
  assert.equal(added[1].predecessor, `${added[0].name} FS`);
  assert.equal(inserted.indexOf(added.at(-1)) + 1, inserted.findIndex(row => row.id === anchor.id));
  assert.equal(JSON.stringify(sourceRows), sourceSnapshot);
  const repeated = insertWBSChildren(inserted, anchor.id, suggested, true);
  assert.ok(repeated.some(row => row.number === '2.1.5'));
  assert.equal(new Set(repeated.map(row => row.id)).size, repeated.length);
  assert.deepEqual(Array.from(getWBSChildNumbers(inserted, parent, 2)), ['2.1.5', '2.1.6'], 'New suggestions continue after existing siblings');
  assert.deepEqual(Array.from(getWBSChildNumbers(inserted, added[0], 2)), ['2.1.1.1', '2.1.1.2'], 'Suggestion numbers follow deeper parent levels');
  const review = sourceRows.find(row => row.number === '8');
  assert.ok(suggestWBSChildren(review, sourceRows)[0].name.includes('复盘'));
  const quality = sourceRows.find(row => row.number === '10');
  assert.ok(suggestWBSChildren(quality, sourceRows)[0].name.includes('验证'));
  assert.ok(suggestWBSChildren({ ...parent, parent: null, schedule: '' }, []).every(row => row.schedule === '待填'));
  assert.equal(manualWBSChild(parent, 'requirement').name, '新需求');
  for (const kind of wbsChildKinds) {
    assert.equal(manualWBSChild(parent, kind.id).name, kind.defaultName);
    assert.ok(existsSync(resolve(root, 'public/assets/figma', kind.asset)));
  }

  let applied = 0, closed = 0, acceptedChildren = [], acceptedLinked = false;
  const render = mount(WorkItemWBSAddMenu);
  const props = { parent, rows: sourceRows, anchorRef: { current: new TestNode() }, onClose: () => closed++, onAdd: (children, linked) => { applied += children.length; acceptedChildren = children; acceptedLinked = linked; } };
  let tree = render(props);
  const button = label => find(tree, node => node.type === 'button' && (node.props.children === label || node.props.children?.includes?.(label)));
  const checkboxes = () => nodes(tree).filter(node => node.type === 'input' && node.props.type === 'checkbox');
  const previewNumbers = () => nodes(tree).filter(node => node.props.className === 'work-wbs-breakdown-number').map(node => node.props.children);
  const selectSuggestion = (index, checked) => { checkboxes()[index].props.onChange({ currentTarget: { checked } }); tree = render(props); };
  assert.equal(nodes(tree).filter(node => node.props.role === 'menuitem').length, 9);
  assert.ok(find(tree, byName('CodeMLogo')));
  nodes(tree).find(node => node.props.role === 'menuitem').props.onClick(); tree = render(props);
  assert.equal(tree.props.role, 'dialog');
  assert.ok(find(tree, node => node.props.className === 'work-owner-ai-loading'));
  let cleanup = render.flushEffects();
  advanceTimers(5999); tree = render(props);
  assert.ok(!button('Accept')); assert.equal(applied, 0);
  advanceTimers(1); tree = render(props);
  assert.ok(button('Accept')); assert.equal(applied, 0);
  assert.equal(checkboxes().length, 4);
  assert.ok(checkboxes().every(node => node.props.checked), 'Suggestions start fully selected');
  assert.deepEqual(previewNumbers(), ['2.1.1', '2.1.2', '2.1.3', '2.1.4']);
  assert.equal(button('Accept').props.disabled, false);
  for (let index = 0; index < 4; index++) {
    selectSuggestion(index, false);
    assert.deepEqual(previewNumbers(), ['2.1.1', '2.1.2', '2.1.3', '2.1.4'], 'Unchecking suggestions preserves all original hierarchy numbers');
  }
  assert.equal(button('Accept').props.disabled, true, 'Accept is disabled when no suggestion is selected');
  button('Accept').props.onClick();
  assert.equal(applied, 0, 'An empty selection never writes to the table');
  selectSuggestion(2, true);
  assert.equal(button('Accept').props.disabled, false, 'Reselecting a suggestion re-enables Accept');
  assert.deepEqual(previewNumbers(), ['2.1.1', '2.1.2', '2.1.3', '2.1.4'], 'Reselecting a suggestion keeps the original numbering');
  cleanup();
  button('Ignore').props.onClick(); tree = render(props);
  assert.equal(tree.props.role, 'menu'); assert.equal(applied, 0);
  nodes(tree).find(node => node.props.role === 'menuitem').props.onClick(); tree = render(props);
  cleanup = render.flushEffects();
  advanceTimers(6000); tree = render(props);
  assert.ok(checkboxes().every(node => node.props.checked), 'A new recommendation resets the selection to all');
  selectSuggestion(0, false); selectSuggestion(2, false);
  assert.deepEqual(previewNumbers(), ['2.1.1', '2.1.2', '2.1.3', '2.1.4'], 'A partial selection does not renumber later suggestions');
  button('Accept').props.onClick(); button('Accept').props.onClick();
  assert.equal(applied, 2, 'Accept inserts only selected suggestions, once');
  assert.deepEqual(Array.from(acceptedChildren, child => child.name), [suggested[1].name, suggested[3].name]);
  assert.equal(acceptedLinked, true);
  const selectedRows = insertWBSChildren(sourceRows, anchor.id, acceptedChildren, acceptedLinked)
    .filter(row => !sourceRows.some(source => source.id === row.id));
  assert.deepEqual(Array.from(selectedRows, row => row.number), ['2.1.1', '2.1.2']);
  assert.equal(selectedRows[1].dependency, '2.1.1FS');
  assert.equal(selectedRows[1].predecessor, `${suggested[1].name} FS`, 'Dependencies reference a selected child, never an omitted suggestion');
  assert.equal(selectedRows[0].schedule, suggested[1].schedule, 'Selected suggestions retain their displayed dates');
  cleanup();

  const cancelled = mount(WorkItemWBSAddMenu);
  let cancelledTree = cancelled(props);
  nodes(cancelledTree).find(node => node.props.role === 'menuitem').props.onClick(); cancelledTree = cancelled(props);
  const cancelTimers = cancelled.flushEffects();
  cancelledTree.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(closed, 1); cancelTimers();
  advanceTimers(6000); cancelledTree = cancelled(props);
  assert.ok(!find(cancelledTree, node => node.props.className === 'work-owner-ai-accept'));
  assert.equal(applied, 2, 'Cancelling an in-flight suggestion never changes the table');
  console.log('WBS child breakdown checks passed: read-only controls hidden, row-wide pointer anchoring, nine menu entries, contextual suggestions, six-second loading, default selection, empty-selection guard, selective Accept once, Ignore/reset/cancel safety, parent/indent/number/dependency insertion, existing data preservation and Publish.');
}

// Home keeps its own route and never mounts the previous chat/work-item content.
{
  const { redirectRootToHome } = load(resolve(root, 'src/conversation-url.ts'));
  for (const suffix of ['', '?source=share', '?view=unknown']) {
    setLocation(`https://example.test/${suffix}`);
    redirectRootToHome();
    assert.equal(testWindow.location.href, `https://example.test/home${suffix}`);
    assert.equal(historyEntries.length, 1);
    assert.ok(find(mount(appElement.type)(), byName('HomePage')));
  }
  for (const path of ['/?view=new-chat', '/?source=share&view=new-chat#report', '/?source=share#report', '/chat/project-report', '/apps/2025-ybr/5', '/home']) {
    const href = `https://example.test${path}`;
    setLocation(href);
    redirectRootToHome();
    assert.equal(testWindow.location.href, href, 'Explicit chat and application links retain their destinations');
  }
  setLocation('https://example.test/');
  testWindow.history.pushState(null, '', '/marketplace');
  const renderLanding = mount(appElement.type);
  renderLanding();
  const cleanupLanding = renderLanding.flushEffects();
  testWindow.history.go(-1);
  assert.equal(testWindow.location.pathname, '/home');
  assert.ok(find(renderLanding(), byName('HomePage')));
  testWindow.history.go(1);
  assert.ok(find(renderLanding(), byName('Marketplace')));
  cleanupLanding();
  for (const path of ['/home', '/home/']) assert.ok(rewrites.some(rule => rule.source === path && rule.destination === '/index.html'));
  const { HomePage } = load(resolve(root, 'src/HomePage.tsx'));
  const { homeEntries, visibleHomeEntries } = load(resolve(root, 'src/home-data.ts'));
  for (const path of ['/home', '/home/', '/home?view=new-chat#report']) {
    setLocation(`https://example.test${path}`);
    const direct = mount(appElement.type)();
    assert.ok(find(direct, byName('HomePage')));
    assert.equal(find(direct, byName('Sidebar')).props.active, 'Home');
    assert.ok(!find(direct, byName('NewConversation')) && !find(direct, byName('WorkItemsPage')) && !find(direct, byName('ReportPreview')));
  }
  setLocation('https://example.test/?view=new-chat');
  const renderRoute = mount(appElement.type);
  let route = renderRoute();
  input(find(route, byName('NewConversation'))).props.onChange({ target: { value: '原来的草稿' } });
  route = renderRoute();
  const cleanup = renderRoute.flushEffects();
  find(route, byName('Sidebar')).props.onNavigate('Home'); route = renderRoute();
  assert.equal(testWindow.location.pathname, '/home');
  assert.ok(find(route, byName('HomePage')));
  find(route, byName('Sidebar')).props.onNavigate('Marketplace'); route = renderRoute();
  testWindow.history.go(-1); route = renderRoute();
  assert.ok(find(route, byName('HomePage')));
  testWindow.history.go(1); route = renderRoute();
  assert.ok(find(route, byName('Marketplace')));
  find(route, byName('Sidebar')).props.onNavigate('CodeM'); route = renderRoute();
  assert.equal(input(find(route, byName('NewConversation'))).props.value, '原来的草稿');
  find(route, byName('Sidebar')).props.onNavigate('Home'); route = renderRoute();
  find(route, byName('HomePage')).props.onStartChat('整理本周工作'); route = renderRoute();
  assert.equal(find(route, byName('Sidebar')).props.active, 'CodeM');
  assert.equal(input(find(route, byName('NewConversation'))).props.value, '整理本周工作');
  cleanup();

  const navigation = [], prompts = [];
  const props = { onNavigate: destination => navigation.push(destination), onSend: prompt => prompts.push(prompt), onStartChat: prompt => prompts.push(prompt), notify() {} };
  const render = mount(HomePage);
  let page = render(props);
  const byLabel = label => find(page, node => node.props['aria-label'] === label);
  assert.equal(nodes(page).filter(node => node.props.className?.includes('home-recommendation home-recommendation-')).length, 4);
  assert.equal(nodes(page).filter(node => node.props.className === 'home-space').length, 3);
  assert.equal(nodes(page).filter(node => node.props.className === 'home-resource-name').length, 10);
  byLabel('发送消息').props.onClick?.();
  find(page, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(prompts.length, 0, 'Empty prompts are never submitted');
  byLabel('Home 消息输入框').props.onChange({ target: { value: '  帮我整理项目计划  ' } }); page = render(props);
  byLabel('Home 消息输入框').props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() { throw Error('IME must not submit'); } });
  assert.equal(prompts.length, 0);
  byLabel('Home 消息输入框').props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: {}, preventDefault() {} });
  assert.equal(prompts[0], '帮我整理项目计划');
  byLabel('展开 NovaBook 2').props.onClick(); page = render(props);
  assert.equal(byLabel('展开 NovaBook 2').props['aria-expanded'], true);
  assert.equal(nodes(page).filter(node => node.props.className === 'home-resource-name').length, 12);
  byLabel('筛选所属空间').props.onClick(); page = render(props);
  find(page, node => node.type === 'button' && node.props.children === 'Meego').props.onClick(); page = render(props);
  assert.equal(nodes(page).filter(node => node.props.className === 'home-resource-name').length, 5);
  byLabel('筛选所属空间').props.onClick(); page = render(props);
  find(page, node => node.type === 'button' && node.props.children === '全部空间').props.onClick(); page = render(props);
  byLabel('展开列表视图').props.onClick(); page = render(props);
  assert.equal(nodes(page).filter(node => node.props.className === 'home-resource-name').length, 24);
  byLabel('分组视图').props.onClick(); page = render(props);
  find(page, node => node.type === 'button' && node.props.role === 'tab' && node.props.children === '我的常用').props.onClick(); page = render(props);
  assert.equal(nodes(page).filter(node => node.props.className === 'home-resource-name').length, 7);
  find(page, node => node.type === 'button' && node.props.role === 'tab' && node.props.children === '我的收藏').props.onClick(); page = render(props);
  byLabel('NovaBook 2 快捷操作').props.onClick(); page = render(props);
  find(page, node => node.type === 'button' && node.props.children === '取消收藏').props.onClick(); page = render(props);
  assert.ok(!byLabel('展开 NovaBook 2'));
  assert.equal(homeEntries.length, 10, 'Removing a favorite leaves source data and frequent items intact');
  assert.equal(visibleHomeEntries('frequent', [], [], false, '').length, 5);
  nodes(page).find(node => node.props.className === 'home-space').props.onClick();
  assert.equal(navigation[0], 'Story-3');
  const provenance = JSON.parse(readFileSync(resolve(root, 'public/assets/figma/home/provenance.json'), 'utf8'));
  assert.equal(provenance.nodeId, '119:47771');
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(root, 'public/assets/figma/home', asset.file));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    if (asset.file.endsWith('.svg')) assert.ok(bytes.toString().includes('<svg'));
    else assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
  console.log('Home checks passed: direct routes, navigation/history, preserved chat drafts, prompt handoff/IME, space links, grouped/expanded views, filters, favorites and original Figma asset hashes.');
}

// Default conversations include both Cloud and device examples; saved choices take priority.
{
  const savedStorage = new Map(adminStorage);
  const { conversations } = load(resolve(root, 'src/conversation-history.ts'));
  const { resolveConversation, setConversationEnvironment } = load(resolve(root, 'src/work-item-chat.ts'));
  const { CodeMConversationNavigation } = load(resolve(root, 'src/CodeMConversationNavigation.tsx'));
  for (const conversation of conversations) adminStorage.delete(`meego:work-item-chat:v1:environment:${conversation.id}`);
  const navigation = () => mount(CodeMConversationNavigation)({ selected: null, active: false, onOpenConversation() {} });
  const icons = () => nodes(navigation()).filter(node => node.props.className === 'codem-nav-chat-icon');
  assert.ok(icons().length > 0 && icons().every(icon => icon.props.src === '/assets/figma/work-item-drawer/chat.svg'), 'All standalone conversations use the Chat mode icon');
  for (const environment of ['Cloud', 'MacBook Pro', 'Mac Mini']) {
    assert.ok(nodes(navigation()).some(node => node.props.title?.includes(`\n${environment}`)), `Conversation tooltips retain the ${environment} source`);
  }
  const deviceChat = conversations.find(conversation => conversation.environment?.device);
  assert.equal(resolveConversation(deviceChat.id).environment.device, deviceChat.environment.device);
  setConversationEnvironment(deviceChat.id, { device: null, project: null });
  assert.equal(resolveConversation(deviceChat.id).environment.device, null, 'An explicit Cloud choice overrides the sample device');
  const row = find(navigation(), node => node.props['data-conversation-id'] === deviceChat.id);
  assert.equal(find(row, node => node.type === 'img').props.src, '/assets/figma/work-item-drawer/chat.svg');
  setConversationEnvironment(deviceChat.id, { device: 'Mac Mini', project: 'my-project' });
  assert.equal(resolveConversation(deviceChat.id).environment.project, 'my-project', 'Saved device/project choices survive the new sample defaults');
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Default conversation environment checks passed: shared Chat mode icon, source tooltips and saved-choice precedence.');
}

// Home sends create independent saved chats, immediately visible in the mounted sidebar.
{
  const savedStorage = new Map(adminStorage);
  const { CodeMConversationNavigation } = load(resolve(root, 'src/CodeMConversationNavigation.tsx'));
  const { CodeMSourceNavigation } = load(resolve(root, 'src/CodeMSourceNavigation.tsx'));
  const { getNavigationConversationHistory, loadWorkItemMessages, resolveConversation, setConversationEnvironment } = load(resolve(root, 'src/work-item-chat.ts'));
  setLocation('https://example.test/home');
  const render = mount(appElement.type);
  const sidebar = () => find(render(), byName('Sidebar'));
  const renderSources = mount(CodeMConversationNavigation);
  const sources = () => renderSources({ selected: sidebar().props.selectedConversation, active: sidebar().props.active === 'CodeM', onOpenConversation: sidebar().props.onOpenConversation });
  const row = id => find(sources(), node => node.props['data-conversation-id'] === id);
  const conversationIcon = id => find(row(id), node => node.type === 'img');
  sources();
  const unsubscribe = renderSources.flushEffects();
  const home = find(render(), byName('HomePage'));
  const renderHome = mount(home.type);
  let page = renderHome(home.props);
  const sendHome = () => find(page, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  sendHome();
  assert.equal(testWindow.location.pathname, '/home', 'Empty Home input cannot create a conversation');
  const prompt = '帮我梳理本周工作计划\n优先处理发布准备';
  find(page, node => node.type === 'textarea').props.onChange({ target: { value: `  ${prompt}  ` } });
  find(page, node => node.props.type === 'file').props.onChange({ target: { files: [{ name: '发布计划.pdf' }], value: 'selected' } });
  page = renderHome(home.props);
  sendHome();
  const first = sidebar().props.selectedConversation;
  const fullPrompt = `${prompt}\n附件：发布计划.pdf`;
  assert.ok(first.startsWith('home--'));
  assert.equal(sidebar().props.active, 'CodeM');
  assert.equal(testWindow.location.pathname, `/chat/${first}`);
  assert.equal(sentMessages(render())[0].props.text, fullPrompt);
  assert.ok(!find(render(), byName('NewConversation')), 'Sending opens the conversation without a second submit');
  assert.ok(!find(render(), byName('ReportPreview')), 'A Home message never opens an unrelated sample report');
  assert.equal(row(first).props['aria-current'], 'page');
  assert.equal(conversationIcon(first).props.src, '/assets/figma/work-item-drawer/chat.svg');
  assert.equal(Number(conversationIcon(first).props.width), 16, 'Conversation icons match the Chat mode size');
  const projectSources = mount(CodeMSourceNavigation)({ selected: first, active: true, onOpenConversation() {} });
  assert.ok(!nodes(projectSources).some(node => node.props.group?.source.href === '/home'), 'Home chats are not duplicated under projects');
  assert.equal(getNavigationConversationHistory().filter(entry => entry.id === first).length, 1);
  const editor = () => find(render(), node => node.type === 'textarea');
  assert.equal(editor().props.readOnly, false);
  assert.equal(editor().props.value, '');
  editor().props.onChange({ target: { value: '把回归验证放在第一步' } });
  find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(sidebar().props.selectedConversation, first, 'Follow-ups reuse the existing chat');
  assert.deepEqual(Array.from(loadWorkItemMessages(first)), ['把回归验证放在第一步']);
  const followupReply = nodes(render()).filter(byName('AssistantMessage')).at(-1);
  assert.ok(textContent(followupReply.type(followupReply.props)).includes('补充要求'));
  const refreshed = mount(appElement.type)();
  assert.deepEqual(sentMessages(refreshed).map(message => message.props.text), [fullPrompt, '把回归验证放在第一步']);
  assert.equal(find(refreshed, byName('Sidebar')).props.selectedConversation, first);
  sidebar().props.onBackToMeegle();
  assert.equal(testWindow.location.pathname, '/home');
  const nextHome = find(render(), byName('HomePage'));
  const nextRenderHome = mount(nextHome.type);
  let nextHomePage = nextRenderHome(nextHome.props);
  const deviceEnvironment = { device: 'Mac Mini', project: null, spaceId: 'meego' };
  find(nextHomePage, byName('NewChatToolbar')).props.onEnvironmentChange(deviceEnvironment);
  find(nextHomePage, node => node.type === 'textarea').props.onChange({ target: { value: fullPrompt } });
  nextHomePage = nextRenderHome(nextHome.props);
  find(nextHomePage, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const second = sidebar().props.selectedConversation;
  assert.notEqual(second, first, 'Separate Home sends create separate chats even for identical text');
  const ids = () => nodes(sources()).filter(node => node.props['data-conversation-id']).map(node => node.props['data-conversation-id']);
  assert.deepEqual(ids().slice(0, 2), [second, first], 'New conversations appear first in their group');
  assert.equal(conversationIcon(second).props.src, '/assets/figma/work-item-drawer/chat.svg');
  assert.equal(Number(conversationIcon(second).props.width), 16);
  assert.ok(row(second).props.title.includes('Mac Mini'));
  assert.equal(resolveConversation(second).environment.device, 'Mac Mini', 'Home saves the selected environment with the conversation');
  assert.equal(resolveConversation(second).environment.spaceId, 'meego', 'Home saves the selected space with the device');
  const refreshedDevice = mount(appElement.type)();
  const refreshedToolbar = find(refreshedDevice, byName('NewChatToolbar'));
  const restoredToolbar = mount(refreshedToolbar.type)(refreshedToolbar.props);
  assert.ok(find(restoredToolbar, node => node.props['aria-label'] === '项目：Mac Mini · Chat mode'), 'Reload restores the selected device in the composer');
  assert.ok(find(restoredToolbar, node => node.props['aria-label'] === 'CodeM 空间：Meego'), 'Reload restores the selected CodeM space');
  setConversationEnvironment(second, { device: 'MacBook Pro', project: 'custom-folder', spaceId: 'lark-office' });
  assert.ok(row(second).props.title.includes('MacBook Pro'), 'A mounted navigation updates source details after environment changes');
  const customToolbarProps = find(mount(appElement.type)(), byName('NewChatToolbar')).props;
  const renderCustomToolbar = mount(refreshedToolbar.type);
  let customToolbar = renderCustomToolbar(customToolbarProps);
  assert.ok(find(customToolbar, node => node.props['aria-label'] === 'CodeM 空间：Lark Office'));
  find(customToolbar, node => node.props['aria-label'] === '项目：MacBook Pro · custom-folder').props.onClick();
  customToolbar = renderCustomToolbar(customToolbarProps);
  const restoredSubmenu = find(renderCustomToolbar(customToolbarProps), byName('DeviceSubmenu'));
  assert.ok(restoredSubmenu, 'Opening a restored folder selection automatically expands its device submenu');
  assert.ok(restoredSubmenu.props.projects.includes('custom-folder'), 'Restored custom project remains available in its device menu');
  setConversationEnvironment(second, { device: null, project: null, spaceId: 'aily' });
  assert.equal(resolveConversation(second).environment.spaceId, 'aily', 'A saved Cloud environment retains its selected space');
  assert.equal(conversationIcon(second).props.src, '/assets/figma/work-item-drawer/chat.svg');
  assert.deepEqual(ids().slice(0, 2), [second, first], 'Changing environment preserves sidebar order');
  row(first).props.onClick();
  assert.equal(sidebar().props.selectedConversation, first);
  assert.equal(sentMessages(render()).at(-1).props.text, '把回归验证放在第一步');
  assert.deepEqual(ids().slice(0, 2), [second, first], 'Opening a chat preserves sidebar order');
  sidebar().props.onOpenConversation(resolveConversation(second));
  assert.equal(sentMessages(render()).length, 1, 'Follow-ups remain isolated between Home conversations');
  assert.equal(find(render(), node => node.props.className === 'conversation-header-workspace-name').props.children, 'Home');
  const recordKey = `meego:work-item-chat:v1:conversation:${second}`;
  const record = adminStorage.get(recordKey);
  adminStorage.set(recordKey, '{invalid');
  assert.equal(resolveConversation(second), undefined, 'Malformed saved data does not crash navigation');
  assert.equal(resolveConversation(first).title, fullPrompt);
  adminStorage.set(recordKey, record);
  const environmentKey = `meego:work-item-chat:v1:environment:${first}`;
  adminStorage.delete(environmentKey);
  assert.equal(resolveConversation(first).environment.device, null, 'Older chats without metadata default to Cloud');
  adminStorage.set(environmentKey, '{invalid');
  assert.equal(resolveConversation(first).environment.device, null, 'Malformed environment metadata does not hide a chat');
  adminStorage.set(environmentKey, JSON.stringify({ device: 'Mac Mini', project: 'meego-api', spaceId: 'removed-space' }));
  const legacyToolbar = find(mount(appElement.type)(), byName('NewChatToolbar'));
  const legacyProps = { ...legacyToolbar.props, initialEnvironment: resolveConversation(first).environment };
  const legacyControls = mount(legacyToolbar.type)(legacyProps);
  assert.ok(find(legacyControls, node => node.props['aria-label'] === '项目：Mac Mini · meego-api'), 'Unknown spaces preserve the saved device and folder');
  assert.ok(find(legacyControls, node => node.props['aria-label'] === 'CodeM 空间：CodeM Space'), 'Unknown spaces fall back to CodeM Space');
  unsubscribe();
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Home conversation checks passed: direct send, attachments, conversation group, shared Chat mode icon, persisted environment, custom folder restoration, live updates, independent IDs, follow-ups, refresh, stable order and malformed-storage isolation.');
}

// Titles have a 30-character display limit without mutating prompts or splitting emoji.
{
  const { conversationDisplayTitle } = load(resolve(root, 'src/conversation-history.ts'));
  assert.equal(conversationDisplayTitle('短标题'), '短标题');
  assert.equal(conversationDisplayTitle('字'.repeat(30)), '字'.repeat(30));
  assert.equal(conversationDisplayTitle('字'.repeat(31)), '字'.repeat(29) + '…');
  assert.equal(conversationDisplayTitle('A'.repeat(31)), 'A'.repeat(29) + '…');
  assert.equal(conversationDisplayTitle('👩🏽‍💻'.repeat(31)), '👩🏽‍💻'.repeat(29) + '…');
  assert.equal(conversationDisplayTitle('  空间配置\n  权限查询  '), '空间配置 权限查询');
}

// Settings reuses the Ask CodeM popup and preserves configuration context through navigation and follow-ups.
{
  const { SettingsPage } = load(resolve(root, 'src/SettingsPage.tsx'));
  const { WorkItemAskCodeM } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const { settingsQueries, createSettingsConversation, createSettingsChatReply } = load(resolve(root, 'src/settings-chat.ts'));
  const { resolveConversation, getConversationHistory } = load(resolve(root, 'src/work-item-chat.ts'));
  const { readSettingsExecution, settingsExecutionKey } = load(resolve(root, 'src/settings-chat-execution.ts'));
  for (const query of settingsQueries) for (const edited of [false, true]) {
    setLocation('https://example.test/settings');
    const renderRoute = mount(appElement.type);
    let route = renderRoute();
    const stopRoute = renderRoute.flushEffects();
    const props = find(route, byName('SettingsPage')).props;
    const renderPage = mount(SettingsPage);
    const page = () => renderPage(props);
    const trigger = () => find(page(), node => node.props.className === 'settings-action settings-ask');
    assert.equal(trigger().props['aria-expanded'], false);
    trigger().props.onClick();
    const popup = find(page(), byName('WorkItemAskCodeM'));
    const renderPanel = mount(WorkItemAskCodeM);
    let panel = renderPanel(popup.props);
    const inputNode = new TestNode();
    find(panel, node => node.type === 'textarea').props.ref.current = inputNode;
    const previousHistory = getConversationHistory().map(chat => chat.id);
    find(panel, node => node.type === 'button' && node.props.children === query.title).props.onClick();
    panel = renderPanel(popup.props);
    assert.equal(testWindow.location.pathname, '/settings', 'Suggestions stay in Settings until explicitly sent');
    assert.deepEqual(getConversationHistory().map(chat => chat.id), previousHistory, 'Prefilling does not create a conversation');
    assert.equal(find(panel, node => node.type === 'textarea').props.value, query.prompt);
    assert.ok(query.prompt.length > query.title.length && query.prompt.length <= 2000, 'Each suggestion expands into a sendable query');
    assert.equal(testDocument.activeElement, inputNode, 'The optimized draft is focused for editing');
    const prompt = edited ? query.prompt.replace(/【([^】]+)】/g, '测试$1') + '\n请按配置位置排序。' : query.prompt;
    if (edited) {
      find(panel, node => node.type === 'textarea').props.onChange({ target: { value: prompt } });
      panel = renderPanel(popup.props);
    }
    find(panel, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    route = renderRoute();
    assert.match(testWindow.location.pathname, /^\/chat\/settings--/);
    const heading = find(route, node => node.type === 'h1');
    assert.equal(heading.props.children, [...prompt].slice(0, 29).join('') + '…');
    assert.equal(heading.props.title, prompt, 'Hover exposes the full conversation title');
    assert.equal(sentMessages(route)[0].props.text, prompt, 'Sending preserves the optimized draft and all user edits');
    const sent = sentMessages(route)[0];
    const bubble = mount(sent.type)(sent.props);
    assert.equal(textContent(bubble), prompt, 'Sent messages contain only the query, without a settings label');
    assert.ok(!find(bubble, node => node.type === 'a' || node.props.className === 'work-ask-reference'));
    assert.equal(sentMessages(route)[0].props.workItem, undefined);
    const reply = find(route, byName('AssistantMessage'));
    assert.equal(reply.props.executionId, settingsExecutionKey(createSettingsConversation(prompt).id));
    assert.equal(readSettingsExecution(reply.props.executionId, 60000).status, 'running', 'Sending starts this message execution');
    assert.equal(reply.props.settings.href, '/settings', 'Removing the visible label preserves reply context');
    assert.equal(mount(reply.type)(reply.props).props['data-reply-scenario'], `settings-${query.id}`);
    assert.ok(getConversationHistory().some(chat => chat.id === createSettingsConversation(prompt).id));
    const { ConversationHistoryMenu } = load(resolve(root, 'src/ConversationHistoryMenu.tsx'));
    const historyMenu = mount(ConversationHistoryMenu)({ selected: createSettingsConversation(prompt).id, onSelect() {}, onClose() {} });
    const historyItem = find(historyMenu, node => node.props['aria-current'] === 'true');
    assert.equal(historyItem.props.children, heading.props.children, 'History uses the same capped title');
    assert.equal(historyItem.props.title, prompt);
    const reloaded = sentMessages(mount(appElement.type)())[0];
    assert.equal(textContent(mount(reloaded.type)(reloaded.props)), prompt, 'Direct loads restore the exact query without the label');
    assert.equal(resolveConversation(createSettingsConversation(query.title).id).title, query.title, 'Existing short-query links remain valid');
    const composer = find(route, node => node.type === 'textarea' && node.props['aria-label'] === '消息输入框');
    assert.equal(composer.props.readOnly, false);
    composer.props.onChange({ target: { value: '再详细一点' } }); route = renderRoute();
    find(route, node => node.type === 'form' && node.props.className === 'composer').props.onSubmit({ preventDefault() {} });
    route = renderRoute();
    assert.equal(sentMessages(route).at(-1).props.text, '再详细一点');
    const restored = mount(appElement.type)();
    const followup = sentMessages(restored).at(-1);
    assert.equal(textContent(mount(followup.type)(followup.props)), '再详细一点', 'Saved follow-ups do not restore the settings label');
    assert.equal(nodes(restored).filter(byName('AssistantMessage')).at(-1).props.settings.href, '/settings', 'Saved follow-ups retain configuration context');
    const nextReply = nodes(restored).filter(byName('AssistantMessage')).at(-1);
    assert.notEqual(nextReply.props.executionId, reply.props.executionId, 'Follow-up execution is isolated from earlier messages');
    assert.equal(readSettingsExecution(nextReply.props.executionId, 60000).status, 'running');
    assert.equal(createSettingsChatReply('再详细一点', [prompt]).scenario, `settings-${query.id}`);
    testWindow.history.go(-1);
    assert.ok(find(renderRoute(), byName('SettingsPage')), 'Back returns to Settings');
    stopRoute();
  }

  const submitted = [];
  const renderPage = mount(SettingsPage);
  const page = () => renderPage({ notify() {}, onOpenConversation: chat => submitted.push(chat) });
  const trigger = () => find(page(), node => node.props.className === 'settings-action settings-ask');
  const triggerNode = new TestNode();
  trigger().props.ref.current = triggerNode;
  trigger().props.onClick();
  let popup = find(page(), byName('WorkItemAskCodeM'));
  const renderPanel = mount(WorkItemAskCodeM);
  let panel = renderPanel(popup.props);
  const customPrompt = '查询「预算」控件 / #? 的配置\n然后整理修改建议';
  find(panel, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(submitted.length, 0);
  find(panel, node => node.type === 'textarea').props.onChange({ target: { value: customPrompt } });
  panel = renderPanel(popup.props);
  const enter = { key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true }, preventDefault() {} };
  find(panel, node => node.type === 'textarea').props.onKeyDown(enter);
  assert.equal(submitted.length, 0, 'IME confirmation does not submit');
  find(panel, node => node.type === 'textarea').props.onKeyDown({ ...enter, nativeEvent: { isComposing: false } });
  assert.equal(resolveConversation(submitted[0].id).title, customPrompt);
  panel.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(trigger().props['aria-expanded'], false);
  assert.equal(testDocument.activeElement, triggerNode);
  trigger().props.onClick();
  popup = find(page(), byName('WorkItemAskCodeM'));
  panel = renderPanel(popup.props);
  const inside = new TestNode();
  panel.props.ref.current = new TestNode([inside]);
  const stopPanel = renderPanel.flushEffects();
  const pointerDown = target => { const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: target }); testDocument.dispatchEvent(event); };
  pointerDown(inside); assert.ok(find(page(), byName('WorkItemAskCodeM')));
  pointerDown(triggerNode); assert.ok(find(page(), byName('WorkItemAskCodeM')));
  pointerDown(new TestNode()); assert.ok(!find(page(), byName('WorkItemAskCodeM')));
  stopPanel();
  for (const id of ['settings--missing', 'settings--ask-- ', `settings--ask--${'x'.repeat(2001)}`]) assert.equal(resolveConversation(id), undefined);
  console.log('Settings Ask CodeM checks passed: five optimized editable prefills, explicit sending, exact edited text, label-free messages/reloads/follow-ups, legacy links, custom prompts/IME, context-specific replies, saved history, back navigation and Escape/outside dismissal.');
}

// Settings execution reuses the agent timeline and tools against the actual Code snapshot.
{
  const { settingsQueries, createSettingsConversation } = load(resolve(root, 'src/settings-chat.ts'));
  const { settingsCodeFiles } = load(resolve(root, 'src/settings-code-data.ts'));
  const { createSettingsExecutionPlan } = load(resolve(root, 'src/settings-execution-plan.ts'));
  const { SettingsExecutionMessage } = load(resolve(root, 'src/SettingsExecutionMessage.tsx'));
  const { SettingsChangeDiff } = load(resolve(root, 'src/SettingsChangeDiff.tsx'));
  const { reviewProperties, reviewChangeKind, reviewValue } = load(resolve(root, 'src/settings-review.ts'));
  const { SettingsConfirmationCard, settingsConfirmationCopy } = load(resolve(root, 'src/SettingsConfirmationCard.tsx'));
  const { createSettingsExecutionResult, configurationDiff } = load(resolve(root, 'src/settings-execution-result.ts'));
  const { ExecutionLog } = load(resolve(root, 'src/ExecutionLog.tsx'));
  const { beginSettingsExecution, readSettingsExecution, settingsExecutionKey, useSettingsExecutionControl } = load(resolve(root, 'src/settings-chat-execution.ts'));
  const { executionDuration, getAgentExecutionFrame } = load(resolve(root, 'src/work-item-agent-execution.ts'));
  const originalConfigs = JSON.stringify(settingsCodeFiles);
  const previousMedia = testWindow.matchMedia;
  const media = Object.assign(new EventTarget(), { matches: false });
  testWindow.matchMedia = () => media;
  const timersBefore = pendingTimers.size;

  for (const query of settingsQueries) {
    const plan = createSettingsExecutionPlan(query.prompt);
    assert.equal(plan.scenario, `settings-${query.id}`);
    assert.ok(Number.isFinite(plan.durationMs) && plan.durationMs >= 40000 && plan.durationMs < 75000, `Expanded ${query.id} execution lasts 40–75 seconds (${plan.durationMs}ms)`);
    assert.equal(plan.steps.filter(step => step.kind === 'tool').length, 5, 'Five distinct investigation stages');
    assert.ok(plan.steps.filter(step => step.kind === 'tool').flatMap(step => step.calls).length >= 12, 'Each scenario includes at least twelve tool calls');
    assert.equal(plan.steps.filter(step => step.kind === 'narration').length, 6, 'Narration connects the stages and the final result');
    assert.ok(plan.result.bullets.length >= 4 && plan.result.bullets.length <= 5, 'Final replies use a concise outcome and four or five bullets');
    assert.equal(plan.steps.at(-1).segments.length, plan.result.bullets.length + 2, 'Heading, bullets and closing note stream in order');
    for (const change of plan.result.changes) {
      assert.ok(change.added || change.removed, 'Suggested scenarios return concrete changes');
      assert.equal(change.before, settingsCodeFiles.find(file => file.path === change.path)?.code ?? '', 'The diff baseline is the original configuration, not invented text');
      assert.equal(change.lines.filter(line => line.kind !== 'added').map(line => line.text).join('\n'), change.before, 'Diff reconstructs the original configuration');
      assert.equal(change.lines.filter(line => line.kind !== 'removed').map(line => line.text).join('\n'), change.after, 'Diff reconstructs the proposed configuration');
      assert.equal(change.added, change.lines.filter(line => line.kind === 'added').length);
      assert.equal(change.removed, change.lines.filter(line => line.kind === 'removed').length);
    }
    assert.equal(getAgentExecutionFrame(0, plan.steps).steps.length, 0);
    assert.equal(getAgentExecutionFrame(plan.durationMs, plan.steps).steps.length, plan.steps.length);
    assert.ok(!JSON.stringify(plan).includes('Hatch pet'), 'Settings uses scenario-specific text, not the sidebar placeholder');
    const followup = createSettingsExecutionPlan('再详细说明一下', [query.prompt]);
    assert.equal(followup.scenario, plan.scenario, 'Follow-ups inherit the original settings scenario');
    const key = `settings-test:${query.id}`;
    beginSettingsExecution(key);
    const props = { prompt: query.prompt, executionId: key };
    const render = mount(SettingsExecutionMessage);
    let tree = render(props);
    let cleanup = render.flushEffects();
    let cleanupLayout = render.flushLayoutEffects();
    assert.equal(tree.props['data-execution-state'], 'running');
    assert.ok(find(tree, byName('CodeMLogo')), 'Running messages show the existing animated brand asset');
    assert.ok(!find(tree, byName('ReplyCompletion')), 'Do not claim completion while running');
    assert.ok(!find(tree, byName('SettingsChangeDiff')), 'Do not show a final change artifact during execution');
    advanceTimers(1000);
    tree = render(props);
    const partial = textContent(find(tree, node => node.props.className === 'settings-execution-narration'));
    assert.ok(partial.length > 0 && partial.length < plan.steps[0].segments[0].text.length, 'Narration streams progressively');
    assert.match(textContent(find(tree, node => node.props.role === 'timer')), /Working 00:01/);
    advanceTimers(executionDuration([plan.steps[0]]));
    tree = render(props);
    const log = find(tree, byName('ExecutionLog'));
    assert.ok(log && log.props.running, 'Tool shimmer follows narration');
    const expanded = mount(ExecutionLog)(log.props);
    assert.equal(expanded.type, 'details', 'Tool groups support native keyboard and pointer expansion');
    assert.equal(nodes(expanded).filter(node => node.type === 'li').length, log.props.calls.length);
    assert.ok(log.props.calls.every(call => call.name && call.detail), 'Each tool has a real configuration result');
    const completedLog = mount(ExecutionLog)({ ...log.props, running: false });
    const rows = nodes(completedLog).filter(node => node.type === 'li');
    rows.forEach((row, index) => assert.equal(textContent(row), `${log.props.calls[index].name}：${log.props.calls[index].detail}`, 'Tool details follow the name inline'));
    assert.ok(!find(completedLog, node => node.type === 'small'), 'Tool rows have no subtitle');

    assert.ok(!find(tree, node => node.props['aria-label'] === '停止生成'), 'The transcript never contains a stop button');
    cleanupLayout(); cleanupLayout = render.flushLayoutEffects();
    const control = mount(() => useSettingsExecutionControl('settings-test'))();
    assert.equal(control.key, key);
    control.stop();
    cleanup(); cleanupLayout(); tree = render(props); cleanup = render.flushEffects(); cleanupLayout = render.flushLayoutEffects();
    const stoppedText = textContent(tree);
    assert.equal(tree.props['data-execution-state'], 'stopped');
    assert.ok(!find(tree, byName('CodeMLogo')));
    assert.ok(!find(tree, node => byName('ExecutionLog')(node) && node.props.running));
    advanceTimers(5000);
    assert.equal(textContent(render(props)), stoppedText, 'Stopping freezes text and time');
    assert.equal(readSettingsExecution(key, plan.durationMs).status, 'stopped');
    assert.equal(mount(SettingsExecutionMessage)(props).props['data-execution-state'], 'stopped', 'Reload preserves a stopped run');

    find(render(props), node => node.type === 'button' && node.props.children === '重新执行').props.onClick();
    cleanup(); cleanupLayout(); tree = render(props); cleanup = render.flushEffects(); cleanupLayout = render.flushLayoutEffects();
    assert.equal(tree.props['data-execution-state'], 'running');
    advanceTimers(plan.durationMs + 100);
    tree = render(props);
    assert.equal(tree.props['data-execution-state'], 'awaiting-confirmation', 'Execution must stop before the final answer');
    assert.ok(!find(tree, node => node.props['aria-label'] === '最终回复'));
    assert.ok(!find(tree, byName('SettingsChangeDiff')));
    assert.equal(readSettingsExecution(key, plan.durationMs, plan.confirmationAtMs).elapsedMs, plan.confirmationAtMs);
    assert.ok(!find(tree, byName('SettingsConfirmationCard')), 'Confirmation is not rendered in the transcript');
    cleanupLayout(); cleanupLayout = render.flushLayoutEffects();
    const confirmation = mount(() => useSettingsExecutionControl('settings-test'))().confirmation;
    assert.ok(confirmation, 'The waiting execution exposes confirmation to the bottom composer');
    assert.equal(confirmation.scenario, plan.scenario);
    const waitingText = textContent(tree);
    advanceTimers(60000);
    assert.equal(textContent(render(props)), waitingText, 'Waiting freezes the timer and final answer');
    const restoredPending = mount(SettingsExecutionMessage)(props);
    assert.equal(restoredPending.props['data-execution-state'], 'awaiting-confirmation', 'Reload preserves the confirmation gate');
    confirmation.onConfirm();
    const consent = readSettingsExecution(key, plan.durationMs, plan.confirmationAtMs).confirmedAt;
    confirmation.onConfirm();
    assert.equal(readSettingsExecution(key, plan.durationMs, plan.confirmationAtMs).confirmedAt, consent, 'Double confirmation does not restart the answer');
    assert.equal(mount(SettingsExecutionMessage)(props).props['data-execution-state'], 'running', 'Approved reload resumes the answer');
    cleanup(); cleanupLayout(); render(props); cleanup = render.flushEffects(); cleanupLayout = render.flushLayoutEffects();
    advanceTimers(1000);
    tree = render(props);
    assert.ok(find(tree, node => node.props['aria-label'] === '最终回复'), 'Confirmation starts streaming the result');
    assert.equal(tree.props['data-execution-state'], 'running');
    assert.ok(!find(tree, byName('SettingsConfirmationCard')));
    advanceTimers(plan.durationMs);
    tree = render(props);
    assert.equal(tree.props['data-execution-state'], 'complete');
    const completion = find(tree, byName('ReplyCompletion'));
    assert.ok(completion);
    const completedGroup = mount(completion.type)(completion.props);
    assert.equal(completedGroup.type, 'details', 'Completed work uses a native expandable group');
    assert.equal(completedGroup.props.open, undefined, 'Completed process starts collapsed');
    assert.ok(find(completedGroup, node => node.type === 'summary'), 'The completion heading is keyboard and pointer operable');
    assert.equal(nodes(completedGroup).filter(byName('ExecutionLog')).length, 5, 'All tools remain available inside the completed group');
    assert.ok(!find(completedGroup, node => node.props['aria-label'] === '最终回复'), 'Final reply stays outside the collapsed process');
    assert.ok(!find(tree, byName('CodeMLogo')), 'Completion stops the animated brand mark');
    assert.ok(find(tree, node => node.props.className === 'settings-execution-result'));
    assert.equal(nodes(find(tree, node => node.props['aria-label'] === '最终回复')).filter(node => node.type === 'li').length, plan.result.bullets.length);
    assert.ok(find(tree, byName('SettingsChangeDiff')), 'The change block follows the final reply');
    assert.ok(!textContent(tree).includes('基于当前本地示例配置分析'), 'Remove the redundant source footer');
    assert.equal(readSettingsExecution(key, plan.durationMs).status, 'complete');
    cleanup(); cleanupLayout();
    assert.equal(mount(() => useSettingsExecutionControl('settings-test'))(), null, 'Completion releases the composer control');
    const restored = mount(SettingsExecutionMessage);
    assert.equal(restored(props).props['data-execution-state'], 'complete', 'Completed history does not replay');
    restored.flushEffects()();
  }

  // The live message controls the actual bottom composer without clearing its draft.
  const conversation = createSettingsConversation('新建字段，用于检查输入框停止生成交互');
  const key = settingsExecutionKey(conversation.id);
  const prompt = conversation.title;
  const plan = createSettingsExecutionPlan(prompt);
  beginSettingsExecution(key);
  setLocation(`https://example.test/chat/${encodeURIComponent(conversation.id)}`);
  const renderChat = mount(appElement.type);
  let chat = renderChat();
  const renderMessage = mount(SettingsExecutionMessage);
  const messageProps = { prompt, executionId: key };
  renderMessage(messageProps);
  let cleanupMessage = renderMessage.flushEffects();
  let cleanupMessageLayout = renderMessage.flushLayoutEffects();
  chat = renderChat();
  let composer = find(chat, node => node.type === 'form' && node.props.className === 'composer');
  const stopButton = find(composer, node => node.props['aria-label'] === '停止生成');
  assert.ok(stopButton, 'Stop belongs to the bottom input form');
  assert.equal(stopButton.props.className, 'send-button stop-button', 'Stop reuses the send button dimensions and placement');
  assert.equal(stopButton.props.type, 'button', 'Stopping must not submit the current draft');
  assert.equal(find(stopButton, node => node.type === 'img').props.width, '34');
  assert.equal(find(stopButton, node => node.type === 'img').props.height, '34');
  assert.ok(!find(composer, node => node.props['aria-label'] === '发送消息'), 'Stop replaces send rather than adding another action');
  assert.equal(mount(() => useSettingsExecutionControl('another-conversation'))(), null, 'Running controls are scoped to the conversation');
  find(composer, node => node.type === 'textarea').props.onChange({ target: { value: '保留我的下一条草稿' } });
  chat = renderChat();
  composer = find(chat, node => node.type === 'form' && node.props.className === 'composer');
  const countBefore = sentMessages(chat).length;
  composer.props.onSubmit({ preventDefault() {} });
  assert.equal(sentMessages(renderChat()).length, countBefore, 'Enter/form submission cannot start an overlapping execution');
  find(composer, node => node.props['aria-label'] === '停止生成').props.onClick();
  cleanupMessage(); cleanupMessageLayout();
  const stoppedMessage = renderMessage(messageProps);
  cleanupMessage = renderMessage.flushEffects(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  assert.equal(stoppedMessage.props['data-execution-state'], 'stopped');
  chat = renderChat();
  composer = find(chat, node => node.type === 'form' && node.props.className === 'composer');
  assert.ok(find(composer, node => node.props['aria-label'] === '发送消息'), 'Stopping restores send');
  assert.equal(find(composer, node => node.type === 'textarea').props.value, '保留我的下一条草稿');
  find(stoppedMessage, node => node.type === 'button' && node.props.children === '重新执行').props.onClick();
  cleanupMessage(); cleanupMessageLayout(); renderMessage(messageProps);
  cleanupMessage = renderMessage.flushEffects(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  assert.ok(find(renderChat(), node => node.props['aria-label'] === '停止生成'), 'Retry restores the bottom stop control');
  advanceTimers(plan.durationMs + 100);
  const waitingMessage = renderMessage(messageProps);
  assert.equal(waitingMessage.props['data-execution-state'], 'awaiting-confirmation');
  cleanupMessageLayout(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  chat = renderChat();
  const interceptedComposer = find(chat, node => node.props.className === 'composer-wrap');
  const pendingCard = find(interceptedComposer, byName('SettingsConfirmationCard'));
  assert.ok(pendingCard, 'Confirmation occupies the existing bottom composer container');
  assert.ok(!find(interceptedComposer, node => node.type === 'form' || node.type === 'textarea'), 'Confirmation replaces the entire input form');
  assert.ok(!find(chat, node => node.type === 'dialog' || node.props['aria-modal']), 'The conversation has no modal or overlay');
  assert.ok(!find(waitingMessage, byName('SettingsConfirmationCard')), 'Only one confirmation card appears, at the bottom');
  pendingCard.props.onCancel();
  cleanupMessage(); cleanupMessageLayout();
  const canceledMessage = renderMessage(messageProps);
  cleanupMessage = renderMessage.flushEffects(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  assert.equal(canceledMessage.props['data-execution-state'], 'stopped', 'Cancel stops the pending execution');
  chat = renderChat();
  assert.ok(!find(chat, byName('SettingsConfirmationCard')));
  assert.equal(find(chat, node => node.type === 'textarea').props.value, '保留我的下一条草稿', 'Cancel restores the exact composer draft');
  assert.ok(find(chat, node => node.props['aria-label'] === '发送消息'));
  assert.ok(!find(canceledMessage, node => node.props['aria-label'] === '最终回复'));
  find(canceledMessage, node => node.type === 'button' && node.props.children === '重新执行').props.onClick();
  cleanupMessage(); cleanupMessageLayout(); renderMessage(messageProps);
  cleanupMessage = renderMessage.flushEffects(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  advanceTimers(plan.durationMs);
  renderMessage(messageProps); cleanupMessageLayout(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  find(renderChat(), byName('SettingsConfirmationCard')).props.onConfirm();
  cleanupMessage(); cleanupMessageLayout(); renderMessage(messageProps);
  cleanupMessage = renderMessage.flushEffects(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  advanceTimers(plan.durationMs);
  assert.equal(renderMessage(messageProps).props['data-execution-state'], 'complete');
  cleanupMessageLayout(); cleanupMessageLayout = renderMessage.flushLayoutEffects();
  assert.ok(find(renderChat(), node => node.props['aria-label'] === '发送消息'), 'Natural completion restores send');
  cleanupMessage(); cleanupMessageLayout();

  const permission = createSettingsExecutionPlan(settingsQueries[1].prompt);
  assert.ok(permission.result.changes[0].before.includes('"*"'), 'Permissions come from the Code configuration');
  assert.equal(permission.result.kind, 'draft');
  assert.ok(permission.result.changes.some(change => change.added > 0 && change.removed > 0), 'Permission proposals contain actual additions and deletions');
  const roleChange = permission.result.changes[0];
  const oldMember = JSON.parse(roleChange.before).roles.find(role => role.name === '成员');
  const newMember = JSON.parse(roleChange.after).roles.find(role => role.name === '成员');
  assert.ok(oldMember.permissions.includes('edit_own'));
  assert.deepEqual(newMember.permissions, ['read', 'comment']);
  assert.ok(JSON.parse(roleChange.after).roles.some(role => role.name === '只读成员'));
  assert.ok(roleChange.lines.some(line => line.kind === 'removed' && line.text.includes('edit_own')), 'Deleted permissions are visible in the diff');
  const namedMember = createSettingsExecutionPlan('请查询 alex@example.com 在 Agile Development 的权限配置');
  assert.ok(namedMember.result.bullets.join('').includes('alex@example.com'));
  assert.ok(namedMember.result.changes.some(change => change.after.includes('alex@example.com')));
  const replacement = createSettingsExecutionPlan('检查优先级字段的所有引用，并替换为新字段');
  assert.ok(replacement.result.bullets.join('').includes('priority'));
  assert.ok(replacement.result.changes.some(change => change.path === '工作项管理/需求/页面布局'));

  const security = createSettingsExecutionPlan('在研发流程中新增安全审核节点，设置合规审核员角色和是否需要安全审核的必填开关');
  assert.equal(security.scenario, 'settings-create-workflow', 'Node changes take precedence over an incidental role mention');
  assert.equal(security.result.changes.length, 6);
  assert.ok(security.result.bullets.join('').includes('安全审核'));
  assert.ok(security.result.changes.some(change => change.after.includes('"compliance_reviewer"')));
  assert.ok(!security.result.title.includes('已发布'), 'A generated draft does not claim to have published space changes');
  const fieldDraft = createSettingsExecutionResult('create-field', '新增一个预算字段，使用数字控件，key: budget');
  assert.ok(fieldDraft.title.includes('预算'));
  assert.ok(fieldDraft.changes[0].after.includes('"key": "budget"'));
  assert.ok(fieldDraft.changes[0].after.includes('"type": "number"'));
  const workflowQuery = createSettingsExecutionPlan('查询当前流程的配置');
  assert.ok(workflowQuery.result.title.includes('流程'));
  assert.ok(workflowQuery.result.changes.some(change => change.path.includes('流程管理')));
  const fieldQuery = createSettingsExecutionPlan('查询优先级字段的配置和引用');
  assert.equal(fieldQuery.result.kind, 'draft', 'Field queries include a reviewable display-configuration proposal');
  assert.ok(fieldQuery.result.changes.some(change => change.added > 0 && change.removed > 0));
  assert.ok(fieldQuery.result.title.includes('优化草案'));
  assert.ok(fieldQuery.result.changes.some(change => change.after.includes('priority')));
  assert.equal(configurationDiff('a\nb', 'a\nc').filter(line => line.kind === 'added').length, 1);
  assert.equal(configurationDiff('a\nb', 'a\nc').filter(line => line.kind === 'removed').length, 1);

  const confirmationCopies = settingsQueries.map(query => {
    const plan = createSettingsExecutionPlan(query.prompt);
    assert.ok(plan.confirmationAtMs < plan.durationMs, 'Confirmation precedes the first final-answer character');
    return settingsConfirmationCopy(plan.scenario, plan.result);
  });
  assert.equal(new Set(confirmationCopies.map(copy => JSON.stringify(copy))).size, 5, 'Each suggested scenario has its own confirmation scope');
  assert.match(JSON.stringify(settingsConfirmationCopy('settings-create-field', fieldDraft)), /预算/);
  assert.match(JSON.stringify(settingsConfirmationCopy(security.scenario, security.result)), /安全审核.*合规审核员/);
  assert.match(JSON.stringify(settingsConfirmationCopy(permission.scenario, permission.result)), /权限调整.*移除创建.*只读成员/);
  assert.ok(!JSON.stringify(confirmationCopies).includes('develop'), 'Do not invent a destination environment');
  let confirmations = 0, cancellations = 0;
  const renderCard = mount(SettingsConfirmationCard);
  const card = renderCard({ scenario: security.scenario, result: security.result, onConfirm: () => confirmations++, onCancel: () => cancellations++ });
  assert.equal(card.type, 'section', 'HITL is an inline card');
  assert.equal(card.props['aria-modal'], undefined);
  assert.equal(card.props.onClick, undefined, 'Reading or clicking outside the card does not dismiss it');
  const cancelNode = new TestNode();
  find(card, node => node.props.className === 'settings-confirmation-cancel').props.ref.current = cancelNode;
  renderCard.flushEffects()();
  assert.equal(testDocument.activeElement, cancelNode, 'Keyboard focus lands on the safe cancel action');
  const shortcut = overrides => ({ key: 'Enter', metaKey: false, ctrlKey: false, repeat: false, nativeEvent: { isComposing: false }, preventDefault() {}, stopPropagation() {}, ...overrides });
  card.props.onKeyDown(shortcut({ metaKey: true, nativeEvent: { isComposing: true } }));
  card.props.onKeyDown(shortcut({ metaKey: true, repeat: true }));
  card.props.onKeyDown(shortcut({ metaKey: true, nativeEvent: { keyCode: 229 } }));
  card.props.onKeyDown(shortcut({}));
  assert.equal(confirmations, 0, 'IME, repeated keys and unmodified Enter do not invoke the shortcut');
  card.props.onKeyDown(shortcut({ metaKey: true }));
  card.props.onKeyDown(shortcut({ ctrlKey: true }));
  find(card, node => node.props.className === 'settings-confirmation-confirm').props.onClick();
  assert.equal(confirmations, 3, 'Keyboard shortcuts and confirm button work');
  card.props.onKeyDown(shortcut({ key: 'Escape' }));
  find(card, node => node.props.className === 'settings-confirmation-cancel').props.onClick();
  assert.equal(cancellations, 2, 'Escape and cancel restore the input through the same action');
  assert.equal(confirmations, 3);
  const hitlProvenance = JSON.parse(readFileSync(resolve(root, 'public/assets/figma/settings-hitl/provenance.json'), 'utf8'));
  assert.equal(hitlProvenance.nodeId, '140:71275');
  for (const asset of hitlProvenance.assets) {
    const bytes = readFileSync(resolve(root, 'public/assets/figma/settings-hitl', asset.file));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }

  const reviewRequests = [];
  const diffProps = { result: security.result, executionId: 'settings-diff-test:security', onReviewChanges: review => reviewRequests.push(review) };
  const renderDiff = mount(SettingsChangeDiff);
  let diff = renderDiff(diffProps);
  assert.equal(nodes(diff).filter(byName('ConfigDiffRow')).length, 4, 'Figma card initially shows four rows');
  const totalProperties = security.result.changes.reduce((sum, change) => sum + reviewProperties(change).filter(property => property.changed).length, 0);
  assert.equal(find(diff, byName('SettingsChangeCount')).props.count, totalProperties, 'The total includes changes hidden behind show more');
  const more = find(diff, node => node.props.className === 'settings-diff-more');
  assert.equal(more.props['aria-expanded'], false);
  more.props.onClick(); diff = renderDiff(diffProps);
  assert.equal(nodes(diff).filter(byName('ConfigDiffRow')).length, 6, 'Show more reveals remaining changes');
  assert.equal(find(diff, node => node.props.className === 'settings-diff-more').props['aria-expanded'], true);
  find(diff, node => node.props.className === 'settings-diff-more').props.onClick(); diff = renderDiff(diffProps);
  assert.equal(nodes(diff).filter(byName('ConfigDiffRow')).length, 4);
  const row = find(diff, byName('ConfigDiffRow'));
  const renderedRow = mount(row.type)(row.props);
  assert.equal(renderedRow.type, 'button', 'Diff rows use native keyboard-operable buttons');
  assert.equal(renderedRow.props.type, 'button');
  assert.ok(!find(renderedRow, node => node.type === 'pre'), 'Rows open review instead of expanding code inline');
  const review = find(diff, node => node.props.className === 'settings-diff-review');
  assert.equal(textContent(review), 'review 变更');
  review.props.onClick(); diff = renderDiff(diffProps);
  assert.equal(reviewRequests.length, 1);
  assert.equal(reviewRequests[0].result, security.result, 'Review receives every actual before/after snapshot');
  assert.equal(reviewRequests[0].executionId, diffProps.executionId);
  assert.equal(nodes(diff).filter(byName('ConfigDiffRow')).length, 4, 'Review opens the preview without expanding the compact card');
  assert.equal(diff.props['data-draft-state'], 'ready', 'Review does not discard or apply a draft');
  find(diff, node => node.props.className === 'settings-diff-review').props.onClick(); diff = renderDiff(diffProps);
  assert.equal(reviewRequests.length, 2);
  renderedRow.props.onClick();
  assert.equal(reviewRequests.at(-1).path, row.props.change.path, 'A row requests its exact configuration path');
  assert.equal(reviewRequests.at(-1).result, security.result);
  find(diff, node => node.props.className === 'settings-diff-more').props.onClick(); diff = renderDiff(diffProps);
  const lastRow = nodes(diff).filter(byName('ConfigDiffRow')).at(-1);
  mount(lastRow.type)(lastRow.props).props.onClick();
  assert.equal(reviewRequests.at(-1).path, security.result.changes.at(-1).path, 'Show-more rows also navigate directly');
  const totals = find(diff, byName('SettingsChangeCount')).props;
  assert.equal(totals.count, totalProperties, 'Showing more does not change the property total');
  find(diff, node => node.props.className === 'settings-diff-undo').props.onClick(); diff = renderDiff(diffProps);
  assert.equal(diff.props['data-draft-state'], 'discarded');
  assert.equal(find(diff, node => node.props.className === 'settings-diff-undo').props.disabled, true);
  assert.equal(mount(SettingsChangeDiff)(diffProps).props['data-draft-state'], 'discarded', 'Reload preserves draft withdrawal');
  assert.equal(mount(SettingsChangeDiff)({ ...diffProps, executionId: 'settings-diff-test:other' }).props['data-draft-state'], 'ready', 'Withdrawal is isolated to this execution');
  const permissionDiff = mount(SettingsChangeDiff)({ result: permission.result, executionId: 'settings-diff-test:permission' });
  assert.equal(permissionDiff.props['data-draft-state'], 'ready');
  assert.ok(find(permissionDiff, node => node.props.className === 'settings-diff-undo'));
  const permissionTotals = find(permissionDiff, byName('SettingsChangeCount'));
  assert.equal(textContent(mount(permissionTotals.type)(permissionTotals.props)), 'M14 个属性变更', 'Count changed properties, not added and removed JSON lines');
  const permissionCounts = nodes(permissionDiff).filter(byName('ConfigDiffRow')).map(row => {
    const count = find(mount(row.type)(row.props), byName('SettingsChangeCount'));
    return textContent(mount(count.type)(count.props));
  });
  assert.deepEqual(permissionCounts, ['M3 个属性变更', 'A4 个属性变更', 'A7 个属性变更'], 'Each row matches its property difference table, excluding unchanged properties');
  const mixedPropertyChange = {
    ...permission.result.changes[0],
    before: JSON.stringify({ name: '保留名称', enabled: false, obsolete: '旧属性' }, null, 2),
    after: JSON.stringify({ name: '保留名称', enabled: true, added: null }, null, 2),
  };
  mixedPropertyChange.lines = configurationDiff(mixedPropertyChange.before, mixedPropertyChange.after);
  mixedPropertyChange.added = mixedPropertyChange.lines.filter(line => line.kind === 'added').length;
  mixedPropertyChange.removed = mixedPropertyChange.lines.filter(line => line.kind === 'removed').length;
  const mixedPropertyDiff = mount(SettingsChangeDiff)({ result: { ...permission.result, changes: [mixedPropertyChange] }, executionId: 'settings-diff-test:property-count' });
  assert.equal(find(mixedPropertyDiff, byName('SettingsChangeCount')).props.count, 3, 'Count a modification once, include added null and deleted properties, and exclude unchanged properties');
  const unchanged = { ...permission.result.changes[0], added: 0, removed: 0, after: permission.result.changes[0].before };
  const filteredDiff = mount(SettingsChangeDiff)({ result: { ...permission.result, changes: [unchanged, ...permission.result.changes.slice(1)] }, executionId: 'settings-diff-test:mixed' });
  assert.equal(nodes(filteredDiff).filter(byName('ConfigDiffRow')).length, permission.result.changes.length - 1, 'Unchanged rows are omitted');
  const addedTotals = find(filteredDiff, byName('SettingsChangeCount'));
  assert.equal(textContent(mount(addedTotals.type)(addedTotals.props)), 'A11 个属性变更', 'A summary containing only additions uses A and excludes unchanged configurations');
  assert.equal(mount(SettingsChangeDiff)({ result: { ...permission.result, changes: [unchanged] }, executionId: 'settings-diff-test:empty' }), null, 'Never render an empty no-changes artifact');
  const provenance = JSON.parse(readFileSync(resolve(root, 'public/assets/figma/settings-diff/provenance.json'), 'utf8'));
  assert.equal(provenance.nodeId, '140:70942');
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(root, 'public/assets/figma/settings-diff', asset.file));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(bytes.toString().includes('<svg'));
  }
  assert.equal(JSON.stringify(settingsCodeFiles), originalConfigs, 'Analysis never mutates space configuration');

  // Review uses the shared artifact container, with the exact message's snapshots.
  const { SettingsReviewPreview } = load(resolve(root, 'src/SettingsReviewPreview.tsx'));
  const { artifactTabsReducer } = load(resolve(root, 'src/artifact-tabs.ts'));
  const { discardSettingsDraft } = load(resolve(root, 'src/settings-draft-state.ts'));
  const reviewConversation = createSettingsConversation('查询具体成员权限，检查 review 变更卡片');
  setLocation(`https://example.test/chat/${encodeURIComponent(reviewConversation.id)}`);
  const reviewApp = mount(appElement.type);
  let reviewRoute = reviewApp();
  const assistant = find(reviewRoute, byName('AssistantMessage'));
  const executionNode = find(mount(assistant.type)(assistant.props), byName('SettingsExecutionMessage'));
  const diffNode = find(mount(executionNode.type)(executionNode.props), byName('SettingsChangeDiff'));
  const liveCard = mount(diffNode.type)(diffNode.props);
  find(liveCard, node => node.props.className === 'settings-diff-review').props.onClick();
  reviewRoute = reviewApp();
  const reviewTab = () => find(reviewRoute, node => node.props.id === 'artifact-tab-settings-review');
  let preview = find(reviewRoute, byName('SettingsReviewPreview'));
  assert.equal(textContent(reviewTab()), 'review 变更');
  assert.equal(reviewTab().props['aria-controls'], 'artifact-panel-settings-review');
  assert.equal(preview.props.review.result, diffNode.props.result);
  assert.equal(preview.props.review.executionId, diffNode.props.executionId);
  const tabIcon = find(reviewTab(), node => node.type === 'img' && node.props.src === '/assets/figma/settings-review/tab-icon.svg');
  assert.equal(tabIcon.props.width, '20');
  assert.equal(tabIcon.props.height, '20');
  assert.equal(tabIcon.props.className, 'icon', 'Use the complete Figma export as a fixed-size tab icon');
  assert.ok(find(reviewRoute, node => node.props.className === 'preview-panel'), 'Reuse the report preview container');
  assert.ok(reviewRoute.props.className.includes('mobile-preview'), 'Opening review shows the mobile preview pane');
  assert.ok(!find(reviewRoute, byName('ReportPreview')), 'Settings review does not open an unrelated report');
  find(liveCard, node => node.props.className === 'settings-diff-review').props.onClick(); reviewRoute = reviewApp();
  assert.equal(nodes(reviewRoute).filter(node => node.props.id === 'artifact-tab-settings-review').length, 1, 'Repeated review deduplicates the tab');
  const allReviewKey = preview.key;
  let previousReviewKey = allReviewKey;
  for (const entry of nodes(liveCard).filter(byName('ConfigDiffRow'))) {
    mount(entry.type)(entry.props).props.onClick(); reviewRoute = reviewApp();
    preview = find(reviewRoute, byName('SettingsReviewPreview'));
    assert.equal(preview.props.review.path, entry.props.change.path);
    assert.equal(preview.props.review.executionId, diffNode.props.executionId);
    assert.notEqual(preview.key, previousReviewKey, 'Changing paths remounts at the requested configuration');
    const focused = mount(preview.type)(preview.props);
    assert.ok(!find(focused, node => node.props['aria-label'] === '搜索配置变更'), 'Single-row review opens the requested card without search');
    assert.ok(find(focused, node => node.props['data-review-mode'] === 'single'), 'A row opens a single-file review');
    const focusedCards = nodes(focused).filter(node => node.props['data-review-path']);
    assert.equal(focusedCards.length, 1, 'Single-row review uses the same card layout');
    assert.equal(focusedCards[0].props['data-review-path'], entry.props.change.path);
    assert.equal(find(focusedCards[0], node => node.props.className === 'settings-review-card-toggle').props['aria-expanded'], true);
    assert.equal(find(find(focused, node => node.props['aria-label'] === '当前配置路径'), node => node.props['aria-current'] === 'location').props.children, entry.props.change.path.split('/').filter(Boolean).at(-1));
    assert.equal(nodes(reviewRoute).filter(node => node.props.id === 'artifact-tab-settings-review').length, 1);
    previousReviewKey = preview.key;
  }
  find(liveCard, node => node.props.className === 'settings-diff-review').props.onClick(); reviewRoute = reviewApp();
  preview = find(reviewRoute, byName('SettingsReviewPreview'));
  assert.equal(preview.props.review.path, undefined);
  assert.equal(preview.key, allReviewKey);
  assert.equal(nodes(mount(preview.type)(preview.props)).filter(node => node.props['data-review-path']).length, diffNode.props.result.changes.filter(change => change.added || change.removed).length, 'The full review button shows one card per change');
  find(reviewRoute, node => node.props.label === '关闭review 变更标签页').props.onClick(); reviewRoute = reviewApp();
  assert.ok(!find(reviewRoute, byName('SettingsReviewPreview')));
  assert.ok(reviewRoute.props.className.includes('mobile-chat'));
  find(reviewRoute, node => node.props.label === '打开产物预览').props.onClick(); reviewRoute = reviewApp();
  assert.ok(find(reviewRoute, byName('SettingsReviewPreview')), 'The conversation toolbar reopens the last review');
  assert.ok(reviewRoute.props.className.includes('mobile-preview'));
  assistant.props.onReviewChanges({ executionId: 'another-settings-message', result: security.result }); reviewRoute = reviewApp();
  assert.equal(find(reviewRoute, byName('SettingsReviewPreview')).props.review.result, security.result, 'Another message replaces the review data');
  find(reviewRoute, node => node.props.label === '新建对话').props.onClick(); reviewRoute = reviewApp();
  assert.ok(!find(reviewRoute, byName('SettingsReviewPreview')), 'Changing conversation clears the old review');
  let artifactState = { items: ['report', 'framework'], active: 'report' };
  artifactState = artifactTabsReducer(artifactState, { type: 'open', id: 'settings-review' });
  artifactState = artifactTabsReducer(artifactState, { type: 'open', id: 'settings-review' });
  assert.equal(artifactState.items.length, 3);
  artifactState = artifactTabsReducer(artifactState, { type: 'close', id: 'settings-review' });
  assert.equal(artifactState.active, 'framework', 'Closing review preserves neighboring report tabs');

  const previewProps = { review: { executionId: 'review-preview:permissions', result: permission.result }, active: true };
  const renderReview = mount(SettingsReviewPreview);
  let reviewTree = renderReview(previewProps);
  const reviewElement = label => find(reviewTree, node => node.props['aria-label'] === label);
  const reviewCards = () => nodes(reviewTree).filter(node => node.props['data-review-path']);
  const reviewCard = path => reviewCards().find(node => node.props['data-review-path'] === path);
  const cardToggle = path => find(reviewCard(path), node => node.props.className === 'settings-review-card-toggle');
  const cardContent = path => find(reviewCard(path), node => node.props.className === 'settings-review-comparison');
  const bulkToggle = () => find(reviewTree, node => node.props.className === 'settings-review-toggle-all');
  const propertyRows = () => nodes(reviewTree).filter(node => node.props['data-property']);
  assert.equal(reviewTree.props.hidden, false);
  assert.ok(!find(reviewTree, node => node.type === 'aside' || node.props['aria-label'] === '变更配置目录'), 'Review uses cards without a directory sidebar');
  assert.equal(reviewCards().length, permission.result.changes.length);
  const reviewTotal = () => find(find(reviewTree, node => node.props.className === 'settings-review-count'), byName('SettingsChangeCount'));
  assert.equal(JSON.stringify(reviewTotal().props), JSON.stringify(permissionTotals.props), 'Diff and review totals use identical property counts and status');
  assert.equal(textContent(mount(reviewTotal().type)(reviewTotal().props)), 'M14 个属性变更');
  for (const change of permission.result.changes) {
    const card = reviewCard(change.path);
    const toggle = cardToggle(change.path);
    const diffRow = nodes(permissionDiff).find(node => byName('ConfigDiffRow')(node) && node.props.change.path === change.path);
    assert.equal(JSON.stringify(find(card, byName('SettingsChangeCount')).props), JSON.stringify(find(mount(diffRow.type)(diffRow.props), byName('SettingsChangeCount')).props), 'Matching cards share both their property count and M/A display');
    assert.equal(toggle.props['aria-expanded'], true, 'All change cards start expanded');
    assert.equal(cardContent(change.path).props.id, toggle.props['aria-controls']);
    assert.equal(cardContent(change.path).props.hidden, false);
    assert.deepEqual(nodes(card).filter(node => node.props.scope === 'col').map(textContent), ['属性名称', '发布前', '发布后']);
    assert.equal(JSON.stringify(nodes(card).filter(node => node.props['data-property']).map(node => node.props['data-property'])), JSON.stringify(reviewProperties(change).map(row => row.path)), 'Each card renders its own complete property comparison');
    const beforeValues = nodes(card).filter(node => byName('PropertyValue')(node) && node.props.side === 'before');
    assert.equal(JSON.stringify(beforeValues.map(node => node.props.row)), JSON.stringify(reviewProperties(change)), 'Cards keep the exact original before/after snapshots');
  }
  const cardIds = nodes(reviewTree).filter(node => node.props.id).map(node => node.props.id);
  assert.equal(new Set(cardIds).size, cardIds.length, 'Card controls and content have unique IDs');
  assert.equal(bulkToggle().props['aria-label'], '收起全部');
  assert.equal(bulkToggle().props.title, '收起全部', 'Icon buttons retain a descriptive hover tooltip');
  assert.equal(textContent(bulkToggle()), '', 'Bulk control displays only an icon');
  assert.ok(find(bulkToggle(), node => node.type === 'img' && node.props.src === '/assets/figma/conversation-header/panel.svg'), 'Use the existing Figma stacked-panel icon for the bulk action');
  assert.ok(find(reviewTree, node => node.props.id === bulkToggle().props['aria-controls']));
  bulkToggle().props.onClick(); reviewTree = renderReview(previewProps);
  assert.ok(reviewCards().every(card => cardContent(card.props['data-review-path']).props.hidden), 'Collapse all hides every comparison');
  assert.equal(bulkToggle().props['aria-label'], '展开全部');
  assert.equal(bulkToggle().props.title, '展开全部');
  bulkToggle().props.onClick(); reviewTree = renderReview(previewProps);
  assert.ok(reviewCards().every(card => !cardContent(card.props['data-review-path']).props.hidden), 'Expand all restores every comparison');
  const permissionProperties = reviewProperties(permission.result.changes[0]);
  const permissionRow = permissionProperties.find(row => row.label === '角色 · 成员 · 权限');
  assert.ok(permissionRow.changed);
  assert.ok(permissionRow.before.includes('edit_own') && !permissionRow.after.includes('edit_own'));
  assert.ok(permissionProperties.some(row => row.label === '角色 · 只读成员 · 权限' && row.before === undefined && row.after.includes('read')));
  assert.ok(propertyRows().some(node => node.props['data-property'] === permissionRow.path));
  assert.ok(nodes(reviewTree).some(node => node.type === 'td' && node.props.className === 'is-before-change'));
  assert.ok(nodes(reviewTree).some(node => node.type === 'td' && node.props.className === 'is-after-change'));
  const newPermissionRow = permissionProperties.find(row => row.label === '角色 · 只读成员 · 权限');
  const newPermissionCell = nodes(propertyRows().find(node => node.props['data-property'] === newPermissionRow.path)).filter(node => node.type === 'td')[1];
  assert.equal(newPermissionCell.props.className, 'is-after-addition', 'New properties within modified configurations use the addition highlight');
  for (const change of permission.result.changes.filter(change => reviewChangeKind(change) === 'A')) {
    const afterCells = nodes(reviewCard(change.path)).filter(node => node.type === 'td' && find(node, value => byName('PropertyValue')(value) && value.props.side === 'after'));
    assert.ok(afterCells.length > 0);
    assert.ok(afterCells.every(node => node.props.className === 'is-after-addition'), 'All populated cells in newly added configurations use the addition highlight');
  }
  const firstChange = permission.result.changes[0];
  const secondChange = permission.result.changes[1];
  cardToggle(firstChange.path).props.onClick(); reviewTree = renderReview(previewProps);
  assert.equal(cardToggle(firstChange.path).props['aria-expanded'], false);
  assert.equal(bulkToggle().props['aria-label'], '展开全部', 'A mixed list offers to expand all cards');
  assert.equal(cardContent(firstChange.path).props.hidden, true, 'Collapsing hides the comparison accessibly');
  assert.equal(cardToggle(secondChange.path).props['aria-expanded'], true, 'Other cards stay expanded');
  cardToggle(secondChange.path).props.onClick(); reviewTree = renderReview(previewProps);
  cardToggle(firstChange.path).props.onClick(); reviewTree = renderReview(previewProps);
  assert.equal(cardContent(firstChange.path).props.hidden, false, 'A card can be expanded again');
  assert.equal(cardContent(secondChange.path).props.hidden, true, 'Cards expand and collapse independently');
  reviewElement('搜索配置变更').props.onChange({ target: { value: '完全不存在的配置' } }); reviewTree = renderReview(previewProps);
  assert.ok(textContent(reviewTree).includes('没有匹配的配置变更'));
  assert.equal(reviewCards().length, 0, 'Search filters the complete cards, including their tables');
  assert.equal(reviewTotal().props.count, 0);
  assert.equal(textContent(mount(reviewTotal().type)(reviewTotal().props)), '0 个属性变更', 'No matches show zero without an arbitrary status badge');
  assert.equal(bulkToggle().props.disabled, true, 'Bulk controls are disabled when there are no matching cards');
  reviewElement('搜索配置变更').props.onChange({ target: { value: secondChange.title } }); reviewTree = renderReview(previewProps);
  assert.equal(reviewCards().length, 1);
  assert.equal(textContent(mount(reviewTotal().type)(reviewTotal().props)), 'A4 个属性变更', 'Search totals summarize the visible property changes');
  assert.equal(reviewCards()[0].props['data-review-path'], secondChange.path);
  assert.equal(cardContent(secondChange.path).props.hidden, true, 'Searching preserves each card collapse state');
  reviewElement('搜索配置变更').props.onChange({ target: { value: secondChange.path } }); reviewTree = renderReview(previewProps);
  assert.ok(reviewCard(secondChange.path), 'Search also matches configuration paths');
  reviewElement('搜索配置变更').props.onChange({ target: { value: '' } }); reviewTree = renderReview(previewProps);
  assert.equal(reviewCards().length, permission.result.changes.length);
  reviewElement('筛选变更类型').props.ref.current = new TestNode();
  reviewElement('筛选变更类型').props.onClick(); reviewTree = renderReview(previewProps);
  const filters = find(reviewTree, node => node.props.id === 'settings-review-filter');
  nodes(filters).find(node => node.type === 'input').props.onChange(); reviewTree = renderReview(previewProps);
  assert.ok(!reviewCard(secondChange.path), 'Added-file filter removes A cards');
  assert.ok(reviewCard(firstChange.path), 'Modified cards remain visible');
  assert.equal(textContent(mount(reviewTotal().type)(reviewTotal().props)), 'M3 个属性变更', 'Type filtering updates the property total and status together');
  bulkToggle().props.onClick(); reviewTree = renderReview(previewProps);
  assert.equal(cardContent(firstChange.path).props.hidden, true, 'Bulk collapse applies to the filtered cards');
  bulkToggle().props.onClick(); reviewTree = renderReview(previewProps);
  assert.equal(cardContent(firstChange.path).props.hidden, false);
  nodes(find(reviewTree, node => node.props.id === 'settings-review-filter')).find(node => node.type === 'input').props.onChange(); reviewTree = renderReview(previewProps);
  assert.equal(cardContent(secondChange.path).props.hidden, true, 'Filtering preserves collapse state');
  find(reviewTree, node => node.props.id === 'settings-review-filter').props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); reviewTree = renderReview(previewProps);
  assert.equal(reviewElement('筛选变更类型').props['aria-expanded'], false);
  assert.equal(testDocument.activeElement, reviewElement('筛选变更类型').props.ref.current);
  discardSettingsDraft(previewProps.review.executionId); reviewTree = renderReview(previewProps);
  assert.ok(find(reviewTree, node => node.props.className === 'settings-review-withdrawn'), 'Withdrawal updates the open preview');
  assert.equal(renderReview({ ...previewProps, active: false }).props.hidden, true, 'Switching tabs keeps preview state without displaying it');
  reviewTree = renderReview(previewProps);
  assert.equal(cardContent(secondChange.path).props.hidden, true, 'Returning to the review preserves collapsed cards');
  const emptyReview = mount(SettingsReviewPreview)({ ...previewProps, review: { executionId: 'empty-review', result: { ...permission.result, changes: [] } } });
  assert.ok(textContent(emptyReview).includes('暂无配置变更'));
  assert.equal(find(emptyReview, node => node.props.className === 'settings-review-toggle-all').props.disabled, true);

  const renderBulkReview = mount(SettingsReviewPreview);
  let bulkTree = renderBulkReview(previewProps);
  const bulkControl = () => find(bulkTree, node => node.props.className === 'settings-review-toggle-all');
  const searchBulk = value => { find(bulkTree, node => node.props['aria-label'] === '搜索配置变更').props.onChange({ target: { value } }); bulkTree = renderBulkReview(previewProps); };
  searchBulk(firstChange.title);
  bulkControl().props.onClick(); bulkTree = renderBulkReview(previewProps);
  searchBulk('');
  assert.equal(nodes(bulkTree).filter(node => node.props.className === 'settings-review-comparison' && node.props.hidden).length, 1, 'Bulk actions leave cards outside the search results unchanged');
  bulkControl().props.onClick(); bulkTree = renderBulkReview(previewProps);
  assert.ok(nodes(bulkTree).filter(node => node.props.className === 'settings-review-comparison').every(node => !node.props.hidden), 'Expand all handles a mix of expanded and collapsed cards');

  const makeChange = (before, after) => ({ path: '工作项/字段/优先级', title: '优先级', before, after, lines: [], added: after ? 1 : 0, removed: before ? 1 : 0 });
  const optionRows = reviewProperties(makeChange('{"key":"priority","options":["P0","P1"]}', '{"key":"priority","options":["P0","P1","P2"]}'));
  assert.equal(optionRows[0].changed, false);
  assert.equal(optionRows[1].changed, true);
  assert.equal(optionRows[1].tags, true);
  assert.equal(reviewChangeKind(makeChange('', '{}')), 'A');
  assert.equal(reviewChangeKind(makeChange('{}', '')), 'M', 'Every non-addition uses M, including deletions');
  assert.equal(reviewChangeKind(makeChange('{}', '{"enabled":true}')), 'M');
  const deletedChange = makeChange('{"key":"priority","options":["P0"]}', '');
  const deletedReview = mount(SettingsReviewPreview)({ review: { executionId: 'deleted-review', result: { ...permission.result, changes: [deletedChange] } }, active: true });
  const deletedDiff = mount(SettingsChangeDiff)({ result: { ...permission.result, changes: [deletedChange] }, executionId: 'deleted-diff' });
  assert.equal(JSON.stringify(find(deletedDiff, byName('SettingsChangeCount')).props), JSON.stringify(find(deletedReview, byName('SettingsChangeCount')).props), 'Deletion counts and status remain aligned on both surfaces');
  assert.equal(find(deletedDiff, byName('SettingsChangeCount')).props.count, 2);
  assert.ok(find(deletedReview, node => node.props['data-review-path'] === deletedChange.path));
  assert.equal(find(deletedReview, byName('SettingsChangeCount')).props.kind, 'M', 'Deleted configurations use the same M summary in review');
  assert.ok(nodes(deletedReview).filter(byName('PropertyValue')).filter(node => node.props.side === 'after').every(node => node.props.row.after === undefined));
  assert.ok(!find(deletedReview, node => node.props.className === 'is-after-addition'), 'Removed properties never use the addition highlight');
  const nullChange = makeChange('{"value":null,"unchanged":0}', '{"value":false,"unchanged":0,"enabled":false}');
  const nullReview = mount(SettingsReviewPreview)({ review: { executionId: 'null-review', result: { ...permission.result, changes: [nullChange] } }, active: true });
  const nullCells = path => nodes(find(nullReview, node => node.props['data-property'] === path)).filter(node => node.type === 'td');
  assert.equal(nullCells('/value')[1].props.className, 'is-after-change', 'An existing null is a modification, not an addition');
  assert.equal(nullCells('/enabled')[1].props.className, 'is-after-addition', 'New false values still count as additions');
  assert.equal(nullCells('/unchanged')[1].props.className, undefined, 'Unchanged cells remain unhighlighted');
  assert.equal(reviewProperties(makeChange('old text', 'new text'))[0].after, 'new text', 'Text and manual files remain readable');
  assert.equal(reviewValue(false), '否');
  assert.equal(reviewValue(undefined), '—');
  assert.equal(reviewValue(null), 'null', 'Explicit null is not confused with a deleted property');
  const reordered = reviewProperties(makeChange('{"columns":[{"field":"a"},{"field":"b"}]}', '{"columns":[{"field":"b"},{"field":"a"}]}'));
  assert.equal(reordered.filter(row => row.changed).length, 1, 'Object-array reordering is a distinct order change');
  assert.ok(reordered.find(row => row.changed).label.endsWith('顺序'));
  const reviewProvenance = JSON.parse(readFileSync(resolve(root, 'public/assets/figma/settings-review/provenance.json'), 'utf8'));
  assert.equal(reviewProvenance.nodeId, '143:72412');
  for (const asset of reviewProvenance.assets) {
    const bytes = readFileSync(resolve(root, 'public/assets/figma/settings-review', asset.file));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(bytes.toString().includes('<svg'));
  }
  console.log('Settings review checks passed: shared preview tab, focused/full card views, property additions versus modifications, independent and bulk collapse/expand, filtered/search scope, state retention, draft withdrawal, empty/deleted configurations, message isolation, property snapshots and original Figma assets.');

  const scroll = Object.assign(new EventTarget(), { scrollHeight: 600, clientHeight: 200, scrollTop: 400 });
  const scrollProps = { prompt: settingsQueries[0].prompt, executionId: 'settings-test:scroll' };
  beginSettingsExecution(scrollProps.executionId);
  const renderScroll = mount(SettingsExecutionMessage);
  const scrollTree = renderScroll(scrollProps);
  scrollTree.props.ref.current = Object.assign(new TestNode(), { closest: () => scroll });
  const stopScroll = renderScroll.flushEffects();
  advanceTimers(500); renderScroll(scrollProps); renderScroll.flushLayoutEffects()();
  assert.equal(scroll.scrollTop, 600, 'New streamed text follows the viewport at the bottom');
  scroll.scrollTop = 50; scroll.dispatchEvent(new Event('scroll'));
  scroll.scrollHeight = 800;
  advanceTimers(500); renderScroll(scrollProps); renderScroll.flushLayoutEffects()();
  assert.equal(scroll.scrollTop, 50, 'Scrolling up to read earlier content disables automatic following');
  scroll.scrollTop = 600; scroll.dispatchEvent(new Event('scroll'));
  scroll.scrollHeight = 900;
  advanceTimers(500); renderScroll(scrollProps); renderScroll.flushLayoutEffects()();
  assert.equal(scroll.scrollTop, 900, 'Returning to the bottom resumes following');
  stopScroll();

  const cancelProps = { prompt: settingsQueries[2].prompt, executionId: 'settings-cancel:0' };
  const cancelPlan = createSettingsExecutionPlan(cancelProps.prompt);
  beginSettingsExecution(cancelProps.executionId);
  const renderCancel = mount(SettingsExecutionMessage);
  renderCancel(cancelProps); let cleanupCancel = renderCancel.flushEffects();
  advanceTimers(cancelPlan.durationMs);
  let cancelTree = renderCancel(cancelProps); let cleanupCancelLayout = renderCancel.flushLayoutEffects();
  assert.equal(cancelTree.props['data-execution-state'], 'awaiting-confirmation');
  const staleConfirmation = mount(() => useSettingsExecutionControl('settings-cancel'))().confirmation;
  mount(() => useSettingsExecutionControl('settings-cancel'))().stop();
  staleConfirmation.onConfirm();
  assert.equal(readSettingsExecution(cancelProps.executionId, cancelPlan.durationMs, cancelPlan.confirmationAtMs).status, 'stopped', 'A dismissed or stopped confirmation cannot approve a run');
  cleanupCancel(); cleanupCancelLayout();
  cancelTree = renderCancel(cancelProps); cleanupCancel = renderCancel.flushEffects();
  find(cancelTree, node => node.type === 'button' && node.props.children === '重新执行').props.onClick();
  cleanupCancel(); renderCancel(cancelProps); cleanupCancel = renderCancel.flushEffects();
  advanceTimers(cancelPlan.durationMs);
  cancelTree = renderCancel(cancelProps); cleanupCancelLayout = renderCancel.flushLayoutEffects();
  mount(() => useSettingsExecutionControl('settings-cancel'))().confirmation.onConfirm();
  cleanupCancel(); cleanupCancelLayout(); renderCancel(cancelProps);
  cleanupCancel = renderCancel.flushEffects(); cleanupCancelLayout = renderCancel.flushLayoutEffects();
  advanceTimers(1000); renderCancel(cancelProps);
  mount(() => useSettingsExecutionControl('settings-cancel'))().stop();
  cleanupCancel(); cleanupCancelLayout(); cancelTree = renderCancel(cancelProps); cleanupCancel = renderCancel.flushEffects();
  find(cancelTree, node => node.type === 'button' && node.props.children === '重新执行').props.onClick();
  cleanupCancel(); renderCancel(cancelProps); cleanupCancel = renderCancel.flushEffects();
  advanceTimers(cancelPlan.durationMs);
  assert.equal(renderCancel(cancelProps).props['data-execution-state'], 'awaiting-confirmation', 'Retry clears prior consent and requires confirmation again');
  cleanupCancel();

  const props = { prompt: settingsQueries[2].prompt, executionId: 'settings-test:reduced' };
  beginSettingsExecution(props.executionId);
  media.matches = true;
  const reduced = mount(SettingsExecutionMessage);
  reduced(props);
  const stopReduced = reduced.flushEffects();
  const reducedPending = reduced(props);
  assert.equal(reducedPending.props['data-execution-state'], 'awaiting-confirmation', 'Reduced motion must still require explicit confirmation');
  assert.ok(!find(reducedPending, node => node.props['aria-label'] === '最终回复'));
  const reducedLayoutCleanup = reduced.flushLayoutEffects();
  mount(() => useSettingsExecutionControl('settings-test'))().confirmation.onConfirm();
  reducedLayoutCleanup();
  stopReduced(); reduced(props); const stopReducedAnswer = reduced.flushEffects();
  assert.equal(reduced(props).props['data-execution-state'], 'complete', 'Reduced motion displays the result only after confirmation');
  stopReducedAnswer(); media.matches = false;
  beginSettingsExecution('settings-test:unmount');
  const unmount = mount(SettingsExecutionMessage);
  unmount({ ...props, executionId: 'settings-test:unmount' });
  const stopUnmount = unmount.flushEffects();
  stopUnmount();
  assert.equal(pendingTimers.size, timersBefore, 'Unmount and completion release every execution timer');
  const durationMs = createSettingsExecutionPlan(props.prompt).durationMs;
  const old = beginSettingsExecution('settings-test:catchup');
  testWindow.localStorage.setItem('meego:settings-execution:v1:settings-test:catchup', JSON.stringify({ ...old, startedAt: Date.now() - durationMs - 1000 }));
  assert.equal(readSettingsExecution('settings-test:catchup', durationMs).status, 'awaiting-confirmation', 'Elapsed wall time cannot bypass human confirmation');
  testWindow.localStorage.setItem('meego:settings-execution:v1:settings-test:corrupt', '{invalid');
  assert.equal(readSettingsExecution('settings-test:corrupt', durationMs).status, 'complete');
  const storage = testWindow.localStorage;
  testWindow.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  beginSettingsExecution('settings-test:blocked');
  assert.equal(readSettingsExecution('settings-test:blocked', durationMs).status, 'running', 'Storage failures retain execution in memory');
  testWindow.localStorage = storage;
  testWindow.matchMedia = previousMedia;
  console.log('Settings execution checks passed: extended streaming, composer stop/retry, collapsed completed process, concise query-based replies, persisted HITL gate/cancel/confirm, accurate expandable diffs, review all changes, show more, isolated persistent draft withdrawal, permission additions/deletions, composer replacement/cancel/draft preservation, Figma asset hashes, reduced motion, timer cleanup and no configuration writes.');
}

// CodeM drills into a retained navigation panel and returns to the actual entry page.
{
  const { codemNavigationConversations } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const origins = [
    ['/home', 'Home', 'HomePage'], ['/settings', 'Settings', 'SettingsPage'],
    ['/marketplace', 'Marketplace', 'Marketplace'],
    ...workItemApplications.map(item => [`/apps/${item.slug}/3`, item.id, 'WorkItemsPage']),
  ];
  for (const [path, active, component] of origins) {
    const href = `https://example.test${path}?source=navigation#entry`;
    setLocation(href);
    const render = mount(appElement.type);
    const sidebar = () => find(render(), byName('Sidebar'));
    sidebar().props.onNavigate('CodeM');
    assert.equal(sidebar().props.active, 'CodeM');
    for (const item of codemNavigationConversations) {
      sidebar().props.onOpenConversation(item);
      assert.equal(sidebar().props.selectedConversation, item.id);
      assert.equal(testWindow.location.pathname, `/chat/${item.id}`);
      assert.equal(find(render(), node => node.type === 'h1').props.children, item.title);
    }
    sidebar().props.onNewConversation();
    assert.ok(find(render(), byName('NewConversation')));
    sidebar().props.onBackToMeegle();
    assert.equal(testWindow.location.href, href, 'Back restores the exact entry URL after changing conversations and starting New');
    assert.equal(sidebar().props.active, active);
    const content = find(render(), byName(component));
    assert.ok(content, 'Back restores page content as well as the selected navigation item');
    if (component === 'WorkItemsPage') {
      assert.equal(find(mount(content.type)(content.props), byName('WorkItemDrawer')).props.item.id, 3);
    }
    // The next visit starts from the newly selected Meegle page, not the initial route.
    sidebar().props.onNavigate(active === 'Settings' ? 'Home' : 'Settings');
    const nextHref = testWindow.location.href;
    const nextActive = sidebar().props.active;
    sidebar().props.onNavigate('CodeM');
    sidebar().props.onBackToMeegle();
    assert.equal(testWindow.location.href, nextHref);
    assert.equal(sidebar().props.active, nextActive);
  }
  for (const item of codemNavigationConversations) {
    setLocation(`https://example.test/chat/${item.id}`);
    const render = mount(appElement.type);
    assert.equal(find(render(), byName('Sidebar')).props.selectedConversation, item.id, 'Direct links resolve every Figma navigation conversation');
    find(render(), byName('Sidebar')).props.onBackToMeegle();
    assert.ok(find(render(), byName('HomePage')), 'Direct CodeM loads without an entry page return to Home');
  }

  setLocation('https://example.test/home');
  const previousWidth = testWindow.innerWidth;
  testWindow.innerWidth = 390;
  const render = mount(appElement.type);
  let page = render();
  const stop = render.flushEffects();
  find(page, node => node.props.label === '打开导航').props.onClick();
  const sidebar = () => find(render(), byName('Sidebar'));
  const renderSidebar = mount(sidebar().type);
  const side = () => renderSidebar(sidebar().props);
  let tree = side();
  const selectedButton = new TestNode();
  const rootPanel = new TestNode();
  rootPanel.querySelector = selector => selector === '[aria-current="page"]' ? selectedButton : null;
  find(tree, node => node.props.className === 'sidebar-level sidebar-level-meegle').props.ref.current = rootPanel;
  const backButton = new TestNode();
  find(tree, byName('CodeMNavigation')).props.backRef.current = backButton;
  find(tree, node => node.props.className === 'group-heading' && textContent(node).includes('Personal')).props.onClick();
  find(tree, node => node.type === 'button' && node.props.title === 'CodeM').props.onClick();
  tree = side(); renderSidebar.flushLayoutEffects();
  assert.equal(testDocument.activeElement, backButton, 'Entering the subnavigation moves keyboard focus to Back');
  assert.equal(find(tree, node => node.props.className === 'sidebar-level sidebar-level-meegle').props.inert, true);
  assert.equal(find(tree, node => node.props.className === 'sidebar-level sidebar-level-codem').props.inert, false);
  assert.equal(sidebar().props.open, true, 'Mobile navigation remains open during the drill-down transition');

  const codem = () => find(side(), byName('CodeMNavigation'));
  const renderCodeM = mount(codem().type);
  const navigation = () => renderCodeM(codem().props);
  const project = tree => find(tree, node => node.props['aria-controls'] === 'codem-project-codem-web');
  const folderIcon = tree => find(project(tree), byName('NavigationIcon')).props.file;
  assert.equal(project(navigation()).props['aria-expanded'], true);
  assert.equal(folderIcon(navigation()), 'folder-open.svg');
  project(navigation()).props.onClick();
  assert.equal(project(navigation()).props['aria-expanded'], false);
  assert.equal(folderIcon(navigation()), 'folder.svg');
  const sectionToggle = section => find(navigation(), node => node.props['aria-controls'] === `codem-${section}-contents`);
  const sectionContent = section => find(navigation(), node => node.props.id === `codem-${section}-contents`);
  for (const section of ['pinned', 'projects', 'conversations']) {
    assert.equal(sectionToggle(section).props['aria-expanded'], true);
    sectionToggle(section).props.onClick();
    assert.equal(sectionToggle(section).props['aria-expanded'], false);
    assert.equal(sectionContent(section).props.hidden, true);
    assert.equal(sectionContent(section === 'pinned' ? 'projects' : 'pinned').props.hidden, false, 'Section toggles are independent');
    sectionToggle(section).props.onClick();
    assert.equal(sectionContent(section).props.hidden, false);
    assert.equal(project(navigation()).props['aria-expanded'], false, 'Collapsing a section retains individual project state');
  }
  find(navigation(), node => node.props['aria-label'] === 'back to Meegle').props.onClick();
  tree = side(); renderSidebar.flushLayoutEffects();
  assert.ok(find(render(), byName('HomePage')));
  assert.equal(testDocument.activeElement, selectedButton, 'Back focuses the restored selected page');
  assert.equal(sidebar().props.open, true, 'Back keeps the mobile drawer open for the reverse transition');
  assert.equal(find(tree, node => node.props.className === 'sidebar-level sidebar-level-codem').props.inert, true);
  assert.equal(find(tree, node => node.props.className === 'group-heading' && textContent(node).includes('Personal')).props['aria-expanded'], false, 'Root group state survives the drill-down');
  find(tree, node => node.type === 'button' && node.props.title === 'CodeM').props.onClick();
  assert.equal(project(navigation()).props['aria-expanded'], false, 'CodeM project expansion survives return and re-entry');
  testWindow.history.go(-1);
  assert.ok(find(render(), byName('HomePage')));
  testWindow.history.go(1);
  assert.equal(sidebar().props.active, 'CodeM');
  sidebar().props.onBackToMeegle();
  assert.ok(find(render(), byName('HomePage')), 'Browser history preserves the return destination');
  stop(); testWindow.innerWidth = previousWidth;

  const assetDir = resolve(root, 'public/assets/figma/codem-navigation');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.assets.length, 15);
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/codem-navigation', asset.file)), bytes, 'Production retains the original exported asset');
  }
  console.log('CodeM navigation checks passed: every entry page/detail URL restored, repeat entry, conversation links, direct-load fallback, mobile drawer, focus, inactive panels, retained groups, browser history and 15 original Figma asset hashes. Visual animation acceptance remains manual.');
}

// Placeholder pages cannot navigate; development conversations and list expansion work.
{
  setLocation('https://example.test/chat/codem-white-screen');
  const render = mount(appElement.type);
  const renderSidebar = mount(find(render(), byName('Sidebar')).type);
  const sidebar = () => {
    const element = find(render(), byName('Sidebar'));
    return renderSidebar(element.props);
  };
  const renderCodeM = mount(find(sidebar(), byName('CodeMNavigation')).type);
  const navigation = () => {
    const element = find(sidebar(), byName('CodeMNavigation'));
    return renderCodeM(element.props);
  };
  const href = testWindow.location.href;
  assert.ok(!find(navigation(), node => node.props['aria-label'] === 'Space'), 'Space is removed from the CodeM navigation');
  for (const title of ['codem workflow', 'meego platform', 'meego-ai', 'meego-ai boe 验收']) {
    const folder = () => find(navigation(), node => node.type === 'button' && node.props.title === title);
    const contents = () => find(navigation(), node => node.props.id === folder().props['aria-controls']);
    assert.equal(folder().props['aria-expanded'], false);
    assert.equal(find(folder(), byName('NavigationIcon')).props.file, 'folder.svg');
    assert.equal(contents().props.hidden, true);
    folder().props.onClick();
    assert.equal(folder().props['aria-expanded'], true);
    assert.equal(find(folder(), byName('NavigationIcon')).props.file, 'folder-open.svg');
    assert.equal(contents().props.hidden, false);
    const conversations = nodes(contents()).filter(node => node.props.className?.includes('codem-conversation-row'));
    assert.equal(conversations.length, 4, 'Each formerly empty folder contains four distinct conversations');
    assert.equal(new Set(conversations.map(node => node.props.title)).size, 4);
    folder().props.onClick();
    assert.equal(folder().props['aria-expanded'], false);
    assert.equal(find(folder(), byName('NavigationIcon')).props.file, 'folder.svg');
    assert.equal(contents().props.hidden, true);
    assert.equal(testWindow.location.href, href);
  }
  const visibleNodes = tree => {
    if (Array.isArray(tree)) return tree.flatMap(visibleNodes);
    if (!tree?.props || tree.props.hidden) return [];
    return [tree, ...visibleNodes(tree.props.children)];
  };
  const project = () => find(navigation(), node => node.props['aria-controls'] === 'codem-project-codem-web');
  const more = () => find(navigation(), node => node.props.className === 'codem-nav-row codem-nav-more');
  const visibleConversations = () => visibleNodes(find(navigation(), node => node.props.id === 'codem-project-codem-web'))
    .filter(node => node.props.className?.includes('codem-conversation-row')).length;
  assert.equal(visibleConversations(), 5);
  assert.equal(textContent(more()), '展开更多');
  more().props.onClick();
  assert.equal(visibleConversations(), 10);
  assert.equal(textContent(more()), '收起');
  assert.equal(more().props['aria-expanded'], true);
  project().props.onClick();
  assert.equal(visibleConversations(), 0, 'Closing the folder hides both initial and additional conversations');
  project().props.onClick();
  assert.equal(visibleConversations(), 10, 'Reopening retains this folder’s expanded list');
  more().props.onClick();
  assert.equal(visibleConversations(), 5);
  assert.equal(textContent(more()), '展开更多');
  assert.equal(more().props['aria-expanded'], false);
  assert.equal(testWindow.location.href, href, 'List and folder toggles do not navigate');
  find(navigation(), node => node.props['aria-label'] === 'New').props.onClick();
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat');
  assert.ok(find(render(), byName('NewConversation')));
  render.flushEffects()();
  console.log('CodeM destination checks passed: New routing, stateful folder icons, real show-more/collapse and retained expansion.');
}

// CodeM Settings is a separate destination with Figma tools and locally persisted authorizations.
{
  const { assistantSettingsStorageKey, loadAssistantSettings } = load(resolve(root, 'src/codem-assistant-settings.ts'));
  const original = adminStorage.get(assistantSettingsStorageKey);
  adminStorage.delete(assistantSettingsStorageKey);
  setLocation('https://example.test/home');
  const renderApp = mount(appElement.type);
  const sidebarElement = () => find(renderApp(), byName('Sidebar'));
  const renderSidebar = mount(sidebarElement().type);
  const side = () => renderSidebar(sidebarElement().props);
  const navigationElement = () => find(side(), byName('CodeMNavigation'));
  const renderNavigation = mount(navigationElement().type);
  const nav = () => renderNavigation(navigationElement().props);
  const action = label => find(nav(), node => node.props['aria-label'] === label);
  sidebarElement().props.onNavigate('CodeM');
  const chatUrl = testWindow.location.href;
  action('Settings').props.onClick();
  assert.equal(testWindow.location.pathname, '/codem/settings');
  assert.equal(testWindow.location.search, '', 'Settings clears the composer route parameters');
  assert.equal(sidebarElement().props.active, 'CodeM Settings');
  assert.equal(action('Settings').props['aria-current'], 'page');
  assert.equal(find(side(), node => node.props.className === 'sidebar-level sidebar-level-codem').props.inert, false, 'Settings retains the CodeM navigation');
  assert.equal(sidebarElement().props.selectedConversation, null);
  assert.equal(find(renderApp(), byName('NewConversation')), undefined);
  assert.equal(find(renderApp(), byName('SettingsPage')), undefined, 'Meegle space Settings stays separate');
  const settingsElement = () => find(renderApp(), byName('CodeMSettings'));
  const renderSettings = mount(settingsElement().type);
  const page = () => renderSettings(settingsElement().props);
  assert.equal(textContent(find(page(), node => node.type === 'h1')), 'Settings');
  const switches = () => nodes(page()).filter(byName('SettingsSwitch'));
  assert.deepEqual(switches().map(node => node.props.label), ['飞书项目', '飞书消息', '云文档', '飞书会议', '云空间', '电子表格', '多维表格', '日历']);
  assert.deepEqual(switches().map(node => node.props.checked), [true, true, true, true, true, true, true, false]);
  assert.equal(switches()[0].props.disabled, true);
  switches()[0].props.onChange();
  assert.equal(switches()[0].props.checked, true, 'The required project tool cannot be disabled');
  switches()[1].props.onChange(); switches()[7].props.onChange();
  assert.equal(switches()[1].props.checked, false);
  assert.equal(switches()[7].props.checked, true);
  assert.ok(loadAssistantSettings().enabledTools.includes('calendar'));
  assert.ok(!loadAssistantSettings().enabledTools.includes('chat'));
  const spaces = tree => nodes(tree).filter(node => node.props['data-space']);
  assert.deepEqual(spaces(page()).map(node => node.props['data-space']), ['meego', 'lark', 'codem', 'board', 'supernova']);
  const add = () => find(page(), node => node.props.className === 'codem-settings-add-space');
  const trigger = new TestNode(); add().props.ref.current = trigger;
  add().props.onClick();
  let menu = find(page(), node => node.props.role === 'menu');
  assert.ok(textContent(menu).includes('所有空间均已授权'));
  menu.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(find(page(), node => node.props.role === 'menu'), undefined);
  assert.equal(testDocument.activeElement, trigger);
  find(page(), node => node.props['aria-label'] === '取消授权 CodeM').props.onClick();
  assert.equal(spaces(page()).length, 4);
  assert.ok(!loadAssistantSettings().authorizedSpaces.includes('codem'));
  assert.equal(testDocument.activeElement, trigger, 'Revoking a row moves focus to the remaining add action');
  const restored = mount(settingsElement().type)(settingsElement().props);
  assert.equal(spaces(restored).length, 4, 'Revocation survives a page remount');
  assert.equal(nodes(restored).filter(byName('SettingsSwitch'))[7].props.checked, true, 'Tool choices survive a page remount');
  add().props.onClick();
  menu = find(page(), node => node.props.role === 'menu');
  const options = nodes(menu).filter(node => node.props.role === 'menuitem');
  assert.deepEqual(options.map(textContent), ['CodeM']);
  options[0].props.onClick();
  assert.equal(spaces(page()).length, 5);
  assert.equal(find(page(), node => node.props.role === 'menu'), undefined);
  assert.ok(loadAssistantSettings().enabledTools.includes('calendar'), 'Space edits retain tool choices');
  const stop = renderApp.flushEffects();
  testWindow.history.go(-1);
  assert.equal(testWindow.location.href, chatUrl);
  assert.ok(find(renderApp(), byName('NewConversation')));
  testWindow.history.go(1);
  assert.ok(settingsElement(), 'Browser forward restores CodeM Settings');
  action('New').props.onClick();
  assert.ok(find(renderApp(), byName('NewConversation')));
  assert.equal(action('Settings').props['aria-current'], undefined);
  action('Settings').props.onClick();
  find(nav(), node => node.props['aria-label'] === 'back to Meegle').props.onClick();
  assert.ok(find(renderApp(), byName('HomePage')), 'Returning from CodeM Settings keeps the original Meegle destination');
  stop();
  for (const path of ['/codem/settings', '/codem/settings/']) {
    setLocation(`https://example.test${path}`);
    assert.ok(find(mount(appElement.type)(), byName('CodeMSettings')), 'Direct and refreshed Settings URLs render the new panel');
    assert.ok(rewrites.some(rule => rule.source === path && rule.destination === '/index.html'));
  }
  for (const malformed of ['{invalid', 'null', '[]', '{"enabledTools":false,"authorizedSpaces":true}']) {
    adminStorage.set(assistantSettingsStorageKey, malformed);
    assert.equal(loadAssistantSettings().enabledTools.length, 7);
    assert.equal(loadAssistantSettings().authorizedSpaces.length, 5);
  }
  adminStorage.set(assistantSettingsStorageKey, JSON.stringify({ enabledTools: ['calendar', 'calendar', 'unknown'], authorizedSpaces: ['codem', 'codem', 'unknown'] }));
  assert.deepEqual(Array.from(loadAssistantSettings().enabledTools), ['meego', 'calendar'], 'Saved tools are deduplicated, validated and retain the required project tool');
  assert.deepEqual(Array.from(loadAssistantSettings().authorizedSpaces), ['codem']);
  if (original === undefined) adminStorage.delete(assistantSettingsStorageKey); else adminStorage.set(assistantSettingsStorageKey, original);
  const assetDir = resolve(root, 'public/assets/figma/codem-settings');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.nodeId, '174:6282');
  assert.equal(provenance.assets.length, 15);
  for (const asset of provenance.assets) {
    const data = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    assert.ok(data.toString().includes(`viewBox="${asset.viewBox}"`));
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/codem-settings', asset.file)), data);
  }
  console.log('CodeM Settings checks passed: dedicated navigation and deep links, browser history and Meegle return, eight tool switches, disabled required tool, persistent revoke/re-authorize, empty menu and keyboard dismissal, safe stored values and 15 original Figma assets. Pixel acceptance remains manual.');
}

// The CodeM Tools catalog shares navigation with Settings and filters without leaving the page.
{
  setLocation('https://example.test/home');
  const renderApp = mount(appElement.type);
  const sidebarElement = () => find(renderApp(), byName('Sidebar'));
  const renderSidebar = mount(sidebarElement().type);
  const side = () => renderSidebar(sidebarElement().props);
  const navigationElement = () => find(side(), byName('CodeMNavigation'));
  const renderNavigation = mount(navigationElement().type);
  const nav = () => renderNavigation(navigationElement().props);
  const action = label => find(nav(), node => node.props['aria-label'] === label);
  sidebarElement().props.onNavigate('CodeM');
  const chatUrl = testWindow.location.href;
  action('Tools').props.onClick();
  const toolsUrl = testWindow.location.href;
  assert.equal(testWindow.location.pathname, '/codem/tools');
  assert.equal(testWindow.location.search, '');
  assert.equal(action('Tools').props['aria-current'], 'page');
  assert.equal(action('Settings').props['aria-current'], undefined);
  assert.equal(find(side(), node => node.props.className === 'sidebar-level sidebar-level-codem').props.inert, false);
  assert.equal(sidebarElement().props.selectedConversation, null);
  assert.equal(find(renderApp(), byName('NewConversation')), undefined);
  const toolsElement = () => find(renderApp(), byName('CodeMTools'));
  const renderTools = mount(toolsElement().type);
  const page = () => renderTools(toolsElement().props);
  const cards = () => nodes(page()).filter(node => node.props['data-tool']);
  const tab = id => find(page(), node => node.props.id === `codem-tools-tab-${id}`);
  const search = value => find(page(), node => node.props['aria-label'] === '搜索工具').props.onChange({ target: { value } });
  const banner = () => find(page(), node => node.props.className === 'codem-tools-banner');
  assert.ok(banner(), 'Popular tools show the Harness banner above the catalog');
  assert.deepEqual(nodes(page()).filter(node => ['codem-tools-plugin', 'codem-tools-skill'].includes(node.props.id)).map(textContent), ['插件', '技能']);
  assert.equal(cards().length, 14);
  find(banner(), node => node.props.className === 'codem-tools-banner-details').props.onClick();
  assert.equal(textContent(find(renderApp(), node => node.props.role === 'status')), '详情页面暂未接入');
  assert.equal(testWindow.location.href, toolsUrl, 'The design has no details destination; the placeholder does not navigate');
  search('  GITHUB  ');
  assert.deepEqual(cards().map(node => node.props['data-tool']), ['github']);
  assert.ok(banner(), 'Catalog filtering preserves the popular-tab banner');
  search('回滚准备');
  assert.deepEqual(cards().map(node => node.props['data-tool']), ['release-review'], 'Descriptions participate in search');
  search('不存在的工具');
  assert.equal(cards().length, 0);
  assert.equal(textContent(find(page(), node => node.props.role === 'status')), '未找到匹配的工具');
  search('');
  assert.equal(cards().length, 14);
  tab('installed').props.onClick();
  assert.equal(tab('installed').props['aria-selected'], true);
  assert.equal(banner(), undefined, 'Installed tools do not display the popular-tab banner');
  assert.equal(tab('popular').props.tabIndex, -1);
  assert.deepEqual(cards().map(node => node.props['data-tool']), ['lark', 'github', 'google-drive', 'meego', 'release-review', 'sandbox', 'prd-review', 'card-copy']);
  assert.deepEqual(nodes(page()).filter(node => node.type === 'h2').map(textContent), ['插件', '技能']);
  search('  GITHUB  ');
  assert.deepEqual(cards().map(node => node.props['data-tool']), ['github']);
  search('回滚准备');
  assert.deepEqual(cards().map(node => node.props['data-tool']), ['release-review']);
  search('Slack');
  assert.equal(cards().length, 0, 'Installed search excludes tools only available in the popular catalog');
  assert.equal(textContent(find(page(), node => node.props.role === 'status')), '未找到匹配的已安装工具');
  search('');
  assert.equal(cards().length, 8, 'Clearing the query restores the installed catalog');
  const previousGetElement = testDocument.getElementById;
  const focusTarget = new TestNode();
  testDocument.getElementById = id => id === 'codem-tools-tab-popular' ? focusTarget : null;
  let prevented = false;
  tab('installed').props.onKeyDown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(testDocument.activeElement, focusTarget);
  assert.equal(tab('popular').props['aria-selected'], true);
  assert.ok(banner(), 'Keyboard tab switching restores the banner');
  assert.equal(cards().length, 14);
  testDocument.getElementById = previousGetElement;
  find(page(), node => node.props.className === 'codem-tools-upload').props.onClick();
  assert.equal(textContent(find(renderApp(), node => node.props.role === 'status')), '本地上传暂未接入');
  assert.equal(testWindow.location.href, toolsUrl);
  const stop = renderApp.flushEffects();
  testWindow.history.go(-1);
  assert.equal(testWindow.location.href, chatUrl);
  assert.ok(find(renderApp(), byName('NewConversation')));
  testWindow.history.go(1);
  assert.ok(toolsElement());
  action('Settings').props.onClick();
  assert.ok(find(renderApp(), byName('CodeMSettings')));
  assert.equal(action('Tools').props['aria-current'], undefined);
  action('Tools').props.onClick();
  action('New').props.onClick();
  assert.ok(find(renderApp(), byName('NewConversation')));
  action('Tools').props.onClick();
  find(nav(), node => node.props['aria-label'] === 'back to Meegle').props.onClick();
  assert.ok(find(renderApp(), byName('HomePage')), 'Tools and Settings retain the original Meegle destination');
  stop();
  for (const path of ['/codem/tools', '/codem/tools/']) {
    setLocation(`https://example.test${path}`);
    assert.ok(find(mount(appElement.type)(), byName('CodeMTools')));
    assert.ok(rewrites.some(rule => rule.source === path && rule.destination === '/index.html'));
  }
  const assetDir = resolve(root, 'public/assets/figma/codem-tools');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.nodeId, '174:8437');
  assert.equal(provenance.assets.length, 15);
  for (const asset of provenance.assets) {
    const data = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    if (asset.file.endsWith('.png')) {
      assert.equal(data.readUInt32BE(16), 150); assert.equal(data.readUInt32BE(20), 150);
    } else assert.ok(data.toString().includes('<svg'));
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/codem-tools', asset.file)), data);
  }
  const bannerDir = resolve(root, 'public/assets/figma/codem-tools-banner');
  const bannerProvenance = JSON.parse(readFileSync(resolve(bannerDir, 'provenance.json'), 'utf8'));
  assert.equal(bannerProvenance.nodeId, '174:9871');
  assert.equal(bannerProvenance.assets.length, 2);
  for (const asset of bannerProvenance.assets) {
    const data = readFileSync(resolve(bannerDir, asset.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    assert.equal(data.readUInt32BE(16), asset.width);
    assert.equal(data.readUInt32BE(20), asset.height);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/codem-tools-banner', asset.file)), data);
  }
  console.log('CodeM Tools checks passed: navigation, direct routes, history and Meegle return; catalog search, empty states, keyboard tabs, popular-only Harness banner and placeholder actions; 17 original Figma assets. Pixel acceptance remains manual.');
}

// Automation switches are independent local preferences, not live scheduled jobs.
{
  const { automationStatesStorageKey, loadAutomationStates } = load(resolve(root, 'src/codem-automations.ts'));
  const original = adminStorage.get(automationStatesStorageKey);
  adminStorage.delete(automationStatesStorageKey);
  setLocation('https://example.test/home');
  const renderApp = mount(appElement.type);
  const sidebarElement = () => find(renderApp(), byName('Sidebar'));
  const renderSidebar = mount(sidebarElement().type);
  const side = () => renderSidebar(sidebarElement().props);
  const navigationElement = () => find(side(), byName('CodeMNavigation'));
  const renderNavigation = mount(navigationElement().type);
  const nav = () => renderNavigation(navigationElement().props);
  const action = label => find(nav(), node => node.props['aria-label'] === label);
  sidebarElement().props.onNavigate('CodeM');
  const chatUrl = testWindow.location.href;
  action('Automation').props.onClick();
  assert.equal(testWindow.location.pathname, '/codem/automations');
  assert.equal(testWindow.location.search, '');
  assert.equal(action('Automation').props['aria-current'], 'page');
  assert.equal(action('Tools').props['aria-current'], undefined);
  assert.equal(action('Settings').props['aria-current'], undefined);
  assert.equal(sidebarElement().props.selectedConversation, null);
  assert.equal(find(side(), node => node.props.className === 'sidebar-level sidebar-level-codem').props.inert, false);
  const automationsElement = () => find(renderApp(), byName('CodeMAutomations'));
  const renderAutomations = mount(automationsElement().type);
  const page = () => renderAutomations(automationsElement().props);
  const switches = tree => nodes(tree).filter(byName('SettingsSwitch'));
  assert.equal(textContent(find(page(), node => node.type === 'h1')), 'Automations');
  assert.deepEqual(nodes(page()).filter(node => node.type === 'h2').map(textContent), ['codem workflow', 'semi design']);
  assert.deepEqual(switches(page()).map(node => node.props.checked), [true, true, false, true]);
  assert.deepEqual(switches(page()).map(node => node.props.label), ['codem workflow · 项目简报', 'codem workflow · 改动总结', 'semi design · 项目简报', 'semi design · 改动总结']);
  assert.equal(adminStorage.get(automationStatesStorageKey), undefined, 'Viewing the page does not save or schedule anything');
  switches(page())[0].props.onChange();
  assert.deepEqual(switches(page()).map(node => node.props.checked), [false, true, false, true]);
  switches(page())[2].props.onChange();
  assert.deepEqual(switches(page()).map(node => node.props.checked), [false, true, true, true], 'Same-named tasks in different projects remain independent');
  assert.equal(loadAutomationStates()['workflow-brief'], false);
  assert.equal(loadAutomationStates()['semi-brief'], true);
  assert.deepEqual(switches(mount(automationsElement().type)(automationsElement().props)).map(node => node.props.checked), [false, true, true, true]);
  const url = testWindow.location.href;
  const tab = id => find(page(), node => node.props.id === `codem-automations-tab-${id}`);
  assert.equal(tab('saved').props['aria-selected'], true);
  tab('templates').props.onClick();
  assert.equal(tab('templates').props['aria-selected'], true);
  assert.equal(tab('saved').props.tabIndex, -1);
  assert.equal(find(page(), node => node.props.role === 'tabpanel').props['aria-labelledby'], 'codem-automations-tab-templates');
  assert.deepEqual(nodes(page()).filter(node => node.type === 'h2').map(textContent), ['Status reports', 'Incidents & triage']);
  const templateCards = nodes(page()).filter(node => node.props['data-automation-template']);
  assert.equal(templateCards.length, 8);
  assert.equal(new Set(templateCards.map(node => node.props['data-automation-template'])).size, 8);
  assert.equal(switches(page()).length, 0);
  assert.equal(find(page(), node => node.props.className === 'codem-automations-create'), undefined);
  find(templateCards[0], node => node.props.className === 'codem-automation-template-use').props.onClick();
  assert.equal(textContent(find(renderApp(), node => node.props.role === 'status')), '自动化模板使用暂未接入');
  assert.equal(testWindow.location.href, url);
  const previousGetElement = testDocument.getElementById;
  const focusTarget = new TestNode();
  testDocument.getElementById = id => id === 'codem-automations-tab-saved' ? focusTarget : null;
  let prevented = false;
  tab('templates').props.onKeyDown({ key: 'ArrowLeft', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(testDocument.activeElement, focusTarget);
  testDocument.getElementById = previousGetElement;
  assert.equal(tab('saved').props['aria-selected'], true);
  assert.deepEqual(switches(page()).map(node => node.props.checked), [false, true, true, true], 'Switching tabs preserves the existing automation preferences');
  find(page(), node => node.props.className === 'codem-automations-create').props.onClick();
  assert.equal(textContent(find(renderApp(), node => node.props.role === 'status')), '自动化创建暂未接入');
  assert.equal(testWindow.location.href, url);
  const stop = renderApp.flushEffects();
  testWindow.history.go(-1);
  assert.equal(testWindow.location.href, chatUrl);
  assert.ok(find(renderApp(), byName('NewConversation')));
  testWindow.history.go(1);
  assert.ok(automationsElement());
  action('Tools').props.onClick();
  assert.ok(find(renderApp(), byName('CodeMTools')));
  assert.equal(action('Automation').props['aria-current'], undefined);
  action('Settings').props.onClick();
  assert.ok(find(renderApp(), byName('CodeMSettings')));
  action('Automation').props.onClick();
  const { codemNavigationConversations } = load(resolve(root, 'src/codem-navigation-data.ts'));
  sidebarElement().props.onOpenConversation(codemNavigationConversations[0]);
  assert.equal(testWindow.location.pathname, `/chat/${codemNavigationConversations[0].id}`);
  assert.equal(automationsElement(), undefined);
  action('Automation').props.onClick();
  action('New').props.onClick();
  assert.ok(find(renderApp(), byName('NewConversation')));
  action('Automation').props.onClick();
  find(nav(), node => node.props['aria-label'] === 'back to Meegle').props.onClick();
  assert.ok(find(renderApp(), byName('HomePage')));
  stop();
  for (const path of ['/codem/automations', '/codem/automations/']) {
    setLocation(`https://example.test${path}`);
    assert.ok(find(mount(appElement.type)(), byName('CodeMAutomations')));
    assert.ok(rewrites.some(rule => rule.source === path && rule.destination === '/index.html'));
  }
  for (const malformed of ['{invalid', 'null', '[]', 'false']) {
    adminStorage.set(automationStatesStorageKey, malformed);
    assert.deepEqual(Object.values(loadAutomationStates()), [true, true, false, true]);
  }
  adminStorage.set(automationStatesStorageKey, JSON.stringify({ 'workflow-brief': false, 'workflow-changes': 'false', unknown: true }));
  assert.deepEqual(Object.values(loadAutomationStates()), [false, true, false, true], 'Only known boolean preferences override defaults');
  if (original === undefined) adminStorage.delete(automationStatesStorageKey); else adminStorage.set(automationStatesStorageKey, original);
  const assetDir = resolve(root, 'public/assets/figma/codem-automations');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.nodeId, '174:8892');
  assert.equal(provenance.assets.length, 3);
  for (const asset of provenance.assets) {
    const data = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    assert.ok(data.toString().includes(`viewBox="${asset.viewBox}"`));
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/codem-automations', asset.file)), data);
  }
  const templateAssetDir = resolve(root, 'public/assets/figma/codem-automation-templates');
  const templateProvenance = JSON.parse(readFileSync(resolve(templateAssetDir, 'provenance.json'), 'utf8'));
  assert.equal(templateProvenance.nodeId, '174:10441');
  assert.equal(templateProvenance.assets.length, 3);
  for (const asset of templateProvenance.assets) {
    const data = readFileSync(resolve(templateAssetDir, asset.file));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    assert.equal(data.readUInt32BE(16), asset.width);
    assert.equal(data.readUInt32BE(20), asset.height);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/codem-automation-templates', asset.file)), data);
  }
  console.log('CodeM Automations checks passed: navigation, direct links, history, conversation and Meegle return; four independent persisted switches, Saved/Templates keyboard tabs and state retention, eight template cards, placeholder actions and six original Figma assets. Pixel acceptance remains manual.');
}

// A fresh user gets one shared, functional work-item group in the sidebar and Recent.
{
  const savedStorage = new Map(adminStorage);
  for (const key of adminStorage.keys()) if (key.startsWith('meego:work-item-chat:v1:')) adminStorage.delete(key);
  const { CodeMSourceNavigation, buildCodeMSourceGroups } = load(resolve(root, 'src/CodeMSourceNavigation.tsx'));
  const { getNavigationConversationHistory, resolveConversation, rememberWorkItemConversation } = load(resolve(root, 'src/work-item-chat.ts'));
  // Flush the earlier blocked-storage fallback before resetting this fresh-user fixture.
  getNavigationConversationHistory().forEach(rememberWorkItemConversation);
  for (const key of adminStorage.keys()) if (key.startsWith('meego:work-item-chat:v1:')) adminStorage.delete(key);
  const historyBeforePreset = Array.from(getNavigationConversationHistory(), entry => entry.id);
  const groups = buildCodeMSourceGroups([], null);
  assert.equal(groups.length, 1, 'A fresh user has exactly one preconfigured source group');
  const preset = groups[0];
  assert.equal(preset.source.href, '/apps/epic/1');
  assert.equal(preset.source.title, 'Unified Project Workspace');
  assert.equal(preset.entries.length, 3);
  assert.ok(preset.entries.every(entry => resolveConversation(entry.id)?.workItem.href === preset.source.href));
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const sidebar = mount(CodeMSourceNavigation)({ selected: null, active: true, onOpenConversation: start().props.onOpenConversation });
  const sidebarGroup = find(sidebar, node => node.props.group?.source.href === preset.source.href);
  assert.deepEqual(Array.from(sidebarGroup.props.group.entries, entry => entry.id), Array.from(preset.entries, entry => entry.id));
  const card = find(page(), node => node.props['data-workspace-id'] === `source:${preset.source.href}`);
  assert.equal(textContent(find(card, node => node.props.className === 'new-conversation-recent-meta')), '3 个会话');
  assert.deepEqual(Array.from(getNavigationConversationHistory(), entry => entry.id), historyBeforePreset, 'Showing the preset does not fabricate visits in saved history');
  card.props.onClick();
  const rows = nodes(page()).filter(node => node.props.className === 'workspace-chat-row');
  assert.deepEqual(rows.map(row => row.props['data-conversation-id']), Array.from(preset.entries, entry => entry.id));
  rows[0].props.onClick();
  assert.equal(find(renderApp(), byName('Sidebar')).props.selectedConversation, preset.entries[0].id);
  assert.equal(find(renderApp(), node => node.props.className === 'conversation-header-workspace-name').props.children, preset.source.title);
  const restored = buildCodeMSourceGroups(getNavigationConversationHistory(), preset.entries[0].id).filter(group => group.source.href === preset.source.href);
  assert.equal(restored.length, 1);
  assert.deepEqual(Array.from(restored[0].entries, entry => entry.id), Array.from(preset.entries, entry => entry.id), 'Opening a preset keeps one group and deduplicates its saved conversation');
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Default work-item group checks passed: fresh sidebar/Recent parity, three resolvable conversations, real navigation, no initial storage writes and saved-history deduplication.');
}

// Live source groups share the saved chat history and preserve work-item identity.
{
  const { CodeMSourceNavigation, buildCodeMSourceGroups } = load(resolve(root, 'src/CodeMSourceNavigation.tsx'));
  const { createWorkItemConversation, rememberWorkItemConversation, getConversationHistory, appendWorkItemMessage, findWorkItemConversation } = load(resolve(root, 'src/work-item-chat.ts'));
  const { createSettingsConversation, settingsChatContext, settingsQueries } = load(resolve(root, 'src/settings-chat.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { workItemApplications, getWorkItemTitleIcon } = load(resolve(root, 'src/work-item-navigation.ts'));
  const assets = load(resolve(root, 'src/assets.json'));
  const { WorkItemAskCodeM } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const savedStorage = new Map(adminStorage);
  for (const key of adminStorage.keys()) if (key.startsWith('meego:work-item-chat:v1:')) adminStorage.delete(key);
  const fixtures = workItemApplications.map(application => createWorkItemConversation(application.slug, getWorkItemView(application.slug).items[7], `导航分组 ${application.label}`));
  const settingsChat = createSettingsConversation('为导航分组检查空间配置');
  const groups = buildCodeMSourceGroups([...fixtures, fixtures[0], settingsChat, { id: 'missing' }], fixtures[0].id);
  assert.equal(groups.length, workItemApplications.length + 2, 'The default work item, Settings and same numeric IDs in different apps remain independent sources');
  for (const [index, application] of workItemApplications.entries()) {
    const group = groups.find(group => group.source.href === fixtures[index].workItem.href);
    assert.equal(group.entries.length, 1, 'Selected and saved copies of the same conversation are deduplicated');
    assert.equal(group.source.title, fixtures[index].workItem.title);
    const icon = getWorkItemTitleIcon(application);
    assert.equal(group.source.icon, assets[icon.icon]);
    assert.equal(group.source.color, icon.color);
  }
  assert.equal(groups.find(group => group.source.href === '/settings').source.title, settingsChatContext.title);
  assert.equal(groups.find(group => group.source.href === '/settings').source.icon, '/assets/settings/settings.svg');
  assert.equal(buildCodeMSourceGroups([], settingsChat.id).find(group => group.source.href === '/settings').entries[0].id, settingsChat.id, 'Direct URLs appear before the history subscription writes');

  setLocation('https://example.test/settings');
  let renderApp = mount(appElement.type);
  let app = () => renderApp();
  const sidebar = () => find(app(), byName('Sidebar'));
  const renderSidebar = mount(sidebar().type);
  const navigationElement = () => find(renderSidebar(sidebar().props), byName('CodeMNavigation'));
  const renderNavigation = mount(navigationElement().type);
  const sourceProps = () => {
    const element = navigationElement();
    return find(renderNavigation(element.props), byName('CodeMSourceNavigation')).props;
  };
  const renderSources = mount(CodeMSourceNavigation);
  const sourceElements = () => nodes(renderSources(sourceProps())).filter(byName('CodeMSourceGroup'));
  const sourceElement = href => sourceElements().find(element => element.props.group.source.href === href);
  sourceElements(); const unsubscribe = renderSources.flushEffects();
  const settingsPage = find(app(), byName('SettingsPage'));
  const renderAsk = mount(WorkItemAskCodeM);
  const askProps = { context: 'settings', triggerRef: { current: new TestNode() }, onClose() {}, onOpenConversation: settingsPage.props.onOpenConversation };
  const ask = () => renderAsk(askProps);
  find(ask(), node => node.type === 'button' && node.props.children === settingsQueries[2].title).props.onClick();
  find(ask(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const submittedSettings = createSettingsConversation(settingsQueries[2].prompt);
  let element = sourceElement('/settings');
  const renderCollapsedSettings = mount(element.type);
  let collapsedSettings = renderCollapsedSettings({ ...element.props, selected: null });
  const settingsToggle = tree => find(tree, node => node.props.title === settingsChatContext.title);
  assert.equal(settingsToggle(collapsedSettings).props['aria-expanded'], false, 'Agile Development starts collapsed without a selected conversation');
  settingsToggle(collapsedSettings).props.onClick();
  collapsedSettings = renderCollapsedSettings({ ...element.props, selected: null });
  assert.equal(settingsToggle(collapsedSettings).props['aria-expanded'], true);
  const renderGroup = mount(element.type);
  let group = renderGroup(element.props);
  const selected = find(group, node => node.props['aria-current'] === 'page');
  assert.equal(selected.props['data-conversation-id'], submittedSettings.id);
  const selectedNode = new TestNode(); selected.props.ref.current = selectedNode;
  renderGroup.flushLayoutEffects();
  group = renderGroup(element.props); renderGroup.flushLayoutEffects();
  assert.equal(selectedNode.lastScrollOptions.block, 'nearest', 'The new conversation is brought into view');
  assert.equal(find(group, node => node.props.className === 'codem-nav-label').props.children, settingsChatContext.title);
  sidebar().props.onNewConversation();
  element = sourceElement('/settings'); group = renderGroup(element.props);
  find(group, node => node.props['data-conversation-id'] === submittedSettings.id).props.onClick();
  assert.equal(sidebar().props.selectedConversation, submittedSettings.id, 'Source rows open real saved conversations');
  const settingsMessages = sentMessages(app());
  assert.equal(settingsMessages[0].props.text, settingsQueries[2].prompt);

  // Continue in chat displays an unsent draft, then replaces it with one saved row.
  sidebar().props.onNavigate('Version-1');
  const source = { slug: 'version', item: getWorkItemView('version').items[7] };
  const href = `/apps/version/${source.item.id}`;
  find(app(), byName('WorkItemsPage')).props.onContinueInChat(source, 'Schedule');
  let sourceTree = mount(sourceElement(href).type)(sourceElement(href).props);
  assert.ok(find(sourceTree, node => node.props['data-conversation-id'] === `draft:${href}`));
  assert.equal(findWorkItemConversation(source), undefined, 'Showing a draft does not auto-send or persist a conversation');
  const start = find(app(), byName('NewConversation'));
  find(start.props.composer, byName('RichPromptEditor')).props.onSubmit();
  const created = findWorkItemConversation(source);
  assert.ok(created);
  sourceTree = mount(sourceElement(href).type)(sourceElement(href).props);
  assert.ok(!find(sourceTree, node => node.props['data-conversation-id'] === `draft:${href}`));
  assert.equal(nodes(sourceTree).filter(node => node.props['data-conversation-id'] === created.id).length, 1);
  const edit = find(app(), node => node.type === 'textarea' && node.props['aria-label'] === '消息输入框');
  edit.props.onChange({ target: { value: '保留这条尚未发送的补充要求' } });
  find(sourceTree, node => node.props['data-conversation-id'] === created.id).props.onClick();
  assert.equal(find(app(), node => node.type === 'textarea' && node.props['aria-label'] === '消息输入框').props.value, '保留这条尚未发送的补充要求', 'Clicking the active row does not reset its draft');
  appendWorkItemMessage(created.id, '保存这条后续消息');
  sidebar().props.onNewConversation();
  sourceTree = mount(sourceElement(href).type)(sourceElement(href).props);
  find(sourceTree, node => node.props['data-conversation-id'] === created.id).props.onClick();
  assert.equal(sentMessages(app()).at(-1).props.text, '保存这条后续消息');

  const additional = Array.from({ length: 6 }, (_, index) => createWorkItemConversation(source.slug, source.item, `更多来源会话 ${index}`));
  additional.forEach(rememberWorkItemConversation);
  element = sourceElement(href);
  assert.equal(element.props.group.entries.length, 7, 'An already mounted sidebar receives history additions');
  assert.equal(sourceElements().filter(element => element.props.group.source.href === href).length, 1);
  const navigationOrder = () => sourceElements().map(element => ({ href: element.props.group.source.href, ids: Array.from(element.props.group.entries, entry => entry.id) }));
  const stableOrder = navigationOrder();
  for (const conversation of [additional[2], submittedSettings, additional[4], created]) {
    const sourceHref = conversation.workItem?.href ?? conversation.settings.href;
    const element = sourceElement(sourceHref);
    const group = mount(element.type)(element.props);
    find(group, node => node.props['data-conversation-id'] === conversation.id).props.onClick();
    assert.equal(sidebar().props.selectedConversation, conversation.id);
    assert.deepEqual(navigationOrder(), stableOrder, 'Clicking within or across groups never reorders conversations or source groups');
  }
  appendWorkItemMessage(created.id, '继续保持侧导航顺序');
  assert.deepEqual(navigationOrder(), stableOrder, 'Follow-up messages retain navigation order too');
  const renderWorkGroup = mount(element.type);
  const workGroup = () => renderWorkGroup(sourceElement(href).props);
  const more = () => find(workGroup(), node => node.props.className === 'codem-nav-row codem-nav-more');
  const extra = () => find(workGroup(), node => node.props.className === 'codem-nav-extra-conversations');
  assert.equal(extra().props.hidden, true);
  more().props.onClick(); assert.equal(extra().props.hidden, false); assert.equal(textContent(more()), '收起');
  more().props.onClick(); assert.equal(extra().props.hidden, true);
  find(workGroup(), node => node.type === 'button' && node.props.title === source.item.title).props.onClick();
  assert.equal(find(workGroup(), node => node.props.className === 'codem-nav-project-conversations').props.hidden, true);

  renderApp = mount(appElement.type);
  element = sourceElement(href);
  assert.equal(element.props.group.entries.length, 7, 'Reload restores saved source conversations');
  const refreshedSources = mount(CodeMSourceNavigation)(sourceProps());
  assert.equal(find(refreshedSources, node => byName('CodeMSourceGroup')(node) && node.props.group.source.href === href).props.group.entries.length, 7);
  assert.deepEqual(nodes(refreshedSources).filter(byName('CodeMSourceGroup')).map(element => ({ href: element.props.group.source.href, ids: Array.from(element.props.group.entries, entry => entry.id) })), stableOrder, 'Stable navigation order survives remount and re-reading saved history');
  const fromOtherTab = createWorkItemConversation('bug', getWorkItemView('bug').items[7], '另一标签页创建的会话');
  adminStorage.set(`meego:work-item-chat:v1:${fromOtherTab.workItem.href}`, fromOtherTab.id);
  testWindow.dispatchEvent(Object.assign(new Event('storage'), { key: `meego:work-item-chat:v1:${fromOtherTab.workItem.href}` }));
  assert.ok(sourceElement(fromOtherTab.workItem.href).props.group.entries.some(entry => entry.id === fromOtherTab.id));
  unsubscribe();
  const afterUnmount = createWorkItemConversation('bug', getWorkItemView('bug').items[7], '卸载后创建的会话');
  rememberWorkItemConversation(afterUnmount);
  assert.ok(!sourceElement(fromOtherTab.workItem.href).props.group.entries.some(entry => entry.id === afterUnmount.id), 'Unmount removes the live history subscription');
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('CodeM source navigation checks passed: all recommendation fields, Settings Ask handoff, draft/send replacement, source identity and eight original icons, selected-row scrolling, live history, saved-message reopening, stable click/follow-up/reload order, active draft preservation, expand/collapse and cross-tab cleanup.');
}

// Authored development chats use the same message, completion and tool-log components.
{
  const { codemNavigationConversations, codemNavigationProjects, codemNavigationDirectories } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const { getDevelopmentChat } = load(resolve(root, 'src/development-chat-content.ts'));
  assert.equal(codemNavigationProjects.length, 3);
  assert.equal(new Set(codemNavigationProjects.map(project => project.name)).size, 3, 'The repeated project folders are removed');
  setLocation('https://example.test/?view=new-chat');
  const render = mount(appElement.type);
  const renderSidebar = mount(find(render(), byName('Sidebar')).type);
  const navElement = () => find(renderSidebar(find(render(), byName('Sidebar')).props), byName('CodeMNavigation'));
  const renderNavigation = mount(navElement().type);
  const navigation = () => renderNavigation(navElement().props);
  const titles = () => nodes(navigation()).filter(node => node.props.className?.includes('codem-conversation-row')).map(node => node.props.title);
  const originalOrder = titles();
  const prompts = new Set();
  for (const conversation of codemNavigationConversations) {
    find(navigation(), node => node.type === 'button' && node.props.title === conversation.title).props.onClick();
    const page = render();
    const content = getDevelopmentChat(conversation.id);
    const directory = codemNavigationDirectories.find(item => item.conversations.some(chat => chat.id === conversation.id));
    if (directory) assert.equal(textContent(find(page, node => node.props.className === 'conversation-header-workspace-name')), directory.name, 'Conversation headers identify the owning folder');
    assert.equal(testWindow.location.pathname, `/chat/${conversation.id}`);
    assert.equal(sentMessages(page)[0].props.text, content.prompt);
    assert.ok(content.prompt.length > conversation.title.length);
    prompts.add(content.prompt);
    const reply = find(page, byName('AssistantMessage'));
    const replyTree = reply.type(reply.props);
    assert.equal(replyTree.props.className, 'conversation-assistant-message');
    assert.ok(find(replyTree, node => node.props.className === 'conversation-reply-body'));
    assert.ok(find(replyTree, byName('ExecutionLog')), 'Development process uses the existing expandable tool log');
    const completion = find(replyTree, byName('ReplyCompletion'));
    assert.equal(completion.type(completion.props).type, 'details');
    assert.ok(content.reply.sections.flatMap(section => section.items).length >= 3);
    assert.equal(replyTree.props['data-reply-scenario'], content.reply.scenario);
    assert.deepEqual(titles(), originalOrder, 'Opening development chats preserves their navigation order');
    const selectedRows = nodes(navigation()).filter(node => node.props['aria-current'] === 'page');
    assert.equal(selectedRows.length, 1);
    assert.equal(selectedRows[0].props.title, conversation.title);
    const refreshed = mount(appElement.type)();
    assert.equal(sentMessages(refreshed)[0].props.text, content.prompt);
  }
  assert.equal(prompts.size, codemNavigationConversations.length, 'Every development task has its own prompt and response');
  console.log('Development conversation checks passed: clickable unique tasks, shared reply/completion/tool-log styling, direct links, stable ordering and three unique project folders.');
}

// Every sidebar development conversation supports isolated, persistent follow-up messages.
{
  const { codemNavigationConversations } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const { canContinueConversation, loadWorkItemMessages, appendWorkItemMessage } = load(resolve(root, 'src/work-item-chat.ts'));
  const savedStorage = new Map(adminStorage);
  for (const conversation of codemNavigationConversations) adminStorage.delete(`meego:work-item-chat:v1:messages:${conversation.id}`);
  for (const conversation of codemNavigationConversations) {
    setLocation(`https://example.test/chat/${conversation.id}`);
    const render = mount(appElement.type);
    const composer = () => find(render(), node => node.props.className === 'composer');
    const editor = () => find(composer(), node => node.type === 'textarea');
    const sendButton = () => find(composer(), node => node.props.className === 'send-button');
    assert.equal(canContinueConversation(conversation.id), true);
    assert.equal(editor().props.readOnly, false, `${conversation.title} accepts input`);
    assert.equal(sendButton().props.disabled, true);
    composer().props.onSubmit({ preventDefault() {} });
    assert.equal(sentMessages(render()).length, 1, 'An empty follow-up is not sent');
    const prompt = `针对「${conversation.title}」补充测试清单\n包括异常场景`;
    editor().props.onChange({ target: { value: prompt } });
    find(render(), byName('Sidebar')).props.onOpenConversation(conversation);
    assert.equal(editor().props.value, prompt, 'Clicking the selected sidebar row preserves its draft');
    assert.equal(sendButton().props.disabled, false);
    for (const options of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      editor().props.onKeyDown({ key: 'Enter', shiftKey: options.shiftKey ?? false, nativeEvent: { isComposing: options.isComposing ?? false, keyCode: options.keyCode ?? 13 }, preventDefault() { assert.fail('Newlines and IME confirmation must not be intercepted'); } });
    }
    let prevented = false;
    editor().props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: false, keyCode: 13 }, preventDefault() { prevented = true; }, currentTarget: { form: { requestSubmit() { composer().props.onSubmit({ preventDefault() {} }); } } } });
    assert.ok(prevented);
    assert.equal(testWindow.location.pathname, `/chat/${conversation.id}`, 'Sending stays in the same conversation');
    assert.deepEqual(Array.from(loadWorkItemMessages(conversation.id)), [prompt]);
    assert.equal(sentMessages(render()).at(-1).props.text, prompt);
    assert.equal(sendButton().props.disabled, true);
    const firstReply = nodes(render()).filter(byName('AssistantMessage')).at(-1);
    const replyTree = firstReply.type(firstReply.props);
    assert.ok(textContent(replyTree).includes(conversation.title));
    assert.ok(textContent(replyTree).includes('验证重点'), 'A follow-up has task-specific response content');
    assert.ok(!find(replyTree, byName('ExecutionLog')), 'Local follow-ups do not fabricate tool execution');
    const richEditor = find(composer(), byName('RichPromptEditor'));
    assert.equal(richEditor.props.segments.length, 0, 'The composer is cleared after sending');
    richEditor.props.onChange([{ text: '继续补充边界条件' }]);
    composer().props.onSubmit({ preventDefault() {} });
    const secondReply = nodes(render()).filter(byName('AssistantMessage')).at(-1);
    assert.ok(secondReply.props.developmentReply.scenario.endsWith('-checks'), 'Continuation retains the previous testing context');
    assert.deepEqual(Array.from(loadWorkItemMessages(conversation.id)), [prompt, '继续补充边界条件']);
    assert.equal(sentMessages(render()).length, 3);
    const other = codemNavigationConversations.find(item => item.id !== conversation.id);
    find(render(), byName('Sidebar')).props.onOpenConversation(other);
    assert.ok(!sentMessages(render()).some(message => message.props.text === prompt), 'Follow-ups do not leak into another conversation');
    find(render(), byName('Sidebar')).props.onOpenConversation(conversation);
    assert.equal(sentMessages(render()).at(-1).props.text, '继续补充边界条件');
    const refreshed = mount(appElement.type)();
    assert.deepEqual(sentMessages(refreshed).slice(1).map(message => message.props.text), [prompt, '继续补充边界条件']);
    const restoredReply = nodes(refreshed).filter(byName('AssistantMessage')).at(-1);
    assert.deepEqual(restoredReply.props.developmentReply, secondReply.props.developmentReply, 'Replies remain stable after refresh');
    find(refreshed, node => node.type === 'textarea').props.onChange({ target: { value: '刷新后仍可继续输入' } });
  }
  const beforeInvalid = new Map(adminStorage);
  assert.deepEqual(Array.from(appendWorkItemMessage('unknown-conversation', '不应创建孤立消息')), []);
  assert.deepEqual(adminStorage, beforeInvalid);
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Development follow-up checks passed: all sidebar conversations editable, Enter/IME/newlines, active draft preservation, contextual replies, repeated sends, isolated storage, switching and refresh recovery.');
}

// The Figma titlebar retains history and preview entry points while using the actual source.
{
  setLocation('https://example.test/chat/codem-sandbox-routing');
  const render = mount(appElement.type);
  const header = () => find(render(), node => node.type === 'header' && node.props.className === 'chat-header');
  assert.equal(textContent(find(header(), node => node.props.className === 'conversation-header-workspace-name')), 'codem web');
  assert.equal(nodes(header()).filter(node => node.props.name?.startsWith('conversation-header/') && node.props.label).length, 5);
  find(header(), node => node.props['aria-label'] === '对话历史').props.onClick();
  assert.ok(find(render(), byName('ConversationHistoryMenu')), 'The workspace breadcrumb opens existing history');
  for (const label of ['浏览器', '文件', '子智能体', '终端', '打开产物预览']) {
    find(header(), node => node.props.label === label).props.onClick();
    assert.equal(textContent(find(render(), node => node.props.role === 'status')), '暂未接入');
    assert.ok(!find(render(), byName('ReportPreview')), 'Unconnected tools cannot open an unrelated report');
  }
  setLocation('https://example.test/chat/project-report');
  const renderReport = mount(appElement.type);
  find(renderReport(), node => node.props.label === '收起产物预览').props.onClick();
  assert.ok(!find(renderReport(), byName('ReportPreview')));
  find(renderReport(), node => node.props.label === '打开产物预览').props.onClick();
  assert.ok(find(renderReport(), byName('ReportPreview')), 'The panel icon can reopen an existing report');
  find(renderReport(), byName('Sidebar')).props.onNewConversation();
  assert.ok(!find(renderReport(), node => node.props.className === 'conversation-header-actions'), 'New chat keeps its cleared header');
  const folder = resolve(root, 'public/assets/figma/conversation-header');
  const provenance = JSON.parse(readFileSync(resolve(folder, 'provenance.json'), 'utf8'));
  for (const asset of [...provenance.assets, ...provenance.reusedAssets]) {
    const bytes = readFileSync(resolve(folder, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/conversation-header', asset.file)), bytes);
  }
  console.log('Conversation header checks passed: workspace context, history access, five original tool icons, placeholder feedback, report open/close, unchanged New chat and Figma asset integrity.');
}

// Workspace cards share the sidebar's conversations and preserve the composer on entry.
{
  const { codemNavigationDirectories, codemNavigationProjects } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const savedStorage = new Map(adminStorage);
  for (const key of adminStorage.keys()) if (key.startsWith('meego:work-item-chat:v1:')) adminStorage.delete(key);
  const { buildCodeMSourceGroups } = load(resolve(root, 'src/codem-source-groups.ts'));
  const { getNavigationConversationHistory } = load(resolve(root, 'src/work-item-chat.ts'));
  const expectedDirectoryCount = Math.min(6, codemNavigationDirectories.length + buildCodeMSourceGroups(getNavigationConversationHistory(), null).length);
  const project = codemNavigationProjects.find(item => item.id === 'codem-web');
  setLocation('https://example.test/?view=new-chat');
  const render = mount(appElement.type);
  const start = () => find(render(), byName('NewConversation'));
  start();
  const stop = render.flushEffects();
  input(start()).props.onChange({ target: { value: '保留这段工作区草稿' } });
  const renderPage = mount(start().type);
  let page = renderPage(start().props);
  const cards = () => nodes(page).filter(node => node.props.className === 'new-conversation-recent-card');
  const rows = () => nodes(page).filter(node => node.props.className === 'workspace-chat-row');
  assert.equal(cards().length, expectedDirectoryCount);
  assert.ok(cards().every(card => card.type === 'button' && card.props.type === 'button'), 'Cards support native keyboard activation');
  assert.ok(!find(page, node => node.props['aria-label'] === '返回工作目录'), 'The landing page does not show a workspace back button');
  cards().find(card => card.props['data-workspace-id'] === project.id).props.onClick();
  page = renderPage(start().props);
  assert.equal(testWindow.location.searchParams.get('workspace'), 'codem-web');
  assert.equal(cards().length, 0, 'The selected workspace replaces the Recent grid');
  assert.deepEqual(rows().map(row => row.props.title), Array.from(project.conversations.slice(0, 5), chat => chat.title));
  assert.equal(input(start()).props.value, '保留这段工作区草稿');
  const heading = find(page, node => node.type === 'h2' && node.props.tabIndex === -1);
  assert.ok(textContent(heading).includes('codem web'));
  const headingElement = new TestNode();
  heading.props.ref.current = headingElement;
  renderPage.flushLayoutEffects();
  assert.equal(testDocument.activeElement, headingElement, 'Focus moves out of the removed card to the workspace heading');
  find(page, node => node.props.className === 'workspace-chat-more').props.onClick();
  page = renderPage(start().props);
  assert.deepEqual(rows().map(row => row.props.title), Array.from(project.conversations, chat => chat.title));
  find(page, node => node.props.className === 'workspace-chat-more').props.onClick();
  page = renderPage(start().props);
  assert.equal(rows().length, 5);
  find(page, node => node.props['aria-label'] === '查看模板').props.onClick();
  page = renderPage(start().props);
  find(page, node => node.type === 'dialog').props.onCancel({ preventDefault() {} });
  page = renderPage(start().props);
  assert.equal(rows().length, 5, 'Closing Templates retains the workspace');
  assert.equal(input(start()).props.value, '保留这段工作区草稿');
  find(page, node => node.props['aria-label'] === '返回工作目录').props.onClick();
  page = renderPage(start().props);
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat');
  assert.equal(cards().length, expectedDirectoryCount, 'The back button returns to the directory cards');
  assert.equal(input(start()).props.value, '保留这段工作区草稿', 'Returning preserves the composer draft');
  const returnedCard = cards().find(card => card.props['data-workspace-id'] === project.id);
  assert.equal(cards()[0].props['data-workspace-id'], project.id, 'Opening a folder makes it the most recent project');
  const remountedCards = nodes(mount(start().type)(start().props)).filter(node => node.props.className === 'new-conversation-recent-card');
  assert.equal(remountedCards[0].props['data-workspace-id'], project.id, 'Project recency survives remounting');
  const returnedCardElement = new TestNode();
  returnedCard.props.ref.current = returnedCardElement;
  renderPage.flushLayoutEffects();
  assert.equal(testDocument.activeElement, returnedCardElement, 'Returning restores focus to the source directory card');
  returnedCard.props.onClick();
  page = renderPage(start().props);
  assert.equal(rows().length, 5);
  rows()[0].props.onClick();
  assert.equal(find(render(), byName('Sidebar')).props.selectedConversation, project.conversations[0].id);
  assert.equal(testWindow.location.pathname, `/chat/${project.conversations[0].id}`);
  assert.equal(testWindow.location.searchParams.has('workspace'), false, 'Workspace state does not leak into conversation URLs');
  assert.ok(find(render(), byName('AssistantMessage')).props.developmentReply);
  testWindow.history.go(-1);
  page = mount(start().type)(start().props);
  assert.equal(rows().length, 5, 'Browser Back restores the workspace list');
  testWindow.history.go(-1);
  page = mount(start().type)(start().props);
  assert.equal(cards().length, expectedDirectoryCount, 'Browser Back returns to Recent');
  stop();

  for (const workspace of codemNavigationDirectories) {
    setLocation('https://example.test/?view=new-chat');
    const render = mount(appElement.type);
    const start = () => find(render(), byName('NewConversation'));
    const renderPage = mount(start().type);
    let page = renderPage(start().props);
    find(page, node => node.props['data-workspace-id'] === workspace.id).props.onClick();
    page = renderPage(start().props);
    assert.equal(testWindow.location.searchParams.get('workspace'), workspace.id);
    if (!workspace.conversations?.length) {
      assert.equal(textContent(find(page, node => node.props.className === 'workspace-chat-empty')), '暂无会话');
      assert.ok(!find(page, node => node.props.className === 'workspace-chat-row'), 'Empty workspaces never show another workspace’s chats');
    } else {
      assert.deepEqual(nodes(page).filter(node => node.props.className === 'workspace-chat-row').map(node => node.props.title), Array.from(workspace.conversations.slice(0, 5), chat => chat.title), 'Recent uses the same conversations as the matching sidebar folder');
    }
    const renderRefreshed = mount(start().type);
    const refreshed = renderRefreshed(start().props);
    assert.ok(textContent(find(refreshed, node => node.type === 'h2' && node.props.tabIndex === -1)).includes(workspace.name));
    find(refreshed, node => node.props['aria-label'] === '返回工作目录').props.onClick();
    assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat', 'A directly loaded list returns to New chat without relying on browser history');
    assert.ok(find(renderRefreshed(start().props), node => node.props.className === 'new-conversation-recent'));
    find(render(), byName('Sidebar')).props.onNewConversation();
    assert.equal(testWindow.location.searchParams.has('workspace'), false, 'New resets the workspace selection');
  }
  setLocation('https://example.test/?view=new-chat&workspace=unknown');
  const fallback = find(mount(appElement.type)(), byName('NewConversation'));
  assert.equal(nodes(mount(fallback.type)(fallback.props)).filter(node => node.props.className === 'new-conversation-recent-card').length, expectedDirectoryCount);
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Recent workspace checks passed: isolated workspace lists, stable ordering, expand/collapse, conversation navigation, draft preservation, focus, template return, URL restoration and empty states.');
}

// Recent and the sidebar share directory identity, source icons and live conversation history.
{
  const { CodeMSourceNavigation } = load(resolve(root, 'src/CodeMSourceNavigation.tsx'));
  const { codemNavigationDirectories } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const { createWorkItemConversation, rememberWorkItemConversation, getRecentWorkspaceIds } = load(resolve(root, 'src/work-item-chat.ts'));
  const { createSettingsConversation } = load(resolve(root, 'src/settings-chat.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const savedStorage = new Map(adminStorage);
  for (const key of adminStorage.keys()) if (key.startsWith('meego:work-item-chat:v1:')) adminStorage.delete(key);
  const fixtures = Array.from(workItemApplications, application => createWorkItemConversation(application.slug, getWorkItemView(application.slug).items[7], `检查 ${application.label} 的 Recent 会话`));
  const settingsChat = createSettingsConversation('检查 Recent 与设置来源目录');
  [...fixtures, settingsChat, fixtures[0]].forEach(rememberWorkItemConversation);
  for (let index = 0; index < 6; index++) rememberWorkItemConversation(createWorkItemConversation('epic', getWorkItemView('epic').items[7], `Recent 更多会话 ${index}`));
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const cards = () => nodes(page()).filter(node => node.props.className === 'new-conversation-recent-card');
  const card = href => cards().find(node => node.props['data-workspace-id'] === `source:${href}`);
  const renderSources = mount(CodeMSourceNavigation);
  const sidebarGroups = () => nodes(renderSources({ selected: null, active: true, onOpenConversation: start().props.onOpenConversation })).filter(byName('CodeMSourceGroup'));
  page(); sidebarGroups();
  const stopPage = renderPage.flushEffects();
  const stopSources = renderSources.flushEffects();
  const directoryOrder = () => cards().map(node => node.props['data-workspace-id']);
  assert.equal(cards().length, 6, 'Recent displays no more than two rows of three projects');
  assert.deepEqual(directoryOrder(), Array.from(getRecentWorkspaceIds()).slice(0, 6));
  assert.equal(new Set(directoryOrder()).size, directoryOrder().length, 'No duplicate directories or Base placeholders');
  for (const element of sidebarGroups()) {
    const { source, entries } = element.props.group;
    const recentCard = card(source.href);
    if (recentCard) {
      const sidebarGroup = mount(element.type)(element.props);
      const sidebarIcon = find(sidebarGroup, node => node.props.className === 'codem-nav-source-icon');
      const recentIcon = find(recentCard, node => node.props.className === 'new-conversation-recent-source-icon');
      assert.equal(recentCard.props.title, source.title);
      assert.equal(find(recentCard, node => node.props.className === 'new-conversation-recent-name').props.children, source.title);
      assert.equal(find(recentIcon, node => node.type === 'img').props.src, find(sidebarIcon, node => node.type === 'img').props.src);
      assert.equal(recentIcon.props.style.background, sidebarIcon.props.style.background);
      assert.equal(textContent(find(recentCard, node => node.props.className === 'new-conversation-recent-meta')), `${entries.length} 个会话`);
    }

    // A separate page instance also checks URL restoration for source-based directories.
    setLocation(`https://example.test/?view=new-chat&workspace=${encodeURIComponent(`source:${source.href}`)}`);
    const renderWorkspace = mount(start().type);
    let workspace = renderWorkspace(start().props);
    const rows = () => nodes(workspace).filter(node => node.props.className === 'workspace-chat-row');
    assert.deepEqual(rows().map(row => row.props['data-conversation-id']), Array.from(entries.slice(0, 5), entry => entry.id));
    const more = find(workspace, node => node.props.className === 'workspace-chat-more');
    if (more) {
      more.props.onClick(); workspace = renderWorkspace(start().props);
      assert.deepEqual(rows().map(row => row.props['data-conversation-id']), Array.from(entries, entry => entry.id));
    }
    rows()[0].props.onClick();
    assert.equal(find(renderApp(), byName('Sidebar')).props.selectedConversation, entries[0].id);
    assert.equal(testWindow.location.searchParams.has('workspace'), false);
    find(renderApp(), byName('Sidebar')).props.onNewConversation();
  }
  const sidebarOrder = sidebarGroups().map(element => element.props.group.source.href);
  rememberWorkItemConversation(fixtures[0]);
  assert.equal(directoryOrder()[0], `source:${fixtures[0].workItem.href}`, 'The latest conversation moves its project to the front of Recent');
  assert.deepEqual(sidebarGroups().map(element => element.props.group.source.href), sidebarOrder, 'Recent activity does not reorder sidebar groups');

  const newChat = createWorkItemConversation('bug', getWorkItemView('bug').items[6], 'Recent 实时新增会话');
  rememberWorkItemConversation(newChat);
  assert.ok(card(newChat.workItem.href), 'A mounted Recent receives new source groups');
  assert.equal(cards().length, 6, 'New projects replace the oldest visible card without creating a third row');
  assert.equal(directoryOrder()[0], `source:${newChat.workItem.href}`);
  const extraChat = createWorkItemConversation('bug', getWorkItemView('bug').items[6], '同一目录中的第二条会话');
  rememberWorkItemConversation(extraChat);
  assert.equal(textContent(find(card(newChat.workItem.href), node => node.props.className === 'new-conversation-recent-meta')), '2 个会话');
  const otherTabChat = createWorkItemConversation('story', getWorkItemView('story').items[6], '另一标签页的 Recent 会话');
  const storageKey = `meego:work-item-chat:v1:${otherTabChat.workItem.href}`;
  adminStorage.set(storageKey, otherTabChat.id);
  const historyKey = 'meego:work-item-chat:v1:history';
  adminStorage.set(historyKey, JSON.stringify([{ id: otherTabChat.id, updatedAt: Date.now(), navigationOrder: 1000 }, ...JSON.parse(adminStorage.get(historyKey) || '[]')]));
  testWindow.dispatchEvent(Object.assign(new Event('storage'), { key: storageKey }));
  assert.ok(card(otherTabChat.workItem.href), 'Cross-tab history updates Recent and the sidebar');

  // Continue in chat passes the same unsent draft to both surfaces without persisting it.
  find(renderApp(), byName('Sidebar')).props.onNavigate('Version-1');
  const draftSource = { slug: 'version', item: getWorkItemView('version').items[5] };
  find(renderApp(), byName('WorkItemsPage')).props.onContinueInChat(draftSource, 'Schedule');
  assert.deepEqual(start().props.draft, find(renderApp(), byName('Sidebar')).props.workItemDraft);
  const draftHref = `/apps/version/${draftSource.item.id}`;
  assert.equal(textContent(find(card(draftHref), node => node.props.className === 'new-conversation-recent-meta')), '0 个会话· 1 个草稿');
  card(draftHref).props.onClick();
  const draftRow = find(page(), node => node.props['data-conversation-id'] === `draft:${draftHref}`);
  assert.equal(textContent(find(draftRow, node => node.props.className === 'workspace-chat-draft')), '草稿');
  const draftUrl = testWindow.location.href;
  draftRow.props.onClick();
  assert.equal(testWindow.location.href, draftUrl, 'An unsent draft cannot open a fabricated saved conversation');
  stopPage(); stopSources();
  adminStorage.clear(); for (const [key, value] of savedStorage) adminStorage.set(key, value);
  console.log('Recent source-directory checks passed: latest six projects, stable sidebar order, original icons and counts, direct access to omitted projects, live/cross-tab updates and unsent drafts.');
}

// The dock retains the existing draft/send flow; the new + menu exposes the old actions.
{
  setLocation('https://example.test/?view=new-chat');
  const render = mount(appElement.type);
  const start = () => find(render(), byName('NewConversation'));
  input(start()).props.onChange({ target: { value: '保留输入内容并添加项目附件' } });
  assert.equal(input(start()).props.placeholder, 'What can I help you today?');
  const toolbarElement = () => find(start().props.composer, byName('NewChatToolbar'));
  const renderToolbar = mount(toolbarElement().type);
  const toolbar = () => renderToolbar(toolbarElement().props);
  const add = () => find(toolbar(), node => node.props.className === 'new-chat-add');
  const addAction = label => find(toolbar(), node => node.type === 'button' && textContent(node) === label);
  const intelligence = () => find(toolbar(), node => node.props.className === 'new-chat-intelligence');
  add().props.onClick();
  assert.equal(add().props['aria-expanded'], true);
  let attached = 0;
  find(start().props.composer, node => node.props.type === 'file').props.ref.current = { click: () => attached++ };
  addAction('添加附件').props.onClick();
  assert.equal(attached, 1, 'The + menu reaches the native file picker');
  assert.equal(add().props['aria-expanded'], false);
  const fileInput = find(start().props.composer, node => node.props.type === 'file');
  fileInput.props.onChange({ target: { files: [{ name: '需求说明.pdf' }], value: 'file' } });
  assert.ok(textContent(start().props.composer).includes('需求说明.pdf'));
  for (const label of ['引用项目', '选择技能']) {
    add().props.onClick(); addAction(label).props.onClick();
    const menu = find(start().props.composer, node => node.props.className === 'popover composer-popover');
    assert.equal(find(menu, node => node.type === 'strong').props.children, label);
    find(menu, node => node.type === 'button').props.onClick();
  }
  add().props.onClick(); addAction('引用项目').props.onClick(); add().props.onClick();
  assert.ok(!find(start().props.composer, node => node.props.className === 'popover composer-popover'), 'Opening + closes the previous context menu');
  add().props.onClick();
  const checkbox = () => find(toolbar(), node => node.props.type === 'checkbox');
  checkbox().props.onChange({ target: { checked: true } });
  assert.equal(checkbox().props.checked, true);
  intelligence().props.onClick();
  const intelligenceSlider = find(toolbar(), byName('IntelligenceSlider'));
  find(mount(intelligenceSlider.type)(intelligenceSlider.props), node => node.props.type === 'range').props.onChange({ currentTarget: { value: '1' } });
  assert.equal(intelligence().props['aria-label'], 'Intelligence High', 'Slider changes are previews until the popover closes');
  intelligence().props.onClick();
  assert.equal(intelligence().props['aria-label'], 'Intelligence Medium');
  assert.equal(textContent(intelligence()), 'Medium', 'The composer shows only the selected intelligence level');
  const trigger = new TestNode();
  intelligence().props.ref.current = trigger;
  intelligence().props.onClick();
  toolbar().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(intelligence().props['aria-expanded'], false);
  assert.equal(testDocument.activeElement, trigger);
  add().props.onClick();
  toolbar().props.ref.current = new TestNode();
  const unsubscribe = renderToolbar.flushEffects();
  testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: new TestNode() }));
  assert.equal(add().props['aria-expanded'], false, 'Clicking outside dismisses the add menu');
  unsubscribe();
  assert.equal(input(start()).props.value, '保留输入内容并添加项目附件', 'Toolbar changes preserve the draft');
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat', 'Toolbar actions do not send');

  const renderPage = mount(start().type);
  const pageProps = start().props;
  let page = renderPage(pageProps);
  const dock = find(page, node => node.props.className === 'new-conversation-dock');
  const scroll = find(page, node => node.props.className === 'new-conversation-scroll');
  assert.ok(find(dock, node => node.type === 'form'));
  assert.ok(!find(scroll, node => node.type === 'form'), 'The composer stays outside the scrolling template content');
  const templatesToggle = () => find(page, node => node.props['aria-label'] === '查看模板');
  const recent = () => find(page, node => node.props.className === 'new-conversation-recent');
  const templatePanel = () => find(page, node => node.props.id === 'new-conversation-templates');
  assert.ok(!recent().props.hidden, 'Recent workspaces are the initial landing content');
  assert.equal(templatePanel().type, 'dialog');
  assert.ok(!templatePanel().props.open, 'The contained dialog is closed until show is called');
  assert.equal(templatesToggle().props['aria-expanded'], false);
  const { codemNavigationDirectories } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const { buildCodeMSourceGroups } = load(resolve(root, 'src/codem-source-groups.ts'));
  const { getNavigationConversationHistory } = load(resolve(root, 'src/work-item-chat.ts'));
  const availableNames = [
    ...Array.from(codemNavigationDirectories, directory => directory.name),
    ...Array.from(buildCodeMSourceGroups(getNavigationConversationHistory(), null, pageProps.draft), group => group.source.title),
  ];
  const recentNames = nodes(recent()).filter(node => node.props.className === 'new-conversation-recent-name').map(node => node.props.children);
  assert.equal(recentNames.length, 6);
  assert.ok(recentNames.every(name => availableNames.includes(name)), 'Recent cards retain the real workspace names');
  const closeElement = new TestNode();
  const toggleElement = new TestNode();
  const dialogNode = Object.assign(new TestNode(), { open: false, show() { this.open = true; }, close() { this.open = false; } });
  templatePanel().props.ref.current = dialogNode;
  find(templatePanel(), node => node.props['aria-label'] === '关闭模板').props.ref.current = closeElement;
  templatesToggle().props.ref.current = toggleElement;
  scroll.props.ref.current = { scrollTop: 480 };
  const previousMatchMedia = testWindow.matchMedia;
  testWindow.matchMedia = () => ({ matches: true });
  renderPage.flushLayoutEffects();
  templatesToggle().props.onClick();
  page = renderPage(pageProps);
  renderPage.flushLayoutEffects();
  assert.equal(dialogNode.open, true);
  assert.equal(templatePanel().props['aria-modal'], 'false', 'The sidebar stays outside the contained overlay');
  assert.ok(!recent().props.hidden, 'Recent remains underneath the white overlay');
  assert.equal(scroll.props.ref.current.inert, true, 'Covered content is unavailable while Templates is open');
  assert.equal(templatesToggle().props['aria-expanded'], true);
  assert.equal(scroll.props.ref.current.scrollTop, 480, 'Opening templates does not move the page underneath');
  assert.equal(testDocument.activeElement, closeElement, 'Dialog entry has an accessible focused close button');
  const libraryElement = find(templatePanel(), byName('NewConversationContent'));
  const renderLibrary = mount(libraryElement.type);
  let libraryView = renderLibrary(libraryElement.props);
  find(libraryView, node => node.props.role === 'tab' && node.props.children.at(-1) === '项目复盘').props.onClick();
  const dismiss = () => templatePanel().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  dismiss();
  page = renderPage(pageProps);
  renderPage.flushLayoutEffects();
  assert.equal(dialogNode.open, false);
  assert.notEqual(scroll.props.ref.current.inert, true, 'Closing restores interaction with the covered content');
  assert.ok(!recent().props.hidden);
  assert.equal(testDocument.activeElement, toggleElement, 'Escape restores focus to Templates');
  templatesToggle().props.onClick();
  page = renderPage(pageProps);
  renderPage.flushLayoutEffects();
  const reopenedLibrary = find(templatePanel(), byName('NewConversationContent'));
  assert.equal(reopenedLibrary.type, libraryElement.type);
  assert.equal(reopenedLibrary.key, libraryElement.key, 'Toggling keeps the same template library mounted');
  libraryView = renderLibrary(reopenedLibrary.props);
  assert.equal(find(libraryView, node => node.props.role === 'tab' && node.props['aria-selected']).props.children.at(-1), '项目复盘');
  assert.equal(nodes(libraryView).filter(node => node.props.className === 'template-card').length, conversationCatalog.templates.filter(template => template.category === '项目复盘').length);
  find(templatePanel(), node => node.props['aria-label'] === '关闭模板').props.onClick();
  page = renderPage(pageProps);
  assert.equal(dialogNode.open, false, 'The top-right close button dismisses the dialog');
  assert.equal(input(start()).props.value, '保留输入内容并添加项目附件', 'Switching the start content preserves the draft');
  assert.ok(textContent(start().props.composer).includes('需求说明.pdf'), 'Attachments survive template toggles');
  testWindow.matchMedia = previousMatchMedia;
  submit(start());
  assert.equal(testWindow.location.pathname, '/chat/project-report');

  const assetDir = resolve(root, 'public/assets/figma/new-chat-composer');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.assets.length, 8);
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/new-chat-composer', asset.file)), bytes);
  }
  const recentDir = resolve(root, 'public/assets/figma/new-chat-recent');
  const recentProvenance = JSON.parse(readFileSync(resolve(recentDir, 'provenance.json'), 'utf8'));
  for (const asset of recentProvenance.assets) {
    const bytes = readFileSync(resolve(recentDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/new-chat-recent', asset.file)), bytes);
  }
  console.log('New chat checks passed: docked composer, add/attach/mention/skill handoffs, draft preservation, preference controls, menu dismissal/focus, Recent background, template dialog/close/Escape/category retention, send flow and original Figma exports. Pixel and responsive acceptance remain manual.');
}

// Suggested queries use the template prefill flow without submitting or losing attachments.
{
  setLocation('https://example.test/?view=new-chat');
  const { getSuggestedQueries } = load(resolve(root, 'src/new-chat-suggestions.ts'));
  const expectedSuggestions = Array.from(getSuggestedQueries());
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const suggestions = () => find(page(), node => node.type === 'section' && node.props['aria-label'] === '建议');
  const queries = () => nodes(suggestions()).filter(node => node.props.className === 'new-conversation-suggestion');
  const expectedQueries = [
    '找出某个字段的所有配置，并且批量替换成新的字段',
    '查询一个具体成员的权限配置',
    '根据 ITR 场景，以及团队工作流的文档，创建一个新空间',
    '搭建一个项目进度看板轻应用，展示任务状态、里程碑和交付风险',
    '自动接管流程上的开发节点，完成代码实现、测试并回填结果',
  ];
  assert.deepEqual(queries().map(textContent), expectedQueries, 'The landing page includes five queries, including light-app creation and development-node takeover');
  const templateContent = find(page(), byName('NewConversationContent'));
  const templateLibrary = mount(templateContent.type)(templateContent.props);
  const developmentTab = find(templateLibrary, node => node.type === 'button' && textContent(node) === '项目开发');
  const developmentIcon = find(developmentTab, node => node.type === 'img').props.src;
  assert.equal(find(queries()[4], node => node.type === 'img').props.src, developmentIcon, 'The development suggestion reuses the exact template tab icon');
  const dock = find(page(), node => node.props.className === 'new-conversation-dock');
  assert.ok(find(dock, node => node.props['aria-label'] === '建议'), 'Suggestions sit above the docked composer');
  assert.ok(!find(start().props.composer, node => node.props['aria-label'] === '建议'), 'Suggestion buttons cannot submit the composer form');
  const entry = nodes(suggestions()).filter(node => node.type === 'button').at(-1);
  assert.equal(entry.props['aria-label'], '查看模板');
  assert.equal(textContent(entry), 'more templates');
  assert.equal(nodes(page()).filter(node => node.props['aria-label'] === '查看模板').length, 1, 'The final suggestion row is the only Templates entry');
  assert.ok(!find(page(), node => node.props.className === 'new-chat-template-toolbar'));

  const editor = new TestNode();
  input(start()).props.ref.current = editor;
  find(start().props.composer, node => node.props['aria-label'] === '选择附件文件').props.onChange({ target: { files: [{ name: '团队工作流.pdf' }], value: '' } });
  for (const [index, query] of expectedQueries.entries()) {
    const prompt = expectedSuggestions[index].prompt;
    assert.notEqual(prompt, query, 'Suggestion labels and expanded prompts are separate');
    assert.ok(prompt.length > query.length * 2, 'Prefills expand the task beyond the compact label');
    input(start()).props.onChange({ target: { value: `未发送草稿 ${index}` } });
    queries()[index].props.onClick();
    assert.equal(input(start()).props.value, prompt, 'Choosing a suggestion replaces the draft with its expanded prompt');
    assert.equal(testDocument.activeElement, editor, 'Suggestion prefill focuses the editable composer');
    assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat', 'Choosing a suggestion does not send or navigate');
    assert.equal(suggestions(), undefined, 'Choosing a query dismisses the entire suggestion section');
    assert.ok(textContent(start().props.composer).includes('团队工作流.pdf'), 'Prefill retains the attached workflow document');
    input(start()).props.onChange({ target: { value: `${prompt}\n补充团队信息` } });
    assert.equal(input(start()).props.value, `${prompt}\n补充团队信息`, 'Expanded prompts remain editable');
    assert.equal(suggestions(), undefined, 'Editing the prefilled draft keeps suggestions dismissed');
    input(start()).props.onChange({ target: { value: '' } });
    assert.equal(queries().length, 5, 'Clearing the composer remounts all five suggestions for a new entrance');
    renderPage.flushLayoutEffects();
  }
  const assetDir = resolve(root, 'public/assets/figma/new-chat-suggestions');
  const provenance = JSON.parse(readFileSync(resolve(assetDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.assets.length, 6);
  assert.equal(provenance.nodeId, '174:6663');
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(assetDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/new-chat-suggestions', asset.file)), bytes);
  }
  for (const icon of nodes(suggestions()).filter(node => node.type === 'img')) {
    assert.ok(icon.props.src === developmentIcon || provenance.assets.some(asset => icon.props.src.endsWith(`/${asset.file}`)));
    assert.equal(icon.props.width, '16');
    assert.equal(icon.props.height, '16');
  }
  console.log('Suggestion checks passed: Figma exports and reused development icon, five expanded editable prefills, dismissal and clear-to-restore, focus, retained attachments, no auto-send, and a single final-row Templates entry. Pixel acceptance remains manual.');
}

// Workspace changes replace only the suggestion section, restarting its entrance without resetting the composer.
{
  setLocation('https://example.test/?view=new-chat');
  const { codemNavigationDirectories } = load(resolve(root, 'src/codem-navigation-data.ts'));
  const { getSuggestedQueries } = load(resolve(root, 'src/new-chat-suggestions.ts'));
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const section = () => find(page(), node => node.props['aria-label'] === '建议');
  const queryRows = () => nodes(section()).filter(node => node.props.className === 'new-conversation-suggestion');
  const defaultLabels = queryRows().map(textContent);
  const defaultKey = section().key;
  const editor = new TestNode();
  let focusCount = 0;
  editor.focus = () => { focusCount++; testDocument.activeElement = editor; };
  input(start()).props.ref.current = editor;
  const dock = new TestNode();
  dock.querySelector = () => editor;
  find(page(), node => node.props.className === 'new-conversation-dock').props.ref.current = dock;
  const previousMatchMedia = testWindow.matchMedia;
  testWindow.matchMedia = () => ({ matches: false });
  const enter = () => {
    const node = new TestNode();
    section().props.onAnimationStart({ target: node, currentTarget: node, animationName: 'new-conversation-suggestions-in' });
  };
  renderPage.flushLayoutEffects();
  enter();
  const distinctQuerySets = new Set();
  const contexts = nodes(page()).filter(node => node.props.className === 'new-conversation-recent-card').map(node => ({
    id: node.props['data-workspace-id'], name: node.props.title,
    kind: codemNavigationDirectories.some(item => item.id === node.props['data-workspace-id']) ? 'folder' : 'source',
  }));
  for (const context of contexts) {
    input(start()).props.onChange({ target: { value: '切换项目时保留的草稿' } });
    find(page(), node => node.props['data-workspace-id'] === context.id).props.onClick();
    assert.notEqual(section().key, defaultKey, 'The project gets a fresh suggestion element, initially hidden by the delayed entrance');
    assert.equal(section().key, context.id);
    const expected = Array.from(getSuggestedQueries(context));
    assert.deepEqual(queryRows().map(textContent), expected.map(item => item.query));
    assert.notDeepEqual(queryRows().map(textContent), defaultLabels, 'Project queries differ from the landing suggestions');
    assert.equal(expected.length, 5);
    if (context.kind === 'folder') {
      distinctQuerySets.add(JSON.stringify(queryRows().map(textContent)));
      assert.deepEqual(expected.map(item => item.category), ['project-qa', 'project-qa', 'project-development', 'project-development', 'project-development'], 'Folders offer two questions and three development scenarios');
      for (const [index, suggestion] of expected.entries()) {
        assert.equal(find(queryRows()[index], node => node.type === 'img').props.src, `/assets/figma/template-discovery/${suggestion.category}.svg`);
      }
    } else {
      assert.ok(expected.some(item => item.category === 'light-app'), 'Work-item groups retain their light-app scenario');
      assert.ok(expected.some(item => item.category === 'space-config'), 'Folder-only filtering does not affect work-item groups');
    }
    for (const suggestion of expected) {
      assert.ok(suggestion.prompt.includes(context.name));
      assert.ok(suggestion.prompt.length > suggestion.query.length * 2, 'Contextual prompts expand the task, rather than just prefixing its label');
    }
    assert.equal(expected[4].category, 'project-development');
    assert.ok(expected[4].query.includes('开发节点'));
    assert.equal(input(start()).props.value, '切换项目时保留的草稿');
    renderPage.flushLayoutEffects();
    const beforeEntrance = focusCount;
    enter();
    assert.equal(focusCount, beforeEntrance + 1, 'The project entrance activates the composer again');
    queryRows()[0].props.onClick();
    assert.equal(input(start()).props.value, expected[0].prompt);
    assert.ok(input(start()).props.value.includes(context.name), 'The prefilled prompt carries the selected project context');
    assert.equal(section(), undefined);
    input(start()).props.onChange({ target: { value: '   ' } });
    assert.equal(queryRows().length, 5, 'Clearing to whitespace restores all five current project suggestions');
    renderPage.flushLayoutEffects();
    const beforeRestore = focusCount;
    enter();
    assert.equal(focusCount, beforeRestore + 1, 'Reappearing suggestions activate the composer at the new animation start');
    find(page(), node => node.props['aria-label'] === '返回工作目录').props.onClick();
    assert.equal(section().key, defaultKey);
    assert.deepEqual(queryRows().map(textContent), defaultLabels, 'Returning restores the original landing queries');
    renderPage.flushLayoutEffects();
    const beforeReturn = focusCount;
    enter();
    assert.equal(focusCount, beforeReturn + 1);
  }
  assert.equal(distinctQuerySets.size, codemNavigationDirectories.length, 'Each preset project offers its own suggestions');
  const customFolder = Array.from(getSuggestedQueries({ id: 'custom-folder', name: '新增项目', kind: 'folder' }));
  assert.equal(customFolder.length, 5);
  assert.ok(customFolder.every(item => ['project-qa', 'project-development'].includes(item.category)), 'Unlisted folders also stay within question and development categories');
  assert.ok(customFolder.every(item => item.prompt.includes('新增项目') && item.prompt.length > item.query.length * 2));
  testWindow.matchMedia = previousMatchMedia;
  console.log('Contextual suggestion checks passed: project-specific prompts, source fallback, fresh entrance on entry/return, preserved drafts, dismissal after selection and focus on reappearance.');
}

// Device-directory selection reaches the suggestions through the actual composer toolbar.
{
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const section = () => find(page(), node => node.props['aria-label'] === '建议');
  const rows = () => nodes(section()).filter(node => node.props.className === 'new-conversation-suggestion');
  const labels = () => rows().map(textContent);
  const defaultLabels = labels();
  const toolbarElement = () => find(start().props.composer, byName('NewChatToolbar'));
  const renderToolbar = mount(toolbarElement().type);
  const toolbar = () => renderToolbar(toolbarElement().props);
  const trigger = () => find(toolbar(), node => node.props['aria-label']?.startsWith('项目：'));
  const choose = label => find(toolbar(), node => node.type === 'button' && textContent(node) === label).props.onClick({ currentTarget: new TestNode() });
  const selectDirectory = (device, project) => {
    trigger().props.onClick();
    const option = find(toolbar(), node => node.type === 'button' && textContent(node) === device);
    if (!option.props['aria-expanded']) option.props.onClick({ currentTarget: new TestNode() });
    const child = find(toolbar(), byName('DeviceSubmenu'));
    const submenu = mount(child.type)(child.props);
    find(submenu, node => node.type === 'button' && textContent(node) === project).props.onClick();
  };
  const editor = new TestNode();
  let focusCount = 0;
  editor.focus = () => { focusCount++; testDocument.activeElement = editor; };
  input(start()).props.ref.current = editor;
  const dock = new TestNode();
  dock.querySelector = () => editor;
  find(page(), node => node.props.className === 'new-conversation-dock').props.ref.current = dock;
  const previousMatchMedia = testWindow.matchMedia;
  testWindow.matchMedia = () => ({ matches: false });
  input(start()).props.onChange({ target: { value: '选择目录时保留的草稿' } });
  find(start().props.composer, node => node.props['aria-label'] === '选择附件文件').props.onChange({ target: { files: [{ name: '需求说明.md' }], value: '' } });
  const distinctSets = new Set();
  let previousKey = section().key;
  for (const [device, project] of [
    ['MacBook Pro', 'codem-shell'], ['MacBook Pro', 'light-app-database'],
    ['MacBook Pro', 'lark-mind-skill'], ['MacBook Pro', 'lark-mind-app'], ['MacBook Pro', 'todo-ai-note'],
    ['Mac Mini', 'meego-api'], ['Mac Mini', 'workflow-worker'], ['Mac Mini', 'design-system'],
    ['Mac Mini', 'integration-tests'], ['Mac Mini', 'release-tools'],
  ]) {
    selectDirectory(device, project);
    assert.notEqual(section().key, previousKey, 'A new directory remounts suggestions to replay the delayed entrance');
    previousKey = section().key;
    assert.equal(rows().length, 5);
    assert.deepEqual(rows().map(row => find(row, node => node.type === 'img').props.src), [
      'project-qa', 'project-qa', 'project-development', 'project-development', 'project-development',
    ].map(category => `/assets/figma/template-discovery/${category}.svg`));
    assert.notDeepEqual(labels(), defaultLabels);
    distinctSets.add(JSON.stringify(labels()));
    assert.equal(input(start()).props.value, '选择目录时保留的草稿');
    assert.ok(textContent(start().props.composer).includes('需求说明.md'));
    renderPage.flushLayoutEffects();
    const before = focusCount;
    const target = new TestNode();
    section().props.onAnimationStart({ target, currentTarget: target, animationName: 'new-conversation-suggestions-in' });
    assert.equal(focusCount, before + 1, 'Directory suggestions activate the composer when their entrance starts');
  }
  assert.equal(distinctSets.size, 10, 'Every preset device directory supplies contextual suggestions');
  selectDirectory('Mac Mini', 'release-tools');
  assert.equal(section().key, previousKey, 'Reselecting the current folder does not restart the entrance');
  find(toolbar(), node => node.props['aria-label']?.startsWith('CodeM 空间：')).props.onClick();
  choose('Meego');
  assert.equal(section().key, previousKey, 'Space-only changes retain the directory suggestion context');
  const chosenLabel = labels()[0];
  rows()[0].props.onClick();
  const prompt = input(start()).props.value;
  assert.ok(prompt.includes('Mac Mini') && prompt.includes('release-tools'));
  assert.ok(prompt.length > chosenLabel.length * 2, 'The device-specific prefill expands the short query');
  assert.equal(section(), undefined, 'Selecting a directory suggestion dismisses the section');
  input(start()).props.onChange({ target: { value: '' } });
  assert.equal(section().key, previousKey, 'Clearing the draft restores the selected directory suggestions');
  renderPage.flushLayoutEffects();
  selectDirectory('Mac Mini', 'Chat mode');
  assert.deepEqual(labels(), defaultLabels, 'Chat mode without a folder restores landing suggestions');
  find(page(), node => node.props['data-workspace-id'] === 'meego-platform').props.onClick();
  const workspaceLabels = labels();
  selectDirectory('MacBook Pro', 'lark-mind-skill');
  assert.notDeepEqual(labels(), workspaceLabels, 'An explicit device directory overrides the page workspace');
  trigger().props.onClick(); choose('Cloud');
  assert.deepEqual(labels(), workspaceLabels, 'Cloud restores the current workspace suggestions');
  assert.equal(section().key, 'meego-platform');
  const { getSuggestedQueries } = load(resolve(root, 'src/new-chat-suggestions.ts'));
  const custom = Array.from(getSuggestedQueries({ id: 'custom-directory', name: 'my-project', kind: 'folder', device: 'Mac Mini' }));
  assert.equal(custom.length, 5);
  assert.ok(custom.every(item => ['project-qa', 'project-development'].includes(item.category) && item.prompt.includes('my-project') && item.prompt.includes('Mac Mini')), 'Picked custom directories receive the same category mix and contextual prompts');
  testWindow.matchMedia = previousMatchMedia;
  setLocation('https://example.test/?view=new-chat');
  console.log('Device suggestion checks passed: all ten folders, two question/three development mix, entrance replay and focus, expanded prefills, preserved drafts/attachments, clear-to-restore, stable re-selection and space switch, Chat mode/Cloud fallback.');
}

// Entrance focus follows the actual animation start, including reduced-motion fallback.
{
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  const previousMatchMedia = testWindow.matchMedia;
  for (const reduced of [false, true]) {
    testWindow.matchMedia = () => ({ matches: reduced });
    const renderPage = mount(start().type);
    const page = () => renderPage(start().props);
    const editor = new TestNode();
    let focusCount = 0;
    editor.focus = options => {
      assert.equal(options.preventScroll, true, 'Entrance focus must not scroll the page');
      focusCount++;
      testDocument.activeElement = editor;
    };
    const dock = new TestNode();
    dock.querySelector = selector => {
      assert.ok(selector.includes('textarea') && selector.includes('contenteditable'), 'Both composer editor variants can receive focus');
      return editor;
    };
    find(page(), node => node.props.className === 'new-conversation-dock').props.ref.current = dock;
    const section = () => find(page(), node => node.props['aria-label'] === '建议');
    const sectionNode = new TestNode();
    const animationStart = overrides => section().props.onAnimationStart({ target: sectionNode, currentTarget: sectionNode, animationName: 'new-conversation-suggestions-in', ...overrides });
    renderPage.flushLayoutEffects();
    assert.equal(focusCount, reduced ? 1 : 0, 'Normal entrance waits for the animation, reduced motion focuses immediately');
    animationStart({ target: new TestNode() });
    animationStart({ animationName: 'unrelated-animation' });
    assert.equal(focusCount, reduced ? 1 : 0, 'Unrelated and child animations do not activate the composer');
    animationStart();
    assert.equal(focusCount, 1);
    assert.equal(testDocument.activeElement, editor);
    animationStart();
    assert.equal(focusCount, 1, 'Later animation events do not steal focus again');
  }
  testWindow.matchMedia = previousMatchMedia;
  console.log('Suggestion entrance checks passed: synchronized composer focus, reduced motion, unrelated animation filtering and one activation per page entry.');
}

// All five top-level filters stay in the dialog and never modify the draft on their own.
{
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  input(start()).props.onChange({ target: { value: '先保留这份需求草稿' } });
  const editor = new TestNode();
  input(start()).props.ref.current = editor;
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const dialog = () => find(page(), node => node.type === 'dialog');
  const dialogNode = Object.assign(new TestNode(), { open: false, show() { this.open = true; }, close() { this.open = false; } });
  dialog().props.ref.current = dialogNode;
  find(page(), node => node.props['aria-label'] === '查看模板').props.onClick();
  page(); renderPage.flushLayoutEffects();
  assert.equal(dialogNode.open, true);
  assert.equal(textContent(find(dialog(), node => node.type === 'h2')), 'Discover CodeM Templates');
  assert.ok(!find(dialog(), node => node.type === 'form'), 'The underlying composer is not duplicated inside the dialog');
  const content = () => find(dialog(), byName('NewConversationContent'));
  const renderContent = mount(content().type);
  const library = () => renderContent(content().props);
  const filters = () => nodes(find(library(), node => node.props['aria-label'] === '模板类型筛选')).filter(node => node.type === 'button');
  const filter = label => filters().find(node => textContent(node) === label);
  const cards = () => nodes(library()).filter(node => node.props.className?.startsWith('template-card') && node.type === 'button');
  const activeCategory = () => find(library(), node => node.props.role === 'tab' && node.props['aria-selected']);
  assert.equal(filters().length, 5);
  assert.equal(filters().filter(node => node.props['aria-pressed']).length, 0, 'All filters start unselected');
  const initialTitles = cards().map(node => textContent(find(node, child => child.type === 'h3')));
  const questionTemplates = [...conversationCatalog.templates, ...conversationCatalog.spaceTemplates.map(template => ({ ...template, category: '空间配置' }))];
  for (const [label, mode, expectedTemplates] of [
    ['项目问答', 'project-qa', questionTemplates],
    ['深度报告', 'deep-report', catalog.templates],
    ['项目开发', 'project-development', conversationCatalog.templates.filter(template => template.category === '项目开发')],
    ['空间配置', 'space-config', conversationCatalog.spaceTemplates],
    ['轻应用搭建', 'light-app', lightAppCatalog.templates],
  ]) {
    filter(label).props.onClick();
    assert.equal(start().props.mode, mode);
    assert.equal(filters().length, 5, 'Changing template types never removes the filter row');
    assert.equal(filters().filter(node => node.props['aria-pressed']).length, 1);
    assert.equal(filter(label).props['aria-pressed'], true);
    assert.equal(cards().length, expectedTemplates.length);
    assert.equal(new Set(expectedTemplates.map(template => template.title)).size, expectedTemplates.length, 'Each filter lists distinct template scenarios');
    for (const category of new Set(expectedTemplates.map(template => template.category))) {
      const expected = Array.from(expectedTemplates.filter(template => template.category === category), template => template.title);
      assert.ok(expected.length >= 4, `${label} / ${category} offers at least four scenarios`);
      find(library(), node => node.props.role === 'tab' && textContent(node) === category).props.onClick();
      assert.deepEqual(cards().map(node => textContent(find(node, child => child.type === 'h3'))), expected);
      for (const card of cards()) {
        const cover = find(card, node => node.type === 'img');
        assert.ok(readFileSync(resolve(root, `public${cover.props.src}`)).length > 0);
      }
    }
    const savedTab = find(library(), node => node.props.role === 'tab' && textContent(node) === '我的模板');
    if (savedTab) {
      savedTab.props.onClick();
      assert.equal(cards().length, 0, 'Built-in templates do not fabricate user-saved templates');
    }
    assert.ok(!find(library(), node => node.props.className === 'deep-report-queries'));
    assert.ok(!find(start().props.composer, node => node.props.className === 'new-chat-context'));
    assert.equal(input(start()).props.value, '先保留这份需求草稿');
    assert.equal(dialogNode.open, true, 'Selecting filters keeps the dialog open');
    filter(label).props.onClick();
    assert.equal(start().props.mode, 'default');
    assert.equal(filters().filter(node => node.props['aria-pressed']).length, 0);
    assert.deepEqual(cards().map(node => textContent(find(node, child => child.type === 'h3'))), initialTitles);
  }
  filter('深度报告').props.onClick();
  find(library(), node => node.props.role === 'tab' && textContent(node) === '风险矩阵').props.onClick();
  assert.equal(textContent(activeCategory()), '风险矩阵');
  filter('轻应用搭建').props.onClick();
  assert.equal(textContent(activeCategory()), '最佳实践', 'Switching types resets the subcategory to a valid selection');
  assert.equal(filter('深度报告').props['aria-pressed'], false);
  const chosenTitle = textContent(find(cards()[0], node => node.type === 'h3'));
  cards()[0].props.onClick();
  assert.equal(dialogNode.open, false, 'Without motion support, choosing a template closes immediately');
  assert.ok(input(start()).props.value.includes(chosenTitle));
  assert.equal(testDocument.activeElement, editor, 'Template selection returns focus to the editable prompt');
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat', 'Choosing a template prefills instead of sending');
  const suggestions = () => find(page(), node => node.props.className === 'new-conversation-suggestions');
  assert.equal(suggestions(), undefined, 'Choosing a template dismisses suggestions just like choosing a query');
  input(start()).props.onChange({ target: { value: `${input(start()).props.value}\n补充模板需求` } });
  assert.equal(suggestions(), undefined, 'Editing the template prompt keeps suggestions dismissed');
  input(start()).props.onChange({ target: { value: '' } });
  assert.equal(nodes(suggestions()).filter(node => node.props.className === 'new-conversation-suggestion').length, 5, 'Clearing a template prompt restores all five suggestions');

  const dir = resolve(root, 'public/assets/figma/template-discovery');
  const provenance = JSON.parse(readFileSync(resolve(dir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.assets.length, 7);
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(dir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/template-discovery', asset.file)), bytes);
  }
  console.log('Template discovery checks passed: contained non-modal entry, retained background/composer, five optional single-selection filters, toggle-off/reset, scoped subcategories/cards, close-and-prefill focus, draft preservation and seven original Figma assets. Layout and animation appearance remain manual acceptance.');
}

// Closing reverses the live entrance and waits for both layers before releasing the page.
{
  const { createTemplateDiscoveryMotion } = load(resolve(root, 'src/template-discovery-motion.ts'));
  const { initialReportState } = load(resolve(root, 'src/report-controls.ts'));
  const previousMatchMedia = testWindow.matchMedia;
  const media = Object.assign(new EventTarget(), { matches: false });
  testWindow.matchMedia = () => media;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const makeLayers = () => {
    const animations = [];
    const layer = () => ({ animate(frames, options) {
      let resolveFinished, rejectFinished;
      const finished = new Promise((resolve, reject) => { resolveFinished = resolve; rejectFinished = reject; });
      finished.catch(() => {});
      const animation = {
        frames, options, finished, currentTime: options.duration + (options.delay ?? 0), playbackRate: 1,
        played: 0, paused: 0, cancelled: 0,
        updatePlaybackRate(rate) { this.playbackRate = rate; },
        play() { this.played++; }, pause() { this.paused++; },
        cancel() { this.cancelled++; rejectFinished(new Error('cancelled')); },
        finish() { resolveFinished(); },
      };
      animations.push(animation);
      return animation;
    } });
    return { surface: layer(), body: layer(), animations };
  };
  const layers = makeLayers();
  let exits = 0;
  const motion = createTemplateDiscoveryMotion(layers.surface, layers.body, () => exits++);
  assert.equal(layers.animations.length, 2, 'White background and content animate independently');
  motion.exit(); motion.exit();
  assert.equal(exits, 0, 'The overlay remains present throughout its exit');
  assert.ok(layers.animations.every(animation => animation.played === 1 && animation.playbackRate < -1), 'Repeated close events cannot restart the faster exit');
  layers.animations[0].finish(); await settle();
  assert.equal(exits, 0, 'Wait for content as well as the white background');
  layers.animations[1].finish(); await settle();
  assert.equal(exits, 1);
  motion.dispose();

  const interrupted = makeLayers();
  const early = createTemplateDiscoveryMotion(interrupted.surface, interrupted.body, () => exits++);
  interrupted.animations.forEach(animation => { animation.currentTime = 60; });
  early.exit();
  assert.ok(interrupted.animations.every(animation => animation.currentTime === 60), 'Closing during entry continues from the visible frame');
  early.dispose(); await settle();
  assert.equal(exits, 1, 'Unmounting cannot run a stale exit callback');
  const immediate = makeLayers();
  const zero = createTemplateDiscoveryMotion(immediate.surface, immediate.body, () => exits++);
  immediate.animations.forEach(animation => { animation.currentTime = 0; });
  zero.exit(); await settle();
  assert.ok(immediate.animations.every(animation => animation.played === 0), 'A same-frame close never flashes the fully open overlay');
  assert.equal(exits, 2);
  zero.dispose();

  media.matches = true;
  const reduced = makeLayers();
  const reducedMotion = createTemplateDiscoveryMotion(reduced.surface, reduced.body, () => exits++);
  assert.equal(reduced.animations.length, 0);
  reducedMotion.exit(); assert.equal(exits, 3, 'Reduced motion closes without delaying interaction');
  reducedMotion.dispose();
  media.matches = false;

  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  input(start()).props.onChange({ target: { value: '动画结束前保留草稿' } });
  const editor = new TestNode(); input(start()).props.ref.current = editor;
  const renderPage = mount(start().type);
  const page = () => renderPage(start().props);
  const dialog = () => find(page(), node => node.type === 'dialog');
  const overlay = Object.assign(new TestNode(), { open: false, show() { this.open = true; }, close() { this.open = false; } });
  const dock = Object.assign(new TestNode(), { inert: false });
  const scroll = Object.assign(new TestNode(), { inert: false });
  const animated = makeLayers();
  dialog().props.ref.current = overlay;
  find(page(), node => node.props.className === 'new-conversation-dock').props.ref.current = dock;
  find(page(), node => node.props.className === 'new-conversation-scroll').props.ref.current = scroll;
  find(page(), node => node.props.className === 'template-discovery-surface').props.ref.current = animated.surface;
  find(page(), node => node.props.className === 'template-discovery-body').props.ref.current = animated.body;
  find(page(), node => node.props['aria-label'] === '查看模板').props.onClick();
  page(); const dispose = renderPage.flushLayoutEffects();
  assert.equal(overlay.open, true);
  assert.equal(dock.inert, true);
  const library = find(dialog(), byName('NewConversationContent'));
  library.props.onChoose({ prompt: '动画结束后填入模板', theme: initialReportState.theme });
  assert.equal(overlay.open, true);
  assert.equal(input(start()).props.value, '动画结束前保留草稿');
  assert.equal(dock.inert, true, 'The covered composer stays inert during exit');
  assert.ok(find(page(), node => node.props.className === 'new-conversation-suggestions'), 'Suggestions remain in place until the template is actually prefilled');
  animated.animations.forEach(animation => animation.finish()); await settle();
  assert.equal(overlay.open, false);
  assert.equal(dock.inert, false);
  assert.equal(scroll.inert, false);
  assert.equal(input(start()).props.value, '动画结束后填入模板');
  assert.equal(testDocument.activeElement, editor);
  assert.equal(find(page(), node => node.props.className === 'new-conversation-suggestions'), undefined, 'Animated template handoff dismisses suggestions with the prefill');
  dispose();

  const changed = makeLayers();
  const changedMotion = createTemplateDiscoveryMotion(changed.surface, changed.body, () => exits++);
  changedMotion.exit();
  media.matches = true; media.dispatchEvent(new Event('change')); await settle();
  assert.equal(exits, 4, 'Changing motion preferences during exit finishes once without stranding the overlay');
  changedMotion.dispose();
  testWindow.matchMedia = previousMatchMedia;
  console.log('Template motion checks passed: coordinated entry/exit, early reversal, duplicate dismissal, zero-frame close, disposal, reduced motion, composer inertness and delayed template/focus handoff.');
}

// Intelligence uses the codem-app slider presentation and commits previews on dismissal.
{
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  input(start()).props.onChange({ target: { value: '调节智能强度时保留的草稿' } });
  const toolbarElement = () => find(start().props.composer, byName('NewChatToolbar'));
  const render = mount(toolbarElement().type);
  const view = () => render(toolbarElement().props);
  const trigger = () => find(view(), node => node.props.className === 'new-chat-intelligence');
  const popup = () => find(view(), node => node.props.role === 'dialog' && node.props['aria-label'] === 'Intelligence');
  const slider = () => {
    const element = find(popup(), byName('IntelligenceSlider'));
    return element && mount(element.type)(element.props);
  };
  const range = () => find(slider(), node => node.props.type === 'range');
  const setLevel = index => range().props.onChange({ currentTarget: { value: String(index) } });
  const key = value => ({ key: value, preventDefault() {}, stopPropagation() {} });
  const triggerNode = new TestNode();
  trigger().props.ref.current = triggerNode;
  assert.equal(trigger().props['aria-haspopup'], 'dialog');
  const levels = ['Low', 'Medium', 'High', 'Ultra'];
  const colors = ['#F1F1FC', '#FFE46C', '#FFB36C', '#8C6CFF'];
  for (const [index, label] of levels.entries()) {
    const committed = textContent(trigger());
    trigger().props.onClick();
    assert.equal(trigger().props['aria-controls'], popup().props.id);
    assert.equal(range().props.min, 0);
    assert.equal(range().props.max, 3);
    assert.equal(range().props.step, 1, 'Native range supports discrete pointer, touch and keyboard adjustment');
    setLevel(index);
    assert.ok(popup(), 'Adjusting the slider leaves the popover open');
    assert.equal(textContent(trigger()), committed, 'The toolbar retains its committed level during preview');
    assert.equal(range().props.value, index);
    assert.equal(range().props['aria-valuetext'], label);
    assert.ok(textContent(slider()).includes(label));
    const fill = find(slider(), node => node.props.className === 'intelligence-slider-fill');
    assert.equal(fill.props.style.backgroundColor, colors[index]);
    assert.equal(fill.props.style.transform, `scaleX(${(index + 1) / 4})`);
    assert.equal(find(slider(), node => node.props.className === 'intelligence-slider').props['data-contrast'], index === 3 ? 'inverse' : 'default');
    trigger().props.onClick();
    assert.equal(popup(), undefined);
    assert.equal(textContent(trigger()), label, 'Closing commits the preview');
    trigger().props.onClick();
    assert.equal(range().props.value, index, 'Reopening starts at the last committed level');
    trigger().props.onClick();
  }
  trigger().props.onClick();
  for (const invalid of [-1, 4, .5, NaN]) setLevel(invalid);
  assert.equal(range().props['aria-valuetext'], 'Ultra', 'Out-of-range values do not corrupt selection');
  setLevel(1);
  view().props.onKeyDown(key('Escape'));
  assert.equal(popup(), undefined);
  assert.equal(textContent(trigger()), 'Medium');
  assert.equal(testDocument.activeElement, triggerNode);
  for (const [closingKey, index] of [['Enter', 0], ['Tab', 2]]) {
    trigger().props.onClick();
    setLevel(index);
    popup().props.onKeyDown(key(closingKey));
    assert.equal(popup(), undefined);
    assert.equal(textContent(trigger()), levels[index]);
    assert.equal(testDocument.activeElement, triggerNode);
  }
  trigger().props.onClick();
  setLevel(3);
  find(view(), node => node.props['aria-label'] === '添加内容').props.onClick();
  assert.equal(popup(), undefined, 'Opening another toolbar menu dismisses the slider');
  assert.equal(textContent(trigger()), 'Ultra', 'Switching menus commits the preview');
  find(view(), node => node.props['aria-label'] === '添加内容').props.onClick();

  const viewport = { width: testWindow.innerWidth, height: testWindow.innerHeight };
  const rangeNode = new TestNode();
  const popupNode = new TestNode([rangeNode]);
  popupNode.querySelector = selector => selector === 'input[type="range"]' ? rangeNode : null;
  for (const [width, height, keyboard, anchorLeft] of [[1440, 900, false, 600], [1440, 900, true, 1320], [390, 650, true, 20], [240, 180, true, 120]]) {
    testWindow.innerWidth = width; testWindow.innerHeight = height;
    const rect = { left: anchorLeft, right: anchorLeft + 90, top: height - 48, bottom: height - 12 };
    triggerNode.getBoundingClientRect = () => rect;
    triggerNode.closest = () => null;
    triggerNode.focus();
    if (keyboard) trigger().props.onKeyDown(key('ArrowDown'));
    else trigger().props.onClick({ detail: 1 });
    popup().props.ref.current = popupNode;
    const dispose = render.flushLayoutEffects();
    const style = popup().props.style;
    assert.ok(style.width <= 248 && style.left >= 12 && style.left + style.width <= width - 12);
    assert.equal(style.height, 88);
    const centeredLeft = (rect.left + rect.right - style.width) / 2;
    assert.equal(style.left, Math.max(12, Math.min(centeredLeft, width - style.width - 12)), 'The panel is centered on its trigger, clamped only near viewport edges');
    assert.equal(rect.top - (style.top + style.maxHeight), 8, 'The slider opens eight pixels above the trigger');
    assert.equal(testDocument.activeElement, keyboard ? rangeNode : triggerNode, 'Keyboard opens focus the slider; pointer opens preserve trigger focus');
    let prevented = false;
    popup().props.onKeyDown({ key: 'ArrowRight', preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, false, 'Menu navigation does not intercept native slider keys');
    setLevel(1);
    testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: rangeNode }));
    assert.ok(popup(), 'Pointer interaction inside the slider does not dismiss it');
    setLevel(0);
    testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: new TestNode() }));
    assert.equal(popup(), undefined);
    assert.equal(textContent(trigger()), 'Low', 'Outside dismissal commits even the latest unrendered input event');
    dispose();
  }
  testWindow.innerWidth = viewport.width; testWindow.innerHeight = viewport.height;
  assert.equal(input(start()).props.value, '调节智能强度时保留的草稿');
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat');
  console.log('Intelligence slider checks passed: four colored levels, native range semantics, live preview, close/reopen commit, Escape/Enter/Tab and outside dismissal, exclusive menus, keyboard focus, upward positioning and retained drafts. Native dragging and pixel acceptance remain manual.');
}

// Composer menus share the viewport-aware positioning used by the table pickers.
{
  setLocation('https://example.test/?view=new-chat');
  const renderApp = mount(appElement.type);
  const start = () => find(renderApp(), byName('NewConversation'));
  input(start()).props.onChange({ target: { value: '根据现有项目创建工作计划' } });
  const element = () => find(start().props.composer, byName('NewChatToolbar'));
  const render = mount(element().type);
  const view = () => render(element().props);
  const trigger = kind => find(view(), node => node.type === 'button' && (kind === 'cloud'
    ? node.props['aria-label']?.startsWith('项目：') : kind === 'space' ? node.props['aria-label']?.startsWith('CodeM 空间：') : kind === 'approval'
      ? node.props['aria-label']?.startsWith('审批方式：') : node.props.className === 'new-chat-intelligence'));
  const popup = () => find(view(), node => node.props.role === 'menu');
  const options = () => nodes(popup()).filter(node => node.type === 'button');
  const optionLabel = node => node.props['aria-label'] ?? textContent(node);
  const choose = label => options().find(node => optionLabel(node) === label).props.onClick();
  const expected = {
    cloud: ['Cloud', 'MacBook Pro', 'Mac Mini', 'DC’s MacBook Air离线'],
    space: ['CodeM Space', 'Meego', 'Lark Office', 'Aily'],
    approval: ['Ask for approval', 'Approve for me', 'Full access'],
  };
  const menuTitles = { cloud: 'Devices', space: 'CodeM Space', approval: 'Permissions' };
  const triggerNodes = Object.fromEntries([...Object.keys(expected), 'intelligence'].map(kind => [kind, new TestNode()]));
  for (const kind of Object.keys(triggerNodes)) trigger(kind).props.ref.current = triggerNodes[kind];
  const contextControl = find(view(), node => node.props.className === 'new-chat-context-switcher');
  assert.deepEqual(nodes(contextControl).filter(node => node.type === 'button').map(textContent), ['Cloud', 'CodeM Space'], 'Device and space remain grouped');
  const toolbarLeft = find(view(), node => node.props.className === 'new-chat-toolbar-left');
  assert.deepEqual(nodes(toolbarLeft).filter(node => node.type === 'button').map(node => node.props['aria-label']), ['添加内容', '项目：Cloud', 'CodeM 空间：CodeM Space', '审批方式：Approve for me'], 'Device and space controls sit after add and before approval in the bottom toolbar');
  for (const [kind, labels] of Object.entries(expected)) {
    trigger(kind).props.onClick();
    assert.deepEqual(options().map(optionLabel), labels);
    assert.equal(trigger(kind).props['aria-haspopup'], 'menu');
    assert.equal(trigger(kind).props['aria-controls'], popup().props.id);
    assert.equal(textContent(find(popup(), node => node.props.className === 'new-chat-menu-title')), menuTitles[kind]);
    assert.equal(nodes(popup()).filter(node => node.props.role === 'separator').length, kind === 'cloud' ? 1 : 0);
    assert.equal(options().filter(node => node.props['aria-checked']).length, 1);
    for (const label of kind === 'cloud' ? ['Cloud'] : labels) {
      if (!popup()) trigger(kind).props.onClick();
      choose(label);
      assert.equal(popup(), undefined, 'Selecting an item closes the menu');
      assert.ok(textContent(trigger(kind)).includes(label));
      assert.equal(testDocument.activeElement, triggerNodes[kind], 'Selection restores the owning trigger');
      trigger(kind).props.onClick();
      assert.equal(optionLabel(options().find(node => node.props['aria-checked'])), label);
    }
    trigger(kind).props.onClick();
    assert.equal(popup(), undefined, 'Clicking the trigger again dismisses its menu');
  }
  const deviceNode = new TestNode();
  const deviceOption = name => options().find(node => textContent(node) === name);
  const expandDevice = name => { if (!deviceOption(name).props['aria-expanded']) deviceOption(name).props.onClick({ currentTarget: deviceNode }); };
  const submenuElement = () => find(view(), byName('DeviceSubmenu'));
  let renderDevice;
  const submenu = () => {
    const element = submenuElement();
    return element && renderDevice(element.props);
  };
  const chooseDeviceOption = label => find(submenu(), node => node.type === 'button' && textContent(node) === label).props.onClick();
  const expectedDeviceOptions = {
    'MacBook Pro': ['Chat mode', 'codem-shell', 'light-app-database', 'lark-mind-skill', 'lark-mind-app', 'todo-ai-note', 'New project'],
    'Mac Mini': ['Chat mode', 'meego-api', 'workflow-worker', 'design-system', 'integration-tests', 'release-tools', 'New project'],
  };
  trigger('cloud').props.onClick();
  const offline = options().find(option => option.props.disabled);
  assert.equal(textContent(offline), 'DC’s MacBook Air离线');
  assert.equal(offline.props['aria-disabled'], true);
  assert.equal(offline.props['aria-expanded'], false);
  assert.equal(find(offline, byName('MenuIcon')).props.name, 'device', 'Offline reuses the original device asset');
  const selectionBeforeOffline = trigger('cloud').props.title;
  offline.props.onClick({ currentTarget: new TestNode() });
  offline.props.onKeyDown({ key: 'ArrowRight', currentTarget: new TestNode(), preventDefault() {}, stopPropagation() {} });
  assert.equal(submenuElement(), undefined, 'An offline device cannot open its submenu by click or keyboard');
  assert.equal(trigger('cloud').props.title, selectionBeforeOffline, 'Offline actions cannot change the selected environment');
  assert.equal(input(start()).props.value, '根据现有项目创建工作计划', 'Offline actions preserve the composer draft');
  trigger('cloud').props.onClick();
  for (const device of ['MacBook Pro', 'Mac Mini']) {
    trigger('cloud').props.onClick();
    assert.equal(submenuElement()?.props.device, device === 'MacBook Pro' ? undefined : 'MacBook Pro', 'Reopening restores the last selected folder’s device');
    assert.equal(deviceOption('Cloud').props['aria-haspopup'], undefined, 'Cloud has no second level');
    expandDevice(device);
    renderDevice = mount(submenuElement().type);
    assert.ok(popup(), 'Expanding a device keeps the first menu open');
    assert.equal(deviceOption(device).props['aria-expanded'], true);
    assert.equal(deviceOption(device).props['aria-controls'], submenu().props.id);
    assert.deepEqual(nodes(submenu()).filter(node => node.type === 'button').map(textContent), expectedDeviceOptions[device]);
    for (const label of expectedDeviceOptions[device].slice(0, -1)) {
      chooseDeviceOption(label);
      assert.equal(popup(), undefined);
      assert.equal(trigger('cloud').props.title, `${device} · ${label}`);
      assert.equal(trigger('space').props.title, 'Aily', 'Changing device, Chat mode or folder keeps the selected space');
      assert.equal(testDocument.activeElement, triggerNodes.cloud);
      trigger('cloud').props.onClick();
      assert.equal(deviceOption(device).props['data-selected'], true);
      if (label === 'Chat mode') {
        assert.equal(submenuElement(), undefined, 'Chat mode keeps the initial device-list behavior');
        expandDevice(device);
      } else {
        assert.equal(submenuElement()?.props.device, device, 'A selected folder opens its submenu without a second click');
        assert.equal(deviceOption(device).props.ref, submenuElement().props.anchorRef, 'Automatic expansion anchors to the newly mounted device row');
      }
      assert.equal(textContent(find(submenu(), node => node.props['aria-checked'])), label);
    }
    submenu().props.onKeyDown({ key: 'ArrowLeft', preventDefault() {}, stopPropagation() {} });
    assert.equal(submenuElement(), undefined);
    assert.ok(popup());
    assert.equal(testDocument.activeElement, deviceNode, 'Returning restores focus to the device');
    deviceOption(device).props.onKeyDown({ key: 'ArrowRight', currentTarget: deviceNode, preventDefault() {}, stopPropagation() {} });
    assert.ok(submenuElement(), 'ArrowRight opens device options');
    submenu().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.equal(submenuElement(), undefined);
    assert.ok(popup(), 'Escape from the second level retains the first level');
    trigger('cloud').props.onClick();
  }
  trigger('cloud').props.onClick();
  expandDevice('MacBook Pro');
  assert.equal(find(submenu(), node => node.props['aria-checked']), undefined, 'Selecting a Mac Mini project does not select a MacBook Pro project');
  expandDevice('Mac Mini');
  assert.equal(submenuElement().props.device, 'Mac Mini', 'Devices switch without selecting a project');
  const selectedProject = trigger('cloud').props.title;
  trigger('space').props.onClick();
  assert.equal(submenuElement(), undefined, 'Opening the space menu closes the device flyout');
  assert.equal(nodes(view()).filter(node => node.props.role === 'menu').length, 1, 'Only one context menu is open');
  choose('Meego');
  assert.equal(trigger('cloud').props.title, selectedProject, 'Switching spaces preserves the selected device and folder');
  assert.equal(testDocument.activeElement, triggerNodes.space, 'Space selection restores the space trigger');
  trigger('cloud').props.onClick();
  assert.equal(submenuElement().props.device, 'Mac Mini', 'Switching spaces preserves automatic folder expansion');
  const folderInput = () => find(view(), node => node.props['aria-label'] === '选择项目文件夹');
  let pickerClicks = 0;
  folderInput().props.ref.current = { value: 'previous selection', click: () => pickerClicks++ };
  chooseDeviceOption('New project');
  assert.equal(pickerClicks, 1, 'New project reaches the native folder input when the directory API is unavailable');
  assert.equal(folderInput().props.webkitdirectory, '');
  assert.equal(folderInput().props.ref.current.value, '', 'The same folder can be selected again');
  assert.equal(popup(), undefined);
  trigger('cloud').props.onClick(); choose('Cloud');
  assert.equal(trigger('cloud').props.title, 'Cloud');
  assert.equal(trigger('space').props.title, 'Meego', 'Cloud switching also preserves the selected space');
  trigger('approval').props.onClick();
  trigger('intelligence').props.onClick();
  assert.equal(nodes(view()).filter(node => ['menu', 'dialog'].includes(node.props.role)).length, 1);
  assert.ok(find(view(), node => node.props.role === 'dialog' && node.props['aria-label'] === 'Intelligence'));
  assert.equal(trigger('approval').props['aria-expanded'], false);
  view().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(popup(), undefined);
  assert.equal(find(view(), byName('IntelligenceSlider')), undefined);
  assert.equal(testDocument.activeElement, triggerNodes.intelligence);

  const viewport = { width: testWindow.innerWidth, height: testWindow.innerHeight };
  for (const [width, height, nearRight] of [[1440, 900, false], [1440, 900, true], [390, 650, true], [280, 260, true]]) {
    testWindow.innerWidth = width; testWindow.innerHeight = height;
    const rect = { left: nearRight ? width - 145 : 32, right: nearRight ? width - 20 : 157, top: height - 52, bottom: height - 20 };
    triggerNodes.cloud.getBoundingClientRect = () => rect;
    triggerNodes.cloud.closest = () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: height }) });
    trigger('cloud').props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
    const items = options().map(option => Object.assign(new TestNode(), { disabled: Boolean(option.props.disabled) }));
    const enabledItems = items.filter(item => !item.disabled);
    const menuNode = new TestNode(items);
    items.forEach(item => { item.closest = () => menuNode; });
    menuNode.querySelectorAll = () => items;
    menuNode.querySelector = () => items[0];
    popup().props.ref.current = menuNode;
    const cleanup = render.flushLayoutEffects();
    const style = popup().props.style;
    assert.equal(style.width, 256);
    assert.ok(style.left >= 12 && style.left + style.width <= width - 12, 'Menus stay inside a narrow viewport');
    assert.ok(style.top >= 8 && style.top + style.maxHeight < rect.top, 'Dock menus open above the trigger');
    assert.ok(style.maxHeight <= 187);
    assert.equal(testDocument.activeElement, items[0], 'ArrowDown opens the menu at the first option');
    const press = key => popup().props.onKeyDown({ key, currentTarget: menuNode, preventDefault() {}, stopPropagation() {} });
    press('End'); assert.equal(testDocument.activeElement, enabledItems.at(-1), 'Keyboard navigation skips the offline device');
    press('ArrowDown'); assert.equal(testDocument.activeElement, items[0]);
    press('ArrowUp'); assert.equal(testDocument.activeElement, enabledItems.at(-1));
    press('Home'); assert.equal(testDocument.activeElement, items[0]);
    const pointer = target => testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: target }));
    pointer(items[1]);
    assert.ok(popup(), 'Menu items are inside the portaled popup and stay clickable');
    menuNode.getBoundingClientRect = () => ({ left: style.left, right: style.left + style.width, top: style.top, bottom: style.top + style.maxHeight });
    deviceNode.getBoundingClientRect = () => ({ left: style.left + 4, right: style.left + style.width - 4, top: style.top + 83, bottom: style.top + 115 });
    expandDevice('MacBook Pro');
    renderDevice = mount(submenuElement().type);
    const childItems = expectedDeviceOptions['MacBook Pro'].map(() => new TestNode());
    const childNode = new TestNode(childItems);
    childNode.parentElement = menuNode;
    childNode.querySelector = () => childItems[0];
    childNode.querySelectorAll = () => childItems;
    childItems.forEach(item => { item.closest = () => childNode; });
    menuNode.children.push(childNode);
    submenu().props.ref.current = childNode;
    const cleanupDevice = renderDevice.flushLayoutEffects();
    const childStyle = submenu().props.style;
    assert.ok(childStyle.left >= 12 && childStyle.left + childStyle.width <= width - 12, 'Second-level menu stays horizontally visible');
    assert.ok(childStyle.top >= 12 && childStyle.top + childStyle.maxHeight <= height - 12, 'Second-level menu stays vertically visible');
    assert.equal(Boolean(find(submenu(), node => node.props['aria-label'] === '返回设备列表')), width < 500, 'Narrow layouts provide a back action');
    if (width > 500) assert.equal(nearRight ? childStyle.left + childStyle.width : childStyle.left, nearRight ? style.left : style.left + style.width, 'Flyout touches the parent on the available side without a gap');
    assert.equal(testDocument.activeElement, childItems[0]);
    submenu().props.onKeyDown({ key: 'End', currentTarget: childNode, preventDefault() {}, stopPropagation() {} });
    assert.equal(testDocument.activeElement, childItems.at(-1), 'Submenu keyboard navigation stays in the second level');
    pointer(childItems[2]);
    assert.ok(popup(), 'Submenu pointer events do not dismiss the parent before selection');
    chooseDeviceOption('lark-mind-skill');
    cleanupDevice();
    cleanup();
    assert.equal(popup(), undefined, 'Choosing a folder closes both menu levels');
    for (let reopen = 0; reopen < 2; reopen++) {
      trigger('cloud').props.onClick();
      assert.equal(submenuElement().props.device, 'MacBook Pro');
      const rootRef = popup().props.ref;
      rootRef.current = null;
      const reopenedStyle = popup().props.style;
      assert.equal(reopenedStyle.left, style.left);
      assert.equal(reopenedStyle.top, style.top, 'Reopening keeps the parent coordinates unchanged');
      deviceOption('MacBook Pro').props.ref.current = deviceNode;
      renderDevice = mount(submenuElement().type);
      childNode.querySelector = () => childItems[3];
      submenu().props.ref.current = childNode;
      // React runs child layout effects before attaching the enclosing menu's ref.
      const cleanupReopenedDevice = renderDevice.flushLayoutEffects();
      const reopenedChildStyle = submenu().props.style;
      assert.equal(reopenedChildStyle.left, childStyle.left, 'Automatic expansion positions beside the mounted parent before its ref is attached');
      assert.equal(reopenedChildStyle.top, childStyle.top, 'Automatic expansion never stays at the viewport origin');
      assert.equal(testDocument.activeElement, childItems[3], 'Reopening focuses the selected folder');
      rootRef.current = menuNode;
      const cleanupReopened = render.flushLayoutEffects();
      testWindow.dispatchEvent(new Event('resize'));
      assert.equal(submenu().props.style.left, childStyle.left, 'Reopened submenu keeps tracking its parent');
      pointer(new TestNode());
      assert.equal(popup(), undefined, 'Outside pointer dismisses both reopened levels');
      cleanupReopenedDevice();
      cleanupReopened();
    }
    trigger('cloud').props.onClick();
    choose('Cloud');
  }
  for (const kind of ['cloud', 'space', 'approval']) {
    for (const [width, top] of [[1440, 350], [390, 90]]) {
      testWindow.innerWidth = width; testWindow.innerHeight = 900;
      const rect = { left: width - 150, right: width - 20, top, bottom: top + 32 };
      triggerNodes[kind].getBoundingClientRect = () => rect;
      triggerNodes[kind].closest = () => ({ getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: 900 }) });
      trigger(kind).props.onClick();
      popup().props.ref.current = Object.assign(new TestNode(), { querySelectorAll: () => [] });
      const cleanup = render.flushLayoutEffects();
      const style = popup().props.style;
      assert.equal(style.top + style.maxHeight, top - 4, `${kind} opens upward even when more space is available below`);
      assert.ok(style.top >= 8 && style.left >= 12 && style.left + style.width <= width - 12);
      if (top === 90) assert.ok(style.maxHeight < style.height, 'Limited space above constrains the scrollable menu height');
      let cleanupFlyout = () => {};
      if (kind === 'cloud') {
        const parentNode = popup().props.ref.current;
        parentNode.getBoundingClientRect = () => ({ left: style.left, right: style.left + style.width, top: style.top, bottom: style.top + style.maxHeight });
        deviceNode.getBoundingClientRect = () => ({ left: style.left + 4, right: style.left + style.width - 4, top: style.top + 83, bottom: style.top + 115 });
        expandDevice('MacBook Pro');
        renderDevice = mount(submenuElement().type);
        submenu().props.ref.current = Object.assign(new TestNode(), { parentElement: parentNode });
        cleanupFlyout = renderDevice.flushLayoutEffects();
        const flyoutStyle = submenu().props.style;
        assert.ok(flyoutStyle.top >= 12 && flyoutStyle.top + flyoutStyle.maxHeight <= style.top + style.maxHeight, 'The device flyout also stays above the context trigger when vertical space is limited');
      }
      rect.top -= 20; rect.bottom -= 20;
      testWindow.dispatchEvent(new Event('scroll'));
      assert.equal(popup().props.style.top + popup().props.style.maxHeight, rect.top - 4, 'Scrolling retains upward placement');
      trigger(kind).props.onClick();
      cleanupFlyout();
      cleanup();
    }
  }
  testWindow.innerWidth = viewport.width; testWindow.innerHeight = viewport.height;
  trigger('space').props.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
  view().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(popup(), undefined, 'Escape closes the space menu');
  assert.equal(testDocument.activeElement, triggerNodes.space);
  trigger('space').props.onKeyDown({ key: 'ArrowUp', preventDefault() {} });
  popup().props.onKeyDown({ key: 'Tab' });
  assert.equal(popup(), undefined, 'Tab closes the space menu');
  assert.equal(testDocument.activeElement, triggerNodes.space);
  trigger('approval').props.onClick();
  popup().props.onKeyDown({ key: 'Tab' });
  assert.equal(popup(), undefined);
  assert.equal(testDocument.activeElement, triggerNodes.approval);
  assert.equal(input(start()).props.value, '根据现有项目创建工作计划');
  assert.equal(testWindow.location.pathname + testWindow.location.search, '/?view=new-chat');

  const openPicker = device => { trigger('cloud').props.onClick(); expandDevice(device); chooseDeviceOption('New project'); };
  const pickerSettled = () => new Promise(resolve => setImmediate(resolve));
  let nativePickerCalls = 0;
  testWindow.showDirectoryPicker = async options => {
    nativePickerCalls++;
    assert.equal(options.mode, 'read');
    return { name: 'chosen-project' };
  };
  openPicker('MacBook Pro'); await pickerSettled();
  assert.equal(nativePickerCalls, 1);
  assert.equal(trigger('cloud').props.title, 'MacBook Pro · chosen-project');
  assert.equal(testDocument.activeElement, triggerNodes.cloud);
  openPicker('MacBook Pro'); await pickerSettled();
  trigger('cloud').props.onClick(); expandDevice('MacBook Pro');
  assert.equal(nodes(submenu()).filter(node => node.type === 'button' && textContent(node) === 'chosen-project').length, 1, 'Repeated folder selection does not duplicate a project');
  expandDevice('Mac Mini');
  assert.ok(!textContent(submenu()).includes('chosen-project'), 'New folders belong only to the chosen device');
  trigger('cloud').props.onClick();
  testWindow.showDirectoryPicker = async () => { throw { name: 'AbortError' }; };
  openPicker('Mac Mini'); await pickerSettled();
  assert.equal(trigger('cloud').props.title, 'MacBook Pro · chosen-project', 'Cancelling preserves the selected project');
  testWindow.showDirectoryPicker = async () => { throw { name: 'SecurityError' }; };
  openPicker('Mac Mini'); await pickerSettled();
  assert.equal(textContent(find(renderApp(), node => node.props.role === 'status')), '无法选择文件夹，请重试');
  assert.equal(trigger('cloud').props.title, 'MacBook Pro · chosen-project');
  delete testWindow.showDirectoryPicker;
  openPicker('Mac Mini');
  folderInput().props.onChange({ currentTarget: { files: [{ webkitRelativePath: 'fallback-project/src/main.ts' }], value: 'selection' } });
  assert.equal(trigger('cloud').props.title, 'Mac Mini · fallback-project');
  openPicker('Mac Mini');
  folderInput().props.onChange({ currentTarget: { files: [], value: '' } });
  assert.equal(trigger('cloud').props.title, 'Mac Mini · fallback-project', 'Empty fallback selections preserve the current project');
  assert.equal(input(start()).props.value, '根据现有项目创建工作计划', 'Folder selection retains the message draft');

  const dir = resolve(root, 'public/assets/figma/new-chat-menus');
  const provenance = JSON.parse(readFileSync(resolve(dir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.assets.length, 11);
  for (const asset of provenance.assets) {
    const bytes = readFileSync(resolve(dir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/new-chat-menus', asset.file)), bytes);
    if (asset.file.endsWith('.png')) assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [60, 60]);
  }
  const contextDir = resolve(root, 'public/assets/figma/new-chat-context');
  const contextAssets = JSON.parse(readFileSync(resolve(contextDir, 'provenance.json'), 'utf8'));
  for (const asset of contextAssets.assets) {
    const bytes = readFileSync(resolve(contextDir, asset.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.ok(bytes.toString().includes(`viewBox="0 0 ${asset.width} ${asset.height}"`));
    assert.deepEqual(readFileSync(resolve(root, 'dist/assets/figma/new-chat-context', asset.file)), bytes);
  }
  submit(start());
  const sentToolbar = find(renderApp(), byName('NewChatToolbar'));
  assert.equal(sentToolbar.props.initialEnvironment.spaceId, 'meego', 'Sending a new conversation carries the space choice into its saved environment');
  assert.equal(sentToolbar.props.initialEnvironment.device, 'Mac Mini');
  assert.equal(sentToolbar.props.initialEnvironment.project, 'fallback-project');
  const restoredContext = mount(sentToolbar.type)(sentToolbar.props);
  assert.ok(find(restoredContext, node => node.props['aria-label'] === 'CodeM 空间：Meego'));
  console.log('Context switcher checks passed: shared capsule, independent space/device choices, single open menu, selection persistence, keyboard dismissal and original Figma asset integrity. Pixel acceptance remains manual.');
  console.log('Composer menu checks passed: Cloud/device hierarchy, device-specific choices, Chat mode, project action feedback, keyboard/focus and back navigation, outside dismissal, left/right flyouts and narrow-screen fallback, draft preservation and original icon exports. Visual acceptance remains manual.');
}

// Home menus open downward, including the device flyout, and track their triggers.
{
  setLocation('https://example.test/home');
  const home = find(mount(appElement.type)(), byName('HomePage'));
  const toolbar = find(mount(home.type)(home.props), byName('NewChatToolbar'));
  const viewport = { width: testWindow.innerWidth, height: testWindow.innerHeight };
  for (const [width, top] of [[1440, 240], [390, 500]]) {
    testWindow.innerWidth = width; testWindow.innerHeight = 720;
    for (const kind of ['cloud', 'space', 'approval', 'intelligence']) {
      const render = mount(toolbar.type);
      const view = () => render(toolbar.props);
      const trigger = () => find(view(), node => node.type === 'button' && node.props.className === ({ cloud: 'new-chat-environment-trigger', space: 'new-chat-space-trigger', approval: 'new-chat-option', intelligence: 'new-chat-intelligence' })[kind]);
      const popup = () => find(view(), node => node.props.id === `new-chat-${kind}-menu`);
      const rect = { left: width - 160, right: width - 40, top, bottom: top + 32 };
      trigger().props.ref.current = Object.assign(new TestNode(), { getBoundingClientRect: () => rect });
      trigger().props.onClick();
      const parentNode = Object.assign(new TestNode(), { querySelectorAll: () => [], getBoundingClientRect: () => {
        const style = popup().props.style;
        return { left: style.left, right: style.left + style.width, top: style.top, bottom: style.top + style.maxHeight };
      } });
      popup().props.ref.current = parentNode;
      const cleanup = render.flushLayoutEffects();
      const gap = kind === 'intelligence' ? 8 : 4;
      const style = popup().props.style;
      assert.equal(style.top, rect.bottom + gap, `${kind} opens below its Home trigger`);
      assert.ok(style.left >= 12 && style.left + style.width <= width - 12 && style.top + style.maxHeight <= 720, 'Home menus remain within narrow viewport bounds');
      let cleanupFlyout = () => {};
      if (kind === 'cloud') {
        const deviceNode = Object.assign(new TestNode(), { getBoundingClientRect: () => {
          const parent = parentNode.getBoundingClientRect();
          return { ...parent, top: parent.top + 83, bottom: parent.top + 115 };
        } });
        find(popup(), node => node.type === 'button' && textContent(node) === 'MacBook Pro').props.onClick({ currentTarget: deviceNode });
        const submenuElement = () => find(view(), byName('DeviceSubmenu'));
        const renderDevice = mount(submenuElement().type);
        const submenu = () => renderDevice(submenuElement().props);
        submenu().props.ref.current = Object.assign(new TestNode(), { parentElement: parentNode });
        cleanupFlyout = renderDevice.flushLayoutEffects();
        const flyout = submenu().props.style;
        assert.ok(flyout.top >= style.top && flyout.top + flyout.maxHeight <= 708, 'The Home device flyout stays below the toolbar and scrolls within available space');
      }
      rect.top -= 20; rect.bottom -= 20;
      testWindow.dispatchEvent(new Event('scroll'));
      assert.equal(popup().props.style.top, rect.bottom + gap, 'Scrolling preserves downward placement on Home');
      cleanupFlyout(); cleanup();
    }
  }
  testWindow.innerWidth = viewport.width; testWindow.innerHeight = viewport.height;
  console.log('Home toolbar positioning checks passed: four downward menus, device flyout, narrow-screen bounds and scroll tracking. Other composer menus retain upward placement.');
}

// View-level Ask CodeM reuses the drawer dialog but keeps a separate, whole-view source.
{
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { defaultWorkViewContext, workViewQueries, restoreWorkViewContext } = load(resolve(root, 'src/work-view-chat.ts'));
  const { createWorkViewConversation, resolveConversation, rememberWorkItemConversation, getNavigationConversationHistory, appendWorkItemMessage, loadWorkItemMessages } = load(resolve(root, 'src/work-item-chat.ts'));
  const { buildCodeMSourceGroups } = load(resolve(root, 'src/codem-source-groups.ts'));
  const { conversationUrl, conversationIdFromUrl } = load(resolve(root, 'src/conversation-url.ts'));
  const { WorkItemsPage } = load(resolve(root, 'src/WorkItemsPage.tsx'));
  const { WorkItemAskCodeM } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const seen = new Set();
  for (const application of workItemApplications) {
    const context = defaultWorkViewContext(application.slug);
    const queries = workViewQueries(context);
    assert.equal(queries.length, 5);
    for (const query of queries) {
      const conversation = createWorkViewConversation(context, query.title);
      assert.ok(!seen.has(conversation.id)); seen.add(conversation.id);
      assert.equal(conversation.view.href, `/apps/${application.slug}`);
      assert.equal(conversation.workItem, undefined, 'A view is not associated with an arbitrary first row');
      const url = conversationUrl('https://example.test/', false, conversation.id);
      assert.equal(conversationIdFromUrl(url.pathname, ''), conversation.id);
      assert.equal(resolveConversation(conversation.id).view.title, context.title);
    }
    setLocation(`https://example.test/apps/${application.slug}`);
    const renderPage = mount(WorkItemsPage);
    let opened;
    const props = { application, onContinueInChat() {}, onOpenConversation: value => { opened = value; } };
    const page = () => renderPage(props);
    const trigger = () => find(page(), node => node.props.className === 'work-tool work-view-ask');
    assert.equal(trigger().props['aria-expanded'], false);
    trigger().props.onClick();
    const popup = find(page(), byName('WorkItemAskCodeM'));
    assert.equal(popup.props.context, 'view');
    const panel = mount(WorkItemAskCodeM)(popup.props);
    assert.equal(textContent(find(panel, node => node.type === 'h2')), 'CodeM 帮你分析视图');
    assert.equal(textContent(find(panel, node => node.props.className === 'work-ask-reference')), context.title);
    const buttons = nodes(find(panel, node => node.props['aria-label'] === '快捷提问')).filter(node => node.type === 'button');
    assert.deepEqual(buttons.map(textContent), Array.from(queries, query => query.title));
    buttons[0].props.onClick();
    assert.equal(opened.view.href, `/apps/${application.slug}`);
    assert.equal(find(page(), byName('WorkItemAskCodeM')), undefined);
  }
  assert.equal(seen.size, 40);
  for (const id of ['work-view--missing--ask--test', 'work-view--version--ask-- ', 'work-view--version--unknown--test', `work-view--version--ask--${'a'.repeat(2001)}`]) assert.equal(resolveConversation(id), undefined);

  setLocation('https://example.test/apps/version');
  const renderRoute = mount(appElement.type);
  const route = () => renderRoute();
  const routeCleanup = renderRoute.flushEffects();
  route();
  const pageElement = find(route(), byName('WorkItemsPage'));
  const renderPage = mount(WorkItemsPage);
  const page = () => renderPage(pageElement.props);
  const trigger = () => find(page(), node => node.props.className === 'work-tool work-view-ask');
  const triggerNode = new TestNode();
  trigger().props.ref.current = triggerNode;
  const cell = (id, field) => find(page(), node => byName('WorkItemTableCell')(node) && node.props.item.id === id && node.props.field === field);
  for (const row of [1, 3, 4, 7]) cell(row, 'owner').props.onChange({ id: 'john', name: 'John Du' });
  cell(1, 'schedule').props.onChange({ start: '2026-10-01', end: '2026-10-03' });
  trigger().props.onClick();
  let popup = find(page(), byName('WorkItemAskCodeM'));
  const renderPanel = mount(WorkItemAskCodeM);
  const panel = () => renderPanel(popup.props);
  const queries = nodes(find(panel(), node => node.props['aria-label'] === '快捷提问')).filter(node => node.type === 'button').map(textContent);
  assert.ok(queries.some(title => title.includes('John Du 负责的 4 项')));
  assert.ok(queries.some(title => title.includes('4 项未完成工作没有排期')));
  find(panel(), byName('NewChatToolbar')).props.onMention();
  let stopped = false;
  panel().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.ok(find(page(), byName('WorkItemAskCodeM')), 'Escape first dismisses the inner menu');
  panel().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(find(page(), byName('WorkItemAskCodeM')), undefined);
  assert.equal(testDocument.activeElement, triggerNode);
  trigger().props.onClick(); popup = find(page(), byName('WorkItemAskCodeM'));
  const inside = new TestNode();
  panel().props.ref.current = new TestNode([inside]);
  const panelCleanup = renderPanel.flushEffects();
  const pointerDown = target => { const event = new Event('pointerdown'); Object.defineProperty(event, 'target', { value: target }); testDocument.dispatchEvent(event); };
  pointerDown(inside); assert.ok(find(page(), byName('WorkItemAskCodeM')));
  pointerDown(triggerNode); assert.ok(find(page(), byName('WorkItemAskCodeM')));
  pointerDown(new TestNode()); assert.equal(find(page(), byName('WorkItemAskCodeM')), undefined);
  panelCleanup();
  trigger().props.onClick(); popup = find(page(), byName('WorkItemAskCodeM'));
  const customPrompt = '分析这张版本视图 / #? 中文 & <发布准备> --ask--\n只列出需要跟进的事项';
  find(panel(), node => node.type === 'textarea').props.onChange({ target: { value: customPrompt } });
  find(panel(), node => node.type === 'textarea').props.onKeyDown({ key: 'Enter', shiftKey: false, nativeEvent: { isComposing: true }, preventDefault() {} });
  assert.equal(testWindow.location.pathname, '/apps/version');
  find(panel(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const conversationId = conversationIdFromUrl(testWindow.location.pathname, '');
  const conversation = resolveConversation(conversationId);
  assert.equal(conversation.title, customPrompt);
  assert.equal(conversation.view.href, '/apps/version');
  assert.match(conversation.summary, /4 条尚未设置排期/);
  assert.equal(sentMessages(route())[0].props.text, customPrompt);
  assert.equal(sentMessages(route())[0].props.workItem.href, '/apps/version');
  assert.equal(textContent(find(route(), node => node.props.className === 'conversation-header-workspace-name')), 'Version Release Plan');
  rememberWorkItemConversation(conversation);
  const group = buildCodeMSourceGroups(getNavigationConversationHistory(), conversationId).find(group => group.source.href === '/apps/version');
  assert.ok(group.entries.some(entry => entry.id === conversationId));
  appendWorkItemMessage(conversationId, '按负责人再整理一遍');
  assert.ok(loadWorkItemMessages(conversationId).includes('按负责人再整理一遍'));
  assert.equal(sentMessages(mount(appElement.type)())[0].props.text, customPrompt);
  const stopHistory = renderRoute.flushEffects();
  testWindow.history.go(-1);
  assert.ok(find(route(), byName('WorkItemsPage')));
  testWindow.history.go(1);
  assert.equal(sentMessages(route())[0].props.text, customPrompt);
  routeCleanup(); stopHistory();
  const snapshotKey = `meego:work-item-chat:v1:view:${conversationId}`;
  adminStorage.delete(snapshotKey);
  assert.equal(resolveConversation(conversationId).view.title, 'Version Release Plan', 'Shared links reconstruct their view context without local storage');
  adminStorage.set(snapshotKey, '{broken');
  assert.match(resolveConversation(conversationId).summary, /5 条尚未设置排期/);
  const safe = restoreWorkViewContext('version', { rows: [{ id: 1, owner: {}, pd: [], apps: ['invalid'], schedule: { start: 'broken' } }] });
  assert.equal(safe.rows[0].owner, 'Jane');
  assert.equal(safe.rows[0].schedule, undefined);
  assert.deepEqual(Array.from(safe.rows[0].apps), ['project', 'codem']);
  const { getViewAskPosition } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const position = getViewAskPosition({ left: 240, top: 0, width: 1200, height: 900 }, { left: 960, bottom: 38 });
  assert.deepEqual({ ...position }, { left: 720, top: 40, width: 400, height: 660 }, 'Align with the trigger left edge and leave a 2px gap below it');
  const narrow = getViewAskPosition({ left: 0, top: 48, width: 320, height: 480 }, { left: 280, bottom: 86 });
  assert.deepEqual({ ...narrow }, { left: 8, top: 40, width: 304, height: 432 }, 'Clamp the popup to the visible page on a narrow viewport');
  console.log('View Ask CodeM checks passed: eight views and 40 contextual questions, live owners/schedules, shared drawer UI and dismissal, IME/custom prompts, whole-view history groups, follow-ups, refresh and portable links, safe snapshot fallback, trigger alignment and narrow-screen bounds. Pixel acceptance remains manual.');
}

// Ask CodeM composes the main toolbar without losing its context or dismissing on portaled menus.
{
  const { WorkItemAskCodeM } = load(resolve(root, 'src/WorkItemAskCodeM.tsx'));
  const { WorkItemDrawer } = load(resolve(root, 'src/WorkItemDrawer.tsx'));
  const { workItemApplications } = load(resolve(root, 'src/work-item-navigation.ts'));
  const { getWorkItemView } = load(resolve(root, 'src/work-items-data.ts'));
  const { defaultWorkViewContext } = load(resolve(root, 'src/work-view-chat.ts'));
  const { resolveConversation } = load(resolve(root, 'src/work-item-chat.ts'));
  const application = workItemApplications.find(item => item.slug === 'version');
  const item = getWorkItemView(application.slug).items[0];
  for (const context of ['work-item', 'wbs', 'view', 'settings']) {
    let dismissed = 0, drawerDismissed = 0, attachmentsOpened = 0, submitted;
    const props = {
      ...(context === 'settings' ? { context } : context === 'view' ? { context, application, view: defaultWorkViewContext(application.slug) } : { context, application, item }),
      triggerRef: { current: new TestNode() }, onClose: () => dismissed++, onOpenConversation: chat => { submitted = chat; },
    };
    const render = mount(WorkItemAskCodeM);
    const panel = () => render(props);
    const toolbarElement = () => find(panel(), byName('NewChatToolbar'));
    const renderToolbar = mount(toolbarElement().type);
    const toolbar = () => renderToolbar(toolbarElement().props);
    const trigger = label => find(toolbar(), node => node.type === 'button' && node.props['aria-label'] === label);
    const popup = () => find(toolbar(), node => node.props.className?.startsWith('new-chat-select-menu'));
    const choose = label => find(popup(), node => node.type === 'button' && (node.props['aria-label'] ?? textContent(node)) === label).props.onClick();
    const input = () => find(panel(), node => node.type === 'textarea');
    input().props.ref.current = new TestNode();
    const file = find(panel(), node => node.props['aria-label'] === '选择附件文件');
    file.props.ref.current = { click: () => attachmentsOpened++ };
    const addAction = label => {
      trigger('添加内容').props.onClick();
      find(toolbar(), node => node.type === 'button' && textContent(node) === label).props.onClick();
    };
    addAction('添加附件');
    assert.equal(attachmentsOpened, 1);
    const attachmentEvent = { target: { files: [{ name: 'release-plan.md' }], value: 'selected' } };
    file.props.onChange(attachmentEvent);
    assert.equal(input().props.value, '附件：release-plan.md');
    assert.equal(attachmentEvent.target.value, '');
    addAction(toolbarElement().props.mentionLabel);
    const reference = find(panel(), node => node.props.className === 'work-ask-composer-menu');
    const referenceButton = find(reference, node => node.type === 'button');
    const referenceTitle = textContent(referenceButton);
    referenceButton.props.onClick();
    assert.ok(input().props.value.includes(`@${referenceTitle}`), 'References retain the active popup context');
    addAction('选择技能');
    const skills = find(panel(), node => node.props.className === 'work-ask-composer-menu');
    find(skills, node => node.type === 'button').props.onClick();
    assert.ok(input().props.value.trim());
    const draft = input().props.value;
    trigger('项目：Cloud').props.onClick();
    find(popup(), node => node.type === 'button' && textContent(node) === 'Mac Mini').props.onClick({ currentTarget: new TestNode() });
    find(toolbar(), byName('DeviceSubmenu')).props.onSelect('workflow-worker');
    trigger('CodeM 空间：CodeM Space').props.onClick(); choose('Meego');
    trigger('审批方式：Approve for me').props.onClick(); choose('Full access');
    assert.ok(trigger('审批方式：Full access'));
    const plan = () => find(toolbar(), node => node.type === 'input' && node.props['aria-label'] === 'Plan');
    plan().props.onChange({ target: { checked: true } });
    assert.equal(plan().props.checked, true);
    trigger('Intelligence High').props.onClick();
    find(toolbar(), byName('IntelligenceSlider')).props.onChange('Ultra');
    let stopped = false;
    toolbar().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
    assert.ok(stopped && trigger('Intelligence Ultra'));
    assert.equal(dismissed, 0, 'Escape commits the slider and keeps Ask CodeM open');
    assert.equal(input().props.value, draft, 'Toolbar controls preserve the draft');

    trigger('CodeM 空间：Meego').props.onClick();
    const portaledOption = new TestNode();
    const portalNode = Object.assign(new TestNode([portaledOption]), { querySelectorAll: () => [] });
    popup().props.ref.current = portalNode;
    assert.equal(toolbarElement().props.menuRef.current, portalNode);
    const layer = popup().props['data-work-item-layer'];
    assert.equal(layer, context === 'work-item' || context === 'wbs' ? item.id : undefined);
    const layerNode = { getAttribute: () => String(layer) };
    portaledOption.closest = selector => layer !== undefined && selector === '[data-work-item-layer]' ? layerNode : null;
    const inside = new TestNode();
    const panelNode = new TestNode([inside]);
    panel().props.ref.current = panelNode;
    const stopPanel = render.flushEffects();
    let stopDrawer = () => {};
    if (context === 'work-item' || context === 'wbs') {
      const renderDrawer = mount(WorkItemDrawer);
      const drawer = renderDrawer({ application, item, onClose: () => drawerDismissed++ });
      drawer.props.ref.current = new TestNode([panelNode]);
      stopDrawer = renderDrawer.flushEffects();
    }
    const pointer = target => testDocument.dispatchEvent(Object.defineProperty(new Event('pointerdown'), 'target', { value: target }));
    pointer(portaledOption);
    assert.equal(dismissed, 0, 'Portaled toolbar menus belong to their Ask CodeM popup');
    assert.equal(drawerDismissed, 0, 'Portaled toolbar menus also belong to the work-item drawer');
    choose('Aily');
    trigger('CodeM 空间：Aily').props.onClick();
    find(panel(), node => node.props['aria-label'] === '对话历史').props.onClick();
    toolbar();
    const stopToolbarLayout = renderToolbar.flushLayoutEffects();
    assert.equal(popup(), undefined);
    assert.ok(find(panel(), byName('ConversationHistoryMenu')));
    trigger('项目：Mac Mini · workflow-worker').props.onClick();
    assert.equal(find(panel(), byName('ConversationHistoryMenu')), undefined, 'Toolbar and history menus remain exclusive');
    toolbar().props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    find(panel(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    const expectedEnvironment = { device: 'Mac Mini', project: 'workflow-worker', spaceId: 'aily' };
    assert.equal(submitted.title, draft.trim());
    assert.deepEqual({ ...submitted.environment }, expectedEnvironment);
    assert.deepEqual({ ...resolveConversation(submitted.id).environment }, expectedEnvironment, 'The chosen device and space survive navigation and reload');
    pointer(new TestNode());
    assert.equal(dismissed, 1, 'Outside clicks still dismiss Ask CodeM');
    if (context === 'work-item' || context === 'wbs') assert.equal(drawerDismissed, 1);
    stopToolbarLayout(); stopPanel(); stopDrawer();
  }
  console.log('Ask CodeM toolbar checks passed: all four contexts, attachment/reference/skill actions, device and space persistence, permission/Plan/Intelligence selection, nested Escape, exclusive history and portaled-menu ownership. Responsive visual acceptance remains manual.');
}
