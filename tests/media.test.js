const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  captureConsoleEvent,
  createPlugin,
  Patcher,
  loggerEvents,
  resetHarness
} = require('./helpers/plugin-harness');

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
    content: '[image:Synology_AUX.png]',
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
  assert.equal(attachmentOnlyRow?.content, '[image:photo.png]');
  assert.equal(textSiblingRow?.id, '102');
  assert.equal(textSiblingRow?.content, 'kept text\n[attachment:notes.txt]');
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
  assert.equal(messages[0].content, '[attachment:notes.txt]');
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
  assert.equal(afterFailure[0].content, 'remote cache-on\n[image:photo.png]');
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
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[image:first.gif]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[attachment:second.mp4]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[attachment:third.pdf]'), true);
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

  assert.equal(removedSegments.length, 2);
  assert.equal(removedSegments[0]?.attachment?.id, '111111111111111111');
  assert.equal(removedSegments[1]?.attachment?.id, '222222222222222222');
  assert.equal(removedSegments.every(segment => segment.presentationPlan?.action === 'remote'), true);
  assert.equal(removedSegments[0]?.presentationPlan?.url, 'https://cdn.discordapp.com/attachments/channel/111111111111111111/first.gif');
  assert.equal(removedSegments[1]?.presentationPlan?.url, 'https://cdn.discordapp.com/attachments/channel/222222222222222222/second.webm');
  assert.equal(removedSegments[0]?.value, '[image:first.gif]');
  assert.equal(removedSegments[1]?.value, '[attachment:second.webm]');
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('third.pdf')), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value.includes('missing.mp4')), true);
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
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[image:missing.gif]'), true);
  assert.equal(segments.some(segment => segment.kind === 'text' && segment.value === '[attachment:third.pdf]'), true);
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
    settings: { antiNukeEnabled: true, reverseOrder: false }
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
  assert.equal(duplicateInOneEdit.some(segment => segment.kind === 'text' && segment.value.includes('first.gif')), true);
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

test('cache-only rendering uses cached blob URLs only for supported local-only media', () => {
  const blobMap = new Map([
    ['100', 'blob://local/cached/image-100'],
    ['101', 'blob://local/cached/video-101']
  ]);
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    },
    imageCacheServerSimulator: {
      cleanUp() {},
      _resolveImagePath: (attachmentId, ext, channelId, messageId) => {
        assert.equal(channelId, 'channel');
        assert.equal(messageId, 'message');
        if (ext === '.png' && attachmentId === '100') return '/cache/100.png';
        if (ext === '.mp4' && attachmentId === '101') return '/cache/101.mp4';
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
      { id: '102', filename: 'notes.txt', url: 'https://cdn.discordapp.com/attachments/channel/111/notes.txt' },
      { id: '103', filename: 'missing.png', url: 'https://cdn.discordapp.com/attachments/channel/111/missing.png' }
    ]
  };
  const canonicalBefore = structuredClone(message);

  const rendered = plugin.getCacheOnlyMessage(message);
  const firstPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[0], message, { allowBlob: true });
  const secondPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[1], message, { allowBlob: true });
  const thirdPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[2], message, { allowBlob: true });
  const fourthPlan = plugin.getSavedAttachmentPresentationPlan(message.attachments[3], message, { allowBlob: true });

  assert.equal(firstPlan.action, 'blob');
  assert.equal(firstPlan.url, 'blob://local/cached/image-100');
  assert.equal(secondPlan.action, 'blob');
  assert.equal(secondPlan.url, 'blob://local/cached/video-101');
  assert.equal(thirdPlan.action, 'omit');
  assert.equal(fourthPlan.action, 'omit');
  assert.equal(rendered.attachments.length, 2);
  assert.equal(rendered.attachments[0].url, 'blob://local/cached/image-100');
  assert.equal(rendered.attachments[1].url, 'blob://local/cached/video-101');
  assert.equal(rendered.attachments[0].proxy_url, 'blob://local/cached/image-100');
  assert.equal(rendered.attachments[1].proxy_url, 'blob://local/cached/video-101');
  assert.equal(rendered.content, 'body');
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
  assert.equal(entries.every(entry => entry.plan.action === 'remote'), true);
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

test('logger saved-attachment presentation entries use remote display for remote-first without selecting cached blob', () => {
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
        throw new Error(`blob URL read should not happen for remote plan: ${url}`);
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
  assert.equal(entries[3].plan.action, 'remote');
  assert.equal(entries[3].plan.url, 'https://cdn.discordapp.com/attachments/channel/200/removed.png');
  assert.equal(entries[3].plan.fallbackUrl, 'https://media.discordapp.net/attachments/channel/200/removed.png');
  assert.equal(imageCacheGets.length, 0);
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

  try {
    global.document = fakeTarget;
    plugin._installSavedAttachmentMediaErrorListener();
    plugin._installSavedAttachmentMediaErrorListener();
    assert.equal(fakeTarget.state.addCalls.length, 1);

    fakeTarget.dispatchErrorEvent({
      target: {
        tagName: 'IMG',
        currentSrc: 'https://cdn.discordapp.com/attachments/601/photo.png',
        closest: () => ({ id: 'chat-messages-601-601' })
      }
    });
    assert.equal(dispatches.length, 1);

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
      closest: () => messageRow
    }
  });

  assert.equal(dispatches.length, 1);
  assert.deepEqual(dispatches[0], {
    type: 'MESSAGE_DELETE',
    id: '501',
    channelId: '501',
    ML2: true
  });
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
      closest: () => messageRow
    }
  });

  assert.equal(dispatches.length, 1);
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
      closest: () => sourceRow
    }
  });
  assert.equal(dispatches.length, 1);
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
      closest: () => sourceRow
    }
  });
  assert.equal(dispatches.length, 1);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: proxyUrl,
      closest: () => sourceRow
    }
  });
  assert.equal(dispatches.length, 2);
  await setImmediatePromise();
  assert.deepEqual(invalidations, ['601', '601']);
  assert.deepEqual(cacheRefreshes, ['601', '601']);
  const afterProxyFailure = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(afterProxyFailure.attachments.length, 1);
  assert.equal(afterProxyFailure.attachments[0].url, 'blob://local/cached/image-601');
  assert.equal(afterProxyFailure.attachments[0].proxy_url, 'blob://local/cached/image-601');
  assert.deepEqual(message, canonicalBefore);
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

  const message = plugin.messageRecord['502'].message;
  const canonicalBefore = structuredClone(message);
  const messageRow = { id: 'chat-messages-502-502' };
  const cdnUrl = 'https://cdn.discordapp.com/attachments/502/photo.png';
  const proxyUrl = 'https://media.discordapp.net/attachments/502/photo.png';

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: cdnUrl,
      closest: () => messageRow
    }
  });

  assert.equal(dispatches.length, 1);
  let fallbackRender = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(fallbackRender.attachments.length, 1);
  assert.equal(fallbackRender.attachments[0].url, proxyUrl);
  assert.equal(fallbackRender.attachments[0].proxy_url, proxyUrl);

  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: proxyUrl,
      closest: () => messageRow
    }
  });

  assert.equal(dispatches.length, 2);
  assert.deepEqual(dispatches[0], {
    type: 'MESSAGE_DELETE',
    id: '502',
    channelId: '502',
    ML2: true
  });
  assert.deepEqual(dispatches[1], {
    type: 'MESSAGE_DELETE',
    id: '502',
    channelId: '502',
    ML2: true
  });
  fallbackRender = plugin.getNativeDeletedAttachmentPresentationMessage(message);
  assert.equal(fallbackRender.attachments.length, 0);
  assert.equal(fallbackRender.content, '[image:photo.png]');
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
  plugin.shouldPresentSavedMessage = () => true;

  const affectedChannels = plugin.remountSavedAttachmentPresentationRecords([
    ordinaryOne,
    ordinaryTwo,
    threadRoot
  ]);

  assert.equal(affectedChannels, 2);
  assert.deepEqual(dispatches.slice(0, 2), [
    { type: 'MESSAGE_DELETE', id: 'ordinary-one', channelId: 'channel', ML2: true },
    { type: 'MESSAGE_DELETE', id: 'ordinary-two', channelId: 'channel', ML2: true }
  ]);
  assert.equal(dispatches[2].type, 'MESSAGE_UPDATE');
  assert.equal(dispatches[2].ML2, true);
  assert.equal(dispatches[2].message.id, 'thread');
  assert.equal(dispatches[2].message.attachments.length, 0);
  assert.equal(dispatches[2].message.content, 'thread root\n[image:thread.png]');

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
  assert.equal(dispatches[0].message.content, '[image:photo.png]');
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

test('protected attachment remount transitions through a hidden sentinel until the exact placeholder disappears', () => {
  const dispatches = [];
  const originalDocument = global.document;
  const OriginalMutationObserver = global.MutationObserver;
  const dom = createSavedAttachmentTransitionDom('710', '710', '[image:Synology_AUX.png]');
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
    assert.equal(dom.content.textContent, '[image:Synology_AUX.png]');

    const hiddenSentinel = fixture.plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(
      dispatches[0].message
    );
    assert.equal(hiddenSentinel.content, '');

    fixture.setBlobUrl('blob://fresh/Synology_AUX.png');
    const replacedContent = dom.content;
    dom.replaceContentNode('[image:Synology_AUX.png]');
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
  const dom = createSavedAttachmentTransitionDom('710', '710', '[image:Synology_AUX.png]');
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
    const mountedDom = createSavedAttachmentTransitionDom('710', '710', '[image:Synology_AUX.png]');
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
  const dom = createSavedAttachmentTransitionDom('710', '710', '[image:Synology_AUX.png]');
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
  const dom = createSavedAttachmentTransitionDom('710', '710', '[image:Synology_AUX.png]');
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

    dom.content.textContent = '[image:Synology_AUX.png]';
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

  assert.equal(offRendered.content, '[image:photo.png]');
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
      closest: () => wrongUrlRow
    }
  });
  plugin.handleSavedAttachmentMediaError({
    target: {
      tagName: 'IMG',
      currentSrc: 'https://cdn.discordapp.com/attachments/503/photo.png',
      closest: () => ({ id: 'chat-messages-503-503' })
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
      closest: () => ({ id: 'chat-messages-505-505' })
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
      closest: () => ({ id: 'chat-messages-506-506' })
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

    const teardown = plugin.unpatches.pop();
    assert.equal(typeof teardown, 'function');
    assert.equal(teardown(), undefined);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnershipTrackingInstalled, false);
    assert.equal(plugin._nativeAttachmentMediaViewerOwnership, null);
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

test('createModal native IMAGE path restores depth and installs ownership tracking before open', () => {
  const calls = [];
  const plugin = createMediaCachePlugin('');
  plugin.ModalStack = {};
  plugin._nativeMediaViewerOpenContextDepth = 2;
  const depthSamples = [];
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
      }
    })
  };

  plugin.createModal({ type: 'IMAGE', url: 'https://cdn.example/image.png' }, true, 'native-image-ok');

  assert.deepEqual(calls, ['install', 'open']);
  assert.equal(installCount, 1);
  assert.equal(depthSamples[0], 3);
  assert.equal(plugin._nativeMediaViewerOpenContextDepth, 2);

  plugin._nativeMediaViewerOpenContextDepth = 2;
  calls.length = 0;
  plugin.tools = {
    getNativeMediaModal: () => ({
      openMediaModal: () => {
        calls.push('open-throw');
        depthSamples.push(plugin._nativeMediaViewerOpenContextDepth);
        throw new Error('openMediaModal failed');
      }
    })
  };

  assert.throws(() => {
    plugin.createModal({ type: 'IMAGE', url: 'https://cdn.example/image.png' }, true, 'native-image-error');
  }, /openMediaModal failed/);
  assert.deepEqual(calls, ['install', 'open-throw']);
  assert.equal(depthSamples[depthSamples.length - 1], 3);
  assert.equal(plugin._nativeMediaViewerOpenContextDepth, 2);
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
