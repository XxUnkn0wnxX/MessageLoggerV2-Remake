const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

test('text, attachments, embeds, and sticker-only messages are supported payloads', () => {
  const plugin = createPlugin();

  assert.equal(plugin.hasSupportedMessagePayload({ content: 'text' }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ attachments: [{ id: 'a' }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ embeds: [{ title: 'embed' }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ sticker_items: [{ id: 's' }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ content: '', attachments: [], embeds: [], sticker_items: [] }), false);
});

test('media cache keys include attachments, embed images, and stickers without duplicates', () => {
  const plugin = createPlugin();
  const keys = plugin.getMessageMediaCacheKeys({
    attachments: [{ id: 'a' }, { id: 'a' }],
    embeds: [{ image: { url: 'https://cdn.example/embed.png' } }],
    sticker_items: [{ id: 's' }]
  });

  assert.deepEqual(keys, new Set([
    'attachment:a',
    'embed:https://cdn.example/embed.png',
    'sticker:s'
  ]));
});

test('cache-only rendering preserves cached files and names unavailable files', () => {
  const plugin = createPlugin({
    settings: { onlyRenderCachedAttachments: true },
    imageCacheServerSimulator: { exists: id => id === 'cached' }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: 'cached', filename: 'kept.png' },
      { id: 'missing', filename: 'too-large.png' }
    ]
  };

  const filtered = plugin.getCacheOnlyMessage(message);

  assert.deepEqual(filtered.attachments, [{ id: 'cached', filename: 'kept.png' }]);
  assert.equal(filtered.content, 'body\n[Attachment not cached: too-large.png]');
  assert.equal(message.attachments.length, 2);
});

test('rendered message copies cannot mutate canonical saved records', () => {
  const plugin = createPlugin({ settings: { onlyRenderCachedAttachments: false } });
  const saved = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [],
    author: { id: 'user', username: 'User', public_flags: 128 }
  };

  const rendered = plugin.getCacheOnlyMessage(saved);
  rendered.author.publicFlags = 128;
  delete rendered.author.public_flags;
  rendered.content = 'renderer mutation';

  assert.notEqual(rendered, saved);
  assert.deepEqual(saved.author, { id: 'user', username: 'User', public_flags: 128 });
  assert.equal(saved.content, 'body');
});

test('record media IDs cover messages, attachments, stickers, embeds, and later updates', () => {
  const plugin = createPlugin();
  const record = {
    message: {
      id: 'message',
      attachments: [{ id: 'attachment' }],
      sticker_items: [{ id: 'sticker' }],
      embeds: [{ image: { url: 'https://cdn.example/embedded-id/image.png' } }]
    },
    logged_attachments: ['later-attachment']
  };

  assert.deepEqual(plugin.getRecordCachedMediaIds(record), new Set([
    'message',
    'attachment',
    'sticker',
    'embedded-id',
    'later-attachment'
  ]));
});

test('folded thread roots retain the original starter cache identity', () => {
  const plugin = createPlugin();
  const record = {
    message: { id: 'thread', attachments: [{ id: 'attachment' }], embeds: [] },
    delete_data: {
      forum_thread_delete: true,
      forum_metadata: {
        starterMessageId: 'starter',
        starterFoldedIntoRoot: true
      }
    }
  };

  assert.deepEqual(plugin.getRecordCacheSourceMessageIds(record), new Set(['thread', 'starter']));
  assert.deepEqual(plugin.getRecordCachedMediaIds(record), new Set(['thread', 'starter', 'attachment']));
});

test('sticker media keeps common image formats and rejects unsupported formats', () => {
  const plugin = createPlugin();

  assert.equal(plugin.getStickerMedia({ id: '1', name: 'wave', url: 'https://cdn.example/wave.gif' }).filename, 'wave.gif');
  assert.equal(plugin.getStickerMedia({ id: '2', name: 'static', format_type: 1 }).filename, 'static.png');
  assert.equal(plugin.getStickerMedia({ id: '3', name: 'vector', url: 'https://cdn.example/vector.json' }), null);
});

test('removing a record deletes only its related cached files', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-test-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const record = {
    message: {
      id: '200',
      channel_id: 'channel',
      attachments: [{ id: 'attachment', filename: 'image.png' }]
    }
  };
  fs.writeFileSync(path.join(cacheDir, 'attachment.png'), 'legacy');
  fs.writeFileSync(path.join(cacheDir, 'attachment (200).png'), 'current');
  fs.writeFileSync(path.join(cacheDir, 'unrelated (999).png'), 'keep');
  const plugin = createPlugin({
    messageRecord: { 200: record },
    settings: { imageCacheDir: cacheDir },
    nodeModules: { fs, path },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => cacheDir,
      cached: {}
    },
    cacheDeletionMessageIds: new Set(),
    queueCachedFilesDeletedToast() {}
  });

  assert.equal(plugin.deleteCachedFilesForRecord(record), 2);
  assert.equal(fs.existsSync(path.join(cacheDir, 'attachment.png')), false);
  assert.equal(fs.existsSync(path.join(cacheDir, 'attachment (200).png')), false);
  assert.equal(fs.existsSync(path.join(cacheDir, 'unrelated (999).png')), true);
});

test('removing a folded thread root deletes media cached under its original starter ID', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-folded-media-test-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const record = {
    message: {
      id: '400',
      channel_id: '400',
      attachments: [{ id: 'attachment', filename: 'image.png' }]
    },
    delete_data: {
      forum_thread_delete: true,
      forum_metadata: {
        starterMessageId: '401',
        starterFoldedIntoRoot: true
      }
    }
  };
  fs.writeFileSync(path.join(cacheDir, 'attachment (401).png'), 'folded starter');
  fs.writeFileSync(path.join(cacheDir, 'unrelated (999).png'), 'keep');
  const plugin = createPlugin({
    messageRecord: { 400: record },
    settings: { imageCacheDir: cacheDir },
    nodeModules: { fs, path },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => cacheDir,
      cached: {}
    },
    cacheDeletionMessageIds: new Set(),
    queueCachedFilesDeletedToast() {}
  });

  assert.equal(plugin.deleteCachedFilesForRecord(record), 1);
  assert.equal(fs.existsSync(path.join(cacheDir, 'attachment (401).png')), false);
  assert.equal(fs.existsSync(path.join(cacheDir, 'unrelated (999).png')), true);
});
