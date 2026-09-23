import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise geometry, accessibility and cancellation without opening a browser.
const source = readFileSync(new URL('../src/settings-pro-ripple.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function setup({ width = 1200, height = 44, reduced = false, supported = true } = {}) {
  const bounds = { left: 240, top: 12, width, height };
  const triggerBounds = { left: bounds.left + width - 340, top: bounds.top + 6, width: 113, height: 32 };
  const listeners = new Set();
  const media = { matches: reduced, addEventListener(_type, fn) { listeners.add(fn); }, removeEventListener(_type, fn) { listeners.delete(fn); } };
  const observers = [];
  const animations = [];
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    window: { matchMedia: () => media },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  });
  const layer = { hidden: true };
  const circle = { style: {}, animate: supported ? (frames, options) => {
    const animation = { frames, options, cancelled: false, cancel() { this.cancelled = true; } };
    animations.push(animation);
    return animation;
  } : undefined };
  return {
    bounds, triggerBounds, media, listeners, observers, animations, layer, circle,
    start: point => module.exports.startSettingsProRipple({ header: { getBoundingClientRect: () => ({ ...bounds }) }, trigger: { getBoundingClientRect: () => triggerBounds }, layer, circle, point }),
  };
}

for (const [width, height] of [[1200, 44], [1920, 44], [760, 76], [390, 112]]) {
  const view = setup({ width, height });
  const point = { x: view.bounds.left + width - 90, y: view.bounds.top + 20 };
  const cleanup = view.start(point);
  const radius = Number.parseFloat(view.circle.style.width) / 2;
  const center = { x: Number.parseFloat(view.circle.style.left) + radius, y: Number.parseFloat(view.circle.style.top) + radius };
  assert.equal(center.x, point.x - view.bounds.left);
  assert.equal(center.y, point.y - view.bounds.top);
  for (const [x, y] of [[0, 0], [width, 0], [0, height], [width, height]]) assert.ok(radius >= Math.hypot(x - center.x, y - center.y), 'The ripple fills all corners at every header size');
  assert.equal(view.layer.hidden, false);
  assert.equal(view.animations[0].frames[0].transform, 'scale(0)');
  assert.equal(view.animations[0].frames.at(-1).transform, 'scale(1)');
  assert.ok(view.animations[0].options.duration <= 500);
  view.animations[0].onfinish();
  assert.equal(view.layer.hidden, true, 'Completion exposes the solid Pro Mode background');
  assert.equal(view.animations[0].cancelled, true);
  assert.equal(view.observers[0].disconnected, true);
  assert.equal(view.listeners.size, 0);
  cleanup();
}

const keyboard = setup();
keyboard.start(null);
const keyboardRadius = Number.parseFloat(keyboard.circle.style.width) / 2;
assert.equal(Number.parseFloat(keyboard.circle.style.left) + keyboardRadius, keyboard.triggerBounds.left + keyboard.triggerBounds.width / 2 - keyboard.bounds.left, 'Keyboard activation starts at the toggle center');
keyboard.animations[0].onfinish();

const interrupted = setup();
const stop = interrupted.start(null);
stop();
assert.equal(interrupted.layer.hidden, true, 'Disable/unmount cleanup removes the fill layer');
assert.equal(interrupted.animations[0].cancelled, true);
interrupted.start({ x: 300, y: 30 });
assert.equal(interrupted.animations.length, 2, 'A rapid reactivation gets a fresh ripple');
assert.equal(interrupted.animations[0].onfinish, null, 'An old completion cannot hide the next ripple');
interrupted.animations[1].onfinish();

const resized = setup();
resized.start(null);
resized.observers[0].callback();
assert.equal(resized.layer.hidden, false, 'Initial ResizeObserver notification does not cancel motion');
resized.bounds.height = 76;
resized.observers[0].callback();
assert.equal(resized.layer.hidden, true, 'A newly wrapped toolbar settles to its solid background');

const preference = setup();
preference.start(null);
preference.media.matches = true;
for (const listener of [...preference.listeners]) listener();
assert.equal(preference.layer.hidden, true, 'Reduced motion takes effect during an active ripple');
assert.equal(preference.animations[0].cancelled, true);
for (const options of [{ reduced: true }, { supported: false }, { width: 0 }]) {
  const view = setup(options);
  view.start(null)();
  assert.equal(view.animations.length, 0);
  assert.equal(view.layer.hidden, true, 'Static fallback never obscures the header');
}
console.log('Settings ripple checks passed: pointer/keyboard origin, desktop/wrapped/mobile coverage, completion, rapid toggles, resize, reduced motion, unsupported animation fallback and cleanup.');
