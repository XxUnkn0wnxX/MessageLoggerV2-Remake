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
