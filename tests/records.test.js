const assert = require('node:assert/strict');
const test = require('node:test');

const {
  confirmationEvents,
  createPlugin,
  loggerEvents,
  ReactDOM,
  resetHarness
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
    showToast() {}
  });
  return { ...state, dispatches, plugin };
}

test.beforeEach(resetHarness);

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
  assert.deepEqual(normalized.editedMessageRecord, { [rootId]: [rootId] });
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
    showToast() {}
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
  assert.deepEqual(normalized.editedMessageRecord, { 'deleted-channel': [antiNukeId] });
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
  assert.equal(plugin.preservePurgedThreadRootCategory(rootId), true);
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
  const deferredThreadRefreshes = [];
  let forumListRefreshes = 0;
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
    tools: { getChannel: id => id === starterId ? { id, type: 11 } : null },
    settings: { deleteCachedFilesWithRecords: false },
    dispatcher: { dispatch: event => dispatches.push(event) },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    scheduleLiveThreadRecordCacheRefresh: (channelId, messageId) => {
      deferredThreadRefreshes.push([channelId, messageId]);
    },
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
  assert.deepEqual(invalidations, [], 'a live native thread cache must not refresh synchronously');
  assert.deepEqual(cacheRefreshes, [], 'a live native thread fetch must wait for React reconciliation');
  assert.deepEqual(deferredThreadRefreshes, [[starterId, starterId]]);
  assert.equal(forumListRefreshes, 1);
});

test('live thread cache cleanup waits until native React reconciliation has settled', () => {
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  let pending = null;
  let delay = null;
  const invalidations = [];
  const refreshes = [];
  global.setTimeout = (callback, milliseconds) => {
    pending = callback;
    delay = milliseconds;
    return 42;
  };
  global.clearTimeout = () => {};
  try {
    const plugin = createPlugin({
      messageRecord: {},
      channelMessages: { thread: { ready: true } },
      invalidateChannelCache: id => invalidations.push(id),
      cacheChannelMessages: id => refreshes.push(id)
    });

    plugin.scheduleLiveThreadRecordCacheRefresh('thread', 'starter');
    assert.equal(delay, 500);
    assert.deepEqual(invalidations, []);
    assert.deepEqual(refreshes, []);

    pending();
    assert.deepEqual(invalidations, ['thread']);
    assert.deepEqual(refreshes, ['thread']);
    assert.equal(plugin._liveThreadRecordRefreshTimers.size, 0);
  } finally {
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
  }
});

test('a full deleted root promotes only the latest visible saved reply as its context', () => {
  const rootId = '690';
  const olderId = '691';
  const latestId = '692';
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
  const older = {
    message: { id: olderId, channel_id: rootId, content: 'older reply', timestamp: 200, author },
    delete_data: { time: 300, forum_thread_message_delete: true }
  };
  const latest = {
    message: {
      id: latestId,
      channel_id: rootId,
      content: 'latest visible reply',
      timestamp: 300,
      attachments: [{ id: 'media', filename: 'reply.png' }],
      author
    },
    delete_data: { time: 400, forum_thread_message_delete: true },
    edit_history: [{ content: 'before edit', time: 350 }],
    logged_attachments: ['cached-reply-media']
  };
  const hidden = {
    message: { id: hiddenId, channel_id: rootId, content: 'newer but hidden', timestamp: 400, author },
    delete_data: { time: 450, hidden: true, forum_thread_message_delete: true }
  };
  const plugin = createPlugin({
    messageRecord: { [rootId]: root, [olderId]: older, [latestId]: latest, [hiddenId]: hidden },
    messageRecordIds: new Set([rootId, olderId, latestId, hiddenId]),
    deletedMessageRecord: { [rootId]: [rootId, olderId, latestId, hiddenId] },
    editedMessageRecord: { [rootId]: [latestId] },
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[rootId, new Set([rootId, olderId, latestId, hiddenId])]]),
    editedMessageSet: new Map([[rootId, new Set([latestId])]]),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map([[rootId, []]]),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    suppressedForumThreadIds: new Set(),
    noTintIds: new Set([latestId]),
    editModifiers: { [latestId]: { editNum: 0 } },
    settings: { deleteCachedFilesWithRecords: false }
  });

  assert.deepEqual(plugin.promoteLatestSavedThreadReplyIntoRoot(rootId), {
    rootId,
    contextMessageId: latestId
  });
  const promoted = plugin.messageRecord[rootId];
  assert.equal(promoted.message.content, 'latest visible reply');
  assert.equal(promoted.message.id, rootId);
  assert.equal(promoted.message.channel_id, rootId);
  assert.equal(promoted.delete_data.forum_thread_delete, true);
  assert.equal(promoted.delete_data.forum_thread_message_delete, undefined);
  assert.equal(promoted.delete_data.forum_metadata.name, 'Deleted title');
  assert.equal(promoted.delete_data.forum_metadata.starterContent, null);
  assert.equal(promoted.delete_data.forum_metadata.rootContextMessageId, latestId);
  assert.equal(promoted.delete_data.forum_metadata.rootContextWasReply, true);
  assert.deepEqual(promoted.edit_history, [{ content: 'before edit', time: 350 }]);
  assert.deepEqual(promoted.logged_attachments, ['cached-reply-media']);
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [rootId, olderId, hiddenId]);
  assert.deepEqual(plugin.deletedMessageRecord, { [rootId]: [rootId, olderId, hiddenId] });
  assert.deepEqual(plugin.editedMessageRecord, { [rootId]: [rootId] });
  assert.deepEqual(plugin.getRecordCacheSourceMessageIds(promoted), new Set([rootId, latestId]));
  assert.equal(plugin.noTintIds.has(latestId), false);
  assert.equal(plugin.editModifiers[latestId], undefined);

  const removed = plugin.deleteMessageFromRecords(rootId);
  assert.deepEqual(new Set(removed), new Set([rootId, olderId, hiddenId]));
  assert.deepEqual(plugin.messageRecord, {}, 'only the full structural root cascades through remaining children');

  const emptyRoot = structuredClone(root);
  const emptyPlugin = createPlugin({ messageRecord: { [rootId]: emptyRoot } });
  assert.equal(emptyPlugin.promoteLatestSavedThreadReplyIntoRoot(rootId), null);
  assert.equal(
    emptyPlugin.messageRecord[rootId].message.content,
    '[no saved message or reply content found]',
    'a full root with no visible saved replies keeps the explicit placeholder'
  );
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
