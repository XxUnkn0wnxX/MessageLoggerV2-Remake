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
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
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
  return Function(source.slice(start, end) + '\nreturn { mountRetainedPreviewCard, parkRetainedPreviewCard, parkRetainedPreviewType, retainedThreadBrowserHeaders, sweepDetachedPreviewCards };').call(plugin);
}
function fixture() {
  const env = setup();
  const plugin = new Plugin({ name: 'MessageLoggerV2', version: 'test' });
  const records = { a: { message: { id: 'a', channel_id: 'c', content: 'one' } }, b: { message: { id: 'b', channel_id: 'c', content: 'two' } } };
  Object.assign(plugin, { messageRecord: records, settings: {}, noTintIds: new Set(), cleanupCopiedNativeDeleteControls() {} });
  return { env, plugin, records, helper: getHelper(plugin), parent: new Node('ul', true) };
}

test('same-tag shell batches full card building; warm reattachment restores exact node and ancestry', () => {
  const f = fixture();
  try {
    let builds = 0;
    const build = record => { builds++; const li = new Node('li'); const card = new Node('div'); card.setAttribute('data-ml2-restored-forum-card', record.message.id); li.appendChild(card); return li; };
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', build);
    assert.equal(shell.tagName, 'LI');
    assert.equal(shell.getAttribute('data-item-id'), 'a');
    assert.equal(builds, 0);
    f.env.tick();
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
    assert.equal(pending.style.minHeight, '120px');
    assert.equal(f.parent.children[1], oldB);
    f.env.observers[0].hide(pending); f.env.tick();
    assert.deepEqual(built, ['a', 'b', 'a']);
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
    const content = f.parent, header = new Node('header');
    header.cloneNode = () => new Node('header');
    header.textContent = 'Joined Threads';
    const makeNativeCard = ({heading = true, subtext = true, preview = false, restored = false} = {}) => {
      const card = new Node('div');
      card.setAttribute('role', 'button');
      if (restored) card.setAttribute('data-ml2-restored-thread-browser-card', 'already-restored');
      card.querySelector = selector => {
        if (selector === 'h2 [class*="threadName_"]') {
          const name = new Node('span');
          name.className = 'threadName_native';
          return heading ? name : null;
        }
        if (selector === '[class*="subtext_"]') {
          const detail = new Node('div');
          detail.className = 'subtext_native';
          detail.textContent = preview ? 'Latest message preview' : 'No recent messages';
          return subtext ? detail : null;
        }
        if (selector === '[id^="message-content-"]') return preview ? new Node('div') : null;
        return null;
      };
      return card;
    };
    const noPreviewCard = makeNativeCard();
    const populatedCard = makeNativeCard({preview: true});
    const restoredNativeCard = makeNativeCard({restored: true, preview: true});
    const unrelatedCard = makeNativeCard({heading: false});
    content.appendChild(header);
    content.appendChild(noPreviewCard);
    content.appendChild(populatedCard);
    content.appendChild(restoredNativeCard);
    content.appendChild(unrelatedCard);
    const browser = new Node('div');
    browser.setAttribute('role', 'dialog');
    const input = { value: 'one', dataset: {}, addEventListener() {}, closest: selector => selector === '[role="dialog"]' ? browser : null };
    browser.querySelectorAll = selector => selector === 'div[role="button"]'
      ? [noPreviewCard, populatedCard, restoredNativeCard, unrelatedCard] : [];
    global.document.querySelector = selector => selector === 'input[placeholder="Search for Thread Name"]' ? input : null;
    const finderStart = source.indexOf('    const findThreadBrowserSource =');
    const finderEnd = source.indexOf('    const createRestoredThreadBrowserCard =', finderStart);
    assert.ok(finderStart > 0 && finderEnd > finderStart);
    const findThreadBrowserSource = Function('document',
      source.slice(finderStart, finderEnd) + '\nreturn findThreadBrowserSource;')(global.document);
    const discovered = findThreadBrowserSource();
    assert.equal(discovered.browser, browser);
    assert.equal(discovered.sourceCard, noPreviewCard, 'native cards remain eligible without a message preview');
    assert.equal(noPreviewCard.querySelector('[class*="subtext_"]').textContent, 'No recent messages');
    assert.deepEqual(discovered.sourceCards, [noPreviewCard, populatedCard], 'populated cards remain eligible while unrelated and restored cards stay excluded');
    assert.equal(discovered.sectionHeader, header);
    populatedCard.remove();
    browser.querySelectorAll = selector => selector === 'div[role="button"]'
      ? [noPreviewCard, restoredNativeCard, unrelatedCard] : [];
    assert.deepEqual(findThreadBrowserSource().sourceCards, [noPreviewCard], 'restoration still has a native template when no recent-message cards remain');
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
    f.plugin.selectedChannel = { id: 'parent', type: 0, guild_id: 'g1' };
    let selectedGuild = 'g1';
    f.plugin.getSelectedGuildId = () => selectedGuild;
    const records = [f.records.a, f.records.b];
    const builds = [];
    const restore = Function('findThreadBrowserSource', 'isForumListChannel', 'getRestorableCompactThreadRecords',
      'getForumRecordTitle', 'parkRetainedPreviewCard', 'parkRetainedPreviewType', 'retainedThreadBrowserHeaders', 'mountRetainedPreviewCard', 'createRestoredThreadBrowserCard',
      'applyRestoredThreadTint', 'scheduleRestoreDeletedCompactThreads',
      source.slice(start, end) + '\nreturn restoreDeletedThreadBrowserCards;').call(f.plugin,
        findThreadBrowserSource,
        () => false, () => records, record => record.message.content,
        f.helper.parkRetainedPreviewCard, f.helper.parkRetainedPreviewType, f.helper.retainedThreadBrowserHeaders, f.helper.mountRetainedPreviewCard,
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
    selectedGuild = null;
    restore();
    assert.equal(content.querySelector('[data-ml2-restored-thread-browser-card="a"]'), null);
    assert.equal(content.querySelector('[data-ml2-restored-thread-browser-section="parent"]'), null);
  } finally { f.env.restore(); }
});

test('real forum builder keeps its LI > card > left/body/footer ancestry after server admission', () => {
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
    const formattedChild = li.children[0];
    assert.equal(mutationObservers.length, 0, 'the viewport owner handles formatted-root cleanup');
    f.helper.parkRetainedPreviewCard(li);
    assert.equal(unmounts, 0); assert.equal(deleteCleanups, 0);
    f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', builder);
    assert.equal(f.parent.children[0], li);
    assert.equal(li.children[0], formattedChild);
    f.plugin.getViewportSession().disposeMessage('a');
    assert.equal(unmounts, 1); assert.equal(deleteCleanups, 1);
    assert.equal(mutationObservers.length, 0);
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

test('restored sidebar stays cold in DMs or without native sidebar, then reuses native-shaped entry', () => {
  const f = fixture();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const helperStart = source.indexOf('    const retainedPreviewCards = new Map();');
    const helperEnd = source.indexOf('    const removeForumCardNode =', helperStart);
    const helper = Function(source.slice(helperStart, helperEnd)
      + '\nreturn { retainedPreviewCards, mountRetainedPreviewCard, parkRetainedPreviewCard, parkRetainedPreviewType };').call(f.plugin);
    const builderStart = source.indexOf('    const createRestoredSidebarThread =');
    const builderEnd = source.indexOf('    const findThreadBrowserSource =', builderStart);
    let clones = 0, wires = 0, titleUpdates = 0;
    const sourceLi = new Node('li');
    sourceLi.className = 'native-li';
    sourceLi.getBoundingClientRect = () => ({ height: 28 });
    sourceLi.cloneNode = () => {
      clones++;
      const li = new Node('li'), focus = new Node('div');
      li.appendChild(focus);
      li.querySelector = selector => selector === '[data-list-item-id^="channels___"]' ? focus : null;
      return li;
    };
    const builder = Function('getForumRecordTitle', 'stripSelectedThreadClasses', 'isForumListChannel',
      'replaceText', 'wireRestoredForumCard', source.slice(builderStart, builderEnd)
      + '\nreturn createRestoredSidebarThread;').call(f.plugin,
      record => record.message.content, () => {}, () => false,
      () => { titleUpdates++; }, () => { wires++; });
    const group = f.parent;
    group.querySelector = selector => {
      const id = selector.match(/channels___([^"\]]+)/)?.[1];
      return group.children.find(node => node.getAttribute('data-list-item-id') === `channels___${id}`
        || node.children.some(child => child.getAttribute?.('data-list-item-id') === `channels___${id}`)) || null;
    };
    let guild = null, sidebar = false, recordReads = 0, channelReads = 0, queries = 0;
    const a = f.records.a;
    a.delete_data = { forum_thread_delete: true, forum_parent_id: 'parent' };
    a.message.guild_id = 'g1';
    const other = { message: { id: 'b', channel_id: 'b', guild_id: 'g2', content: 'other' },
      delete_data: { forum_thread_delete: true, forum_parent_id: 'other' } };
    const records = { a, b: other };
    f.plugin.messageRecord = new Proxy(records, { ownKeys(target) { recordReads++; return Reflect.ownKeys(target); } });
    f.plugin.getSelectedGuildId = () => guild;
    f.plugin.tools = { getChannel(id) { channelReads++; return { id, guild_id: id === 'parent' ? 'g1' : 'g2' }; } };
    f.plugin.style = { restoredThreadEntry: 'restored', deleted: 'deleted' };
    f.plugin.isSuppressedForumThreadId = () => false;
    global.document.querySelectorAll = selector => {
      queries++;
      if (selector === '[data-list-item-id^="channels___"]') return sidebar ? [{ isConnected: true, closest: () => null,
        getAttribute: () => sidebar === 'other' ? 'channels___other' : 'channels___parent' }] : [];
      if (selector === '[data-ml2-restored-thread-entry]') return group.children.filter(node => node.getAttribute('data-ml2-restored-thread-entry'));
      return [];
    };
    const start = source.indexOf('    const restoreDeletedSidebarThreads =');
    const end = source.indexOf('    const restoreDeletedThreadBrowserCards =', start);
    const restore = Function('parkRetainedPreviewType', 'findSidebarThreadSource', 'getRestorableCompactThreadRecords',
      'mountRetainedPreviewCard', 'createRestoredSidebarThread', 'parkRetainedPreviewCard', 'applyRestoredThreadTint',
      source.slice(start, end) + '\nreturn restoreDeletedSidebarThreads;').call(f.plugin,
      helper.parkRetainedPreviewType, parentId => parentId === 'parent' ? { group, sourceLi } : {},
      parent => Object.values(records).filter(record => record.delete_data.forum_parent_id === parent.id),
      helper.mountRetainedPreviewCard, builder, helper.parkRetainedPreviewCard, () => {});
    restore();
    assert.equal(queries, 0); assert.equal(recordReads, 0); assert.equal(channelReads, 0);
    guild = 'g1';
    restore();
    assert.equal(recordReads, 0); assert.equal(channelReads, 0); assert.equal(clones, 0);
    sidebar = 'other';
    restore();
    assert.equal(recordReads, 0); assert.equal(clones, 0);
    sidebar = true;
    restore();
    assert.equal(group.children.length, 1);
    let shell = group.children[0];
    assert.equal(shell.tagName, 'LI');
    assert.equal(shell.getAttribute('role'), 'listitem');
    assert.equal(shell.getAttribute('data-ml2-restored-thread-entry'), 'a');
    assert.equal(shell.getAttribute('data-list-item-id'), 'channels___a');
    assert.equal(shell.style.minHeight, '28px');
    assert.equal(clones, 0);
    guild = null;
    restore();
    f.env.tick();
    assert.equal(group.children.length, 0); assert.equal(clones, 0);
    guild = 'g1';
    restore();
    shell = group.children[0];
    f.env.tick();
    const li = group.children[0];
    assert.equal(li.tagName, 'LI'); assert.equal(li.parentNode, group);
    assert.equal(li.children[0].getAttribute('data-list-item-id'), 'channels___a');
    assert.equal(clones, 1); assert.equal(titleUpdates, 1); assert.equal(wires, 1);
    guild = null;
    restore();
    assert.equal(group.children.length, 0);
    guild = 'g1';
    restore();
    assert.equal(group.children[0], li);
    assert.equal(clones, 1); assert.equal(wires, 1);
  } finally { f.env.restore(); }
});

test('all server card types keep a silent inert measured shell and retain jump markers', () => {
  for (const type of ['forum', 'thread-browser', 'sidebar']) {
    const f = fixture();
    try {
      let builds = 0, scrolled = 0;
      const template = new Node(type === 'thread-browser' ? 'div' : 'li');
      const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, type, 'parent', () => {
        builds++; return new Node(type === 'thread-browser' ? 'div' : 'li');
      }, template, 36);
      shell.scrollIntoView = () => { scrolled++; };
      assert.equal(shell.style.visibility, 'hidden', type);
      assert.equal(shell.style.minHeight, '36px', type);
      assert.equal(shell.inert, true, type);
      assert.equal(shell.getAttribute('aria-hidden'), 'true', type);
      assert.equal(shell.children.length, 0, type);
      assert.equal(shell.textContent, undefined, type);
      if (type === 'forum') assert.equal(shell.getAttribute('data-list-item-id'), 'forum-channel-list-parent___a');
      if (type === 'sidebar') assert.equal(shell.getAttribute('data-list-item-id'), 'channels___a');
      if (type === 'thread-browser') assert.equal(shell.getAttribute('data-ml2-restored-thread-browser-card'), 'a');
      shell.scrollIntoView();
      f.env.observers[0].show(shell); f.env.tick();
      const host = f.parent.children[0];
      assert.notEqual(host, shell, type);
      assert.equal(host.parentNode, f.parent, type);
      assert.notEqual(host.style.visibility, 'hidden', type);
      assert.equal(builds, 1, type);
      assert.equal(scrolled, 1, type);
      f.helper.parkRetainedPreviewCard(host);
      f.helper.mountRetainedPreviewCard(f.records.a, f.parent, type, 'parent', () => { builds++; return new Node(); }, template, 36);
      assert.equal(f.parent.children[0], host, type);
      assert.equal(builds, 1, type);
    } finally { f.env.restore(); }
  }
});

test('silent card failure becomes a readable non-inert terminal fallback', () => {
  const f = fixture();
  try {
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', () => { throw Error('fail'); });
    assert.equal(shell.style.visibility, 'hidden');
    f.env.observers[0].show(shell); f.env.tick();
    assert.equal(shell.style.visibility, '');
    assert.equal(shell.inert, false);
    assert.equal(shell.getAttribute('aria-hidden'), null);
    assert.equal(shell.textContent, 'Saved message could not be loaded.');
  } finally { f.env.restore(); }
});

test('ordinary message slots still show their loading label and animated dots', () => {
  const f = fixture();
  try {
    const session = f.plugin.getViewportSession();
    const entry = session.getEntry({ surfaceKey: 'logger', channelId: 'c', messageId: 'm', revision: 1, build() {} });
    const slot = new Node('div'); f.parent.appendChild(slot);
    session.attach(entry, slot, 'message');
    assert.equal(slot.children[0].children[0].textContent, 'MLV2: Loading saved message');
    assert.equal(slot.children[0].children[1].textContent, ' ...');
    assert.notEqual(slot.children[0].style.visibility, 'hidden');
  } finally { f.env.restore(); }
});

test('server preview restoration avoids source and record traversal in DMs and stale guilds', () => {
  const f = fixture();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    let guild = null, sourceLookups = 0, recordLookups = 0, channelLookups = 0;
    f.plugin.getSelectedGuildId = () => guild;
    f.plugin.selectedChannel = { id: 'thread', type: 11, parent_id: 'p', guild_id: 'old' };
    f.plugin.tools = { getChannel() { channelLookups++; return { id: 'p', guild_id: 'old' }; } };
    const forumStart = source.indexOf('    const restoreDeletedForumCards =');
    const forumEnd = source.indexOf('    const findSidebarThreadSource =', forumStart);
    const forum = Function('parkRetainedPreviewType', 'canRestoreVisibleThreadRoots', 'removeRestoredForumCardsForChannel',
      'isForumListChannel', 'findForumCardSource', 'getRestorableForumRecordsForChannel',
      source.slice(forumStart, forumEnd) + '\nreturn restoreDeletedForumCards;').call(f.plugin,
        f.helper.parkRetainedPreviewType, () => true, () => {}, () => true,
        () => { sourceLookups++; return {}; }, () => { recordLookups++; return []; });
    const browserStart = source.indexOf('    const restoreDeletedThreadBrowserCards =');
    const browserEnd = source.indexOf('    const restoreDeletedCompactThreads =', browserStart);
    const browser = Function('parkRetainedPreviewType', 'findThreadBrowserSource',
      source.slice(browserStart, browserEnd) + '\nreturn restoreDeletedThreadBrowserCards;').call(f.plugin,
        f.helper.parkRetainedPreviewType, () => { sourceLookups++; return {}; });
    forum(); browser();
    assert.equal(sourceLookups, 0); assert.equal(recordLookups, 0); assert.equal(channelLookups, 0);
    guild = 'new';
    forum(); browser();
    assert.equal(sourceLookups, 0); assert.equal(recordLookups, 0);
    assert.equal(channelLookups, 2);
  } finally { f.env.restore(); }
});

test('sidebar admissions batch without IO, prioritize visible messages, and cancel when parked', () => {
  const f = fixture();
  try {
    const built = [];
    f.plugin.messageRecord = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i),
      { message: { id: String(i), channel_id: 'c', content: 'text' } }]));
    const nodes = Object.values(f.plugin.messageRecord).map(record => f.helper.mountRetainedPreviewCard(
      record, f.parent, 'sidebar', 'parent', current => { built.push(current.message.id); return new Node('li'); }));
    assert.deepEqual(built, []);
    assert.ok(nodes.every(node => node.style.visibility === 'hidden'));
    const slot = new Node('div'); f.parent.appendChild(slot);
    const session = f.plugin.getViewportSession();
    const visible = session.getEntry({ surfaceKey: 'logger', channelId: 'c', messageId: 'visible', revision: 1,
      build() { built.push('visible'); } });
    session.attach(visible, slot, 'visible');
    f.env.observers[0].show(slot);
    f.env.tick();
    assert.deepEqual(built, ['visible', '0', '1', '2']);
    f.helper.parkRetainedPreviewType('sidebar');
    f.env.tick();
    assert.deepEqual(built, ['visible', '0', '1', '2']);
    assert.equal(f.parent.children.length, 1);
  } finally { f.env.restore(); }
});

test('active sidebar invalidation rehydrates without requiring a viewport event', () => {
  const f = fixture();
  try {
    let builds = 0;
    const builder = () => { builds++; return new Node('li'); };
    f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'sidebar', 'parent', builder);
    f.env.tick();
    assert.equal(builds, 1);
    f.records.a.message.content = 'changed';
    f.plugin.getViewportSession().invalidate('a', 'changed');
    f.env.tick();
    assert.equal(builds, 2);
  } finally { f.env.restore(); }
});

test('failed silent forum card keeps readable LI shell after a warm revisit without retry', () => {
  const f = fixture();
  try {
    let attempts = 0;
    const builder = () => { attempts++; throw Error('failed'); };
    const shell = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', builder);
    f.env.tick();
    assert.equal(attempts, 1);
    assert.equal(shell.tagName, 'LI');
    assert.equal(shell.style.visibility, '');
    assert.equal(shell.textContent, 'Saved message could not be loaded.');
    f.helper.parkRetainedPreviewCard(shell);
    const replacement = f.helper.mountRetainedPreviewCard(f.records.a, f.parent, 'forum', 'parent', builder);
    f.env.tick();
    assert.equal(replacement.tagName, 'LI');
    assert.equal(f.parent.children[0], replacement);
    assert.equal(replacement.style.visibility, '');
    assert.equal(replacement.inert, false);
    assert.equal(replacement.textContent, 'Saved message could not be loaded.');
    assert.equal(attempts, 1);
  } finally { f.env.restore(); }
});

test('opening a forum post keeps its existing parent-list card while ordinary thread views park it', () => {
  const f = fixture();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const start = source.indexOf('    const restoreDeletedForumCards =');
    const end = source.indexOf('    const findSidebarThreadSource =', start);
    assert.ok(start > 0 && end > start);
    const forumParent = { id: 'forum', type: 15, guild_id: 'guild' };
    const ordinaryParent = { id: 'text', type: 0, guild_id: 'guild' };
    f.plugin.getSelectedGuildId = () => 'guild';
    f.plugin.tools = { getChannel: id => id === 'forum' ? forumParent : ordinaryParent };
    f.plugin.selectedChannel = { id: 'post', type: 11, parent_id: 'forum', guild_id: 'guild' };
    const template = new Node('li'), sourceCard = new Node('div');
    const record = f.records.a;
    const builder = current => {
      const li = new Node('li'), card = new Node('div');
      li.setAttribute('data-ml2-restored-forum-thread', current.message.id);
      card.setAttribute('data-ml2-restored-forum-card', current.message.id);
      card.setAttribute('data-item-id', current.message.id);
      card.closest = selector => selector.includes('data-ml2-restored-forum-thread') || selector === 'li' ? li : null;
      li.appendChild(card);
      return li;
    };
    f.helper.mountRetainedPreviewCard(record, f.parent, 'forum', 'forum', builder, template);
    f.env.tick();
    const existing = f.parent.children[0], card = existing.children[0];
    f.parent.querySelectorAll = selector => selector.includes('data-ml2-restored-forum-card') ? [card] : [];
    global.document.querySelectorAll = () => [];
    const restoredParents = [];
    const restore = Function('parkRetainedPreviewType', 'canRestoreVisibleThreadRoots', 'removeRestoredForumCardsForChannel',
      'isForumListChannel', 'findForumCardSource', 'removeSuppressedForumCards', 'getRestorableForumRecordsForChannel',
      'parkRetainedPreviewCard', 'tintForumCardByThreadId', 'mountRetainedPreviewCard', 'createRestoredForumCard',
      source.slice(start, end) + '\nreturn restoreDeletedForumCards;').call(f.plugin,
      f.helper.parkRetainedPreviewType, () => true, () => {}, channel => channel?.type === 15,
      parent => { restoredParents.push(parent.id); return { sourceCard, sourceLi: template, list: f.parent }; },
      () => {}, () => [record], f.helper.parkRetainedPreviewCard, () => {},
      f.helper.mountRetainedPreviewCard, builder);
    restore();
    assert.deepEqual(restoredParents, ['forum']);
    assert.equal(f.parent.children[0], existing);
    f.plugin.selectedChannel = { id: 'ordinary-thread', type: 11, parent_id: 'text', guild_id: 'guild' };
    restore();
    assert.equal(f.parent.children.length, 0);
  } finally { f.env.restore(); }
});

test('each restored server card type admits on attachment without a viewport event', () => {
  for (const type of ['forum', 'thread-browser', 'sidebar']) {
    const f = fixture();
    try {
      let builds = 0;
      f.helper.mountRetainedPreviewCard(f.records.a, f.parent, type, 'parent', () => { builds++; return new Node(type === 'thread-browser' ? 'div' : 'li'); });
      assert.equal(builds, 0, type);
      f.env.tick();
      assert.equal(builds, 1, type);
      f.records.a.message.content = 'changed';
      f.plugin.getViewportSession().invalidate('a', 'changed');
      f.env.tick();
      assert.equal(builds, 2, type);
    } finally { f.env.restore(); }
  }
});
