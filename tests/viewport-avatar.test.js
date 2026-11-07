const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./helpers/plugin-harness');

class Node {
  constructor() {
    this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.isConnected = true; this.listeners = {};
    this.classNames = new Set(); this.classMutations = [];
    this.classList = {
      add: (...names) => { this.classMutations.push(names); names.forEach(name => this.classNames.add(name)); },
      remove: (...names) => names.forEach(name => this.classNames.delete(name)),
      contains: name => this.classNames.has(name)
    };
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (!this.parentNode) return; this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelector() { return null; }
  querySelectorAll(selector) {
    if (selector !== '[data-ml2-logger-message-start]') return [];
    return this.children.flatMap(child => [
      ...(child.dataset.ml2LoggerMessageStart === 'true' || child.dataset.ml2LoggerMessageStart === 'false' ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  getBoundingClientRect() { return { height: 80 }; }
}

function setup(liveUser, savedAvatar) {
  const old = { document: global.document, IntersectionObserver: global.IntersectionObserver, requestAnimationFrame: global.requestAnimationFrame };
  const frames = [], observers = [];
  global.document = { head: new Node(), createElement: () => new Node() };
  global.requestAnimationFrame = callback => frames.push(callback);
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); }
    visible(node, isIntersecting = true) { this.callback([{ target: node, isIntersecting }]); }
  };
  const message = { id: 'm', channel_id: 'c', content: 'saved text', author: { id: 'u', username: 'Saved', avatar: savedAvatar } };
  const record = { message };
  const groups = [];
  const plugin = createPlugin({
    messageRecord: { m: record }, settings: {}, style: {}, classes: {}, multiClasses: {}, menu: {},
    tools: { getChannel: () => null, getUser: () => liveUser, showUserPopout() {} },
    getForumThreadDeleteLocationName: () => null, getSavedRecordLocationName: () => null,
    getLiteralName: () => 'channel', createTimeStamp: () => 'time',
    markLoggerViewerJumpAvailableAuthor() {}, wireLoggerViewerDoubleClick() {},
    parseHTML(html) {
      const group = new Node(), avatar = new Node(), name = new Node(), timestamp = new Node();
      avatar.src = html.match(/<img src="([^"]+)"/)?.[1] || '';
      group.getElementsByClassName = key => ({ avatar: [avatar], name: [name], timestamp: [timestamp] })[key] || [];
      group.avatar = avatar;
      groups.push(group);
      return group;
    }
  });
  const method = plugin.createMessageGroup;
  const oldClasses = method.classes;
  method.classes = { extra: Array(13).fill(''), botTag: 'bot', avatarImgSingle: 'avatar' };
  method.classes.extra[10] = 'name';
  method.classes.extra[11] = 'timestamp';
  return { plugin, message, record, groups, observers,
    tick() { frames.splice(0).forEach(callback => callback()); },
    restore() {
      if (oldClasses === undefined) delete method.classes; else method.classes = oldClasses;
      for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; }
    }
  };
}

test('real message-group avatar presentation never mutates the saved author', () => {
  const cases = [
    { label: 'matching', saved: 'same', live: { id: 'u', avatar: 'same' }, expected: 'https://cdn.discordapp.com/avatars/u/same.png?size=128' },
    { label: 'updated', saved: 'old', live: { id: 'u', avatar: 'new' }, expected: 'https://cdn.discordapp.com/avatars/u/new.png?size=128' },
    { label: 'removed', saved: 'old', live: { id: 'u', avatar: null }, expected: '/assets/322c936a8c8be1b803cd94861bdfa868.png' },
    { label: 'unavailable', saved: 'old', live: null, expected: 'https://cdn.discordapp.com/avatars/u/old.png?size=128' }
  ];
  for (const item of cases) {
    const f = setup(item.live, item.saved);
    try {
      const before = structuredClone(f.record);
      const rendered = structuredClone(f.message);
      const group = f.plugin.createMessageGroup(rendered, true);
      assert.equal(group.avatar.src, item.expected, item.label);
      assert.deepEqual(f.record, before, item.label);
      assert.deepEqual(rendered, f.message, `${item.label} supplied snapshot`);
      group.avatar.onerror();
      assert.equal(group.avatar.src, '/assets/322c936a8c8be1b803cd94861bdfa868.png');
    } finally { f.restore(); }
  }
});

test('message-group spacing classes are added in place only to native group starts', () => {
  const f = setup({ id: 'u', avatar: 'same' }, 'same');
  try {
    const start = f.plugin.createMessageGroup(structuredClone(f.message), true);
    const continuation = f.plugin.createMessageGroup(structuredClone(f.message), false);
    assert.equal(start.dataset.ml2LoggerMessageStart, 'true');
    assert.equal(continuation.dataset.ml2LoggerMessageStart, 'false');
    const host = new Node();
    host.append(start, continuation);
    const native = {
      message: 'message_native shared_native',
      cozyMessage: 'cozy_native shared_native',
      groupStart: 'groupStart_native'
    };

    f.plugin.applyLoggerMessageGroupClasses(host, native);
    assert.deepEqual([...start.classNames], ['message_native', 'shared_native', 'cozy_native', 'groupStart_native']);
    assert.deepEqual([...continuation.classNames], ['message_native', 'shared_native', 'cozy_native']);
    assert.equal(start.classMutations.length, 1);
    assert.equal(continuation.classMutations.length, 1);
    f.plugin.applyLoggerMessageGroupClasses(host, native);
    assert.equal(start.classMutations.length, 1, 'already-correct start is not mutated');
    assert.equal(continuation.classMutations.length, 1, 'already-correct continuation is not mutated');

    const rootGroup = new Node();
    rootGroup.dataset.ml2LoggerMessageStart = 'true';
    f.plugin.applyLoggerMessageGroupClasses(rootGroup, native);
    assert.ok(rootGroup.classNames.has('groupStart_native'), 'the supplied root is included');

    const unavailable = new Node();
    unavailable.dataset.ml2LoggerMessageStart = 'true';
    f.plugin.applyLoggerMessageGroupClasses(unavailable, null);
    assert.equal(unavailable.classMutations.length, 0, 'missing native module does not add guessed classes');
  } finally { f.restore(); }
});

test('avatar context actions keep the live-user and missing-user behavior', () => {
  const live = { id: 'u', avatar: 'current' };
  for (const user of [live, null]) {
    const f = setup(user, 'saved');
    try {
      const calls = [];
      f.plugin._openUserContextMenu = (event, author, channel) => calls.push({ event, author, channel });
      f.plugin.notifyUser = text => calls.push({ text });
      const group = f.plugin.createMessageGroup(structuredClone(f.message), true);
      const event = {};
      group.avatar.listeners.contextmenu(event);
      if (user) assert.deepEqual(calls, [{ event, author: live, channel: null }]);
      else assert.match(calls[0].text, /Could not get user info/);
    } finally { f.restore(); }
  }
});

test('real group avatar rendering preserves a retained root across scroll and revisits, but edits reconcile', () => {
  const f = setup({ id: 'u', avatar: 'same' }, 'same');
  try {
    const session = f.plugin.getViewportSession();
    let builds = 0, disposed = 0;
    const entry = session.getEntry({ surfaceKey: 'logger', channelId: 'c', messageId: 'm',
      revision: () => JSON.stringify(f.record),
      build(entry, host) {
        builds++;
        const group = f.plugin.createMessageGroup(structuredClone(f.message), true);
        host.appendChild(group);
        session.own(entry, group, null, () => { disposed++; });
      } });
    const slot = new Node();
    session.attach(entry, slot, 'first');
    f.observers[0].visible(slot); f.tick();
    const host = entry.host, group = host.children[0];
    for (let i = 0; i < 3; i++) {
      f.observers[0].visible(slot, false); f.tick();
      f.observers[0].visible(slot, true); f.tick();
      session.reconcileActive(); f.tick(); f.tick();
    }
    assert.equal(builds, 1);
    assert.equal(disposed, 0);
    assert.equal(slot.children[0], host);
    assert.equal(host.children[0], group);
    assert.equal(f.record.message.author.avatar, 'same');
    session.park(entry, 'first');
    const replacement = new Node();
    session.attach(entry, replacement, 'second');
    f.observers[0].visible(replacement); f.tick();
    assert.equal(replacement.children[0], host);
    assert.equal(host.children[0], group);
    assert.equal(builds, 1);
    f.message.content = 'legitimate edit';
    session.reconcileActive(); f.tick(); f.tick();
    assert.equal(builds, 2);
    assert.equal(disposed, 1);
    assert.notEqual(host.children[0], group);
  } finally { f.restore(); }
});
