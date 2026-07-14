const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

test('author gates are evaluated per message', () => {
  const plugin = createPlugin({
    localUser: { id: 'local' },
    settings: { ignoreBots: true, ignoreBlockedUsers: true, ignoreSelf: true },
    tools: {
      getUser: id => id === 'bot-store' ? { id, bot: true } : { id },
      isBlocked: id => id === 'blocked'
    }
  });

  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'bot-inline', bot: true } }), true);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'bot-store' } }), true);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'blocked' } }), true);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'normal' } }), false);
  assert.equal(plugin.shouldIgnoreSelfMessage({ author: { id: 'local' } }), true);
  assert.equal(plugin.shouldIgnoreMessageAuthor({ author: { id: 'local' } }), false);
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
    _showNotification(title, message, type, nextActions) {
      notification = { title, message, type };
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
    type: 'error'
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
