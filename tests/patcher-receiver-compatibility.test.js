const assert = require('node:assert/strict');
const test = require('node:test');

const { Patcher, createPlugin, resetHarness } = require('./helpers/plugin-harness');

const DISPATCHER_PATCH_MARKER = /Patcher\.instead\(\s*this\.dispatcher\s*,/;
const START_EDIT_PATCH_MARKER = /Patcher\.instead\(\s*DiscordModules\.MessageActions,\s*'startEditMessage'\s*,/;
const DELETE_MESSAGE_PATCH_MARKER = /Patcher\.instead\(\s*DiscordModules\.MessageActions,\s*'deleteMessage'\s*,/;

test.beforeEach(resetHarness);

function extractPatcherCallExpression(source, marker) {
  const markerIndex = source.search(marker);
  assert.notEqual(markerIndex, -1);
  const callStart = source.lastIndexOf('Patcher.instead(', markerIndex);
  assert.notEqual(callStart, -1);

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = callStart; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inSingle) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inDouble = false;
      }
      continue;
    }
    if (inTemplate) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '`') {
        inTemplate = false;
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      continue;
    }
    if (char === '`') {
      inTemplate = true;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(callStart, index + 1);
      continue;
    }
  }

  throw new Error(`Could not parse Patcher call expression for marker: ${marker}`);
}

function captureInitializePatchCallback(plugin, marker) {
  const source = plugin.initialize.toString();
  const expression = extractPatcherCallExpression(source, marker);
  const callbackState = {};
  const evaluate = new Function('Patcher', 'DiscordModules', `return function() { return ${expression}; }`);
  const previousInstead = Patcher.instead;
  Patcher.instead = (_module, _method, callback) => {
    callbackState.callback = callback;
  };
  try {
    evaluate.call(plugin, Patcher, { MessageActions: {} }).call(plugin);
  } finally {
    Patcher.instead = previousInstead;
  }
  assert.equal(typeof callbackState.callback, 'function');
  return callbackState.callback;
}

test('patcher receiver forwarding handles dispatcher callbacks with unbound originals', () => {
  const plugin = createPlugin();
  const callback = captureInitializePatchCallback(plugin, DISPATCHER_PATCH_MARKER);
  let onDispatchHost;
  let onDispatchArgs;
  let onDispatchResult;
  let onDispatchCalls = 0;
  plugin.onDispatchEvent = function dispatchForwardReceiver(args, next) {
    onDispatchCalls += 1;
    onDispatchHost = this;
    onDispatchArgs = args;
    onDispatchResult = next(...args);
    return onDispatchResult;
  };

  const args = [{ type: 'DISPATCH' }, { value: 18 }];
  const dispatchHost = { _waitQueue: ['queued'] };
  let unboundThis;
  let unboundArgs;
  let originalCalls = 0;
  const original = function (...forwardedArgs) {
    originalCalls += 1;
    unboundThis = this;
    unboundArgs = forwardedArgs;
    return { receiver: this, queue: this._waitQueue, args: forwardedArgs };
  };
  assert.equal(
    callback(dispatchHost, args, original),
    onDispatchResult
  );
  assert.equal(onDispatchCalls, 1);
  assert.equal(onDispatchHost, plugin);
  assert.equal(onDispatchArgs, args);
  assert.equal(originalCalls, 1);
  assert.equal(unboundThis, dispatchHost);
  assert.deepEqual(unboundArgs, args);
  assert.deepEqual(onDispatchResult, {
    receiver: dispatchHost,
    queue: dispatchHost._waitQueue,
    args
  });
});

test('initialize startEditMessage patch preserves receiver and skips deleted-channel messages', () => {
  const plugin = createPlugin({
    deletedMessageSet: new Map([
      ['active-channel', new Set(['deleted-message'])]
    ])
  });
  const callback = captureInitializePatchCallback(plugin, START_EDIT_PATCH_MARKER);
  const liveArgs = ['active-channel', 'live-message'];
  const suppressedArgs = ['active-channel', 'deleted-message'];
  const startEditHost = { _waitQueue: ['edit'] };
  let originalThis;
  let originalArgs;
  let originalCalls = 0;

  const liveOriginal = function (...forwardedArgs) {
    originalThis = this;
    originalArgs = forwardedArgs;
    originalCalls += 1;
    return {
      edited: true,
      args: forwardedArgs,
      receiver: this,
      queue: this._waitQueue
    };
  };
  const liveResult = callback(startEditHost, liveArgs, liveOriginal);
  assert.equal(originalCalls, 1);
  assert.deepEqual(liveResult, {
    edited: true,
    args: liveArgs,
    receiver: startEditHost,
    queue: startEditHost._waitQueue
  });
  assert.equal(originalThis, startEditHost);
  assert.deepEqual(originalArgs, liveArgs);

  const suppressedHost = { _waitQueue: ['suppressed'] };
  let suppressedOriginalCalls = 0;
  const suppressedOriginal = () => {
    suppressedOriginalCalls += 1;
  };
  const suppressedResult = callback(suppressedHost, suppressedArgs, suppressedOriginal);
  assert.equal(suppressedOriginalCalls, 0);
  assert.equal(suppressedResult, undefined);
});

test('initialize deleteMessage patch forwards unbound originals for live and type-18 delete events', () => {
  const plugin = createPlugin();
  const callback = captureInitializePatchCallback(plugin, DELETE_MESSAGE_PATCH_MARKER);
  const normalArgs = ['normal-channel', 'normal-message'];
  const threadMessageId = 'thread-created-message';
  const threadArgs = ['thread-channel', threadMessageId];

  plugin.getCachedMessage = (messageId, _channelId) => {
    if (messageId === threadMessageId || messageId === 'thread-created') {
      return { type: 18 };
    }
    return { type: 0 };
  };
  plugin.handleNativeSavedRecordDelete = () => false;
  plugin.rememberLocalDeleteId = id => {
    plugin.rememberedIds ||= [];
    plugin.rememberedIds.push(id);
  };

  const liveHost = { _waitQueue: ['live-host'] };
  let originalThis;
  let originalArgs;
  let originalCalls = 0;
  const liveOriginal = function (...forwardedArgs) {
    originalThis = this;
    originalArgs = forwardedArgs;
    originalCalls += 1;
    return {
      live: true,
      args: forwardedArgs,
      receiver: this,
      queue: this._waitQueue
    };
  };
  const liveResult = callback(liveHost, normalArgs, liveOriginal);
  assert.equal(originalCalls, 1);
  assert.equal(originalThis, liveHost);
  assert.deepEqual(originalArgs, normalArgs);
  assert.deepEqual(liveResult, {
    live: true,
    args: normalArgs,
    receiver: liveHost,
    queue: liveHost._waitQueue
  });
  assert.deepEqual(plugin.rememberedIds, ['normal-message']);

  const threadHost = { _waitQueue: ['type18-host'] };
  originalThis = null;
  originalArgs = null;
  const threadOriginal = function (...forwardedArgs) {
    originalThis = this;
    originalArgs = forwardedArgs;
    originalCalls += 1;
    return {
      thread: true,
      args: forwardedArgs,
      receiver: this,
      queue: this._waitQueue
    };
  };
  const threadResult = callback(threadHost, threadArgs, threadOriginal);
  assert.equal(originalCalls, 2);
  assert.equal(originalThis, threadHost);
  assert.deepEqual(originalArgs, threadArgs);
  assert.deepEqual(threadResult, {
    thread: true,
    args: threadArgs,
    receiver: threadHost,
    queue: threadHost._waitQueue
  });
  assert.deepEqual(plugin.rememberedIds, ['normal-message', threadMessageId]);
});

test('initialize deleteMessage patch suppresses local saved-record deletes by skipping server original', async () => {
  const plugin = createPlugin();
  const callback = captureInitializePatchCallback(plugin, DELETE_MESSAGE_PATCH_MARKER);
  const savedMessageArgs = ['cached-channel', 'cached-message'];
  plugin.getCachedMessage = () => ({ type: 0 });
  plugin.handleNativeSavedRecordDelete = () => true;
  plugin.rememberLocalDeleteId = () => {
    throw new Error('local delete should not be called for saved record delete');
  };

  let originalCalls = 0;
  const original = function () {
    originalCalls += 1;
    return { shouldNotCall: true };
  };
  const suppressedResult = callback({ _waitQueue: ['cached-host'] }, savedMessageArgs, original);
  assert.equal(originalCalls, 0);
  assert.equal(typeof suppressedResult?.then, 'function');
  await suppressedResult;
});

test('patchLocalDeleteTracker preserves receiver and runs tracking for HTTP delete and del', () => {
  const plugin = createPlugin();
  const moduleDelete = {
    delete: () => {}
  };
  const moduleDel = {
    del: () => {}
  };
  const tracked = [];
  plugin.rememberLocalDeleteFromArgs = args => tracked.push(args);
  let capturedDelete;
  let capturedDel;
  const previousInstead = Patcher.instead;
  Patcher.instead = (module, method, callback) => {
    if (method === 'delete') capturedDelete = { module, callback };
    if (method === 'del') capturedDel = { module, callback };
    return () => {};
  };

  try {
    plugin.patchLocalDeleteTracker(moduleDelete, 'delete');
    plugin.patchLocalDeleteTracker(moduleDel, 'del');
  } finally {
    Patcher.instead = previousInstead;
  }

  assert.equal(typeof capturedDelete?.callback, 'function');
  assert.equal(typeof capturedDel?.callback, 'function');

  const deleteHost = { _waitQueue: ['delete-host'], id: 'delete-host' };
  const delHost = { _waitQueue: ['del-host'], id: 'del-host' };
  let deleteThis;
  let deleteArgs;
  let deleteCalls = 0;
  const deleteOriginal = function (...forwardedArgs) {
    deleteCalls += 1;
    deleteThis = this;
    deleteArgs = forwardedArgs;
    return { result: 'delete', queue: this._waitQueue };
  };
  let delThis;
  let delArgs;
  let delCalls = 0;
  const delOriginal = function (...forwardedArgs) {
    delCalls += 1;
    delThis = this;
    delArgs = forwardedArgs;
    return { result: 'del', queue: this._waitQueue };
  };
  const deleteResult = capturedDelete.callback(deleteHost, ['/api/message'], deleteOriginal);
  const delResult = capturedDel.callback(delHost, ['/api/message2'], delOriginal);
  assert.deepEqual(deleteResult, { result: 'delete', queue: deleteHost._waitQueue });
  assert.deepEqual(delResult, { result: 'del', queue: delHost._waitQueue });
  assert.equal(capturedDelete.module, moduleDelete);
  assert.equal(capturedDel.module, moduleDel);
  assert.equal(deleteCalls, 1);
  assert.equal(delCalls, 1);
  assert.equal(deleteThis, deleteHost);
  assert.equal(delThis, delHost);
  assert.deepEqual(deleteArgs, ['/api/message']);
  assert.deepEqual(delArgs, ['/api/message2']);
  assert.deepEqual(tracked, [['/api/message'], ['/api/message2']]);
});
