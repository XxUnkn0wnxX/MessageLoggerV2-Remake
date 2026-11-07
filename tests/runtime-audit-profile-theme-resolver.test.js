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

function createNativeProvider() {
  return function NativeProfileThemeProvider() {
    const state = source.useContext(context);
    return source.useMemo(() => source.Provider({
      primaryColor: state.primaryColor,
      secondaryColor: state.secondaryColor,
      enabledExperiments: state.enabledExperiments,
      reduceAdaptiveTheme: state.reduceAdaptiveTheme
    }), [state]);
  };
}

function createValidResult(counters = {}) {
  const storePrototype = {
    addChangeListener() { counters.added = (counters.added || 0) + 1; },
    removeChangeListener() { counters.removed = (counters.removed || 0) + 1; }
  };
  const store = Object.create(storePrototype);
  store.theme = 'private-theme-name';
  const getSnapshot = () => {
    counters.snapshotRead = (counters.snapshotRead || 0) + 1;
    assert.fail('audit should use initialSnapshot without calling the reader');
  };
  return {
    provider: createNativeProvider(),
    store,
    getSnapshot,
    initialSnapshot: { theme: 'private-theme-name', classes: 'private-theme-classes' }
  };
}

function makeRuntime({ started = true, resolver, managerPresent = true } = {}) {
  const pluginFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-profile-theme-audit-'));
  const manager = managerPresent ? {} : null;
  if (manager && resolver !== undefined) manager.findProfileTheme = resolver;
  const addon = { instance: { __started: started, tools: { popoutManager: manager } } };
  const api = {
    Plugins: {
      folder: pluginFolder,
      get(name) { return name === 'MessageLoggerV2' ? addon : null; }
    },
    Webpack: {}
  };
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
  return { pluginFolder, manager };
}

async function profileThemeContract() {
  const Audit = require(helperPath);
  const report = await new Audit().buildReport('unit', { loadEntry: false, externalAssets: false });
  return report.contracts.find(({ name }) => name === 'LoggerIntegration.ProfileThemeResolver');
}

test('runtime audit validates the installed profile theme resolver without reading listeners or rendering', async t => {
  const savedGlobals = saveGlobals(['BdApi', 'document', 'window']);
  const cachedHelper = require.cache[helperPath];
  try {
    delete require.cache[helperPath];

    await t.test('not-started and older manager without resolver are deferred warnings', async () => {
      const oldManager = makeRuntime({ started: true });
      try {
        const contract = await profileThemeContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'resolver-unavailable');
        assert.equal(contract?.invoked, false);
      } finally { fs.rmSync(oldManager.pluginFolder, { recursive: true, force: true }); }

      let calls = 0;
      const notStarted = makeRuntime({ started: false, resolver() { calls++; return createValidResult(); } });
      try {
        const contract = await profileThemeContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'logger-not-started');
        assert.equal(contract?.invoked, false);
        assert.equal(calls, 0);
      } finally { fs.rmSync(notStarted.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('valid native provider, inherited listeners, and nonempty snapshot pass without side effects', async () => {
      const counters = {};
      const result = createValidResult(counters);
      let calls = 0;
      const runtime = makeRuntime({ resolver() { calls++; return result; } });
      try {
        const contract = await profileThemeContract();
        assert.equal(contract?.status, 'pass');
        assert.equal(contract?.state, 'resolved');
        assert.equal(contract?.providerMarkers?.['.useContext('], true);
        assert.equal(contract?.providerMarkers?.reduceAdaptiveTheme, true);
        assert.equal(contract?.storeListenersCallable, true);
        assert.equal(contract?.getSnapshotCallable, true);
        assert.deepEqual(contract?.initialSnapshot, { available: true, themeNonempty: true, classesNonempty: true });
        assert.equal(calls, 1);
        assert.deepEqual(counters, {}, 'audit does not invoke the provider, snapshot reader, or store listeners');
        assert.doesNotMatch(JSON.stringify(contract), /private-theme/);
      } finally { fs.rmSync(runtime.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('null, throwing, invalid provider, snapshot, and listeners fail safely', async () => {
      const cases = [
        ['null result', () => null, 'result-unavailable'],
        ['throwing resolver', () => { throw new Error('private-theme-detail'); }, 'resolver-threw'],
        ['wrong provider source', () => ({ ...createValidResult(), provider() {} }), 'result-invalid'],
        ['empty snapshot class string', () => ({ ...createValidResult(), initialSnapshot: { theme: 'theme', classes: '  ' } }), 'result-invalid'],
        ['missing snapshot theme', () => ({ ...createValidResult(), initialSnapshot: { classes: 'classes' } }), 'result-invalid'],
        ['missing remove listener', () => {
          const result = createValidResult();
          Object.setPrototypeOf(result.store, { addChangeListener() {} });
          return result;
        }, 'result-invalid'],
        ['missing snapshot reader', () => ({ ...createValidResult(), getSnapshot: null }), 'result-invalid']
      ];
      for (const [label, resolver, state] of cases) {
        const runtime = makeRuntime({ resolver });
        try {
          const contract = await profileThemeContract();
          assert.equal(contract?.status, 'fail', label);
          assert.equal(contract?.state, state, label);
          assert.doesNotMatch(JSON.stringify(contract), /private-theme-detail/);
        } finally { fs.rmSync(runtime.pluginFolder, { recursive: true, force: true }); }
      }
    });
  } finally {
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
  }
});
