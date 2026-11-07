const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPlugin } = require('./helpers/plugin-harness');

class Node {
  constructor() { this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.attributes = {}; this.isConnected = true; this.handlers = new Map(); this.scrollHeight = 1000; this.clientHeight = 100; }
  get parentElement() { return this.parentNode; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  replaceWith(node) { const parent = this.parentNode; if (!parent) return; node.remove(); const index = parent.children.indexOf(this); parent.children[index] = node; node.parentNode = parent; this.parentNode = null; }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  compareDocumentPosition(other) { if (!this.parentNode || this.parentNode !== other.parentNode) return 1; return this.parentNode.children.indexOf(this) < this.parentNode.children.indexOf(other) ? 4 : 2; }
  addEventListener(type, fn, options) { this.handlers.set(type, { fn, options }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeEventListener(type, fn) { if (this.handlers.get(type)?.fn === fn) this.handlers.delete(type); }
  scroll() { this.handlers.get('scroll')?.fn({ target: this }); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { height: 80 }; }
}
function setup() {
  const old = { document: global.document, IntersectionObserver: global.IntersectionObserver,
    requestAnimationFrame: global.requestAnimationFrame, getComputedStyle: global.getComputedStyle, performance: global.performance };
  // Keep the batch deadline deterministic; the deadline test overrides this clock.
  global.performance = { now: () => 0 };
  const frames = [], observers = [];
  global.document = { head: new Node(), createElement: () => new Node() };
  global.requestAnimationFrame = callback => frames.push(callback);
  global.getComputedStyle = node => ({ overflowY: node.scrollable ? 'auto' : 'visible' });
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    batch(...pairs) { this.callback(pairs.map(([target, isIntersecting]) => ({ target, isIntersecting }))); }
  };
  const plugin = createPlugin(), session = plugin.getViewportSession(), built = [];
  const root = () => { const node = new Node(); node.scrollable = true; return node; };
  const add = (container, id, options = {}) => {
    const slot = new Node(); container.appendChild(slot);
    const entry = session.getEntry({ surfaceKey: options.surface || 'logger', channelId: 'c', messageId: id,
      variant: options.variant || '', revision: 1, build() { built.push(id + (options.variant || '')); } });
    const attach = { crossing: true, ...(options.scope ? { admissionScope: options.scope } : {}),
      ...(options.root ? { scrollRoot: options.root } : {}), ...(options.target ? { observeTarget: options.target } : {}) };
    session.attach(entry, slot, options.token || id, attach);
    return { slot, entry, token: options.token || id };
  };
  return { plugin, session, built, root, add, observers,
    tick() { frames.splice(0).forEach(callback => callback()); },
    drain() { for (let i = 0; i < 30 && frames.length; i++) this.tick(); },
    restore() { session.reset(); for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; } }
  };
}

test('entered work survives exit and newly visible work preempts old backlog', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 6 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch(...rows.slice(0, 5).map(row => [row.slot, true]));
    h.tick();
    assert.deepEqual(h.built, ['0', '1', '2', '3']);
    h.observers[0].batch([rows[4].slot, false], [rows[5].slot, true]);
    h.tick();
    assert.deepEqual(h.built, ['0', '1', '2', '3', '5', '4']);
  } finally { h.restore(); }
});

test('scroll crossings fill only registered intervals in both directions; initial middle does not fill prefix', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 12 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[4].slot, true]); h.drain();
    assert.deepEqual(h.built, ['4']);
    root.scroll();
    h.observers[0].batch([rows[4].slot, false], [rows[8].slot, true]); h.drain();
    assert.deepEqual(h.built, ['4', '8', '5', '6', '7']);
    root.scroll();
    h.observers[0].batch([rows[8].slot, false], [rows[1].slot, true]); h.drain();
    assert.deepEqual(h.built, ['4', '8', '5', '6', '7', '1', '2', '3']);
    assert.ok(!h.built.includes('0') && !h.built.includes('9'));
    assert.equal(root.handlers.get('scroll').options.passive, true);
  } finally { h.restore(); }
});

test('layout-only visibility changes and the first viewport never admit skipped rows', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 9 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[3].slot, true]); h.drain();
    h.observers[0].batch([rows[3].slot, false], [rows[7].slot, true]); h.drain();
    assert.deepEqual(h.built, ['3', '7']);
  } finally { h.restore(); }
});

test('invalidation and changed leases cancel queued and frozen old-epoch admissions', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 7 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[1].slot, true]); h.drain();
    root.scroll();
    h.session.invalidate('3', 'visibility');
    h.session.release(rows[4].entry, rows[4].token);
    const replacement = new Node(); root.appendChild(replacement);
    h.session.attach(rows[4].entry, replacement, 'replacement', { crossing: true, scrollRoot: root, admissionScope: scope });
    h.observers[0].batch([rows[1].slot, false], [rows[6].slot, true]); h.drain();
    assert.deepEqual(h.built, ['1', '6', '2', '5']);
    root.scroll();
    h.observers[0].batch([rows[6].slot, false], [rows[1].slot, true]); h.drain();
    assert.ok(h.built.includes('3'));
    h.session.reset();
    assert.equal(root.handlers.has('scroll'), false);
  } finally { h.restore(); }
});

test('roots remain independent and shared native targets admit only still-connected registered members', () => {
  const h = setup();
  try {
    const first = h.root(), second = h.root();
    const nativeRows = Array.from({ length: 5 }, () => { const row = new Node(); first.appendChild(row); return row; });
    const a = nativeRows.map((target, i) => h.add(target, String(i), { surface: 'native', variant: ':content', target, root: first }));
    const b = h.add(nativeRows[2], '2', { surface: 'native', variant: ':accessories', target: nativeRows[2], root: first });
    const other = h.add(second, 'other', { root: second, scope: {} });
    h.observers[0].batch([nativeRows[0], true], [other.slot, true]); h.drain();
    first.scroll();
    a[3].slot.isConnected = false;
    h.observers[0].batch([nativeRows[0], false], [nativeRows[4], true]); h.drain();
    assert.deepEqual(h.built, ['0:content', 'other', '4:content', '1:content', '2:content', '2:accessories']);
    assert.ok(!h.built.includes('3:content'));
    h.session.release(b.entry, b.token);
  } finally { h.restore(); }
});

test('the actual scrollable ancestor is derived and rechecked after rows increase its extent', () => {
  const h = setup();
  try {
    const outer = h.root(), inner = new Node(), scope = {};
    inner.scrollable = true;
    inner.scrollHeight = inner.clientHeight;
    outer.appendChild(inner);
    const rows = Array.from({ length: 5 }, (_, i) => h.add(inner, String(i), { scope }));
    assert.equal(outer.handlers.has('scroll'), true);
    inner.scrollHeight = 900;
    h.tick();
    assert.equal(outer.handlers.has('scroll'), false);
    assert.equal(inner.handlers.has('scroll'), true);
    h.observers[0].batch([rows[1].slot, true]); h.drain();
    inner.scroll();
    h.observers[0].batch([rows[1].slot, false], [rows[4].slot, true]); h.drain();
    assert.deepEqual(h.built, ['1', '4', '2', '3']);
  } finally { h.restore(); }
});

test('scroll snapshots never admit later registrations and appending preserves the visible baseline', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 4 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[0].slot, true]); h.drain();
    root.scroll();
    const late = h.add(root, 'late', { root, scope });
    root.children.splice(root.children.indexOf(late.slot), 1);
    root.children.splice(2, 0, late.slot);
    h.observers[0].batch([rows[0].slot, false], [rows[3].slot, true]); h.drain();
    assert.deepEqual(h.built, ['0', '3', '1', '2']);
    root.scroll();
    h.observers[0].batch([rows[3].slot, false], [rows[0].slot, true]); h.drain();
    assert.deepEqual(h.built, ['0', '3', '1', '2', 'late']);
  } finally { h.restore(); }
});

test('an invalidated offscreen admitted entry waits for a fresh crossing', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 5 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[0].slot, true], [rows[2].slot, true]);
    h.observers[0].batch([rows[2].slot, false]);
    h.session.invalidate('2', 'hidden');
    h.drain();
    assert.deepEqual(h.built, ['0']);
    root.scroll();
    h.observers[0].batch([rows[0].slot, false], [rows[4].slot, true]); h.drain();
    assert.deepEqual(h.built, ['0', '4', '1', '2', '3']);
  } finally { h.restore(); }
});

test('a scroll batch with no cohort change cannot authorize a later layout-only gap', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 8 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[1].slot, true]); h.drain();
    root.scroll();
    h.observers[0].batch([rows[1].slot, true]); h.drain();
    h.observers[0].batch([rows[1].slot, false], [rows[6].slot, true]); h.drain();
    assert.deepEqual(h.built, ['1', '6']);
  } finally { h.restore(); }
});

test('a split empty exit and delayed entry consumes one scroll epoch only once', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 11 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[2].slot, true]); h.drain();
    root.scroll();
    h.observers[0].batch([rows[2].slot, false]); h.drain();
    assert.deepEqual(h.built, ['2']);
    h.observers[0].batch([rows[6].slot, true]); h.drain();
    assert.deepEqual(h.built, ['2', '6', '3', '4', '5']);
    h.observers[0].batch([rows[6].slot, false], [rows[10].slot, true]); h.drain();
    assert.deepEqual(h.built, ['2', '6', '3', '4', '5', '10']);
  } finally { h.restore(); }
});

test('a late scroll ancestor is discovered on the next visible observer entry', () => {
  const h = setup();
  try {
    const root = new Node(), scope = {};
    const rows = Array.from({ length: 5 }, (_, i) => h.add(root, String(i), { scope }));
    h.tick();
    assert.equal(root.handlers.has('scroll'), false);
    root.scrollable = true;
    h.observers[0].batch([rows[1].slot, true]); h.drain();
    assert.equal(root.handlers.has('scroll'), true);
    root.scroll();
    h.observers[0].batch([rows[1].slot, false], [rows[4].slot, true]); h.drain();
    assert.deepEqual(h.built, ['1', '4', '2', '3']);
  } finally { h.restore(); }
});

test('visible cold invalidation readmits immediately while offscreen invalidation waits', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const a = h.add(root, 'a', { root, scope });
    const b = h.add(root, 'b', { root, scope });
    h.observers[0].batch([a.slot, true], [b.slot, true]);
    h.observers[0].batch([b.slot, false]);
    h.session.invalidate('a', 'changed');
    h.session.invalidate('b', 'changed');
    h.drain();
    assert.deepEqual(h.built, ['a']);
    h.observers[0].batch([b.slot, true]); h.drain();
    assert.deepEqual(h.built, ['a', 'b']);
  } finally { h.restore(); }
});

test('repeated reconciliation does not cancel freshly crossed dirty work', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {};
    const rows = Array.from({ length: 5 }, (_, i) => h.add(root, String(i), { root, scope }));
    h.observers[0].batch([rows[0].slot, true], [rows[2].slot, true]); h.drain();
    h.observers[0].batch([rows[2].slot, false]);
    h.session.invalidate('2', 'changed');
    h.session.reconcileActive();
    root.scroll();
    h.observers[0].batch([rows[0].slot, false], [rows[4].slot, true]); h.drain();
    assert.deepEqual(h.built, ['0', '2', '4', '1', '2', '3']);
  } finally { h.restore(); }
});

test('same-lease replacement cards retain crossed admission and native target baseline', () => {
  const h = setup();
  try {
    const root = h.root(), scope = {}, cards = [];
    for (let i = 0; i < 8; i++) {
      const shell = new Node(); root.appendChild(shell);
      const entry = h.session.getEntry({ surfaceKey: 'cards', channelId: 'c', messageId: String(i), revision: 1,
        build(owned) { h.built.push(String(i)); assert.equal(h.session.adoptHost(owned, new Node()), true); } });
      h.session.attach(entry, shell, String(i), { replaceSlot: true, crossing: true, scrollRoot: root, admissionScope: scope });
      cards.push({ shell, entry });
    }
    h.observers[0].batch(...cards.slice(0, 5).map(card => [card.shell, true])); h.tick();
    assert.deepEqual(h.built, ['0', '1', '2', '3']);
    h.observers[0].batch(...cards.slice(0, 4).map(card => [card.entry.host, false]));
    root.scroll();
    h.tick();
    assert.deepEqual(h.built, ['0', '1', '2', '3', '4']);
    h.observers[0].batch([cards[4].entry.host, false], [cards[7].shell, true]); h.drain();
    assert.deepEqual(h.built, ['0', '1', '2', '3', '4', '7', '5', '6']);
    assert.equal(cards[4].entry.slot, cards[4].entry.host);
  } finally { h.restore(); }
});

test('restored-card adapters admit the server list in batches and retain nodes across scrolling', () => {
  const h = setup();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const start = source.indexOf('    const retainedPreviewCards = new Map();');
    const end = source.indexOf('    const removeForumCardNode =', start);
    assert.ok(start > 0 && end > start);
    const helper = Function(source.slice(start, end) + '\nreturn { mountRetainedPreviewCard };').call(h.plugin);
    const root = h.root();
    h.plugin.settings = {};
    h.plugin.noTintIds = new Set();
    h.plugin.cleanupCopiedNativeDeleteControls = () => {};
    h.plugin.messageRecord = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i),
      { message: { id: String(i), channel_id: 'c' } }]));
    const shells = Object.values(h.plugin.messageRecord).map(record => helper.mountRetainedPreviewCard(
      record, root, 'forum', 'parent', current => { h.built.push(current.message.id); return new Node(); }));
    h.observers[0].batch([shells[1], true]); h.tick();
    assert.deepEqual(h.built, ['1', '0', '2', '3']);
    h.drain();
    const firstHost = h.session.ownerOf(root.children[1]).host;
    root.scroll();
    h.observers[0].batch([firstHost, false], [root.children[5], true]); h.drain();
    assert.deepEqual(h.built, ['1', '0', '2', '3', '4', '5']);
    assert.equal(root.children[1], firstHost);
  } finally { h.restore(); }
});
