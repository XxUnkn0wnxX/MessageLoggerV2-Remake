const assert = require('node:assert/strict');
const test = require('node:test');

const { createPlugin, resetHarness, toastEvents } = require('./helpers/plugin-harness');

const defaults = {
  openLogsKeybind: ['Control', 'm'],
  openFilteredLogsKeybind: ['Control', 'n']
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
    openFilteredLogsKeybind: ['Alt', 'K']
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

  settings.openLogsKeybind = [];
  settings.openFilteredLogsKeybind = ['Control', 123];
  const repairs = plugin.ensureLoggerKeybindSettings(settings, defaults);
  assert.deepEqual(settings.openLogsKeybind, []);
  assert.deepEqual(settings.openFilteredLogsKeybind, ['Control', 'n']);
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].reason, 'invalid');

  const conflicting = {
    openLogsKeybind: ['Control', 'm'],
    openFilteredLogsKeybind: ['Control', 'Shift', 'm']
  };
  const conflictRepairs = plugin.ensureLoggerKeybindSettings(conflicting, defaults);
  assert.deepEqual(conflicting.openLogsKeybind, ['Control', 'm']);
  assert.deepEqual(conflicting.openFilteredLogsKeybind, ['Control', 'n']);
  assert.equal(conflictRepairs.some(repair => repair.reason === 'conflict'), true);
});

test('runtime validation rejects identical and subset bindings without changing saved settings', () => {
  const plugin = createPlugin({
    settings: {
      openLogsKeybind: ['Control', 'm'],
      openFilteredLogsKeybind: ['Control', 'n']
    }
  });

  assert.equal(plugin.validateLoggerKeybind(['Control', 'm'], 'openFilteredLogsKeybind').valid, false);
  assert.equal(plugin.validateLoggerKeybind(['Control', 'Shift', 'm'], 'openFilteredLogsKeybind').valid, false);
  assert.equal(plugin.validateLoggerKeybind(['Control', 'Shift', 'n'], 'openLogsKeybind').valid, false);
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
      openFilteredLogsKeybind: ['Alt', 'Shift', 'k']
    },
    _pressedShortcutKeys: new Set(),
    openLogsFromShortcut(filtered) { actions.push(filtered); }
  });

  const control = keyboardEvent('Control');
  assert.equal(plugin.handleLoggerShortcutKeydown(control), false);
  assert.deepEqual(control.calls, { preventDefault: 0, stopPropagation: 0, stopImmediatePropagation: 0 });

  const openAll = keyboardEvent('M');
  assert.equal(plugin.handleLoggerShortcutKeydown(openAll), true);
  assert.deepEqual(actions, [false]);
  assert.deepEqual(openAll.calls, { preventDefault: 1, stopPropagation: 1, stopImmediatePropagation: 1 });
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('m', { repeat: true })), false);
  assert.deepEqual(actions, [false]);

  plugin.handleLoggerShortcutKeyup(keyboardEvent('m'));
  plugin.handleLoggerShortcutKeyup(keyboardEvent('Control'));
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Shift'));
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Alt'));
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('K')), true);
  assert.deepEqual(actions, [false, true]);

  // A modifier release clears a whole potentially stale browser chord even if the browser
  // omitted the companion character keyup (a known Meta/OS shortcut behavior).
  plugin.handleLoggerShortcutKeyup(keyboardEvent('Alt'));
  assert.equal(plugin._pressedShortcutKeys.size, 0);

  plugin.settings.openLogsKeybind = [];
  plugin.handleLoggerShortcutKeydown(keyboardEvent('Control'));
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('m')), false);
  assert.deepEqual(actions, [false, true]);

  plugin._pressedShortcutKeys.clear();
  plugin.settings.openLogsKeybind = ['m'];
  assert.equal(plugin.handleLoggerShortcutKeydown(keyboardEvent('m')), false);
  assert.deepEqual(actions, [false, true]);
});

test('shortcut actions clear stale filters, resolve the live channel, and refilter an open logger', () => {
  let opened = 0;
  let refiltered = 0;
  const plugin = createPlugin({
    menu: { open: false, filter: 'channel:stale', scrollPosition: 99 },
    openWindow() { opened++; },
    refilterMessages() { refiltered++; },
    getSelectedTextChannel() { return { id: 'live-channel' }; },
    showToast(...args) { toastEvents.push(args); }
  });

  assert.equal(plugin.openLogsFromShortcut(false), true);
  assert.equal(plugin.menu.filter, '');
  assert.equal(plugin.menu.scrollPosition, 0);
  assert.equal(opened, 1);

  assert.equal(plugin.openLogsFromShortcut(true), true);
  assert.equal(plugin.menu.filter, 'channel:live-channel');
  assert.equal(opened, 2);

  plugin.menu.open = true;
  assert.equal(plugin.openLogsFromShortcut(false), true);
  assert.equal(plugin.menu.filter, '');
  assert.equal(refiltered, 1);
  assert.equal(opened, 2);
});

test('a stale menu flag after modal close reopens instead of refiltering detached UI', () => {
  let opened = 0;
  let refiltered = 0;
  const plugin = createPlugin({
    style: { menu: 'logger-modal' },
    ModalStack: { hasModalOpen() { return false; } },
    menu: { open: true, filter: 'channel:stale', scrollPosition: 10, shownMessages: 5, messages: ['old'] },
    openWindow() { opened++; },
    refilterMessages() { refiltered++; }
  });

  assert.equal(plugin.openLogsFromShortcut(false), true);
  assert.equal(plugin.menu.open, false);
  assert.equal(plugin.menu.filter, '');
  assert.equal(plugin.menu.shownMessages, -1);
  assert.deepEqual(plugin.menu.messages, []);
  assert.equal(opened, 1);
  assert.equal(refiltered, 0);
});

test('filtered shortcut fails visibly when no text channel is selected', () => {
  const plugin = createPlugin({
    menu: { open: false, filter: '', scrollPosition: 0 },
    selectedChannel: null,
    getSelectedTextChannel() { return null; },
    showToast(...args) { toastEvents.push(args); }
  });

  assert.equal(plugin.openLogsFromShortcut(true), false);
  assert.equal(toastEvents.length, 1);
  assert.match(toastEvents[0][0], /Select a channel/);
});
