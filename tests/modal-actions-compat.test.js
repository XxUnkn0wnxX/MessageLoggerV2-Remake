const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createPlugin, loggerEvents, resetHarness, Webpack } = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const start = source.indexOf('function normalizeModalActions(');
const end = source.indexOf('\nclass PopoutManager', start);
const audit = fs.readFileSync(path.join(__dirname, '..', 'tools/MessageLoggerRuntimeCompatibilityAudit.plugin.js'), 'utf8');
const auditEnd = audit.indexOf('module.exports = class');
assert.ok(start >= 0 && end > start && auditEnd > 0);

function open() { return this?.stackNextByDefault; }
function close() { a.setState(a.getState()[0], onCloseCallback); }
const has = vm.runInNewContext('(function T(e,t){return m(A.getState(),e,t)})');
function owner() {
  const store = {
    getState() {}, setState() {},
    subscribe() { assert.strictEqual(this, store); return () => { store.unsubscribed = true; }; }
  };
  return { x: open, y: close, z: has, s: store };
}
function webpackFor(exports, named = null) {
  const calls = [];
  return {
    calls, Stores: {}, Filters: {}, getByKeys: () => named,
    getModule(filter, options) { calls.push(options); return exports.find(value => filter(value)) ?? null; }
  };
}
function production(webpack, expression = 'DiscordModules.ModalActions') {
  return vm.runInNewContext(`${source.slice(start, end)}\n${expression};`, {
    Webpack: webpack, Filters: webpack.Filters, Logger: { error() {} }
  });
}
function auditContract(webpack) {
  return vm.runInNewContext(`${audit.slice(0, auditEnd)}\ndescribeContract(api, moduleContracts().find(c => c.name === 'ModalActions'));`, {
    require, api: { Webpack: webpack }
  });
}

test('complete named owner retains identity, receiver, and additional exports', () => {
  const named = { openModal() { return this; }, closeModal() {}, hasModalOpen() {}, useModalsStore: { subscribe() {} }, extra: 42 };
  const webpack = webpackFor([], named);
  const actual = production(webpack);
  assert.strictEqual(actual, named);
  assert.strictEqual(actual.openModal(), named);
  assert.equal(actual.extra, 42);
  assert.equal(webpack.calls.length, 0);
});

test('mangled and partial owners forward patches, restores, and store subscription', () => {
  for (const partial of [false, true]) {
    const exports = owner();
    if (partial) { exports.openModal = function namedOpen() { return 'named'; }; delete exports.x; }
    const webpack = webpackFor([exports], partial ? exports : null);
    const adapter = production(webpack);
    const original = partial ? exports.openModal : exports.x;
    const key = partial ? 'openModal' : 'x';
    let calls = 0;
    adapter.openModal = function (...args) { calls++; return original.apply(this, args); };
    exports[key]();
    assert.equal(calls, 1);
    adapter.openModal = original;
    assert.strictEqual(exports[key], original);
    const unsubscribe = adapter.useModalsStore.subscribe();
    unsubscribe();
    assert.equal(exports.s.unsubscribed, true);
    if (!partial) {
      assert.equal(webpack.calls[0].searchExports, false);
      assert.equal(webpack.calls[0].searchDefault, false);
    }
  }
});

test('bad getters are skipped, incomplete and ambiguous sets are rejected, and lookup retries', () => {
  const good = owner();
  Object.defineProperty(good, 'bad', { get() { throw Error('bad getter'); } });
  const ambiguous = { ...owner(), duplicate: open };
  const incomplete = owner(); delete incomplete.y;
  assert.equal(production(webpackFor([ambiguous, incomplete])), null);
  assert.ok(production(webpackFor([good])));
  const patched = owner();
  patched.x = Object.assign(function wrapper() {}, { toString: () => String(open) });
  assert.ok(production(webpackFor([patched])));
  const values = [];
  const webpack = webpackFor(values);
  webpack.values = values; webpack.next = good;
  const result = production(webpack, `(() => { const first = DiscordModules.ModalActions; Webpack.values.push(Webpack.next); return [first, DiscordModules.ModalActions]; })()`);
  assert.equal(result[0], null);
  assert.ok(result[1]);
});


test('audit uses the same mangled and named modal selection', () => {
  for (const named of [false, true]) {
    const exports = owner();
    if (named) Object.assign(exports, { openModal() {}, closeModal() {}, hasModalOpen() {}, useModalsStore: exports.s });
    const webpack = webpackFor([exports], named ? exports : null);
    webpack.getModules = (filter, options) => { assert.equal(options.searchExports, false); return [exports].filter(filter); };
    const contract = auditContract(webpack);
    assert.equal(contract.validation.ok, true);
    assert.equal(contract.status, 'pass');
  }
});

test('early initialize failure leaves stop with an iterable unpatch list', () => {
  resetHarness();
  Webpack.getByKeys = () => null;
  Webpack.getModule = () => null;
  const previousDocument = global.document;
  global.document = { querySelector() { return null; }, removeEventListener() {} };
  const plugin = createPlugin({
    settings: { dontSaveData: true },
    removeOpenLogsButton() {}, _clearNativeNotificationQueue() {}, forceUpdateUI() {},
    captureArchiveLoadPresentationState() { return {}; }, cleanupArchivePresentationForDisable() {}
  });
  try {
    assert.throws(() => plugin.initialize(), /closeModal/);
    assert.deepEqual(plugin.unpatches, []);
    assert.doesNotThrow(() => plugin.stop());
    assert.equal(plugin.__started, false);
    assert.equal(loggerEvents.some(entry => entry[1] === 'Error during cleanup:'), false);
  } finally { global.document = previousDocument; resetHarness(); }
});
