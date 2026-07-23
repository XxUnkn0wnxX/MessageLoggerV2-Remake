const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

test('author gates distinguish automated captures from rich human messages', () => {
  const plugin = createPlugin({
    localUser: { id: 'local' },
    settings: { ignoreBots: true, ignoreBlockedUsers: true, ignoreSelf: true },
    tools: {
      getUser: id => id === 'bot-store' ? { id, bot: true } : { id },
      isBlocked: id => id === 'blocked'
    }
  });

  const automatedMessages = [
    { author: { id: 'bot-inline', bot: true } },
    { author: { id: 'bot-store' } },
    { webhook_id: 'webhook-snake' },
    { webhookId: 'webhook-camel' },
    { application_id: 'application-snake' },
    { applicationId: 'application-camel' },
    { application: { id: 'application-nested' } },
    { interaction: { id: 'interaction' } },
    { interaction_metadata: { id: 'interaction-metadata-snake' } },
    { interactionMetadata: { id: 'interaction-metadata-camel' } }
  ];

  for (const message of automatedMessages) {
    assert.equal(plugin.shouldIgnoreMessageAuthor(message), true, JSON.stringify(message));
  }

  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'blocked' } }), true);
  assert.equal(plugin.shouldIgnoreMessageAuthor({
    author: { id: 'normal', bot: false },
    flags: 32768,
    embeds: [{ title: 'A human embed' }],
    components: [{ type: 1, components: [{ type: 2, label: 'Human button' }] }]
  }), false, 'Components V2 and embeds alone must not mark a human author as automated');
  assert.equal(plugin.shouldIgnoreSelfMessage({ author: { id: 'local' } }), true);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'local' } }), false);
});

test('Ignore bots only applies the automated-message classifier while enabled', () => {
  const plugin = createPlugin({
    settings: { ignoreBots: false, ignoreBlockedUsers: false },
    tools: { getUser: () => ({ bot: true }), isBlocked: () => false }
  });

  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'bot-store' } }), false);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ webhook_id: 'webhook' }), false);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ application: { id: 'application' } }), false);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ interaction_metadata: { id: 'interaction' } }), false);
});

test('local deletion tracking handles single and bulk IDs', () => {
  const plugin = createPlugin({ localDeletes: [] });

  plugin.rememberLocalDeleteId('10');
  plugin.rememberLocalDeleteFromRequest('/api/v9/channels/20/messages/30');

  assert.equal(plugin.isLocalDeleteEvent('10'), true);
  assert.equal(plugin.isLocalDeleteEvent(['99', '30']), true);
  assert.equal(plugin.isLocalDeleteEvent('99'), false);
});

test('notification gates respect local-user, selected-location, and list overrides', () => {
  const baseSettings = {
    toastToggles: { deleted: true },
    toastTogglesDMs: { deleted: true },
    alwaysNotifChannel: false,
    alwaysNotifGuild: false,
    notifOnlyWhitelist: false,
    notificationBlacklist: [],
    notificationWhitelist: []
  };
  const guild = { id: 'guild' };
  const channel = { id: 'channel', guild_id: 'guild' };
  const plugin = createPlugin({ settings: structuredClone(baseSettings), selectedChannel: { id: 'elsewhere', guild_id: 'guild' } });

  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', false), true);
  plugin.selectedChannel = channel;
  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', false), false);
  plugin.settings.alwaysNotifChannel = true;
  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', false), true);
  plugin.settings.alwaysNotifChannel = false;
  plugin.settings.toastToggles.disableToastsForLocal = true;
  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', true), false);

  plugin.selectedChannel = { id: 'elsewhere', guild_id: 'other' };
  plugin.settings.notificationBlacklist = ['channel'];
  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', false), false);
  plugin.settings.notificationBlacklist = [];
  plugin.settings.notifOnlyWhitelist = true;
  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', false), false);
  plugin.settings.notificationWhitelist = ['guild'];
  assert.equal(plugin._shouldShowToast(channel, guild, 'deleted', false), true);
});

test('DM notifications never alert for the local author', () => {
  const plugin = createPlugin({
    settings: {
      toastToggles: {},
      toastTogglesDMs: { deleted: true },
      notificationBlacklist: [],
      notificationWhitelist: [],
      notifOnlyWhitelist: false,
      alwaysNotifChannel: false,
      alwaysNotifGuild: false
    },
    selectedChannel: { id: 'elsewhere' }
  });

  assert.equal(plugin._shouldShowToast({ id: 'dm' }, null, 'deleted', true), false);
  assert.equal(plugin._shouldShowToast({ id: 'dm' }, null, 'deleted', false), true);
});

test('BetterDiscord notifications queue in memory and clear without persistence', () => {
  const plugin = createPlugin({
    _nativeNotificationQueueStopped: false,
    _nativeNotificationQueue: [],
    _nativeNotificationActive: null,
    _nativeNotificationSequence: 0
  });

  plugin._enqueueNativeNotification({ title: 'first', duration: 1000 });
  plugin._enqueueNativeNotification({ title: 'second', duration: 1000 });

  assert.equal(plugin._nativeNotificationActive.notification.title, 'first');
  assert.deepEqual(plugin._nativeNotificationQueue.map(item => item.title), ['second']);
  plugin._clearNativeNotificationQueue(false);
  assert.equal(plugin._nativeNotificationActive, null);
  assert.deepEqual(plugin._nativeNotificationQueue, []);
  assert.equal(plugin._nativeNotificationQueueStopped, false);
});

test('Anti-Nuke alerts use the destructive theme and target Nuked while ordinary bulk deletes target Purged', () => {
  let actions = [];
  let openedTab = null;
  let notification = null;
  const plugin = createPlugin({
    _showNotification(title, message, type, nextActions, timeout, options) {
      notification = { title, message, type, timeout, options };
      actions = nextActions;
    },
    openWindow(tab) {
      openedTab = tab;
    }
  });
  const channel = { id: 'channel', guild_id: 'guild' };
  const guild = { id: 'guild' };

  plugin._notifyEvent('nukeDetected', channel, guild, undefined, {
    count: 3,
    locationName: 'Server, #deleted-channel'
  });
  assert.deepEqual(notification, {
    title: 'Nuke Detected',
    message: 'Nuke Detected at Server, #deleted-channel; 3 saved records captured',
    type: 'error',
    timeout: undefined,
    options: undefined
  });
  assert.equal(actions[0].label, 'View');
  actions[0].onClick();
  assert.equal(openedTab, 'nuked');

  plugin._notifyEvent('bulkDelete', channel, guild, undefined, {
    count: 2,
    locationName: 'Server, #general'
  });
  actions[0].onClick();
  assert.equal(openedTab, 'purged');
});

test('Anti-Nuke detection toggle bypasses ordinary alert scope and requires both feature toggles', () => {
  const notifications = [];
  let capturedCount = 2;
  const guild = { id: 'guild', name: 'Server' };
  const channel = { id: 'channel', guild_id: guild.id, name: 'general', type: 0 };
  const createContext = () => ({
    channel,
    guild,
    captured: capturedCount,
    capturedThreads: 1,
    capturedMessages: 1,
    capturedAttachments: 0,
    captureEnabled: true,
    threadCap: 15,
    messageCap: 45,
    attachmentCap: 15,
    cleanupTimer: null
  });
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      antiNukeToasts: false,
      toastToggles: { deleted: false, disableToastsForLocal: false },
      toastTogglesDMs: { deleted: false },
      ignoreSelf: true,
      ignoreLocalDeletes: true,
      alwaysNotifChannel: false,
      alwaysNotifGuild: false,
      notifOnlyWhitelist: true,
      notificationBlacklist: [channel.id, guild.id],
      notificationWhitelist: []
    },
    selectedChannel: channel,
    tools: { getServer: () => guild },
    _destructiveChannelDeleteContexts: new Map(),
    createDeletedChannelCaptureContext: createContext,
    captureQueuedThreadsFromDeletedChannel() {},
    captureMessagesFromDeletedChannel() {},
    isLocalDeleteEvent: () => false,
    _notifyEvent(...args) { notifications.push(args); },
    saveData() {},
    scheduleLoggerMenuRefresh() {}
  });

  assert.equal(plugin.handleDeletedGuildChannel({ channel }, () => 'handled', []), 'handled');
  assert.equal(notifications.length, 0, 'capture remains silent while the dedicated toggle is off');

  plugin.settings.antiNukeToasts = true;
  plugin.handleDeletedGuildChannel({ channel }, () => 'handled', []);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 'nukeDetected');
  assert.deepEqual(notifications[0][4], {
    count: 2,
    locationName: 'Server, #general'
  });
  assert.equal(
    plugin._shouldShowToast(channel, guild, 'deleted', true),
    false,
    'the equivalent ordinary deleted-message alert remains suppressed'
  );

  capturedCount = 0;
  plugin.handleDeletedGuildChannel({ channel }, () => 'handled', []);
  assert.equal(notifications.length, 1, 'empty or uncached channel deletions do not create false-positive alerts');

  plugin.settings.antiNukeEnabled = false;
  plugin.handleDeletedGuildChannel({ channel }, () => 'handled', []);
  assert.equal(notifications.length, 1, 'the toast toggle cannot alert while Anti Nuke is disabled');
});

test('a channel deletion adopts hidden records and reports them as secured Nuked content', () => {
  const notifications = [];
  const channel = { id: 'deleted-channel', guild_id: 'guild', name: 'lost', type: 0 };
  const guild = { id: 'guild', name: 'Server' };
  const hiddenId = 'hidden-message';
  const hiddenRecord = {
    message: { id: hiddenId, channel_id: channel.id },
    delete_data: { hidden: true, time: 1 }
  };
  let saved = 0;
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, antiNukeToasts: true },
    messageRecord: { [hiddenId]: hiddenRecord },
    deletedMessageRecord: { [channel.id]: [hiddenId] },
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[channel.id, new Set([hiddenId])]]),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    _destructiveChannelDeleteContexts: new Map(),
    tools: { getServer: () => guild, getChannel: () => null },
    createDeletedChannelCaptureContext() {
      return {
        channel,
        guild,
        captured: 0,
        capturedThreads: 0,
        capturedMessages: 0,
        capturedAttachments: 0,
        adopted: 0,
        captureEnabled: true,
        threadCap: 15,
        messageCap: 45,
        attachmentCap: 15,
        cleanupTimer: null
      };
    },
    captureQueuedThreadsFromDeletedChannel() {},
    captureMessagesFromDeletedChannel() {},
    _notifyEvent(...args) { notifications.push(args); },
    saveData() { saved++; },
    scheduleLoggerMenuRefresh() {}
  });

  assert.equal(plugin.handleDeletedGuildChannel({ channel }, () => 'handled', []), 'handled');
  assert.equal(hiddenRecord.delete_data.hidden, true);
  assert.equal(hiddenRecord.delete_data.anti_nuke, true);
  assert.deepEqual(plugin.deletedMessageRecord, {});
  assert.deepEqual(plugin.nukedMessageRecord, { [channel.id]: [hiddenId] });
  assert.equal(saved, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 'nukeDetected');
  assert.equal(notifications[0][4].count, 1);
});

test('ordinary dispatch follows Ignore NSFW, whitelist override, and selected thread-parent bypass', () => {
  const calls = { cacheIncoming: 0, nativeCalls: 0 };
  const guild = { id: 'guild', name: 'Server' };
  const channels = {
    nsfw: { id: 'nsfw-channel', guild_id: guild.id, name: 'nsfw', type: 0, nsfw: true },
    parent: { id: 'parent-channel', guild_id: guild.id, name: 'parent', type: 0 },
    child: { id: 'child-thread', guild_id: guild.id, name: 'child', type: 11, parent_id: 'parent-channel', nsfw: true }
  };

  const plugin = createPlugin({
    localUser: { id: 'local' },
    selectedChannel: { id: 'selection-channel', guild_id: guild.id },
    cachedMessageRecord: [],
    cachedMessageIds: new Set(),
    cachedMessagesMap: new Map(),
    settings: {
      ignoreNSFW: true,
      ignoreMutedGuilds: false,
      ignoreMutedChannels: false,
      ignoreSelf: false,
      ignoreBlockedUsers: false,
      whitelist: [],
      blacklist: [],
      onlyLogWhitelist: false,
      alwaysLogSelected: false,
      alwaysLogDM: false,
      antiNukeEnabled: false,
      cacheAllImages: false
    },
    tools: {
      getChannel: id => Object.values(channels).find(channel => channel.id === id) || null,
      getServer: id => id === guild.id ? guild : null,
      getUser: id => ({ id }),
      getMessage: () => null,
      isBlocked: () => false,
      isMentioned: () => false
    },
    muteModule: {
      isMuted: () => false,
      isChannelMuted: () => false
    },
    _cacheIncomingMessage(message) {
      calls.cacheIncoming += 1;
      return false;
    },
    _ensureChannelCached() {},
    _shouldShowToast: () => false
  });

  const runCreate = (channelId, messageId) => {
    calls.cacheIncoming = 0;
    calls.nativeCalls = 0;
    const result = plugin.onDispatchEvent([
      {
        type: 'MESSAGE_CREATE',
        message: {
          id: messageId,
          channel_id: channelId,
          guild_id: guild.id,
          type: 0,
          content: 'payload',
          author: { id: 'human' }
        }
      }
    ], () => {
      calls.nativeCalls += 1;
      return 'native';
    });
    assert.equal(result, 'native');
    assert.equal(calls.nativeCalls, 1);
    return calls.cacheIncoming;
  };

  assert.equal(runCreate(channels.nsfw.id, 'm1'), 0, 'Ignore NSFW blocks normal NSFW scope');

  plugin.settings.whitelist = [channels.nsfw.id];
  assert.equal(runCreate(channels.nsfw.id, 'm2'), 1, 'explicit channel whitelist bypasses Ignore NSFW');

  plugin.settings.whitelist = [];
  plugin.selectedChannel = channels.parent;
  plugin.settings.alwaysLogSelected = true;
  assert.equal(runCreate(channels.child.id, 'm3'), 1, 'selected parent bypasses filtered child-thread scope');
});

test('ordinary dispatch enforces whitelist-blacklist precedence and Only log whitelist mode', () => {
  const calls = { cacheIncoming: 0, nativeCalls: 0 };
  const guild = { id: 'guild', name: 'Server' };
  const channel = { id: 'general', guild_id: guild.id, name: 'general', type: 0 };

  const plugin = createPlugin({
    localUser: { id: 'local' },
    selectedChannel: { id: 'other', guild_id: guild.id },
    cachedMessageRecord: [],
    cachedMessageIds: new Set(),
    cachedMessagesMap: new Map(),
    settings: {
      ignoreNSFW: false,
      ignoreMutedGuilds: false,
      ignoreMutedChannels: false,
      ignoreSelf: false,
      ignoreBlockedUsers: false,
      whitelist: [],
      blacklist: [],
      onlyLogWhitelist: false,
      alwaysLogSelected: false,
      alwaysLogDM: false,
      antiNukeEnabled: false,
      cacheAllImages: false
    },
    tools: {
      getChannel: id => id === channel.id ? channel : null,
      getServer: id => id === guild.id ? guild : null,
      getUser: id => ({ id }),
      getMessage: () => null,
      isBlocked: () => false,
      isMentioned: () => false
    },
    muteModule: {
      isMuted: () => false,
      isChannelMuted: () => false
    },
    _cacheIncomingMessage(message) {
      calls.cacheIncoming += 1;
      return false;
    },
    _ensureChannelCached() {},
    _shouldShowToast: () => false
  });

  const runCreate = (messageId) => {
    calls.cacheIncoming = 0;
    calls.nativeCalls = 0;
    const result = plugin.onDispatchEvent([
      {
        type: 'MESSAGE_CREATE',
        message: {
          id: messageId,
          channel_id: channel.id,
          guild_id: guild.id,
          type: 0,
          content: 'payload',
          author: { id: 'human' }
        }
      }
    ], () => {
      calls.nativeCalls += 1;
      return 'native';
    });
    assert.equal(result, 'native');
    assert.equal(calls.nativeCalls, 1);
    return calls.cacheIncoming;
  };

  plugin.settings.blacklist = [guild.id];
  plugin.settings.whitelist = [channel.id];
  assert.equal(runCreate('m1'), 1, 'channel whitelist bypasses guild blacklist');

  plugin.settings.blacklist = [channel.id];
  plugin.settings.whitelist = [guild.id];
  assert.equal(runCreate('m2'), 0, 'guild-whitelisted channel blocked by explicit channel blacklist');

  plugin.settings.blacklist = [];
  plugin.settings.whitelist = [];
  plugin.settings.onlyLogWhitelist = true;
  assert.equal(runCreate('m3'), 0, 'only-log-whitelist blocks non-whitelisted channel');

  plugin.settings.whitelist = [channel.id];
  assert.equal(runCreate('m4'), 1, 'only-log-whitelist allows explicit whitelist member');
});

test('DM override bypasses only-log-whitelist when alwaysLogDM is enabled', () => {
  const calls = { cacheIncoming: 0, nativeCalls: 0 };
  const dm = { id: 'dm-channel', name: 'DM', type: 1 };

  const plugin = createPlugin({
    localUser: { id: 'local' },
    selectedChannel: { id: 'selected' },
    cachedMessageRecord: [],
    cachedMessageIds: new Set(),
    cachedMessagesMap: new Map(),
    settings: {
      ignoreNSFW: false,
      ignoreMutedGuilds: false,
      ignoreMutedChannels: false,
      ignoreSelf: false,
      ignoreBlockedUsers: false,
      whitelist: [],
      blacklist: [],
      onlyLogWhitelist: true,
      alwaysLogSelected: false,
      alwaysLogDM: false,
      antiNukeEnabled: false,
      cacheAllImages: false
    },
    tools: {
      getChannel: id => id === dm.id ? dm : null,
      getServer: () => null,
      getUser: id => ({ id }),
      getMessage: () => null,
      isBlocked: () => false,
      isMentioned: () => false
    },
    _cacheIncomingMessage(message) {
      calls.cacheIncoming += 1;
      return false;
    },
    _ensureChannelCached() {},
    _shouldShowToast: () => false
  });

  const runCreate = (messageId) => {
    calls.cacheIncoming = 0;
    calls.nativeCalls = 0;
    const result = plugin.onDispatchEvent([
      {
        type: 'MESSAGE_CREATE',
        message: {
          id: messageId,
          channel_id: dm.id,
          type: 0,
          content: 'dm payload',
          author: { id: 'human' }
        }
      }
    ], () => {
      calls.nativeCalls += 1;
      return 'native';
    });
    assert.equal(result, 'native');
    assert.equal(calls.nativeCalls, 1);
    return calls.cacheIncoming;
  };

  assert.equal(runCreate('dm1'), 0, 'only-log-whitelist blocks DM when alwaysLogDM is off');

  plugin.settings.alwaysLogDM = true;
  assert.equal(runCreate('dm2'), 1, 'alwaysLogDM bypasses whitelist-only for DM scope');
});

test('Ignore blocked users skips ordinary dispatch, while CHANNEL_DELETE anti-nuke capture remains independent', () => {
  const calls = {
    cacheIncoming: 0,
    notifications: 0,
    nativeCalls: 0,
    nukeEvents: 0,
    saveData: 0
  };
  const guild = { id: 'guild', name: 'Server' };
  const channel = { id: 'channel-anti-nuke', guild_id: guild.id, name: 'general', type: 0 };
  const blockedMessage = {
    id: 'blocked-1',
    channel_id: channel.id,
    guild_id: guild.id,
    author: { id: 'blocked-user' },
    content: 'blocked message',
    type: 0,
    flags: 0
  };

  const plugin = createPlugin({
    localUser: { id: 'local' },
    selectedChannel: { id: 'other', guild_id: guild.id },
    cachedMessageRecord: [blockedMessage],
    cachedMessageIds: new Set([blockedMessage.id]),
    cachedMessagesMap: new Map([[blockedMessage.id, blockedMessage]]),
    settings: {
      ignoreBlockedUsers: true,
      ignoreNSFW: false,
      ignoreMutedGuilds: false,
      ignoreMutedChannels: false,
      ignoreSelf: false,
      whitelist: [],
      blacklist: [],
      onlyLogWhitelist: false,
      alwaysLogSelected: false,
      alwaysLogDM: false,
      antiNukeEnabled: true,
      antiNukeToasts: true,
      cacheAllImages: false
    },
    _destructiveChannelDeleteContexts: new Map(),
    tools: {
      getServer: id => id === guild.id ? guild : null,
      getChannel: id => id === channel.id ? channel : null,
      getUser: id => ({ id }),
      getMessage: () => null,
      isBlocked: id => id === 'blocked-user',
      isMentioned: () => false
    },
    messageRecord: { [blockedMessage.id]: structuredClone(blockedMessage) },
    messageRecordIds: new Set([blockedMessage.id]),
    _cacheIncomingMessage() {
      calls.cacheIncoming += 1;
      return false;
    },
    createDeletedChannelCaptureContext: () => ({
      channel,
      guild,
      captured: 1,
      adopted: 0,
      capturedThreads: 1,
      capturedMessages: 1,
      capturedAttachments: 0,
      captureEnabled: true,
      threadCap: 15,
      messageCap: 45,
      attachmentCap: 15,
      cleanupTimer: null
    }),
    captureQueuedThreadsFromDeletedChannel() {},
    captureMessagesFromDeletedChannel() {},
    _notifyEvent(...args) {
      calls.notifications += 1;
      if (args[0] === 'nukeDetected') calls.nukeEvents += 1;
    },
    muteModule: {
      isMuted: () => false,
      isChannelMuted: () => false
    },
    scheduleLoggerMenuRefresh() {},
    saveData() { calls.saveData += 1; }
  });

  plugin.onDispatchEvent([
    {
      type: 'MESSAGE_CREATE',
      message: {
        id: 'ordinary-blocked',
        channel_id: channel.id,
        guild_id: guild.id,
        type: 0,
        content: 'blocked ordinary',
        author: { id: 'blocked-user' }
      }
    }
  ], () => {
    calls.nativeCalls += 1;
    return 'native';
  });

  assert.equal(calls.cacheIncoming, 0, 'blocked users are rejected before normal create caching');

  plugin.onDispatchEvent([{ type: 'CHANNEL_DELETE', channel }], () => {
    calls.nativeCalls += 1;
    return 'native-delete';
  });

  assert.equal(calls.nukeEvents, 1, 'Anti-Nuke still runs on CHANNEL_DELETE');
  assert.equal(calls.saveData, 1);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage(blockedMessage, channel), true);
});

test('ghost ping override applies to filtered edits and individual deletes but not bulk deletes', () => {
  const calls = {
    notifications: [],
    nativeCalls: 0,
    saveDeleted: 0
  };
  const guild = { id: 'guild', name: 'Server' };
  const channel = { id: 'channel-ghost', guild_id: guild.id, name: 'general', type: 0 };
  const cache = new Map();

  const plugin = createPlugin({
    localUser: { id: 'local' },
    selectedChannel: { id: 'other', guild_id: guild.id },
    settings: {
      ignoreNSFW: false,
      ignoreMutedGuilds: false,
      ignoreMutedChannels: false,
      ignoreSelf: false,
      ignoreBlockedUsers: false,
      blacklist: [channel.id],
      whitelist: [],
      onlyLogWhitelist: false,
      alwaysLogSelected: false,
      alwaysLogDM: false,
      alwaysLogGhostPings: true,
      antiNukeEnabled: false,
      cacheAllImages: false,
      restoreDeletedMessages: false,
      showDeletedMessages: false,
      showPurgedMessages: false
    },
    tools: {
      getChannel: id => id === channel.id ? channel : null,
      getServer: id => id === guild.id ? guild : null,
      getUser: id => ({ id }),
      isBlocked: () => false,
      isMentioned: (message, userId) => message?.mentionedUserIds?.includes(String(userId))
    },
    getMessage: () => null,
    channelMessages: {},
    getCachedMessage(id) { return cache.get(String(id)) || null; },
    _shouldShowToast: () => true,
    _notifyEvent(...args) { calls.notifications.push(args); },
    _getEditNotificationSpamDecision: () => 'allow',
    syncMessageUpdatePayload(payload, previousMessage, records = []) {
      for (const record of records) {
        if (!record?.message) continue;
        record.message = { ...record.message, ...structuredClone(payload) };
      }
      return payload;
    },
    saveDeletedMessage() {
      calls.saveDeleted += 1;
      return true;
    },
    messageRecord: {},
    messageRecordIds: new Set(),
    tempEditedMessageRecord: {},
    editedMessageRecord: {},
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    editedMessageSet: new Map(),
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    _cacheIncomingMessage(message) { return false; },
    localDeletes: [],
    saveData() {},
    annotateSavedForumThreadMessage() {},
    _ensureChannelCached() {},
    cacheChannelMessages() {}
  });

  const editedOriginal = {
    id: 'edit-1',
    channel_id: channel.id,
    guild_id: guild.id,
    type: 0,
    content: 'ping <@local>',
    author: { id: 'author' },
    mentionedUserIds: ['local']
  };
  cache.set('edit-1', structuredClone(editedOriginal));
  plugin.editedMessageSet.set(channel.id, new Set(['edit-1']));
  plugin.messageRecord['edit-1'] = {
    message: structuredClone(editedOriginal),
    local_mentioned: true,
    ghost_pinged: false,
    edit_history: [],
    logged_attachments: []
  };

  calls.notifications = [];
  plugin.onDispatchEvent([
    {
      type: 'MESSAGE_UPDATE',
      message: {
        id: 'edit-1',
        channel_id: channel.id,
        guild_id: guild.id,
        type: 0,
        content: 'ping removed',
        edited_timestamp: '2026-07-23T00:00:00.000Z',
        mentionedUserIds: []
      }
    }
  ], () => {
    calls.nativeCalls += 1;
    return 'native';
  });

  assert.equal(calls.notifications.some(([type]) => type === 'ghostPing'), true);

  calls.notifications = [];
  const deleteOriginal = {
    id: 'delete-1',
    channel_id: channel.id,
    guild_id: guild.id,
    type: 0,
    content: 'dm ping',
    author: { id: 'author' },
    mentionedUserIds: ['local']
  };
  cache.set('delete-1', structuredClone(deleteOriginal));
  plugin.messageRecord['delete-1'] = {
    message: structuredClone(deleteOriginal),
    delete_data: {}
  };

  plugin.onDispatchEvent([
    {
      type: 'MESSAGE_DELETE',
      id: 'delete-1',
      channelId: channel.id
    }
  ], () => {
    calls.nativeCalls += 1;
    return 'native';
  });

  assert.equal(calls.notifications.some(([type]) => type === 'ghostPing'), true);

  calls.notifications = [];
  const savedDeleteCount = calls.saveDeleted;
  cache.set('bulk-1', { id: 'bulk-1', channel_id: channel.id, guild_id: guild.id, type: 0, mentionedUserIds: ['local'] });
  cache.set('bulk-2', { id: 'bulk-2', channel_id: channel.id, guild_id: guild.id, type: 0, mentionedUserIds: ['local'] });

  plugin.onDispatchEvent([
    {
      type: 'MESSAGE_DELETE_BULK',
      channelId: channel.id,
      ids: ['bulk-1', 'bulk-2']
    }
  ], () => {
    calls.nativeCalls += 1;
    return 'native';
  });

  assert.equal(calls.notifications.length, 0, 'filtered bulk deletes do not emit ghost-ping overrides');
  assert.equal(calls.saveDeleted, savedDeleteCount, 'filtered bulk deletes do not save messages while blocked by scope');
});
