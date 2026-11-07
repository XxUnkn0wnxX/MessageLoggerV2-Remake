const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./helpers/plugin-harness');

class Node {
  constructor() { this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.isConnected = true; this.scrollTop = 430; this.classList = { add() {}, remove() {}, contains() { return false; } }; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { height: 80 }; }
  get parentElement() { return this.parentNode; }
  get firstChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  getElementsByClassName() { return []; }
  addEventListener() {}
}
function setup({ viewport = true } = {}) {
  const old = { document: global.document, IntersectionObserver: global.IntersectionObserver,
    requestAnimationFrame: global.requestAnimationFrame, performance: global.performance };
  // Keep the batch deadline deterministic; the deadline test overrides this clock.
  global.performance = { now: () => 0 };
  const frames = [], observers = [], root = new Node();
  global.document = { head: new Node(), createElement: () => new Node(), getElementById: id => id === 'messages' ? root : null };
  global.requestAnimationFrame = callback => frames.push(callback);
  if (viewport) global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); }
    show(node) { this.callback([{ target: node, isIntersecting: true }]); }
  };
  else delete global.IntersectionObserver;
  const plugin = createPlugin({ settings: { renderCap: 2, cacheAllImages: true },
    menu: { open: true, shownMessages: 4 }, style: { menuMessages: 'messages' }, multiClasses: {},
    _messageUpdateRegistry: new Map(), _forumThreadLogRefreshers: new Map() });
  let menuRefreshes = 0;
  plugin.scheduleLoggerMenuRefresh = () => { menuRefreshes++; };
  return { plugin, root, observers, get menuRefreshes() { return menuRefreshes; },
    tick() { frames.splice(0).forEach(callback => callback()); },
    restore() { plugin._viewportSession?.reset(); for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; } }
  };
}
function retainedView(h, parent = h.root, surfaceKey = 'logger') {
  const view = { surfaceKey, leases: new Map() };
  h.plugin.populateParent(parent, [], view);
  parent.replaceChildren();
  return view;
}
function attach(h, view, parent, id, builds) {
  const session = h.plugin.getViewportSession();
  const entry = session.getEntry({ surfaceKey: view.surfaceKey, channelId: 'channel', messageId: id,
    revision: 1, build(entry, host) { builds.push(id); host.appendChild(new Node()); } });
  const slot = new Node(), token = {};
  parent.appendChild(slot);
  view.leases.set(entry, token);
  session.attach(entry, slot, token);
  h.observers[0].show(slot);
  return { entry, slot };
}

test('saved-media failure reconciles only retained entries and keeps Logger scroll and other rows', () => {
  const h = setup();
  try {
    const view = retainedView(h), builds = [];
    h.plugin._loggerViewportView = view;
    const first = attach(h, view, h.root, 'a', builds);
    const second = attach(h, view, h.root, 'b', builds);
    const threadRoot = new Node(), thread = retainedView(h, threadRoot, 'thread:channel:0');
    const threadEntry = attach(h, thread, threadRoot, 'a', builds);
    let threadRefreshes = 0, callbacks = 0;
    const refresh = () => { threadRefreshes++; };
    refresh.__ml2RetainedMediaView = () => h.plugin.isRetainedLoggerMediaView(thread, threadRoot);
    h.plugin._forumThreadLogRefreshers.set('channel', refresh);
    h.plugin._messageUpdateRegistry.set('a', new Set([() => { callbacks++; }]));
    h.tick();
    h.plugin.menu.shownMessages = 4;
    const firstSlot = first.slot, secondSlot = second.slot, secondChild = second.entry.host.children[0];
    const threadSlot = threadEntry.slot;
    h.plugin._refreshSavedAttachmentMediaSurfaces({ messageId: 'a', channelId: 'channel' });
    assert.equal(h.menuRefreshes, 0);
    assert.equal(threadRefreshes, 0);
    assert.equal(callbacks, 1);
    assert.equal(h.root.scrollTop, 430);
    assert.equal(h.plugin.menu.shownMessages, 4);
    h.tick();
    assert.equal(h.root.children[0], firstSlot);
    assert.equal(h.root.children[1], secondSlot);
    assert.equal(second.entry.host.children[0], secondChild);
    assert.equal(threadRoot.children[0], threadSlot);
    assert.equal(h.root.scrollTop, 430);
    assert.deepEqual(builds, ['a', 'b', 'a', 'a', 'a']);
  } finally { h.restore(); }
});

test('legacy views still refilter even when a native viewport session exists', () => {
  const h = setup({ viewport: false });
  try {
    const view = retainedView(h);
    h.plugin._loggerViewportView = view;
    const nativeSession = h.plugin.getViewportSession();
    nativeSession.getEntry({ surfaceKey: 'native', channelId: 'channel', messageId: 'a', revision: 1, build() {} });
    let threadRefreshes = 0;
    h.plugin._forumThreadLogRefreshers.set('channel', () => { threadRefreshes++; });
    h.plugin._refreshSavedAttachmentMediaSurfaces({ messageId: 'a', channelId: 'channel' });
    assert.equal(h.menuRefreshes, 1);
    assert.equal(threadRefreshes, 1);
  } finally { h.restore(); }
});

test('stale retained sessions and replaced Logger parents do not suppress legacy refresh', () => {
  const h = setup();
  try {
    const view = retainedView(h);
    h.plugin._loggerViewportView = view;
    h.plugin.getViewportSession().reset();
    h.plugin.getViewportSession();
    h.plugin._refreshSavedAttachmentMediaSurfaces({ messageId: 'a', channelId: 'channel' });
    assert.equal(h.menuRefreshes, 1);
    const fresh = retainedView(h);
    h.plugin._loggerViewportView = fresh;
    h.root.isConnected = false;
    h.plugin._refreshSavedAttachmentMediaSurfaces({ messageId: 'a', channelId: 'channel' });
    assert.equal(h.menuRefreshes, 2);
  } finally { h.restore(); }
});

test('local-cache completion preserves retained views and still refreshes a legacy thread', () => {
  const h = setup();
  try {
    const view = retainedView(h), threadRoot = new Node(), thread = retainedView(h, threadRoot, 'thread:channel:0');
    h.plugin._loggerViewportView = view;
    const message = { id: 'a', channel_id: 'channel', attachments: [{ id: 'file' }] };
    h.plugin.messageRecord = { a: { message } };
    h.plugin.settings.onlyRenderCachedAttachments = true;
    h.plugin.getSavedAttachmentPresentationPlan = () => ({ action: 'blob', url: 'blob:test' });
    let remounts = 0, dispatches = 0, retainedRefreshes = 0, legacyRefreshes = 0;
    h.plugin.remountSavedAttachmentPresentationRecords = () => { remounts++; };
    h.plugin.dispatcher = { dispatch() { dispatches++; } };
    const retained = () => { retainedRefreshes++; };
    retained.__ml2RetainedMediaView = () => h.plugin.isRetainedLoggerMediaView(thread, threadRoot);
    h.plugin._forumThreadLogRefreshers.set('channel', retained);
    h.plugin._forumThreadLogRefreshers.set('legacy-channel', () => { legacyRefreshes++; });
    h.plugin.scheduleSavedAttachmentPresentationRefresh('a', 'file');
    h.tick();
    assert.equal(remounts, 1);
    assert.equal(dispatches, 1);
    assert.equal(retainedRefreshes, 0);
    assert.equal(legacyRefreshes, 1);
    assert.equal(h.menuRefreshes, 0);
    assert.equal(h.root.scrollTop, 430);
  } finally { h.restore(); }
});


test('media fallback preserves real Load More expansion and scroll across Logger tabs', () => {
  for (const selectedTab of ['purged', 'deleted', 'edited', 'nuked', 'ghostpings']) {
    const h = setup();
    try {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      const records = Object.fromEntries(ids.map(id => [id, { message: { id, channel_id: 'channel', content: id, attachments: [], embeds: [] } }]));
      Object.assign(h.plugin, {
        messageRecord: records,
        getSavedMessage: id => records[id], getMessageAny: () => null,
        getFilteredMessages: () => ids,
        createButton(label, callback) { const button = new Node(); button.click = () => callback.call(button); return button; },
        scheduleLoggerMenuRefresh() { this.refreshLoggerMenu(); }
      });
      h.plugin.menu.selectedTab = selectedTab;
      h.plugin.menu.shownMessages = -1;
      h.plugin.refilterMessages();
      h.root.children[2].children[0].click();
      h.root.children[4].children[0].click();
      assert.equal(h.plugin.menu.shownMessages, 6);
      assert.equal(h.root.children.length, 7);
      const slots = h.root.children.slice(0, 6), more = h.root.children[6];
      h.root.scrollTop = 680;
      h.plugin._refreshSavedAttachmentMediaSurfaces({ messageId: 'a', channelId: 'channel' });
      assert.equal(h.plugin.menu.shownMessages, 6);
      assert.deepEqual(h.plugin.menu.messages, ids);
      assert.deepEqual(h.root.children.slice(0, 6), slots);
      assert.equal(h.root.children[6], more);
      assert.equal(h.root.scrollTop, 680);
    } finally { h.restore(); }
  }
});
