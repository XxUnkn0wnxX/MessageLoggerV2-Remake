const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPlugin,
  resetHarness
} = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

function createLiveDeletePlugin(settings = {}) {
  const guild = { id: 'guild', name: 'Guild' };
  const channel = { id: 'channel', guild_id: guild.id, name: 'general', type: 0 };
  const messages = new Map();
  const calls = {
    annotations: [],
    cacheOnlyRefreshes: [],
    counters: [],
    dispatches: [],
    notifications: [],
    saves: 0,
    tints: []
  };
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: false,
      showDeletedMessages: true,
      showPurgedMessages: true,
      ignoreBots: false,
      ignoreSelf: false,
      ignoreBlockedUsers: false,
      ignoreNSFW: false,
      ignoreLocalEdits: false,
      ignoreLocalDeletes: false,
      ignoreMutedGuilds: false,
      ignoreMutedChannels: false,
      alwaysLogGhostPings: false,
      alwaysLogSelected: false,
      alwaysLogDM: false,
      onlyLogWhitelist: false,
      whitelist: [],
      blacklist: [],
      ...settings
    },
    localUser: { id: 'local' },
    selectedChannel: { id: 'elsewhere', guild_id: guild.id },
    localDeletes: [],
    messageRecord: {},
    messageRecordIds: new Set(),
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    editedMessageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    editedMessageSet: new Map(),
    tempEditedMessageRecord: {},
    channelMessages: {},
    tools: {
      getChannel: id => id === channel.id ? channel : null,
      getServer: id => id === guild.id ? guild : null,
      getUser: id => ({ id, username: `User ${id}` }),
      isBlocked: () => false,
      isMentioned: () => false
    },
    getCachedMessage: id => messages.get(String(id)) || null,
    isForumThreadChannel: () => false,
    shouldIgnoreMessageAuthor: () => false,
    shouldIgnoreSelfMessage: () => false,
    _ensureChannelCached() {},
    cacheChannelMessages() {},
    isLocalDeleteEvent: () => false,
    _shouldShowToast: () => true,
    _notifyEventOnce(...args) { calls.notifications.push(args); },
    _notifyEvent(...args) { calls.notifications.push(args); },
    _incrementMessageCount(...args) { calls.counters.push(args); },
    annotateSavedForumThreadMessage(...args) { calls.annotations.push(args); },
    refreshCacheOnlyMessage(message) { calls.cacheOnlyRefreshes.push(message.id); },
    _scheduleTintForMessage(channelId, messageId) { calls.tints.push([channelId, messageId]); },
    dispatcher: { dispatch: event => calls.dispatches.push(event) },
    createSavedEventBatch: () => ({ id: 'batch' }),
    createMiniFormattedData: message => ({
      message: structuredClone(message),
      saved_location: { channelId: message.channel_id },
      local_mentioned: false,
      ghost_pinged: false,
      logged_attachments: [],
      edit_history: null
    }),
    syncMessageUpdatePayload(payload, _previous, records = []) {
      for (const record of records) {
        if (record?.message) record.message = { ...record.message, ...structuredClone(payload) };
      }
      return payload;
    },
    saveData() { calls.saves++; }
  });

  plugin.saveDeletedMessage = (message, index) => {
    const id = String(message.id);
    plugin.messageRecord[id] = {
      message: structuredClone(message),
      delete_data: { time: 1, hidden: false }
    };
    if (!index[channel.id]) index[channel.id] = [];
    if (!index[channel.id].includes(id)) index[channel.id].push(id);
    const setMap = index === plugin.purgedMessageRecord
      ? plugin.purgedMessageSet
      : plugin.deletedMessageSet;
    if (!setMap.has(channel.id)) setMap.set(channel.id, new Set());
    setMap.get(channel.id).add(id);
  };

  const addMessage = id => {
    const message = {
      id: String(id),
      channel_id: channel.id,
      guild_id: guild.id,
      content: `message ${id}`,
      type: 0,
      flags: 0,
      author: { id: `author-${id}`, username: `Author ${id}` }
    };
    messages.set(message.id, message);
    return message;
  };

  return { addMessage, calls, channel, guild, plugin };
}

test('saved-message presentation helpers require their matching display switches', () => {
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: false,
      showEditedMessages: false
    },
    messageRecord: {
      deleted: {
        message: { id: 'deleted', channel_id: 'channel' },
        delete_data: { hidden: false }
      },
      purged: {
        message: { id: 'purged', channel_id: 'channel' },
        delete_data: { hidden: false }
      }
    },
    deletedMessageSet: new Map([['channel', new Set(['deleted'])]]),
    purgedMessageSet: new Map([['channel', new Set(['purged'])]])
  });

  assert.equal(plugin.shouldPresentDeletedMessages(), true);
  assert.equal(plugin.shouldPresentPurgedMessages(), false);
  assert.equal(plugin.shouldPresentEditedMessages(), false);
  assert.equal(plugin.shouldPresentSavedMessage('channel', 'deleted'), true);
  assert.equal(plugin.shouldPresentSavedMessage('channel', 'purged'), false);

  plugin.settings.showPurgedMessages = true;
  assert.equal(plugin.shouldPresentSavedMessage('channel', 'purged'), true);
  plugin.settings.showEditedMessages = true;
  assert.equal(plugin.shouldPresentEditedMessages(), true);
  plugin.settings.restoreDeletedMessages = false;
  assert.equal(plugin.shouldPresentAnySavedDeletion(), false);
  assert.equal(plugin.shouldPresentSavedMessage('channel', 'deleted'), false);
  assert.equal(plugin.shouldPresentSavedMessage('channel', 'purged'), false);
});

test('display-off future edits stay logged while Discord renders only the current message', () => {
  const { addMessage, calls, channel, guild, plugin } = createLiveDeletePlugin({
    showEditedMessages: false
  });
  const original = addMessage('150');
  const updated = {
    ...structuredClone(original),
    content: 'edited content',
    edited_timestamp: '2026-07-22T00:00:00.000Z'
  };
  plugin._shouldShowToast = () => false;
  const nativeResult = { native: true };
  let nativeCalls = 0;

  const result = plugin.onDispatchEvent([
    { type: 'MESSAGE_UPDATE', message: updated }
  ], () => {
    nativeCalls++;
    return nativeResult;
  });

  assert.equal(result, nativeResult);
  assert.equal(nativeCalls, 1, 'Discord still receives the edit and renders its current content');
  assert.deepEqual(plugin.editedMessageRecord[channel.id], [original.id]);
  assert.equal(plugin.editedMessageSet.get(channel.id).has(original.id), true);
  assert.equal(plugin.messageRecord[original.id].edit_history[0].content, original.content);
  assert.equal(plugin.messageRecord[original.id].message.content, updated.content);
  assert.deepEqual(calls.counters, [['edited', channel, guild]]);
  assert.equal(calls.saves, 1);
  assert.deepEqual(calls.dispatches, []);
});

test('master-off single deletes keep logging but follow Discord native removal', () => {
  const { addMessage, calls, channel, guild, plugin } = createLiveDeletePlugin();
  const message = addMessage('100');
  const nativeResult = { native: true };
  let nativeCalls = 0;

  const result = plugin.onDispatchEvent([
    { type: 'MESSAGE_DELETE', id: message.id, channelId: channel.id }
  ], () => {
    nativeCalls++;
    return nativeResult;
  });

  assert.equal(result, nativeResult);
  assert.equal(nativeCalls, 1);
  assert.ok(plugin.messageRecord[message.id]);
  assert.deepEqual(plugin.deletedMessageRecord[channel.id], [message.id]);
  assert.equal(plugin.deletedMessageSet.get(channel.id).has(message.id), true);
  assert.deepEqual(calls.counters, [['deleted', channel, guild]]);
  assert.deepEqual(calls.notifications.map(args => args.slice(0, 7)), [[
    'deleted', 'delete', [message.id], channel, guild, message.id
  ]]);
  assert.equal(calls.saves, 1);
  assert.deepEqual(calls.cacheOnlyRefreshes, []);
  assert.deepEqual(calls.tints, []);
  assert.deepEqual(calls.dispatches, []);
});

test('master-off bulk purges keep every record but schedule no live presentation', () => {
  const { addMessage, calls, channel, guild, plugin } = createLiveDeletePlugin();
  const first = addMessage('200');
  const second = addMessage('201');
  const nativeResult = { native: true };
  let nativeCalls = 0;

  const result = plugin.onDispatchEvent([
    { type: 'MESSAGE_DELETE_BULK', ids: [first.id, second.id], channelId: channel.id }
  ], () => {
    nativeCalls++;
    return nativeResult;
  });

  assert.equal(result, nativeResult);
  assert.equal(nativeCalls, 1);
  assert.deepEqual(plugin.purgedMessageRecord[channel.id], [first.id, second.id]);
  assert.deepEqual(plugin.purgedMessageSet.get(channel.id), new Set([first.id, second.id]));
  assert.ok(plugin.messageRecord[first.id]);
  assert.ok(plugin.messageRecord[second.id]);
  assert.deepEqual(calls.counters, [['deleted', channel, guild, 2]]);
  assert.equal(calls.notifications.length, 1);
  assert.deepEqual(calls.notifications[0].slice(0, 6), [
    'bulkDelete', 'delete', [first.id, second.id], channel, guild, undefined
  ]);
  assert.equal(calls.saves, 1);
  assert.deepEqual(calls.cacheOnlyRefreshes, []);
  assert.deepEqual(calls.tints, []);
  assert.deepEqual(calls.dispatches, []);
});

test('master-off structural thread deletes remain logged and reconcile only for cleanup', () => {
  const threadId = '300';
  const parentId = 'parent';
  const guild = { id: 'guild' };
  const thread = { id: threadId, parent_id: parentId, guild_id: guild.id, name: 'Thread', type: 11 };
  const starter = {
    id: threadId,
    channel_id: threadId,
    guild_id: guild.id,
    content: 'starter',
    type: 0,
    flags: 0,
    author: { id: 'author', username: 'Author' }
  };
  const calls = { counters: [], notifications: [], refreshes: 0, saves: 0, tints: [] };
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: false,
      showDeletedMessages: true,
      showPurgedMessages: true,
      ignoreLocalDeletes: false
    },
    selectedChannel: { id: parentId },
    localDeletes: [],
    messageRecord: {},
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    forumThreadMetadataCache: new Map(),
    isSuppressedForumThreadId: () => false,
    getCachedForumThreadMessages: () => [],
    getSavedForumThreadMetadata: () => null,
    getCachedForumThreadStarterCandidate: () => starter,
    cacheForumThreadMetadata: () => ({ parentId, name: thread.name }),
    getForumThreadDeleteMessage: () => starter,
    isLocalDeleteEvent: () => false,
    shouldIgnoreMessageAuthor: () => false,
    shouldIgnoreSelfMessage: () => false,
    saveCachedForumThreadMessagesForDelete: () => 0,
    foldSavedThreadStarterIntoRoot() {},
    promoteOldestSavedThreadReplyIntoRoot() {},
    preservePurgedThreadRootCategory() {},
    _incrementMessageCount(...args) { calls.counters.push(args); },
    _shouldShowToast: () => true,
    _notifyEventOnce(...args) { calls.notifications.push(args); },
    _scheduleTintForMessage(channelId, messageId) { calls.tints.push([channelId, messageId]); },
    scheduleForumListRefresh() { calls.refreshes++; },
    saveData() { calls.saves++; }
  });
  plugin.saveDeletedMessage = message => {
    plugin.messageRecord[message.id] = {
      message: structuredClone(message),
      delete_data: { time: 1, hidden: false }
    };
    plugin.deletedMessageRecord[threadId] = [threadId];
    plugin.deletedMessageSet.set(threadId, new Set([threadId]));
  };
  const nativeResult = { native: true };
  let nativeCalls = 0;

  const result = plugin.handleForumThreadDelete(thread, guild, () => {
    nativeCalls++;
    return nativeResult;
  }, [{ type: 'THREAD_DELETE', channel: thread }]);

  assert.equal(result, nativeResult);
  assert.equal(nativeCalls, 1);
  assert.equal(plugin.messageRecord[threadId].delete_data.forum_thread_delete, true);
  assert.deepEqual(plugin.deletedMessageRecord[threadId], [threadId]);
  assert.deepEqual(calls.counters, [['deleted', thread, guild]]);
  assert.deepEqual(calls.notifications.map(args => args.slice(0, 6)), [[
    'deleted', 'delete', [threadId], thread, guild, threadId
  ]]);
  assert.equal(calls.saves, 1);
  assert.deepEqual(calls.tints, []);
  assert.equal(calls.refreshes, 1, 'the disabled reconciliation removes stale forum/thread clones');
});

test('shared notification actions keep View but omit mount-dependent Jump when the master is off', () => {
  const actionsByEvent = [];
  const record = { message: { id: '400', channel_id: 'channel', guild_id: 'guild' }, delete_data: {} };
  let openedTab = null;
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: false,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showEditedMessages: false
    },
    messageRecord: { 400: record },
    deletedMessageSet: new Map([['channel', new Set(['400'])]]),
    purgedMessageSet: new Map(),
    canJumpToSavedRecord: () => true,
    openWindow(tab) { openedTab = tab; },
    _showNotification(_title, _message, _type, actions) { actionsByEvent.push(actions); }
  });
  const channel = { id: 'channel', guild_id: 'guild' };
  const guild = { id: 'guild' };
  const notify = (eventType, options = {}) => plugin._notifyEvent(
    eventType,
    channel,
    guild,
    record.message.id,
    { locationName: 'Guild, #general', ...options }
  );

  notify('deleted');
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View']);
  actionsByEvent.at(-1)[0].onClick();
  assert.equal(openedTab, 'deleted');

  notify('ghostPing', { jumpMountCategory: 'deleted' });
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View']);
  notify('ghostPing');
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View', 'Jump']);

  notify('edited');
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View']);
  notify('ghostPing', { jumpMountCategory: 'edited' });
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View']);

  plugin.settings.restoreDeletedMessages = true;
  notify('deleted');
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View', 'Jump']);
  plugin.settings.showEditedMessages = true;
  notify('edited');
  assert.deepEqual(actionsByEvent.at(-1).map(action => action.label), ['View', 'Jump']);

  const pendingDeleteActions = [];
  const pendingDeleteRecord = {
    message: { id: '401', channel_id: channel.id, guild_id: guild.id },
    edit_history: [{ content: 'before deletion', time: 1 }]
  };
  const pendingDeletePlugin = createPlugin({
    settings: {
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showEditedMessages: false
    },
    messageRecord: { 401: pendingDeleteRecord },
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    tools: { getChannel: id => id === channel.id ? channel : null },
    _showNotification(_title, _message, _type, actions) { pendingDeleteActions.push(actions); }
  });
  const notifyPendingDelete = (eventType, options = {}) => pendingDeletePlugin._notifyEvent(
    eventType,
    channel,
    guild,
    pendingDeleteRecord.message.id,
    { locationName: 'Guild, #general', ...options }
  );

  notifyPendingDelete('deleted');
  assert.deepEqual(pendingDeleteActions.at(-1).map(action => action.label), ['View', 'Jump']);
  notifyPendingDelete('ghostPing', { jumpMountCategory: 'deleted' });
  assert.deepEqual(pendingDeleteActions.at(-1).map(action => action.label), ['View', 'Jump']);
  pendingDeleteRecord.edits_hidden = true;
  notifyPendingDelete('deleted');
  assert.deepEqual(
    pendingDeleteActions.at(-1).map(action => action.label),
    ['View'],
    'the pending deletion category must not bypass a genuinely Hidden record'
  );
  pendingDeleteRecord.edits_hidden = false;
  assert.equal(
    pendingDeletePlugin.canJumpToSavedRecord(pendingDeleteRecord),
    false,
    'ordinary edited-record Jump remains disabled outside the pending delete alert'
  );

  const freshDeleteActions = [];
  const freshDeleteJumps = [];
  const freshDeletePlugin = createPlugin({
    settings: {
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showEditedMessages: true
    },
    messageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    tools: { getChannel: id => id === channel.id ? channel : null },
    jumpToMessage(...args) { freshDeleteJumps.push(args); },
    _showNotification(_title, _message, _type, actions) { freshDeleteActions.push(actions); }
  });
  freshDeletePlugin._notifyEvent('deleted', channel, guild, '402', {
    locationName: 'Guild, #general'
  });
  assert.deepEqual(freshDeleteActions.at(-1).map(action => action.label), ['View', 'Jump']);
  const canonicalDeleteRecord = {
    message: { id: '402', channel_id: channel.id, guild_id: guild.id },
    delete_data: { hidden: false }
  };
  freshDeletePlugin.messageRecord['402'] = canonicalDeleteRecord;
  freshDeletePlugin.deletedMessageSet.set(channel.id, new Set(['402']));
  canonicalDeleteRecord.delete_data.hidden = true;
  freshDeleteActions.at(-1).find(action => action.label === 'Jump').onClick();
  assert.deepEqual(
    freshDeleteJumps,
    [],
    'an already-open alert rechecks the canonical record after it moves to Hidden'
  );
  canonicalDeleteRecord.delete_data.hidden = false;
  freshDeletePlugin.settings.restoreDeletedMessages = false;
  freshDeleteActions.at(-1).find(action => action.label === 'Jump').onClick();
  assert.deepEqual(
    freshDeleteJumps,
    [],
    'an already-open alert rechecks the canonical record after its display gate closes'
  );
});

test('logger and injected-menu Jump availability follows the corresponding display switch', () => {
  const channel = { id: 'channel', guild_id: 'guild' };
  const deleted = {
    message: { id: 'deleted', channel_id: channel.id, guild_id: channel.guild_id },
    delete_data: { hidden: false }
  };
  const edited = {
    message: { id: 'edited', channel_id: channel.id, guild_id: channel.guild_id },
    edit_history: [{ content: 'before', time: 1 }]
  };
  const purged = {
    message: { id: 'purged', channel_id: channel.id, guild_id: channel.guild_id },
    delete_data: { hidden: false }
  };
  const jumps = [];
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: false,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showEditedMessages: false
    },
    messageRecord: { deleted, edited, purged },
    deletedMessageSet: new Map([[channel.id, new Set([deleted.message.id])]]),
    purgedMessageSet: new Map([[channel.id, new Set([purged.message.id])]]),
    tools: { getChannel: id => id === channel.id ? channel : null },
    jumpToMessage(...args) { jumps.push(args); }
  });

  assert.equal(plugin.canJumpToSavedRecord(deleted), false);
  assert.equal(plugin.canJumpToSavedRecord(purged), false);
  assert.equal(plugin.canJumpToSavedRecord(edited), false);
  plugin.jumpToSavedRecord(deleted);
  plugin.jumpToSavedRecord(edited);
  assert.deepEqual(jumps, [], 'already-open stale Jump actions must also fail closed');

  plugin.settings.restoreDeletedMessages = true;
  assert.equal(plugin.canJumpToSavedRecord(deleted), true);
  assert.equal(plugin.canJumpToSavedRecord(purged), true);
  assert.equal(plugin.canJumpToSavedRecord(edited), false);
  plugin.settings.showDeletedMessages = false;
  assert.equal(plugin.canJumpToSavedRecord(deleted), false);
  assert.equal(plugin.canJumpToSavedRecord(purged), true);
  plugin.settings.showDeletedMessages = true;
  plugin.settings.showPurgedMessages = false;
  assert.equal(plugin.canJumpToSavedRecord(deleted), true);
  assert.equal(plugin.canJumpToSavedRecord(purged), false);
  plugin.settings.showEditedMessages = true;
  assert.equal(plugin.canJumpToSavedRecord(edited), true);
});
