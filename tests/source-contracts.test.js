const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createPlugin } = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');

function readDefaultSettings() {
  const match = source.match(/const defaultSettings = (\{[\s\S]*?\n    \});\n    const Flags =/);
  assert.ok(match, 'defaultSettings object was not found');
  const expression = match[1].replaceAll('this.pluginDir', JSON.stringify('/plugins'));
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${expression})`)));
}

test('plugin metadata and updater remain pointed at the maintained main branch', () => {
  assert.match(source, /@source https:\/\/git\.slowb\.ro\/XxUnkn0wnxX\/MessageLoggerV2-Remake\/src\/branch\/main\/MessageLoggerV2\.plugin\.js/);
  assert.match(source, /@updateUrl https:\/\/git\.slowb\.ro\/XxUnkn0wnxX\/MessageLoggerV2-Remake\/raw\/branch\/main\/MessageLoggerV2\.plugin\.js/);
});

test('all fresh-install settings defaults remain stable', () => {
  assert.deepEqual(readDefaultSettings(), {
    obfuscateCSSClasses: true,
    autoBackup: false,
    autoBackupIntervalSeconds: 20,
    dontSaveData: false,
    displayUpdateNotes: true,
    ignoreMutedGuilds: true,
    ignoreMutedChannels: true,
    ignoreBots: true,
    ignoreSelf: false,
    ignoreBlockedUsers: true,
    ignoreNSFW: false,
    ignoreLocalEdits: false,
    ignoreLocalDeletes: false,
    alwaysLogGhostPings: false,
    showOpenLogsButton: true,
    showHiddenTab: false,
    messageCacheCap: 1000,
    savedMessagesCap: 1000,
    antiNukeEnabled: true,
    antiNukeThreadCap: 10,
    antiNukeMessageCap: 10,
    antiNukeAttachmentCap: 10,
    reverseOrder: false,
    onlyLogWhitelist: true,
    whitelist: [],
    blacklist: [],
    notificationBlacklist: [],
    toastToggles: {
      sent: false,
      edited: true,
      deleted: true,
      ghostPings: true
    },
    toastTogglesDMs: {
      sent: false,
      edited: true,
      deleted: true,
      ghostPings: true,
      disableToastsForLocal: false
    },
    useNotificationsInstead: true,
    blockSpamEdit: false,
    cacheAllImages: true,
    newCacheAllImagesPath: '',
    newCacheAllImages: true,
    newSaveAllFileTypes: false,
    addUserIdToSavedMediaFilename: false,
    alwaysNotifChannel: false,
    alwaysNotifGuild: false,
    notifOnlyWhitelist: false,
    notificationWhitelist: [],
    aggresiveMessageCaching: true,
    renderCap: 50,
    maxShownEdits: 0,
    hideNewerEditsFirst: true,
    displayDates: true,
    deletedMessageColor: '',
    useAlternativeDeletedStyle: false,
    showEditedMessages: true,
    showDeletedMessages: true,
    showPurgedMessages: true,
    showDeletedCount: true,
    showEditedCount: true,
    alwaysLogSelected: true,
    alwaysLogDM: true,
    restoreDeletedMessages: true,
    autoRefreshForumPosts: true,
    contextmenuSubmenuName: '',
    imageCacheDir: '/plugins/MLV2_IMAGE_CACHE',
    maxCacheFileSize: 0,
    onlyRenderCachedAttachments: false,
    deleteCachedFilesWithRecords: false,
    flags: 0,
    autoUpdate: true,
    versionInfo: ''
  });
  assert.match(source, /loadedSettingsAreUsable[\s\S]*structuredClone\(defaultSettings\)[\s\S]*normalizeSettingsAgainstDefaults\(this\.settings, defaultSettings\)[\s\S]*if \(settingsChanged\) this\.saveSettings\(\);/);

  const defaults = readDefaultSettings();
  const migrated = {
    autoBackup: 'invalid',
    whitelist: ['guild-a', 123, 'guild-a'],
    toastToggles: { sent: 'invalid', edited: false, forkSpecificAlert: true },
    forkSpecificSetting: { enabled: true },
    versionInfo: defaults.versionInfo
  };
  const plugin = createPlugin();
  assert.equal(plugin.normalizeSettingsAgainstDefaults(migrated, defaults), true);
  assert.equal(Object.keys(defaults).every(key => Object.prototype.hasOwnProperty.call(migrated, key)), true);
  assert.equal(migrated.autoBackup, defaults.autoBackup);
  assert.deepEqual(migrated.whitelist, ['guild-a']);
  assert.deepEqual(migrated.toastToggles, {
    sent: defaults.toastToggles.sent,
    edited: false,
    deleted: defaults.toastToggles.deleted,
    ghostPings: defaults.toastToggles.ghostPings,
    forkSpecificAlert: true
  });
  assert.deepEqual(migrated.forkSpecificSetting, { enabled: true });
  assert.equal(plugin.normalizeSettingsAgainstDefaults(migrated, defaults), false);

  const customized = structuredClone(defaults);
  Object.assign(customized, {
    autoBackup: true,
    autoBackupIntervalSeconds: 300,
    messageCacheCap: 4321,
    savedMessagesCap: 9876,
    deletedMessageColor: '#12abef',
    newCacheAllImagesPath: '/custom/cache',
    contextmenuSubmenuName: 'My Logger',
    whitelist: ['guild-a', 'channel-b'],
    forkSpecificSetting: { enabled: true }
  });
  customized.toastToggles.forkSpecificAlert = true;
  const before = structuredClone(customized);
  assert.equal(plugin.normalizeSettingsAgainstDefaults(customized, defaults), false);
  assert.equal(plugin.ensureAutoBackupIntervalSetting(customized), false);
  assert.deepEqual(customized, before);
});

test('required legacy cache toggles stay visible, locked, and forced on', () => {
  assert.match(source, /if \(this\.ensureRequiredLegacySettings\(\)\) settingsChanged = true;/);
  assert.match(source, /name: 'Aggresive message caching \(makes sure we have the data of any deleted or edited messages\)'[\s\S]*?id: 'aggresiveMessageCaching'[\s\S]*?disabled: true/);
  assert.match(source, /name: 'Use new cached images system'[\s\S]*?Organizes cached media by server and channel\.[\s\S]*?id: 'newCacheAllImages'[\s\S]*?disabled: true/);

  const plugin = createPlugin({
    settings: {
      aggresiveMessageCaching: false,
      newCacheAllImages: false
    }
  });
  assert.equal(plugin.ensureRequiredLegacySettings(), true);
  assert.equal(plugin.settings.aggresiveMessageCaching, true);
  assert.equal(plugin.settings.newCacheAllImages, true);
  assert.equal(plugin.ensureRequiredLegacySettings(), false);

  plugin.settings = {};
  assert.equal(plugin.ensureRequiredLegacySettings(), true);
  assert.equal(plugin.settings.aggresiveMessageCaching, true);
  assert.equal(plugin.settings.newCacheAllImages, true);
});

test('atomic persistence and startup cleanup remain wired into the plugin', () => {
  assert.match(source, /this\.cleanUpStaleDataTempFiles\(\)/);
  assert.match(source, /fs\.renameSync\(tempPath, filePath\)/);
  assert.match(source, /await fs\.promises\.rename\(tempPath, filePath\)/);
  assert.match(source, /this\.getName\(\) \+ 'DataBackup'/);
});

test('automatic backup interval is configurable and bounded in settings and config', () => {
  assert.match(source, /const DEFAULT_AUTO_BACKUP_INTERVAL_SECONDS = 20;/);
  assert.match(source, /const MIN_AUTO_BACKUP_INTERVAL_SECONDS = 10;/);
  assert.match(source, /const MAX_AUTO_BACKUP_INTERVAL_SECONDS = 86400;/);
  assert.match(source, /name: 'Auto backup interval \(seconds\)'[\s\S]*id: 'autoBackupIntervalSeconds'[\s\S]*min: MIN_AUTO_BACKUP_INTERVAL_SECONDS[\s\S]*max: MAX_AUTO_BACKUP_INTERVAL_SECONDS/);
  assert.match(source, /Invalid auto-backup interval in config; reset to/);
  assert.match(source, /setTimeout\(\(\) => this\.saveBackup\(\), this\.getAutoBackupIntervalMilliseconds\(\)\)/);

  const plugin = createPlugin({ settings: { autoBackupIntervalSeconds: 300 } });
  assert.equal(plugin.normalizeAutoBackupIntervalSeconds(300), 300);
  assert.equal(plugin.getAutoBackupIntervalMilliseconds(), 300_000);
  for (const invalid of [null, '', 9, 86401, 10.5, 'not-a-number']) {
    assert.equal(plugin.normalizeAutoBackupIntervalSeconds(invalid), 20);
  }
  assert.equal(plugin.normalizeAutoBackupIntervalSeconds(10), 10);
  assert.equal(plugin.normalizeAutoBackupIntervalSeconds(86400), 86400);

  plugin.settings = {};
  assert.equal(plugin.ensureAutoBackupIntervalSetting(), true);
  assert.equal(plugin.settings.autoBackupIntervalSeconds, 20);
  assert.equal(plugin.ensureAutoBackupIntervalSetting(), false);
  plugin.settings.autoBackupIntervalSeconds = 9;
  assert.equal(plugin.ensureAutoBackupIntervalSetting(), true);
  assert.equal(plugin.settings.autoBackupIntervalSeconds, 20);
});

test('no-save recovery remains guarded and ordered before backup persistence', () => {
  assert.match(source, /this\._needsNoSaveDataMerge = !!this\.settings\.dontSaveData/);
  assert.match(source, /loadPersistedDataForNoSaveMerge\(\)/);
  assert.match(source, /mergeDataPayloads\(loaded\.data, this\._getDataPayload\(\)\)/);
  assert.match(source, /applySavedMessagesCapToPayload/);
  assert.match(source, /Data Recovery Error/);
  assert.match(source, /View the console log for more details/);
  assert.match(source, /this\.cancelPendingDataWrites\?\.\(\)/);
  const recovery = source.slice(source.indexOf('async mergeNoSaveSessionIntoPersistedData()'), source.indexOf('handleDataSaveSetting(disabled)'));
  assert.ok(recovery.indexOf("this.getName() + 'Data'") < recovery.indexOf("this.getName() + 'DataBackup'"));
});

test('legacy data migration uses canonical whole-file output and routed notifications', () => {
  assert.match(source, /const DATA_SCHEMA_VERSION = 1;/);
  assert.match(source, /mlv2RemakeSchemaVersion: DATA_SCHEMA_VERSION,[\s\S]*messageRecord: this\.messageRecord/);
  assert.match(source, /Legacy or mixed-fork logger data detected\. Migration to the current schema is in progress\./);
  assert.match(source, /rewriteCanonicalDataPayload\(\)[\s\S]*writeDataPayloadAtomic\([\s\S]*this\.getName\(\) \+ 'Data'/);
  assert.match(source, /Message Logger Data Migration Error[\s\S]*View the console log for more details\./);
});

test('backup restoration reports the main-file rebuild through the notification router', () => {
  assert.match(source, /this\._canonicalRewriteReason = dataLoadedFromBackup/);
  assert.match(source, /Valid logger backup is loaded[\s\S]*scheduling an atomic rebuild of the main data file/);
  assert.match(source, /this\._showNotification\([\s\S]*Message Logger Data Recovery[\s\S]*Valid backup loaded\. Rebuilding the main data file\./);
  assert.match(source, /Message Logger Data Recovery Error[\s\S]*main data file could not be rebuilt[\s\S]*View the console log for more details\./);
  assert.match(source, /Backup loaded and the main data file was rebuilt successfully\./);
});
