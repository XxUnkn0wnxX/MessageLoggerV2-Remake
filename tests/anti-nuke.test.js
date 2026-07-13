const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

test('deleted-channel caches are deduplicated, filtered, and newest-first', () => {
  const plugin = createPlugin({
    cachedMessageRecord: [
      { id: '100', channel_id: 'channel', type: 0 },
      { id: '102', channel_id: 'channel', type: 18 },
      { id: '103', channel_id: 'other', type: 0 }
    ],
    channelMessages: {
      channel: { _array: [{ id: '101', channel_id: 'channel', type: 0 }] }
    },
    messageStore: {
      getMessages: () => [{ id: '100', channel_id: 'channel', type: 0 }]
    }
  });

  assert.deepEqual(plugin.getCachedMessagesForDeletedChannel('channel').map(message => message.id), ['101', '100']);
});

test('Anti-Nuke thread, message, and attachment caps are independent', () => {
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      antiNukeThreadCap: 2,
      antiNukeMessageCap: 3,
      antiNukeAttachmentCap: 2
    },
    getCachedMessagesForDeletedChannel: () => []
  });
  const context = plugin.createDeletedChannelCaptureContext(
    { id: 'channel', guild_id: 'guild', name: 'general', type: 0 },
    { id: 'guild', name: 'Server' }
  );

  assert.equal(plugin.claimDeletedChannelThread(context, 'thread-1'), true);
  assert.equal(plugin.claimDeletedChannelThread(context, 'thread-1'), true);
  assert.equal(plugin.claimDeletedChannelThread(context, 'thread-2'), true);
  assert.equal(plugin.claimDeletedChannelThread(context, 'thread-3'), false);
  assert.equal(context.capturedThreads, 2);

  assert.equal(plugin.consumeDeletedChannelMessageCaptureSlot(context), true);
  assert.equal(plugin.consumeDeletedChannelMessageCaptureSlot(context), true);
  assert.equal(plugin.consumeDeletedChannelMessageCaptureSlot(context), true);
  assert.equal(plugin.consumeDeletedChannelMessageCaptureSlot(context), false);

  assert.deepEqual(
    plugin.claimDeletedChannelAttachments(context, { attachments: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    [{ id: 'a' }, { id: 'b' }]
  );
  assert.equal(context.capturedAttachments, 2);
});

test('zero Anti-Nuke caps mean unlimited and disabled capture stays disabled', () => {
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: false,
      antiNukeThreadCap: 0,
      antiNukeMessageCap: 0,
      antiNukeAttachmentCap: 0
    },
    getCachedMessagesForDeletedChannel: () => []
  });
  const context = plugin.createDeletedChannelCaptureContext({ id: 'channel', type: 0 }, null);

  assert.equal(context.captureEnabled, false);
  assert.equal(context.remainingThreads, Infinity);
  assert.equal(context.remainingMessages, Infinity);
  assert.equal(context.remainingAttachments, Infinity);
  assert.equal(plugin.claimDeletedChannelThread(context, 'thread'), false);
});

test('Anti-Nuke excludes thread-created system and unsupported messages', () => {
  const plugin = createPlugin();

  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '1', channel_id: 'c', type: 0 }), true);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '2', channel_id: 'c', type: 19 }), true);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '3', channel_id: 'c', type: 18 }), false);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '4', channel_id: 'c', type: 7 }), false);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '5', channel_id: 'c', type: 0, flags: 64 }), false);
});

test('Anti-Nuke folds the initial thread starter into the root without consuming a reply slot', () => {
  const calls = [];
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      antiNukeThreadCap: 1,
      antiNukeMessageCap: 1,
      antiNukeAttachmentCap: 10
    },
    purgedMessageRecord: {},
    messageRecord: {},
    getCachedMessagesForDeletedChannel: () => [],
    saveDeletedChannelCaptureMessage(message, _target, context, options = {}) {
      calls.push({ id: message.id, options });
      if (options.threadRoot) {
        context.captured++;
        return true;
      }
      if (options.threadStarterForRoot) return true;
      return this.consumeDeletedChannelMessageCaptureSlot(context);
    },
    foldSavedThreadStarterIntoRoot: () => true
  });
  const context = plugin.createDeletedChannelCaptureContext(
    { id: 'parent', guild_id: 'guild', name: 'general', type: 0 },
    { id: 'guild', name: 'Server' }
  );
  const thread = { id: '400', parent_id: 'parent', guild_id: 'guild', name: 'test', type: 11 };
  const root = { id: '400', channel_id: '400', content: 'placeholder', type: 0, attachments: [] };
  const starter = { id: '401', channel_id: '400', content: 'testa', type: 0, attachments: [] };
  const messageB = { id: '402', channel_id: '400', content: 'message B', type: 0, attachments: [] };
  const messageC = { id: '403', channel_id: '400', content: 'message C', type: 0, attachments: [] };
  const metadata = {
    id: '400',
    parentId: 'parent',
    parentType: 0,
    name: 'test',
    starterMessageId: '401'
  };

  plugin.captureThreadFromDeletedChannel(thread, context, {
    root,
    messages: [messageB, starter, messageC],
    metadata
  });

  assert.deepEqual(calls.map(call => call.id), ['400', '401', '402']);
  assert.equal(calls[1].options.threadStarterForRoot, true);
  assert.equal(calls[2].options.threadStarterForRoot, undefined);
  assert.equal(context.capturedThreads, 1);
  assert.equal(context.capturedMessages, 1, 'only message B consumes the sole reply slot');
  assert.equal(context.captured, 2, 'the logical root and one reply are counted once each');
  assert.equal(context.remainingMessages, 0);
});

test('Anti-Nuke channel threads capture the same root metadata and starter payload as normal thread deletes', () => {
  const rootId = '500';
  const starterId = '501';
  const replyId = '502';
  const author = { id: 'author', username: 'Author', discriminator: '0', public_flags: 0 };
  const initialMetadata = {
    id: rootId,
    parentId: 'parent',
    parentType: 0,
    threadType: 11,
    isForumParent: false,
    guildId: 'guild',
    guildName: 'Server',
    parentName: 'general',
    name: 'Thread title',
    ownerId: author.id,
    starterMessageId: rootId,
    starterContent: '[starter message unavailable]'
  };
  const root = {
    id: rootId,
    channel_id: rootId,
    guild_id: 'guild',
    content: '[starter message unavailable]',
    timestamp: 1000,
    type: 0,
    attachments: [],
    embeds: [],
    author
  };
  const starter = {
    id: starterId,
    channel_id: rootId,
    guild_id: 'guild',
    content: 'Initial body',
    timestamp: 1001,
    type: 0,
    attachments: [{ id: 'attachment', filename: 'starter.png' }],
    embeds: [],
    author
  };
  const reply = {
    id: replyId,
    channel_id: rootId,
    guild_id: 'guild',
    content: 'Reply B',
    timestamp: 1002,
    type: 0,
    attachments: [],
    embeds: [],
    author
  };
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      antiNukeThreadCap: 1,
      antiNukeMessageCap: 1,
      antiNukeAttachmentCap: 5
    },
    messageRecord: {},
    messageRecordIds: new Set(),
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    deletedMessageSet: new Map(),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    noTintIds: new Set(),
    editModifiers: {},
    forumThreadMetadataCache: new Map([[rootId, structuredClone(initialMetadata)]]),
    saveDeletedMessage(message, targetMap) {
      this.messageRecord[message.id] = {
        message: structuredClone(message),
        delete_data: { time: 2000 },
        edit_history: message.id === starterId ? [{ content: 'Initial body before edit', time: 900 }] : null,
        logged_attachments: message.id === starterId ? ['cached-starter-media'] : []
      };
      (targetMap[message.channel_id] ||= []).push(message.id);
      const targetSet = targetMap === this.deletedMessageRecord ? this.deletedMessageSet : this.purgedMessageSet;
      if (!targetSet.has(message.channel_id)) targetSet.set(message.channel_id, new Set());
      targetSet.get(message.channel_id).add(message.id);
      this.messageRecordIds.add(message.id);
    },
    getDeletedChannelThreadMetadata(channel, context, starterMessage = null) {
      const existing = this.forumThreadMetadataCache.get(channel.id) || {};
      const metadata = {
        ...existing,
        id: channel.id,
        parentId: context.channel.id,
        parentType: context.channel.type,
        threadType: channel.type,
        isForumParent: false,
        name: channel.name,
        starterMessageId: starterMessage?.id || existing.starterMessageId || null,
        starterContent: starterMessage?.content || existing.starterContent || null,
        starterAuthor: starterMessage?.author || existing.starterAuthor || null,
        starterTimestamp: starterMessage?.timestamp || existing.starterTimestamp || null
      };
      this.forumThreadMetadataCache.set(channel.id, metadata);
      return metadata;
    }
  });
  const context = plugin.createDeletedChannelCaptureContext(
    { id: 'parent', guild_id: 'guild', name: 'general', type: 0 },
    { id: 'guild', name: 'Server' }
  );
  const thread = { id: rootId, parent_id: 'parent', guild_id: 'guild', name: 'Thread title', type: 11 };

  plugin.captureThreadFromDeletedChannel(thread, context, {
    root,
    // Anti-Nuke snapshots are newest-first; the starter is the oldest eligible message.
    messages: [reply, starter],
    metadata: structuredClone(initialMetadata)
  });

  const savedRoot = plugin.messageRecord[rootId];
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [rootId, replyId]);
  assert.equal(savedRoot.message.content, 'Initial body');
  assert.deepEqual(savedRoot.message.attachments, [{ id: 'attachment', filename: 'starter.png' }]);
  assert.deepEqual(savedRoot.edit_history, [{ content: 'Initial body before edit', time: 900 }]);
  assert.deepEqual(savedRoot.logged_attachments, ['cached-starter-media']);
  assert.equal(savedRoot.delete_data.forum_metadata.name, 'Thread title');
  assert.equal(savedRoot.delete_data.forum_metadata.starterMessageId, starterId);
  assert.equal(savedRoot.delete_data.forum_metadata.starterContent, 'Initial body');
  assert.equal(savedRoot.delete_data.forum_metadata.starterAuthor.id, author.id);
  assert.equal(savedRoot.delete_data.forum_metadata.starterTimestamp, 1001);
  assert.equal(savedRoot.delete_data.forum_metadata.starterFoldedIntoRoot, true);
  assert.equal(savedRoot.delete_data.forum_thread_delete, true);
  assert.equal(savedRoot.delete_data.forum_thread_message_delete, undefined);
  assert.equal(savedRoot.delete_data.anti_nuke, true);
  assert.equal(savedRoot.delete_data.anti_nuke_parent_id, 'parent');
  assert.equal(plugin.messageRecord[replyId].message.content, 'Reply B');
  assert.deepEqual(plugin.purgedMessageRecord, { [rootId]: [rootId, replyId] });
  assert.equal(context.capturedMessages, 1, 'only the independent reply consumes the message cap');

  const forumRoot = { id: 'forum', channel_id: 'forum' };
  assert.equal(
    plugin.getDeletedChannelThreadStarterCandidate(
      { id: 'forum' },
      { channel: { type: 15 } },
      forumRoot,
      [reply, starter]
    ),
    forumRoot,
    'forum posts retain their existing self-keyed root selection'
  );
});
