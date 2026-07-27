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

test('Anti-Nuke preserves the saved attachment cap while disabling its active gate with media caching off', () => {
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: false,
      antiNukeThreadCap: 2,
      antiNukeMessageCap: 3,
      antiNukeAttachmentCap: 7
    },
    getCachedMessagesForDeletedChannel: () => []
  });
  const context = plugin.createDeletedChannelCaptureContext({ id: 'channel', type: 0 }, null);
  assert.equal(context.attachmentCap, 7);
  assert.equal(context.attachmentCapActive, false);
  assert.equal(context.remainingAttachments, Infinity);
});

test('Anti-Nuke excludes thread-created system and unsupported messages', () => {
  const plugin = createPlugin();

  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '1', channel_id: 'c', type: 0 }), true);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '2', channel_id: 'c', type: 19 }), true);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '3', channel_id: 'c', type: 18 }), false);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '4', channel_id: 'c', type: 7 }), false);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '5', channel_id: 'c', type: 0, flags: 64 }), false);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '6', channel_id: 'c', type: 0, flags: 64 | 32768 }), false);
  assert.equal(plugin.shouldCaptureDeletedChannelMessage({ id: '7', channel_id: 'c', type: 0, flags: 32768 }), true);
});

test('Anti-Nuke ignores ordinary Ignore bots gates for channel snapshots', () => {
  const plugin = createPlugin({
    settings: { ignoreBots: true },
    tools: {
      getUser: id => id === 'store-bot' ? { id, bot: true } : { id, bot: false },
      isBlocked: () => false
    }
  });
  const richPayload = {
    flags: 32768,
    embeds: [{ title: 'rich deleted message', fields: [{ name: 'field', value: 'value' }] }],
    components: [{ type: 1, components: [{ type: 2, label: 'Action' }] }]
  };
  const automatedMessages = [
    { author: { id: 'raw-bot', bot: true } },
    { author: { id: 'store-bot' } },
    { webhook_id: 'webhook-snake' },
    { webhookId: 'webhook-camel' },
    { application_id: 'application-snake' },
    { applicationId: 'application-camel' },
    { application: { id: 'application-nested' } },
    { interaction: { id: 'interaction' } },
    { interaction_metadata: { id: 'interaction-metadata-snake' } },
    { interactionMetadata: { id: 'interaction-metadata-camel' } }
  ];

  for (const [index, automated] of automatedMessages.entries()) {
    assert.equal(
      plugin.shouldCaptureDeletedChannelMessage({ id: `automated-${index}`, channel_id: 'c', type: 0, ...richPayload, ...automated }),
      true,
      JSON.stringify(automated)
    );
  }

  assert.equal(
    plugin.shouldCaptureDeletedChannelMessage({
      id: 'human-rich',
      channel_id: 'c',
      type: 0,
      author: { id: 'human', bot: false },
      ...richPayload
    }),
    true
  );
});

test('Anti-Nuke captures automated rich payloads unchanged', () => {
  let savedMessage = null;
  const plugin = createPlugin({
    settings: { ignoreBots: true },
    messageRecord: {},
    deletedMessageRecord: {},
    nukedMessageRecord: {},
    purgedMessageRecord: {},
    deletedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    getMessageLocationSnapshot: () => null,
    saveDeletedMessage(message) {
      savedMessage = structuredClone(message);
      this.messageRecord[message.id] = {
        message: structuredClone(message),
        delete_data: {}
      };
    }
  });
  const message = {
    id: 'webhook-rich',
    channel_id: 'deleted-channel',
    type: 0,
    webhook_id: 'webhook',
    flags: 32768,
    attachments: [{ id: 'attachment', filename: 'proof.png' }],
    embeds: [{ title: 'Webhook embed', description: 'must survive capture' }],
    components: [{ type: 1, components: [{ type: 2, label: 'Still here' }] }]
  };
  const context = {
    captureEnabled: true,
    remainingMessages: Infinity,
    remainingAttachments: Infinity,
    capturedMessages: 0,
    captured: 0,
    capturedAttachments: 0,
    channel: { id: 'deleted-channel' }
  };

  assert.equal(plugin.saveDeletedChannelCaptureMessage(message, plugin.nukedMessageRecord, context), true);
  assert.deepEqual(savedMessage, message);
  assert.deepEqual(plugin.messageRecord[message.id].message.embeds, message.embeds);
  assert.deepEqual(plugin.messageRecord[message.id].message.components, message.components);
  assert.deepEqual(plugin.messageRecord[message.id].message.attachments, message.attachments);
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

test('Anti-Nuke promotes the oldest reply when a removed starter leaves an empty structural root', () => {
  const rootId = '450';
  const olderId = '451';
  const latestId = '452';
  const author = { id: 'author', username: 'Author', public_flags: 0 };
  const plugin = createPlugin({
    settings: {
      antiNukeEnabled: true,
      antiNukeThreadCap: 1,
      antiNukeMessageCap: 5,
      antiNukeAttachmentCap: 5
    },
    messageRecord: {},
    messageRecordIds: new Set(),
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map(),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    suppressedForumThreadIds: new Set(),
    noTintIds: new Set(),
    editModifiers: {},
    forumThreadMetadataCache: new Map(),
    getCachedMessagesForDeletedChannel: () => [],
    saveDeletedMessage(message, targetMap, options = {}) {
      this.messageRecord[message.id] = {
        message: structuredClone(message),
        delete_data: { time: 2000 }
      };
      this.applySavedEventBatch(this.messageRecord[message.id].delete_data, options.captureBatch);
      (targetMap[message.channel_id] ||= []).push(message.id);
      const targetSet = targetMap === this.nukedMessageRecord
        ? this.nukedMessageSet
        : this.deletedMessageSet;
      if (!targetSet.has(message.channel_id)) targetSet.set(message.channel_id, new Set());
      targetSet.get(message.channel_id).add(message.id);
      this.messageRecordIds.add(message.id);
    }
  });
  const context = plugin.createDeletedChannelCaptureContext(
    { id: 'parent', guild_id: 'guild', name: 'general', type: 0 },
    { id: 'guild', name: 'Server' }
  );
  const thread = { id: rootId, parent_id: 'parent', guild_id: 'guild', name: 'Thread title', type: 11 };
  const root = {
    id: rootId,
    channel_id: rootId,
    content: '[no saved message or reply content found]',
    timestamp: 100,
    type: 0,
    attachments: [],
    author
  };
  const older = {
    id: olderId,
    channel_id: rootId,
    content: 'older reply',
    timestamp: 200,
    type: 0,
    attachments: [],
    author
  };
  const latest = {
    id: latestId,
    channel_id: rootId,
    content: 'latest surviving reply',
    timestamp: 300,
    type: 0,
    attachments: [],
    author
  };
  const metadata = {
    id: rootId,
    parentId: 'parent',
    parentType: 0,
    isForumParent: false,
    name: 'Thread title',
    starterMessageId: 'removed-starter'
  };

  plugin.captureThreadFromDeletedChannel(thread, context, {
    root,
    // Deliberately reverse the capture input: promotion must follow the original message
    // timestamps, not API/cache array order or the time each deletion was observed.
    messages: [latest, older],
    metadata
  });

  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [rootId, latestId]);
  assert.equal(plugin.messageRecord[rootId].message.content, 'older reply');
  assert.equal(plugin.messageRecord[rootId].delete_data.forum_thread_delete, true);
  assert.equal(plugin.messageRecord[rootId].delete_data.anti_nuke, true);
  assert.equal(plugin.messageRecord[rootId].delete_data.capture_batch_id, context.captureBatch.id);
  assert.equal(plugin.messageRecord[rootId].delete_data.capture_batch_time, context.captureBatch.time);
  assert.equal(plugin.messageRecord[rootId].delete_data.forum_metadata.rootContextMessageId, olderId);
  assert.equal(plugin.messageRecord[latestId].delete_data.capture_batch_id, context.captureBatch.id);
  assert.deepEqual(plugin.nukedMessageRecord, { [rootId]: [rootId, latestId] });
  assert.equal(context.captured, 2, 'the structural root and one independent reply are counted');
  assert.equal(context.capturedMessages, 1, 'the promoted reply no longer consumes a reply slot');
  assert.equal(context.remainingMessages, 4);

  const forumPlaceholder = { ...root, content: '[no saved message or reply content found]' };
  assert.equal(
    plugin.getDeletedChannelThreadStarterCandidate(
      { id: rootId },
      { channel: { type: 15 } },
      forumPlaceholder,
      [latest, older],
      { ...metadata, isForumParent: true, starterMessageId: rootId }
    ),
    null,
    'Anti-Nuke forum capture also leaves a missing starter for reply promotion'
  );
});

test('Anti-Nuke promotes an older hidden saved record before newer Nuked context', () => {
  const rootId = '460';
  const hiddenId = '461';
  const newerId = '462';
  const author = { id: 'author', username: 'Author' };
  const plugin = createPlugin({
    messageRecord: {
      [rootId]: {
        message: { id: rootId, channel_id: rootId, content: '[starter message unavailable]', timestamp: 100, author },
        delete_data: {
          time: 500,
          anti_nuke: true,
          anti_nuke_parent_id: 'parent',
          forum_thread_delete: true,
          forum_metadata: { parentId: 'parent', name: 'Thread' }
        }
      },
      [hiddenId]: {
        message: { id: hiddenId, channel_id: rootId, content: 'oldest hidden record', timestamp: 150, author },
        delete_data: {
          time: 450,
          hidden: true,
          anti_nuke: true,
          anti_nuke_parent_id: 'parent',
          forum_thread_message_delete: true
        },
        ghost_pinged: true
      },
      [newerId]: {
        message: { id: newerId, channel_id: rootId, content: 'newer Nuked reply', timestamp: 200, author },
        delete_data: {
          time: 300,
          anti_nuke: true,
          anti_nuke_parent_id: 'parent',
          forum_thread_message_delete: true
        }
      }
    },
    messageRecordIds: new Set([rootId, hiddenId, newerId]),
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: { [rootId]: [rootId, hiddenId, newerId] },
    deletedMessageSet: new Map(),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map([[rootId, new Set([rootId, hiddenId, newerId])]]),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map([[rootId, []]]),
    noTintIds: new Set(),
    editModifiers: {}
  });

  assert.deepEqual(plugin.promoteOldestSavedThreadReplyIntoRoot(rootId), {
    rootId,
    contextMessageId: hiddenId
  });
  assert.equal(plugin.messageRecord[rootId].message.content, 'oldest hidden record');
  assert.equal(plugin.messageRecord[rootId].delete_data.hidden, true);
  assert.equal(plugin.messageRecord[rootId].delete_data.anti_nuke, true);
  assert.equal(plugin.messageRecord[rootId].ghost_pinged, true);
  assert.deepEqual(plugin.nukedMessageRecord, { [rootId]: [rootId, newerId] });
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
    nukedMessageRecord: {},
    deletedMessageSet: new Map(),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    noTintIds: new Set(),
    editModifiers: {},
    forumThreadMetadataCache: new Map([[rootId, structuredClone(initialMetadata)]]),
    saveDeletedMessage(message, targetMap, options = {}) {
      this.messageRecord[message.id] = {
        message: structuredClone(message),
        delete_data: { time: 2000 },
        edit_history: message.id === starterId ? [{ content: 'Initial body before edit', time: 900 }] : null,
        logged_attachments: message.id === starterId ? ['cached-starter-media'] : []
      };
      this.applySavedEventBatch(this.messageRecord[message.id].delete_data, options.captureBatch);
      (targetMap[message.channel_id] ||= []).push(message.id);
      const targetSet = targetMap === this.deletedMessageRecord
        ? this.deletedMessageSet
        : targetMap === this.nukedMessageRecord
          ? this.nukedMessageSet
          : this.purgedMessageSet;
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
  assert.equal(savedRoot.delete_data.capture_batch_id, context.captureBatch.id);
  assert.equal(savedRoot.delete_data.capture_batch_time, context.captureBatch.time);
  assert.equal(plugin.messageRecord[replyId].message.content, 'Reply B');
  assert.equal(plugin.messageRecord[replyId].delete_data.capture_batch_id, context.captureBatch.id);
  assert.deepEqual(plugin.purgedMessageRecord, {});
  assert.deepEqual(plugin.nukedMessageRecord, { [rootId]: [rootId, replyId] });
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

test('deleted-channel capture adopts visible and hidden Deleted/Purged records into Nuked', () => {
  const parentId = '500';
  const threadId = '510';
  const directDeletedId = '501';
  const directPurgedId = '502';
  const threadRootId = threadId;
  const threadReplyId = '511';
  const purgedRootThreadId = '512';
  const purgedRootReplyId = '513';
  const unrelatedId = '520';
  const records = {
    [directDeletedId]: {
      message: { id: directDeletedId, channel_id: parentId },
      delete_data: { hidden: true, time: 1 },
      edit_history: [{ content: 'older edit' }]
    },
    [directPurgedId]: {
      message: { id: directPurgedId, channel_id: parentId },
      delete_data: { hidden: false, time: 2 }
    },
    [threadRootId]: {
      message: { id: threadRootId, channel_id: threadId },
      delete_data: {
        hidden: true,
        forum_thread_delete: true,
        forum_parent_id: parentId,
        forum_metadata: { parentId, threadType: 11 }
      }
    },
    [threadReplyId]: {
      message: { id: threadReplyId, channel_id: threadId },
      delete_data: { hidden: true, location: { channelType: 11, parentId } }
    },
    [purgedRootThreadId]: {
      message: { id: purgedRootThreadId, channel_id: purgedRootThreadId },
      delete_data: {
        hidden: false,
        forum_thread_delete: true,
        forum_parent_id: parentId,
        forum_metadata: { parentId, threadType: 11 }
      }
    },
    [purgedRootReplyId]: {
      message: { id: purgedRootReplyId, channel_id: purgedRootThreadId },
      delete_data: { hidden: false, location: { channelType: 11, parentId } }
    },
    [unrelatedId]: {
      message: { id: unrelatedId, channel_id: 'unrelated-channel' },
      delete_data: { hidden: true },
      // A normal channel may share the deleted category as its parent without being deleted.
      saved_location: { channelType: 0, parentId }
    }
  };
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true },
    messageRecord: records,
    deletedMessageRecord: {
      [parentId]: [directDeletedId],
      [threadId]: [threadRootId],
      'unrelated-channel': [unrelatedId]
    },
    purgedMessageRecord: {
      [parentId]: [directPurgedId],
      [threadId]: [threadReplyId],
      [purgedRootThreadId]: [purgedRootThreadId, purgedRootReplyId]
    },
    nukedMessageRecord: {},
    editedMessageRecord: { [parentId]: [directDeletedId] },
    deletedMessageSet: new Map([
      [parentId, new Set([directDeletedId])],
      [threadId, new Set([threadRootId])],
      ['unrelated-channel', new Set([unrelatedId])]
    ]),
    purgedMessageSet: new Map([
      [parentId, new Set([directPurgedId])],
      [threadId, new Set([threadReplyId])],
      [purgedRootThreadId, new Set([purgedRootThreadId, purgedRootReplyId])]
    ]),
    nukedMessageSet: new Map(),
    editedMessageSet: new Map([[parentId, new Set([directDeletedId])]]),
    sortedDeletedMessageIds: new Map([[parentId, []], [threadId, []]]),
    sortedPurgedMessageIds: new Map([[parentId, []], [threadId, []], [purgedRootThreadId, []]]),
    sortedNukedMessageIds: new Map(),
    tools: {
      getChannel(id) {
        if (id === threadId) return { id, type: 11, parent_id: parentId };
        if (id === purgedRootThreadId) return { id, type: 11, parent_id: parentId };
        return null;
      }
    }
  });

  const captureBatch = { id: 'nuke:500:5000:1', time: 5000 };
  assert.equal(plugin.adoptSavedRecordsForDeletedChannel({ id: parentId }, captureBatch), 6);
  assert.deepEqual(plugin.deletedMessageRecord, { 'unrelated-channel': [unrelatedId] });
  assert.deepEqual(plugin.purgedMessageRecord, {});
  assert.deepEqual(plugin.nukedMessageRecord, {
    [parentId]: [directDeletedId, directPurgedId],
    [threadId]: [threadRootId, threadReplyId],
    [purgedRootThreadId]: [purgedRootThreadId, purgedRootReplyId]
  });
  assert.deepEqual(plugin.editedMessageRecord, {});
  for (const id of [
    directDeletedId,
    directPurgedId,
    threadRootId,
    threadReplyId,
    purgedRootThreadId,
    purgedRootReplyId
  ]) {
    assert.equal(records[id].delete_data.anti_nuke, true);
    assert.equal(records[id].delete_data.anti_nuke_parent_id, parentId);
    assert.equal(records[id].delete_data.capture_batch_id, captureBatch.id);
    assert.equal(records[id].delete_data.capture_batch_time, captureBatch.time);
  }
  assert.equal(records[directDeletedId].delete_data.hidden, true);
  assert.equal(records[threadRootId].delete_data.hidden, true);
  assert.equal(records[threadReplyId].delete_data.hidden, true);
  assert.deepEqual(records[directDeletedId].edit_history, [{ content: 'older edit' }]);
  assert.equal(records[unrelatedId].delete_data.anti_nuke, undefined);
  assert.equal(plugin.nukedMessageSet.get(parentId).has(directDeletedId), true);
  assert.equal(plugin.nukedMessageSet.get(threadId).has(threadReplyId), true);
  assert.equal(plugin.nukedMessageSet.get(purgedRootThreadId).has(purgedRootThreadId), true);
  assert.equal(plugin.nukedMessageSet.get(purgedRootThreadId).has(purgedRootReplyId), true);

  plugin.dispatcher = { dispatch() {} };
  plugin._invalidateAndRecache = () => {};
  plugin.saveData = () => {};
  plugin.scheduleLoggerMenuRefresh = () => {};
  plugin.refreshForumThreadLogModal = () => {};
  plugin.notifyUser = () => {};
  assert.equal(plugin.unhideSavedDeletedRecord(records[directDeletedId]), true);
  assert.equal(records[directDeletedId].delete_data.hidden, false);
  assert.equal(plugin.nukedMessageSet.get(parentId).has(directDeletedId), true);
  assert.equal(plugin.deletedMessageSet.get(parentId)?.has(directDeletedId) || false, false);

  assert.equal(plugin.unhideSavedDeletedRecord(records[threadRootId]), true);
  assert.equal(records[threadRootId].delete_data.hidden, false);
  assert.equal(records[threadReplyId].delete_data.hidden, false);
  assert.equal(plugin.nukedMessageSet.get(threadId).has(threadRootId), true);
  assert.equal(plugin.nukedMessageSet.get(threadId).has(threadReplyId), true);
  assert.equal(plugin.deletedMessageSet.get(threadId)?.size || 0, 0);
});

test('Anti-Nuke adoption ignores Ignore bots gates but never adopts ephemeral records', () => {
  const parentId = '700';
  const humanId = '701';
  const webhookId = '702';
  const ephemeralId = '703';
  const records = {
    [humanId]: {
      message: { id: humanId, channel_id: parentId, flags: 32768, author: { id: 'human', bot: false } },
      delete_data: { time: 1 }
    },
    [webhookId]: {
      message: { id: webhookId, channel_id: parentId, flags: 32768, webhook_id: 'webhook' },
      delete_data: { time: 2 }
    },
    [ephemeralId]: {
      message: { id: ephemeralId, channel_id: parentId, flags: 64 | 32768, application_id: 'application' },
      delete_data: { time: 3 }
    }
  };
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, ignoreBots: true },
    messageRecord: records,
    deletedMessageRecord: { [parentId]: [humanId, webhookId, ephemeralId] },
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet: new Map([[parentId, new Set([humanId, webhookId, ephemeralId])]]),
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    tools: { getChannel: () => null, getUser: () => null }
  });

  assert.equal(plugin.adoptSavedRecordsForDeletedChannel({ id: parentId }), 2);
  assert.deepEqual(plugin.nukedMessageRecord, { [parentId]: [humanId, webhookId] });
  assert.deepEqual(plugin.deletedMessageRecord, { [parentId]: [ephemeralId] });

  plugin.settings.ignoreBots = false;
  assert.equal(plugin.adoptSavedRecordsForDeletedChannel({ id: parentId }), 0);
  assert.deepEqual(plugin.nukedMessageRecord, { [parentId]: [humanId, webhookId] });
  assert.deepEqual(plugin.deletedMessageRecord, { [parentId]: [ephemeralId] });
  assert.equal(records[ephemeralId].delete_data.anti_nuke, undefined);
});

function createDispatchMessagePlugin(overrides = {}) {
  const guild = { id: 'guild', name: 'Guild' };
  const channel = { id: 'channel', guild_id: guild.id, name: 'general', type: 0 };
  const { settings = {}, ...rest } = overrides;
  const plugin = createPlugin({
    settings: {
      restoreDeletedMessages: false,
      showDeletedMessages: false,
      showPurgedMessages: false,
      restoreDeletedAndPurgedMessages: false,
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
      cacheAllImages: true,
      antiNukeThreadCap: 0,
      antiNukeMessageCap: 0,
      antiNukeAttachmentCap: 0,
      ...settings
    },
    localUser: { id: 'local' },
    selectedChannel: { id: 'selected', guild_id: guild.id },
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
    getCachedMessage: () => null,
    _cacheIncomingMessage: () => false,
    _ensureChannelCached() {},
    _shouldShowToast: () => false,
    _notifyEventOnce() {},
    _notifyEvent() {},
    _incrementMessageCount() {},
    annotateSavedForumThreadMessage() {},
    refreshCacheOnlyMessage() {},
    _scheduleTintForMessage() {},
    dispatcher: { dispatch() {} },
    syncMessageUpdatePayload() {},
    isForumThreadChannel: () => false,
    shouldIgnoreMessageAuthor: () => false,
    shouldIgnoreSelfMessage: () => false,
    isAutomatedMessageAuthor: () => false,
    cacheChannelMessages() {},
    isLocalDeleteEvent: () => false,
    _refreshedEmptyChannels: new Set(),
    saveData() {},
    createMiniFormattedData(message) {
      return {
        message: structuredClone(message),
        saved_location: { channelId: message.channel_id },
        local_mentioned: false,
        ghost_pinged: false,
        logged_attachments: [],
        edit_history: []
      };
    },
    ...rest
  });

  return { plugin, channel, guild };
}

test('Anti-Nuke pre-caches the final attachment-only reply after IgnoreSelf skips its optimistic create', () => {
  const cacheCalls = [];
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: true,
      ignoreSelf: true
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({ messageId: message.id, options });
    }
  });
  const message = {
    id: 'ignore-self-message',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    content: 'hello',
    attachments: [{ id: 'a', url: 'https://cdn.example/ignore-self-message.png' }],
    author: { id: 'local', username: 'Local' }
  };
  let nativeCalls = 0;
  const callDefault = () => {
    nativeCalls++;
    return { native: true };
  };
  pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_CREATE', message, optimistic: true }
  ], callDefault);
  const result = pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_CREATE', message, optimistic: false }
  ], callDefault);

  assert.equal(nativeCalls, 2);
  assert.deepEqual(result, { native: true });
  assert.equal(cacheCalls.length, 1);
  assert.deepEqual(cacheCalls[0], {
    messageId: 'ignore-self-message',
    options: { queueWhileNoSave: false, cacheState: 'precache' }
  });
  assert.deepEqual(pluginState.plugin.messageRecord, {}, 'ordinary IgnoreSelf capture remains suppressed');
});

test('Anti-Nuke pre-caches media on ignored MESSAGE_UPDATE events with new attachments', () => {
  const cacheCalls = [];
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: true,
      ignoreSelf: true,
      ignoreLocalEdits: true
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({ messageId: message.id, options });
    }
  });
  const message = {
    id: 'ignored-update-message',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    content: 'updated',
    edited_timestamp: '2026-07-23T00:00:00.000Z',
    attachments: [{ id: 'c', url: 'https://cdn.example/ignored-update-message.png' }],
    author: { id: 'local', username: 'Local' }
  };
  let nativeCalls = 0;
  const result = pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_UPDATE', message }
  ], () => {
    nativeCalls++;
    return { native: true };
  });

  assert.equal(nativeCalls, 1);
  assert.deepEqual(result, { native: true });
  assert.equal(cacheCalls.length, 1);
  assert.deepEqual(cacheCalls[0], {
    messageId: 'ignored-update-message',
    options: { queueWhileNoSave: false, cacheState: 'precache' }
  });
  assert.deepEqual(pluginState.plugin.messageRecord, {}, 'the ignored media update is not logged as edit history');
});

test('Anti-Nuke pre-caches an author-less partial media update without swallowing native dispatch', () => {
  const cacheCalls = [];
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: true
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({
        messageId: message.id,
        attachmentIds: message.attachments.map(attachment => attachment.id),
        options
      });
    }
  });
  const message = {
    id: 'partial-update-message',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    attachments: [{
      id: 'later-partial',
      url: 'https://cdn.example/later-partial.png'
    }]
  };
  let nativeCalls = 0;
  const result = pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_UPDATE', message }
  ], () => {
    nativeCalls++;
    return { native: true };
  });

  assert.equal(nativeCalls, 1);
  assert.deepEqual(result, { native: true });
  assert.deepEqual(cacheCalls, [{
    messageId: 'partial-update-message',
    attachmentIds: ['later-partial'],
    options: { queueWhileNoSave: false, cacheState: 'precache' }
  }]);
  assert.deepEqual(pluginState.plugin.messageRecord, {});
});

test('IgnoreSelf update reconciliation retains its existing single cache path when a prior message exists', () => {
  const cacheCalls = [];
  const previous = {
    id: 'existing-update-message',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    content: 'before',
    attachments: [],
    embeds: [],
    components: [],
    author: { id: 'local', username: 'Local' }
  };
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: true,
      ignoreSelf: true,
      ignoreLocalEdits: true
    },
    getCachedMessage: () => previous,
    syncMessageUpdatePayload(message) {
      this.cacheMessageImages(message, { queueWhileNoSave: false });
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({ messageId: message.id, options });
    }
  });
  const message = {
    ...previous,
    content: 'after',
    edited_timestamp: '2026-07-23T00:00:00.000Z',
    attachments: [{ id: 'later', url: 'https://cdn.example/later.png' }]
  };

  pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_UPDATE', message }
  ], () => ({ native: true }));

  assert.deepEqual(cacheCalls, [{
    messageId: 'existing-update-message',
    options: { queueWhileNoSave: false }
  }]);
});

test('Anti-Nuke still caches MESSAGE_CREATE media only once when message would otherwise be recorded', () => {
  const cacheCalls = [];
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: true,
      ignoreSelf: false
    },
    _cacheIncomingMessage(message) {
      this.messageRecord[message.id] = {
        message: structuredClone(message),
        delete_data: { time: 1, hidden: false }
      };
      return false;
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({ messageId: message.id, options });
    },
    _shouldShowToast: () => false
  });
  const message = {
    id: 'regular-message',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    content: 'normal',
    attachments: [{ id: 'b', url: 'https://cdn.example/regular-message.png' }],
    author: { id: 'remote', username: 'Remote' }
  };
  let nativeCalls = 0;
  pluginState.plugin.onDispatchEvent([{ type: 'MESSAGE_CREATE', message }], () => {
    nativeCalls++;
    return { native: true };
  });

  assert.equal(nativeCalls, 1);
  assert.equal(cacheCalls.length, 1);
  assert.deepEqual(cacheCalls[0], {
    messageId: 'regular-message',
    options: { queueWhileNoSave: false, cacheState: 'precache' }
  });
});

test('Anti-Nuke disabled keeps IgnoreSelf behavior with no media pre-cache', () => {
  const cacheCalls = [];
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: false,
      cacheAllImages: true,
      ignoreSelf: true
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({ messageId: message.id, options });
    }
  });
  const message = {
    id: 'ignore-self-message-no-anti-nuke',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    content: 'hello',
    attachments: [{ id: 'a', url: 'https://cdn.example/ignore-self-no-anti-nuke.png' }],
    author: { id: 'local', username: 'Local' }
  };
  let nativeCalls = 0;
  pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_CREATE', message }
  ], () => {
    nativeCalls++;
    return { native: true };
  });

  assert.equal(nativeCalls, 1);
  assert.equal(cacheCalls.length, 0);
});

test('Anti-Nuke ignored media never writes or queues while no-save is active', () => {
  const cacheCalls = [];
  const queuedRequests = [];
  const pluginState = createDispatchMessagePlugin({
    settings: {
      antiNukeEnabled: true,
      cacheAllImages: true,
      dontSaveData: true,
      ignoreSelf: true
    },
    cacheMessageImages(message, options) {
      cacheCalls.push({ messageId: message.id, options });
      return Object.getPrototypeOf(this).cacheMessageImages.call(this, message, options);
    },
    queuePendingMediaCacheRequest(...args) {
      queuedRequests.push(args);
    }
  });
  const message = {
    id: 'ignored-no-save-message',
    channel_id: 'channel',
    guild_id: 'guild',
    type: 0,
    content: '',
    attachments: [{
      id: 'no-save-attachment',
      url: 'https://cdn.example/ignored-no-save-message.png'
    }],
    author: { id: 'local', username: 'Local' }
  };

  pluginState.plugin.onDispatchEvent([
    { type: 'MESSAGE_CREATE', message }
  ], () => ({ native: true }));

  assert.deepEqual(cacheCalls, [{
    messageId: 'ignored-no-save-message',
    options: { queueWhileNoSave: false, cacheState: 'precache' }
  }]);
  assert.deepEqual(queuedRequests, []);
  assert.deepEqual(pluginState.plugin.messageRecord, {});
});
