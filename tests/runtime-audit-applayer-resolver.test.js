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

function callableWithName(name) {
  const component = function ComponentMustNotBeInvoked() {
    assert.fail('audit must inspect component metadata without rendering it');
  };
  Object.defineProperty(component, 'displayName', { value: name, enumerable: true });
  return component;
}

function makeRuntime({ started = true, resolver, managerPresent = true } = {}) {
  const pluginFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-applayer-audit-'));
  const manager = managerPresent ? {} : null;
  if (manager && resolver !== undefined) manager.findAppLayerBundle = resolver;
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

async function appLayerContract() {
  const Audit = require(helperPath);
  const report = await new Audit().buildReport('unit', { loadEntry: false, externalAssets: false });
  return report.contracts.find(({ name }) => name === 'LoggerIntegration.AppLayerResolver');
}

test('runtime audit classifies the installed AppLayer resolver without mounting UI', async t => {
  const savedGlobals = saveGlobals(['BdApi', 'document', 'window']);
  const cachedHelper = require.cache[helperPath];
  try {
    delete require.cache[helperPath];

    await t.test('not-started Logger and older manager without resolver are deferred warnings', async () => {
      const oldManager = makeRuntime({ started: true });
      try {
        const contract = await appLayerContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'resolver-unavailable');
        assert.equal(contract?.invoked, false);
      } finally { fs.rmSync(oldManager.pluginFolder, { recursive: true, force: true }); }

      let calls = 0;
      const notStarted = makeRuntime({ started: false, resolver() { calls++; return null; } });
      try {
        const contract = await appLayerContract();
        assert.equal(contract?.status, 'warn');
        assert.equal(contract?.state, 'logger-not-started');
        assert.equal(contract?.invoked, false);
        assert.equal(calls, 0);
      } finally { fs.rmSync(notStarted.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('one exact native role bundle passes and no component is invoked', async () => {
      const bundle = {
        Provider: callableWithName('AppLayerProvider'),
        Container: callableWithName('AppLayerContainer'),
        Layer: callableWithName('AppLayer')
      };
      let calls = 0;
      const runtime = makeRuntime({ resolver() { calls++; return bundle; } });
      try {
        const contract = await appLayerContract();
        assert.equal(contract?.status, 'pass');
        assert.equal(contract?.state, 'resolved');
        assert.equal(contract?.validation?.booleans?.rolesDistinct, true);
        assert.equal(calls, 1);
      } finally { fs.rmSync(runtime.pluginFolder, { recursive: true, force: true }); }
    });

    await t.test('null, wrong-role, and throwing resolver outcomes fail with bounded diagnostics', async () => {
      for (const [label, resolver, state] of [
        ['ambiguous-or-unavailable', () => null, 'bundle-unavailable'],
        ['wrong-display-name', () => ({
          Provider: callableWithName('Provider'),
          Container: callableWithName('AppLayerContainer'),
          Layer: callableWithName('AppLayer')
        }), 'bundle-invalid'],
        ['missing-role', () => ({
          Provider: callableWithName('AppLayerProvider'),
          Container: callableWithName('AppLayerContainer')
        }), 'bundle-invalid'],
        ['throwing-resolver', () => { throw new Error('private-runtime-detail'); }, 'resolver-threw']
      ]) {
        const runtime = makeRuntime({ resolver });
        try {
          const contract = await appLayerContract();
          assert.equal(contract?.status, 'fail', label);
          assert.equal(contract?.state, state, label);
          assert.doesNotMatch(JSON.stringify(contract), /private-runtime-detail/);
        } finally { fs.rmSync(runtime.pluginFolder, { recursive: true, force: true }); }
      }
    });
  } finally {
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
  }
});
