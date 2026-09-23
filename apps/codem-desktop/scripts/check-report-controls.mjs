import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';

export async function checkReportControls(html) {
  const rootUrl = new URL('../', import.meta.url);
  const themes = JSON.parse(await readFile(new URL('src/report-themes.json', rootUrl), 'utf8'));
  const inlineScripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), match => match[1]);
  const runtime = inlineScripts.find(script => script.includes('class SlidePresentation'));
  const originalThemes = JSON.parse(runtime.match(/var themes=(\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(themes.map(({ id, name, label }) => ({ id, name, label })), originalThemes.map(({ id, name, label }) => ({ id, name, label })), 'The toolbar must expose every original theme with its original name');
  for (const theme of themes) {
    const style = html.match(new RegExp(`html\\[data-theme="${theme.id}"\\]\\{([^}]+)\\}`))[1];
    assert.deepEqual(theme.colors, ['bg', 'primary', 'text'].map(key => style.match(new RegExp(`--${key}:([^;]+)`))[1].trim()), `Theme thumbnail must use the report palette: ${theme.id}`);
  }

  const source = await readFile(new URL('src/report-controls.ts', rootUrl), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { getReportController, subscribeReportState, initialReportState } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

  // Execute the report's real mode/theme functions against small DOM stand-ins.
  // Slide layout and chart rendering remain part of manual browser acceptance.
  const element = (dataset = {}) => Object.assign(new EventTarget(), {
    dataset, attributes: new Map(), textContent: '', hidden: false,
    classList: { toggle() {} },
    append() {}, focus() { this.focused = true; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    toggleAttribute(name, enabled) { if (enabled) this.attributes.set(name, ''); else this.attributes.delete(name); },
    querySelectorAll() { return []; },
  });
  const root = element();
  const elements = new Map();
  const document = Object.assign(new EventTarget(), {
    documentElement: root,
    createElement() { return element(); },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelectorAll() { return []; },
  });
  document.getElementById('theme-dialog').querySelectorAll = selector => selector === '.theme-option' ? themes.map(theme => element({ themeId: theme.id })) : [];
  const storage = new Map();
  const window = new EventTarget();
  window.parent = {};
  const location = { search: '?embedded=1', hash: '' };
  const context = createContext({
    root, document, window, Event, URLSearchParams,
    location,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    addEventListener: window.addEventListener.bind(window),
    report: {}, viewport: element(), stage: element(),
    pages: Array.from({ length: 3 }, (_, index) => element({ section: `section-${index}`, title: `Page ${index + 1}` })),
    make() { return element(); }, esc: text => text,
    scrollY: 120, scrollTo() {}, $() { return null; },
    history: { replaceState(_state, _unused, hash) { location.hash = hash; } }, requestAnimationFrame(callback) { callback(); },
  });
  const bootstrap = new Script(inlineScripts[0]);
  bootstrap.runInContext(context);
  assert.equal(root.dataset.theme, 'paper-ink', 'New reports should default to Feishu Project');
  assert.deepEqual(initialReportState, { mode: root.dataset.view, theme: root.dataset.theme }, 'The toolbar and report must agree on their initial state');
  assert.ok(root.attributes.has('data-embedded'), 'The host iframe should hide duplicate controls');
  storage.set('project-risk-report:theme:shared:v2', 'signal');
  bootstrap.runInContext(context);
  assert.equal(root.dataset.theme, 'signal', 'Saved theme choices should remain selected');
  storage.set('project-risk-report:theme:shared:v2', 'unknown-theme');
  bootstrap.runInContext(context);
  assert.equal(root.dataset.theme, 'paper-ink', 'An invalid saved theme should use the default');
  window.parent = window;
  bootstrap.runInContext(context);
  assert.ok(!root.attributes.has('data-embedded'), 'Standalone downloads must restore their own controls, even if saved from the embedded report');

  const start = runtime.indexOf('  class SlidePresentation {');
  const end = runtime.indexOf('\n})();', start);
  // A restored presentation must also start at page 1, regardless of an old saved page.
  root.dataset.view = 'slides';
  storage.set('project-risk-report:slide:v1', '2');
  const controllerRuntime = runtime.slice(start, end).replace('const presentation=new SlidePresentation();', 'SlidePresentation.prototype.scale=function(){};const presentation=new SlidePresentation();');
  new Script(controllerRuntime).runInContext(context);
  new Script(runtime.slice(runtime.lastIndexOf('(function(){'))).runInContext(context);
  const controller = getReportController({ contentWindow: window });
  assert.equal(getReportController(null), undefined);
  assert.equal(getReportController({ contentWindow: {} }), undefined);
  assert.equal(typeof controller.setMode, 'function');
  assert.equal(typeof controller.setTheme, 'function');
  assert.equal(document.getElementById('slide-jump').value, 0, 'Reloading a saved presentation must start at page 1');
  controller.setMode('reading');
  const states = [];
  const unsubscribe = subscribeReportState(document, controller, state => states.push({ ...state }));
  assert.deepEqual(states.at(-1), { mode: 'reading', theme: 'paper-ink' });

  controller.setMode('slides');
  document.getElementById('slide-next').dispatchEvent(new Event('click'));
  document.getElementById('slide-next').dispatchEvent(new Event('click'));
  assert.equal(document.getElementById('slide-jump').value, 2, 'Normal slide navigation must continue to work');
  controller.setTheme('signal');
  assert.equal(document.getElementById('slide-jump').value, 2, 'Changing theme must preserve the current page');
  controller.setMode('reading');
  controller.setMode('slides');
  assert.equal(document.getElementById('slide-jump').value, 0, 'Re-entering presentation must restart at page 1');
  assert.equal(document.getElementById('slide-status').textContent, '1 / 3');
  assert.equal(document.getElementById('slide-prev').disabled, true);
  assert.equal(document.getElementById('slide-next').disabled, false);
  assert.equal(location.hash, '#slide-1');
  assert.equal(root.dataset.theme, 'signal');
  document.getElementById('slide-next').dispatchEvent(new Event('click'));
  controller.setMode('slides');
  assert.equal(document.getElementById('slide-jump').value, 1, 'Keeping an active presentation open must not restart it');

  for (const theme of themes) {
    controller.setTheme(theme.id);
    assert.equal(root.dataset.look, originalThemes.find(item => item.id === theme.id).look);
    assert.equal(storage.get('project-risk-report:theme:shared:v2'), theme.id);
    for (const mode of ['slides', 'reading']) {
      controller.setMode(mode);
      assert.deepEqual(states.at(-1), { mode, theme: theme.id }, 'Changing view must preserve theme and synchronize the host');
      assert.equal(storage.get('project-risk-report:mode:v1'), mode);
      assert.equal(context.report.hidden, mode === 'slides');
      assert.equal(context.viewport.hidden, mode !== 'slides');
      if (mode === 'slides') assert.equal(context.viewport.focused, true, 'Entering slides from the host should focus the report for keyboard navigation');
    }
  }
  const eventsBeforeInvalid = states.length;
  controller.setMode('invalid');
  controller.setTheme('invalid');
  assert.equal(states.length, eventsBeforeInvalid, 'Invalid controls should not mutate the report');
  const storageEvent = Object.assign(new Event('storage'), { key: 'project-risk-report:theme:shared:v2', newValue: 'signal' });
  window.dispatchEvent(storageEvent);
  assert.equal(states.at(-1).theme, 'signal', 'External theme changes must synchronize the toolbar');
  unsubscribe();
  const count = states.length;
  controller.setTheme('blue-professional');
  controller.setMode('slides');
  assert.equal(states.length, count, 'Unmounted preview subscriptions must be removed');
}
