const { installNativeCache, NativeCache } = require('./helpers/native-message-cache');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  captureConsoleEvent,
  createPlugin,
  Patcher,
  React,
  ReactDOM,
  loggerEvents,
  resetHarness,
  Utils,
  Webpack
} = require('./helpers/plugin-harness');


function installMountedSavedMedia(plugin, records) {
  plugin.messageRecord ||= {};
  plugin.deletedMessageRecord ||= {};
  for (const record of records) {
    const { id, channel_id: channel } = record.message;
    plugin.messageRecord[id] = record;
    (plugin.deletedMessageRecord[channel] ||= []).push(id);
  }
  const entries = [...new Set(records.map(record => record.message.channel_id))].map(channel => [channel, {
    main: records.filter(record => record.message.channel_id === channel).map(record => record.message.id).concat('native')
  }]);
  const fixture = installNativeCache(plugin, entries);
  const original = plugin.cacheChannelMessages;
  plugin.cacheChannelMessages = channel => {
    original?.(channel);
    const old = fixture.caches.get(channel);
    if (!old) return;
    fixture.caches.set(channel, new NativeCache(channel, {
      main: [...new Set([...old.main, ...records.filter(record => record.message.channel_id === channel).map(record => record.message.id)])],
      before: [...old.before], after: [...old.after], metadata: old.metadata
    }));
  };
  return fixture;
}

let styledConsoleEvents = [];
let originalConsoleLog;

test.beforeEach(() => {
  resetHarness();
  styledConsoleEvents = [];
  originalConsoleLog = console.log;
  console.log = (...args) => {
    styledConsoleEvents.push(args);
    captureConsoleEvent('log', args);
  };
});

test.afterEach(() => {
  console.log = originalConsoleLog;
});

const MEDIA_CACHE_LEGACY_ROUTING_NOTICE =
  'Networking: media routing is using the old Discord renderer fetch() method.';

function successfulMediaResponse(contentType = 'image/png') {
  return {
    ok: true,
    status: 200,
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
      _getBaseCachePath: () => cacheDir,
      cleanUp() {}
    },
    cacheDeletionMessageIds: new Set(),
    messageRecord: {},
    cachedMessagesMap: new Map(),
    ...overrides
  });
}

function createCachedRecordDeletionPlugin(cacheDir, records, overrides = {}) {
  const { settings: settingOverrides = {}, ...pluginOverrides } = overrides;
  const ids = Object.keys(records);
  const recordsByChannel = {};
  for (const id of ids) {
    const channelId = records[id]?.message?.channel_id || 'channel';
    (recordsByChannel[channelId] ||= []).push(id);
  }
  const deletedMessageSet = new Map(
    Object.entries(recordsByChannel).map(([channelId, channelIds]) => [channelId, new Set(channelIds)])
  );
  const notifications = [];
  const plugin = createPlugin({
    __started: true,
    settings: {
      imageCacheDir: cacheDir,
      deleteCachedFilesWithRecords: true,
      showMediaCacheTrimLifecycleToasts: true,
      ...settingOverrides
    },
    nodeModules: { fs, path },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => cacheDir,
      cached: {}
    },
    cacheDeletionMessageIds: new Set(),
    messageRecord: records,
    messageRecordIds: new Set(ids),
    deletedMessageRecord: recordsByChannel,
    editedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    deletedMessageSet,
    editedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    nukedMessageSet: new Map(),
    suppressedForumThreadIds: new Set(),
    cachedMessageRecord: [],
    cachedMessageIds: new Set(),
    cachedMessagesMap: new Map(),
    noTintIds: new Set(),
    editModifiers: {},
    queueNoSavePersistedRemoval() {},
    refreshForumThreadLogModal() {},
    notifyUser(message, options) {
      notifications.push({ message, options });
    },
    ...pluginOverrides
  });
  return { notifications, plugin };
}

function mockAbortControllerWithSignalCapture() {
  const signal = {
    listeners: new Set(),
    aborted: false,
    addEventListener(event, listener) {
      if (event !== 'abort') return;
      this.listeners.add(listener);
    },
    removeEventListener(event, listener) {
      if (event !== 'abort') return;
      this.listeners.delete(listener);
    }
  };
  const controller = {
    signal,
    abort() {
      signal.aborted = true;
      for (const listener of Array.from(signal.listeners)) {
        listener();
      }
      signal.listeners.clear();
    }
  };
  return { controller, signal };
}

function createFakeEventTarget() {
  const state = {
    addCalls: [],
    removeCalls: [],
    listeners: []
  };
  return {
    addEventListener(eventName, listener, capture) {
      if (eventName === 'error') {
        state.addCalls.push({ eventName, listener, capture });
        state.listeners.push({ eventName, listener, capture });
      }
    },
    removeEventListener(eventName, listener, capture) {
      if (eventName === 'error') {
        state.removeCalls.push({ eventName, listener, capture });
      }
      state.listeners = state.listeners.filter(
        candidate => candidate.eventName !== eventName
          || candidate.listener !== listener
          || candidate.capture !== capture
      );
    },
    dispatchErrorEvent(event) {
      for (const entry of [...state.listeners]) {
        if (entry.eventName === 'error') {
          entry.listener(event);
        }
      }
    },
    state
  };
}

function createLoggerAudioHost() {
  const state = {
    addCalls: [],
    removeCalls: [],
    listeners: [],
    replacement: null
  };
  const host = {
    dataset: {},
    children: [],
    isConnected: true,
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    replaceChildren(...children) {
      this.children = children;
      for (const child of children) child.parentElement = this;
    },
    replaceWith(replacement) {
      state.replacement = replacement;
      this.isConnected = false;
    },
    contains(node) {
      return node === this || this.children.includes(node);
    },
    addEventListener(eventName, listener, capture) {
      state.addCalls.push({ eventName, listener, capture });
      state.listeners.push({ eventName, listener, capture });
    },
    removeEventListener(eventName, listener, capture) {
      state.removeCalls.push({ eventName, listener, capture });
      state.listeners = state.listeners.filter(
        candidate => candidate.eventName !== eventName
          || candidate.listener !== listener
          || candidate.capture !== capture
      );
    },
    dispatchErrorEvent(target) {
      for (const entry of [...state.listeners]) {
        if (entry.eventName === 'error') entry.listener({ target });
      }
    },
    state
  };
  return host;
}

function createNativeMediaClosest(messageRow) {
  return selector => selector === '[data-ml2-attachment-video-host="true"]'
    || selector === '[data-ml2-attachment-audio-host="true"]'
    ? null
    : messageRow;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function mediaNetworkDebugMessages(url = null) {
  return styledConsoleMessages('DEBUG')
    .filter(message => (
      message.startsWith('Media request #')
      && (url == null || message.includes(url))
    ));
}

function styledConsoleMessages(category = null) {
  return styledConsoleEvents.flatMap(args => {
    const format = String(args[0] || '');
    const compound = /^%cMessageLoggerV2%c%c DEBUG %c%c (.+) %c$/.exec(format);
    if (compound) {
      if (category != null && category !== `DEBUG · ${compound[1]}`) return [];
      return [String(args.at(-1))];
    }
    const single = /^%cMessageLoggerV2%c%c (.+) %c$/.exec(format);
    if (!single || (category != null && single[1] !== category)) return [];
    return [String(args.at(-1))];
  });
}

function createStreamChunkStep(value, delayMs = 0) {
  return async () => {
    if (delayMs > 0) await delay(delayMs);
    return value;
  };
}

function createStreamResponse(readPlan = [], options = {}) {
  const state = {
    reads: 0,
    cancelled: false,
    released: false,
    cancelReason: null
  };
  const contentType = options.contentType ?? 'image/png';
  const steps = readPlan.map(step => {
    if (typeof step === 'function') return step;
    return () => step;
  });
  const reader = {
    async read() {
      state.reads += 1;
      const next = steps.shift();
      if (!next) return { done: true };
      return await next();
    },
    async cancel(reason) {
      state.cancelled = true;
      state.cancelReason = reason;
    },
    releaseLock() {
      state.released = true;
    }
  };
  return {
    state,
    response: {
      ok: true,
      status: 200,
      headers: { get: name => name === 'content-type' ? contentType : null },
      body: { getReader: () => reader },
      ...(options.extraResponseFields || {})
    }
  };
}

test('media-cache transport uses native fetch by default with unchanged options and forced timeout 0', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    let nativeRequest;
    let rendererRequest;
    global.AbortController = class {
      constructor() {
        return controllerState.controller;
      }
    };
    const plugin = createMediaCachePlugin('');
    plugin.settings.forceLegacyMediaFetching = false;
    plugin._mediaCacheNativeFetchCompatible = null;
    let nativeReceiver;
    const options = {
      method: 'GET',
      headers: { 'X-Test': 'media-cache' }
    };
    global.BdApi.Net = {
      fetch(url, requestInit) {
        nativeReceiver = this;
        nativeRequest = { url, requestInit };
        return Promise.resolve(successfulMediaResponse());
      }
    };
    global.fetch = (url, requestInit) => {
      rendererRequest = { url, requestInit };
      return Promise.resolve(successfulMediaResponse());
    };
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/media', options);
    assert.equal(response.ok, true);
    assert.equal(nativeReceiver, global.BdApi.Net);
    assert.equal(nativeRequest.url, 'https://cdn.example/media');
    assert.ok(nativeRequest.requestInit);
    assert.equal(nativeRequest.requestInit.timeout, 0);
    assert.equal(nativeRequest.requestInit.signal, controllerState.signal);
    assert.equal(nativeRequest.requestInit.headers, options.headers);
    assert.equal(nativeRequest.requestInit.method, options.method);
    assert.equal(rendererRequest, undefined);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache transport helper tracks forced and compatibility-based selection', () => {
  const plugin = createMediaCachePlugin('');
  plugin.settings.forceLegacyMediaFetching = false;
  plugin._mediaCacheNativeFetchCompatible = null;
  assert.equal(plugin.getMediaCacheTransportSelection(), 'native');
  plugin.settings.forceLegacyMediaFetching = true;
  assert.equal(plugin.getMediaCacheTransportSelection(), 'legacy');
  plugin.settings.forceLegacyMediaFetching = false;
  plugin._mediaCacheNativeFetchCompatible = false;
  assert.equal(plugin.getMediaCacheTransportSelection(), 'legacy');
});

test('media-cache transport forces legacy on-demand without mutating compatibility state', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin.settings.forceLegacyMediaFetching = true;
    plugin._mediaCacheNativeFetchCompatible = null;
    let nativeCalls = 0;
    let rendererCalls = 0;
    global.BdApi.Net = {
      fetch() {
        nativeCalls += 1;
        return Promise.resolve(successfulMediaResponse());
      }
    };
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/legacy');
    assert.equal(response.ok, true);
    assert.equal(nativeCalls, 0);
    assert.equal(rendererCalls, 1);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, null);
    assert.equal(plugin.getMediaCacheTransportSelection(), 'legacy');
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch falls back to renderer and latches compatibility when native API is missing', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    let rendererCalls = 0;
    plugin._mediaCacheNativeFetchCompatible = null;
    global.BdApi.Net = undefined;
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/missing');
    assert.equal(response.ok, true);
    assert.equal(rendererCalls, 1);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch latches native incompatibility on synchronous throw and does not reprobe', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = true;
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    let nativeCalls = 0;
    let rendererCalls = 0;
    let firstRequest = true;
    global.BdApi.Net = {
      fetch() {
        if (firstRequest) {
          firstRequest = false;
          throw new Error('sync throw');
        }
        nativeCalls += 1;
        return Promise.resolve(successfulMediaResponse());
      }
    };
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };
    const first = await plugin.fetchMediaCacheResponse('https://cdn.example/throw');
    assert.equal(first.ok, true);
    assert.equal(rendererCalls, 1);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.equal(notifications.length, 1);
    assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
    assert.equal(notifications[0][0], MEDIA_CACHE_LEGACY_ROUTING_NOTICE);
    assert.equal(notifications[0][1].timeout, 4000);
    await plugin.fetchMediaCacheResponse('https://cdn.example/throw');
    assert.equal(nativeCalls, 0);
    assert.equal(rendererCalls, 2);
    assert.equal(notifications.length, 1);
    assert.equal(styledConsoleMessages('DEBUG').length, 1);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch latches native incompatibility on non-thenable return and does not reprobe', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    let nativeCalls = 0;
    let rendererCalls = 0;
    global.BdApi.Net = {
      fetch() {
        nativeCalls += 1;
        return { ok: true };
      }
    };
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };
    await plugin.fetchMediaCacheResponse('https://cdn.example/non-thenable');
    assert.equal(rendererCalls, 1);
    assert.equal(nativeCalls, 1);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    await plugin.fetchMediaCacheResponse('https://cdn.example/non-thenable');
    assert.equal(rendererCalls, 2);
    assert.equal(nativeCalls, 1);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch latches native incompatibility when the native fetch property getter throws', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheNativeFetchCompatible = null;
    let getterReads = 0;
    const netApi = {};
    Object.defineProperty(netApi, 'fetch', {
      get() {
        getterReads += 1;
        throw new Error('bad native fetch getter');
      }
    });
    global.BdApi.Net = netApi;
    let rendererCalls = 0;
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };

    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/fetch-getter');
    assert.equal(response.ok, true);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.equal(getterReads, 1);
    assert.equal(rendererCalls, 1);

    const secondResponse = await plugin.fetchMediaCacheResponse('https://cdn.example/fetch-getter');
    assert.equal(secondResponse.ok, true);
    assert.equal(getterReads, 1);
    assert.equal(rendererCalls, 2);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch latches native incompatibility when then getter throws during async shape check', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheNativeFetchCompatible = null;
    let nativeCalls = 0;
    const thenError = new Error('bad then');
    const invalidThenable = {};
    Object.defineProperty(invalidThenable, 'then', {
      get() {
        throw thenError;
      }
    });
    global.BdApi.Net = {
      fetch() {
        nativeCalls += 1;
        return invalidThenable;
      }
    };
    let rendererCalls = 0;
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/then-getter');
    assert.equal(response.ok, true);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.equal(nativeCalls, 1);
    assert.equal(rendererCalls, 1);
    const secondResponse = await plugin.fetchMediaCacheResponse('https://cdn.example/then-getter');
    assert.equal(secondResponse.ok, true);
    assert.equal(rendererCalls, 2);
    assert.equal(nativeCalls, 1);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch keeps native path on async rejection and recovers on later native success', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = true;
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    plugin._mediaCacheNativeFetchCompatible = null;
    let nativeCalls = 0;
    const networkError = new Error('async reject');
    global.BdApi.Net = {
      fetch() {
        nativeCalls += 1;
        if (nativeCalls === 1) return Promise.reject(networkError);
        return Promise.resolve(successfulMediaResponse());
      }
    };
    let rendererCalls = 0;
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };
    await assert.rejects(
      () => plugin.fetchMediaCacheResponse('https://cdn.example/reject'),
      /async reject/
    );
    assert.equal(notifications.length, 0);
    assert.equal(loggerEvents.length, 0);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, true);
    assert.equal(nativeCalls, 1);
    assert.equal(rendererCalls, 0);
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/reject');
    assert.equal(response.ok, true);
    assert.equal(nativeCalls, 2);
    assert.equal(rendererCalls, 0);
    assert.equal(notifications.length, 0);
    assert.equal(loggerEvents.length, 0);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch keeps native compatibility on HTTP failure and continues native next request', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = true;
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    let nativeCalls = 0;
    global.BdApi.Net = {
      fetch() {
        nativeCalls += 1;
        if (nativeCalls === 1) {
          return Promise.resolve({
            ok: false,
            status: 404,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => new Uint8Array([0x4d]).buffer
          });
        }
        return Promise.resolve(successfulMediaResponse());
      }
    };
    global.fetch = () => assert.fail('renderer should not be used for HTTP failures');
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/http-failure');
    assert.equal(response.status, 404);
    assert.equal(notifications.length, 0);
    assert.equal(loggerEvents.length, 0);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, true);
    const successResponse = await plugin.fetchMediaCacheResponse('https://cdn.example/http-failure');
    assert.equal(successResponse.ok, true);
    assert.equal(nativeCalls, 2);
    assert.equal(notifications.length, 0);
    assert.equal(loggerEvents.length, 0);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache transport notices follow active-delivered routing and dedupe unless output routes change state', () => {
  const plugin = createMediaCachePlugin('');
  const notifications = [];
  plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);

  plugin.settings.forceLegacyMediaFetching = true;
  plugin._initializeMediaCacheLegacyRoutingNoticeState();
  assert.equal(loggerEvents.length, 0);
  assert.equal(notifications.length, 0);
  plugin.settings.debugLogging = true;
  plugin.settings.debugToasts = false;

  const first = plugin.reportLegacyRoutingOutputStateChange(
    true,
    { console: true, toast: false }
  );
  assert.deepEqual(first, { console: true, toast: false });
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
  assert.equal(notifications.length, 0);

  plugin.settings.debugToasts = true;
  const second = plugin.reportLegacyRoutingOutputStateChange(
    true,
    { console: false, toast: true }
  );
  assert.deepEqual(second, { console: false, toast: true });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], MEDIA_CACHE_LEGACY_ROUTING_NOTICE);
  assert.equal(notifications[0][1].timeout, 4000);

  const third = plugin._flushMediaCacheLegacyRoutingNoticeForOutputSelection();
  assert.deepEqual(third, { console: false, toast: false });
  assert.equal(notifications.length, 1);

  plugin._deactivateMediaCacheLegacyRoutingNotice();
  plugin.settings.debugLogging = true;
  plugin.settings.debugToasts = true;
  const fourth = plugin._flushMediaCacheLegacyRoutingNoticeForOutputSelection();
  assert.deepEqual(fourth, { console: false, toast: false });
  assert.equal(notifications.length, 1);
  plugin._activateMediaCacheLegacyRoutingNotice();
  assert.deepEqual(styledConsoleMessages('DEBUG'), [
    MEDIA_CACHE_LEGACY_ROUTING_NOTICE,
    MEDIA_CACHE_LEGACY_ROUTING_NOTICE
  ]);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1][0], MEDIA_CACHE_LEGACY_ROUTING_NOTICE);
  const fifth = plugin._flushMediaCacheLegacyRoutingNoticeForOutputSelection();
  assert.deepEqual(fifth, { console: false, toast: false });
});

test('legacy-routing notice flushes both destinations when master is re-enabled with toast child on', () => {
  const plugin = createMediaCachePlugin('');
  const notifications = [];
  plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);

  plugin.settings.forceLegacyMediaFetching = true;
  plugin._initializeMediaCacheLegacyRoutingNoticeState();
  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = true;
  plugin.settings.debugLogging = true;

  const first = plugin.reportLegacyRoutingOutputStateChange(
    true,
    { console: true, toast: false }
  );
  assert.deepEqual(first, { console: true, toast: true });
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], MEDIA_CACHE_LEGACY_ROUTING_NOTICE);
  assert.equal(plugin.settings.debugToasts, true, 're-enabling the master must not rewrite the saved child value');

  const second = plugin.reportLegacyRoutingOutputStateChange(
    true,
    { console: true, toast: false }
  );
  assert.deepEqual(second, { console: false, toast: false });
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
  assert.equal(notifications.length, 1);

  const third = plugin._flushMediaCacheLegacyRoutingNoticeForOutputSelection();
  assert.deepEqual(third, { console: false, toast: false });
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
  assert.equal(notifications.length, 1);
});

test('legacy-routing notice stays console-only when master is re-enabled with toast child off', () => {
  const plugin = createMediaCachePlugin('');
  const notifications = [];
  plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);

  plugin.settings.forceLegacyMediaFetching = true;
  plugin._initializeMediaCacheLegacyRoutingNoticeState();
  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = true;

  const preMaster = plugin.reportLegacyRoutingOutputStateChange(
    true,
    { console: false, toast: true }
  );
  assert.deepEqual(preMaster, { console: false, toast: false });
  assert.equal(notifications.length, 0);

  plugin.settings.debugToasts = false;
  plugin.settings.debugLogging = true;
  const first = plugin.reportLegacyRoutingOutputStateChange(
    true,
    { console: true, toast: false }
  );
  assert.deepEqual(first, { console: true, toast: false });
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
  assert.equal(notifications.length, 0);
  assert.equal(plugin.settings.debugToasts, false);

  const second = plugin._flushMediaCacheLegacyRoutingNoticeForOutputSelection();
  assert.deepEqual(second, { console: false, toast: false });
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
  assert.equal(notifications.length, 0);
});

test('media cache force toggle reports immediately and preserves a latched native incompatibility', () => {
  const plugin = createMediaCachePlugin('');
  const originalNetApi = global.BdApi.Net;
  try {
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = false;
    plugin.settings.forceLegacyMediaFetching = true;
    plugin._mediaCacheNativeFetchCompatible = null;
    plugin.setMediaCacheFetchTransportPreference(true);
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, true);
    assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
    plugin.setMediaCacheFetchTransportPreference(true);
    assert.equal(styledConsoleMessages('DEBUG').length, 1);

    plugin.settings.forceLegacyMediaFetching = false;
    let nativeCalls = 0;
    global.BdApi.Net = {
      fetch() {
        nativeCalls += 1;
        return Promise.resolve(successfulMediaResponse());
      }
    };
    plugin.setMediaCacheFetchTransportPreference(false);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, null);
    assert.equal(plugin.getMediaCacheTransportSelection(), 'native');
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, false);

    plugin._mediaCacheNativeFetchCompatible = false;
    plugin.setMediaCacheFetchTransportPreference(false);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.equal(plugin.getMediaCacheTransportSelection(), 'legacy');
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, true);
    assert.equal(nativeCalls, 0);
    assert.deepEqual(styledConsoleMessages('DEBUG'), [
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE,
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE
    ]);
  } finally {
    global.BdApi.Net = originalNetApi;
  }
});

test('media routing legacy notice startup state initializer selects native-latent and forced legacy paths', () => {
  const originalNetApi = global.BdApi.Net;
  try {
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = false;

    plugin.settings.forceLegacyMediaFetching = true;
    global.BdApi.Net = {
      fetch: () => Promise.resolve(successfulMediaResponse())
    };
    plugin._initializeMediaCacheLegacyRoutingNoticeState();
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, true);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, null);
    assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);

    plugin.settings.forceLegacyMediaFetching = false;
    global.BdApi.Net = undefined;
    plugin._initializeMediaCacheLegacyRoutingNoticeState();
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, true);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.deepEqual(styledConsoleMessages('DEBUG'), [
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE,
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE
    ]);

    const incompatibleNetApi = {};
    Object.defineProperty(incompatibleNetApi, 'fetch', {
      get() {
        throw new Error('bad startup fetch getter');
      }
    });
    global.BdApi.Net = incompatibleNetApi;
    plugin._initializeMediaCacheLegacyRoutingNoticeState();
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, true);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.deepEqual(styledConsoleMessages('DEBUG'), [
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE,
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE,
      MEDIA_CACHE_LEGACY_ROUTING_NOTICE
    ]);

    global.BdApi.Net = {
      fetch: () => Promise.resolve(successfulMediaResponse())
    };
    plugin._mediaCacheLegacyRoutingNoticeState = null;
    plugin._initializeMediaCacheLegacyRoutingNoticeState();
    assert.equal(plugin._mediaCacheNativeFetchCompatible, null);
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, false);
    assert.equal(notifications.length, 0);
    assert.equal(styledConsoleMessages('DEBUG').length, 3);
  } finally {
    global.BdApi.Net = originalNetApi;
  }
});

test('reportDebugEvent routes to requested output selection and returns dispatch flags', () => {
  const plugin = createMediaCachePlugin('');
  const notifications = [];
  plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
  plugin.settings.debugLogging = true;
  plugin.settings.debugToasts = true;

  const both = plugin.reportDebugEvent('combined debug event');
  assert.deepEqual(both, { console: true, toast: true });
  assert.equal(styledConsoleMessages('DEBUG').at(-1), 'combined debug event');
  assert.equal(notifications.at(-1)[1].timeout, 4000);

  const consoleOnly = plugin.reportDebugEvent('console-only', 1200, 'console');
  assert.deepEqual(consoleOnly, { console: true, toast: false });
  assert.equal(styledConsoleMessages('DEBUG').length, 2);
  assert.equal(notifications.length, 1);

  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = true;
  const toastOnly = plugin.reportDebugEvent('toast-only', 2200, 'toast');
  assert.deepEqual(toastOnly, { console: false, toast: false });
  assert.equal(notifications.length, 1);

  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = false;
  const none = plugin.reportDebugEvent('neither', 4000, 'none');
  assert.deepEqual(none, { console: false, toast: false });
  assert.equal(styledConsoleMessages('DEBUG').length, 2);
  assert.equal(notifications.length, 1);

  plugin.settings.debugLogging = true;
  plugin.settings.debugToasts = true;
  const objectSelection = plugin.reportDebugEvent('custom object', 1500, { console: false, toast: true });
  assert.deepEqual(objectSelection, { console: false, toast: true });
  assert.equal(notifications.at(-1)[1].timeout, 1500);
});

test('media-network diagnostics require both console toggles and never consume IDs or emit toasts while disabled', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    plugin.settings.debugToasts = true;
    global.BdApi.Net = {
      fetch() {
        return Promise.resolve(successfulMediaResponse());
      }
    };
    global.fetch = () => {
      assert.fail('renderer should not be used in the diagnostics gate test');
      return Promise.resolve(successfulMediaResponse());
    };

    plugin.settings.debugLogging = false;
    plugin.settings.detailedMediaNetworkDebug = true;
    const masterOff = await plugin.fetchMediaCacheResponse('https://cdn.example/master-off');
    await masterOff.arrayBuffer();

    plugin.settings.debugLogging = true;
    plugin.settings.detailedMediaNetworkDebug = false;
    const childOff = await plugin.fetchMediaCacheResponse('https://cdn.example/child-off');
    await childOff.arrayBuffer();

    assert.equal(plugin._mediaCacheRequestSerial, 0);
    assert.deepEqual(mediaNetworkDebugMessages(), []);
    assert.deepEqual(notifications, []);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-network diagnostics report one truthful native lifecycle with exact streamed bytes and no toasts', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const url = 'https://cdn.example/native-stream?token=full-url';
    const { response } = createStreamResponse([
      { done: false, value: new Uint8Array([0x4d, 0x4c]) },
      { done: false, value: new Uint8Array([0x56, 0x32, 0x21]) },
      { done: true }
    ]);
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    global.BdApi.Net = {
      fetch() {
        return Promise.resolve(response);
      }
    };
    global.fetch = () => assert.fail('renderer should not run for native diagnostics');

    const managed = await plugin.fetchMediaCacheResponse(url, { method: 'post' });
    const first = await managed.arrayBuffer();
    const second = await managed.arrayBuffer();
    await managed.release();
    assert.deepEqual(Array.from(new Uint8Array(first)), [0x4d, 0x4c, 0x56, 0x32, 0x21]);
    assert.equal(second, first, 'managed response must reuse the one body read');

    const messages = mediaNetworkDebugMessages(url);
    const transport = messages.filter(message => message.includes('transport-started'));
    const acquired = messages.filter(message => message.includes('response acquired'));
    const terminal = messages.filter(message => message.includes(' terminal '));
    assert.equal(transport.length, 1);
    assert.match(transport[0], /Media request #1 POST .+ \(native\) transport-started/);
    assert.equal(acquired.length, 1);
    assert.match(acquired[0], /\(native\) response acquired status=200 durationMs=\d+/);
    assert.equal(terminal.length, 1);
    assert.match(terminal[0], /\(native\) terminal outcome=success status=200 bytes=5 durationMs=\d+/);
    assert.equal(messages.some(message => /\(legacy\).*transport-started/.test(message)), false);
    assert.equal(plugin._mediaCacheRequestSerial, 1);
    assert.deepEqual(notifications, []);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-network diagnostics announce only legacy for forced and synchronous native fallback routes', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const scenarios = [
      {
        name: 'forced',
        configure(plugin) {
          plugin.settings.forceLegacyMediaFetching = true;
          global.BdApi.Net = {
            fetch: () => assert.fail('forced legacy must not call native fetch')
          };
        }
      },
      {
        name: 'non-thenable',
        configure(plugin) {
          global.BdApi.Net = { fetch: () => ({ ok: true }) };
        }
      },
      {
        name: 'throwing-then',
        configure(plugin) {
          const invalidThenable = {};
          Object.defineProperty(invalidThenable, 'then', {
            get() { throw new Error('bad then getter'); }
          });
          global.BdApi.Net = { fetch: () => invalidThenable };
        }
      }
    ];

    for (const scenario of scenarios) {
      const url = `https://cdn.example/${scenario.name}`;
      const plugin = createMediaCachePlugin('');
      plugin.settings.debugLogging = true;
      plugin.settings.debugToasts = false;
      plugin.settings.detailedMediaNetworkDebug = true;
      scenario.configure(plugin);
      let rendererCalls = 0;
      global.fetch = () => {
        rendererCalls += 1;
        return Promise.resolve(successfulMediaResponse());
      };

      const managed = await plugin.fetchMediaCacheResponse(url);
      await managed.arrayBuffer();
      const transport = mediaNetworkDebugMessages(url)
        .filter(message => message.includes('transport-started'));
      assert.equal(rendererCalls, 1, `${scenario.name} must use renderer fetch once`);
      assert.equal(transport.length, 1, `${scenario.name} must emit one transport start`);
      assert.match(transport[0], /\(legacy\) transport-started/);
      assert.equal(transport.some(message => message.includes('(native)')), false);
      assert.equal(plugin._mediaCacheRequestSerial, 1);
    }
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-network diagnostics keep asynchronous native rejection native and report one failure', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const url = 'https://cdn.example/native-async-rejection';
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    global.BdApi.Net = {
      fetch: () => Promise.reject(new Error('native async failure'))
    };
    let rendererCalls = 0;
    global.fetch = () => {
      rendererCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };

    await assert.rejects(() => plugin.fetchMediaCacheResponse(url), /native async failure/);
    const messages = mediaNetworkDebugMessages(url);
    assert.equal(messages.filter(message => message.includes('transport-started')).length, 1);
    assert.equal(messages.some(message => /\(native\) transport-started/.test(message)), true);
    assert.equal(messages.some(message => /\(legacy\).*transport-started/.test(message)), false);
    assert.equal(messages.filter(message => message.includes(' terminal ')).length, 1);
    assert.equal(messages.some(message => /terminal outcome=failed.+bytes=0 durationMs=\d+/.test(message)), true);
    assert.equal(rendererCalls, 0);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, true);
    assert.deepEqual(notifications, []);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-network diagnostic failures and hostile status getters cannot change a successful request', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin.settings.debugLogging = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    plugin.reportDebugEvent = () => {
      throw new Error('diagnostic sink failed');
    };
    const response = successfulMediaResponse();
    Object.defineProperty(response, 'status', {
      get() { throw new Error('hostile status getter'); }
    });
    global.BdApi.Net = { fetch: () => Promise.resolve(response) };
    global.fetch = () => assert.fail('renderer should not run after native success');

    const managed = await plugin.fetchMediaCacheResponse('https://cdn.example/safe-diagnostics');
    const body = await managed.arrayBuffer();
    assert.deepEqual(Array.from(new Uint8Array(body)), [0x4d, 0x4c, 0x56, 0x32]);
    assert.equal(plugin._mediaCacheRequestSerial, 1);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch preserves caller options while forcing native timeout 0', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const sharedHeaders = { 'X-Test': 'options' };
    const options = {
      method: 'GET',
      headers: sharedHeaders,
      timeout: 1000
    };
    let nativeInit;
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheNativeFetchCompatible = null;
    global.BdApi.Net = {
      fetch(_, init) {
        nativeInit = init;
        return Promise.resolve(successfulMediaResponse());
      }
    };
    global.fetch = () => assert.fail('renderer should not be used for native defaults');
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/options', options);
    assert.equal(response.ok, true);
    assert.equal(nativeInit.method, options.method);
    assert.equal(nativeInit.headers, sharedHeaders);
    assert.equal(nativeInit.timeout, 0);
    assert.equal(options.timeout, 1000);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, true);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch aborts stalled headers after the configured timeout', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    let capturedSignal;
    let inFlight = 0;
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const url = 'https://cdn.example/header-timeout';
    const plugin = createMediaCachePlugin('');
    plugin.settings.forceLegacyMediaFetching = true;
    plugin.settings.debugLogging = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    plugin._mediaCacheFetchTimeoutMs = 5;
    global.fetch = (_url, options) => {
      capturedSignal = options?.signal;
      inFlight += 1;
      return new Promise(() => {});
    };
    let error;
    try {
      await plugin.fetchMediaCacheResponse(url);
      assert.fail('timeout should abort the header fetch');
    } catch (thrown) {
      error = thrown;
    }
    assert.equal(inFlight, 1);
    assert.equal(capturedSignal, controllerState.signal);
    assert.equal(controllerState.signal.aborted, true);
    assert.equal(plugin._mediaCacheAbortControllers?.size || 0, 0);
    assert.equal(error?.name, 'AbortError');
    assert.equal(/timed out/.test(error?.message || ''), true);
    const messages = mediaNetworkDebugMessages(url);
    assert.equal(messages.filter(message => message.includes('transport-started')).length, 1);
    assert.equal(messages.filter(message => message.includes('response acquired')).length, 0);
    assert.equal(messages.filter(message => message.includes(' terminal ')).length, 1);
    assert.match(messages.find(message => message.includes(' terminal ')), /\(legacy\) terminal outcome=timeout AbortError \(Media cache request timed out\) bytes=0 durationMs=\d+/);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache fetch aborts body reads after idle timeout and releases the stream reader', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    let capturedSignal;
    const { response, state } = createStreamResponse([
      createStreamChunkStep({ done: false, value: new Uint8Array([0x4d]) }, 0),
      () => new Promise(() => {})
    ]);
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const url = 'https://cdn.example/body-timeout';
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheBodyIdleTimeoutMs = 10;
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    plugin.settings.debugLogging = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    global.fetch = async (_url, options) => {
      capturedSignal = options?.signal;
      return response;
    };
    const responseWrapper = await plugin.fetchMediaCacheResponse(url);
    assert.equal(responseWrapper.ok, true);
    let arrayError;
    try {
      await responseWrapper.arrayBuffer();
      assert.fail('body stream should reject after idle timeout');
    } catch (error) {
      arrayError = error;
    }
    assert.equal(arrayError?.name, 'AbortError');
    assert.equal(/body timed out/.test(arrayError?.message || ''), true);
    assert.equal(arrayError?.message, 'Media cache response body timed out');
    await delay(1);
    assert.equal(capturedSignal, controllerState.signal);
    assert.equal(capturedSignal.aborted, true);
    assert.equal(state.cancelled, true);
    assert.equal(state.released, true);
    const messages = mediaNetworkDebugMessages(url);
    assert.equal(messages.filter(message => message.includes('response acquired')).length, 1);
    assert.equal(messages.filter(message => message.includes(' terminal ')).length, 1);
    assert.match(messages.find(message => message.includes(' terminal ')), /\(legacy\) terminal outcome=timeout status=200 bytes=1 durationMs=\d+/);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache rolling stream progress respects per-chunk idle timeout', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    const { response, state } = createStreamResponse([
      createStreamChunkStep({ done: false, value: new Uint8Array([0x4d]) }, 0),
      createStreamChunkStep({ done: false, value: new Uint8Array([0x4c]) }, 18),
      createStreamChunkStep({ done: false, value: new Uint8Array([0x56]) }, 18),
      { done: true }
    ]);
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheBodyIdleTimeoutMs = 30;
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    global.fetch = async () => response;
    const responseWrapper = await plugin.fetchMediaCacheResponse('https://cdn.example/body-rolling-window');
    const arrayBuffer = await responseWrapper.arrayBuffer();
    assert.deepEqual(Array.from(new Uint8Array(arrayBuffer)), [0x4d, 0x4c, 0x56]);
    assert.equal(state.reads, 4);
    assert.equal(controllerState.signal.aborted, false);
    assert.equal(state.cancelled, false);
    assert.equal(responseWrapper.body.cancel, undefined);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-cache response streams multiple non-empty chunks to a combined body buffer', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const { response, state } = createStreamResponse([
      createStreamChunkStep({ done: false, value: new Uint8Array([0x4d, 0x4c]) }, 1),
      createStreamChunkStep({ done: false, value: new Uint8Array([0x56, 0x32]) }, 1),
      { done: true }
    ]);
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheBodyIdleTimeoutMs = 50;
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    global.fetch = async () => response;
    const responseWrapper = await plugin.fetchMediaCacheResponse('https://cdn.example/body-multi-chunk');
    assert.equal(responseWrapper.ok, true);
    const arrayBuffer = await responseWrapper.arrayBuffer();
    assert.deepEqual(Array.from(new Uint8Array(arrayBuffer)), [0x4d, 0x4c, 0x56, 0x32]);
    assert.equal(state.cancelReason, null);
    assert.equal(state.released, true);
    assert.equal(state.reads, 3);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('zero-byte stream chunks do not reset the body idle timeout', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    const { response, state } = createStreamResponse([
      createStreamChunkStep({ done: false, value: new Uint8Array([]) }, 1),
      createStreamChunkStep({ done: false, value: new Uint8Array([0xff]) }, 20),
      { done: true }
    ]);
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheBodyIdleTimeoutMs = 10;
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    global.fetch = async (_url, options) => {
      return response;
    };
    const responseWrapper = await plugin.fetchMediaCacheResponse('https://cdn.example/body-zero-chunk');
    assert.equal(responseWrapper.ok, true);
    let error;
    try {
      await responseWrapper.arrayBuffer();
      assert.fail('body stream should reject when timeout reaches zero-byte chunk then next chunk stall');
    } catch (caught) {
      error = caught;
    }
    assert.equal(error?.name, 'AbortError');
    assert.equal(/body timed out/.test(error?.message || ''), true);
    await delay(1);
    assert.equal(error.message, 'Media cache response body timed out');
    assert.equal(state.cancelled, true);
    assert.equal(state.released, true);
    assert.equal(state.reads, 2);
    assert.equal(controllerState.signal.aborted, true);
    assert.equal(state.cancelReason?.message, 'Media cache response body timed out');
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('no AbortController body stall rejects promptly, releases best effort, and clears active handles', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const state = {
      reads: 0,
      cancelled: false,
      released: false,
      cancelReason: null
    };
    const reader = {
      async read() {
        state.reads += 1;
        if (state.reads === 1) {
          return { done: false, value: new Uint8Array([0x4d]) };
        }
        return new Promise(() => {});
      },
      cancel(reason) {
        state.cancelled = true;
        state.cancelReason = reason;
        return new Promise(() => {});
      },
      releaseLock() {
        state.released = true;
      }
    };
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-no-abort-controller-body-'));
    global.BdApi.Net = undefined;
    global.AbortController = undefined;
    const plugin = createMediaCachePlugin(cacheDir, {
      _mediaCacheBodyIdleTimeoutMs: 10,
      _mediaCacheRetryDelayMs: 0,
      _mediaCacheMaxAttempts: 1
    });
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: name => name === 'content-type' ? 'image/png' : null },
      body: {
        getReader: () => reader
      }
    });
    plugin.settings.forceLegacyMediaFetching = true;
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/no-abort-body-stall');
    let error;
    try {
      await response.arrayBuffer();
      assert.fail('body fetch must reject on stall when no AbortController exists');
    } catch (caught) {
      error = caught;
    }
    assert.equal(error?.name, 'AbortError');
    assert.equal(error?.message, 'Media cache response body timed out');
    assert.equal(state.cancelled, true);
    assert.equal(state.released, true);
    assert.equal(state.cancelReason?.message, 'Media cache response body timed out');
    await delay(10);
    assert.equal(plugin._mediaCacheAbortControllers?.size || 0, 0);
    assert.equal(state.reads, 2);
    fs.rmSync(cacheDir, { force: true, recursive: true });
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('non-stream media responses still read through arrayBuffer fallback', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    const response = {
      ok: true,
      status: 200,
      headers: { get: name => name === 'content-type' ? 'image/png' : null },
      arrayBuffer: async () => payload
    };
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const url = 'https://cdn.example/non-stream';
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    plugin.settings.debugLogging = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    global.fetch = async () => response;
    const managed = await plugin.fetchMediaCacheResponse(url);
    const arrayBuffer = await managed.arrayBuffer();
    const repeated = await managed.arrayBuffer();
    assert.deepEqual(Array.from(new Uint8Array(arrayBuffer)), [0xde, 0xad, 0xbe, 0xef]);
    assert.equal(repeated, arrayBuffer);
    await managed.releaseBody();
    const messages = mediaNetworkDebugMessages(url);
    assert.equal(messages.filter(message => message.includes(' terminal ')).length, 1);
    assert.match(messages.find(message => message.includes(' terminal ')), /\(legacy\) terminal outcome=success status=200 bytes=4 durationMs=\d+/);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('non-stream media fallback stalls reject promptly and clear active handles', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    global.BdApi.Net = undefined;
    global.AbortController = undefined;
    const plugin = createMediaCachePlugin('');
    plugin.settings.forceLegacyMediaFetching = true;
    plugin._mediaCacheBodyIdleTimeoutMs = 10;
    plugin._mediaCacheFetchTimeoutMs = 100;
    let arrayBufferCalls = 0;
    global.fetch = () => ({
      ok: true,
      status: 200,
      headers: { get: name => name === 'content-type' ? 'image/png' : null },
      arrayBuffer: () => {
        arrayBufferCalls += 1;
        return new Promise(() => {});
      }
    });
    const response = await plugin.fetchMediaCacheResponse('https://cdn.example/no-abort-fallback');
    let error;
    const start = Date.now();
    try {
      await response.arrayBuffer();
      assert.fail('non-stream body read should timeout');
    } catch (thrown) {
      error = thrown;
    }
    const elapsedMs = Date.now() - start;
    assert.equal(arrayBufferCalls, 1);
    assert.equal(error?.name, 'AbortError');
    assert.equal(error?.message, 'Media cache response body timed out');
    assert.equal(elapsedMs >= 5 && elapsedMs < 80, true);
    await delay(10);
    assert.equal(plugin._mediaCacheAbortControllers?.size || 0, 0);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('cacheImage with stalled stream and no AbortController does not write a file', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const state = {
      reads: 0,
      cancelled: false,
      released: false,
      cancelReason: null
    };
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-no-abort-cacheimage-'));
    global.BdApi.Net = undefined;
    global.AbortController = undefined;
    const plugin = createMediaCachePlugin(cacheDir, {
      _mediaCacheBodyIdleTimeoutMs: 10,
      _mediaCacheMaxAttempts: 1,
      _mediaCacheRetryDelayMs: 0
    });
    plugin.settings.forceLegacyMediaFetching = true;
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: name => name === 'content-type' ? 'image/png' : null },
      body: {
        getReader: () => ({
          async read() {
            state.reads += 1;
            if (state.reads === 1) {
              return { done: false, value: new Uint8Array([0x4d]) };
            }
            return new Promise(() => {});
          },
          cancel(reason) {
            state.cancelled = true;
            state.cancelReason = reason;
          },
          releaseLock() {
            state.released = true;
          }
        })
      }
    });
    await plugin.cacheImage(
      'https://cdn.example/no-abort-cacheimage.png',
      0,
      50,
      'no-abort-cacheimage-message',
      'channel',
      'guild'
    );
    await delay(10);
    assert.equal(state.cancelled, true);
    assert.equal(state.released, true);
    assert.equal(state.cancelReason?.message, 'Media cache response body timed out');
    assert.equal(state.reads, 2);
    assert.equal(plugin._mediaCacheAbortControllers?.size || 0, 0);
    assert.equal(fs.existsSync(path.join(cacheDir, '50 (no-abort-cacheimage-message).png')), false);
    fs.rmSync(cacheDir, { force: true, recursive: true });
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('non-200 cacheImage responses release body before retrying', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-image-retry-'));
  const events = [];
  let attempts = 0;
  try {
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const plugin = createMediaCachePlugin(cacheDir, {
      _mediaCacheMaxAttempts: 2,
      _mediaCacheRetryDelayMs: 0
    });
    const url = 'https://cdn.example/non-200-retry.png';
    plugin.settings.debugLogging = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    const payload = new Uint8Array([0xde, 0xad]).buffer;
    plugin.fetchMediaNetworkResponse = async (_url, _options, requestContext) => {
      attempts += 1;
      events.push(`fetch-${attempts}`);
      plugin._startMediaNetworkTransport(requestContext, 'legacy');
      if (attempts === 1) {
        return {
          ok: false,
          status: 500,
          headers: { get: () => 'image/png' },
          releaseBody: () => {
            events.push('release-1');
          }
        };
      }
      if (attempts === 2) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => payload
        };
      }
      assert.fail(`unexpected retry attempt ${attempts}`);
    };
    await plugin.cacheImage(
      url,
      0,
      51,
      'non-200-retry-message',
      'channel',
      'guild',
      0,
      plugin._mediaCacheWriteEpoch || 0,
      'confirmed'
    );
    assert.deepEqual(events, ['fetch-1', 'release-1', 'fetch-2']);
    assert.equal(attempts, 2);
    assert.equal(fs.existsSync(path.join(cacheDir, '51 (non-200-retry-message).png')), true);
    const terminal = mediaNetworkDebugMessages(url).filter(message => message.includes(' terminal '));
    assert.equal(terminal.length, 2);
    assert.match(terminal[0], /Media request #1 .+ \(legacy\) terminal outcome=http-error status=500 bytes=0 durationMs=\d+/);
    assert.match(terminal[1], /Media request #2 .+ \(legacy\) terminal outcome=success status=200 bytes=2 durationMs=\d+/);
    fs.rmSync(cacheDir, { force: true, recursive: true });
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('cacheImage retries an ENOENT write after recreating a removed destination directory', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-image-enoent-write-'));
  const messageId = 'enoent-write-message';
  const url = 'https://cdn.example/enoent-write.png';
  let fetches = 0;
  let ensureCalls = 0;
  try {
    global.BdApi.Net = undefined;
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    global.fetch = async () => {
      fetches += 1;
      return successfulMediaResponse();
    };
    const plugin = createMediaCachePlugin(cacheDir, {
      _mediaCacheMaxAttempts: 2,
      _mediaCacheRetryDelayMs: 0,
      messageRecord: {
        [messageId]: { message: { id: messageId } }
      }
    });
    plugin.settings.forceLegacyMediaFetching = true;
    const ensureDirectory = plugin.ensureMediaCacheDirectory.bind(plugin);
    plugin.ensureMediaCacheDirectory = directory => {
      ensureCalls += 1;
      ensureDirectory(directory);
      if (ensureCalls === 1) fs.rmSync(directory, { recursive: true, force: true });
    };

    await plugin.cacheImage(url, 0, 52, messageId, 'channel', 'guild');

    assert.equal(ensureCalls, 2);
    assert.equal(fetches, 2, 'the write failure must refetch on its retry');
    assert.equal(fs.existsSync(path.join(cacheDir, `52 (${messageId}).png`)), true);
    assert.deepEqual(loggerEvents.filter(entry => entry[0] === 'error'), []);
  } finally {
    fs.rmSync(cacheDir, { force: true, recursive: true });
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('non-aborting environment still supports logical request timeout cancellation', async () => {
  const originalFetch = global.fetch;
  const originalNetApi = global.BdApi.Net;
  const OriginalAbortController = global.AbortController;
  try {
    global.BdApi.Net = undefined;
    global.AbortController = undefined;
    const plugin = createMediaCachePlugin('');
    plugin.settings.forceLegacyMediaFetching = true;
    plugin._mediaCacheFetchTimeoutMs = 5;
    global.fetch = () => new Promise(() => {});
    let error;
    try {
      await plugin.fetchMediaCacheResponse('https://cdn.example/no-abort-controller');
      assert.fail('timeout should abort even without native AbortController');
    } catch (thrown) {
      error = thrown;
    }
    assert.equal(error?.name, 'AbortError');
    assert.equal(/timed out/.test(error?.message || ''), true);
    assert.equal(error?.message, 'Media cache request timed out');
  } finally {
    global.fetch = originalFetch;
    global.BdApi.Net = originalNetApi;
    global.AbortController = OriginalAbortController;
  }
});

test('cache-off and stop abort active body reads and prevent late writes', async () => {
  const originalFetch = global.fetch;
  const originalDocument = global.document;
  const OriginalAbortController = global.AbortController;
  global.document = { querySelector: () => null, removeEventListener() {} };
  try {
    for (const action of ['cache-off', 'stop']) {
      let capturedSignal;
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-body-abort-'));
      let fetches = 0;
      const cleanup = () => fs.rmSync(cacheDir, { force: true, recursive: true });
      const messageId = `${action}-body-message`;
      global.AbortController = class {
        constructor() { return mockAbortControllerWithSignalCapture().controller; }
      };
      const plugin = createMediaCachePlugin(cacheDir, {
        _mediaCacheBodyIdleTimeoutMs: 10,
        _mediaCacheMaxAttempts: 3,
        _mediaCacheRetryDelayMs: 0
      });
      const url = `https://cdn.example/${action}-body.png`;
      plugin.settings.debugLogging = true;
      plugin.settings.detailedMediaNetworkDebug = true;
      let responseState;
      global.fetch = async (_url, options) => {
        capturedSignal = options?.signal;
        fetches += 1;
        const created = createStreamResponse([
          createStreamChunkStep({ done: false, value: new Uint8Array([0x4d]) }, 0),
          () => new Promise(() => {})
        ]);
        responseState = created.state;
        return created.response;
      };
      const write = plugin.cacheImage(
        url,
        0,
        action === 'cache-off' ? 40 : 41,
        messageId,
        'channel',
        'guild'
      );
      await setImmediatePromise();
      assert.equal(capturedSignal?.aborted, false);
      if (action === 'cache-off') {
        plugin.settings.cacheAllImages = false;
        plugin.handleMediaCachingSetting(false);
      } else {
        plugin.stop();
      }
      assert.equal(capturedSignal?.aborted, true, `${action} must abort active body fetch`);
      await write;
      assert.equal(responseState?.cancelled, true, `${action} must cancel active stream`);
      assert.equal(fetches, 1, `${action} must perform one fetch with no retries`);
      assert.equal(fs.existsSync(path.join(cacheDir, `${action === 'cache-off' ? 40 : 41} (${messageId}).png`)), false);
      const terminal = mediaNetworkDebugMessages(url).filter(message => message.includes(' terminal '));
      assert.equal(terminal.length, 1, `${action} must emit one terminal outcome`);
      assert.match(terminal[0], /\(legacy\) terminal outcome=cancelled status=200 bytes=1 durationMs=\d+/);
      cleanup();
    }
  } finally {
    global.fetch = originalFetch;
    global.document = originalDocument;
    global.AbortController = OriginalAbortController;
  }
});

test('same-instance restart prevents stale body readers from writing cached files', async () => {
  const originalFetch = global.fetch;
  const originalDocument = global.document;
  const OriginalAbortController = global.AbortController;
  try {
    global.document = { querySelector: () => null, removeEventListener() {} };
    global.AbortController = class {
      constructor() { return mockAbortControllerWithSignalCapture().controller; }
    };
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-stop-restart-body-'));
    try {
      const gate = defer();
      let responseState;
      const plugin = createMediaCachePlugin(cacheDir, {
        _mediaCacheBodyIdleTimeoutMs: 50,
        _mediaCacheMaxAttempts: 1,
        _mediaCacheRetryDelayMs: 0
      });
      global.fetch = async () => {
        const { response, state } = createStreamResponse([
          async () => {
            await gate.promise;
            return { done: false, value: new Uint8Array([0x4d]) };
          },
          { done: true }
        ]);
        responseState = state;
        return response;
      };
      const write = plugin.cacheImage('https://cdn.example/restarted-body-stream.png', 0, 42, 'message', 'channel', 'guild');
      await setImmediatePromise();
      plugin.stop();
      plugin.__started = true;
      gate.resolve();
      await write;
      assert.equal(responseState?.cancelled, true);
      assert.equal(fs.existsSync(path.join(cacheDir, `42 (message).png`)), false);
    } finally {
      fs.rmSync(cacheDir, { force: true, recursive: true });
    }
  } finally {
    global.fetch = originalFetch;
    global.document = originalDocument;
    global.AbortController = OriginalAbortController;
  }
});

test('404 and 403 responses release the response body before leaving cacheImage', async () => {
  const originalFetch = global.fetch;
  const originalNetApi = global.BdApi.Net;
  for (const status of [403, 404]) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-non-ok-release-'));
    const cleanup = () => fs.rmSync(cacheDir, { force: true, recursive: true });
    try {
      let released = 0;
      const plugin = createMediaCachePlugin(cacheDir, {
        _mediaCacheMaxAttempts: 1
      });
      const messageId = `${status}-message`;
      global.fetch = async () => ({
        ok: false,
        status,
        headers: { get: () => 'image/png' },
        releaseBody: async () => { released += 1; }
      });
      plugin.settings.forceLegacyMediaFetching = true;
      await plugin.cacheImage(
        `https://cdn.example/${status}.png`,
        0,
        status,
        messageId,
        'channel',
        'guild'
      );
      assert.equal(released, 1, `releaseBody must run for HTTP ${status}`);
      assert.equal(fs.existsSync(path.join(cacheDir, `${status} (${messageId}).png`)), false);
    } finally {
      cleanup();
    }
  }
  global.fetch = originalFetch;
  global.BdApi.Net = originalNetApi;
});

function defer() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function setImmediatePromise() {
  return new Promise(resolve => setImmediate(resolve));
}

function createSavedAttachmentTransitionDom(channelId, messageId, placeholderContent) {
  let content = {
    id: `message-content-${messageId}`,
    textContent: placeholderContent
  };
  const row = {
    id: `chat-messages-${channelId}-${messageId}`,
    contains(node) { return node === content; },
    querySelector(selector) {
      return selector === `#${content.id}` || selector === `[id="${content.id}"]`
        ? content
        : null;
    }
  };
  const nodes = new Map([
    [row.id, row],
    [content.id, content]
  ]);
  return {
    get content() {
      return content;
    },
    replaceContentNode(text) {
      content = {
        ...content,
        textContent: text
      };
      nodes.set(content.id, content);
      return content;
    },
    document: {
      getElementById(id) {
        return nodes.get(id) || null;
      }
    },
    row
  };
}

function createSavedAttachmentTransitionObserverHarness() {
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnectCalls = 0;
      this.disconnected = false;
      this.observed = null;
      observers.push(this);
    }
    observe(target, options) {
      this.observed = { target, options };
    }
    disconnect() {
      this.disconnectCalls += 1;
      this.disconnected = true;
    }
    trigger() {
      this.callback([]);
    }
  }
  return { FakeMutationObserver, observers };
}

function createSavedAttachmentTransitionFixture(dispatches) {
  let blobUrl = 'blob://cached/Synology_AUX.png';
  const message = {
    id: '710',
    channel_id: '710',
    content: '',
    attachments: [{
      id: '710',
      filename: 'Synology_AUX.png',
      url: 'https://cdn.discordapp.com/attachments/710/710/Synology_AUX.png'
    }]
  };
  const messageStoreMessage = {
    id: '710',
    channel_id: '710',
    content: '[Not cached: Synology_AUX.png]',
    attachments: [{
      id: '710',
      filename: 'Synology_AUX.png',
      url: 'blob://store-existing/Synology_AUX.png'
    }]
  };
  const record = {
    delete_data: { time: 1, forum_thread_message_delete: true },
    message
  };
  const plugin = createPlugin({
    messageRecord: { '710': record },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    messageStore: {
      getMessage(channelId, messageId) {
        if (String(channelId) === String(message.channel_id) && String(messageId) === String(message.id)) {
          return messageStoreMessage;
        }
        return null;
      }
    },
    tools: {
      getChannel: () => ({ id: '710', type: 11 })
    },
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    invalidateChannelCache() {},
    cacheChannelMessages() {},
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/710.png',
      get: () => blobUrl,
      cleanUp() {}
    }
  });
  plugin.shouldPresentSavedMessage = () => true;
  return {
    message,
    messageStoreMessage,
    plugin,
    record,
    setBlobUrl(nextBlobUrl) {
      blobUrl = nextBlobUrl;
    }
  };
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

test('reAddDeletedMessages keeps attachment-only cache-master-off records as placeholder text rows', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: false
    },
    messageRecord: {
      '101': {
        delete_data: { time: 1 },
        message: {
          id: '101',
          channel_id: 'channel',
          content: '',
          attachments: [
            {
              id: 'a',
              filename: 'photo.png',
              url: 'https://cdn.discordapp.com/attachments/channel/101/photo.png',
              proxy_url: 'https://media.discordapp.net/attachments/channel/101/photo.png'
            }
          ]
        }
      },
      '102': {
        delete_data: { time: 1 },
        message: {
          id: '102',
          channel_id: 'channel',
          content: 'kept text',
          attachments: [
            {
              id: 'b',
              filename: 'notes.txt',
              url: 'https://cdn.discordapp.com/attachments/channel/102/notes.txt'
            }
          ]
        }
      }
    }
  });

  const attachmentOnlyBefore = structuredClone(plugin.messageRecord['101'].message);
  const textBefore = structuredClone(plugin.messageRecord['102'].message);

  const messages = [];
  plugin.reAddDeletedMessages(messages, ['101', '102'], true, true);

  const rowsById = new Map(messages.map(msg => [msg.id, msg]));
  const attachmentOnlyRow = rowsById.get('101');
  const textSiblingRow = rowsById.get('102');

  assert.equal(messages.length, 2);
  assert.equal(attachmentOnlyRow?.content, '[Not cached: photo.png]');
  assert.equal(textSiblingRow?.id, '102');
  assert.equal(textSiblingRow?.content, 'kept text\n[Not cached: notes.txt]');
  assert.deepEqual(plugin.messageRecord['101'].message, attachmentOnlyBefore);
  assert.deepEqual(plugin.messageRecord['102'].message, textBefore);
});

test('reAddDeletedMessages local-only keeps cached blob rows and labels missing attachment-only rows', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: attachmentId => attachmentId === '300' ? '/cache/300.png' : null,
      get: cacheUrl => {
        if (cacheUrl === 'http://localhost:7474/300.png#channel,300,301') return 'blob://local/cached/image-300';
        return null;
      }
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    messageRecord: {
      '301': {
        delete_data: { time: 1 },
        message: {
          id: '301',
          channel_id: 'channel',
          content: '',
          attachments: [
            {
              id: '300',
              filename: 'photo.png',
              url: 'https://cdn.discordapp.com/attachments/channel/301/photo.png',
              proxy_url: 'https://media.discordapp.net/attachments/channel/301/photo.png'
            },
            {
              id: '301',
              filename: 'notes.txt',
              url: 'https://cdn.discordapp.com/attachments/channel/301/notes.txt'
            }
          ]
        }
      }
    }
  });

  const before = structuredClone(plugin.messageRecord['301'].message);
  const messages = [];

  plugin.reAddDeletedMessages(messages, ['301'], true, true);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].attachments.length, 1);
  assert.equal(messages[0].attachments[0].id, '300');
  assert.equal(messages[0].attachments[0].url, 'blob://local/cached/image-300');
  assert.equal(messages[0].content, '[Not cached: notes.txt]');
  assert.deepEqual(plugin.messageRecord['301'].message, before);
});

test('reAddDeletedMessages remote-first has no label before native failure, then exact label after failure without cached blob', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/400.png',
      get: () => null
    },
    messageRecord: {
      '401': {
        delete_data: { time: 1 },
        message: {
          id: '401',
          channel_id: 'channel',
          content: 'remote cache-on',
          attachments: [
            {
              id: '400',
              filename: 'photo.png',
              url: 'https://cdn.discordapp.com/attachments/channel/401/photo.png',
              proxy_url: 'https://media.discordapp.net/attachments/channel/401/photo.png'
            }
          ]
        }
      }
    }
  });

  const before = structuredClone(plugin.messageRecord['401'].message);
  const beforeFailure = [];
  plugin.reAddDeletedMessages(beforeFailure, ['401'], true, true);

  assert.equal(beforeFailure.length, 1);
  assert.equal(beforeFailure[0].content, 'remote cache-on');
  assert.equal(beforeFailure[0].attachments.length, 1);
  assert.equal(beforeFailure[0].attachments[0].url, 'https://cdn.discordapp.com/attachments/channel/401/photo.png');

  const failureKey = plugin.getSavedAttachmentMediaFailureKey(
    beforeFailure[0].channel_id,
    beforeFailure[0].id,
    '400'
  );
  plugin._failedNativeAttachmentMediaKeys = new Set([failureKey]);

  const afterFailure = [];
  plugin.reAddDeletedMessages(afterFailure, ['401'], true, true);

  assert.equal(afterFailure.length, 1);
  assert.equal(afterFailure[0].content, 'remote cache-on\n[Deleted: photo.png]');
  assert.equal(afterFailure[0].attachments.length, 0);
  assert.deepEqual(plugin.messageRecord['401'].message, before);
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

test('has:image includes removed image uploads but excludes removed non-image files', () => {
  const imageId = 'removed-image';
  const documentId = 'removed-document';
  const channelId = 'channel';
  const saved = (id, removedAttachment, timestamp) => ({
    message: {
      id,
      channel_id: channelId,
      content: 'current content',
      attachments: [],
      embeds: [],
      components: [],
      timestamp
    },
    edit_history: [{ content: 'before removal', time: 300 }],
    removed_attachments: [removedAttachment]
  });
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, reverseOrder: false },
    messageRecord: {
      [imageId]: saved(imageId, {
        id: 'image-attachment',
        filename: 'removed.gif',
        url: 'https://cdn.example/removed.gif'
      }, 100),
      [documentId]: saved(documentId, {
        id: 'document-attachment',
        filename: 'removed.pdf',
        url: 'https://cdn.example/removed.pdf',
        content_type: 'application/pdf'
      }, 200)
    },
    editedMessageRecord: { [channelId]: [imageId, documentId] },
    deletedMessageRecord: {},
    purgedMessageRecord: {},
    nukedMessageRecord: {},
    menu: { selectedTab: 'edited', filter: 'has:image' }
  });

  assert.deepEqual(plugin.getFilteredMessages(), [imageId]);
});

test('edit-history marker lookup matches removed attachments by exact url/id and avoids reusing matches in one edit', () => {
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, reverseOrder: false },
    messageRecord: {
      100: {
        message: { id: '100', channel_id: 'channel', content: 'current' },
        removed_attachments: [
          {
            id: '111111111111111111',
            filename: 'first.gif',
            url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif?token=a'
          },
          {
            id: '222222222222222222',
            filename: 'second.mp4',
            url: 'https://cdn.discordapp.com/attachments/channel/222222222222222222/second.mp4'
          },
          {
            id: '333333333333333333',
            filename: 'third.pdf',
            url: 'https://cdn.discordapp.com/attachments/channel/333333333333333333/third.pdf'
          }
        ],
        edit_history: []
      }
    }
  });

  const removed = plugin.messageRecord['100'].removed_attachments;
  const used = new Set();
  const first = plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif?download=1',
    removed,
    used
  );
  if (first?.id) used.add(plugin.getRemovedAttachmentIdentity(first));
  const second = plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif?download=2',
    removed,
    used
  );
  const third = plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://media.discordapp.net/attachments/channel/222222222222222222/second.mp4',
    removed,
    used
  );
  const unmatched = plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://cdn.discordapp.com/attachments/channel/111111111111111112/missing.gif',
    removed,
    used
  );

  assert.equal(first?.id, '111111111111111111');
  assert.equal(second, null);
  assert.equal(third?.id, '222222222222222222');
  assert.equal(unmatched, null);
  assert.equal(plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://media.discordapp.net/attachments/channel/111111111111111111/first.gif?query=2',
    [
      { id: '111111111111111111', filename: 'first.gif', url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif' }
    ],
    null
  )?.id, '111111111111111111');
  assert.equal(plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://cdn.discordapp.com/attachments/channel/444444444444444444/first.gif',
    [
      { id: '111111111111111111', filename: 'first.gif', url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif' }
    ],
    null
  ), null);
  assert.equal(plugin.getRemovedAttachmentFromEditHistoryMarker(
    'https://example.com/attachments/channel/111111111111111111/first.gif',
    removed,
    null
  ), null);
});

test('edit-history inline segments replace matched markers with exact placeholders when cache master is off', () => {
  const plugin = createPlugin({
    settings: { cacheAllImages: false }
  });
  const message = {
    id: '100',
    channel_id: 'channel'
  };
  const removedAttachments = [
    {
      id: '111111111111111111',
      filename: 'first.gif',
      url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif',
      proxy_url: 'https://media.discordapp.net/attachments/channel/111111111111111111/first.gif'
    },
    {
      id: '222222222222222222',
      filename: 'second.mp4',
      url: 'https://cdn.discordapp.com/attachments/channel/222222222222222222/second.mp4',
      proxy_url: 'https://media.discordapp.net/attachments/channel/222222222222222222/second.mp4'
    },
    {
      id: '333333333333333333',
      filename: 'third.pdf',
      url: 'https://cdn.discordapp.com/attachments/channel/333333333333333333/third.pdf',
      proxy_url: 'https://media.discordapp.net/attachments/channel/333333333333333333/third.pdf'
    }
  ];
  const before = structuredClone({ message, removedAttachments });
  const content = '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/222222222222222222/second.mp4'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/333333333333333333/third.pdf'
    + '` `Attachment Deleted: `https://example.com/attachments/channel/444444444444444444/missing.txt';

  const segments = plugin.getEditHistoryContentSegments(content, removedAttachments, message);

  assert.equal(segments.filter(segment => segment.kind === 'removedAttachment').length, 0);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[Not cached: first.gif]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[Not cached: second.mp4]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[Not cached: third.pdf]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('missing.txt')), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('cdn.discordapp.com/attachments/channel/111111111111111111/first.gif')), false);
  assert.deepEqual(removedAttachments, before.removedAttachments);
  assert.deepEqual(message, before.message);
});

test('edit-history inline segments keep text for non-media/unmatched and preserve input markers when planning remote-first', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    }
  });
  const message = {
    id: '100',
    channel_id: 'channel'
  };
  const removedAttachments = [
    {
      id: '111111111111111111',
      filename: 'first.gif',
      url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif',
      proxy_url: 'https://media.discordapp.net/attachments/channel/111111111111111111/first.gif'
    },
    {
      id: '222222222222222222',
      filename: 'second.webm',
      // proxy-only selection.
      proxy_url: 'https://media.discordapp.net/attachments/channel/222222222222222222/second.webm'
    },
    {
      id: '333333333333333333',
      filename: 'third.pdf',
      url: 'https://cdn.discordapp.com/attachments/channel/333333333333333333/third.pdf',
      proxy_url: 'https://media.discordapp.net/attachments/channel/333333333333333333/third.pdf'
    }
  ];
  const before = structuredClone({ message, removedAttachments });
  const content = '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif'
    + '` `Attachment Deleted: `https://media.discordapp.net/attachments/channel/222222222222222222/second.webm'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/333333333333333333/third.pdf'
    + '` `Attachment Deleted: `https://media.discordapp.net/attachments/channel/444444444444444444/missing.mp4';
  const segments = plugin.getEditHistoryContentSegments(content, removedAttachments, message);
  const removedSegments = segments.filter(segment => segment.kind === 'removedAttachment');

  assert.equal(removedSegments.length, 0);
  for (const name of ['first.gif', 'second.webm', 'third.pdf', 'missing.mp4']) {
    assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes(name)), true);
  }
  assert.deepEqual(removedAttachments, before.removedAttachments);
  assert.deepEqual(message, before.message);
});

test('edit-history inline segments emit cached Blob plans with exact fallbacks and classify missing local-only attachments', () => {
  const requestLog = [];
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension) => {
        if (attachmentId === '444444444444444444') return null;
        if (attachmentId === '555555555555555555') return null;
        return `/tmp/${attachmentId}${extension}`;
      },
      get: url => {
        requestLog.push(url);
        return `blob:${url}`;
      }
    }
  });
  const message = {
    id: '100',
    channel_id: 'channel'
  };
  const removedAttachments = [
    {
      id: '111111111111111111',
      filename: 'first.gif',
      url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif',
      proxy_url: 'https://media.discordapp.net/attachments/channel/111111111111111111/first.gif'
    },
    {
      id: '222222222222222222',
      filename: 'second.mp4',
      url: 'https://cdn.discordapp.com/attachments/channel/222222222222222222/second.mp4',
      proxy_url: 'https://media.discordapp.net/attachments/channel/222222222222222222/second.mp4'
    },
    {
      id: '444444444444444444',
      filename: 'missing.gif',
      url: 'https://cdn.discordapp.com/attachments/channel/444444444444444444/missing.gif',
      proxy_url: 'https://media.discordapp.net/attachments/channel/444444444444444444/missing.gif'
    },
    {
      id: '555555555555555555',
      filename: 'third.pdf',
      url: 'https://cdn.discordapp.com/attachments/channel/555555555555555555/third.pdf',
      proxy_url: 'https://media.discordapp.net/attachments/channel/555555555555555555/third.pdf'
    }
  ];
  const before = structuredClone({ message, removedAttachments });
  const content = '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/222222222222222222/second.mp4'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/444444444444444444/missing.gif'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/555555555555555555/third.pdf';
  const segments = plugin.getEditHistoryContentSegments(content, removedAttachments, message);
  const removedSegments = segments.filter(segment => segment.kind === 'removedAttachment');

  assert.equal(removedSegments.length, 2);
  assert.equal(removedSegments.every(segment => segment.presentationPlan?.action === 'blob'), true);
  assert.equal(removedSegments.every(segment => segment.presentationPlan?.url?.startsWith('blob:')), true);
  assert.equal(removedSegments[0]?.value, '[image:first.gif]');
  assert.equal(removedSegments[1]?.value, '[attachment:second.mp4]');
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[Not cached: missing.gif]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[Not cached: third.pdf]'), true);
  assert.equal(requestLog.length >= 1, true);
  assert.equal(requestLog.every(url => !url.startsWith('http://cdn.discordapp.com') && !url.startsWith('https://media.discordapp.net')), true);
  assert.deepEqual(removedAttachments, before.removedAttachments);
  assert.deepEqual(message, before.message);
});

test('edit-history inline segment planning is per-edit and reused markers stay deterministic per pass', () => {
  const removed = [
    { id: '111111111111111111', filename: 'first.gif', url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif' },
    { id: '222222222222222222', filename: 'second.gif', url: 'https://cdn.discordapp.com/attachments/channel/222222222222222222/second.gif' }
  ];
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, reverseOrder: false },
    imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' }
  });
  const firstEdit = plugin.getEditHistoryContentSegments(
    '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif',
    removed,
    { id: '100', channel_id: 'channel' }
  );
  const secondEdit = plugin.getEditHistoryContentSegments(
    '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/222222222222222222/second.gif',
    removed,
    { id: '100', channel_id: 'channel' }
  );
  const duplicateInOneEdit = plugin.getEditHistoryContentSegments(
    '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif '
    + '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif',
    removed,
    { id: '100', channel_id: 'channel' }
  );

  assert.equal(firstEdit.filter(segment => segment.kind === 'removedAttachment').length, 1);
  assert.equal(secondEdit.filter(segment => segment.kind === 'removedAttachment').length, 1);
  assert.equal(firstEdit[0]?.attachment?.id, '111111111111111111');
  assert.equal(secondEdit[0]?.attachment?.id, '222222222222222222');
  assert.equal(duplicateInOneEdit.filter(segment => segment.kind === 'removedAttachment').length, 1);
  assert.equal(duplicateInOneEdit.some(segment => segment.kind === 'text' && segment.value.includes('first.gif')), false);
});

test('cache-only rendering omits native attachments when master is off and exposes exact placeholder labels', () => {
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'img-id',
        filename: 'photo.png',
        url: 'https://cdn.discordapp.com/attachments/channel/111/photo.png',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/photo.png'
      },
      {
        id: 'txt-id',
        filename: 'notes.txt',
        url: 'https://cdn.discordapp.com/attachments/channel/111/notes.txt',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/notes.txt'
      }
    ]
  };
  const canonicalBefore = structuredClone(message);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { exists: () => false }
  });
  const rendered = plugin.getCacheOnlyMessage(message);
  const firstPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, {});
  const secondPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[1], message, {});

  assert.equal(rendered.content, 'body');
  assert.equal(rendered.attachments.length, 0);
  assert.equal(firstPlan.action, 'placeholder');
  assert.equal(firstPlan.label, '[image:photo.png]');
  assert.equal(secondPlan.action, 'placeholder');
  assert.equal(secondPlan.label, '[attachment:notes.txt]');
  assert.deepEqual(message, canonicalBefore);
});

test('cache-only rendering uses direct, then proxy media URLs when master is on and local-only is off', () => {
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'img-id',
        filename: 'photo.png',
        url: 'https://cdn.discordapp.com/attachments/channel/111/photo.png',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/photo.png'
      },
      {
        id: 'proxy-id',
        filename: 'fallback.jpg',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/fallback.jpg'
      },
      { id: 'no-url-id', filename: 'missing.png' }
    ]
  };
  const canonicalBefore = structuredClone(message);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { exists: () => false }
  });
  const rendered = plugin.getCacheOnlyMessage(message);
  const firstPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowRemote: true });
  const secondPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[1], message, { allowRemote: true });
  const thirdPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[2], message, { allowRemote: true });

  assert.equal(rendered.content, 'body');
  assert.equal(rendered.attachments.length, 2);
  assert.equal(firstPlan.action, 'remote');
  assert.equal(firstPlan.url, 'https://cdn.discordapp.com/attachments/channel/111/photo.png');
  assert.equal(firstPlan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/111/photo.png');
  assert.equal(secondPlan.action, 'remote');
  assert.equal(secondPlan.url, 'https://cdn.discordapp.com/attachments/channel/111/fallback.jpg');
  assert.equal(secondPlan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/111/fallback.jpg');
  assert.equal(thirdPlan.action, 'omit');
  assert.deepEqual(rendered.attachments[0].url, firstPlan.url);
  assert.equal(rendered.attachments[0].proxy_url, firstPlan.url);
  assert.equal(rendered.attachments[1].url, secondPlan.url);
  assert.equal(rendered.attachments[1].proxy_url, secondPlan.url);
  assert.deepEqual(message, canonicalBefore);
});

test('saved attachment presentation plans expose policy, candidate-failure, and cached fallback reasons', () => {
  const attachment = {
    id: 'plan-image',
    filename: 'photo.png',
    url: 'https://cdn.discordapp.com/attachments/plan-channel/plan-image/photo.png',
    proxy_url: 'https://media.discordapp.net/attachments/plan-channel/plan-image/photo.png'
  };
  const message = {
    id: 'plan-message',
    channel_id: 'plan-channel',
    attachments: [attachment]
  };
  const settings = (cacheAllImages = true) => ({
    cacheAllImages,
    newSaveAllFileTypes: false,
    onlyRenderCachedAttachments: false
  });

  let plugin = createPlugin({ settings: settings(false) });
  let plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(plan.action, 'placeholder');
  assert.equal(plan.unavailableReason, 'policy');
  assert.equal(plan.unavailableLabel, '[Not cached: photo.png]');
  assert.equal(plan.label, '[image:photo.png]');

  plugin = createPlugin({
    settings: settings(),
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/plan-image.png',
      get: () => null
    }
  });
  plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowBlob: true });
  assert.equal(plan.action, 'omit');
  assert.equal(plan.unavailableReason, 'policy');
  assert.equal(plan.unavailableLabel, '[Not cached: photo.png]');
  assert.equal(plan.label, '[image:photo.png]');

  plugin = createPlugin({ settings: settings() });
  plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(plan.action, 'remote');
  assert.equal(plan.unavailableReason, null);
  assert.equal(plan.unavailableLabel, '[Not cached: photo.png]');
  assert.equal(plan.label, '[image:photo.png]');
  const candidates = [...plan.sources];
  assert.equal(candidates.length > 0, true);
  for (let index = 0; index < candidates.length; index++) {
    assert.equal(
      plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, candidates[index]),
      true
    );
    plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
    if (index < candidates.length - 1) {
      assert.equal(plan.action, 'remote');
      assert.equal(plan.url, candidates[index + 1]);
      assert.equal(plan.unavailableReason, null);
      assert.equal(plan.unavailableLabel, '[Not cached: photo.png]');
      assert.equal(plan.label, '[image:photo.png]');
    }
  }
  assert.equal(plan.action, 'omit');
  assert.equal(plan.unavailableReason, 'remote-failed');
  assert.equal(plan.unavailableLabel, '[Deleted: photo.png]');
  assert.equal(plan.label, '[image:photo.png]');

  const cachedBlobAvailable = true;
  plugin = createPlugin({
    settings: settings(),
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/plan-image.png',
      get: () => cachedBlobAvailable ? 'blob://local/plan-image' : null
    }
  });
  plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  for (const candidate of plan.sources) {
    assert.equal(
      plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, candidate),
      true
    );
  }
  plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(plan.action, 'blob');
  assert.equal(plan.url, 'blob://local/plan-image');
  assert.equal(plan.unavailableReason, null);
  assert.equal(plan.unavailableLabel, '[Deleted: photo.png]');
  assert.equal(plan.label, '[image:photo.png]');

  const noCandidateAttachment = {
    id: 'plan-missing',
    filename: 'missing.png'
  };
  const noCandidateMessage = {
    id: 'plan-missing-message',
    channel_id: 'plan-channel',
    attachments: [noCandidateAttachment]
  };
  plugin = createPlugin({
    settings: settings(),
    imageCacheServerSimulator: {
      _resolveImagePath: () => null,
      get: () => null
    }
  });
  plan = plugin.getSavedAttachmentPresentationPlan(
    noCandidateAttachment,
    noCandidateMessage,
    { allowRemote: true }
  );
  assert.equal(plan.action, 'omit');
  assert.equal(plan.unavailableReason, 'no-candidate');
  assert.equal(plan.unavailableLabel, '[Not cached: missing.png]');
  assert.equal(plan.label, '[image:missing.png]');

  plugin = createPlugin({
    settings: settings(),
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/plan-missing.png',
      get: () => 'blob://local/plan-missing'
    }
  });
  plan = plugin.getSavedAttachmentPresentationPlan(
    noCandidateAttachment,
    noCandidateMessage,
    { allowRemote: true }
  );
  assert.equal(plan.action, 'blob');
  assert.equal(plan.url, 'blob://local/plan-missing');
  assert.equal(plan.unavailableReason, null);
  assert.equal(plan.unavailableLabel, '[Not cached: missing.png]');
  assert.equal(plan.label, '[image:missing.png]');
});

test('saved media React components carry unavailable labels through remote and error fallback state', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'),
    'utf8'
  );
  const videoStart = source.indexOf('const SavedAttachmentPresentationVideo');
  const videoEnd = source.indexOf('SavedAttachmentPresentationVideo.displayName', videoStart);
  const videoSource = source.slice(videoStart, videoEnd);
  assert.ok(videoSource.includes('unavailableLabel: typeof presentationPlan?.unavailableLabel'));
  assert.ok(videoSource.indexOf('plan?.unavailableLabel') < videoSource.indexOf('plan?.label'));
  assert.ok(videoSource.includes('unavailableLabel: nextPlan.unavailableLabel'));

  const editStart = source.indexOf('const EditHistoryMedia');
  const editEnd = source.indexOf('EditHistoryMedia.displayName', editStart);
  const editSource = source.slice(editStart, editEnd);
  assert.ok(editSource.includes('unavailableLabel: initialUnavailableLabel'));
  assert.ok(editSource.includes('setErrorFallbackForPlan'));
  assert.ok(editSource.includes('setErrorFallback(label ? parseContent(label) : fallback)'));
  assert.ok(editSource.includes('unavailableLabel: nextPlan.unavailableLabel'));
});

test('Logger attachment rendering carries unavailable labels through every media fallback path', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'),
    'utf8'
  );
  const populateStart = source.indexOf('populateParent(parent, messages)');
  const populateEnd = source.indexOf('\n  refilterMessages()', populateStart);
  const populateSource = source.slice(populateStart, populateEnd);
  assert.ok(populateSource.includes('getPresentationFallbackLabel'));
  assert.ok(populateSource.includes('planUnavailableLabel'));
  assert.ok(populateSource.includes('renderedUnavailableLabel'));
  assert.ok(populateSource.includes('renderedAttachment._ml2PresentationLabel'));
  assert.ok(populateSource.includes('renderedAttachment._ml2PresentationUnavailableLabel'));
  assert.ok(populateSource.includes('mediaAttachment._ml2PresentationUnavailableLabel = typeof nextPlan.unavailableLabel'));
  assert.ok(populateSource.includes('attachment._ml2PresentationUnavailableLabel = typeof nextPlan.unavailableLabel'));
  assert.ok(populateSource.includes('getPresentationFallbackLabel(null, attachment, sourceAttachment)'));
});

test('cache-only audio attachments classify as media and keep CDN then proxy ordering', () => {
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'audio-ext',
        filename: 'clip.mp3',
        url: 'https://cdn.discordapp.com/attachments/channel/111/clip.mp3',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/clip.mp3'
      },
      {
        id: 'audio-type',
        filename: 'recording',
        content_type: 'audio/ogg',
        original_content_type: 'audio/ogg',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/recording.ogg'
      }
    ]
  };
  const canonicalBefore = structuredClone(message);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { exists: () => false }
  });

  const firstPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowRemote: true });
  const secondPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[1], message, { allowRemote: true });
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.equal(firstPlan.action, 'remote');
  assert.equal(firstPlan.mediaType, 'audio');
  assert.equal(firstPlan.label, '[attachment:clip.mp3]');
  assert.equal(firstPlan.url, 'https://cdn.discordapp.com/attachments/channel/111/clip.mp3');
  assert.equal(firstPlan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/111/clip.mp3');
  assert.equal(secondPlan.action, 'remote');
  assert.equal(secondPlan.mediaType, 'audio');
  assert.equal(secondPlan.label, '[attachment:recording]');
  assert.equal(secondPlan.url, 'https://cdn.discordapp.com/attachments/channel/111/recording.ogg');
  assert.equal(secondPlan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/111/recording.ogg');
  assert.equal(rendered.attachments.length, 2);
  assert.deepEqual(rendered.attachments[1].url, secondPlan.url);
  assert.deepEqual(message, canonicalBefore);
});

test('cache-only non-media attachments keep remote ordering and canonical identity', () => {
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'txt-ext',
        filename: 'notes.txt',
        url: 'https://cdn.discordapp.com/attachments/channel/txt-ext/notes.txt',
        proxy_url: 'https://media.discordapp.net/attachments/channel/txt-ext/notes.txt'
      },
      {
        id: 'txt-mime',
        filename: 'extensionless-text',
        content_type: 'text/plain; charset=utf-8',
        proxy_url: 'https://media.discordapp.net/attachments/channel/txt-mime/extensionless-text'
      },
      {
        id: 'md-ext',
        filename: 'README.md',
        url: 'https://cdn.discordapp.com/attachments/channel/md-ext/README.md',
        proxy_url: 'https://media.discordapp.net/attachments/channel/md-ext/README.md'
      },
      {
        id: 'md-mime',
        filename: 'extensionless-markdown',
        content_type: 'text/markdown; charset=utf-8',
        original_content_type: 'text/markdown',
        proxy_url: 'https://media.discordapp.net/attachments/channel/md-mime/extensionless-markdown'
      },
      {
        id: 'pdf-ext',
        filename: 'manual.pdf',
        url: 'https://cdn.discordapp.com/attachments/channel/pdf-ext/manual.pdf',
        proxy_url: 'https://media.discordapp.net/attachments/channel/pdf-ext/manual.pdf'
      },
      {
        id: 'pdf-mime',
        filename: 'extensionless-pdf',
        contentType: 'application/pdf; version=1.7',
        proxyURL: 'https://media.discordapp.net/attachments/channel/pdf-mime/extensionless-pdf'
      }
    ]
  };
  const canonicalBefore = structuredClone(message);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { exists: () => false }
  });

  const plans = message.attachments.map(attachment => (
    plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true })
  ));
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.deepEqual(plans.map(plan => plan.mediaType), [
    'attachment', 'attachment', 'attachment', 'attachment', 'attachment', 'attachment'
  ]);
  assert.deepEqual(plans.map(plan => plan.action), ['remote', 'remote', 'remote', 'remote', 'remote', 'remote']);
  assert.equal(plans[0].url, message.attachments[0].url);
  assert.equal(plans[0].fallbackUrl, message.attachments[0].proxy_url);
  assert.equal(
    plans[1].url,
    'https://cdn.discordapp.com/attachments/channel/txt-mime/extensionless-text'
  );
  assert.equal(plans[1].fallbackUrl, message.attachments[1].proxy_url);
  assert.equal(plans[2].url, message.attachments[2].url);
  assert.equal(plans[2].fallbackUrl, message.attachments[2].proxy_url);
  assert.equal(
    plans[3].url,
    'https://cdn.discordapp.com/attachments/channel/md-mime/extensionless-markdown'
  );
  assert.equal(plans[3].fallbackUrl, message.attachments[3].proxy_url);
  assert.equal(plans[4].url, message.attachments[4].url);
  assert.equal(plans[4].fallbackUrl, message.attachments[4].proxy_url);
  assert.equal(
    plans[5].url,
    'https://cdn.discordapp.com/attachments/channel/pdf-mime/extensionless-pdf'
  );
  assert.equal(plans[5].fallbackUrl, message.attachments[5].proxyURL);
  assert.deepEqual(plans.map(plan => plan.label), [
    '[attachment:notes.txt]',
    '[attachment:extensionless-text]',
    '[attachment:README.md]',
    '[attachment:extensionless-markdown]',
    '[attachment:manual.pdf]',
    '[attachment:extensionless-pdf]'
  ]);
  assert.deepEqual(rendered.attachments.map(attachment => attachment.id), [
    'txt-ext', 'txt-mime', 'md-ext', 'md-mime', 'pdf-ext', 'pdf-mime'
  ]);
  assert.deepEqual(message, canonicalBefore);
});

test('cached attachment Blob MIME mapping prefers validated metadata before extension fallback', () => {
  const plugin = createPlugin();
  const expected = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/opus',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf'
  };
  for (const [extension, mimeType] of Object.entries(expected)) {
    assert.equal(plugin.getCachedAttachmentMimeType(extension), mimeType, extension);
  }
  assert.equal(plugin.getCachedAttachmentMimeType('.TXT'), 'text/plain');
  assert.equal(plugin.getCachedAttachmentMimeType('.PDF?ignored'), 'application/pdf');
  assert.equal(plugin.getCachedAttachmentMimeType('.doc'), 'application/octet-stream');
  assert.equal(plugin.getCachedAttachmentMimeType(''), 'application/octet-stream');
  assert.equal(
    plugin.getCachedAttachmentMimeType('.bin', { content_type: 'application/json; charset=utf-8' }),
    'application/json'
  );
  assert.equal(
    plugin.getCachedAttachmentMimeType('.bin', { contentType: 'text/css; charset=utf-8' }),
    'text/css'
  );
  assert.equal(
    plugin.getCachedAttachmentMimeType('.bin', { original_content_type: 'application/octet-stream; version=1' }),
    'application/octet-stream'
  );
  assert.equal(
    plugin.getCachedAttachmentMimeType('.txt', { content_type: 'not a MIME' }),
    'text/plain'
  );
});

test('cache master defaults to enabled when cacheAllImages is undefined', () => {
  const plugin = createPlugin({
    settings: { onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: { exists: () => false }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'img-id',
        filename: 'photo.png',
        url: 'https://cdn.discordapp.com/attachments/channel/111/photo.png',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/photo.png'
      }
    ]
  };
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.equal(rendered.content, 'body');
  assert.equal(rendered.attachments.length, 1);
  assert.equal(rendered.attachments[0].url, 'https://cdn.discordapp.com/attachments/channel/111/photo.png');
});

test('cache-only plan indices remain aligned when malformed attachments are present', () => {
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: { exists: () => false }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: 'img-id-1', filename: 'first.png', url: 'https://cdn.discordapp.com/attachments/channel/111/first.png' },
      null,
      { id: 'img-id-3', filename: 'third.jpg', url: 'https://cdn.discordapp.com/attachments/channel/111/third.jpg' }
    ]
  };
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.equal(rendered.attachments.length, 2);
  assert.equal(rendered.attachments[0].id, 'img-id-1');
  assert.equal(rendered.attachments[1].id, 'img-id-3');
});

test('cache-only rendering uses cached Blob URLs for local media, documents, and generic files', () => {
  const blobMap = new Map([
    ['100', 'blob://local/cached/image-100'],
    ['101', 'blob://local/cached/video-101'],
    ['102', 'blob://local/cached/text-102'],
    ['104', 'blob://local/cached/pdf-104'],
    ['106', 'blob://local/cached/markdown-106'],
    ['105', 'blob://local/cached/doc-105']
  ]);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(channelId, 'channel');
        assert.equal(messageId, 'message');
        if (ext === '.png' && attachmentId === '100') return '/cache/100.png';
        if (ext === '.mp4' && attachmentId === '101') return '/cache/101.mp4';
        if (ext === '.txt' && attachmentId === '102') return '/cache/102.txt';
        if (ext === '.pdf' && attachmentId === '104') return '/cache/104.pdf';
        if (ext === '.md' && attachmentId === '106') return '/cache/106.md';
        if (ext === '.doc' && attachmentId === '105') return '/cache/105.doc';
        return null;
      },
      get: cacheUrl => {
        const resolved = /^http:\/\/localhost:7474\/([^#]+)#/.exec(cacheUrl);
        if (!resolved) return null;
        const key = resolved[1].replace(/\.[^.]+$/, '');
        return blobMap.get(key) || null;
      }
    }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: '100', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/channel/111/photo.png' },
      { id: '101', filename: 'clip.mp4', url: 'https://cdn.discordapp.com/attachments/channel/111/clip.mp4' },
      {
        id: '102',
        filename: 'notes.txt',
        content_type: 'text/plain; charset=utf-8',
        url: 'https://cdn.discordapp.com/attachments/channel/111/notes.txt'
      },
      { id: '103', filename: 'missing.png', url: 'https://cdn.discordapp.com/attachments/channel/111/missing.png' },
      {
        id: '104',
        filename: 'manual.pdf',
        content_type: 'application/pdf',
        url: 'https://cdn.discordapp.com/attachments/channel/111/manual.pdf'
      },
      {
        id: '106',
        filename: 'README.md',
        content_type: 'text/markdown; charset=utf-8',
        original_content_type: 'text/markdown',
        url: 'https://cdn.discordapp.com/attachments/channel/111/README.md'
      },
      { id: '105', filename: 'unsupported.doc', url: 'https://cdn.discordapp.com/attachments/channel/111/unsupported.doc' }
    ]
  };
  const canonicalBefore = structuredClone(message);

  const rendered = plugin.getCacheOnlyMessage(message);
  const firstPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowBlob: true });
  const secondPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[1], message, { allowBlob: true });
  const thirdPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[2], message, { allowBlob: true });
  const fourthPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[3], message, { allowBlob: true });
  const fifthPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[4], message, { allowBlob: true });
  const sixthPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[5], message, { allowBlob: true });
  const seventhPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[6], message, { allowBlob: true });

  assert.equal(firstPlan.action, 'blob');
  assert.equal(firstPlan.url, 'blob://local/cached/image-100');
  assert.equal(secondPlan.action, 'blob');
  assert.equal(secondPlan.url, 'blob://local/cached/video-101');
  assert.equal(thirdPlan.action, 'blob');
  assert.equal(thirdPlan.mediaType, 'attachment');
  assert.equal(thirdPlan.url, 'blob://local/cached/text-102');
  assert.equal(fourthPlan.action, 'omit');
  assert.equal(fifthPlan.action, 'blob');
  assert.equal(fifthPlan.mediaType, 'attachment');
  assert.equal(fifthPlan.url, 'blob://local/cached/pdf-104');
  assert.equal(sixthPlan.action, 'blob');
  assert.equal(sixthPlan.mediaType, 'attachment');
  assert.equal(sixthPlan.url, 'blob://local/cached/markdown-106');
  assert.equal(seventhPlan.action, 'blob');
  assert.equal(seventhPlan.mediaType, 'attachment');
  assert.equal(seventhPlan.url, 'blob://local/cached/doc-105');
  assert.equal(rendered.attachments.length, 6);
  assert.equal(rendered.attachments[0].url, 'blob://local/cached/image-100');
  assert.equal(rendered.attachments[1].url, 'blob://local/cached/video-101');
  assert.equal(rendered.attachments[2].url, 'blob://local/cached/text-102');
  assert.equal(rendered.attachments[3].url, 'blob://local/cached/pdf-104');
  assert.equal(rendered.attachments[0].proxy_url, 'blob://local/cached/image-100');
  assert.equal(rendered.attachments[1].proxy_url, 'blob://local/cached/video-101');
  assert.equal(rendered.attachments[2].proxy_url, 'blob://local/cached/text-102');
  assert.equal(rendered.attachments[3].proxy_url, 'blob://local/cached/pdf-104');
  assert.equal(rendered.attachments.filter(attachment => attachment.id === '106').length, 1);
  assert.equal(rendered.attachments[4].url, 'blob://local/cached/markdown-106');
  assert.equal(rendered.attachments[4].proxy_url, 'blob://local/cached/markdown-106');
  assert.equal(rendered.attachments[5].id, '105');
  assert.equal(rendered.attachments[5].url, 'blob://local/cached/doc-105');
  assert.equal(rendered.attachments[5].proxy_url, 'blob://local/cached/doc-105');
  assert.equal(rendered.content, 'body');
  assert.deepEqual(message, canonicalBefore);
});

test('cache-only local rendering includes cached audio blobs and omits missing cached attachments', () => {
  const blobMap = new Map([
    ['100.mp3', 'blob://local/cached/audio-100'],
    ['101.ogg', 'blob://local/cached/audio-101']
  ]);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(channelId, 'channel');
        assert.equal(messageId, 'message');
        if (ext === '.mp3' && attachmentId === '100') return '/cache/100.mp3';
        if (ext === '.ogg' && attachmentId === '101') return '/cache/101.ogg';
        if (ext === '.wav' && attachmentId === '102') return '/cache/102.wav';
        return null;
      },
      get: cacheUrl => {
        const resolved = /^http:\/\/localhost:7474\/([^#]+)#/.exec(cacheUrl);
        if (!resolved) return null;
        return blobMap.get(resolved[1]) || null;
      }
    }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: '100', filename: 'clip.mp3', url: 'https://cdn.discordapp.com/attachments/channel/111/clip.mp3' },
      { id: '101', filename: 'recording.ogg', url: 'https://cdn.discordapp.com/attachments/channel/111/recording.ogg' },
      {
        id: '102',
        filename: 'missing-audio',
        content_type: 'audio/wave'
      },
      { id: '103', filename: 'notes.txt', url: 'https://cdn.discordapp.com/attachments/channel/111/notes.txt' }
    ]
  };
  const canonicalBefore = structuredClone(message);
  const firstPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowBlob: true });
  const secondPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[1], message, { allowBlob: true });
  const thirdPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[2], message, { allowBlob: true });
  const fourthPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[3], message, { allowBlob: true });
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.equal(firstPlan.action, 'blob');
  assert.equal(firstPlan.mediaType, 'audio');
  assert.equal(firstPlan.url, 'blob://local/cached/audio-100');
  assert.equal(secondPlan.action, 'blob');
  assert.equal(secondPlan.mediaType, 'audio');
  assert.equal(secondPlan.url, 'blob://local/cached/audio-101');
  assert.equal(thirdPlan.action, 'omit');
  assert.equal(thirdPlan.mediaType, 'audio');
  assert.equal(fourthPlan.action, 'omit');
  assert.equal(fourthPlan.mediaType, 'attachment');
  assert.equal(rendered.attachments.length, 2);
  assert.equal(rendered.attachments[0].url, 'blob://local/cached/audio-100');
  assert.equal(rendered.attachments[1].url, 'blob://local/cached/audio-101');
  assert.deepEqual(message, canonicalBefore);
});

test('cache-only cached blob plan only accepts blob URLs from simulator output', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/100.png',
      get: () => 'https://cdn.example.com/fallback.png'
    }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: '100', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/channel/111/photo.png' }
    ]
  };

  const plan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowBlob: true });
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.equal(plan.action, 'omit');
  assert.equal(rendered.attachments.length, 0);
});

test('logger saved-attachment presentation entries keep canonical current order and dedupe removed identities', () => {
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { filename: 'current-first.png', url: 'https://cdn.discordapp.com/attachments/channel/100/current-first.png' },
      null,
      { id: '200', filename: 'current-by-id.mp4', url: 'https://cdn.discordapp.com/attachments/channel/200/current-by-id.mp4' },
      { filename: 'current-by-url.txt', proxy_url: 'https://media.discordapp.net/attachments/channel/201/current-by-url.txt' }
    ]
  };
  const record = {
    removed_attachments: [
      { id: '200', filename: 'removed-dupe-by-id', url: 'https://cdn.discordapp.com/attachments/channel/ignored/current-by-id.mp4' },
      { filename: 'removed-dupe-by-url', url: 'https://media.discordapp.net/attachments/channel/201/current-by-url.txt' },
      { id: '300', filename: 'removed-1.txt', url: 'https://cdn.discordapp.com/attachments/channel/300/removed-1.txt' },
      { id: '301', filename: 'removed-2.gif', url: 'https://cdn.discordapp.com/attachments/channel/301/removed-2.gif' },
      { id: '301', filename: 'removed-2-merged.gif', proxy_url: 'https://media.discordapp.net/attachments/channel/301/removed-2-merged.gif' }
    ]
  };
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath() {
        return null;
      },
      get() {
        return null;
      }
    }
  });

  const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);
  const names = entries.map(entry => entry.attachment.filename);

  assert.deepEqual(
    names,
    [
      'current-first.png',
      'current-by-id.mp4',
      'current-by-url.txt',
      'removed-1.txt',
      'removed-2-merged.gif'
    ]
  );
  assert.deepEqual(
    entries.map(entry => entry.removed),
    [false, false, false, true, true]
  );
  assert.equal(entries.some(entry => entry.removed && entry.attachment.id === '200'), false);
  assert.equal(entries.some(entry => entry.removed && entry.attachment.filename === 'removed-dupe-by-url'), false);
  assert.equal(entries.some(entry => entry.removed && entry.attachment.id === '300'), true);
  assert.equal(entries.filter(entry => entry.removed && entry.attachment.id === '301').length, 1);
  assert.deepEqual(entries.map(entry => entry.plan.action), ['remote', 'remote', 'remote', 'omit', 'omit']);
});

test('removed ordinary attachment cache admission follows main and all-attachment gates', () => {
  const cached = [];
  const removedAttachments = [
    {
      id: 'removed-image',
      filename: 'removed.png',
      url: 'https://cdn.example/removed/removed.png'
    },
    {
      id: 'removed-video',
      filename: 'removed.mp4',
      url: 'https://cdn.example/removed/removed.mp4'
    },
    {
      id: 'removed-generic',
      filename: 'removed.bin',
      url: 'https://cdn.example/removed/removed.bin'
    }
  ];
  const messageId = 'removed-attachment-message';
  const channelId = 'removed-channel';
  const guildId = 'removed-guild';
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      maxCacheFileSize: 0,
      newSaveAllFileTypes: false
    },
    messageRecord: {
      [messageId]: { logged_attachments: [], removed_attachments: [] }
    },
    cacheImage(...args) { cached.push(args); }
  });
  const expectedContent = removedAttachments
    .map(attachment => '`Attachment Deleted: `' + attachment.url + '\n')
    .join('');
  const expectedRecord = removedAttachments.map(attachment => ({
    id: attachment.id,
    filename: attachment.filename,
    url: attachment.url
  }));
  const expectedImageCall = [
    removedAttachments[0].url,
    0,
    removedAttachments[0].id,
    messageId,
    channelId,
    guildId,
    0,
    plugin._mediaCacheWriteEpoch || 0,
    'confirmed'
  ];

  plugin.settings.cacheAllImages = false;
  const masterOff = plugin._getChangedAttachments(
    removedAttachments,
    [],
    messageId,
    channelId,
    guildId
  );

  assert.equal(masterOff.content, expectedContent);
  assert.deepEqual(masterOff.logged_attachments, removedAttachments.map(attachment => attachment.id));
  assert.deepEqual(
    masterOff.removed_attachments.map(({ id, filename, url }) => ({ id, filename, url })),
    expectedRecord
  );
  assert.deepEqual(cached, []);

  plugin.settings.cacheAllImages = true;
  const gateOff = plugin._getChangedAttachments(
    removedAttachments,
    [],
    messageId,
    channelId,
    guildId
  );

  assert.equal(gateOff.content, expectedContent);
  assert.deepEqual(gateOff.logged_attachments, removedAttachments.map(attachment => attachment.id));
  assert.deepEqual(
    gateOff.removed_attachments.map(({ id, filename, url }) => ({ id, filename, url })),
    expectedRecord
  );
  assert.deepEqual(cached, [expectedImageCall]);

  cached.length = 0;
  plugin.settings.newSaveAllFileTypes = true;
  plugin.messageRecord[messageId] = { logged_attachments: [], removed_attachments: [] };

  const gateOn = plugin._getChangedAttachments(
    removedAttachments,
    [],
    messageId,
    channelId,
    guildId
  );

  assert.equal(gateOn.content, expectedContent);
  assert.deepEqual(gateOn.logged_attachments, removedAttachments.map(attachment => attachment.id));
  assert.deepEqual(
    gateOn.removed_attachments.map(({ id, filename, url }) => ({ id, filename, url })),
    expectedRecord
  );
  assert.deepEqual(
    cached,
    removedAttachments.map((attachment, index) => [
      attachment.url,
      index,
      attachment.id,
      messageId,
      channelId,
      guildId,
      0,
      plugin._mediaCacheWriteEpoch || 0,
      'confirmed'
    ])
  );
});

test('logger saved-attachment presentation entries expose exact image/attachment placeholder labels when master media cache is off', () => {
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: '100', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/channel/100/photo.png' },
      { id: '101', filename: 'notes.txt', url: 'https://cdn.discordapp.com/attachments/channel/101/notes.txt' }
    ]
  };
  const record = {
    removed_attachments: [
      { id: '200', filename: 'removed-image.png', url: 'https://cdn.discordapp.com/attachments/channel/200/removed-image.png' },
      { id: '201', filename: 'removed-note.txt', url: 'https://cdn.discordapp.com/attachments/channel/201/removed-note.txt' }
    ]
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: false
    }
  });

  const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);

  assert.deepEqual(
    entries.map(entry => entry.plan.label),
    ['[image:photo.png]', '[attachment:notes.txt]', '[image:removed-image.png]', '[attachment:removed-note.txt]']
  );
  assert.equal(entries.every(entry => entry.plan.action === 'placeholder'), true);
});

test('logger saved-attachment presentation entries prefer remote display and only probe a blob when no remote candidate exists', () => {
  const imageCacheGets = [];
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/offline-cache-file.png',
      get(url) {
        imageCacheGets.push(url);
        return null;
      }
    }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: '100',
        filename: 'photo.png',
        url: 'https://cdn.discordapp.com/attachments/channel/100/photo.png',
        proxy_url: 'https://media.discordapp.net/attachments/channel/100/photo.png'
      },
      {
        id: '101',
        filename: 'proxy-only.gif',
        proxy_url: 'https://media.discordapp.net/attachments/channel/101/proxy-only.gif'
      },
      {
        id: '102',
        filename: 'notes.txt'
      }
    ]
  };
  const record = {
    removed_attachments: [
      { id: '200', filename: 'removed.png', proxy_url: 'https://media.discordapp.net/attachments/channel/200/removed.png' }
    ]
  };
  const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);

  assert.equal(entries[0].plan.action, 'remote');
  assert.equal(entries[0].plan.url, 'https://cdn.discordapp.com/attachments/channel/100/photo.png');
  assert.equal(entries[0].plan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/100/photo.png');
  assert.equal(entries[1].plan.action, 'remote');
  assert.equal(entries[1].plan.url, 'https://cdn.discordapp.com/attachments/channel/101/proxy-only.gif');
  assert.equal(entries[1].plan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/101/proxy-only.gif');
  assert.equal(entries[2].plan.action, 'omit');
  assert.equal(entries[3].plan.action, 'omit');
  assert.deepEqual(imageCacheGets, [
    'http://localhost:7474/102.txt#channel,102,message',
    'http://localhost:7474/200.png#channel,200,message'
  ]);
});

test('logger saved-attachment presentation entries in local-only mode keep only cached media blobs', () => {
  const blobMap = new Map([
    ['100.png', 'blob://local/cached/image-100'],
    ['101.mp4', 'blob://local/cached/video-101'],
    ['200.gif', 'blob://local/cached/removed-200']
  ]);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, extension) => {
        if (attachmentId === '102') return null;
        if (attachmentId === '101') return '/cache/101.mp4';
        if (attachmentId === '100') return '/cache/100.png';
        if (attachmentId === '200') return '/cache/200.gif';
        return null;
      },
      get(cacheUrl) {
        const matched = /^http:\/\/localhost:7474\/([^#]+)#/.exec(cacheUrl);
        if (!matched) return null;
        return blobMap.get(matched[1]) || null;
      }
    }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      { id: '100', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/channel/100/photo.png' },
      { id: '101', filename: 'clip.mp4', url: 'https://cdn.discordapp.com/attachments/channel/101/clip.mp4' },
      { id: '102', filename: 'missing.webp', url: 'https://cdn.discordapp.com/attachments/channel/102/missing.webp' },
      { id: '103', filename: 'notes.txt', url: 'https://cdn.discordapp.com/attachments/channel/103/notes.txt' }
    ]
  };
  const record = {
    removed_attachments: [
      { id: '200', filename: 'removed.gif', url: 'https://cdn.discordapp.com/attachments/channel/200/removed.gif' },
      { id: '201', filename: 'removed.doc', url: 'https://cdn.discordapp.com/attachments/channel/201/removed.doc' }
    ]
  };
  const messageBefore = structuredClone(message);
  const recordBefore = structuredClone(record);
  const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);

  assert.equal(entries.length, 6);
  assert.equal(entries[0].attachment.id, '100');
  assert.equal(entries[0].plan.action, 'blob');
  assert.equal(entries[0].plan.url, 'blob://local/cached/image-100');
  assert.equal(entries[1].plan.action, 'blob');
  assert.equal(entries[1].plan.url, 'blob://local/cached/video-101');
  assert.equal(entries[2].plan.action, 'omit');
  assert.equal(entries[3].plan.action, 'omit');
  assert.equal(entries[4].plan.action, 'blob');
  assert.equal(entries[4].plan.url, 'blob://local/cached/removed-200');
  assert.equal(entries[5].plan.action, 'omit');
  assert.deepEqual(message, messageBefore);
  assert.deepEqual(record, recordBefore);
});

test('saved MessageContent projection removes only Logger-owned live videos in every policy mode', () => {
  const canonicalMessage = {
    id: 'accessories-message',
    channel_id: 'accessories-channel',
    content: '',
    attachments: [
      {
        id: 'video',
        filename: 'clip.mp4',
        content_type: 'video/mp4',
        url: 'https://cdn.discordapp.com/attachments/accessories-channel/video/clip.mp4',
        proxy_url: 'https://media.discordapp.net/attachments/accessories-channel/video/clip.mp4'
      },
      {
        id: 'image',
        filename: 'photo.png',
        content_type: 'image/png',
        url: 'https://cdn.discordapp.com/attachments/accessories-channel/image/photo.png'
      },
      {
        id: 'video',
        filename: 'collision.png',
        content_type: 'image/png',
        url: 'https://cdn.discordapp.com/attachments/accessories-channel/video/clip.mp4'
      },
      {
        id: 'audio',
        filename: 'sound.mp3',
        content_type: 'audio/mpeg',
        url: 'https://cdn.discordapp.com/attachments/accessories-channel/audio/sound.mp3'
      },
      {
        id: 'generic',
        filename: 'notes.txt',
        content_type: 'text/plain',
        url: 'https://cdn.discordapp.com/attachments/accessories-channel/generic/notes.txt'
      }
    ]
  };
  const canonicalBefore = structuredClone(canonicalMessage);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension) => attachmentId === 'video'
        ? `/cache/${attachmentId}${extension}`
        : null,
      get: cacheUrl => cacheUrl.includes('/video.mp4#')
        ? 'blob://local/cached/accessories-video'
        : null
    },
    messageRecord: {
      'accessories-message': {
        delete_data: { time: 1 },
        message: canonicalMessage
      }
    }
  });
  plugin.shouldPresentSavedMessage = () => true;
  const displayedMessage = plugin.getCacheOnlyMessage(canonicalMessage);
  const displayedBefore = structuredClone(displayedMessage);
  const preservedFilenames = ['photo.png', 'collision.png', 'sound.mp3', 'notes.txt'];

  const projected = plugin.getSavedAttachmentMessageContentPresentationMessage(displayedMessage);

  assert.notStrictEqual(projected, displayedMessage);
  assert.deepEqual(projected.attachments.map(attachment => attachment.filename), preservedFilenames);
  assert.deepEqual(displayedMessage, displayedBefore);
  assert.deepEqual(canonicalMessage, canonicalBefore);

  plugin.settings.onlyRenderCachedAttachments = true;
  const localOnlyProjection = plugin.getSavedAttachmentMessageContentPresentationMessage(
    displayedMessage
  );
  assert.deepEqual(localOnlyProjection.attachments.map(attachment => attachment.filename), preservedFilenames);
  plugin.settings.onlyRenderCachedAttachments = false;

  plugin.settings.cacheAllImages = false;
  const cacheOffProjection = plugin.getSavedAttachmentMessageContentPresentationMessage(
    displayedMessage
  );
  assert.deepEqual(cacheOffProjection.attachments.map(attachment => attachment.filename), preservedFilenames);
  plugin.settings.cacheAllImages = true;

  let setUsed = false;
  const immutableDisplayedMessage = {
    ...displayedMessage,
    set(key, value) {
      setUsed = true;
      return { ...this, [key]: value };
    }
  };
  const immutableProjection = plugin.getSavedAttachmentMessageContentPresentationMessage(
    immutableDisplayedMessage
  );
  assert.equal(setUsed, true);
  assert.deepEqual(immutableProjection.attachments.map(attachment => attachment.filename), preservedFilenames);

  plugin.shouldPresentSavedMessage = () => false;
  assert.strictEqual(
    plugin.getSavedAttachmentMessageContentPresentationMessage(displayedMessage),
    displayedMessage
  );
  plugin.shouldPresentSavedMessage = () => true;
  const wrongChannelMessage = { ...displayedMessage, channel_id: 'other-channel' };
  assert.strictEqual(
    plugin.getSavedAttachmentMessageContentPresentationMessage(wrongChannelMessage),
    wrongChannelMessage
  );

  const legacyCanonicalMessage = {
    id: 'legacy-message',
    channel_id: 'accessories-channel',
    content: '',
    attachments: [{
      filename: 'legacy.mp4',
      content_type: 'video/mp4',
      url: 'https://cdn.discordapp.com/attachments/accessories-channel/legacy/legacy.mp4'
    }]
  };
  const legacyCanonicalBefore = structuredClone(legacyCanonicalMessage);
  plugin.messageRecord['legacy-message'] = {
    delete_data: { time: 1 },
    message: legacyCanonicalMessage
  };
  const legacyDisplayedMessage = {
    ...legacyCanonicalMessage,
    attachments: [{
      ...legacyCanonicalMessage.attachments[0],
      url: 'blob:https://discord.com/local-video',
      proxy_url: 'blob:https://discord.com/local-video'
    }]
  };
  const legacyDisplayedBefore = structuredClone(legacyDisplayedMessage);
  const legacyProjection = plugin.getSavedAttachmentMessageContentPresentationMessage(
    legacyDisplayedMessage
  );
  assert.notStrictEqual(legacyProjection, legacyDisplayedMessage);
  assert.deepEqual(legacyProjection.attachments, []);
  assert.deepEqual(legacyDisplayedMessage, legacyDisplayedBefore);
  assert.deepEqual(legacyCanonicalMessage, legacyCanonicalBefore);
});

test('saved MessageAccessories render exposes projected video-free props only during the native call', () => {
  const canonicalMessage = {
    id: 'accessories-render',
    channel_id: 'accessories-render',
    content: '',
    attachments: [
      {
        id: 'video',
        filename: 'clip.webm',
        content_type: 'video/webm',
        url: 'https://cdn.discordapp.com/attachments/accessories-render/video/clip.webm'
      },
      {
        id: 'audio',
        filename: 'sound.ogg',
        content_type: 'audio/ogg',
        url: 'https://cdn.discordapp.com/attachments/accessories-render/audio/sound.ogg'
      }
    ]
  };
  const canonicalBefore = structuredClone(canonicalMessage);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { get: () => null },
    messageRecord: {
      'accessories-render': {
        delete_data: { time: 1 },
        message: canonicalMessage
      }
    }
  });
  plugin.shouldPresentSavedMessage = () => true;
  const originalProps = {
    message: plugin.getCacheOnlyMessage(canonicalMessage),
    compact: false
  };
  const instance = { props: originalProps };
  let originalCalls = 0;

  const result = plugin.renderSavedAttachmentMessageAccessories(
    instance,
    ['render-options'],
    function (...args) {
      originalCalls += 1;
      assert.strictEqual(this, instance);
      assert.deepEqual(args, ['render-options']);
      assert.notStrictEqual(this.props, originalProps);
      assert.deepEqual(this.props.message.attachments.map(attachment => attachment.id), ['audio']);
      return 'native-render-result';
    }
  );

  assert.equal(result, 'native-render-result');
  assert.equal(originalCalls, 1);
  assert.strictEqual(instance.props, originalProps);
  assert.deepEqual(canonicalMessage, canonicalBefore);

  const lockedInstance = {};
  Object.defineProperty(lockedInstance, 'props', {
    value: originalProps,
    writable: false
  });
  const lockedResult = plugin.renderSavedAttachmentMessageAccessories(
    lockedInstance,
    [],
    function () {
      assert.strictEqual(this, lockedInstance);
      assert.strictEqual(this.props, originalProps);
      return 'locked-render-result';
    }
  );
  assert.equal(lockedResult, 'locked-render-result');
  assert.strictEqual(lockedInstance.props, originalProps);
});

test('MessageAccessories patch installs immediately or once after a guarded late module wait', async () => {
  class MessageAccessories {
    render() {}
    renderEmbeds() {}
    renderAttachments() {}
  }
  const originalFilter = Webpack.Filters.byPrototypeKeys;
  const originalGetModule = Webpack.getModule;
  const originalWaitForModule = Webpack.waitForModule;
  const originalInstead = Patcher.instead;
  const originalAbortController = global.AbortController;
  const controllers = [];
  const patchCalls = [];
  let available = true;
  let refreshes = 0;
  let releaseLate;
  let releaseStale;
  try {
    Webpack.Filters.byPrototypeKeys = (...keys) => candidate => keys.every(
      key => typeof candidate?.prototype?.[key] === 'function'
    );
    Webpack.getModule = (filter, options) => {
      assert.equal(options.searchExports, true);
      return available && filter(MessageAccessories) ? MessageAccessories : null;
    };
    Webpack.waitForModule = (filter, options) => {
      assert.equal(options.searchExports, true);
      assert.ok(options.signal);
      return new Promise(resolve => {
        if (releaseLate) releaseStale = resolve;
        else releaseLate = resolve;
      });
    };
    Patcher.instead = (target, methodName, callback) => {
      patchCalls.push({ target, methodName, callback });
      return () => {};
    };
    global.AbortController = class {
      constructor() {
        this.signal = { aborted: false };
        controllers.push(this);
      }
      abort() {
        this.signal.aborted = true;
      }
    };

    const immediate = createPlugin({ __started: true, unpatches: [] });
    immediate.forceUpdateUI = () => { refreshes++; };
    assert.equal(immediate.installMessageAccessoriesPatch(), true);
    assert.equal(immediate.installMessageAccessoriesPatch(), true);
    assert.equal(patchCalls.length, 1);
    assert.equal(immediate._messageAccessoriesPatchInstalled, true);
    assert.equal(refreshes, 0);

    available = false;
    const late = createPlugin({ __started: true, unpatches: [] });
    late.forceUpdateUI = () => { refreshes++; };
    assert.equal(late.installMessageAccessoriesPatch(), false);
    assert.equal(late._messageAccessoriesWaitController, controllers[0]);
    available = true;
    releaseLate(MessageAccessories);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(patchCalls.length, 2);
    assert.equal(late._messageAccessoriesPatchInstalled, true);
    assert.equal(refreshes, 1);
    assert.equal(late.installMessageAccessoriesPatch(), true);
    assert.equal(patchCalls.length, 2);
    assert.equal(refreshes, 1);

    available = false;
    let releasePending;
    Webpack.waitForModule = () => new Promise(resolve => { releasePending = resolve; });
    const stale = createPlugin({ __started: true, unpatches: [] });
    stale.forceUpdateUI = () => { refreshes++; };
    assert.equal(stale.installMessageAccessoriesPatch(), false);
    const staleController = controllers[1];
    stale.stop();
    assert.equal(staleController.signal.aborted, true);
    available = true;
    releasePending(MessageAccessories);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(patchCalls.length, 2);
    assert.equal(refreshes, 1);
    assert.equal(stale._messageAccessoriesPatchInstalled, false);
    assert.equal(stale._messageAccessoriesWaitController, null);
  } finally {
    Webpack.Filters.byPrototypeKeys = originalFilter;
    Webpack.getModule = originalGetModule;
    Webpack.waitForModule = originalWaitForModule;
    Patcher.instead = originalInstead;
    global.AbortController = originalAbortController;
  }
});

test('logger native document message isolates TXT, Markdown, PDF, and generic attachments with safe Discord defaults', () => {
  class NativeDocumentMessage {
    constructor(payload) {
      Object.assign(this, payload);
    }
    isPoll() { return false; }
    hasFlag() { return false; }
  }

  const canonical = {
    id: 'document-message',
    channel_id: 'document-channel',
    content: 'canonical content must stay untouched',
    flags: 64,
    attachments: [
      { id: 'txt', filename: 'notes.txt', size: 11, url: 'https://cdn.example/notes.txt' },
      {
        id: 'markdown',
        filename: 'README.md',
        size: 22,
        content_type: 'text/markdown',
        original_content_type: 'text/markdown',
        url: 'https://cdn.example/README.md'
      },
      { id: 'pdf', filename: 'manual.pdf', size: 33, url: 'https://cdn.example/manual.pdf' },
      {
        id: 'json',
        filename: 'data.json',
        size: 44,
        content_type: 'application/json; charset=utf-8',
        url: 'https://cdn.example/data.json'
      },
      {
        id: 'bin',
        filename: 'archive.bin',
        size: 55,
        content_type: 'application/octet-stream',
        url: 'https://cdn.example/archive.bin'
      },
      {
        id: 'zip',
        filename: 'bundle.zip',
        size: 66,
        content_type: 'application/zip',
        url: 'https://cdn.example/bundle.zip'
      },
      {
        id: 'font',
        filename: 'font.woff2',
        size: 77,
        content_type: 'font/woff2',
        url: 'https://cdn.example/font.woff2'
      },
      {
        id: 'unknown',
        filename: 'README.unknown',
        size: 88,
        url: 'https://cdn.example/README.unknown'
      }
    ],
    codedLinks: [{ type: 'invite' }],
    giftCodes: ['gift'],
    embeds: [{ type: 'rich' }],
    components: [{ type: 1 }],
    messageSnapshots: [{ message: 'snapshot' }],
    reactions: [{ emoji: { name: 'x' } }]
  };
  const nativeSource = new NativeDocumentMessage(canonical);
  const canonicalBefore = structuredClone(canonical);
  const sourceAttachmentsBefore = structuredClone(nativeSource.attachments);
  const plugin = createPlugin();
  plugin.shouldPresentSavedMessage = () => assert.fail('Logger document rendering must not use live-mount policy');

  for (const [index, sourceAttachment] of canonical.attachments.entries()) {
    const projected = {
      ...sourceAttachment,
      url: index === 0
        ? sourceAttachment.url
        : `blob:https://discord.com/${sourceAttachment.filename}`,
      proxy_url: index === 0
        ? sourceAttachment.url
        : `blob:https://discord.com/${sourceAttachment.filename}`
    };
    const native = plugin.createLoggerNativeDocumentMessage(canonical, projected, nativeSource);
    assert.ok(native instanceof NativeDocumentMessage);
    assert.equal(native.attachments.length, 1);
    assert.notStrictEqual(native.attachments[0], projected);
    assert.deepEqual(native.attachments[0], projected);
    assert.equal(native.attachments[0].id, projected.id);
    assert.equal(native.attachments[0].url, projected.url);
    assert.equal(native.attachments[0].proxy_url, projected.proxy_url);
    assert.equal(native.content, '');
    assert.equal(native.flags, 64);
    assert.deepEqual(native.codedLinks, []);
    assert.deepEqual(native.giftCodes, []);
    assert.deepEqual(native.embeds, []);
    assert.deepEqual(native.components, []);
    assert.deepEqual(native.messageSnapshots, []);
    assert.deepEqual(native.reactions, []);
    assert.deepEqual(native.stickers, []);
    assert.deepEqual(native.stickerItems, []);
    assert.equal(native.activity, null);
    assert.equal(native.sharedClientTheme, null);
    assert.equal(native.edited_timestamp, null);
    assert.equal(native.editedTimestamp, null);
    assert.equal(native.isPoll(), false);
    assert.equal(native.hasFlag(1), false);
  }

  assert.deepEqual(canonical, canonicalBefore);
  assert.deepEqual(nativeSource.attachments, sourceAttachmentsBefore);
});

test('native attachment media error listener lifecycle installs once, forwards once, and removes safely', async () => {
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  const fakeTarget = createFakeEventTarget();
  const originalDocument = global.document;
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/601.png',
      get: () => 'blob://local/cached/image-601'
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    messageRecord: {
      '601': {
        delete_data: { time: 1 },
        message: {
          id: '601',
          channel_id: '601',
          content: 'body',
          attachments: [
            { id: '601', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/601/photo.png' }
          ]
        }
      }
    }
  });

  installMountedSavedMedia(plugin, [plugin.messageRecord['601']]);
  try {
    global.document = fakeTarget;
    plugin._installSavedAttachmentMediaErrorListener();
    plugin._installSavedAttachmentMediaErrorListener();
    assert.equal(fakeTarget.state.addCalls.length, 1);

    fakeTarget.dispatchErrorEvent({
      target: {
        tagName: 'IMG',
        currentSrc: 'https://cdn.discordapp.com/attachments/601/photo.png',
        closest: createNativeMediaClosest({ id: 'chat-messages-601-601' })
      }
    });
    assert.equal(dispatches.length, 0);

    await setImmediatePromise();
    assert.deepEqual(invalidations, ['601']);
    assert.deepEqual(cacheRefreshes, ['601']);

    plugin._removeSavedAttachmentMediaErrorListener();
    assert.equal(fakeTarget.state.removeCalls.length, 1);
    assert.equal(fakeTarget.state.removeCalls[0].eventName, 'error');
    assert.equal(fakeTarget.state.removeCalls[0].listener, fakeTarget.state.addCalls[0].listener);
    assert.equal(fakeTarget.state.removeCalls[0].capture, true);

    plugin._removeSavedAttachmentMediaErrorListener();
    assert.equal(fakeTarget.state.removeCalls.length, 1);
  } finally {
    global.document = originalDocument;
  }
});

test('native attachment media error remounts one failed remote attachment with cached blob presentation', async () => {
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(ext, '.png');
        assert.equal(attachmentId, '100');
        assert.equal(channelId, '501');
        assert.equal(messageId, '501');
        return '/cache/501.png';
      },
      get: cacheUrl => {
        const matched = /^http:\/\/localhost:7474\/(.+?)#/.exec(cacheUrl);
        if (!matched) return null;
        const key = matched[1];
        return key === '100.png' ? 'blob://local/cached/image-100' : null;
      }
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    messageRecord: {
      '501': {
        delete_data: { time: 1 },
        message: {
          id: '501',
          channel_id: '501',
          content: 'body',
          attachments: [
            { id: '100', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/501/photo.png' },
            { id: '101', filename: 'notes.txt', url: 'https://cdn.discordapp.com/attachments/501/notes.txt' }
          ]
        }
      }
    }
  });

  installMountedSavedMedia(plugin, [plugin.messageRecord['501']]);
  const message = plugin.messageRecord['501'].message;
  const canonicalBefore = structuredClone(message);
  const remoteRender = plugin.getCacheOnlyMessage(message);

  assert.equal(remoteRender.attachments.length, 2);
  assert.equal(remoteRender.attachments[0].url, 'https://cdn.discordapp.com/attachments/501/photo.png');
  assert.equal(remoteRender.attachments[1].url, 'https://cdn.discordapp.com/attachments/501/notes.txt');

  const messageRow = { id: 'chat-messages-501-501' };
  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/501/photo.png',
      closest: createNativeMediaClosest(messageRow)
    }
  });

  assert.equal(dispatches.length, 0);
  const fallbackRender = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(fallbackRender.attachments.length, 2);
  assert.equal(fallbackRender.attachments[0].url, 'blob://local/cached/image-100');
  assert.equal(fallbackRender.attachments[1].url, 'https://cdn.discordapp.com/attachments/501/notes.txt');
  assert.deepEqual(plugin.messageRecord['501'].message, canonicalBefore);

  await setImmediatePromise();
  assert.deepEqual(invalidations, ['501']);
  assert.deepEqual(cacheRefreshes, ['501']);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/501/photo.png',
      closest: createNativeMediaClosest(messageRow)
    }
  });

  assert.equal(dispatches.length, 0);
});

test('native attachment media error retries failed proxy candidates from derived CDN to original URL and then shows blob', async () => {
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(ext, '.png');
        assert.equal(attachmentId, '601');
        assert.equal(channelId, '601');
        assert.equal(messageId, '601');
        return '/cache/601.png';
      },
      get: cacheUrl => {
        const matched = /^http:\/\/localhost:7474\/(.+?)#/.exec(cacheUrl);
        if (!matched) return null;
        const key = matched[1];
        return key === '601.png' ? 'blob://local/cached/image-601' : null;
      }
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    messageRecord: {
      '601': {
        delete_data: { time: 1 },
        message: {
          id: '601',
          channel_id: '601',
          content: 'body',
          attachments: [
            {
              id: '601',
              filename: 'legacy photo.png',
              url: 'https://media.discordapp.net/attachments/601/legacy%20photo.png?width=640&height=360',
              proxy_url: 'https://media.discordapp.net/attachments/601/legacy%20photo.png?width=640&height=360'
            }
          ]
        }
      }
    }
  });

  installMountedSavedMedia(plugin, [plugin.messageRecord['601']]);
  const message = plugin.messageRecord['601'].message;
  const canonicalBefore = structuredClone(message);
  const sourceRow = { id: 'chat-messages-601-601' };
  const cdnUrl = 'https://cdn.discordapp.com/attachments/601/legacy%20photo.png?width=640&height=360';
  const proxyUrl = 'https://media.discordapp.net/attachments/601/legacy%20photo.png?width=640&height=360';

  const remoteRender = plugin.getCacheOnlyMessage(message);
  assert.equal(remoteRender.attachments.length, 1);
  assert.equal(remoteRender.attachments[0].url, cdnUrl);
  assert.equal(remoteRender.attachments[0].proxy_url, cdnUrl);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: cdnUrl,
      closest: createNativeMediaClosest(sourceRow)
    }
  });
  assert.equal(dispatches.length, 0);
  const afterCdnFailure = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(afterCdnFailure.attachments.length, 1);
  assert.equal(afterCdnFailure.attachments[0].url, proxyUrl);
  assert.equal(afterCdnFailure.attachments[0].proxy_url, proxyUrl);

  await setImmediatePromise();
  assert.deepEqual(invalidations, ['601']);
  assert.deepEqual(cacheRefreshes, ['601']);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: cdnUrl,
      closest: createNativeMediaClosest(sourceRow)
    }
  });
  assert.equal(dispatches.length, 0);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: proxyUrl,
      closest: createNativeMediaClosest(sourceRow)
    }
  });
  assert.equal(dispatches.length, 0);
  await setImmediatePromise();
  assert.deepEqual(invalidations, ['601', '601']);
  assert.deepEqual(cacheRefreshes, ['601', '601']);
  const afterProxyFailure = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(afterProxyFailure.attachments.length, 1);
  assert.equal(afterProxyFailure.attachments[0].url, 'blob://local/cached/image-601');
  assert.equal(afterProxyFailure.attachments[0].proxy_url, 'blob://local/cached/image-601');
  assert.deepEqual(message, canonicalBefore);
});

test('native audio source error retries CDN then proxy and then shows cached audio blob', async () => {
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(attachmentId, '701');
        assert.equal(ext, '.mp3');
        assert.equal(channelId, '701');
        assert.equal(messageId, '701');
        return '/cache/701.mp3';
      },
      get: cacheUrl => {
        const matched = /^http:\/\/localhost:7474\/(.+?)#/.exec(cacheUrl);
        if (!matched || matched[1] !== '701.mp3') return null;
        return 'blob://local/cached/audio-701';
      }
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    messageRecord: {
      '701': {
        delete_data: { time: 1 },
        message: {
          id: '701',
          channel_id: '701',
          content: 'body',
          attachments: [{
            id: '701',
            filename: 'recording',
            content_type: 'audio/mpeg',
            original_content_type: 'audio/mpeg',
            url: 'https://cdn.discordapp.com/attachments/701/recording.mp3',
            proxy_url: 'https://media.discordapp.net/attachments/701/recording.mp3'
          }]
        }
      }
    }
  });

  installMountedSavedMedia(plugin, [plugin.messageRecord['701']]);
  const message = plugin.messageRecord['701'].message;
  const canonicalBefore = structuredClone(message);
  const sourceRow = { id: 'chat-messages-701-701' };
  const cdnUrl = 'https://cdn.discordapp.com/attachments/701/recording.mp3';
  const proxyUrl = 'https://media.discordapp.net/attachments/701/recording.mp3';

  let plan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowRemote: true });
  assert.equal(plan.mediaType, 'audio');
  assert.equal(plan.action, 'remote');
  assert.equal(plan.url, cdnUrl);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'SOURCE',
      src: cdnUrl,
      closest: createNativeMediaClosest(sourceRow)
    }
  });
  assert.equal(dispatches.length, 0);
  plan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowRemote: true });
  assert.equal(plan.mediaType, 'audio');
  assert.equal(plan.action, 'remote');
  assert.equal(plan.url, proxyUrl);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'AUDIO',
      currentSrc: proxyUrl,
      closest: createNativeMediaClosest(sourceRow)
    }
  });
  assert.equal(dispatches.length, 0);
  plan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowRemote: true });
  assert.equal(plan.mediaType, 'audio');
  assert.equal(plan.action, 'blob');
  assert.equal(plan.url, 'blob://local/cached/audio-701');
  assert.deepEqual(message, canonicalBefore);

  await setImmediatePromise();
  assert.deepEqual(invalidations, ['701']);
  assert.deepEqual(cacheRefreshes, ['701']);
});

test('saved media failure resolver accepts exact current and removed attachments only', () => {
  const message = {
    id: 'resolver-message',
    channel_id: 'resolver-channel',
    content: 'body',
    attachments: [{
      id: 'current-image',
      filename: 'current.png',
      url: 'https://cdn.discordapp.com/attachments/resolver-channel/current.png'
    }],
    sticker_items: [{ id: 'sticker', name: 'sticker', format_type: 1 }],
    embeds: [{ image: { url: 'https://cdn.discordapp.com/embeds/embed.png' } }],
    components: [{ type: 1, components: [] }]
  };
  const record = {
    message,
    delete_data: { time: 1 },
    removed_attachments: [{
      id: 'removed-image',
      filename: 'removed.png',
      url: 'https://cdn.discordapp.com/attachments/resolver-channel/removed.png'
    }]
  };
  const plugin = createPlugin({
    messageRecord: { [message.id]: record },
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false }
  });

  const currentDescriptor = plugin.getSavedAttachmentDescriptor(message.attachments[0], message);
  const currentContext = plugin.resolveSavedAttachmentMediaFailureContext(currentDescriptor);
  assert.strictEqual(currentContext.record, record);
  assert.strictEqual(currentContext.message, message);
  assert.strictEqual(currentContext.attachment, message.attachments[0]);
  assert.equal(currentContext.sourceKind, 'attachment');

  const removedAttachment = plugin.getRecordRemovedAttachments(record)[0];
  const removedDescriptor = plugin.getSavedAttachmentDescriptor(removedAttachment, message);
  const removedContext = plugin.resolveSavedAttachmentMediaFailureContext(removedDescriptor);
  assert.equal(removedContext.sourceKind, 'removedAttachment');
  assert.equal(removedContext.attachment.id, 'removed-image');

  assert.equal(plugin.resolveSavedAttachmentMediaFailureContext({
    ...currentDescriptor,
    channel_id: 'other-channel'
  }), null);
  assert.equal(plugin.resolveSavedAttachmentMediaFailureContext({
    ...currentDescriptor,
    message_id: 'other-message'
  }), null);
  assert.equal(plugin.resolveSavedAttachmentMediaFailureContext({
    ...currentDescriptor,
    attachment_id: 'other-attachment'
  }), null);

  const stickerMedia = plugin.getStickerMedia(message.sticker_items[0]);
  const stickerDescriptor = plugin.getSavedAttachmentDescriptor(stickerMedia, message);
  assert.equal(plugin.resolveSavedAttachmentMediaFailureContext(stickerDescriptor), null);

  const nonDeletedPlugin = createPlugin({
    messageRecord: {
      [message.id]: { message, delete_data: null, removed_attachments: record.removed_attachments }
    }
  });
  assert.equal(
    nonDeletedPlugin.resolveSavedAttachmentMediaFailureContext(currentDescriptor),
    null
  );
});

test('saved inline text/code attachment classifier accepts strict extensions and MIME types', () => {
  const plugin = createPlugin();
  const positiveExtensions = ['txt', 'md', 'json', 'js', 'py', 'html', 'csv', 'xml', 'log', 'css', 'sh', 'zsh', 'command'];
  for (const extension of positiveExtensions) {
    assert.equal(
      plugin.isSavedInlineTextCodeAttachment(`https://cdn.example/files/NOTES.${extension.toUpperCase()}?download=1`),
      true,
      extension
    );
  }
  for (const mime of [
    'text/plain; charset=utf-8',
    'text/markdown; charset=utf-8',
    'text/html',
    'application/json; charset=utf-8',
    'application/javascript; charset=utf-8',
    'application/xml; charset=utf-8'
  ]) {
    assert.equal(plugin.isSavedInlineTextCodeAttachment(mime), true, mime);
  }
  assert.equal(plugin.isSavedInlineTextCodeAttachment({
    filename: 'notes.txt',
    url: 'https://cdn.example/files/notes.txt',
    content_type: 'application/octet-stream'
  }), false);
  for (const value of [
    'manual.pdf',
    'archive.BIN',
    'archive.zip',
    'font.woff2',
    'photo.png',
    'clip.mp4',
    'recording.mp3',
    'unknown.data',
    'application/pdf',
    'application/octet-stream',
    'application/zip',
    'font/woff2',
    'image/png',
    'video/mp4',
    'audio/mpeg'
  ]) {
    assert.equal(plugin.isSavedInlineTextCodeAttachment(value), false, value);
  }
});

test('saved inline text/code attachment probe resolves exact current and removed sources without mutation', () => {
  const currentAttachment = {
    id: 'inline-current',
    filename: 'notes.txt',
    content_type: 'text/plain; charset=utf-8',
    url: 'https://cdn.discordapp.com/attachments/inline-channel/inline-current/notes.txt',
    proxy_url: 'https://media.discordapp.net/attachments/inline-channel/inline-current/notes.txt'
  };
  const removedAttachment = {
    id: 'inline-removed',
    filename: 'script.JS',
    content_type: 'application/javascript; charset=utf-8',
    url: 'https://cdn.discordapp.com/attachments/inline-channel/inline-removed/script.JS',
    proxy_url: 'https://media.discordapp.net/attachments/inline-channel/inline-removed/script.JS'
  };
  const message = {
    id: 'inline-message',
    channel_id: 'inline-channel',
    content: '',
    attachments: [currentAttachment]
  };
  const record = {
    message,
    delete_data: { time: 1 },
    removed_attachments: [removedAttachment]
  };
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: { [message.id]: record }
  });
  const before = structuredClone({ messageRecord: plugin.messageRecord });
  const renderedCurrent = { ...currentAttachment, proxy_url: currentAttachment.url };
  const currentContext = plugin.getSavedInlineTextAttachmentProbeContext(renderedCurrent, message);
  assert.equal(currentContext.sourceKind, 'attachment');
  assert.equal(currentContext.channelId, message.channel_id);
  assert.equal(currentContext.messageId, message.id);
  assert.equal(currentContext.attachmentId, currentAttachment.id);
  assert.equal(currentContext.action, 'remote');
  assert.equal(currentContext.sourceUrl, currentAttachment.url);
  assert.equal(currentContext.sourceKey, plugin.normalizeSavedAttachmentMediaUrl(currentAttachment.url));
  assert.equal(currentContext.identityKey, `${message.channel_id}:${message.id}:${currentAttachment.id}`);

  const renderedRemoved = { ...removedAttachment, url: removedAttachment.url };
  const removedContext = plugin.getSavedInlineTextAttachmentProbeContext(renderedRemoved, message);
  assert.equal(removedContext.sourceKind, 'removedAttachment');
  assert.equal(removedContext.attachmentId, removedAttachment.id);
  assert.equal(removedContext.action, 'remote');
  assert.equal(removedContext.sourceUrl, removedAttachment.url);
  assert.equal(plugin.getSavedInlineTextAttachmentProbeContext(
    {
      ...renderedCurrent,
      url: 'https://cdn.example/wrong.txt',
      proxy_url: 'https://media.example/wrong.txt'
    },
    message
  ), null);
  assert.equal(plugin.getSavedInlineTextAttachmentProbeContext(
    { ...renderedCurrent, id: 'missing' },
    message
  ), null);
  plugin.settings.onlyRenderCachedAttachments = true;
  plugin.imageCacheServerSimulator = {};
  plugin.imageCacheServerSimulator._resolveImagePath = () => '/cache/inline-current.txt';
  plugin.imageCacheServerSimulator.get = () => 'blob:https://discord.example/inline-current';
  const renderedBlob = {
    ...currentAttachment,
    url: 'blob:https://discord.example/inline-current',
    proxy_url: 'blob:https://discord.example/inline-current'
  };
  const blobContext = plugin.getSavedInlineTextAttachmentProbeContext(renderedBlob, message);
  assert.equal(blobContext.action, 'blob');
  assert.equal(blobContext.sourceUrl, renderedBlob.url);
  plugin.settings.cacheAllImages = false;
  assert.equal(plugin.getSavedInlineTextAttachmentProbeContext(renderedBlob, message), null);
  assert.deepEqual(plugin.messageRecord, before.messageRecord);
});

test('saved inline text/code live preview contexts remain visible current direct attachments only', () => {
  const attachment = {
    id: 'live-inline',
    filename: 'README.md',
    content_type: 'text/markdown; charset=utf-8',
    url: 'https://cdn.discordapp.com/attachments/live-channel/live-inline/README.md',
    proxy_url: 'https://media.discordapp.net/attachments/live-channel/live-inline/README.md'
  };
  const sourceMessage = {
    id: 'live-message',
    channel_id: 'live-channel',
    content: '',
    attachments: [attachment],
    embeds: [{ title: 'ignored' }],
    components: [{ type: 1 }],
    sticker_items: [{ id: 'sticker' }]
  };
  const record = { message: sourceMessage, delete_data: { time: 1 } };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false,
      restoreDeletedMessages: true,
      showDeletedMessages: true
    },
    messageRecord: { [sourceMessage.id]: record },
    deletedMessageSet: new Map([['live-channel', new Set(['live-message'])]])
  });
  const displayed = { ...sourceMessage, attachments: [{ ...attachment }] };
  plugin.shouldPresentSavedMessage = () => true;
  const contexts = plugin.getSavedInlineTextPreviewProbeContexts(displayed);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].sourceKind, 'attachment');
  assert.equal(contexts[0].attachmentId, attachment.id);

  plugin.shouldPresentSavedMessage = () => false;
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts(displayed), []);
  plugin.shouldPresentSavedMessage = () => true;
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts({
    ...displayed,
    id: 'ordinary-message'
  }), []);
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts({
    ...displayed,
    channel_id: 'other-channel'
  }), []);
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts({
    ...displayed,
    attachments: [{ ...attachment, url: 'https://cdn.example/wrong.txt' }]
  }), []);
  record.delete_data.hidden = true;
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts(displayed), []);
  record.delete_data.hidden = false;
  record.message.attachments = [];
  record.removed_attachments = [{ ...attachment }];
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts(displayed), []);
  record.message.attachments = [attachment];
  delete record.removed_attachments;
  plugin.settings.cacheAllImages = false;
  assert.deepEqual(plugin.getSavedInlineTextPreviewProbeContexts(displayed), []);
});

function createSavedInlineTextProbeFixture() {
  const attachment = {
    id: 'probe-inline',
    filename: 'notes.txt',
    content_type: 'text/plain; charset=utf-8',
    url: 'https://cdn.discordapp.com/attachments/probe-channel/probe-inline/notes.txt',
    proxy_url: 'https://media.discordapp.net/attachments/probe-channel/probe-inline/notes.txt'
  };
  const message = {
    id: 'probe-message',
    channel_id: 'probe-channel',
    content: '',
    attachments: [attachment]
  };
  const record = { message, delete_data: { time: 1 } };
  const plugin = createPlugin({
    __started: true,
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: { [message.id]: record }
  });
  plugin.shouldPresentSavedMessage = () => true;
  const context = plugin.getSavedInlineTextAttachmentProbeContext(
    { ...attachment },
    message
  );
  return { attachment, message, record, plugin, context };
}

test('saved inline text probe uses the exact no-timeout request and releases responses', async () => {
  const originalNetApi = global.BdApi.Net;
  const fixture = createSavedInlineTextProbeFixture();
  const requests = [];
  let releases = 0;
  const response = {
    ok: true,
    release() {
      releases += 1;
    }
  };
  global.BdApi.Net = { fetch() {} };
  fixture.plugin.fetchMediaNetworkResponse = (...args) => {
    requests.push(args);
    return Promise.resolve(response);
  };
  try {
    const subscription = fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context);
    const entry = fixture.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value;
    assert.equal(typeof subscription, 'function');
    assert.equal(await entry.promise, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], fixture.context.sourceUrl);
    assert.deepEqual(requests[0][1].method, 'GET');
    assert.deepEqual(requests[0][1].headers, { Range: 'bytes=0-0' });
    assert.equal(requests[0][1].timeout, 0);
    assert.equal(requests[0][1].signal, entry.controller.signal);
    assert.deepEqual(requests[0][2], { nativeOnly: true });
    assert.equal(releases, 1);
    assert.equal(fixture.plugin._savedInlineTextAttachmentProbeInFlight.size, 0);
  } finally {
    global.BdApi.Net = originalNetApi;
  }
});

test('saved inline text probe coordinates one non-ok or rejected response and stays inert on success', async () => {
  const originalNetApi = global.BdApi.Net;
  const fixture = createSavedInlineTextProbeFixture();
  global.BdApi.Net = { fetch() {} };
  const outcomes = [
    { response: { ok: false, release() { this.released = true; } }, expectedRelease: true },
    { response: Promise.reject(new Error('probe rejected')), expectedRelease: false }
  ];
  try {
    for (const outcome of outcomes) {
      const calls = [];
      fixture.plugin.coordinateSavedAttachmentMediaFailure = (...args) => calls.push(args);
      fixture.plugin.fetchMediaNetworkResponse = () => outcome.response;
      const context = fixture.plugin.getSavedInlineTextAttachmentProbeContext(
        { ...fixture.attachment },
        fixture.message
      );
      const subscription = fixture.plugin.acquireSavedInlineTextAttachmentProbe(context);
      const entry = fixture.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value;
      await entry.promise;
      assert.equal(calls.length, 1);
      assert.strictEqual(calls[0][0].identityKey, context.identityKey);
      assert.equal(calls[0][1], context.sourceUrl);
      if (outcome.expectedRelease) assert.equal(outcome.response.released, true);
      subscription();
    }
  } finally {
    global.BdApi.Net = originalNetApi;
  }
});

test('saved inline text probe shares one request, ref-counts consumers, and aborts only final release', async () => {
  const originalNetApi = global.BdApi.Net;
  const fixture = createSavedInlineTextProbeFixture();
  const controllerState = mockAbortControllerWithSignalCapture();
  const OriginalAbortController = global.AbortController;
  let resolveRequest;
  let fetchCalls = 0;
  global.BdApi.Net = { fetch() {} };
  global.AbortController = class {
    constructor() {
      return controllerState.controller;
    }
  };
  fixture.plugin.fetchMediaNetworkResponse = () => {
    fetchCalls += 1;
    return new Promise(resolve => {
      resolveRequest = resolve;
    });
  };
  try {
    const first = fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context);
    await Promise.resolve();
    await Promise.resolve();
    const second = fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context);
    const entry = fixture.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value;
    assert.equal(fetchCalls, 1);
    assert.equal(entry.consumers.size, 2);
    first();
    assert.equal(controllerState.signal.aborted, false);
    second();
    assert.equal(controllerState.signal.aborted, true);
    assert.equal(fixture.plugin._savedInlineTextAttachmentProbeInFlight.size, 0);
    resolveRequest({ ok: true });
    await entry.promise;
  } finally {
    global.BdApi.Net = originalNetApi;
    global.AbortController = OriginalAbortController;
  }
});

test('saved inline text probe cancellation and revalidation isolate stale, local-only, and unavailable contexts', async () => {
  const originalNetApi = global.BdApi.Net;
  const fixture = createSavedInlineTextProbeFixture();
  const pending = [];
  global.BdApi.Net = { fetch() {} };
  fixture.plugin.fetchMediaNetworkResponse = () => new Promise((resolve, reject) => {
    pending.push({ resolve, reject });
  });
  try {
    const first = fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context);
    const firstEntry = fixture.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value;
    fixture.plugin.resetSavedAttachmentPresentationState();
    assert.equal(firstEntry.controller.signal.aborted, true);
    assert.equal(fixture.plugin._savedInlineTextAttachmentProbeInFlight.size, 0);
    pending.shift()?.reject(new Error('late rejection'));
    await firstEntry.promise;
    assert.equal(first(), true);

    const staleContext = fixture.plugin.getSavedInlineTextAttachmentProbeContext(
      { ...fixture.attachment },
      fixture.message
    );
    fixture.record.message.attachments[0].url = 'https://cdn.example/new.txt';
    assert.equal(fixture.plugin.acquireSavedInlineTextAttachmentProbe(staleContext), null);
    fixture.record.message.attachments[0].url = fixture.attachment.url;
    fixture.plugin.settings.onlyRenderCachedAttachments = true;
    assert.equal(fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context), null);
    fixture.plugin.settings.onlyRenderCachedAttachments = false;
    fixture.plugin.settings.cacheAllImages = false;
    assert.equal(fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context), null);
    fixture.plugin.settings.cacheAllImages = true;
    global.BdApi.Net = undefined;
    assert.equal(fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context), null);
    global.BdApi.Net = { fetch() {} };
    const OriginalAbortController = global.AbortController;
    global.AbortController = undefined;
    assert.equal(fixture.plugin.acquireSavedInlineTextAttachmentProbe(fixture.context), null);
    global.AbortController = OriginalAbortController;

    const stopFixture = createSavedInlineTextProbeFixture();
    const stopSubscription = stopFixture.plugin.acquireSavedInlineTextAttachmentProbe(stopFixture.context);
    const stopEntry = stopFixture.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value;
    stopFixture.plugin.__started = false;
    stopFixture.plugin.stop();
    assert.equal(stopEntry.controller.signal.aborted, true);
    assert.equal(stopFixture.plugin._savedInlineTextAttachmentProbeInFlight.size, 0);
    assert.equal(stopSubscription(), true);
  } finally {
    global.BdApi.Net = originalNetApi;
  }
});

test('saved inline text probe lifecycle sentinel is cached, null-rendering, and source-key scoped', () => {
  const OriginalComponent = React.Component;
  class Component {
    constructor(props) {
      this.props = props;
    }
  }
  React.Component = Component;
  const fixture = createSavedInlineTextProbeFixture();
  const releases = [];
  const acquisitions = [];
  fixture.plugin.acquireSavedInlineTextAttachmentProbe = context => {
    acquisitions.push(context);
    const release = () => releases.push(context);
    return release;
  };
  try {
    const Sentinel = fixture.plugin.getSavedInlineTextAttachmentProbeComponent();
    assert.strictEqual(Sentinel, fixture.plugin.getSavedInlineTextAttachmentProbeLifecycleComponent());
    const instance = new Sentinel({ context: fixture.context });
    assert.equal(instance.render(), null);
    instance.componentDidMount();
    assert.equal(acquisitions.length, 1);
    const sameContext = { ...fixture.context };
    instance.props = { context: sameContext };
    instance.componentDidUpdate({ context: fixture.context });
    assert.equal(acquisitions.length, 1);
    const changedContext = { ...fixture.context, sourceKey: `${fixture.context.sourceKey}?changed` };
    instance.props = { context: changedContext };
    instance.componentDidUpdate({ context: sameContext });
    assert.equal(acquisitions.length, 2);
    assert.equal(releases.length, 1);
    instance.componentWillUnmount();
    assert.equal(releases.length, 2);
  } finally {
    React.Component = OriginalComponent;
  }
});

test('saved inline text probe render wrapper keeps original output and mounts one stable sentinel', () => {
  const originalFragment = React.Fragment;
  const originalComponent = React.Component;
  class Component {
    constructor(props) {
      this.props = props;
    }
  }
  React.Fragment = Symbol('Fragment');
  React.Component = Component;
  const fixture = createSavedInlineTextProbeFixture();
  const acquisitions = [];
  const releases = [];
  fixture.plugin.acquireSavedInlineTextAttachmentProbe = context => {
    acquisitions.push(context);
    return () => releases.push(context);
  };
  const originalValue = { kind: 'native-render-result' };
  try {
    const wrapped = fixture.plugin.wrapSavedInlineTextAttachmentProbeRender(
      originalValue,
      fixture.message
    );
    assert.equal(wrapped.type, React.Fragment);
    assert.equal(wrapped.props.children.length, 2);
    assert.strictEqual(wrapped.props.children[0], originalValue);
    const sentinelElement = wrapped.props.children[1];
    assert.equal(sentinelElement.key ?? sentinelElement.props.key, fixture.context.identityKey);
    assert.strictEqual(sentinelElement.props.context.identityKey, fixture.context.identityKey);

    const sentinel = new sentinelElement.type(sentinelElement.props);
    assert.equal(sentinel.render(), null);
    sentinel.componentDidMount();
    assert.equal(acquisitions.length, 1);
    const sameContext = { ...fixture.context };
    sentinel.props = { context: sameContext };
    sentinel.componentDidUpdate({ context: fixture.context });
    assert.equal(acquisitions.length, 1);
    const changedSource = { ...fixture.context, sourceKey: `${fixture.context.sourceKey}:proxy` };
    sentinel.props = { context: changedSource };
    sentinel.componentDidUpdate({ context: sameContext });
    assert.equal(acquisitions.length, 2);
    assert.equal(releases.length, 1);
    sentinel.componentWillUnmount();
    assert.equal(releases.length, 2);

    const noContextValue = { kind: 'unchanged' };
    assert.strictEqual(
      fixture.plugin.wrapSavedInlineTextAttachmentProbeRender(noContextValue, []),
      noContextValue
    );
  } finally {
    if (originalFragment === undefined) delete React.Fragment;
    else React.Fragment = originalFragment;
    if (originalComponent === undefined) delete React.Component;
    else React.Component = originalComponent;
  }
});

test('saved inline text probe render wrapper isolates ordinary, unsupported, media, and local plans', () => {
  const originalFragment = React.Fragment;
  React.Fragment = Symbol('Fragment');
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: {}
  });
  plugin.shouldPresentSavedMessage = () => true;
  const cases = [
    ['ordinary', null, 'notes.txt'],
    ['pdf', 'manual.pdf', 'manual.pdf'],
    ['bin', 'archive.bin', 'archive.bin'],
    ['generic', 'README.unknown', 'README.unknown'],
    ['image', 'photo.png', 'photo.png'],
    ['video', 'clip.mp4', 'clip.mp4'],
    ['audio', 'sound.mp3', 'sound.mp3']
  ];
  try {
    for (const [name, filename, sourceName] of cases) {
      const message = {
        id: `isolation-${name}`,
        channel_id: 'isolation-channel',
        content: '',
        attachments: filename
          ? [{ id: `attachment-${name}`, filename, url: `https://cdn.example/${sourceName}` }]
          : []
      };
      if (filename) {
        plugin.messageRecord[message.id] = { message, delete_data: { time: 1 } };
      }
      const rendered = { kind: name };
      assert.strictEqual(
        plugin.wrapSavedInlineTextAttachmentProbeRender(rendered, message),
        rendered,
        name
      );
    }

    const localMessage = {
      id: 'isolation-local',
      channel_id: 'isolation-channel',
      content: '',
      attachments: [{
        id: 'attachment-local',
        filename: 'notes.txt',
        url: 'https://cdn.example/notes.txt'
      }]
    };
    plugin.messageRecord[localMessage.id] = {
      message: localMessage,
      delete_data: { time: 1 }
    };
    const localContext = {
      ...plugin.getSavedInlineTextAttachmentProbeContext(
        localMessage.attachments[0],
        localMessage
      ),
      action: 'blob',
      sourceUrl: 'blob:https://discord.example/notes'
    };
    const localRendered = { kind: 'local' };
    assert.strictEqual(
      plugin.wrapSavedInlineTextAttachmentProbeRender(localRendered, [localContext]),
      localRendered
    );
  } finally {
    if (originalFragment === undefined) delete React.Fragment;
    else React.Fragment = originalFragment;
  }
});

test('saved MessageAccessories render projects video then wraps one text probe without mutating canonical data', () => {
  const originalFragment = React.Fragment;
  const originalComponent = React.Component;
  React.Fragment = Symbol('Fragment');
  React.Component = class {};
  const textAttachment = {
    id: 'mixed-text',
    filename: 'notes.txt',
    content_type: 'text/plain',
    url: 'https://cdn.discordapp.com/attachments/mixed/mixed-text/notes.txt'
  };
  const videoAttachment = {
    id: 'mixed-video',
    filename: 'clip.mp4',
    content_type: 'video/mp4',
    url: 'https://cdn.discordapp.com/attachments/mixed/mixed-video/clip.mp4'
  };
  const message = {
    id: 'mixed-message',
    channel_id: 'mixed-channel',
    content: '',
    attachments: [videoAttachment, textAttachment]
  };
  const before = structuredClone(message);
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: {
      [message.id]: { message, delete_data: { time: 1 } }
    }
  });
  plugin.shouldPresentSavedMessage = () => true;
  const instance = { props: { message: { ...message, attachments: [...message.attachments] } } };
  try {
    const result = plugin.renderSavedAttachmentMessageAccessories(
      instance,
      [],
      function () {
        assert.deepEqual(this.props.message.attachments.map(attachment => attachment.id), ['mixed-text']);
        return { kind: 'native-accessories' };
      }
    );
    assert.equal(result.type, React.Fragment);
    assert.equal(result.props.children.length, 2);
    assert.equal(result.props.children[0].kind, 'native-accessories');
    assert.equal(result.props.children[1].props.context.attachmentId, textAttachment.id);
    assert.strictEqual(instance.props.message.attachments[0].id, videoAttachment.id);
    assert.deepEqual(message, before);
  } finally {
    if (originalFragment === undefined) delete React.Fragment;
    else React.Fragment = originalFragment;
    if (originalComponent === undefined) delete React.Component;
    else React.Component = originalComponent;
  }
});

test('saved media failure coordinator refreshes one exact context once and preserves row progression', () => {
  const message = {
    id: 'coordinator-message',
    channel_id: 'coordinator-channel',
    content: 'body',
    attachments: [{
      id: 'coordinator-image',
      filename: 'photo.png',
      url: 'https://cdn.discordapp.com/attachments/coordinator-channel/photo.png',
      proxy_url: 'https://media.discordapp.net/attachments/coordinator-channel/photo.png'
    }]
  };
  const record = { message, delete_data: { time: 1 } };
  const remounts = [];
  let callbacks = 0;
  let forumRefreshes = 0;
  let menuRefreshes = 0;
  const plugin = createPlugin({
    messageRecord: { [message.id]: record },
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/coordinator-image.png',
      get: () => 'blob://local/coordinator-image.png'
    },
    remountSavedAttachmentPresentationRecords(value) {
      remounts.push(value);
    },
    _messageUpdateRegistry: new Map([[message.id, new Set([() => { callbacks++; }])]]),
    _forumThreadLogRefreshers: new Map([[message.channel_id, () => { forumRefreshes++; }]]),
    scheduleLoggerMenuRefresh() {
      menuRefreshes++;
    }
  });
  const descriptor = plugin.getSavedAttachmentDescriptor(message.attachments[0], message);
  const context = plugin.resolveSavedAttachmentMediaFailureContext(descriptor);
  const directUrl = message.attachments[0].url;
  const proxyUrl = message.attachments[0].proxy_url;

  const first = plugin.coordinateSavedAttachmentMediaFailure(context, directUrl);
  assert.equal(first.recordedFailure, true);
  assert.equal(first.plan.action, 'remote');
  assert.equal(first.plan.url, proxyUrl);
  assert.equal(remounts.length, 1);
  assert.equal(callbacks, 1);
  assert.equal(forumRefreshes, 1);
  assert.equal(menuRefreshes, 1);

  const duplicate = plugin.coordinateSavedAttachmentMediaFailure(context, directUrl);
  assert.equal(duplicate.recordedFailure, false);
  assert.equal(duplicate.plan.action, 'remote');
  assert.equal(duplicate.plan.url, proxyUrl);
  assert.equal(remounts.length, 1);
  assert.equal(callbacks, 1);
  assert.equal(forumRefreshes, 1);
  assert.equal(menuRefreshes, 1);

  const isolated = plugin.coordinateSavedAttachmentMediaFailure(
    context,
    'https://cdn.discordapp.com/attachments/coordinator-channel/other.png'
  );
  assert.equal(isolated, null);
  assert.equal(remounts.length, 1);

  const second = plugin.coordinateSavedAttachmentMediaFailure(context, proxyUrl);
  assert.equal(second.recordedFailure, true);
  assert.equal(second.plan.action, 'blob');
  assert.equal(second.plan.url, 'blob://local/coordinator-image.png');
  assert.equal(remounts.length, 2);
  assert.equal(callbacks, 2);
  assert.equal(forumRefreshes, 2);
  assert.equal(menuRefreshes, 2);

  const localFailure = plugin.coordinateSavedAttachmentMediaFailure(context, second.plan.url);
  assert.equal(localFailure.recordedFailure, true);
  assert.equal(localFailure.plan.action, 'omit');
  assert.equal(localFailure.plan.unavailableReason, 'local-failed');
  assert.equal(remounts.length, 3);
  const localDuplicate = plugin.coordinateSavedAttachmentMediaFailure(context, second.plan.url);
  assert.equal(localDuplicate.recordedFailure, false);
  assert.equal(localDuplicate.plan.action, 'omit');
  assert.equal(remounts.length, 3);
  assert.equal(
    plugin.coordinateSavedAttachmentMediaFailure(context, 'blob://local/other-attachment'),
    null
  );
  assert.equal(remounts.length, 3);

  plugin.settings.onlyRenderCachedAttachments = true;
  assert.equal(plugin.coordinateSavedAttachmentMediaFailure(context, directUrl), null);
  plugin.settings.onlyRenderCachedAttachments = false;
  plugin.settings.cacheAllImages = false;
  assert.equal(plugin.coordinateSavedAttachmentMediaFailure(context, directUrl), null);
  assert.equal(remounts.length, 3);
});

test('logger native audio discovery retries one guarded lazy entry without sticky or stale misses', async () => {
  class MessageAccessories {
    renderEmbeds() {}
    renderAttachments() {}
  }
  class NativeAudioPlayer {
    renderAudio() {}
    renderVideo() {}
    renderControls() {}
    checkVideoDecodability() {}
  }
  class PartialMediaPlayer {
    renderAudio() {}
    renderVideo() {}
    renderControls() {}
  }

  Webpack.Filters.byPrototypeKeys = (...keys) => candidate => keys.every(
    key => typeof candidate?.prototype?.[key] === 'function'
  );
  let nativeAvailable = false;
  Webpack.getModule = filter => [
    MessageAccessories,
    ...(nativeAvailable ? [NativeAudioPlayer] : [])
  ].find(candidate => {
    try {
      return filter(candidate);
    } catch {
      return false;
    }
  }) || null;

  const plugin = createPlugin();
  assert.equal(plugin.isLoggerNativeAudioPlayer(PartialMediaPlayer), false);
  assert.equal(plugin.resolveLoggerNativeAudioPlayer(), null);

  let releaseFirstLoad;
  let loadCalls = 0;
  Utils.loadEntry = entry => {
    loadCalls += 1;
    assert.equal(entry, MessageAccessories);
    return new Promise(resolve => {
      releaseFirstLoad = () => {
        nativeAvailable = true;
        resolve([entry]);
      };
    });
  };
  const firstLookup = plugin.ensureLoggerNativeAudioPlayer();
  const sharedLookup = plugin.ensureLoggerNativeAudioPlayer();
  assert.equal(loadCalls, 1);
  releaseFirstLoad();
  assert.deepEqual(
    await Promise.all([firstLookup, sharedLookup]),
    [NativeAudioPlayer, NativeAudioPlayer]
  );

  const directPlugin = createPlugin();
  assert.equal(await directPlugin.ensureLoggerNativeAudioPlayer(), NativeAudioPlayer);
  assert.equal(loadCalls, 1, 'an already-resolved player must not force-load its entry');

  nativeAvailable = false;
  const emptyPlugin = createPlugin();
  Utils.loadEntry = async () => [];
  assert.equal(await emptyPlugin.ensureLoggerNativeAudioPlayer(), null);
  nativeAvailable = true;
  assert.equal(
    await emptyPlugin.ensureLoggerNativeAudioPlayer(),
    NativeAudioPlayer,
    'a null miss must not be cached permanently'
  );

  nativeAvailable = false;
  const rejectedPlugin = createPlugin();
  Utils.loadEntry = async () => {
    throw new Error('lazy entry unavailable');
  };
  assert.equal(await rejectedPlugin.ensureLoggerNativeAudioPlayer(), null);
  assert.ok(
    loggerEvents.some(event => event[0] === 'warn'
      && String(event[1]).includes('Could not load the Discord native audio player entry.'))
  );

  const stalePlugin = createPlugin();
  let releaseStaleLoad;
  Utils.loadEntry = () => new Promise(resolve => {
    releaseStaleLoad = resolve;
  });
  const staleLookup = stalePlugin.ensureLoggerNativeAudioPlayer();
  stalePlugin.stop();
  nativeAvailable = true;
  releaseStaleLoad([MessageAccessories]);
  assert.equal(await staleLookup, null);

  nativeAvailable = false;
  delete Utils.loadEntry;
  assert.equal(await createPlugin().ensureLoggerNativeAudioPlayer(), null);
});

test('logger native document message discovery guarded-loads semantic classes without stale misses', async () => {
  class MessageAccessories {
    renderEmbeds() {}
    renderAttachments() {}
  }
  class NativeDocumentMessage {
    isPoll() { return false; }
    hasFlag() { return false; }
  }
  class PartialDocumentMessage {
    isPoll() { return false; }
  }

  let nativeAvailable = false;
  Webpack.Filters.byPrototypeKeys = (...keys) => candidate => keys.every(
    key => typeof candidate?.prototype?.[key] === 'function'
  );
  Webpack.getModule = filter => [
    MessageAccessories,
    ...(nativeAvailable ? [NativeDocumentMessage] : [])
  ].find(candidate => {
    try {
      return filter(candidate);
    } catch {
      return false;
    }
  }) || null;

  const plugin = createPlugin();
  assert.equal(plugin.isLoggerNativeDocumentMessageClass(PartialDocumentMessage), false);
  assert.equal(plugin.resolveLoggerNativeDocumentMessageClass(), null);

  let releaseFirstLoad;
  let loadCalls = 0;
  Utils.loadEntry = () => {
    loadCalls += 1;
    return new Promise(resolve => {
      releaseFirstLoad = () => {
        nativeAvailable = true;
        resolve([]);
      };
    });
  };
  const firstLookup = plugin.ensureLoggerNativeDocumentMessageClass();
  const sharedLookup = plugin.ensureLoggerNativeDocumentMessageClass();
  assert.equal(loadCalls, 1);
  releaseFirstLoad();
  assert.deepEqual(
    await Promise.all([firstLookup, sharedLookup]),
    [NativeDocumentMessage, NativeDocumentMessage]
  );

  nativeAvailable = false;
  const emptyPlugin = createPlugin();
  Utils.loadEntry = async () => [];
  assert.equal(await emptyPlugin.ensureLoggerNativeDocumentMessageClass(), null);

  const rejectedPlugin = createPlugin();
  Utils.loadEntry = async () => {
    throw new Error('lazy entry unavailable');
  };
  assert.equal(await rejectedPlugin.ensureLoggerNativeDocumentMessageClass(), null);
  assert.ok(
    loggerEvents.some(event => event[0] === 'warn'
      && String(event[1]).includes('Could not load the Discord native document message entry.'))
  );

  const stalePlugin = createPlugin();
  let releaseStaleLoad;
  Utils.loadEntry = () => new Promise(resolve => {
    releaseStaleLoad = resolve;
  });
  const staleLookup = stalePlugin.ensureLoggerNativeDocumentMessageClass();
  stalePlugin.stop();
  nativeAvailable = true;
  releaseStaleLoad([]);
  assert.equal(await staleLookup, null);

  nativeAvailable = false;
  delete Utils.loadEntry;
  assert.equal(await createPlugin().ensureLoggerNativeDocumentMessageClass(), null);
});

test('logger native audio props, root ownership, error forwarding, and browser fallback match the traced contract', () => {
  class NativeAudioPlayer {
    renderAudio() {}
    renderVideo() {}
    renderControls() {}
    checkVideoDecodability() {}
  }
  const audioClasses = { mosaicItemContent: 'mosaicItemContent_test' };
  Webpack.getModule = filter => [NativeAudioPlayer, audioClasses].find(candidate => {
    try {
      return filter(candidate);
    } catch {
      return false;
    }
  }) || null;

  const attachment = {
    id: 'audio-801',
    filename: 'sample.mp3',
    size: 8876,
    content_type: 'audio/mpeg',
    original_content_type: 'audio/ogg'
  };
  const sourceMessage = { id: 'message-801', channel_id: 'channel-801' };
  const plugin = createPlugin();
  const props = plugin.createLoggerNativeAudioProps(
    'blob:https://discord.com/audio-801',
    attachment,
    sourceMessage
  );
  assert.equal(props.src, 'blob:https://discord.com/audio-801');
  assert.equal(props.fileName, 'sample.mp3');
  assert.equal(props.fileSize, '8.67 KB');
  assert.equal(props.fileSizeBytes, 8876);
  assert.equal(props.type, 'AUDIO');
  assert.equal(props.className, 'mosaicItemContent_test');
  assert.equal(props.playable, true);
  assert.equal(props.volume(), 1);
  assert.equal(props.autoMute(), false);
  assert.deepEqual(props.mimeType, ['audio/mpeg', 'audio/ogg']);
  assert.equal(props.onMute.length, 1);
  assert.equal(props.onVolumeChange.length, 1);
  assert.equal(props.onVolumeShow.length, 0);
  assert.equal(props.onVolumeHide.length, 0);
  assert.equal(props.onPlay.length, 3);
  assert.equal(props.renderLinkComponent({ children: 'sample.mp3' }).type, 'span');

  let renderedElement = null;
  let unmountCalls = 0;
  ReactDOM.createRoot = target => ({
    target,
    render(element) {
      renderedElement = element;
    },
    unmount() {
      unmountCalls += 1;
    }
  });
  const nativeErrors = [];
  const nativeHost = createLoggerAudioHost();
  const nativeMount = plugin.mountLoggerNativeAudio(
    nativeHost,
    props.src,
    attachment,
    sourceMessage,
    (event, currentSource) => nativeErrors.push({ event, currentSource })
  );
  assert.equal(nativeMount.native, true);
  assert.equal(renderedElement.type, NativeAudioPlayer);
  assert.equal(renderedElement.props.type, 'AUDIO');
  assert.equal(nativeHost.dataset.ml2AttachmentMessageId, 'message-801');
  assert.equal(nativeHost.dataset.ml2AttachmentId, 'audio-801');
  assert.equal(nativeHost.dataset.ml2AttachmentAudioHost, 'true');
  nativeHost.dispatchErrorEvent({
    tagName: 'SOURCE',
    src: 'blob:https://discord.com/audio-801'
  });
  assert.equal(nativeErrors.length, 1);
  assert.equal(nativeErrors[0].currentSource, 'blob:https://discord.com/audio-801');
  plugin.cleanupLoggerNativeAudioRoots(nativeHost);
  assert.equal(unmountCalls, 1);
  assert.equal(nativeHost.state.listeners.length, 0);
  assert.equal(plugin._loggerNativeAudioRoots.size, 0);

  const originalDocument = global.document;
  try {
    global.document = {
      createElement(tagName) {
        assert.equal(tagName, 'audio');
        return {
          tagName: 'AUDIO',
          dataset: {},
          controls: false,
          preload: '',
          src: ''
        };
      }
    };
    Webpack.getModule = () => null;
    const fallbackPlugin = createPlugin();
    const fallbackHost = createLoggerAudioHost();
    const fallbackErrors = [];
    const fallbackMount = fallbackPlugin.mountLoggerNativeAudio(
      fallbackHost,
      'blob:https://discord.com/fallback-audio-801',
      attachment,
      sourceMessage,
      (event, currentSource) => fallbackErrors.push({ event, currentSource }),
      { retryNative: false }
    );
    assert.equal(fallbackMount.native, false);
    assert.equal(fallbackHost.children.length, 1);
    assert.equal(fallbackMount.audio.controls, true);
    assert.equal(fallbackMount.audio.preload, 'metadata');
    assert.equal(fallbackMount.audio.src, 'blob:https://discord.com/fallback-audio-801');
    assert.equal(fallbackMount.audio.dataset.ml2AttachmentMessageId, 'message-801');
    assert.equal(fallbackMount.audio.dataset.ml2AttachmentId, 'audio-801');
    fallbackHost.dispatchErrorEvent(fallbackMount.audio);
    assert.equal(fallbackErrors.length, 1);
    assert.equal(fallbackErrors[0].currentSource, 'blob:https://discord.com/fallback-audio-801');
    fallbackPlugin.cleanupLoggerNativeAudioRoots(null, true);
    assert.equal(fallbackHost.state.listeners.length, 0);
    assert.equal(fallbackPlugin._loggerNativeAudioRoots.size, 0);
  } finally {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  }
});

test('logger native attachments mount one marked TXT/Markdown/PDF/generic message per host and clean up independently', () => {
  class MessageAccessories {
    renderEmbeds() {}
    renderAttachments() {}
  }
  class NativeDocumentMessage {
    constructor(payload) {
      Object.assign(this, payload);
    }
    isPoll() { return false; }
    hasFlag() { return false; }
  }

  const originalReactComponent = React.Component;
  React.Component = class {};
  try {
    Webpack.Filters.byPrototypeKeys = (...keys) => candidate => keys.every(
      key => typeof candidate?.prototype?.[key] === 'function'
    );
    Webpack.getModule = filter => [MessageAccessories, NativeDocumentMessage].find(candidate => {
      try {
        return filter(candidate);
      } catch {
        return false;
      }
    }) || null;

    const rendered = new Map();
    const unmounts = new Map();
    ReactDOM.createRoot = host => ({
      render(element) {
        rendered.set(host, element);
      },
      unmount() {
        unmounts.set(host, (unmounts.get(host) || 0) + 1);
      }
    });

    const sourceMessage = new NativeDocumentMessage({
      id: 'document-message',
      channel_id: 'document-channel',
      content: 'repeated [attachment:document] content',
      attachments: [
        { id: 'doc-txt', filename: 'notes.txt', size: 11, url: 'https://cdn.example/notes.txt' },
        {
          id: 'doc-markdown',
          filename: 'README.md',
          size: 22,
          content_type: 'text/markdown',
          original_content_type: 'text/markdown',
          url: 'https://cdn.example/README.md'
        },
        { id: 'doc-pdf', filename: 'manual.pdf', size: 33, url: 'https://cdn.example/manual.pdf' },
        {
          id: 'doc-json',
          filename: 'data.json',
          size: 44,
          content_type: 'application/json; charset=utf-8',
          url: 'https://cdn.example/data.json'
        },
        {
          id: 'doc-bin',
          filename: 'archive.bin',
          size: 55,
          content_type: 'application/octet-stream',
          url: 'https://cdn.example/archive.bin'
        },
        {
          id: 'doc-zip',
          filename: 'bundle.zip',
          size: 66,
          content_type: 'application/zip',
          url: 'https://cdn.example/bundle.zip'
        },
        {
          id: 'doc-font',
          filename: 'font.woff2',
          size: 77,
          content_type: 'font/woff2',
          url: 'https://cdn.example/font.woff2'
        },
        {
          id: 'doc-unknown',
          filename: 'README.unknown',
          size: 88,
          url: 'https://cdn.example/README.unknown'
        }
      ]
    });
    const renderMessage = structuredClone(sourceMessage);
    const sourceBefore = {
      ...sourceMessage,
      attachments: structuredClone(sourceMessage.attachments)
    };
    const channel = { id: 'document-channel', type: 0, guild_id: 'guild' };
    const plugin = createPlugin({
      tools: { getChannel: id => id === 'document-channel' ? channel : null }
    });
    const projectedAttachments = renderMessage.attachments.map((attachment, index) => ({
      ...attachment,
      url: index === 0
        ? attachment.url
        : `blob:https://discord.com/${attachment.filename}`,
      proxy_url: index === 0
        ? attachment.url
        : `blob:https://discord.com/${attachment.filename}`
    }));
    const hosts = renderMessage.attachments.map(() => createLoggerAudioHost());
    const mounts = hosts.map((host, index) => plugin.mountLoggerNativeDocument(
      host,
      index === 2
        ? { ...renderMessage, attachments: [...renderMessage.attachments].reverse() }
        : renderMessage,
      projectedAttachments[index],
      sourceMessage
    ));

    assert.ok(mounts.every(mount => mount?.native === true));
    assert.equal(plugin._loggerNativeDocumentRoots.size, hosts.length);
    assert.deepEqual(
      hosts.map(host => host.dataset),
      renderMessage.attachments.map(attachment => ({
        ml2AttachmentMessageId: 'document-message',
        ml2AttachmentId: attachment.id,
        ml2AttachmentDocumentHost: 'true'
      }))
    );

    for (const [index, host] of hosts.entries()) {
      const boundary = rendered.get(host);
      const accessories = boundary.props.children[0];
      assert.equal(typeof accessories.type?.prototype?.renderAttachments, 'function');
      assert.equal(accessories.props.message.attachments.length, 1);
      assert.deepEqual(accessories.props.message.attachments[0], projectedAttachments[index]);
      assert.equal(accessories.props.onMediaItemContextMenu, undefined);
      assert.equal(accessories.props.inlineAttachmentMedia, true);
      assert.equal(accessories.props.disableMediaOptions, true);
      assert.strictEqual(accessories.props.channel, channel);
    }
    assert.deepEqual({ ...sourceMessage, attachments: structuredClone(sourceMessage.attachments) }, sourceBefore);

    for (const [index, host] of hosts.entries()) {
      plugin.cleanupLoggerNativeDocumentRoots(host);
      assert.equal(unmounts.get(host), 1);
      assert.equal(plugin._loggerNativeDocumentRoots.size, hosts.length - index - 1);
    }
    assert.equal(plugin._loggerNativeDocumentRoots.size, 0);
  } finally {
    if (originalReactComponent === undefined) delete React.Component;
    else React.Component = originalReactComponent;
  }
});

test('logger native TXT host owns the single probe sentinel when live MessageAccessories is also eligible', async () => {
  const originalFragment = React.Fragment;
  const originalComponent = React.Component;
  React.Fragment = Symbol('Fragment');
  React.Component = class {
    constructor(props) {
      this.props = props;
    }
  };
  class MessageAccessories {
    renderEmbeds() {}
    renderAttachments() {}
  }
  class NativeDocumentMessage {
    constructor(payload) {
      Object.assign(this, payload);
    }
    isPoll() { return false; }
    hasFlag() { return false; }
  }
  const sourceMessage = new NativeDocumentMessage({
    id: 'detached-text-message',
    channel_id: 'detached-text-channel',
    content: '',
    attachments: [{
      id: 'detached-text',
      filename: 'notes.txt',
      content_type: 'text/plain',
      url: 'https://cdn.example/notes.txt'
    }]
  });
  const plugin = createPlugin({
    tools: { getChannel: id => id === sourceMessage.channel_id ? { id } : null },
    messageRecord: {
      [sourceMessage.id]: { message: sourceMessage, delete_data: { time: 1 } }
    },
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false }
  });
  plugin.shouldPresentSavedMessage = () => true;
  const originalFilter = Webpack.Filters.byPrototypeKeys;
  const originalGetModule = Webpack.getModule;
  const originalCreateRoot = ReactDOM.createRoot;
  const originalNetApi = global.BdApi.Net;
  const rendered = [];
  try {
    Webpack.Filters.byPrototypeKeys = (...keys) => candidate => keys.every(
      key => typeof candidate?.prototype?.[key] === 'function'
    );
    Webpack.getModule = filter => [MessageAccessories, NativeDocumentMessage].find(candidate => {
      try { return filter(candidate); } catch { return false; }
    }) || null;
    ReactDOM.createRoot = () => ({
      render(element) { rendered.push(element); },
      unmount() {}
    });
    const host = createLoggerAudioHost();
    const mount = plugin.mountLoggerNativeDocument(
      host,
      sourceMessage,
      { ...sourceMessage.attachments[0] },
      sourceMessage
    );
    assert.equal(mount.native, true);
    const boundary = rendered.at(-1);
    const fragment = boundary.props.children[0];
    assert.equal(fragment.type, React.Fragment);
    assert.equal(fragment.props.children.length, 2);
    const accessories = fragment.props.children[0];
    assert.equal(typeof accessories.type?.prototype?.renderAttachments, 'function');
    assert.equal(accessories.props.__ml2SavedInlineTextAttachmentProbeDetached, true);

    const liveResult = plugin.renderSavedAttachmentMessageAccessories(
      { props: accessories.props },
      [],
      () => ({ kind: 'detached-native-result' })
    );
    assert.deepEqual(liveResult, { kind: 'detached-native-result' });
    const context = plugin.getSavedInlineTextAttachmentProbeContext(
      sourceMessage.attachments[0],
      sourceMessage
    );
    const wrappedAgain = plugin.wrapSavedInlineTextAttachmentProbeRender(
      liveResult,
      [context]
    );
    assert.equal(wrappedAgain.props.children.length, 2);
    assert.equal(
      wrappedAgain.props.children.filter(child => child?.type === fragment.props.children[1]?.type).length,
      1
    );
    const requests = [];
    global.BdApi.Net = { fetch() {} };
    plugin.fetchMediaNetworkResponse = (...args) => {
      requests.push(args);
      return Promise.resolve({ ok: true, release() {} });
    };
    const sentinelElement = fragment.props.children[1];
    const sentinel = new sentinelElement.type(sentinelElement.props);
    sentinel.componentDidMount();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(requests.length, 1);
    sentinel.componentWillUnmount();
    plugin.cleanupLoggerNativeDocumentRoots(host);

    for (const [name, attachment] of [
      ['pdf', { id: 'detached-pdf', filename: 'manual.pdf', url: 'https://cdn.example/manual.pdf' }],
      ['bin', { id: 'detached-bin', filename: 'archive.bin', url: 'https://cdn.example/archive.bin' }],
      ['generic', { id: 'detached-generic', filename: 'README.unknown', url: 'https://cdn.example/README.unknown' }]
    ]) {
      const unsupportedMessage = new NativeDocumentMessage({
        id: `detached-${name}-message`,
        channel_id: 'detached-text-channel',
        content: '',
        attachments: [attachment]
      });
      plugin.messageRecord[unsupportedMessage.id] = {
        message: unsupportedMessage,
        delete_data: { time: 1 }
      };
      const unsupportedHost = createLoggerAudioHost();
      plugin.mountLoggerNativeDocument(
        unsupportedHost,
        unsupportedMessage,
        { ...attachment },
        unsupportedMessage
      );
      assert.notEqual(rendered.at(-1).props.children[0].type, React.Fragment, name);
      plugin.cleanupLoggerNativeDocumentRoots(unsupportedHost);
    }

    const localMessage = new NativeDocumentMessage({
      id: 'detached-local-message',
      channel_id: 'detached-text-channel',
      content: '',
      attachments: [{
        id: 'detached-local',
        filename: 'notes.txt',
        url: 'https://cdn.example/notes.txt'
      }]
    });
    plugin.messageRecord[localMessage.id] = {
      message: localMessage,
      delete_data: { time: 1 }
    };
    plugin.settings.onlyRenderCachedAttachments = true;
    plugin.imageCacheServerSimulator = {
      _resolveImagePath: () => '/cache/detached-local.txt',
      get: () => 'blob:https://discord.example/detached-local'
    };
    const localHost = createLoggerAudioHost();
    plugin.mountLoggerNativeDocument(
      localHost,
      localMessage,
      {
        ...localMessage.attachments[0],
        url: 'blob:https://discord.example/detached-local',
        proxy_url: 'blob:https://discord.example/detached-local'
      },
      localMessage
    );
    assert.notEqual(rendered.at(-1).props.children[0].type, React.Fragment, 'local-only Blob');
    plugin.cleanupLoggerNativeDocumentRoots(localHost);
  } finally {
    Webpack.Filters.byPrototypeKeys = originalFilter;
    Webpack.getModule = originalGetModule;
    ReactDOM.createRoot = originalCreateRoot;
    global.BdApi.Net = originalNetApi;
    if (originalFragment === undefined) delete React.Fragment;
    else React.Fragment = originalFragment;
    if (originalComponent === undefined) delete React.Component;
    else React.Component = originalComponent;
  }
});

test('Logger attachment plans use one native facade before custom media renderers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'),
    'utf8'
  );
  const populateStart = source.indexOf('populateParent(parent, messages)');
  const populateEnd = source.indexOf('\n  refilterMessages()', populateStart);
  const populateSource = source.slice(populateStart, populateEnd);
  const nativeBranch = populateSource.indexOf('const isNativeAttachment = attachment?._ml2PresentationMediaType === \'attachment\';');
  const cachedBranch = populateSource.indexOf('const isCached = presentationAction');

  assert.ok(populateSource.includes("['image', 'video', 'audio', 'attachment'].includes(plan.mediaType)"));
  assert.ok(nativeBranch >= 0);
  assert.ok(populateSource.includes('mountLoggerNativeDocument('));
  assert.ok(nativeBranch < cachedBranch);
  assert.doesNotMatch(populateSource, /_ml2PresentationMediaType === 'text'/);
  assert.doesNotMatch(populateSource, /_ml2PresentationMediaType === 'pdf'/);
});

test('native attachment media error remounts one failed remote attachment as a placeholder without cached blob', async () => {
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/502.png',
      get: () => null
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    messageRecord: {
      '502': {
        delete_data: { time: 1 },
        message: {
          id: '502',
          channel_id: '502',
          content: '',
          attachments: [
            {
              id: '200',
              filename: 'photo.png',
              url: 'https://media.discordapp.net/attachments/502/photo.png',
              proxy_url: 'https://media.discordapp.net/attachments/502/photo.png'
            }
          ]
        }
      }
    }
  });

  installMountedSavedMedia(plugin, [plugin.messageRecord['502']]);
  const message = plugin.messageRecord['502'].message;
  const canonicalBefore = structuredClone(message);
  const messageRow = { id: 'chat-messages-502-502' };
  const cdnUrl = 'https://cdn.discordapp.com/attachments/502/photo.png';
  const proxyUrl = 'https://media.discordapp.net/attachments/502/photo.png';

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: cdnUrl,
      closest: createNativeMediaClosest(messageRow)
    }
  });

  assert.equal(dispatches.length, 0);
  let fallbackRender = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(fallbackRender.attachments.length, 1);
  assert.equal(fallbackRender.attachments[0].url, proxyUrl);
  assert.equal(fallbackRender.attachments[0].proxy_url, proxyUrl);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: proxyUrl,
      closest: createNativeMediaClosest(messageRow)
    }
  });

  assert.equal(dispatches.length, 0);
  fallbackRender = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(fallbackRender.attachments.length, 0);
  assert.equal(fallbackRender.content, '[Deleted: photo.png]');
  assert.equal(plugin._getSavedAttachmentPresentationPlaceholderContent(message), '[Not cached: photo.png]');
  assert.deepEqual(plugin.messageRecord['502'].message, canonicalBefore);

  await setImmediatePromise();
  assert.deepEqual(invalidations, ['502']);
  assert.deepEqual(cacheRefreshes, ['502']);
});

test('attachment presentation remount coalesces channels and protects Discord-owned thread mounts', async () => {
  const dispatches = [];
  const invalidations = [];
  const cacheRefreshes = [];
  const ordinaryOne = {
    delete_data: { time: 1 },
    message: {
      id: 'ordinary-one',
      channel_id: 'channel',
      content: 'one',
      attachments: [{ id: 'media-one', filename: 'one.png', url: 'https://cdn.example/one.png' }]
    }
  };
  const ordinaryTwo = {
    delete_data: { time: 2 },
    message: {
      id: 'ordinary-two',
      channel_id: 'channel',
      content: 'two',
      attachments: [{ id: 'media-two', filename: 'two.png', url: 'https://cdn.example/two.png' }]
    }
  };
  const threadRoot = {
    delete_data: { time: 3, forum_thread_message_delete: true },
    message: {
      id: 'thread',
      channel_id: 'thread',
      content: 'thread root',
      attachments: [{ id: 'thread-media', filename: 'thread.png', url: 'https://cdn.example/thread.png' }]
    }
  };
  const canonicalBefore = structuredClone([ordinaryOne, ordinaryTwo, threadRoot]);
  const plugin = createPlugin({
    settings: { cacheAllImages: false, onlyRenderCachedAttachments: false },
    tools: {
      getChannel: id => ({ id, type: id === 'thread' ? 11 : 0 })
    },
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    invalidateChannelCache: id => invalidations.push(id),
    cacheChannelMessages: id => cacheRefreshes.push(id),
    imageCacheServerSimulator: { get: () => null }
  });
  installMountedSavedMedia(plugin, [ordinaryOne, ordinaryTwo, threadRoot]);
  plugin.shouldPresentSavedMessage = () => true;

  const affectedChannels = plugin.remountSavedAttachmentPresentationRecords([
    ordinaryOne,
    ordinaryTwo,
    threadRoot
  ]);

  assert.equal(affectedChannels, 2);
  assert.equal(dispatches.some(action => action.type === 'MESSAGE_DELETE'), false);
  assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
  assert.equal(dispatches[0].ML2, true);
  assert.equal(dispatches[0].message.id, 'thread');
  assert.equal(dispatches[0].message.attachments.length, 0);
  assert.equal(dispatches[0].message.content, 'thread root\n[Not cached: thread.png]');

  await setImmediatePromise();
  assert.deepEqual([...invalidations].sort(), ['channel', 'thread']);
  assert.deepEqual([...cacheRefreshes].sort(), ['channel', 'thread']);
  assert.deepEqual([ordinaryOne, ordinaryTwo, threadRoot], canonicalBefore);
});

test('refreshCacheOnlyMessage dispatches detached placeholder content when cache master is off', async () => {
  const dispatches = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { get: () => null, _resolveImagePath: () => '/cache/700.png' }
  });
  const message = {
    id: '700',
    channel_id: '700',
    content: '',
    attachments: [{ id: '700', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/700/photo.png' }]
  };
  const canonicalBefore = structuredClone(message);

  plugin.refreshCacheOnlyMessage(message);

  await setImmediatePromise();

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
  assert.equal(dispatches[0].message.content, '[Not cached: photo.png]');
  assert.equal(dispatches[0].message.attachments.length, 0);
  assert.notStrictEqual(dispatches[0].message, message);
  assert.deepEqual(message, canonicalBefore);
});

test('refreshCacheOnlyMessage dispatches latest blob presentation if cache state becomes available before callback', async () => {
  const dispatches = [];
  const state = {
    hasBlob: false
  };
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      get: () => (state.hasBlob ? 'blob://local/cached/image-700.png' : null),
      _resolveImagePath: () => '/cache/700.png'
    }
  });
  const message = {
    id: '700',
    channel_id: '700',
    content: '',
    attachments: [{ id: '700', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/700/photo.png' }]
  };
  const canonicalBefore = structuredClone(message);

  plugin.refreshCacheOnlyMessage(message);

  state.hasBlob = true;

  await setImmediatePromise();

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
  assert.equal(dispatches[0].message.attachments.length, 1);
  assert.equal(dispatches[0].message.attachments[0].url, 'blob://local/cached/image-700.png');
  assert.equal(dispatches[0].message.content, '');
  assert.notStrictEqual(dispatches[0].message, message);
  assert.deepEqual(message, canonicalBefore);
});

test('refreshCacheOnlyMessage normalizes string mentions while preserving detached message fields', async () => {
  const dispatches = [];
  const knownUser = {
    id: 'known-user',
    username: 'Known User',
    discriminator: '1234',
    avatar: 'known-avatar',
    bot: false,
    publicFlags: 42
  };
  const objectMention = {
    id: 'object-user',
    username: 'Object User',
    discriminator: '5678',
    avatar: null,
    bot: false,
    flags: 2,
    public_flags: 7,
    unknown_mention_field: { preserved: true }
  };
  const message = {
    id: 'mention-known',
    channel_id: 'mention-channel',
    content: 'hello',
    flags: 0,
    mentions: ['known-user', objectMention],
    unknown_top_level: { nested: { preserved: true } },
    attachments: []
  };
  const canonicalBefore = structuredClone(message);
  const knownUserBefore = structuredClone(knownUser);
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    UserStore: {
      getUser(id) {
        return id === 'known-user' ? knownUser : null;
      }
    }
  });

  plugin.refreshCacheOnlyMessage(message);

  await setImmediatePromise();

  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
  assert.equal(dispatches[0].ML2, true);
  assert.deepEqual(dispatches[0].message.mentions[0], {
    id: 'known-user',
    username: 'Known User',
    discriminator: '1234',
    avatar: 'known-avatar',
    bot: false,
    public_flags: 42
  });
  assert.deepEqual(dispatches[0].message.mentions[1], objectMention);
  assert.equal(dispatches[0].message.mentions[1].flags, 2);
  assert.doesNotThrow(() => {
    for (const mention of dispatches[0].message.mentions) void ('flags' in mention);
  });
  assert.deepEqual(dispatches[0].message.unknown_top_level, canonicalBefore.unknown_top_level);
  assert.deepEqual(message, canonicalBefore);
  assert.deepEqual(knownUser, knownUserBefore);
});

test('refreshCacheOnlyMessage uses an unknown-user mention fallback when UserStore cannot resolve an ID', async () => {
  for (const { label, userStore } of [
    { label: 'store', userStore: undefined },
    { label: 'api', userStore: {} },
    { label: 'missing-user', userStore: { getUser: () => null } }
  ]) {
    const dispatches = [];
    const message = {
      id: `mention-missing-${label}`,
      channel_id: 'mention-channel',
      content: 'hello',
      mentions: ['missing-user'],
      unknown_top_level: { preserved: true },
      attachments: []
    };
    const canonicalBefore = structuredClone(message);
    const plugin = createPlugin({
      dispatcher: {
        dispatch(action) {
          dispatches.push(action);
        }
      },
      UserStore: userStore
    });

    plugin.refreshCacheOnlyMessage(message);

    await setImmediatePromise();

    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
    assert.equal(dispatches[0].ML2, true);
    assert.deepEqual(dispatches[0].message.mentions, [{
      id: 'missing-user',
      username: 'Unknown',
      discriminator: '0000',
      avatar: null
    }]);
    assert.doesNotThrow(() => 'flags' in dispatches[0].message.mentions[0]);
    assert.deepEqual(dispatches[0].message.unknown_top_level, canonicalBefore.unknown_top_level);
    assert.deepEqual(message, canonicalBefore);
  }
});

test('scheduleSavedAttachmentPresentationRefresh accepts cached audio blobs for remount scheduling', async () => {
  let remountCalls = 0;
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    dispatcher: {
      dispatch() {}
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, extension, channelId, messageId) => {
        assert.equal(extension, '.mp3');
        assert.equal(attachmentId, '900');
        assert.equal(messageId, '900');
        assert.equal(channelId, '900');
        return '/cache/900.mp3';
      },
      get: cacheUrl => {
        const matched = /^http:\/\/localhost:7474\/([^#]+)#/.exec(cacheUrl);
        if (!matched) return null;
        return matched[1] === '900.mp3' ? 'blob://local/cached/audio-900' : null;
      }
    },
    messageRecord: {
      '900': {
        delete_data: { time: 1 },
        message: {
          id: '900',
          channel_id: '900',
          content: '',
          attachments: [
            {
              id: '900',
              filename: 'audio.mp3',
              url: 'https://cdn.discordapp.com/attachments/900/audio.mp3',
              content_type: 'audio/mpeg'
            }
          ]
        }
      }
    }
  });
  plugin.remountSavedAttachmentPresentationRecords = () => {
    remountCalls += 1;
  };

  plugin.scheduleSavedAttachmentPresentationRefresh('900', '900');
  await setImmediatePromise();
  assert.equal(remountCalls, 1);
});

test('scheduleSavedAttachmentPresentationRefresh accepts cached TXT, PDF, and generic blobs for remount scheduling', async () => {
  let remountCalls = 0;
  const resolveCalls = [];
  const blobMap = new Map([
    ['901.txt', 'blob://local/cached/text-901'],
    ['902.pdf', 'blob://local/cached/pdf-902'],
    ['903.bin', 'blob://local/cached/generic-903']
  ]);
  const messageRecord = {
    '901': {
      delete_data: { time: 1 },
      message: {
        id: '901',
        channel_id: '901',
        content: '',
        attachments: [{
          id: '901',
          filename: 'notes.txt',
          content_type: 'text/plain; charset=utf-8',
          url: 'https://cdn.discordapp.com/attachments/901/notes.txt'
        }]
      }
    },
    '902': {
      delete_data: { time: 1 },
      message: {
        id: '902',
        channel_id: '902',
        content: '',
        attachments: [{
          id: '902',
          filename: 'manual.pdf',
          content_type: 'application/pdf',
          url: 'https://cdn.discordapp.com/attachments/902/manual.pdf'
        }]
      }
    },
    '903': {
      delete_data: { time: 1 },
      message: {
        id: '903',
        channel_id: '903',
        content: '',
        attachments: [{
          id: '903',
          filename: 'archive.bin',
          content_type: 'application/octet-stream',
          url: 'https://cdn.discordapp.com/attachments/903/archive.bin'
        }]
      }
    }
  };
  const canonicalBefore = structuredClone(messageRecord);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: true
    },
    dispatcher: {
      dispatch() {}
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, extension, channelId, messageId) => {
        resolveCalls.push({ attachmentId, extension, channelId, messageId });
        if (attachmentId === '901' && extension === '.txt' && channelId === '901' && messageId === '901') {
          return '/trusted/cache/901.txt';
        }
        if (attachmentId === '902' && extension === '.pdf' && channelId === '902' && messageId === '902') {
          return '/trusted/cache/902.pdf';
        }
        if (attachmentId === '903' && extension === '.bin' && channelId === '903' && messageId === '903') {
          return '/trusted/cache/903.bin';
        }
        return null;
      },
      get: cacheUrl => {
        const matched = /^http:\/\/localhost:7474\/([^#]+)#/.exec(cacheUrl);
        return matched ? blobMap.get(matched[1]) || null : null;
      }
    },
    messageRecord
  });
  plugin.remountSavedAttachmentPresentationRecords = () => {
    remountCalls += 1;
  };

  const textPlan = plugin.getSavedAttachmentPresentationPlan(
    messageRecord['901'].message.attachments[0],
    messageRecord['901'].message,
    { allowBlob: true }
  );
  const pdfPlan = plugin.getSavedAttachmentPresentationPlan(
    messageRecord['902'].message.attachments[0],
    messageRecord['902'].message,
    { allowBlob: true }
  );
  const genericPlan = plugin.getSavedAttachmentPresentationPlan(
    messageRecord['903'].message.attachments[0],
    messageRecord['903'].message,
    { allowBlob: true }
  );
  assert.equal(textPlan.action, 'blob');
  assert.equal(textPlan.mediaType, 'attachment');
  assert.equal(pdfPlan.action, 'blob');
  assert.equal(pdfPlan.mediaType, 'attachment');
  assert.equal(genericPlan.action, 'blob');
  assert.equal(genericPlan.mediaType, 'attachment');

  plugin.scheduleSavedAttachmentPresentationRefresh('901', '901');
  plugin.scheduleSavedAttachmentPresentationRefresh('902', '902');
  plugin.scheduleSavedAttachmentPresentationRefresh('903', '903');
  await setImmediatePromise();

  assert.equal(remountCalls, 3);
  assert.ok(resolveCalls.length >= 6);
  assert.ok(resolveCalls.every(call => (
    (call.attachmentId === '901'
      && call.extension === '.txt'
      && call.channelId === '901'
      && call.messageId === '901')
    || (call.attachmentId === '902'
      && call.extension === '.pdf'
      && call.channelId === '902'
      && call.messageId === '902')
    || (call.attachmentId === '903'
      && call.extension === '.bin'
      && call.channelId === '903'
      && call.messageId === '903')
  )));
  assert.deepEqual(messageRecord, canonicalBefore);
});

test('protected attachment remount transitions through a hidden sentinel until the exact placeholder disappears', () => {
  const dispatches = [];
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const dom = createSavedAttachmentTransitionDom('710', '710', '[Not cached: Synology_AUX.png]');
  const observerHarness = createSavedAttachmentTransitionObserverHarness();
  const fixture = createSavedAttachmentTransitionFixture(dispatches);
  const canonicalBefore = structuredClone(fixture.message);
  const storeBefore = structuredClone(fixture.messageStoreMessage);

  try {
    global.document = dom.document;
    global.MutationObserver = observerHarness.FakeMutationObserver;
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);

    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
    assert.equal(dispatches[0].ML2, true);
    assert.equal(dispatches[0].message.content, fixture.plugin._savedAttachmentPresentationTransitionSentinel);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitionSentinel, '\u2063');
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitionSentinel.length, 1);
    assert.equal(
      fixture.plugin._savedAttachmentPresentationTransitionSentinel.trim(),
      fixture.plugin._savedAttachmentPresentationTransitionSentinel
    );
    assert.doesNotMatch(fixture.plugin._savedAttachmentPresentationTransitionSentinel, /[A-Za-z0-9_]/);
    assert.equal(
      Object.prototype.hasOwnProperty.call(dispatches[0].message, fixture.plugin._savedAttachmentPresentationTransitionSentinel),
      false
    );
    assert.deepEqual(dispatches[0].message.attachments, []);
    assert.equal(observerHarness.observers.length, 1);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 1);
    assert.equal(dom.content.textContent, '[Not cached: Synology_AUX.png]');

    const hiddenSentinel = fixture.plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(
      dispatches[0].message
    );
    assert.equal(hiddenSentinel.content, '');

    fixture.setBlobUrl('blob://fresh/Synology_AUX.png');
    const replacedContent = dom.content;
    dom.replaceContentNode('[Not cached: Synology_AUX.png]');
    assert.notStrictEqual(dom.content, replacedContent);
    dom.replaceContentNode('');
    observerHarness.observers[0].trigger();

    assert.equal(dispatches.length, 2);
    assert.equal(dispatches[1].type, 'MESSAGE_UPDATE');
    assert.equal(dispatches.some(action => action.type === 'MESSAGE_DELETE'), false);
    assert.equal(dispatches[1].message.content, '');
    assert.equal(dispatches[1].message.attachments.length, 1);
    assert.equal(dispatches[1].message.attachments[0].url, 'blob://fresh/Synology_AUX.png');
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);
    assert.deepEqual(fixture.message, canonicalBefore);
    assert.deepEqual(fixture.messageStoreMessage, storeBefore);
  } finally {
    global.document = originalDocument;
    global.MutationObserver = OriginalMutationObserver;
  }
});

test('protected attachment remount rolls back to store placeholder state when presentation stops being valid', () => {
  const dispatches = [];
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const dom = createSavedAttachmentTransitionDom('710', '710', '[Not cached: Synology_AUX.png]');
  const observerHarness = createSavedAttachmentTransitionObserverHarness();
  const fixture = createSavedAttachmentTransitionFixture(dispatches);
  const canonicalBefore = structuredClone(fixture.message);
  const storeBefore = structuredClone(fixture.messageStoreMessage);

  try {
    global.document = dom.document;
    global.MutationObserver = observerHarness.FakeMutationObserver;
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);
    assert.equal(dispatches.length, 1);
    const sentinelDispatch = dispatches[0];
    assert.equal(sentinelDispatch.type, 'MESSAGE_UPDATE');
    assert.equal(sentinelDispatch.message.content, fixture.plugin._savedAttachmentPresentationTransitionSentinel);
    assert.equal(Object.prototype.hasOwnProperty.call(sentinelDispatch.message, fixture.plugin._savedAttachmentPresentationTransitionSentinel), false);
    assert.equal(observerHarness.observers.length, 1);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 1);

    fixture.plugin.shouldPresentSavedMessage = () => false;
    fixture.messageStoreMessage.content = fixture.plugin._savedAttachmentPresentationTransitionSentinel;
    dom.content.textContent = '';
    observerHarness.observers[0].trigger();

    assert.equal(dispatches.length, 2);
    assert.equal(dispatches[1].type, 'MESSAGE_UPDATE');
    assert.equal(dispatches[1].message.content, storeBefore.content);
    assert.deepEqual(dispatches[1].message.attachments, storeBefore.attachments);
    assert.equal(observerHarness.observers[0].disconnected, true);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);

    observerHarness.observers[0].trigger();
    assert.equal(dispatches.length, 2);
    assert.deepEqual(fixture.message, canonicalBefore);
    assert.equal(
      fixture.messageStoreMessage.content,
      fixture.plugin._savedAttachmentPresentationTransitionSentinel,
      'the plugin must dispatch rollback instead of directly mutating MessageStore'
    );
    assert.deepEqual(fixture.messageStoreMessage.attachments, storeBefore.attachments);
  } finally {
    global.document = originalDocument;
    global.MutationObserver = OriginalMutationObserver;
  }
});

test('protected attachment remount falls back to an immediate Blob update without a mounted target', () => {
  const dispatches = [];
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const fixture = createSavedAttachmentTransitionFixture(dispatches);
  const canonicalBefore = structuredClone(fixture.message);
  const storeBefore = structuredClone(fixture.messageStoreMessage);

  try {
    global.document = { getElementById: () => null };
    global.MutationObserver = createSavedAttachmentTransitionObserverHarness().FakeMutationObserver;
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);

    assert.equal(dispatches.length, 1);
    assert.equal(dispatches[0].type, 'MESSAGE_UPDATE');
    assert.equal(dispatches[0].message.content, '');
    assert.equal(dispatches[0].message.attachments.length, 1);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);
    assert.deepEqual(fixture.message, canonicalBefore);
    assert.deepEqual(fixture.messageStoreMessage, storeBefore);

    const noObserverDispatches = [];
    const noObserverFixture = createSavedAttachmentTransitionFixture(noObserverDispatches);
    const mountedDom = createSavedAttachmentTransitionDom('710', '710', '[Not cached: Synology_AUX.png]');
    global.document = mountedDom.document;
    global.MutationObserver = undefined;
    noObserverFixture.plugin.remountSavedAttachmentPresentationRecords(noObserverFixture.record);
    assert.equal(noObserverDispatches.length, 1);
    assert.equal(noObserverDispatches[0].message.content, '');
    assert.equal(noObserverFixture.plugin._savedAttachmentPresentationTransitions.size, 0);
  } finally {
    global.document = originalDocument;
    global.MutationObserver = OriginalMutationObserver;
  }
});

test('protected attachment transition remains inert when shouldPresentSavedMessage is false from the outset', () => {
  const dispatches = [];
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const dom = createSavedAttachmentTransitionDom('710', '710', '[Not cached: Synology_AUX.png]');
  const observerHarness = createSavedAttachmentTransitionObserverHarness();
  const fixture = createSavedAttachmentTransitionFixture(dispatches);

  try {
    fixture.plugin.shouldPresentSavedMessage = () => false;
    global.document = dom.document;
    global.MutationObserver = observerHarness.FakeMutationObserver;
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);

    assert.equal(dispatches.length, 0);
    assert.equal(observerHarness.observers.length, 0);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);

    fixture.plugin.__started = false;
    fixture.plugin.stop();
    assert.equal(dispatches.length, 0);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);
  } finally {
    global.document = originalDocument;
    global.MutationObserver = OriginalMutationObserver;
  }
});

test('newer protected attachment transitions and reset cancel stale observers', () => {
  const dispatches = [];
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const dom = createSavedAttachmentTransitionDom('710', '710', '[Not cached: Synology_AUX.png]');
  const observerHarness = createSavedAttachmentTransitionObserverHarness();
  const fixture = createSavedAttachmentTransitionFixture(dispatches);

  try {
    global.document = dom.document;
    global.MutationObserver = observerHarness.FakeMutationObserver;
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);
    const staleObserver = observerHarness.observers[0];
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);
    const currentObserver = observerHarness.observers[1];

    assert.equal(dispatches.length, 2);
    assert.equal(staleObserver.disconnected, true);
    assert.equal(currentObserver.disconnected, false);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 1);

    dom.content.textContent = '';
    staleObserver.trigger();
    assert.equal(dispatches.length, 2);

    fixture.plugin.resetSavedAttachmentPresentationState();
    assert.equal(currentObserver.disconnected, true);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);
    currentObserver.trigger();
    staleObserver.trigger();
    assert.equal(dispatches.length, 2);

    dom.content.textContent = '[Not cached: Synology_AUX.png]';
    fixture.plugin.remountSavedAttachmentPresentationRecords(fixture.record);
    const stopObserver = observerHarness.observers[2];
    assert.equal(stopObserver.disconnected, false);
    const stopDispatches = dispatches.length;
    fixture.plugin.__started = false;
    fixture.plugin.stop();

    assert.equal(stopObserver.disconnected, true);
    assert.equal(fixture.plugin._savedAttachmentPresentationTransitions.size, 0);
    stopObserver.trigger();
    staleObserver.trigger();
    assert.equal(dispatches.length, stopDispatches);
  } finally {
    global.document = originalDocument;
    global.MutationObserver = OriginalMutationObserver;
  }
});

test('MessageContent mount path applies latest deleted attachment presentation content', () => {
  const canonicalMessage = {
    id: '700',
    channel_id: '700',
    content: '',
    attachments: [
      {
        id: '700',
        filename: 'photo.png',
        url: 'https://cdn.discordapp.com/attachments/700/photo.png'
      }
    ]
  };
  const messageRecord = {
    '700': {
      message: structuredClone(canonicalMessage),
      delete_data: { time: 123 },
      edit_history: [{ content: '[image:photo.png]', time: 123 }]
    }
  };
  const messageRecordBefore = structuredClone(messageRecord['700'].message);
  const plugin = createPlugin({
    messageRecord,
    messageRecordIds: new Set(Object.keys(messageRecord)),
    deletedMessageRecord: { '700': ['700'] },
    deletedMessageSet: new Map([['700', new Set(['700'])]]),
    purgedMessageSet: new Map(),
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/700.png',
      get: () => 'blob://local/cached/photo-700.png'
    }
  });
  plugin.shouldPresentSavedMessage = () => true;

  const liveWithPlaceholder = {
    id: '700',
    channel_id: '700',
    content: '[image:photo.png]',
    attachments: []
  };
  const blobRendered = plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(liveWithPlaceholder);

  assert.equal(blobRendered.content, '');
  assert.notStrictEqual(blobRendered, liveWithPlaceholder);
  assert.equal(liveWithPlaceholder.content, '[image:photo.png]');
  assert.deepEqual(plugin.messageRecord['700'].message, messageRecordBefore);

  plugin.settings.cacheAllImages = false;
  plugin.settings.onlyRenderCachedAttachments = false;
  const masterOffLive = {
    id: '700',
    channel_id: '700',
    content: '',
    attachments: []
  };
  const offRendered = plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(masterOffLive);

  assert.equal(offRendered.content, '[Not cached: photo.png]');
  assert.equal(offRendered !== masterOffLive, true);
  assert.equal(masterOffLive.content, '');

  const unrelated = { id: 'not-tracked', channel_id: '700', content: 'normal row' };
  const identityResult = plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(unrelated);
  assert.strictEqual(identityResult, unrelated);
  plugin.settings.cacheAllImages = true;
  plugin.settings.onlyRenderCachedAttachments = true;
  let setUsed = false;
  const immutableMessage = {
    id: '700',
    channel_id: '700',
    content: '[image:photo.png]',
    set(key, value) {
      if (key === 'content') {
        setUsed = true;
        return { ...immutableMessage, content: value };
      }
      return this;
    }
  };
  const immutableResult = plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(immutableMessage);

  assert.equal(setUsed, true);
  assert.equal(immutableResult.content, '');
  assert.notStrictEqual(immutableResult, immutableMessage);
  assert.deepEqual(plugin.messageRecord['700'].message, messageRecordBefore);
});

test('native attachment media error ignores non-deleted message rows and wrong target URLs', () => {
  const dispatches = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/503.png',
      get: () => 'blob://local/cached/image-503'
    },
    messageRecord: {
      '503': {
        message: {
          id: '503',
          channel_id: '503',
          content: 'body',
          attachments: [
            { id: '300', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/503/photo.png' }
          ]
        }
      },
      '504': {
        delete_data: { time: 1 },
        message: {
          id: '504',
          channel_id: '504',
          content: 'body',
          attachments: [
            { id: '400', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/504/photo.png' }
          ]
        }
      }
    }
  });

  const wrongUrlRow = { id: 'chat-messages-504-504' };
  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/504/other.png',
      closest: createNativeMediaClosest(wrongUrlRow)
    }
  });
  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/503/photo.png',
      closest: createNativeMediaClosest({ id: 'chat-messages-503-503' })
    }
  });
  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'AUDIO',
      currentSrc: 'https://cdn.discordapp.com/attachments/504/photo.png',
      closest: selector => {
        if (selector === '[data-ml2-attachment-video-host="true"]') return null;
        if (selector === '[data-ml2-attachment-audio-host="true"]') return {};
        return wrongUrlRow;
      }
    }
  });

  assert.equal(dispatches.length, 0);
});

test('native attachment media error ignores events when cache master is disabled', () => {
  const dispatches = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/505.png',
      get: () => 'blob://local/cached/image-505'
    },
    messageRecord: {
      '505': {
        delete_data: { time: 1 },
        message: {
          id: '505',
          channel_id: '505',
          content: 'body',
          attachments: [
            { id: '500', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/505/photo.png' }
          ]
        }
      }
    }
  });

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/505/photo.png',
      closest: createNativeMediaClosest({ id: 'chat-messages-505-505' })
    }
  });

  assert.equal(dispatches.length, 0);
});

test('native attachment media error ignores events when local-only mode is enabled', () => {
  const dispatches = [];
  const plugin = createPlugin({
    dispatcher: {
      dispatch(action) {
        dispatches.push(action);
      }
    },
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/506.png',
      get: () => 'blob://local/cached/image-506'
    },
    messageRecord: {
      '506': {
        delete_data: { time: 1 },
        message: {
          id: '506',
          channel_id: '506',
          content: 'body',
          attachments: [
            { id: '600', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/506/photo.png' }
          ]
        }
      }
    }
  });

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/506/photo.png',
      closest: createNativeMediaClosest({ id: 'chat-messages-506-506' })
    }
  });

  assert.equal(dispatches.length, 0);
});

test('cache-only media type classification checks proxy candidates when filename has no extension', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { exists: () => false }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'video-id',
        filename: 'downloaded-clip',
        url: 'https://cdn.discordapp.com/attachments/channel/111/downloaded-clip',
        proxy_url: 'https://media.discordapp.net/attachments/channel/111/downloaded-clip.mp4'
      }
    ]
  };

  const plan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowRemote: true });
  const rendered = plugin.getCacheOnlyMessage(message);

  assert.equal(plan.action, 'remote');
  assert.equal(plan.label, '[attachment:downloaded-clip]');
  assert.equal(rendered.attachments.length, 1);
  assert.equal(rendered.attachments[0].url, 'https://cdn.discordapp.com/attachments/channel/111/downloaded-clip');
});

test('resolved attachment labels use safe unknown filenames and clones stay detached', () => {
  const plugin = createPlugin({
    settings: { cacheAllImages: false },
    imageCacheServerSimulator: { exists: () => false }
  });
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [],
    author: { id: 'user', username: 'User', public_flags: 128 }
  };
  const rendered = plugin.getCacheOnlyMessage(message);
  const plan = plugin.getSavedAttachmentPresentationPlan(
    {
      id: 'file-id',
      filename: undefined,
      url: '',
      proxy_url: 42
    },
    message,
    {}
  );

  rendered.author.publicFlags = 128;
  delete rendered.author.public_flags;
  rendered.content = 'renderer mutation';

  assert.equal(plan.label, '[attachment:unknown file]');
  assert.notEqual(rendered, message);
  assert.equal(rendered.author.username, 'User');
  assert.equal(rendered.content, 'renderer mutation');
  assert.equal(message.author.public_flags, 128);
  assert.equal(message.content, 'body');
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

test('saved attachment descriptors preserve direct/proxy candidates and exact local cache paths', () => {
  const plugin = createPlugin({
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(ext, attachmentId === '101' ? '.PNG' : '.png');
        assert.equal(messageId, '700');
        assert.equal(channelId, '700');
        return {
          101: '/tmp/space cache/space file name #1.PNG',
          102: '/tmp/percent% path/#special%.png',
          103: '/tmp/unicode/测试 #文件.png',
          104: 'C:\\cache\\windows path\\unicode 频道 #4.png'
        }[attachmentId] || null;
      }
    }
  });
  const message = { id: '700', channel_id: '700', content: '' };
  const sample = [
    {
      id: '101',
      filename: 'space file name #1.PNG',
      url: 'https://cdn.example/attachments/space%20file.PNG',
      proxy_url: 'https://media.example/attachments/space%20file.PNG'
    },
    {
      id: '102',
      filename: 'percent%_file#2.png',
      url: 'https://cdn.example/percent%25%20file.png',
      proxy_url: 'https://media.example/percent%25%20file.png'
    },
    {
      id: '103',
      filename: '测试图片 #3.png',
      url: 'https://cdn.example/unicode%20file.png',
      proxy_url: 'https://media.example/unicode%20file.png'
    },
    {
      id: '104',
      filename: 'unicode windows #4.png',
      url: 'https://cdn.example/windows%20unicode.png',
      proxy_url: 'https://media.example/windows%20unicode.png',
      proxyUrl: 'https://fallback.example/windows%20unicode.png'
    }
  ];
  const sampleBefore = structuredClone(sample);
  const messageBefore = structuredClone(message);
  const descriptors = sample.map(attachment => plugin.getSavedAttachmentDescriptor(attachment, message));
  assert.deepEqual(
    descriptors.map(descriptor => descriptor.attachment_id),
    ['101', '102', '103', '104']
  );
  assert.deepEqual(descriptors.map(descriptor => descriptor.remote_urls), [
    [
      'https://cdn.example/attachments/space%20file.PNG',
      'https://media.example/attachments/space%20file.PNG'
    ],
    [
      'https://cdn.example/percent%25%20file.png',
      'https://media.example/percent%25%20file.png'
    ],
    [
      'https://cdn.example/unicode%20file.png',
      'https://media.example/unicode%20file.png'
    ],
    [
      'https://cdn.example/windows%20unicode.png',
      'https://media.example/windows%20unicode.png'
    ]
  ]);
  assert.deepEqual(
    descriptors.map(descriptor => descriptor.filename),
    ['space file name #1.PNG', 'percent%_file#2.png', '测试图片 #3.png', 'unicode windows #4.png']
  );
  assert.deepEqual(
    descriptors.map(descriptor => descriptor.extension),
    ['.PNG', '.png', '.png', '.png']
  );
  assert.deepEqual(
    descriptors.map(descriptor => descriptor.local_path),
    [
      '/tmp/space cache/space file name #1.PNG',
      '/tmp/percent% path/#special%.png',
      '/tmp/unicode/测试 #文件.png',
      'C:\\cache\\windows path\\unicode 频道 #4.png'
    ]
  );
  assert.deepEqual(sample, sampleBefore);
  assert.deepEqual(message, messageBefore);

  const legacy = plugin.getSavedAttachmentDescriptor({
    id: '105',
    filename: 'legacy.png',
    url: 'https://media.example/legacy.png',
    proxy_url: 'https://media.example/legacy.png'
  }, message);
  assert.deepEqual(legacy.remote_urls, ['https://media.example/legacy.png']);
  assert.equal(legacy.direct_url, legacy.proxy_url);
});

test('saved attachment descriptors skip local path without trusted extension or identity and keep derived fields separate', () => {
  const plugin = createPlugin({
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/should/not/use/this/path.png'
    }
  });
  const message = { channel_id: '800', content: '' };
  const derived = {
    blobUrl: 'blob:https://discord.com/render-only',
    displayUrl: 'blob:https://discord.com/render-only',
    externalUrl: 'https://cdn.example/derived.png',
    direct_url: 'https://attacker.example/must-not-override.png'
  };
  const attachment = {
    id: '201',
    filename: 'derived.png',
    url: 'https://cdn.example/derived.png',
    proxyUrl: 'https://media.example/derived.png'
  };
  const beforeAttachment = structuredClone(attachment);
  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message, derived);

  assert.equal(descriptor.attachment_id, '201');
  assert.equal(descriptor.message_id, null);
  assert.equal(descriptor.channel_id, '800');
  assert.equal(descriptor.direct_url, attachment.url);
  assert.equal(descriptor.proxy_url, attachment.proxyUrl);
  assert.equal(descriptor.local_path, null);
  assert.equal(descriptor.blob_url, derived.blobUrl);
  assert.equal(descriptor.display_url, derived.displayUrl);
  assert.equal(descriptor.external_url, derived.externalUrl);
  assert.equal(Object.hasOwn(descriptor, 'openHint'), false);
  assert.equal(descriptor.remote_urls.length, 2);
  assert.equal(descriptor.extension, '.png');
  assert.deepEqual(attachment, beforeAttachment);

  const extensionless = plugin.getSavedAttachmentDescriptor({
    id: '202',
    filename: 'extensionless',
    url: 'https://cdn.example/extensionless',
    proxy_url: 'https://media.example/extensionless'
  }, message);
  assert.equal(extensionless.extension, '');
  assert.equal(extensionless.local_path, null);

  const blobOpenAttempt = plugin.getSavedAttachmentDescriptor(attachment, message, {
    externalUrl: 'blob:https://discord.com/not-external'
  });
  assert.equal(blobOpenAttempt.external_url, null);

  const olderProxyAlias = plugin.getSavedAttachmentDescriptor({
    id: '203',
    filename: 'older-alias.png',
    url: 'https://cdn.example/older-alias.png',
    proxyURL: 'https://media.example/older-alias.png'
  }, message);
  assert.equal(olderProxyAlias.proxy_url, 'https://media.example/older-alias.png');
  assert.deepEqual(olderProxyAlias.remote_urls, [
    'https://cdn.example/older-alias.png',
    'https://media.example/older-alias.png'
  ]);

  const missingIdentity = plugin.getSavedAttachmentDescriptor({
    filename: 'no-id.png',
    url: 'https://cdn.example/no-id.png',
    proxy_url: 'https://media.example/no-id.png'
  }, { channel_id: '800', content: '' });
  assert.equal(missingIdentity.attachment_id, null);
  assert.equal(missingIdentity.message_id, null);
  assert.equal(missingIdentity.channel_id, '800');
  assert.equal(missingIdentity.local_path, null);
});

test('saved image attachment open descriptor resolves direct cached attachment targets', () => {
  const plugin = createPlugin({
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension) => {
        if (attachmentId === '201' && extension === '.png') return '/tmp/direct/photo.png';
        return null;
      }
    }
  });
  plugin.style = { imageError: 'ml2-image-error' };
  const attachment = {
    id: '201',
    filename: 'photo.png',
    url: 'https://cdn.example.com/photos/photo.png',
    proxy_url: 'https://media.example.com/photos/photo.png'
  };
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: '',
    attachments: [attachment]
  };
  const record = { delete_data: {}, message };
  const target = {
    tagName: 'IMG',
    id: '201',
    src: 'https://cdn.example.com/photos/photo.png',
    classList: { contains: () => false },
    dataset: {},
  };
  const descriptor = plugin.getSavedImageAttachmentOpenDescriptor(target, record);
  assert.equal(descriptor?.attachment_id, '201');
  assert.equal(descriptor?.display_url, 'https://cdn.example.com/photos/photo.png');
  assert.equal(descriptor?.blob_url, null);
  assert.equal(descriptor?.local_path, '/tmp/direct/photo.png');
});

test('saved image attachment open descriptor resolves removed direct attachment targets', () => {
  const plugin = createPlugin({
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension) => {
        if (attachmentId === '202' && extension === '.png') return '/tmp/removed/photo.png';
        return null;
      }
    }
  });
  plugin.style = { imageError: 'ml2-image-error' };
  const removed = {
    id: '202',
    filename: 'gone.png',
    url: 'https://cdn.example.com/photos/gone.png',
    proxy_url: 'https://media.example.com/photos/gone.png'
  };
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: '',
    attachments: []
  };
  const record = { delete_data: {}, message, removed_attachments: [removed] };
  const target = {
    tagName: 'IMG',
    id: '202',
    src: 'https://media.example.com/photos/gone.png',
    classList: { contains: () => false },
    dataset: {},
  };
  const descriptor = plugin.getSavedImageAttachmentOpenDescriptor(target, record);
  assert.equal(descriptor?.attachment_id, '202');
  assert.equal(descriptor?.display_url, 'https://media.example.com/photos/gone.png');
  assert.equal(descriptor?.local_path, '/tmp/removed/photo.png');
});

test('saved image attachment open descriptor preserves blob display source and trusted local path', () => {
  const blobSource = 'blob:https://discord.com/render-only/abc';
  const plugin = createPlugin({
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension) => {
        if (attachmentId === '203' && extension === '.png') return '/tmp/blob/photo.png';
        return null;
      }
    }
  });
  plugin.style = { imageError: 'ml2-image-error' };
  const attachment = {
    id: '203',
    filename: 'photo.png',
    url: 'https://cdn.example.com/photos/photo.png',
    proxy_url: 'https://media.example.com/photos/photo.png'
  };
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: '',
    attachments: [attachment]
  };
  const record = { delete_data: {}, message };
  const target = {
    tagName: 'IMG',
    id: '203',
    src: blobSource,
    classList: { contains: () => false },
    dataset: {},
  };
  const descriptor = plugin.getSavedImageAttachmentOpenDescriptor(target, record);
  assert.equal(descriptor?.attachment_id, '203');
  assert.equal(descriptor?.display_url, blobSource);
  assert.equal(descriptor?.blob_url, blobSource);
  assert.equal(descriptor?.local_path, '/tmp/blob/photo.png');
});

test('saved image attachment open descriptor returns null for blocked, ambiguous, wrong-message, and non-image targets', () => {
  const attachment = {
    id: '204',
    filename: 'photo.png',
    url: 'https://cdn.example.com/photos/photo.png',
    proxy_url: 'https://media.example.com/photos/photo.png'
  };
  const attachmentTwo = {
    id: '205',
    filename: 'photo-two.png',
    url: 'https://cdn.example.com/photos/photo-two.png',
    proxy_url: 'https://media.example.com/photos/photo-two.png'
  };
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: '',
    attachments: [attachment, attachmentTwo]
  };
  const messageWithText = {
    id: 'message',
    channel_id: 'channel',
    content: '',
    attachments: [{
      id: '206',
      filename: 'document.txt',
      url: 'https://cdn.example.com/files/document.txt',
      proxy_url: 'https://media.example.com/files/document.txt'
    }]
  };
  const plugin = createPlugin();
  plugin.style = { imageError: 'ml2-image-error' };

  const blockedTarget = {
    tagName: 'IMG',
    id: '204',
    src: 'https://cdn.example.com/photos/photo.png',
    classList: { contains: () => true },
    dataset: {},
  };
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(blockedTarget, {
    delete_data: {},
    message
  }), null);

  const wrongMessageTarget = {
    tagName: 'IMG',
    messageId: 'other-message',
    id: '204',
    src: 'https://cdn.example.com/photos/photo.png',
    classList: { contains: () => false },
    dataset: {},
  };
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(wrongMessageTarget, {
    delete_data: {},
    message
  }), null);

  const nonImageTarget = {
    tagName: 'IMG',
    id: '206',
    src: 'https://cdn.example.com/files/document.txt',
    classList: { contains: () => false },
    dataset: {},
  };
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(nonImageTarget, {
    delete_data: {},
    message: messageWithText
  }), null);

  const ambiguousTarget = {
    tagName: 'DIV',
    querySelectorAll: () => [
      {
        tagName: 'IMG',
        id: '204',
        src: 'https://cdn.example.com/photos/photo.png',
        classList: { contains: () => false },
      },
      {
        tagName: 'IMG',
        id: '205',
        src: 'https://cdn.example.com/photos/photo-two.png',
        classList: { contains: () => false },
      }
    ],
    parentElement: null,
    closest: () => null,
  };
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(ambiguousTarget, {
    delete_data: {},
    message
  }), null);
});

test('saved image attachment open descriptor rejects embed, sticker, and component targets', () => {
  const plugin = createPlugin();
  plugin.style = { imageError: 'ml2-image-error' };
  const embedRecord = {
    delete_data: {},
    removed_attachments: [{
      id: 'removed-source-collision',
      filename: 'embed.png',
      url: 'https://cdn.example.com/embed.png',
      proxy_url: 'https://cdn.example.com/embed.png'
    }],
    message: {
      id: 'embed-message',
      channel_id: 'channel',
      content: '',
      embeds: [{ image: { url: 'https://cdn.example.com/embed.png' } }],
      attachments: []
    }
  };
  const stickerRecord = {
    delete_data: {},
    message: {
      id: 'sticker-message',
      channel_id: 'channel',
      content: '',
      sticker_items: [{ id: 's1', name: 'spark', format_type: 4, url: 'https://media.example.com/sticker.png' }],
      attachments: []
    }
  };
  const componentRecord = {
    delete_data: {},
    message: {
      id: 'component-message',
      channel_id: 'channel',
      content: '',
      components: [{ type: 11, media: { proxy_url: 'https://media.discordapp.net/components/example.png' } }],
      attachments: []
    }
  };
  const embedTarget = {
    tagName: 'IMG',
    src: 'https://cdn.example.com/embed.png',
    classList: { contains: () => false },
    dataset: {},
  };
  const stickerTarget = {
    tagName: 'IMG',
    src: 'https://media.example.com/sticker.png',
    classList: { contains: () => false },
    dataset: {},
  };
  const componentTarget = {
    tagName: 'IMG',
    src: 'https://media.discordapp.net/components/example.png',
    classList: { contains: () => false },
    dataset: {},
  };
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(embedTarget, embedRecord), null);
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(stickerTarget, stickerRecord), null);
  assert.equal(plugin.getSavedImageAttachmentOpenDescriptor(componentTarget, componentRecord), null);
});

test('saved image attachment open descriptor does not mutate source, target, or record', () => {
  const attachment = {
    id: '301',
    filename: 'immutable.png',
    url: 'https://cdn.example.com/immutable.png',
    proxy_url: 'https://media.example.com/immutable.png'
  };
  const message = {
    id: 'immutable-message',
    channel_id: 'channel',
    content: '',
    attachments: [attachment]
  };
  const record = { delete_data: {}, message };
  const target = {
    tagName: 'IMG',
    id: '301',
    src: 'https://cdn.example.com/immutable.png',
    classList: { contains: () => false },
    dataset: {},
  };
  const plugin = createPlugin();
  plugin.style = { imageError: 'ml2-image-error' };
  const attachmentBefore = structuredClone(attachment);
  const messageBefore = structuredClone(message);
  const recordBefore = structuredClone(record);
  const targetBefore = {
    tagName: target.tagName,
    id: target.id,
    src: target.src,
    dataset: structuredClone(target.dataset),
    classList: target.classList
  };
  plugin.getSavedImageAttachmentOpenDescriptor(target, record);
  assert.deepEqual(message, messageBefore);
  assert.deepEqual(record, recordBefore);
  assert.deepEqual(target, targetBefore);
  assert.deepEqual(attachment, attachmentBefore);
});

test('saved attachment open descriptor resolves exact canonical image, video, audio, generic, and removed targets', () => {
  const attachments = [
    { id: '401', filename: 'image.png', url: 'https://cdn.example/image.png' },
    { id: '402', filename: 'video.mp4', url: 'https://cdn.example/video.mp4' },
    { id: '403', filename: 'audio.mp3', url: 'https://cdn.example/audio.mp3' },
    { id: '404', filename: 'document.pdf', url: 'https://cdn.example/document.pdf' }
  ];
  const removed = {
    id: '405',
    filename: 'archive.zip',
    url: 'https://cdn.example/archive.zip'
  };
  const record = {
    delete_data: {},
    message: {
      id: 'saved-message',
      channel_id: 'saved-channel',
      content: '',
      attachments
    },
    removed_attachments: [removed]
  };
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: {
      _resolveImagePath: (id, extension) => `/cache/${id}${extension}`
    }
  });
  const directTarget = (tagName, attachment) => ({
    tagName,
    id: attachment.id,
    src: attachment.url,
    currentSrc: attachment.url,
    dataset: {},
    closest: () => null
  });
  const anchorTarget = attachment => ({
    tagName: 'A',
    href: attachment.url,
    dataset: {},
    closest: () => null
  });
  const removedPlaceholder = {
    tagName: 'DIV',
    textContent: '[attachment:archive.zip]',
    dataset: {
      ml2AttachmentMessageId: 'saved-message',
      ml2AttachmentId: '405'
    },
    getAttribute(name) {
      if (name === 'data-ml2-attachment-message-id') return this.dataset.ml2AttachmentMessageId;
      if (name === 'data-ml2-attachment-id') return this.dataset.ml2AttachmentId;
      return null;
    },
    closest(selector) {
      if (selector.includes('data-ml2-attachment-message-id')
        || selector.includes('data-ml2-attachment-id')) return this;
      return null;
    }
  };

  const descriptors = [
    plugin.getSavedAttachmentOpenDescriptor(directTarget('IMG', attachments[0]), record),
    plugin.getSavedAttachmentOpenDescriptor(directTarget('VIDEO', attachments[1]), record),
    plugin.getSavedAttachmentOpenDescriptor(directTarget('AUDIO', attachments[2]), record),
    plugin.getSavedAttachmentOpenDescriptor(anchorTarget(attachments[3]), record),
    plugin.getSavedAttachmentOpenDescriptor(removedPlaceholder, record)
  ];
  assert.deepEqual(descriptors.map(descriptor => descriptor?.attachment_id), [
    '401', '402', '403', '404', '405'
  ]);
  assert.deepEqual(descriptors.map(descriptor => descriptor?.extension), [
    '.png', '.mp4', '.mp3', '.pdf', '.zip'
  ]);
  assert.deepEqual(descriptors.map(descriptor => descriptor?.local_path), [
    '/cache/401.png',
    '/cache/402.mp4',
    '/cache/403.mp3',
    '/cache/404.pdf',
    '/cache/405.zip'
  ]);
  assert.equal(descriptors[0].display_url, attachments[0].url);
  assert.equal(descriptors[1].display_url, attachments[1].url);
  assert.equal(descriptors[2].display_url, attachments[2].url);
  assert.equal(descriptors[3].display_url, attachments[3].url);
  assert.equal(descriptors[4].display_url, null);
});

test('saved attachment open descriptor resolves a local-only cached TXT anchor from its Blob href', () => {
  const attachment = {
    id: '903',
    filename: 'notes.txt',
    content_type: 'text/plain; charset=utf-8',
    url: 'https://cdn.discordapp.com/attachments/903/notes.txt',
    proxy_url: 'https://media.discordapp.net/attachments/903/notes.txt'
  };
  const record = {
    delete_data: {},
    message: {
      id: '903',
      channel_id: '903',
      content: '',
      attachments: [attachment]
    }
  };
  const blobUrl = 'blob://local/cached/text-903';
  const resolveCalls = [];
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension, channelId, messageId) => {
        resolveCalls.push({ attachmentId, extension, channelId, messageId });
        return attachmentId === '903'
          && extension === '.txt'
          && channelId === '903'
          && messageId === '903'
          ? '/trusted/cache/903.txt'
          : null;
      },
      get: cacheUrl => cacheUrl.includes('/903.txt#') ? blobUrl : null
    }
  });
  const canonicalBefore = structuredClone(record);
  const target = {
    tagName: 'A',
    href: blobUrl,
    download: 'notes.txt',
    dataset: {},
    closest: () => null
  };
  const targetBefore = {
    tagName: target.tagName,
    href: target.href,
    download: target.download,
    dataset: structuredClone(target.dataset),
    closest: target.closest
  };

  const descriptor = plugin.getSavedAttachmentOpenDescriptor(target, record);

  assert.equal(descriptor?.attachment_id, '903');
  assert.equal(descriptor?.filename, 'notes.txt');
  assert.equal(descriptor?.extension, '.txt');
  assert.equal(descriptor?.direct_url, attachment.url);
  assert.equal(descriptor?.proxy_url, attachment.proxy_url);
  assert.deepEqual(descriptor?.remote_urls, [attachment.url, attachment.proxy_url]);
  assert.equal(descriptor?.display_url, blobUrl);
  assert.equal(descriptor?.blob_url, blobUrl);
  assert.equal(descriptor?.local_path, '/trusted/cache/903.txt');
  assert.ok(resolveCalls.length > 0);
  assert.ok(resolveCalls.every(call => (
    call.attachmentId === '903'
    && call.extension === '.txt'
    && call.channelId === '903'
    && call.messageId === '903'
  )));
  assert.equal(
    plugin.getSavedAttachmentOpenDescriptor({
      tagName: 'A',
      href: 'blob://local/cached/unrelated',
      dataset: {},
      closest: () => null
    }, record),
    null
  );
  assert.deepEqual(record, canonicalBefore);
  assert.deepEqual(target, targetBefore);
});

test('saved attachment open descriptor keeps each marked TXT/Markdown/PDF document host authoritative with repeated content', () => {
  const attachments = [
    {
      id: '501',
      filename: 'shared.txt',
      content_type: 'text/plain',
      url: 'https://cdn.example/shared.txt',
      proxy_url: 'https://media.example/shared.txt'
    },
    {
      id: '502',
      filename: 'shared.pdf',
      content_type: 'application/pdf',
      url: 'https://cdn.example/shared.pdf',
      proxy_url: 'https://media.example/shared.pdf'
    },
    {
      id: '503',
      filename: 'README.md',
      content_type: 'text/markdown; charset=utf-8',
      original_content_type: 'text/markdown',
      url: 'https://cdn.example/README.md',
      proxy_url: 'https://media.example/README.md'
    }
  ];
  const record = {
    delete_data: {},
    message: {
      id: 'marked-message',
      channel_id: 'marked-channel',
      content: '[attachment:shared.txt] [attachment:shared.pdf] [attachment:README.md] https://cdn.example/shared.txt https://cdn.example/shared.pdf https://cdn.example/README.md [attachment:shared.txt] [attachment:shared.pdf] [attachment:README.md]',
      attachments
    }
  };
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: true },
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension) => (
        attachmentId === '501' && extension === '.txt' ? '/trusted/cache/shared.txt'
          : attachmentId === '502' && extension === '.pdf' ? '/trusted/cache/shared.pdf'
            : attachmentId === '503' && extension === '.md' ? '/trusted/cache/README.md'
            : null
      )
    }
  });
  const createMarkedDocumentTarget = (attachment, href) => {
    const host = {
      dataset: {
        ml2AttachmentMessageId: 'marked-message',
        ml2AttachmentId: attachment.id,
        ml2AttachmentDocumentHost: 'true'
      },
      getAttribute(name) {
        if (name === 'data-ml2-attachment-message-id') return this.dataset.ml2AttachmentMessageId;
        if (name === 'data-ml2-attachment-id') return this.dataset.ml2AttachmentId;
        return null;
      }
    };
    return {
      tagName: 'A',
      href,
      textContent: '[attachment:shared]',
      dataset: {},
      closest(selector) {
        if (selector.includes('data-ml2-attachment-message-id')
          || selector.includes('data-ml2-attachment-id')
          || selector.includes('[data-ml2-attachment-id]')) return host;
        if (selector.includes('a[href]')) return this;
        return null;
      }
    };
  };
  const targets = [
    createMarkedDocumentTarget(attachments[0], 'blob://local/cached/shared.txt'),
    createMarkedDocumentTarget(attachments[1], 'blob://local/cached/shared.pdf'),
    createMarkedDocumentTarget(attachments[2], 'blob://local/cached/README.md')
  ];

  const descriptors = targets.map(target => plugin.getSavedAttachmentOpenDescriptor(target, record));
  assert.deepEqual(descriptors.map(descriptor => descriptor?.attachment_id), ['501', '502', '503']);
  assert.deepEqual(descriptors.map(descriptor => descriptor?.display_url), [null, null, null]);
  assert.deepEqual(descriptors.map(descriptor => descriptor?.blob_url), [null, null, null]);
  assert.deepEqual(descriptors.map(descriptor => descriptor?.local_path), [
    '/trusted/cache/shared.txt',
    '/trusted/cache/shared.pdf',
    '/trusted/cache/README.md'
  ]);
  assert.deepEqual(descriptors.map(descriptor => descriptor?.remote_urls), [
    [attachments[0].url, attachments[0].proxy_url],
    [attachments[1].url, attachments[1].proxy_url],
    [attachments[2].url, attachments[2].proxy_url]
  ]);

  for (const target of targets) {
    const menuItems = [];
    assert.equal(plugin.addLoggerViewerSavedAttachmentOpenItem(menuItems, target, record), true);
    assert.equal(menuItems.length, 1);
    assert.equal(menuItems[0].label, 'Open Attachment');
  }
});

test('saved attachment open descriptor rejects unmarked attachment links when message content mirrors those URLs', () => {
  const attachment = {
    id: '502',
    filename: 'plain.png',
    url: 'https://cdn.example/plain.png'
  };
  const maskedAttachment = {
    id: '503',
    filename: 'masked.png',
    url: 'https://cdn.example/masked.png'
  };
  const record = {
    delete_data: {},
    message: {
      id: 'message',
      channel_id: 'channel',
      content: 'https://cdn.example/plain.png and [download](https://cdn.example/masked.png)',
      attachments: [attachment, maskedAttachment]
    }
  };
  const plugin = createPlugin();
  const plainAnchorTarget = {
    tagName: 'A',
    href: attachment.url,
    dataset: {},
    closest: () => null
  };
  const maskedLinkTarget = {
    tagName: 'A',
    href: maskedAttachment.url,
    dataset: {},
    closest: () => null
  };

  assert.equal(plugin.getSavedAttachmentOpenDescriptor(plainAnchorTarget, record), null);
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(maskedLinkTarget, record), null);
});

test('saved attachment open descriptor rejects unmarked generic label-only targets when message contains that label', () => {
  const attachment = {
    id: '504',
    filename: 'manual.txt',
    url: 'https://cdn.example/manual.txt'
  };
  const record = {
    delete_data: {},
    message: {
      id: 'label-message',
      channel_id: 'channel',
      content: '[attachment:manual.txt]',
      attachments: [attachment]
    }
  };
  const plugin = createPlugin();
  const labelTarget = {
    tagName: 'SPAN',
    textContent: '[attachment:manual.txt]',
    dataset: {},
    closest: () => null
  };

  assert.equal(plugin.getSavedAttachmentOpenDescriptor(labelTarget, record), null);
});

test('saved attachment open descriptor rejects wrong owners, hidden or ambiguous targets, and non-attachment payloads', () => {
  const attachmentOne = {
    id: '501',
    filename: 'one.png',
    url: 'https://cdn.example/one.png'
  };
  const attachmentTwo = {
    id: '502',
    filename: 'two.mp4',
    url: 'https://cdn.example/two.mp4'
  };
  const hiddenAttachment = {
    id: '503',
    filename: 'hidden.png',
    url: 'https://cdn.example/hidden.png',
    hidden: true
  };
  const record = {
    delete_data: {},
    message: {
      id: 'message',
      channel_id: 'channel',
      content: '',
      attachments: [attachmentOne, attachmentTwo, hiddenAttachment],
      embeds: [{ image: { url: attachmentOne.url } }],
      sticker_items: [{ id: 'sticker', name: 'Sticker', format_type: 1 }],
      components: [{ type: 11, media: { url: 'https://cdn.example/component.png' } }]
    }
  };
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false }
  });
  const collisionEmbed = {
    tagName: 'IMG',
    id: 'embed-image',
    src: attachmentOne.url,
    dataset: {},
    closest: () => null
  };
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(collisionEmbed, record), null);

  const hiddenTarget = {
    tagName: 'IMG',
    id: hiddenAttachment.id,
    src: hiddenAttachment.url,
    dataset: {},
    closest: () => null
  };
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(hiddenTarget, record), null);

  const wrongOwner = {
    tagName: 'DIV',
    dataset: { ml2AttachmentMessageId: 'other-message', ml2AttachmentId: '502' },
    getAttribute(name) {
      if (name === 'data-ml2-attachment-message-id') return this.dataset.ml2AttachmentMessageId;
      if (name === 'data-ml2-attachment-id') return this.dataset.ml2AttachmentId;
      return null;
    },
    closest(selector) {
      if (selector.includes('data-ml2-attachment')) return this;
      return null;
    }
  };
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(wrongOwner, record), null);

  const ancestor = {
    textContent: '',
    parentElement: null,
    querySelectorAll: () => [
      { tagName: 'IMG', id: '501', src: attachmentOne.url, dataset: {} },
      { tagName: 'VIDEO', id: '502', src: attachmentTwo.url, dataset: {} }
    ]
  };
  const ambiguousTarget = {
    tagName: 'SPAN',
    textContent: '',
    dataset: {},
    parentElement: ancestor,
    closest: () => null
  };
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(ambiguousTarget, record), null);

  const externalAnchor = {
    tagName: 'A',
    href: 'https://example.com/unrelated.txt',
    dataset: {},
    closest: () => null
  };
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(externalAnchor, record), null);
});

test('saved attachment external open helper accepts only valid http and https URLs', async () => {
  const opened = [];
  const shell = {
    async openExternal(url) {
      assert.equal(this, shell);
      opened.push(url);
    }
  };
  const plugin = createPlugin({
    nodeModules: {
      fs,
      path,
      electron: { shell }
    }
  });
  assert.equal(await plugin.openSavedMediaExternalUrl('http://example.com/media/test.png'), true);
  assert.equal(await plugin.openSavedMediaExternalUrl('https://example.com/media/test.png'), true);
  assert.deepEqual(opened, [
    'http://example.com/media/test.png',
    'https://example.com/media/test.png'
  ]);
});

test('saved attachment external open helper rejects blob/file/other protocols and invalid URLs', async () => {
  const opened = [];
  const plugin = createPlugin({
    nodeModules: {
      fs,
      path,
      electron: {
        shell: {
          openExternal: async (url) => {
            opened.push(url);
          }
        }
      }
    }
  });
  assert.equal(await plugin.openSavedMediaExternalUrl('blob:https://discord.com/render-only'), false);
  assert.equal(await plugin.openSavedMediaExternalUrl('file:///tmp/cached.png'), false);
  assert.equal(await plugin.openSavedMediaExternalUrl('ftp://example.com/resource'), false);
  assert.equal(await plugin.openSavedMediaExternalUrl('not-a-url'), false);
  assert.deepEqual(opened, []);
});

test('saved attachment external open helper handles missing shell API and openExternal failures', async () => {
  const pluginWithoutShell = createPlugin({
    nodeModules: {
      fs,
      path,
      electron: { shell: {} }
    }
  });
  assert.equal(await pluginWithoutShell.openSavedMediaExternalUrl('https://example.com/media/test.png'), false);
  assert.equal(loggerEvents.length, 1);

  loggerEvents.length = 0;
  const pluginReject = createPlugin({
    nodeModules: {
      fs,
      path,
      electron: {
        shell: {
          openExternal: async () => {
            throw new Error('network blocked');
          }
        }
      }
    }
  });
  assert.equal(await pluginReject.openSavedMediaExternalUrl('https://example.com/media/test.png'), false);
  assert.equal(loggerEvents.length, 1);

  loggerEvents.length = 0;
  const pluginThrow = createPlugin({
    nodeModules: {
      fs,
      path,
      electron: {
        shell: {
          openExternal: () => {
            throw new Error('sync fail');
          }
        }
      }
    }
  });
  assert.equal(await pluginThrow.openSavedMediaExternalUrl('https://example.com/media/test.png'), false);
  assert.equal(loggerEvents.length, 1);
});

test('saved attachment local open helper opens trusted POSIX, Windows, and unicode paths without transformation', async () => {
  const opened = [];
  const localPaths = [
    '/tmp/space cache/space file name #1.PNG',
    'C:\\cache\\windows path\\unicode 频道 #4.png',
    '/tmp/unicode/测试 #文件.png'
  ];
  const shell = {
    async openPath(value) {
      assert.equal(this, shell);
      opened.push(value);
      return '';
    }
  };
  const plugin = createPlugin({
    nodeModules: {
      fs: {
        existsSync: value => localPaths.includes(value),
        lstatSync: () => ({ isFile: () => true })
      },
      path,
      electron: { shell }
    }
  });

  for (const localPath of localPaths) {
    assert.equal(await plugin.openSavedMediaLocalPath(localPath), true);
  }
  assert.deepEqual(opened, localPaths);
});

test('saved attachment local open helper returns false for missing/non-file paths', async () => {
  const opened = [];
  const plugin = createPlugin({
    nodeModules: {
      fs: {
        existsSync: value => value === '/tmp/existing.png',
        lstatSync: () => ({ isFile: () => false })
      },
      path,
      electron: {
        shell: {
          openPath: async (value) => {
            opened.push(value);
            return '';
          }
        }
      }
    }
  });
  assert.equal(await plugin.openSavedMediaLocalPath('/tmp/missing.png'), false);
  assert.equal(await plugin.openSavedMediaLocalPath('/tmp/existing.png'), false);
  assert.deepEqual(opened, []);
});

test('saved attachment local open helper handles missing APIs and openPath result states', async () => {
  const pluginWithoutOpenPath = createPlugin({
    nodeModules: {
      fs,
      path,
      electron: {}
    }
  });
  assert.equal(await pluginWithoutOpenPath.openSavedMediaLocalPath('/tmp/existing.png'), false);

  const pluginMissingPathInfo = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => false
      },
      path,
      electron: {
        shell: {
          openPath: async () => ''
        }
      }
    }
  });
  assert.equal(await pluginMissingPathInfo.openSavedMediaLocalPath('/tmp/existing.png'), false);

  const pluginEmptyOpenResult = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path,
      electron: {
        shell: {
          openPath: async () => ''
        }
      }
    }
  });
  assert.equal(await pluginEmptyOpenResult.openSavedMediaLocalPath('/tmp/existing.png'), true);

  const pluginNonEmptyOpenResult = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path,
      electron: {
        shell: {
          openPath: async () => 'ERROR: ACCESS_DENIED'
        }
      }
    }
  });
  assert.equal(await pluginNonEmptyOpenResult.openSavedMediaLocalPath('/tmp/existing.png'), false);

  const pluginUnexpectedOpenResult = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path,
      electron: {
        shell: {
          openPath: async () => undefined
        }
      }
    }
  });
  assert.equal(await pluginUnexpectedOpenResult.openSavedMediaLocalPath('/tmp/existing.png'), false);
});

test('saved attachment local open helper returns false for openPath rejection or sync throw', async () => {
  const pluginReject = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path,
      electron: {
        shell: {
          openPath: async () => {
            throw new Error('openPath reject');
          }
        }
      }
    }
  });
  assert.equal(await pluginReject.openSavedMediaLocalPath('/tmp/existing.png'), false);

  const pluginThrow = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path,
      electron: {
        shell: {
          openPath: () => {
            throw new Error('openPath throw');
          }
        }
      }
    }
  });
  assert.equal(await pluginThrow.openSavedMediaLocalPath('/tmp/existing.png'), false);
});

test('saved attachment open policy local-only opens unchanged local path with zero remote probes', async () => {
  const descriptor = {
    remote_urls: [
      'blob:https://discord.com/render-only',
      'ftp://cdn.example/no-touch',
      'https://cdn.example/should-not-probe.png'
    ],
    local_path: '/tmp/space cache/space file name #1.png'
  };
  const descriptorBefore = structuredClone(descriptor);
  const calls = {
    probe: 0,
    openExternal: 0,
    local: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    nodeModules: {
      fs: {
        existsSync: value => value === descriptor.local_path,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async () => {
    calls.probe += 1;
    return false;
  };
  plugin.openSavedMediaExternalUrl = async () => {
    calls.openExternal += 1;
    return true;
  };
  plugin.openSavedMediaLocalPath = async localPath => {
    calls.local.push(localPath);
    return true;
  };
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.equal(calls.probe, 0);
  assert.equal(calls.openExternal, 0);
  assert.deepEqual(calls.local, [descriptor.local_path]);
  assert.deepEqual(descriptor, descriptorBefore);
});

test('saved attachment open policy remote-first opens first live remote candidate in order', async () => {
  const descriptor = {
    remote_urls: [
      'https://cdn.example/direct.png',
      'https://cdn.example/proxy.png'
    ],
    local_path: '/tmp/fallback.png'
  };
  const calls = {
    probe: [],
    openExternal: [],
    local: 0
  };
  const plugin = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async url => {
    calls.probe.push(url);
    return url === descriptor.remote_urls[0];
  };
  plugin.openSavedMediaExternalUrl = async url => {
    calls.openExternal.push(url);
    return true;
  };
  plugin.openSavedMediaLocalPath = async () => {
    calls.local += 1;
    return true;
  };
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.deepEqual(calls.probe, [descriptor.remote_urls[0]]);
  assert.deepEqual(calls.openExternal, [descriptor.remote_urls[0]]);
  assert.equal(calls.local, 0);
});

test('saved generic TXT open coordinates an exact direct failure before opening the proxy', async () => {
  const directUrl = 'https://cdn.discordapp.com/attachments/open-text-channel/open-text/notes.txt';
  const proxyUrl = 'https://media.discordapp.net/attachments/open-text-channel/open-text/notes.txt';
  const attachment = {
    id: 'open-text',
    filename: 'notes.txt',
    url: directUrl,
    proxy_url: proxyUrl
  };
  const message = {
    id: 'open-text-message',
    channel_id: 'open-text-channel',
    content: 'body',
    attachments: [attachment]
  };
  const record = { message, delete_data: { time: 1 } };
  const canonicalBefore = structuredClone(message);
  const remounts = [];
  let menuRefreshes = 0;
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/notes.txt',
      get: () => null
    },
    remountSavedAttachmentPresentationRecords: value => remounts.push(value),
    scheduleLoggerMenuRefresh: () => { menuRefreshes++; },
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message);
  const probes = [];
  const opens = [];
  plugin.probeSavedMediaExternalUrl = async url => {
    probes.push(url);
    return url === proxyUrl;
  };
  plugin.openSavedMediaExternalUrl = async url => {
    opens.push(url);
    return true;
  };

  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.deepEqual(probes, [directUrl, proxyUrl]);
  assert.deepEqual(opens, [proxyUrl]);
  assert.deepEqual(remounts, [record]);
  assert.equal(menuRefreshes, 1);
  assert.deepEqual(message, canonicalBefore);

  const context = plugin.resolveSavedAttachmentMediaFailureContext(descriptor);
  const duplicate = plugin.coordinateSavedAttachmentMediaFailure(context, directUrl);
  assert.equal(duplicate.recordedFailure, false);
  assert.equal(remounts.length, 1);
  assert.equal(menuRefreshes, 1);
});

test('saved generic PDF open coordinates both remote failures before opening cached local media', async () => {
  const directUrl = 'https://cdn.discordapp.com/attachments/open-pdf-channel/open-pdf/report.pdf';
  const proxyUrl = 'https://media.discordapp.net/attachments/open-pdf-channel/open-pdf/report.pdf';
  const blobUrl = 'blob://local/open-pdf-report';
  const attachment = {
    id: 'open-pdf',
    filename: 'report.pdf',
    url: directUrl,
    proxy_url: proxyUrl
  };
  const message = {
    id: 'open-pdf-message',
    channel_id: 'open-pdf-channel',
    content: 'body',
    attachments: [attachment]
  };
  const record = { message, delete_data: { time: 1 } };
  const canonicalBefore = structuredClone(message);
  const remounts = [];
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/report.pdf',
      get: () => blobUrl
    },
    remountSavedAttachmentPresentationRecords: value => remounts.push(value),
    nodeModules: {
      fs: {
        existsSync: value => value === '/cache/report.pdf',
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message);
  const probes = [];
  const localOpens = [];
  plugin.probeSavedMediaExternalUrl = async url => {
    probes.push(url);
    return false;
  };
  plugin.openSavedMediaLocalPath = async localPath => {
    localOpens.push(localPath);
    return true;
  };

  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.deepEqual(probes, [directUrl, proxyUrl]);
  assert.deepEqual(localOpens, ['/cache/report.pdf']);
  assert.equal(remounts.length, 2);
  const finalPlan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(finalPlan.mediaType, 'attachment');
  assert.equal(finalPlan.action, 'blob');
  assert.equal(finalPlan.url, blobUrl);
  assert.deepEqual(message, canonicalBefore);
});

test('saved attachment open policy coordinates only active remote-first failures', async () => {
  const makeHarness = settings => {
    const directUrl = 'https://cdn.discordapp.com/attachments/open-policy-channel/open-policy/data.bin';
    const proxyUrl = 'https://media.discordapp.net/attachments/open-policy-channel/open-policy/data.bin';
    const attachment = {
      id: 'open-policy',
      filename: 'data.bin',
      url: directUrl,
      proxy_url: proxyUrl
    };
    const message = {
      id: 'open-policy-message',
      channel_id: 'open-policy-channel',
      attachments: [attachment]
    };
    const record = { message, delete_data: { time: 1 } };
    const remounts = [];
    const plugin = createPlugin({
      settings,
      messageRecord: { [message.id]: record },
      imageCacheServerSimulator: {
        _resolveImagePath: () => '/cache/data.bin',
        get: () => null
      },
      remountSavedAttachmentPresentationRecords: value => remounts.push(value),
      nodeModules: {
        fs: {
          existsSync: () => true,
          lstatSync: () => ({ isFile: () => true })
        },
        path
      }
    });
    return {
      plugin,
      message,
      attachment,
      descriptor: plugin.getSavedAttachmentDescriptor(attachment, message),
      directUrl,
      remounts,
      probes: [],
      opens: []
    };
  };

  const localOnly = makeHarness({ cacheAllImages: true, onlyRenderCachedAttachments: true });
  localOnly.plugin.openSavedMediaLocalPath = async value => {
    localOnly.opens.push(value);
    return true;
  };
  localOnly.plugin.probeSavedMediaExternalUrl = async () => {
    localOnly.probes.push('unexpected');
    return false;
  };
  localOnly.plugin.coordinateSavedAttachmentMediaFailure = () => {
    throw new Error('local-only must not coordinate');
  };
  assert.equal(await localOnly.plugin.openSavedAttachmentDescriptor(localOnly.descriptor), true);
  assert.deepEqual(localOnly.probes, []);
  assert.deepEqual(localOnly.opens, ['/cache/data.bin']);
  assert.equal(localOnly.remounts.length, 0);

  const masterOff = makeHarness({ cacheAllImages: false, onlyRenderCachedAttachments: false });
  masterOff.plugin.probeSavedMediaExternalUrl = async value => {
    masterOff.probes.push(value);
    return false;
  };
  masterOff.plugin.coordinateSavedAttachmentMediaFailure = () => {
    throw new Error('master-off must not coordinate');
  };
  assert.equal(await masterOff.plugin.openSavedAttachmentDescriptor(masterOff.descriptor), false);
  assert.deepEqual(masterOff.probes, [masterOff.directUrl]);
  assert.equal(masterOff.remounts.length, 0);

  const success = makeHarness({ cacheAllImages: true, onlyRenderCachedAttachments: false });
  success.plugin.probeSavedMediaExternalUrl = async value => {
    success.probes.push(value);
    return true;
  };
  success.plugin.openSavedMediaExternalUrl = async value => {
    success.opens.push(value);
    return true;
  };
  success.plugin.coordinateSavedAttachmentMediaFailure = () => {
    throw new Error('successful probes must not coordinate');
  };
  assert.equal(await success.plugin.openSavedAttachmentDescriptor(success.descriptor), true);
  assert.deepEqual(success.probes, [success.descriptor.remote_urls[0]]);
  assert.deepEqual(success.opens, [success.descriptor.remote_urls[0]]);
  assert.equal(success.remounts.length, 0);
});

test('saved attachment open policy remote-first skips failed direct and opens live proxy candidate', async () => {
  const descriptor = {
    remote_urls: [
      'https://cdn.example/direct.png',
      'https://cdn.example/proxy.png'
    ],
    local_path: '/tmp/fallback.png'
  };
  const calls = {
    probe: [],
    openExternal: []
  };
  const plugin = createPlugin({
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async url => {
    calls.probe.push(url);
    return url === descriptor.remote_urls[1];
  };
  plugin.openSavedMediaExternalUrl = async url => {
    calls.openExternal.push(url);
    return true;
  };
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.deepEqual(calls.probe, descriptor.remote_urls);
  assert.deepEqual(calls.openExternal, [descriptor.remote_urls[1]]);
});

test('saved attachment open policy remote-first falls back to local only after remote probe failures', async () => {
  const descriptor = {
    remote_urls: [
      'https://cdn.example/direct.png',
      'https://cdn.example/proxy.png'
    ],
    local_path: '/tmp/fallback.png'
  };
  const calls = {
    probe: [],
    openExternal: 0,
    local: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    nodeModules: {
      fs: {
        existsSync: value => value === descriptor.local_path,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async url => {
    calls.probe.push(url);
    return false;
  };
  plugin.openSavedMediaExternalUrl = async () => {
    calls.openExternal += 1;
    return true;
  };
  plugin.openSavedMediaLocalPath = async localPath => {
    calls.local.push(localPath);
    return true;
  };
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.deepEqual(calls.probe, descriptor.remote_urls);
  assert.equal(calls.openExternal, 0);
  assert.deepEqual(calls.local, [descriptor.local_path]);
});

test('master-off open policy uses only the first valid remote candidate and no local fallback', async () => {
  const descriptor = {
    remote_urls: [
      'https://cdn.example/direct.png',
      'https://cdn.example/proxy.png'
    ],
    local_path: '/tmp/fallback-disabled.png'
  };
  const calls = {
    probe: [],
    openExternal: [],
    local: 0,
    notifications: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: true
    },
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async url => {
    calls.probe.push(url);
    return false;
  };
  plugin.openSavedMediaExternalUrl = async url => {
    calls.openExternal.push(url);
    return true;
  };
  plugin.openSavedMediaLocalPath = async () => {
    calls.local += 1;
    return true;
  };
  plugin.notifyUser = (content, options) => calls.notifications.push([content, options]);
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), false);
  assert.deepEqual(calls.probe, [descriptor.remote_urls[0]]);
  assert.deepEqual(calls.openExternal, []);
  assert.equal(calls.local, 0);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0][0], 'Attachment is no longer available.');
});

test('saved attachment open policy notifies once when no permitted attachment target exists', async () => {
  const descriptor = {
    remote_urls: [
      'https://cdn.example/direct.png',
      'https://cdn.example/proxy.png'
    ]
  };
  const notifications = [];
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    }
  });
  plugin.probeSavedMediaExternalUrl = async () => false;
  plugin.openSavedMediaExternalUrl = async () => true;
  plugin.notifyUser = (content, options) => notifications.push([content, options]);
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), false);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 'Attachment is no longer available.');
});

test('saved attachment open policy reports open failures and avoids local substitutions', async () => {
  const descriptor = {
    remote_urls: ['https://cdn.example/direct.png'],
    local_path: '/tmp/fallback.png'
  };
  const calls = {
    local: 0,
    notifications: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    nodeModules: {
      fs: {
        existsSync: value => value === descriptor.local_path,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async () => true;
  plugin.openSavedMediaExternalUrl = async () => false;
  plugin.openSavedMediaLocalPath = async () => {
    calls.local += 1;
    return true;
  };
  plugin.notifyUser = (content, options) => calls.notifications.push([content, options]);
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), false);
  assert.equal(calls.local, 0);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0][0], 'Attachment could not be opened.');
});

test('saved attachment open policy reports a local shell failure without probing or substituting remote media', async () => {
  const descriptor = {
    remote_urls: ['https://cdn.example/should-not-probe.png'],
    local_path: '/tmp/local-open-failure.png'
  };
  const calls = {
    probe: 0,
    openExternal: 0,
    local: [],
    notifications: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    nodeModules: {
      fs: {
        existsSync: value => value === descriptor.local_path,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = async () => {
    calls.probe += 1;
    return true;
  };
  plugin.openSavedMediaExternalUrl = async () => {
    calls.openExternal += 1;
    return true;
  };
  plugin.openSavedMediaLocalPath = async localPath => {
    calls.local.push(localPath);
    return false;
  };
  plugin.notifyUser = (content, options) => calls.notifications.push([content, options]);

  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), false);
  assert.equal(calls.probe, 0);
  assert.equal(calls.openExternal, 0);
  assert.deepEqual(calls.local, [descriptor.local_path]);
  assert.equal(calls.notifications.length, 1);
  assert.equal(calls.notifications[0][0], 'Attachment could not be opened.');
});

test('saved attachment open policy ignores non-http candidates and dedupes remote candidates', async () => {
  const descriptor = {
    remote_urls: [
      'ftp://cdn.example/ignored-protocol',
      'blob:https://discord.com/render-only',
      'https://cdn.example/allowed.png',
      'https://cdn.example/allowed.png',
      'file:///tmp/cached.png'
    ]
  };
  const calls = {
    probe: [],
    openExternal: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: false,
      onlyRenderCachedAttachments: false
    }
  });
  plugin.probeSavedMediaExternalUrl = async url => {
    calls.probe.push(url);
    return true;
  };
  plugin.openSavedMediaExternalUrl = async url => {
    calls.openExternal.push(url);
    return true;
  };
  assert.equal(await plugin.openSavedAttachmentDescriptor(descriptor), true);
  assert.deepEqual(calls.probe, ['https://cdn.example/allowed.png']);
  assert.deepEqual(calls.openExternal, ['https://cdn.example/allowed.png']);
});

test('saved attachment open policy returns false for stale calls after probe-generation changes', async () => {
  const descriptor = {
    remote_urls: ['https://cdn.example/stale.png'],
    local_path: '/tmp/fallback.png'
  };
  let resolveProbe;
  const calls = {
    local: 0,
    notifications: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = () => new Promise(resolve => {
    resolveProbe = resolve;
  });
  plugin.openSavedMediaLocalPath = async () => {
    calls.local += 1;
    return true;
  };
  plugin.openSavedMediaExternalUrl = async () => {
    calls.openExternal = (calls.openExternal || 0) + 1;
    return true;
  };
  plugin.notifyUser = (content, options) => calls.notifications.push([content, options]);
  const action = plugin.openSavedAttachmentDescriptor(descriptor);
  await delay(10);
  plugin.cancelSavedMediaExternalOpenProbes();
  resolveProbe(true);
  assert.equal(await action, false);
  assert.equal(calls.local, 0);
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.openExternal || 0, 0);
});

test('saved attachment open policy suppresses launch and notice when settings change during an awaited probe', async () => {
  const descriptor = {
    remote_urls: ['https://cdn.example/settings-changed.png'],
    local_path: '/tmp/settings-changed.png'
  };
  let resolveProbe;
  const calls = {
    openExternal: 0,
    local: 0,
    notifications: []
  };
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    },
    nodeModules: {
      fs: {
        existsSync: () => true,
        lstatSync: () => ({ isFile: () => true })
      },
      path
    }
  });
  plugin.probeSavedMediaExternalUrl = () => new Promise(resolve => {
    resolveProbe = resolve;
  });
  plugin.openSavedMediaExternalUrl = async () => {
    calls.openExternal += 1;
    return true;
  };
  plugin.openSavedMediaLocalPath = async () => {
    calls.local += 1;
    return true;
  };
  plugin.notifyUser = (content, options) => calls.notifications.push([content, options]);

  const action = plugin.openSavedAttachmentDescriptor(descriptor);
  await delay(10);
  plugin.settings.onlyRenderCachedAttachments = true;
  resolveProbe(true);

  assert.equal(await action, false);
  assert.equal(calls.openExternal, 0);
  assert.equal(calls.local, 0);
  assert.equal(calls.notifications.length, 0);
});

test('saved attachment external probe validates native request contract and returns true for reachable URL', async () => {
  const seen = [];
  let releaseCount = 0;
  const plugin = createPlugin();
  const netApi = {
    async fetch(url, request) {
      seen.push({ url, request });
      assert.equal(this, netApi);
      assert.equal(request.method, 'GET');
      assert.equal(request.headers?.Range, 'bytes=0-0');
      assert.equal(request.timeout, 0);
      assert.equal(typeof request.signal?.addEventListener, 'function');
      return {
        ok: true,
        release() {
          releaseCount += 1;
        }
      };
    }
  };
  plugin._savedMediaExternalProbeTimeoutMs = 25;
  plugin._getMediaCacheNetApi = () => netApi;
  assert.equal(await plugin.probeSavedMediaExternalUrl('https://cdn.example/probe-a'), true);
  assert.equal(await plugin.probeSavedMediaExternalUrl('http://cdn.example/probe-b'), true);
  assert.deepEqual(seen.map(item => item.url), [
    'https://cdn.example/probe-a',
    'http://cdn.example/probe-b'
  ]);
  assert.equal(releaseCount, 2);
});

test('saved attachment external probe returns false for non-2xx responses and releases the response body', async () => {
  let releaseBodyCount = 0;
  const plugin = createPlugin();
  plugin._savedMediaExternalProbeTimeoutMs = 25;
  plugin._getMediaCacheNetApi = () => ({
    fetch: () => ({
      ok: false,
      status: 404,
      releaseBody: () => {
        releaseBodyCount += 1;
      }
    })
  });
  assert.equal(await plugin.probeSavedMediaExternalUrl('https://cdn.example/probe-status'), false);
  assert.equal(releaseBodyCount, 1);
});

test('saved attachment external probe returns false on fetch rejection, sync throw, and missing native fetch', async () => {
  const pluginReject = createPlugin();
  pluginReject._savedMediaExternalProbeTimeoutMs = 25;
  pluginReject._getMediaCacheNetApi = () => ({
    fetch: async () => {
      throw new Error('rejection');
    }
  });
  assert.equal(await pluginReject.probeSavedMediaExternalUrl('https://cdn.example/reject'), false);

  const pluginThrow = createPlugin();
  pluginThrow._savedMediaExternalProbeTimeoutMs = 25;
  pluginThrow._getMediaCacheNetApi = () => ({
    fetch() {
      throw new Error('sync');
    }
  });
  assert.equal(await pluginThrow.probeSavedMediaExternalUrl('https://cdn.example/throw'), false);

  const pluginMissing = createPlugin();
  pluginMissing._savedMediaExternalProbeTimeoutMs = 25;
  pluginMissing._getMediaCacheNetApi = () => ({});
  assert.equal(await pluginMissing.probeSavedMediaExternalUrl('https://cdn.example/missing'), false);
});

test('saved attachment external probe deduplicates exact URL concurrency and does not reuse settled in-flight results', async () => {
  let releaseCalls = 0;
  const responses = [
    {
      ok: true,
      release() {
        releaseCalls += 1;
      }
    },
    {
      ok: true,
      release() {
        releaseCalls += 1;
      }
    }
  ];
  let fetchCalls = 0;
  const netApi = {
    fetch: () => {
      fetchCalls += 1;
      return Promise.resolve(responses.shift());
    }
  };
  const plugin = createPlugin();
  plugin._savedMediaExternalProbeTimeoutMs = 25;
  plugin._getMediaCacheNetApi = () => netApi;
  const first = plugin.probeSavedMediaExternalUrl('https://cdn.example/shared');
  const second = plugin.probeSavedMediaExternalUrl('https://cdn.example/shared');
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(fetchCalls, 1);
  const third = plugin.probeSavedMediaExternalUrl('https://cdn.example/shared');
  assert.equal(await third, true);
  assert.equal(fetchCalls, 2);
  assert.equal(releaseCalls, 2);
});

test('saved attachment external probe enforces timeout without AbortController and releases late response', async () => {
  const originalAbortController = globalThis.AbortController;
  const releaseValues = [];
  const plugin = createPlugin();
  plugin._savedMediaExternalProbeTimeoutMs = 10;
  plugin._getMediaCacheNetApi = () => ({
    fetch: async () => {
      await delay(25);
      return {
        ok: true,
        body: {
          cancel: () => {
            releaseValues.push('cancel');
          }
        }
      };
    }
  });
  globalThis.AbortController = undefined;
  try {
    const reachable = await plugin.probeSavedMediaExternalUrl('https://cdn.example/timeout');
    assert.equal(reachable, false);
    await delay(40);
    assert.equal(releaseValues.length, 1);
  } finally {
    globalThis.AbortController = originalAbortController;
  }
});

test('saved attachment external probe cancellation prevents stale true completion', async () => {
  const originalAbortController = globalThis.AbortController;
  let releaseCount = 0;
  let resolveFetch;
  const pending = new Promise(resolve => {
    resolveFetch = resolve;
  });
  const plugin = createPlugin();
  plugin._savedMediaExternalProbeTimeoutMs = 100;
  plugin._getMediaCacheNetApi = () => ({
    fetch: () => pending
  });
  globalThis.AbortController = undefined;
  try {
    const probe = plugin.probeSavedMediaExternalUrl('https://cdn.example/stale');
    await delay(10);
    plugin.cancelSavedMediaExternalOpenProbes();
    resolveFetch({
      ok: true,
      releaseBody() {
        releaseCount += 1;
      }
    });
    assert.equal(await probe, false);
    await delay(10);
    assert.equal(releaseCount, 1);
  } finally {
    globalThis.AbortController = originalAbortController;
  }
});

test('saved attachment external probe lifecycle cancellation is invoked on stop and media/render setting transitions', () => {
  const plugin = createPlugin();
  let cancelCalls = 0;
  const originalCancel = plugin.cancelSavedMediaExternalOpenProbes;
  plugin.cancelSavedMediaExternalOpenProbes = () => {
    cancelCalls += 1;
    return originalCancel.call(plugin);
  };
  plugin.stop();
  plugin.handleMediaCachingSetting(false);
  plugin.handleLocalOnlyCachedAttachmentRenderingSetting(false);
  assert.equal(cancelCalls, 3);
});

test('media.discordapp.net media attachment URLs normalize to CDN while preserving signature query and fragment', () => {
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: false
    }
  });
  const attachedUrl = 'https://media.discordapp.net/attachments/channel/999/signed%20photo.png?download=1&width=640&height=360#sig=abc123';
  const message = {
    id: 'message',
    channel_id: 'channel',
    content: 'body',
    attachments: [
      {
        id: 'signed-id',
        filename: 'signed photo.png',
        url: attachedUrl,
        proxy_url: attachedUrl
      }
    ]
  };
  const attachment = message.attachments[0];
  const attachmentBefore = structuredClone(attachment);

  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message);
  assert.deepEqual(descriptor.remote_urls, [
    'https://cdn.discordapp.com/attachments/channel/999/signed%20photo.png?download=1&width=640&height=360#sig=abc123',
    attachedUrl
  ]);

  const plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(plan.action, 'remote');
  assert.equal(plan.url, 'https://cdn.discordapp.com/attachments/channel/999/signed%20photo.png?download=1&width=640&height=360#sig=abc123');

  const rendered = plugin.getCacheOnlyMessage(message);
  assert.equal(rendered.attachments.length, 1);
  assert.equal(rendered.attachments[0].url, 'https://cdn.discordapp.com/attachments/channel/999/signed%20photo.png?download=1&width=640&height=360#sig=abc123');
  assert.equal(rendered.attachments[0].proxy_url, 'https://cdn.discordapp.com/attachments/channel/999/signed%20photo.png?download=1&width=640&height=360#sig=abc123');
  assert.deepEqual(attachment, attachmentBefore);
});

test('decimal per-file MB limits use SI bytes', async () => {
  const cached = [];
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 1.25
    },
    cacheImage(...args) {
      cached.push(args);
    }
  });
  plugin.cacheMessageImages({
    id: 'decimal-limit-message',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [
      {
        id: 'over-limit',
        filename: 'over.bin',
        size: 1_250_001,
        url: 'https://cdn.example/over.bin'
      },
      {
        id: 'at-limit',
        filename: 'at.bin',
        size: 1_250_000,
        url: 'https://cdn.example/at.bin'
      }
    ],
    embeds: [],
    components: [],
    sticker_items: []
  });
  await delay(5);
  assert.equal(cached.length, 1);
  assert.equal(cached[0][0], 'https://cdn.example/at.bin');
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

  plugin.settings.cacheAllImages = false;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.deepEqual(cached, []);

  plugin.settings.cacheAllImages = true;
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

test('ordinary attachment cache admission follows image-family and all-attachment gates', async () => {
  const cached = [];
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      maxCacheFileSize: 0,
      newSaveAllFileTypes: false
    },
    cacheImage(...args) { cached.push(args); }
  });
  const attachments = [
    ['image-jpg', 'image.jpg'],
    ['image-jpeg', 'image.jpeg'],
    ['image-png', 'image.png'],
    ['image-gif', 'image.gif'],
    ['image-bmp', 'image.bmp'],
    ['image-webp', 'image.webp'],
    ['image-avif', 'image.avif'],
    ['image-tif', 'image.tif'],
    ['image-tiff', 'image.tiff'],
    ['video', 'clip.mp4'],
    ['audio', 'clip.mp3'],
    ['text', 'notes.txt'],
    ['markdown', 'README.md'],
    ['pdf', 'manual.pdf'],
    ['generic', 'archive.bin'],
    ['archive', 'bundle.zip'],
    ['font', 'font.woff2'],
    ['unknown', 'payload.unknown']
  ].map(([id, filename]) => ({
    id,
    filename,
    url: `https://cdn.example/ordinary/${id}/${filename}`
  }));
  const message = {
    id: 'ordinary-attachment-gate',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments,
    embeds: [],
    sticker_items: []
  };
  const expectedOwnership = attachments.map((attachment, index) => [
    attachment.url,
    index,
    attachment.id
  ]);
  const imageOwnership = expectedOwnership.slice(0, 9);

  plugin.settings.cacheAllImages = false;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.deepEqual(cached, []);

  plugin.settings.cacheAllImages = true;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.deepEqual(
    cached.map(args => args.slice(0, 3)),
    imageOwnership
  );

  plugin.settings.newSaveAllFileTypes = true;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();

  assert.deepEqual(
    cached.map(args => args.slice(0, 3)),
    [...imageOwnership, ...expectedOwnership]
  );
});

test('sticker image cache admission is owned by the main gate, independent of all-file types', async () => {
  const cached = [];
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: false,
      dontSaveData: false,
      newSaveAllFileTypes: false,
      maxCacheFileSize: 0
    },
    cacheImage(...args) { cached.push(args); }
  });
  const message = {
    id: 'sticker-cache-gate',
    channel_id: 'channel',
    guild_id: 'guild',
    attachments: [],
    embeds: [],
    sticker_items: [
      { id: 'sticker-static', name: 'static', format_type: 1 },
      { id: 'sticker-animated', name: 'animated', format_type: 4 },
      {
        id: 'sticker-webp',
        name: 'webp',
        format_type: 1,
        url: 'https://cdn.example/stickers/sticker-webp.webp'
      }
    ]
  };
  const expected = [
    ['https://media.discordapp.net/stickers/sticker-static.png?size=160', 0, 'sticker-static'],
    ['https://media.discordapp.net/stickers/sticker-animated.gif?size=160', 1, 'sticker-animated'],
    ['https://cdn.example/stickers/sticker-webp.webp', 2, 'sticker-webp']
  ];

  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.deepEqual(cached, []);

  plugin.settings.cacheAllImages = true;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.deepEqual(cached.map(args => args.slice(0, 3)), expected);

  plugin.settings.newSaveAllFileTypes = true;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.deepEqual(cached.map(args => args.slice(0, 3)), [...expected, ...expected]);

  plugin.settings.newSaveAllFileTypes = false;
  plugin.settings.dontSaveData = true;
  plugin.cacheMessageImages(message);
  await waitForQueuedMediaTasks();
  assert.equal(pendingMediaRequestCount(plugin), expected.length);
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

test('provisional media uses exact pre-cache folders, debug logging, and self-healing', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => successfulMediaResponse();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-state-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  let mkdirCalls = 0;
  const fsSpy = {
    ...fs,
    statSync(target, ...args) {
      try {
        return fs.statSync(target, ...args);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        throw new Error(`ENOENT: no such file or directory, stat '${target}'`);
      }
    },
    mkdirSync(...args) {
      mkdirCalls++;
      return fs.mkdirSync(...args);
    }
  };
  const plugin = createMediaCachePlugin(cacheDir, {
    nodeModules: { fs: fsSpy, path },
    settings: {
      cacheAllImages: true,
      dontSaveData: false,
      newSaveAllFileTypes: true,
      maxCacheFileSize: 0,
      addUserIdToSavedMediaFilename: false,
      debugLogging: false,
      imageCacheDir: cacheDir
    }
  });

  await plugin.cacheImage('https://cdn.example/precache-off.png', 0, 41, 'precache', 'channel', 'guild', 0, 0, 'precache');
  assert.equal(mkdirCalls, 1);
  assert.equal(styledConsoleMessages('DEBUG · PRE-CACHE').length, 0);
  assert.equal(fs.existsSync(path.join(`${cacheDir}_PreCache`, 'precache', '41 (precache).png')), true);

  plugin.settings.debugLogging = true;
  await plugin.cacheImage('https://cdn.example/precache-on.png', 0, 42, 'precache', 'channel', 'guild', 0, 0, 'precache');
  assert.equal(mkdirCalls, 1, 'an existing cache directory should not be recreated');
  plugin.settings.debugLogging = false;
  await plugin.cacheImage('https://cdn.example/confirmed.png', 0, 43, 'confirmed', 'channel', 'guild', 0, 0, 'confirmed');
  const stateLogs = [
    ...styledConsoleMessages('DEBUG · PRE-CACHE'),
    ...styledConsoleMessages('MEDIA CACHED')
  ];
  assert.deepEqual(stateLogs, [
    'Pre-cached media: 42 (precache).png',
    'Cached media for saved record: 43 (confirmed).png'
  ]);
  assert.equal(stateLogs.some(message => message.includes(cacheDir)), false);
  assert.equal(fs.existsSync(path.join(cacheDir, '43 (confirmed).png')), true);
});

test('confirmed caching promotes an exact pre-cache file without fetching', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-promote-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    throw new Error('confirmed promotion must not fetch');
  };
  const presentationRefreshes = [];
  const plugin = createMediaCachePlugin(cacheDir, {
    messageRecord: { confirm: { message: { id: 'confirm', author: { id: 'author' } } } },
    scheduleSavedAttachmentPresentationRefresh(...args) {
      presentationRefreshes.push(args.map(String));
    }
  });
  const sourceDirectory = path.join(`${cacheDir}_PreCache`, 'confirm');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(path.join(sourceDirectory, '41 (confirm).png'), 'pre-cached');

  await plugin.cacheImage('https://cdn.example/confirm.png', 0, 41, 'confirm', 'channel', 'guild', 0, 0, 'confirmed');

  assert.equal(fetches, 0);
  assert.equal(fs.existsSync(path.join(cacheDir, '41 (confirm).png')), true);
  assert.equal(fs.existsSync(path.join(sourceDirectory, '41 (confirm).png')), false);
  assert.deepEqual(
    styledConsoleMessages('PROMOTE'),
    ['Promoted pre-cached media to saved cache: 41 (confirm).png']
  );
  assert.deepEqual(presentationRefreshes, [['confirm', '41']]);
});

test('confirmed cache miss fetches into the main cache without creating pre-cache', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-confirmed-miss-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    return successfulMediaResponse();
  };
  const presentationRefreshes = [];
  const plugin = createMediaCachePlugin(cacheDir, {
    messageRecord: { confirmed: { message: { id: 'confirmed', author: { id: 'author' } } } },
    scheduleSavedAttachmentPresentationRefresh(...args) {
      presentationRefreshes.push(args.map(String));
    }
  });

  await plugin.cacheImage('https://cdn.example/confirmed.png', 0, 43, 'confirmed', 'channel', 'guild', 0, 0, 'confirmed');

  assert.equal(fetches, 1);
  assert.equal(fs.existsSync(path.join(cacheDir, '43 (confirmed).png')), true);
  assert.equal(fs.existsSync(`${cacheDir}_PreCache`), false);
  assert.deepEqual(
    styledConsoleMessages('MEDIA CACHED'),
    ['Cached media for saved record: 43 (confirmed).png']
  );
  assert.deepEqual(presentationRefreshes, [['confirmed', '43']]);
});

test('confirmed caching promotes pre-cache media into the saved snapshot location after channel removal', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-saved-location-promote-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    throw new Error('saved-location promotion must not fetch');
  };
  const messageId = '600';
  const channelId = '601';
  const serverId = '700';
  const location = {
    guildId: serverId,
    guildName: 'Snapshot Guild',
    channelId,
    channelName: 'deleted-channel'
  };
  const presentationRefreshes = [];
  let plugin;
  plugin = createMediaCachePlugin(cacheDir, {
    nodeModules: { fs, path },
    ChannelStore: { getChannel: () => null },
    tools: { getChannel: () => null, getServer: () => null },
    messageRecord: {
      [messageId]: {
        message: { id: messageId, channel_id: channelId, guild_id: serverId, author: { id: '800' } },
        delete_data: { location }
      }
    },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => cacheDir,
      resolveNewCachePath: options => plugin.resolveMediaCacheDirectory({ ...options, basePath: cacheDir }),
      cleanUp() {}
    },
    scheduleSavedAttachmentPresentationRefresh(...args) {
      presentationRefreshes.push(args.map(String));
    }
  });
  const sourceDirectory = path.join(`${cacheDir}_PreCache`, messageId);
  const fileName = `41 (${messageId}).png`;
  const sourcePath = path.join(sourceDirectory, fileName);
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(sourcePath, 'pre-cached');

  await plugin.cacheImage('https://cdn.example/saved-location-promote.png', 0, '41', messageId, channelId, serverId, 0, 0, 'confirmed');

  const destinationDirectory = path.join(cacheDir, `${serverId} (Snapshot Guild)`, `${channelId} (deleted-channel)`);
  assert.equal(fetches, 0);
  assert.equal(fs.existsSync(path.join(destinationDirectory, fileName)), true);
  assert.equal(fs.existsSync(sourcePath), false);
  assert.deepEqual(presentationRefreshes, [[messageId, '41']]);
});

test('confirmed caching writes fetched media into the saved snapshot location after channel removal', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-saved-location-write-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    return successfulMediaResponse();
  };
  const messageId = '602';
  const channelId = '603';
  const serverId = '704';
  const location = {
    guildId: serverId,
    guildName: 'Saved Guild',
    channelId,
    channelName: 'removed-channel'
  };
  const presentationRefreshes = [];
  let plugin;
  plugin = createMediaCachePlugin(cacheDir, {
    nodeModules: { fs, path },
    ChannelStore: { getChannel: () => null },
    tools: { getChannel: () => null, getServer: () => null },
    messageRecord: {
      [messageId]: {
        message: { id: messageId, channel_id: channelId, guild_id: serverId, author: { id: '805' } },
        saved_location: location
      }
    },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => cacheDir,
      resolveNewCachePath: options => plugin.resolveMediaCacheDirectory({ ...options, basePath: cacheDir }),
      cleanUp() {}
    },
    scheduleSavedAttachmentPresentationRefresh(...args) {
      presentationRefreshes.push(args.map(String));
    }
  });

  await plugin.cacheImage('https://cdn.example/saved-location-write.png', 0, '42', messageId, channelId, serverId, 0, 0, 'confirmed');

  const destinationPath = path.join(
    cacheDir,
    `${serverId} (Saved Guild)`,
    `${channelId} (removed-channel)`,
    `42 (${messageId}).png`
  );
  assert.equal(fetches, 1);
  assert.equal(fs.existsSync(destinationPath), true);
  assert.deepEqual(presentationRefreshes, [[messageId, '42']]);
});

test('confirmed caching fails closed when the deleted channel has no durable cache location', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-unresolved-location-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    return successfulMediaResponse();
  };
  const messageId = '606';
  const channelId = '607';
  const serverId = '708';
  const fileName = `43 (${messageId}).png`;
  const sourceDirectory = path.join(`${cacheDir}_PreCache`, messageId);
  const sourcePath = path.join(sourceDirectory, fileName);
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(sourcePath, 'pre-cached');
  const counters = { mkdir: 0, write: 0, rename: 0, unlink: 0 };
  const fsSpy = {
    ...fs,
    mkdirSync(...args) { counters.mkdir++; return fs.mkdirSync(...args); },
    writeFileSync(...args) { counters.write++; return fs.writeFileSync(...args); },
    renameSync(...args) { counters.rename++; return fs.renameSync(...args); },
    unlinkSync(...args) { counters.unlink++; return fs.unlinkSync(...args); }
  };
  const presentationRefreshes = [];
  let plugin;
  plugin = createMediaCachePlugin(cacheDir, {
    nodeModules: { fs: fsSpy, path },
    ChannelStore: { getChannel: () => null },
    tools: { getChannel: () => null, getServer: () => null },
    messageRecord: {
      [messageId]: {
        message: { id: messageId, channel_id: channelId, guild_id: serverId, author: { id: '809' } },
        delete_data: { location: [] },
        saved_location: []
      }
    },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => cacheDir,
      resolveNewCachePath: options => plugin.resolveMediaCacheDirectory({ ...options, basePath: cacheDir }),
      cleanUp() {}
    },
    scheduleSavedAttachmentPresentationRefresh(...args) {
      presentationRefreshes.push(args.map(String));
    },
    _mediaCacheMaxAttempts: 3,
    _mediaCacheRetryDelayMs: 0
  });

  await assert.doesNotReject(() => plugin.cacheImage(
    'https://cdn.example/unresolved-location.png',
    0,
    '43',
    messageId,
    channelId,
    serverId,
    0,
    0,
    'confirmed'
  ));

  assert.equal(fetches, 1);
  assert.deepEqual(counters, { mkdir: 0, write: 0, rename: 0, unlink: 0 });
  assert.deepEqual(presentationRefreshes, []);
  assert.equal(fs.existsSync(sourcePath), true);
  assert.equal(fs.existsSync(cacheDir), false);
});

test('a confirmed request joins an in-flight provisional fetch and writes once to main cache', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-join-'));
  const cacheDir = path.join(root, 'missing-cache');
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const pendingResponse = defer();
  let fetches = 0;
  global.fetch = async () => {
    fetches++;
    return pendingResponse.promise;
  };
  const plugin = createMediaCachePlugin(cacheDir);
  const provisional = plugin.cacheImage(
    'https://cdn.example/join.png', 0, 44, 'join', 'channel', 'guild', 0, 0, 'precache'
  );
  await setImmediatePromise();
  plugin.messageRecord = { join: { message: { id: 'join', author: { id: 'author' } } } };
  const confirmed = plugin.cacheImage(
    'https://cdn.example/join.png', 0, 44, 'join', 'channel', 'guild', 0, 0, 'confirmed'
  );
  pendingResponse.resolve(successfulMediaResponse());
  await Promise.all([provisional, confirmed]);

  assert.equal(fetches, 1);
  assert.equal(fs.existsSync(path.join(cacheDir, '44 (join).png')), true);
  assert.equal(fs.existsSync(path.join(`${cacheDir}_PreCache`, 'join')), false);
  assert.deepEqual(
    styledConsoleMessages('MEDIA CACHED'),
    ['Cached media for saved record: 44 (join).png']
  );
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
    logged_attachments: ['later-attachment'],
    removed_attachments: [{
      id: 'removed-attachment',
      filename: 'removed.gif',
      url: 'https://cdn.example/removed.gif'
    }]
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
    'later-attachment',
    'removed-attachment'
  ]));
  assert.equal(plugin.getRecordCachedMediaLabels(record).get('removed-attachment'), 'removed.gif');
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

test('sticker presentation plans project image-backed formats and retain unsupported native aliases', () => {
  const message = {
    id: 'sticker-message',
    channel_id: 'sticker-channel',
    content: 'body',
    attachments: [],
    sticker_items: [
      { id: 'sticker-static', name: 'static', format_type: 1 },
      { id: 'sticker-animated', name: 'animated', format_type: 4 },
      { id: 'sticker-webp', name: 'webp', url: 'https://cdn.example/sticker-webp.webp' },
      { id: 'sticker-native', name: 'native', url: 'https://cdn.example/sticker-native.json', format_type: 3 }
    ],
    stickerItems: [
      { id: 'sticker-static', name: 'static', format_type: 1 },
      { id: 'sticker-native', name: 'native', url: 'https://cdn.example/sticker-native.json', format_type: 3 }
    ],
    stickers: [
      { id: 'sticker-native', name: 'native', url: 'https://cdn.example/sticker-native.json', format_type: 3 }
    ]
  };
  const canonicalBefore = structuredClone(message);
  const createStickerPlugin = (settings, cached = false) => createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: settings.newSaveAllFileTypes,
      onlyRenderCachedAttachments: settings.onlyRenderCachedAttachments,
      ...settings
    },
    imageCacheServerSimulator: {
      _resolveImagePath: (id, extension) => cached && id.startsWith('sticker-')
        ? `/cache/${id}${extension}`
        : null,
      get: cacheUrl => {
        if (!cached) return null;
        const match = /\/([^/]+)(\.[a-z0-9]+)#/.exec(cacheUrl);
        return match ? `blob://local/${match[1]}${match[2]}` : null;
      }
    }
  });

  const remotePlugin = createStickerPlugin({
    cacheAllImages: true,
    newSaveAllFileTypes: false,
    onlyRenderCachedAttachments: false
  });
  const remoteEntries = remotePlugin.getSavedStickerPresentationEntries(message, { allowRemote: true });
  assert.deepEqual(remoteEntries.slice(0, 3).map(entry => entry.attachment.filename), [
    'static.png',
    'animated.gif',
    'webp.webp'
  ]);
  assert.deepEqual(remoteEntries.slice(0, 3).map(entry => entry.plan.mediaType), ['image', 'image', 'image']);
  assert.deepEqual(remoteEntries.slice(0, 3).map(entry => entry.plan.action), ['remote', 'remote', 'remote']);
  assert.equal(remoteEntries[3].attachment, null);
  assert.equal(remoteEntries[3].plan.action, 'native');
  assert.equal(remoteEntries[3].plan.label, '[image:native]');

  const remoteRendered = remotePlugin.getCacheOnlyMessage(message);
  assert.deepEqual(remoteRendered.attachments.map(attachment => attachment.id), [
    'sticker-static',
    'sticker-animated',
    'sticker-webp'
  ]);
  assert.equal(remoteRendered.attachments.every(attachment => (
    attachment._ml2PresentationSourceKind === 'sticker'
      && attachment._ml2PresentationAction === 'remote'
      && attachment._ml2PresentationLabel.startsWith('[image:')
  )), true);
  assert.equal(remoteRendered.sticker_items.length, 1);
  assert.equal(remoteRendered.sticker_items[0].id, 'sticker-native');
  assert.equal(remoteRendered.stickerItems.length, 1);
  assert.equal(remoteRendered.stickers.length, 1);
  assert.deepEqual(message, canonicalBefore);

  const localPlugin = createStickerPlugin({
    cacheAllImages: true,
    newSaveAllFileTypes: true,
    onlyRenderCachedAttachments: true
  }, true);
  const localEntries = localPlugin.getSavedStickerPresentationEntries(message, { allowBlob: true });
  assert.deepEqual(localEntries.slice(0, 3).map(entry => entry.plan.action), ['blob', 'blob', 'blob']);
  assert.deepEqual(localEntries.slice(0, 3).map(entry => entry.plan.url), [
    'blob://local/sticker-static.png',
    'blob://local/sticker-animated.gif',
    'blob://local/sticker-webp.webp'
  ]);
  assert.equal(localEntries[3].plan.action, 'omit');
  assert.equal(localEntries[3].plan.unavailableLabel, '[Not cached: native]');
  const localRendered = localPlugin.getCacheOnlyMessage(message);
  assert.equal(localRendered.attachments.length, 3);
  assert.equal(localRendered.attachments.every(attachment => attachment._ml2PresentationAction === 'blob'), true);
  assert.equal(localRendered.sticker_items.length, 0);
  assert.equal(localRendered.stickerItems.length, 0);
  assert.equal(localRendered.stickers.length, 0);
  assert.deepEqual(message, canonicalBefore);

  for (const childValue of [false, true]) {
    const masterOffPlugin = createStickerPlugin({
      cacheAllImages: false,
      newSaveAllFileTypes: childValue,
      onlyRenderCachedAttachments: false
    });
    const masterOffEntries = masterOffPlugin.getSavedStickerPresentationEntries(message, { allowRemote: true });
    assert.deepEqual(masterOffEntries.map(entry => entry.plan.action), [
      'placeholder', 'placeholder', 'placeholder', 'placeholder'
    ]);
    assert.equal(masterOffEntries[0].plan.unavailableLabel, '[Not cached: static.png]');
    assert.equal(masterOffEntries[3].plan.unavailableLabel, '[Not cached: native]');
    const masterOffRendered = masterOffPlugin.getCacheOnlyMessage(message);
    assert.equal(masterOffRendered.attachments.length, 0);
    assert.equal(masterOffRendered.sticker_items.length, 0);
    assert.equal(masterOffRendered.stickerItems.length, 0);
    assert.equal(masterOffRendered.stickers.length, 0);
    const nativePlaceholder = masterOffPlugin.getNativeDeletedAttachmentPresentationMessage(message);
    assert.equal(nativePlaceholder.content.includes('[Not cached: static.png]'), true);
    assert.equal(nativePlaceholder.content.includes('[Not cached: native]'), true);
    assert.deepEqual(message, canonicalBefore);
  }

  const loggerEntries = remotePlugin.getLoggerSavedAttachmentPresentationEntries(message, {});
  assert.deepEqual(loggerEntries.map(entry => entry.sourceKind), ['sticker', 'sticker', 'sticker']);
  assert.deepEqual(loggerEntries.map(entry => entry.attachment.id), [
    'sticker-static',
    'sticker-animated',
    'sticker-webp'
  ]);
  assert.deepEqual(loggerEntries.map(entry => entry.plan.url), remoteEntries.slice(0, 3).map(entry => entry.plan.url));
});

test('sticker-only saved records use native projection, content correction, refresh, and media retry paths', async () => {
  const sticker = {
    id: 'live-sticker',
    name: 'live-sticker',
    format_type: 1
  };
  const message = {
    id: '153899100000000001',
    channel_id: '361510651807531009',
    content: '',
    attachments: [],
    sticker_items: [sticker],
    stickerItems: [{ ...sticker }],
    stickers: [{ ...sticker }]
  };
  const record = {
    message,
    delete_data: { time: 1 }
  };
  const canonicalBefore = structuredClone(message);
  const stickerUrl = 'https://media.discordapp.net/stickers/live-sticker.png?size=160';

  const masterOffPlugin = createPlugin({
    settings: {
      cacheAllImages: false,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: false
    },
    messageRecord: { [message.id]: record },
    messageRecordIds: new Set([message.id])
  });
  masterOffPlugin.shouldPresentSavedMessage = () => true;
  const offRendered = masterOffPlugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(offRendered.content, '[Not cached: live-sticker.png]');
  assert.deepEqual(offRendered.attachments, []);
  assert.deepEqual(offRendered.sticker_items, []);
  assert.deepEqual(offRendered.stickerItems, []);
  assert.deepEqual(offRendered.stickers, []);
  const corrected = masterOffPlugin.getNativeDeletedAttachmentPresentationMessageForMessageContent({
    ...message,
    sticker_items: [{ ...sticker }],
    stickerItems: [{ ...sticker }],
    stickers: [{ ...sticker }]
  });
  assert.equal(corrected.content, '[Not cached: live-sticker.png]');
  const stickerOnlyWithoutAttachments = structuredClone(message);
  delete stickerOnlyWithoutAttachments.attachments;
  assert.doesNotThrow(() => {
    masterOffPlugin.getSavedAttachmentMessageContentPresentationMessage(
      stickerOnlyWithoutAttachments
    );
  });
  assert.deepEqual(message, canonicalBefore);

  const remotePlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: false
    },
    imageCacheServerSimulator: { get: () => null }
  });
  const remoteRendered = remotePlugin.getCacheOnlyMessage(message);
  assert.equal(remoteRendered.attachments.length, 1);
  assert.equal(remoteRendered.attachments[0].id, 'live-sticker');
  assert.equal(remoteRendered.attachments[0].url, stickerUrl);
  assert.equal(remoteRendered.attachments[0]._ml2PresentationSourceKind, 'sticker');
  assert.deepEqual(remoteRendered.sticker_items, []);
  assert.deepEqual(remoteRendered.stickerItems, []);
  assert.deepEqual(remoteRendered.stickers, []);

  const localPlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      _resolveImagePath: (attachmentId, extension, channelId, messageId) => {
        assert.equal(attachmentId, 'live-sticker');
        assert.equal(extension, '.png');
        assert.equal(channelId, '361510651807531009');
        assert.equal(messageId, '153899100000000001');
        return '/cache/live-sticker.png';
      },
      get: cacheUrl => cacheUrl.includes('/live-sticker.png#')
        ? 'blob://local/live-sticker.png'
        : null
    }
  });
  const localRendered = localPlugin.getCacheOnlyMessage(message);
  assert.equal(localRendered.attachments.length, 1);
  assert.equal(localRendered.attachments[0].url, 'blob://local/live-sticker.png');
  assert.deepEqual(message, canonicalBefore);

  let refreshRecords = null;
  const refreshPlugin = createPlugin({
    selectedChannel: { id: message.channel_id },
    deletedMessageRecord: { [message.channel_id]: [message.id] },
    messageRecord: { [message.id]: record },
    settings: { cacheAllImages: false, newSaveAllFileTypes: false },
    remountSavedAttachmentPresentationRecords(records) {
      refreshRecords = records;
      return records.length;
    }
  });
  refreshPlugin.refreshAttachmentRendering();
  assert.equal(refreshRecords.length, 1);
  assert.strictEqual(refreshRecords[0], record);

  let scheduledRemounts = 0;
  const schedulePlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: true
    },
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/live-sticker.png',
      get: () => 'blob://local/live-sticker.png'
    },
    remountSavedAttachmentPresentationRecords() {
      scheduledRemounts++;
    },
    dispatcher: { dispatch() {} }
  });
  schedulePlugin.scheduleSavedAttachmentPresentationRefresh(message.id, sticker.id);
  await setImmediatePromise();
  assert.equal(scheduledRemounts, 1);

  let blobAvailable = true;
  const errorPlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: false,
      onlyRenderCachedAttachments: false
    },
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/live-sticker.png',
      get: () => blobAvailable ? 'blob://local/live-sticker.png' : null
    },
    remountSavedAttachmentPresentationRecords() {}
  });
  const targetRow = { id: `chat-messages-${message.channel_id}-${message.id}` };
  errorPlugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: stickerUrl,
      closest: createNativeMediaClosest(targetRow)
    }
  });
  const blobFallback = errorPlugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(blobFallback.attachments[0].url, 'blob://local/live-sticker.png');
  blobAvailable = false;
  const deletedFallback = errorPlugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(deletedFallback.attachments.length, 0);
  assert.equal(deletedFallback.content, '[Deleted: live-sticker.png]');
  assert.deepEqual(message, canonicalBefore);
});

test('unsupported native-only stickers show one Logger placeholder only when remote presentation is unavailable', () => {
  const message = {
    id: 'unsupported-sticker-message',
    channel_id: 'unsupported-sticker-channel',
    content: '',
    attachments: [],
    sticker_items: [{
      id: 'unsupported-sticker',
      name: 'native-only',
      format_type: 3,
      url: 'https://cdn.example/native-only.json'
    }]
  };
  const record = { message, delete_data: { time: 1 } };
  const canonicalBefore = structuredClone(message);

  for (const [label, settings, expectedAction] of [
    ['master off', { cacheAllImages: false, onlyRenderCachedAttachments: false }, 'placeholder'],
    ['local only', { cacheAllImages: true, onlyRenderCachedAttachments: true }, 'omit']
  ]) {
    for (const newSaveAllFileTypes of [false, true]) {
      const plugin = createPlugin({
        settings: { ...settings, newSaveAllFileTypes },
        messageRecord: { [message.id]: record }
      });
      const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);
      assert.equal(entries.length, 1, `${label} must expose one placeholder entry`);
      assert.equal(entries[0].sourceKind, 'sticker');
      assert.equal(entries[0].attachment.id, 'unsupported-sticker');
      assert.equal(entries[0].attachment.filename, 'native-only');
      assert.equal(entries[0].attachment.url, undefined);
      assert.equal(entries[0].attachment._ml2UnsupportedSticker, true);
      assert.equal(entries[0].plan.action, expectedAction);
      assert.equal(entries[0].plan.unavailableLabel, '[Not cached: native-only]');
      assert.deepEqual(message, canonicalBefore);
    }
  }

  for (const newSaveAllFileTypes of [false, true]) {
    const plugin = createPlugin({
      settings: {
        cacheAllImages: true,
        onlyRenderCachedAttachments: false,
        newSaveAllFileTypes
      },
      messageRecord: { [message.id]: record }
    });
    const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);
    assert.equal(entries.length, 0, 'remote/native presentation must retain native behavior without a duplicate');
    const stickerEntry = plugin.getSavedStickerPresentationEntries(message, { allowRemote: true })[0];
    assert.equal(stickerEntry.attachment, null);
    assert.equal(stickerEntry.plan.action, 'native');
    assert.deepEqual(message, canonicalBefore);
  }
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
      debugLogging: true,
      debugToasts: false,
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
  assert.deepEqual(styledConsoleMessages('DEBUG'), [MEDIA_CACHE_LEGACY_ROUTING_NOTICE]);
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
  await plugin.cacheImage(
    'https://cdn.example/fresh.png',
    0,
    2,
    'message',
    'channel',
    'guild',
    0,
    plugin._mediaCacheWriteEpoch || 0,
    'confirmed'
  );
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

test('manual cached-file removal keeps View files while automatic removal deletes and logs without a notice', async t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-manual-cache-delete-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const manualRecord = {
    message: {
      id: '200',
      channel_id: 'channel',
      attachments: [{ id: 'manual-attachment', filename: 'manual.png' }]
    }
  };
  const { plugin, notifications } = createCachedRecordDeletionPlugin(cacheDir, { 200: manualRecord });
  fs.writeFileSync(path.join(cacheDir, 'manual-attachment (200).png'), 'manual');

  plugin.deleteMessageFromRecords('200');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(fs.existsSync(path.join(cacheDir, 'manual-attachment (200).png')), false);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /Deleted cached attachment: manual\.png/);
  assert.deepEqual(notifications[0].options.actions.map(action => action.label), ['View files']);

  const automaticRecord = {
    message: {
      id: '201',
      channel_id: 'channel',
      attachments: [{ id: 'automatic-attachment', filename: 'automatic.png' }]
    }
  };
  plugin.messageRecord[201] = automaticRecord;
  plugin.messageRecordIds.add('201');
  plugin.deletedMessageRecord.channel = ['201'];
  plugin.deletedMessageSet.set('channel', new Set(['201']));
  fs.writeFileSync(path.join(cacheDir, 'automatic-attachment (201).png'), 'automatic');

  plugin.deleteMessageFromRecords('201', { automatic: true });
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(fs.existsSync(path.join(cacheDir, 'automatic-attachment (201).png')), false);
  assert.equal(notifications.length, 1, 'automatic cleanup must not queue an attachment notice');
  assert.equal(
    loggerEvents.filter(event => event[0] === 'log' && String(event[1]).includes('Deleted 1 cached file')).length,
    2,
    'automatic cleanup must retain CACHE DELETE console logging'
  );
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

test('automatic forum cleanup carries its no-notice option through root and child records', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-automatic-forum-delete-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const root = {
    message: {
      id: '300',
      channel_id: '300',
      attachments: [{ id: 'root-attachment', filename: 'root.png' }]
    },
    delete_data: { forum_thread_delete: true }
  };
  const child = {
    message: {
      id: '301',
      channel_id: '300',
      attachments: [{ id: 'child-attachment', filename: 'child.png' }]
    },
    delete_data: { forum_thread_message_delete: true }
  };
  const queueCalls = [];
  const { plugin, notifications } = createCachedRecordDeletionPlugin(cacheDir, { 300: root, 301: child }, {
    queueCachedFilesDeletedToast(labels) {
      queueCalls.push(labels);
    }
  });
  fs.writeFileSync(path.join(cacheDir, 'root-attachment (300).png'), 'root');
  fs.writeFileSync(path.join(cacheDir, 'child-attachment (301).png'), 'child');

  const removed = plugin.deleteMessageFromRecords('300', { automatic: true });

  assert.deepEqual(new Set(removed), new Set(['300', '301']));
  assert.equal(fs.existsSync(path.join(cacheDir, 'root-attachment (300).png')), false);
  assert.equal(fs.existsSync(path.join(cacheDir, 'child-attachment (301).png')), false);
  assert.deepEqual(queueCalls, []);
  assert.deepEqual(notifications, []);
  assert.equal(
    loggerEvents.filter(event => event[0] === 'log' && String(event[1]).includes('Deleted 1 cached file')).length,
    2,
    'automatic forum cleanup must retain one CACHE DELETE log per record'
  );
});

test('automatic cap and invalid-record cleanup delete cached files without entering the attachment notice queue', async t => {
  for (const showMediaCacheTrimLifecycleToasts of [false, true]) {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-automatic-record-delete-'));
    t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
    const capRecord = {
      message: {
        id: showMediaCacheTrimLifecycleToasts ? '401' : '400',
        channel_id: 'channel',
        attachments: [{ id: 'cap-attachment', filename: 'cap.png' }]
      }
    };
    const capQueueCalls = [];
    const capFixture = createCachedRecordDeletionPlugin(cacheDir, {
      [capRecord.message.id]: capRecord
    }, {
      settings: { savedMessagesCap: 0, showMediaCacheTrimLifecycleToasts },
      sortMessagesByAge() {},
      saveData() {},
      editHistoryAntiSpam: {},
      queueCachedFilesDeletedToast(labels) {
        capQueueCalls.push(labels);
      }
    });
    const capFile = path.join(cacheDir, `cap-attachment (${capRecord.message.id}).png`);
    fs.writeFileSync(capFile, 'cap');
    capFixture.plugin.handleMessagesCap();
    assert.equal(fs.existsSync(capFile), false);
    assert.deepEqual(capQueueCalls, []);

    const invalidRecord = {
      message: {
        id: showMediaCacheTrimLifecycleToasts ? '501' : '500',
        channel_id: 'channel',
        attachments: [{ id: 'invalid-attachment', filename: 'invalid.png' }]
      }
    };
    const invalidQueueCalls = [];
    const invalidFixture = createCachedRecordDeletionPlugin(cacheDir, {
      [invalidRecord.message.id]: invalidRecord
    }, {
      settings: { showMediaCacheTrimLifecycleToasts },
      queueCachedFilesDeletedToast(labels) {
        invalidQueueCalls.push(labels);
      }
    });
    const invalidFile = path.join(cacheDir, `invalid-attachment (${invalidRecord.message.id}).png`);
    fs.writeFileSync(invalidFile, 'invalid');
    invalidFixture.plugin.reAddDeletedMessages([], [invalidRecord.message.id], true, true);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(fs.existsSync(invalidFile), false);
    assert.deepEqual(invalidQueueCalls, []);
  }
});

test('resolveMediaCacheDirectory prefers live cache names over conflicting saved names', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-live-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '902';
  const guildId = '2002';
  const before = fs.readdirSync(cacheDir).sort();

  const plugin = createPlugin({
    nodeModules: { fs, path },
    ChannelStore: {
      getChannel: id => id === channelId
        ? { id, guild_id: guildId, name: 'live-channel', type: 0 }
        : null
    },
    tools: {
      getChannel: id => id === channelId
        ? { id, guild_id: '9999', name: 'tool-channel', type: 0 }
        : null,
      getServer: id => id === guildId ? { id, name: 'live-guild' } : null
    }
  });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId,
    serverId: '5555',
    location: {
      guildId: '6666',
      guildName: 'snapshot-guild',
      channelId,
      channelName: 'snapshot-channel'
    }
  });
  assert.equal(resolved, path.join(cacheDir, `${guildId} (live-guild)`, `${channelId} (live-channel)`));
  assert.equal(fs.existsSync(resolved), false);
  assert.deepEqual(fs.readdirSync(cacheDir).sort(), before);
});

test('resolveMediaCacheDirectory uses durable snapshot names when live stores are absent', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-snapshot-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '903';
  const guildId = '3003';
  const before = fs.readdirSync(cacheDir).sort();

  const plugin = createPlugin({
    nodeModules: { fs, path },
    ChannelStore: {
      getChannel: () => null
    },
    tools: {
      getChannel: () => null,
      getServer: () => null
    }
  });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId,
    location: {
      guildId,
      guildName: 'snapshot-guild',
      channelId,
      channelName: 'snapshot-channel'
    }
  });
  assert.equal(resolved, path.join(cacheDir, `${guildId} (snapshot-guild)`, `${channelId} (snapshot-channel)`));
  assert.equal(fs.existsSync(resolved), false);
  assert.deepEqual(fs.readdirSync(cacheDir).sort(), before);
});

test('resolveMediaCacheDirectory resolves saved DMs from null guild identity', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-dm-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '904';
  const before = fs.readdirSync(cacheDir).sort();

  const plugin = createPlugin({
    nodeModules: { fs, path },
    ChannelStore: {
      getChannel: () => null
    },
    tools: {
      getChannel: () => null,
      getServer: () => null
    }
  });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId,
    serverId: null,
    location: {
      guildId: null,
      channelId,
      channelName: 'direct-channel'
    }
  });
  assert.equal(resolved, path.join(cacheDir, 'DMs', `${channelId} (direct-channel)`));
  assert.equal(fs.existsSync(resolved), false);
  assert.deepEqual(fs.readdirSync(cacheDir).sort(), before);
});

test('resolveMediaCacheDirectory uses direct DM recipient name when live DM has no channel name', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-dm-recipient-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '905';

  const plugin = createPlugin({
    nodeModules: { fs, path },
    ChannelStore: {
      getChannel: id => id === channelId
        ? {
          id,
          type: 1,
          recipients: [{ id: 'r1' }],
          rawRecipients: [{ username: 'Direct User' }]
        }
        : null
    },
    tools: {
      getChannel: () => null,
      getServer: () => null
    }
  });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId,
    serverId: null
  });
  assert.equal(resolved, path.join(cacheDir, 'DMs', `${channelId} (Direct User)`));
});

test('resolveMediaCacheDirectory rejects invalid channel ids without touching disk', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-invalid-channel-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const before = fs.readdirSync(cacheDir).sort();
  const plugin = createPlugin({ nodeModules: { fs, path } });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId: '../0010/../../etc/passwd',
    serverId: '100',
    location: {
      channelId: '../0010/../../etc/passwd',
      channelName: 'ignored',
      guildId: '200',
      guildName: 'ignored'
    }
  });
  assert.equal(resolved, null);
  assert.deepEqual(fs.readdirSync(cacheDir).sort(), before);
});

test('resolveMediaCacheDirectory non-DM live channels with invalid or null guild ids do not use DMs', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-live-guild-invalid-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '907';
  fs.mkdirSync(path.join(cacheDir, 'DMs'));

  const plugin = createPlugin({
    nodeModules: { fs, path },
    ChannelStore: {
      getChannel: id => id === channelId
        ? {
          id,
          type: 0,
          guild_id: null,
          name: 'Guild Channel'
        }
        : null
    },
    tools: {
      getChannel: id => id === channelId
        ? { id, type: 0, name: 'Tool Channel', guild_id: '12 34' }
        : null,
      getServer: () => null
    }
  });

  for (const serverId of ['12 34', null]) {
    const resolved = plugin.resolveMediaCacheDirectory({
      basePath: cacheDir,
      channelId,
      serverId,
      location: {
        channelId,
        channelName: 'ignored'
      }
    });
    assert.equal(resolved, null);
  }
  assert.equal(fs.existsSync(path.join(cacheDir, 'DMs', `${channelId} (Guild Channel)`)), false);
});

test('resolveMediaCacheDirectory considers existing DMs folder when guild identity is unknown', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-dm-fallback-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '906';
  const dmRoot = path.join(cacheDir, 'DMs');
  const dmChannelPath = path.join(dmRoot, `${channelId} (fallback-dm-channel)`);
  fs.mkdirSync(dmRoot);
  fs.mkdirSync(dmChannelPath);

  const plugin = createPlugin({
    nodeModules: { fs, path },
    ChannelStore: {
      getChannel: () => null
    },
    tools: {
      getChannel: () => null,
      getServer: () => null
    }
  });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId
  });
  assert.equal(resolved, dmChannelPath);
});

test('resolveMediaCacheDirectory falls back to matching legacy folders and ignores invalid siblings', t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-cache-resolve-fallback-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  const channelId = '905';
  const legacyOne = path.join(cacheDir, '100 (legacy-one)');
  const legacyTwo = path.join(cacheDir, '200 (legacy-two)');
  fs.mkdirSync(legacyOne);
  fs.mkdirSync(legacyTwo);
  const legacyOneChannel = path.join(legacyOne, `${channelId} (legacy-name)`);
  const legacyTwoChannel = path.join(legacyTwo, `${channelId} (fallback-name)`);
  fs.mkdirSync(legacyOneChannel);
  fs.mkdirSync(legacyTwoChannel);
  fs.mkdirSync(path.join(legacyOne, `${channelId}0 (prefix-collision)`));
  fs.mkdirSync(path.join(legacyTwo, `${channelId} (broken`));
  fs.writeFileSync(path.join(cacheDir, '500 (file-sibling)'), 'invalid sibling');
  const oldTime = new Date(Date.now() - 60000);
  const newTime = new Date();
  fs.utimesSync(legacyOneChannel, oldTime, oldTime);
  fs.utimesSync(legacyTwoChannel, newTime, newTime);

  const plugin = createPlugin({
    nodeModules: { fs, path },
    tools: {
      getChannel: () => null,
      getServer: () => null
    }
  });

  const resolved = plugin.resolveMediaCacheDirectory({
    basePath: cacheDir,
    channelId
  });
  assert.equal(resolved, legacyTwoChannel);

  const before = fs.readdirSync(cacheDir).sort();
  const missing = plugin.resolveMediaCacheDirectory({ basePath: cacheDir, channelId: '906' });
  const after = fs.readdirSync(cacheDir).sort();
  assert.equal(missing, null);
  assert.deepEqual(before, after);
});

test('native saved-attachment viewer relabels only its linked tooltip and restores owned labels', () => {
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;
  const createAttributeNode = (attributes = {}, options = {}) => {
    const values = new Map(Object.entries(attributes));
    return {
      childElementCount: options.childElementCount ?? 0,
      textContent: options.textContent ?? '',
      hasAttribute(name) {
        return values.has(name);
      },
      getAttribute(name) {
        return values.get(name) ?? null;
      },
      setAttribute(name, value) {
        values.set(name, String(value));
      },
      removeAttribute(name) {
        values.delete(name);
      },
      ...options
    };
  };
  const displayUrl = 'blob:https://discord.com/logger-viewer';
  const openControl = createAttributeNode({
    'aria-label': 'Open Link',
    title: 'Open in Browser'
  });
  const ownedTooltip = createAttributeNode({ role: 'tooltip' }, {
    textContent: 'Open in Browser'
  });
  const unrelatedTooltip = createAttributeNode({ role: 'tooltip' }, {
    textContent: 'Open Link'
  });
  const media = { currentSrc: displayUrl };
  const viewerRoot = createAttributeNode({}, {
    querySelectorAll(selector) {
      if (selector === 'img, video') return [media];
      if (selector === '[aria-label], [title]') return [openControl];
      return [];
    }
  });
  let observerOptions = null;
  let cancelledFrame = null;
  global.document = {
    body: {},
    querySelectorAll(selector) {
      assert.equal(selector, '[role="dialog"], [aria-modal="true"]');
      return [viewerRoot];
    },
    getElementById(id) {
      if (id === 'owned-open-tooltip') return ownedTooltip;
      if (id === 'unrelated-tooltip') return unrelatedTooltip;
      return null;
    }
  };
  global.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target, options) {
      assert.equal(target, global.document.body);
      observerOptions = options;
    }
    disconnect() {}
  };
  global.requestAnimationFrame = () => 73;
  global.cancelAnimationFrame = frame => {
    cancelledFrame = frame;
  };
  try {
    const descriptor = { display_url: displayUrl, blob_url: displayUrl };
    const plugin = createMediaCachePlugin('', {
      getLoggerOwnedNativeSavedAttachmentViewerDescriptor: () => descriptor,
      _savedAttachmentViewerLabelChanges: new Map()
    });

    assert.equal(plugin.syncSavedAttachmentViewerLabels(), true);
    assert.equal(openControl.getAttribute('aria-label'), 'Open Attachment');
    assert.equal(openControl.getAttribute('title'), 'Open Attachment');
    assert.equal(ownedTooltip.textContent, 'Open in Browser');
    assert.equal(unrelatedTooltip.textContent, 'Open Link');

    // Discord adds aria-describedby only after the hover tooltip mounts. A second sync must use
    // the already-recorded original open label to retain exact ownership of that portal node.
    openControl.setAttribute('aria-describedby', 'owned-open-tooltip');
    assert.equal(plugin.syncSavedAttachmentViewerLabels(), true);
    assert.equal(ownedTooltip.textContent, 'Open Attachment');
    assert.equal(unrelatedTooltip.textContent, 'Open Link');

    plugin.restoreSavedAttachmentViewerLabels();
    assert.equal(openControl.getAttribute('aria-label'), 'Open Link');
    assert.equal(openControl.getAttribute('title'), 'Open in Browser');
    assert.equal(ownedTooltip.textContent, 'Open in Browser');
    assert.equal(unrelatedTooltip.textContent, 'Open Link');

    assert.equal(plugin.startSavedAttachmentViewerLabelSync(), true);
    assert.deepEqual(observerOptions.attributeFilter, [
      'aria-label',
      'title',
      'aria-describedby',
      'src'
    ]);
    plugin.stopSavedAttachmentViewerLabelSync();
    assert.equal(cancelledFrame, 73);
  } finally {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
    if (OriginalMutationObserver === undefined) delete global.MutationObserver;
    else global.MutationObserver = OriginalMutationObserver;
    if (originalRequestAnimationFrame === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = originalRequestAnimationFrame;
    if (originalCancelAnimationFrame === undefined) delete global.cancelAnimationFrame;
    else global.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('mounted saved-attachment viewer binds after the click context clears and routes only its exact display source', async () => {
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;
  let observerCallback = null;
  let frameCallback = null;
  let viewerRoots = [];
  const blobUrl = 'blob:https://discord.com/logger-async-viewer';
  const descriptor = {
    display_url: blobUrl,
    blob_url: blobUrl,
    remote_urls: ['https://cdn.example/attachment.png'],
    local_path: '/cache/attachment.png'
  };
  const media = { currentSrc: blobUrl };
  const viewerRoot = {
    isConnected: true,
    querySelectorAll(selector) {
      if (selector === 'img, video') return [media];
      if (selector === '[aria-label], [title]') return [];
      return [];
    },
    getAttribute() {
      return null;
    }
  };
  global.document = {
    body: {},
    querySelectorAll(selector) {
      assert.equal(selector, '[role="dialog"], [aria-modal="true"]');
      return viewerRoots;
    },
    contains(node) {
      return viewerRoots.includes(node) && node.isConnected !== false;
    },
    getElementById() {
      return null;
    }
  };
  global.MutationObserver = class {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  };
  global.requestAnimationFrame = callback => {
    frameCallback = callback;
    return 91;
  };
  global.cancelAnimationFrame = () => {};

  const opened = [];
  let originalCalls = 0;
  const plugin = createMediaCachePlugin('', {
    getMountedLoggerRecordFromTarget: () => ({ delete_data: {}, message: {} }),
    getSavedAttachmentOpenDescriptor: () => descriptor,
    installNativeAttachmentMediaViewerOwnershipTracking: () => true,
    openSavedAttachmentDescriptor(value) {
      opened.push(value);
      return Promise.resolve(true);
    }
  });
  plugin.tools = { getNativeMediaModal: () => ({ modalKey: 'native-viewer-modal' }) };
  plugin.ModalStack = { hasModalOpen: () => false };

  try {
    assert.equal(plugin.captureMountedSavedAttachmentViewerOpen({ button: 0, target: {} }), true);
    assert.equal(typeof observerCallback, 'function');
    assert.equal(typeof frameCallback, 'function');
    assert.equal(plugin._pendingMountedSavedAttachmentViewerDescriptor, descriptor);

    await delay(0);
    assert.equal(plugin._nativeMediaViewerOpenContextDepth, 0);
    assert.equal(plugin._pendingNativeSavedImageOpenDescriptor, null);
    assert.equal(plugin._pendingMountedSavedAttachmentViewerDescriptor, descriptor);

    viewerRoots = [viewerRoot];
    observerCallback();
    assert.equal(plugin._pendingMountedSavedAttachmentViewerDescriptor, null);
    assert.equal(plugin.getLoggerOwnedNativeSavedAttachmentViewerDescriptor(), descriptor);

    const invokeOriginal = () => {
      originalCalls += 1;
      return 'original-window-open';
    };
    assert.equal(plugin.routeSavedAttachmentViewerWindowOpen([blobUrl], invokeOriginal), null);
    assert.equal(plugin.routeSavedAttachmentViewerWindowOpen([blobUrl], invokeOriginal), null);
    assert.deepEqual(opened, [descriptor, descriptor]);
    assert.equal(originalCalls, 0);

    assert.equal(
      plugin.routeSavedAttachmentViewerWindowOpen(['blob:https://discord.com/ordinary'], invokeOriginal),
      'original-window-open'
    );
    assert.equal(originalCalls, 1);

    media.currentSrc = 'blob:https://discord.com/ordinary';
    assert.equal(
      plugin.routeSavedAttachmentViewerWindowOpen([blobUrl], invokeOriginal),
      'original-window-open'
    );
    assert.equal(originalCalls, 2);
    assert.equal(plugin._mountedSavedAttachmentViewerBinding, null);
    assert.deepEqual(opened, [descriptor, descriptor]);
  } finally {
    plugin.clearMountedSavedAttachmentViewerState();
    plugin.stopSavedAttachmentViewerLabelSync();
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
    if (OriginalMutationObserver === undefined) delete global.MutationObserver;
    else global.MutationObserver = OriginalMutationObserver;
    if (originalRequestAnimationFrame === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = originalRequestAnimationFrame;
    if (originalCancelAnimationFrame === undefined) delete global.cancelAnimationFrame;
    else global.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test('native and custom attachment-media viewer ownership helpers enforce scoped close behavior', () => {
  const closeCalls = [];
  const openKeys = new Set();
  const plugin = createMediaCachePlugin('');
  plugin.ModalStack = {
    hasModalOpen: key => openKeys.has(key),
    closeModal: key => {
      closeCalls.push(key);
      openKeys.delete(key);
    }
  };
  plugin.tools = { getNativeMediaModal: () => ({ modalKey: 'native-viewer-modal' }) };

  plugin._nativeMediaViewerOpenContextDepth = 1;
  openKeys.add('native-viewer-modal');
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('native-viewer-modal'), true);
  assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
    key: 'native-viewer-modal',
    owner: 'logger'
  });
  const closeOnLoggerOpen = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(closeOnLoggerOpen.nativeClosed, true);
  assert.equal(closeOnLoggerOpen.customClosed, 0);
  assert.equal(closeCalls.includes('native-viewer-modal'), true);
  assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);

  openKeys.clear();
  closeCalls.length = 0;
  plugin._nativeMediaViewerOpenContextDepth = 1;
  openKeys.add('native-viewer-modal');
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('native-viewer-modal'), true);
  plugin._nativeMediaViewerOpenContextDepth = 0;
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('native-viewer-modal'), true);
  assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
    key: 'native-viewer-modal',
    owner: 'discord'
  });
  const preventCloseAfterContextEnds = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(preventCloseAfterContextEnds.nativeClosed, false);
  assert.equal(openKeys.has('native-viewer-modal'), true);

  openKeys.clear();
  closeCalls.length = 0;
  openKeys.add('native-viewer-modal');
  plugin._nativeAttachmentMediaViewerOwnership = { key: 'stale-viewer-modal', owner: 'logger' };
  plugin.ModalStack = {
    hasModalOpen: key => key === 'native-viewer-modal' || key === 'stale-viewer-modal',
  };
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('different-modal-key'), false);
  assert.equal(plugin.closeLoggerOwnedAttachmentMediaViewers().nativeClosed, false);
  assert.equal(openKeys.has('native-viewer-modal'), true);
  assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);

  openKeys.clear();
  closeCalls.length = 0;
  openKeys.add('native-viewer-modal');
  plugin._nativeAttachmentMediaViewerOwnership = { key: 'native-viewer-modal', owner: 'logger' };
  plugin.ModalStack = {
    hasModalOpen: key => openKeys.has(key)
  };
  assert.equal(plugin.closeLoggerOwnedAttachmentMediaViewers().nativeClosed, false);
  assert.equal(openKeys.has('native-viewer-modal'), true);
  assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, { key: 'native-viewer-modal', owner: 'logger' });

  plugin.ModalStack.closeModal = key => {
    closeCalls.push(key);
    openKeys.delete(key);
  };
  assert.equal(plugin.closeLoggerOwnedAttachmentMediaViewers().nativeClosed, true);
  assert.equal(closeCalls.includes('native-viewer-modal'), true);
  assert.equal(openKeys.has('native-viewer-modal'), false);
  assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);

  openKeys.clear();
  closeCalls.length = 0;
  openKeys.add('ml2-attachment-media-1');
  openKeys.add('ml2-attachment-media-2');
  openKeys.add('ml2-other-menu');
  openKeys.add('logger-menu');
  openKeys.add('discord-menu');
  plugin._loggerOwnedAttachmentMediaModalKeys.clear();
  plugin.trackLoggerOwnedAttachmentMediaModalKey('ml2-attachment-media-1');
  plugin.trackLoggerOwnedAttachmentMediaModalKey('ml2-attachment-media-stale');
  plugin.trackLoggerOwnedAttachmentMediaModalKey('ml2-attachment-media-2');
  plugin.ModalStack = {
    hasModalOpen: key => openKeys.has(key),
    closeModal: key => {
      closeCalls.push(key);
      openKeys.delete(key);
    }
  };
  const customCloseResult = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(customCloseResult.nativeClosed, false);
  assert.equal(customCloseResult.customClosed, 2);
  assert.deepEqual(closeCalls, ['ml2-attachment-media-1', 'ml2-attachment-media-2']);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-stale'), false);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-1'), false);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-2'), false);
  assert.equal(openKeys.has('ml2-attachment-media-stale'), false);
  assert.equal(openKeys.has('logger-menu'), true);
  assert.equal(openKeys.has('discord-menu'), true);
  const repeatedClose = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(repeatedClose.nativeClosed, false);
  assert.equal(repeatedClose.customClosed, 0);

  openKeys.clear();
  closeCalls.length = 0;
  openKeys.add('ml2-attachment-media-1');
  openKeys.add('ml2-attachment-media-2');
  plugin._loggerOwnedAttachmentMediaModalKeys.clear();
  plugin.trackLoggerOwnedAttachmentMediaModalKey('ml2-attachment-media-1');
  plugin.trackLoggerOwnedAttachmentMediaModalKey('ml2-attachment-media-2');
  plugin.ModalStack = {
    hasModalOpen: key => openKeys.has(key)
  };
  const customCloseWithoutApi = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(customCloseWithoutApi.customClosed, 0);
  assert.equal(openKeys.has('ml2-attachment-media-1'), true);
  assert.equal(openKeys.has('ml2-attachment-media-2'), true);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-1'), true);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-2'), true);

  plugin.ModalStack.closeModal = key => {
    throw new Error('custom attachment modal close failure');
  };
  const customCloseWithThrow = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(customCloseWithThrow.customClosed, 0);
  assert.equal(openKeys.has('ml2-attachment-media-1'), true);
  assert.equal(openKeys.has('ml2-attachment-media-2'), true);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-1'), true);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-2'), true);

  plugin.ModalStack.closeModal = key => {
    closeCalls.push(key);
    openKeys.delete(key);
  };
  const customCloseAfterRecovery = plugin.closeLoggerOwnedAttachmentMediaViewers();
  assert.equal(customCloseAfterRecovery.customClosed, 2);
  assert.equal(openKeys.has('ml2-attachment-media-1'), false);
  assert.equal(openKeys.has('ml2-attachment-media-2'), false);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-1'), false);
  assert.equal(plugin._loggerOwnedAttachmentMediaModalKeys.has('ml2-attachment-media-2'), false);
});

test('native saved-image descriptors bind only to the active Logger-owned viewer key', () => {
  const openKeys = new Set(['native-viewer-modal']);
  const plugin = createMediaCachePlugin('');
  const descriptor = {
    remote_urls: ['https://cdn.example/image.png'],
    local_path: '/cache/image.png'
  };
  plugin.ModalStack = {
    hasModalOpen: key => openKeys.has(key),
    closeModal: key => openKeys.delete(key)
  };
  plugin.tools = { getNativeMediaModal: () => ({ modalKey: 'native-viewer-modal' }) };

  plugin._nativeMediaViewerOpenContextDepth = 1;
  plugin._pendingNativeSavedImageOpenDescriptor = descriptor;
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('native-viewer-modal'), true);
  assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
    key: 'native-viewer-modal',
    owner: 'logger'
  });
  assert.deepEqual(plugin._nativeSavedImageViewerDescriptor, {
    key: 'native-viewer-modal',
    descriptor
  });
  assert.equal(plugin.getLoggerOwnedNativeSavedImageViewerDescriptor(), descriptor);

  plugin._nativeMediaViewerOpenContextDepth = 0;
  plugin._pendingNativeSavedImageOpenDescriptor = descriptor;
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('native-viewer-modal'), true);
  assert.equal(plugin._nativeAttachmentMediaViewerOwnership.owner, 'discord');
  assert.equal(plugin._nativeSavedImageViewerDescriptor, null);
  assert.equal(plugin.getLoggerOwnedNativeSavedImageViewerDescriptor(), null);

  plugin._nativeMediaViewerOpenContextDepth = 1;
  plugin._pendingNativeSavedImageOpenDescriptor = descriptor;
  assert.equal(plugin.recordNativeAttachmentMediaViewerOpen('native-viewer-modal'), true);
  assert.equal(plugin.recordNativeAttachmentMediaViewerClose('different-modal'), false);
  assert.equal(plugin.getLoggerOwnedNativeSavedImageViewerDescriptor(), descriptor);
  assert.equal(plugin.recordNativeAttachmentMediaViewerClose('native-viewer-modal'), true);
  assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);
  assert.equal(plugin._pendingNativeSavedImageOpenDescriptor, null);
  assert.equal(plugin._nativeSavedImageViewerDescriptor, null);

  plugin._nativeAttachmentMediaViewerOwnership = { key: 'stale-viewer-modal', owner: 'logger' };
  plugin._nativeSavedImageViewerDescriptor = { key: 'stale-viewer-modal', descriptor };
  assert.equal(plugin.closeLoggerOwnedAttachmentMediaViewers().nativeClosed, false);
  assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);
  assert.equal(plugin._nativeSavedImageViewerDescriptor, null);
});

test('Logger-owned native saved viewers rebind exact IMG and VIDEO failures through CDN, proxy, and Blob', () => {
  const makeHarness = ({ tagName, extension, filename, withBlob = true }) => {
    const channelId = `owned-viewer-${tagName.toLowerCase()}-channel`;
    const messageId = `owned-viewer-${tagName.toLowerCase()}-message`;
    const attachmentId = `owned-viewer-${tagName.toLowerCase()}-attachment`;
    const directUrl = `https://cdn.discordapp.com/attachments/${channelId}/${filename}`;
    const proxyUrl = `https://media.discordapp.net/attachments/${channelId}/${filename}`;
    const blobUrl = `blob:https://discord.com/${attachmentId}`;
    const message = {
      id: messageId,
      channel_id: channelId,
      content: 'body',
      attachments: [{
        id: attachmentId,
        filename,
        url: directUrl,
        proxy_url: proxyUrl
      }]
    };
    const record = { message, delete_data: { time: 1 } };
    const openKeys = new Set(['native-owned-viewer']);
    const closeCalls = [];
    const remounts = [];
    let source = directUrl;
    let loadCalls = 0;
    const target = {
      tagName,
      get currentSrc() {
        return source;
      },
      get src() {
        return source;
      },
      set src(value) {
        source = value;
      },
      load() {
        loadCalls++;
      },
      closest(selector) {
        if (selector === '[data-ml2-attachment-video-host="true"]'
          || selector === '[data-ml2-attachment-audio-host="true"]') return null;
        return null;
      }
    };
    let plugin;
    plugin = createMediaCachePlugin('', {
      messageRecord: { [messageId]: record },
      imageCacheServerSimulator: {
        _resolveImagePath: (attachment, ext, channel, message) => {
          assert.equal(attachment, attachmentId);
          assert.equal(ext, extension);
          assert.equal(channel, channelId);
          assert.equal(message, messageId);
          return `/cache/${attachmentId}${extension}`;
        },
        get: () => withBlob ? blobUrl : null
      },
      remountSavedAttachmentPresentationRecords(value) {
        remounts.push(value);
      },
      tools: {
        getNativeMediaModal: () => ({ modalKey: 'native-owned-viewer' })
      },
      ModalStack: {
        hasModalOpen: key => openKeys.has(key),
        closeModal: key => {
          closeCalls.push(key);
          openKeys.delete(key);
          plugin.recordNativeAttachmentMediaViewerClose(key);
        }
      }
    });
    const descriptor = plugin.getSavedAttachmentDescriptor(
      message.attachments[0],
      message,
      { display_url: directUrl }
    );
    plugin._nativeAttachmentMediaViewerOwnership = {
      key: 'native-owned-viewer',
      owner: 'logger'
    };
    plugin._nativeSavedImageViewerDescriptor = {
      key: 'native-owned-viewer',
      descriptor
    };
    return {
      plugin,
      message,
      descriptor,
      target,
      directUrl,
      proxyUrl,
      blobUrl,
      closeCalls,
      remounts,
      get loadCalls() {
        return loadCalls;
      }
    };
  };

  for (const options of [
    { tagName: 'IMG', extension: '.png', filename: 'owned-image.png' },
    { tagName: 'VIDEO', extension: '.mp4', filename: 'owned-video.mp4' }
  ]) {
    const harness = makeHarness(options);
    const canonicalBefore = structuredClone(harness.message);

    harness.plugin.handleSavedAttachmentMediaError({ target: harness.target });
    assert.equal(harness.target.src, harness.proxyUrl);
    assert.equal(harness.descriptor.display_url, harness.proxyUrl);
    assert.equal(harness.descriptor.blob_url, null);
    assert.equal(harness.closeCalls.length, 0);
    assert.equal(harness.remounts.length, 1);
    assert.equal(harness.loadCalls, options.tagName === 'VIDEO' ? 1 : 0);

    harness.plugin.handleSavedAttachmentMediaError({ target: harness.target });
    assert.equal(harness.target.src, harness.blobUrl);
    assert.equal(harness.descriptor.display_url, harness.blobUrl);
    assert.equal(harness.descriptor.blob_url, harness.blobUrl);
    assert.equal(harness.closeCalls.length, 0);
    assert.equal(harness.remounts.length, 2);
    assert.equal(harness.loadCalls, options.tagName === 'VIDEO' ? 2 : 0);

    harness.plugin.handleSavedAttachmentMediaError({ target: harness.target });
    const terminalPlan = harness.plugin.getSavedAttachmentPresentationPlan(
      harness.message.attachments[0],
      harness.message,
      { allowRemote: true }
    );
    assert.equal(terminalPlan.action, 'omit');
    assert.equal(harness.plugin._failedNativeAttachmentMediaLocalKeys.size, 1);
    assert.equal(harness.closeCalls.length, 1);
    assert.equal(harness.remounts.length, 3);
    assert.equal(harness.loadCalls, options.tagName === 'VIDEO' ? 2 : 0);
    assert.deepEqual(harness.message, canonicalBefore);
  }
});

test('Logger-owned SOURCE errors update the exact VIDEO node and accept canonicalized DOM URLs', () => {
  const directUrl = 'https://cdn.discordapp.com/attachments/12345001/12345002/clip.mp4';
  const dottedDirectUrl = 'https://cdn.discordapp.com/attachments/12345001/12345002/./clip.mp4';
  const proxyUrl = 'https://media.discordapp.net/attachments/12345001/12345002/clip.mp4';
  const attachment = {
    id: '12345002',
    filename: 'clip.mp4',
    url: directUrl,
    proxy_url: proxyUrl
  };
  const message = {
    id: '12345003',
    channel_id: '12345001',
    content: 'body',
    attachments: [attachment]
  };
  const record = { message, delete_data: { time: 1 } };
  const canonicalBefore = structuredClone(message);
  const openKeys = new Set(['source-owned-viewer']);
  let videoSource = dottedDirectUrl;
  let loadCalls = 0;
  const source = {
    tagName: 'SOURCE',
    src: dottedDirectUrl,
    closest(selector) {
      if (selector === 'video') return video;
      if (selector.includes('dialog')) return dialog;
      return null;
    }
  };
  const video = {
    tagName: 'VIDEO',
    get currentSrc() {
      return videoSource;
    },
    get src() {
      return videoSource;
    },
    set src(value) {
      videoSource = value;
    },
    querySelectorAll(selector) {
      return selector === 'source' ? [source] : [];
    },
    load() {
      loadCalls++;
    }
  };
  const dialog = {
    querySelectorAll(selector) {
      return selector === 'img, video' ? [video] : [];
    }
  };
  const plugin = createMediaCachePlugin('', {
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/source-owned.mp4',
      get: () => null
    },
    tools: {
      getNativeMediaModal: () => ({ modalKey: 'source-owned-viewer' })
    },
    ModalStack: {
      hasModalOpen: key => openKeys.has(key),
      closeModal: key => openKeys.delete(key)
    },
    remountSavedAttachmentPresentationRecords() {},
    scheduleLoggerMenuRefresh() {}
  });
  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message, {
    display_url: directUrl
  });
  plugin._nativeAttachmentMediaViewerOwnership = {
    key: 'source-owned-viewer',
    owner: 'logger'
  };
  plugin._nativeSavedImageViewerDescriptor = {
    key: 'source-owned-viewer',
    descriptor
  };

  plugin.handleSavedAttachmentMediaError({ target: source });
  assert.equal(videoSource, proxyUrl);
  assert.equal(source.src, dottedDirectUrl);
  assert.equal(loadCalls, 1);
  assert.equal(openKeys.has('source-owned-viewer'), true);
  assert.deepEqual(message, canonicalBefore);
});

test('exact restored Blob failures remount to a placeholder in local-only mode and reset cleanly', () => {
  const directUrl = 'https://cdn.discordapp.com/attachments/12346001/12346002/clip.mp4';
  const proxyUrl = 'https://media.discordapp.net/attachments/12346001/12346002/clip.mp4';
  const blobUrl = 'blob://local/blob-row-clip';
  const attachment = {
    id: '12346002',
    filename: 'clip.mp4',
    url: directUrl,
    proxy_url: proxyUrl
  };
  const message = {
    id: '12346003',
    channel_id: '12346001',
    content: 'body',
    attachments: [attachment]
  };
  const record = { message, delete_data: { time: 1 } };
  const canonicalBefore = structuredClone(message);
  let remounts = 0;
  const plugin = createMediaCachePlugin('', {
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: true },
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/blob-row.mp4',
      get: () => blobUrl,
      cleanUp() {}
    },
    remountSavedAttachmentPresentationRecords: () => { remounts++; },
    scheduleLoggerMenuRefresh() {}
  });
  const row = { id: 'chat-messages-12346001-12346003' };
  const target = {
    tagName: 'VIDEO',
    currentSrc: blobUrl,
    closest: createNativeMediaClosest(row)
  };

  plugin.handleSavedAttachmentMediaError({ target });
  let plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowBlob: true });
  assert.equal(plan.action, 'omit');
  assert.equal(plan.unavailableReason, 'local-failed');
  assert.equal(remounts, 1);
  assert.equal(plugin._failedNativeAttachmentMediaLocalKeys.size, 1);

  plugin.handleSavedAttachmentMediaError({ target });
  assert.equal(remounts, 1);
  const foreignTarget = {
    tagName: 'VIDEO',
    currentSrc: 'blob://local/foreign-attachment',
    closest: createNativeMediaClosest(row)
  };
  plugin.handleSavedAttachmentMediaError({ target: foreignTarget });
  assert.equal(remounts, 1);
  const ordinaryTarget = {
    tagName: 'VIDEO',
    currentSrc: blobUrl,
    closest: () => null
  };
  plugin.handleSavedAttachmentMediaError({ target: ordinaryTarget });
  assert.equal(remounts, 1);
  assert.equal(plugin._failedNativeAttachmentMediaLocalKeys.size, 1);

  plugin.resetSavedAttachmentPresentationState();
  plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowBlob: true });
  assert.equal(plan.action, 'blob');
  assert.equal(plan.url, blobUrl);
  assert.equal(plugin._failedNativeAttachmentMediaLocalKeys.size, 0);
  assert.equal(plugin._failedNativeAttachmentMediaLocalSourceUrls.size, 0);
  assert.deepEqual(message, canonicalBefore);
});

test('Logger-owned native saved viewer closes only its exact key on terminal, duplicate, mismatch, or unsafe failures', () => {
  const makeHarness = () => {
    const channelId = 'owned-terminal-channel';
    const messageId = 'owned-terminal-message';
    const attachmentId = 'owned-terminal-attachment';
    const directUrl = `https://cdn.discordapp.com/attachments/${channelId}/terminal.png`;
    const message = {
      id: messageId,
      channel_id: channelId,
      content: 'body',
      attachments: [{
        id: attachmentId,
        filename: 'terminal.png',
        url: directUrl
      }]
    };
    const record = { message, delete_data: { time: 1 } };
    const openKeys = new Set(['native-terminal-viewer']);
    const closeCalls = [];
    const remounts = [];
    let plugin;
    plugin = createMediaCachePlugin('', {
      messageRecord: { [messageId]: record },
      imageCacheServerSimulator: {
        _resolveImagePath: () => '/cache/terminal.png',
        get: () => null
      },
      remountSavedAttachmentPresentationRecords(value) {
        remounts.push(value);
      },
      tools: {
        getNativeMediaModal: () => ({ modalKey: 'native-terminal-viewer' })
      },
      ModalStack: {
        hasModalOpen: key => openKeys.has(key),
        closeModal: key => {
          closeCalls.push(key);
          openKeys.delete(key);
          plugin.recordNativeAttachmentMediaViewerClose(key);
        }
      }
    });
    const descriptor = plugin.getSavedAttachmentDescriptor(message.attachments[0], message, {
      display_url: directUrl
    });
    plugin._nativeAttachmentMediaViewerOwnership = {
      key: 'native-terminal-viewer',
      owner: 'logger'
    };
    plugin._nativeSavedImageViewerDescriptor = {
      key: 'native-terminal-viewer',
      descriptor
    };
    return { plugin, message, descriptor, directUrl, openKeys, closeCalls, remounts };
  };

  const terminal = makeHarness();
  const canonicalBefore = structuredClone(terminal.message);
  terminal.plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: terminal.directUrl,
      src: terminal.directUrl,
      closest: selector => selector.startsWith('[data-ml2-attachment-') ? null : null
    }
  });
  assert.deepEqual(terminal.closeCalls, ['native-terminal-viewer']);
  assert.equal(terminal.openKeys.has('native-terminal-viewer'), false);
  assert.equal(terminal.plugin._nativeAttachmentMediaViewerOwnership, null);
  assert.equal(terminal.plugin._nativeSavedImageViewerDescriptor, null);
  assert.equal(terminal.remounts.length, 1);
  assert.deepEqual(terminal.message, canonicalBefore);

  // A late duplicate error is now isolated because the exact owned state was cleared.
  terminal.plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: terminal.directUrl,
      closest: selector => selector.startsWith('[data-ml2-attachment-') ? null : null
    }
  });
  assert.deepEqual(terminal.closeCalls, ['native-terminal-viewer']);
  assert.equal(terminal.remounts.length, 1);

  const mismatch = makeHarness();
  mismatch.plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/owned-terminal-channel/other.png',
      closest: selector => selector.startsWith('[data-ml2-attachment-') ? null : null
    }
  });
  assert.deepEqual(mismatch.closeCalls, []);
  assert.equal(mismatch.remounts.length, 0);

  const ordinary = makeHarness();
  ordinary.plugin._nativeAttachmentMediaViewerOwnership = {
    key: 'native-terminal-viewer',
    owner: 'discord'
  };
  ordinary.plugin._nativeSavedImageViewerDescriptor = null;
  ordinary.plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: ordinary.directUrl,
      closest: selector => selector.startsWith('[data-ml2-attachment-') ? null : null
    }
  });
  assert.deepEqual(ordinary.closeCalls, []);
  assert.equal(ordinary.remounts.length, 0);

  const unsafe = makeHarness();
  unsafe.plugin.coordinateSavedAttachmentMediaFailure = () => ({
    plan: { action: 'remote', url: 'javascript:alert(1)' }
  });
  unsafe.plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: unsafe.directUrl,
      closest: selector => selector.startsWith('[data-ml2-attachment-') ? null : null
    }
  });
  assert.deepEqual(unsafe.closeCalls, ['native-terminal-viewer']);
  assert.equal(unsafe.plugin._nativeAttachmentMediaViewerOwnership, null);
});

test('installNativeAttachmentMediaViewerOwnershipTracking is duplicate-safe and fail-safe', () => {
  const plugin = createMediaCachePlugin('');
  const originalAfter = Patcher.after;
  plugin.unpatches = [];
  plugin.tools = {
    getNativeMediaModal: () => ({ modalKey: 'native-viewer-modal' })
  };
  plugin.ModalStack = {
    openModal: () => {},
    closeModal: () => {}
  };
  const hookCallbacks = {};
  const removedHooks = [];
  const patchReceivers = [];
  try {
    Patcher.after = function(target, methodName, callback) {
      assert.equal(this, Patcher);
      patchReceivers.push(this === Patcher);
      hookCallbacks[methodName] = callback;
      const entry = { methodName, removed: false };
      removedHooks.push(entry);
      return () => {
        entry.removed = true;
      };
    };
    assert.equal(plugin.installNativeAttachmentMediaViewerOwnershipTracking(), true);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled, true);
    assert.equal(plugin.installNativeAttachmentMediaViewerOwnershipTracking(), true);
    assert.equal(plugin.installNativeAttachmentMediaViewerOwnershipTracking(), true);
    assert.equal(removedHooks.length, 2);
    assert.equal(patchReceivers.length, 2);
    assert.equal(patchReceivers.every(Boolean), true);

    plugin._nativeMediaViewerOpenContextDepth = 1;
    hookCallbacks.openModal(null, [null, { modalKey: 'native-viewer-modal' }], 'fallback');
    assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
      key: 'native-viewer-modal',
      owner: 'logger'
    });
    hookCallbacks.openModal(null, [null], 'native-viewer-modal');
    assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
      key: 'native-viewer-modal',
      owner: 'logger'
    });

    plugin._nativeMediaViewerOpenContextDepth = 0;
    hookCallbacks.openModal(null, [null, { modalKey: 'native-viewer-modal' }], 'fallback');
    assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
      key: 'native-viewer-modal',
      owner: 'discord'
    });

    hookCallbacks.openModal(null, [null, { modalKey: 'discord-viewer-modal' }], 'fallback');
    assert.deepEqual(plugin._nativeAttachmentMediaViewerOwnership, {
      key: 'native-viewer-modal',
      owner: 'discord'
    });

    hookCallbacks.closeModal(null, ['native-viewer-modal']);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);

    plugin._pendingNativeSavedImageOpenDescriptor = { remote_urls: ['https://cdn.example/pending.png'] };
    plugin._nativeSavedImageViewerDescriptor = {
      key: 'native-viewer-modal',
      descriptor: { remote_urls: ['https://cdn.example/bound.png'] }
    };
    const teardown = plugin.unpatches.pop();
    assert.equal(typeof teardown, 'function');
    assert.equal(teardown(), undefined);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled, false);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);
    assert.equal(plugin._pendingNativeSavedImageOpenDescriptor, null);
    assert.equal(plugin._nativeSavedImageViewerDescriptor, null);
    assert.equal(removedHooks.every(hook => hook.removed), true);
    assert.equal(teardown(), undefined);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled, false);

    plugin.unpatches.length = 0;

    Patcher.after = undefined;
    plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled = false;
    plugin._nativeAttachmentMediaViewerOwnership = null;
    plugin.ModalStack = {
      openModal: () => {},
      closeModal: () => {}
    };
    assert.equal(plugin.installNativeAttachmentMediaViewerOwnershipTracking(), false);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled, false);
    assert.equal(plugin.unpatches.length, 0);

    let openPatchRolledBack = false;
    let patchCalls = 0;
    Patcher.after = () => {
      patchCalls++;
      if (patchCalls === 1) {
        return () => {
          openPatchRolledBack = true;
        };
      }
      throw new Error('forced close patch failure');
    };
    plugin.ModalStack = {
      openModal: () => {},
      closeModal: () => {}
    };
    assert.equal(plugin.installNativeAttachmentMediaViewerOwnershipTracking(), false);
    assert.equal(openPatchRolledBack, true);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled, false);
    assert.equal(plugin.unpatches.length, 0);
  } finally {
    Patcher.after = originalAfter;
  }
});

test('createModal native IMAGE path scopes viewer ownership and the saved-image descriptor before open', () => {
  const calls = [];
  const plugin = createMediaCachePlugin('');
  plugin.ModalStack = {};
  plugin._nativeMediaViewerOpenContextDepth = 2;
  const depthSamples = [];
  const pendingDescriptorSamples = [];
  const previousPendingDescriptor = { remote_urls: ['https://cdn.example/previous.png'] };
  const requestedDescriptor = { remote_urls: ['https://cdn.example/image.png'] };
  plugin._pendingNativeSavedImageOpenDescriptor = previousPendingDescriptor;
  let installCount = 0;

  plugin.installNativeAttachmentMediaViewerOwnershipTracking = () => {
    calls.push('install');
    installCount += 1;
  };
  plugin.tools = {
    getNativeMediaModal: () => ({
      openMediaModal: () => {
        calls.push('open');
        depthSamples.push(plugin._nativeMediaViewerOpenContextDepth);
        pendingDescriptorSamples.push(plugin._pendingNativeSavedImageOpenDescriptor);
      }
    })
  };

  plugin.createModal({
    type: 'IMAGE',
    url: 'https://cdn.example/image.png',
    ml2SavedImageOpenDescriptor: requestedDescriptor
  }, true, 'native-image-ok');

  assert.deepEqual(calls, ['install', 'open']);
  assert.equal(installCount, 1);
  assert.equal(depthSamples[0], 3);
  assert.equal(pendingDescriptorSamples[0], requestedDescriptor);
  assert.equal(plugin._nativeMediaViewerOpenContextDepth, 2);
  assert.equal(plugin._pendingNativeSavedImageOpenDescriptor, previousPendingDescriptor);

  plugin._nativeMediaViewerOpenContextDepth = 2;
  calls.length = 0;
  plugin.tools = {
    getNativeMediaModal: () => ({
      openMediaModal: () => {
        calls.push('open-throw');
        depthSamples.push(plugin._nativeMediaViewerOpenContextDepth);
        pendingDescriptorSamples.push(plugin._pendingNativeSavedImageOpenDescriptor);
        throw new Error('openMediaModal failed');
      }
    })
  };

  assert.throws(() => {
    plugin.createModal({
      type: 'IMAGE',
      url: 'https://cdn.example/image.png',
      ml2SavedImageOpenDescriptor: requestedDescriptor
    }, true, 'native-image-error');
  }, /openMediaModal failed/);
  assert.deepEqual(calls, ['install', 'open-throw']);
  assert.equal(depthSamples[depthSamples.length - 1], 3);
  assert.equal(pendingDescriptorSamples[pendingDescriptorSamples.length - 1], requestedDescriptor);
  assert.equal(plugin._nativeMediaViewerOpenContextDepth, 2);
  assert.equal(plugin._pendingNativeSavedImageOpenDescriptor, previousPendingDescriptor);
});

test('createModal saved VIDEO follows the exact coordinator through CDN, proxy, Blob, and placeholder', () => {
  const directUrl = 'https://cdn.discordapp.com/attachments/modal-video-channel/modal-video/clip.mp4';
  const proxyUrl = 'https://media.discordapp.net/attachments/modal-video-channel/modal-video/clip.mp4';
  const blobUrl = 'blob://local/modal-video-clip';
  const attachment = {
    id: 'modal-video',
    filename: 'clip.mp4',
    url: directUrl,
    proxy_url: proxyUrl
  };
  const message = {
    id: 'modal-video-message',
    channel_id: 'modal-video-channel',
    content: 'body',
    attachments: [attachment]
  };
  const record = { message, delete_data: { time: 1 } };
  const canonicalBefore = structuredClone(message);
  const remounts = [];
  let callbacks = 0;
  let forumRefreshes = 0;
  let menuRefreshes = 0;
  const plugin = createMediaCachePlugin('', {
    messageRecord: { [message.id]: record },
    imageCacheServerSimulator: {
      _resolveImagePath: () => '/cache/clip.mp4',
      get: () => blobUrl
    },
    remountSavedAttachmentPresentationRecords(value) {
      remounts.push(value);
    },
    _messageUpdateRegistry: new Map([[message.id, new Set([() => { callbacks++; }])]]),
    _forumThreadLogRefreshers: new Map([[message.channel_id, () => { forumRefreshes++; }]]),
    scheduleLoggerMenuRefresh() {
      menuRefreshes++;
    }
  });
  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message, {
    display_url: directUrl
  });
  const contexts = [];
  const originalCoordinate = plugin.coordinateSavedAttachmentMediaFailure;
  plugin.coordinateSavedAttachmentMediaFailure = function(context, sourceUrl) {
    contexts.push({ context, sourceUrl });
    return originalCoordinate.call(this, context, sourceUrl);
  };

  let modalRenderer;
  plugin.tools = {
    manaModule: { Modal() {} },
    resolvedModalStuff: { ModalSize: { LARGE: 'large' } },
    getNativeMediaModal: () => ({})
  };
  plugin.ModalStack = {
    openModal: renderer => {
      modalRenderer = renderer;
      return 'saved-video-modal';
    }
  };

  const originalUseState = React.useState;
  const stateValues = [];
  let stateIndex = 0;
  React.useState = initialValue => {
    const index = stateIndex++;
    if (!(index in stateValues)) {
      stateValues[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
    }
    return [stateValues[index], value => {
      stateValues[index] = typeof value === 'function' ? value(stateValues[index]) : value;
    }];
  };

  try {
    plugin.createModal({
      type: 'VIDEO',
      url: directUrl,
      ml2SavedAttachmentOpenDescriptor: descriptor
    }, false, 'saved-video-modal');
    const modalElement = modalRenderer({});
    const modalContent = modalElement.props.children[0];
    const savedVideoElement = modalContent.props.children[0];
    const renderSavedVideo = () => {
      stateIndex = 0;
      return savedVideoElement.type(savedVideoElement.props);
    };

    let mediaElement = renderSavedVideo();
    assert.equal(mediaElement.type, 'video');
    assert.equal(mediaElement.props.src, directUrl);
    mediaElement.props.onError({ currentTarget: { currentSrc: directUrl, src: directUrl } });

    mediaElement = renderSavedVideo();
    assert.equal(mediaElement.props.src, proxyUrl);
    mediaElement.props.onError({ currentTarget: { currentSrc: proxyUrl, src: proxyUrl } });

    mediaElement = renderSavedVideo();
    assert.equal(mediaElement.props.src, blobUrl);
    mediaElement.props.onError({ currentTarget: { currentSrc: blobUrl, src: blobUrl } });

    const placeholder = renderSavedVideo();
    assert.equal(placeholder.type, 'div');
    assert.equal(placeholder.props.role, 'status');
    assert.equal(placeholder.props.children[0], '[Deleted: clip.mp4]');
    assert.deepEqual(contexts.map(entry => entry.sourceUrl), [directUrl, proxyUrl, blobUrl]);
    assert.equal(contexts.every(entry => entry.context.record === record), true);
    assert.equal(contexts.every(entry => entry.context.message === message), true);
    assert.equal(contexts.every(entry => entry.context.attachment === attachment), true);
    assert.equal(plugin._failedNativeAttachmentMediaLocalKeys.size, 1);
    assert.equal(remounts.length, 3);
    assert.equal(callbacks, 3);
    assert.equal(forumRefreshes, 3);
    assert.equal(menuRefreshes, 3);
    assert.deepEqual(message, canonicalBefore);
    assert.equal(descriptor.display_url, directUrl);
    assert.equal(descriptor.blob_url, null);
  } finally {
    React.useState = originalUseState;
  }

  const ordinary = createMediaCachePlugin('');
  let ordinaryRenderer;
  ordinary.tools = {
    manaModule: { Modal() {} },
    resolvedModalStuff: { ModalSize: { LARGE: 'large' } },
    getNativeMediaModal: () => ({})
  };
  ordinary.ModalStack = {
    openModal: renderer => {
      ordinaryRenderer = renderer;
      return 'ordinary-video-modal';
    }
  };
  ordinary.createModal({
    type: 'VIDEO',
    url: 'https://cdn.example/ordinary.mp4'
  }, false, 'ordinary-video-modal');
  const ordinaryElement = ordinaryRenderer({}).props.children[0].props.children[0];
  assert.equal(ordinaryElement.type, 'video');
  assert.equal(ordinaryElement.props.onError, undefined);
  assert.equal(ordinary._failedNativeAttachmentMediaCandidateKeys?.size, 0);
});

test('createModal tracks video and fallback-image modal keys in both modal trackers', () => {
  const trackedModalKeys = [];
  const trackedAttachmentMediaKeys = [];
  const plugin = createMediaCachePlugin('');
  plugin.trackLoggerOwnedModalKey = (key, requestedKey) => {
    trackedModalKeys.push([key, requestedKey]);
    return key;
  };
  plugin.trackLoggerOwnedAttachmentMediaModalKey = key => {
    trackedAttachmentMediaKeys.push(key);
  };
  plugin.createModal.imageModal = function ImageModal() { return {}; };
  plugin.ModalStack = {
    openModal: (_renderer, options) => {
      if (options?.modalKey === 'video-modal') return 'video-opened-key';
      if (options?.modalKey === 'image-modal') return 'image-opened-key';
      return `fallback-${String(options?.modalKey)}`;
    }
  };
  plugin.tools = {
    getNativeMediaModal: () => ({})
  };

  const returnedVideoKey = plugin.createModal({
    type: 'VIDEO',
    url: 'https://cdn.example/video.mp4'
  }, false, 'video-modal');
  assert.equal(returnedVideoKey, undefined);
  assert.deepEqual(trackedModalKeys[0], ['video-opened-key', 'video-modal']);
  assert.deepEqual(trackedAttachmentMediaKeys[0], 'video-opened-key');

  const returnedImageKey = plugin.createModal({
    url: 'https://cdn.example/image.png'
  }, true, 'image-modal');
  assert.equal(returnedImageKey, undefined);
  assert.deepEqual(trackedModalKeys[1], ['image-opened-key', 'image-modal']);
  assert.deepEqual(trackedAttachmentMediaKeys[1], 'image-opened-key');
});

test('Logger-only media failures advance fallback across channels without history fetches', () => {
  const originalFrame = global.requestAnimationFrame;
  const frames = [];
  global.requestAnimationFrame = callback => frames.push(callback);
  const records = ['one', 'two'].map(channel => ({
    message: { id: `id-${channel}`, channel_id: channel, content: '', attachments: [{
      id: `media-${channel}`, filename: 'photo.png',
      url: `https://cdn.discordapp.com/attachments/${channel}/photo.png`,
      proxy_url: `https://media.discordapp.net/attachments/${channel}/photo.png`
    }] }, delete_data: {}
  }));
  const calls = { history: [], callbacks: 0, menu: 0 };
  const plugin = createPlugin({
    messageRecord: Object.fromEntries(records.map(record => [record.message.id, record])),
    deletedMessageRecord: Object.fromEntries(records.map(record => [record.message.channel_id, [record.message.id]])),
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    tools: { getChannel: () => ({ type: 0 }) },
    imageCacheServerSimulator: { _resolveImagePath: () => '/cache/image.png', get: () => 'blob://local/image.png' },
    cacheChannelMessages: channel => calls.history.push(channel), invalidateChannelCache() {},
    scheduleLoggerMenuRefresh: () => { calls.menu++; },
    _messageUpdateRegistry: new Map(records.map(record => [record.message.id, new Set([() => { calls.callbacks++; }])]))
  });
  const native = installNativeCache(plugin, records.map(record => [record.message.channel_id, { main: ['unrelated'] }]));
  try {
    for (const record of records) {
      const attachment = record.message.attachments[0];
      const descriptor = plugin.getSavedAttachmentDescriptor(attachment, record.message);
      const direct = plugin.coordinateSavedAttachmentMediaFailure(descriptor, attachment.url);
      assert.equal(direct.plan.url, attachment.proxy_url);
      while (frames.length) frames.shift()();
      const proxy = plugin.coordinateSavedAttachmentMediaFailure(descriptor, attachment.proxy_url);
      assert.equal(proxy.plan.action, 'blob');
      while (frames.length) frames.shift()();
      const blob = plugin.coordinateSavedAttachmentMediaFailure(descriptor, proxy.plan.url);
      assert.equal(blob.plan.action, 'omit');
      while (frames.length) frames.shift()();
      assert.equal(native.caches.get(record.message.channel_id).has('unrelated'), true);
    }
    assert.deepEqual(calls.history, []);
    assert.equal(calls.callbacks, 6);
    assert.equal(calls.menu, 6);
    assert.equal(native.store.changes, 0);
  } finally { global.requestAnimationFrame = originalFrame; }
});

test('media failure queues only successful eviction and retains a pending refresh across later misses', () => {
  const originalFrame = global.requestAnimationFrame;
  const frames = [];
  global.requestAnimationFrame = callback => frames.push(callback);
  const attachment = { id: 'image', filename: 'photo.png', url: 'https://cdn.discordapp.com/attachments/one/photo.png', proxy_url: 'https://media.discordapp.net/attachments/one/photo.png' };
  const secondAttachment = { id: 'image-two', filename: 'other.png', url: 'https://cdn.discordapp.com/attachments/one/other.png', proxy_url: 'https://media.discordapp.net/attachments/one/other.png' };
  const record = { message: { id: 'message', channel_id: 'one', content: '', attachments: [attachment, secondAttachment] }, delete_data: {} };
  const history = [];
  const plugin = createPlugin({
    messageRecord: { message: record }, deletedMessageRecord: { one: ['message'] },
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    tools: { getChannel: () => ({ type: 0 }) },
    imageCacheServerSimulator: { _resolveImagePath: () => '/cache/image.png', get: () => 'blob://local/image.png' },
    cacheChannelMessages: channel => history.push(channel), invalidateChannelCache() {},
    scheduleLoggerMenuRefresh() {}
  });
  const native = installNativeCache(plugin, [['one', { main: ['message', 'unrelated'] }]]);
  try {
    const descriptor = plugin.getSavedAttachmentDescriptor(attachment, record.message);
    assert.equal(plugin.coordinateSavedAttachmentMediaFailure(descriptor, attachment.url).plan.url, attachment.proxy_url);
    assert.equal(native.caches.get('one').has('message'), false);
    assert.equal(native.caches.get('one').has('unrelated'), true);
    const secondDescriptor = plugin.getSavedAttachmentDescriptor(secondAttachment, record.message);
    assert.equal(plugin.coordinateSavedAttachmentMediaFailure(secondDescriptor, secondAttachment.url).plan.url, secondAttachment.proxy_url);
    assert.equal(frames.length, 1);
    assert.equal(plugin.coordinateSavedAttachmentMediaFailure(secondDescriptor, secondAttachment.url).recordedFailure, false);
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(history, ['one']);
    native.caches.set('one', new NativeCache('one', { main: ['message', 'unrelated'] }));
    const restored = plugin.getNativeDeletedAttachmentPresentationMessage(record.message);
    assert.deepEqual(restored.attachments.map(item => item.url), [attachment.proxy_url, secondAttachment.proxy_url]);
    assert.equal(native.caches.get('one').has('unrelated'), true);
    assert.equal(plugin.coordinateSavedAttachmentMediaFailure(descriptor, attachment.proxy_url).plan.action, 'blob');
    assert.equal(frames.length, 1);
    assert.equal(plugin.coordinateSavedAttachmentMediaFailure(descriptor, attachment.proxy_url).recordedFailure, false);
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(history, ['one', 'one']);
    assert.equal(native.caches.get('one').has('unrelated'), true);
  } finally { global.requestAnimationFrame = originalFrame; }
});

test('removed uploads use cached previews even in remote-first mode while current uploads keep remote policy', () => {
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: () => '/cache/item',
      get(url) { return url.includes('/200.gif#') ? 'blob://local/removed' : null; }
    }
  });
  const current = { id: '100', filename: 'current.png', url: 'https://cdn.discordapp.com/attachments/channel/100/current.png' };
  const removed = { id: '200', filename: 'removed.gif', url: 'https://cdn.discordapp.com/attachments/channel/200/removed.gif' };
  const message = { id: 'message', channel_id: 'channel', content: 'surviving text', attachments: [current] };
  const record = { message, removed_attachments: [removed] };
  const snapshot = structuredClone(record);
  const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);
  assert.equal(entries[0].plan.action, 'remote');
  assert.equal(entries[1].plan.action, 'blob');
  assert.equal(entries[1].plan.url, 'blob://local/removed');
  const marker = '`Attachment Deleted: `' + removed.url;
  const segments = plugin.getEditHistoryContentSegments(marker, [removed], message);
  assert.equal(segments[0].presentationPlan?.url, 'blob://local/removed');
  assert.deepEqual(record, snapshot);
});

test('removed cached plans admit supported files, preserve current policy and leave unavailable inline markers', () => {
  const types = [ ['111111111111111111', 'image.gif'], ['222222222222222222', 'movie.mp4'], ['333333333333333333', 'sound.mp3'], ['444444444444444444', 'document.pdf'] ];
  const attachments = types.map(([id, filename]) => ({ id, filename, url: `https://cdn.discordapp.com/attachments/channel/${id}/${filename}` }));
  const message = { id: 'm', channel_id: 'channel', content: 'body', attachments: [{ id: 'current', filename: 'current.png', url: 'https://cdn.discordapp.com/attachments/channel/current/current.png' }] };
  const record = { message, delete_data: { time: 1 }, removed_attachments: attachments };
  const plugin = createPlugin({ settings: { cacheAllImages: true, onlyRenderCachedAttachments: false }, imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' } });
  assert.deepEqual(plugin.getLoggerSavedAttachmentPresentationEntries(message, record).map(entry => entry.plan.action), ['remote', 'blob', 'blob', 'blob', 'blob']);
  const markers = attachments.map(a => '`Attachment Deleted: `' + a.url).join(' ');
  const segments = plugin.getEditHistoryContentSegments(markers, attachments, message);
  assert.deepEqual(segments.filter(s => s.kind === 'removedAttachment').map(s => s.presentationPlan.mediaType), ['image', 'video']);
  assert.ok(segments.some(s => s.kind === 'text' && s.value.includes('sound.mp3')));
  assert.ok(segments.some(s => s.kind === 'text' && s.value.includes('document.pdf')));
  plugin.imageCacheServerSimulator.get = () => 'data:image/error';
  assert.equal(plugin.getLoggerSavedAttachmentPresentationEntries(message, record).filter(e => e.removed).every(e => e.plan.action === 'omit'), true);
  assert.equal(plugin.getEditHistoryContentSegments(markers, attachments, message).filter(s => s.kind === 'removedAttachment').length, 0);
  attachments[0].hidden = true;
  plugin.imageCacheServerSimulator.get = () => 'blob://local/file';
  assert.equal(plugin.getEditHistoryContentSegments(markers, attachments, message).some(s => s.kind === 'removedAttachment' && s.attachment.id === attachments[0].id), false);
});
