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
    openLogsKeybind: ['Control', 'm'],
    openFilteredLogsKeybind: ['Control', 'n'],
    openServerLogsKeybind: ['Control', 's'],
    showHiddenTab: false,
    messageCacheCap: 1000,
    savedMessagesCap: 1000,
    antiNukeEnabled: true,
    antiNukeToasts: false,
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
  assert.match(rootSelection, /showDeletedMessages\) collect\(this\.deletedMessageRecord\)/);
  assert.match(rootSelection, /showPurgedMessages\) collect\(this\.purgedMessageRecord\)/);
  assert.match(rootSelection, /getRestorableForumRecordsForChannel[\s\S]*getVisibleRestorableThreadRootIds\(\)/);
  assert.match(rootSelection, /getRestorableCompactThreadRecords[\s\S]*getVisibleRestorableThreadRootIds\(\)/);
  assert.match(rootSelection, /forum_thread_delete \|\| record\.delete_data\.hidden \|\| !message/);
  assert.match(source, /canRestoreVisibleThreadRoots[\s\S]*restoreDeletedMessages[\s\S]*showDeletedMessages \|\| this\.settings\.showPurgedMessages/);
  assert.match(source, /restoreDeletedForumCards[\s\S]*desiredIds[\s\S]*data-ml2-restored-forum-card[\s\S]*target\.remove\?\.\(\)/);
  assert.match(source, /restoreDeletedSidebarThreads[\s\S]*getRestorableCompactThreadRecords\(parent\)/);
  assert.match(source, /restoreDeletedThreadBrowserCards[\s\S]*getRestorableCompactThreadRecords\(parent\)/);
  assert.match(source, /shouldTintMessage = \(channelId, messageId\) => \{[\s\S]*if \(!record\?\.delete_data \|\| record\.delete_data\.hidden\) return false/);
  assert.match(source, /applyRestoredThreadTint[\s\S]*!this\.messageRecord\?\.\[threadId\]\?\.delete_data\?\.hidden/);
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
  assert.match(source, /name: 'Aggresive message caching \(makes sure we have the data of any deleted or edited messages\)'[\s\S]*?id: 'aggresiveMessageCaching'[\s\S]*?disabled: true/);
  assert.match(source, /name: 'Use new cached images system'[\s\S]*?Legacy control locked on for organized forum and thread media storage\.[\s\S]*?id: 'newCacheAllImages'[\s\S]*?disabled: true/);

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
  assert.match(source, /\.\$\{this\.style\.startupHelpModal\} footer \[data-mana-component="button"\][\s\S]*?width: 100%/);
  const initialBranch = source.match(/\.\.\.\(initial([\s\S]*?): fromSettings/);
  assert.ok(initialBranch, 'startup help branch was not found');
  assert.doesNotMatch(initialBranch[1], /cancelText: 'Back'|returnToLoggerWindow/);
});

test('first-install help matches the current logging-scope onboarding', () => {
  assert.match(source, /<strong class="\$\{this\.style\.startupHelpTitle\}">First setup:<\/strong>/);
  assert.match(source, /Welcome to MessageLoggerV2/);
  assert.match(source, /New installations start in <strong>whitelist-only mode<\/strong>/);
  assert.match(source, /Right-click a server, channel, DM, or thread/);
  assert.match(source, /Open the <strong>Message Logger<\/strong> submenu/);
  assert.match(source, /Only log whitelist<\/strong> under <strong>Ignores and overrides/);
  assert.match(source, /Always log selected channel<\/strong> and <strong>Always log DMs/);
  assert.match(source, /Cache media locally<\/strong> and <strong>Disable saving data/);
  assert.match(source, /<div class="\$\{this\.style\.textIndent\} \$\{this\.style\.startupHelpTitle\}">/);
  assert.doesNotMatch(source, /startupHelpIntro|ml2-startup-help-intro/);
  assert.doesNotMatch(source, /font-size: 40px/);
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

test('first-install help omits the regular help-modal greeting', () => {
  assert.match(source, /const regularHelpIntroduction = initial\s*\? ''\s*:\s*`Hello! This is the \$\{this\.getName\(\)\} help modal!/);
  assert.match(source, /\$\{firstTimeIntroduction\}\s*\$\{regularHelpIntroduction\}\s*<strong>Menu:<\/strong>/);
});

test('top-level help headings always start on a separate spaced line', () => {
  assert.match(source, /\.\$\{this\.style\.helpContent\} > strong \{\s*display: block;\s*margin-top: 18px;/);
  assert.match(source, /\.\$\{this\.style\.helpContent\} > strong \+ br \{\s*display: none;/);
  assert.match(source, /<strong>Menu:<\/strong><\/br>\s*<div class="\$\{this\.style\.textIndent\}">/);
  assert.doesNotMatch(source, /<strong>Menu:<\/strong><\/br><\/br>/);
  assert.match(source, /<strong>Toasts:<\/strong><\/br>[\s\S]*?<strong>Notifications:<\/strong><\/br>/);
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
  assert.match(source, /if \(this\.settings\?\.debugToasts\)[\s\S]*this\.notifyUser\(message,[\s\S]*title: 'Message Logger Debug'[\s\S]*type: 'warning'/);
});

test('system and UI feedback uses one native-or-custom router without changing event alerts', () => {
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
  assert.match(eventRouter, /this\._showNotification\(config\.title, message, config\.type, actions, timeout\)/);
  assert.doesNotMatch(eventRouter, /notifyUser/);

  assert.match(source, /setSavedThreadHidden\(record, hidden\)[\s\S]*this\.notifyUser\(hidden \? 'Hidden!' : 'Unhidden!'/);
  assert.match(source, /reportSettingState\(title,[\s\S]*this\.notifyUser\(notificationMessage/);
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
  assert.match(source, /this\.notifyUser\('Legacy or mixed-fork logger data detected\. Migration to the current schema is in progress\.'/);
  assert.match(source, /rewriteCanonicalDataPayload\(\)[\s\S]*writeDataPayloadAtomic\([\s\S]*this\.getName\(\) \+ 'Data'/);
  assert.match(source, /this\.notifyUser\([\s\S]*The normalized data could not be saved\. View the console log for more details\.[\s\S]*Message Logger Data Migration Error/);
});

test('backup restoration reports the main-file rebuild through the notification router', () => {
  assert.match(source, /this\._canonicalRewriteReason = dataLoadedFromBackup/);
  assert.match(source, /Valid logger backup is loaded[\s\S]*scheduling an atomic rebuild of the main data file/);
  assert.match(source, /this\.notifyUser\('Valid backup loaded\. Rebuilding the main data file\.',[\s\S]*title: 'Message Logger Data Recovery'/);
  assert.match(source, /Message Logger Data Recovery Error[\s\S]*main data file could not be rebuilt[\s\S]*View the console log for more details\./);
  assert.match(source, /Backup loaded and the main data file was rebuilt successfully\./);
});
