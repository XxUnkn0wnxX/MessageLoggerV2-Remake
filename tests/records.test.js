const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

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
