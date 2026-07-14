const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  Data,
  UI,
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

test('successful atomic writes keep BetterDiscord cached data aligned with disk', async t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({ pluginDir, nodeModules: { fs, path } });
  const oldData = { old: true, stale: true };
  Data.save('MessageLoggerV2Data', 'data', oldData);

  const error = await save(plugin, 'MessageLoggerV2Data', { current: true });

  assert.equal(error, null);
  assert.deepEqual(Data.load('MessageLoggerV2Data', 'data'), { current: true });
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(pluginDir, 'MessageLoggerV2Data.config.json'), 'utf8')).data,
    { current: true }
  );
});

test('empty runtime state uses atomic replacement instead of data deletion', async t => {
  const pluginDir = temporaryDirectory(t);
  const plugin = createPlugin({
    pluginDir,
    nodeModules: { fs, path },
    settings: { dontSaveData: false, autoBackup: false },
    messageRecord: {},
    suppressedForumThreadIds: new Set(),
    _dataWriteEpoch: 0
  });
  const previousDocument = global.document;
  global.document = { querySelector: () => null };
  t.after(() => { global.document = previousDocument; });

  await new Promise(resolve => {
    const original = plugin.efficientlySaveData.bind(plugin);
    plugin.efficientlySaveData = (...args) => {
      const callback = args[3];
      args[3] = (error, cancelled) => {
        callback?.(error, cancelled);
        resolve(error);
      };
      return original(...args);
    };
    plugin.handleDataSaving(false);
  });

  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(pluginDir, 'MessageLoggerV2Data.config.json'), 'utf8')).data,
    plugin.createDefaultDataPayload()
  );
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

test('backup debug console and routed-toast controls are independent and disabled by default', () => {
  const notifications = [];
  const plugin = createPlugin({
    settings: { debugLogging: false, debugToasts: false },
    _showNotification(...args) { notifications.push(args); }
  });

  plugin.reportDebugEvent('disabled event');
  assert.equal(loggerEvents.length, 0);
  assert.equal(notifications.length, 0);

  plugin.settings.debugLogging = true;
  plugin.reportDebugEvent('console-only event');
  assert.deepEqual(loggerEvents.at(-1), ['log', '[Debug] console-only event']);
  assert.equal(notifications.length, 0);

  plugin.settings.debugLogging = false;
  plugin.settings.debugToasts = true;
  plugin.reportDebugEvent('toast-only event', 2500);
  assert.equal(loggerEvents.length, 1);
  assert.deepEqual(notifications.at(-1), [
    'Message Logger Debug',
    'toast-only event',
    'warning',
    [],
    2500,
    {
      replaceKey: null,
      pauseOnHover: false,
      instantDismiss: true,
      routeOverride: null
    }
  ]);

  plugin.settings.debugLogging = true;
  plugin.reportDebugEvent('combined event');
  assert.deepEqual(loggerEvents.at(-1), ['log', '[Debug] combined event']);
  assert.equal(notifications.at(-1)[1], 'combined event');
  assert.equal(notifications.at(-1)[2], 'warning');
});

test('debug warning alerts honor the selected native-notification or custom-toast route', () => {
  const nativeNotifications = [];
  const customToasts = [];
  const plugin = createPlugin({
    _notificationRouterReady: true,
    settings: {
      debugLogging: false,
      debugToasts: true,
      useNotificationsInstead: true
    },
    _enqueueNativeNotification(notification) { nativeNotifications.push(notification); },
    _showCustomToast(content, options) { customToasts.push([content, options]); }
  });

  plugin.reportDebugEvent('native route');
  assert.equal(nativeNotifications.length, 1);
  assert.equal(nativeNotifications[0].type, 'warning');
  assert.equal(nativeNotifications[0].pauseOnHover, false);
  assert.equal(nativeNotifications[0].instantDismiss, true);
  assert.equal(customToasts.length, 0);

  plugin.settings.useNotificationsInstead = false;
  plugin.reportDebugEvent('custom route');
  assert.equal(nativeNotifications.length, 1);
  assert.equal(customToasts.length, 1);
  assert.equal(customToasts[0][0], 'custom route');
  assert.equal(customToasts[0][1].type, 'warning');
  assert.equal(customToasts[0][1].pauseOnHover, false);
  assert.equal(customToasts[0][1].instantDismiss, true);
});

test('system and UI feedback defaults to wall-clock expiry and whole-card dismissal', () => {
  const notifications = [];
  const plugin = createPlugin({
    _showNotification(...args) { notifications.push(args); }
  });

  plugin.notifyUser('Hidden!', {
    title: 'Logger Record Hidden',
    type: 'success'
  });

  assert.deepEqual(notifications, [[
    'Logger Record Hidden',
    'Hidden!',
    'success',
    [],
    3000,
    {
      replaceKey: null,
      pauseOnHover: false,
      instantDismiss: true,
      routeOverride: null
    }
  ]]);
});

test('BetterDiscord settings invoke each plugin callback exactly once', t => {
  const originalBuildSettingsPanel = UI.buildSettingsPanel;
  t.after(() => { UI.buildSettingsPanel = originalBuildSettingsPanel; });
  UI.buildSettingsPanel = panel => panel;
  const changes = [];
  let saves = 0;
  const plugin = createPlugin({
    obfuscatedClass: id => id,
    settings: { antiNukeEnabled: true },
    saveSettings() { saves++; }
  });

  const panel = plugin.createSetting({
    id: 'antiNukeEnabled',
    type: 'switch',
    callback(value) { changes.push(value); }
  });

  // BetterDiscord invokes an item callback first when present, then the panel callback.
  panel.settings[0].onChange?.(false);
  panel.onChange(null, panel.settings[0].id, false);

  assert.equal(panel.settings[0].onChange, undefined);
  assert.deepEqual(changes, [false]);
  assert.equal(plugin.settings.antiNukeEnabled, false);
  assert.equal(saves, 1);
});

test('neutral state alerts use a theme-colored native card or custom grey toast', () => {
  const nativeNotifications = [];
  const customToasts = [];
  const plugin = createPlugin({
    _notificationRouterReady: true,
    settings: { useNotificationsInstead: true },
    _enqueueNativeNotification(notification) { nativeNotifications.push(notification); },
    _showCustomToast(content, options) { customToasts.push([content, options]); }
  });

  plugin._showNotification('State', 'Disabled state', 'neutral', [], 5000);
  assert.equal(nativeNotifications[0].type, 'info');
  assert.equal(typeof nativeNotifications[0].icon, 'function');
  assert.equal(customToasts.length, 0);

  plugin.settings.useNotificationsInstead = false;
  plugin._showNotification('State', 'Disabled state', 'neutral', [], 5000);
  assert.equal(customToasts[0][0], 'Disabled state');
  assert.equal(customToasts[0][1].type, 'neutral');
});

test('high-impact setting feedback uses info for enabled and neutral for disabled', () => {
  const notifications = [];
  const plugin = createPlugin({
    _showNotification(...args) { notifications.push(args); }
  });
  const settingIds = [
    'onlyLogWhitelist',
    'cacheAllImages',
    'antiNukeEnabled',
    'autoUpdate',
    'onlyRenderCachedAttachments',
    'deleteCachedFilesWithRecords'
  ];

  for (const settingId of settingIds) {
    plugin.reportMajorSettingChange(settingId, true);
    plugin.reportMajorSettingChange(settingId, false);
  }

  assert.deepEqual(notifications.map(event => event[2]), settingIds.flatMap(() => ['info', 'neutral']));
  assert.ok(notifications.every(event => /enabled|disabled/i.test(event[1])));
  assert.deepEqual(
    notifications.map(event => event[5].replaceKey),
    settingIds.flatMap(settingId => [`setting:${settingId}`, `setting:${settingId}`])
  );
  assert.ok(notifications.every(event => event[5].pauseOnHover === false));
  assert.ok(notifications.every(event => event[5].instantDismiss === true));
  assert.equal(loggerEvents.filter(event => event[0] === 'log'
    && String(event[1]).includes('High-impact setting changed')).length, settingIds.length * 2);
});

test('rapid same-setting alerts replace the previous routed notification only', () => {
  const nativeNotifications = [];
  let nativeClosed = 0;
  const nativePlugin = createPlugin({
    _notificationRouterReady: true,
    settings: { useNotificationsInstead: true },
    _nativeNotificationQueue: [
      { replaceKey: 'setting:antiNukeEnabled', content: 'queued stale state' },
      { replaceKey: 'setting:cacheAllImages', content: 'unrelated state' }
    ],
    _nativeNotificationActive: {
      notification: { replaceKey: 'setting:antiNukeEnabled' },
      finished: false,
      yieldTimer: null,
      forceCloseTimer: null,
      handle: { close() { nativeClosed++; } }
    },
    _enqueueNativeNotification(notification) { nativeNotifications.push(notification); }
  });

  nativePlugin._showNotification(
    'Anti Nuke',
    'Anti Nuke enabled.',
    'info',
    [],
    5000,
    { replaceKey: 'setting:antiNukeEnabled', pauseOnHover: false, instantDismiss: true }
  );

  assert.equal(nativeClosed, 1);
  assert.equal(nativePlugin._nativeNotificationActive, null);
  assert.deepEqual(nativePlugin._nativeNotificationQueue.map(item => item.replaceKey), ['setting:cacheAllImages']);
  assert.equal(nativeNotifications[0].replaceKey, 'setting:antiNukeEnabled');
  assert.equal(nativeNotifications[0].pauseOnHover, false);

  const customToasts = [];
  const customDismissals = [];
  const customPlugin = createPlugin({
    _notificationRouterReady: true,
    settings: { useNotificationsInstead: false },
    _replaceableToasts: new Map([[
      'setting:antiNukeEnabled',
      { __mlv2Dismiss(immediate) { customDismissals.push(immediate); } }
    ]]),
    _showCustomToast(content, options) { customToasts.push([content, options]); }
  });

  customPlugin._showNotification(
    'Anti Nuke',
    'Anti Nuke disabled.',
    'neutral',
    [],
    5000,
    { replaceKey: 'setting:antiNukeEnabled', pauseOnHover: false, instantDismiss: true }
  );

  assert.deepEqual(customDismissals, [true]);
  assert.equal(customToasts[0][1].replaceKey, 'setting:antiNukeEnabled');
  assert.equal(customToasts[0][1].pauseOnHover, false);
  assert.equal(customToasts[0][1].instantDismiss, true);
});

test('custom setting toasts replace immediately, ignore hover, and dismiss on click', t => {
  const previousDocument = global.document;
  const previousRequestAnimationFrame = global.requestAnimationFrame;
  t.after(() => {
    global.document = previousDocument;
    global.requestAnimationFrame = previousRequestAnimationFrame;
  });

  const elements = [];
  const makeElement = tagName => {
    const listeners = {};
    const element = {
      tagName,
      className: '',
      id: '',
      innerHTML: '',
      style: {},
      children: [],
      parentNode: null,
      removed: false,
      listeners,
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      addEventListener(name, listener) { listeners[name] = listener; },
      remove() {
        this.removed = true;
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter(child => child !== this);
          this.parentNode = null;
        }
      }
    };
    elements.push(element);
    return element;
  };
  const appMount = makeElement('div');
  appMount.id = 'app-mount';
  const head = makeElement('head');
  global.document = {
    head,
    createElement: makeElement,
    querySelector(selector) {
      if (selector === '#app-mount') return appMount;
      if (selector === '.mlv2-toasts') {
        return elements.find(element => element.className === 'mlv2-toasts' && !element.removed) || null;
      }
      if (selector === '#mlv2-toast-styles') {
        return elements.find(element => element.id === 'mlv2-toast-styles' && !element.removed) || null;
      }
      return null;
    }
  };
  global.requestAnimationFrame = callback => callback();
  const plugin = createPlugin({ _replaceableToasts: new Map() });
  const options = {
    type: 'info',
    timeout: 60_000,
    replaceKey: 'setting:antiNukeEnabled',
    pauseOnHover: false,
    instantDismiss: true
  };

  const first = plugin._showCustomToast('Anti Nuke enabled.', options);
  const second = plugin._showCustomToast('Anti Nuke disabled.', { ...options, type: 'neutral' });

  assert.equal(first.removed, true);
  assert.equal(second.listeners.pointerenter, undefined);
  assert.equal(second.listeners.pointerleave, undefined);
  assert.equal(plugin._replaceableToasts.get(options.replaceKey), second);

  second.listeners.click({ preventDefault() {}, stopPropagation() {} });

  assert.equal(second.removed, true);
  assert.equal(plugin._replaceableToasts.has(options.replaceKey), false);
});

test('non-hovering native setting alerts expire on wall-clock time', async t => {
  const originalShowNotification = UI.showNotification;
  t.after(() => { UI.showNotification = originalShowNotification; });
  let closed = 0;
  UI.showNotification = notification => ({
    close() {
      closed++;
      notification.onClose?.();
    }
  });
  const plugin = createPlugin({
    _nativeNotificationQueueStopped: false,
    _nativeNotificationQueue: [],
    _nativeNotificationActive: null,
    _nativeNotificationSequence: 0
  });

  plugin._enqueueNativeNotification({
    title: 'State',
    content: 'Enabled',
    type: 'info',
    duration: 10,
    replaceKey: 'setting:test',
    pauseOnHover: false
  });
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.equal(closed, 1);
  assert.equal(plugin._nativeNotificationActive, null);
});

test('native setting cards keep progressing and dismiss on left or right click', t => {
  const previousDocument = global.document;
  const originalShowNotification = UI.showNotification;
  t.after(() => {
    global.document = previousDocument;
    UI.showNotification = originalShowNotification;
  });
  let currentMarker = null;
  let closed = 0;
  let animationStarts = 0;
  let animationCancels = 0;
  const listeners = new Map();
  const progress = {
    animate(frames, options) {
      animationStarts++;
      assert.equal(frames.at(-1).width, '0%');
      assert.ok(options.duration > 0);
      return { cancel() { animationCancels++; } };
    }
  };
  const card = {
    style: { cursor: '' },
    addEventListener(type, listener, capture) {
      listeners.set(`${type}:${capture}`, listener);
    },
    removeEventListener(type, listener, capture) {
      if (listeners.get(`${type}:${capture}`) === listener) listeners.delete(`${type}:${capture}`);
    },
    querySelector(selector) {
      return selector === '.bd-notification-progress' ? progress : null;
    }
  };
  const marker = { closest: selector => selector === '.bd-notification' ? card : null };
  global.document = {
    querySelector(selector) {
      return selector === currentMarker ? marker : null;
    }
  };
  UI.showNotification = notification => {
    const markerId = notification.content.props['data-mlv2-native-notification-id'];
    currentMarker = `[data-mlv2-native-notification-id="${markerId}"]`;
    return { close() { closed++; } };
  };
  const plugin = createPlugin({
    _nativeNotificationQueueStopped: false,
    _nativeNotificationQueue: [],
    _nativeNotificationActive: null,
    _nativeNotificationSequence: 0
  });
  const enqueue = () => plugin._enqueueNativeNotification({
    title: 'Setting',
    content: 'Enabled',
    type: 'info',
    duration: 60_000,
    replaceKey: 'setting:test',
    pauseOnHover: false,
    instantDismiss: true
  });
  const event = () => {
    const calls = [];
    return {
      calls,
      preventDefault() { calls.push('preventDefault'); },
      stopPropagation() { calls.push('stopPropagation'); },
      stopImmediatePropagation() { calls.push('stopImmediatePropagation'); }
    };
  };

  enqueue();
  assert.equal(animationStarts, 1);
  assert.equal(card.style.cursor, 'pointer');
  const leftClick = event();
  listeners.get('click:true')(leftClick);
  assert.deepEqual(leftClick.calls, ['preventDefault', 'stopPropagation', 'stopImmediatePropagation']);
  assert.equal(closed, 1);
  assert.equal(plugin._nativeNotificationActive, null);

  enqueue();
  assert.equal(animationStarts, 2);
  const rightClick = event();
  listeners.get('contextmenu:true')(rightClick);
  assert.deepEqual(rightClick.calls, ['preventDefault', 'stopPropagation', 'stopImmediatePropagation']);
  assert.equal(closed, 2);
  assert.equal(plugin._nativeNotificationActive, null);
  assert.equal(animationCancels, 2);
  assert.equal(card.style.cursor, '');
});

test('automatic backup state feedback covers enabled, disabled, and saving-paused paths', () => {
  const notifications = [];
  let backupSaves = 0;
  const plugin = createPlugin({
    settings: { dontSaveData: false, debugLogging: false, debugToasts: false },
    saveBackup() { backupSaves++; },
    _showNotification(...args) { notifications.push(args); }
  });

  plugin.handleAutoBackupSetting(true);
  assert.equal(backupSaves, 1);
  assert.equal(notifications.at(-1)[2], 'info');
  assert.match(notifications.at(-1)[1], /enabled.*creating a backup now/i);
  assert.equal(notifications.at(-1)[5].replaceKey, 'setting:autoBackup');
  assert.equal(notifications.at(-1)[5].pauseOnHover, false);
  assert.equal(notifications.at(-1)[5].instantDismiss, true);

  plugin.saveBackupTimeout = setTimeout(() => {}, 60_000);
  plugin.handleAutoBackupSetting(false);
  assert.equal(notifications.at(-1)[2], 'neutral');
  assert.match(notifications.at(-1)[1], /disabled.*pending backup was cancelled/i);

  plugin.settings.dontSaveData = true;
  plugin.handleAutoBackupSetting(true);
  assert.equal(backupSaves, 1);
  assert.equal(notifications.at(-1)[2], 'info');
  assert.match(notifications.at(-1)[1], /enabled.*paused until data saving is re-enabled/i);
});

test('notification mode changes log and preview the selected route as info', () => {
  const previews = [];
  const plugin = createPlugin({
    _nativeNotificationQueueStopped: true,
    _clearNativeNotificationQueue() {},
    showNotificationTest(mode) { previews.push(mode); }
  });

  plugin.handleNotificationModeChange(true);
  plugin.handleNotificationModeChange(false);

  assert.deepEqual(previews, [true, false]);
  assert.deepEqual(
    loggerEvents.filter(event => String(event[1]).startsWith('Notification mode changed to')),
    [
      ['log', 'Notification mode changed to BetterDiscord notifications.'],
      ['log', 'Notification mode changed to custom toasts.']
    ]
  );

  const nativeNotifications = [];
  const customToasts = [];
  const previewPlugin = createPlugin({
    _notificationRouterReady: true,
    _enqueueNativeNotification(notification) { nativeNotifications.push(notification); },
    _showCustomToast(content, options) { customToasts.push([content, options]); }
  });

  previewPlugin.showNotificationTest(true);
  previewPlugin.lastNotificationTest = null;
  previewPlugin.showNotificationTest(false);

  assert.equal(nativeNotifications[0].type, 'info');
  assert.match(nativeNotifications[0].content, /BetterDiscord notifications/);
  assert.equal(nativeNotifications[0].replaceKey, 'setting:useNotificationsInstead');
  assert.equal(nativeNotifications[0].pauseOnHover, false);
  assert.equal(customToasts[0][1].type, 'info');
  assert.match(customToasts[0][0], /custom toasts/);
  assert.equal(customToasts[0][1].replaceKey, 'setting:useNotificationsInstead');
  assert.equal(customToasts[0][1].pauseOnHover, false);
  assert.equal(customToasts[0][1].instantDismiss, true);
});

test('backup debug lifecycle reports the queue delay, write start, and completion', () => {
  const notifications = [];
  const plugin = createPlugin({
    settings: { debugLogging: true, debugToasts: true, dontSaveData: false },
    __started: true,
    _dataWriteEpoch: 0,
    _getDataPayload() { return { messageRecord: {} }; },
    _showNotification(...args) { notifications.push(args); },
    efficientlySaveData(name, key, data, callback) {
      Data.save(name, key, data);
      callback(null, false);
    }
  });

  const timer = plugin.queueAutoBackup(300_000);
  clearTimeout(timer);
  plugin.saveBackupTimeout = 0;
  plugin.saveBackup();

  assert.ok(loggerEvents.some(event => event[1] === '[Debug] Automatic backup queued. Starting in 300 seconds.'));
  assert.ok(loggerEvents.some(event => event[1] === '[Debug] Automatic backup started.'));
  assert.ok(loggerEvents.some(event => event[1] === '[Debug] Automatic backup completed successfully.'));
  assert.deepEqual(
    notifications.map(event => event[1]),
    [
      'Automatic backup queued. Starting in 300 seconds.',
      'Automatic backup started.',
      'Automatic backup completed successfully.'
    ]
  );
  assert.deepEqual(notifications.map(event => event[2]), ['warning', 'warning', 'warning']);
});

test('canonical migration atomically rewrites only the primary and reports success', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, '{"data":{"legacy":true}}');
  fs.writeFileSync(backupPath, '{"data":{"keep":"legacy recovery point"}}');
  const notifications = [];
  const plugin = createPlugin({
    pluginDir,
    nodeModules: { fs, path },
    settings: { dontSaveData: false },
    __started: true,
    _dataWriteEpoch: 0,
    _dataNeedsCanonicalRewrite: true,
    messageRecord: {},
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    suppressedForumThreadIds: new Set(),
    _showNotification(...args) { notifications.push(args); }
  });

  assert.equal(await plugin.rewriteCanonicalDataPayload(), true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data,
    plugin.createDefaultDataPayload()
  );
  assert.equal(fs.readFileSync(backupPath, 'utf8'), '{"data":{"keep":"legacy recovery point"}}');
  assert.equal(plugin._dataNeedsCanonicalRewrite, false);
  assert.equal(notifications.at(-1)[2], 'success');
  assert.equal(notifications.at(-1)[1], 'Logger data was updated to the current schema successfully.');
});

test('backup recovery rebuilds the primary and reports recovery-specific success', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, '{broken-primary');
  fs.writeFileSync(backupPath, '{"data":{"keep":"recovery point"}}');
  const notifications = [];
  const plugin = createPlugin({
    pluginDir,
    nodeModules: { fs, path },
    settings: { dontSaveData: false },
    __started: true,
    _dataWriteEpoch: 0,
    _dataNeedsCanonicalRewrite: true,
    _canonicalRewriteReason: 'backup',
    messageRecord: {},
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    suppressedForumThreadIds: new Set(),
    _showNotification(...args) { notifications.push(args); }
  });

  assert.equal(await plugin.rewriteCanonicalDataPayload(), true);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data,
    plugin.createDefaultDataPayload()
  );
  assert.equal(fs.readFileSync(backupPath, 'utf8'), '{"data":{"keep":"recovery point"}}');
  assert.equal(plugin._canonicalRewriteReason, null);
  assert.equal(notifications.at(-1)[0], 'Message Logger Data Recovery');
  assert.match(notifications.at(-1)[1], /backup loaded.*main data file.*rebuilt successfully/i);
  assert.ok(loggerEvents.some(event => event[0] === 'log'
    && String(event[1]).includes('rebuilt successfully from the valid backup')));
});

test('canonical migration failure preserves the old primary and routes a detailed error', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(primaryPath, '{"data":{"legacy":true}}');
  const controlledFs = {
    ...fs,
    renameSync() { throw new Error('simulated migration rename failure'); },
    promises: {
      writeFile: fs.promises.writeFile.bind(fs.promises),
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const notifications = [];
  const plugin = createPlugin({
    pluginDir,
    nodeModules: { fs: controlledFs, path },
    settings: { dontSaveData: false },
    __started: true,
    _dataWriteEpoch: 0,
    _dataNeedsCanonicalRewrite: true,
    messageRecord: {},
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    suppressedForumThreadIds: new Set(),
    _showNotification(...args) { notifications.push(args); }
  });

  assert.equal(await plugin.rewriteCanonicalDataPayload(), false);
  assert.equal(fs.readFileSync(primaryPath, 'utf8'), '{"data":{"legacy":true}}');
  assert.equal(plugin._dataNeedsCanonicalRewrite, true);
  assert.equal(notifications.at(-1)[2], 'error');
  assert.match(notifications.at(-1)[1], /console log/i);
  assert.ok(loggerEvents.some(event => event[0] === 'error'
    && String(event[1]).includes('normalized legacy/mixed-fork')));
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('backup recovery failure preserves the old primary and reports rebuild details', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(primaryPath, '{broken-primary');
  const controlledFs = {
    ...fs,
    renameSync() { throw new Error('simulated recovery rename failure'); },
    promises: {
      writeFile: fs.promises.writeFile.bind(fs.promises),
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const notifications = [];
  const plugin = createPlugin({
    pluginDir,
    nodeModules: { fs: controlledFs, path },
    settings: { dontSaveData: false },
    __started: true,
    _dataWriteEpoch: 0,
    _dataNeedsCanonicalRewrite: true,
    _canonicalRewriteReason: 'backup',
    messageRecord: {},
    deletedMessageRecord: {},
    editedMessageRecord: {},
    purgedMessageRecord: {},
    suppressedForumThreadIds: new Set(),
    _showNotification(...args) { notifications.push(args); }
  });

  assert.equal(await plugin.rewriteCanonicalDataPayload(), false);
  assert.equal(fs.readFileSync(primaryPath, 'utf8'), '{broken-primary');
  assert.equal(plugin._dataNeedsCanonicalRewrite, true);
  assert.equal(plugin._canonicalRewriteReason, 'backup');
  assert.equal(notifications.at(-1)[0], 'Message Logger Data Recovery Error');
  assert.match(notifications.at(-1)[1], /backup was loaded.*main data file.*could not be rebuilt.*console log/i);
  assert.ok(loggerEvents.some(event => event[0] === 'error'
    && String(event[1]).includes('rebuild primary logger data from the valid backup')));
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('a failed async rename preserves the previous file and removes its temp file', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, '{"data":{"safe":true}}');
  Data.save('MessageLoggerV2Data', 'data', { safe: true });
  const failingFs = {
    ...fs,
    renameSync: () => { throw new Error('simulated rename failure'); },
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
  assert.deepEqual(Data.load('MessageLoggerV2Data', 'data'), { safe: true });
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
