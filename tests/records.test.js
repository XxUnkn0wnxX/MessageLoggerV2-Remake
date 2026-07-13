const assert = require('node:assert/strict');
const test = require('node:test');

const {
  confirmationEvents,
  createPlugin,
  loggerEvents,
  ReactDOM,
  resetHarness
} = require('./helpers/plugin-harness');

function recordState() {
  const rootId = '100';
  const childId = '101';
  const root = {
    message: { id: rootId, channel_id: rootId },
    delete_data: { forum_thread_delete: true, hidden: false }
  };
  const child = {
    message: { id: childId, channel_id: rootId },
    delete_data: { hidden: false },
    edit_history: [{ content: 'before' }],
    edits_hidden: false
  };
  return { rootId, childId, root, child };
}

function createRecordPlugin() {
  const state = recordState();
  const dispatches = [];
  const plugin = createPlugin({
    messageRecord: { [state.rootId]: state.root, [state.childId]: state.child },
    messageRecordIds: new Set([state.rootId, state.childId]),
    deletedMessageRecord: { [state.rootId]: [state.rootId, state.childId] },
    editedMessageRecord: { [state.rootId]: [state.childId] },
    purgedMessageRecord: {},
    deletedMessageSet: new Map([[state.rootId, new Set([state.rootId, state.childId])]]),
    editedMessageSet: new Map([[state.rootId, new Set([state.childId])]]),
    purgedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    settings: { deleteCachedFilesWithRecords: false },
    dispatcher: { dispatch: event => dispatches.push(event) },
    removeForumCardFromDom() {},
    scheduleLoggerMenuRefresh() {},
    refreshForumThreadLogModal() {},
    saveData() {},
    showToast() {}
  });
  return { ...state, dispatches, plugin };
}

test.beforeEach(resetHarness);

test('hiding and unhiding a forum or thread root cascades to its children', () => {
  const { plugin, root, child, rootId, dispatches } = createRecordPlugin();

  assert.equal(plugin.setSavedThreadHidden(root, true), true);
  assert.equal(root.delete_data.hidden, true);
  assert.equal(child.delete_data.hidden, true);
  assert.equal(child.edits_hidden, true);
  assert.equal(plugin.suppressedForumThreadIds.has(rootId), true);
  assert.equal(dispatches.filter(event => event.type === 'MESSAGE_DELETE').length, 2);

  assert.equal(plugin.setSavedThreadHidden(root, false), true);
  assert.equal(root.delete_data.hidden, false);
  assert.equal(child.delete_data.hidden, false);
  assert.equal(child.edits_hidden, false);
  assert.equal(plugin.suppressedForumThreadIds.has(rootId), false);
});

test('removing a forum or thread root removes all indexed children', () => {
  const { plugin, rootId, childId } = createRecordPlugin();

  const removed = plugin.deleteMessageFromRecords(rootId);

  assert.deepEqual(new Set(removed), new Set([rootId, childId]));
  assert.deepEqual(plugin.messageRecord, {});
  assert.equal(plugin.messageRecordIds.size, 0);
  assert.deepEqual(plugin.deletedMessageRecord, {});
  assert.deepEqual(plugin.editedMessageRecord, {});
  assert.equal(plugin.deletedMessageSet.size, 0);
  assert.equal(plugin.editedMessageSet.size, 0);
  assert.equal(plugin.suppressedForumThreadIds.has(rootId), true);
});

test('suppressed root IDs accept only Discord-style numeric IDs and persist in payloads', () => {
  const plugin = createPlugin({
    messageRecord: {},
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    suppressedForumThreadIds: new Set()
  });

  assert.equal(plugin.suppressForumThreadId('123456789'), true);
  assert.equal(plugin.suppressForumThreadId('123456789'), false);
  assert.equal(plugin.suppressForumThreadId('not-an-id'), false);
  assert.deepEqual(plugin._getDataPayload().suppressedForumThreadIds, ['123456789']);
  assert.equal(plugin.unsuppressForumThreadId('123456789'), true);
});

test('forum and channel-thread context labels remain distinct', () => {
  const plugin = createPlugin({ tools: { getChannel: id => ({ id, type: id === 'forum' ? 15 : 0 }) } });
  const forum = {
    message: { id: '1' },
    delete_data: { forum_thread_delete: true, forum_parent_id: 'forum' }
  };
  const thread = {
    message: { id: '2' },
    delete_data: { forum_thread_delete: true, forum_parent_id: 'channel' }
  };

  assert.equal(plugin.getSavedThreadRootTypeLabel(forum), 'Forum Post');
  assert.equal(plugin.getSavedThreadVisibilityLabel(forum, true), 'Hide Forum Post');
  assert.equal(plugin.getSavedThreadRemovalLabel(forum), 'Remove Forum Post From Log');
  assert.equal(plugin.getSavedThreadRootTypeLabel(thread), 'Thread');
  assert.equal(plugin.getSavedThreadVisibilityLabel(thread, false), 'Unhide Thread');
});

test('newly captured records already match the canonical persisted shape', () => {
  const plugin = createPlugin({
    localUser: { id: 'local-user' },
    tools: { isMentioned: () => false },
    getMessageLocationSnapshot: () => null,
    cleanupMessageObject: message => structuredClone(message)
  });
  const message = {
    id: '100',
    channel_id: 'channel',
    guild_id: null,
    content: 'new record',
    timestamp: 100,
    attachments: [],
    embeds: [],
    author: { id: 'user', username: 'User', public_flags: 0 }
  };
  const savedRecord = plugin.createMiniFormattedData(message);
  const payload = {
    ...plugin.createDefaultDataPayload(),
    messageRecord: { '100': savedRecord },
    deletedMessageRecord: { channel: ['100'] }
  };
  const normalized = plugin.normalizePersistedDataPayload(payload);

  assert.deepEqual(savedRecord.logged_attachments, []);
  assert.equal(JSON.stringify(normalized), JSON.stringify(payload));
});

function createNativeDeletePlugin() {
  const messageId = '200';
  const channelId = '20';
  const record = {
    message: { id: messageId, channel_id: channelId },
    delete_data: { hidden: false }
  };
  const dispatches = [];
  let saves = 0;
  const plugin = createPlugin({
    messageRecord: { [messageId]: record },
    messageRecordIds: new Set([messageId]),
    deletedMessageRecord: { [channelId]: [messageId] },
    editedMessageRecord: {},
    purgedMessageRecord: {},
    deletedMessageSet: new Map([[channelId, new Set([messageId])]]),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    channelMessages: null,
    noTintIds: new Set([messageId]),
    editModifiers: { [messageId]: { editNum: 0 } },
    settings: { deleteCachedFilesWithRecords: false },
    dispatcher: { dispatch: event => dispatches.push(event) },
    scheduleLoggerMenuRefresh() {},
    refreshForumThreadLogModal() {},
    refreshLoggerMenu() {},
    saveData() { saves++; }
  });
  return { channelId, dispatches, getSaves: () => saves, messageId, plugin, record };
}

test('native Trash consumes only exact indexed saved deletions', () => {
  const { channelId, dispatches, getSaves, messageId, plugin } = createNativeDeletePlugin();
  plugin.messageRecord['201'] = {
    message: { id: '201', channel_id: channelId },
    edit_history: [{ content: 'old edit' }]
  };

  assert.equal(plugin.handleNativeSavedRecordDelete(channelId, '201'), false);
  assert.ok(plugin.messageRecord['201'], 'edit-only records must keep Discord native deletion');

  plugin.messageRecord['202'] = {
    message: { id: '202', channel_id: channelId },
    delete_data: { hidden: false }
  };
  assert.equal(plugin.handleNativeSavedRecordDelete(channelId, '202'), false);
  assert.ok(plugin.messageRecord['202'], 'unindexed legacy-shaped records must keep Discord native deletion');

  assert.equal(plugin.handleNativeSavedRecordDelete('wrong-channel', messageId), true);
  assert.ok(plugin.messageRecord[messageId], 'mismatched saved metadata must be preserved');
  assert.equal(loggerEvents.some(event => event[0] === 'warn' && String(event[1]).includes(messageId)), true);

  assert.equal(plugin.handleNativeSavedRecordDelete(channelId, messageId), true);
  assert.equal(plugin.messageRecord[messageId], undefined);
  assert.equal(plugin.deletedMessageRecord[channelId], undefined);
  assert.equal(plugin.noTintIds.has(messageId), false);
  assert.equal(plugin.editModifiers[messageId], undefined);
  assert.equal(getSaves(), 1);
  assert.deepEqual(dispatches, [{ type: 'MESSAGE_DELETE', id: messageId, channelId, ML2: true }]);
});

test('native MessageActions wrapper calls Discord only for non-logger deletions', () => {
  const run = ({ id, indexed = null, record = null, threadCreated = false }) => {
    const channelId = 'wrapper-channel';
    const plugin = createPlugin({
      messageRecord: record ? { [id]: record } : {},
      messageRecordIds: new Set(record ? [id] : []),
      deletedMessageRecord: indexed === 'deleted' ? { [channelId]: [id] } : {},
      purgedMessageRecord: indexed === 'purged' ? { [channelId]: [id] } : {},
      deletedMessageSet: new Map(indexed === 'deleted' ? [[channelId, new Set([id])]] : []),
      purgedMessageSet: new Map(indexed === 'purged' ? [[channelId, new Set([id])]] : []),
      editedMessageRecord: {},
      editedMessageSet: new Map(),
      channelMessages: null,
      noTintIds: new Set(),
      editModifiers: {},
      settings: { deleteCachedFilesWithRecords: false },
      dispatcher: { dispatch() {} },
      getCachedMessage: () => ({ type: threadCreated ? 18 : 0 }),
      isThreadCreatedSystemMessage: message => message?.type === 18,
      rememberLocalDeleteId() {},
      scheduleLoggerMenuRefresh() {},
      refreshForumThreadLogModal() {},
      saveData() {}
    });
    let originalCalls = 0;
    plugin.processNativeMessageDeleteAction([channelId, id], () => { originalCalls++; });
    return { originalCalls, plugin };
  };
  const saved = id => ({
    message: { id, channel_id: 'wrapper-channel' },
    delete_data: { hidden: false }
  });

  assert.equal(run({ id: 'live' }).originalCalls, 1);
  assert.equal(run({
    id: 'edit',
    record: { message: { id: 'edit', channel_id: 'wrapper-channel' }, edit_history: [{}] }
  }).originalCalls, 1);
  assert.equal(run({ id: 'unindexed', record: saved('unindexed') }).originalCalls, 1);
  assert.equal(run({ id: 'deleted', indexed: 'deleted', record: saved('deleted') }).originalCalls, 0);
  assert.equal(run({ id: 'purged', indexed: 'purged', record: saved('purged') }).originalCalls, 0);
  assert.equal(run({ id: 'thread-system', indexed: 'deleted', record: saved('thread-system'), threadCreated: true }).originalCalls, 1);
});

test('local Delete confirms without Shift and Shift activation removes immediately', () => {
  const normal = createNativeDeletePlugin();
  const stopped = { default: 0, immediate: 0, nativeImmediate: 0, propagation: 0 };
  assert.equal(normal.plugin.handleCopiedNativeDeleteActivation({
    shiftKey: false,
    preventDefault() { stopped.default++; },
    stopPropagation() { stopped.propagation++; },
    stopImmediatePropagation() { stopped.immediate++; },
    nativeEvent: { stopImmediatePropagation() { stopped.nativeImmediate++; } }
  }, normal.channelId, normal.messageId), true);
  assert.deepEqual(stopped, { default: 1, immediate: 1, nativeImmediate: 1, propagation: 1 });
  assert.equal(confirmationEvents.length, 1);
  assert.ok(normal.plugin.messageRecord[normal.messageId], 'opening confirmation must not remove the record');
  const [, content, options] = confirmationEvents[0];
  assert.match(content, /permanently deletes/i);
  assert.match(content, /local logger only/i);
  assert.equal(options.confirmText, 'Delete');
  assert.equal(options.danger, true);
  options.onConfirm();
  assert.equal(normal.plugin.messageRecord[normal.messageId], undefined);

  resetHarness();
  const shifted = createNativeDeletePlugin();
  assert.equal(shifted.plugin.handleCopiedNativeDeleteActivation({
    shiftKey: true,
    preventDefault() {},
    stopPropagation() {}
  }, shifted.channelId, shifted.messageId), true);
  assert.equal(confirmationEvents.length, 0);
  assert.equal(shifted.plugin.messageRecord[shifted.messageId], undefined);

  resetHarness();
  const mismatched = createNativeDeletePlugin();
  assert.equal(mismatched.plugin.requestSavedDeletedRecordRemoval('wrong-channel', mismatched.messageId, false), false);
  assert.equal(confirmationEvents.length, 0);
  assert.ok(mismatched.plugin.messageRecord[mismatched.messageId]);
});

test('logger-owned Trash visibility follows the Shift root marker', () => {
  const toggles = [];
  const previousDocument = global.document;
  global.document = {
    documentElement: {
      classList: {
        toggle(name, active) { toggles.push([name, active]); }
      }
    }
  };
  const plugin = createPlugin({ style: { shiftDeleteActive: 'shift-delete-active' } });
  try {
    assert.equal(plugin.setRestoredDeleteShiftActive(true), true);
    assert.equal(plugin._restoredDeleteShiftHeld, true);
    assert.equal(plugin.setRestoredDeleteShiftActive(false), false);
    assert.equal(plugin._restoredDeleteShiftHeld, false);
  } finally {
    global.document = previousDocument;
  }
  assert.deepEqual(toggles, [
    ['shift-delete-active', true],
    ['shift-delete-active', false]
  ]);
});

test('Trash removal of a restored forum or thread root cascades through its children', () => {
  const { childId, dispatches, plugin, rootId } = createRecordPlugin();
  let removedRoot = null;
  let saves = 0;
  plugin.channelMessages = null;
  plugin.removeForumCardFromDom = id => { removedRoot = id; };
  plugin.saveData = () => { saves++; };

  assert.equal(plugin.removeSavedDeletedRecordFromLog(rootId, rootId, { source: 'test Trash' }), true);
  assert.equal(plugin.messageRecord[rootId], undefined);
  assert.equal(plugin.messageRecord[childId], undefined);
  assert.equal(plugin.suppressedForumThreadIds.has(rootId), true);
  assert.equal(removedRoot, rootId);
  assert.equal(saves, 1);
  assert.deepEqual(dispatches.at(-1), { type: 'MESSAGE_DELETE', id: rootId, channelId: rootId, ML2: true });
});

test('Trash refreshes only a channel cache that was already mounted', () => {
  const uncached = createNativeDeletePlugin();
  let uncachedInvalidations = 0;
  let uncachedRefreshes = 0;
  uncached.plugin.channelMessages = {};
  uncached.plugin.invalidateChannelCache = () => { uncachedInvalidations++; };
  uncached.plugin.cacheChannelMessages = () => { uncachedRefreshes++; };
  uncached.plugin.removeSavedDeletedRecordFromLog(uncached.channelId, uncached.messageId);
  assert.equal(uncachedInvalidations, 0);
  assert.equal(uncachedRefreshes, 0);

  const cached = createNativeDeletePlugin();
  let cachedInvalidations = 0;
  let cachedRefreshes = 0;
  cached.plugin.channelMessages = { [cached.channelId]: [] };
  cached.plugin.invalidateChannelCache = () => { cachedInvalidations++; };
  cached.plugin.cacheChannelMessages = () => { cachedRefreshes++; };
  cached.plugin.removeSavedDeletedRecordFromLog(cached.channelId, cached.messageId);
  assert.equal(cachedInvalidations, 1);
  assert.equal(cachedRefreshes, 1);
});

test('native Delete control refresh keeps the replacement React root mounted', () => {
  const messageId = 'control-record';
  const attributes = {
    'data-ml2-message-id': messageId,
    'data-ml2-inline-delete-control': 'true'
  };
  const oldHost = {
    isConnected: true,
    contains(node) { return node === this; },
    getAttribute(name) { return attributes[name] ?? null; },
    replaceWith(node) { this.replacement = node; }
  };
  const replacementHost = { isConnected: false };
  const oldRoot = { unmounts: 0, unmount() { this.unmounts++; } };
  const replacementRoot = { unmounts: 0, unmount() { this.unmounts++; } };
  const plugin = createPlugin({
    messageRecord: {
      [messageId]: { message: { id: messageId, channel_id: 'channel' }, delete_data: {} }
    },
    _copiedDeleteControlRoots: new Map([[oldHost, oldRoot]])
  });
  plugin.createCopiedNativeDeleteControl = (_record, options) => {
    assert.equal(options.inline, true);
    plugin._copiedDeleteControlRoots.set(replacementHost, replacementRoot);
    return replacementHost;
  };
  const previousDocument = global.document;
  global.document = { querySelectorAll: () => [oldHost] };
  try {
    plugin.refreshCopiedNativeDeleteControls();
  } finally {
    global.document = previousDocument;
  }

  assert.equal(oldRoot.unmounts, 1);
  assert.equal(replacementRoot.unmounts, 0);
  assert.equal(oldHost.replacement, replacementHost);
  assert.equal(plugin._copiedDeleteControlRoots.has(oldHost), false);
  assert.equal(plugin._copiedDeleteControlRoots.has(replacementHost), true);
});

test('permission-independent Delete presentation uses a native toolbar shape and TrashIcon', () => {
  const svg = {
    getAttribute(name) {
      return {
        class: 'native-icon',
        width: '24',
        height: '24',
        viewBox: '0 0 24 24'
      }[name] ?? null;
    }
  };
  const reference = {
    tagName: 'BUTTON',
    querySelector: selector => selector === 'svg' ? svg : null,
    closest: () => null,
    getAttribute(name) {
      return {
        class: 'native-toolbar-button',
        role: 'button',
        tabindex: '-1'
      }[name] ?? null;
    }
  };
  const toolbar = { querySelectorAll: () => [reference] };
  let refreshes = 0;
  const plugin = createPlugin({
    getNativeMessageToolbarNodes: () => [toolbar],
    inspectNativeDeleteCandidate: () => null,
    getNativeDeleteIconComponent: () => function NativeTrashIcon() {},
    refreshCopiedNativeDeleteControls() { refreshes++; }
  });

  assert.equal(plugin.captureNativeDeleteButtonPresentation({}), true);
  assert.equal(plugin._nativeDeleteButtonPresentation.useNativeTrashIcon, true);
  assert.equal(plugin._nativeDeleteButtonPresentation.className, 'native-toolbar-button');
  assert.equal(plugin._nativeDeleteButtonPresentation.iconClassName, 'native-icon');
  assert.equal(plugin._nativeDeleteButtonPresentation.label, 'Delete');
  assert.equal(refreshes, 1);
});

test('native toolbar discovery includes the closest toolbar for nested action mutations', () => {
  const toolbarClass = 'buttons_hash';
  const toolbar = {
    nodeType: 1,
    parentElement: null,
    classList: { contains: value => value === toolbarClass },
    getElementsByClassName: () => []
  };
  const nestedActionWrapper = {
    nodeType: 1,
    parentElement: toolbar,
    classList: { contains: () => false },
    getElementsByClassName: () => [toolbar]
  };
  const plugin = createPlugin({ _nativeDeleteToolbarClass: toolbarClass });

  assert.deepEqual(plugin.getNativeMessageToolbarNodes(nestedActionWrapper), [toolbar]);
});

test('permission-independent toolbar fallback is owned only by exact indexed logger records', () => {
  const channelId = 'toolbar-channel';
  const deletedId = 'toolbar-deleted';
  const purgedId = 'toolbar-purged';
  const editId = 'toolbar-edit';
  const unindexedId = 'toolbar-unindexed';
  const saved = id => ({ message: { id, channel_id: channelId }, delete_data: { hidden: false } });
  const plugin = createPlugin({
    messageRecord: {
      [deletedId]: saved(deletedId),
      [purgedId]: saved(purgedId),
      [editId]: { message: { id: editId, channel_id: channelId }, edit_history: [{}] },
      [unindexedId]: saved(unindexedId)
    },
    deletedMessageRecord: { [channelId]: [deletedId] },
    purgedMessageRecord: { [channelId]: [purgedId] },
    deletedMessageSet: new Map([[channelId, new Set([deletedId])]]),
    purgedMessageSet: new Map([[channelId, new Set([purgedId])]]),
    inspectNativeDestructiveMessageCandidate: () => null
  });
  const makeToolbar = () => {
    const toolbar = {
      appendCount: 0,
      candidates: [],
      existing: null,
      querySelector: () => toolbar.existing,
      querySelectorAll: () => toolbar.candidates,
      appendChild(control) {
        toolbar.appendCount++;
        toolbar.existing = control;
      }
    };
    return toolbar;
  };
  plugin.createCopiedNativeDeleteControl = record => ({
    record,
    remove() { this.removed = true; }
  });

  const liveToolbar = makeToolbar();
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(liveToolbar, channelId, 'live'), false);
  assert.equal(liveToolbar.appendCount, 0);
  const editToolbar = makeToolbar();
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(editToolbar, channelId, editId), false);
  assert.equal(editToolbar.appendCount, 0);
  const unindexedToolbar = makeToolbar();
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(unindexedToolbar, channelId, unindexedId), false);
  assert.equal(unindexedToolbar.appendCount, 0);

  const deletedToolbar = makeToolbar();
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(deletedToolbar, channelId, deletedId), true);
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(deletedToolbar, channelId, deletedId), true);
  assert.equal(deletedToolbar.appendCount, 1, 'repeated toolbar mutations must not duplicate the fallback');
  const purgedToolbar = makeToolbar();
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(purgedToolbar, channelId, purgedId), true);
  assert.equal(purgedToolbar.appendCount, 1);

  const fallback = deletedToolbar.existing;
  deletedToolbar.candidates = [{}];
  plugin.inspectNativeDestructiveMessageCandidate = () => ({ label: 'Delete' });
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(deletedToolbar, channelId, deletedId), true);
  assert.equal(fallback.removed, true, 'a genuine native destructive action must replace the fallback');

  plugin.inspectNativeDestructiveMessageCandidate = () => null;
  purgedToolbar.existing = purgedToolbar.existing || plugin.createCopiedNativeDeleteControl(plugin.messageRecord[purgedId]);
  const removedFallback = purgedToolbar.existing;
  delete plugin.messageRecord[purgedId];
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(purgedToolbar, channelId, purgedId), false);
  assert.equal(removedFallback.removed, true, 'record removal must remove its toolbar fallback');
});

test('native Delete control cleanup stays scoped and force cleanup unmounts everything', () => {
  const childHost = { isConnected: false };
  const unrelatedHost = { isConnected: false };
  const childRoot = { unmounts: 0, unmount() { this.unmounts++; } };
  const unrelatedRoot = { unmounts: 0, unmount() { this.unmounts++; } };
  const plugin = createPlugin({
    _copiedDeleteControlRoots: new Map([
      [childHost, childRoot],
      [unrelatedHost, unrelatedRoot]
    ])
  });
  const removedSubtree = { contains: host => host === childHost };

  plugin.cleanupCopiedNativeDeleteControls(removedSubtree);
  assert.equal(childRoot.unmounts, 1);
  assert.equal(unrelatedRoot.unmounts, 0);
  assert.equal(plugin._copiedDeleteControlRoots.has(unrelatedHost), true);

  plugin.cleanupCopiedNativeDeleteControls(null, true);
  assert.equal(unrelatedRoot.unmounts, 1);
  assert.equal(plugin._copiedDeleteControlRoots.size, 0);
});

test('failed native Delete control render unmounts its partial React root', () => {
  let unmounts = 0;
  ReactDOM.createRoot = () => ({
    render() { throw new Error('render failed'); },
    unmount() { unmounts++; }
  });
  const attributes = new Map();
  const host = {
    setAttribute(name, value) { attributes.set(name, String(value)); },
    replaceChildren() {}
  };
  const plugin = createPlugin({
    style: { restoredDeleteButton: 'delete', restoredInlineDeleteButton: 'inline' },
    _nativeDeleteButtonPresentation: {
      tagName: 'button',
      className: 'native-button',
      role: '',
      label: 'Delete',
      innerHTML: '<svg></svg>',
      useNativeTrashIcon: false
    }
  });
  plugin.sanitizeNativeDeleteMarkup = markup => markup;
  const previousDocument = global.document;
  global.document = { createElement: () => host };
  try {
    assert.equal(plugin.createCopiedNativeDeleteControl({
      message: { id: 'failed', channel_id: 'channel' },
      delete_data: {}
    }), host);
  } finally {
    global.document = previousDocument;
  }

  assert.equal(unmounts, 1);
  assert.equal(attributes.get('data-ml2-pending-delete-control'), 'true');
  assert.equal(plugin._copiedDeleteControlRoots?.size || 0, 0);
});
