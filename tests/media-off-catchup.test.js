const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./helpers/plugin-harness');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function setup() {
  const started = [], gates = [];
  const plugin = createPlugin({ __started: true, settings: { cacheAllImages: false, dontSaveData: false, newSaveAllFileTypes: true, maxCacheFileSize: 0 },
    messageRecord: {}, cachedMessagesMap: new Map(), _pendingMediaCacheRequests: new Map(), _activeDeferredMediaCacheRequests: new Map(),
    cacheImage(...args) { started.push(args); return new Promise(resolve => gates.push(resolve)); },
    refreshAttachmentRendering() {}, reportMajorSettingChange() {}, notifyDataSaveModeTransitionChange() {},
    cancelSavedMediaExternalOpenProbes() {}, resetSavedAttachmentPresentationState() {}, stopMediaCacheTrimmer() {}, startMediaCacheTrimmer() {} });
  const message = (id, extension = 'png') => ({ id, channel_id: 'channel', guild_id: 'guild', content: '', attachments: [{ id: `a-${id}`, url: `https://cdn.example/${id}.${extension}`, size: 1 }] });
  return { plugin, started, gates, message };
}

test('media Off catch-up waits for both gates and the successful primary-save barrier in either order', async () => {
  for (const order of ['media-first', 'saving-first']) {
    const h = setup(), m = h.message(order); h.plugin.messageRecord[m.id] = { message: m };
    h.plugin.settings.dontSaveData = true;
    h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
    assert.equal(h.plugin._pendingMediaCacheRequests.size, 1);
    h.plugin._flushMediaCacheAfterNextDataSave = true;
    if (order === 'media-first') { h.plugin.settings.cacheAllImages = true; h.plugin.handleMediaCachingSetting(true); }
    else { h.plugin.settings.dontSaveData = false; h.plugin.flushPendingMediaCacheRequests(); }
    assert.equal(h.started.length, 0);
    h.plugin.settings.cacheAllImages = true; h.plugin.settings.dontSaveData = false;
    h.plugin.handleMediaCachingSetting(true);
    assert.equal(h.started.length, 0, 'primary save barrier remains authoritative');
    h.plugin._flushMediaCacheAfterNextDataSave = false;
    h.plugin.flushPendingMediaCacheRequests();
    assert.equal(h.started.length, 1);
    h.gates.shift()(); await tick();
  }
});

test('only media-Off live precache may replay without a record and promotes after logging', async () => {
  const h = setup(), live = h.message('live');
  h.plugin.cacheMessageImages(live, { cacheState: 'precache', queueWhileNoSave: false });
  h.plugin.settings.cacheAllImages = true;
  h.plugin.settings.dontSaveData = true;
  h.plugin.cacheMessageImages(h.message('ordinary-no-save'), { cacheState: 'precache', queueWhileNoSave: false });
  h.plugin.queuePendingMediaCacheRequest('https://cdn.example/missing.png', 0, 'missing', 'missing', 'channel', 'guild', 'precache', 'image');
  h.plugin.settings.dontSaveData = false;
  h.plugin.messageRecord.live = { message: live };
  h.plugin.flushPendingMediaCacheRequests();
  assert.equal(h.started.length, 1); assert.equal(h.started[0][3], 'live'); assert.equal(h.started[0][8], 'confirmed');
  h.gates.shift()(); await tick();
  const unlogged = h.message('unlogged'); h.plugin.settings.cacheAllImages = false;
  h.plugin.cacheMessageImages(unlogged, { cacheState: 'precache', queueWhileNoSave: false });
  h.plugin.settings.cacheAllImages = true; h.plugin.flushPendingMediaCacheRequests();
  assert.equal(h.started.at(-1)[8], 'precache');
  h.gates.shift()(); await tick();
});

test('catch-up rechecks current attachment source, size, type, removed history and identity', async () => {
  const h = setup();
  for (const id of ['removed', 'changed', 'large', 'file', 'channel']) {
    const m = h.message(id, id === 'file' ? 'pdf' : 'png'); h.plugin.messageRecord[id] = { message: m };
    h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
  }
  const removed = h.plugin.messageRecord.removed;
  removed.removed_attachments = removed.message.attachments; removed.message = { ...removed.message, attachments: [] };
  h.plugin.messageRecord.changed.message.attachments[0].url += '?changed';
  h.plugin.messageRecord.large.message.attachments[0].size = 3_000_000;
  h.plugin.messageRecord.channel.message.channel_id = 'another-channel';
  h.plugin.settings.newSaveAllFileTypes = false; h.plugin.settings.maxCacheFileSize = 1;
  h.plugin.settings.cacheAllImages = true; h.plugin.flushPendingMediaCacheRequests();
  assert.deepEqual(h.started.map(args => args[3]), ['removed']);
  h.gates.shift()(); await tick(); assert.equal(h.plugin._pendingMediaCacheRequests.size, 0);
});

test('catch-up caps admission, deduplicates, runs at most two and pauses across rapid toggles', async () => {
  const h = setup();
  for (let i = 0; i < 1002; i++) h.plugin.cacheMessageImages(h.message(String(i)), { cacheState: 'precache', queueWhileNoSave: false });
  assert.equal(h.plugin._pendingMediaCacheRequests.size, 1000);
  h.plugin.cacheMessageImages(h.message('0'), { cacheState: 'precache', queueWhileNoSave: false });
  assert.equal(h.plugin._pendingMediaCacheRequests.size, 1000);
  h.plugin.settings.cacheAllImages = true; assert.equal(h.plugin.flushPendingMediaCacheRequests(), 2);
  assert.equal(h.started.length, 2);
  h.plugin.settings.cacheAllImages = false; h.plugin.handleMediaCachingSetting(false);
  h.plugin.settings.cacheAllImages = true; h.plugin.handleMediaCachingSetting(true);
  assert.equal(h.started.length, 2, 'paused unresolved operations retain their concurrency slots');
  h.gates.shift()(); await tick(); assert.equal(h.started.length, 3);
  assert.equal(h.plugin._activeDeferredMediaCacheRequests.size, 2);
  h.plugin.__started = false;
  h.plugin._pendingMediaCacheRequests.clear(); h.plugin._activeDeferredMediaCacheRequests.clear();
  for (const resolve of h.gates) resolve(); await tick();
});

test('record and thread removal invalidate active requests without allowing stale completion to clear newer work', async () => {
  const h = setup(), m = h.message('removed');
  h.plugin.messageRecord.removed = { message: m };
  h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
  h.plugin.settings.cacheAllImages = true; h.plugin.flushPendingMediaCacheRequests();
  const guard = h.started[0][11]; assert.equal(guard(), true);
  h.plugin.removeDeferredMediaCacheRequests(request => request.messageId === 'removed');
  assert.equal(guard(), false);
  h.plugin.settings.cacheAllImages = false;
  h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
  h.plugin.settings.cacheAllImages = true;
  h.gates.shift()(); await tick();
  assert.equal(h.started.length, 2);
  assert.equal(h.started[1][11](), true);
  h.gates.shift()(); await tick();
});

test('media Off preserves an in-progress primary save barrier through rapid toggles', () => {
  const h = setup(), m = h.message('barrier'); h.plugin.messageRecord.barrier = { message: m };
  h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
  h.plugin._flushMediaCacheAfterNextDataSave = true;
  h.plugin.handleMediaCachingSetting(false);
  h.plugin.settings.cacheAllImages = true; h.plugin.handleMediaCachingSetting(true);
  assert.equal(h.plugin._flushMediaCacheAfterNextDataSave, true);
  assert.equal(h.started.length, 0);
  assert.equal(h.plugin._pendingMediaCacheRequests.size, 1);
});

test('unlogged component file recovery obeys the current file-type gate', async () => {
  const h = setup();
  const m = { id: 'component', channel_id: 'channel', components: [{ type: 13, file: { url: 'https://cdn.example/image.png' } }] };
  h.plugin.cacheMessageImages(m, { cacheState: 'precache', queueWhileNoSave: false });
  assert.equal(h.plugin._pendingMediaCacheRequests.size, 1);
  h.plugin.settings.newSaveAllFileTypes = false; h.plugin.settings.cacheAllImages = true;
  h.plugin.flushPendingMediaCacheRequests();
  assert.equal(h.started.length, 0);
  assert.equal(h.plugin._pendingMediaCacheRequests.size, 0);
});

test('debug summaries remain console-only and overflow reporting is bounded', () => {
  const h = setup(), reports = [];
  h.plugin.reportDebugEvent = (...args) => reports.push(args);
  for (let i = 0; i < 1003; i++) h.plugin.cacheMessageImages(h.message(String(i)), { cacheState: 'precache', queueWhileNoSave: false });
  const overflow = reports.filter(args => args[0].includes('queue full'));
  assert.equal(overflow.length, 1);
  assert.deepEqual(overflow[0][2], { console: true, toast: false });
});

test('saving toggle can pause active media-Off recovery and rapid media toggles retain the save barrier', async () => {
  const h = setup(), m = h.message('cross-toggle'); h.plugin.messageRecord[m.id] = { message: m };
  Object.assign(h.plugin, {
    _needsNoSaveDataMerge: false, flushNoSavePersistedRemovals: () => ({ ok: true }), reportDataSavingResume() {}, reportDataSavingDisabled() {},
    beginDataSavePrimaryFlush() {}, saveData() {}, cancelPendingDataWrites() {}, notifySettingDependencyChange() {}
  });
  h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
  h.plugin.settings.cacheAllImages = true; h.plugin.handleMediaCachingSetting(true);
  assert.equal(h.started.length, 1);
  assert.equal(h.plugin.isDataSaveModeTransitionBusy(), false, 'media-Off recovery must not lock saving controls');
  h.plugin.settings.dontSaveData = true; assert.equal(h.plugin.handleDataSaveSetting(true), true);
  assert.equal(h.started[0][11](), false);
  h.plugin.settings.cacheAllImages = false; h.plugin.handleMediaCachingSetting(false);
  h.plugin.settings.dontSaveData = false; assert.equal(h.plugin.handleDataSaveSetting(false), true);
  assert.equal(h.plugin._flushMediaCacheAfterNextDataSave, true);
  h.plugin.settings.cacheAllImages = true; h.plugin.handleMediaCachingSetting(true);
  h.gates.shift()(); await tick();
  assert.equal(h.started.length, 1, 'settled abort must not bypass the pending primary save');
  h.plugin._flushMediaCacheAfterNextDataSave = false; h.plugin.flushPendingMediaCacheRequests();
  assert.equal(h.started.length, 2);
  h.gates.shift()(); await tick();
});

test('explicit record removal removes pending descriptors', () => {
  const h = setup(), m = h.message('delete'); h.plugin.messageRecord.delete = { message: m };
  Object.assign(h.plugin, { messageRecordIds: new Set([m.id]), deletedMessageRecord: {}, editedMessageRecord: {}, purgedMessageRecord: {}, nukedMessageRecord: {},
    deletedMessageSet: new Map(), editedMessageSet: new Map(), purgedMessageSet: new Map(), nukedMessageSet: new Map(), queueNoSavePersistedRemoval() {} });
  h.plugin.cacheMessageImages(m, { cacheState: 'confirmed' });
  h.plugin.deleteMessageFromRecords(m.id);
  assert.equal(h.plugin._pendingMediaCacheRequests.size, 0);
});

test('Sent Clear Log cancels only actually cleared unlogged precache, including active requests', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('    const onClearLog = e => {');
  const end = source.indexOf('\n    this.createModal(\n      {\n        confirmText:', start);
  assert.ok(start >= 0 && end > start);
  const createHandler = vm.runInNewContext(`(function() { ${source.slice(start, end)}\nreturn onClearLog; })`, {
    React: { createElement: () => ({}) }, document: { getElementById: () => ({ parentElement: { parentElement: { className: '' } } }) }
  });
  for (const filtered of [false, true]) {
    const h = setup();
    const messages = ['active', 'saved', 'pending', 'untouched'].map(id => h.message(id));
    h.plugin.messageRecord.saved = { message: messages[1] };
    for (const m of messages) h.plugin.cacheMessageImages(m, { cacheState: 'precache', queueWhileNoSave: false });
    h.plugin.settings.cacheAllImages = true; h.plugin.flushPendingMediaCacheRequests();
    assert.equal(h.started.length, 2);
    const activeGuard = h.started[0][11], savedGuard = h.started[1][11];
    Object.assign(h.plugin, {
      menu: { selectedTab: 'sent', filter: filtered ? 'search' : '', messages: ['active', 'saved', 'pending'] },
      cachedMessageRecord: [...messages], cachedMessageIds: new Set(messages.map(m => m.id)),
      cachedMessagesMap: new Map(messages.map(m => [m.id, m])), style: { filter: 'filter' },
      createTextBox: { classes: { focused: ['focused'] } }, scheduleLoggerMenuRefresh() {},
      createModal(options) { this.confirmClear = options.onConfirm; }
    });
    createHandler.call(h.plugin)(); h.plugin.confirmClear();
    assert.equal(activeGuard(), false, 'cleared active live precache is invalidated');
    assert.equal(savedGuard(), true, 'canonical saved media stays active');
    assert.equal([...h.plugin._pendingMediaCacheRequests.values()].some(item => item.messageId === 'pending'), false);
    assert.equal([...h.plugin._pendingMediaCacheRequests.values()].some(item => item.messageId === 'untouched'), !filtered);
    h.plugin.__started = false;
    h.plugin._pendingMediaCacheRequests.clear(); h.plugin._activeDeferredMediaCacheRequests.clear();
    for (const resolve of h.gates) resolve(); await tick();
  }
});
