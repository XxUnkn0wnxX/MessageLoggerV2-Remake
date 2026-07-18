const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

const defaults = {
  autoBackup: false,
  autoBackupIntervalSeconds: 20,
  editSpamThreshold: 10,
  debugLogging: false,
  debugToasts: false,
  flags: 0,
  messageCacheCap: 1000,
  savedMessagesCap: 1000,
  openLogsKeybind: ['Control', 'm'],
  openFilteredLogsKeybind: ['Control', 'n'],
  openServerLogsKeybind: ['Control', 's'],
  toastToggles: {
    sent: false,
    edited: true
  },
  aggresiveMessageCaching: true,
  newCacheAllImages: true
};

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-settings-recovery-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function normalizeRecovered(plugin, settings) {
  plugin.ensureLoggerKeybindSettings(settings, defaults);
  plugin.normalizeSettingsAgainstDefaults(settings, defaults);
  plugin.ensureRequiredLegacySettings(settings);
  return settings;
}

test.beforeEach(resetHarness);

test('legacy configs gain shortcut defaults while valid custom and cleared bindings survive normalization', () => {
  const plugin = createPlugin();
  const legacy = { flags: 2 };
  normalizeRecovered(plugin, legacy);
  assert.deepEqual(legacy.openLogsKeybind, ['Control', 'm']);
  assert.deepEqual(legacy.openFilteredLogsKeybind, ['Control', 'n']);
  assert.deepEqual(legacy.openServerLogsKeybind, ['Control', 's']);

  const customized = {
    openLogsKeybind: ['Alt', 'L'],
    openFilteredLogsKeybind: [],
    openServerLogsKeybind: ['Meta', 'G'],
    flags: 2
  };
  normalizeRecovered(plugin, customized);
  assert.deepEqual(customized.openLogsKeybind, ['Alt', 'l']);
  assert.deepEqual(customized.openFilteredLogsKeybind, []);
  assert.deepEqual(customized.openServerLogsKeybind, ['Meta', 'g']);

  const invalid = {
    openLogsKeybind: 'Control+m',
    openFilteredLogsKeybind: ['Control', 123],
    openServerLogsKeybind: 'Control+s',
    flags: 2
  };
  normalizeRecovered(plugin, invalid);
  assert.deepEqual(invalid.openLogsKeybind, ['Control', 'm']);
  assert.deepEqual(invalid.openFilteredLogsKeybind, ['Control', 'n']);
  assert.deepEqual(invalid.openServerLogsKeybind, ['Control', 's']);
});

test('a valid legacy file initializes missing settings without corruption classification', t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir });
  const configPath = path.join(pluginDir, 'MessageLoggerV2.config.json');
  const original = JSON.stringify({
    settings: {
      autoBackup: true,
      flags: 2,
      forkSpecificSetting: { keep: true }
    }
  });
  fs.writeFileSync(configPath, original, 'utf8');

  const result = plugin.loadSettingsConfigForStartup(defaults, { fs, path });
  assert.equal(result.existed, true);
  assert.equal(result.repaired, false);
  assert.equal(result.backupPath, null);
  assert.equal(fs.existsSync(path.join(pluginDir, 'MessageLoggerV2.config.corrupt-backup.json')), false);

  const settings = normalizeRecovered(plugin, result.settings);
  assert.equal(settings.autoBackup, true);
  assert.equal(settings.autoBackupIntervalSeconds, 20);
  assert.equal(settings.editSpamThreshold, 10);
  assert.equal(settings.debugLogging, false);
  assert.equal(settings.debugToasts, false);
  assert.deepEqual(settings.openLogsKeybind, ['Control', 'm']);
  assert.deepEqual(settings.openFilteredLogsKeybind, ['Control', 'n']);
  assert.deepEqual(settings.openServerLogsKeybind, ['Control', 's']);
  assert.deepEqual(settings.forkSpecificSetting, { keep: true });
});

test('a trailing comma preserves existing settings and restores only missing defaults', () => {
  const plugin = createPlugin();
  const original = `{
    "settings": {
      "autoBackup": true,
      "messageCacheCap": 4321,
      "flags": 2,
      "forkSpecificSetting": {"enabled": true},
      "aggresiveMessageCaching": false,
      "newCacheAllImages": false,
      "autoBackupIntervalSeconds": 20,
    }
  }`;

  const result = plugin.recoverSettingsConfigText(original, defaults);
  const settings = normalizeRecovered(plugin, result.settings);

  assert.equal(result.repaired, true);
  assert.equal(settings.autoBackup, true);
  assert.equal(settings.messageCacheCap, 4321);
  assert.equal(settings.flags, 2);
  assert.deepEqual(settings.forkSpecificSetting, { enabled: true });
  assert.equal(settings.debugLogging, false);
  assert.equal(settings.debugToasts, false);
  assert.equal(settings.aggresiveMessageCaching, true);
  assert.equal(settings.newCacheAllImages, true);
});

test('missing and extra commas are repaired without changing valid values', () => {
  const plugin = createPlugin();
  const original = `{
    "settings": {
      "autoBackup": true
      "messageCacheCap": 2468,,,
      "flags": 2,
      "toastToggles": {
        "sent": true
        "edited": false,
      },
    },
  }`;

  const result = plugin.recoverSettingsConfigText(original, defaults);
  const settings = normalizeRecovered(plugin, result.settings);

  assert.equal(settings.autoBackup, true);
  assert.equal(settings.messageCacheCap, 2468);
  assert.equal(settings.flags, 2);
  assert.deepEqual(settings.toastToggles, { sent: true, edited: false });
  assert.ok(result.issues.some(issue => issue.type === 'missing-comma'));
  assert.ok(result.issues.some(issue => issue.type === 'extra-comma'));
});

test('missing and misplaced brackets still salvage later known settings', () => {
  const plugin = createPlugin();
  const original = `{
    "settings": {
      "autoBackup": true,
      "toastToggles": {
        "sent": true,
        "edited": false
      ],
      "messageCacheCap": 3579,
      "savedMessagesCap": 9753,
      "flags": 2
  `;

  const result = plugin.recoverSettingsConfigText(original, defaults);
  const settings = normalizeRecovered(plugin, result.settings);

  assert.equal(settings.autoBackup, true);
  assert.equal(settings.messageCacheCap, 3579);
  assert.equal(settings.savedMessagesCap, 9753);
  assert.equal(settings.flags, 2);
  assert.deepEqual(settings.toastToggles, { sent: true, edited: false });
  assert.ok(result.issues.some(issue => issue.type.includes('close')));
});

test('an invalid value defaults only that key while valid and fork keys survive', () => {
  const plugin = createPlugin();
  const original = `{
    "settings": {
      "autoBackup": true,
      "messageCacheCap": NOT_A_VALUE,
      "savedMessagesCap": 8642,
      "flags": 2,
      "forkSpecificSetting": {"mode": "keep-me"}
    }
  }`;

  const result = plugin.recoverSettingsConfigText(original, defaults);
  const settings = normalizeRecovered(plugin, result.settings);

  assert.equal(settings.autoBackup, true);
  assert.equal(settings.messageCacheCap, defaults.messageCacheCap);
  assert.equal(settings.savedMessagesCap, 8642);
  assert.equal(settings.flags, 2);
  assert.deepEqual(settings.forkSpecificSetting, { mode: 'keep-me' });
});

test('a severely damaged document keeps salvageable keys and defaults the remainder', () => {
  const plugin = createPlugin();
  const original = `not-json-at-all
    "autoBackup": true
    ]]]
    "savedMessagesCap": 6789
    "messageCacheCap": BROKEN
    "forkSpecificSetting": {"survived": true
  `;

  const result = plugin.recoverSettingsConfigText(original, defaults);
  const settings = normalizeRecovered(plugin, result.settings);

  assert.equal(settings.autoBackup, true);
  assert.equal(settings.savedMessagesCap, 6789);
  assert.equal(settings.messageCacheCap, defaults.messageCacheCap);
  assert.equal(settings.debugLogging, defaults.debugLogging);
  assert.equal(settings.debugToasts, defaults.debugToasts);
  assert.equal(settings.aggresiveMessageCaching, true);
  assert.equal(settings.newCacheAllImages, true);
});

test('commas and brackets inside valid strings are never treated as syntax damage', () => {
  const plugin = createPlugin();
  const original = `{
    "settings": {
      "flags": 2,
      "forkSpecificSetting": "keep }, ], and , inside this value",
      "autoBackup": true,
    }
  }`;

  const result = plugin.recoverSettingsConfigText(original, defaults);
  const settings = normalizeRecovered(plugin, result.settings);

  assert.equal(settings.forkSpecificSetting, 'keep }, ], and , inside this value');
  assert.equal(settings.autoBackup, true);
  assert.equal(settings.flags, 2);
});

test('corrupt settings are atomically rewritten and the exact original is backed up', t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir });
  const configPath = path.join(pluginDir, 'MessageLoggerV2.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2.config.corrupt-backup.json');
  const original = `{"settings":{"autoBackup":true "messageCacheCap":1234,"flags":2,}}`;
  fs.writeFileSync(configPath, original, 'utf8');

  const result = plugin.loadSettingsConfigForStartup(defaults, { fs, path });
  const rewritten = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.equal(result.repaired, true);
  assert.equal(result.existed, true);
  assert.equal(result.backupPath, backupPath);
  assert.equal(fs.readFileSync(backupPath, 'utf8'), original);
  assert.equal(rewritten.settings.autoBackup, true);
  assert.equal(rewritten.settings.messageCacheCap, 1234);
  assert.equal(rewritten.settings.flags, 2);
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp')), []);
});

test('a valid settings file is read without being rewritten or backed up', t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir });
  const configPath = path.join(pluginDir, 'MessageLoggerV2.config.json');
  const original = '{"settings":{"autoBackup":true,"flags":2}}\n';
  fs.writeFileSync(configPath, original, 'utf8');

  const result = plugin.loadSettingsConfigForStartup(defaults, { fs, path });

  assert.equal(result.repaired, false);
  assert.equal(result.existed, true);
  assert.equal(result.settings.autoBackup, true);
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(pluginDir, 'MessageLoggerV2.config.corrupt-backup.json')), false);
});

test('a missing config is the only state classified as a fresh install', t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir });

  const result = plugin.loadSettingsConfigForStartup(defaults, { fs, path });

  assert.equal(result.existed, false);
  assert.equal(result.repaired, false);
  assert.equal(result.settings, null);
});
