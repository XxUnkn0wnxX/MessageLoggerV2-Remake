const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createPlugin } = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const settingsDocs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'settings.md'), 'utf8');

function readDefaultSettings() {
  const match = source.match(/const defaultSettings = (\{[\s\S]*?\n    \});\n    const Flags =/);
  assert.ok(match, 'defaultSettings object was not found');
  const expression = match[1]
    .replaceAll('this.pluginDir', JSON.stringify('/plugins'))
    .replaceAll('DEFAULT_EDIT_SPAM_THRESHOLD', '10')
    .replaceAll('defaultDateFormat', JSON.stringify('M/D/YYYY'));
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${expression})`)));
}

test('plugin metadata and updater remain pointed at the maintained main branch', () => {
  assert.match(source, /@version 2\.8\.2\.8/);
  assert.match(source, /@source https:\/\/git\.slowb\.ro\/XxUnkn0wnxX\/MessageLoggerV2-Remake\/src\/branch\/main\/MessageLoggerV2\.plugin\.js/);
  assert.match(source, /@updateUrl https:\/\/git\.slowb\.ro\/XxUnkn0wnxX\/MessageLoggerV2-Remake\/raw\/branch\/main\/MessageLoggerV2\.plugin\.js/);
  assert.match(source, /title: 'Live display controls'[\s\S]*title: 'Linked settings controls'[\s\S]*title: 'Settings reliability and layout'/);
  assert.doesNotMatch(source, /title: 'Notification hardening'|title: 'Date formatting and deletion tooltips'/);
});

test('all fresh-install settings defaults remain stable', () => {
  assert.deepEqual(readDefaultSettings(), {
    obfuscateCSSClasses: true,
    autoBackup: false,
    autoBackupIntervalSeconds: 20,
    debugLogging: false,
    debugToasts: false,
    dontSaveData: false,
    dontLoadArchivedData: false,
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
    openLogsKeybind: ['Control', 'm'],
    openFilteredLogsKeybind: ['Control', 'n'],
    openServerLogsKeybind: ['Control', 's'],
    showHiddenTab: false,
    messageCacheCap: 1000,
    savedMessagesCap: 1000,
    antiNukeEnabled: true,
    antiNukeToasts: true,
    antiNukeThreadCap: 15,
    antiNukeMessageCap: 45,
    antiNukeAttachmentCap: 15,
    reverseOrder: false,
    onlyLogWhitelist: true,
    whitelist: [],
    blacklist: [],
    notificationBlacklist: [],
    toastToggles: {
      sent: false,
      edited: true,
      deleted: true,
      ghostPings: true,
      disableToastsForLocal: false
    },
    toastTogglesDMs: {
      sent: false,
      edited: true,
      deleted: true,
      ghostPings: true
    },
    useNotificationsInstead: true,
    blockSpamEdit: false,
    editSpamThreshold: 10,
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
    dateFormat: 'M/D/YYYY',
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
  assert.match(source, /loadedSettingsAreUsable[\s\S]*structuredClone\(defaultSettings\)[\s\S]*migrateDisableToastsForLocalSetting\(\)[\s\S]*normalizeSettingsAgainstDefaults\(this\.settings, defaultSettings\)[\s\S]*if \(settingsChanged\) this\.saveSettings\(\);/);

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
    disableToastsForLocal: defaults.toastToggles.disableToastsForLocal,
    forkSpecificAlert: true
  });
  assert.deepEqual(migrated.forkSpecificSetting, { enabled: true });
  assert.equal(plugin.normalizeSettingsAgainstDefaults(migrated, defaults), false);

  const customized = structuredClone(defaults);
  Object.assign(customized, {
    autoBackup: true,
    autoBackupIntervalSeconds: 300,
    editSpamThreshold: 25,
    messageCacheCap: 4321,
    savedMessagesCap: 9876,
    deletedMessageColor: '#12abef',
    newCacheAllImagesPath: '/custom/cache',
    contextmenuSubmenuName: 'My Logger',
    openLogsKeybind: ['Alt', 'l'],
    openFilteredLogsKeybind: [],
    openServerLogsKeybind: ['Meta', 'g'],
    whitelist: ['guild-a', 'channel-b'],
    forkSpecificSetting: { enabled: true }
  });
  customized.toastToggles.forkSpecificAlert = true;
  const before = structuredClone(customized);
  assert.equal(plugin.normalizeSettingsAgainstDefaults(customized, defaults), false);
  assert.equal(plugin.ensureAutoBackupIntervalSetting(customized), false);
  assert.deepEqual(plugin.ensureLoggerKeybindSettings(customized, defaults), []);
  assert.deepEqual(customized, before);
});

test('the guild-only local-user toast setting migrates from the legacy DM schema once', () => {
  const plugin = createPlugin();
  const cases = [
    {
      name: 'missing Guild value uses a valid legacy DM value',
      settings: {
        toastToggles: { guildExtension: 'keep' },
        toastTogglesDMs: { disableToastsForLocal: true, dmExtension: 'keep' }
      },
      expected: true
    },
    {
      name: 'an explicit Guild false wins over legacy true',
      settings: {
        toastToggles: { disableToastsForLocal: false, guildExtension: 'keep' },
        toastTogglesDMs: { disableToastsForLocal: true, dmExtension: 'keep' }
      },
      expected: false
    },
    {
      name: 'an explicit Guild true wins over legacy false',
      settings: {
        toastToggles: { disableToastsForLocal: true, guildExtension: 'keep' },
        toastTogglesDMs: { disableToastsForLocal: false, dmExtension: 'keep' }
      },
      expected: true
    },
    {
      name: 'an invalid present Guild value resets instead of importing legacy state',
      settings: {
        toastToggles: { disableToastsForLocal: 'invalid', guildExtension: 'keep' },
        toastTogglesDMs: { disableToastsForLocal: true, dmExtension: 'keep' }
      },
      expected: false
    },
    {
      name: 'missing and invalid legacy values use the safe default',
      settings: {
        toastTogglesDMs: { disableToastsForLocal: 'invalid', dmExtension: 'keep' }
      },
      expected: false
    }
  ];

  for (const migrationCase of cases) {
    const guildExtension = migrationCase.settings.toastToggles?.guildExtension;
    assert.equal(plugin.migrateDisableToastsForLocalSetting(migrationCase.settings), true, migrationCase.name);
    assert.equal(migrationCase.settings.toastToggles.disableToastsForLocal, migrationCase.expected, migrationCase.name);
    assert.equal(
      Object.prototype.hasOwnProperty.call(migrationCase.settings.toastTogglesDMs, 'disableToastsForLocal'),
      false,
      migrationCase.name
    );
    assert.equal(migrationCase.settings.toastToggles.guildExtension, guildExtension, migrationCase.name);
    assert.equal(migrationCase.settings.toastTogglesDMs.dmExtension, 'keep', migrationCase.name);
    assert.equal(plugin.migrateDisableToastsForLocalSetting(migrationCase.settings), false, `${migrationCase.name} is idempotent`);
  }
});

test('live restored-message settings present the master switch before category controls', () => {
  const displaySettings = source.slice(
    source.indexOf("name: 'Display settings'"),
    source.indexOf("name: 'Misc settings'")
  );
  const masterIndex = displaySettings.indexOf("name: 'Display saved messages in chat'");
  const deletedIndex = displaySettings.indexOf("id: 'showDeletedMessages'");
  const purgedIndex = displaySettings.indexOf("id: 'showPurgedMessages'");
  const deletedStyleIndex = displaySettings.indexOf("id: 'useAlternativeDeletedStyle'");
  const editedIndex = displaySettings.indexOf("id: 'showEditedMessages'");
  const maxEditsIndex = displaySettings.indexOf("id: 'maxShownEdits'");
  const editOrderIndex = displaySettings.indexOf("id: 'hideNewerEditsFirst'");
  const deletedColorIndex = displaySettings.indexOf("id: 'deletedMessageColor'");
  const deletedCountIndex = displaySettings.indexOf("id: 'showDeletedCount'");

  assert.ok(masterIndex >= 0);
  assert.ok(masterIndex < deletedIndex);
  assert.ok(deletedIndex < purgedIndex);
  assert.ok(purgedIndex < editedIndex);
  assert.ok(editedIndex < maxEditsIndex);
  assert.ok(maxEditsIndex < editOrderIndex);
  assert.ok(editOrderIndex < deletedStyleIndex);
  assert.ok(deletedStyleIndex < deletedColorIndex);
  assert.ok(deletedColorIndex < deletedCountIndex);
  assert.deepEqual(
    Array.from(displaySettings.slice(masterIndex, editedIndex).matchAll(/id: '([^']+)'/g), match => match[1]),
    ['restoreDeletedMessages', 'showDeletedMessages', 'showPurgedMessages']
  );
  assert.deepEqual(
    Array.from(displaySettings.slice(deletedStyleIndex, deletedCountIndex).matchAll(/id: '([^']+)'/g), match => match[1]),
    ['useAlternativeDeletedStyle', 'deletedMessageColor']
  );
  assert.match(displaySettings, /Display saved messages in chat'[\s\S]*createLinkedSettingNote\([\s\S]*Mounts enabled Deleted and Purged records in chats, forums, and threads\.[\s\S]*Hides them and disables linked controls and Jump; logs and child values stay saved\.[\s\S]*id: 'restoreDeletedMessages'/);
  assert.match(displaySettings, /name: 'Include Deleted messages'[\s\S]*'Live mounts messages captured from individual deletions when '[\s\S]*var\(--text-warning, var\(--status-warning\)\)[\s\S]*'Display saved messages in chat is enabled'[\s\S]*'\.'[\s\S]*id: 'showDeletedMessages'/);
  assert.match(displaySettings, /name: 'Include Purged messages'[\s\S]*var\(--text-warning, var\(--status-warning\)\)[\s\S]*Display saved messages in chat must be enabled first\.[\s\S]*id: 'showPurgedMessages'/);
  assert.match(displaySettings, /name: 'Display edited messages in chat'[\s\S]*createLinkedSettingNote\([\s\S]*Shows inline edit history and enables its linked controls\.[\s\S]*Hides history and Jump; edits and child values stay saved\.[\s\S]*id: 'showEditedMessages'/);
});

test('media-cache controls sit together below their master switch', () => {
  const miscSettings = source.slice(
    source.indexOf("name: 'Misc settings'"),
    source.indexOf("name: 'Toast notifications for guilds'")
  );
  const cacheMasterIndex = miscSettings.indexOf("name: 'Cache media locally'");
  const nextIndependentIndex = miscSettings.indexOf("name: 'Aggresive message caching");

  assert.ok(cacheMasterIndex >= 0);
  assert.ok(cacheMasterIndex < nextIndependentIndex);
  assert.deepEqual(
    Array.from(miscSettings.slice(cacheMasterIndex, nextIndependentIndex).matchAll(/id: '([^']+)'/g), match => match[1]),
    ['cacheAllImages', 'addUserIdToSavedMediaFilename', 'newSaveAllFileTypes', 'maxCacheFileSize', 'newCacheAllImagesPath']
  );
});

test('global notification controls form one block before logger access controls', () => {
  const miscSettings = source.slice(
    source.indexOf("name: 'Misc settings'"),
    source.indexOf("name: 'Toast notifications for guilds'")
  );
  const notificationModeIndex = miscSettings.indexOf("id: 'useNotificationsInstead'");
  const loggerAccessIndex = miscSettings.indexOf("id: 'showOpenLogsButton'");

  assert.ok(notificationModeIndex >= 0);
  assert.ok(notificationModeIndex < loggerAccessIndex);
  assert.deepEqual(
    Array.from(miscSettings.slice(notificationModeIndex, loggerAccessIndex).matchAll(/id: '([^']+)'/g), match => match[1]),
    [
      'useNotificationsInstead',
      'alwaysNotifChannel',
      'alwaysNotifGuild',
      'notifOnlyWhitelist',
      'blockSpamEdit',
      'editSpamThreshold'
    ]
  );
});

test('the BdApi notification setting omits the outdated basic qualifier', () => {
  assert.match(source, /name: 'Use BdApi notifications instead of custom toasts'/);
  assert.doesNotMatch(source, /BdApi basic notifications/i);
});

test('the current changelog covers the polished Help presentation and BdApi wording', () => {
  assert.match(source, /Filter Help and Logger Help now use clearer nested spacing, visible filter syntax, and consistent On\/Off state labels/);
  assert.match(source, /accurate BdApi notifications wording without the outdated basic qualifier/);
  assert.match(source, /guild-only local-user toast option now uses its correct Guild settings location/);
  assert.match(source, /always loads saved history, keeps new additions memory-only, and writes archival record, edit, clear-log, cap, and thread\/forum removals through/);
});

test('settings documentation retains audited group order and current UI labels', () => {
  let previousSection = -1;
  for (const section of [
    '## 🚫 Ignores and Overrides',
    '## 🎨 Display Settings',
    '## 🧰 Misc Settings',
    '## 🔔 Toast Notifications',
    '## 🛡️ Anti Nuke',
    '## 📏 Message Caps',
    '## 🔧 Advanced',
    '## 🐞 Debug'
  ]) {
    const sectionIndex = settingsDocs.indexOf(section);
    assert.ok(sectionIndex > previousSection, `${section} is missing or out of order`);
    previousSection = sectionIndex;
  }

  for (const label of [
    'Show oldest edit instead of newest if over the shown edits limit',
    'Use background instead of text tint for deleted messages',
    'Show amount of new deleted messages when entering a channel',
    'Show amount of new edited messages when entering a channel',
    "Auto backup data (won't fully prevent losing data, just prevent total data loss)",
    'Add user id to saved media filename',
    'Max cache file size (MB, 0 = no limit)',
    'Media cache path (optional)',
    'Use BdApi notifications instead of custom toasts',
    'Block spam edit notifications (if enabled)',
    'Display open logs button next to the search box top right in channels',
    'Disable toasts for local user (yourself)'
  ]) {
    assert.ok(settingsDocs.includes(`| ${label} |`), `${label} is missing from the settings reference`);
  }

  assert.match(settingsDocs, /Obfuscate CSS classes \| On \|[^\n]*restarts MessageLogger by temporarily disabling and re-enabling it[^\n]*\*\*No\*\*[^\n]*leaves the setting unchanged/);
  assert.match(settingsDocs, /Automatic updates \| On \|[^\n]*offers \*\*Update Now\*\*/);
  assert.match(settingsDocs, /Delete cached files with log records \| Off \|[^\n]*pauses while \*\*Disable loading archived data\*\* is active/);
});

test('update-note visibility sits directly below automatic updates', () => {
  const advancedSettings = source.slice(
    source.indexOf("name: 'Advanced'"),
    source.indexOf("id: 'ml2-settings-debug'")
  );
  const automaticUpdatesIndex = advancedSettings.indexOf("id: 'autoUpdate'");
  const contextMenuIndex = advancedSettings.indexOf("id: 'contextmenuSubmenuName'");

  assert.ok(automaticUpdatesIndex >= 0);
  assert.ok(automaticUpdatesIndex < contextMenuIndex);
  assert.deepEqual(
    Array.from(advancedSettings.slice(automaticUpdatesIndex, contextMenuIndex).matchAll(/id: '([^']+)'/g), match => match[1]),
    ['autoUpdate', 'displayUpdateNotes']
  );
});

test('settings dependencies match the approved master controls', () => {
  const settingsConfig = source.slice(
    source.indexOf('const settingsConfig = ['),
    source.indexOf('const actions = {', source.indexOf('const settingsConfig = ['))
  );
  const links = Array.from(
    settingsConfig.matchAll(/id: '([^']+)',\n\s+enableWith: '([^']+)'/g),
    match => [match[1], match[2]]
  );

  assert.deepEqual(links, [
    ['showDeletedMessages', 'restoreDeletedMessages'],
    ['showPurgedMessages', 'restoreDeletedMessages'],
    ['maxShownEdits', 'showEditedMessages'],
    ['hideNewerEditsFirst', 'showEditedMessages'],
    ['useAlternativeDeletedStyle', 'restoreDeletedMessages'],
    ['dontLoadArchivedData', 'dontSaveData'],
    ['autoBackupIntervalSeconds', 'autoBackup'],
    ['addUserIdToSavedMediaFilename', 'cacheAllImages'],
    ['newSaveAllFileTypes', 'cacheAllImages'],
    ['maxCacheFileSize', 'cacheAllImages'],
    ['editSpamThreshold', 'blockSpamEdit'],
    ['antiNukeToasts', 'antiNukeEnabled'],
    ['antiNukeThreadCap', 'antiNukeEnabled'],
    ['antiNukeMessageCap', 'antiNukeEnabled'],
    ['antiNukeAttachmentCap', 'antiNukeEnabled']
  ]);
  assert.doesNotMatch(settingsConfig, /id: 'ignoreLocalEdits',[\s\S]{0,80}(?:enableWith|disableWith):/);
  assert.doesNotMatch(settingsConfig, /id: 'newCacheAllImagesPath',[\s\S]{0,80}(?:enableWith|disableWith):/);
  assert.doesNotMatch(settingsConfig, /id: 'deletedMessageColor',[\s\S]{0,80}(?:enableWith|disableWith):/);
});

test('linked master notes use bold semantic On and Off labels', () => {
  const plugin = createPlugin();
  const note = plugin.createLinkedSettingNote('Enables linked controls.', 'Disables linked controls.');
  const children = note.props.children;
  const stateLabels = children.filter(child => child?.type === 'strong');

  assert.equal(note.type, 'span');
  assert.deepEqual(stateLabels.map(label => label.props.children[0]), ['On', 'Off']);
  assert.deepEqual(stateLabels.map(label => label.props.style.color), [
    'var(--status-positive)',
    'var(--status-danger)'
  ]);
  assert.equal(
    children.map(child => typeof child === 'string' ? child : child.props.children.join('')).join(''),
    'On: Enables linked controls. Off: Disables linked controls.'
  );

  const settingsConfig = source.slice(
    source.indexOf('const settingsConfig = ['),
    source.indexOf('const actions = {', source.indexOf('const settingsConfig = ['))
  );
  assert.equal((settingsConfig.match(/note: this\.createLinkedSettingNote\(/g) || []).length, 6);
  for (const masterId of [
    'restoreDeletedMessages',
    'showEditedMessages',
    'autoBackup',
    'cacheAllImages',
    'blockSpamEdit',
    'antiNukeEnabled'
  ]) {
    const idIndex = settingsConfig.indexOf(`id: '${masterId}'`);
    assert.notEqual(idIndex, -1, `${masterId} setting was not found`);
    assert.match(
      settingsConfig.slice(Math.max(0, idIndex - 700), idIndex),
      /note: this\.createLinkedSettingNote\(/,
      `${masterId} must use the linked master note helper`
    );
  }
});

test('all rich UI state labels share the native positive and danger colors', () => {
  const plugin = createPlugin();
  const onLabel = plugin.createSettingStateLabel(true);
  const offLabel = plugin.createSettingStateLabel(false);

  assert.equal(onLabel.type, 'strong');
  assert.equal(onLabel.props.children[0], 'On');
  assert.equal(onLabel.props.style.color, 'var(--status-positive)');
  assert.equal(offLabel.type, 'strong');
  assert.equal(offLabel.props.children[0], 'Off');
  assert.equal(offLabel.props.style.color, 'var(--status-danger)');
  assert.equal(
    plugin.formatHelpStateLabel(true),
    '<strong style="color: var(--status-positive);">On</strong>'
  );
  assert.equal(
    plugin.formatHelpStateLabel(false),
    '<strong style="color: var(--status-danger);">Off</strong>'
  );
  assert.equal((source.match(/Legacy control locked ',\s*this\.createSettingStateLabel\(true\)/g) || []).length, 2);
});

test('date order applies to optional timestamps and forced logger dates', () => {
  const date = new Date(2026, 2, 4, 15, 43, 15);
  const time = date.toLocaleTimeString();
  const plugin = createPlugin({ settings: { displayDates: true, dateFormat: 'D/M/YYYY' } });

  assert.equal(plugin.getLocaleDateFormatPattern('en-AU'), 'DD/MM/YYYY');
  assert.equal(plugin.getLocaleDateFormatPattern('en-US'), 'M/D/YYYY');
  assert.equal(plugin.getLocaleDateFormatPattern('ja-JP'), 'YYYY/M/D');
  assert.equal(plugin.normalizeDateLocaleCandidate('en_AU.UTF-8'), 'en-AU');
  assert.equal(plugin.normalizeDateLocaleCandidate('not-a-locale'), null);
  assert.equal(plugin.createTimeStamp(date), `${time} - 4/3/2026`);
  plugin.settings.dateFormat = 'DD/MM/YY';
  assert.equal(plugin.createTimeStamp(date), `${time} - 04/03/26`);
  plugin.settings.dateFormat = 'YYYY/MM/DD';
  assert.equal(plugin.createTimeStamp(date), `${time} - 2026/03/04`);

  plugin.settings.displayDates = false;
  assert.equal(plugin.createTimeStamp(date), time);
  assert.equal(plugin.createTimeStamp(date, true), `${time} - 2026/03/04`);

  const defaults = readDefaultSettings();
  for (const invalidValue of ['', 'invalid', null, 123, 'dd/MM/yyyy', 'DD-MM-YYYY', 'D/D/YYYY', 'D/M/Y']) {
    const invalid = { ...defaults, dateFormat: invalidValue };
    assert.equal(plugin.normalizeSettingsAgainstDefaults(invalid, defaults), true);
    assert.equal(invalid.dateFormat, 'M/D/YYYY');
  }
  assert.equal(plugin.normalizeDateFormatSetting('locale', 'DD/MM/YYYY'), 'DD/MM/YYYY');
  assert.equal(plugin.normalizeDateFormatSetting('DMY'), 'D/M/YYYY');
  assert.equal(plugin.normalizeDateFormatSetting('MDY'), 'M/D/YYYY');
  assert.equal(plugin.normalizeDateFormatSetting('YMD'), 'YYYY/M/D');
  for (const validValue of ['D/M/YY', 'DD/MM/YYYY', 'M/DD/YYYY', 'YYYY/MM/DD', 'YY/M/D']) {
    assert.deepEqual(plugin.validateDateFormatValue(validValue), { valid: true, value: validValue });
  }

  const displaySettings = source.slice(
    source.indexOf("name: 'Display settings'"),
    source.indexOf("name: 'Misc settings'")
  );
  assert.match(displaySettings, /name: 'Display dates with timestamps'[\s\S]*name: 'Date format'[\s\S]*type: 'textbox'[\s\S]*validator: 'dateFormat'[\s\S]*inlineValidation: true/);
  assert.match(source, /loadPreferredSystemDateLocales\(\)[\s\S]*DiscordNative\?\.app\?\.getPreferredSystemLanguages[\s\S]*getSystemDateLocale\(\)[\s\S]*DiscordModules\.SystemLocaleUtils[\s\S]*DiscordModules\.LocaleStore\?\.locale[\s\S]*navigator\.languages/);
  assert.match(source, /createInlineValidatedDateFormatInput\(config, onValid\)[\s\S]*Preview:[\s\S]*placeholder: defaultFormat[\s\S]*aria-invalid[\s\S]*var\(--status-danger\)/);
  assert.match(source, /const detailSuffix = ` - \$\{this\.createTimeStamp\(timestamp, true\)\}`/);
  assert.match(source, /DeletedContentTooltip[\s\S]*`Deleted: \$\{plugin\.createTimeStamp\(deletedAt\)\}`/);
  const deletedTooltip = source.slice(
    source.indexOf('const DeletedContentTooltip'),
    source.indexOf("DeletedContentTooltip.displayName = 'DeletedContentTooltip'")
  );
  assert.match(deletedTooltip, /block = false[\s\S]*React\.createElement\('div',[\s\S]*width: '100%'/);
  assert.match(deletedTooltip, /React\.createElement\('span', tooltipProps, children\)/);
  assert.doesNotMatch(deletedTooltip, /display:\s*['"]contents['"]/);
  assert.match(source, /text: 'Edited: ' \+ plugin\.createTimeStamp\(edit\.time\)[\s\S]*const currentContent = currentRecord\.delete_data\?\.time[\s\S]*deletedAt: currentRecord\.delete_data\.time,[\s\S]*block: true/);
  assert.doesNotMatch(source, /text: record\.delete_data \? null : 'Edited: '/);
  const editHistoryGate = source.slice(
    source.indexOf('const EditHistoryContent ='),
    source.indexOf("EditHistoryContent.displayName = 'EditHistoryContent'")
  );
  assert.match(editHistoryGate, /shouldPresentEditedMessages\(\)[\s\S]*return renderOriginal\(\)/);
  assert.match(editHistoryGate, /renderOriginal[\s\S]*DeletedContentTooltip[\s\S]*originalElement/);
  assert.match(editHistoryGate, /renderEdited[\s\S]*React\.cloneElement\([\s\S]*originalElement/);
  assert.match(source, /if \(record\?\.edit_history && Array\.isArray\(ret\.props\.children\)\)[\s\S]*return React\.createElement\(EditHistoryContent,[\s\S]*originalElement: ret/);
  assert.doesNotMatch(source, /if \(showEditHistory\)/);
  assert.doesNotMatch(source, /const deletedChildren = ret\.props\.children\.slice\(\)/);
});

test('native preferred system languages are normalized before date defaults initialize', async () => {
  const originalDiscordNative = globalThis.DiscordNative;
  globalThis.DiscordNative = {
    app: {
      async getPreferredSystemLanguages() {
        return ['en_AU.UTF-8', 'en-AU', 'ja-JP'];
      }
    }
  };
  try {
    const plugin = createPlugin();
    assert.deepEqual(await plugin.loadPreferredSystemDateLocales(), ['en-AU', 'ja-JP']);
    assert.equal(plugin.getSystemDateLocale(), 'en-AU');
    assert.equal(plugin.getLocaleDateFormatPattern(), 'DD/MM/YYYY');
  } finally {
    if (originalDiscordNative === undefined) delete globalThis.DiscordNative;
    else globalThis.DiscordNative = originalDiscordNative;
  }
  assert.match(source, /start\(\)[\s\S]*_startupPending[\s\S]*await this\.loadPreferredSystemDateLocales\(\)[\s\S]*_startupGeneration !== startupGeneration/);
});

test('channel-entry count toggles clear pending state through category-owned actions', () => {
  assert.match(source, /name: 'Show amount of new deleted messages when entering a channel'[\s\S]*id: 'showDeletedCount'[\s\S]*action: 'toggleDeletedCount'/);
  assert.match(source, /name: 'Show amount of new edited messages when entering a channel'[\s\S]*id: 'showEditedCount'[\s\S]*action: 'toggleEditedCount'/);
  assert.match(source, /toggleDeletedCount: \(enabled\) => this\._handleMessageCountToggle\('deleted', enabled\)/);
  assert.match(source, /toggleEditedCount: \(enabled\) => this\._handleMessageCountToggle\('edited', enabled\)/);
  assert.match(source, /_handleMessageCountToggle\(counterType, enabled\)[\s\S]*if \(enabled\) return false;[\s\S]*Object\.values\(counters\)\.some\(count => Number\(count\) > 0\)[\s\S]*this\[config\.mapName\] = \{\};[\s\S]*if \(!hadPendingCounts\) return false;/);
  assert.match(source, /_incrementMessageCount\(counterType, channel, guild, amount = 1\)[\s\S]*channel-entry counter increased to \$\{total\} \(\+\$\{increment\}\) for \$\{location\}/);
  assert.match(source, /_incrementMessageCount\('deleted', channel, guild, savedDeleteCount\)/);
  assert.match(source, /_incrementMessageCount\('edited', channel, guild\)/);
  const entryAlerts = source.slice(
    source.indexOf('observer({ addedNodes })'),
    source.indexOf('createSetting(data)')
  );
  assert.match(entryAlerts, /const showStuff = \(map, name\) =>[\s\S]*\[\{ label: "View", onClick: \(\) => this\.openWindow\(name\) \}\]/);
  assert.doesNotMatch(entryAlerts, /label: ["']Jump/);
});

test('native BetterDiscord keybind recorders drive capture-phase logger shortcuts', () => {
  assert.match(source, /name: 'Toggle all logs keybind'[\s\S]*?id: 'openLogsKeybind'[\s\S]*?type: 'keybind'[\s\S]*?validator: 'loggerKeybind'[\s\S]*?max: 4[\s\S]*?clearable: true/);
  assert.match(source, /name: 'Toggle selected channel logs keybind'[\s\S]*?id: 'openFilteredLogsKeybind'[\s\S]*?type: 'keybind'[\s\S]*?validator: 'loggerKeybind'[\s\S]*?max: 4[\s\S]*?clearable: true/);
  assert.match(source, /name: 'Toggle selected server logs keybind'[\s\S]*?id: 'openServerLogsKeybind'[\s\S]*?type: 'keybind'[\s\S]*?validator: 'loggerKeybind'[\s\S]*?max: 4[\s\S]*?clearable: true/);
  const recorder = source.slice(source.indexOf('createValidatedLoggerKeybindRecorder(config)'), source.indexOf('normalizeAutoBackupIntervalSeconds(value)'));
  assert.match(recorder, /Components\.KeybindInput/);
  assert.match(recorder, /plugin\._pressedShortcutKeys\?\.clear\?\.\(\)/);
  assert.match(recorder, /plugin\.validateLoggerKeybind\(capturedValue, config\.id\)/);
  assert.match(recorder, /setRevision\(current => current \+ 1\)/);
  assert.match(recorder, /color: 'var\(--status-danger\)'/);
  assert.match(source, /document\.addEventListener\('keydown', this\.shortcutKeydownListener, true\)/);
  assert.match(source, /document\.addEventListener\('keyup', this\.shortcutKeyupListener, true\)/);
  assert.match(source, /document\.removeEventListener\('keydown', this\.shortcutKeydownListener, true\)/);
  assert.match(source, /document\.removeEventListener\('keyup', this\.shortcutKeyupListener, true\)/);
  assert.match(source, /window\.addEventListener\('blur', this\.shortcutBlurListener\)/);
  assert.match(source, /window\.removeEventListener\('blur', this\.shortcutBlurListener\)/);
  assert.match(source, /this\.ensureLoggerKeybindSettings\(this\.settings, defaultSettings\)/);
  const shortcutFlow = source.slice(
    source.indexOf('cancelPendingLoggerShortcutTransition()'),
    source.indexOf('ensureRequiredLegacySettings(settings = this.settings)')
  );
  assert.match(shortcutFlow, /alreadyInDesiredState[\s\S]*hasAuxiliaryModal[\s\S]*scheduleLoggerShortcutReopen/);
  assert.match(shortcutFlow, /scope === 'server'[\s\S]*getSelectedGuildId[\s\S]*`server:\$\{selectedGuildId\}`/);
  assert.match(source, /`Open Log For Server`[\s\S]*this\.menu\.filter = `server:\$\{guildId\}`/);
  assert.match(source, /getSelectedGuildId\(\)[\s\S]*if \(selectedChannelId\) return selectedChannel\?\.guild_id \|\| null;[\s\S]*SelectedGuildStore/);
  assert.match(shortcutFlow, /getOpenLoggerOwnedModalKeys\(\)[\s\S]*\.reverse\(\)[\s\S]*closeModal/);
  assert.match(shortcutFlow, /getOpenNativeMediaViewerModalKey[\s\S]*closeModal/);
  assert.match(source, /_nativeMediaModal = \{ openMediaModal: openerFunc, modalKey, module \}/);
  assert.match(shortcutFlow, /_loggerShortcutTransitionId[\s\S]*_loggerShortcutReopenTimeout/);
  assert.doesNotMatch(shortcutFlow, /closeAllModals|LAYER_POP_ALL|MODAL_POP_ALL/);
  assert.ok((source.match(/trackLoggerOwnedModalKey\(modalKey, name\)/g) || []).length >= 4);
});

test('native and cloned Trash actions remain scoped to indexed logger deletions', () => {
  assert.match(source, /Patcher\.instead\(DiscordModules\.MessageActions, 'deleteMessage',[\s\S]*processNativeMessageDeleteAction\(args, original\)/);
  assert.match(source, /processNativeMessageDeleteAction\(args, original\)[\s\S]*isThreadCreatedSystemMessage\(message\)[\s\S]*handleNativeSavedRecordDelete\(channelId, messageId\)[\s\S]*Promise\.resolve\(\)[\s\S]*original\(\.\.\.args\)/);
  assert.match(source, /isIndexedSavedDeletedRecord\(record, messageId\)[\s\S]*deletedMessageSet[\s\S]*purgedMessageSet[\s\S]*nukedMessageSet[\s\S]*deletedMessageRecord[\s\S]*purgedMessageRecord[\s\S]*nukedMessageRecord/);
  assert.match(source, /inspectNativeDestructiveMessageCandidate\(candidate\)[\s\S]*memoizedProps[\s\S]*dangerous === true/);
  assert.match(source, /inspectNativeDeleteCandidate\(candidate\)[\s\S]*inspectNativeDestructiveMessageCandidate[\s\S]*2\.81h8\.36a3[\s\S]*!isTrashIcon/);
  assert.match(source, /MessageToolbarClasses: lazyGet[\s\S]*messageListItem[\s\S]*buttons/);
  assert.match(source, /getNativeDeleteToolbarClass\(\)[\s\S]*DiscordModules\.MessageToolbarClasses/);
  assert.match(source, /getNativeMessageToolbarNodes\(root = document\)[\s\S]*ancestor\.classList[\s\S]*getElementsByClassName/);
  assert.match(source, /getNativeMessageToolbarActionRow\(toolbar\)[\s\S]*lowest shared native-action ancestor[\s\S]*candidates\.every/);
  assert.match(source, /captureNativeDeleteButtonPresentation\(root = document\)[\s\S]*inspectNativeDeleteCandidate/);
  const copiedControl = source.slice(
    source.indexOf('createCopiedNativeDeleteControl(record, options = {})'),
    source.indexOf('cleanupCopiedNativeDeleteControls(rootNode')
  );
  assert.match(copiedControl, /Components\.Tooltip/);
  assert.match(copiedControl, /data-ml2-remove-from-log/);
  assert.match(copiedControl, /handleCopiedNativeDeleteActivation\(event, message\.channel_id, message\.id\)/);
  assert.match(source, /handleCopiedNativeDeleteActivation\(event, channelId, messageId\)[\s\S]*stopPropagation[\s\S]*requestSavedDeletedRecordRemoval\(channelId, messageId, !!event\.shiftKey\)/);
  assert.match(source, /TrashIcon: lazyGet[\s\S]*getNativeDeleteIconComponent\(\)/);
  assert.match(source, /resolveNativeDeleteIconExport\(icon\)[\s\S]*Object\.values\(icon\)[\s\S]*callableExports\.length === 1/);
  assert.doesNotMatch(source, /Remove From Log/);
  assert.match(source, /shiftDeleteActive = this\.obfuscatedClass\('MLv2-shift-delete-active'\)/);
  assert.match(source, /html\.\$\{this\.style\.shiftDeleteActive\} #app-mount \.\$\{this\.style\.restoredForumCard\}:hover > \.\$\{this\.style\.restoredDeleteButton\}/);
  assert.match(source, /restoredDeleteButton},[\s\S]*restoredDeleteButton} button,[\s\S]*restoredDeleteButton} \[role="button"\],[\s\S]*color: var\(--text-feedback-critical, var\(--status-danger\)\) !important/);
  assert.match(source, /restoredDeleteButton} path[\s\S]*fill: var\(--text-feedback-critical, var\(--status-danger\)\) !important/);
  assert.match(source, /restoredInlineDeleteButton}[\s\S]*display: none !important[\s\S]*shiftDeleteActive[\s\S]*display: flex !important/);
  assert.match(copiedControl, /document\.createElement\(options\.inline && presentation \? tagName : 'div'\)/);
  assert.match(copiedControl, /options\.inline && presentation\?\.className/);
  assert.match(copiedControl, /host\.setAttribute\('title', presentation\.label\)/);
  assert.match(copiedControl, /host\.addEventListener\('click', activate\)/);
  assert.match(source, /restoredThreadEntry} > \.\$\{this\.style\.restoredDeleteButton}[\s\S]*top: 50% !important[\s\S]*translateY\(-50%\)/);
  assert.match(source, /restoredThreadEntry} > \.\$\{this\.style\.restoredDeleteButton} button,[\s\S]*box-sizing: border-box !important[\s\S]*height: 24px[\s\S]*width: 24px/);
  assert.match(source, /restoredThreadBrowserCard} > \.\$\{this\.style\.restoredDeleteButton}[\s\S]*translate\(8px, -50%\)/);
  assert.match(source, /restoredThreadEntry} > \.\$\{this\.style\.restoredDeleteButton} svg[\s\S]*height: 16px[\s\S]*width: 16px/);
  assert.match(source, /restoredThreadBrowserCard} > \.\$\{this\.style\.restoredDeleteButton} svg[\s\S]*height: 20px[\s\S]*width: 20px/);
  assert.doesNotMatch(source, /html #app-mount \.\$\{this\.style\.restoredForumCard\}:hover > \.\$\{this\.style\.restoredDeleteButton\}/);
  assert.match(source, /if \(e\.key === 'Shift'\) \{[\s\S]*setRestoredDeleteShiftActive\(true\)/);
  assert.match(source, /if \(e\.key === 'Shift'\) this\.setRestoredDeleteShiftActive\(!!e\.shiftKey\)/);
  assert.match(source, /shortcutBlurListener = \(\) => \{[\s\S]*setRestoredDeleteShiftActive\(false\)/);
  assert.match(source, /wireNativeRestoredMessageDeleteControl[\s\S]*isIndexedSavedDeletedRecord\(record, messageId\)[\s\S]*nativeDeletePresent[\s\S]*existing\.parentElement !== actionRow[\s\S]*const replacement = this\.createCopiedNativeDeleteControl\(record, \{ inline: true \}\)[\s\S]*actionRow\.appendChild\(replacement\)[\s\S]*cleanupCopiedNativeDeleteControls\(existing\)[\s\S]*existing\.remove\(\)[\s\S]*getNativeMessageToolbarActionRow\(toolbar\)\.appendChild\(control\)/);
  assert.match(source, /shouldAddPermissionIndependentContextDelete\(record, messageId, channelId, nativeDeletePresent = false\)[\s\S]*isIndexedSavedDeletedRecord\(record, messageId\)/);
  assert.match(source, /id: 'mlv2-delete-saved-record'[\s\S]*danger: true[\s\S]*requestSavedDeletedRecordRemoval\(channelId, messageId, false\)/);
  const loggerSubmenuRecords = source.slice(
    source.indexOf('const addSavedRecordItems ='),
    source.indexOf("this.unpatches.push(ContextMenu.patch('message'")
  );
  assert.match(loggerSubmenuRecords, /requestSavedDeletedRecordRemoval\(channelId, messageId, true, 'Message Logger submenu Delete'\)/);
  assert.doesNotMatch(loggerSubmenuRecords, /requestSavedDeletedRecordRemoval\(channelId, messageId, false\)/);
  assert.match(source, /requestSavedDeletedRecordRemoval\(channelId, messageId, immediate = false, immediateSource = 'Shift-click Trash'\)[\s\S]*source: immediateSource/);
  assert.doesNotMatch(source, /restoredDeleteButton[\s\S]{0,1000}innerHTML\s*=\s*['"]<svg/);
  assert.match(source, /removeSavedDeletedRecordFromLog\(channelId, messageId[\s\S]*deleteMessageFromRecords\(id\)[\s\S]*ML2: true/);
});

test('restored forum and thread previews use native parsed markup', () => {
  const restoredPreviews = source.slice(
    source.indexOf('const appendRestoredPreviewMarkup ='),
    source.indexOf('const restoreDeletedThreadBrowserCards =')
  );
  assert.match(restoredPreviews, /appendRestoredPreviewMarkup[\s\S]*this\.formatMarkup\(preview, channelId\)/);
  assert.match(restoredPreviews, /formatted\.style\.display = 'contents'/);
  assert.match(restoredPreviews, /appendRestoredPreviewMarkup\(content, message\.content \|\| titleText, message\.channel_id\)/);
  assert.match(restoredPreviews, /appendRestoredPreviewMarkup\(subtext, getForumRecordPreview\(record\), record\.message\.channel_id\)/);
  assert.doesNotMatch(restoredPreviews, /content\.textContent = message\.content/);
  assert.doesNotMatch(restoredPreviews, /subtext\.textContent = `\$\{record\.message\.author/);
});

test('restored forum cards and compact threads mount from visible Deleted or Purged roots', () => {
  const rootSelection = source.slice(
    source.indexOf('const getVisibleRestorableThreadRootIds ='),
    source.indexOf('const copyClass =')
  );
  assert.match(rootSelection, /const rootIds = new Set\(\)/);
  assert.match(rootSelection, /shouldPresentDeletedMessages\(\)\) collect\(this\.deletedMessageRecord\)/);
  assert.match(rootSelection, /shouldPresentPurgedMessages\(\)\) collect\(this\.purgedMessageRecord\)/);
  assert.match(rootSelection, /getRestorableForumRecordsForChannel[\s\S]*getVisibleRestorableThreadRootIds\(\)/);
  assert.match(rootSelection, /getRestorableCompactThreadRecords[\s\S]*getVisibleRestorableThreadRootIds\(\)/);
  assert.match(rootSelection, /forum_thread_delete \|\| record\.delete_data\.hidden \|\| !message/);
  assert.match(source, /canRestoreVisibleThreadRoots[\s\S]*shouldPresentAnySavedDeletion\(\)/);
  assert.match(source, /restoreDeletedForumCards[\s\S]*desiredIds[\s\S]*data-ml2-restored-forum-card[\s\S]*target\.remove\?\.\(\)/);
  assert.match(source, /restoreDeletedSidebarThreads[\s\S]*getRestorableCompactThreadRecords\(parent\)/);
  assert.match(source, /restoreDeletedThreadBrowserCards[\s\S]*getRestorableCompactThreadRecords\(parent\)/);
  assert.match(source, /shouldTintMessage = \(channelId, messageId\) => \{[\s\S]*shouldPresentSavedMessage\(channelId, messageId\)/);
  assert.match(source, /applyRestoredThreadTint[\s\S]*shouldPresentSavedMessage\(threadId, threadId\)/);
  assert.match(source, /shouldPresentDeletedMessages\(\)[\s\S]*restoreDeletedMessages[\s\S]*showDeletedMessages/);
  assert.match(source, /shouldPresentPurgedMessages\(\)[\s\S]*restoreDeletedMessages[\s\S]*showPurgedMessages/);
  assert.match(source, /tintMessageById[\s\S]*shouldTintMessage\(channelId, messageId\)[\s\S]*clearTintClasses\(article\)/);
});

test('surviving forum and thread cards tint only their deleted preview body', () => {
  const previewTint = source.slice(
    source.indexOf('const getForumPreviewTextTarget ='),
    source.indexOf('const addTintClass =')
  );
  assert.match(previewTint, /message-content-\$\{messageId\}/);
  assert.match(previewTint, /messageFocusBlock_[\s\S]*messageContent_/);
  assert.doesNotMatch(previewTint, /postTitleText_|data-text-variant|querySelector\([^\n]*h3/);
  assert.match(previewTint, /tintNativeThreadBrowserPreviewContent[\s\S]*\^message-content-\(\\d\+\)\$/);
  assert.match(previewTint, /closest\?\.\('div\[role="button"\]'\)[\s\S]*h2 \[class\*="threadName_"\]/);
  assert.match(previewTint, /input\[placeholder="Search for Thread Name"\]/);
  assert.match(previewTint, /clearTintClasses\(card\);[\s\S]*shouldTintPreview[\s\S]*clearForumTextTint\(card\);[\s\S]*target !== content[\s\S]*addForumTextTint\(card, messageId\)/);
  assert.match(previewTint, /Original message was deleted/);
  assert.match(previewTint, /_nativeDeletedForumPreviewText/);
  assert.match(previewTint, /tintNativeDeletedThreadHeaderPlaceholders[\s\S]*\^chat-messages-\(\\d\+\)-\(\\d\+\)\$/);
  assert.match(previewTint, /match\[1\] !== match\[2\][\s\S]*node\.children\.length === 0/);
  assert.match(source, /scheduleTintForMessage[\s\S]*tintNativeThreadBrowserPreviewByMessageId\(messageId\)/);
  assert.match(source, /tintNativeDeletedForumPlaceholders\(document\)/);
  assert.match(source, /tintNativeDeletedThreadHeaderPlaceholders\(document\)/);
  assert.match(source, /createRestoredThreadBrowserCard[\s\S]*card\.classList\.add\(this\.style\.deleted\)/);
});

test('logger location titles reserve warning color for structurally deleted roots', () => {
  const createGroup = source.slice(
    source.indexOf('createMessageGroup(message, isStart)'),
    source.indexOf('const messageContext = e =>')
  );
  assert.match(createGroup, /highlightThreadPath = !!\(forumLocationParts && record\?\.delete_data\?\.forum_thread_delete\)/);
  assert.doesNotMatch(createGroup, /starterMessageId|isThreadStarterLogMessage/);
});

test('ordinary and Anti-Nuke roots share the de-duplicated missing-starter fallback', () => {
  const fallback = source.slice(
    source.indexOf('createForumThreadDeleteFallbackMessage(channel)'),
    source.indexOf('scheduleForumListRefresh()')
  );
  const ordinaryDelete = source.slice(
    source.indexOf('handleForumThreadDelete(channel, guild, callDefault, args)'),
    source.indexOf('_testUrlPattern(url, regex)')
  );
  const antiNukeCapture = source.slice(
    source.indexOf('captureThreadFromDeletedChannel(channel, context, snapshot = null)'),
    source.indexOf('captureQueuedThreadsFromDeletedChannel(context)')
  );
  const localRemoval = source.slice(
    source.indexOf('\n  removeSavedDeletedRecordFromLog(channelId, messageId, options = {})'),
    source.indexOf('\n  handleNativeSavedRecordDelete(channelId, messageId)')
  );

  assert.match(fallback, /content: this\.getMissingForumThreadContentPlaceholder\(\)/);
  assert.doesNotMatch(fallback, /content: metadata\.starterContent|content: metadata\.card\?\.preview/);
  assert.match(source, /const forumStarterMessage = isForumParent[\s\S]*starterMessage\?\.id[\s\S]*threadId[\s\S]*starterMessageId: forumStarterMessage\?\.id/);
  assert.match(ordinaryDelete, /promoteOldestSavedThreadReplyIntoRoot\(threadId\)/);
  assert.match(antiNukeCapture, /promoteOldestSavedThreadReplyIntoRoot\(channel\.id\)/);
  assert.match(fallback, /record\.delete_data \|\| record\.edit_history \|\| record\.ghost_pinged/);
  assert.doesNotMatch(fallback, /!record\.delete_data\.hidden/);
  assert.match(fallback, /replaceContextWithRootInIndex[\s\S]*remaining\.push\(rootId\)[\s\S]*purgedMessageRecord/);
  assert.match(localRemoval, /cachedMessagesMap\?\.delete\?\.\(id\)/);
});

test('Anti-Nuke remains an orchestration wrapper around canonical logging helpers', () => {
  const captureWrapper = source.slice(
    source.indexOf('saveDeletedChannelCaptureMessage(message, targetMap, context, options = {})'),
    source.indexOf('captureThreadFromDeletedChannel(channel, context, snapshot = null)')
  );
  const threadCapture = source.slice(
    source.indexOf('captureThreadFromDeletedChannel(channel, context, snapshot = null)'),
    source.indexOf('captureQueuedThreadsFromDeletedChannel(context)')
  );

  assert.match(captureWrapper, /this\.saveDeletedMessage\(capturedMessage, targetMap, \{ captureBatch: context\.captureBatch \}\)/);
  assert.doesNotMatch(captureWrapper, /this\.createMiniFormattedData\(/);
  assert.match(threadCapture, /this\.foldSavedThreadStarterIntoRoot\(channel\.id\)/);
  assert.match(threadCapture, /this\.promoteOldestSavedThreadReplyIntoRoot\(channel\.id\)/);
  assert.match(source, /createDeletedChannelCaptureContext\(channel, guild\)[\s\S]*captureBatch: this\.createSavedEventBatch\('nuke', channel\.id\)/);
  const bulkDelete = source.slice(
    source.indexOf("dispatch.type == 'MESSAGE_DELETE_BULK'"),
    source.indexOf("dispatch.type == 'MESSAGE_UPDATE'", source.indexOf("dispatch.type == 'MESSAGE_DELETE_BULK'"))
  );
  assert.match(bulkDelete, /const captureBatch = this\.createSavedEventBatch\('purge', channel\.id\)/);
  assert.match(bulkDelete, /this\.saveDeletedMessage\(purged, this\.purgedMessageRecord, \{ captureBatch \}\)/);
});

test('logger jump-availability tint stays scoped to the logger window', () => {
  assert.match(source, /style\.jumpAvailableAuthor = this\.obfuscatedClass\('ml2-jump-available-author'\)/);
  assert.match(source, /#app-mount \.\$\{this\.style\.menuRoot\} \.\$\{this\.style\.jumpAvailableAuthor\}[\s\S]*color: var\(--text-warning, var\(--status-warning\)\) !important/);
  assert.doesNotMatch(source, /#app-mount \.\$\{this\.style\.jumpAvailableAuthor\}\s*\{/);
  assert.match(source, /canJumpToSavedRecord\(record\)[\s\S]*this\.isSavedRecordHidden\(record\)/);
  assert.match(source, /canJumpToSavedRecord\(record, presentationCategory = null\)[\s\S]*record\.delete_data && !this\.shouldPresentSavedMessage\(message\.channel_id, message\.id\)/);
  assert.match(source, /canJumpToSavedRecord\(record, presentationCategory = null\)[\s\S]*record\.edit_history[\s\S]*!this\.shouldPresentEditedMessages\(\)/);
  assert.match(source, /canJumpToSavedRecord\(jumpRecord, jumpMountCategory\)/);
  assert.match(source, /pendingDeletionPresentation[\s\S]*presentationCategory === 'deleted'[\s\S]*presentationCategory === 'purged'/);
  assert.match(source, /eventType === 'sent'[\s\S]*this\.messageRecord\?\.\[messageId\][\s\S]*this\.jumpToSavedRecord\(currentRecord\)/);
  assert.match(source, /jumpToSavedRecord\(record\)[\s\S]*if \(!this\.canJumpToSavedRecord\(record\)\) return/);
  assert.match(source, /forum_thread_delete\) return this\.hasSavedForumThreadMountPoint\(record, true\)/);
  assert.match(source, /A structurally deleted post\/thread can leave a stale ChannelStore entry behind/);
});

test('logger submenus prefer visible Copy ID rows and retain action fallbacks', () => {
  assert.match(source, /const insertLoggerGroupAt = \(menu, index, loggerSubmenu\) =>[\s\S]*type: 'group'[\s\S]*items: \[loggerSubmenu\]/);
  assert.match(source, /const insertLoggerSubmenuBeforeCopyId = \(menu, loggerSubmenu\) =>/);
  assert.match(source, /menuIdMatches\(id, 'copy-id'\) \|\| id\.startsWith\('devmode-copy-id-'\)/);
  assert.match(source, /\^Copy \(\?:Message\|User\|Channel\|Server\|Guild\) ID\$/);
  assert.match(source, /const copyGroupIndex = menu\.findIndex\(group => menuNodeContains\(group, isVisibleCopyIdItem\)\)/);
  const plugin = createPlugin();
  assert.equal(plugin.isExtendedDestructiveDeleteMenuItem({ props: { label: 'Delete', danger: true } }), false);
  assert.equal(plugin.isExtendedDestructiveDeleteMenuItem({ props: { label: 'Delete Thread', danger: true } }), true);
  assert.equal(plugin.isExtendedDestructiveDeleteMenuItem({ props: { children: 'Delete Forum', color: 'danger' } }), true);
  assert.equal(plugin.isExtendedDestructiveDeleteMenuItem({ props: { label: 'Bulk Delete Posts', className: 'colorDanger_test' } }), true);
  assert.equal(plugin.isExtendedDestructiveDeleteMenuItem({ props: { label: 'Delete Channel' } }), false);
  assert.match(source, /const insertLoggerSubmenuAfterExtendedDelete = \(menu, loggerSubmenu\) =>[\s\S]*menuNodeContains\([\s\S]*isExtendedDestructiveDeleteMenuItem\(item\)[\s\S]*if \(deleteGroupIndex < 0\) return false;[\s\S]*deleteGroupIndex \+ 1/);
  assert.equal(
    (source.match(/if \(insertLoggerSubmenuAfterExtendedDelete\(menu, loggerSubmenu\)\) return;/g) || []).length,
    4
  );
  assert.equal(
    (source.match(/if \(insertLoggerSubmenuBeforeCopyId\(menu, loggerSubmenu\)\) return;/g) || []).length,
    3
  );
  assert.match(source, /if \(guildId && insertLoggerSubmenuBeforeCopyId\(menu, loggerSubmenu\)\) return/);
  assert.match(source, /const insertLoggerSubmenuAfterAnchor = \(menu, loggerSubmenu, anchorIds\) =>/);
  assert.match(source, /return insertLoggerGroupAt\(menu, anchorIndex \+ 1, loggerSubmenu\)/);
  assert.match(source, /const anchorIds = guildId[\s\S]*'server-lockdown'[\s\S]*'leave-guild'[\s\S]*: \[\]/);
  assert.match(source, /const isCurrentUser = props\.user\?\.id === DiscordModules\.UserStore\?\.getCurrentUser\?\.\(\)\?\.id/);
  assert.match(source, /if \(!isCurrentUser && insertLoggerSubmenuAfterAnchor\([\s\S]*\['block', 'report-user', 'report', 'close-dm', 'remove-friend'\]/);
  assert.match(source, /if \(insertLoggerSubmenuAfterAnchor\(menu, loggerSubmenu, anchorIds\)\) return/);
  assert.match(source, /id: 'mlv2-message-logger'[\s\S]*if \(insertLoggerSubmenuBeforeCopyId\(menu, loggerSubmenu\)\) return;[\s\S]*const actionGroup = nativeDeleteGroup/);
});

test('required legacy cache toggles stay visible, locked, and forced on', () => {
  assert.match(source, /if \(this\.ensureRequiredLegacySettings\(\)\) settingsChanged = true;/);
  assert.match(source, /name: 'Aggresive message caching \(makes sure we have the data of any deleted or edited messages\)'[\s\S]*?Legacy control locked ',\s*this\.createSettingStateLabel\(true\),[\s\S]*?id: 'aggresiveMessageCaching'[\s\S]*?disabled: true/);
  assert.match(source, /name: 'Use new cached images system'[\s\S]*?Legacy control locked ',\s*this\.createSettingStateLabel\(true\),[\s\S]*?id: 'newCacheAllImages'[\s\S]*?disabled: true/);

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

test('settings startup repairs existing configs without classifying them as first installs', () => {
  assert.match(source, /loadSettingsConfigForStartup\(defaultSettings\)/);
  assert.match(source, /this\._isFreshSettingsInstall = !startupSettingsConfig\.existed/);
  assert.match(source, /if \(this\._isFreshSettingsInstall && !\(this\.settings\.flags & Flags\.STARTUP_HELP\)\)/);
  assert.match(source, /\$\{this\.getName\(\)\}\.config\.corrupt-backup\.json/);
  assert.match(source, /writeSettingsTextAtomic\(configPath, JSON\.stringify\(result\.envelope, null, 4\)/);
  assert.match(source, /Data\.recache\?\.\(this\.getName\(\)\)/);
});

test('first-install help has one full-width dismiss-only action', () => {
  assert.match(source, /initial[\s\S]*?confirmText: 'OK'[\s\S]*?closeModal\(this\.loggerHelpModalKey\)[\s\S]*?ml2Data: true[\s\S]*?className: this\.style\.startupHelpModal/);
  assert.match(source, /header: initial \? 'First setup' : 'Logger help'/);
  assert.match(source, /\.\$\{this\.style\.startupHelpModal\} footer \[data-mana-component="button"\][\s\S]*?width: 100%/);
  const initialBranch = source.match(/\.\.\.\(initial([\s\S]*?): fromSettings/);
  assert.ok(initialBranch, 'startup help branch was not found');
  assert.doesNotMatch(initialBranch[1], /cancelText: 'Back'|returnToLoggerWindow/);
});

test('first-install help matches the current logging-scope onboarding', () => {
  assert.match(source, /const firstTimeIntroduction = initial\s*\? `<div class="\$\{this\.style\.startupHelpTitle\}">/);
  assert.match(source, /Welcome to MessageLoggerV2/);
  assert.match(source, /New installations start in <strong>whitelist-only mode<\/strong>/);
  assert.match(source, /Right-click a server, channel, DM, or thread/);
  assert.match(source, /Open the <strong>Message Logger<\/strong> submenu/);
  assert.match(source, /Only log whitelist<\/strong> under <strong>Ignores and overrides/);
  assert.match(source, /Always log selected channel<\/strong> and <strong>Always log DMs/);
  assert.match(source, /Cache media locally<\/strong> and <strong>Disable saving data/);
  assert.match(source, /<div class="\$\{this\.style\.textIndent\}">\s*<strong>1\.<\/strong>/);
  assert.doesNotMatch(source, /<strong class="\$\{this\.style\.startupHelpTitle\}">First setup:<\/strong>/);
  assert.doesNotMatch(source, /startupHelpIntro|ml2-startup-help-intro/);
  assert.doesNotMatch(source, /font-size: 40px/);
});

test('logging override notes match their supported thread and ghost-ping scope', () => {
  assert.match(source, /Selecting a parent channel also covers its child threads\./);
  assert.match(source, /ghost pings from edits or individual deletes; bulk purges are not covered\./);
  assert.doesNotMatch(source, /Selected threads also cover their parent channel\./);
});

test('shared logger help lists every current default shortcut', () => {
  const startupBlock = source.match(/const firstTimeIntroduction = initial([\s\S]*?): '';/);
  assert.ok(startupBlock, 'startup help block was not found');
  assert.doesNotMatch(startupBlock[1], /Ctrl\+[MNS]/);
  assert.match(source, /\$\{regularHelpIntroduction\}[\s\S]*?<strong>Keyboard shortcuts:<\/strong>/);
  assert.match(source, /<strong>Ctrl\+M<\/strong>: Toggle all logs/);
  assert.match(source, /<strong>Ctrl\+N<\/strong>: Toggle logs for the selected channel/);
  assert.match(source, /<strong>Ctrl\+S<\/strong>: Toggle logs for the selected server; unavailable in DMs/);
  assert.match(source, /Change or clear these shortcuts under Misc settings/);
});

test('the complete first-setup block uses Discord native warning color', () => {
  assert.match(source, /\.\$\{this\.style\.startupHelpTitle\} \{\s*color: var\(--text-warning, var\(--status-warning\)\);/);
});

test('shared help warns that Jump follows matching live-display switches', () => {
  assert.match(source, /Deleted, edited, and ghost-ping alerts provide View and eligible Jump actions\.<\/br>/);
  assert.match(source, /<span style="color: var\(--text-warning, var\(--status-warning\)\);">Jump is hidden while the matching live-display switch is \$\{this\.formatHelpStateLabel\(false\)\}\.<\/span>/);
  assert.doesNotMatch(source, /matching live-display switch is off/);
});

test('first-install help omits the regular help-modal greeting', () => {
  assert.match(source, /const regularHelpIntroduction = initial\s*\? ''\s*:\s*`Hello! This is the \$\{this\.getName\(\)\} help modal!/);
  assert.match(source, /\$\{firstTimeIntroduction\}\s*\$\{regularHelpIntroduction\}\s*<strong>Menu:<\/strong>/);
});

test('top-level help headings always start on a separate spaced line', () => {
  assert.match(source, /\.\$\{this\.style\.helpContent\} \{[\s\S]*?line-height: 1\.5;/);
  assert.match(source, /\.\$\{this\.style\.helpContent\} > strong \{\s*display: block;\s*margin-top: 18px;/);
  assert.match(source, /\.\$\{this\.style\.helpContent\} > strong:first-child \{\s*margin-top: 0;/);
  assert.match(source, /\.\$\{this\.style\.helpContent\} > strong \+ br \{\s*display: none;/);
  assert.match(source, /<strong>Menu:<\/strong><\/br>\s*<div class="\$\{this\.style\.textIndent\}">/);
  assert.doesNotMatch(source, /<strong>Menu:<\/strong><\/br><\/br>/);
  assert.match(source, /<strong>Toasts:<\/strong><\/br>[\s\S]*?<strong>Notifications:<\/strong><\/br>/);
});

test('logger help preserves nested sections with spaced subsection labels', () => {
  const helpStart = source.indexOf('showLoggerHelpModal(initial = false');
  const helpEnd = source.indexOf('showStatsModal()', helpStart);
  const helpBlock = source.slice(helpStart, helpEnd);

  assert.match(source, /\.\$\{this\.style\.helpSubheading\} \{\s*display: block;\s*margin-top: 12px;\s*margin-bottom: 4px;/);
  assert.match(source, /\.\$\{this\.style\.helpSubheading\} \+ \.\$\{this\.style\.textIndent\} \{\s*margin-top: 0;\s*margin-bottom: 10px;/);
  assert.equal((helpBlock.match(/class="\$\{this\.style\.helpSubheading\}"/g) || []).length, 14);
  assert.match(helpBlock, /<strong class="\$\{this\.style\.helpSubheading\}">DELETE \+ LEFT-CLICK:<\/strong>\s*<div class="\$\{this\.style\.textIndent\}">/);
  assert.match(helpBlock, /<strong class="\$\{this\.style\.helpSubheading\}">WHITELIST-ONLY:<\/strong>\s*<div class="\$\{this\.style\.textIndent\}">/);
  assert.match(helpBlock, /<strong class="\$\{this\.style\.helpSubheading\}">TRASH:<\/strong>\s*<div class="\$\{this\.style\.textIndent\}">/);
  assert.doesNotMatch(helpBlock, /(?:DELETE \+ LEFT-CLICK|WHITELIST-ONLY|TRASH):<\/br>/);
  assert.doesNotMatch(helpBlock, /then then Logger help/);
});

test('filter help uses spaced sections and renders placeholder text literally', () => {
  assert.match(source, /<div class="\$\{this\.multiClasses\.defaultColor\} \$\{this\.style\.helpContent\}">\s*<strong>Search filters:<\/strong>/);
  assert.match(source, /<strong>Search format:<\/strong><\/br>/);
  assert.match(source, /<strong>Shortcut help:<\/strong><\/br>/);
  assert.match(source, /<strong>Window behavior:<\/strong><\/br>/);
  assert.match(source, /&lt;server name or ID&gt;/);
  assert.match(source, /<strong>message:<\/strong> or <strong>content:<\/strong> - Filter results with the specified message content or message ID\.<\/br>/);
  assert.doesNotMatch(source, /<servername or serverid>/);
  assert.doesNotMatch(source, /<image\|link>/);
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
  assert.match(source, /const nextValidation = plugin\.validateNumericSettingValue\(value, config\);[\s\S]*if \(nextValidation\.valid\) \{[\s\S]*onValid\(nextValidation\.value\);/);
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

test('backup and edit-spam diagnostics remain opt-in under their warning-colored Debug category', () => {
  assert.match(source, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*'Debug'[\s\S]*id: 'ml2-settings-debug'[\s\S]*collapsible: true[\s\S]*shown: false/);
  assert.match(source, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*Enable debug logging[\s\S]*id: 'debugLogging'[\s\S]*type: 'switch'/);
  assert.match(source, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*Show debug messages as toasts[\s\S]*id: 'debugToasts'[\s\S]*type: 'switch'/);
  assert.match(source, /if \(this\.settings\?\.debugLogging\) Logger\.log\(`\[Debug\] \$\{message\}`\)/);
  assert.match(source, /if \(this\.settings\?\.debugToasts\)[\s\S]*this\.notifyUser\(message,[\s\S]*title: 'Message Logger Debug'[\s\S]*type: 'warning'/);
  assert.match(source, /automatic-backup and edit-spam timer[\s\S]*lifecycle events/);
});

test('system and UI feedback uses one router while only spam warnings opt into system interactions', () => {
  assert.doesNotMatch(source, /UI\.showToast\(/);
  assert.doesNotMatch(source, /this\.showToast/);
  assert.equal(
    (source.match(/this\._showCustomToast\(/g) || []).length,
    1,
    'only the central router may invoke the custom toast renderer'
  );

  const systemRouter = source.slice(
    source.indexOf('notifyUser(content, options = {})'),
    source.indexOf('_dismissReplaceableNotification(replaceKey)')
  );
  assert.match(systemRouter, /pauseOnHover = false/);
  assert.match(systemRouter, /instantDismiss = true/);
  assert.match(systemRouter, /return this\._showNotification\(title, content, type, actions, timeout/);

  const eventRouter = source.slice(
    source.indexOf('_notifyEvent(eventType, channel, guild, messageId, options = {})'),
    source.indexOf('_sortMessagesById(messages)')
  );
  assert.match(eventRouter, /editSpamBlocked:[\s\S]*pauseOnHover: false,[\s\S]*instantDismiss: true/);
  assert.equal((eventRouter.match(/pauseOnHover: false/g) || []).length, 1);
  assert.equal((eventRouter.match(/instantDismiss: true/g) || []).length, 1);
  assert.match(eventRouter, /if \(config\.pauseOnHover !== undefined \|\| config\.instantDismiss !== undefined\)[\s\S]*return this\._showNotification\(config\.title, message, config\.type, actions, timeout, \{[\s\S]*pauseOnHover: config\.pauseOnHover,[\s\S]*instantDismiss: config\.instantDismiss/);
  assert.match(eventRouter, /return this\._showNotification\(config\.title, message, config\.type, actions, timeout\);/);
  assert.doesNotMatch(eventRouter, /notifyUser/);

  assert.match(source, /setSavedThreadHidden\(record, hidden\)[\s\S]*this\.notifyUser\(hidden \? 'Hidden!' : 'Unhidden!'/);
  assert.match(source, /reportSettingState\(title,[\s\S]*this\.notifyUser\(notificationMessage/);
});

test('event notification identities cover deletes, threads, purges, and sent-message replays', () => {
  const identityRouter = source.slice(
    source.indexOf('_getUnnotifiedEventIds(group, ids)'),
    source.indexOf('_notifyEvent(eventType, channel, guild, messageId, options = {})')
  );
  assert.match(identityRouter, /new Set\(\(Array\.isArray\(ids\) \? ids : \[ids\]\)/);
  assert.match(identityRouter, /this\._notifyEvent\(eventType, channel, guild, messageId, resolvedOptions\)/);
  assert.match(identityRouter, /this\._rememberNotifiedEventIds\(group, unnotifiedIds\)/);
  assert.match(source, /this\._notifiedEventIds = new Map\(\)/);
  assert.match(source, /this\._notifiedEventIds\?\.clear\?\.\(\)/);

  const threadDelete = source.slice(
    source.indexOf('handleForumThreadDelete(channel, guild, callDefault, args)'),
    source.indexOf('_testUrlPattern(url, regex)')
  );
  assert.match(threadDelete, /_notifyEventOnce\('deleted', 'delete', \[threadId\], channel, guild, threadId\)/);

  const dispatchStart = source.indexOf('\n  onDispatchEvent(args, callDefault) {');
  const dispatchHandler = source.slice(
    dispatchStart,
    source.indexOf('\n  patchMessages() {', dispatchStart)
  );
  assert.match(dispatchHandler, /_notifyEventOnce\('deleted', 'delete', \[dispatch\.id\], channel, guild, dispatch\.id\)/);
  assert.match(dispatchHandler, /savedDeleteIds\.push\(dispatchId\)/);
  assert.match(dispatchHandler, /_notifyEventOnce\([\s\S]*'bulkDelete',[\s\S]*'delete',[\s\S]*savedDeleteIds[\s\S]*unnotifiedIds => \(\{ count: unnotifiedIds\.length \}\)/);
  assert.match(dispatchHandler, /_notifyEventOnce\('sent', 'sent', \[dispatch\.message\.id\], channel, guild, dispatch\.message\.id\)/);
});

test('edit-spam blocking is opt-in and uses a per-author sixty-second cooldown', () => {
  const spamHelpers = source.slice(
    source.indexOf('_getEditNotificationSpamThreshold()'),
    source.indexOf('_notifyEvent(eventType, channel, guild, messageId, options = {})')
  );
  assert.match(spamHelpers, /configuredThreshold >= 1[\s\S]*DEFAULT_EDIT_SPAM_THRESHOLD/);
  assert.match(spamHelpers, /_getEditNotificationSpamSettingsKey\(\)[\s\S]*\? `true:\$\{this\._getEditNotificationSpamThreshold\(\)\}`[\s\S]*: 'false'/);
  assert.match(spamHelpers, /_isActiveEditNotificationSpamState\(state, now = Date\.now\(\)\)[\s\S]*blockedUntil\) > now[\s\S]*now - time < 60 \* 1000/);
  assert.match(spamHelpers, /_scheduleEditSpamCooldownReset\(authorId, state, now = Date\.now\(\)\)[\s\S]*started\. Resetting in 60 seconds[\s\S]*will reset in 10 seconds[\s\S]*reset after 60 seconds/);
  assert.match(spamHelpers, /_resetEditNotificationSpamState\(showNotice = false, reason = 'the settings changed'\)[\s\S]*this\._clearEditSpamCooldownTimers\(\)[\s\S]*this\.editHistoryAntiSpam = \{\}/);
  assert.match(spamHelpers, /showNotice && hadActiveState[\s\S]*'Edit Spam Timers Reset'[\s\S]*'All edit-spam author counts and notification pauses were cleared\.'[\s\S]*'info'[\s\S]*'edit-spam-timers-reset'/);
  assert.match(spamHelpers, /this\._editNotificationSpamSettingsKey !== settingsKey[\s\S]*_resetEditNotificationSpamState\(false, 'the settings changed outside the panel'\)/);
  assert.match(spamHelpers, /if \(!this\.settings\.blockSpamEdit\)[\s\S]*return 'allow'/);
  assert.match(spamHelpers, /Edit-spam counter for \$\{currentUsername\}: \$\{state\.times\.length\}\/\$\{threshold\} edits within 60 seconds/);
  assert.match(spamHelpers, /state\.times\.length < threshold/);
  assert.match(spamHelpers, /state\.blockedUntil = now \+ EDIT_SPAM_COOLDOWN_MS[\s\S]*_scheduleEditSpamCooldownReset\(authorId, state, now\)/);
  assert.match(spamHelpers, /return 'started'/);
  assert.match(source, /stop\(\)[\s\S]*this\._clearEditSpamCooldownTimers\?\.\(\)/);
  assert.match(source, /this\._editSpamCooldownTimers = new Map\(\)/);

  assert.match(source, /name: 'Block spam edit notifications \(if enabled\)'[\s\S]*id: 'blockSpamEdit'[\s\S]*action: 'toggleEditSpamState'[\s\S]*name: 'Edit spam threshold'[\s\S]*id: 'editSpamThreshold'[\s\S]*min: 1,[\s\S]*resetInvalidTo: DEFAULT_EDIT_SPAM_THRESHOLD,[\s\S]*inlineValidation: true,[\s\S]*action: 'resetEditSpamState'/);
  assert.match(source, /resetEditSpamState: \(\) => this\._handleEditSpamThresholdChange\(\)/);
  assert.match(source, /toggleEditSpamState: \(enabled\) => this\._handleEditSpamToggle\(enabled\)/);
  assert.match(spamHelpers, /_handleEditSpamThresholdChange\(\)[\s\S]*if \(!this\.settings\?\.blockSpamEdit\) return false;[\s\S]*_resetEditNotificationSpamState\(true, 'the threshold changed'\)/);
  assert.match(spamHelpers, /_handleEditSpamToggle\(enabled\)[\s\S]*!enabled,[\s\S]*enabled \? 'blocking was enabled' : 'blocking was disabled'/);
  assert.match(source, /editSpamThreshold: \{ fallback: DEFAULT_EDIT_SPAM_THRESHOLD, min: 1 \}/);
  assert.match(source, /const value = event\.currentTarget\.value;[\s\S]*setDraft\(value\);[\s\S]*if \(config\.resetInvalidTo !== undefined\)[\s\S]*onValid\(resetValue\.value\)/);
  const validationPlugin = createPlugin();
  assert.deepEqual(validationPlugin.validateNumericSettingValue('0', { min: 1 }), {
    valid: false,
    message: 'Value must be at least 1!'
  });
  assert.deepEqual(validationPlugin.validateNumericSettingValue('1', { min: 1 }), {
    valid: true,
    value: 1
  });

  const editedDispatch = source.slice(
    source.indexOf('const spamDecision = this._getEditNotificationSpamDecision(author.id, Date.now(), author.username)'),
    source.indexOf("dispatch.type == 'MESSAGE_CREATE'", source.indexOf('const spamDecision = this._getEditNotificationSpamDecision(author.id, Date.now(), author.username)'))
  );
  assert.match(editedDispatch, /_getEditNotificationSpamDecision\(author\.id, Date\.now\(\), author\.username\)/);
  assert.match(editedDispatch, /spamDecision === 'started'[\s\S]*_notifyEvent\('editSpamBlocked'/);
  assert.match(editedDispatch, /spamDecision === 'allow'[\s\S]*_notifyEvent\('edited'/);
});

test('settings callbacks have one BetterDiscord owner', () => {
  const createSetting = source.slice(source.indexOf('createSetting(data)'), source.indexOf('normalizeLoggerShortcutKey(key)'));
  assert.match(createSetting, /current\.onChange = value => \{[\s\S]*this\.settings\[current\.id\] = value;[\s\S]*this\.saveSettings\(\)/);
  assert.match(createSetting, /const \{ id, enableWith, disableWith, \.\.\.settingData \} = current/);
  assert.match(createSetting, /id: this\.obfuscatedClass\(id\),[\s\S]*\.\.\.settingData/);
  assert.match(createSetting, /setting\.enableWith = this\.obfuscatedClass\(enableWith\)/);
  assert.match(createSetting, /setting\.disableWith = this\.obfuscatedClass\(disableWith\)/);
  const createGroup = source.slice(source.indexOf('createGroup(group)'), source.indexOf('getSettingsPanel()'));
  assert.match(createGroup, /UI\.buildSettingsPanel\(\{[\s\S]*settings: settings\.map\(setting => this\.createSetting\(setting\)\)[\s\S]*\}\)/);
  assert.doesNotMatch(createGroup, /onChange\s*:/);
  const ordinaryCallback = source.slice(
    source.indexOf('else if (!setting.onChange)'),
    source.indexOf('if (config.inlineValidation')
  );
  assert.match(ordinaryCallback, /setting\.callback = val =>/);
  assert.doesNotMatch(ordinaryCallback, /saveSettings\(\)/);
  const configFactory = source.slice(
    source.indexOf('const createSettingFromConfig = (config) =>'),
    source.indexOf('const AccordionGroups = () =>')
  );
  assert.match(configFactory, /config\.validator === 'loggerKeybind'[\s\S]*createValidatedLoggerKeybindRecorder\(config\)/);
  assert.match(configFactory, /config\.parent[\s\S]*this\.settings\[config\.parent\]\[config\.id\] = val;[\s\S]*this\.saveSettings\(\)/);
  assert.match(configFactory, /config\.customValue[\s\S]*this\.settings\[config\.id\] = val;[\s\S]*this\.saveSettings\(\)/);
  assert.match(configFactory, /config\.validator === 'number'[\s\S]*handleNumericSettingInput[\s\S]*this\.settings\[config\.id\] = parsed;[\s\S]*this\.saveSettings\(\)/);
  assert.match(configFactory, /config\.validator === 'dateFormat'[\s\S]*normalizeDateFormatSetting[\s\S]*this\.settings\[config\.id\] = nextValue;[\s\S]*this\.saveSettings\(\)/);
  assert.match(configFactory, /config\.validator === 'cachePath'[\s\S]*this\.settings\[config\.id\] = trimmed;[\s\S]*this\.saveSettings\(\)/);
  assert.match(configFactory, /config\.validator === 'hexColor'[\s\S]*handleHexColorSettingInput\(config, val, actions\)/);
  const keybindRecorder = source.slice(
    source.indexOf('createValidatedLoggerKeybindRecorder(config)'),
    source.indexOf('normalizeAutoBackupIntervalSeconds(value)')
  );
  assert.match(keybindRecorder, /plugin\.settings\[config\.id\] = validation\.value;[\s\S]*plugin\.saveSettings\(\)/);
});

test('CSS class mode changes use a confirmed controlled restart on both save paths', () => {
  assert.match(source, /name: 'Obfuscate CSS classes'[\s\S]*confirmedCssClassRestart: true/);
  const cssSetting = source.slice(
    source.indexOf("name: 'Obfuscate CSS classes'"),
    source.indexOf("name: 'Automatic updates'")
  );
  assert.match(cssSetting, /Restarts MessageLogger to apply by briefly disabling and re-enabling it\./);
  assert.match(cssSetting, /var\(--text-warning, var\(--status-warning\)\)[\s\S]*With Disable saving data enabled, confirmation is required because temporary session activity will be discarded\./);
  assert.match(source, /config\.confirmedCssClassRestart[\s\S]*type = 'custom'[\s\S]*createConfirmedCssClassModeSwitch\(config\)/);
  const cssControl = source.slice(
    source.indexOf('createConfirmedCssClassModeSwitch(config)'),
    source.indexOf('createSetting(data)')
  );
  assert.match(cssControl, /Components\.SwitchInput[\s\S]*internalState: false/);
  assert.match(cssControl, /requestCssClassModeChange\(nextValue\)[\s\S]*this\.settings\.dontSaveData[\s\S]*showCssClassModeRestartWarning\(\)/);
  assert.match(cssControl, /cancelText: 'No'[\s\S]*confirmButtonColor:[\s\S]*RED/);
  assert.match(cssControl, /commitCssClassModeChange\(nextValue\)[\s\S]*this\.saveSettings\(\);[\s\S]*this\.scheduleCssClassModeRestart\(\)/);
  assert.match(cssControl, /Plugins\.disable\?\.\(pluginName\) === true[\s\S]*Plugins\.enable\?\.\(pluginName\) === true/);
  assert.doesNotMatch(cssControl, /_cssClassReenableTimer/);
  assert.match(source, /if \(!this\._cssClassRestartInProgress\)[\s\S]*this\._settingsDependencyListeners\?\.clear\?\.\(\)/);
  assert.match(source, /new Set\(\[this\.style\.css, this\.stringHeldCaptive, 'ML2-CSS'\]\)/);
  assert.match(source, /cssClassRestartWarning = this\.obfuscatedClass\('ml2-css-class-restart-warning'\)/);
  assert.match(cssControl, /className: this\.style\?\.cssClassRestartWarning/);
  assert.match(source, /this\.tools\.manaModule\.ConfirmModal,[\s\S]*className: options\.className/);
  assert.match(source, /\.\$\{this\.style\.cssClassRestartWarning\} \{[\s\S]*width: min\(420px, calc\(100vw - 32px\)\) !important;[\s\S]*min-height: 0 !important;/);
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
  assert.match(source, /reportSettingState\(title,[\s\S]*this\.notifyUser\(notificationMessage,[\s\S]*replaceKey/);
  assert.match(source, /notifyUser\(content, options = \{\}\)[\s\S]*pauseOnHover = false[\s\S]*instantDismiss = true/);
  assert.match(source, /_dismissReplaceableNotification\(replaceKey\)[\s\S]*notification\.replaceKey !== replaceKey[\s\S]*active\.handle\?\.close/);
  assert.match(source, /if \(timeout > 0 && pauseOnHover\)[\s\S]*pointerenter[\s\S]*pointerleave/);
  assert.match(source, /notification\.pauseOnHover === false[\s\S]*active\.forceCloseTimer = setTimeout/);
  assert.match(source, /data-mlv2-native-notification-id[\s\S]*_attachNativeNotificationInteractions\(active\)/);
  assert.match(source, /card\.addEventListener\('click', dismiss, true\)[\s\S]*card\.addEventListener\('contextmenu', dismiss, true\)/);
  assert.match(source, /\.bd-notification-progress[\s\S]*progress\?\.animate\?/);
  assert.match(source, /Notification mode changed to[\s\S]*Using BetterDiscord notifications[\s\S]*type: 'info'/);
});

test('Nuked uses a fork-specific persisted index and migrates old Anti-Nuke records out of Purged', () => {
  assert.match(source, /isNukedRecord\(record\)[\s\S]*delete_data\?\.anti_nuke/);
  assert.match(source, /migrateAntiNukeCategoryRecords\(data\)[\s\S]*\['deletedMessageRecord', 'editedMessageRecord', 'purgedMessageRecord'\][\s\S]*data\.nukedMessageRecord = canonicalNuked/);
  assert.match(source, /record\.delete_data\.anti_nuke \? data\.nukedMessageRecord : data\.deletedMessageRecord/);
  assert.match(source, /saveDeletedChannelCaptureMessage\(root, this\.nukedMessageRecord/);
  assert.match(source, /selectedTab == 'purged'[\s\S]*pushIdsIntoMessages\(this\.purgedMessageRecord, 'purged'\)/);
  assert.match(source, /selectedTab == 'nuked'[\s\S]*this\.settings\.antiNukeEnabled[\s\S]*pushIdsIntoMessages\(this\.nukedMessageRecord, 'nuked'\)/);
  assert.match(source, /getSavedRecordDisplayCategory\(record,[\s\S]*isSavedRecordHidden\(record\)[\s\S]*return 'hidden';[\s\S]*if \(baseCategory === 'nuked'\) return 'nuked';[\s\S]*if \(record\.ghost_pinged\) return 'ghostpings';[\s\S]*return baseCategory/);
  assert.match(source, /if \(this\.settings\.antiNukeEnabled\) tabs\.appendChild\(createTab\('Nuked', 'nuked'\)\)/);
  assert.match(source, /isLoggerTabAvailable\(tab\)[\s\S]*tab === 'hidden'[\s\S]*showHiddenTab[\s\S]*tab === 'nuked'[\s\S]*antiNukeEnabled/);
  assert.match(source, /nukedMessageRecord: \{\}/);
  assert.match(source, /this\.nukedMessageSet = createSetMap\(this\.nukedMessageRecord\)/);
  assert.match(source, /name: 'Show nuke detection toasts'[\s\S]*id: 'antiNukeToasts'[\s\S]*type: 'switch'/);
  assert.match(source, /title: "Nuke Detected"[\s\S]*getMessage:[\s\S]*`Nuke Detected at \$\{name\}[\s\S]*type: "error"[\s\S]*tab: "nuked"/);
  assert.match(source, /context\.captured > 0[\s\S]*context\.captureEnabled[\s\S]*this\.settings\.antiNukeEnabled[\s\S]*this\.settings\.antiNukeToasts[\s\S]*this\._notifyEvent\('nukeDetected'/);
});

test('no-save recovery remains guarded and ordered before backup persistence', () => {
  assert.match(source, /this\._needsNoSaveDataMerge = !!this\.settings\.dontSaveData/);
  assert.match(source, /loadPersistedDataForNoSaveMerge\(\)/);
  assert.match(source, /mergeDataPayloads\(loaded\.data, this\._getDataPayload\(\)\)/);
  assert.match(source, /wasArchiveDetached[\s\S]*applyNoSaveSessionOverlay\(loaded\.data, detachedOverlay\)/);
  assert.match(source, /applySavedMessagesCapToPayload/);
  assert.match(source, /Data Recovery Error/);
  assert.match(source, /View the console log for more details/);
  assert.match(source, /this\.cancelPendingDataWrites\?\.\(\)/);
  assert.match(source, /reportDataSavingResume\(requiresRecoveryMerge\)[\s\S]*this\.reportSettingState\([\s\S]*Message Logger Data Recovery[\s\S]*Message Logger Data Saving/);
  const noSaveFeedback = source.slice(
    source.indexOf('reportDataSavingDisabled()'),
    source.indexOf('reportMajorSettingChange(', source.indexOf('reportDataSavingDisabled()'))
  );
  assert.match(noSaveFeedback, /saved archive is detached/);
  assert.match(noSaveFeedback, /new logger additions will remain in memory/);
  assert.match(noSaveFeedback, /Archival removals still commit deletion-only updates/);
  assert.match(noSaveFeedback, /'neutral'/);
  const recovery = source.slice(source.indexOf('async mergeNoSaveSessionIntoPersistedData()'), source.indexOf('handleDataSaveSetting(disabled)'));
  assert.ok(recovery.indexOf("this.getName() + 'Data'") < recovery.indexOf("this.getName() + 'DataBackup'"));
});

test('no-save startup loads the archive unless the linked child detaches it', () => {
  const startupStart = source.indexOf('this._pendingNoSavePersistedRemovals = [];');
  const startupEnd = source.indexOf('this.cachedMessageRecord = [];', startupStart);
  const startup = source.slice(startupStart, startupEnd);

  assert.ok(startupStart >= 0 && startupEnd > startupStart);
  assert.match(startup, /this\._needsNoSaveDataMerge = !!this\.settings\.dontSaveData/);
  assert.match(startup, /this\._archiveDetached = !!\(this\.settings\.dontSaveData && this\.settings\.dontLoadArchivedData\)/);
  assert.match(startup, /const selectedData = this\._archiveDetached[\s\S]*source: 'detached'[\s\S]*loadStartupDataPayloadFromDisk\(\)\)\.selected/);
  assert.doesNotMatch(startup, /Data\.load\(this\.getName\(\) \+ 'Data(?:Backup)?', 'data'\)/);
  assert.match(startup, /data = selectedData\.data[\s\S]*data = this\.normalizePersistedDataPayload\(data\)/);
  assert.ok(source.indexOf('this.installDataPayload(data)', startupEnd) > startupEnd);
  assert.match(settingsDocs, /Disable loading archived data \| Off \|/);
  assert.match(settingsDocs, /When both this setting and \*\*Disable saving data\*\* are enabled/i);
});

test('no-save mode persists removals from disk without serializing session additions', () => {
  const removalPersistence = source.slice(
    source.indexOf('getNoSaveEditRemovalIdentity(edit)'),
    source.indexOf('  loadPersistedDataForNoSaveMerge() {')
  );
  const editRemoval = source.slice(
    source.indexOf('deleteEditedMessageFromRecord(id, editNum)'),
    source.indexOf('jumpToMessage(channelId, messageId, guildId)')
  );
  const recordRemoval = source.slice(
    source.indexOf('deleteMessageFromRecords(id, options = {})'),
    source.indexOf('  removeForumCardFromDom(threadId) {', source.indexOf('deleteMessageFromRecords(id, options = {})'))
  );
  const rootRemoval = source.slice(
    source.indexOf('deleteForumThreadFromRecords(threadId)'),
    source.indexOf('  closeForumThreadLogModal(threadId) {', source.indexOf('deleteForumThreadFromRecords(threadId)'))
  );
  const capRemoval = source.slice(
    source.indexOf('handleMessagesCap()'),
    source.indexOf('onDispatchEvent(args, callDefault)')
  );
  const clearLogStart = source.indexOf('const onClearLog = e =>');
  const clearLogConfirmation = source.indexOf('this.createModal(', clearLogStart);
  const clearLogRemoval = source.slice(
    clearLogStart,
    source.indexOf('this.createModal(', clearLogConfirmation + 1)
  );

  assert.match(removalPersistence, /readDataPayloadFile\(this\.getName\(\) \+ 'Data'\)/);
  assert.match(removalPersistence, /readDataPayloadFile\(this\.getName\(\) \+ 'DataBackup'\)/);
  assert.match(removalPersistence, /writeDataPayloadAtomicSync/);
  assert.doesNotMatch(removalPersistence, /this\._getDataPayload\(\)|mergeDataPayloads\(/);
  assert.match(removalPersistence, /if \(this\._archiveDetached\) return \{ ok: true, changed: false, detached: true \}/);
  assert.match(removalPersistence, /!this\.settings\?\.dontSaveData \|\| this\._archiveDetached/);
  assert.match(editRemoval, /queueNoSavePersistedRemoval\(\{ type: 'edit'/);
  assert.match(recordRemoval, /queueNoSavePersistedRemoval\(\{ type: 'record'/);
  assert.match(rootRemoval, /threadRoot: true/);
  assert.match(capRemoval, /this\.deleteMessageFromRecords\(map\[i\]\)/);
  assert.match(clearLogRemoval, /this\.deleteMessageFromRecords\(id\)/);
  assert.match(settingsDocs, /archival removals[^\n]*deletion-only/i);
});

test('schema updates use canonical whole-file output and routed notifications', () => {
  assert.match(source, /const DATA_SCHEMA_VERSION = 1;/);
  assert.match(source, /mlv2RemakeSchemaVersion: DATA_SCHEMA_VERSION,[\s\S]*messageRecord: this\.messageRecord/);
  assert.match(source, /Logger data requires a schema update\. Updating it to the current schema\./);
  assert.match(source, /this\.notifyUser\('Logger data requires a schema update\. Updating it to the current schema\.'/);
  assert.match(source, /rewriteCanonicalDataPayload\(\)[\s\S]*writeDataPayloadAtomic\([\s\S]*this\.getName\(\) \+ 'Data'/);
  assert.match(source, /this\.notifyUser\('Logger data was updated to the current schema successfully\.'[\s\S]*title: 'Message Logger Data Update'/);
  assert.match(source, /this\.notifyUser\([\s\S]*Logger data could not be updated to the current schema\. View the console log for more details\.[\s\S]*Message Logger Data Update Error/);
});

test('backup restoration reports the main-file rebuild through the notification router', () => {
  assert.match(source, /this\._canonicalRewriteReason = dataLoadedFromBackup/);
  assert.match(source, /Valid logger backup is loaded[\s\S]*scheduling an atomic rebuild of the main data file/);
  assert.match(source, /this\.notifyUser\('Valid backup loaded\. Rebuilding the main data file\.',[\s\S]*title: 'Message Logger Data Recovery'/);
  assert.match(source, /Message Logger Data Recovery Error[\s\S]*main data file could not be rebuilt[\s\S]*View the console log for more details\./);
  assert.match(source, /Backup loaded and the main data file was rebuilt successfully\./);
});
