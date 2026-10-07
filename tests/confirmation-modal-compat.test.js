const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Logger, Plugins, resetHarness, Webpack } = require('./helpers/plugin-harness');
const Audit = require('../tools/MessageLoggerRuntimeCompatibilityAudit.plugin.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const getterStart = source.indexOf('const DiscordModules = (() => {');
const getterEnd = source.indexOf('\nclass PopoutManager', getterStart);
assert.ok(getterStart >= 0 && getterEnd > getterStart);
const markers = ['INLINE_NOTICE_GENERIC_ERROR', 'actionBarInput', 'confirmText', 'cancelText'];
const auditSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'MessageLoggerRuntimeCompatibilityAudit.plugin.js'), 'utf8');
const auditDefinitionsEnd = auditSource.indexOf('module.exports = class');
assert.ok(auditDefinitionsEnd > 0);

// Own minimal fixtures model callable source discovery without copying Discord code.
function MinifiedConfirm(props) {
  const { actionBarInput, confirmText, cancelText } = props;
  return ['INLINE_NOTICE_GENERIC_ERROR', actionBarInput, confirmText, cancelText];
}
function MissingMarker(props) {
  const { actionBarInput, confirmText } = props;
  return ['INLINE_NOTICE_GENERIC_ERROR', actionBarInput, confirmText];
}

function configureWebpack(exports, namedModule = null, hooks = {}) {
  const calls = [];
  const record = { id: 1, exports };
  hooks.scanOptions = [];
  hooks.publicExportReads = 0;
  hooks.publicAccessorReads = 0;
  hooks.scanExportReads = 0;
  Webpack.Filters.byStrings = () => () => false;
  Webpack.Filters.not = () => () => false;
  Webpack.Filters.combine = () => () => false;
  Webpack.getModule = () => null;
  Webpack.getByKeys = key => key === 'ConfirmModal' ? namedModule : null;
  Webpack.getBySource = () => null;
  Webpack.getStore = () => null;
  Webpack.Stores = {};
  Webpack.getByStrings = (...args) => {
    calls.push([...args]);
    const options = typeof args.at(-1) === 'object' ? args.pop() : {};
    const matches = value => typeof value === 'function' && args.every(marker => String(value).includes(marker));
    if (matches(exports)) return exports;
    if (options.searchExports) {
      for (const key of Object.keys(exports)) {
        hooks.publicExportReads += 1;
        if (typeof Object.getOwnPropertyDescriptor(exports, key)?.get === 'function') hooks.publicAccessorReads += 1;
        const value = exports[key];
        if (matches(value)) return value;
      }
    }
    return null;
  };
  // Like BetterDiscord, export enumeration reads getters even when the filter
  // returns false. The contract must request root-only supplemental enumeration.
  Webpack.getModules = (filter, options = {}) => {
    hooks.scanOptions.push(options);
    const matches = [];
    if (filter(exports, record, record.id)) matches.push(exports);
    if (options.searchExports) {
      for (const key of Object.keys(exports)) {
        hooks.scanExportReads += 1;
        const value = exports[key];
        if (filter(value, record, record.id)) matches.push(value);
      }
    }
    return matches;
  };
  return calls;
}

function productionManaModule() {
  return vm.runInNewContext(`${source.slice(getterStart, getterEnd)}\nDiscordModules.ManaModule;`, {
    Webpack, Filters: Webpack.Filters, Logger
  });
}

async function auditConfirmModal() {
  const report = await new Audit().buildReport('unit', { loadEntry: false, externalAssets: false });
  return report.contracts.find(contract => contract.name === 'ManaConfirmModal');
}

function isolatedAuditConfirmModal() {
  // Execute the real report contract in isolation so unrelated audit contracts
  // cannot contribute their own legitimate public lookup or export reads.
  return vm.runInNewContext(`${auditSource.slice(0, auditDefinitionsEnd)}
    describeContract(api, moduleContracts().find(contract => contract.name === 'ManaConfirmModal'));`, {
    require, api: { Webpack }
  });
}

function confirmFallbackCalls(calls) {
  return calls.filter(args => args[0] === markers[0]);
}

test.beforeEach(() => {
  resetHarness();
  Plugins.folder = path.join(__dirname, '..', '.tmp');
});
test.afterEach(resetHarness);

test('production named ConfirmModal takes precedence without a fallback lookup', () => {
  function LegacyConfirm() {}
  const named = { ConfirmModal: LegacyConfirm };
  const calls = configureWebpack({ u: MinifiedConfirm }, named);
  assert.strictEqual(productionManaModule().ConfirmModal, LegacyConfirm);
  assert.equal(confirmFallbackCalls(calls).length, 0);
});

test('production resolves a minified callable using every marker and searchExports', () => {
  const decoyModule = { toString: () => markers.join(' ') };
  const calls = configureWebpack({ decoyModule, incomplete: MissingMarker, u: MinifiedConfirm });
  assert.strictEqual(productionManaModule().ConfirmModal, MinifiedConfirm);
  const fallbackCalls = confirmFallbackCalls(calls);
  assert.equal(fallbackCalls.length, 1);
  assert.deepEqual(fallbackCalls[0].slice(0, -1), markers);
  assert.equal(fallbackCalls[0].at(-1).searchExports, true);
});

test('production rejects incomplete functions and source-like module objects', () => {
  configureWebpack({ incomplete: MissingMarker, wrapper: { toString: () => markers.join(' ') } });
  assert.equal(productionManaModule().ConfirmModal, null);
});

test('production falls back when the named export is nullish', () => {
  configureWebpack({ u: MinifiedConfirm }, { ConfirmModal: undefined });
  assert.strictEqual(productionManaModule().ConfirmModal, MinifiedConfirm);
});

test('production preserves named lookup and getter failures without using the fallback', () => {
  for (const failure of ['lookup', 'getter']) {
    const named = {};
    Object.defineProperty(named, 'ConfirmModal', { get() { throw new Error('named getter failed'); } });
    const calls = configureWebpack({ u: MinifiedConfirm }, named);
    if (failure === 'lookup') {
      Webpack.getByKeys = key => {
        if (key === 'ConfirmModal') throw new Error('named lookup failed');
        return null;
      };
    }
    assert.equal(productionManaModule(), null);
    assert.equal(confirmFallbackCalls(calls).length, 0);
  }
});

test('audit passes named, minified, and direct callable selections with matching candidates', async () => {
  for (const exports of [{ ConfirmModal: MinifiedConfirm }, { u: MinifiedConfirm }, MinifiedConfirm]) {
    const named = Object.hasOwn(exports, 'ConfirmModal') ? exports : null;
    const calls = configureWebpack(exports, named);
    const contract = await auditConfirmModal();
    assert.equal(contract.required, true);
    assert.equal(contract.status, 'pass');
    assert.equal(contract.selected.type, 'function');
    assert.equal(contract.validation.booleans.callable, true);
    assert.equal(contract.loadedMatchCount, 1);
    assert.equal(confirmFallbackCalls(calls).length, named ? 0 : 1);
  }
});

test('audit rejects absent targets and scans root descriptors without reading accessors', () => {
  let reads = 0;
  const exports = { incomplete: MissingMarker, wrapper: { toString: () => markers.join(' ') } };
  Object.defineProperty(exports, 'ConfirmModal', {
    enumerable: true,
    get() { reads += 1; return MissingMarker; }
  });
  Object.defineProperty(exports, 'u', {
    enumerable: true,
    get() { reads += 1; return MissingMarker; }
  });
  const hooks = {};
  configureWebpack(exports, null, hooks);
  const contract = isolatedAuditConfirmModal();
  assert.equal(contract.required, true);
  assert.equal(contract.status, 'fail');
  assert.equal(contract.selected.found, false);
  assert.equal(contract.loadedMatchCount, 0);
  assert.equal(reads, hooks.publicAccessorReads);
  assert.equal(reads, 2);
  assert.equal(hooks.scanExportReads, 0);
  assert.equal(hooks.scanOptions.length, 1);
  assert.equal(hooks.scanOptions[0].searchExports, false);
  assert.equal(hooks.scanOptions[0].searchDefault, false);
});

test('audit allows only the targeted named accessor selection', () => {
  let reads = 0;
  const named = {};
  Object.defineProperty(named, 'ConfirmModal', {
    enumerable: true,
    get() { reads += 1; return MinifiedConfirm; }
  });
  const hooks = {};
  const calls = configureWebpack(named, named, hooks);
  const contract = isolatedAuditConfirmModal();
  assert.equal(contract.selected.type, 'function');
  assert.equal(contract.validation.ok, true);
  assert.equal(reads, 1);
  assert.equal(hooks.scanExportReads, 0);
  assert.equal(contract.loadedMatchCount, 0);
  assert.equal(contract.status, 'warn');
  assert.equal(confirmFallbackCalls(calls).length, 0);
});

test('audit selects a minified accessor through the public lookup while scanning only descriptors', () => {
  let reads = 0;
  const exports = {};
  Object.defineProperty(exports, 'u', {
    enumerable: true,
    get() { reads += 1; return MinifiedConfirm; }
  });
  const hooks = {};
  configureWebpack(exports, null, hooks);
  const contract = isolatedAuditConfirmModal();
  assert.equal(contract.selected.type, 'function');
  assert.equal(contract.validation.ok, true);
  assert.equal(contract.loadedMatchCount, 0);
  assert.equal(contract.status, 'warn');
  assert.equal(reads, 1);
  assert.equal(hooks.publicExportReads, 1);
  assert.equal(hooks.publicAccessorReads, 1);
  assert.equal(hooks.scanExportReads, 0);
  assert.equal(hooks.scanOptions.length, 1);
  assert.equal(hooks.scanOptions[0].searchExports, false);
  assert.equal(hooks.scanOptions[0].searchDefault, false);
});

test('audit reports named lookup and getter errors without concealing them', async () => {
  for (const failure of ['lookup', 'getter']) {
    const named = {};
    Object.defineProperty(named, 'ConfirmModal', { get() { throw new Error('named getter failed'); } });
    const calls = configureWebpack({ u: MinifiedConfirm }, named);
    if (failure === 'lookup') {
      Webpack.getByKeys = key => {
        if (key === 'ConfirmModal') throw new Error('named lookup failed');
        return null;
      };
    }
    const contract = await auditConfirmModal();
    assert.equal(contract.status, 'fail');
    assert.equal(contract.validation.ok, false);
    assert.ok(contract.validation.errors.includes(failure === 'lookup'
      ? 'Webpack.getByKeys-threw' : 'property-getter-failed'));
    assert.equal(confirmFallbackCalls(calls).length, 0);
  }
});
