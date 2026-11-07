const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const helperPath = path.join(__dirname, '..', 'tools', 'MessageLoggerRuntimeCompatibilityAudit.plugin.js');

function saveGlobals(names) {
  return new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
}

function restoreGlobals(saved) {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

function makeHarness({ started = true, classes, modules = null, pluginGet = null, webpackThrows = false } = {}) {
  const pluginFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-class-readiness-'));
  const messageCss = { message: 'message_token', cozyMessage: 'cozy_token' };
  const selectedCss = { selected: 'selected_token', message: 'message_token' };
  const nativeModules = modules || [messageCss, selectedCss];
  const instance = { __started: started, classes };
  const addon = { instance };
  const plugins = {
    folder: pluginFolder,
    get(name) {
      if (pluginGet) return pluginGet(name, addon);
      return name === 'MessageLoggerV2' ? addon : null;
    }
  };
  const webpack = {
    Filters: {},
    getByKeys(...args) {
      if (webpackThrows) throw new Error('private-native-error');
      const keys = args.filter(value => typeof value === 'string');
      return nativeModules.find(module => keys.every(key => Object.hasOwn(module, key))) || null;
    },
    getModule(filter) {
      if (webpackThrows) throw new Error('private-native-error');
      for (const [index, module] of nativeModules.entries()) {
        try {
          if (filter(module, { id: index + 1, exports: module }, index + 1)) return module;
        } catch {}
      }
      return null;
    },
    getModules() {}
  };
  const api = { Plugins: plugins, Webpack: webpack };
  class MockBdApi {
    constructor() { return api; }
  }
  globalThis.BdApi = MockBdApi;
  globalThis.document = {
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    getElementsByClassName() { return []; }
  };
  globalThis.window = { document: globalThis.document };
  return { addon, instance, pluginFolder };
}

async function readClassContract() {
  const Audit = require(helperPath);
  const report = await new Audit().buildReport('unit', { loadEntry: false, externalAssets: false });
  return report.contracts.find(({ name }) => name === 'LoggerIntegration.MessageClasses');
}

test('runtime audit checks actual started Logger message class captures against fresh semantic CSS', async t => {
  const savedGlobals = saveGlobals(['BdApi', 'document', 'window']);
  const cachedHelper = require.cache[helperPath];
  try {
    delete require.cache[helperPath];
    await t.test('matching started instance passes', async () => {
      const harness = makeHarness({ classes: { message: 'message_token', selected: 'selected_token' } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'pass');
        assert.equal(contract?.state, 'started');
        assert.equal(contract?.roles.message.matches, true);
        assert.equal(contract?.roles.selected.matches, true);
      } finally { fs.rmSync(harness.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('empty startup captures fail once native modules are ready', async () => {
      const harness = makeHarness({ classes: { message: '', selected: '' } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'fail');
        assert.equal(contract?.roles.message.nativeReady, true);
        assert.equal(contract?.roles.message.actualToken, null);
        assert.equal(contract?.roles.selected.matches, false);
      } finally { fs.rmSync(harness.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('a valid groupStart fallback has no stale primary-lookup error', async () => {
      const harness = makeHarness({
        classes: { message: 'message_token', selected: 'selected_token' },
        modules: [
          { message: 'message_token', groupStart: 'group_token' },
          { selected: 'selected_token', message: 'message_token' }
        ]
      });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'pass');
        assert.equal(contract?.roles.message.selectedAlternative, 'message+groupStart');
        assert.deepEqual(contract?.validation.errors, []);
      } finally { fs.rmSync(harness.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('not-started Logger and still-unloaded native modules are deferred warnings', async () => {
      const notStarted = makeHarness({ started: false, classes: { message: '', selected: '' } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'logger-not-started');
      } finally { fs.rmSync(notStarted.pluginFolder, { recursive: true, force: true }); }

      const unloaded = makeHarness({ classes: { message: '', selected: '' }, modules: [] });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'native-css-module-not-ready');
      } finally { fs.rmSync(unloaded.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('missing, malformed, and accessor-backed actual fields fail safely after native readiness', async () => {
      const missing = makeHarness({ classes: {} });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'fail');
        assert.equal(contract?.roles.message.actualReadError, 'property-missing');
      } finally { fs.rmSync(missing.pluginFolder, { recursive: true, force: true }); }

      const malformed = makeHarness({ classes: { message: 'two words', selected: 'bad/token' } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'fail');
        assert.equal(contract?.roles.message.actualToken, 'two');
        assert.equal(contract?.roles.selected.actualToken, null);
      } finally { fs.rmSync(malformed.pluginFolder, { recursive: true, force: true }); }

      const accessor = makeHarness({ classes: {} });
      Object.defineProperty(accessor.instance.classes, 'message', { get() { throw new Error('secret'); } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'fail');
        assert.equal(contract?.roles.message.actualReadError, 'accessor-skipped');
        assert.doesNotMatch(JSON.stringify(contract), /secret/);
      } finally { fs.rmSync(accessor.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('missing and throwing plugin/Webpack APIs produce bounded warnings', async () => {
      const unavailable = makeHarness({ pluginGet() { throw new Error('private-plugin-error'); } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'logger-unavailable');
        assert.doesNotMatch(JSON.stringify(contract), /private-plugin-error/);
      } finally { fs.rmSync(unavailable.pluginFolder, { recursive: true, force: true }); }

      const throwing = makeHarness({ webpackThrows: true, classes: { message: '', selected: '' } });
      try {
        const contract = await readClassContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'native-css-module-not-ready');
        assert.doesNotMatch(JSON.stringify(contract), /private-native-error/);
      } finally { fs.rmSync(throwing.pluginFolder, { recursive: true, force: true }); }
    });
  } finally {
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
  }
});
