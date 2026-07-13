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
