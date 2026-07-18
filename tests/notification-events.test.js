const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, loggerEvents, resetHarness } = require('./helpers/plugin-harness');

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

test('edit-spam setting resets clear every author and report only active state', () => {
  const now = Date.now();
  const reports = [];
  const debugEvents = [];
  const plugin = createPlugin({
    settings: { blockSpamEdit: true, editSpamThreshold: 3 },
    editHistoryAntiSpam: {
      first: { blockedUntil: now + 60_000, times: [], lastActivity: now, username: 'Alice' },
      second: { blockedUntil: 0, times: [now - 2_000, now - 1_000], lastActivity: now - 1_000, username: 'Bob' }
    },
    reportDebugEvent(message) { debugEvents.push(message); },
    reportSettingState(...args) { reports.push(args); }
  });

  plugin._resetEditNotificationSpamState(true, 'the threshold changed');
  assert.deepEqual(plugin.editHistoryAntiSpam, {});
  assert.deepEqual(debugEvents, [
    'Edit-spam timer for Alice is about to reset because the threshold changed.',
    'Edit-spam timer for Bob is about to reset because the threshold changed.'
  ]);
  assert.ok(debugEvents.every(message => !message.includes('first') && !message.includes('second')));
  assert.deepEqual(reports, [[
    'Edit Spam Timers Reset',
    'All edit-spam author counts and notification pauses were cleared.',
    'All edit-spam author counts and notification pauses were cleared.',
    'info',
    5000,
    'edit-spam-timers-reset'
  ]]);

  plugin.editHistoryAntiSpam.third = { blockedUntil: 60_000, times: [], lastActivity: 0 };
  plugin.settings.blockSpamEdit = false;
  plugin._resetEditNotificationSpamState(false);
  assert.deepEqual(plugin.editHistoryAntiSpam, {});
  assert.equal(reports.length, 1, 'silent resets do not add another notice');

  plugin._resetEditNotificationSpamState(true);
  assert.equal(reports.length, 1, 'empty resets do not claim that timers were cleared');

  plugin.settings.blockSpamEdit = true;
  plugin.editHistoryAntiSpam.stale = { blockedUntil: now + 60_000, times: [], lastActivity: now };
  assert.equal(plugin._getEditNotificationSpamDecision('fresh', 5_000), 'allow');
  assert.equal(plugin.editHistoryAntiSpam.stale, undefined, 'runtime setting changes clear all stale authors');
});

test('edit-spam reset notices require enabled blocking and cannot report one reset twice', () => {
  const now = Date.now();
  const reports = [];
  const plugin = createPlugin({
    settings: { blockSpamEdit: false, editSpamThreshold: 3 },
    editHistoryAntiSpam: {
      stale: { blockedUntil: now + 60_000, times: [], lastActivity: now, username: 'Alice' }
    },
    reportDebugEvent() {},
    reportSettingState(...args) { reports.push(args); }
  });

  plugin._handleEditSpamThresholdChange();
  assert.ok(plugin.editHistoryAntiSpam.stale, 'threshold changes cannot clear state while blocking is disabled');
  assert.equal(reports.length, 0, 'threshold changes cannot notify while blocking is disabled');

  plugin.settings.blockSpamEdit = true;
  plugin._handleEditSpamToggle(true);
  assert.deepEqual(plugin.editHistoryAntiSpam, {}, 'enabling owns the silent reset of disabled state');
  plugin.editHistoryAntiSpam.active = {
    blockedUntil: now + 60_000,
    times: [],
    lastActivity: now,
    username: 'Bob'
  };
  plugin._handleEditSpamThresholdChange();
  assert.equal(reports.length, 1, 'enabled threshold changes report the active reset once');
  assert.deepEqual(plugin.editHistoryAntiSpam, {});

  plugin.settings.blockSpamEdit = false;
  plugin._handleEditSpamToggle(false);
  assert.equal(reports.length, 1, 'disabling cannot re-report state cleared by the threshold change');

  plugin.editHistoryAntiSpam.active = {
    blockedUntil: now + 60_000,
    times: [],
    lastActivity: now,
    username: 'Carol'
  };
  plugin._handleEditSpamToggle(false);
  assert.equal(reports.length, 2, 'disabling still reports state that it actually clears');
});

test('edit-spam debug reports username counters and the full cooldown lifecycle', t => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled = [];
  t.after(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false, unref() {} };
    scheduled.push(timer);
    return timer;
  };
  global.clearTimeout = timer => {
    if (timer) timer.cleared = true;
  };

  const notifications = [];
  const plugin = createPlugin({
    settings: {
      blockSpamEdit: true,
      editSpamThreshold: 2,
      debugLogging: true,
      debugToasts: true
    },
    editHistoryAntiSpam: {},
    _showNotification(...args) { notifications.push(args); }
  });

  assert.equal(plugin._getEditNotificationSpamDecision('123456789', 0, 'Alice'), 'allow');
  assert.equal(plugin._getEditNotificationSpamDecision('123456789', 1_000, 'Alice'), 'started');
  assert.deepEqual(
    loggerEvents.map(event => event[1]),
    [
      '[Debug] Edit-spam counter for Alice: 1/2 edits within 60 seconds.',
      '[Debug] Edit-spam counter for Alice: 2/2 edits within 60 seconds.',
      '[Debug] Edit-spam cooldown for Alice started. Resetting in 60 seconds.'
    ]
  );
  assert.deepEqual(scheduled.map(timer => timer.delay), [50_000, 60_000]);

  scheduled[0].callback();
  scheduled[1].callback();
  assert.deepEqual(
    loggerEvents.slice(-2).map(event => event[1]),
    [
      '[Debug] Edit-spam cooldown for Alice will reset in 10 seconds.',
      '[Debug] Edit-spam cooldown for Alice reset after 60 seconds.'
    ]
  );
  assert.equal(plugin.editHistoryAntiSpam['123456789'], undefined);
  assert.equal(plugin._editSpamCooldownTimers.size, 0);
  assert.ok(loggerEvents.every(event => !String(event[1]).includes('123456789')));
  assert.ok(notifications.every(args => !String(args[1]).includes('123456789')));
  assert.ok(notifications.every(args => args[5].pauseOnHover === false && args[5].instantDismiss === true));

  assert.equal(plugin._getEditNotificationSpamDecision('987654321', 70_000, 'Bob'), 'allow');
  assert.equal(plugin._getEditNotificationSpamDecision('987654321', 71_000, 'Bob'), 'started');
  const unloadTimers = scheduled.slice(-2);
  plugin._clearEditSpamCooldownTimers();
  assert.ok(unloadTimers.every(timer => timer.cleared));
  assert.equal(plugin._editSpamCooldownTimers.size, 0);
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

test('channel-entry count toggles clear only their own pending queue and report real resets', () => {
  const reports = [];
  const plugin = createPlugin({
    deletedChatMessagesCount: { first: 2, empty: 0 },
    editedChatMessagesCount: { second: 3 },
    reportSettingState(...args) { reports.push(args); }
  });

  assert.equal(plugin._handleMessageCountToggle('deleted', true), false);
  assert.deepEqual(plugin.deletedChatMessagesCount, { first: 2, empty: 0 });
  assert.equal(reports.length, 0, 'enabling cannot clear or report pending counts');

  assert.equal(plugin._handleMessageCountToggle('deleted', false), true);
  assert.deepEqual(plugin.deletedChatMessagesCount, {});
  assert.deepEqual(plugin.editedChatMessagesCount, { second: 3 });
  assert.deepEqual(reports, [[
    'Deleted Message Counters Reset',
    'All pending deleted-message counters were reset to 0.',
    'All pending deleted-message counters were reset to 0.',
    'info',
    5000,
    'setting:showDeletedCount'
  ]]);

  assert.equal(plugin._handleMessageCountToggle('deleted', false), false);
  assert.equal(reports.length, 1, 'an already-empty queue cannot report another reset');

  assert.equal(plugin._handleMessageCountToggle('edited', false), true);
  assert.deepEqual(plugin.editedChatMessagesCount, {});
  assert.deepEqual(reports.at(-1), [
    'Edited Message Counters Reset',
    'All pending edited-message counters were reset to 0.',
    'All pending edited-message counters were reset to 0.',
    'info',
    5000,
    'setting:showEditedCount'
  ]);

  plugin.editedChatMessagesCount = { empty: 0 };
  assert.equal(plugin._handleMessageCountToggle('edited', false), false);
  assert.deepEqual(plugin.editedChatMessagesCount, {});
  assert.equal(reports.length, 2, 'zero-only queues are cleared silently');
});

test('channel-entry counter debug reports totals, deltas, server, and channel', () => {
  const debugEvents = [];
  const channel = { id: 'channel', name: 'general', guild_id: 'guild' };
  const guild = { id: 'guild', name: 'PortalCentric' };
  const plugin = createPlugin({
    settings: { showDeletedCount: true, showEditedCount: true },
    deletedChatMessagesCount: {},
    editedChatMessagesCount: {},
    reportDebugEvent(message) { debugEvents.push(message); }
  });

  assert.equal(plugin._incrementMessageCount('deleted', channel, guild), 1);
  assert.equal(plugin._incrementMessageCount('deleted', channel, guild, 5), 6);
  assert.equal(plugin._incrementMessageCount('edited', channel, guild), 1);
  assert.deepEqual(debugEvents, [
    'Deleted channel-entry counter increased to 1 (+1) for PortalCentric, #general.',
    'Deleted channel-entry counter increased to 6 (+5) for PortalCentric, #general.',
    'Edited channel-entry counter increased to 1 (+1) for PortalCentric, #general.'
  ]);

  plugin.settings.showEditedCount = false;
  assert.equal(plugin._incrementMessageCount('edited', channel, guild), 0);
  assert.equal(plugin.editedChatMessagesCount[channel.id], 1);
  assert.equal(debugEvents.length, 3, 'disabled counters cannot increase or emit debug output');
});
