const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPlugin, loggerEvents, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(() => resetHarness());

function createCachePlugin(cacheDir, overrides = {}) {
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
      _getBaseCachePath: () => cacheDir,
      resolveNewCachePath: () => cacheDir,
      cleanUp() {}
    },
    cacheDeletionMessageIds: new Set(),
    messageRecord: {},
    cachedMessagesMap: new Map(),
    _mediaCacheMaxAttempts: 3,
    _mediaCacheRetryDelayMs: 0,
    ...overrides
  });
}

function response({ ok, status, bytes = [0x4d, 0x4c, 0x56, 0x32], contentType = 'image/png' }) {
  let releases = 0;
  return {
    ok,
    status,
    headers: { get: name => name === 'content-type' ? contentType : null },
    async arrayBuffer() { return Uint8Array.from(bytes).buffer; },
    async release() { releases++; },
    get releases() { return releases; }
  };
}

test('null-source embed and component media cache under their existing stable IDs and bytes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-null-source-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheDir = path.join(root, 'cache');
  const messageId = 'source-less-message';
  const payload = [0x00, 0x4d, 0x4c, 0x32, 0xff];
  const requests = [];
  const plugin = createCachePlugin(cacheDir, {
    async fetchMediaCacheResponse(url) {
      requests.push(url);
      return response({ ok: true, status: 200, bytes: payload });
    }
  });

  const media = [
    { index: 'embed:0', url: 'https://cdn.example/embed.png' },
    { index: 'component:0:thumbnail', url: 'https://cdn.example/component.png' }
  ];
  for (const item of media) {
    await plugin.cacheImage(item.url, item.index, null, messageId, 'channel', 'guild', 0, 0, 'precache');
    const cacheId = plugin.getMediaCacheFileId(null, item.index, messageId);
    const filePath = path.join(`${cacheDir}_PreCache`, messageId, `${cacheId} (${messageId}).png`);
    assert.deepEqual(fs.readFileSync(filePath), Buffer.from(payload));
  }

  assert.deepEqual(requests, media.map(item => item.url));
  assert.deepEqual(loggerEvents.filter(event => event[0] === 'warn' || event[0] === 'error'), []);
  assert.equal(plugin.getMediaCacheFileId('12345', 'embed:0', messageId), '12345');
});

test('terminal cache failures report the stable cache ID and keep 403 terminal', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-cache-warning-id-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheDir = path.join(root, 'cache');
  const notifications = [];
  const counters = { requests: 0, writes: 0, mkdir: 0 };
  const spyFs = Object.create(fs);
  spyFs.writeFileSync = (...args) => { counters.writes++; return fs.writeFileSync(...args); };
  spyFs.mkdirSync = (...args) => { counters.mkdir++; return fs.mkdirSync(...args); };
  const deferredFailures = [];
  const plugin = createCachePlugin(cacheDir, {
    nodeModules: { fs: spyFs, path },
    _mediaCacheMaxAttempts: 1,
    isDeferredMediaCacheRequestActive: () => true,
    notifyUser(...args) { notifications.push(args); },
    async fetchMediaCacheResponse() {
      counters.requests++;
      return response({ ok: false, status: 403 });
    }
  });
  const originalReport = plugin.reportDeferredMediaCacheFailure;
  plugin.reportDeferredMediaCacheFailure = function(...args) {
    deferredFailures.push(args);
    return originalReport.apply(this, args);
  };

  await plugin.cacheImage('https://cdn.example/embed.png', 'embed:0', null, 'warning-message', 'channel', 'guild', 0, 0, 'precache');
  await plugin.cacheImage('https://cdn.example/attachment.png', 0, '12345', 'warning-message', 'channel', 'guild', 0, 0, 'precache');
  await plugin.cacheImage('https://cdn.example/clip.mp4', 1, '67890', 'warning-message', 'channel', 'guild', 0, 0, 'precache');

  const ids = ['warning-message-embed-0', '12345', '67890'];
  assert.equal(counters.requests, 3, 'each terminal 403 makes one request and starts no retry');
  assert.equal(counters.writes, 0, '403 responses are never written');
  assert.equal(counters.mkdir, 0, '403 responses do not create cache directories');
  assert.deepEqual(loggerEvents.filter(event => event[0] === 'warn').map(event => event[1]), [
    `Image ${ids[0]} unavailable (403), skipping cache`,
    `Image ${ids[1]} unavailable (403), skipping cache`,
    `Video ${ids[2]} unavailable (403), skipping cache`
  ]);
  assert.deepEqual(loggerEvents.filter(event => event[0] === 'error').map(event => event[1]), ids.map(id => `Deferred media cache request ${id} could not be completed.`));
  assert.deepEqual(deferredFailures.map(args => args[2]), ids);
  assert.equal(notifications.length, 3);
  assert.equal(notifications[0][0], 'Saved logger data is safe, but one queued media file could not be cached after its retries completed.');
  assert.deepEqual(notifications[0][1], {
    title: 'Message Logger Media Cache Error',
    type: 'error',
    timeout: 8000,
    replaceKey: 'system:deferred-media-cache-error'
  });
});

test('cache admission captures supported diagnostic labels without changing request identity', () => {
  const plugin = createCachePlugin('/unused');
  plugin.settings.dontSaveData = true;
  plugin.cacheMessageImages({
    id: 'label-message',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [
      { id: 'image-id', url: 'https://cdn.example/photo.png' },
      { id: 'video-id', url: 'https://cdn.example/clip.mp4' },
      { id: 'audio-id', url: 'https://cdn.example/sound.mp3' },
      { id: 'file-id', url: 'https://cdn.example/archive.unknown' }
    ],
    embeds: [{ image: { id: 'embed-image-id', url: 'https://cdn.example/embed.png' } }],
    components: [{ type: 13, file: { id: 'component-file-id', url: 'https://cdn.example/component.bin' } }]
  });

  const requests = Array.from(plugin._pendingMediaCacheRequests.values());
  assert.deepEqual(requests.map(request => request.diagnosticType), [
    'image', 'video', 'audio', 'file', 'embed', 'file'
  ]);
  assert.equal(new Set(Array.from(plugin._pendingMediaCacheRequests.keys())).size, requests.length);
  assert.equal(plugin.queuePendingMediaCacheRequest(
    'blob:unknown-content', 9, null, 'label-message', 'channel', 'guild', 'precache'
  ), true);
  assert.equal(
    plugin._pendingMediaCacheRequests.get(plugin.getMediaCacheRequestKey({
      url: 'blob:unknown-content', attachmentIdx: 9, attachmentId: null, messageId: 'label-message'
    })).diagnosticType,
    'media',
    'unknown content keeps the generic label'
  );
});

test('deferred embed provenance survives queue replay and retry exhaustion', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-cache-deferred-label-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cacheDir = path.join(root, 'cache');
  const messageId = 'deferred-embed-message';
  const plugin = createCachePlugin(cacheDir, {
    _mediaCacheMaxAttempts: 1,
    isDeferredMediaCacheRequestActive: () => true,
    async fetchMediaCacheResponse() { return response({ ok: false, status: 500 }); }
  });
  plugin.settings.dontSaveData = true;
  plugin.cacheMessageImages({
    id: messageId,
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [],
    embeds: [{ image: { id: 'embed-source', url: 'https://cdn.example/embed.png' } }]
  });
  const [queued] = plugin._pendingMediaCacheRequests.values();
  assert.equal(queued.diagnosticType, 'embed');
  plugin.messageRecord[messageId] = { message: { id: messageId, channel_id: 'channel', guild_id: 'guild' } };
  plugin.settings.dontSaveData = false;
  assert.equal(plugin.flushPendingMediaCacheRequests(), 1);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.ok(loggerEvents.some(event => event[0] === 'warn'
    && event[1] === 'Failed to get embed deferred-embed-message-embed-0 for caching, error code 500'));
  assert.ok(loggerEvents.some(event => event[0] === 'error'
    && event[1] === 'Deferred media cache request deferred-embed-message-embed-0 could not be completed.'));
});

test('cacheImage no-save handoff preserves provenance and normalizes invalid request-state labels on replay', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-cache-nosave-label-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plugin = createCachePlugin(path.join(root, 'cache'), {
    _mediaCacheMaxAttempts: 1,
    async fetchMediaCacheResponse() { return response({ ok: false, status: 500 }); }
  });
  plugin.settings.dontSaveData = true;
  const embedMessageId = 'midflight-embed-message';
  const videoMessageId = 'midflight-video-message';

  await plugin.cacheImage(
    'https://cdn.example/embed.png', 'embed:0', 'embed-source', embedMessageId,
    'channel', 'guild', 0, 0, 'precache', { cacheState: 'precache', diagnosticType: 'embed' }
  );
  await plugin.cacheImage(
    'https://cdn.example/clip.mp4', 0, 'video-source', videoMessageId,
    'channel', 'guild', 0, 0, 'precache', { cacheState: 'precache', diagnosticType: 'invalid-type' }
  );

  const queued = Array.from(plugin._pendingMediaCacheRequests.values());
  assert.deepEqual(queued.map(request => request.diagnosticType), ['embed', 'video']);
  plugin.messageRecord[embedMessageId] = { message: { id: embedMessageId } };
  plugin.messageRecord[videoMessageId] = { message: { id: videoMessageId } };
  plugin.settings.dontSaveData = false;
  assert.equal(plugin.flushPendingMediaCacheRequests(), 2);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.ok(loggerEvents.some(event => event[0] === 'warn'
    && event[1] === 'Failed to get embed midflight-embed-message-embed-0 for caching, error code 500'));
  assert.ok(loggerEvents.some(event => event[0] === 'warn'
    && event[1] === 'Failed to get video midflight-video-message-0 for caching, error code 500'));
});

test('all terminal cache warning branches use the stable file identity', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-cache-terminal-ids-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cases = [
    {
      name: 'retry exhaustion', response: { ok: false, status: 500 },
      message: 'Failed to get image message-embed-1 for caching, error code 500', level: 'warn'
    },
    {
      name: 'unknown extension', response: { ok: true, status: 200, contentType: null },
      url: 'https://cdn.example/no-extension',
      message: 'Could not determine file extension for message-embed-1, skipping cache', level: 'warn'
    },
    {
      name: 'write failure', response: { ok: true, status: 200 },
      message: 'Failed to cache image message-embed-1:', level: 'error', writeFailure: true
    }
  ];

  for (const [index, item] of cases.entries()) {
    const cacheDir = path.join(root, `cache-${index}`);
    const plugin = createCachePlugin(cacheDir, {
      _mediaCacheMaxAttempts: 1,
      isDeferredMediaCacheRequestActive: () => true,
      async fetchMediaCacheResponse() { return response(item.response); }
    });
    if (item.writeFailure) {
      plugin.nodeModules.fs = Object.create(fs);
      plugin.nodeModules.fs.writeFileSync = () => { throw new Error('write denied'); };
    }
    const url = item.url || `https://cdn.example/${item.name.replaceAll(' ', '-')}.png`;
    await plugin.cacheImage(url, 'embed:1', null, 'message', 'channel', 'guild', 0, 0, 'precache');
    assert.ok(loggerEvents.some(event => event[0] === item.level && event[1] === item.message), item.name);
    assert.ok(loggerEvents.some(event => event[0] === 'error' && event[1] === 'Deferred media cache request message-embed-1 could not be completed.'), `${item.name} deferred identity`);
    resetHarness();
  }
});
