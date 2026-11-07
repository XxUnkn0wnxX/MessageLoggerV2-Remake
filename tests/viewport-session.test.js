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
  setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
  addEventListener() {}
  insertAdjacentHTML() {}
}

function setup({ observer = true } = {}) {
  const old = { document: global.document, IntersectionObserver: global.IntersectionObserver,
    requestAnimationFrame: global.requestAnimationFrame, performance: global.performance };
  // Keep the batch deadline deterministic; the deadline test overrides this clock.
  global.performance = { now: () => 0 };
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
    assert.equal(slots[0].children[0].children[0].textContent, 'MLV2: Loading saved message');
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

test('visibility withdrawal preserves admitted activation and shares one loading stylesheet', () => {
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
    assert.equal(builds, 1);
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
    assert.equal(entry.placeholder.children[0].textContent, 'MLV2: Loading saved message');
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

function loggerFixture({ ids = ['a', 'b', 'c', 'd'], observer = true } = {}) {
  const env = setup({ observer });
  const records = Object.fromEntries(ids.map(id => [id, {
    message: { id, channel_id: 'channel', content: `text ${id}`, attachments: [], embeds: [] }
  }]));
  const parent = new Element();
  let filtered = ids;
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

test('Logger text and history remain viewport-gated and warm with media disabled or unavailable locally', () => {
  for (const masterEnabled of [false, true]) {
    const f = loggerFixture();
    try {
      Object.assign(f.plugin.settings, { cacheAllImages: masterEnabled, onlyRenderCachedAttachments: true });
      delete f.plugin.getCacheOnlyMessage;
      delete f.plugin.getLoggerSavedAttachmentPresentationEntries;
      f.plugin.imageCacheServerSimulator = { exists: () => false };
      f.plugin.Tooltip = function Tooltip() {};
      f.records.a.message.attachments = [{ id: 'image', filename: 'photo.png', url: 'https://cdn.example/photo.png' }];
      f.records.a.edit_history = [{ content: 'earlier text', time: 'saved time' }];
      const before = structuredClone(f.records.a);
      f.plugin.refilterMessages();
      const slot = f.parent.children[0];
      assert.deepEqual(f.built, [], 'media gates must not bypass viewport admission');
      f.env.observers[0].visible(slot); f.env.tick();
      assert.deepEqual(f.built, ['a']);
      const host = slot.children[0];
      const nodes = [];
      const visit = node => { nodes.push(node); node.children.forEach(visit); };
      visit(host);
      assert.ok(nodes.some(node => node.textContent === 'earlier text'));
      assert.ok(nodes.some(node => node.textContent === 'text a'));
      assert.equal(nodes.some(node => String(node.textContent || '').includes('photo.png')), masterEnabled,
        'only the enabled local-cache miss should render a filename placeholder');
      assert.equal(nodes.some(node => ['img', 'video', 'audio'].includes(node.tagName)), false);
      assert.deepEqual(f.records.a, before, 'presentation must preserve the saved attachment and history');
      f.env.observers[0].hidden(slot); f.env.observers[0].visible(slot); f.env.tick();
      assert.equal(slot.children[0], host);
      assert.deepEqual(f.built, ['a'], 'revisit must retain the gated text/history row');
    } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
  }
});

test('Media Off admits only visible saved rows, skips media-only batches, and preserves On fallbacks', () => {
  const ids = ['media-only', 'removal-only', 'current-text', 'history-text', 'component-text'];
  const f = loggerFixture({ ids });
  const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(freeze);
    return value;
  };
  const removedMarker = '\n`Attachment Deleted: `https://cdn.example/removed.png\n';
  try {
    f.records['media-only'].message.attachments = [
      { id: 'one', filename: 'one.png', url: 'https://cdn.example/one.png' },
      { id: 'two', filename: 'two.png', url: 'https://cdn.example/two.png' }
    ];
    f.records['media-only'].message.content = '';
    f.records['removal-only'].message.content = '';
    f.records['removal-only'].edit_history = [{ content: removedMarker, time: 'history' }];
    f.records['current-text'].message.content = 'current visible text';
    f.records['current-text'].message.attachments = [{ id: 'three', filename: 'three.png' }];
    f.records['history-text'].message.content = '';
    f.records['history-text'].edit_history = [{ content: 'genuine historical text', time: 'history' }];
    f.records['component-text'].message.content = '';
    f.records['component-text'].message.components = [{ type: 10, content: 'component summary text' }];
    const before = structuredClone(f.records);
    freeze(f.records);
    f.plugin.settings.cacheAllImages = false;
    f.plugin.Tooltip = function Tooltip() {};
    f.plugin.getEditedTimestampClasses = () => '';
    f.plugin.translatedEdited = 'Edited';
    f.plugin.style.edited = 'edited';
    f.setFiltered(ids);
    f.plugin.refilterMessages();

    assert.deepEqual(f.plugin.menu.messages, ids, 'category/search IDs retain their canonical order');
    const view = f.plugin._loggerViewportView;
    assert.deepEqual([...view.leases.keys()], [], 'the first bounded batch skips both media-only records without slots');
    assert.equal(f.parent.children.length, 1, 'only the sentinel remains after a fully skipped batch');
    f.env.observers.at(-1).visible(f.parent.children[0]);
    f.env.tick();
    const admitted = [...view.leases.keys()].map(entry => entry.messageId);
    assert.deepEqual(admitted, ['current-text', 'history-text'], 'the next batch admits genuine current and historical text');
    const firstSlots = f.parent.children.slice(0, 2);
    firstSlots.forEach(slot => f.env.observers[0].visible(slot));
    f.env.tick();
    assert.deepEqual(new Set(f.built), new Set(['current-text', 'history-text']));

    const sentinel = f.parent.children[2];
    f.env.observers.at(-1).visible(sentinel);
    f.env.tick();
    const allAdmitted = [...view.leases.keys()].map(entry => entry.messageId);
    assert.deepEqual(allAdmitted, ['current-text', 'history-text', 'component-text'],
      'the next bounded batch advances past skipped records');
    const componentEntry = [...view.leases.keys()].find(entry => entry.messageId === 'component-text');
    const componentSlot = componentEntry.slot;
    f.env.observers[0].visible(componentSlot);
    f.env.tick();
    assert.ok(f.built.includes('component-text'));
    assert.deepEqual(f.records, before, 'admission leaves frozen canonical records unchanged');
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }

  const empty = loggerFixture({ ids: ['media-only', 'removal-only', 'component-media'], observer: false });
  try {
    empty.records['media-only'].message.attachments = [{ id: 'one', filename: 'one.png' }, { id: 'two', filename: 'two.png' }];
    empty.records['media-only'].message.content = '';
    empty.records['removal-only'].message.content = '';
    empty.records['removal-only'].edit_history = [{ content: removedMarker, time: 'history' }];
    empty.records['component-media'].message.content = '';
    empty.records['component-media'].message.components = [{ type: 11, media: { url: 'https://cdn.example/media.png' } }];
    empty.plugin.settings.cacheAllImages = false;
    empty.plugin.settings.renderCap = 0;
    empty.setFiltered(['media-only', 'removal-only', 'component-media']);
    empty.plugin.refilterMessages();
    assert.equal(empty.parent.children.length, 1);
    assert.equal(empty.parent.children[0].innerText, 'No messages to display with media rendering off.');
  } finally { empty.env.restore(); }

  const capZeroVisible = loggerFixture({ ids: ['text'], observer: false });
  try {
    capZeroVisible.plugin.settings.cacheAllImages = false;
    capZeroVisible.plugin.settings.renderCap = 0;
    capZeroVisible.records.text.message.content = 'visible text';
    capZeroVisible.setFiltered(['text']);
    capZeroVisible.plugin.refilterMessages();
    assert.equal(capZeroVisible.parent.children.length, 1);
    assert.notEqual(capZeroVisible.parent.children[0].innerText, 'No messages to display with media rendering off.');
  } finally { capZeroVisible.env.restore(); }

  const asyncEmpty = loggerFixture({ ids: ['media-one', 'media-two', 'removal-only'] });
  try {
    asyncEmpty.records['media-one'].message.attachments = [{ id: 'one', filename: 'one.png' }];
    asyncEmpty.records['media-two'].message.attachments = [{ id: 'two', filename: 'two.png' }];
    asyncEmpty.records['media-one'].message.content = '';
    asyncEmpty.records['media-two'].message.content = '';
    asyncEmpty.records['removal-only'].message.content = '';
    asyncEmpty.records['removal-only'].edit_history = [{ content: removedMarker, time: 'history' }];
    asyncEmpty.plugin.settings.cacheAllImages = false;
    asyncEmpty.setFiltered(['media-one', 'media-two', 'removal-only']);
    asyncEmpty.plugin.refilterMessages();
    assert.equal(asyncEmpty.parent.children.length, 1, 'the first bounded batch creates only its sentinel');
    asyncEmpty.env.observers.at(-1).visible(asyncEmpty.parent.children[0]);
    asyncEmpty.env.tick();
    assert.equal(asyncEmpty.parent.children.length, 1);
    assert.equal(asyncEmpty.parent.children[0].innerText, 'No messages to display with media rendering off.');
  } finally { asyncEmpty.env.restore(); }

  const on = loggerFixture({ ids: ['media-only'], observer: false });
  try {
    on.records['media-only'].message.attachments = [{ id: 'one', filename: 'one.png', url: 'https://cdn.example/one.png' }];
    on.records['media-only'].message.content = '';
    on.plugin.settings.cacheAllImages = false;
    on.plugin.getLoggerSavedAttachmentPresentationEntries = message => on.plugin.settings.cacheAllImages
      ? message.attachments.map(attachment => ({
        attachment, removed: false, plan: { action: 'placeholder', label: attachment.filename }
      }))
      : [];
    on.setFiltered(['media-only']);
    on.plugin.refilterMessages();
    assert.equal(on.parent.children.length, 1);
    assert.equal(on.parent.children[0].innerText, 'No messages to display with media rendering off.');
    on.plugin.settings.cacheAllImages = true;
    on.plugin.refreshLoggerMenu();
    assert.equal(on.parent.children.length, 1, 'Media On restores the row after a full refilter');
    assert.ok(on.parent.children[0].children[0].children.some(node => /Attachment not cached: one\.png/.test(node.textContent || '')));
  } finally { on.env.restore(); }
});

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
    assert.deepEqual(f.built, ['b', 'a']);
    f.env.observers[0].visible(slots[0]);
    f.env.tick();
    assert.deepEqual(f.built, ['b', 'a']);
    const savedHost = slots[1].children[0];
    f.env.observers.at(-1).visible(f.parent.children[2]);
    f.env.tick();
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
    f.plugin.refilterMessages();
    const mainBar = f.parent.children[2];
    f.plugin.menu.shownMessages = 4;
    const view = { surfaceKey: 'thread:test', independent: true, shownMessages: -1, leases: new Map() };
    const root = new Element();
    f.plugin.populateParent(root, ['a', 'b', 'c', 'd'], view);
    assert.equal(view.shownMessages, 2);
    assert.equal(f.plugin.menu.shownMessages, 4);
    assert.equal(root.children.length, 3);
    f.env.observers.at(-1).visible(root.children[2]);
    f.env.tick();
    assert.equal(view.shownMessages, 4);
    assert.equal(f.plugin.menu.shownMessages, 4);
    assert.equal(f.parent.children[2], mainBar, 'another view does not admit the Logger batch');
    f.plugin.parkLoggerViewportView(view);
    assert.equal(view.leases.size, 0);
  } finally { f.env.restore(); }
});

test('Logger row host isolates native group spacing and repairs parked rows on resume', () => {
  const f = loggerFixture({ ids: ['a'] });
  try {
    const repaired = [];
    f.plugin.applyLoggerMessageGroupClasses = root => repaired.push(root);
    const view = { surfaceKey: 'logger-spacing', leases: new Map() };
    const parent = new Element();
    f.plugin.populateParent(parent, ['a'], view);
    const slot = parent.children[0];
    f.env.observers.at(-1).visible(slot);
    f.env.tick();
    const entry = [...view.leases.keys()][0];
    const host = entry.host;
    const group = host.children[0];
    assert.equal(host.style.display, 'flow-root');

    repaired.length = 0;
    f.plugin.parkLoggerViewportView(view);
    const resumedParent = new Element();
    f.plugin.populateParent(resumedParent, ['a'], view);
    assert.ok(repaired.includes(host), 'reattaching a retained Logger row reapplies native wrapper classes');
    assert.equal(host.children[0], group, 'class repair preserves the rendered row');
    assert.deepEqual(f.built, ['a'], 'returning to the row does not rebuild its media');
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
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

test('owned real markup keeps no body observer and disposes exactly on reset', () => {
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
    assert.equal(observers.length, 0);
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    assert.equal(unmounts, 0);
    f.plugin.refilterMessages();
    assert.equal(f.parent.children[0].children[0], host);
    assert.equal(unmounts, 0);
    f.plugin.getViewportSession().reset();
    assert.equal(unmounts, 1);
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
    f.records.a.delete_data = { hidden: false };
    f.setFiltered(['a', 'b']);
    f.plugin.refilterMessages();
    f.env.observers[0].visible(f.parent.children[0]);
    f.env.observers[0].visible(f.parent.children[1]);
    f.env.tick();
    const unchanged = f.parent.children[1].children[0];
    const unchangedGroup = unchanged.children[0];
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    assert.equal(f.plugin.setSavedRecordHiddenState(f.records.a, true), true);
    assert.equal(f.records.a.delete_data.hidden, true);
    assert.equal(f.plugin.setSavedRecordHiddenState(f.records.a, false), true);
    assert.equal(f.records.a.delete_data.hidden, false);
    f.plugin.refilterMessages();
    const slot = f.parent.children[0];
    f.env.tick();
    assert.equal(slot.children[0].children[0].textContent, 'MLV2: Loading saved message');
    assert.deepEqual(f.built, ['a', 'b']);
    assert.equal(f.parent.children[1].children[0], unchanged);
    assert.equal(unchanged.children[0], unchangedGroup);
    f.env.observers[0].visible(slot);
    f.env.tick();
    assert.deepEqual(f.built, ['a', 'b', 'a']);
    assert.equal(unchanged.children[0], unchangedGroup);
  } finally { f.env.restore(); }
});


test('automatic batch bar fills progressively without hydrating offscreen rows', () => {
  const f = loggerFixture({ ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  try {
    f.plugin.refilterMessages();
    let bar = f.parent.children[2];
    const admission = f.env.observers[1];
    assert.equal(bar.textContent, 'MLV2: Oi, speedy! One batch at a time ...');
    assert.equal(bar.style.color, 'var(--text-warning, var(--status-warning))');
    assert.equal(bar.children.length, 0);
    assert.equal(bar.attributes.role, 'status');
    assert.equal(bar.click, undefined);
    assert.deepEqual(f.built, []);
    admission.visible(bar);
    assert.equal(bar.textContent, 'MLV2: Oi, speedy! One batch at a time ...');
    assert.equal(f.parent.children.length, 3, 'admission waits for a frame');
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 4);
    const next = f.parent.children[4];
    assert.notEqual(next, bar);
    admission.visible(bar);
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 4, 'stale sentinel cannot expand');
    admission.visible(next);
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 6);
    bar = f.parent.children[6];
    admission.visible(bar);
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 7);
    assert.equal(f.parent.children.length, 7);
    assert.deepEqual(f.built, [], 'batch admission does not hydrate cold rows');
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
});

test('queued automatic admission honors a live change to an unlimited render cap', () => {
  const f = loggerFixture({ ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  try {
    f.plugin.refilterMessages();
    const admission = f.env.observers[1];
    admission.visible(f.parent.children[2]);
    f.plugin.settings.renderCap = 0;
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 7);
    assert.equal(f.parent.children.length, 7);
    assert.equal(admission.targets.size, 0);
    assert.deepEqual(f.built, [], 'unlimited admission still defers heavy row rendering');
    f.env.tick();
    assert.equal(f.env.frames.length, 0, 'the completed view cannot schedule an empty batch loop');
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
});

test('automatic batch callbacks are cancelled by park, refilter and session reset', () => {
  for (const action of ['park', 'refilter', 'reset']) {
    const f = loggerFixture();
    try {
      f.plugin.refilterMessages();
      const bar = f.parent.children[2], admission = f.env.observers[1];
      admission.visible(bar);
      if (action === 'park') f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
      if (action === 'refilter') f.plugin.refilterMessages();
      if (action === 'reset') f.plugin._viewportSession.reset();
      f.env.tick();
      assert.equal(f.plugin.menu.shownMessages, 2, action);
      admission.visible(bar);
      f.env.tick();
      assert.equal(f.plugin.menu.shownMessages, 2, action);
      assert.equal(admission.targets.size, 0, action);
    } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
  }
});

test('legacy scroll fallback fills only when the status bar reaches the viewport', () => {
  const f = loggerFixture({ ids: ['a', 'b', 'c', 'd', 'e'], observer: false });
  const old = { addEventListener: global.addEventListener, removeEventListener: global.removeEventListener,
    innerHeight: global.innerHeight, getComputedStyle: global.getComputedStyle };
  const handlers = new Map();
  let top = 1200, height = 20, clipped = false;
  global.innerHeight = 500;
  global.getComputedStyle = node => ({ overflowY: node === f.parent && clipped ? 'hidden' : 'visible' });
  global.addEventListener = (type, callback) => handlers.set(type, callback);
  global.removeEventListener = (type, callback) => { if (handlers.get(type) === callback) handlers.delete(type); };
  global.document.createElement = tag => { const node = new Element(tag); node.getBoundingClientRect = () => ({ top, bottom: top + height, height }); return node; };
  f.parent.getBoundingClientRect = () => ({ top: 700, bottom: 800 });
  try {
    f.plugin.refilterMessages();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 2);
    assert.equal(f.built.length, 2);
    top = 450;
    height = 0;
    handlers.get('scroll')();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 2, 'a hidden zero-area bar stays cold');
    height = 20;
    clipped = true;
    handlers.get('scroll')();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 2, 'an empty ancestor/window intersection stays cold');
    clipped = false;
    handlers.get('scroll')();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 4);
    f.env.tick();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 5);
    assert.equal(handlers.size, 0);
  } finally {
    f.plugin.parkLoggerViewportView(f.plugin._loggerViewportView);
    f.env.restore();
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; }
  }
});


test('legacy automatic admission is cancelled on session reset', () => {
  const f = loggerFixture({ observer: false });
  const old = { addEventListener: global.addEventListener, removeEventListener: global.removeEventListener,
    innerHeight: global.innerHeight, getComputedStyle: global.getComputedStyle };
  const handlers = new Map();
  global.innerHeight = 500;
  global.getComputedStyle = () => ({ overflowY: 'visible' });
  global.addEventListener = (type, callback) => handlers.set(type, callback);
  global.removeEventListener = (type, callback) => { if (handlers.get(type) === callback) handlers.delete(type); };
  global.document.createElement = tag => { const node = new Element(tag); node.getBoundingClientRect = () => ({ top: 450, bottom: 470, height: 20 }); return node; };
  try {
    f.plugin.refilterMessages();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 2);
    f.plugin._viewportSession.reset();
    f.env.tick();
    assert.equal(f.plugin.menu.shownMessages, 2);
    assert.equal(handlers.size, 0);
  } finally {
    f.env.restore();
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; }
  }
});

test('zero render cap registers all rows with no automatic batch bar', () => {
  const f = loggerFixture();
  try {
    f.plugin.settings.renderCap = 0;
    f.plugin.refilterMessages();
    assert.equal(f.parent.children.length, 4);
    assert.equal(f.env.observers.length, 1);
    assert.deepEqual(f.built, []);
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
});


test('bulk park measures every valid host before any pause or detach and preserves stale leases', () => {
  const f = loggerFixture();
  try {
    f.plugin.refilterMessages();
    const view = f.plugin._loggerViewportView;
    const entries = [...view.leases.keys()];
    const log = [], stale = {}, previous = entries[1].leaseToken;
    entries[0].measuredHeight = 70;
    entries[1].measuredHeight = 80;
    entries[0].host.getBoundingClientRect = () => {
      log.push('measure a');
      entries[1].leaseToken = stale;
      view.leases.set(entries[1], stale);
      return { height: 0 };
    };
    entries[1].host.getBoundingClientRect = () => { log.push('measure b'); return { height: undefined }; };
    entries[0].host.querySelectorAll = () => [{ pause() { log.push('pause a'); } }];
    entries[1].host.querySelectorAll = () => [{ pause() { log.push('pause b'); } }];
    const originalRemove = entries[0].host.remove.bind(entries[0].host);
    entries[0].host.remove = () => { log.push('remove a'); originalRemove(); };
    f.plugin.parkLoggerViewportView(view);
    assert.deepEqual(log, ['measure a', 'pause a', 'remove a']);
    assert.equal(entries[0].measuredHeight, 70);
    assert.equal(entries[1].measuredHeight, 80);
    assert.equal(view.leases.get(entries[1]), stale);
    assert.equal(entries[1].leaseToken, stale);
    entries[1].leaseToken = previous;
    view.leases.set(entries[1], previous);
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
});

test('bulk park reads all heights before pausing or removing and retains roots', () => {
  const f = loggerFixture();
  try {
    f.plugin.refilterMessages();
    const view = f.plugin._loggerViewportView, session = f.plugin.getViewportSession();
    const entries = [...view.leases.keys()], operations = [];
    let disposed = 0;
    entries.forEach((entry, index) => {
      entry.measuredHeight = 50 + index;
      entry.host.getBoundingClientRect = () => { operations.push('read' + index); return index ? {} : { height: 0 }; };
      entry.host.querySelectorAll = () => [{ pause() { operations.push('pause' + index); } }];
      const remove = entry.host.remove.bind(entry.host);
      entry.host.remove = () => { operations.push('remove' + index); remove(); };
      session.own(entry, new Element(), { unmount() { disposed++; } });
    });
    f.plugin.parkLoggerViewportView(view);
    assert.deepEqual(operations, ['read0', 'read1', 'pause0', 'remove0', 'pause1', 'remove1']);
    assert.deepEqual(entries.map(entry => entry.measuredHeight), [50, 51]);
    assert.equal(disposed, 0);
    assert.equal(view.leases.size, 0);
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
});

test('unowned and failed-owned markup retain removal observation and cleanup', () => {
  const f = loggerFixture();
  const { ReactDOM } = require('./helpers/plugin-harness');
  const oldObserver = global.MutationObserver, observers = [];
  let unmounts = 0;
  global.document.body = new Element('body');
  global.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  ReactDOM.createRoot = markup => ({ render() { markup.appendChild(new Element()); }, unmount() { unmounts++; } });
  ReactDOM.flushSync = callback => callback();
  try {
    delete f.plugin.formatMarkup;
    f.plugin.tools = { parse: () => ({}) };
    f.plugin.classes.hidden = 'hidden';
    for (const failed of [false, true]) {
      if (failed) { f.plugin._viewportBuildingEntry = {}; f.plugin.getViewportSession = () => ({ own: () => false }); }
      const child = f.plugin.formatMarkup('test', 'channel');
      const observer = observers.at(-1);
      assert.ok(observer);
      observer.callback([{ removedNodes: [child] }]);
      assert.equal(observer.disconnected, true);
    }
    assert.equal(observers.length, 2);
    assert.equal(unmounts, 2);
  } finally {
    delete ReactDOM.createRoot; delete ReactDOM.flushSync;
    if (oldObserver === undefined) delete global.MutationObserver; else global.MutationObserver = oldObserver;
    f.env.restore();
  }
});

test('rapid tab changes coalesce and reset expanded admissions only after old leases park', () => {
  const ids = Array.from({ length: 120 }, (_, i) => String(i));
  const f = loggerFixture({ ids });
  const oldSet = global.setTimeout, oldClear = global.clearTimeout, timers = [];
  global.setTimeout = callback => { const timer = { callback }; timers.push(timer); return timer; };
  global.clearTimeout = timer => { timer.cancelled = true; };
  try {
    f.plugin.menu.selectedTab = 'deleted';
    f.plugin.menu.shownMessages = 120;
    f.plugin.refilterMessages();
    assert.equal(f.plugin._loggerViewportView.leases.size, 120);
    const oldSlot = f.parent.children[0];
    f.env.observers[0].visible(oldSlot);
    f.env.tick();
    const savedHost = oldSlot.children[0], savedRoot = savedHost.children[0];
    f.env.observers[0].visible(f.parent.children[1]);
    const tabs = { deleted: new Element(), edited: new Element(), purged: new Element() };
    const bar = { querySelector(selector) { return selector.startsWith('#') ? tabs[selector.slice(1)] : tabs.deleted; } };
    f.plugin.style.menuTabBar = 'tabs';
    global.document.getElementById = id => id === 'tabs' ? bar : id === 'messages' ? f.parent : null;
    f.plugin.isLoggerTabAvailable = () => true;
    let builtWithTab;
    f.plugin.getFilteredMessages = () => { builtWithTab = f.plugin.menu.selectedTab; return ids.slice(0, 10); };
    assert.equal(f.plugin.openTab('edited'), true);
    assert.equal(f.plugin.openTab('purged'), true);
    assert.equal(f.plugin.menu.selectedTab, 'deleted');
    assert.equal(f.plugin._loggerViewportView.leases.size, 120);
    timers[0].callback();
    assert.equal(f.plugin.menu.selectedTab, 'deleted');
    timers[1].callback();
    assert.equal(f.plugin.menu.selectedTab, 'purged');
    assert.equal(builtWithTab, 'purged');
    assert.equal(f.plugin.menu.shownMessages, 2);
    assert.equal(f.plugin._loggerViewportView.leases.size, 2);
    f.env.tick();
    assert.deepEqual(f.built, ['0'], 'queued old-tab row never builds under the new tab');
    f.plugin.openTab('deleted');
    timers.at(-1).callback();
    assert.equal(f.parent.children[0].children[0], savedHost);
    assert.equal(savedHost.children[0], savedRoot);
    assert.deepEqual(f.built, ['0']);
    f.plugin.openTab('edited');
    const stale = timers.at(-1);
    f.plugin.resetLoggerMenuRenderState();
    f.plugin.menu.open = true;
    stale.callback();
    assert.equal(f.plugin.menu.selectedTab, 'deleted', 'old transition cannot affect reopened window');
    f.plugin.openTab('edited');
    const afterStop = timers.at(-1);
    f.plugin.stop();
    afterStop.callback();
    assert.equal(f.plugin.menu.selectedTab, 'deleted', 'stopped plugin rejects the old transition');
  } finally { global.setTimeout = oldSet; global.clearTimeout = oldClear; f.plugin._viewportSession?.reset(); f.env.restore(); }
});


test('bulk park revalidates leases after the measurement pass', () => {
  const f = loggerFixture();
  try {
    f.plugin.refilterMessages();
    const view = f.plugin._loggerViewportView, entries = [...view.leases.keys()];
    const originalToken = entries[0].leaseToken, replacement = {}, events = [];
    entries[0].host.getBoundingClientRect = () => { events.push('read0'); return { height: 40 }; };
    entries[1].host.getBoundingClientRect = () => {
      events.push('read1');
      entries[0].leaseToken = replacement;
      view.leases.set(entries[0], replacement);
      return { height: 50 };
    };
    entries.forEach((entry, i) => {
      entry.host.querySelectorAll = () => [{ pause() { events.push('pause' + i); } }];
      const remove = entry.host.remove.bind(entry.host);
      entry.host.remove = () => { events.push('remove' + i); remove(); };
    });
    f.plugin.parkLoggerViewportView(view);
    assert.deepEqual(events, ['read0', 'read1', 'pause1', 'remove1']);
    assert.equal(view.leases.get(entries[0]), replacement);
    assert.equal(entries[0].leaseToken, replacement);
    entries[0].leaseToken = originalToken;
  } finally { f.plugin._viewportSession?.reset(); f.env.restore(); }
});

test('many retained formatted roots create no per-root body observers', () => {
  const f = loggerFixture();
  const { ReactDOM } = require('./helpers/plugin-harness');
  const oldObserver = global.MutationObserver;
  let observers = 0, unmounts = 0;
  global.document.body = new Element('body');
  global.MutationObserver = class { constructor() { observers++; } observe() {} disconnect() {} };
  ReactDOM.createRoot = markup => ({ render() { markup.appendChild(new Element()); }, unmount() { unmounts++; } });
  ReactDOM.flushSync = callback => callback();
  try {
    delete f.plugin.formatMarkup;
    f.plugin.tools = { parse: () => ({}) };
    f.plugin.classes.hidden = 'hidden';
    const session = f.plugin.getViewportSession();
    for (let i = 0; i < 120; i++) {
      f.plugin._viewportBuildingEntry = session.getEntry({ surfaceKey: 'logger', channelId: 'c',
        messageId: String(i), revision: 1, build() {} });
      assert.ok(f.plugin.formatMarkup('text', 'c'));
    }
    assert.equal(observers, 0);
    session.reset();
    assert.equal(unmounts, 120);
  } finally {
    delete ReactDOM.createRoot; delete ReactDOM.flushSync;
    if (oldObserver === undefined) delete global.MutationObserver; else global.MutationObserver = oldObserver;
    f.env.restore();
  }
});

test('alternating tabs cancel queued work, reset the real scroll root and retain warm rows', () => {
  for (const rootIsMessages of [true, false]) {
    const f = loggerFixture({ ids: ['d1', 'd2', 'e1', 'e2'] });
    const old = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, getComputedStyle: global.getComputedStyle };
    const timers = [];
    global.setTimeout = callback => { const timer = { callback }; timers.push(timer); return timer; };
    global.clearTimeout = timer => { timer.cancelled = true; };
    const scrollRoot = rootIsMessages ? f.parent : new Element();
    scrollRoot.scrollHeight = 5000; scrollRoot.clientHeight = 500; scrollRoot.scrollTop = 900;
    const scrollCalls = [];
    scrollRoot.scrollTo = options => { scrollCalls.push(options); scrollRoot.scrollTop = options.top; };
    if (!rootIsMessages) scrollRoot.appendChild(f.parent);
    global.getComputedStyle = node => ({ overflowY: node === scrollRoot ? 'auto' : 'visible' });
    try {
      f.plugin.menu.selectedTab = 'deleted';
      f.plugin.menu.filter = 'channel:test';
      f.plugin.getFilteredMessages = () => f.plugin.menu.selectedTab === 'deleted' ? ['d1', 'd2'] : ['e1', 'e2'];
      f.plugin.refilterMessages();
      const deletedSlots = f.parent.children.slice();
      f.env.observers[0].visible(deletedSlots[0]);
      f.env.tick();
      const deletedHost = deletedSlots[0].children[0], deletedRoot = deletedHost.children[0];
      f.env.observers[0].visible(deletedSlots[1]);
      const tabs = { deleted: new Element(), edited: new Element() };
      const bar = { querySelector(selector) { return selector.startsWith('#') ? tabs[selector.slice(1)] : tabs.deleted; } };
      f.plugin.style.menuTabBar = 'tabs';
      global.document.getElementById = id => id === 'tabs' ? bar : id === 'messages' ? f.parent : null;
      const debounce = { callback() { throw new Error('stale filter callback'); } };
      f.plugin.menu.filterSetTimeout = debounce;
      f.plugin.isLoggerTabAvailable = () => true;
      f.plugin.openTab('edited');
      timers.at(-1).callback();
      assert.equal(debounce.cancelled, true);
      assert.equal(f.plugin.menu.filterSetTimeout, null);
      assert.equal(f.plugin.menu.filter, 'channel:test');
      assert.deepEqual(scrollCalls.at(-1), { top: 0, behavior: 'instant' });
      assert.equal(scrollRoot.scrollTop, 0);
      const editedSlots = f.parent.children.slice();
      f.env.observers[0].visible(editedSlots[0]);
      f.env.tick();
      assert.deepEqual(f.built, ['d1', 'e1'], 'new visible row runs and old queued work is cancelled');
      const editedHost = editedSlots[0].children[0];
      f.env.observers[0].visible(editedSlots[1]);
      scrollRoot.scrollTop = 800;
      f.plugin.openTab('deleted');
      timers.at(-1).callback();
      assert.equal(scrollRoot.scrollTop, 0);
      assert.equal(f.parent.children[0].children[0], deletedHost);
      assert.equal(deletedHost.children[0], deletedRoot);
      f.env.tick();
      assert.deepEqual(f.built, ['d1', 'e1']);
      scrollRoot.scrollTop = 700;
      f.plugin.openTab('edited');
      timers.at(-1).callback();
      assert.equal(scrollRoot.scrollTop, 0);
      assert.equal(f.parent.children[0].children[0], editedHost);
      f.env.tick();
      assert.deepEqual(f.built, ['d1', 'e1']);
    } finally {
      f.plugin._viewportSession?.reset(); f.env.restore();
      for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; }
    }
  }
});

test('clicking the active tab cancels a pending switch and jumps to top without rebuilding', () => {
  const f = loggerFixture();
  const old = { setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, getComputedStyle: global.getComputedStyle };
  const timers = [];
  global.setTimeout = callback => { const timer = { callback }; timers.push(timer); return timer; };
  global.clearTimeout = timer => { timer.cancelled = true; };
  f.parent.scrollHeight = 4000; f.parent.clientHeight = 500; f.parent.scrollTop = 1000;
  global.getComputedStyle = node => ({ overflowY: node === f.parent ? 'auto' : 'visible' });
  try {
    f.plugin.menu.selectedTab = 'deleted';
    f.plugin.menu.shownMessages = 4;
    f.plugin.refilterMessages();
    f.env.observers[0].visible(f.parent.children[0]); f.env.tick();
    const slots = f.parent.children.slice(), host = slots[0].children[0];
    const tabs = { deleted: new Element(), edited: new Element() };
    const bar = { querySelector(selector) { return selector.startsWith('#') ? tabs[selector.slice(1)] : tabs.deleted; } };
    f.plugin.style.menuTabBar = 'tabs';
    global.document.getElementById = id => id === 'tabs' ? bar : id === 'messages' ? f.parent : null;
    f.plugin.isLoggerTabAvailable = () => true;
    f.plugin.openTab('edited');
    const stale = timers.at(-1);
    f.plugin.openTab('deleted');
    assert.equal(f.parent.scrollTop, 0);
    assert.equal(stale.cancelled, true);
    stale.callback();
    assert.equal(f.plugin.menu.selectedTab, 'deleted');
    assert.equal(f.plugin.menu.shownMessages, 4);
    assert.deepEqual(f.parent.children, slots);
    assert.equal(f.parent.children[0].children[0], host);
    assert.deepEqual(f.built, ['a']);
  } finally {
    f.plugin._viewportSession?.reset(); f.env.restore();
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; }
  }
});
