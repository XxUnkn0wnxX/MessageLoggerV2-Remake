const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const start = source.indexOf('class PopoutManager {');
const end = source.indexOf('module.exports = class MessageLoggerV2', start);
assert.ok(start >= 0 && end > start);
function createBundle() {
  function Provider() {}
  function Container() {}
  function Layer() {}
  Provider.displayName = 'AppLayerProvider';
  Container.displayName = 'AppLayerContainer';
  Layer.displayName = 'AppLayer';
  return { Provider, Container, Layer };
}
function setup(modules = [], failRender = false) {
  const warnings = [], roots = [], listeners = new Map(), containers = [];
  const Webpack = { getModules(filter, options) {
    assert.equal(options.searchExports, false);
    assert.equal(options.searchDefault, false);
    return modules.filter(filter);
  } };
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useState(initial) { return [initial, () => {}]; },
    useRef() { return { current: { contains: node => node === 'profile', getBoundingClientRect: () => ({ width: 10, height: 10 }) } }; },
    useEffect(fn) { fn(); }
  };
  const ReactDOM = { createRoot(container) {
    const root = { container, unmounted: false, render(element) { if (failRender) throw Error('render failed'); this.element = element; }, unmount() { this.unmounted = true; } };
    roots.push(root); return root;
  } };
  const document = {
    body: { appendChild() {} },
    createElement() {
      const container = { contains: node => node === 'portal' || node === 'profile', remove() { this.removed = true; } };
      containers.push(container); return container;
    },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); }
  };
  const window = { scrollX: 0, scrollY: 0, addEventListener() {}, removeEventListener() {} };
  const Logger = { warn(message) { warnings.push(message); } };
  const runtime = vm.runInNewContext(`${source.slice(start, end)}\n({ PopoutManager, PopoutComponent });`, { Webpack, React, ReactDOM, document, window, Logger });
  return { ...runtime, Webpack, warnings, roots, listeners, containers };
}

test('discovers one complete owner or its recognized default, independent of export names', () => {
  const bundle = createBundle();
  const direct = { q: bundle.Provider, x: bundle.Container, z: bundle.Layer };
  Object.defineProperty(direct, 'bad', { get() { throw Error('unavailable'); } });
  for (const owner of [direct, { A: direct }, { Ay: direct }, { __esModule: true, default: direct }]) {
    const runtime = setup([owner]);
    const result = new runtime.PopoutManager().findAppLayerBundle();
    assert.strictEqual(result.Provider, bundle.Provider);
    assert.strictEqual(result.Container, bundle.Container);
    assert.strictEqual(result.Layer, bundle.Layer);
  }
});

test('incomplete, ambiguous role and multiple owners cannot select a bundle', () => {
  const bundle = createBundle();
  const duplicate = createBundle();
  for (const modules of [
    [{ a: bundle.Provider, b: bundle.Container }],
    [{ a: bundle.Provider, b: bundle.Container, c: bundle.Layer, d: duplicate.Provider }],
    [{ a: bundle.Provider, b: bundle.Container, c: bundle.Layer }, { a: duplicate.Provider, b: duplicate.Container, c: duplicate.Layer }]
  ]) assert.equal(new (setup(modules).PopoutManager)().findAppLayerBundle(), null);
});

test('provider owns profile and native layer container as siblings and unmounts with its root', () => {
  const bundle = createBundle();
  const runtime = setup([{ q: bundle.Provider, x: bundle.Container, z: bundle.Layer }]);
  const manager = new runtime.PopoutManager();
  const content = { type: 'profile' };
  const target = { contains: () => false };
  const id = manager.showPopout(target, content);
  const root = runtime.roots[0];
  assert.strictEqual(root.element.type, bundle.Provider);
  assert.strictEqual(root.element.children[0].type, runtime.PopoutComponent);
  assert.strictEqual(root.element.children[0].children[0], content);
  assert.strictEqual(root.element.children[0].props.ownerContainer, runtime.containers[0]);
  assert.strictEqual(root.element.children[1].type, bundle.Container);
  assert.equal(root.element.children[1].props.className, 'mlv2-profile-layer-container');
  assert.match(source, /#mlv2-popout-container \.mlv2-profile-layer-container \{\s*position: fixed;\s*inset: 0;\s*pointer-events: none;/);
  manager.closePopout(id);
  assert.equal(root.unmounted, true);
  assert.equal(runtime.containers[0].removed, true);
  assert.equal(manager.popouts.size, 0);
  assert.equal(manager.container, null);
});

test('portal interaction stays open while true outside click closes the profile', () => {
  const runtime = setup();
  const target = { contains: node => node === 'target', getBoundingClientRect: () => ({ right: 10, top: 10 }) };
  let closes = 0;
  const ownerContainer = { contains: node => node === 'portal' || node === 'profile' };
  runtime.PopoutComponent({ target, position: 'right', align: 'top', ownerContainer, onClose() { closes++; }, children: null });
  const mousedown = runtime.listeners.get('mousedown');
  mousedown({ target: 'portal' });
  mousedown({ target: 'profile' });
  mousedown({ target: 'target' });
  assert.equal(closes, 0);
  mousedown({ target: 'outside' });
  assert.equal(closes, 1);
});

test('missing bundle preserves profile fallback, and render failure does not leak a root', () => {
  const runtime = setup();
  const manager = new runtime.PopoutManager();
  const id = manager.showPopout({}, { type: 'profile' });
  assert.strictEqual(runtime.roots[0].element.type, runtime.PopoutComponent);
  assert.equal(runtime.warnings.length, 1);
  manager.closePopout(id);
  assert.equal(runtime.containers[0].removed, true);
  const broken = setup([], true);
  const brokenManager = new broken.PopoutManager();
  assert.throws(() => brokenManager.showPopout({}, {}), /render failed/);
  assert.equal(broken.roots[0].unmounted, true);
  assert.equal(broken.containers[0].removed, true);
  assert.equal(brokenManager.popouts.size, 0);
  assert.equal(brokenManager.container, null);
});
