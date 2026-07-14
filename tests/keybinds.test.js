const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness, toastEvents } = require('./helpers/plugin-harness');

const defaults = {
  openLogsKeybind: ['Control', 'm'],
  openFilteredLogsKeybind: ['Control', 'n'],
  openServerLogsKeybind: ['Control', 's']
};

function keyboardEvent(key, overrides = {}) {
  const calls = { preventDefault: 0, stopPropagation: 0, stopImmediatePropagation: 0 };
  return {
    key,
    repeat: false,
    isComposing: false,
    preventDefault() { calls.preventDefault++; },
    stopPropagation() { calls.stopPropagation++; },
    stopImmediatePropagation() { calls.stopImmediatePropagation++; },
    calls,
    ...overrides
  };
}

const waitForShortcutTransition = () => new Promise(resolve => setTimeout(resolve, 10));

function createShortcutModalPlugin({
  filter = '',
  openKeys = [],
  popoutCount = 0,
  selectedChannelId = 'live-channel',
  selectedGuildId = 'live-guild',
  mediaViewerOpen = false
} = {}) {
  const modalKeys = new Set(openKeys);
  if (mediaViewerOpen) modalKeys.add('discord-media-viewer');
  const closeOrder = [];
  let opened = 0;
  let popoutCloses = 0;
  const plugin = createPlugin({
    style: { menu: 'logger-modal' },
    loggerHelpModalKey: 'logger-help',
    filterHelpModalKey: 'filter-help',
    menu: { open: modalKeys.has('logger-modal'), filter, scrollPosition: 99, shownMessages: 5, messages: ['old'] },
    _loggerOwnedModalKeys: new Set(openKeys),
    _loggerShortcutTransitionId: 0,
    _loggerShortcutReopenTimeout: null,
    ModalStack: {
      hasModalOpen(key) { return modalKeys.has(key); },
      closeModal(key) {
        closeOrder.push(key);
        modalKeys.delete(key);
      }
    },
    tools: {
      getNativeMediaModal() {
        return { modalKey: 'discord-media-viewer' };
      },
      popoutStack: [],
      popoutManager: {
        popouts: new Map(Array.from({ length: popoutCount }, (_, index) => [index, {}])),
        closeAllPopouts() {
          popoutCloses++;
          this.popouts.clear();
        }
      }
    },
    getSelectedTextChannel() {
      return selectedChannelId ? { id: selectedChannelId } : null;
    },
    getSelectedGuildId() {
      return selectedGuildId;
    },
    openWindow() {
      opened++;
      this.menu.open = true;
      modalKeys.add(this.style.menu);
      this.trackLoggerOwnedModalKey(this.style.menu);
    },
    notifyUser(...args) { toastEvents.push(args); }
  });
  return {
    closeOrder,
    modalKeys,
    plugin,
    get opened() { return opened; },
    get popoutCloses() { return popoutCloses; }
  };
}

test.beforeEach(resetHarness);

test('keybind normalization accepts native captures, aliases, order changes, and disabled bindings', () => {
  const plugin = createPlugin();

  assert.deepEqual(plugin.normalizeLoggerKeybind(['Control', 'm']), ['Control', 'm']);
  assert.deepEqual(plugin.normalizeLoggerKeybind(['M', 'ctrl']), ['m', 'Control']);
  assert.deepEqual(plugin.normalizeLoggerKeybind(['Command', 'K']), ['Meta', 'k']);
  assert.deepEqual(plugin.normalizeLoggerKeybind([]), []);
  assert.equal(plugin.formatLoggerKeybind(['Control', 'M']), 'Ctrl + m');
  assert.equal(plugin.formatLoggerKeybind([]), 'Disabled');
  assert.equal(plugin.normalizeLoggerKeybind('Control+m'), null);
  assert.equal(plugin.normalizeLoggerKeybind(['Control', 'Control']), null);
  assert.equal(plugin.normalizeLoggerKeybind(['Control', 'm', 'Shift', 'Alt', 'Meta']), null);
  assert.equal(plugin.normalizeLoggerKeybind(['Unidentified']), null);

  assert.equal(plugin.validateLoggerKeybind(['Control']).valid, false);
  assert.equal(plugin.validateLoggerKeybind(['m']).valid, false);
  assert.equal(plugin.validateLoggerKeybind(['Control', 'm', 'n']).valid, false);
  assert.deepEqual(plugin.validateLoggerKeybind(['F8']), { valid: true, value: ['F8'] });
  assert.deepEqual(plugin.validateLoggerKeybind(['Alt', 'm']), { valid: true, value: ['Alt', 'm'] });

  assert.equal(plugin.loggerKeybindMatchesPressed(['m', 'Control'], new Set(['Control', 'm'])), true);
  assert.equal(plugin.loggerKeybindMatchesPressed(['Control', 'm'], new Set(['Control', 'Shift', 'm'])), false);
  assert.equal(plugin.loggerKeybindMatchesPressed([], new Set()), false);
});

test('missing and invalid keybind config values default while valid custom and empty values survive', () => {
  const plugin = createPlugin();
  const settings = {
    openFilteredLogsKeybind: ['Alt', 'K'],
    openServerLogsKeybind: []
  };

  assert.deepEqual(plugin.ensureLoggerKeybindSettings(settings, defaults), [
    { id: 'openLogsKeybind', reason: 'missing', savedValue: ['Control', 'm'] },
    {
      id: 'openFilteredLogsKeybind',
      reason: 'normalized',
      configuredValue: ['Alt', 'K'],
      savedValue: ['Alt', 'k']
    }
  ]);
  assert.deepEqual(settings.openLogsKeybind, ['Control', 'm']);
  assert.deepEqual(settings.openFilteredLogsKeybind, ['Alt', 'k']);
  assert.deepEqual(settings.openServerLogsKeybind, []);

  settings.openLogsKeybind = [];
  settings.openFilteredLogsKeybind = ['Control', 123];
  settings.openServerLogsKeybind = ['Meta', 'G'];
  const repairs = plugin.ensureLoggerKeybindSettings(settings, defaults);
  assert.deepEqual(settings.openLogsKeybind, []);
  assert.deepEqual(settings.openFilteredLogsKeybind, ['Control', 'n']);
  assert.deepEqual(settings.openServerLogsKeybind, ['Meta', 'g']);
  assert.equal(repairs.length, 2);
  assert.equal(repairs.some(repair => repair.reason === 'invalid'), true);
  assert.equal(repairs.some(repair => repair.reason === 'normalized'), true);

  const conflicting = {
    openLogsKeybind: ['Control', 'm'],
    openFilteredLogsKeybind: ['Control', 'Shift', 'm'],
    openServerLogsKeybind: ['Control', 's']
  };
  const conflictRepairs = plugin.ensureLoggerKeybindSettings(conflicting, defaults);
  assert.deepEqual(conflicting.openLogsKeybind, ['Control', 'm']);
  assert.deepEqual(conflicting.openFilteredLogsKeybind, ['Control', 'n']);
  assert.deepEqual(conflicting.openServerLogsKeybind, ['Control', 's']);
  assert.equal(conflictRepairs.some(repair => repair.reason === 'conflict'), true);

  const laterConflict = {
    openLogsKeybind: ['Alt', 'L'],
    openFilteredLogsKeybind: ['Control', 's'],
    openServerLogsKeybind: ['Control', 'Shift', 's']
  };
  plugin.ensureLoggerKeybindSettings(laterConflict, defaults);
  assert.deepEqual(laterConflict.openLogsKeybind, ['Alt', 'l']);
  assert.deepEqual(laterConflict.openFilteredLogsKeybind, ['Control', 'n']);
  assert.deepEqual(laterConflict.openServerLogsKeybind, ['Control', 'Shift', 's']);
});

test('runtime validation rejects identical and subset bindings without changing saved settings', () => {
  const plugin = createPlugin({
    settings: {
      openLogsKeybind: ['Control', 'm'],
      openFilteredLogsKeybind: ['Control', 'n'],
      openServerLogsKeybind: ['Control', 's']
    }
  });

  assert.equal(plugin.validateLoggerKeybind(['Control', 'm'], 'openFilteredLogsKeybind').valid, false);
  assert.equal(plugin.validateLoggerKeybind(['Control', 'Shift', 'm'], 'openFilteredLogsKeybind').valid, false);
  assert.equal(plugin.validateLoggerKeybind(['Control', 'Shift', 'n'], 'openLogsKeybind').valid, false);
  assert.equal(plugin.validateLoggerKeybind(['Control', 'Shift', 's'], 'openFilteredLogsKeybind').valid, false);
  assert.deepEqual(
    plugin.validateLoggerKeybind(['Alt', 'Shift', 'k'], 'openFilteredLogsKeybind'),
    { valid: true, value: ['Alt', 'Shift', 'k'] }
  );
});

test('global shortcut matching is exact, order independent, repeat safe, and consumes only matches', () => {
  const actions = [];
  const plugin = createPlugin({
    settings: {
      openLogsKeybind: ['Control', 'm'],
      openFilteredLogsKeybind: ['Alt', 'Shift', 'k'],
      openServerLogsKeybind: ['Control', 's']
    },
    _pressedShortcutKeys: new Set(),
    openLogsFromShortcut(scope) { actions.push(scope); }
  });

  const control = keyboardEvent('Control');
  assert.equal(plugin.handleLoggerShortcutKeydown(control), false);
  assert.deepEqual(control.calls, { preventDefault: 0, stopPropagation: 0, stopImmediatePropagation: 0 });

  const openAll = keyboardEvent('M');
  assert.equal(plugin.handleLoggerShortcutKeydown(openAll), true);
  assert.deepEqual(actions, ['all']);
  assert.deepEqual(openAll.calls, { preventDefault: 1, stopPropagation: 1, stopImmediatePropagation: 1 });
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('m', { repeat: true })), false);
  assert.deepEqual(actions, ['all']);

  plugin.handleLoggerShortcutKeyup(keyboardEvent('m'));
  plugin.handleLoggerShortcutKeyup(keyboardEvent('Control'));
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Shift'));
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Alt'));
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('K')), true);
  assert.deepEqual(actions, ['all', 'channel']);

  plugin.handleLoggerShortcutKeyup(keyboardEvent('Alt'));
  plugin._pressedShortcutKeys.clear();
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Control'));
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('S')), true);
  assert.deepEqual(actions, ['all', 'channel', 'server']);

  // A modifier release clears a whole potentially stale browser chord even if the browser
  // omitted the companion character keyup (a known Meta/OS shortcut behavior).
  plugin.handleLoggerShortcutKeyup(keyboardEvent('Control'));
  assert.equal(plugin._pressedShortcutKeys.size, 0);

  plugin.settings.openLogsKeybind = [];
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Control'));
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('m')), false);
  assert.deepEqual(actions, ['all', 'channel', 'server']);

  plugin._pressedShortcutKeys.clear();
  plugin.settings.openLogsKeybind = ['m'];
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('m')), false);
  assert.deepEqual(actions, ['all', 'channel', 'server']);
});

test('shortcuts toggle matching manually opened all, channel, and server logger states closed', () => {
  const all = createShortcutModalPlugin({ openKeys: ['logger-modal'], filter: '' });
  assert.equal(all.plugin.openLogsFromShortcut('all'), true);
  assert.equal(all.opened, 0);
  assert.equal(all.modalKeys.has('logger-modal'), false);
  assert.equal(all.plugin.menu.open, false);
  assert.equal(all.plugin.menu.filter, '');

  const filtered = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: 'channel:live-channel'
  });
  assert.equal(filtered.plugin.openLogsFromShortcut('channel'), true);
  assert.equal(filtered.opened, 0);
  assert.equal(filtered.modalKeys.has('logger-modal'), false);
  assert.equal(filtered.plugin.menu.open, false);

  const server = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: 'server:live-guild'
  });
  assert.equal(server.plugin.openLogsFromShortcut('server'), true);
  assert.equal(server.opened, 0);
  assert.equal(server.modalKeys.has('logger-modal'), false);
  assert.equal(server.plugin.menu.open, false);
});

test('shortcuts close and reopen when switching all, channel, server, or custom manual states', async () => {
  const state = createShortcutModalPlugin({ openKeys: ['logger-modal'], filter: '' });

  assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
  await waitForShortcutTransition();
  assert.equal(state.opened, 1);
  assert.equal(state.plugin.menu.filter, 'channel:live-channel');
  assert.equal(state.modalKeys.has('logger-modal'), true);

  assert.equal(state.plugin.openLogsFromShortcut('server'), true);
  await waitForShortcutTransition();
  assert.equal(state.opened, 2);
  assert.equal(state.plugin.menu.filter, 'server:live-guild');

  assert.equal(state.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.equal(state.opened, 3);
  assert.equal(state.plugin.menu.filter, '');

  state.plugin.menu.filter = 'message:custom';
  assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
  await waitForShortcutTransition();
  assert.equal(state.opened, 4);
  assert.equal(state.plugin.menu.filter, 'channel:live-channel');
});

test('stacked MessageLogger help pages close top-down before the matching logger reopens', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal', 'filter-help', 'logger-help', 'unrelated-discord-modal'],
    filter: ''
  });
  // Only keys opened through MessageLogger are owned. The unrelated modal must not be touched.
  state.plugin._loggerOwnedModalKeys.delete('unrelated-discord-modal');
  // Reopening a stable named page must move it to the top of the owned stack.
  state.plugin.trackLoggerOwnedModalKey('filter-help');

  assert.equal(state.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.deepEqual(state.closeOrder, ['filter-help', 'logger-help', 'logger-modal']);
  assert.equal(state.opened, 1);
  assert.equal(state.modalKeys.has('logger-modal'), true);
  assert.equal(state.modalKeys.has('unrelated-discord-modal'), true);
  assert.equal(state.popoutCloses, 1);
});

test('a matching logger with an owned popout closes the popout and reopens the logger', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: '',
    popoutCount: 1
  });

  assert.equal(state.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.equal(state.popoutCloses, 1);
  assert.equal(state.opened, 1);
  assert.equal(state.modalKeys.has('logger-modal'), true);
});

test('any native Discord media viewer closes before the requested logger state opens', async () => {
  const normalDiscordMedia = createShortcutModalPlugin({ mediaViewerOpen: true });

  assert.equal(normalDiscordMedia.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.deepEqual(normalDiscordMedia.closeOrder, ['discord-media-viewer']);
  assert.equal(normalDiscordMedia.modalKeys.has('discord-media-viewer'), false);
  assert.equal(normalDiscordMedia.opened, 1);
  assert.equal(normalDiscordMedia.modalKeys.has('logger-modal'), true);

  const loggerMedia = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: '',
    mediaViewerOpen: true
  });

  assert.equal(loggerMedia.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.deepEqual(loggerMedia.closeOrder, ['discord-media-viewer', 'logger-modal']);
  assert.equal(loggerMedia.opened, 1, 'the matching logger reopens after its overlaid media viewer closes');
  assert.equal(loggerMedia.modalKeys.has('logger-modal'), true);
});

test('rapid shortcut switches cancel stale queued logger reopens', async () => {
  const state = createShortcutModalPlugin({ openKeys: ['logger-modal'], filter: '' });
  assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
  assert.equal(state.plugin.openLogsFromShortcut('server'), true);
  await waitForShortcutTransition();
  assert.equal(state.opened, 1);
  assert.equal(state.plugin.menu.filter, 'server:live-guild');
  assert.equal(state.modalKeys.has('logger-modal'), true);
});

test('a stale menu flag after modal close reopens the requested actual state', async () => {
  const state = createShortcutModalPlugin({ filter: 'channel:stale' });
  state.plugin.menu.open = true;

  assert.equal(state.plugin.openLogsFromShortcut('all'), true);
  assert.equal(state.plugin.menu.open, false);
  assert.equal(state.plugin.menu.filter, '');
  assert.equal(state.plugin.menu.shownMessages, -1);
  assert.deepEqual(state.plugin.menu.messages, []);
  await waitForShortcutTransition();
  assert.equal(state.opened, 1);
  assert.equal(state.plugin.menu.open, true);
});

test('filtered shortcut fails visibly when no text channel is selected', () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: '',
    selectedChannelId: null
  });
  const { plugin } = state;

  assert.equal(plugin.openLogsFromShortcut('channel'), false);
  assert.equal(toastEvents.length, 1);
  assert.match(toastEvents[0][0], /Select a channel/);
  assert.equal(state.modalKeys.has('logger-modal'), true, 'failed navigation must leave the current logger untouched');
  assert.deepEqual(state.closeOrder, []);
});

test('server shortcut fails visibly outside a server and preserves the current logger', () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: '',
    selectedGuildId: null
  });

  assert.equal(state.plugin.openLogsFromShortcut('server'), false);
  assert.equal(toastEvents.length, 1);
  assert.match(toastEvents[0][0], /Select a server/);
  assert.equal(state.modalKeys.has('logger-modal'), true);
  assert.deepEqual(state.closeOrder, []);
});

test('all-log and channel shortcuts remain available in DMs and group DMs', async () => {
  const dm = createShortcutModalPlugin({
    selectedChannelId: 'dm-or-group-channel',
    selectedGuildId: null
  });

  assert.equal(dm.plugin.openLogsFromShortcut('channel'), true);
  await waitForShortcutTransition();
  assert.equal(dm.plugin.menu.filter, 'channel:dm-or-group-channel');

  assert.equal(dm.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.equal(dm.plugin.menu.filter, '');
  assert.equal(toastEvents.length, 0);
});
