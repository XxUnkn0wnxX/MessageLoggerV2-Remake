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
    debugLogging: false,
    debugToasts: false,
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
  assert.match(source, /name: 'Auto backup interval \(seconds\)'[\s\S]*id: 'autoBackupIntervalSeconds'[\s\S]*emptyValue: DEFAULT_AUTO_BACKUP_INTERVAL_SECONDS[\s\S]*min: MIN_AUTO_BACKUP_INTERVAL_SECONDS[\s\S]*max: MAX_AUTO_BACKUP_INTERVAL_SECONDS[\s\S]*inlineValidation: true/);
  assert.match(source, /createInlineValidatedNumberInput\(config, onValid\)[\s\S]*aria-invalid[\s\S]*borderColor: 'var\(--status-danger\)'[\s\S]*boxShadow: '0 0 0 1px var\(--status-danger\)'/);
  assert.match(source, /const nextValidation = plugin\.validateNumericSettingValue\(value, config\);[\s\S]*if \(nextValidation\.valid\) onValid\(nextValidation\.value\);/);
  assert.match(source, /Invalid auto-backup interval in config; reset to/);
  assert.match(source, /this\.queueAutoBackup\(this\.getAutoBackupIntervalMilliseconds\(\), 'rescheduled after the interval changed'\)/);

  const plugin = createPlugin({ settings: { autoBackupIntervalSeconds: 300 } });
  assert.equal(plugin.normalizeAutoBackupIntervalSeconds(300), 300);
  assert.equal(plugin.getAutoBackupIntervalMilliseconds(), 300_000);
  for (const invalid of [null, '', 9, 86401, 10.5, 'not-a-number']) {
    assert.equal(plugin.normalizeAutoBackupIntervalSeconds(invalid), 20);
  }
  assert.equal(plugin.normalizeAutoBackupIntervalSeconds(10), 10);
  assert.equal(plugin.normalizeAutoBackupIntervalSeconds(86400), 86400);
  assert.deepEqual(plugin.validateNumericSettingValue('3', { min: 10, max: 86400 }), {
    valid: false,
    message: 'Value must be at least 10!'
  });
  assert.deepEqual(plugin.validateNumericSettingValue('300', { min: 10, max: 86400 }), {
    valid: true,
    value: 300
  });
  assert.deepEqual(plugin.validateNumericSettingValue('', { emptyValue: 20, min: 10, max: 86400 }), {
    valid: true,
    value: 20
  });

  plugin.settings = {};
  assert.equal(plugin.ensureAutoBackupIntervalSetting(), true);
  assert.equal(plugin.settings.autoBackupIntervalSeconds, 20);
  assert.equal(plugin.ensureAutoBackupIntervalSetting(), false);
  plugin.settings.autoBackupIntervalSeconds = 9;
  assert.equal(plugin.ensureAutoBackupIntervalSetting(), true);
  assert.equal(plugin.settings.autoBackupIntervalSeconds, 20);
});

test('backup diagnostics remain opt-in under their own warning-colored Debug category', () => {
  assert.match(source, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*'Debug'[\s\S]*id: 'ml2-settings-debug'[\s\S]*collapsible: true[\s\S]*shown: false/);
  assert.match(source, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*Enable debug logging[\s\S]*id: 'debugLogging'[\s\S]*type: 'switch'/);
  assert.match(source, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*Show debug messages as toasts[\s\S]*id: 'debugToasts'[\s\S]*type: 'switch'/);
  assert.match(source, /if \(this\.settings\?\.debugLogging\) Logger\.log\(`\[Debug\] \$\{message\}`\)/);
  assert.match(source, /if \(this\.settings\?\.debugToasts\)[\s\S]*this\._showNotification\('Message Logger Debug', message, 'warning'/);
});

test('settings callbacks have one BetterDiscord owner', () => {
  const buildSetting = source.slice(source.indexOf('buildSetting(data)'), source.indexOf('createSetting(data)'));
  assert.match(buildSetting, /const \{ id, onChange, \.\.\.settingData \} = data/);
  assert.match(buildSetting, /settings: \[\{[\s\S]*\.\.\.settingData/);
  assert.match(buildSetting, /onChange\(c, id, v\) \{[\s\S]*onChange\(v\)/);
  assert.doesNotMatch(buildSetting, /\.\.\.data/);
  const ordinaryCallback = source.slice(
    source.indexOf('else if (!setting.onChange)'),
    source.indexOf('if (config.inlineValidation')
  );
  assert.match(ordinaryCallback, /setting\.callback = val =>/);
  assert.doesNotMatch(ordinaryCallback, /saveSettings\(\)/);
});

test('high-impact setting changes use routed theme-aware state feedback', () => {
  for (const [settingName, action] of [
    ['Only log whitelist', 'reportLoggingScope'],
    ['Cache media locally', 'reportMediaCaching'],
    ['Enable Anti Nuke', 'reportAntiNuke'],
    ['Delete cached files with log records', 'reportCachedFileDeletion']
  ]) {
    assert.match(source, new RegExp(`name: ['"]${settingName}['"][\\s\\S]*?action: '${action}'`));
  }
  assert.match(source, /reportMajorSettingChange\(settingId, enabled\)[\s\S]*onlyLogWhitelist[\s\S]*cacheAllImages[\s\S]*antiNukeEnabled[\s\S]*autoUpdate[\s\S]*onlyRenderCachedAttachments[\s\S]*deleteCachedFilesWithRecords/);
  assert.match(source, /enabled \? 'info' : 'neutral'/);
  assert.match(source, /'neutral': \{ bg: 'var\(--background-tertiary, #4f545c\)', fg: 'var\(--text-default, #fff\)'/);
  assert.match(source, /type: type === 'neutral' \? 'info' : type[\s\S]*var\(--interactive-normal\)/);
  assert.match(source, /reportSettingState\(title,[\s\S]*replaceKey[\s\S]*pauseOnHover: false[\s\S]*instantDismiss: true/);
  assert.match(source, /_dismissReplaceableNotification\(replaceKey\)[\s\S]*notification\.replaceKey !== replaceKey[\s\S]*active\.handle\?\.close/);
  assert.match(source, /if \(timeout > 0 && pauseOnHover\)[\s\S]*pointerenter[\s\S]*pointerleave/);
  assert.match(source, /notification\.pauseOnHover === false[\s\S]*active\.forceCloseTimer = setTimeout/);
  assert.match(source, /data-mlv2-native-notification-id[\s\S]*_attachNativeNotificationInteractions\(active\)/);
  assert.match(source, /card\.addEventListener\('click', dismiss, true\)[\s\S]*card\.addEventListener\('contextmenu', dismiss, true\)/);
  assert.match(source, /\.bd-notification-progress[\s\S]*progress\?\.animate\?/);
  assert.match(source, /Notification mode changed to[\s\S]*Using BetterDiscord notifications[\s\S]*type: 'info'/);
});

test('no-save recovery remains guarded and ordered before backup persistence', () => {
  assert.match(source, /this\._needsNoSaveDataMerge = !!this\.settings\.dontSaveData/);
  assert.match(source, /loadPersistedDataForNoSaveMerge\(\)/);
  assert.match(source, /mergeDataPayloads\(loaded\.data, this\._getDataPayload\(\)\)/);
  assert.match(source, /applySavedMessagesCapToPayload/);
  assert.match(source, /Data Recovery Error/);
  assert.match(source, /View the console log for more details/);
  assert.match(source, /this\.cancelPendingDataWrites\?\.\(\)/);
  assert.match(source, /reportDataSavingResume\(requiresRecoveryMerge\)[\s\S]*this\.reportSettingState\([\s\S]*Message Logger Data Recovery[\s\S]*Message Logger Data Saving/);
  assert.match(source, /reportDataSavingDisabled\(\)[\s\S]*new logger changes will remain in memory[\s\S]*will not be written to disk[\s\S]*'neutral'/);
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
