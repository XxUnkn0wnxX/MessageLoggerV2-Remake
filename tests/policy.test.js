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
