const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

test('delete, thread, and purge alerts share one notification identity per saved ID', () => {
  const notifications = [];
  const channel = { id: 'channel', guild_id: 'guild' };
  const guild = { id: 'guild' };
  const plugin = createPlugin({
    _notifiedEventIds: new Map(),
    _notifyEvent(...args) { notifications.push(args); }
  });

  assert.deepEqual(
    plugin._notifyEventOnce('deleted', 'delete', ['100'], channel, guild, '100'),
    ['100']
  );
  assert.deepEqual(
    plugin._notifyEventOnce('deleted', 'delete', ['100'], channel, guild, '100'),
    [],
    'a repeated message or thread delete must not alert again'
  );

  assert.deepEqual(
    plugin._notifyEventOnce(
      'bulkDelete',
      'delete',
      ['100', '200', '200', '300'],
      channel,
      guild,
      undefined,
      ids => ({ count: ids.length })
    ),
    ['200', '300'],
    'purges must ignore IDs already alerted by a single or structural delete'
  );
  assert.equal(notifications.at(-1)[0], 'bulkDelete');
  assert.deepEqual(notifications.at(-1)[4], { count: 2 });

  assert.deepEqual(
    plugin._notifyEventOnce(
      'bulkDelete',
      'delete',
      ['200', '300'],
      channel,
      guild,
      undefined,
      ids => ({ count: ids.length })
    ),
    [],
    'replaying the same purge must stay silent'
  );
  assert.deepEqual(
    plugin._notifyEventOnce(
      'bulkDelete',
      'delete',
      ['300', '400'],
      channel,
      guild,
      undefined,
      ids => ({ count: ids.length })
    ),
    ['400'],
    'partially overlapping purges must report only newly alerted IDs'
  );
  assert.deepEqual(notifications.at(-1)[4], { count: 1 });
  assert.equal(notifications.length, 3);
});

test('sent-message notification IDs survive ordinary message-cache eviction', () => {
  const notifications = [];
  const channel = { id: 'channel', guild_id: 'guild' };
  const guild = { id: 'guild' };
  const message = { id: 'sent-id', channel_id: channel.id };
  const plugin = createPlugin({
    cachedMessageRecord: [],
    cachedMessageIds: new Set(),
    cachedMessagesMap: new Map(),
    _notifiedEventIds: new Map(),
    _notifyEvent(...args) { notifications.push(args); }
  });

  assert.equal(plugin._cacheIncomingMessage(message), false);
  plugin._notifyEventOnce('sent', 'sent', [message.id], channel, guild, message.id);
  plugin.cachedMessageRecord.length = 0;
  plugin.cachedMessageIds.clear();
  plugin.cachedMessagesMap.clear();

  assert.equal(plugin._cacheIncomingMessage(message), false, 'the normal cache now accepts the replay');
  assert.deepEqual(
    plugin._notifyEventOnce('sent', 'sent', [message.id], channel, guild, message.id),
    [],
    'the independent notification ledger must still reject it'
  );
  assert.equal(notifications.length, 1);
});

test('guild and DM sent-message gates retain their local-user rules', () => {
  const plugin = createPlugin({
    settings: {
      toastToggles: { sent: true, disableToastsForLocal: false },
      toastTogglesDMs: { sent: true },
      notificationBlacklist: [],
      notificationWhitelist: [],
      notifOnlyWhitelist: false,
      alwaysNotifChannel: false,
      alwaysNotifGuild: false
    },
    selectedChannel: { id: 'elsewhere', guild_id: 'elsewhere' }
  });
  const guild = { id: 'guild' };
  const guildChannel = { id: 'guild-channel', guild_id: guild.id };
  const dmChannel = { id: 'dm-channel' };

  assert.equal(plugin._shouldShowToast(guildChannel, guild, 'sent', false), true);
  assert.equal(plugin._shouldShowToast(guildChannel, guild, 'sent', true), true);
  plugin.settings.toastToggles.disableToastsForLocal = true;
  assert.equal(plugin._shouldShowToast(guildChannel, guild, 'sent', true), false);
  assert.equal(plugin._shouldShowToast(dmChannel, null, 'sent', false), true);
  assert.equal(plugin._shouldShowToast(dmChannel, null, 'sent', true), false);
});

test('edit-spam blocking follows the toggle and uses an exact per-author cooldown', () => {
  const plugin = createPlugin({
    settings: { blockSpamEdit: false },
    editHistoryAntiSpam: {
      author: { blockedUntil: 999_999, times: [], lastActivity: 0 }
    }
  });

  assert.equal(plugin._getEditNotificationSpamDecision('author', 0), 'allow');
  assert.equal(plugin.editHistoryAntiSpam.author, undefined, 'disabling the setting clears stale blocks');

  plugin.settings.blockSpamEdit = true;
  for (let index = 0; index < 9; index++) {
    assert.equal(plugin._getEditNotificationSpamDecision('author', index * 1000), 'allow');
  }
  assert.equal(plugin._getEditNotificationSpamDecision('author', 9000), 'started');
  assert.equal(plugin._getEditNotificationSpamDecision('author', 10_000), 'blocked');
  assert.equal(plugin._getEditNotificationSpamDecision('other-author', 10_000), 'allow');
  assert.equal(plugin._getEditNotificationSpamDecision('author', 68_999), 'blocked');
  assert.equal(plugin._getEditNotificationSpamDecision('author', 69_000), 'allow');

  const configuredPlugin = createPlugin({
    settings: { blockSpamEdit: true, editSpamThreshold: 3 },
    editHistoryAntiSpam: {}
  });
  assert.equal(configuredPlugin._getEditNotificationSpamDecision('author', 0), 'allow');
  assert.equal(configuredPlugin._getEditNotificationSpamDecision('author', 1_000), 'allow');
  assert.equal(configuredPlugin._getEditNotificationSpamDecision('author', 2_000), 'started');

  configuredPlugin.settings.editSpamThreshold = 0;
  configuredPlugin.editHistoryAntiSpam = {};
  for (let index = 0; index < 9; index++) {
    assert.equal(configuredPlugin._getEditNotificationSpamDecision('author', index * 1000), 'allow');
  }
  assert.equal(configuredPlugin._getEditNotificationSpamDecision('author', 9_000), 'started');
});

test('edit-spam warnings keep expiring while hovered and dismiss from the whole card', () => {
  const notifications = [];
  const plugin = createPlugin({
    _showNotification(...args) { notifications.push(args); }
  });

  plugin._notifyEvent(
    'editSpamBlocked',
    { id: 'channel', guild_id: 'guild' },
    { id: 'guild' },
    null,
    { username: 'author', locationName: 'Test Channel' }
  );

  assert.deepEqual(notifications, [[
    'Edit Spam Blocked',
    'Edit notifications from author have been temporarily blocked for 1 minute.',
    'warning',
    [],
    7500,
    { pauseOnHover: false, instantDismiss: true }
  ]]);
});
