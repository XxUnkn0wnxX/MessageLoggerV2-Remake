const { installNativeCache, NativeCache } = require('./helpers/native-message-cache');
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

test('empty loads do not immediately refetch a restored Discord-owned thread starter', async () => {
  const runRestore = async ({ channelId, channelType, messageId, starterDelete }) => {
    const guild = { id: 'guild', name: 'Guild' };
    const channel = { id: channelId, guild_id: guild.id, name: 'location', type: channelType };
    const message = {
      id: messageId,
      channel_id: channelId,
      guild_id: guild.id,
      content: starterDelete ? '' : 'ordinary restored deletion',
      type: 0,
      attachments: starterDelete ? [{ id: 'image', filename: 'image.png' }] : [],
      author: { id: 'author', username: 'Author' }
    };
    const invalidations = [];
    const cacheRefreshes = [];
    const plugin = createPlugin({
      settings: {
        restoreDeletedMessages: true,
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
        antiNukeEnabled: false,
        cacheAllImages: false,
        onlyRenderCachedAttachments: false
      },
      localUser: { id: 'local' },
      selectedChannel: channel,
      localDeletes: [],
      messageRecord: {
        [messageId]: {
          message,
          delete_data: {
            time: 1,
            hidden: false,
            ...(starterDelete ? { forum_thread_message_delete: true } : {})
          }
        }
      },
      messageRecordIds: new Set([messageId]),
      deletedMessageRecord: { [channelId]: [messageId] },
      purgedMessageRecord: {},
      editedMessageRecord: {},
      deletedMessageSet: new Map([[channelId, new Set([messageId])]]),
      purgedMessageSet: new Map(),
      editedMessageSet: new Map(),
      tempEditedMessageRecord: {},
      channelMessages: {},
      _refreshedEmptyChannels: new Set(),
      tools: {
        getChannel: id => id === channelId ? channel : null,
        getServer: id => id === guild.id ? guild : null,
        getUser: id => id === 'author' ? message.author : null,
        isBlocked: () => false,
        isMentioned: () => false
      },
      getCachedMessage: () => null,
      isAutomatedMessageAuthor: () => false,
      invalidateChannelCache: id => invalidations.push(id),
      cacheChannelMessages: id => cacheRefreshes.push(id),
      _tintSweep() {}
    });
    const dispatchMessages = [];
    let nativeCalls = 0;
    const previousRequestAnimationFrame = global.requestAnimationFrame;
    global.requestAnimationFrame = callback => callback();
    try {
      const result = plugin.onDispatchEvent([{
        type: 'LOAD_MESSAGES_SUCCESS',
        channelId,
        messages: dispatchMessages,
        hasMoreAfter: false,
        isBefore: false,
        hasMoreBefore: false,
        isAfter: false
      }], () => {
        nativeCalls++;
        return 'native';
      });
      await new Promise(resolve => setImmediate(resolve));
      return {
        cacheRefreshes,
        dispatchMessages,
        invalidations,
        nativeCalls,
        refreshed: plugin._refreshedEmptyChannels.has(channelId),
        result
      };
    } finally {
      if (previousRequestAnimationFrame === undefined) delete global.requestAnimationFrame;
      else global.requestAnimationFrame = previousRequestAnimationFrame;
    }
  };

  const starterId = '1529765766105137234';
  const starter = await runRestore({
    channelId: starterId,
    channelType: 11,
    messageId: starterId,
    starterDelete: true
  });
  assert.equal(starter.result, 'native');
  assert.equal(starter.nativeCalls, 1);
  assert.deepEqual(starter.dispatchMessages.map(message => message.id), [starterId]);
  assert.equal(starter.refreshed, false);
  assert.deepEqual(starter.invalidations, []);
  assert.deepEqual(starter.cacheRefreshes, []);

  const ordinary = await runRestore({
    channelId: '1529765766105137000',
    channelType: 0,
    messageId: '1529765766105137001',
    starterDelete: false
  });
  assert.equal(ordinary.result, 'native');
  assert.equal(ordinary.nativeCalls, 1);
  assert.deepEqual(ordinary.dispatchMessages.map(message => message.id), ['1529765766105137001']);
  assert.equal(ordinary.refreshed, true);
  assert.deepEqual(ordinary.invalidations, ['1529765766105137000']);
  assert.deepEqual(ordinary.cacheRefreshes, ['1529765766105137000']);

  const ordinaryThreadReply = await runRestore({
    channelId: '1529765766105137100',
    channelType: 11,
    messageId: '1529765766105137101',
    starterDelete: false
  });
  assert.equal(ordinaryThreadReply.result, 'native');
  assert.equal(ordinaryThreadReply.nativeCalls, 1);
  assert.deepEqual(
    ordinaryThreadReply.dispatchMessages.map(message => message.id),
    ['1529765766105137101']
  );
  assert.equal(ordinaryThreadReply.refreshed, true);
  assert.deepEqual(ordinaryThreadReply.invalidations, ['1529765766105137100']);
  assert.deepEqual(ordinaryThreadReply.cacheRefreshes, ['1529765766105137100']);
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

test('message updates retain removed uploads without retaining vanished link embeds', () => {
  const { addMessage, plugin } = createLiveDeletePlugin();
  const original = addMessage('151');
  const removedUpload = {
    id: '251',
    filename: 'removed.gif',
    url: 'https://cdn.discordapp.com/attachments/channel/251/removed.gif',
    proxy_url: 'https://media.discordapp.net/attachments/channel/251/removed.gif',
    content_type: 'image/gif',
    width: 320,
    height: 240
  };
  original.attachments = [removedUpload];
  original.embeds = [{
    type: 'link',
    url: 'https://example.com/article',
    thumbnail: { url: 'https://example.com/preview.png' }
  }];
  const updated = {
    ...structuredClone(original),
    attachments: [],
    embeds: [],
    edited_timestamp: '2026-07-23T00:00:00.000Z'
  };
  plugin._shouldShowToast = () => false;

  plugin.onDispatchEvent([
    { type: 'MESSAGE_UPDATE', message: updated }
  ], () => ({ native: true }));

  const saved = plugin.messageRecord[original.id];
  assert.deepEqual(saved.message.attachments, [], 'Discord current attachment state remains authoritative');
  assert.deepEqual(saved.message.embeds, [], 'a vanished Discord link preview is not retained as history');
  assert.deepEqual(saved.removed_attachments, [removedUpload], 'only the explicit upload gains historical metadata');
  assert.deepEqual(saved.logged_attachments, [removedUpload.id]);
  assert.match(saved.edit_history[0].content, /`Attachment Deleted: `https:\/\/cdn\.discordapp\.com\/attachments\/channel\/251\/removed\.gif/);
  assert.equal(Object.hasOwn(saved, 'removed_embeds'), false);
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

test('dispatch admits non-ephemeral webhooks only when Ignore bots is off', () => {
  const { addMessage, plugin } = createLiveDeletePlugin({ ignoreBots: false });
  plugin.cachedMessageRecord = [];
  plugin.cachedMessageIds = new Set();
  plugin.cachedMessagesMap = new Map();
  plugin.tools.getUser = () => null;
  let nativeCalls = 0;
  const callDefault = () => {
    nativeCalls++;
    return { native: true };
  };

  const webhook = addMessage('webhook');
  webhook.webhook_id = 'webhook-id';
  webhook.flags = 32768;
  webhook.components = [{ type: 1, components: [{ type: 2, label: 'Action' }] }];
  plugin.onDispatchEvent([{ type: 'MESSAGE_CREATE', message: webhook }], callDefault);
  assert.equal(plugin.cachedMessageIds.has(webhook.id), true);
  plugin.onDispatchEvent([{
    type: 'MESSAGE_DELETE',
    id: webhook.id,
    channelId: webhook.channel_id
  }], callDefault);
  assert.ok(plugin.messageRecord[webhook.id], 'allowed non-ephemeral Components V2 webhooks remain loggable');

  plugin.settings.ignoreBots = true;
  const application = addMessage('application');
  application.application_id = 'application-id';
  application.flags = 32768;
  application.embeds = [{ title: 'App embed' }];
  plugin.onDispatchEvent([{ type: 'MESSAGE_CREATE', message: application }], callDefault);
  assert.equal(plugin.cachedMessageIds.has(application.id), false);
  plugin.onDispatchEvent([{
    type: 'MESSAGE_DELETE',
    id: application.id,
    channelId: application.channel_id
  }], callDefault);
  assert.equal(plugin.messageRecord[application.id], undefined);

  plugin.settings.ignoreBots = false;
  const ephemeralV2 = addMessage('ephemeral');
  ephemeralV2.flags = 64 | 32768;
  ephemeralV2.components = [{ type: 1, components: [{ type: 2, label: 'Private action' }] }];
  plugin.onDispatchEvent([{ type: 'MESSAGE_CREATE', message: ephemeralV2 }], callDefault);
  assert.equal(plugin.cachedMessageIds.has(ephemeralV2.id), false);
  plugin.onDispatchEvent([{
    type: 'MESSAGE_DELETE',
    id: ephemeralV2.id,
    channelId: ephemeralV2.channel_id
  }], callDefault);
  assert.equal(plugin.messageRecord[ephemeralV2.id], undefined);
  assert.equal(nativeCalls, 6, 'every ignored Logger event must still continue through Discord');
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

test('media cache master toggle remounts selected attachment rows and refreshes all logger surfaces', async () => {
  const threadRefreshes = [];
  const calls = {
    stops: 0,
    starts: 0,
    invalidations: [],
    cacheRefreshes: [],
    dispatches: [],
    loggerRefreshes: 0,
    cleanUps: 0,
    refreshes: 0,
    reportMajorSetting: [],
    closeLoggerOwnedAttachmentMediaViewersCalls: 0,
    closeLoggerOwnedAttachmentMediaViewersOrder: []
  };
  const plugin = createPlugin({
    settings: { cacheAllImages: true },
    selectedChannel: { id: 'channel' },
    _failedNativeAttachmentMediaKeys: new Set(['seeded-failure']),
    _failedNativeAttachmentMediaCandidateKeys: new Set(['seeded-candidate-failure']),
    channelMessages: {
      channel: {},
      dmChannel: {},
      threadChannel: {}
    },
    messageRecord: {
      '100': {
        message: {
          id: '100',
          channel_id: 'channel',
          content: 'visible',
          attachments: [{ id: 'media-100', filename: 'visible.png', url: 'https://cdn.example/visible.png' }]
        },
        delete_data: { hidden: false }
      },
      hidden: {
        message: {
          id: 'hidden',
          channel_id: 'channel',
          content: 'hidden',
          attachments: [{ id: 'media-hidden', filename: 'hidden.png', url: 'https://cdn.example/hidden.png' }]
        },
        delete_data: { hidden: true }
      },
      '200': {
        message: {
          id: '200',
          channel_id: 'channel',
          content: 'purged',
          attachments: [{ id: 'media-200', filename: 'purged.png', url: 'https://cdn.example/purged.png' }]
        },
        delete_data: { hidden: false }
      },
      '300': {
        message: {
          id: '300',
          channel_id: 'channel',
          content: 'nuked',
          attachments: [{ id: 'media-300', filename: 'nuked.png', url: 'https://cdn.example/nuked.png' }]
        },
        delete_data: { hidden: false }
      }
    },
    deletedMessageRecord: { channel: ['100', 'hidden'] },
    purgedMessageRecord: { channel: ['200'] },
    nukedMessageRecord: { channel: ['300'] },
    getCacheOnlyMessage: message => ({ ...structuredClone(message), content: `${message.content} (cache-only)` }),
    dispatcher: { dispatch: event => calls.dispatches.push(event) },
    invalidateChannelCache: id => calls.invalidations.push(id),
    cacheChannelMessages: id => calls.cacheRefreshes.push(id),
    scheduleLoggerMenuRefresh: () => { calls.loggerRefreshes++; },
    _forumThreadLogRefreshers: new Map([
      ['channel', () => {
        threadRefreshes.push('channel');
        throw new Error('callback failure');
      }],
      ['other-thread', () => threadRefreshes.push('other-thread')],
      ['extra-thread', () => threadRefreshes.push('extra-thread')]
    ]),
    stopMediaCacheTrimmer: () => { calls.stops++; },
    startMediaCacheTrimmer: () => { calls.starts++; },
    notifyDataSaveModeTransitionChange: () => {},
    closeLoggerOwnedAttachmentMediaViewers: () => {
      calls.closeLoggerOwnedAttachmentMediaViewersCalls++;
      calls.closeLoggerOwnedAttachmentMediaViewersOrder.push('close');
      return {};
    },
    reportMajorSettingChange: (name, value) => {
      calls.reportMajorSetting.push([name, value]);
    },
    imageCacheServerSimulator: {
      cleanUp: () => {
        calls.closeLoggerOwnedAttachmentMediaViewersOrder.push('cleanup');
        calls.cleanUps++;
      }
    }
  });
  const native = installNativeCache(plugin, [['channel', { main: ['100', '200', '300', 'native'] }]]);
  const originalRefreshAttachmentRendering = plugin.refreshAttachmentRendering?.bind(plugin);
  plugin.refreshAttachmentRendering = () => {
    calls.refreshes++;
    return originalRefreshAttachmentRendering?.();
  };

  plugin.settings.cacheAllImages = false;
  plugin.handleMediaCachingSetting(false);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.stops, 1);
  assert.equal(calls.starts, 0);
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersCalls, 1);
  assert.equal(calls.cleanUps, 1);
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersOrder[0], 'close');
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersOrder[1], 'cleanup');
  assert.equal(calls.refreshes, 1);
  assert.equal(plugin._failedNativeAttachmentMediaKeys.size, 0);
  assert.equal(plugin._failedNativeAttachmentMediaCandidateKeys.size, 0);
  assert.equal(calls.invalidations.length, 4);
  assert.deepEqual(
    [...calls.invalidations].sort(),
    ['channel', 'channel', 'dmChannel', 'threadChannel'].sort()
  );
  assert.deepEqual(calls.cacheRefreshes, ['channel']);
  assert.equal(calls.loggerRefreshes, 1);
  assert.equal(calls.dispatches.filter(event => event.type === 'MESSAGE_DELETE').length, 0);
  assert.equal(calls.dispatches.some(event => event.type === 'MESSAGE_UPDATE'), false);
  assert.equal(calls.dispatches.some(event => event.type === 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT'), true);
  assert.equal(threadRefreshes.filter(name => name === 'channel').length, 1);
  assert.deepEqual(
    threadRefreshes.sort(),
    ['channel', 'other-thread', 'extra-thread'].sort()
  );

  calls.invalidations.length = 0;
  calls.cacheRefreshes.length = 0;
  calls.dispatches.length = 0;
  calls.loggerRefreshes = 0;
  threadRefreshes.length = 0;
  calls.cleanUps = 0;
  calls.refreshes = 0;
  calls.closeLoggerOwnedAttachmentMediaViewersCalls = 0;
  calls.closeLoggerOwnedAttachmentMediaViewersOrder.length = 0;
  plugin._failedNativeAttachmentMediaKeys.add('another-seeded-failure');
  plugin._failedNativeAttachmentMediaCandidateKeys.add('another-seeded-candidate-failure');

  native.caches.set('channel', new NativeCache('channel', { main: ['100', '200', '300', 'native'] }));
  plugin.settings.cacheAllImages = true;
  plugin.handleMediaCachingSetting(true);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.stops, 1);
  assert.equal(calls.starts, 1);
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersCalls, 1);
  assert.equal(calls.cleanUps, 1);
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersOrder[0], 'close');
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersOrder[1], 'cleanup');
  assert.equal(calls.refreshes, 1);
  assert.equal(plugin._failedNativeAttachmentMediaKeys.size, 0);
  assert.equal(plugin._failedNativeAttachmentMediaCandidateKeys.size, 0);
  assert.equal(calls.invalidations.length, 4);
  assert.deepEqual(
    [...calls.invalidations].sort(),
    ['channel', 'channel', 'dmChannel', 'threadChannel'].sort()
  );
  assert.deepEqual(calls.cacheRefreshes, ['channel']);
  assert.equal(calls.loggerRefreshes, 1);
  assert.equal(calls.dispatches.filter(event => event.type === 'MESSAGE_DELETE').length, 0);
  assert.equal(calls.dispatches.some(event => event.type === 'MESSAGE_UPDATE'), false);
  assert.equal(calls.dispatches.some(event => event.type === 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT'), true);
  assert.deepEqual(calls.reportMajorSetting, [
    ['cacheAllImages', false],
    ['cacheAllImages', true]
  ]);

  calls.invalidations.length = 0;
  calls.cacheRefreshes.length = 0;
  calls.dispatches.length = 0;
  plugin.selectedChannel = null;

  plugin.refreshAttachmentRendering();

  assert.equal(calls.invalidations.length, 3);
  assert.deepEqual(
    [...calls.invalidations].sort(),
    ['channel', 'dmChannel', 'threadChannel'].sort()
  );
  assert.deepEqual(calls.cacheRefreshes, []);
  assert.equal(calls.dispatches.some(event => event.type === 'MESSAGE_UPDATE'), false);
  assert.equal(calls.dispatches.some(event => event.type === 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT'), true);
});

test('a newly available local attachment coalesces an exact local-only presentation refresh', async () => {
  const attachment = {
    id: 'attachment',
    filename: 'saved.png',
    url: 'https://cdn.example/saved.png',
    proxy_url: 'https://media.example/saved.png'
  };
  const message = {
    id: 'message',
    channel_id: 'channel',
    attachments: [attachment]
  };
  const calls = {
    dispatches: [],
    loggerRefreshes: 0,
    plans: 0,
    remounts: 0,
    threadRefreshes: 0
  };
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    messageRecord: {
      message: {
        message,
        delete_data: { hidden: false }
      }
    },
    dispatcher: { dispatch: event => calls.dispatches.push(event) },
    getSavedAttachmentPresentationPlan(candidate, sourceMessage, options) {
      calls.plans++;
      assert.equal(candidate, attachment);
      assert.equal(sourceMessage, message);
      assert.deepEqual(options, { allowBlob: true });
      return {
        action: 'blob',
        mediaType: 'image',
        url: 'blob:https://discord.com/local'
      };
    },
    remountSavedAttachmentPresentationRecords(record) {
      calls.remounts++;
      assert.equal(record, this.messageRecord.message);
      return 1;
    },
    _forumThreadLogRefreshers: new Map([
      ['thread', () => { calls.threadRefreshes++; }]
    ]),
    scheduleLoggerMenuRefresh() {
      calls.loggerRefreshes++;
    }
  });

  plugin.scheduleSavedAttachmentPresentationRefresh('message', 'attachment');
  plugin.scheduleSavedAttachmentPresentationRefresh('message', 'attachment');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.plans, 1);
  assert.equal(calls.remounts, 1);
  assert.equal(calls.threadRefreshes, 1);
  assert.equal(calls.loggerRefreshes, 1);
  assert.deepEqual(calls.dispatches, [{ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT' }]);
  assert.equal(plugin._pendingSavedAttachmentPresentationRefreshes.size, 0);

  plugin.settings.onlyRenderCachedAttachments = false;
  plugin.scheduleSavedAttachmentPresentationRefresh('message', 'attachment');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.plans, 1, 'remote-first mode must not run the local-only completion refresh');

  plugin.settings.onlyRenderCachedAttachments = true;
  plugin.scheduleSavedAttachmentPresentationRefresh('message', 'unrelated');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.plans, 1, 'an unrelated attachment must not refresh the saved record');
});

test('local cache completion refreshes Logger-owned removed media without requiring a live remount', async () => {
  const attachment = {
    id: 'removed-attachment',
    filename: 'removed.png',
    url: 'https://cdn.example/removed.png'
  };
  const message = {
    id: 'edited-message',
    channel_id: 'channel',
    attachments: []
  };
  const calls = {
    dispatches: [],
    loggerRefreshes: 0,
    remounts: 0
  };
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    messageRecord: {
      'edited-message': {
        message,
        removed_attachments: [attachment]
      }
    },
    getSavedAttachmentPresentationPlan: () => ({
      action: 'blob',
      mediaType: 'image',
      url: 'blob:https://discord.com/removed'
    }),
    remountSavedAttachmentPresentationRecords() {
      calls.remounts++;
      return 0;
    },
    dispatcher: { dispatch: event => calls.dispatches.push(event) },
    scheduleLoggerMenuRefresh() {
      calls.loggerRefreshes++;
    }
  });

  plugin.scheduleSavedAttachmentPresentationRefresh('edited-message', 'removed-attachment');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.remounts, 1);
  assert.equal(calls.loggerRefreshes, 1);
  assert.deepEqual(calls.dispatches, [{ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT' }]);
});

test('media cache local-only setting resets the local state, refreshes attachments, and reports the toggle', () => {
  const calls = {
    cleanUps: 0,
    refreshes: 0,
    reportMajorSetting: [],
    closeLoggerOwnedAttachmentMediaViewersCalls: 0,
    closeLoggerOwnedAttachmentMediaViewersOrder: []
  };
  const plugin = createPlugin({
    settings: { onlyRenderCachedAttachments: false },
    _failedNativeAttachmentMediaKeys: new Set(['seeded-failure']),
    _failedNativeAttachmentMediaCandidateKeys: new Set(['seeded-candidate-failure']),
    _pendingSavedAttachmentPresentationRefreshes: new Set(['message:attachment']),
    closeLoggerOwnedAttachmentMediaViewers: () => {
      calls.closeLoggerOwnedAttachmentMediaViewersCalls++;
      calls.closeLoggerOwnedAttachmentMediaViewersOrder.push('close');
      return {};
    },
    reportMajorSettingChange: (name, value) => {
      calls.reportMajorSetting.push([name, value]);
    },
    imageCacheServerSimulator: {
      cleanUp: () => {
        calls.closeLoggerOwnedAttachmentMediaViewersOrder.push('cleanup');
        calls.cleanUps++;
      }
    }
  });
  plugin.refreshAttachmentRendering = () => {
    calls.refreshes++;
  };

  plugin.handleLocalOnlyCachedAttachmentRenderingSetting(true);

  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersCalls, 1);
  assert.equal(calls.cleanUps, 1);
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersOrder[0], 'close');
  assert.equal(calls.closeLoggerOwnedAttachmentMediaViewersOrder[1], 'cleanup');
  assert.equal(calls.refreshes, 1);
  assert.equal(calls.reportMajorSetting.length, 1);
  assert.deepEqual(calls.reportMajorSetting, [['onlyRenderCachedAttachments', true]]);
  assert.equal(plugin._failedNativeAttachmentMediaKeys.size, 0);
  assert.equal(plugin._failedNativeAttachmentMediaCandidateKeys.size, 0);
  assert.equal(plugin._pendingSavedAttachmentPresentationRefreshes.size, 0);
});

test('media settings refresh fetches the selected channel once for absent or mounted saved media', () => {
  const originalFrame = global.requestAnimationFrame;
  const frames = [];
  global.requestAnimationFrame = callback => frames.push(callback);
  try {
    for (const mounted of [false, true]) {
      const record = { message: { id: 'saved', channel_id: 'channel', content: '', attachments: [{ id: 'media', filename: 'photo.png', url: 'https://cdn.example/photo.png' }] }, delete_data: {} };
      const fetches = [];
      const plugin = createPlugin({
        selectedChannel: { id: 'channel' },
        messageRecord: { saved: record }, deletedMessageRecord: { channel: ['saved'] },
        channelMessages: { channel: { ready: true } }, settings: { cacheAllImages: false },
        tools: { getChannel: () => ({ type: 0 }) },
        cacheChannelMessages: channel => fetches.push(channel),
        dispatcher: { dispatch() {} }, scheduleLoggerMenuRefresh() {}
      });
      const native = installNativeCache(plugin, [['channel', { main: mounted ? ['saved', 'native'] : ['native'] }]]);
      plugin.refreshAttachmentRendering();
      if (mounted) {
        assert.deepEqual(fetches, []);
        assert.equal(native.caches.get('channel').has('saved'), false);
        assert.equal(frames.length, 1);
      } else {
        assert.deepEqual(fetches, ['channel']);
        assert.equal(frames.length, 0);
      }
      while (frames.length) frames.shift()();
      assert.deepEqual(fetches, ['channel']);
      assert.equal(native.caches.get('channel').has('native'), true);
    }
  } finally { global.requestAnimationFrame = originalFrame; }
});
