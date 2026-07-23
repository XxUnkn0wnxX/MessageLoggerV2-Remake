const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

function successfulMediaResponse(contentType = 'image/png') {
  return {
    ok: true,
    headers: { get: name => name === 'content-type' ? contentType : null },
    arrayBuffer: async () => new Uint8Array([0x4d, 0x4c, 0x56, 0x32]).buffer
  };
}

function createMediaCachePlugin(cacheDir, overrides = {}) {
  return createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      imageCacheDir: cacheDir
    },
    nodeModules: { fs, path },
    imageCacheServerSimulator: {
      resolveNewCachePath: () => cacheDir,
      cleanUp() {}
    },
    cacheDeletionMessageIds: new Set(),
    messageRecord: {},
    cachedMessagesMap: new Map(),
    ...overrides
  });
}

function defer() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function waitForQueuedMediaTasks() {
  return new Promise(resolve => setTimeout(resolve, 10));
}

async function waitForDeferredMediaToSettle(plugin, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (plugin._activeDeferredMediaCacheRequests?.size && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(
    plugin._activeDeferredMediaCacheRequests?.size || 0,
    0,
    'deferred media requests must settle before the test timeout'
  );
}

function pendingMediaRequestCount(plugin) {
  const queue = plugin._pendingMediaCacheRequests;
  assert.ok(queue, 'no-save media requests must be retained in an in-memory queue');
  if (typeof queue.size === 'number') return queue.size;
  assert.equal(typeof queue.length, 'number', 'the pending media queue must expose a count');
  return queue.length;
}

function configureNoSavePrimaryMerge(plugin, writeDataPayloadAtomic) {
  Object.assign(plugin, {
    _needsNoSaveDataMerge: true,
    _noSaveMergeInProgress: false,
    _noSaveMergeDirty: false,
    _archiveDetached: false,
    _pendingNoSavePersistedRemovals: [],
    _dataWriteEpoch: 0,
    _dataSaveMaxAttempts: 1,
    _dataSaveRetryDelayMs: 0,
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    suppressedForumThreadIds: new Set(),
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    cancelPendingDataWrites() { this._dataWriteEpoch++; },
    loadPersistedDataForNoSaveMerge() { return { data: {}, source: 'primary' }; },
    applySavedMessagesCapToPayload: payload => payload,
    mergeDataPayloads: (_persisted, session) => session,
    _getDataPayload() { return {}; },
    cloneDataValue: value => value,
    installDataPayload() {},
    writeDataPayloadAtomic,
    saveSettings() {},
    notifySettingDependencyChange() {},
    reportNoSaveDataError() {}
  });
}

test('text, attachments, embeds, and sticker-only messages are supported payloads', () => {
  const plugin = createPlugin();

  assert.equal(plugin.hasSupportedMessagePayload({ content: 'text' }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ attachments: [{ id: 'a' }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ embeds: [{ title: 'embed' }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ sticker_items: [{ id: 's' }] }), true);
  assert.equal(plugin.hasSupportedMessagePayload({ content: '', attachments: [], embeds: [], sticker_items: [] }), false);
});

test('media cache keys include attachments, embeds, Components V2 media, and stickers without duplicates', () => {
  const plugin = createPlugin();
  const keys = plugin.getMessageMediaCacheKeys({
    attachments: [{ id: 'a' }, { id: 'a' }],
    embeds: [{
      image: { url: 'https://cdn.example/embed-image.png' },
      thumbnail: { url: 'https://cdn.example/embed-thumb.png' },
      author: { iconURL: 'https://cdn.example/author-icon.png' },
      footer: { iconProxyURL: 'https://cdn.example/footer-icon.png' },
      images: [{ url: 'https://cdn.example/gallery-image.png' }]
    }],
    components: [{
      type: 11,
      media: {
        url: 'https://external.example/component.png',
        proxy_url: 'https://cdn.example/component.png'
      }
    }],
    sticker_items: [{ id: 's' }]
  });

  assert.deepEqual(keys, new Set([
    'attachment:a',
    'embed:0:https://cdn.example/embed-image.png',
    'embed:0:thumbnail:https://cdn.example/embed-thumb.png',
    'embed:0:author-icon:https://cdn.example/author-icon.png',
    'embed:0:footer-icon:https://cdn.example/footer-icon.png',
    'embed:0:gallery:0:https://cdn.example/gallery-image.png',
    'component:0:thumbnail:https://cdn.example/component.png',
    'sticker:s'
  ]));
});

test('media cache keys include location identity for moved embed URLs and component media', () => {
  const plugin = createPlugin();
  const shared = 'https://cdn.example/shared.png';
  const sharedComponent = 'https://cdn.example/shared-component.png';
  const messageWithImage = {
    id: 'shared-before',
    attachments: [{ id: 'a' }],
    embeds: [{
      image: { url: shared },
      thumbnail: { url: 'https://cdn.example/thumbnail-before.png' }
    }],
    components: [{ type: 11, media: { url: sharedComponent } }]
  };
  const messageWithThumb = {
    id: 'shared-after',
    attachments: [{ id: 'a' }],
    embeds: [{
      image: { url: 'https://cdn.example/image-after.png' },
      thumbnail: { url: shared }
    }],
    components: [{
      type: 12,
      items: [{ media: { url: sharedComponent } }]
    }]
  };

  const before = plugin.getMessageMediaCacheKeys(messageWithImage);
  const after = plugin.getMessageMediaCacheKeys(messageWithThumb);

  assert.equal(before.has('embed:0:https://cdn.example/shared.png'), true);
  assert.equal(after.has('embed:0:thumbnail:https://cdn.example/shared.png'), true);
  assert.equal(before.has('embed:0:thumbnail:https://cdn.example/shared.png'), false);
  assert.equal(after.has('embed:0:https://cdn.example/shared.png'), false);
  assert.equal(before.has('component:0:thumbnail:https://cdn.example/shared-component.png'), true);
  assert.equal(after.has('component:0:gallery:0:https://cdn.example/shared-component.png'), true);
  assert.equal(before.has('component:0:gallery:0:https://cdn.example/shared-component.png'), false);
  assert.equal(after.has('component:0:thumbnail:https://cdn.example/shared-component.png'), false);
  assert.equal(Array.from(before).filter(key => key.includes('shared-component')).length, 1);
  assert.equal(Array.from(after).filter(key => key.includes('shared-component')).length, 1);
  assert.equal(Array.from(before).filter(key => key.includes('shared.png')).length, 1);
  assert.equal(Array.from(after).filter(key => key.includes('shared.png')).length, 1);
});

test('Components V2 media traversal is stable, proxy-first, and skips attachment-only files', () => {
  const plugin = createPlugin();
  const components = [{
    type: 17,
    components: [
      {
        type: 9,
        accessory: {
          type: 11,
          description: 'App thumbnail',
          media: {
            url: 'https://external.example/thumbnail.png',
            proxyUrl: 'https://cdn.example/thumbnail.png',
            attachmentId: '123'
          }
        }
      },
      {
        type: 12,
        items: [
          { description: 'Gallery item', media: { url: 'https://cdn.example/gallery.png' } },
          { media: { url: 'https://cdn.example/gallery.png' } }
        ]
      },
      { type: 13, name: 'Archive', file: { url: 'attachment://archive.zip' } },
      { type: 13, name: 'Remote file', file: { url: 'https://cdn.example/file.pdf' } }
    ]
  }];

  assert.deepEqual(plugin.getIndexedComponentMedia(components), [
    {
      media: components[0].components[0].accessory.media,
      url: 'https://cdn.example/thumbnail.png',
      sourceId: '123',
      cacheIndex: 'component:0:components:0:accessory:thumbnail',
      label: 'App thumbnail'
    },
    {
      media: components[0].components[1].items[0].media,
      url: 'https://cdn.example/gallery.png',
      sourceId: null,
      cacheIndex: 'component:0:components:1:gallery:0',
      label: 'Gallery item'
    },
    {
      media: components[0].components[3].file,
      url: 'https://cdn.example/file.pdf',
      sourceId: null,
      cacheIndex: 'component:0:components:3:file',
      label: 'Remote file'
    }
  ]);
});

test('has:image detection uses shared embed image traversal for all classic media slots', () => {
  const plugin = createPlugin();
  assert.equal(plugin.hasImageMedia({
    id: 'has-image-embed',
    attachments: [],
    content: '',
    components: [],
    sticker_items: [],
    embeds: [
      {
        image: { url: '' },
        thumbnail: { url: 'https://cdn.example/thumb.png' }
      }
    ]
  }), true);

  assert.equal(plugin.hasImageMedia({
    id: 'has-image-author-icon',
    attachments: [],
    content: '',
    components: [],
    sticker_items: [],
    embeds: [{ author: { iconUrl: 'https://cdn.example/author.png' } }]
  }), true);

  assert.equal(plugin.hasImageMedia({
    id: 'has-image-gallery',
    attachments: [],
    content: '',
    components: [],
    sticker_items: [],
    embeds: [{ images: [{ url: 'https://cdn.example/gallery-item.png' }] }]
  }), true);

  assert.equal(plugin.hasImageMedia({
    id: 'has-image-author-url-false',
    attachments: [],
    content: '',
    components: [],
    sticker_items: [],
    embeds: [{ author: { url: 'https://cdn.example/author-link-only.png' } }]
  }), false);

  assert.equal(plugin.hasImageMedia({
    id: 'has-image-footer-icon',
    attachments: [],
    content: '',
    components: [],
    sticker_items: [],
    embeds: [{ footer: { icon_proxy_url: 'https://cdn.example/footer-icon.png' } }]
  }), true);

  assert.equal(plugin.hasImageMedia({
    id: 'has-image-video-false',
    attachments: [],
    content: '',
    components: [],
    sticker_items: [],
    embeds: [{ video: { url: 'https://cdn.example/video.mp4' } }]
  }), false);
});

test('Components V2 image detection accepts image MIME metadata on extensionless proxy URLs', () => {
  const plugin = createPlugin();

  assert.equal(plugin.isComponentImageMedia({
    url: 'https://media.discordapp.net/external/component',
    media: { contentType: 'image/png' }
  }), true);
  assert.equal(plugin.isComponentImageMedia({
    url: 'https://cdn.example/component.webp',
    media: {}
  }), true);
  assert.equal(plugin.isComponentImageMedia({
    url: 'https://cdn.example/document',
    media: { content_type: 'application/pdf' }
  }), false);
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

test('cache-only rendering sanitizes malformed embed media in an isolated render clone', () => {
  const plugin = createPlugin({ settings: { onlyRenderCachedAttachments: false } });
  const saved = {
    id: 'embed-only',
    channel_id: 'channel',
    content: '',
    attachments: [],
    embeds: [
      {
        type: 'rich',
        title: 'A valid embed shell',
        fields: [{ name: 'Field', value: 'Value', inline: false }],
        image: { url: '', proxy_url: '', width: 10, height: 20 },
        thumbnail: { url: 'https://cdn.example/thumb.png', proxy_url: '', width: 30, height: 40 },
        video: { proxy_url: 'https://cdn.example/video.mp4', width: 50, height: 60 },
        images: [
          { width: 1, height: 2 },
          { proxy_url: 'https://cdn.example/gallery-one.png', width: 70, height: 80 },
          { url: 'https://cdn.example/gallery-two.png', width: 90, height: 100 }
        ]
      },
      {
        title: 'All media entries are malformed',
        image: { width: 1, height: 2 },
        thumbnail: { url: null, proxy_url: '' },
        video: { url: '', proxy_url: undefined },
        images: [{ width: 3, height: 4 }]
      }
    ]
  };
  const canonicalBeforeRender = structuredClone(saved);

  const rendered = plugin.getCacheOnlyMessage(saved);

  assert.notEqual(rendered, saved);
  assert.notEqual(rendered.embeds, saved.embeds);
  assert.notEqual(rendered.embeds[0].thumbnail, saved.embeds[0].thumbnail);
  assert.notEqual(rendered.embeds[0].video, saved.embeds[0].video);
  assert.deepEqual(rendered.embeds, [
    {
      type: 'rich',
      title: 'A valid embed shell',
      fields: [{ name: 'Field', value: 'Value', inline: false }],
      thumbnail: {
        url: 'https://cdn.example/thumb.png',
        proxy_url: 'https://cdn.example/thumb.png',
        width: 30,
        height: 40
      },
      video: {
        url: 'https://cdn.example/video.mp4',
        proxy_url: 'https://cdn.example/video.mp4',
        width: 50,
        height: 60
      },
      images: [
        {
          proxy_url: 'https://cdn.example/gallery-one.png',
          url: 'https://cdn.example/gallery-one.png',
          width: 70,
          height: 80
        },
        {
          url: 'https://cdn.example/gallery-two.png',
          proxy_url: 'https://cdn.example/gallery-two.png',
          width: 90,
          height: 100
        }
      ]
    },
    { title: 'All media entries are malformed' }
  ]);

  rendered.embeds[0].thumbnail.url = 'https://renderer.invalid/thumb.png';
  rendered.embeds[0].video.width = 999;
  rendered.embeds[0].fields[0].value = 'Renderer-only value';
  assert.deepEqual(saved, canonicalBeforeRender);
});

test('media caching skips malformed embed images and uses valid URL or proxy media', async () => {
  const cached = [];
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0
    },
    cacheImage(...args) { cached.push(args); }
  });
  const message = {
    id: 'embed-media-message',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [],
    sticker_items: [],
    embeds: [
      { image: { width: 1, height: 2 } },
      { image: { url: 'https://cdn.example/valid-url/image.png' } },
      {
        thumbnail: { url: 'https://cdn.example/valid-thumb/image.png' },
        author: { icon_url: 'https://cdn.example/author.icon.png' },
        footer: { iconProxyURL: 'https://cdn.example/footer-icon-proxy.png' }
      },
      { image: { proxy_url: 'https://cdn.example/valid-proxy/image.png' } },
      {
        images: [
          { width: 3, height: 4 },
          { proxy_url: 'https://cdn.example/gallery-proxy/image.png' },
          { url: 'https://cdn.example/gallery-url/image.png' }
        ]
      }
    ],
    components: [{
      type: 9,
      accessory: {
        type: 11,
        media: {
          url: 'https://external.example/component-thumbnail.png',
          proxyUrl: 'https://cdn.example/component-thumbnail.png',
          attachmentId: '123456'
        }
      }
    }]
  };

  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();

  assert.deepEqual(cached, [
    ['https://cdn.example/valid-url/image.png', 'embed:1', 'valid-url', message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/valid-thumb/image.png', 'embed:2:thumbnail', 'valid-thumb', message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/author.icon.png', 'embed:2:author-icon', null, message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/footer-icon-proxy.png', 'embed:2:footer-icon', null, message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/valid-proxy/image.png', 'embed:3', 'valid-proxy', message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/gallery-proxy/image.png', 'embed:4:gallery:1', 'gallery-proxy', message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/gallery-url/image.png', 'embed:4:gallery:2', 'gallery-url', message.id, message.channel_id, message.guild_id, 0, 0],
    ['https://cdn.example/component-thumbnail.png', 'component:0:accessory:thumbnail', '123456', message.id, message.channel_id, message.guild_id, 0, 0]
  ]);
});

test('same URL in embed image and thumbnail is queued separately and flushed as distinct cache files', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => successfulMediaResponse();
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-location-queue-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const url = 'https://cdn.example/location-sensitive.png';
  const message = {
    id: 'location-embed-message',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [],
    sticker_items: [],
    embeds: [{ image: { url }, thumbnail: { url } }]
  };
  const plugin = createMediaCachePlugin(cacheDir, {
    __started: true,
    settings: {
      cacheAllImages: true,
      dontSaveData: true,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false
    },
    messageRecord: {
      [message.id]: { message }
    }
  });

  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();

  assert.equal(pendingMediaRequestCount(plugin), 2);
  plugin.settings.dontSaveData = false;
  const started = plugin.flushPendingMediaCacheRequests();

  assert.equal(started, 2);
  await waitForDeferredMediaToSettle(plugin);

  assert.deepEqual(fs.readdirSync(cacheDir).sort(), [
    `${message.id}-embed-0 (${message.id}).png`,
    `${message.id}-embed-0-thumbnail (${message.id}).png`
  ]);
});

test('remote Components V2 files follow the all-attachment-types setting', async () => {
  const cached = [];
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      newSaveAllFileTypes: false,
      maxCacheFileSize: 0
    },
    cacheImage(...args) { cached.push(args); }
  });
  const message = {
    id: 'component-file-policy',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [],
    embeds: [],
    sticker_items: [],
    components: [
      {
        type: 11,
        media: { url: 'https://cdn.example/thumbnail.png' }
      },
      {
        type: 13,
        file: { url: 'https://cdn.example/archive.zip' }
      }
    ]
  };

  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();

  assert.deepEqual(cached.map(args => args.slice(0, 3)), [
    ['https://cdn.example/thumbnail.png', 'component:0:thumbnail', null]
  ]);

  plugin.settings.newSaveAllFileTypes = true;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();

  assert.deepEqual(cached.map(args => args.slice(0, 3)), [
    ['https://cdn.example/thumbnail.png', 'component:0:thumbnail', null],
    ['https://cdn.example/thumbnail.png', 'component:0:thumbnail', null],
    ['https://cdn.example/archive.zip', 'component:1:file', null]
  ]);
});

test('external gallery media uses distinct fallback filenames at the final cache write', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => successfulMediaResponse();
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-gallery-media-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const messageId = '123456789';
  const plugin = createMediaCachePlugin(cacheDir, {
    messageRecord: { [messageId]: { message: { id: messageId, author: { id: 'author' } } } }
  });

  await Promise.all([
    plugin.cacheImage(
      'https://external.example/first/image.png',
      'embed:0:gallery:0',
      'first',
      messageId,
      'channel',
      'guild'
    ),
    plugin.cacheImage(
      'https://external.example/second/image.png',
      'embed:0:gallery:1',
      'second',
      messageId,
      'channel',
      'guild'
    )
  ]);

  assert.deepEqual(fs.readdirSync(cacheDir).sort(), [
    `${messageId}-embed-0-gallery-0 (${messageId}).png`,
    `${messageId}-embed-0-gallery-1 (${messageId}).png`
  ]);
});

test('record media IDs cover messages, attachments, stickers, embeds, and later updates', () => {
  const plugin = createPlugin();
  const record = {
    message: {
      id: 'message',
      attachments: [{ id: 'attachment' }],
      sticker_items: [{ id: 'sticker' }],
      embeds: [{
        image: { url: 'https://cdn.example/embedded-id/image.png' },
        thumbnail: { url: 'https://cdn.example/embedded-id/thumb.png' },
        author: { icon_url: 'https://cdn.example/embedded-id/author.png' },
        footer: { icon_url: 'https://cdn.example/embedded-id/footer.png' },
        images: [{ url: 'https://cdn.example/embedded-id/gallery/cover.png' }]
      }],
      components: [{
        type: 11,
        description: 'Component thumbnail',
        media: { url: 'https://cdn.example/component.png' }
      }]
    },
    logged_attachments: ['later-attachment']
  };

  assert.deepEqual(plugin.getRecordCachedMediaIds(record), new Set([
    'message',
    'attachment',
    'sticker',
    'message-embed-0',
    'message-embed-0-thumbnail',
    'message-embed-0-author-icon',
    'message-embed-0-footer-icon',
    'message-embed-0-gallery-0',
    'message-component-0-thumbnail',
    'later-attachment'
  ]));
  assert.equal(
    plugin.getRecordCachedMediaLabels(record).get('message-component-0-thumbnail'),
    'component.png'
  );
  assert.equal(plugin.getRecordCachedMediaLabels(record).get('message-embed-0'), 'image.png');
  assert.equal(plugin.getRecordCachedMediaLabels(record).get('message-embed-0-thumbnail'), 'thumb.png');
  assert.equal(plugin.getRecordCachedMediaLabels(record).get('message-embed-0-author-icon'), 'author.png');
  assert.equal(plugin.getRecordCachedMediaLabels(record).get('message-embed-0-footer-icon'), 'footer.png');
  assert.equal(plugin.getRecordCachedMediaLabels(record).get('message-embed-0-gallery-0'), 'cover.png');
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

test('no-save queues attachment, embed, sticker, and video media without fetching or creating files in attached and detached modes', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  for (const archiveDetached of [false, true]) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-no-save-media-'));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.rmSync(cacheDir, { force: true, recursive: true });
    let fetches = 0;
    global.fetch = async () => {
      fetches++;
      return successfulMediaResponse();
    };
    const message = {
      id: `message-${archiveDetached}`,
      channel_id: 'channel',
      guild_id: 'guild',
      attachments: [
        { id: 'image', url: 'https://cdn.example/image.png', filename: 'image.png' },
        { id: 'video', url: 'https://cdn.example/video.mp4', filename: 'video.mp4' }
      ],
      embeds: [{
        image: { url: 'https://cdn.example/embed-id/embed.png' },
        thumbnail: { proxy_url: 'https://cdn.example/embed-id/thumb.png' },
        author: { icon_url: 'https://cdn.example/embed-id/author.png' },
        footer: { iconProxyURL: 'https://cdn.example/embed-id/footer.png' }
      }],
      components: [{
        type: 11,
        media: {
          url: 'https://external.example/component.png',
          proxy_url: 'https://cdn.example/component.png'
        }
      }],
      sticker_items: [{ id: 'sticker', name: 'sticker', url: 'https://cdn.example/sticker.png' }]
    };
    const plugin = createMediaCachePlugin(cacheDir, {
      _archiveDetached: archiveDetached,
      settings: {
        cacheAllImages: true,
        dontSaveData: true,
        dontLoadArchivedData: archiveDetached,
        newSaveAllFileTypes: true,
        maxCacheFileSize: 0,
        addUserIdToSavedMediaFilename: false,
        imageCacheDir: cacheDir
      },
      messageRecord: { [message.id]: { message } }
    });

    plugin.cacheMessageImages(message);
    await waitForQueuedMediaTasks();

    assert.equal(fetches, 0, `no-save ${archiveDetached ? 'detached' : 'attached'} mode must not fetch media`);
    assert.equal(fs.existsSync(cacheDir), false, 'no-save media caching must not create the cache directory');
    assert.equal(pendingMediaRequestCount(plugin), 8, 'every eligible logger media location must stay queued in memory');
  }
});

test('same-runtime re-enable waits for the primary save callback and retains queued media after failed or cancelled saves', async t => {
  const originalFetch = global.fetch;
  const originalDocument = global.document;
  t.after(() => {
    global.fetch = originalFetch;
    global.document = originalDocument;
  });
  global.document = { querySelector: () => null };

  for (const [label, callbackArgs, shouldDrain] of [
    ['success', [null, false], true],
    ['failed', [new Error('primary write failed'), false], false],
    ['cancelled', [null, true], false]
  ]) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-runtime-resume-'));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.rmSync(cacheDir, { force: true, recursive: true });
    const messageId = `${label}-runtime-message`;
    const url = `https://cdn.example/${label}-runtime.png`;
    const fetchedUrls = [];
    global.fetch = async fetchedUrl => {
      fetchedUrls.push(fetchedUrl);
      return successfulMediaResponse();
    };
    let primarySaveCallback;
    const plugin = createMediaCachePlugin(cacheDir, {
      _needsNoSaveDataMerge: false,
      _dataSaveMaxAttempts: label === 'success' ? undefined : 1,
      settings: {
        cacheAllImages: true,
        dontSaveData: true,
        dontLoadArchivedData: false,
        newSaveAllFileTypes: true,
        maxCacheFileSize: 0,
        addUserIdToSavedMediaFilename: false,
        autoBackup: false,
        imageCacheDir: cacheDir
      },
      messageRecord: {
        [messageId]: { message: { id: messageId, attachments: [{ id: 30, url }] } }
      },
      suppressedForumThreadIds: new Set(),
      flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
      reportDataSavingResume() {},
      reportNoSaveDataError() {},
      notifyUser() {},
      _getDataPayload() { return {}; },
      saveData() { this.handleDataSaving(false); },
      efficientlySaveData(_name, _key, _data, callback) { primarySaveCallback = callback; }
    });

    await plugin.cacheImage(url, 0, 30, messageId, 'channel', 'guild');
    assert.equal(pendingMediaRequestCount(plugin), 1);
    assert.deepEqual(fetchedUrls, []);

    plugin.settings.dontSaveData = false;
    plugin.handleDataSaveSetting(false);

    assert.equal(typeof primarySaveCallback, 'function', `${label} resume must start a primary save`);
    assert.equal(plugin._flushMediaCacheAfterNextDataSave, true, `${label} resume must retain the queued-drain intent`);
    assert.equal(plugin.isDataSaveModeTransitionBusy(), true, `${label} resume must remain busy until its primary callback`);
    assert.deepEqual(fetchedUrls, [], `${label} resume must not fetch before the primary callback`);
    assert.equal(pendingMediaRequestCount(plugin), 1);

    primarySaveCallback(...callbackArgs);
    await waitForQueuedMediaTasks();

    assert.deepEqual(fetchedUrls, shouldDrain ? [url] : [], `${label} callback must ${shouldDrain ? 'drain' : 'retain'} queued media`);
    assert.equal(pendingMediaRequestCount(plugin), shouldDrain ? 0 : 1);
    assert.equal(fs.existsSync(path.join(cacheDir, `30 (${messageId}).png`)), shouldDrain);
    assert.equal(plugin.settings.dontSaveData, !shouldDrain, `${label} callback must ${shouldDrain ? 'leave saving enabled' : 'fail closed'}`);
    assert.equal(plugin.isDataSaveModeTransitionBusy(), false, `${label} callback must unlock after terminal settlement`);
  }
});

test('a same-runtime primary flush retries three bounded attempts before latching the discard recovery path', async t => {
  const originalDocument = global.document;
  t.after(() => { global.document = originalDocument; });
  global.document = { querySelector: () => null };
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-primary-retry-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const messageId = 'primary-retry-message';
  const url = 'https://cdn.example/primary-retry.png';
  const callbacks = [];
  let persistentErrors = 0;
  const plugin = createMediaCachePlugin(cacheDir, {
    _needsNoSaveDataMerge: false,
    _dataSaveMaxAttempts: 3,
    _dataSaveRetryDelayMs: 0,
    settings: {
      cacheAllImages: true,
      dontSaveData: true,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      autoBackup: false,
      imageCacheDir: cacheDir
    },
    messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 34, url }] } } },
    suppressedForumThreadIds: new Set(),
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    reportDataSavingResume() {},
    notifyDataSaveModeTransitionChange() {},
    notifySettingDependencyChange() {},
    saveSettings() {},
    _getDataPayload() { return {}; },
    saveData() { this.handleDataSaving(false); },
    efficientlySaveData(_name, _key, _data, callback) { callbacks.push(callback); },
    reportNoSaveDataError() { persistentErrors++; }
  });

  await plugin.cacheImage(url, 0, 34, messageId, 'channel', 'guild');
  assert.equal(plugin.requestDataSaveModeChange(false), true);
  assert.equal(callbacks.length, 1);

  for (let attempt = 1; attempt <= 3; attempt++) {
    callbacks[attempt - 1](new Error(`primary attempt ${attempt} failed`));
    if (attempt < 3) {
      await waitForQueuedMediaTasks();
      assert.equal(callbacks.length, attempt + 1, `failed attempt ${attempt} must schedule exactly one retry`);
      assert.equal(plugin.isDataSaveModeTransitionBusy(), true);
    }
  }

  assert.equal(callbacks.length, 3, 'the bounded retry budget must perform exactly three primary attempts');
  assert.equal(plugin._discardNoSaveSessionOnResume, true);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(pendingMediaRequestCount(plugin), 1, 'a failed primary transition must retain queued media');
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
  assert.equal(persistentErrors, 1, 'only the final terminal failure should route the persistent recovery error');
});

test('a tiny primary flush timeout invalidates a never-settling write and releases the save switch', async t => {
  const originalDocument = global.document;
  t.after(() => { global.document = originalDocument; });
  global.document = { querySelector: () => null };
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-primary-timeout-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const messageId = 'primary-timeout-message';
  const url = 'https://cdn.example/primary-timeout.png';
  let primaryCallback;
  let cancelledWrites = 0;
  let persistentErrors = 0;
  const plugin = createMediaCachePlugin(cacheDir, {
    _needsNoSaveDataMerge: false,
    _dataSaveTransitionTimeoutMs: 1,
    settings: {
      cacheAllImages: true,
      dontSaveData: true,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      autoBackup: false,
      imageCacheDir: cacheDir
    },
    messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 35, url }] } } },
    suppressedForumThreadIds: new Set(),
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    reportDataSavingResume() {},
    notifyDataSaveModeTransitionChange() {},
    notifySettingDependencyChange() {},
    saveSettings() {},
    _getDataPayload() { return {}; },
    saveData() { this.handleDataSaving(false); },
    efficientlySaveData(_name, _key, _data, callback) { primaryCallback = callback; },
    cancelPendingDataWrites() { cancelledWrites++; },
    reportNoSaveDataError() { persistentErrors++; }
  });

  await plugin.cacheImage(url, 0, 35, messageId, 'channel', 'guild');
  assert.equal(plugin.requestDataSaveModeChange(false), true);
  assert.equal(typeof primaryCallback, 'function');
  assert.equal(plugin.isDataSaveModeTransitionBusy(), true);

  await waitForQueuedMediaTasks();
  assert.equal(cancelledWrites, 1);
  assert.equal(plugin._discardNoSaveSessionOnResume, true);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
  assert.equal(pendingMediaRequestCount(plugin), 1);
  assert.equal(persistentErrors, 1);

  primaryCallback(null, false);
  assert.equal(plugin.settings.dontSaveData, true, 'a late callback must not revive a timed-out transition');
  assert.equal(pendingMediaRequestCount(plugin), 1);
});

test('deferred media retries exactly three bounded attempts without latching the no-save session', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-retry-exhausted-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const messageId = 'media-retry-message';
  const url = 'https://cdn.example/media-retry.png';
  let fetches = 0;
  const mediaErrors = [];
  global.fetch = async () => {
    fetches++;
    return { ok: false, status: 500, headers: { get: () => null } };
  };
  const plugin = createMediaCachePlugin(cacheDir, {
    _mediaCacheRetryDelayMs: 0,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      imageCacheDir: cacheDir
    },
    messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 36, url }] } } },
    notifyDataSaveModeTransitionChange() {},
    notifyUser(message, options) { mediaErrors.push({ message, options }); }
  });
  plugin.queuePendingMediaCacheRequest(url, 0, 36, messageId, 'channel', 'guild');

  assert.equal(plugin.flushPendingMediaCacheRequests(), 1);
  await waitForQueuedMediaTasks();

  assert.equal(fetches, 3);
  assert.equal(mediaErrors.length, 1, 'only terminal media exhaustion should route the media error');
  assert.equal(plugin._activeDeferredMediaCacheRequests.size, 0);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
  assert.equal(plugin._discardNoSaveSessionOnResume, false, 'a media failure must not discard the whole no-save session');
  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(fs.existsSync(path.join(cacheDir, `36 (${messageId}).png`)), false);
});

test('a timed-out deferred media request releases the switch and reports only that media failure', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-timeout-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const messageId = 'media-timeout-message';
  const url = 'https://cdn.example/media-timeout.png';
  let fetches = 0;
  const mediaErrors = [];
  global.fetch = () => {
    fetches++;
    return new Promise(() => {});
  };
  const plugin = createMediaCachePlugin(cacheDir, {
    _mediaCacheFetchTimeoutMs: 1,
    _mediaCacheRetryDelayMs: 0,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      imageCacheDir: cacheDir
    },
    messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 37, url }] } } },
    notifyDataSaveModeTransitionChange() {},
    notifyUser(message, options) { mediaErrors.push({ message, options }); }
  });
  plugin.queuePendingMediaCacheRequest(url, 0, 37, messageId, 'channel', 'guild');

  assert.equal(plugin.flushPendingMediaCacheRequests(), 1);
  await waitForDeferredMediaToSettle(plugin);

  assert.equal(fetches, 3);
  assert.equal(mediaErrors.length, 1);
  assert.equal(mediaErrors[0].options.type, 'error');
  assert.equal(plugin._activeDeferredMediaCacheRequests.size, 0);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
  assert.equal(plugin._discardNoSaveSessionOnResume, false);
  assert.equal(fs.existsSync(cacheDir), false);
});

test('same-runtime resume serializes the primary callback and stays busy until deferred media settles', async t => {
  const originalFetch = global.fetch;
  const originalDocument = global.document;
  t.after(() => {
    global.fetch = originalFetch;
    global.document = originalDocument;
  });
  global.document = { querySelector: () => null };
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-transition-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const messageId = 'serialized-resume-message';
  const url = 'https://cdn.example/serialized-resume.png';
  const response = defer();
  const fetchedUrls = [];
  global.fetch = async fetchedUrl => {
    fetchedUrls.push(fetchedUrl);
    return response.promise;
  };
  let primarySaveCallback;
  let primaryWrites = 0;
  const plugin = createMediaCachePlugin(cacheDir, {
    _needsNoSaveDataMerge: false,
    settings: {
      cacheAllImages: true,
      dontSaveData: true,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      autoBackup: false,
      imageCacheDir: cacheDir
    },
    messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 31, url }] } } },
    suppressedForumThreadIds: new Set(),
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    reportDataSavingResume() {},
    notifyDataSaveModeTransitionChange() {},
    notifySettingDependencyChange() {},
    saveSettings() {},
    _getDataPayload() { return {}; },
    saveData() { this.handleDataSaving(false); },
    efficientlySaveData(_name, _key, _data, callback) {
      primaryWrites++;
      primarySaveCallback = callback;
    }
  });

  await plugin.cacheImage(url, 0, 31, messageId, 'channel', 'guild');
  assert.equal(pendingMediaRequestCount(plugin), 1);

  assert.equal(plugin.requestDataSaveModeChange(false), true);
  assert.equal(primaryWrites, 1);
  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), true);
  assert.equal(plugin.requestDataSaveModeChange(true), false, 'a second request must be rejected while the primary save is pending');
  assert.equal(plugin.settings.dontSaveData, false, 'the rejected request must not change the accepted setting');
  assert.equal(primaryWrites, 1, 'the rejected request must not start a second primary write');

  primarySaveCallback(null, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fetchedUrls, [url]);
  assert.equal(plugin._activeDeferredMediaCacheRequests.size, 1);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), true, 'active deferred media keeps the transition busy after primary success');

  response.resolve(successfulMediaResponse());
  await waitForQueuedMediaTasks();
  assert.equal(fs.existsSync(path.join(cacheDir, `31 (${messageId}).png`)), true);
  assert.equal(plugin._activeDeferredMediaCacheRequests.size, 0);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
});

test('a stale primary callback generation cannot unlock a newer data-save transition', () => {
  const plugin = createPlugin({
    __started: true,
    settings: { dontSaveData: false },
    notifyDataSaveModeTransitionChange() {},
    saveSettings() {}
  });

  const staleGeneration = plugin.beginDataSavePrimaryFlush();
  const currentGeneration = plugin.beginDataSavePrimaryFlush();

  assert.notEqual(currentGeneration, staleGeneration);
  assert.equal(plugin.finishDataSavePrimaryFlush(staleGeneration, true), false);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), true, 'a stale callback must leave the newer transition locked');
  assert.equal(plugin.finishDataSavePrimaryFlush(currentGeneration, true), true);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
});

test('an active deferred media request remains tracked until its pending retry settles', async t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-retry-active-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const messageId = 'retry-message';
  const url = 'https://cdn.example/retry.png';
  const retrySettlement = defer();
  let retriesStarted = 0;
  const plugin = createMediaCachePlugin(cacheDir, {
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      imageCacheDir: cacheDir
    },
    messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 32, url }] } } },
    notifyDataSaveModeTransitionChange() {},
    async cacheImage() {
      retriesStarted++;
      await retrySettlement.promise;
    }
  });
  plugin.queuePendingMediaCacheRequest(url, 0, 32, messageId, 'channel', 'guild');

  assert.equal(plugin.flushPendingMediaCacheRequests(), 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retriesStarted, 1, 'the queued retry work must have started');
  assert.equal(plugin._activeDeferredMediaCacheRequests.size, 1);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), true);

  retrySettlement.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(plugin._activeDeferredMediaCacheRequests.size, 0);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
});

test('cache-off and stop abort active deferred media without allowing a late response to write', async t => {
  const originalFetch = global.fetch;
  const originalDocument = global.document;
  t.after(() => {
    global.fetch = originalFetch;
    global.document = originalDocument;
  });
  global.document = { querySelector: () => null, removeEventListener() {} };

  for (const action of ['cache-off', 'stop']) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-active-abort-'));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.rmSync(cacheDir, { force: true, recursive: true });
    const messageId = `${action}-active-message`;
    const url = `https://cdn.example/${action}-active.png`;
    const response = defer();
    let signal;
    global.fetch = async (_url, options) => {
      signal = options?.signal;
      return response.promise;
    };
    const plugin = createMediaCachePlugin(cacheDir, {
      settings: {
        cacheAllImages: true,
        dontSaveData: false,
        newSaveAllFileTypes: true,
        maxCacheFileSize: 0,
        addUserIdToSavedMediaFilename: false,
        imageCacheDir: cacheDir
      },
      messageRecord: { [messageId]: { message: { id: messageId, attachments: [{ id: 33, url }] } } },
      unpatches: [],
      handleDataSaving() {},
      removeOpenLogsButton() {},
      _clearNativeNotificationQueue() {},
      forceUpdateUI() {},
      reportMajorSettingChange() {},
      notifyDataSaveModeTransitionChange() {}
    });
    plugin.queuePendingMediaCacheRequest(url, 0, 33, messageId, 'channel', 'guild');
    plugin.flushPendingMediaCacheRequests();
    await waitForQueuedMediaTasks();
    assert.equal(plugin._activeDeferredMediaCacheRequests.size, 1);
    assert.equal(signal?.aborted, false);

    if (action === 'cache-off') {
      plugin.settings.cacheAllImages = false;
      plugin.handleMediaCachingSetting(false);
    } else {
      plugin.stop();
    }
    assert.equal(signal?.aborted, true, `${action} must abort the active fetch`);
    assert.equal(plugin._activeDeferredMediaCacheRequests.size, 0, `${action} must clear active state`);

    response.resolve(successfulMediaResponse());
    await waitForQueuedMediaTasks();
    assert.equal(fs.existsSync(path.join(cacheDir, `33 (${messageId}).png`)), false, `${action} must prevent a late write`);
  }
});

test('failed or cancelled no-save primary recovery leaves queued media untouched and unfetched', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  for (const [label, primaryResult] of [
    ['failed', { ok: false, error: new Error('primary write failed') }],
    ['cancelled', { cancelled: true }]
  ]) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-recovery-'));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.rmSync(cacheDir, { force: true, recursive: true });
    let fetches = 0;
    global.fetch = async () => {
      fetches++;
      return successfulMediaResponse();
    };
    const messageId = `${label}-message`;
    const plugin = createMediaCachePlugin(cacheDir, {
      settings: {
        cacheAllImages: true,
        dontSaveData: true,
        dontLoadArchivedData: false,
        newSaveAllFileTypes: true,
        maxCacheFileSize: 0,
        addUserIdToSavedMediaFilename: false,
        autoBackup: false,
        imageCacheDir: cacheDir
      },
      messageRecord: {
        [messageId]: {
          message: { id: messageId, attachments: [{ id: 10, url: `https://cdn.example/${label}.png` }] }
        }
      }
    });
    configureNoSavePrimaryMerge(plugin, async () => primaryResult);

    await plugin.cacheImage(`https://cdn.example/${label}.png`, 0, 10, messageId, 'channel', 'guild');
    const queuedBeforeRecovery = pendingMediaRequestCount(plugin);
    assert.equal(fetches, 0);

    assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false, `${label} recovery must fail closed`);
    await waitForQueuedMediaTasks();

    assert.equal(fetches, 0, `${label} recovery must not download queued media`);
    assert.equal(pendingMediaRequestCount(plugin), queuedBeforeRecovery, `${label} recovery must retain the queue`);
    assert.equal(fs.existsSync(cacheDir), false, `${label} recovery must not create the cache directory`);
  }
});

test('successful no-save primary recovery drains only queue entries whose session records remain canonical', async t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-recovery-success-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const fetchedUrls = [];
  global.fetch = async url => {
    fetchedUrls.push(url);
    return successfulMediaResponse();
  };
  const keepId = 'keep-message';
  const staleId = 'stale-message';
  const plugin = createMediaCachePlugin(cacheDir, {
    settings: {
      cacheAllImages: true,
      dontSaveData: true,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      autoBackup: false,
      imageCacheDir: cacheDir
    },
    messageRecord: {
      [keepId]: { message: { id: keepId, attachments: [{ id: 11, url: 'https://cdn.example/keep.png' }] } },
      [staleId]: { message: { id: staleId, attachments: [{ id: 12, url: 'https://cdn.example/stale.png' }] } }
    }
  });
  const primaryWrite = defer();
  configureNoSavePrimaryMerge(plugin, async () => primaryWrite.promise);

  await plugin.cacheImage('https://cdn.example/keep.png', 0, 11, keepId, 'channel', 'guild');
  await plugin.cacheImage('https://cdn.example/stale.png', 0, 12, staleId, 'channel', 'guild');
  assert.equal(fetchedUrls.length, 0);
  assert.equal(pendingMediaRequestCount(plugin), 2);

  delete plugin.messageRecord[staleId];
  const recovery = plugin.mergeNoSaveSessionIntoPersistedData();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetchedUrls.length, 0, 'the queue must wait for the primary archive save to succeed');

  primaryWrite.resolve({ ok: true });
  assert.equal(await recovery, true);
  await waitForQueuedMediaTasks();

  assert.deepEqual(fetchedUrls, ['https://cdn.example/keep.png']);
  assert.equal(fs.existsSync(path.join(cacheDir, `11 (${keepId}).png`)), true);
  assert.equal(fs.existsSync(path.join(cacheDir, `12 (${staleId}).png`)), false);
  assert.equal(pendingMediaRequestCount(plugin), 0, 'a successful recovery must drain processed and stale entries');
});

test('stopping or disabling media caching discards deferred no-save media requests', async t => {
  const originalDocument = global.document;
  t.after(() => { global.document = originalDocument; });
  global.document = { querySelector: () => null, removeEventListener() {} };

  for (const action of ['stop', 'cache-off']) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-discard-'));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    fs.rmSync(cacheDir, { force: true, recursive: true });
    const plugin = createMediaCachePlugin(cacheDir, {
      settings: {
        cacheAllImages: true,
        dontSaveData: true,
        dontLoadArchivedData: false,
        newSaveAllFileTypes: true,
        maxCacheFileSize: 0,
        addUserIdToSavedMediaFilename: false,
        imageCacheDir: cacheDir
      },
      unpatches: [],
      handleDataSaving() {},
      removeOpenLogsButton() {},
      _clearNativeNotificationQueue() {},
      forceUpdateUI() {},
      reportMajorSettingChange() {}
    });

    const messageId = `${action}-message`;
    plugin.messageRecord[messageId] = {
      message: { id: messageId, attachments: [{ id: 20, url: `https://cdn.example/${action}.png` }] }
    };
    await plugin.cacheImage(`https://cdn.example/${action}.png`, 0, 20, messageId, 'channel', 'guild');
    assert.equal(pendingMediaRequestCount(plugin), 1);

    if (action === 'stop') plugin.stop();
    else {
      plugin.settings.cacheAllImages = false;
      plugin.handleMediaCachingSetting(false);
    }

    assert.equal(pendingMediaRequestCount(plugin), 0, `${action} must discard queued no-save media`);
    assert.equal(fs.existsSync(cacheDir), false);
  }
});

test('a pre-disable media fetch cannot write after saving is re-enabled, while a fresh request can', async t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-epoch-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const pendingResponse = defer();
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    return pendingResponse.promise;
  };
  const plugin = createMediaCachePlugin(cacheDir, {
    _needsNoSaveDataMerge: false,
    cancelPendingDataWrites() {},
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    reportDataSavingDisabled() {},
    reportDataSavingResume() {},
    saveData() {},
    saveBackup() {}
  });

  const staleWrite = plugin.cacheImage(
    'https://cdn.example/stale.png', 0, 1, 'message', 'channel', 'guild'
  );
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetches, 1);

  plugin.settings.dontSaveData = true;
  plugin.handleDataSaveSetting(true);
  plugin.settings.dontSaveData = false;
  plugin.handleDataSaveSetting(false);
  pendingResponse.resolve(successfulMediaResponse());
  await staleWrite;

  assert.equal(fs.existsSync(path.join(cacheDir, '1 (message).png')), false);

  global.fetch = async () => successfulMediaResponse();
  await plugin.cacheImage('https://cdn.example/fresh.png', 0, 2, 'message', 'channel', 'guild');
  assert.equal(fs.existsSync(path.join(cacheDir, '2 (message).png')), true);
  plugin.finishDataSavePrimaryFlush(plugin._dataSavePrimaryFlushGeneration, true);
});

test('plugin stop invalidates an in-flight media write across a same-instance restart', async t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-stop-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  const originalDocument = global.document;
  t.after(() => {
    global.fetch = originalFetch;
    global.document = originalDocument;
  });
  fs.rmSync(cacheDir, { force: true, recursive: true });
  const pendingResponse = defer();
  global.fetch = async () => pendingResponse.promise;
  global.document = { querySelector: () => null, removeEventListener() {} };
  const plugin = createMediaCachePlugin(cacheDir, {
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      dontLoadArchivedData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      imageCacheDir: cacheDir
    },
    unpatches: [],
    handleDataSaving() {},
    removeOpenLogsButton() {},
    _clearNativeNotificationQueue() {},
    forceUpdateUI() {}
  });

  const staleWrite = plugin.cacheImage(
    'https://cdn.example/restarted.png', 0, 3, 'message', 'channel', 'guild'
  );
  await new Promise(resolve => setImmediate(resolve));
  plugin.stop();
  plugin.__started = true;
  pendingResponse.resolve(successfulMediaResponse());
  await staleWrite;

  assert.equal(fs.existsSync(path.join(cacheDir, '3 (message).png')), false);
});

test('removing a record deletes only its related cached files', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-test-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const record = {
    message: {
      id: '200',
      channel_id: 'channel',
      attachments: [{ id: 'attachment', filename: 'image.png' }],
      embeds: [{
        image: { url: 'https://cdn.example/embed-id/image.png' },
        thumbnail: { url: 'https://cdn.example/embed-id/thumb.png' },
        author: { icon_url: 'https://cdn.example/embed-id/author.png' },
        footer: { icon_proxy_url: 'https://cdn.example/embed-id/footer.png' },
        images: [{ url: 'https://cdn.example/embed-id/gallery-1.png' }]
      }],
      components: [{ type: 11, media: { url: 'https://cdn.example/component.png' } }]
    }
  };
  const recordMediaFileIds = plugin => {
    const files = ['attachment'];
    for (const { sourceId, cacheIndex } of plugin.getIndexedEmbedImageMedia(record.message.embeds[0], 0)) {
      files.push(plugin.getMediaCacheFileId(sourceId, cacheIndex, record.message.id));
    }
    for (const { sourceId, cacheIndex } of plugin.getIndexedComponentMedia(record.message.components)) {
      files.push(plugin.getMediaCacheFileId(sourceId, cacheIndex, record.message.id));
    }
    return files;
  };
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

  for (const file of recordMediaFileIds(plugin)) {
    fs.writeFileSync(path.join(cacheDir, `${file} (200).png`), 'current');
  }
  fs.writeFileSync(path.join(cacheDir, 'attachment.png'), 'legacy');
  fs.writeFileSync(path.join(cacheDir, 'unrelated (999).png'), 'keep');

  assert.equal(plugin.deleteCachedFilesForRecord(record), recordMediaFileIds(plugin).length + 1);
  assert.equal(fs.existsSync(path.join(cacheDir, 'attachment.png')), false);
  assert.equal(fs.existsSync(path.join(cacheDir, 'attachment (200).png')), false);
  assert.equal(fs.existsSync(path.join(cacheDir, `${plugin.getMediaCacheFileId('embed-id', 'embed:0', '200')} (200).png`)), false);
  assert.equal(fs.existsSync(path.join(cacheDir, `${plugin.getMediaCacheFileId('embed-id', 'embed:0:thumbnail', '200')} (200).png`)), false);
  assert.equal(fs.existsSync(path.join(cacheDir, `${plugin.getMediaCacheFileId('embed-id', 'embed:0:author-icon', '200')} (200).png`)), false);
  assert.equal(fs.existsSync(path.join(cacheDir, `${plugin.getMediaCacheFileId('embed-id', 'embed:0:footer-icon', '200')} (200).png`)), false);
  assert.equal(fs.existsSync(path.join(cacheDir, `${plugin.getMediaCacheFileId('embed-id', 'embed:0:gallery:0', '200')} (200).png`)), false);
  const componentCacheIndex = plugin.getIndexedComponentMedia(record.message.components)[0].cacheIndex;
  assert.equal(fs.existsSync(path.join(cacheDir, `${plugin.getMediaCacheFileId('component-id', componentCacheIndex, '200')} (200).png`)), false);
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
