const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
require('./helpers/plugin-harness');
const Plugin = require(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'));
class Node {
  constructor(tag = 'div', connected = false) { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.rootConnected = connected; this.dataset = {}; this.style = {}; this.attributes = {}; this.classList = { add() {}, remove() {}, toggle() {} }; }
  get isConnected() { return this.rootConnected || !!this.parentNode?.isConnected; }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.children[0]; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  replaceChildren(...nodes) { for (const node of this.children) node.parentNode = null; this.children = []; this.append(...nodes); }
  replaceWith(node) { const parent = this.parentNode; if (!parent) return; node.remove(); const index = parent.children.indexOf(this); parent.children[index] = node; node.parentNode = parent; this.parentNode = null; }
  remove() { if (!this.parentNode) return; const p = this.parentNode; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { height: 120 }; }
}
function setup() {
  const old = { document: global.document, IntersectionObserver: global.IntersectionObserver, requestAnimationFrame: global.requestAnimationFrame };
  const frames = [], observers = [];
  global.document = { head: new Node('head', true), createElement: tag => new Node(tag) };
  global.requestAnimationFrame = fn => frames.push(fn);
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); }
    show(node) { this.callback([{ target: node, isIntersecting: true }]); }
    hide(node) { this.callback([{ target: node, isIntersecting: false }]); }
  };
  return { observers, tick() { frames.splice(0).forEach(fn => fn()); }, restore() { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; } } };
}
function getHelper(plugin) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('    const retainedPreviewCards = new Map();');
  const end = source.indexOf('    const removeForumCardNode =', start);
  assert.ok(start > 0 && end > start);
  return Function(source.slice(start, end) + '\nreturn { mountRetainedPreviewCard, parkRetainedPreviewCard, sweepDetachedPreviewCards };').call(plugin);
}
function fixture() {
  const env = setup();
  const plugin = new Plugin({ name: 'MessageLoggerV2', version: 'test' });
  const records = { a: { message: { id: 'a', channel_id: 'c', content: 'one' } }, b: { message: { id: 'b', channel_id: 'c', content: 'two' } } };
  Object.assign(plugin, { messageRecord: records, settings: {}, noTintIds: new Set(), cleanupCopiedNativeDeleteControls() {} });
  return { env, plugin, records, helper: getHelper(plugin), parent: new Node('ul', true) };
}

test('same-tag placeholder gates full card building; warm reattachment restores exact node and ancestry', () => {
  const f = fixture();
  try {
    let builds = 0;
    const build = record => { builds++; const li = new Node('li'); const card = new Node('div'); card.setAttribute('data-ml2-restored-forum-card', record.message.id); li.appendChild(card); return li; };
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', build);
    assert.equal(shell.tagName, 'LI');
    assert.equal(shell.getAttribute('data-item-id'), 'a');
    assert.equal(builds, 0);
    f.env.observers[0].show(shell); f.env.tick();
    const li = f.parent.children[0], card = li.children[0];
    assert.equal(builds, 1);
    assert.equal(li.tagName, 'LI'); assert.equal(card.tagName, 'DIV');
    assert.equal(li.parentNode, f.parent); assert.equal(card.parentNode, li);
    const session = f.plugin.getViewportSession();
    assert.equal(session.ownerOf(card).host, li);
    f.helper.parkRetainedPreviewCard(li);
    assert.equal(f.parent.children.length, 0);
    const restored = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', build);
    assert.equal(restored, li);
    assert.equal(f.parent.children[0], li); assert.equal(li.children[0], card);
    assert.equal(builds, 1);
  } finally { f.env.restore(); }
});

test('dirty card uses measured shell and rebuilds only on admission without changing other card', () => {
  const f = fixture();
  try {
    const built = [];
    const builder = record => { built.push(record.message.id); return new Node('li'); };
    const a = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', builder);
    const b = f.helper.mountRetainedPreviewCard(f.records.b, f.parent, 'forum', 'parent', builder);
    f.env.observers[0].show(a); f.env.observers[0].show(b); f.env.tick();
    const oldA = f.parent.children[0], oldB = f.parent.children[1];
    f.records.a.message.content = 'changed';
    f.plugin.getViewportSession().invalidate('a', 'changed');
    const pending = f.parent.children[0];
    assert.equal(pending.tagName, 'LI'); assert.notEqual(pending, oldA);
    assert.equal(pending.children[0].style.minHeight, '120px');
    assert.equal(f.parent.children[1], oldB);
    f.env.observers[0].hide(pending); f.env.tick();
    assert.deepEqual(built, ['a', 'b']);
    f.env.observers[0].show(pending); f.env.tick();
    assert.deepEqual(built, ['a', 'b', 'a']);
    assert.equal(f.parent.children[1], oldB);
  } finally { f.env.restore(); }
});

test('thread cards retain same node through filter park and detached navigation cleanup', () => {
  const f = fixture();
  try {
    let builds = 0, disposed = 0;
    f.plugin.cleanupCopiedNativeDeleteControls = () => { disposed++; };
    const builder = () => { builds++; return new Node('div'); };
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'thread-browser', 'parent', builder);
    assert.equal(shell.getAttribute('data-ml2-restored-thread-browser-card'), 'a');
    f.env.observers[0].show(shell); f.env.tick();
    const card = f.parent.children[0];
    f.helper.parkRetainedPreviewCard(card);
    assert.equal(disposed, 0);
    f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'thread-browser', 'parent', builder);
    assert.equal(f.parent.children[0], card); assert.equal(builds, 1);
    f.parent.remove(); f.parent.rootConnected = false;
    f.helper.sweepDetachedPreviewCards();
    const entry = f.plugin.getViewportSession().ownerOf(card);
    assert.equal(entry.slot, null);
    f.plugin.getViewportSession().disposeMessage('a');
    assert.equal(disposed, 1);
  } finally { f.env.restore(); }
});

test('normal slot placement is unchanged and never self-appends the card host', () => {
  const f = fixture();
  try {
    const session = f.plugin.getViewportSession();
    const entry = session.getEntry({ surfaceKey:'ordinary',channelId:'c',messageId:'a',revision:1,
      build(e, host) { host.appendChild(new Node('span')); } });
    const slot = new Node('div'); f.parent.appendChild(slot);
    session.attach(entry, slot, 'token'); f.env.observers[0].show(slot); f.env.tick();
    assert.equal(f.parent.children[0], slot); assert.equal(slot.children[0], entry.host);
    assert.equal(entry.host.children[0].tagName, 'SPAN');
  } finally { f.env.restore(); }
});

test('real thread-browser restoration mounts only matching cards and reuses filtered-out node', () => {
  const f = fixture();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const start = source.indexOf('    const restoreDeletedThreadBrowserCards =');
    const end = source.indexOf('    const restoreDeletedCompactThreads =', start);
    assert.ok(start > 0 && end > start);
    const content = f.parent, header = new Node('header'), nativeCard = new Node('div');
    header.cloneNode = () => new Node('header');
    const input = { value: 'one', dataset: {}, addEventListener() {} };
    content.querySelectorAll = selector => {
      if (selector === '[data-ml2-restored-thread-browser-card]') return content.children.filter(n => n.getAttribute('data-ml2-restored-thread-browser-card'));
      return [];
    };
    content.querySelector = selector => {
      const browserMatch = selector.match(/^\[data-ml2-restored-thread-browser-card="([^"]+)"\]$/);
      if (browserMatch) return content.children.find(n => n.getAttribute('data-ml2-restored-thread-browser-card') === browserMatch[1]) || null;
      const sectionMatch = selector.match(/^\[data-ml2-restored-thread-browser-section="([^"]+)"\]$/);
      if (sectionMatch) return content.children.find(n => n.getAttribute('data-ml2-restored-thread-browser-section') === sectionMatch[1]) || null;
      return null;
    };
    f.plugin.selectedChannel = { id: 'parent', type: 0 };
    const records = [f.records.a, f.records.b];
    const builds = [];
    const restore = Function('findThreadBrowserSource', 'isForumListChannel', 'getRestorableCompactThreadRecords',
      'getForumRecordTitle', 'parkRetainedPreviewCard', 'mountRetainedPreviewCard', 'createRestoredThreadBrowserCard',
      'applyRestoredThreadTint', 'scheduleRestoreDeletedCompactThreads',
      source.slice(start, end) + '\nreturn restoreDeletedThreadBrowserCards;').call(f.plugin,
        () => ({ browser: {}, input, content, sectionHeader: header, sourceCard: nativeCard, sourceCards: [nativeCard] }),
        () => false, () => records, record => record.message.content,
        f.helper.parkRetainedPreviewCard, f.helper.mountRetainedPreviewCard,
        record => { builds.push(record.message.id); const card = new Node('div'); card.setAttribute('data-ml2-restored-thread-browser-card', record.message.id); return card; },
        () => {}, () => {});
    f.plugin.isSuppressedForumThreadId = () => false;
    f.plugin.style = { restoredThreadBrowserSection: 'section' };
    restore();
    const aShell = content.querySelector('[data-ml2-restored-thread-browser-card="a"]');
    assert.ok(aShell); assert.equal(content.querySelector('[data-ml2-restored-thread-browser-card="b"]'), null);
    assert.deepEqual(builds, []);
    f.env.observers[0].show(aShell); f.env.tick();
    const cardA = content.querySelector('[data-ml2-restored-thread-browser-card="a"]');
    assert.deepEqual(builds, ['a']);
    input.value = 'two'; restore();
    assert.equal(content.querySelector('[data-ml2-restored-thread-browser-card="a"]'), null);
    const bShell = content.querySelector('[data-ml2-restored-thread-browser-card="b"]');
    assert.ok(bShell); assert.deepEqual(builds, ['a']);
    input.value = 'one'; restore();
    assert.equal(content.querySelector('[data-ml2-restored-thread-browser-card="a"]'), cardA);
    assert.deepEqual(builds, ['a']);
  } finally { f.env.restore(); }
});

test('real forum builder keeps its LI > card > left/body/footer ancestry after viewport admission', () => {
  const f = fixture();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const start = source.indexOf('    const createAnchoredRestoredForumCard =');
    const end = source.indexOf('    const createRestoredForumCard =', start);
    assert.ok(start > 0 && end > start);
    let parsed = 0;
    f.plugin.style = { restoredForumItem: 'restored-item', deleted: 'deleted', restoredForumCard: 'restored-card', restoredForumMeta: 'meta' };
    f.plugin.classes = { messageContent: 'message' };
    f.records.a.message.author = { username: 'author' };
    const actualBuilder = Function('getForumRecordTitle', 'getForumRecordMeta', 'copyClass', 'copyStyle',
      'appendRestoredPreviewMarkup', 'appendForumCardMetadata', 'wireRestoredForumCard',
      source.slice(start, end) + '\nreturn createAnchoredRestoredForumCard;').call(f.plugin,
        () => 'Title', () => 'Meta', (sourceCard, selector, fallback) => fallback, () => null,
        (target, value) => { parsed++; const markup = new Node('span'); markup.textContent = value; target.appendChild(markup); },
        () => {}, () => {});
    const templateCard = new Node('div'), templateLi = new Node('li');
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent',
      record => actualBuilder(record, templateCard, templateLi, { id: 'parent' }));
    assert.equal(parsed, 0);
    f.env.observers[0].show(shell); f.env.tick();
    const li = f.parent.children[0], card = li.children[0], left = card.children[1], body = left.children[0], footer = left.children[1];
    assert.equal(parsed, 1);
    assert.equal(li.tagName, 'LI'); assert.equal(card.tagName, 'DIV');
    assert.equal(card.getAttribute('data-ml2-restored-forum-card'), 'a');
    assert.ok(left.className.includes('left_'));
    assert.ok(body.className.includes('body_'));
    assert.ok(footer.className.includes('footer_'));
    assert.equal(body.children.length, 2);
    f.helper.parkRetainedPreviewCard(li);
    f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent',
      record => actualBuilder(record, templateCard, templateLi, { id: 'parent' }));
    assert.equal(f.parent.children[0], li);
    assert.equal(li.children[0], card);
    assert.equal(parsed, 1);
  } finally { f.env.restore(); }
});

test('forum formatted roots survive parking and are destroyed exactly on message disposal', () => {
  const f = fixture();
  const { ReactDOM } = require(path.join(path.join(__dirname, '..'), 'tests/helpers/plugin-harness.js'));
  const oldObserver = global.MutationObserver;
  const mutationObservers = [];
  let unmounts = 0, deleteCleanups = 0;
  global.document.body = new Node('body', true);
  global.MutationObserver = class {
    constructor(callback) { this.callback = callback; mutationObservers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  Node.prototype.getElementsByClassName = () => [];
  ReactDOM.createRoot = parent => ({ render() { parent.appendChild(new Node('span')); }, unmount() { unmounts++; } });
  ReactDOM.flushSync = callback => callback();
  Object.assign(f.plugin, { tools: { parse: () => ({}) }, classes: { hidden: 'hidden' },
    cleanupCopiedNativeDeleteControls() { deleteCleanups++; } });
  try {
    const builder = record => { const li = new Node('li'); li.appendChild(f.plugin.formatMarkup(record.message.content, 'c')); return li; };
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', builder);
    f.env.observers[0].show(shell); f.env.tick();
    const li = f.parent.children[0];
    assert.equal(mutationObservers.length, 1);
    f.helper.parkRetainedPreviewCard(li);
    mutationObservers[0].callback([{ removedNodes: [li] }]);
    assert.equal(unmounts, 0); assert.equal(deleteCleanups, 0);
    f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', builder);
    assert.equal(f.parent.children[0], li);
    f.plugin.getViewportSession().disposeMessage('a');
    assert.equal(unmounts, 1); assert.equal(deleteCleanups, 1);
    assert.equal(mutationObservers[0].disconnected, true);
  } finally {
    delete ReactDOM.createRoot; delete ReactDOM.flushSync; delete Node.prototype.getElementsByClassName;
    if (oldObserver === undefined) delete global.MutationObserver; else global.MutationObserver = oldObserver;
    f.env.restore();
  }
});

test('discarded cold shell disposes without activating and leaves no orphan placeholder', () => {
  const f = fixture();
  try {
    let builds = 0;
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', () => { builds++; return new Node('li'); });
    const entry = f.plugin.getViewportSession().ownerOf(shell);
    f.plugin.getViewportSession().disposeMessage('a');
    assert.equal(builds, 0);
    assert.equal(entry.slot, null);
    assert.equal(f.parent.children.length, 0);
    assert.equal(f.plugin.getViewportSession().ownerOf(shell), null);
  } finally { f.env.restore(); }
});

test('failed card build settles in its same-tag shell without attaching a generic host', () => {
  const f = fixture();
  try {
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', () => { throw Error('failed'); });
    f.env.observers[0].show(shell); f.env.tick();
    assert.equal(f.parent.children[0], shell);
    assert.equal(shell.tagName, 'LI');
    assert.equal(shell.textContent, 'Saved message could not be loaded.');
  } finally { f.env.restore(); }
});
