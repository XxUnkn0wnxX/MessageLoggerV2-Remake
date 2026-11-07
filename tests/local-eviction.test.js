const assert = require('node:assert/strict');
const test = require('node:test');
const { createPlugin, loggerEvents, resetHarness } = require('./helpers/plugin-harness');
const { installNativeCache } = require('./helpers/native-message-cache');

function fixture() {
  const records = {
    a: { message: { id: 'a', channel_id: 'one' }, delete_data: {} },
    b: { message: { id: 'b', channel_id: 'one' }, delete_data: {} },
    c: { message: { id: 'c', channel_id: 'two' }, delete_data: {} },
    absent: { message: { id: 'absent', channel_id: 'missing' }, delete_data: {} },
    unindexed: { message: { id: 'unindexed', channel_id: 'one' }, delete_data: {} }
  };
  const plugin = createPlugin({ messageRecord: records, deletedMessageRecord: {
    one: ['a', 'b'], two: ['c'], missing: ['absent']
  } });
  const native = installNativeCache(plugin, [
    ['one', { main: ['a', 'native'], before: ['a', 'b'], after: ['b', 'other'] }],
    ['two', { main: ['c', 'other'] }]
  ]);
  return { plugin, records, ...native };
}

test('validated snapshots evict immutable cache entries, dedupe and never create absent channels', () => {
  const { plugin, records, caches, commits, store } = fixture();
  const old = caches.get('one');
  const a = plugin.snapshotLoggerDeletion(records.a, 'one', 'a');
  const b = plugin.snapshotLoggerDeletion(records.b, 'one', 'b');
  const absent = plugin.snapshotLoggerDeletion(records.absent, 'missing', 'absent');
  assert.equal(plugin.snapshotLoggerDeletion(records.unindexed, 'one', 'unindexed'), null);
  assert.equal(plugin.snapshotLoggerDeletion(records.a, 'two', 'a'), null);
  for (const invalid of [
    { message: { id: 'a', channel_id: 'one' }, edit_history: [] },
    { message: { id: 'different', channel_id: 'one' }, delete_data: {} },
    { message: { id: 'a', channel_id: 'one' } }
  ]) {
    plugin.messageRecord.a = invalid;
    assert.equal(plugin.snapshotLoggerDeletion(invalid, 'one', 'a'), null);
  }
  plugin.messageRecord.a = records.a;
  delete plugin.messageRecord.a;
  delete plugin.deletedMessageRecord.one;
  assert.deepEqual(plugin.evictLoggerDeletionSnapshots([a, a, b, absent, { id: 'native', channelId: 'one' }]), { complete: true, changed: true, changedChannelIds: ['one'] });
  assert.equal(old.has('a'), true);
  assert.equal(caches.get('one').has('a'), false);
  assert.equal(caches.get('one').has('b'), false);
  assert.equal(caches.get('one').has('native'), true);
  assert.equal(caches.get('one').has('other'), true);
  assert.strictEqual(caches.get('one').metadata, old.metadata);
  assert.equal(caches.has('missing'), false);
  assert.equal(commits.length, 1);
  assert.equal(store.changes, 1);
});

test('absent target performs no commit, notification, cache creation or fetch', () => {
  const { plugin, records, caches, commits, store } = fixture();
  const absent = plugin.snapshotLoggerDeletion(records.absent, 'missing', 'absent');
  assert.deepEqual(plugin.evictLoggerDeletionSnapshots([absent]), { complete: true, changed: false, changedChannelIds: [] });
  assert.equal(caches.has('missing'), false);
  assert.equal(commits.length, 0);
  assert.equal(store.changes, 0);
});

test('partial failure still notifies committed changes and missing capability reports incomplete', () => {
  resetHarness();
  const { plugin, records, caches, owner, store } = fixture();
  const a = plugin.snapshotLoggerDeletion(records.a, 'one', 'a');
  const c = plugin.snapshotLoggerDeletion(records.c, 'two', 'c');
  owner.get = function(channel) { if (channel === 'two') throw Error('unavailable'); return caches.get(channel); };
  assert.deepEqual(plugin.evictLoggerDeletionSnapshots([a, c]), { complete: false, changed: true, changedChannelIds: ['one'] });
  assert.equal(caches.get('one').has('a'), false);
  assert.equal(caches.get('two').has('c'), true);
  assert.equal(store.changes, 1);
  delete store.emitChange;
  assert.deepEqual(plugin.evictLoggerDeletionSnapshots([c]), { complete: false, changed: false, changedChannelIds: [] });
  assert.ok(loggerEvents.some(event => event[0] === 'warn'));
});

test('hide and attachment remount evict indexed entries without broadcasting deletes', () => {
  const { plugin, records, caches, store } = fixture();
  const events = [];
  Object.assign(plugin, {
    tools: { getChannel: () => ({ type: 0 }) },
    dispatcher: { dispatch: event => events.push(event) },
    saveData() {}, scheduleLoggerMenuRefresh() {}, refreshForumThreadLogModal() {}, notifyUser() {},
    _scheduleSavedAttachmentPresentationRecache() {}, getMessageStickerItems: () => []
  });
  assert.equal(plugin.hideSavedDeletedRecord(records.a), true);
  assert.equal(caches.get('one').has('a'), false);
  records.b.message.attachments = [{ id: 'attachment' }];
  assert.equal(plugin.remountSavedAttachmentPresentationRecords(records.b), 1);
  assert.equal(caches.get('one').has('b'), false);
  assert.equal(caches.get('one').has('native'), true);
  assert.equal(store.changes, 2);
  assert.equal(events.some(event => event.type === 'MESSAGE_DELETE'), false);
});

test('shutdown uses validated pre-captured ownership and preserves a surviving native thread', () => {
  const { plugin, records, caches, store } = fixture();
  records.c.delete_data.forum_thread_message_delete = true;
  const events = [];
  const recaches = [];
  Object.assign(plugin, {
    tools: { getChannel: id => ({ type: id === 'two' ? 11 : 0 }) },
    dispatcher: { dispatch: event => events.push(event) },
    shouldPresentSavedMessage: () => true,
    _invalidateAndRecache: channel => recaches.push(channel),
    setRestoredDeleteShiftActive() {}
  });
  const state = plugin.captureArchiveLoadPresentationState();
  delete plugin.messageRecord.a;
  delete plugin.deletedMessageRecord.one;
  const oldDocument = global.document;
  global.document = { querySelectorAll: () => [] };
  try { assert.equal(plugin.cleanupArchivePresentationForDisable(state), true); }
  finally { global.document = oldDocument; }
  assert.equal(caches.get('one').has('a'), false);
  assert.equal(caches.get('one').has('b'), false);
  assert.equal(caches.get('two').has('c'), true);
  assert.deepEqual(recaches, ['two']);
  assert.equal(store.changes, 1);
  assert.equal(events.some(event => event.type === 'MESSAGE_DELETE'), false);
});


test('invalid immutable results never commit and an absent target in an existing cache is a no-op', () => {
  for (const makeResult of [
    cache => cache,
    () => ({}),
    () => Promise.resolve({}),
    cache => ({ channelId: 'wrong', has: () => false }),
    cache => ({ channelId: cache.channelId, has: () => true })
  ]) {
    const { plugin, records, caches, commits, store } = fixture();
    const cache = caches.get('one');
    cache.removeMany = () => makeResult(cache);
    const snapshot = plugin.snapshotLoggerDeletion(records.a, 'one', 'a');
    assert.deepEqual(plugin.evictLoggerDeletionSnapshots([snapshot]), { complete: false, changed: false, changedChannelIds: [] });
    assert.strictEqual(caches.get('one'), cache);
    assert.equal(commits.length, 0);
    assert.equal(store.changes, 0);
  }
  const { plugin, records, caches, commits, store } = fixture();
  caches.get('one').main.delete('a');
  caches.get('one').before.delete('a');
  const snapshot = plugin.snapshotLoggerDeletion(records.a, 'one', 'a');
  assert.deepEqual(plugin.evictLoggerDeletionSnapshots([snapshot]), { complete: true, changed: false, changedChannelIds: [] });
  assert.equal(commits.length, 0);
  assert.equal(store.changes, 0);
});

test('remount schedules only committed channels after partial failure and keeps native thread refresh', () => {
  const { plugin, records, caches, owner } = fixture();
  const scheduled = [];
  records.a.message.attachments = [{ id: 'a-media' }];
  records.c.message.attachments = [{ id: 'c-media' }];
  const thread = { message: { id: 'thread', channel_id: 'thread', attachments: [{ id: 'thread-media' }] }, delete_data: { forum_thread_message_delete: true } };
  Object.assign(plugin, {
    tools: { getChannel: id => ({ type: id === 'thread' ? 11 : 0 }) },
    settings: { cacheAllImages: false }, dispatcher: { dispatch() {} },
    _scheduleSavedAttachmentPresentationRecache: channel => scheduled.push(channel),
    shouldPresentSavedMessage: () => false
  });
  owner.get = function(channel) { if (channel === 'two') throw Error('failure'); return caches.get(channel); };
  assert.equal(plugin.remountSavedAttachmentPresentationRecords([records.a, records.c, thread]), 2);
  assert.deepEqual(scheduled.sort(), ['one', 'thread']);
  assert.equal(caches.get('one').has('a'), false);
  assert.equal(caches.get('two').has('c'), true);
});
