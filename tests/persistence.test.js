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

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-test-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function save(plugin, name, data, synchronous = false) {
  return new Promise(resolve => {
    plugin.efficientlySaveData(name, 'data', data, resolve, synchronous);
  });
}

test.beforeEach(resetHarness);

test('normal saves atomically replace the primary data file', async t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir, nodeModules: { fs, path } });
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, '{"data":{"old":true}}');

  const error = await save(plugin, 'MessageLoggerV2Data', { current: true });

  assert.equal(error, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { data: { current: true } });
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('shutdown-style synchronous saves use the same atomic path', async t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir, nodeModules: { fs, path } });

  const error = await save(plugin, 'MessageLoggerV2Data', { shutdown: true }, true);

  assert.equal(error, null);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(pluginDir, 'MessageLoggerV2Data.config.json'), 'utf8')),
    { data: { shutdown: true } }
  );
});

test('backup saves use an independent atomic destination', async t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir, nodeModules: { fs, path } });

  const error = await save(plugin, 'MessageLoggerV2DataBackup', { backup: true });

  assert.equal(error, null);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json'), 'utf8')),
    { data: { backup: true } }
  );
});

test('a failed async rename preserves the previous file and removes its temp file', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, '{"data":{"safe":true}}');
  const failingFs = {
    ...fs,
    promises: {
      writeFile: fs.promises.writeFile.bind(fs.promises),
      rename: async () => { throw new Error('simulated rename failure'); },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const plugin = createPlugin({ pluginDir, nodeModules: { fs: failingFs, path } });

  const error = await save(plugin, 'MessageLoggerV2Data', { safe: false });

  assert.match(error.message, /simulated rename failure/);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { data: { safe: true } });
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('startup cleanup removes only stale logger temp files', t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir, nodeModules: { fs, path } });
  const stalePrimary = path.join(pluginDir, 'MessageLoggerV2Data.config.json.tmp-stale');
  const staleBackup = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json.tmp-stale');
  const activeTemp = path.join(pluginDir, 'MessageLoggerV2Data.config.json.tmp-active');
  const unrelated = path.join(pluginDir, 'OtherPlugin.config.json.tmp-stale');
  for (const filePath of [stalePrimary, staleBackup, activeTemp, unrelated]) fs.writeFileSync(filePath, 'test');
  const old = new Date(Date.now() - 2 * 60 * 1000);
  fs.utimesSync(stalePrimary, old, old);
  fs.utimesSync(staleBackup, old, old);

  plugin.cleanUpStaleDataTempFiles();

  assert.equal(fs.existsSync(stalePrimary), false);
  assert.equal(fs.existsSync(staleBackup), false);
  assert.equal(fs.existsSync(activeTemp), true);
  assert.equal(fs.existsSync(unrelated), true);
  assert.ok(loggerEvents.some(event => event[0] === 'log' && String(event[1]).includes('Removed 2')));
});
