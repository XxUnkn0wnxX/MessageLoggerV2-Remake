const assert = require('node:assert/strict');
const test = require('node:test');

const {
  confirmationEvents,
  ContextMenu,
  createPlugin,
  loggerEvents,
  Patcher,
  ReactDOM,
  resetHarness,
  Webpack
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
  const notifications = [];
  const plugin = createPlugin({
    messageRecord: { [state.rootId]: state.root, [state.childId]: state.child },
    messageRecordIds: new Set([state.rootId, state.childId]),
    deletedMessageRecord: { [state.rootId]: [state.rootId, state.childId] },
    editedMessageRecord: { [state.rootId]: [state.childId] },
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[state.rootId, new Set([state.rootId, state.childId])]]),
    editedMessageSet: new Map([[state.rootId, new Set([state.childId])]]),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    settings: { deleteCachedFilesWithRecords: false },
    dispatcher: { dispatch: event => dispatches.push(event) },
    removeForumCardFromDom() {},
    scheduleLoggerMenuRefresh() {},
    refreshForumThreadLogModal() {},
    saveData() {},
    _showNotification(...args) { notifications.push(args); }
  });
  return { ...state, dispatches, notifications, plugin };
}

function createForumUploadAsReplyPlugin(overrides = {}) {
  const threadId = overrides.threadId ?? '901';
  const channelType = overrides.channelType ?? 11;
  const baseMessage = {
    message: { id: threadId, channel_id: threadId },
    delete_data: { forum_thread_message_delete: true, hidden: false }
  };
  const messageStoreMessage = overrides.messageStoreMessage
    ?? { id: threadId, channel_id: threadId };
  return createPlugin({
    settings: {
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      ...(overrides.settings || {})
    },
    messageRecord: { [threadId]: overrides.record ?? baseMessage },
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[threadId, new Set([threadId])]]),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    tools: {
      getChannel: id => ({ id, type: channelType })
    },
    messageStore: {
      getMessage: (...args) => {
        const channelId = String(args?.[0] ?? '');
        const messageId = String(args?.[1] ?? '');
        if (String(channelId) !== threadId || String(messageId) !== threadId) return null;
        return overrides.getMessage?.(channelId, messageId) ?? messageStoreMessage;
      }
    },
    ...overrides.pluginOverrides
  });
}

function createSignedForumUploadPredicate(result = true) {
  const predicate = function forumUploadPredicate() {
    return result;
  };
  predicate.toString = () => [
    'castChannelIdAsMessageId',
    '.isForumPost()',
    '.ownerId',
    '.getCount('
  ].join(' ');
  return predicate;
}

test.beforeEach(resetHarness);

test('logger archive tabs ignore live-display master switches', () => {
  const channelId = 'channel';
  const plugin = createPlugin();
  plugin.installDataPayload({
    messageRecord: {
      deleted: {
        message: { id: 'deleted', channel_id: channelId, timestamp: 100 },
        delete_data: { time: 300 }
      },
      purged: {
        message: { id: 'purged', channel_id: channelId, timestamp: 200 },
        delete_data: { time: 400 }
      },
      edited: {
        message: { id: 'edited', channel_id: channelId, timestamp: 300 },
        edit_history: [{ time: 500, content: 'before' }]
      }
    },
    deletedMessageRecord: { [channelId]: ['deleted'] },
    editedMessageRecord: { [channelId]: ['edited'] },
    purgedMessageRecord: { [channelId]: ['purged'] },
    nukedMessageRecord: {},
    suppressedForumThreadIds: []
  });
  plugin.settings = {
    restoreDeletedMessages: false,
    showDeletedMessages: false,
    showPurgedMessages: false,
    showEditedMessages: false,
    reverseOrder: false,
    antiNukeEnabled: true
  };
  plugin.menu = { selectedTab: 'deleted', filter: '' };

  assert.deepEqual(plugin.getFilteredMessages(), ['deleted']);
  plugin.menu.selectedTab = 'purged';
  assert.deepEqual(plugin.getFilteredMessages(), ['purged']);
  plugin.menu.selectedTab = 'edited';
  assert.deepEqual(plugin.getFilteredMessages(), ['edited']);
});

test('logger viewer double-click jumps only valid non-interactive saved messages', () => {
  let doubleClick;
  let mouseDown;
  const interactive = {};
  const element = {
    addEventListener(type, handler) {
      if (type === 'dblclick') doubleClick = handler;
      if (type === 'mousedown') mouseDown = handler;
    },
    contains(node) { return node === interactive; }
  };
  const record = { message: { id: 'message', channel_id: 'channel' } };
  const jumps = [];
  const plugin = createPlugin({ menu: { deleteKeyDown: false } });
  plugin.canJumpToSavedRecord = candidate => candidate === record && candidate.valid !== false;
  plugin.jumpToSavedRecord = candidate => jumps.push(candidate);

  assert.equal(plugin.wireLoggerViewerDoubleClick(element, record), true);
  assert.equal(typeof doubleClick, 'function');
  assert.equal(typeof mouseDown, 'function');

  let prevented = 0;
  let stopped = 0;
  const plainEvent = {
    target: { closest: () => null },
    preventDefault() { prevented++; },
    stopPropagation() { stopped++; }
  };
  mouseDown({ ...plainEvent, detail: 1 });
  assert.equal(prevented, 0, 'an ordinary click must retain its native behavior');
  mouseDown({ ...plainEvent, detail: 2 });
  assert.equal(prevented, 1, 'the second row press must not begin browser selection');
  doubleClick(plainEvent);
  assert.deepEqual(jumps, [record]);
  assert.equal(prevented, 2);
  assert.equal(stopped, 1);

  record.valid = false;
  mouseDown({ ...plainEvent, detail: 2 });
  doubleClick(plainEvent);
  assert.equal(jumps.length, 1);
  assert.equal(prevented, 2);

  record.valid = true;
  const directMediaEvent = {
    detail: 2,
    target: { closest: selector => selector.includes('img') ? interactive : null },
    preventDefault() { prevented++; }
  };
  mouseDown(directMediaEvent);
  doubleClick(directMediaEvent);
  assert.equal(jumps.length, 1);
  assert.equal(prevented, 2, 'direct media must retain its viewer action');

  const attachmentBlankEvent = {
    detail: 2,
    target: {
      closest: selector => selector.includes('data-ml2-attachment-message-id') ? interactive : null
    },
    preventDefault() { prevented++; },
    stopPropagation() { stopped++; }
  };
  mouseDown(attachmentBlankEvent);
  doubleClick(attachmentBlankEvent);
  assert.deepEqual(jumps, [record, record], 'blank space beside media remains part of the row');
  assert.equal(prevented, 4);
  assert.equal(stopped, 2);

  plugin.menu.deleteKeyDown = true;
  mouseDown({ ...plainEvent, detail: 2 });
  doubleClick(plainEvent);
  assert.equal(jumps.length, 2);
  assert.equal(prevented, 4);
  assert.equal(plugin.wireLoggerViewerDoubleClick(element, null), false);
});

test('logger viewer marks only jumpable saved-message authors', () => {
  const added = [];
  const author = { classList: { add: value => added.push(value) } };
  const valid = { message: { id: 'valid', channel_id: 'channel' } };
  const unavailable = { message: { id: 'unavailable', channel_id: 'deleted-channel' } };
  const plugin = createPlugin({ style: { jumpAvailableAuthor: 'jump-available' } });
  plugin.canJumpToSavedRecord = record => record === valid;

  assert.equal(plugin.markLoggerViewerJumpAvailableAuthor(author, valid), true);
  assert.equal(plugin.markLoggerViewerJumpAvailableAuthor(author, unavailable), false);
  assert.equal(plugin.markLoggerViewerJumpAvailableAuthor(null, valid), false);
  assert.deepEqual(added, ['jump-available']);
});

test('should route forum upload as reply only for eligible forum thread self-keys', () => {
  const plugin = createForumUploadAsReplyPlugin();
  assert.equal(plugin.shouldRouteForumUploadAsReply('901'), true);
});

test('shouldRouteForumUploadAsReply false when required forum-thread routing guards fail', () => {
  const invalidThreadId = createForumUploadAsReplyPlugin({
    threadId: 'bad-thread',
    channelType: 10
  });
  assert.equal(invalidThreadId.shouldRouteForumUploadAsReply('bad-thread'), false);

  const nonForumChannel = createForumUploadAsReplyPlugin({
    threadId: '909',
    channelType: 0
  });
  assert.equal(nonForumChannel.shouldRouteForumUploadAsReply('909'), false);

  const hiddenBySettings = createForumUploadAsReplyPlugin({
    threadId: '902',
    settings: { showDeletedMessages: false, restoreDeletedMessages: true }
  });
  assert.equal(hiddenBySettings.shouldRouteForumUploadAsReply('902'), false);

  const hiddenRecord = createForumUploadAsReplyPlugin({
    threadId: '910',
    record: {
      message: { id: '910', channel_id: '910' },
      delete_data: { forum_thread_message_delete: true, hidden: true }
    }
  });
  assert.equal(hiddenRecord.shouldRouteForumUploadAsReply('910'), false);

  const restoreDisabled = createForumUploadAsReplyPlugin({
    threadId: '911',
    settings: { showDeletedMessages: true, restoreDeletedMessages: false }
  });
  assert.equal(restoreDisabled.shouldRouteForumUploadAsReply('911'), false);

  const missingUploadMarker = createForumUploadAsReplyPlugin({
    threadId: '903',
    record: {
      message: { id: '903', channel_id: '903' },
      delete_data: { forum_thread_message_delete: false, hidden: false }
    }
  });
  assert.equal(missingUploadMarker.shouldRouteForumUploadAsReply('903'), false);

  const threadDeleteMarker = createForumUploadAsReplyPlugin({
    threadId: '904',
    record: {
      message: { id: '904', channel_id: '904' },
      delete_data: { forum_thread_message_delete: true, forum_thread_delete: true, hidden: false }
    }
  });
  assert.equal(threadDeleteMarker.shouldRouteForumUploadAsReply('904'), false);

  const missingCacheRoot = createForumUploadAsReplyPlugin({
    threadId: '905',
    pluginOverrides: {
      messageStore: { getMessage: () => null }
    }
  });
  assert.equal(missingCacheRoot.shouldRouteForumUploadAsReply('905'), false);

  const cacheMismatch = createForumUploadAsReplyPlugin({
    threadId: '906',
    messageStoreMessage: { id: '905', channel_id: '906' }
  });
  assert.equal(cacheMismatch.shouldRouteForumUploadAsReply('906'), false);

  const messageRecordMismatch = createForumUploadAsReplyPlugin({
    threadId: '907',
    record: {
      message: { id: '908', channel_id: '908' },
      delete_data: { forum_thread_message_delete: true, hidden: false }
    }
  });
  assert.equal(messageRecordMismatch.shouldRouteForumUploadAsReply('907'), false);
});

test('forum upload predicate discovery requires one exact signed export', () => {
  const plugin = createPlugin();
  const signed = createSignedForumUploadPredicate();

  assert.deepEqual(plugin._findForumUploadAsReplyExport({ xz: signed }), {
    key: 'xz',
    fn: signed
  });
  assert.equal(plugin._findForumUploadAsReplyExport({
    first: signed,
    second: createSignedForumUploadPredicate()
  }), null);
  assert.equal(plugin._findForumUploadAsReplyExport({
    xz() {
      return 'castChannelIdAsMessageId .isForumPost() ownerId .getCount(';
    }
  }), null);
});

test('forum upload route patch preserves native results and suppresses only eligible restored starters', () => {
  const plugin = createForumUploadAsReplyPlugin();
  const targetModule = { xz: createSignedForumUploadPredicate() };
  let patchCallback;
  Patcher.instead = (module, key, callback) => {
    assert.equal(module, targetModule);
    assert.equal(key, 'xz');
    patchCallback = callback;
    return () => {};
  };
  plugin.__started = true;
  plugin.unpatches = [];
  plugin._forumUploadAsReplyPatchGeneration = 3;
  plugin._forumUploadAsReplySendPatchInstalled = true;
  plugin.shouldRouteForumUploadAsReply = threadId => threadId === '901';

  plugin._patchForumUploadAsReplyRouteForModule(targetModule, 3);

  assert.equal(plugin._forumUploadAsReplyPatchInstalled, true);
  assert.equal(plugin.unpatches.length, 1);
  assert.equal(typeof patchCallback, 'function');

  const thisValue = { marker: 'native-this' };
  const nativeResults = [];
  const original = function originalPredicate(value) {
    nativeResults.push({ thisValue: this, value });
    return value;
  };
  assert.equal(patchCallback(thisValue, [false, '901'], original), false);
  assert.equal(patchCallback(thisValue, [true, '902'], original), true);
  assert.equal(patchCallback(thisValue, [true, '901'], original), false);
  plugin._forumUploadAsReplySendPatchInstalled = false;
  assert.equal(patchCallback(thisValue, [true, '901'], original), true);
  assert.deepEqual(nativeResults, [
    { thisValue, value: false },
    { thisValue, value: true },
    { thisValue, value: true },
    { thisValue, value: true }
  ]);
});

test('forum upload route patch sets a one-shot sendMessage bypass token', () => {
  const plugin = createForumUploadAsReplyPlugin();
  const targetModule = { xz: createSignedForumUploadPredicate() };
  let patchCallback;
  Patcher.instead = (module, key, callback) => {
    assert.equal(module, targetModule);
    assert.equal(key, 'xz');
    patchCallback = callback;
    return () => {};
  };
  plugin.__started = true;
  plugin.unpatches = [];
  plugin._forumUploadAsReplyBypassGeneration = 0;
  plugin._forumUploadAsReplyPatchGeneration = 3;
  plugin._forumUploadAsReplySendPatchInstalled = true;
  plugin.shouldRouteForumUploadAsReply = threadId => threadId === '901';

  plugin._patchForumUploadAsReplyRouteForModule(targetModule, 3);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.size, 0);
  assert.equal(plugin._consumeForumUploadAsReplyBypassToken('901'), false);

  const original = value => value;
  assert.equal(patchCallback({}, [true, '901'], original), false);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.has('901'), true);
  assert.equal(plugin._consumeForumUploadAsReplyBypassToken('901'), true);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.size, 0);
});

test('forum upload sendMessage bypass uses one-shot token only for matching media uploads', () => {
  const plugin = createPlugin();
  plugin.unpatches = [];
  plugin._forumUploadAsReplyBypassGeneration = 0;
  plugin._forumUploadAsReplyBypassTokens = new Map();

  let sendMessagePatch;
  const sendModule = { sendMessage: () => {} };
  Patcher.instead = (module, key, callback) => {
    if (module === sendModule && key === 'sendMessage') {
      sendMessagePatch = callback;
    }
    return () => {};
  };

  plugin._patchForumUploadAsReplySendMessageForModule(sendModule);
  assert.equal(typeof sendMessagePatch, 'function');

  plugin._forumUploadAsReplyBypassTokens.set('901', {
    generation: 0,
    expiresAt: Date.now() + 100000
  });

  let result;
  result = sendMessagePatch({}, ['901', 'body', true, { attachmentsToUpload: ['media-a'] }], (...args) => args);
  assert.deepEqual(result, ['901', 'body', false, { attachmentsToUpload: ['media-a'] }]);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.size, 0);
  assert.equal(plugin._consumeForumUploadAsReplyBypassToken('901'), false);

  result = sendMessagePatch({}, ['901', 'body', true, { attachmentsToUpload: ['media-b'] }], (...args) => args);
  assert.deepEqual(result, ['901', 'body', true, { attachmentsToUpload: ['media-b'] }]);
});

test('forum upload sendMessage bypass token is not consumed by wrong-thread or text-only sends', () => {
  const plugin = createPlugin();
  plugin.unpatches = [];
  plugin._forumUploadAsReplyBypassGeneration = 0;
  plugin._forumUploadAsReplyBypassTokens = new Map();

  let sendMessagePatch;
  const sendModule = { sendMessage: () => {} };
  Patcher.instead = (module, key, callback) => {
    if (module === sendModule && key === 'sendMessage') {
      sendMessagePatch = callback;
    }
    return () => {};
  };

  plugin._patchForumUploadAsReplySendMessageForModule(sendModule);
  plugin._forumUploadAsReplyBypassTokens.set('901', {
    generation: 0,
    expiresAt: Date.now() + 100000
  });

  const wrongThread = sendMessagePatch({}, ['902', 'body', true, { attachmentsToUpload: ['media-a'] }], (...args) => args);
  assert.deepEqual(wrongThread, ['902', 'body', true, { attachmentsToUpload: ['media-a'] }]);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.has('901'), true);
  const textOnly = sendMessagePatch({}, ['901', 'body', true, {}], (...args) => args);
  assert.deepEqual(textOnly, ['901', 'body', true, {}]);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.has('901'), true);
  const media = sendMessagePatch({}, ['901', 'body', true, { attachmentsToUpload: ['media-b'] }], (...args) => args);
  assert.deepEqual(media, ['901', 'body', false, { attachmentsToUpload: ['media-b'] }]);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.size, 0);
});

test('forum upload sendMessage bypass token ignores stale entries', () => {
  const plugin = createPlugin();
  plugin._forumUploadAsReplyBypassGeneration = 0;
  plugin._forumUploadAsReplyBypassTokens = new Map([
    ['901', { generation: 0, expiresAt: Date.now() - 1 }]
  ]);

  assert.equal(plugin._consumeForumUploadAsReplyBypassToken('901'), false);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.has('901'), false);
});

test('forum upload route patch failure leaves native behavior active', () => {
  const plugin = createPlugin();
  const targetModule = { xz: createSignedForumUploadPredicate() };
  Patcher.instead = () => {
    throw new Error('read-only export');
  };
  plugin.__started = true;
  plugin.unpatches = [];
  plugin._forumUploadAsReplyPatchGeneration = 4;
  plugin._forumUploadAsReplySendPatchInstalled = true;

  assert.doesNotThrow(() => {
    plugin._patchForumUploadAsReplyRouteForModule(targetModule, 4);
  });
  assert.equal(plugin._forumUploadAsReplyPatchInstalled, false);
  assert.deepEqual(plugin.unpatches, []);
  assert.equal(
    loggerEvents.some(event => event[0] === 'error'
      && String(event[1]).includes('default Discord behavior remains active')),
    true
  );
});

test('forum upload route lazy discovery follows BetterDiscord waitForModule promise API', async () => {
  const plugin = createPlugin();
  const targetModule = { xz: createSignedForumUploadPredicate() };
  let resolveModule;
  let waitArguments;
  const patched = [];
  Webpack.getModule = (filter, options) => {
    assert.equal(typeof filter, 'function');
    assert.deepEqual(options, { searchExports: false });
    return null;
  };
  Webpack.waitForModule = function waitForModule(...args) {
    waitArguments = args;
    return new Promise(resolve => {
      resolveModule = resolve;
    });
  };
  plugin.__started = true;
  plugin._forumUploadAsReplySendPatchInstalled = true;
  plugin._patchForumUploadAsReplyRouteForModule = (...args) => patched.push(args);

  plugin.patchForumUploadAsReplyRoute();

  assert.equal(waitArguments.length, 2);
  assert.equal(typeof waitArguments[0], 'function');
  assert.equal(waitArguments[1].searchExports, false);
  assert.equal(waitArguments[1].signal instanceof AbortSignal, true);
  const patchGeneration = plugin._forumUploadAsReplyPatchGeneration;
  resolveModule(targetModule);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(patched, [[targetModule, patchGeneration]]);
  assert.equal(plugin._forumUploadAsReplyAbortController, null);
});

test('forum upload sendMessage patch returns false when MessageActions is missing or not patchable', () => {
  const plugin = createPlugin();
  plugin.unpatches = [];

  assert.equal(
    plugin._patchForumUploadAsReplySendMessageForModule({}),
    false
  );
  assert.equal(plugin._forumUploadAsReplySendPatchInstalled, false);

  Patcher.instead = () => {
    throw new Error('read-only export');
  };
  assert.equal(
    plugin._patchForumUploadAsReplySendMessageForModule({ sendMessage: () => {} }),
    false
  );
  assert.equal(plugin._forumUploadAsReplySendPatchInstalled, false);
  assert.equal(
    loggerEvents.some(event => event[0] === 'error'
      && String(event[1]).includes('Could not patch forum upload sendMessage bypass logic')),
    true
  );
});

test('forum upload sendMessage patch is idempotent once installed', () => {
  const plugin = createPlugin();
  plugin.unpatches = [];
  const sendModule = { sendMessage: () => {} };
  let callCount = 0;
  Patcher.instead = () => {
    callCount += 1;
    return () => {};
  };

  assert.equal(
    plugin._patchForumUploadAsReplySendMessageForModule(sendModule),
    true
  );
  assert.equal(
    plugin._patchForumUploadAsReplySendMessageForModule(sendModule),
    true
  );
  assert.equal(callCount, 1);
  assert.equal(plugin._forumUploadAsReplySendPatchInstalled, true);
});

test('forum upload sendMessage prerequisite installs before route discovery during startup', () => {
  const source = createPlugin().initialize.toString();
  const sendPatchIndex = source.indexOf(
    'this._patchForumUploadAsReplySendMessageForModule(DiscordModules.MessageActions)'
  );
  const routePatchIndex = source.indexOf('this.patchForumUploadAsReplyRoute()');

  assert.notEqual(sendPatchIndex, -1);
  assert.notEqual(routePatchIndex, -1);
  assert.equal(sendPatchIndex < routePatchIndex, true);
});

test('forum upload state resets during stop', () => {
  const plugin = createPlugin();
  plugin._forumUploadAsReplyPatchInstalled = true;
  plugin._forumUploadAsReplySendPatchInstalled = true;
  plugin._forumUploadAsReplyPatchGeneration = 10;
  plugin._forumUploadAsReplyBypassGeneration = 10;
  plugin._forumUploadAsReplyBypassTokens = new Map([
    ['901', { generation: 10, expiresAt: Date.now() + 100000 }]
  ]);
  let aborted = false;
  plugin._forumUploadAsReplyAbortController = { abort: () => aborted = true };

  plugin.stop();

  assert.equal(plugin._forumUploadAsReplyPatchInstalled, false);
  assert.equal(plugin._forumUploadAsReplySendPatchInstalled, false);
  assert.equal(plugin._forumUploadAsReplyPatchGeneration, 11);
  assert.equal(plugin._forumUploadAsReplyBypassGeneration, 11);
  assert.equal(plugin._forumUploadAsReplyBypassTokens.size, 0);
  assert.equal(aborted, true);
  assert.equal(plugin._forumUploadAsReplyAbortController, null);
});

test('stop restores archive presentation state and clears logger-only DOM artifacts', () => {
  const previousDocument = global.document;
  const cleanupCopies = [];
  const dispatched = [];
  const invalidated = [];
  const structuralRemovals = [];
  const removed = [];
  const classRemovals = [];
  const shiftCalls = [];
  const stopOrder = [];
  let closedMenus = 0;
  const nativeSection = {
    textContent: 'Joined Threads',
    hasAttribute() { return false; },
    getBoundingClientRect() { return { height: 12 }; }
  };
  const nativeCard = {
    hasAttribute() { return false; },
    querySelector(selector) {
      return selector === 'h2 [class*="threadName_"]'
        || selector === '[id^="message-content-"]'
        ? {}
        : null;
    },
    getBoundingClientRect() { return { height: 40 }; }
  };
  const threadBrowserParent = {
    style: { height: '180px' },
    children: [nativeSection],
    querySelectorAll(selector) {
      return selector === 'div[role="button"]' ? [nativeCard] : [];
    }
  };
  const style = {
    deleted: 'logger-deleted',
    deletedAlt: 'logger-deleted-alt',
    deletedForumText: 'logger-deleted-forum'
  };
  const threadRecordId = 'thread-channel';
  const structuralRecordId = '444';
  const normalMessageId = 'normal-message';
  const normalChannelId = 'normal-channel';
  const createQueryNode = (name) => ({
    label: name,
    remove() {
      removed.push(name);
    }
  });
  const createClassNode = cls => ({
    classList: {
      remove(value) {
        classRemovals.push(value);
      }
    }
  });
  const nativeHost = createQueryNode('native-host');
  const nodes = {
    '[data-ml2-native-delete-host="true"]': [nativeHost],
    '[data-ml2-restored-forum-thread]': [createQueryNode('restored-forum-thread')],
    '[data-ml2-restored-forum-card]': [createQueryNode('restored-forum-card')],
    '[data-ml2-restored-thread-entry]': [createQueryNode('restored-thread-entry')],
    '[data-ml2-restored-thread-browser-card]': [Object.assign(createQueryNode('restored-thread-browser-card'), {
      parentElement: threadBrowserParent
    })],
    '[data-ml2-restored-thread-browser-section]': [Object.assign(createQueryNode('restored-thread-browser-section'), {
      parentElement: threadBrowserParent
    })],
    '.logger-deleted': [createClassNode(style.deleted)],
    '.logger-deleted-alt': [createClassNode(style.deletedAlt)],
    '.logger-deleted-forum': [createClassNode(style.deletedForumText)]
  };

  global.document = {
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll(selector) {
      return nodes[selector] || [];
    }
  };

  const plugin = createPlugin({
    settings: { dontSaveData: true },
    __started: true,
    messageRecord: {
      [threadRecordId]: {
        message: { id: threadRecordId, channel_id: threadRecordId },
        delete_data: { forum_thread_message_delete: true, hidden: false }
      },
      [normalMessageId]: {
        message: { id: normalMessageId, channel_id: normalChannelId },
        delete_data: { hidden: false }
      },
      [structuralRecordId]: {
        message: { id: structuralRecordId, channel_id: structuralRecordId },
        delete_data: { forum_thread_delete: true, hidden: false }
      }
    },
    deletedMessageRecord: {
      [threadRecordId]: [threadRecordId],
      [normalChannelId]: [normalMessageId],
      [structuralRecordId]: [structuralRecordId]
    },
    purgedMessageRecord: {},
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    dispatcher: { dispatch: event => dispatched.push(event) },
    tools: {
      getChannel: id => ({
        id,
        type: id === threadRecordId || id === structuralRecordId ? 11 : 0
      })
    },
    shouldPresentSavedMessage: () => true,
    _invalidateAndRecache: channelId => invalidated.push(channelId),
    cleanupCopiedNativeDeleteControls(host, force) {
      cleanupCopies.push([host, force]);
    },
    setRestoredDeleteShiftActive(value) {
      shiftCalls.push(value);
    },
    removeRestoredForumThreadMountsFromDom(id) {
      structuralRemovals.push(id);
    },
    removeOpenLogsButton() {},
    _clearNativeNotificationQueue() {},
    forceUpdateUI() {},
    _replaceableToasts: null,
    _copiedDeleteControlRoots: new Map()
  });
  plugin.style = style;
  plugin._messageUpdateRegistry = null;
  const cleanupPresentation = plugin.cleanupArchivePresentationForDisable.bind(plugin);
  plugin.cleanupArchivePresentationForDisable = state => {
    stopOrder.push(`cleanup:${plugin.__started}`);
    return cleanupPresentation(state);
  };
  plugin.unpatches = [() => stopOrder.push(`unpatch:${plugin.__started}`)];
  ContextMenu.close = () => { closedMenus++; };
  const recordsBefore = structuredClone(plugin.messageRecord);
  const indexesBefore = structuredClone(plugin.deletedMessageRecord);

  try {
    plugin.stop();
  } finally {
    global.document = previousDocument;
  }

  assert.deepEqual(invalidated, [threadRecordId]);
  assert.deepEqual(
    dispatched.map(event => [event.type, event.id, event.channelId, event.ML2]).sort(),
    [
      ['MESSAGE_DELETE', normalMessageId, normalChannelId, true],
      ['MESSAGE_DELETE', structuralRecordId, structuralRecordId, true]
    ].sort()
  );
  assert.deepEqual(structuralRemovals, [structuralRecordId]);
  assert.equal(removed.includes('native-host'), true);
  assert.equal(removed.includes('restored-forum-thread'), true);
  assert.equal(removed.includes('restored-forum-card'), true);
  assert.equal(removed.includes('restored-thread-entry'), true);
  assert.equal(removed.includes('restored-thread-browser-card'), true);
  assert.equal(removed.includes('restored-thread-browser-section'), true);
  assert.equal(shiftCalls.includes(false), true);
  assert.equal(cleanupCopies.length, 1);
  assert.equal(cleanupCopies[0][0], nativeHost);
  assert.equal(cleanupCopies[0][1], true);
  assert.equal(threadBrowserParent.style.height, '52px');
  assert.equal(classRemovals.includes(style.deleted), true);
  assert.equal(classRemovals.includes(style.deletedAlt), true);
  assert.equal(classRemovals.includes(style.deletedForumText), true);
  assert.equal(closedMenus, 1);
  assert.deepEqual(stopOrder, ['cleanup:true', 'unpatch:false']);
  assert.deepEqual(plugin.messageRecord, recordsBefore);
  assert.deepEqual(plugin.deletedMessageRecord, indexesBefore);
});

test('stop remains fail-safe when presentation capture throws', () => {
  const plugin = createPlugin({
    __started: true,
    settings: { dontSaveData: true },
    captureArchiveLoadPresentationState() {
      throw new Error('presentation unavailable');
    },
    cleanupArchivePresentationForDisable(state) {
      assert.deepEqual(state, { visibleDeletionMounts: [] });
    },
    removeOpenLogsButton() {},
    _clearNativeNotificationQueue() {},
    forceUpdateUI() {},
    unpatches: []
  });

  assert.doesNotThrow(() => plugin.stop());
  assert.equal(plugin.__started, false);
});

test('stop still unpatches when presentation cleanup throws', () => {
  const previousDocument = global.document;
  let unpatched = false;
  global.document = {
    querySelector() { return null; },
    removeEventListener() {}
  };
  const plugin = createPlugin({
    __started: true,
    settings: { dontSaveData: true },
    captureArchiveLoadPresentationState() {
      return { visibleDeletionMounts: [] };
    },
    cleanupArchivePresentationForDisable() {
      throw new Error('cleanup unavailable');
    },
    removeOpenLogsButton() {},
    _clearNativeNotificationQueue() {},
    forceUpdateUI() {},
    unpatches: [() => { unpatched = true; }]
  });

  try {
    assert.doesNotThrow(() => plugin.stop());
  } finally {
    global.document = previousDocument;
  }
  assert.equal(plugin.__started, false);
  assert.equal(unpatched, true);
});

test('hidden records and unanchored deleted forum or thread roots have no jump mount point', t => {
  const previousDocument = global.document;
  t.after(() => { global.document = previousDocument; });

  const parentId = '500';
  const forumRootId = '501';
  const threadRootId = '502';
  const channels = {
    [parentId]: { id: parentId, type: 15, guild_id: 'guild' },
    [forumRootId]: { id: forumRootId, type: 11, parent_id: parentId, guild_id: 'guild' },
    [threadRootId]: { id: threadRootId, type: 11, parent_id: '600', guild_id: 'guild' },
    600: { id: '600', type: 0, guild_id: 'guild' }
  };
  const plugin = createPlugin({
    tools: { getChannel: id => channels[id] || null }
  });
  const forumRoot = {
    message: { id: forumRootId, channel_id: forumRootId, guild_id: 'guild' },
    delete_data: {
      forum_thread_delete: true,
      forum_parent_id: parentId,
      forum_metadata: { parentId, parentType: 15, isForumParent: true }
    }
  };
  const threadRoot = {
    message: { id: threadRootId, channel_id: threadRootId, guild_id: 'guild' },
    delete_data: {
      forum_thread_delete: true,
      forum_parent_id: '600',
      forum_metadata: { parentId: '600', parentType: 0, isForumParent: false }
    }
  };
  plugin.settings = {
    restoreDeletedMessages: true,
    showDeletedMessages: true,
    showPurgedMessages: true,
    showEditedMessages: true
  };
  plugin.messageRecord = {
    [forumRootId]: forumRoot,
    [threadRootId]: threadRoot
  };
  plugin.deletedMessageSet = new Map([
    [forumRootId, new Set([forumRootId])],
    [threadRootId, new Set([threadRootId])]
  ]);
  plugin.purgedMessageSet = new Map();

  global.document = {
    querySelector: () => null,
    querySelectorAll: () => []
  };
  assert.equal(plugin.canJumpToSavedRecord(forumRoot), false, 'a cached deleted post without a native card anchor is not jumpable');
  assert.equal(plugin.canJumpToSavedRecord(threadRoot), false, 'a cached deleted thread without a native thread anchor is not jumpable');

  const sourceCard = { hasAttribute: () => false };
  global.document.querySelectorAll = selector => selector.includes(`forum-channel-list-${parentId}___`)
    ? [{ closest: () => sourceCard }]
    : [];
  assert.equal(plugin.canJumpToSavedRecord(forumRoot), true, 'a native forum card can anchor restoration');

  global.document.querySelector = selector => selector.includes(`data-ml2-restored-thread-entry=\"${threadRootId}\"`)
    ? {}
    : null;
  assert.equal(plugin.canJumpToSavedRecord(threadRoot), true, 'an exact restored thread entry is a valid mount point');

  forumRoot.delete_data.hidden = true;
  assert.equal(plugin.canJumpToSavedRecord(forumRoot), false, 'Hidden overrides even a valid forum anchor');
  forumRoot.delete_data.hidden = false;
  forumRoot.edits_hidden = true;
  assert.equal(plugin.canJumpToSavedRecord(forumRoot), false, 'hidden edits also place the shared record in the unmounted Hidden view');
  forumRoot.edits_hidden = false;
  forumRoot.delete_data.anti_nuke = true;
  assert.equal(plugin.canJumpToSavedRecord(forumRoot), false, 'Nuked records never expose a live jump mount point');
});

test('hiding and unhiding a forum or thread root cascades and uses routed system feedback', () => {
  const { plugin, root, child, rootId, dispatches, notifications } = createRecordPlugin();

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
  assert.deepEqual(notifications.map(args => [args[0], args[1]]), [
    ['Logger Record Hidden', 'Hidden!'],
    ['Logger Record Unhidden', 'Unhidden!']
  ]);
  for (const notification of notifications) {
    assert.equal(notification[5].pauseOnHover, false);
    assert.equal(notification[5].instantDismiss, true);
  }
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
    nukedMessageRecord: {},
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
  assert.equal(plugin.getSavedThreadRemovalLabel(forum), 'Delete');
  assert.equal(plugin.getSavedThreadRootTypeLabel(thread), 'Thread');
  assert.equal(plugin.getSavedThreadVisibilityLabel(thread, false), 'Unhide Thread');
});

test('synthetic thread and forum fallbacks never resurrect stale starter content', () => {
  const author = { id: 'author', username: 'Author', discriminator: '0', public_flags: 0 };
  for (const { label, parentType, threadId } of [
    { label: 'channel thread', parentType: 0, threadId: '200' },
    { label: 'forum post', parentType: 15, threadId: '300' }
  ]) {
    const plugin = createPlugin({
      settings: { ignoreBots: false },
      forumThreadMetadataCache: new Map([[threadId, {
        id: threadId,
        name: 'old title',
        ownerId: author.id,
        starterMessageId: `${threadId}1`,
        starterContent: 'old starter content',
        starterAuthor: author,
        card: { title: 'old title', preview: 'old starter content' }
      }]]),
      tools: {
        getChannel: id => id === 'parent' ? { id, name: 'parent', type: parentType, guild_id: 'guild' } : null,
        getServer: () => ({ id: 'guild', name: 'Server' }),
        getUser: () => author
      }
    });
    const root = plugin.createForumThreadDeleteFallbackMessage({
      id: threadId,
      parent_id: 'parent',
      type: 11,
      name: 'test',
      guild_id: 'guild',
      owner_id: author.id
    });

    assert.equal(root.id, threadId, `${label} root keeps the thread ID`);
    assert.equal(root.channel_id, threadId, `${label} root remains self-keyed`);
    assert.equal(root.content, '[no saved message or reply content found]', `${label} uses an explicit empty-root placeholder`);
    assert.notEqual(root.content, 'old starter content', `${label} does not resurrect removed cached starter content`);
    assert.notEqual(root.content, 'test', `${label} fallback does not duplicate the title as content`);
    assert.equal(plugin.isMissingForumThreadContentPlaceholder(root.content), true);
    assert.equal(
      plugin.getCachedForumThreadStarterCandidate(
        { id: threadId, parent_id: 'parent' },
        [{ id: `${threadId}2`, channel_id: threadId, content: 'ordinary reply' }],
        plugin.forumThreadMetadataCache.get(threadId)
      ),
      null,
      `${label} does not relabel an ordinary reply as the missing starter`
    );
  }
});

test('distinct thread starters fold into one root while replies remain separate records', () => {
  const rootId = '400';
  const starterId = '401';
  const replyId = '402';
  const author = { id: 'author', username: 'Author', public_flags: 0 };
  const plugin = createPlugin({
    cleanupMessageObject(message) {
      return {
        ...message,
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        embeds: Array.isArray(message.embeds) ? message.embeds : []
      };
    }
  });
  const legacyTwoRecordPayload = {
    messageRecord: {
      [rootId]: {
        message: {
          id: rootId,
          channel_id: rootId,
          guild_id: 'guild',
          content: 'test',
          timestamp: 100,
          attachments: [],
          embeds: [],
          author
        },
        delete_data: {
          time: 300,
          forum_thread_delete: true,
          forum_parent_id: 'parent',
          forum_metadata: { name: 'test', starterMessageId: starterId }
        }
      },
      [starterId]: {
        message: {
          id: starterId,
          channel_id: rootId,
          guild_id: 'guild',
          content: 'testa',
          timestamp: 101,
          attachments: [{ id: 'attachment', filename: 'starter.png' }],
          embeds: [],
          author
        },
        delete_data: { time: 300, forum_thread_message_delete: true },
        edit_history: [{ content: 'starter before edit', time: 200 }],
        logged_attachments: ['later-media']
      },
      [replyId]: {
        message: {
          id: replyId,
          channel_id: rootId,
          guild_id: 'guild',
          content: 'message B',
          timestamp: 102,
          attachments: [],
          embeds: [],
          author
        },
        delete_data: { time: 299, forum_thread_message_delete: true }
      }
    },
    deletedMessageRecord: { [rootId]: [rootId, starterId, replyId] },
    editedMessageRecord: { [rootId]: [starterId] },
    purgedMessageRecord: {},
    suppressedForumThreadIds: []
  };

  const normalized = plugin.normalizePersistedDataPayload(legacyTwoRecordPayload);
  const root = normalized.messageRecord[rootId];

  assert.deepEqual(Object.keys(normalized.messageRecord).sort(), [rootId, replyId]);
  assert.equal(root.message.id, rootId);
  assert.equal(root.message.channel_id, rootId);
  assert.equal(root.message.content, 'testa');
  assert.deepEqual(root.message.attachments, [{ id: 'attachment', filename: 'starter.png' }]);
  assert.deepEqual(root.edit_history, [{ content: 'starter before edit', time: 200 }]);
  assert.deepEqual(root.logged_attachments, ['later-media']);
  assert.equal(root.delete_data.forum_metadata.name, 'test', 'the title stays in metadata');
  assert.equal(root.delete_data.forum_metadata.starterMessageId, starterId, 'the original starter ID remains traceable');
  assert.equal(root.delete_data.forum_metadata.starterFoldedIntoRoot, true);
  assert.equal(root.delete_data.forum_thread_delete, true);
  assert.equal(root.delete_data.forum_thread_message_delete, undefined);
  assert.equal(normalized.messageRecord[replyId].message.content, 'message B');
  assert.deepEqual(normalized.deletedMessageRecord, { [rootId]: [rootId, replyId] });
  assert.deepEqual(normalized.editedMessageRecord, {});
  assert.deepEqual(root.edit_history, [{ content: 'starter before edit', time: 200 }]);
  assert.equal(JSON.stringify(plugin.normalizePersistedDataPayload(normalized)), JSON.stringify(normalized));
});

test('self-keyed forum starters do not fold or alter their message payload', () => {
  const rootId = '500';
  const root = {
    message: { id: rootId, channel_id: rootId, content: 'forum body', timestamp: 100 },
    delete_data: {
      time: 200,
      forum_thread_delete: true,
      forum_metadata: { name: 'forum title', starterMessageId: rootId }
    }
  };
  const data = {
    messageRecord: { [rootId]: root },
    deletedMessageRecord: { [rootId]: [rootId] },
    editedMessageRecord: {},
    purgedMessageRecord: {}
  };
  const plugin = createPlugin();

  assert.deepEqual(plugin.foldSeparateThreadStarterRecords(data), []);
  assert.equal(data.messageRecord[rootId], root);
  assert.equal(root.message.content, 'forum body');
});

test('forum replies cannot replace the self-keyed starter metadata', () => {
  const rootId = '520';
  const reply = {
    id: '521',
    channel_id: rootId,
    guild_id: 'guild',
    content: 'later purge command',
    timestamp: 300,
    author: { id: 'reply-author', username: 'Reply Author' }
  };
  const thread = { id: rootId, parent_id: 'forum', guild_id: 'guild', name: 'Post', type: 11 };
  const plugin = createPlugin({
    forumThreadMetadataCache: new Map([[rootId, {
      id: rootId,
      isForumParent: true,
      starterMessageId: rootId,
      starterContent: 'original body',
      starterTimestamp: 100
    }]]),
    tools: {
      getChannel: id => id === 'forum' ? { id, type: 15, name: 'Forum', guild_id: 'guild' } : null,
      getServer: () => ({ id: 'guild', name: 'Server' })
    },
    getForumCardDomMetadata: () => null
  });

  const metadata = plugin.cacheForumThreadMetadata(thread, reply);
  assert.equal(metadata.starterMessageId, rootId);
  assert.equal(metadata.starterContent, 'original body');
  assert.equal(metadata.starterTimestamp, 100);
  assert.notEqual(metadata.starterAuthor?.id, reply.author.id);
});

test('legacy Anti-Nuke channel-thread placeholders repair only a nearby initial starter', () => {
  const rootId = '550';
  const starterId = '551';
  const replyId = '552';
  const forumId = '560';
  const lateRootId = '570';
  const lateReplyId = '571';
  const author = { id: 'author', username: 'Author', public_flags: 0 };
  const antiNukeDeleteData = (overrides = {}) => ({
    time: 3000,
    anti_nuke: true,
    anti_nuke_parent_id: 'parent',
    forum_thread_message_delete: true,
    ...overrides
  });
  const plugin = createPlugin({
    cleanupMessageObject(message) {
      return {
        ...message,
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        embeds: Array.isArray(message.embeds) ? message.embeds : []
      };
    }
  });
  const data = {
    messageRecord: {
      [rootId]: {
        message: { id: rootId, channel_id: rootId, content: '[starter message unavailable]', timestamp: 1000, author },
        delete_data: antiNukeDeleteData({
          forum_thread_delete: true,
          forum_metadata: {
            id: rootId,
            name: 'Thread title',
            ownerId: author.id,
            isForumParent: false,
            starterMessageId: rootId
          }
        })
      },
      [starterId]: {
        message: { id: starterId, channel_id: rootId, content: 'Initial body', timestamp: 1500, author },
        delete_data: antiNukeDeleteData({
          forum_metadata: { id: rootId, isForumParent: false }
        })
      },
      [replyId]: {
        message: { id: replyId, channel_id: rootId, content: 'Reply B', timestamp: 2000, author },
        delete_data: antiNukeDeleteData({
          forum_metadata: { id: rootId, isForumParent: false }
        })
      },
      [forumId]: {
        message: { id: forumId, channel_id: forumId, content: 'Forum body', timestamp: 1000, author },
        delete_data: antiNukeDeleteData({
          forum_thread_delete: true,
          forum_metadata: {
            id: forumId,
            name: 'Forum title',
            ownerId: author.id,
            isForumParent: true,
            starterMessageId: forumId
          }
        })
      },
      [lateRootId]: {
        message: { id: lateRootId, channel_id: lateRootId, content: '[starter message unavailable]', timestamp: 1000, author },
        delete_data: antiNukeDeleteData({
          forum_thread_delete: true,
          forum_metadata: {
            id: lateRootId,
            name: 'Missing starter',
            ownerId: author.id,
            isForumParent: false,
            starterMessageId: lateRootId
          }
        })
      },
      [lateReplyId]: {
        message: { id: lateReplyId, channel_id: lateRootId, content: 'Much later reply', timestamp: 301001, author },
        delete_data: antiNukeDeleteData({
          forum_metadata: { id: lateRootId, isForumParent: false }
        })
      }
    },
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {
      [rootId]: [rootId, starterId, replyId],
      [forumId]: [forumId],
      [lateRootId]: [lateRootId, lateReplyId]
    },
    suppressedForumThreadIds: []
  };

  const normalized = plugin.normalizePersistedDataPayload(data);

  assert.deepEqual(Object.keys(normalized.messageRecord).sort(), [forumId, lateReplyId, lateRootId, replyId, rootId].sort());
  assert.equal(normalized.messageRecord[rootId].message.content, 'Initial body');
  assert.equal(normalized.messageRecord[rootId].delete_data.forum_metadata.name, 'Thread title');
  assert.equal(normalized.messageRecord[rootId].delete_data.forum_metadata.starterMessageId, starterId);
  assert.equal(normalized.messageRecord[rootId].delete_data.forum_metadata.starterFoldedIntoRoot, true);
  assert.equal(normalized.messageRecord[replyId].message.content, 'Reply B');
  assert.equal(normalized.purgedMessageRecord[rootId], undefined);
  assert.deepEqual(normalized.nukedMessageRecord[rootId], [rootId, replyId]);
  assert.equal(normalized.messageRecord[forumId].message.content, 'Forum body', 'forum post storage is unchanged');
  assert.equal(normalized.messageRecord[forumId].delete_data.forum_metadata.starterMessageId, forumId);
  assert.equal(normalized.messageRecord[lateRootId].message.content, '[starter message unavailable]');
  assert.equal(normalized.messageRecord[lateRootId].delete_data.forum_metadata.starterMessageId, lateRootId);
  assert.equal(normalized.messageRecord[lateReplyId].message.content, 'Much later reply');
  assert.equal(JSON.stringify(plugin.normalizePersistedDataPayload(normalized)), JSON.stringify(normalized));
});

test('Nuked tab separation preserves hidden Anti-Nuke records while its feature is disabled', () => {
  const saved = (id, { antiNuke = false, hidden = false, time = Number(id) } = {}) => ({
    message: {
      id,
      channel_id: 'channel',
      content: `message ${id}`,
      timestamp: Number(id),
      author: { id: 'author', username: 'Author' }
    },
    delete_data: {
      time,
      ...(antiNuke ? { anti_nuke: true, anti_nuke_parent_id: 'parent' } : {}),
      ...(hidden ? { hidden: true } : {})
    }
  });
  const normalPurgedId = '600';
  const visibleNukedId = '601';
  const hiddenNukedId = '602';
  const hiddenPurgedId = '603';
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      showHiddenTab: true,
      reverseOrder: false
    },
    menu: { selectedTab: 'purged', filter: '' },
    messageRecord: {
      [normalPurgedId]: saved(normalPurgedId, { time: 100 }),
      [visibleNukedId]: saved(visibleNukedId, { antiNuke: true, time: 200 }),
      [hiddenNukedId]: saved(hiddenNukedId, { antiNuke: true, hidden: true, time: 300 }),
      [hiddenPurgedId]: saved(hiddenPurgedId, { hidden: true, time: 400 })
    },
    purgedMessageRecord: {
      channel: [normalPurgedId, hiddenPurgedId]
    },
    nukedMessageRecord: {
      channel: [visibleNukedId, hiddenNukedId]
    },
    dispatcher: { dispatch() {} },
    _invalidateAndRecache() {},
    saveData() {},
    scheduleLoggerMenuRefresh() {},
    refreshForumThreadLogModal() {},
    notifyUser() {}
  });

  assert.deepEqual(plugin.getFilteredMessages(), [normalPurgedId], 'Purged contains only ordinary bulk deletes');
  plugin.menu.selectedTab = 'nuked';
  assert.deepEqual(plugin.getFilteredMessages(), [visibleNukedId], 'Nuked contains only visible Anti-Nuke records');
  plugin.menu.selectedTab = 'hidden';
  assert.deepEqual(
    plugin.getFilteredMessages(),
    [hiddenPurgedId, hiddenNukedId],
    'Hidden contains hidden records from both categories'
  );

  plugin.settings.antiNukeEnabled = false;
  assert.equal(plugin.isLoggerTabAvailable('nuked'), false);
  assert.equal(plugin.isLoggerTabAvailable('hidden'), true);
  assert.deepEqual(
    plugin.getFilteredMessages(),
    [hiddenPurgedId, hiddenNukedId],
    'disabling Anti-Nuke does not remove its records from Hidden'
  );

  assert.equal(plugin.unhideSavedDeletedRecord(plugin.messageRecord[hiddenNukedId]), true);
  assert.deepEqual(plugin.getFilteredMessages(), [hiddenPurgedId], 'unhidden Nuked records leave Hidden immediately');
  plugin.menu.selectedTab = 'nuked';
  assert.deepEqual(plugin.getFilteredMessages(), [], 'the unavailable Nuked view stays empty while disabled');
  assert.deepEqual(
    plugin.nukedMessageRecord.channel,
    [visibleNukedId, hiddenNukedId],
    'tab visibility never changes the persisted fork-specific Nuked index'
  );

  plugin.settings.antiNukeEnabled = true;
  assert.equal(plugin.isLoggerTabAvailable('nuked'), true);
  assert.deepEqual(
    plugin.getFilteredMessages(),
    [hiddenNukedId, visibleNukedId],
    're-enabling Anti-Nuke reveals both previously visible and newly unhidden Nuked records'
  );
});

test('normalization migrates Anti-Nuke records out of Purged into the fork-specific Nuked index', () => {
  const antiNukeId = '610';
  const ordinaryPurgedId = '611';
  const plugin = createPlugin({
    cleanupMessageObject(message) {
      return {
        ...message,
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        embeds: Array.isArray(message.embeds) ? message.embeds : []
      };
    }
  });
  const payload = {
    messageRecord: {
      [antiNukeId]: {
        message: { id: antiNukeId, channel_id: 'deleted-channel', content: 'nuked', timestamp: 610 },
        delete_data: { time: 100, anti_nuke: true, anti_nuke_parent_id: 'deleted-channel' }
      },
      [ordinaryPurgedId]: {
        message: { id: ordinaryPurgedId, channel_id: 'live-channel', content: 'purged', timestamp: 611 },
        delete_data: { time: 200 }
      }
    },
    deletedMessageRecord: {},
    editedMessageRecord: { 'deleted-channel': [antiNukeId] },
    purgedMessageRecord: {
      'deleted-channel': [antiNukeId],
      'live-channel': [ordinaryPurgedId]
    }
  };

  const normalized = plugin.normalizePersistedDataPayload(payload);

  assert.deepEqual(normalized.purgedMessageRecord, { 'live-channel': [ordinaryPurgedId] });
  assert.deepEqual(normalized.nukedMessageRecord, { 'deleted-channel': [antiNukeId] });
  assert.deepEqual(normalized.editedMessageRecord, {});
  assert.equal(normalized.messageRecord[antiNukeId].delete_data.anti_nuke, true);
  assert.equal(JSON.stringify(plugin.normalizePersistedDataPayload(normalized)), JSON.stringify(normalized));
});

test('live thread capture folding rebuilds de-duplicated indexes without touching replies', () => {
  const rootId = '600';
  const starterId = '601';
  const replyId = '602';
  const root = {
    message: { id: rootId, channel_id: rootId, content: 'title', timestamp: 100 },
    delete_data: {
      time: 200,
      forum_thread_delete: true,
      forum_metadata: { name: 'title', starterMessageId: starterId }
    }
  };
  const starter = {
    message: { id: starterId, channel_id: rootId, content: 'initial body', timestamp: 101 },
    delete_data: { time: 200, forum_thread_message_delete: true }
  };
  const reply = {
    message: { id: replyId, channel_id: rootId, content: 'message B', timestamp: 102 },
    delete_data: { time: 200, forum_thread_message_delete: true }
  };
  const plugin = createPlugin({
    messageRecord: { [rootId]: root, [starterId]: starter, [replyId]: reply },
    messageRecordIds: new Set([rootId, starterId, replyId]),
    deletedMessageRecord: { [rootId]: [rootId, starterId, replyId] },
    editedMessageRecord: {},
    purgedMessageRecord: {},
    deletedMessageSet: new Map([[rootId, new Set([rootId, starterId, replyId])]]),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    noTintIds: new Set([starterId]),
    editModifiers: { [starterId]: { editNum: 0 } }
  });

  assert.equal(plugin.foldSavedThreadStarterIntoRoot(rootId), true);
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [rootId, replyId]);
  assert.equal(plugin.messageRecord[rootId].message.content, 'initial body');
  assert.equal(plugin.messageRecord[replyId], reply);
  assert.deepEqual(plugin.deletedMessageRecord, { [rootId]: [rootId, replyId] });
  assert.deepEqual(plugin.deletedMessageSet.get(rootId), new Set([rootId, replyId]));
  assert.equal(plugin.messageRecordIds.has(starterId), false);
  assert.equal(plugin.messageRecordIds.has(replyId), true);
  assert.equal(plugin.noTintIds.has(starterId), false);
  assert.equal(plugin.editModifiers[starterId], undefined);
});

test('full root deletion keeps a Purged starter in Purged while reply-only purges do not move the root', () => {
  const rootId = '650';
  const starterId = '651';
  const replyId = '652';
  const root = {
    message: { id: rootId, channel_id: rootId, content: 'thread title', timestamp: 100 },
    delete_data: {
      time: 300,
      forum_thread_delete: true,
      forum_metadata: { name: 'thread title', starterMessageId: starterId }
    }
  };
  const starter = {
    message: { id: starterId, channel_id: rootId, content: 'initial body', timestamp: 101 },
    delete_data: { time: 200, forum_thread_message_delete: true }
  };
  const reply = {
    message: { id: replyId, channel_id: rootId, content: 'purged reply', timestamp: 102 },
    delete_data: { time: 201, forum_thread_message_delete: true }
  };
  const plugin = createPlugin({
    messageRecord: { [rootId]: root, [starterId]: starter, [replyId]: reply },
    messageRecordIds: new Set([rootId, starterId, replyId]),
    deletedMessageRecord: { [rootId]: [rootId] },
    editedMessageRecord: {},
    purgedMessageRecord: { [rootId]: [starterId, replyId] },
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[rootId, new Set([rootId])]]),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map([[rootId, new Set([starterId, replyId])]]),
    nukedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    noTintIds: new Set(),
    editModifiers: {},
    getCachedForumThreadMessages: () => [starter.message, reply.message],
    saveDeletedMessage() {
      assert.fail('already Purged thread messages must not be copied into Deleted');
    }
  });

  assert.equal(plugin.saveCachedForumThreadMessagesForDelete(rootId), 0);
  assert.equal(plugin.foldSavedThreadStarterIntoRoot(rootId), true);
  assert.equal(plugin.preservePurgedThreadRootCategory(rootId), false, 'folding already canonicalized the Purged root');
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [rootId, replyId]);
  assert.equal(plugin.messageRecord[rootId].message.content, 'initial body');
  assert.deepEqual(plugin.deletedMessageRecord, {});
  assert.deepEqual(plugin.purgedMessageRecord, { [rootId]: [rootId, replyId] });
  assert.equal(plugin.deletedMessageSet.has(rootId), false);
  assert.deepEqual(plugin.purgedMessageSet.get(rootId), new Set([rootId, replyId]));

  const forumId = '660';
  const forumRecord = {
    message: { id: forumId, channel_id: forumId, content: 'forum body', timestamp: 100 },
    delete_data: {
      time: 200,
      forum_thread_delete: true,
      forum_metadata: { name: 'forum title', starterMessageId: forumId, isForumParent: true }
    }
  };
  const forumPlugin = createPlugin({
    messageRecord: { [forumId]: forumRecord },
    deletedMessageRecord: {},
    purgedMessageRecord: { [forumId]: [forumId] },
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map([[forumId, new Set([forumId])]]),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map()
  });
  assert.equal(forumPlugin.preservePurgedThreadRootCategory(forumId), false);
  assert.deepEqual(forumPlugin.deletedMessageRecord, {});
  assert.deepEqual(forumPlugin.purgedMessageRecord, { [forumId]: [forumId] });
  assert.equal(forumPlugin.messageRecord[forumId], forumRecord, 'self-keyed forum body is not duplicated or replaced');

  const replyOnlyRootId = '670';
  const replyOnlyId = '671';
  const replyOnlyPlugin = createPlugin({
    messageRecord: {
      [replyOnlyRootId]: {
        message: { id: replyOnlyRootId, channel_id: replyOnlyRootId, content: 'unpurged starter' },
        delete_data: { forum_thread_delete: true }
      },
      [replyOnlyId]: {
        message: { id: replyOnlyId, channel_id: replyOnlyRootId, content: 'purged reply' },
        delete_data: { forum_thread_message_delete: true }
      }
    },
    deletedMessageRecord: { [replyOnlyRootId]: [replyOnlyRootId] },
    purgedMessageRecord: { [replyOnlyRootId]: [replyOnlyId] },
    deletedMessageSet: new Map([[replyOnlyRootId, new Set([replyOnlyRootId])]]),
    purgedMessageSet: new Map([[replyOnlyRootId, new Set([replyOnlyId])]])
  });
  assert.equal(replyOnlyPlugin.preservePurgedThreadRootCategory(replyOnlyRootId), false);
  assert.deepEqual(replyOnlyPlugin.deletedMessageRecord, { [replyOnlyRootId]: [replyOnlyRootId] });
  assert.deepEqual(replyOnlyPlugin.purgedMessageRecord, { [replyOnlyRootId]: [replyOnlyId] });
});

test('removing a mounted self-keyed forum starter does not cascade into its replies', () => {
  const starterId = '680';
  const replyId = '681';
  const starter = {
    message: { id: starterId, channel_id: starterId, content: 'mounted starter body' },
    delete_data: {
      forum_thread_message_delete: true,
      forum_metadata: { isForumParent: true, parentType: 15, starterMessageId: starterId }
    }
  };
  const reply = {
    message: { id: replyId, channel_id: starterId, content: 'saved reply' },
    delete_data: { forum_thread_message_delete: true }
  };
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  let forumListRefreshes = 0;
  let tintSweeps = 0;
  const plugin = createPlugin({
    messageRecord: { [starterId]: starter, [replyId]: reply },
    messageRecordIds: new Set([starterId, replyId]),
    deletedMessageRecord: { [starterId]: [starterId, replyId] },
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[starterId, new Set([starterId, replyId])]]),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    noTintIds: new Set(),
    editModifiers: {},
    cachedMessageRecord: [starter.message, reply.message],
    cachedMessageIds: new Set([starterId, replyId]),
    cachedMessagesMap: new Map([[starterId, starter.message], [replyId, reply.message]]),
    channelMessages: { [starterId]: { ready: true } },
    tools: {
      getChannel: id => id === starterId
        ? { id, type: 11, parent_id: 'forum-parent' }
        : id === 'forum-parent' ? { id, type: 15 } : null
    },
    getForumCardDomMetadata: () => ({ preview: 'mounted starter body' }),
    settings: { deleteCachedFilesWithRecords: false },
    dispatcher: { dispatch: event => dispatches.push(event) },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    _tintSweep: () => { tintSweeps++; },
    scheduleForumListRefresh: () => { forumListRefreshes++; },
    scheduleLoggerMenuRefresh() {},
    refreshForumThreadLogModal() {},
    saveData() {}
  });

  assert.equal(plugin.removeSavedDeletedRecordFromLog(starterId, starterId), true);
  assert.equal(plugin.messageRecord[starterId], undefined);
  assert.equal(plugin.messageRecord[replyId], reply);
  assert.deepEqual(plugin.deletedMessageRecord, { [starterId]: [replyId] });
  assert.deepEqual(plugin.deletedMessageSet.get(starterId), new Set([replyId]));
  assert.equal(plugin.suppressedForumThreadIds.has(starterId), false);
  assert.deepEqual(plugin.cachedMessageRecord, [reply.message]);
  assert.equal(plugin.cachedMessageIds.has(starterId), false);
  assert.equal(plugin.cachedMessagesMap.has(starterId), false);
  assert.deepEqual(dispatches, [], 'a live native thread must not receive a synthetic MESSAGE_DELETE');
  assert.deepEqual(invalidations, [starterId], 'the live thread cache should invalidate immediately');
  assert.deepEqual(cacheRefreshes, [starterId], 'the live thread should refetch without a synthetic delete');
  assert.equal(plugin._nativeDeletedForumPreviewText.get(starterId), 'mounted starter body');
  assert.equal(tintSweeps, 1, 'the remembered native preview should tint in the same turn as removal');
  assert.equal(forumListRefreshes, 1);
});

test('forum card author normalization only applies to logger-owned restored cards', () => {
  const threadId = '900';
  const createAuthorNode = initialText => {
    const attributes = new Map();
    return {
      textContent: initialText,
      getAttribute(name) { return attributes.get(name) ?? null; },
      setAttribute(name, value) { attributes.set(name, String(value)); }
    };
  };
  const makeCard = (isRestored, author) => ({
    hasAttribute(name) { return isRestored && name === 'data-ml2-restored-forum-card'; },
    querySelector() { return author; }
  });
  const plugin = createPlugin({
    messageRecord: {
      [threadId]: {
        message: {
          id: threadId,
          channel_id: threadId,
          author: { id: 'author', username: 'RecoveredAuthor' }
        },
        delete_data: { forum_thread_message_delete: true }
      }
    }
  });

  const nativeAuthor = createAuthorNode('System placeholder: ');
  const nativeCard = makeCard(false, nativeAuthor);
  assert.equal(plugin.normalizeDeletedForumCardAuthor(nativeCard, threadId), false);
  assert.equal(nativeAuthor.textContent, 'System placeholder: ');
  assert.equal(nativeAuthor.getAttribute('data-ml2-plain-forum-author'), null);

  const restoredAuthor = createAuthorNode('System placeholder: ');
  const restoredCard = makeCard(true, restoredAuthor);
  assert.equal(plugin.normalizeDeletedForumCardAuthor(restoredCard, threadId), true);
  assert.equal(restoredAuthor.textContent, 'RecoveredAuthor: ');
  assert.equal(restoredAuthor.getAttribute('data-ml2-plain-forum-author'), 'true');
});

test('hiding a saved message preserves Discord-owned live thread mounts only', () => {
  const starterId = '684';
  const ordinaryId = '685';
  const ordinaryChannelId = '686';
  const ordinaryThreadReplyId = '687';
  const ordinaryThreadChannelId = '688';
  const starter = {
    message: {
      id: starterId,
      channel_id: starterId,
      content: '',
      attachments: [{ id: 'starter-image', filename: 'starter.png' }]
    },
    delete_data: { forum_thread_message_delete: true, hidden: false }
  };
  const ordinary = {
    message: { id: ordinaryId, channel_id: ordinaryChannelId, content: 'ordinary deleted message' },
    delete_data: { hidden: false }
  };
  const ordinaryThreadReply = {
    message: {
      id: ordinaryThreadReplyId,
      channel_id: ordinaryThreadChannelId,
      content: 'ordinary thread reply without surviving-thread metadata'
    },
    delete_data: { hidden: false }
  };
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  let forumListRefreshes = 0;
  let tintSweeps = 0;
  const plugin = createPlugin({
    messageRecord: {
      [starterId]: starter,
      [ordinaryId]: ordinary,
      [ordinaryThreadReplyId]: ordinaryThreadReply
    },
    channelMessages: { [starterId]: { ready: true } },
    tools: {
      getChannel: id => id === starterId
        ? { id, type: 11, parent_id: 'forum-parent' }
        : id === ordinaryChannelId
          ? { id, type: 0 }
          : id === ordinaryThreadChannelId ? { id, type: 11 } : null
    },
    dispatcher: { dispatch: event => dispatches.push(event) },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    _tintSweep: () => { tintSweeps++; },
    scheduleForumListRefresh: () => { forumListRefreshes++; },
    saveData() {},
    scheduleLoggerMenuRefresh() {},
    refreshForumThreadLogModal() {},
    notifyUser() {}
  });

  assert.equal(plugin.hideSavedDeletedRecord(starter), true);
  assert.equal(starter.delete_data.hidden, true);
  assert.deepEqual(dispatches, [], 'hiding a live starter must not synthesize a Discord deletion');
  assert.deepEqual(invalidations, [starterId]);
  assert.deepEqual(cacheRefreshes, [starterId]);
  assert.equal(tintSweeps, 1);
  assert.equal(forumListRefreshes, 1);

  assert.equal(plugin.hideSavedDeletedRecord(ordinary), true);
  assert.equal(ordinary.delete_data.hidden, true);
  assert.deepEqual(dispatches, [{
    type: 'MESSAGE_DELETE',
    id: ordinaryId,
    channelId: ordinaryChannelId,
    ML2: true
  }], 'ordinary saved messages retain their synthetic live unmount');
  assert.deepEqual(invalidations, [starterId]);
  assert.deepEqual(cacheRefreshes, [starterId]);

  assert.equal(plugin.hideSavedDeletedRecord(ordinaryThreadReply), true);
  assert.equal(ordinaryThreadReply.delete_data.hidden, true);
  assert.deepEqual(dispatches.at(-1), {
    type: 'MESSAGE_DELETE',
    id: ordinaryThreadReplyId,
    channelId: ordinaryThreadChannelId,
    ML2: true
  }, 'channel type alone must not suppress an ordinary thread reply unmount');
  assert.deepEqual(invalidations, [starterId]);
  assert.deepEqual(cacheRefreshes, [starterId]);
});

test('a full deleted root promotes the absolute oldest saved context regardless of category or visibility', () => {
  const rootId = '690';
  const oldestId = '691';
  const laterId = '692';
  const hiddenId = '693';
  const author = { id: 'author', username: 'Author', public_flags: 0 };
  const root = {
    message: {
      id: rootId,
      channel_id: rootId,
      content: '[no saved message or reply content found]',
      timestamp: 100,
      author
    },
    delete_data: {
      time: 500,
      forum_thread_delete: true,
      forum_metadata: {
        name: 'Deleted title',
        starterMessageId: 'removed-starter',
        starterContent: 'must not return'
      }
    },
    saved_location: { channelId: rootId, parentId: 'parent' }
  };
  const oldest = {
    message: {
      id: oldestId,
      channel_id: rootId,
      content: 'older visible purged reply',
      timestamp: 200,
      author
    },
    delete_data: { time: 300, forum_thread_message_delete: true }
  };
  const later = {
    message: { id: laterId, channel_id: rootId, content: 'later purge command', timestamp: 300, author },
    delete_data: { time: 400, forum_thread_message_delete: true }
  };
  const hidden = {
    message: {
      id: hiddenId,
      channel_id: rootId,
      content: 'absolute oldest hidden ghost ping',
      timestamp: 150,
      attachments: [{ id: 'media', filename: 'reply.png' }],
      author
    },
    delete_data: { time: 450, hidden: true, forum_thread_message_delete: true },
    edit_history: [{ content: 'before hidden edit', time: 350 }],
    ghost_pinged: true,
    logged_attachments: ['cached-hidden-media']
  };
  const plugin = createPlugin({
    messageRecord: { [rootId]: root, [oldestId]: oldest, [laterId]: later, [hiddenId]: hidden },
    messageRecordIds: new Set([rootId, oldestId, laterId, hiddenId]),
    deletedMessageRecord: { [rootId]: [rootId, laterId, hiddenId] },
    editedMessageRecord: { [rootId]: [hiddenId] },
    purgedMessageRecord: { [rootId]: [oldestId] },
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[rootId, new Set([rootId, laterId, hiddenId])]]),
    editedMessageSet: new Map([[rootId, new Set([hiddenId])]]),
    purgedMessageSet: new Map([[rootId, new Set([oldestId])]]),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map([[rootId, []]]),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    suppressedForumThreadIds: new Set(),
    noTintIds: new Set([hiddenId]),
    editModifiers: { [hiddenId]: { editNum: 0 } },
    settings: { deleteCachedFilesWithRecords: false }
  });

  assert.deepEqual(plugin.promoteOldestSavedThreadReplyIntoRoot(rootId), {
    rootId,
    contextMessageId: hiddenId
  });
  const promoted = plugin.messageRecord[rootId];
  assert.equal(promoted.message.content, 'absolute oldest hidden ghost ping');
  assert.equal(promoted.message.id, rootId);
  assert.equal(promoted.message.channel_id, rootId);
  assert.equal(promoted.delete_data.forum_thread_delete, true);
  assert.equal(promoted.delete_data.forum_thread_message_delete, undefined);
  assert.equal(promoted.delete_data.forum_metadata.name, 'Deleted title');
  assert.equal(promoted.delete_data.forum_metadata.starterContent, null);
  assert.equal(promoted.delete_data.forum_metadata.rootContextMessageId, hiddenId);
  assert.equal(promoted.delete_data.forum_metadata.rootContextWasReply, true);
  assert.equal(promoted.delete_data.hidden, true, 'promotion must not unhide the timestamp winner');
  assert.equal(promoted.ghost_pinged, true, 'ghost-ping state follows the timestamp winner');
  assert.deepEqual(promoted.edit_history, [{ content: 'before hidden edit', time: 350 }]);
  assert.deepEqual(promoted.logged_attachments, ['cached-hidden-media']);
  assert.equal(plugin.preservePurgedThreadRootCategory(rootId), false);
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [rootId, oldestId, laterId]);
  assert.deepEqual(plugin.deletedMessageRecord, { [rootId]: [rootId, laterId] });
  assert.deepEqual(plugin.purgedMessageRecord, { [rootId]: [oldestId] });
  assert.deepEqual(plugin.editedMessageRecord, {});
  assert.deepEqual(plugin.deletedMessageSet.get(rootId), new Set([rootId, laterId]));
  assert.deepEqual(plugin.purgedMessageSet.get(rootId), new Set([oldestId]));
  assert.deepEqual(plugin.getRecordCacheSourceMessageIds(promoted), new Set([rootId, hiddenId]));
  assert.equal(plugin.noTintIds.has(hiddenId), false);
  assert.equal(plugin.editModifiers[hiddenId], undefined);

  const removed = plugin.deleteMessageFromRecords(rootId);
  assert.deepEqual(new Set(removed), new Set([rootId, oldestId, laterId]));
  assert.deepEqual(plugin.messageRecord, {}, 'only the full structural root cascades through remaining children');

  const emptyRoot = structuredClone(root);
  const emptyPlugin = createPlugin({ messageRecord: { [rootId]: emptyRoot } });
  assert.equal(emptyPlugin.promoteOldestSavedThreadReplyIntoRoot(rootId), null);
  assert.equal(
    emptyPlugin.messageRecord[rootId].message.content,
    '[no saved message or reply content found]',
    'a full root with no saved thread context keeps the explicit placeholder'
  );
});

test('an older edit-only ghost ping beats newer Deleted and Purged context', () => {
  const rootId = '695';
  const ghostId = '696';
  const deletedId = '697';
  const purgedId = '698';
  const author = { id: 'author', username: 'Author' };
  const root = {
    message: { id: rootId, channel_id: rootId, content: '[starter message unavailable]', timestamp: 100, author },
    delete_data: { time: 500, forum_thread_delete: true, forum_metadata: { name: 'Thread' } }
  };
  const ghost = {
    message: { id: ghostId, channel_id: rootId, content: 'oldest ghost context', timestamp: 150, author },
    edit_history: [{ content: '@local user', time: 160 }],
    ghost_pinged: true,
    local_mentioned: true
  };
  const deleted = {
    message: { id: deletedId, channel_id: rootId, content: 'newer deleted context', timestamp: 200, author },
    delete_data: { time: 300, forum_thread_message_delete: true }
  };
  const purged = {
    message: { id: purgedId, channel_id: rootId, content: 'newest purged context', timestamp: 250, author },
    delete_data: { time: 280, forum_thread_message_delete: true }
  };
  const plugin = createPlugin({
    messageRecord: { [rootId]: root, [ghostId]: ghost, [deletedId]: deleted, [purgedId]: purged },
    messageRecordIds: new Set([rootId, ghostId, deletedId, purgedId]),
    deletedMessageRecord: { [rootId]: [rootId, deletedId] },
    editedMessageRecord: { [rootId]: [ghostId] },
    purgedMessageRecord: { [rootId]: [purgedId] },
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[rootId, new Set([rootId, deletedId])]]),
    editedMessageSet: new Map([[rootId, new Set([ghostId])]]),
    purgedMessageSet: new Map([[rootId, new Set([purgedId])]]),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    noTintIds: new Set(),
    editModifiers: {}
  });

  assert.deepEqual(plugin.promoteOldestSavedThreadReplyIntoRoot(rootId), {
    rootId,
    contextMessageId: ghostId
  });
  assert.equal(plugin.messageRecord[rootId].message.content, 'oldest ghost context');
  assert.equal(plugin.messageRecord[rootId].ghost_pinged, true);
  assert.equal(plugin.messageRecord[rootId].local_mentioned, true);
  assert.deepEqual(plugin.deletedMessageRecord, { [rootId]: [rootId, deletedId] });
  assert.deepEqual(plugin.editedMessageRecord, {});
  assert.deepEqual(plugin.purgedMessageRecord, { [rootId]: [purgedId] });

  plugin.menu = { selectedTab: 'ghostpings', filter: '' };
  plugin.settings = { reverseOrder: false };
  plugin.getSavedMessage = id => plugin.messageRecord[id];
  assert.deepEqual(plugin.getFilteredMessages(), [rootId], 'the shared Edited/Deleted ghost root renders once');
});

test('shared deletion capture merges Anti-Nuke state into an existing edit and ghost record', () => {
  const messageId = '699';
  const channelId = '690';
  const existing = {
    message: {
      id: messageId,
      channel_id: channelId,
      content: 'edited ghost context',
      timestamp: 100,
      attachments: [],
      embeds: []
    },
    edit_history: [{ content: '@local before edit', time: 110 }],
    edits_hidden: true,
    ghost_pinged: true,
    local_mentioned: true,
    logged_attachments: ['cached-before-delete']
  };
  const captured = {
    id: messageId,
    channel_id: channelId,
    content: 'final deleted context',
    timestamp: 120,
    attachments: [],
    embeds: []
  };
  const plugin = createPlugin({
    messageRecord: { [messageId]: structuredClone(existing) },
    messageRecordIds: new Set([messageId]),
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    settings: { cacheAllImages: false },
    createMiniFormattedData: message => ({
      message: structuredClone(message),
      saved_location: { channelId },
      local_mentioned: false,
      ghost_pinged: false,
      logged_attachments: []
    }),
    getMessageLocationSnapshot: () => ({ channelId })
  });

  plugin.saveDeletedMessage(captured, plugin.nukedMessageRecord);

  const merged = plugin.messageRecord[messageId];
  assert.equal(merged.message.content, 'final deleted context');
  assert.ok(merged.delete_data, 'the shared helper adds deletion state');
  assert.deepEqual(merged.edit_history, existing.edit_history);
  assert.equal(merged.edits_hidden, true, 'an existing hidden edit stays hidden');
  assert.equal(merged.ghost_pinged, true);
  assert.equal(merged.local_mentioned, true);
  assert.deepEqual(merged.logged_attachments, existing.logged_attachments);
  assert.deepEqual(plugin.nukedMessageRecord, { [channelId]: [messageId] });
  assert.deepEqual(plugin.nukedMessageSet.get(channelId), new Set([messageId]));
});

test('marked purge and nuke batches sort by posting time without merging nearby events', () => {
  const channelId = 'batch-channel';
  const records = {
    '101': {
      message: { id: '101', channel_id: channelId, timestamp: 100 },
      delete_data: { time: 2002, capture_batch_id: '2000:1:purge:batch-channel', capture_batch_time: 2000 }
    },
    '102': {
      message: { id: '102', channel_id: channelId, timestamp: 200 },
      delete_data: { time: 2001, capture_batch_id: '2000:1:purge:batch-channel', capture_batch_time: 2000 }
    },
    '201': {
      message: { id: '201', channel_id: channelId, timestamp: 50 },
      delete_data: { time: 2004, capture_batch_id: '2000:2:purge:batch-channel', capture_batch_time: 2000 }
    },
    '202': {
      message: { id: '202', channel_id: channelId, timestamp: 150 },
      delete_data: { time: 2003, capture_batch_id: '2000:2:purge:batch-channel', capture_batch_time: 2000 }
    },
    '301': {
      message: { id: '301', channel_id: channelId, timestamp: 9999 },
      delete_data: { time: 1700 }
    },
    '302': {
      message: { id: '302', channel_id: channelId, timestamp: 1 },
      delete_data: { time: 1800 }
    }
  };
  const ids = Object.keys(records);
  const createBatchPlugin = category => {
    const categoryRecords = structuredClone(records);
    if (category === 'nuked') {
      for (const record of Object.values(categoryRecords)) record.delete_data.anti_nuke = true;
    }
    const plugin = createPlugin();
    plugin.installDataPayload({
      messageRecord: categoryRecords,
      deletedMessageRecord: {},
      editedMessageRecord: {},
      purgedMessageRecord: category === 'purged' ? { [channelId]: ids } : {},
      nukedMessageRecord: category === 'nuked' ? { [channelId]: ids } : {},
      suppressedForumThreadIds: []
    });
    plugin.settings = { reverseOrder: false, antiNukeEnabled: true };
    plugin.menu = { selectedTab: category, filter: '' };
    return plugin;
  };
  const newestFirst = ['202', '201', '102', '101', '302', '301'];
  const purgedPlugin = createBatchPlugin('purged');
  assert.deepEqual(purgedPlugin.getFilteredMessages(), newestFirst);
  const nukedPlugin = createBatchPlugin('nuked');
  assert.deepEqual(nukedPlugin.getFilteredMessages(), newestFirst, 'Nuked uses the same marked-batch ordering');

  purgedPlugin.settings.reverseOrder = true;
  assert.deepEqual(purgedPlugin.getFilteredMessages(), newestFirst.toReversed(), 'oldest-first reverses batches and their contents');

  const ordinaryOrder = ids.slice();
  purgedPlugin.sortMessagesByAge(ordinaryOrder, false);
  assert.deepEqual(
    ordinaryOrder,
    ['201', '202', '101', '102', '302', '301'],
    'unmarked sorting keeps the existing per-record deletion-time order'
  );
});

test('saved event markers are unique within one millisecond and do not replace delete time', t => {
  const originalNow = Date.now;
  t.after(() => { Date.now = originalNow; });
  Date.now = () => 5000;
  const plugin = createPlugin();
  const first = plugin.createSavedEventBatch('purge', 'channel');
  const second = plugin.createSavedEventBatch('purge', 'channel');
  const deleteData = { time: 1234 };

  assert.equal(first.time, 5000);
  assert.equal(second.time, 5000);
  assert.notEqual(first.id, second.id);
  assert.equal(plugin.applySavedEventBatch(deleteData, second), true);
  assert.equal(deleteData.time, 1234, 'existing logger deletion time stays untouched');
  assert.equal(deleteData.capture_batch_id, second.id);
  assert.equal(deleteData.capture_batch_time, 5000);

  const persisted = { message: { id: '1', channel_id: 'channel', timestamp: 100 }, delete_data: { ...deleteData } };
  const legacyRewrite = { message: { ...persisted.message }, delete_data: { time: 1234 } };
  const roundTrip = plugin.mergeSavedRecords(persisted, legacyRewrite);
  assert.equal(roundTrip.delete_data.capture_batch_id, second.id, 'an unaware fork round trip retains the additive marker');
  assert.equal(roundTrip.delete_data.capture_batch_time, 5000);
});

test('display precedence stays Hidden then Nuked then Ghost Pings then Purged then Deleted then Edited', () => {
  const channelId = 'category-channel';
  const ids = {
    edited: '701',
    deleted: '702',
    purged: '703',
    ghostEdited: '704',
    ghostDeleted: '705',
    ghostPurged: '706',
    ghostNuked: '707',
    hiddenNuked: '708',
    hiddenEdited: '709'
  };
  const saved = (id, options = {}) => ({
    message: {
      id,
      channel_id: channelId,
      content: `message-${id}`,
      timestamp: Number(id),
      attachments: [],
      embeds: []
    },
    delete_data: options.deleted
      ? {
          time: Number(id),
          ...(options.nuked ? { anti_nuke: true } : {}),
          ...(options.hidden ? { hidden: true } : {})
        }
      : null,
    edit_history: options.edited
      ? [{ content: `first-${id}`, time: Number(id) - 2 }, { content: `second-${id}`, time: Number(id) - 1 }]
      : null,
    edits_hidden: !!(options.hidden && options.edited),
    ghost_pinged: !!options.ghost,
    logged_attachments: []
  });
  const records = {
    [ids.edited]: saved(ids.edited, { edited: true }),
    [ids.deleted]: saved(ids.deleted, { edited: true, deleted: true }),
    [ids.purged]: saved(ids.purged, { edited: true, deleted: true }),
    [ids.ghostEdited]: saved(ids.ghostEdited, { edited: true, ghost: true }),
    [ids.ghostDeleted]: saved(ids.ghostDeleted, { edited: true, deleted: true, ghost: true }),
    [ids.ghostPurged]: saved(ids.ghostPurged, { edited: true, deleted: true, ghost: true }),
    [ids.ghostNuked]: saved(ids.ghostNuked, { edited: true, deleted: true, ghost: true, nuked: true }),
    [ids.hiddenNuked]: saved(ids.hiddenNuked, { edited: true, deleted: true, ghost: true, nuked: true, hidden: true }),
    [ids.hiddenEdited]: saved(ids.hiddenEdited, { edited: true, ghost: true, hidden: true })
  };
  const plugin = createPlugin();
  plugin.installDataPayload({
    messageRecord: records,
    deletedMessageRecord: {
      [channelId]: [ids.deleted, ids.purged, ids.ghostDeleted, ids.ghostPurged, ids.ghostNuked, ids.hiddenNuked]
    },
    editedMessageRecord: { [channelId]: Object.values(ids) },
    purgedMessageRecord: { [channelId]: [ids.purged, ids.ghostPurged, ids.ghostNuked, ids.hiddenNuked] },
    nukedMessageRecord: { [channelId]: [ids.ghostNuked, ids.hiddenNuked] },
    suppressedForumThreadIds: []
  });
  plugin.settings = { antiNukeEnabled: true, reverseOrder: false, cacheAllImages: false };
  plugin.menu = { selectedTab: 'edited', filter: '' };

  assert.deepEqual(plugin.editedMessageRecord, {
    [channelId]: [ids.edited, ids.ghostEdited, ids.hiddenEdited]
  });
  assert.deepEqual(plugin.deletedMessageRecord, { [channelId]: [ids.deleted, ids.ghostDeleted] });
  assert.deepEqual(plugin.purgedMessageRecord, { [channelId]: [ids.purged, ids.ghostPurged] });
  assert.deepEqual(plugin.nukedMessageRecord, { [channelId]: [ids.ghostNuked, ids.hiddenNuked] });

  const expectedTabs = {
    edited: [ids.edited],
    deleted: [ids.deleted],
    purged: [ids.purged],
    ghostpings: [ids.ghostEdited, ids.ghostDeleted, ids.ghostPurged],
    nuked: [ids.ghostNuked],
    hidden: [ids.hiddenNuked, ids.hiddenEdited]
  };
  for (const [tab, expected] of Object.entries(expectedTabs)) {
    plugin.menu.selectedTab = tab;
    assert.deepEqual(new Set(plugin.getFilteredMessages()), new Set(expected), `${tab} follows exclusive display precedence`);
  }
  for (const id of Object.values(ids)) {
    assert.equal(plugin.messageRecord[id].edit_history?.length, 2, `${id} retains its full edit stack`);
  }

  // Exercise the live transition path as well as startup normalization: Edited -> Deleted ->
  // Purged -> Nuked changes only the base index and never strips the edit stack.
  plugin.createMiniFormattedData = message => ({
    message: structuredClone(message),
    saved_location: { channelId },
    local_mentioned: false,
    ghost_pinged: false,
    logged_attachments: []
  });
  let transitioning = plugin.messageRecord[ids.edited];
  const originalEdits = structuredClone(transitioning.edit_history);
  plugin.saveDeletedMessage(transitioning.message, plugin.deletedMessageRecord);
  transitioning = plugin.messageRecord[ids.edited];
  assert.equal(plugin.getSavedRecordDisplayCategory(transitioning, ids.edited), 'deleted');
  plugin.saveDeletedMessage(transitioning.message, plugin.purgedMessageRecord);
  transitioning = plugin.messageRecord[ids.edited];
  assert.equal(plugin.getSavedRecordDisplayCategory(transitioning, ids.edited), 'purged');
  transitioning.ghost_pinged = true;
  assert.equal(plugin.getSavedRecordDisplayCategory(transitioning, ids.edited), 'ghostpings');
  plugin.saveDeletedMessage(transitioning.message, plugin.nukedMessageRecord);
  transitioning = plugin.messageRecord[ids.edited];
  transitioning.delete_data.anti_nuke = true;
  assert.equal(plugin.getSavedRecordDisplayCategory(transitioning, ids.edited), 'nuked');
  assert.deepEqual(transitioning.edit_history, originalEdits);
  assert.equal(plugin.editedMessageSet.get(channelId)?.has(ids.edited) || false, false);
  assert.equal(plugin.deletedMessageSet.get(channelId)?.has(ids.edited) || false, false);
  assert.equal(plugin.purgedMessageSet.get(channelId)?.has(ids.edited) || false, false);
  assert.equal(plugin.nukedMessageSet.get(channelId)?.has(ids.edited), true);
});

test('starter edits replace cached thread content before deletion capture', () => {
  const original = {
    id: '201',
    channel_id: '200',
    guild_id: 'guild',
    content: 'before edit',
    type: 0,
    flags: 0,
    attachments: [],
    embeds: [],
    author: { id: 'author', username: 'Author' }
  };
  const plugin = createPlugin({
    cachedMessageRecord: [structuredClone(original)],
    cachedMessageIds: new Set([original.id]),
    cachedMessagesMap: new Map([[original.id, structuredClone(original)]]),
    channelMessages: {},
    messageStore: { getMessages: () => null },
    settings: { cacheAllImages: false },
    cleanupMessageObject: message => message,
    shouldIgnoreMessageAuthor: () => false,
    shouldIgnoreSelfMessage: () => false
  });
  const edited = plugin.syncMessageUpdatePayload(
    { ...original, content: 'after edit', edited_timestamp: '2026-07-14T00:00:00.000Z' },
    original
  );

  assert.equal(edited.content, 'after edit');
  assert.equal(plugin.cachedMessagesMap.get(original.id).content, 'after edit');
  assert.deepEqual(plugin.getCachedForumThreadMessages('200').map(message => message.content), ['after edit']);
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

test('attachment capture serialization preserves exact signed direct and proxy URLs', () => {
  const plugin = createPlugin();
  const attachment = {
    id: 'signed-attachment',
    filename: 'signed image.PNG',
    url: 'https://cdn.discordapp.com/attachments/channel/signed-attachment/signed%20image.PNG?ex=abc&is=def&hm=direct-signature',
    proxy_url: 'https://media.discordapp.net/attachments/channel/signed-attachment/signed%20image.PNG?ex=abc&is=def&hm=proxy-signature&format=webp',
    width: 1920,
    height: 1080
  };
  const before = structuredClone(attachment);

  const normalized = plugin.normalizeSerializableMessageItems([attachment], 'attachment');

  assert.deepEqual(normalized, [before]);
  assert.deepEqual(attachment, before);
  assert.notEqual(normalized[0], attachment);
  assert.notEqual(normalized[0].url, normalized[0].proxy_url);
});

test('saveDeletedMessage preserves attachment direct/proxy URLs without mutating captured input when caching is disabled', () => {
  const distinctMessage = {
    id: '200',
    channel_id: 'cache-channel',
    content: 'distinct urls',
    timestamp: 100,
    attachments: [{
      id: 'attach-distinct',
      filename: 'a.png',
      url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-distinct/distinct.png?ex=abc&is=def&hm=123',
      proxy_url: 'https://media.discordapp.net/attachments/cache-channel/distinct.webp'
    }]
  };
  const legacyMessage = {
    id: '201',
    channel_id: 'cache-channel',
    content: 'equal urls',
    timestamp: 101,
    attachments: [{
      id: 'attach-legacy',
      filename: 'b.png',
      url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-legacy/legacy.png?ex=abc&is=def&hm=456',
      proxy_url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-legacy/legacy.png?ex=abc&is=def&hm=456'
    }]
  };
  const before = {
    distinctMessage: structuredClone(distinctMessage),
    legacyMessage: structuredClone(legacyMessage)
  };
  const plugin = createPlugin({
    messageRecord: {},
    messageRecordIds: new Set(),
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    settings: { cacheAllImages: false },
    createMiniFormattedData: message => ({
      message: structuredClone(message),
      saved_location: { channelId: message.channel_id },
      local_mentioned: false,
      ghost_pinged: false,
      logged_attachments: []
    }),
    getMessageLocationSnapshot: () => null
  });

  plugin.saveDeletedMessage(distinctMessage, plugin.deletedMessageRecord);
  plugin.saveDeletedMessage(legacyMessage, plugin.deletedMessageRecord);

  assert.deepEqual(distinctMessage, before.distinctMessage, 'captured distinct URL message stays unchanged');
  assert.deepEqual(legacyMessage, before.legacyMessage, 'captured legacy URL message stays unchanged');
  assert.deepEqual(plugin.messageRecord['200'].message.attachments, [{
    id: 'attach-distinct',
    filename: 'a.png',
    url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-distinct/distinct.png?ex=abc&is=def&hm=123',
    proxy_url: 'https://media.discordapp.net/attachments/cache-channel/distinct.webp'
  }]);
  assert.deepEqual(plugin.messageRecord['201'].message.attachments, [{
    id: 'attach-legacy',
    filename: 'b.png',
    url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-legacy/legacy.png?ex=abc&is=def&hm=456',
    proxy_url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-legacy/legacy.png?ex=abc&is=def&hm=456'
  }]);
  assert.equal(plugin.deletedMessageRecord['cache-channel'].length, 2);
  const serialized = JSON.stringify(plugin.messageRecord['200'].message);
  assert.equal(serialized.includes('"localPath"'), false);
  assert.equal(serialized.includes('"local_path"'), false);
  assert.equal(serialized.includes('blob:'), false);
  assert.equal(serialized.includes('file:'), false);
});

test('saveDeletedMessage preserves attachment URLs and preserved direct URL is used when cacheAllImages is enabled', () => {
  const message = {
    id: '300',
    channel_id: 'cache-channel',
    content: 'cached message',
    timestamp: 200,
    attachments: [{
      id: 'attach-cached',
      filename: 'cached.png',
      url: 'https://cdn.discordapp.com/attachments/cache-channel/attach-cached/cached.png?ex=abc&is=def&hm=789',
      proxy_url: 'https://media.discordapp.net/attachments/cache-channel/cached.webp'
    }]
  };
  const before = structuredClone(message);
  const cacheCalls = [];
  const plugin = createPlugin({
    messageRecord: {},
    messageRecordIds: new Set(),
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    settings: { cacheAllImages: true },
    cacheMessageImages(...args) {
      cacheCalls.push(args);
    },
    createMiniFormattedData: message => ({
      message: structuredClone(message),
      saved_location: { channelId: message.channel_id },
      local_mentioned: false,
      ghost_pinged: false,
      logged_attachments: []
    }),
    getMessageLocationSnapshot: () => null
  });

  plugin.saveDeletedMessage(message, plugin.deletedMessageRecord);

  assert.deepEqual(message, before);

  assert.equal(cacheCalls.length, 1);
  assert.equal(cacheCalls[0][0].attachments[0].url, before.attachments[0].url);
  assert.equal(cacheCalls[0][0].attachments[0].proxy_url, before.attachments[0].proxy_url);
  assert.equal(cacheCalls[0][1].cacheState, 'confirmed');
  assert.equal(plugin.messageRecord['300'].message.attachments[0].url, before.attachments[0].url);
  assert.equal(plugin.messageRecord['300'].message.attachments[0].proxy_url, before.attachments[0].proxy_url);
  assert.notEqual(plugin.messageRecord['300'].message.attachments[0].url, plugin.messageRecord['300'].message.attachments[0].proxy_url);
  const serialized = JSON.stringify(plugin.messageRecord['300']);
  assert.equal(serialized.includes('"localPath"'), false);
  assert.equal(serialized.includes('"local_path"'), false);
  assert.equal(serialized.includes('blob:'), false);
  assert.equal(serialized.includes('file:'), false);
});

test('message cleanup preserves detached Components V2 trees and snapshot aliases', () => {
  const componentFromJs = {
    type: 1,
    components: [{ type: 2, custom_id: 'nested-js' }]
  };
  const componentFromJson = {
    type: 17,
    accessory: { type: 2, custom_id: 'nested-json' }
  };
  const snapshots = [{
    message: {
      id: 'snapshot-message',
      components: [{ type: 9, components: [{ type: 10, content: 'snapshot' }] }],
      embeds: [{
        type: 'rich',
        future_embed_data: { retained: true },
        image: { proxy_url: 'https://example.invalid/snapshot-image', width: 42, height: 24 }
      }]
    }
  }];
  const plugin = createPlugin({
    ChannelStore: { getChannel: () => null },
    UserStore: { getUser: () => null },
    messageStore: { getMessage: () => null }
  });
  const cleaned = plugin.cleanupMessageObject({
    id: 'components-v2',
    channel_id: 'channel',
    guild_id: 'guild',
    content: '',
    type: 0,
    flags: 32768,
    timestamp: 100,
    attachments: [],
    embeds: [],
    reactions: [],
    author: { id: 'author', username: 'Author' },
    mentions: [],
    components: [
      {
        toJS() { return componentFromJs; },
        toJSON() { throw new Error('toJS must take precedence'); }
      },
      {
        toJSON() { return componentFromJson; }
      }
    ],
    messageSnapshots: snapshots
  });

  assert.deepEqual(cleaned.components, [componentFromJs, componentFromJson]);
  assert.deepEqual(cleaned.message_snapshots, [{
    message: {
      id: 'snapshot-message',
      components: [{ type: 9, components: [{ type: 10, content: 'snapshot' }] }],
      embeds: [{
        type: 'rich',
        future_embed_data: { retained: true },
        image: {
          proxy_url: 'https://example.invalid/snapshot-image',
          url: 'https://example.invalid/snapshot-image',
          width: 42,
          height: 24
        }
      }]
    }
  }], 'camel-case snapshots retain raw nested embeds under the canonical persisted key');
  assert.equal(cleaned.messageSnapshots, undefined);

  cleaned.components[0].components[0].custom_id = 'changed';
  cleaned.components[1].accessory.custom_id = 'changed';
  cleaned.message_snapshots[0].message.components[0].components[0].content = 'changed';
  assert.equal(componentFromJs.components[0].custom_id, 'nested-js', 'serialized components must not retain a source reference');
  assert.equal(componentFromJson.accessory.custom_id, 'nested-json', 'toJSON component data must also be detached');
  assert.equal(snapshots[0].message.components[0].components[0].content, 'snapshot', 'saved snapshots must not retain a source reference');
  assert.equal(snapshots[0].message.embeds[0].image.url, undefined, 'nested embed URL repair must stay isolated from the source snapshot');

  const snakeCase = plugin.cleanupMessageObject({
    id: 'components-v2-snake',
    channel_id: 'channel',
    guild_id: 'guild',
    content: '',
    type: 0,
    flags: 32768,
    timestamp: 101,
    attachments: [],
    embeds: [],
    reactions: [],
    author: { id: 'author', username: 'Author' },
    mentions: [],
    components: [],
    message_snapshots: snapshots
  });
  assert.equal(snakeCase.message_snapshots[0].message.embeds[0].future_embed_data.retained, true, 'snake-case snapshots retain unknown embed fields');
  assert.equal(snakeCase.message_snapshots[0].message.embeds[0].image.url, 'https://example.invalid/snapshot-image');
  snakeCase.message_snapshots[0].message.id = 'changed';
  assert.equal(snapshots[0].message.id, 'snapshot-message');
});

test('message cleanup adds Components V2 wire aliases without mutating app-model payloads', () => {
  const sourceComponent = {
    type: 17,
    accentColor: 0xffcc00,
    components: [{
      type: 9,
      components: [{ type: 10, content: '## App component title' }],
      accessory: {
        type: 11,
        media: {
          url: 'https://external.example/app.png',
          proxyUrl: 'https://cdn.example/app.png',
          contentType: 'image/png',
          placeholderVersion: 1,
          attachmentId: '123',
          loadingState: 2,
          contentScanMetadata: { version: 4, flags: 0 }
        }
      }
    }, {
      type: 2,
      customId: 'app-action',
      label: 'Run'
    }]
  };
  const plugin = createPlugin({
    ChannelStore: { getChannel: () => null },
    UserStore: { getUser: () => null },
    messageStore: { getMessage: () => null },
    settings: { onlyRenderCachedAttachments: false }
  });
  const cleaned = plugin.cleanupMessageObject({
    id: 'app-components-v2',
    channel_id: 'channel',
    guild_id: 'guild',
    content: '',
    type: 0,
    flags: 32768,
    timestamp: 100,
    attachments: [],
    embeds: [],
    reactions: [],
    author: { id: 'app', username: 'App', bot: true },
    mentions: [],
    components: [sourceComponent]
  });
  const savedMedia = cleaned.components[0].components[0].accessory.media;

  assert.equal(cleaned.components[0].accent_color, 0xffcc00);
  assert.equal(cleaned.components[0].components[1].custom_id, 'app-action');
  assert.equal(savedMedia.proxy_url, 'https://cdn.example/app.png');
  assert.equal(savedMedia.content_type, 'image/png');
  assert.equal(savedMedia.placeholder_version, 1);
  assert.equal(savedMedia.attachment_id, '123');
  assert.equal(savedMedia.loading_state, 2);
  assert.deepEqual(savedMedia.content_scan_metadata, { version: 4, flags: 0 });
  assert.equal(savedMedia.proxyUrl, 'https://cdn.example/app.png', 'the original compatible alias remains available');
  assert.equal(sourceComponent.accent_color, undefined);
  assert.equal(sourceComponent.components[1].custom_id, undefined);
  assert.equal(sourceComponent.components[0].accessory.media.proxy_url, undefined);

  const rendered = plugin.getCacheOnlyMessage(cleaned);
  rendered.components[0].components[0].accessory.media.proxy_url = 'https://renderer.invalid/app.png';
  assert.equal(
    cleaned.components[0].components[0].accessory.media.proxy_url,
    'https://cdn.example/app.png',
    'render-time normalization stays isolated from the canonical record'
  );
  assert.match(plugin.getComponentPayloadSummary(cleaned.components), /App component title/);
});

test('message cleanup canonicalizes and detaches webhook and application metadata', () => {
  const interactionMetadata = {
    id: 'interaction-metadata',
    triggering_interaction_metadata: {
      id: 'nested-interaction',
      embeds: [{ image: { proxy_url: 'https://example.invalid/nested-image' } }]
    }
  };
  const application = {
    id: 'application-from-object',
    name: 'Example App',
    future_application_field: { retained: true }
  };
  const interaction = {
    id: 'deprecated-interaction',
    name: 'command',
    future_interaction_field: ['retained']
  };
  const plugin = createPlugin({
    settings: { ignoreBots: true, ignoreBlockedUsers: false },
    ChannelStore: { getChannel: () => null },
    UserStore: { getUser: () => null },
    messageStore: { getMessage: () => null },
    tools: {
      getUser: () => null,
      isBlocked: () => false
    }
  });
  const cleaned = plugin.cleanupMessageObject({
    id: 'automated-message',
    channel_id: 'channel',
    guild_id: 'guild',
    content: '',
    type: 0,
    flags: 32768,
    timestamp: 100,
    attachments: [],
    embeds: [{ title: 'App payload' }],
    reactions: [],
    author: { id: 'webhook-author', username: 'Webhook', bot: false },
    mentions: [],
    components: [{ type: 1, components: [{ type: 2, label: 'Action' }] }],
    webhookId: 'webhook-camel',
    application,
    applicationId: 'application-camel',
    interaction: {
      toJSON() {
        return interaction;
      }
    },
    interactionMetadata: {
      toJS() {
        return interactionMetadata;
      }
    }
  });

  assert.equal(cleaned.webhook_id, 'webhook-camel');
  assert.equal(cleaned.application_id, 'application-camel');
  assert.deepEqual(cleaned.application, application);
  assert.deepEqual(cleaned.interaction, interaction);
  assert.deepEqual(cleaned.interaction_metadata, {
    ...interactionMetadata,
    triggering_interaction_metadata: {
      ...interactionMetadata.triggering_interaction_metadata,
      embeds: [{
        image: {
          proxy_url: 'https://example.invalid/nested-image',
          url: 'https://example.invalid/nested-image'
        }
      }]
    }
  });
  assert.equal(cleaned.webhookId, undefined);
  assert.equal(cleaned.applicationId, undefined);
  assert.equal(cleaned.interactionMetadata, undefined);
  assert.equal(plugin.shouldIgnoreMessageAuthor(cleaned), true);

  cleaned.application.future_application_field.retained = false;
  cleaned.interaction.future_interaction_field[0] = 'changed';
  cleaned.interaction_metadata.triggering_interaction_metadata.id = 'changed';
  assert.equal(application.future_application_field.retained, true);
  assert.equal(interaction.future_interaction_field[0], 'retained');
  assert.equal(interactionMetadata.triggering_interaction_metadata.id, 'nested-interaction');

  const human = plugin.cleanupMessageObject({
    id: 'human-components-v2',
    channel_id: 'channel',
    guild_id: 'guild',
    content: '',
    type: 0,
    flags: 32768,
    timestamp: 101,
    attachments: [],
    embeds: [{ title: 'Human embed' }],
    reactions: [],
    author: { id: 'human', username: 'Human', bot: false },
    mentions: [],
    components: [{ type: 1, components: [{ type: 2, label: 'Human action' }] }],
    webhook_id: '',
    application_id: null,
    interaction: null,
    interaction_metadata: null
  });
  assert.equal(human.webhook_id, undefined);
  assert.equal(human.application_id, undefined);
  assert.equal(human.interaction, undefined);
  assert.equal(human.interaction_metadata, undefined);
  assert.equal(plugin.shouldIgnoreMessageAuthor(human), false);
});

test('ephemeral bit 64 is excluded even when Components V2 is also set', () => {
  const plugin = createPlugin({
    settings: { cacheAllImages: false },
    messageRecord: {},
    messageRecordIds: new Set()
  });
  const ephemeralV2 = {
    id: 'ephemeral-v2',
    channel_id: 'channel',
    type: 0,
    flags: 64 | 32768
  };

  assert.equal(plugin.isEphemeralMessage({ flags: 64 }), true);
  assert.equal(plugin.isEphemeralMessage(ephemeralV2), true);
  assert.equal(plugin.isEphemeralMessage({ flags: 32768 }), false);
  assert.equal(plugin.saveDeletedMessage(ephemeralV2, {}), false);
  assert.deepEqual(plugin.messageRecord, {});
});

test('embed cleanup follows raw JSON export and canonicalizes Discord wire aliases', () => {
  const plugin = createPlugin();
  const wireEmbed = {
    title: 'Wire title',
    description: 'Wire description',
    fields: [{ name: 'Wire name', value: 'Wire value', inline: true }],
    unknown_embed_data: { retained: ['from', 'toJSON'] }
  };
  const model = {
    toJS() {
      return {
        rawTitle: 'Wrong toJS title',
        rawDescription: 'Wrong toJS description',
        fields: [{ rawName: 'Wrong name', rawValue: 'Wrong value' }]
      };
    },
    toJSON() { return wireEmbed; }
  };
  const rawAliasEmbed = {
    rawTitle: 'Raw title',
    rawDescription: 'Raw description',
    referenceId: 'reference',
    color: '#112233',
    fields: [{ rawName: 'Raw name', rawValue: 'Raw value', unknown_field_data: true }],
    author: { name: 'Author', iconURL: 'https://example.invalid/author.png' },
    footer: { text: 'Footer', iconProxyURL: 'https://example.invalid/footer.png' },
    image: { proxyURL: 'https://example.invalid/image.png', unknown_media_data: 7 },
    unknown_embed_data: { retained: ['raw', 'alias'] }
  };

  const normalized = plugin.normalizeMessageEmbeds([model, rawAliasEmbed]);

  assert.deepEqual(normalized[0], wireEmbed, 'direct JSON/toJSON export must win over the component-style toJS path');
  assert.equal(normalized[1].title, 'Raw title');
  assert.equal(normalized[1].description, 'Raw description');
  assert.equal(normalized[1].reference_id, 'reference');
  assert.equal(normalized[1].color, 0x112233);
  assert.equal(normalized[1].fields[0].name, 'Raw name');
  assert.equal(normalized[1].fields[0].value, 'Raw value');
  assert.equal(normalized[1].fields[0].unknown_field_data, true);
  assert.equal(normalized[1].author.icon_url, 'https://example.invalid/author.png');
  assert.equal(normalized[1].footer.proxy_icon_url, 'https://example.invalid/footer.png');
  assert.equal(normalized[1].image.url, 'https://example.invalid/image.png');
  assert.equal(normalized[1].image.proxy_url, 'https://example.invalid/image.png');
  assert.equal(normalized[1].image.unknown_media_data, 7);
  assert.deepEqual(normalized[1].unknown_embed_data, { retained: ['raw', 'alias'] });

  normalized[0].unknown_embed_data.retained[0] = 'changed';
  normalized[1].unknown_embed_data.retained[0] = 'changed';
  assert.equal(wireEmbed.unknown_embed_data.retained[0], 'from');
  assert.equal(rawAliasEmbed.unknown_embed_data.retained[0], 'raw');
});

test('message cleanup drops malformed embed media and canonicalizes usable URL forms', () => {
  const plugin = createPlugin({
    ChannelStore: { getChannel: () => null },
    UserStore: { getUser: () => null },
    messageStore: { getMessage: () => null }
  });
  const cleaned = plugin.cleanupMessageObject({
    id: 'embed-media',
    channel_id: 'channel',
    guild_id: 'guild',
    content: '',
    type: 0,
    flags: 0,
    timestamp: 100,
    attachments: [],
    reactions: [],
    author: { id: 'author', username: 'Author' },
    mentions: [],
    embeds: [
      {
        id: 'missing-media',
        type: 'rich',
        image: { width: 12, height: 34 },
        thumbnail: { width: 56, height: 78 },
        video: { width: 90, height: 12 },
        images: [{ width: 11, height: 22 }]
      },
      {
        id: 'url-only',
        type: 'rich',
        image: { url: 'https://example.invalid/image' },
        thumbnail: { url: 'https://example.invalid/thumbnail' },
        video: { url: 'https://example.invalid/video' }
      },
      {
        id: 'proxy-only',
        type: 'rich',
        image: { proxy_url: 'https://example.invalid/proxy-image' },
        thumbnail: { proxy_url: 'https://example.invalid/proxy-thumbnail' },
        video: { proxy_url: 'https://example.invalid/proxy-video' },
        images: [
          { width: 33, height: 44 },
          { proxy_url: 'https://example.invalid/proxy-gallery' }
        ]
      }
    ]
  });

  assert.equal(cleaned.embeds[0].image, undefined);
  assert.equal(cleaned.embeds[0].thumbnail, undefined);
  assert.equal(cleaned.embeds[0].video, undefined);
  assert.equal(cleaned.embeds[0].images, undefined, 'an empty sanitized gallery must be removed entirely');
  for (const key of ['image', 'thumbnail', 'video']) {
    assert.equal(cleaned.embeds[1][key].url, `https://example.invalid/${key === 'image' ? 'image' : key}`);
    assert.equal(cleaned.embeds[1][key].proxy_url, cleaned.embeds[1][key].url);
    assert.equal(cleaned.embeds[2][key].url, cleaned.embeds[2][key].proxy_url);
  }
  assert.deepEqual(cleaned.embeds[2].images, [{
    proxy_url: 'https://example.invalid/proxy-gallery',
    url: 'https://example.invalid/proxy-gallery'
  }]);
});

test('components-only messages are supported payloads', () => {
  const plugin = createPlugin();
  assert.equal(plugin.hasSupportedMessagePayload({ flags: 32768, components: [{ type: 1 }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ flags: 32768, components: [] }), false);
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

test('permission-independent context Delete is limited to exact indexed saved deletions', () => {
  const exact = createNativeDeletePlugin();
  assert.equal(exact.plugin.shouldAddPermissionIndependentContextDelete(
    exact.record,
    exact.messageId,
    exact.channelId,
    false
  ), true);
  assert.equal(exact.plugin.shouldAddPermissionIndependentContextDelete(
    exact.record,
    exact.messageId,
    exact.channelId,
    true
  ), false, 'Discord native Delete must never be duplicated');
  assert.equal(exact.plugin.shouldAddPermissionIndependentContextDelete(
    exact.record,
    exact.messageId,
    'wrong-channel',
    false
  ), false);

  const unindexed = createNativeDeletePlugin();
  unindexed.plugin.deletedMessageRecord = {};
  unindexed.plugin.deletedMessageSet = new Map();
  assert.equal(unindexed.plugin.shouldAddPermissionIndependentContextDelete(
    unindexed.record,
    unindexed.messageId,
    unindexed.channelId,
    false
  ), false);
  assert.equal(exact.plugin.shouldAddPermissionIndependentContextDelete(
    { message: { id: 'edit', channel_id: exact.channelId }, edit_history: [{}] },
    'edit',
    exact.channelId,
    false
  ), false);
});

test('native MessageActions wrapper calls Discord only for non-logger deletions', async () => {
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
    const originalResult = { native: true };
    const result = plugin.processNativeMessageDeleteAction([channelId, id], () => {
      originalCalls++;
      return originalResult;
    });
    return { originalCalls, originalResult, plugin, result };
  };
  const saved = id => ({
    message: { id, channel_id: 'wrapper-channel' },
    delete_data: { hidden: false }
  });

  const live = run({ id: 'live' });
  assert.equal(live.originalCalls, 1);
  assert.equal(live.result, live.originalResult);
  const edit = run({
    id: 'edit',
    record: { message: { id: 'edit', channel_id: 'wrapper-channel' }, edit_history: [{}] }
  });
  assert.equal(edit.originalCalls, 1);
  assert.equal(edit.result, edit.originalResult);
  const unindexed = run({ id: 'unindexed', record: saved('unindexed') });
  assert.equal(unindexed.originalCalls, 1);
  assert.equal(unindexed.result, unindexed.originalResult);
  const deleted = run({ id: 'deleted', indexed: 'deleted', record: saved('deleted') });
  assert.equal(deleted.originalCalls, 0);
  assert.equal(typeof deleted.result?.then, 'function');
  assert.equal(await deleted.result, undefined);
  const purged = run({ id: 'purged', indexed: 'purged', record: saved('purged') });
  assert.equal(purged.originalCalls, 0);
  assert.equal(typeof purged.result?.then, 'function');
  assert.equal(await purged.result, undefined);
  const threadSystem = run({ id: 'thread-system', indexed: 'deleted', record: saved('thread-system'), threadCreated: true });
  assert.equal(threadSystem.originalCalls, 1);
  assert.equal(threadSystem.result, threadSystem.originalResult);
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
  const submenu = createNativeDeletePlugin();
  assert.equal(submenu.plugin.requestSavedDeletedRecordRemoval(
    submenu.channelId,
    submenu.messageId,
    true,
    'Message Logger submenu Delete'
  ), true);
  assert.equal(confirmationEvents.length, 0);
  assert.equal(submenu.plugin.messageRecord[submenu.messageId], undefined);
  assert.equal(loggerEvents.some(event => (
    event[0] === 'log' && String(event[1]).includes('Message Logger submenu Delete')
  )), true);

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

test('native Delete icon resolver accepts only unambiguous callable exports', () => {
  const plugin = createPlugin();
  const NativeTrashIcon = function NativeTrashIcon() {};

  assert.equal(plugin.resolveNativeDeleteIconExport(NativeTrashIcon), NativeTrashIcon);
  assert.equal(plugin.resolveNativeDeleteIconExport({ default: NativeTrashIcon }), NativeTrashIcon);
  assert.equal(plugin.resolveNativeDeleteIconExport({ u: NativeTrashIcon }), NativeTrashIcon);
  assert.equal(plugin.resolveNativeDeleteIconExport({ a() {}, b() {} }), null);
  assert.equal(plugin.resolveNativeDeleteIconExport({ u: 'not callable' }), null);
});

test('non-inline restored Delete controls mount the immediate generic Trash fallback', () => {
  const attributes = new Map();
  const host = {
    className: '',
    setAttribute(name, value) { attributes.set(name, String(value)); },
    addEventListener() {},
    replaceChildren() {}
  };
  const NativeTrashIcon = function NativeTrashIcon() {};
  let rendered = null;
  const root = {
    render(child) { rendered = child; },
    unmount() {}
  };
  ReactDOM.createRoot = target => {
    assert.equal(target, host);
    return root;
  };
  const plugin = createPlugin({
    style: { restoredDeleteButton: 'logger-delete' },
    getNativeDeleteIconComponent: () => NativeTrashIcon,
    handleCopiedNativeDeleteActivation() {}
  });
  const previousDocument = global.document;
  global.document = { createElement: () => host };
  try {
    assert.equal(plugin.createCopiedNativeDeleteControl({
      message: { id: 'fallback-message', channel_id: 'fallback-channel' },
      delete_data: {}
    }), host);
  } finally {
    global.document = previousDocument;
  }

  assert.equal(attributes.get('data-ml2-fallback-delete-control'), 'true');
  assert.equal(attributes.has('data-ml2-pending-delete-control'), false);
  assert.equal(rendered.type, 'button');
  assert.equal(rendered.props['aria-label'], 'Delete');
  assert.equal(rendered.props.children[0].type, NativeTrashIcon);
  assert.equal(rendered.props.children[0].props.width, 20);
  assert.equal(plugin._copiedDeleteControlRoots.get(host), root);
});

test('inline restored Delete controls remain pending until native presentation capture', () => {
  const attributes = new Map();
  const host = {
    className: '',
    setAttribute(name, value) { attributes.set(name, String(value)); },
    addEventListener() {},
    replaceChildren() {}
  };
  const NativeTrashIcon = function NativeTrashIcon() {};
  ReactDOM.createRoot = () => {
    throw new Error('inline controls must wait for captured presentation');
  };
  const plugin = createPlugin({
    style: { restoredDeleteButton: 'logger-delete', restoredInlineDeleteButton: 'inline-delete' },
    getNativeDeleteIconComponent: () => NativeTrashIcon
  });
  const previousDocument = global.document;
  global.document = { createElement: () => host };
  try {
    assert.equal(plugin.createCopiedNativeDeleteControl({
      message: { id: 'inline-pending', channel_id: 'inline-channel' },
      delete_data: {}
    }, { inline: true }), host);
  } finally {
    global.document = previousDocument;
  }

  assert.equal(attributes.get('data-ml2-pending-delete-control'), 'true');
  assert.equal(attributes.has('data-ml2-fallback-delete-control'), false);
});

test('permission-independent inline Delete is the direct native toolbar action', () => {
  const attributes = new Map();
  const listeners = new Map();
  const host = {
    className: '',
    tabIndex: null,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    replaceChildren() {}
  };
  const NativeTrashIcon = function NativeTrashIcon() {};
  const root = {
    rendered: null,
    render(child) { this.rendered = child; },
    unmount() {}
  };
  ReactDOM.createRoot = target => {
    assert.equal(target, host);
    return root;
  };
  const activations = [];
  const plugin = createPlugin({
    style: { restoredDeleteButton: 'logger-delete', restoredInlineDeleteButton: 'inline-delete' },
    _nativeDeleteButtonPresentation: {
      tagName: 'div',
      className: 'native-toolbar-action',
      role: 'button',
      label: 'Delete',
      useNativeTrashIcon: true,
      iconClassName: 'native-trash-icon',
      iconWidth: '24',
      iconHeight: '24',
      iconViewBox: '0 0 24 24'
    },
    getNativeDeleteIconComponent: () => NativeTrashIcon,
    handleCopiedNativeDeleteActivation(event, channelId, messageId) {
      activations.push({ event, channelId, messageId });
    }
  });
  let createdTag = '';
  const previousDocument = global.document;
  global.document = {
    createElement(tagName) {
      createdTag = tagName;
      return host;
    }
  };
  try {
    assert.equal(plugin.createCopiedNativeDeleteControl({
      message: { id: 'inline-message', channel_id: 'inline-channel' },
      delete_data: {}
    }, { inline: true }), host);
  } finally {
    global.document = previousDocument;
  }

  assert.equal(createdTag, 'div');
  assert.match(host.className, /logger-delete/);
  assert.match(host.className, /inline-delete/);
  assert.match(host.className, /native-toolbar-action/);
  assert.equal(attributes.get('data-ml2-inline-delete-control'), 'true');
  assert.equal(attributes.get('aria-label'), 'Delete');
  assert.equal(attributes.get('title'), 'Delete');
  assert.equal(attributes.get('role'), 'button');
  assert.equal(host.tabIndex, 0);
  assert.equal(root.rendered.type, NativeTrashIcon, 'the TrashIcon must mount directly inside the toolbar action');
  assert.equal(root.rendered.props.className, 'native-trash-icon');
  assert.equal(plugin._copiedDeleteControlRoots.get(host), root);

  let selectionPreventions = 0;
  listeners.get('mousedown')({ shiftKey: false, preventDefault() { selectionPreventions++; } });
  assert.equal(selectionPreventions, 0, 'ordinary presses must retain native focus behavior');
  listeners.get('mousedown')({ shiftKey: true, preventDefault() { selectionPreventions++; } });
  assert.equal(selectionPreventions, 1, 'Shift-press must not begin browser text selection');

  const clickEvent = { shiftKey: true };
  listeners.get('click')(clickEvent);
  assert.deepEqual(activations.at(-1), {
    event: clickEvent,
    channelId: 'inline-channel',
    messageId: 'inline-message'
  });
  const keyEvent = { key: 'Enter', shiftKey: false };
  listeners.get('keydown')(keyEvent);
  assert.deepEqual(activations.at(-1), {
    event: keyEvent,
    channelId: 'inline-channel',
    messageId: 'inline-message'
  });
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

test('permission-independent Trash mounts in the shared native action row', () => {
  const toolbar = {
    contains(node) { return node === actionRow || actionRow.contains(node); },
    querySelectorAll() { return [firstAction, secondAction]; }
  };
  const actionRow = {
    parentElement: toolbar,
    contains(node) {
      return node === firstWrapper || node === secondWrapper
        || firstWrapper.contains(node) || secondWrapper.contains(node);
    }
  };
  const makeWrapper = () => ({
    parentElement: actionRow,
    action: null,
    contains(node) { return node === this.action; }
  });
  const firstWrapper = makeWrapper();
  const secondWrapper = makeWrapper();
  const makeAction = wrapper => ({
    parentElement: wrapper,
    querySelector: selector => selector === 'svg' ? {} : null,
    closest: () => null
  });
  const firstAction = firstWrapper.action = makeAction(firstWrapper);
  const secondAction = secondWrapper.action = makeAction(secondWrapper);
  const plugin = createPlugin();

  assert.equal(plugin.getNativeMessageToolbarActionRow(toolbar), actionRow);
  toolbar.querySelectorAll = () => [firstAction];
  assert.equal(plugin.getNativeMessageToolbarActionRow(toolbar), toolbar, 'one action is not enough to identify a shared row safely');
});

test('an early outer-toolbar fallback is rebuilt in the action row without moving its React root', () => {
  const channelId = 'rehome-channel';
  const messageId = 'rehome-message';
  const toolbar = {};
  const existing = {
    parentElement: toolbar,
    remove() { this.removed = true; }
  };
  const replacement = { parentElement: null };
  const actionRow = {
    appendChild(node) {
      node.parentElement = this;
      this.appended = node;
    }
  };
  toolbar.querySelector = () => existing;
  toolbar.querySelectorAll = () => [];
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true
    },
    messageRecord: {
      [messageId]: { message: { id: messageId, channel_id: channelId }, delete_data: { hidden: false } }
    },
    deletedMessageRecord: { [channelId]: [messageId] },
    deletedMessageSet: new Map([[channelId, new Set([messageId])]]),
    purgedMessageRecord: {},
    purgedMessageSet: new Map(),
    inspectNativeDestructiveMessageCandidate: () => null,
    getNativeMessageToolbarActionRow: () => actionRow,
    createCopiedNativeDeleteControl: (_record, options) => {
      assert.equal(options.inline, true);
      return replacement;
    },
    cleanupCopiedNativeDeleteControls(host) { this.cleanedHost = host; }
  });

  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(toolbar, channelId, messageId), true);
  assert.equal(actionRow.appended, replacement);
  assert.equal(replacement.parentElement, actionRow);
  assert.equal(plugin.cleanedHost, existing);
  assert.equal(existing.removed, true);
});

test('permission-independent toolbar fallback is owned only by exact indexed logger records', () => {
  const channelId = 'toolbar-channel';
  const deletedId = 'toolbar-deleted';
  const purgedId = 'toolbar-purged';
  const editId = 'toolbar-edit';
  const unindexedId = 'toolbar-unindexed';
  const saved = id => ({ message: { id, channel_id: channelId }, delete_data: { hidden: false } });
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true
    },
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

  plugin.settings.restoreDeletedMessages = false;
  const disabledFallback = purgedToolbar.existing;
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(purgedToolbar, channelId, purgedId), false);
  assert.equal(disabledFallback.removed, true, 'master-off reconciliation removes the logger toolbar action');
  plugin.settings.restoreDeletedMessages = true;
  purgedToolbar.existing = null;
  assert.equal(plugin.wireNativeRestoredMessageDeleteControl(purgedToolbar, channelId, purgedId), true);

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
    addEventListener() {},
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
