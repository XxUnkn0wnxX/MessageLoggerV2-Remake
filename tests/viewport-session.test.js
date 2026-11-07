const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./helpers/plugin-harness');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.isConnected = true;
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) {
    node.remove();
    this.children.push(node);
    node.parentNode = this;
    return node;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
      this.parentNode = null;
    }
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  querySelectorAll() { return []; }
  getElementsByClassName() { return []; }
  getBoundingClientRect() { return { height: 93 }; }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  addEventListener() {}
  insertAdjacentHTML() {}
}

function setup({ observer = true } = {}) {
  const old = { document: global.document, IntersectionObserver: global.IntersectionObserver,
    requestAnimationFrame: global.requestAnimationFrame };
  const frames = [];
  const observers = [];
  global.document = { head: new Element('head'), createElement: tag => new Element(tag) };
  global.requestAnimationFrame = callback => { frames.push(callback); };
  if (observer) {
    global.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
      observe(node) { this.targets.add(node); }
      unobserve(node) { this.targets.delete(node); }
      disconnect() { this.targets.clear(); }
      visible(node) { this.callback([{ target: node, isIntersecting: true }]); }
      hidden(node) { this.callback([{ target: node, isIntersecting: false }]); }
    };
  } else delete global.IntersectionObserver;
  return {
    frames, observers,
    tick() { const callbacks = frames.splice(0); for (const callback of callbacks) callback(); },
    restore() {
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete global[key]; else global[key] = value;
      }
    }
  };
}

test('gates factory calls and activates at most four entries per frame', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let builds = 0;
    const slots = Array.from({ length: 7 }, (_, i) => {
      const entry = session.getEntry({ surfaceKey: 'logger', channelId: 'c', messageId: String(i),
        revision: 1, build: () => { builds++; } });
      const slot = new Element();
      session.attach(entry, slot, {});
      return slot;
    });
    assert.equal(builds, 0);
    assert.equal(slots[0].children[0].children[0].textContent, 'Loading saved message');
    for (const slot of slots) env.observers[0].visible(slot);
    env.tick();
    assert.equal(builds, 4);
    env.tick();
    assert.equal(builds, 7);
  } finally { env.restore(); }
});

test('retains hosts and owned roots, rejects stale leases, reconciles only changed revisions', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let revision = 1;
    let builds = 0;
    let disposed = 0;
    const entry = session.getEntry({ surfaceKey: 'logger', channelId: 'c', messageId: 'm',
      revision: () => revision, build(entry, host) {
        builds++;
        const child = new Element();
        host.appendChild(child);
        session.own(entry, child, { unmount() { disposed++; } });
      } });
    const first = new Element();
    const second = new Element();
    const oldLease = {};
    const newLease = {};
    session.attach(entry, first, oldLease);
    env.observers[0].visible(first);
    env.tick();
    const host = entry.host;
    const child = host.children[0];
    assert.equal(session.owns(child), true);
    assert.equal(session.release(entry, oldLease), true);
    assert.equal(disposed, 0);
    session.attach(entry, second, newLease);
    assert.equal(session.release(entry, oldLease), false);
    assert.equal(second.children[0], host);
    assert.equal(host.children[0], child);
    session.reconcileActive();
    env.tick();
    assert.equal(builds, 1);
    revision = 2;
    session.reconcileActive();
    session.reconcileActive();
    env.tick();
    env.observers[0].visible(second);
    env.tick();
    assert.equal(builds, 2);
    assert.equal(disposed, 1);
    assert.equal(entry.host, host);
    session.reset();
    assert.equal(disposed, 2);
    assert.equal(session.owns(child), false);
  } finally { env.restore(); }
});

test('parked completion is guarded and reconciled from the current revision on reattach', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let revision = 1;
    const seen = [];
    const entry = session.getEntry({ surfaceKey: 'thread-a', channelId: 'c', messageId: 'm',
      revision: () => revision, build: () => seen.push(revision) });
    const slot = new Element();
    session.attach(entry, slot, 'one');
    env.observers[0].visible(slot);
    env.tick();
    session.park(entry, 'one');
    assert.equal(session.markPendingWorkDirty(entry, () => false), false);
    assert.equal(session.markPendingWorkDirty(entry, () => true), true);
    revision = 2;
    session.reconcileActive();
    env.tick();
    assert.deepEqual(seen, [1]);
    const second = new Element();
    session.attach(entry, second, 'two');
    env.observers[0].visible(second);
    env.tick();
    assert.deepEqual(seen, [1, 2]);
    const other = session.getEntry({ surfaceKey: 'thread-b', channelId: 'c', messageId: 'm',
      revision: 2, build() {} });
    assert.notEqual(other, entry);
  } finally { env.restore(); }
});

test('stale viewport activation does not load a replacement lease; reset cancels work', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let builds = 0;
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'm', revision: 1,
      build() { builds++; } });
    const first = new Element();
    const second = new Element();
    session.attach(entry, first, 'old');
    env.observers[0].visible(first);
    session.attach(entry, second, 'new');
    env.tick();
    assert.equal(builds, 0);
    env.observers[0].visible(second);
    session.reset();
    env.tick();
    assert.equal(builds, 0);
  } finally { env.restore(); }
});

test('missing observer uses eager fallback and failed factories yield a terminal fallback', () => {
  const env = setup({ observer: false });
  try {
    const session = createPlugin().getViewportSession();
    assert.equal(session.supported, false);
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'm', revision: 1,
      build() { throw new Error('test'); } });
    const slot = new Element();
    session.attach(entry, slot, 'lease');
    assert.equal(slot.children[0].textContent, 'Saved message could not be loaded.');
  } finally { env.restore(); }
});

test('async factory failure settles once and explicit invalidation retries', async () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let builds = 0;
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'm', revision: 1,
      build() { builds++; return Promise.reject(new Error('async failure')); } });
    const slot = new Element();
    session.attach(entry, slot, 'a');
    env.observers[0].visible(slot);
    env.tick();
    assert.equal(session.getDebugSnapshot().pendingBuilds, 1);
    await Promise.resolve();
    assert.equal(entry.host.textContent, 'Saved message could not be loaded.');
    session.reconcileActive();
    env.tick();
    env.tick();
    assert.equal(builds, 1);
    session.invalidate('m', 'retry');
    env.observers[0].visible(slot);
    env.tick();
    await Promise.resolve();
    assert.equal(builds, 2);
    assert.deepEqual(session.getDebugSnapshot(), { entries: 1, cold: 0, activated: 1,
      parked: 0, active: 1, disposed: 0, resources: 0, pendingBuilds: 0, epoch: 0, buildCount: 2 });
    session.reset();
    assert.equal(session.getDebugSnapshot().disposed, 1);
    assert.equal(session.getDebugSnapshot().epoch, 1);
  } finally { env.restore(); }
});

test('parked async completion cannot overwrite the next build', async () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let rejectOld;
    let builds = 0;
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'm', revision: 1,
      build() { builds++; return builds === 1 ? new Promise((resolve, reject) => { rejectOld = reject; }) : undefined; } });
    const slot = new Element();
    session.attach(entry, slot, 'a');
    env.observers[0].visible(slot);
    env.tick();
    session.park(entry, 'a');
    rejectOld(new Error('parked failure'));
    await Promise.resolve();
    assert.equal(entry.pendingWorkDirty, true);
    const nextSlot = new Element();
    session.attach(entry, nextSlot, 'b');
    env.observers[0].visible(nextSlot);
    env.tick();
    assert.equal(builds, 2);
    assert.notEqual(entry.host.textContent, 'Saved message could not be loaded.');
  } finally { env.restore(); }
});

test('visibility withdrawal cancels a cold activation and shares one loading stylesheet', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let builds = 0;
    const first = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'a', revision: 1,
      build() { builds++; } });
    const second = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'b', revision: 1,
      build() { builds++; } });
    const slot = new Element();
    session.attach(first, slot, 'first');
    session.attach(second, new Element(), 'second');
    assert.equal(global.document.head.children.length, 1);
    env.observers[0].visible(slot);
    env.observers[0].hidden(slot);
    env.tick();
    assert.equal(builds, 0);
    assert.equal(first.placeholder.dataset.pendingVisible, 'false');
    env.observers[0].visible(slot);
    env.tick();
    assert.equal(builds, 1);
    session.reset();
    assert.equal(global.document.head.children.length, 0);
  } finally { env.restore(); }
});

test('dirty reacquisition hides stale content until rebuilding and retains ownership boundaries', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let revision = 1;
    let oldChild;
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'a',
      revision: () => revision, build(entry, host) {
        const child = new Element();
        host.appendChild(child);
        session.own(entry, child, null, () => {});
        if (!oldChild) oldChild = child;
      } });
    const first = new Element();
    session.attach(entry, first, 'one');
    env.observers[0].visible(first);
    env.tick();
    const nested = new Element();
    oldChild.appendChild(nested);
    assert.equal(session.ownerOf(nested), entry);
    assert.equal(session.isOwnerActive(nested), true);
    session.park(entry, 'one');
    assert.equal(session.isOwnerActive(nested), false);
    revision++;
    const second = new Element();
    session.attach(entry, second, 'two');
    assert.equal(second.children[0], entry.placeholder);
    assert.equal(session.isOwnerActive(nested), false);
    env.observers[0].visible(second);
    env.tick();
    assert.equal(second.children[0], entry.host);
    assert.equal(session.ownerOf(oldChild), null);
    assert.equal(session.ownerOf(nested), null);
    assert.equal(session.ownerOf(entry.host.children[0]), entry);
    session.dispose(entry);
    assert.equal(session.ownerOf(entry.host), null);
  } finally { env.restore(); }
});

test('resource hooks suspend and resume the same host without disposal', () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    const calls = [];
    let builds = 0;
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'a', revision: 1,
      build(entry, host) {
        builds++;
        const child = new Element();
        host.appendChild(child);
        session.own(entry, child, null, { suspend() { calls.push('suspend'); },
          resume() { calls.push('resume'); }, dispose() { calls.push('dispose'); } });
      } });
    const first = new Element();
    session.attach(entry, first, 'one');
    env.observers[0].visible(first);
    env.tick();
    const host = entry.host;
    session.release(entry, 'one');
    session.attach(entry, new Element(), 'two');
    assert.equal(entry.host, host);
    assert.equal(builds, 1);
    assert.deepEqual(calls, ['suspend', 'resume']);
    session.reset();
    assert.deepEqual(calls, ['suspend', 'resume', 'suspend', 'dispose']);
  } finally { env.restore(); }
});

test('reset closes the old session against revival and preserves the replacement session', () => {
  const env = setup();
  try {
    const plugin = createPlugin();
    const old = plugin.getViewportSession();
    const entry = old.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'a', revision: 1, build() {} });
    old.reset();
    const next = plugin.getViewportSession();
    assert.notEqual(next, old);
    assert.equal(old.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'b', revision: 1, build() {} }), null);
    assert.equal(old.attach(entry, new Element(), 'stale'), false);
    old.reset();
    assert.equal(plugin.getViewportSession(), next);
  } finally { env.restore(); }
});

test('pending async work keeps a loading placeholder until completion', async () => {
  const env = setup();
  try {
    const session = createPlugin().getViewportSession();
    let complete;
    const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: 'a', revision: 1,
      build() { return new Promise(resolve => { complete = resolve; }); } });
    const slot = new Element();
    session.attach(entry, slot, 'one');
    env.observers[0].visible(slot);
    env.tick();
    assert.equal(slot.children[0], entry.placeholder);
    assert.equal(entry.placeholder.children[0].textContent, 'Loading saved message');
    complete();
    await Promise.resolve();
    assert.equal(slot.children[0], entry.host);
  } finally { env.restore(); }
});

test('time deadline yields after one expensive build', () => {
  const env = setup();
  const originalPerformance = global.performance;
  let clock = 0;
  global.performance = { now() { clock += 9; return clock; } };
  try {
    const session = createPlugin().getViewportSession();
    let builds = 0;
    for (let i = 0; i < 3; i++) {
      const entry = session.getEntry({ surfaceKey: 's', channelId: 'c', messageId: String(i), revision: 1,
        build() { builds++; } });
      const slot = new Element();
      session.attach(entry, slot, String(i));
      env.observers[0].visible(slot);
    }
    env.tick();
    assert.equal(builds, 1);
    env.tick();
    assert.equal(builds, 2);
  } finally { global.performance = originalPerformance; env.restore(); }
});

function loggerFixture() {
  const env = setup();
  const records = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, {
    message: { id, channel_id: 'channel', content: `text ${id}`, attachments: [], embeds: [] }
  }]));
  const parent = new Element();
  let filtered = ['a', 'b', 'c', 'd'];
  const built = [];
  const plugin = createPlugin({
    settings: { renderCap: 2, cacheAllImages: true, onlyRenderCachedAttachments: false },
    menu: { shownMessages: -1, open: true },
    style: { menuMessages: 'messages' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
    messageRecord: records,
    getSavedMessage(id) { return records[id]; },
    getMessageAny() { return null; },
    getCacheOnlyMessage(message) { return message; },
    getFilteredMessages() { return filtered; },
    getLoggerSavedAttachmentPresentationEntries() { return []; },
    getRecordRemovedAttachments() { return []; },
    getMessageStickerItems() { return []; },
    getSingleDiscordClass() { return 'missing'; },
    formatMarkup(content) { const text = new Element(); text.textContent = content; return text; },
    createMessageGroup(message) {
      built.push(message.id);
      const group = new Element();
      const markup = new Element();
      group.appendChild(markup);
      group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
      return group;
    },
    createButton(label, callback) { const button = new Element('button'); button.click = () => callback.call(button); return button; }
  });
  global.document.getElementById = id => id === 'messages' ? parent : null;
  return { env, plugin, parent, records, built, setFiltered(ids) { filtered = ids; } };
}

test('owned Logger admits cap batches, activates later visibility in either direction, and retains hosts across filters', () => {
  const f = loggerFixture();
  try {
    f.plugin.refilterMessages();
    assert.equal(f.parent.children.length, 3);
    assert.deepEqual(f.built, []);
    const slots = f.parent.children.slice(0, 2);
    f.env.observers[0].visible(slots[1]);
    f.env.tick();
    assert.deepEqual(f.built, ['b']);
    f.env.observers[0].visible(slots[0]);
    f.env.observers[0].hidden(slots[0]);
    f.env.tick();
    assert.deepEqual(f.built, ['b']);
    f.env.observers[0].visible(slots[0]);
    f.env.tick();
    assert.deepEqual(f.built, ['b', 'a']);
    const savedHost = slots[1].children[0];
    f.parent.children[2].children[0].click();
    assert.equal(f.parent.children.length, 4);
    f.env.observers[0].visible(f.parent.children[3]);
    f.env.tick();
    assert.deepEqual(f.built, ['b', 'a', 'd']);
    f.setFiltered(['b', 'c']);
    f.plugin.refilterMessages();
    assert.equal(f.parent.children[0].children[0], savedHost);
    assert.deepEqual(f.built, ['b', 'a', 'd']);
    f.env.observers[0].visible(f.parent.children[1]);
    f.env.tick();
    assert.deepEqual(f.built, ['b', 'a', 'd', 'c']);
  } finally { f.env.restore(); }
});

test('saved-thread admission is independent from the main Logger count', () => {
  const f = loggerFixture();
  try {
    f.plugin.menu.shownMessages = 4;
    const view = { surfaceKey: 'thread:test', independent: true, shownMessages: -1, leases: new Map() };
    const root = new Element();
    f.plugin.populateParent(root, ['a', 'b', 'c', 'd'], view);
    assert.equal(view.shownMessages, 2);
    assert.equal(f.plugin.menu.shownMessages, 4);
    assert.equal(root.children.length, 3);
    root.children[2].children[0].click();
    assert.equal(view.shownMessages, 4);
    assert.equal(f.plugin.menu.shownMessages, 4);
    f.plugin.parkLoggerViewportView(view);
    assert.equal(view.leases.size, 0);
  } finally { f.env.restore(); }
});

test('owned image error waits while parked and rejects an obsolete canonical source', () => {
  const f = loggerFixture();
  try {
    const attachment = { id: 'image', filename: 'image.png', url: 'https://example.invalid/one.png', width: 200, height: 200 };
    f.records.a.message.attachments = [attachment];
    let continuations = 0;
    Object.assign(f.plugin, {
      getLoggerSavedAttachmentPresentationEntries(message) {
        return message.attachments.map(item => ({ attachment: item, sourceKind: 'attachment',
          plan: { action: 'remote', mediaType: 'image', url: item.url } }));
      },
      createOwnedLoggerMediaContinuation() { return () => { continuations++; return { action: 'remote', url: 'https://example.invalid/two.png' }; }; },
      getSavedAttachmentDescriptor() { return null; },
      isImage(value) { return typeof value === 'string' && value.includes('.png'); },
      isVideo() { return false; }, isAudio() { return false; }, isAttachmentLocallyCached() { return false; }
    });
    f.setFiltered(['a']);
    f.plugin.refilterMessages();
    const slot = f.parent.children[0];
    f.env.observers[0].visible(slot);
    f.env.tick();
    const host = slot.children[0];
    const group = host.children[0];
    const image = group.children.find(node => node.dataset.ml2RemovedAttachmentHost).children[0];
    assert.equal(image.src, attachment.url);
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    image.onerror();
    assert.equal(continuations, 0);
    f.plugin.refilterMessages();
    assert.equal(f.parent.children[0].children[0], host);
    assert.equal(continuations, 1);
    assert.equal(image.src, 'https://example.invalid/two.png');
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    image.onerror();
    attachment.url = 'https://example.invalid/changed.png';
    f.plugin.refilterMessages();
    f.env.observers[0].visible(f.parent.children[0]);
    f.env.tick();
    assert.equal(continuations, 1);
    assert.equal(f.built.length, 2);
  } finally { f.env.restore(); }
});

test('in-place record edits rebuild only their row while unrelated saved rows retain their roots', () => {
  const f = loggerFixture();
  try {
    f.setFiltered(['a', 'b']);
    f.plugin.refilterMessages();
    f.env.observers[0].visible(f.parent.children[0]);
    f.env.observers[0].visible(f.parent.children[1]);
    f.env.tick();
    const firstHost = f.parent.children[0].children[0];
    const secondHost = f.parent.children[1].children[0];
    const firstGroup = firstHost.children[0];
    const secondGroup = secondHost.children[0];
    f.records.a.message.content = 'edited in place';
    f.plugin.getViewportSession().reconcileActive();
    f.env.tick();
    f.env.observers[0].visible(f.parent.children[0]);
    f.env.tick();
    assert.equal(f.parent.children[0].children[0], firstHost);
    assert.notEqual(firstHost.children[0], firstGroup);
    assert.equal(f.parent.children[1].children[0], secondHost);
    assert.equal(secondHost.children[0], secondGroup);
    assert.deepEqual(f.built, ['a', 'b', 'a']);
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    f.records.a.message.content = 'another edit while parked';
    f.plugin.refilterMessages();
    f.env.observers[0].visible(f.parent.children[0]);
    f.env.tick();
    assert.deepEqual(f.built, ['a', 'b', 'a', 'a']);
    assert.equal(f.parent.children[1].children[0], secondHost);
    assert.equal(secondHost.children[0], secondGroup);
  } finally { f.env.restore(); }
});

test('real markup root observer preserves parked text and disposes exactly on reset', () => {
  const f = loggerFixture();
  const { ReactDOM } = require('./helpers/plugin-harness');
  const oldObserver = global.MutationObserver;
  const observers = [];
  let unmounts = 0;
  global.document.body = new Element('body');
  global.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  ReactDOM.createRoot = markup => ({
    render() { markup.appendChild(new Element()); },
    unmount() { unmounts++; }
  });
  ReactDOM.flushSync = callback => callback();
  try {
    delete f.plugin.formatMarkup;
    f.plugin.tools = { parse: () => ({}) };
    f.plugin.classes.hidden = 'hidden';
    f.setFiltered(['a']);
    f.plugin.refilterMessages();
    const slot = f.parent.children[0];
    f.env.observers[0].visible(slot);
    f.env.tick();
    const host = slot.children[0];
    assert.equal(observers.length, 1);
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    observers[0].callback([{ removedNodes: [host] }]);
    assert.equal(unmounts, 0);
    f.plugin.refilterMessages();
    assert.equal(f.parent.children[0].children[0], host);
    assert.equal(unmounts, 0);
    f.plugin.getViewportSession().reset();
    assert.equal(unmounts, 1);
    assert.equal(observers[0].disconnected, true);
  } finally {
    delete ReactDOM.createRoot;
    delete ReactDOM.flushSync;
    if (oldObserver === undefined) delete global.MutationObserver; else global.MutationObserver = oldObserver;
    f.env.restore();
  }
});

test('pending native audio upgrade waits for the same parked row to resume', async () => {
  const f = loggerFixture();
  const { ReactDOM } = require('./helpers/plugin-harness');
  const attachment = { id: 'audio', filename: 'sound.mp3', url: 'https://example.invalid/sound.mp3' };
  f.records.a.message.attachments = [attachment];
  let resolvePlayer;
  let playerReady = false;
  let mounts = 0;
  let unmounts = 0;
  ReactDOM.createRoot = () => ({ render() { mounts++; }, unmount() { unmounts++; } });
  Object.assign(f.plugin, {
    _loggerNativeAudioRoots: new Map(), _loggerNativeAudioLoadGeneration: 1,
    getLoggerSavedAttachmentPresentationEntries(message) {
      return message.attachments.map(item => ({ attachment: item, sourceKind: 'attachment',
        plan: { action: 'remote', mediaType: 'audio', url: item.url } }));
    },
    createOwnedLoggerMediaContinuation() { return () => ({ action: 'ignore' }); },
    isImage() { return false; }, isVideo() { return false; },
    isAudio(value) { return typeof value === 'string' && value.includes('.mp3'); },
    resolveLoggerNativeAudioPlayer() { return playerReady ? 'Player' : null; },
    ensureLoggerNativeAudioPlayer() { return new Promise(resolve => { resolvePlayer = resolve; }); },
    createLoggerNativeAudioProps() { return {}; }
  });
  try {
    f.setFiltered(['a']);
    f.plugin.refilterMessages();
    const slot = f.parent.children[0];
    f.env.observers[0].visible(slot);
    f.env.tick();
    const host = slot.children[0];
    assert.equal(mounts, 0);
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    playerReady = true;
    resolvePlayer('Player');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(mounts, 0);
    f.plugin.refilterMessages();
    assert.equal(f.parent.children[0].children[0], host);
    assert.equal(mounts, 1);
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    assert.equal(unmounts, 0);
    f.plugin.getViewportSession().reset();
    assert.equal(unmounts, 1);
  } finally { delete ReactDOM.createRoot; f.env.restore(); }
});

test('dirty parked row remains cold until revisited viewport, even if values toggle back', () => {
  const f = loggerFixture();
  try {
    f.setFiltered(['a', 'b']);
    f.plugin.refilterMessages();
    f.env.observers[0].visible(f.parent.children[0]);
    f.env.observers[0].visible(f.parent.children[1]);
    f.env.tick();
    const unchanged = f.parent.children[1].children[0];
    const unchangedGroup = unchanged.children[0];
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    f.records.a.message.content = 'temporarily hidden';
    f.plugin.getViewportSession().invalidate('a', 'visibility-change');
    f.records.a.message.content = 'text a';
    f.plugin.refilterMessages();
    const slot = f.parent.children[0];
    f.env.tick();
    assert.equal(slot.children[0].children[0].textContent, 'Loading saved message');
    assert.deepEqual(f.built, ['a', 'b']);
    assert.equal(f.parent.children[1].children[0], unchanged);
    assert.equal(unchanged.children[0], unchangedGroup);
    f.env.observers[0].visible(slot);
    f.env.tick();
    assert.deepEqual(f.built, ['a', 'b', 'a']);
    assert.equal(unchanged.children[0], unchangedGroup);
  } finally { f.env.restore(); }
});
