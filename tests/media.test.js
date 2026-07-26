const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createPlugin,
  loggerEvents,
  resetHarness
} = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

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
      cleanUp() {}
    },
    cacheDeletionMessageIds: new Set(),
    messageRecord: {},
    cachedMessagesMap: new Map(),
    ...overrides
  });
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    assert.deepEqual(loggerEvents, [
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
    ]);
    assert.equal(notifications[0][0], MEDIA_CACHE_LEGACY_ROUTING_NOTICE);
    assert.equal(notifications[0][1].timeout, 4000);
    await plugin.fetchMediaCacheResponse('https://cdn.example/throw');
    assert.equal(nativeCalls, 0);
    assert.equal(rendererCalls, 2);
    assert.equal(notifications.length, 1);
    assert.equal(loggerEvents.length, 1);
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
  assert.deepEqual(loggerEvents, [
    ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
  ]);
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
  assert.deepEqual(loggerEvents, [
    ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`],
    ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
  ]);
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1][0], MEDIA_CACHE_LEGACY_ROUTING_NOTICE);
  const fifth = plugin._flushMediaCacheLegacyRoutingNoticeForOutputSelection();
  assert.deepEqual(fifth, { console: false, toast: false });
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
    assert.deepEqual(loggerEvents, [
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
    ]);
    plugin.setMediaCacheFetchTransportPreference(true);
    assert.equal(loggerEvents.length, 1);

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
    assert.deepEqual(loggerEvents, [
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`],
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
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
    assert.deepEqual(loggerEvents, [
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
    ]);

    plugin.settings.forceLegacyMediaFetching = false;
    global.BdApi.Net = undefined;
    plugin._initializeMediaCacheLegacyRoutingNoticeState();
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, true);
    assert.equal(plugin._mediaCacheNativeFetchCompatible, false);
    assert.deepEqual(loggerEvents, [
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`],
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
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
    assert.deepEqual(loggerEvents, [
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`],
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`],
      ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
    ]);

    global.BdApi.Net = {
      fetch: () => Promise.resolve(successfulMediaResponse())
    };
    plugin._mediaCacheLegacyRoutingNoticeState = null;
    plugin._initializeMediaCacheLegacyRoutingNoticeState();
    assert.equal(plugin._mediaCacheNativeFetchCompatible, null);
    assert.equal(plugin._mediaCacheLegacyRoutingNoticeState.active, false);
    assert.equal(notifications.length, 0);
    assert.equal(loggerEvents.length, 3);
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
  assert.deepEqual(loggerEvents.at(-1), ['log', '[Debug] combined debug event']);
  assert.equal(notifications.at(-1)[1].timeout, 4000);

  const consoleOnly = plugin.reportDebugEvent('console-only', 1200, 'console');
  assert.deepEqual(consoleOnly, { console: true, toast: false });
  assert.equal(loggerEvents.length, 2);
  assert.equal(notifications.length, 1);

  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = true;
  const toastOnly = plugin.reportDebugEvent('toast-only', 2200, 'toast');
  assert.deepEqual(toastOnly, { console: false, toast: true });
  assert.equal(notifications.at(-1)[1].timeout, 2200);

  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = false;
  const none = plugin.reportDebugEvent('neither', 4000, 'none');
  assert.deepEqual(none, { console: false, toast: false });
  assert.equal(loggerEvents.length, 2);
  assert.equal(notifications.length, 2);

  plugin.settings.debugLogging = true;
  plugin.settings.debugToasts = true;
  const objectSelection = plugin.reportDebugEvent('custom object', 1500, { console: false, toast: true });
  assert.deepEqual(objectSelection, { console: false, toast: true });
  assert.equal(notifications.at(-1)[1].timeout, 1500);
});

test('media-network diagnostics only log to console when the detailed toggle is on', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const plugin = createMediaCachePlugin('');
    plugin.settings.debugLogging = true;
    plugin.settings.debugToasts = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    plugin.notifyUser = () => {};
    let fetchCalls = 0;
    global.BdApi.Net = undefined;
    global.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };

    await plugin.fetchMediaCacheResponse('https://cdn.example/detailed-console');
    assert.equal(fetchCalls, 1);
    assert.equal(loggerEvents.some(([level, message]) => (
      level === 'log' && /^\[Debug\] Media request #1 \[attempt 1\] GET https:\/\/cdn\.example\/detailed-console \(legacy\)/.test(message)
    )), true);
    assert.equal(loggerEvents.filter(([level]) => level === 'warn' || level === 'error').length, 0);
    assert.equal(plugin.settings.detailedMediaNetworkDebug, true);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-network diagnostics suppress output without debug logging', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  try {
    const plugin = createMediaCachePlugin('');
    const notifications = [];
    plugin.notifyUser = (content, options = {}) => notifications.push([content, options]);
    plugin.settings.debugLogging = false;
    plugin.settings.debugToasts = true;
    plugin.settings.detailedMediaNetworkDebug = true;
    let fetchCalls = 0;
    global.BdApi.Net = undefined;
    global.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(successfulMediaResponse());
    };

    await plugin.fetchMediaCacheResponse('https://cdn.example/detailed-disabled');
    assert.equal(fetchCalls, 1);
    assert.equal(notifications.some(([message]) => typeof message === 'string' && message.includes('Media request #')), false);
    assert.equal(loggerEvents.some(([level, message]) => (
      level === 'log' && /\[Debug\] Media request #/.test(message)
    )), false);
  } finally {
    global.BdApi.Net = originalNetApi;
    global.fetch = originalFetch;
    global.AbortController = OriginalAbortController;
  }
});

test('media-image caching logs per-request status/bytes/duration without toasts', async t => {
  const originalNetApi = global.BdApi.Net;
  const originalFetch = global.fetch;
  const OriginalAbortController = global.AbortController;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-media-detailed-'));
  t.after(() => fs.rmSync(cacheDir, { force: true, recursive: true }));
  try {
    const controllerState = mockAbortControllerWithSignalCapture();
    global.AbortController = class {
      constructor() { return controllerState.controller; }
    };
    const messageId = 'media-detailed-success';
    const attachmentId = 901;
    const url = 'https://cdn.example/detailed-success.png';
    const plugin = createMediaCachePlugin(cacheDir, {
      settings: {
        cacheAllImages: true,
        dontSaveData: false,
        dontLoadArchivedData: false,
        newSaveAllFileTypes: true,
        maxCacheFileSize: 0,
        addUserIdToSavedMediaFilename: false,
        debugLogging: true,
        debugToasts: true,
        detailedMediaNetworkDebug: true,
        imageCacheDir: cacheDir
      },
      messageRecord: {
        [messageId]: {
          message: {
            id: messageId,
            author: { id: '777' }
          }
        }
      },
      notifyUser: () => {}
    });
    let notifications = 0;
    global.BdApi.Net = undefined;
    global.fetch = () => {
      notifications += 1;
      return Promise.resolve(successfulMediaResponse('image/png'));
    };
    const responsePath = path.join(cacheDir, `${plugin.getMediaCacheFileId(attachmentId, 0, messageId)} (${messageId}).png`);
    await plugin.cacheImage(url, 0, attachmentId, messageId, 'channel', 'server');
    assert.equal(fs.existsSync(responsePath), true);
    assert.equal(notifications, 1);
    assert.equal(loggerEvents.some(([level, message]) => (
      level === 'log' && message.includes('completed with status 200') && message.includes('bytes=4') && /durationMs=\d+/.test(message)
    )), true);
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
    const plugin = createMediaCachePlugin('');
    plugin.settings.forceLegacyMediaFetching = true;
    plugin._mediaCacheFetchTimeoutMs = 5;
    global.fetch = (_url, options) => {
      capturedSignal = options?.signal;
      inFlight += 1;
      return new Promise(() => {});
    };
    let error;
    try {
      await plugin.fetchMediaCacheResponse('https://cdn.example/header-timeout');
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
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheBodyIdleTimeoutMs = 10;
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    global.fetch = async (_url, options) => {
      capturedSignal = options?.signal;
      return response;
    };
    const responseWrapper = await plugin.fetchMediaCacheResponse('https://cdn.example/body-timeout');
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
    const plugin = createMediaCachePlugin('');
    plugin._mediaCacheFetchTimeoutMs = 100;
    plugin.settings.forceLegacyMediaFetching = true;
    global.fetch = async () => response;
    const managed = await plugin.fetchMediaCacheResponse('https://cdn.example/non-stream');
    const arrayBuffer = await managed.arrayBuffer();
    assert.deepEqual(Array.from(new Uint8Array(arrayBuffer)), [0xde, 0xad, 0xbe, 0xef]);
    await managed.releaseBody();
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
    const payload = new Uint8Array([0xde, 0xad]).buffer;
    plugin.fetchMediaNetworkResponse = async () => {
      attempts += 1;
      events.push(`fetch-${attempts}`);
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
      'https://cdn.example/non-200-retry.png',
      0,
      51,
      'non-200-retry-message',
      'channel',
      'guild'
    );
    assert.deepEqual(events, ['fetch-1', 'release-1', 'fetch-2']);
    assert.equal(attempts, 2);
    assert.equal(fs.existsSync(path.join(cacheDir, '51 (non-200-retry-message).png')), true);
    fs.rmSync(cacheDir, { force: true, recursive: true });
  } finally {
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
        `https://cdn.example/${action}-body.png`,
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

test('edit-history inline segments keep uncached or non-media markers as text and preserve source record', () => {
  const record = {
    message: { id: '100', channel_id: 'channel', content: 'current' },
    removed_attachments: [
      {
        id: '111111111111111111',
        filename: 'first.gif',
        url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif'
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
      },
      {
        id: '444444444444444444',
        filename: 'fourth.png',
        url: 'https://cdn.discordapp.com/attachments/channel/444444444444444444/fourth.png'
      }
    ],
    edit_history: []
  };
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, reverseOrder: false },
    messageRecord: { 100: record }
  });
  const before = structuredClone(record);
  plugin.isAttachmentLocallyCached = attachment => attachment.id !== '444444444444444444';
  const segments = plugin.getEditHistoryContentSegments(
    '`Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/333333333333333333/third.pdf'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/444444444444444444/fourth.png'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/555555555555555555/missing.png'
    + '` `Attachment Deleted: `https://cdn.discordapp.com/attachments/channel/222222222222222222/second.mp4',
    plugin.messageRecord[100].removed_attachments,
    record.message
  );

  assert.equal(segments.filter(segment => segment.kind === 'removedAttachment').length, 2);
  const removedSegments = segments.filter(segment => segment.kind === 'removedAttachment');
  assert.equal(removedSegments[0]?.attachment?.id, '111111111111111111');
  assert.equal(removedSegments[1]?.attachment?.id, '222222222222222222');
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('third.pdf')), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('fourth.png')), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('missing.png')), true);
  assert.equal(removedSegments.every(segment => segment.value.includes('`Attachment Deleted: `')), true);
  assert.deepEqual(record, before);
});

test('edit-history inline segment planning is per-edit and reused markers stay deterministic per pass', () => {
  const removed = [
    { id: '111111111111111111', filename: 'first.gif', url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif' },
    { id: '222222222222222222', filename: 'second.gif', url: 'https://cdn.discordapp.com/attachments/channel/222222222222222222/second.gif' }
  ];
  const plugin = createPlugin({
    settings: { antiNukeEnabled: true, reverseOrder: false }
  });
  plugin.isAttachmentLocallyCached = () => true;
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
  assert.equal(duplicateInOneEdit.some(segment => segment.kind === 'text' && segment.value.includes('first.gif')), true);
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
  assert.deepEqual(loggerEvents.filter(([level, message]) => (
    level === 'log' && message === `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`
  )), [
    ['log', `[Debug] ${MEDIA_CACHE_LEGACY_ROUTING_NOTICE}`]
  ]);
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
