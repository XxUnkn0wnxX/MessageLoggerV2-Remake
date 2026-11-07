const assert = require('node:assert/strict');
const test = require('node:test');
const { createPlugin } = require('./helpers/plugin-harness');

class ViewportNode {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.isConnected = true;
    this.scrollHeight = 1000;
    this.clientHeight = 100;
    this.handlers = new Map();
    this.classList = { add() {}, remove() {}, contains() { return false; } };
  }
  get parentElement() { return this.parentNode; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) {
    node.remove();
    this.children.push(node);
    node.parentNode = this;
    return node;
  }
  replaceChildren(...nodes) {
    this.children.forEach(node => { node.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }
  replaceWith(node) {
    const parent = this.parentNode;
    if (!parent) return;
    node.remove();
    parent.children[parent.children.indexOf(this)] = node;
    node.parentNode = parent;
    this.parentNode = null;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(node => node !== this);
    this.parentNode = null;
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  compareDocumentPosition(other) {
    if (!this.parentNode || this.parentNode !== other.parentNode) return 1;
    return this.parentNode.children.indexOf(this) < this.parentNode.children.indexOf(other) ? 4 : 2;
  }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { height: 80 }; }
  addEventListener(type, listener, options) { this.handlers.set(type, { listener, options }); }
  removeEventListener(type, listener) {
    if (this.handlers.get(type)?.listener === listener) this.handlers.delete(type);
  }
  scroll() { this.handlers.get('scroll')?.listener({ target: this }); }
}

function setup({ debugLogging = true } = {}) {
  const old = {
    document: global.document,
    IntersectionObserver: global.IntersectionObserver,
    requestAnimationFrame: global.requestAnimationFrame,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout
  };
  const frames = [];
  const observers = [];
  const timers = [];
  const consoleEvents = [];
  const notifications = [];
  global.document = { head: new ViewportNode(), createElement: () => new ViewportNode() };
  global.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false, fired: false };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = timer => { if (timer) timer.cleared = true; };
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    batch(...pairs) { this.callback(pairs.map(([target, isIntersecting]) => ({ target, isIntersecting }))); }
  };
  const plugin = createPlugin({
    settings: { debugLogging, debugToasts: true },
    _logStyledConsoleEvent(category, message) { consoleEvents.push({ category, message }); },
    notifyUser(message, options) { notifications.push({ message, options }); }
  });
  const session = plugin.getViewportSession();
  const root = new ViewportNode();
  root.scrollable = true;
  let tokenSerial = 0;
  const attach = (entry, slot = new ViewportNode(), options = {}) => {
    if (!slot.parentNode) root.appendChild(slot);
    const token = `lease-${++tokenSerial}`;
    session.attach(entry, slot, token, {
      crossing: true,
      scrollRoot: root,
      admissionScope: 'test-scope',
      ...options
    });
    return { slot, token };
  };
  const createEntry = (id, build, revision = 1, options = {}) => {
    const entry = session.getEntry({
      surfaceKey: options.surface || 'logger',
      channelId: 'channel',
      messageId: id,
      revision: typeof revision === 'function' ? revision : () => revision,
      build
    });
    return { entry, ...attach(entry, new ViewportNode(), options) };
  };
  return {
    plugin, session, root, observers, timers, consoleEvents, notifications, createEntry, attach,
    tick() { frames.splice(0).forEach(callback => callback()); },
    drain() { for (let i = 0; i < 30 && frames.length; i++) this.tick(); },
    flushActivity() {
      const timer = timers.find(item => !item.cleared && !item.fired);
      if (!timer) return false;
      timer.fired = true;
      timer.callback();
      return true;
    },
    restore() {
      session.reset();
      for (const [key, value] of Object.entries(old)) {
        if (value === undefined) delete global[key]; else global[key] = value;
      }
    }
  };
}

test('manager reports committed sync builds after debug is enabled and consumes the current rebuild reason', () => {
  const h = setup({ debugLogging: false });
  try {
    let builds = 0;
    let revision = 1;
    const { entry, slot } = h.createEntry('safe-id', () => { builds++; }, () => revision);
    h.observers[0].batch([slot, true]);
    h.tick();
    assert.equal(builds, 1);
    assert.equal(entry.buildSerial, 1);
    assert.equal(h.timers.length, 0, 'master off does not schedule success reporting');

    h.plugin.settings.debugLogging = true;
    h.session.invalidate('safe-id', 'saved-media');
    h.tick();
    assert.equal(builds, 2);
    assert.equal(entry.dirtyReason, null, 'the cause is consumed after a successful commit');

    revision = 2;
    h.session.reconcileActive();
    h.drain();
    assert.equal(builds, 3);
    assert.equal(entry.dirtyReason, null);
    assert.equal(h.consoleEvents.length, 2, 'each nonempty scheduler batch reports once');
    assert.equal(h.consoleEvents[0].category, 'DEBUG · HYDRATE');
    assert.match(h.consoleEvents[0].message, /^Batch 1\nEntry #1 · logger · succeeded \(media update\) · current viewport · admitted: visible\/current\nQueue remaining: 0$/);
    assert.match(h.consoleEvents[1].message, /^Batch 2\nEntry #1 · logger · succeeded \(revision change\) · current viewport · admitted: visible\/current\nQueue remaining: 0$/);
    assert.deepEqual(h.notifications, [], 'debugToasts does not send successful hydration toasts');
  } finally { h.restore(); }
});

test('async pending work is labeled pending; stale fulfillment is excluded and the current rebuild reports', async () => {
  const h = setup();
  try {
    let builds = 0;
    let resolvePending;
    const { entry, slot } = h.createEntry('async-id', () => {
      builds++;
      if (builds === 1) return new Promise(resolve => { resolvePending = resolve; });
    });
    h.observers[0].batch([slot, true]);
    h.tick();
    assert.equal(entry.pendingBuild, true);
    assert.equal(h.timers.length, 0, 'an async placeholder is not successful hydration');
    assert.match(h.consoleEvents[0].message, /^Batch 1\nEntry #1 · logger · pending \(first load\) · current viewport/);

    h.session.invalidate('async-id', 'saved-media');
    const staleAdmissionEpoch = entry.admissionEpoch;
    resolvePending();
    await Promise.resolve();
    assert.equal(entry.admissionEpoch, staleAdmissionEpoch);
    assert.equal(h.timers.length, 0, 'fulfillment from an invalidated build is not counted');
    assert.match(h.consoleEvents[1].message, /^Batch 1 · Entry #1 · logger · stale\/cancelled · current viewport$/);
    assert.equal(entry.dirtyReason, 'saved-media', 'stale completion does not consume the newer cause');

    h.tick();
    assert.equal(builds, 2);
    assert.equal(entry.dirtyReason, null);
    assert.equal(h.consoleEvents.length, 3);
    assert.match(h.consoleEvents[2].message,
      /^Batch 2\nEntry #1 · logger · succeeded \(media update\) · current viewport · admitted: visible\/current\nQueue remaining: 0$/);
    assert.deepEqual(h.notifications, []);
  } finally { h.restore(); }
});

test('async rejection uses only the deduplicated failure channel', async () => {
  const h = setup();
  try {
    const { slot } = h.createEntry('failed-id', () => Promise.reject(new Error('private content')));
    h.observers[0].batch([slot, true]);
    h.tick();
    await Promise.resolve();
    assert.equal(h.consoleEvents.length, 3);
    const failureEvent = h.consoleEvents.find(event => event.message === 'Hydration failed while building a message row.');
    assert.ok(failureEvent);
    assert.equal(failureEvent.category, 'DEBUG · HYDRATE');
    assert.doesNotMatch(JSON.stringify(h.consoleEvents), /private content|failed-id/);
    assert.match(h.consoleEvents[0].message, /^Batch 1\nEntry #1 · logger · pending \(first load\)/);
    assert.equal(h.consoleEvents[2].message, 'Batch 1 · Entry #1 · logger · failed · current viewport');
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].options.type, 'warning');
    assert.deepEqual(h.plugin.reportViewportDebugIssue('row-hydration-failure'), { console: false, toast: false });
    assert.equal(h.notifications.length, 1, 'the same failure reason stays deduplicated');
    assert.equal(h.plugin._viewportHydrationActivityQueue, undefined);
  } finally { h.restore(); }
});

test('fulfilled async activation updates its original pending batch entry', async () => {
  const h = setup();
  try {
    let resolveBuild;
    const { slot } = h.createEntry('async-success-id', () => new Promise(resolve => { resolveBuild = resolve; }));
    h.observers[0].batch([slot, true]);
    h.tick();
    assert.equal(h.consoleEvents.length, 1);
    assert.match(h.consoleEvents[0].message, /^Batch 1\nEntry #1 · logger · pending \(first load\)/);
    resolveBuild();
    await Promise.resolve();
    assert.equal(h.consoleEvents.length, 2);
    assert.equal(h.consoleEvents[1].message,
      'Batch 1 · Entry #1 · logger · succeeded · current viewport');
    assert.equal(h.timers.length, 0);
  } finally { h.restore(); }
});

test('turning master debug off before the success batch flush suppresses output', () => {
  const h = setup();
  try {
    assert.equal(h.plugin.reportViewportDebugActivity('first-load'), true);
    assert.equal(h.timers.length, 1);
    h.plugin.settings.debugLogging = false;
    assert.equal(h.flushActivity(), true);
    assert.equal(h.consoleEvents.length, 0);
    assert.deepEqual(h.notifications, []);
    assert.equal(h.plugin._viewportHydrationActivityQueue, null);
  } finally { h.restore(); }
});

test('stop drops a success batch and its stale timer cannot flush a later startup batch', () => {
  const h = setup();
  try {
    assert.equal(h.plugin.reportViewportDebugActivity('first-load'), true);
    const stoppedTimer = h.timers[0];
    const staleCallback = stoppedTimer.callback;
    h.plugin.stop();
    assert.equal(stoppedTimer.cleared, true);
    assert.equal(h.plugin._viewportHydrationActivityQueue, null);

    assert.equal(h.plugin.reportViewportDebugActivity('retained-reuse'), true);
    staleCallback();
    assert.equal(h.consoleEvents.length, 0, 'old callback cannot flush a newer queue');
    assert.equal(h.flushActivity(), true);
    assert.equal(h.consoleEvents.length, 1);
    assert.equal(h.consoleEvents[0].message, 'Hydration succeeded: 1 retained reuse.');
    assert.deepEqual(h.notifications, []);
  } finally { h.restore(); }
});

test('unknown success classifications do not create a timer or queue', () => {
  const h = setup();
  try {
    assert.equal(h.plugin.reportViewportDebugActivity('https://private.example/123?token=secret'), false);
    assert.equal(h.timers.length, 0);
    assert.equal(h.plugin._viewportHydrationActivityQueue, undefined);
    assert.deepEqual(h.consoleEvents, []);
    assert.deepEqual(h.notifications, []);
  } finally { h.restore(); }
});

test('warm viewport reuse reports once per false-to-true crossing and ignores repeated true frames', () => {
  const h = setup();
  try {
    let builds = 0;
    const { entry, slot } = h.createEntry('scroll-id', () => { builds++; });
    h.observers[0].batch([slot, true]);
    h.tick();
    assert.equal(builds, 1);
    h.flushActivity();
    h.consoleEvents.length = 0;

    h.observers[0].batch([slot, false], [slot, true], [slot, true]);
    h.observers[0].batch([slot, false], [slot, true]);
    assert.equal(builds, 1, 'warm re-entry reuses the retained build');
    assert.equal(h.flushActivity(), true);
    assert.equal(h.consoleEvents.length, 1);
    assert.equal(h.consoleEvents[0].message, 'Hydration succeeded: 2 retained reuses.');
    assert.equal(entry.failed, false);
    assert.deepEqual(h.notifications, []);
  } finally { h.restore(); }
});

test('attaching a retained clean entry adopts an already-visible crossing once', () => {
  const h = setup();
  try {
    const row = new ViewportNode();
    h.root.appendChild(row);
    let builds = 0;
    const anchor = h.session.getEntry({ surfaceKey: 'native', channelId: 'channel', messageId: 'anchor',
      revision: 1, build() {} });
    const anchorSlot = new ViewportNode();
    h.root.appendChild(anchorSlot);
    h.session.attach(anchor, anchorSlot, 'anchor-token', {
      crossing: true, scrollRoot: h.root, admissionScope: 'test-scope', observeTarget: row
    });
    const retained = h.session.getEntry({ surfaceKey: 'native', channelId: 'channel', messageId: 'retained',
      revision: 1, build() { builds++; } });
    const firstSlot = new ViewportNode();
    h.root.appendChild(firstSlot);
    h.session.attach(retained, firstSlot, 'first-token', {
      crossing: true, scrollRoot: h.root, admissionScope: 'test-scope', observeTarget: firstSlot
    });
    h.observers[0].batch([row, true], [firstSlot, true]);
    h.tick();
    assert.equal(builds, 1);
    h.flushActivity();
    h.consoleEvents.length = 0;

    h.session.release(retained, 'first-token');
    const nextSlot = new ViewportNode();
    h.root.appendChild(nextSlot);
    h.session.attach(retained, nextSlot, 'second-token', {
      crossing: true, scrollRoot: h.root, admissionScope: 'test-scope', observeTarget: row
    });
    h.observers[0].batch([row, true]);
    assert.equal(builds, 1);
    assert.equal(h.flushActivity(), true);
    assert.equal(h.consoleEvents.length, 1);
    assert.equal(h.consoleEvents[0].message, 'Hydration succeeded: 1 retained reuse.');
    assert.deepEqual(h.notifications, []);
  } finally { h.restore(); }
});

test('scheduler batches prioritize the current viewport over earlier background backlog', () => {
  const h = setup();
  try {
    const built = [];
    const rows = Array.from({ length: 6 }, (_, index) => h.createEntry(String(index), () => built.push(String(index)), 1,
      { surface: 'native' }));
    h.observers[0].batch(...rows.slice(0, 5).map(row => [row.slot, true]));
    h.tick();
    assert.deepEqual(built, ['0', '1', '2', '3']);
    assert.match(h.consoleEvents[0].message, /^Batch 1\nEntry #1 · native · succeeded \(first load\) · current viewport/);
    assert.match(h.consoleEvents[0].message, /Queue remaining: 1$/);

    h.observers[0].batch([rows[4].slot, false], [rows[5].slot, true]);
    h.tick();
    assert.deepEqual(built, ['0', '1', '2', '3', '5', '4']);
    assert.match(h.consoleEvents[1].message,
      /^Batch 2\nEntry #1 · native · succeeded \(first load\) · current viewport · admitted: visible\/current\nEntry #2 · native · succeeded \(first load\) · background · admitted: visible\/current\nQueue remaining: 0$/);
    assert.deepEqual(h.notifications, []);
  } finally { h.restore(); }
});

test('passed interval and server-view admission use fixed labels with current start priority', () => {
  const h = setup();
  try {
    const built = [];
    const rows = Array.from({ length: 7 }, (_, index) => h.createEntry(`interval-${index}`,
      () => built.push(String(index)), 1, { surface: 'native' }));
    h.observers[0].batch([rows[2].slot, true]);
    h.tick();
    h.root.scroll();
    h.observers[0].batch([rows[2].slot, false], [rows[5].slot, true]);
    h.tick();
    assert.deepEqual(built, ['2', '5', '3', '4']);
    assert.match(h.consoleEvents[1].message,
      /^Batch 2\nEntry #1 · native · succeeded \(first load\) · current viewport · admitted: visible\/current\nEntry #2 · native · succeeded \(first load\) · background · admitted: passed interval/);
    assert.match(h.consoleEvents[1].message, /Entry #3 · native · succeeded \(first load\) · background · admitted: passed interval/);

    const serverEntry = h.session.getEntry({ surfaceKey: 'forum', channelId: 'channel',
      messageId: 'private-message-id', revision: 1, build() { built.push('server'); } });
    serverEntry.admitOnAttach = true;
    const serverSlot = new ViewportNode();
    h.root.appendChild(serverSlot);
    h.session.attach(serverEntry, serverSlot, 'server-lease', {
      crossing: true, scrollRoot: h.root, admissionScope: 'server-scope', admitOnAttach: true
    });
    h.tick();
    assert.match(h.consoleEvents[2].message,
      /^Batch 3\nEntry #1 · server card · succeeded \(first load\) · background · admitted: server view\nQueue remaining: 0$/);
    assert.doesNotMatch(JSON.stringify(h.consoleEvents), /private-message-id/);
  } finally { h.restore(); }
});

test('queue removals are reflected in the batch remaining snapshot', () => {
  const h = setup();
  try {
    const rows = Array.from({ length: 5 }, (_, index) => h.createEntry(`cancel-${index}`, () => {}));
    h.observers[0].batch(...rows.map(row => [row.slot, true]));
    h.session.release(rows[4].entry, rows[4].token);
    h.tick();
    assert.match(h.consoleEvents[0].message, /Queue remaining: 0$/);
    assert.doesNotMatch(h.consoleEvents[0].message, /Entry #5/);
  } finally { h.restore(); }
});

test('master debug off adds no batch event or timer; enabling it reports later queued work', () => {
  const h = setup({ debugLogging: false });
  try {
    const quiet = h.createEntry('quiet', () => {});
    h.observers[0].batch([quiet.slot, true]);
    h.tick();
    assert.deepEqual(h.consoleEvents, []);
    assert.equal(h.timers.length, 0);

    h.plugin.settings.debugLogging = true;
    const visible = h.createEntry('visible', () => {});
    h.observers[0].batch([visible.slot, true]);
    h.tick();
    assert.equal(h.consoleEvents.length, 1);
    assert.match(h.consoleEvents[0].message, /^Batch 1\nEntry #1 · logger · succeeded \(first load\)/);
    assert.equal(h.timers.length, 0, 'scheduler batch summaries do not add reporting timers');
  } finally { h.restore(); }
});
