const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const boundaryStart = source.indexOf('const ModalClassBoundary =');
const boundaryEnd = source.indexOf('\nclass PopoutManager', boundaryStart);
const methodStart = source.indexOf('  createModal(options, image, name) {');
const methodEnd = source.indexOf('\n  getMessageAny(id) {', methodStart);
assert.ok(boundaryStart >= 0 && boundaryEnd > boundaryStart && methodEnd > methodStart);

function setup(observerAvailable = true) {
  const effects = [], observers = [], warnings = [], frames = [], globalQueries = [];
  const React = {
    Fragment: Symbol('Fragment'),
    isValidElement: value => !!value && value.valid === true,
    useRef: () => ({ current: null }),
    useLayoutEffect: effect => effects.push(effect),
    createElement(type, props, ...children) {
      const result = { type, props: { ...(props || {}) } };
      if (children.length === 1) result.props.children = children[0];
      if (children.length > 1) result.props.children = children;
      return result;
    }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(root, options) { this.root = root; this.options = options; }
    disconnect() { this.disconnected = true; }
  }
  const document = { querySelectorAll(selector) { globalQueries.push(selector); return []; } };
  const Logger = { warn(message) { warnings.push(message); } };
  const Components = { Button: { Colors: { BRAND: 'brand', RED: 'red' } } };
  const runtime = vm.runInNewContext(`${source.slice(boundaryStart, boundaryEnd)}\nclass TestPlugin { ${source.slice(methodStart, methodEnd)} }\n({ ModalClassBoundary, TestPlugin });`, {
    React, MutationObserver: observerAvailable ? MutationObserver : undefined, document, Logger, Components,
    requestAnimationFrame(callback) { frames.push(callback); }
  });
  return { ...runtime, React, effects, observers, warnings, frames, globalQueries };
}
function root(initial) {
  const values = new Set(initial), changes = [];
  return { values, changes, classList: {
    contains: token => values.has(token),
    add(...tokens) { changes.push(['add', ...tokens]); tokens.forEach(token => values.add(token)); },
    remove(...tokens) { changes.push(['remove', ...tokens]); tokens.forEach(token => values.delete(token)); }
  } };
}
function mount(runtime, modalRoot, children, className = 'owned shared') {
  const fragment = runtime.ModalClassBoundary({ className, children });
  const [original, marker] = fragment.props.children;
  assert.strictEqual(original, children);
  assert.equal(marker.type, 'span');
  assert.equal(marker.props.hidden, true);
  assert.equal(marker.props['aria-hidden'], true);
  marker.props.ref.current = { closest(selector) { assert.equal(selector, '[data-mana-component="modal"]'); return modalRoot; } };
  const cleanup = runtime.effects.shift()();
  return { cleanup, marker };
}

test('class boundary repairs only its anchored modal without feedback and preserves preexisting tokens', () => {
  const rt = setup();
  const first = root(['native', 'shared']);
  const second = root(['native-second']);
  const children = [{ valid: true }, { valid: true }];
  const { cleanup } = mount(rt, first, children);
  assert.deepEqual([...first.values].sort(), ['native', 'owned', 'shared']);
  assert.deepEqual([...second.values], ['native-second']);
  const observer = rt.observers[0];
  assert.strictEqual(observer.root, first);
  assert.equal(observer.options.attributeFilter[0], 'class');
  const count = first.changes.length;
  observer.callback();
  assert.equal(first.changes.length, count);
  first.values.clear(); first.values.add('native-new');
  observer.callback();
  assert.deepEqual([...first.values].sort(), ['native-new', 'owned', 'shared']);
  cleanup();
  assert.equal(observer.disconnected, true);
  assert.deepEqual([...first.values].sort(), ['native-new', 'shared']);
  const afterCleanup = first.changes.length;
  first.values.delete('shared');
  observer.callback();
  assert.equal(first.changes.length, afterCleanup);
  assert.deepEqual([...second.values], ['native-second']);
  assert.deepEqual(rt.globalQueries, []);
});

test('missing root or observer yields bounded diagnostic without a global lookup', () => {
  const rt = setup();
  mount(rt, null, [{ valid: true }]);
  assert.equal(rt.warnings.length, 1);
  assert.deepEqual(rt.globalQueries, []);
  const unavailable = setup(false);
  const anchored = root(['native']);
  const binding = mount(unavailable, anchored, [{ valid: true }]);
  assert.equal(unavailable.warnings.length, 1);
  assert.equal(anchored.values.has('owned'), true);
  binding.cleanup();
  assert.deepEqual([...anchored.values], ['native']);
  assert.deepEqual(unavailable.globalQueries, []);
});

test('replacement modal remains independent of an old observer and cleanup', () => {
  const rt = setup();
  const oldRoot = root(['old-native']);
  const replacement = root(['new-native']);
  const first = mount(rt, oldRoot, [{ valid: true }], 'old-owned');
  const stale = rt.observers[0];
  first.cleanup();
  const second = mount(rt, replacement, [{ valid: true }], 'new-owned');
  stale.callback();
  assert.deepEqual([...oldRoot.values], ['old-native']);
  assert.deepEqual([...replacement.values].sort(), ['new-native', 'new-owned']);
  second.cleanup();
  assert.deepEqual([...replacement.values], ['new-native']);
});

test('createModal bridges only classed nonempty element arrays and preserves actions', () => {
  const rt = setup();
  const plugin = new rt.TestPlugin();
  const renders = [], tracked = [], confirms = [], cancels = [];
  plugin.ModalStack = { openModal(render, options) { renders.push({ render, options }); return 'modal-key'; } };
  plugin.trackLoggerOwnedModalKey = (...args) => tracked.push(args);
  plugin.tools = { manaModule: { Modal: 'native-modal', ConfirmModal: 'confirm-modal' } };
  const children = [{ valid: true }, { valid: true }];
  const options = { ml2Data: true, className: '  owned extra ', children, size: 'large', header: 'Header', confirmText: 'Save', cancelText: 'Cancel', confirmButtonColor: 'brand', onConfirm: () => confirms.push(1), onCancel: () => cancels.push(1) };
  plugin.createModal(options, false, 'named');
  const modal = renders[0].render({ onClose() {}, transitionState: 'open' });
  assert.equal(modal.type, 'native-modal');
  assert.equal(modal.props.size, 'large');
  assert.equal(modal.props.title, 'Header');
  assert.equal(modal.props.actionBarInput, false);
  assert.equal(modal.props.actions[0].variant, 'primary');
  assert.equal(modal.props.actions[1].variant, 'secondary');
  modal.props.actions[0].onClick(); modal.props.actions[1].onClick();
  assert.equal(confirms.length, 1); assert.equal(cancels.length, 1);
  assert.strictEqual(modal.props.children.type, rt.ModalClassBoundary);
  assert.strictEqual(modal.props.children.props.children, children);
  assert.equal(renders[0].options.modalKey, 'named');
  assert.deepEqual(tracked[0], ['modal-key', 'named']);
  assert.equal(rt.frames.length, 0);
  assert.deepEqual(rt.globalQueries, []);

  const legacy = ['text', [], { valid: true }, [{ valid: true }, 'mixed']];
  for (const value of legacy) {
    plugin.createModal({ ml2Data: true, className: 'owned', children: value }, false, 'legacy');
    assert.strictEqual(renders.at(-1).render({}).props.children, value);
  }
  assert.equal(rt.frames.length, legacy.length);
  plugin.createModal({ ml2Data: true, children }, false, 'unclassed');
  assert.strictEqual(renders.at(-1).render({}).props.children, children);
  assert.equal(rt.frames.length, legacy.length);
  plugin.createModal({ ml2Data: true, className: '  ', children }, false, 'blank');
  assert.strictEqual(renders.at(-1).render({}).props.children, children);
  assert.equal(rt.frames.length, legacy.length + 1);
});
