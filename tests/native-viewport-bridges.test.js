const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPlugin, React, ReactDOM } = require('./helpers/plugin-harness');

// Small hook/DOM fixture: executes the real bridge and manager without a browser or network.
// Native renderer commits remain a separate runtime acceptance gate.
class Element {
  constructor() { this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.isConnected = true; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  closest() { return this.row || null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { height: 90 }; }
  get parentElement() { return this.parentNode; }
}
function setup() {
  const globals = {};
  for (const key of ['document', 'IntersectionObserver', 'requestAnimationFrame']) globals[key] = global[key];
  const oldReact = { ...React }, oldDOM = { ...ReactDOM };
  const frames = [], observers = [], roots = [];
  let exerciseBoundaryErrors = false;
  let current = null;
  global.document = { head: new Element(), createElement: () => new Element() };
  global.requestAnimationFrame = callback => frames.push(callback);
  global.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(node) { this.targets.add(node); }
    unobserve(node) { this.targets.delete(node); }
    disconnect() { this.targets.clear(); }
    visible(target, visible = true) { this.callback([{ target, isIntersecting: visible }]); }
  };
  Object.assign(React, {
    Component: class { constructor(props) { this.props = props; } },
    Fragment: Symbol('fragment'),
    createElement(type, props, ...children) { return { type, props: { ...(props || {}), ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }; },
    cloneElement(node, props, ...children) { return React.createElement(node.type, { ...node.props, ...props }, ...(children.length ? children : [node.props.children])); },
    isValidElement(node) { return !!node && typeof node === 'object' && 'type' in node && !!node.props; },
    createContext(value) { return { current: value, Provider: Symbol('provider') }; },
    useContext(context) { return context.current; },
    useRef(initial) { const index = current.index++; return current.hooks[index] ||= { current: initial }; },
    useState(initial) { const index = current.index++; const state = current.hooks[index] ||= { value: typeof initial === 'function' ? initial() : initial }; return [state.value, value => { state.value = typeof value === 'function' ? value(state.value) : value; }]; },
    useLayoutEffect(effect, deps) {
      const index = current.index++;
      const previous = current.hooks[index];
      if (previous && deps && deps.length === previous.deps?.length && deps.every((value, i) => value === previous.deps[i])) return;
      const owner = current;
      current.effects.push(() => { previous?.cleanup?.(); owner.hooks[index] = { deps, cleanup: effect() }; });
    },
    useEffect() {}
  });
  function mount(Component) {
    const state = { hooks: [], effects: [], index: 0 };
    return {
      render(props) { const previous = current; current = state; state.index = 0; state.effects = []; try { return Component(props); } finally { current = previous; } },
      commit() { for (const effect of state.effects.splice(0)) effect(); },
      unmount() { for (const hook of state.hooks) hook?.cleanup?.(); }
    };
  }
  ReactDOM.createRoot = host => {
    const notice = { mount: null };
    const root = { host, renders: [], wrappedRenders: [], disposed: 0,
      render(tree) {
        root.wrappedRenders.push(tree);
        if (tree.type.displayName === 'MessageLoggerViewportErrorBoundary') {
          root.boundary ||= new tree.type(tree.props);
          root.boundary.props = tree.props;
          tree = tree.props.children;
        }
        if (!root.boundary.state.failed) {
          try {
            const payload = tree.props.children[0];
            const child = payload.type(payload.props);
            tree = React.cloneElement(tree, {}, child, tree.props.children[1]);
            if (exerciseBoundaryErrors && typeof child?.type === 'function') child.type(child.props);
          } catch (error) {
            Object.assign(root.boundary.state, root.boundary.constructor.getDerivedStateFromError(error));
            root.boundary.componentDidCatch(error);
          }
        }
        root.renders.push(tree);
        if (root.boundary) {
          root.output = root.boundary.render();
          if (root.boundary.state.failed) return;
        }
        const effect = tree.props.children[1];
        notice.mount ||= mount(effect.type);
        notice.mount.render(effect.props);
        notice.mount.commit();
      },
      unmount() { root.disposed++; notice.mount?.unmount(); }
    };
    roots.push(root); return root;
  };
  ReactDOM.createPortal = (children, target) => ({ portal: true, children, target });
  const message = { id: 'm', channel_id: 'c', attachments: [] };
  const plugin = createPlugin({ __started: true, _startupGeneration: 1,
    messageRecord: { m: { message, delete_data: { time: 1 } } }, messageRecordIds: new Set(['m']), _messageUpdateRegistry: new Map(),
    settings: { cacheAllImages: true }, shouldPresentSavedMessage: () => true });
  const components = plugin.getNativeViewportComponents();
  function bridge(props, row = new Element()) {
    const mounted = mount(components.Bridge);
    const slot = new Element(); slot.row = row; row.appendChild(slot);
    const initial = { message, kind: 'content', render: (entry, props) => ({ entry, props }), ...props };
    const commit = changes => { Object.assign(initial, changes); const tree = mounted.render(initial); tree.props.ref.current = slot; mounted.commit(); return tree; };
    commit();
    return { mounted, slot, row, commit, props: initial,
      entry: () => plugin._viewportSession.ownerOf(slot.children[0]),
      unmount() { mounted.unmount(); slot.remove(); } };
  }
  return { plugin, components, message, roots, observers, mount, bridge,
    exerciseBoundaryErrors() { exerciseBoundaryErrors = true; },
    tick() { for (const callback of frames.splice(0)) callback(); },
    visible(row, value) { for (const observer of observers) if (observer.targets.has(row)) observer.visible(row, value); },
    restore() {
      plugin._viewportSession?.reset();
      for (const key of Object.keys(React)) delete React[key]; Object.assign(React, oldReact);
      for (const key of Object.keys(ReactDOM)) delete ReactDOM[key]; Object.assign(ReactDOM, oldDOM);
      for (const [key, value] of Object.entries(globals)) { if (value === undefined) delete global[key]; else global[key] = value; }
    }
  };
}

test('native saved text keeps viewport admission and retention when media is disabled or misses local cache', () => {
  for (const masterEnabled of [false, true]) {
    const h = setup();
    try {
      Object.assign(h.plugin.settings, { cacheAllImages: masterEnabled, onlyRenderCachedAttachments: true });
      h.plugin.imageCacheServerSimulator = { exists: () => false };
      h.message.content = 'saved text';
      h.message.attachments = [{ id: 'image', filename: 'photo.png', url: 'https://cdn.example/photo.png' }];
      const before = structuredClone(h.message);
      assert.equal(h.plugin.shouldRetainNativeSavedMessage(h.message), true);
      const body = h.bridge({ nativeProps: { message: h.message },
        render: (_entry, props) => h.plugin.getCacheOnlyMessage(props.message) });
      assert.equal(h.roots.length, 0);
      h.visible(body.row); h.tick();
      assert.equal(h.roots.length, 1);
      const rendered = h.roots[0].renders.at(-1).props.children[0];
      assert.equal(rendered.content, 'saved text');
      assert.deepEqual(rendered.attachments, []);
      assert.deepEqual(h.message, before);
      h.visible(body.row, false); h.visible(body.row); h.tick();
      assert.equal(h.roots.length, 1);
      assert.equal(h.roots[0].disposed, 0);
      body.unmount();
    } finally { h.restore(); }
  }
});

test('native islands share the row viewport, including an island joining an already visible row', () => {
  const h = setup();
  try {
    const content = h.bridge();
    assert.equal(h.roots.length, 0);
    assert.deepEqual([...h.observers[0].targets], [content.row]);
    h.visible(content.row); h.tick();
    assert.equal(h.roots.length, 1);
    const accessories = h.bridge({ kind: 'accessories' }, content.row);
    h.tick();
    assert.equal(h.roots.length, 2);
    assert.equal(content.entry().variant, '0:content');
    assert.equal(accessories.entry().variant, '0:accessories');
    content.unmount();
    assert.equal(h.observers[0].targets.has(content.row), true, 'releasing one island retains the other row observation');
    accessories.unmount();
    assert.equal(h.observers[0].targets.size, 0);
    assert.equal(h.roots.every(root => root.disposed === 0), true);
  } finally { h.restore(); }
});

test('native warm revisits preserve host/root and notify only the current activation lease', () => {
  const h = setup();
  try {
    const notified = [], callbacks = [];
    let body = h.bridge({ onActivate: () => notified.push('first'), nativeProps: { onUpdate: () => callbacks.push('first') } });
    h.visible(body.row); h.tick();
    const entry = body.entry(), host = entry.host, root = entry.nativeRoot;
    const relay = root.renders.at(-1).props.children[0].props.onUpdate;
    assert.deepEqual(notified, ['first']);
    body.commit({ onActivate: () => notified.push('unchanged') });
    body.commit({ nativeProps: { onUpdate: () => callbacks.push('latest') } });
    assert.deepEqual(notified, ['first']);
    relay(); assert.deepEqual(callbacks, ['latest']);
    const oldToken = entry.leaseToken;
    body.unmount(); relay();
    assert.deepEqual(callbacks, ['latest']);
    body = h.bridge({ onActivate: () => notified.push('revisit'), nativeProps: { onUpdate: () => callbacks.push('revisit') } });
    assert.equal(body.entry(), entry);
    assert.equal(entry.host, host); assert.equal(entry.nativeRoot, root);
    assert.equal(h.plugin._viewportSession.release(entry, oldToken), false);
    relay(); assert.deepEqual(callbacks, ['latest', 'revisit']);
    assert.deepEqual(notified, ['first', 'revisit']);
    body.commit(); assert.deepEqual(notified, ['first', 'revisit']);
    body.unmount();
  } finally { h.restore(); }
});

test('native active invalidation renders a replacement root only for the changed message', () => {
  const h = setup();
  try {
    h.plugin.messageRecord.n = { message: { id: 'n', channel_id: 'c' }, delete_data: { time: 1 } };
    let activations = 0;
    const a = h.bridge({ onActivate: () => activations++ }), b = h.bridge({ message: h.plugin.messageRecord.n.message });
    h.visible(a.row); h.visible(b.row); h.tick();
    const first = a.entry().nativeRoot, other = b.entry().nativeRoot;
    for (const callback of h.plugin._messageUpdateRegistry.get('m')) callback();
    h.tick(); assert.equal(first.disposed, 0, 'unchanged record events retain the island');
    h.plugin.messageRecord.m.message.content = 'changed';
    for (const callback of h.plugin._messageUpdateRegistry.get('m')) callback();
    h.tick();
    assert.equal(first.disposed, 1);
    assert.equal(activations, 2, 'a replacement root notifies once even if its layout commit precedes manager resume');
    assert.equal(a.entry().nativeRoot.renders.length, 1, 'admitted reconciliation must render while the entry transitions from suspended');
    assert.equal(b.entry().nativeRoot, other); assert.equal(other.disposed, 0);
    a.unmount(); b.unmount();
  } finally { h.restore(); }
});

test('native bidirectional revisits, jump mounts and simultaneous occurrences never steal hosts', () => {
  const h = setup();
  try {
    const first = h.bridge(), duplicate = h.bridge();
    h.visible(duplicate.row); h.tick();
    assert.equal(h.roots.length, 1, 'a newly jumped-to occurrence activates independently');
    h.visible(first.row); h.tick();
    const firstEntry = first.entry(), duplicateEntry = duplicate.entry();
    assert.notEqual(firstEntry, duplicateEntry);
    assert.equal(duplicateEntry.variant, '1:content');
    const staleRow = first.row;
    first.unmount();
    const revisit = h.bridge();
    assert.equal(revisit.entry(), firstEntry);
    const oldRowAccessories = h.bridge({ kind: 'accessories' }, staleRow);
    h.visible(staleRow); h.tick();
    assert.equal(oldRowAccessories.entry().variant, '2:accessories', 'a stale WeakMap row cannot join an occurrence now leased by a different row');
    assert.equal(revisit.entry(), firstEntry);
    duplicate.unmount(); revisit.unmount(); oldRowAccessories.unmount();
  } finally { h.restore(); }
});

test('parked visibility changes stay dirty until row visibility; callbacks resume once and reject stale sources', () => {
  const h = setup();
  try {
    const body = h.bridge(); h.visible(body.row); h.tick();
    const entry = body.entry();
    let calls = 0;
    const media = { src: 'https://cdn.example/one', isConnected: true };
    const callback = h.plugin.deferNativeViewportDisplay(entry, () => calls++);
    body.unmount(); callback({ currentTarget: media, target: media });
    assert.equal(calls, 0);
    const revisit = h.bridge();
    assert.equal(calls, 1); assert.equal(revisit.entry(), entry);
    revisit.unmount(); callback({ currentTarget: media }); media.src = 'https://cdn.example/two';
    const again = h.bridge(); assert.equal(calls, 1);
    again.unmount();
    h.plugin._viewportSession.invalidate('m', 'hide');
    h.plugin._viewportSession.invalidate('m', 'show');
    const dirty = h.bridge(); h.tick();
    assert.equal(h.roots.length, 1);
    h.visible(dirty.row); h.tick();
    assert.equal(h.roots.length, 2);
    dirty.unmount();
  } finally { h.restore(); }
});

test('record forgetting and replacement prune only affected owned roots and cancel queued callbacks', () => {
  const h = setup();
  try {
    const a = h.bridge(); h.visible(a.row); h.tick();
    const root = a.entry().nativeRoot;
    let calls = 0;
    const callback = h.plugin.deferNativeViewportDisplay(a.entry(), () => calls++);
    a.unmount(); callback();
    h.plugin._viewportSession.disposeMessage('m');
    assert.equal(root.disposed, 1);
    assert.equal(h.plugin._viewportSession.getDebugSnapshot().resources, 0);
    callback(); assert.equal(calls, 0);
    const b = h.bridge(); h.visible(b.row); h.tick();
    h.plugin._viewportSession.pruneMessages({ m: h.plugin.messageRecord.m });
    assert.equal(b.entry().nativeRoot.disposed, 0);
    h.plugin._viewportSession.pruneMessages({});
    assert.equal(h.roots.at(-1).disposed, 1);
    b.unmount();
  } finally { h.restore(); }
});

test('native Accessories gates before projection, keeps the provider envelope and latest complete props, and bypasses only retention in owned context', () => {
  const h = setup();
  try {
    let projections = 0, originals = 0;
    h.plugin.getSavedAttachmentMessageContentPresentationMessage = message => { projections++; return message; };
    h.plugin.wrapSavedInlineTextAttachmentProbeRender = value => value;
    const Provider = function Provider() {}, Connected = function Connected() {};
    class NativeAccessories { constructor(props) { this.props = props; this.state = { retained: true }; } }
    const policy = { restrictedPreview: true, canDeleteAttachments: true, enabledContentHarmTypeFlags: { image: true },
      renderThreadAccessory: false, allowFullScreen: false, onMediaItemContextMenu() {}, channel: { id: 'c' } };
    const factoryArgs = [];
    const factory = args => { factoryArgs.push(args); return React.createElement(Provider, { message: args.channelMessageProps.message }, React.createElement(Connected, { message: args.channelMessageProps.message })); };
    const instance = new NativeAccessories({ message: h.message, ...policy, renderAccessories: factory });
    const original = function () { originals++; assert.equal(this, instance); return 'native body'; };
    const gate = h.plugin.renderSavedAttachmentMessageAccessories(instance, [], original);
    assert.equal(projections, 0); assert.equal(originals, 0);
    const gateMount = h.mount(gate.type);
    const bridgeElement = gateMount.render(gate.props); gateMount.commit();
    const body = h.bridge(bridgeElement.props); h.visible(body.row); h.tick();
    const entry = body.entry(), envelope = entry.nativeRoot.renders.at(-1).props.children[0];
    assert.equal(envelope.type, Provider); assert.equal(envelope.props.message, h.message);
    assert.equal(envelope.props.children.type, NativeAccessories);
    for (const key of Object.keys(policy).filter(key => typeof policy[key] !== 'function')) assert.equal(envelope.props.children.props[key], policy[key], key);
    assert.equal(factoryArgs[0].channelMessageProps.channel, policy.channel);
    assert.equal(factoryArgs[0].handleContextMenu, envelope.props.children.props.onMediaItemContextMenu);
    assert.equal(projections, 0); assert.equal(originals, 0, 'the native supplier instance output is never reused');
    body.commit({ nativeProps: { ...instance.props, restrictedPreview: false, canDeleteAttachments: false } });
    const next = entry.nativeRoot.renders.at(-1).props.children[0].props.children;
    assert.equal(next.props.restrictedPreview, false); assert.equal(next.props.canDeleteAttachments, false);
    h.components.OwnerContext.current = entry;
    assert.equal(gateMount.render(gate.props), 'native body'); gateMount.commit();
    assert.equal(projections, 1); assert.equal(originals, 1);
    h.components.OwnerContext.current = null;
    body.commit({ nativeProps: { ...instance.props, renderAccessories: () => null } });
    assert.equal(entry.nativeRoot.renders.at(-1).props.children[0], null);
    body.unmount();
    h.components.OwnerContext.current = entry;
    assert.equal(gateMount.render(gate.props), 'native body', 'a parked connected native update keeps its previous subtree'); gateMount.commit();
    assert.equal(projections, 1); assert.equal(originals, 1);
    const resumed = h.bridge(bridgeElement.props);
    assert.equal(gateMount.render(gate.props), 'native body'); gateMount.commit();
    assert.equal(projections, 2); assert.equal(originals, 2);
    gateMount.unmount(); resumed.unmount(); h.components.OwnerContext.current = null;
    const ordinary = new NativeAccessories({ message: { id: 'ordinary' } });
    assert.equal(h.plugin.renderSavedAttachmentMessageAccessories(ordinary, [], function () { return 'ordinary'; }), 'ordinary');
  } finally { h.restore(); }
});

test('owned native probe contexts preserve original guards and use the same retained owner scheduler', () => {
  const h = setup();
  try {
    const body = h.bridge(); h.visible(body.row); h.tick();
    const owner = body.entry();
    h.components.OwnerContext.current = owner;
    let canonical = true, calls = 0;
    const context = { sourceUrl: 'https://cdn.example/file', isActive: () => canonical };
    const wrapped = h.components.OwnedProbe({ context, Sentinel() {} }).props.context;
    assert.equal(wrapped.viewportEntry, owner); assert.equal(wrapped.isActive(), true);
    body.unmount();
    assert.equal(wrapped.isActive(), false); assert.equal(wrapped.isActive(true), true);
    wrapped.deferUntilActive(() => calls++); assert.equal(calls, 0);
    const revisit = h.bridge(); assert.equal(calls, 1);
    canonical = false; assert.equal(wrapped.isActive(true), false);
    h.components.OwnerContext.current = null;
    revisit.unmount();
  } finally { h.restore(); }
});

function installContentGate(plugin) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('    this.installEditHistoryPatch =');
  const end = source.indexOf('    if (!this.installEditHistoryPatch(MessageContent))', start);
  const patches = {};
  const patcher = { before(target, name, callback) { patches.before = callback; return () => {}; }, after(target, name, callback) { patches.after = callback; return () => {}; } };
  const scope = { React, ReactDOM, Patcher: patcher, DiscordModules: {},
    SavedAttachmentPresentationContent() {}, DeletedContentTooltip() {}, EditHistoryContent() {}, NativeHistoryBridge() {},
    SAVED_ATTACHMENT_PRESENTATION_CONTENT_REENTRY_MARKER: '__mlv2SavedAttachmentPresentationContent',
    NATIVE_VIEWPORT_CONTENT_SOURCE: '__mlv2NativeViewportContentSource', NATIVE_VIEWPORT_CONTENT_BYPASS: '__mlv2NativeViewportContentBypass',
    deferredNativeContentChildren: [] };
  const installer = vm.runInNewContext(`(function () { ${source.slice(start, end)} })`, scope);
  installer.call(plugin);
  const mcc = { type() {} };
  plugin.unpatches = []; plugin.installEditHistoryPatch(mcc);
  return { patches, mcc, scope };
}

test('full saved native Content defers parse/projection with one sentinel and preserves the outer anchor/ref/current callbacks', () => {
  const h = setup();
  try {
    let projections = 0, updates = 0;
    h.plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent = message => message;
    h.plugin.getSavedAttachmentMessageContentPresentationMessage = message => { projections++; return message; };
    h.plugin.getMessageStickerItems = () => [];
    const { patches, mcc } = installContentGate(h.plugin);
    const ref = { current: null }, handler = () => {};
    const sourceProps = { message: h.message, contentRef: ref, onClick: handler, children: null, onUpdate: () => updates++, compact: true };
    const firstArgs = [sourceProps]; patches.before(null, firstArgs);
    const secondArgs = [{ ...sourceProps }]; patches.before(null, secondArgs);
    assert.equal(projections, 0);
    assert.equal(firstArgs[0].message, h.message, 'the outer native component keeps the real native message methods and RTL source');
    assert.equal(firstArgs[0].children, secondArgs[0].children, 'the empty parse sentinel is stable across native calls');
    assert.equal(firstArgs[0].children.length, 0);
    const nativeAnchor = React.createElement('div', { id: 'message-content-m', ref, onClick: handler, className: 'markup_native' }, null);
    const outer = patches.after(null, firstArgs, nativeAnchor);
    assert.equal(outer.props.id, nativeAnchor.props.id); assert.equal(outer.props.ref, ref); assert.equal(outer.props.onClick, handler);
    const bridgeElement = outer.props.children;
    const body = h.bridge(bridgeElement.props);
    assert.equal(h.roots.length, 0);
    h.visible(body.row); h.tick();
    assert.equal(updates, 1);
    const inner = body.entry().nativeRoot.renders.at(-1).props.children[0];
    assert.equal(inner.type, mcc.type); assert.equal(inner.props.message, h.message);
    assert.equal(inner.props.children, sourceProps.children); assert.equal(inner.props.contentRef, null); assert.equal(inner.props.ref, null);
    assert.equal(inner.props.__mlv2NativeViewportOwner, body.entry());
    const innerArgs = [inner.props]; patches.before(null, innerArgs); assert.equal(projections, 1, 'inner bypass skips only retention');
    const inside = patches.after(null, innerArgs, nativeAnchor);
    assert.equal(inside.props.children.props.id, undefined); assert.equal(inside.props.children.props.ref, null);
    body.commit({ onActivate: () => { updates += 10; } }); assert.equal(updates, 1);
    body.unmount();
    const reentry = h.bridge({ ...bridgeElement.props, onActivate: () => { updates += 10; } });
    assert.equal(updates, 11); reentry.unmount();
  } finally { h.restore(); }
});

test('native stop prevents stale mounted bridges from creating a replacement session or new roots', () => {
  const h = setup();
  try {
    const body = h.bridge(); h.visible(body.row); h.tick();
    const root = body.entry().nativeRoot;
    h.plugin.__started = false;
    h.plugin._viewportSession.reset();
    body.commit();
    assert.equal(h.plugin._viewportSession, null);
    assert.equal(root.disposed, 1); assert.equal(h.roots.length, 1);
    assert.equal(h.observers[0].targets.size, 0);
    body.unmount();
  } finally { h.restore(); }
});

test('history retains a fixed payload portal and rebinds native id/ref at the first selected text group', () => {
  const h = setup();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const start = source.indexOf('    const EditHistoryContent =');
    const end = source.indexOf("    NativeHistoryBridge.displayName = 'MessageLoggerNativeHistoryBridge';", start);
    const components = vm.runInNewContext(`${source.slice(start, end)}\n({ EditHistoryContent, RetainedHistoryAnchor, RetainedHistoryPayload, NativeHistoryBridge });`, {
      React, ReactDOM, document: global.document, Hooks: { useForceUpdate: () => [null, () => {}] },
      EditHistoryNativeAttachment() {}, DeletedContentTooltip() {}, SuffixEdited() {}
    });
    const attachment = { id: 'a', filename: 'file.pdf', url: 'https://cdn.example/file.pdf' };
    const record = h.plugin.messageRecord.m;
    record.delete_data = null; record.edit_history = [{ content: 'before attachment after', time: 1 }];
    h.plugin.editModifiers = { m: { editNum: 0, noSuffix: true } };
    h.plugin._messageUpdateRegistry = new Map();
    h.plugin.shouldPresentEditedMessages = () => true; h.plugin.isEphemeralMessage = () => false;
    h.plugin.style = { edited: 'edited', editHistoryLayout: 'owned-layout' };
    h.plugin.Tooltip = function Tooltip() {};
    h.plugin.createTimeStamp = () => 'time'; h.plugin.tools = { createMomentObject: () => ({}) };
    h.plugin.getRecordRemovedAttachments = () => [attachment];
    let plans = 0;
    h.plugin.getEditHistoryContentSegments = () => { plans++; return [
      { kind: 'text', value: 'before ' },
      { kind: 'removedAttachment', attachment, value: 'file', presentationPlan: { action: 'remote', mediaType: 'attachment', url: attachment.url } },
      { kind: 'text', value: ' after' }
    ]; };
    const original = React.createElement('div', { id: 'message-content-m', ref: { current: null }, className: 'markup_native', onClick() {} }, [null, 'current']);
    const shell = h.mount(components.NativeHistoryBridge);
    const shellProps = { plugin: h.plugin, messageId: 'm', originalElement: original, compact: false };
    let tree = shell.render(shellProps); shell.commit();
    const bridge = h.bridge(tree.props.children[0].props);
    assert.equal(plans, 0, 'history segment planning waits for viewport admission');
    assert.equal(tree.props.children[1].props.id, original.props.id);
    assert.equal(tree.props.children[1].props.children, null, 'selected cold history preserves an empty native anchor');
    h.visible(bridge.row); h.tick();
    const owner = bridge.entry();
    let historyElement = owner.nativeRoot.renders.at(-1).props.children[0];
    let history = historyElement.type(historyElement.props);
    assert.equal(plans, 1);
    const row = history.props.children[0][0];
    const rowBody = row.props.children({});
    const groups = rowBody.props.children;
    assert.equal(groups[0].type, components.RetainedHistoryAnchor);
    assert.equal(groups[1].props.children.type.name, 'EditHistoryNativeAttachment');
    assert.equal(groups[2].props.children[0], ' after');
    const anchor = h.mount(components.RetainedHistoryAnchor);
    let anchorTree = anchor.render(groups[0].props);
    const target = new Element(); anchorTree.props.children[0].props.ref.current = target; anchor.commit();
    const payload = anchorTree.props.children[1].target;
    tree = shell.render(shellProps); shell.commit();
    let nativePortal = tree.props.children[1];
    assert.equal(nativePortal.target, target); assert.equal(nativePortal.children.props.id, original.props.id);
    assert.equal(nativePortal.children.props.ref, original.props.ref);
    assert.equal(nativePortal.children.props.children.props.host, payload);
    const mountPayload = h.mount(components.RetainedHistoryPayload);
    const payloadSlot = new Element();
    let payloadTree = mountPayload.render(nativePortal.children.props.children.props); payloadTree.props.ref.current = payloadSlot; mountPayload.commit();
    assert.equal(payload.parentNode, payloadSlot);
    bridge.unmount(); mountPayload.unmount(); shell.unmount();
    assert.equal(owner.nativeRoot.disposed, 0); assert.equal(payload.parentNode, null);
    const newer = React.cloneElement(original, { ref: { current: null }, onClick() {} });
    const nextShell = h.mount(components.NativeHistoryBridge);
    tree = nextShell.render({ ...shellProps, originalElement: newer }); nextShell.commit();
    const nextBridge = h.bridge(tree.props.children[0].props);
    assert.equal(nextBridge.entry(), owner);
    historyElement = owner.nativeRoot.renders.at(-1).props.children[0];
    history = historyElement.type(historyElement.props);
    const nextAnchorProps = history.props.children[0][0].props.children({}).props.children[0].props;
    anchorTree = anchor.render(nextAnchorProps); anchor.commit();
    assert.equal(anchorTree.props.children[1].target, payload, 'the portal target for retained text never changes across navigation');
    tree = nextShell.render({ ...shellProps, originalElement: newer }); nextShell.commit();
    nativePortal = tree.props.children[1];
    assert.equal(nativePortal.children.props.ref, newer.props.ref);
    assert.equal(nativePortal.children.props.onClick, newer.props.onClick);
    anchor.unmount(); nextBridge.unmount(); nextShell.unmount();
  } finally { h.restore(); }
});

test('owned native root catches a descendant failure, retains its fallback and recovers only the changed row', () => {
  const h = setup();
  try {
    h.exerciseBoundaryErrors();
    const notices = [];
    h.plugin.reportViewportDebugIssue = reason => notices.push(reason);
    h.plugin.messageRecord.n = { message: { id: 'n', channel_id: 'c' }, delete_data: { time: 1 } };
    let shouldFail = true;
    const Child = () => { if (shouldFail) throw new Error('native descendant'); return null; };
    let a = h.bridge({ render: () => React.createElement(Child) });
    const b = h.bridge({ message: h.plugin.messageRecord.n.message });
    h.visible(a.row); h.visible(b.row); h.tick();
    const entry = a.entry(), failedRoot = entry.nativeRoot, siblingRoot = b.entry().nativeRoot;
    assert.equal(entry.failed, true);
    assert.equal(failedRoot.output.props.children, 'Saved message could not be loaded.');
    assert.deepEqual(notices, ['row-hydration-failure']);
    a.unmount();
    a = h.bridge({ render: () => React.createElement(Child) });
    assert.equal(a.entry(), entry);
    assert.equal(entry.nativeRoot, failedRoot);
    assert.equal(failedRoot.output.props.children, 'Saved message could not be loaded.');
    assert.equal(notices.length, 1);
    h.visible(a.row);
    shouldFail = false;
    h.plugin.messageRecord.m.message.content = 'recover';
    h.plugin._viewportSession.invalidate('m', 'record-update'); h.tick();
    assert.equal(failedRoot.disposed, 1);
    assert.notEqual(entry.nativeRoot, failedRoot);
    assert.equal(entry.failed, false);
    assert.equal(b.entry().nativeRoot, siblingRoot);
    assert.equal(siblingRoot.disposed, 0);
    const oldBoundary = failedRoot.boundary;
    oldBoundary.componentDidCatch(new Error('obsolete root'));
    assert.equal(entry.failed, false);
    const currentBoundary = entry.nativeRoot.boundary;
    h.plugin._viewportSession.reset();
    currentBoundary.componentDidCatch(new Error('obsolete session'));
    assert.equal(notices.length, 1);
  } finally { h.restore(); }
});

test('warm native render factory failures stay inside the retained boundary', () => {
  const h = setup();
  try {
    const notices = [];
    h.plugin.reportViewportDebugIssue = reason => notices.push(reason);
    const body = h.bridge();
    h.visible(body.row); h.tick();
    const root = body.entry().nativeRoot;
    assert.doesNotThrow(() => body.commit({ render() { throw new Error('changed native envelope'); } }));
    assert.equal(body.entry().nativeRoot, root);
    assert.equal(root.output.props.children, 'Saved message could not be loaded.');
    assert.deepEqual(notices, ['row-hydration-failure']);
    body.unmount();
  } finally { h.restore(); }
});

for (const selected of [false, true]) test(`history reset clears the native portal while its ${selected ? 'selected' : 'normal'} shell stays mounted`, () => {
  const h = setup();
  try {
    const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
    const start = source.indexOf('    const EditHistoryContent =');
    const end = source.indexOf("    NativeHistoryBridge.displayName = 'MessageLoggerNativeHistoryBridge';", start);
    const components = vm.runInNewContext(`${source.slice(start, end)}\n({ RetainedHistoryAnchor, NativeHistoryBridge });`, {
      React, ReactDOM, document: global.document, Hooks: { useForceUpdate: () => [null, () => {}] },
      EditHistoryNativeAttachment() {}, DeletedContentTooltip() {}, SuffixEdited() {}
    });
    h.plugin.messageRecord.m.delete_data = null;
    h.plugin.messageRecord.m.edit_history = [{ content: 'previous', time: 1 }];
    h.plugin.editModifiers = selected ? { m: { editNum: 0 } } : {};
    const original = React.createElement('div', { id: 'message-content-m', ref: { current: null } }, [null, 'current']);
    const shell = h.mount(components.NativeHistoryBridge);
    const props = { plugin: h.plugin, messageId: 'm', originalElement: original, compact: false };
    let tree = shell.render(props); shell.commit();
    const bridge = h.bridge(tree.props.children[0].props);
    h.visible(bridge.row); h.tick();
    const oldOwner = bridge.entry();
    const oldAnchor = h.mount(components.RetainedHistoryAnchor);
    let anchorTree = oldAnchor.render({ plugin: h.plugin, owner: oldOwner, children: 'saved' });
    const oldTarget = new Element(); anchorTree.props.children[0].props.ref.current = oldTarget; oldAnchor.commit();
    tree = shell.render(props); shell.commit();
    assert.equal(tree.props.children[1].target, oldTarget);
    h.plugin._viewportSession.reset();
    tree = shell.render(props); shell.commit();
    const coldContent = tree.props.children[1];
    assert.equal(coldContent.portal, undefined);
    assert.equal(coldContent.props.id, original.props.id);
    assert.equal(coldContent.props.ref, original.props.ref);
    if (selected) assert.equal(coldContent.props.children, null);
    else assert.equal(coldContent, original);
    bridge.commit(tree.props.children[0].props);
    assert.equal(h.roots.length, 1, 'replacement remains cold until viewport admission');
    h.visible(bridge.row); h.tick();
    const newOwner = bridge.entry();
    assert.notEqual(newOwner, oldOwner);
    const nextAnchor = h.mount(components.RetainedHistoryAnchor);
    anchorTree = nextAnchor.render({ plugin: h.plugin, owner: newOwner, children: 'saved again' });
    const target = new Element(); anchorTree.props.children[0].props.ref.current = target; nextAnchor.commit();
    oldAnchor.unmount();
    tree = shell.render(props); shell.commit();
    assert.equal(tree.props.children[1].target, target, 'old cleanup cannot clear the replacement anchor');
    assert.equal(tree.props.children[1].children.props.ref, original.props.ref);
    nextAnchor.unmount(); bridge.unmount(); shell.unmount();
  } finally { h.restore(); }
});
