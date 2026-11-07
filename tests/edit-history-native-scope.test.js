const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPlugin } = require('./helpers/plugin-harness');

function renderEditHistory(filename = 'removed.pdf', options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('const EditHistoryContent =');
  const end = source.indexOf("EditHistoryContent.displayName = 'EditHistoryContent';", start);
  assert.ok(start >= 0 && end > start);
  const attachment = { id: '111111111111111111', filename, url: `https://cdn.discordapp.com/attachments/c/111111111111111111/${filename}` };
  const message = { id: 'm', channel_id: 'c', content: 'current text', attachments: [] };
  const record = { message, edit_history: [{ content: 'old text `Attachment Deleted: `' + attachment.url, time: 1 }], removed_attachments: [attachment] };
  if (options.edits) record.edit_history = options.edits(attachment);
  const Tooltip = props => props.children({});
  const plugin = createPlugin({
    __started: true, _startupGeneration: 1, messageRecord: { m: record }, _messageUpdateRegistry: new Map(),
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/selected' },
    tools: { createMomentObject: () => ({}) }, style: { edited: 'edited', editedCompact: 'edited-compact', editHistoryLayout: 'owned-layout' },
    Tooltip, createTimeStamp: () => 'time', shouldPresentEditedMessages: () => true, isEphemeralMessage: () => false
  });
  Object.assign(plugin.settings, options.settings || {});
  if (options.modifier) plugin.editModifiers = { m: options.modifier };
  if (options.cacheMissing) plugin.imageCacheServerSimulator.get = () => null;
  const realSegments = plugin.getEditHistoryContentSegments.bind(plugin);
  let planCalls = 0;
  plugin.getEditHistoryContentSegments = (...args) => {
    planCalls++;
    const segments = realSegments(...args);
    return options.transformSegments ? options.transformSegments(segments) : segments;
  };
  const ref = { current: null };
  const original = { type: 'div', props: { id: 'message-content-m', className: 'markup_native messageContent_native', ref, role: 'article', onClick: options.handler || (() => {}), children: [null, 'current text'] } };
  const Fragment = Symbol('fragment');
  const React = {
    Fragment,
    useEffect() {},
    createElement(type, props, ...children) { return { type, props: { ...(props || {}), ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }; },
    cloneElement(element, props, ...children) { return { type: element.type, props: { ...element.props, ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }; }
  };
  const Native = function EditHistoryNativeAttachment() {};
  const component = vm.runInNewContext(`${source.slice(start, end)}\nEditHistoryContent;`, {
    React, Hooks: { useForceUpdate: () => [null, () => {}] },
    EditHistoryNativeAttachment: Native, DeletedContentTooltip: () => {}, SuffixEdited: () => {}, DiscordModules: { ClickableClasses: {} }
  });
  const tree = component({ plugin, messageId: 'm', originalElement: original, compact: !!options.compact });
  return { tree, Native, original, ref, record, plugin, Tooltip, planCalls };
}

function inspectTree(node, visit, ancestors = []) {
  if (Array.isArray(node)) return node.forEach(item => inspectTree(item, visit, ancestors));
  if (!node || typeof node !== 'object') return;
  visit(node, ancestors);
  if (typeof node.type === 'function' && node.type.name === 'Tooltip') {
    inspectTree(node.type(node.props), visit, ancestors);
    return;
  }
  inspectTree(node.props?.children, visit, [...ancestors, node]);
}

test('cached native edit-history file cards live outside Discord message-content scopes', () => {
  for (const filename of ['removed.pdf', 'removed.mp3', 'removed.txt']) {
    const { tree, Native, original, ref } = renderEditHistory(filename);
    const nativeCards = [], originals = [];
    inspectTree(tree, (node, ancestors) => {
      if (node.props?.id === original.props.id) originals.push(node);
      if (node.type === Native) nativeCards.push({ node, ancestors });
    });
    assert.equal(originals.length, 1, 'the native content id must not be duplicated');
    assert.equal(originals[0].props.ref, ref);
    assert.equal(originals[0].props.role, 'article');
    assert.equal(nativeCards.length, 1, filename);
    assert.equal(nativeCards[0].ancestors.some(node =>
      node.props?.id === original.props.id
      || /(?:^|\s)(?:markup_|messageContent_)/.test(node.props?.className || '')), false, filename);
  }
});

test('mixed native cards retain text order, one native identity, and edited row semantics', () => {
  const handler = () => {};
  const view = renderEditHistory('removed.pdf', { handler, compact: true, edits: a => [{ content: 'before `Attachment Deleted: `' + a.url + ' after', time: 1 }] });
  const roots = [], cards = [], rows = [], fragments = [];
  inspectTree(view.tree, (node, ancestors) => {
    if (node.props?.id === view.original.props.id) roots.push(node);
    if (node.type === view.Native) cards.push({ node, ancestors });
    if (node.props?.editNum === 0) rows.push(node);
    if (typeof node.props?.children === 'string') fragments.push(node.props.children);
  });
  assert.equal(view.tree.props.className, 'owned-layout edited');
  assert.equal(view.tree.props.id, undefined);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].props.ref, view.ref);
  assert.equal(roots[0].props.onClick, handler);
  assert.equal(roots[0].props.className, view.original.props.className);
  assert.equal(cards.length, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].props.className, 'edited-compact edited');
  assert.equal(view.planCalls, 1);
  const children = rows[0].props.children;
  assert.equal(children.length, 3);
  assert.equal(children[0].props.children[0], 'before ');
  assert.equal(children[1].props.children.type, view.Native);
  assert.equal(children[2].props.children[0], ' after');
  assert.equal(cards[0].node.props.fallback.props.className, view.original.props.className);
  assert.equal(view.record.edit_history[0].content.includes('Attachment Deleted'), true);
});

test('modifier keeps exactly one native identity for text, suffix-only, and empty anchors', () => {
  for (const [hasText, noSuffix] of [[true, false], [false, false], [false, true]]) {
    const view = renderEditHistory('removed.pdf', {
      modifier: { editNum: 0, noSuffix },
      edits: a => [{ content: (hasText ? 'old ' : '') + '`Attachment Deleted: `' + a.url, time: 1 }]
    });
    const roots = [], cards = [], rows = [];
    inspectTree(view.tree, (node, ancestors) => {
      if (node.props?.id === view.original.props.id) roots.push(node);
      if (node.type === view.Native) cards.push({ node, ancestors });
      if (node.props?.editNum === 0) rows.push(node);
    });
    assert.equal(roots.length, 1);
    assert.equal(roots[0].props.ref, view.ref);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].ancestors.includes(roots[0]), false);
    assert.equal(rows[0].props.className, '');
    const rowChildren = rows[0].props.children;
    assert.equal(rowChildren.length, hasText && !noSuffix ? 3 : 2);
    assert.equal(rowChildren.some(child => child.props?.children === null), !hasText && noSuffix);
  }
});

test('visible edit limits choose native layout only when an admitted card is visible', () => {
  const edits = a => [{ content: 'older `Attachment Deleted: `' + a.url, time: 1 }, { content: 'newer text', time: 2 }];
  const newerOnly = renderEditHistory('removed.pdf', { edits, settings: { maxShownEdits: 1 } });
  assert.equal(newerOnly.tree.props.id, newerOnly.original.props.id);
  assert.equal(newerOnly.planCalls, 1);
  const olderOnly = renderEditHistory('removed.pdf', { edits, settings: { maxShownEdits: 1, hideNewerEditsFirst: true } });
  assert.equal(olderOnly.tree.props.className, 'owned-layout edited');
  assert.equal(olderOnly.planCalls, 1);
  const missing = renderEditHistory('removed.pdf', { cacheMissing: true });
  assert.equal(missing.tree.props.id, missing.original.props.id);
  for (const filename of ['removed.png', 'removed.mp4']) {
    const ordinary = renderEditHistory(filename);
    assert.equal(ordinary.tree.props.id, ordinary.original.props.id, filename);
  }
});

test('selected history rows retain order, tooltip content, suffixes, and current body', () => {
  const view = renderEditHistory('removed.pdf', { edits: a => [
    { content: 'first `Attachment Deleted: `' + a.url, time: 1 },
    { content: 'second text', time: 2 },
    { content: 'third text', time: 3 }
  ], settings: { maxShownEdits: 2, hideNewerEditsFirst: true } });
  const rows = [], tips = [], native = [], current = [];
  inspectTree(view.tree, node => {
    if (node.type === view.Tooltip) tips.push(node);
    if (node.props?.editNum !== undefined) rows.push(node);
    if (node.type === view.Native) native.push(node);
    if (node.props?.id === view.original.props.id) current.push(node);
  });
  assert.deepEqual(rows.map(node => node.props.editNum), [0, 1]);
  assert.deepEqual(tips.map(node => node.props.text), ['Edited: time', 'Edited: time']);
  assert.equal(native.length, 1);
  assert.equal(current.length, 1);
  assert.equal(current[0].props.children, 'current text');
  assert.equal(view.planCalls, 2);
  assert.equal(rows[0].props.children.at(-1).props.children.at(-1).props.timestamp instanceof Object, true);
  assert.equal(rows[1].props.children.at(-1).props.children.at(-1).props.timestamp instanceof Object, true);
});

test('mixed native layout retains fallback text for a media segment that cannot render', () => {
  const marker = '`Attachment Deleted: `https://example.com/unknown';
  const view = renderEditHistory('removed.pdf', {
    transformSegments: segments => [...segments, { kind: 'removedAttachment', attachment: {}, presentationPlan: { action: 'omit' }, value: marker }]
  });
  const nodes = [];
  inspectTree(view.tree, node => { if (node.props?.children === marker) nodes.push(node); });
  assert.equal(nodes.length, 1);
});
