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
  popoutStack = [],
  popoutMapAvailable = true,
  selectedChannelId = 'live-channel',
  selectedGuildId = 'live-guild',
  mediaViewerOpen = false
} = {}) {
  const modalKeys = new Set(openKeys);
  if (mediaViewerOpen) modalKeys.add('discord-media-viewer');
  const modalOrder = [...openKeys, ...(mediaViewerOpen ? ['discord-media-viewer'] : [])];
  const closeOrder = [];
  let opened = 0;
  let refreshed = 0;
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
      useModalsStore: {
        getState() {
          return { default: modalOrder.filter(key => modalKeys.has(key)).map(key => ({ key })), popout: [] };
        }
      },
      closeModal(key) {
        closeOrder.push(key);
        modalKeys.delete(key);
        for (let index = modalOrder.length - 1; index >= 0; index--) {
          if (modalOrder[index] === key) modalOrder.splice(index, 1);
        }
      }
    },
    tools: {
      getNativeMediaModal() {
        return { modalKey: 'discord-media-viewer' };
      },
      popoutStack,
      popoutManager: {
        popouts: popoutMapAvailable
          ? new Map(Array.from({ length: popoutCount }, (_, index) => [index, {}]))
          : {},
        closeAllPopouts() {
          popoutCloses++;
          this.popouts?.clear?.();
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
      modalOrder.push(this.style.menu);
      this.trackLoggerOwnedModalKey(this.style.menu);
    },
    notifyUser(...args) { toastEvents.push(args); }
  });
  const refreshLoggerMenu = plugin.refreshLoggerMenu;
  plugin.refreshLoggerMenu = function () {
    refreshed++;
    return refreshLoggerMenu.call(this);
  };
  return {
    closeOrder,
    modalKeys,
    plugin,
    get opened() { return opened; },
    get refreshed() { return refreshed; },
    get popoutCloses() { return popoutCloses; }
  };
}

function installShortcutMenuDocument(plugin, onRefilter = () => {}) {
  const hadDocument = Object.prototype.hasOwnProperty.call(global, 'document');
  const previousDocument = global.document;
  const input = { value: plugin.menu.filter };
  const messagesRoot = {};
  plugin.style.filter = 'logger-filter-input';
  plugin.style.menuMessages = 'logger-menu-messages';
  plugin.refilterMessages = onRefilter;
  global.document = {
    getElementById(id) {
      if (id === plugin.style.filter) return input;
      if (id === plugin.style.menuMessages) return messagesRoot;
      return null;
    }
  };
  return {
    input,
    restore() {
      if (hadDocument) global.document = previousDocument;
      else delete global.document;
    }
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

test('matching Ctrl+M closes all logs while matching channel/server shortcuts keep Logger open', () => {
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
  const filteredDom = installShortcutMenuDocument(filtered.plugin);
  try {
    assert.equal(filtered.plugin.openLogsFromShortcut('channel'), true);
    assert.equal(filtered.opened, 0);
    assert.equal(filtered.modalKeys.has('logger-modal'), true);
    assert.equal(filtered.plugin.menu.open, true);
    assert.equal(filtered.plugin.menu.filter, 'channel:live-channel');
  } finally {
    filteredDom.restore();
  }

  const server = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: 'server:live-guild'
  });
  const serverDom = installShortcutMenuDocument(server.plugin);
  try {
    assert.equal(server.plugin.openLogsFromShortcut('server'), true);
    assert.equal(server.opened, 0);
    assert.equal(server.modalKeys.has('logger-modal'), true);
    assert.equal(server.plugin.menu.open, true);
    assert.equal(server.plugin.menu.filter, 'server:live-guild');
  } finally {
    serverDom.restore();
  }
});

test('channel/server shortcuts switch an open Logger in place while Ctrl+M clears its filter', async () => {
  const state = createShortcutModalPlugin({ openKeys: ['logger-modal'], filter: '' });
  state.plugin.menu.selectedTab = 'edited';
  let refilterCalls = 0;
  const dom = installShortcutMenuDocument(state.plugin, () => { refilterCalls++; });

  try {
    assert.equal(state.plugin.isLoggerShortcutModalForeground(true), true);
    assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
    await waitForShortcutTransition();
    assert.equal(state.opened, 0, 'switching an already-open Logger does not reopen it');
    assert.equal(state.closeOrder.length, 0, 'the main modal remains mounted');
    assert.equal(state.plugin.menu.filter, 'channel:live-channel');
    assert.equal(state.modalKeys.has('logger-modal'), true);
    assert.equal(state.plugin.menu.selectedTab, 'edited');
    assert.equal(state.plugin.menu.scrollPosition, 0);
    assert.equal(state.refreshed, 1);

    assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
    assert.equal(state.refreshed, 1, 'repeating the matching channel shortcut is a no-op');
    assert.equal(state.closeOrder.length, 0);

    assert.equal(state.plugin.openLogsFromShortcut('server'), true);
    await waitForShortcutTransition();
    assert.equal(state.opened, 0);
    assert.equal(state.plugin.menu.filter, 'server:live-guild');
    assert.equal(state.refreshed, 2);

    state.plugin.menu.selectedTab = 'edited';
    const closeCountBeforeClear = state.closeOrder.length;
    assert.equal(state.plugin.openLogsFromShortcut('all'), true);
    assert.equal(state.opened, 0, 'clearing an open filter does not reopen the main modal');
    assert.equal(state.plugin.menu.open, true);
    assert.equal(state.modalKeys.has('logger-modal'), true);
    assert.equal(state.closeOrder.length, closeCountBeforeClear);
    assert.equal(state.plugin.menu.filter, '');
    assert.equal(dom.input.value, '');
    assert.equal(refilterCalls, 3);
    assert.equal(state.plugin.menu.shownMessages, -1);
    assert.equal(state.plugin.menu.selectedTab, 'edited');

    state.plugin.menu.filter = 'message:custom';
    assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
    await waitForShortcutTransition();
    assert.equal(state.opened, 0);
    assert.equal(state.plugin.menu.filter, 'channel:live-channel');
    assert.equal(state.refreshed, 4);
  } finally {
    dom.restore();
  }
});

test('Ctrl+M clears channel, server, and custom filters in place and cancels stale callbacks', async () => {
  for (const filter of ['channel:live-channel', 'server:live-guild', 'message:custom']) {
    const state = createShortcutModalPlugin({ openKeys: ['logger-modal'], filter });
    state.plugin.menu.selectedTab = 'edited';
    let refilterCalls = 0;
    let staleFilterRuns = 0;
    let staleReopenRuns = 0;
    const dom = installShortcutMenuDocument(state.plugin, () => { refilterCalls++; });
    state.plugin.menu.filterSetTimeout = setTimeout(() => { staleFilterRuns++; }, 10);
    state.plugin._loggerShortcutReopenTimeout = setTimeout(() => { staleReopenRuns++; }, 10);

    try {
      assert.equal(state.plugin.openLogsFromShortcut('all'), true);
      assert.equal(state.plugin.menu.open, true);
      assert.equal(state.modalKeys.has('logger-modal'), true);
      assert.deepEqual(state.closeOrder, []);
      assert.equal(state.popoutCloses, 0);
      assert.equal(state.opened, 0);
      assert.equal(state.plugin.menu.filter, '');
      assert.equal(dom.input.value, '');
      assert.equal(state.plugin.menu.filterSetTimeout, null);
      assert.equal(state.plugin._loggerShortcutReopenTimeout, null);
      assert.equal(state.plugin.menu.selectedTab, 'edited');
      assert.equal(state.plugin.menu.scrollPosition, 0);
      assert.equal(refilterCalls, 1);

      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(staleFilterRuns, 0);
      assert.equal(staleReopenRuns, 0);

      assert.equal(state.plugin.openLogsFromShortcut('all'), true, 'the next Ctrl+M closes the now-unfiltered logger');
      assert.equal(state.plugin.menu.open, false);
      assert.equal(state.modalKeys.has('logger-modal'), false);
      assert.deepEqual(state.closeOrder, ['logger-modal']);
    } finally {
      dom.restore();
    }
  }
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
  for (const filter of ['', 'channel:live-channel']) {
    const state = createShortcutModalPlugin({
      openKeys: ['logger-modal'],
      filter,
      popoutCount: 1
    });

    assert.equal(state.plugin.openLogsFromShortcut('all'), true);
    await waitForShortcutTransition();
    assert.equal(state.popoutCloses, 1);
    assert.equal(state.opened, 1);
    assert.equal(state.plugin.menu.filter, '', 'an active popout keeps the existing dismiss-and-reopen transition');
    assert.equal(state.modalKeys.has('logger-modal'), true);
    assert.equal(state.plugin.tools.popoutStack.length, 0, 'a live Map entry is authoritative even with an empty legacy stack');
  }
});

test('an empty popout Map ignores stale legacy stack entries when toggling the logger closed', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: '',
    popoutStack: [{ stale: true }]
  });
  assert.equal(state.plugin.tools.popoutManager.popouts.size, 0);

  assert.equal(state.plugin.openLogsFromShortcut('all'), true);
  await waitForShortcutTransition();
  assert.equal(state.opened, 0, 'stale stack entries must not trigger a redundant reopen');
  assert.equal(state.modalKeys.has('logger-modal'), false);
  assert.equal(state.plugin.tools.popoutStack.length, 1, 'the fix does not mutate legacy stack ownership');
});

test('legacy popout stacks remain a fallback when the manager has no numeric Map size', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: '',
    popoutStack: [{ legacy: true }],
    popoutMapAvailable: false
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

test('rapid channel/server switches cancel stale callbacks without rebuilding the open Logger', async () => {
  const state = createShortcutModalPlugin({ openKeys: ['logger-modal'], filter: '' });
  const dom = installShortcutMenuDocument(state.plugin);
  let staleInputRuns = 0;
  state.plugin.menu.filterSetTimeout = setTimeout(() => { staleInputRuns++; }, 10);
  let staleReopenRuns = 0;
  state.plugin._loggerShortcutReopenTimeout = setTimeout(() => { staleReopenRuns++; }, 10);
  assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
  assert.equal(state.plugin.openLogsFromShortcut('server'), true);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(staleInputRuns, 0);
  assert.equal(staleReopenRuns, 0);
  assert.equal(state.opened, 0);
  assert.deepEqual(state.closeOrder, []);
  assert.equal(state.plugin.menu.filter, 'server:live-guild');
  assert.equal(state.modalKeys.has('logger-modal'), true);
  dom.restore();
});

test('a covered Logger uses close/reopen while an unrelated modal remains open', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal', 'unrelated-discord-modal'],
    filter: 'message:custom'
  });
  state.plugin._loggerOwnedModalKeys.delete('unrelated-discord-modal');
  const dom = installShortcutMenuDocument(state.plugin);
  try {
    assert.equal(state.plugin.isLoggerShortcutModalForeground(true), false);
    assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
    await waitForShortcutTransition();
    assert.deepEqual(state.closeOrder, ['logger-modal']);
    assert.equal(state.modalKeys.has('logger-modal'), true);
    assert.equal(state.modalKeys.has('unrelated-discord-modal'), true);
    assert.equal(state.plugin.menu.filter, 'channel:live-channel');
    assert.equal(state.opened, 1);
  } finally {
    dom.restore();
  }

  const coveredMatching = createShortcutModalPlugin({
    openKeys: ['logger-modal', 'unrelated-discord-modal'],
    filter: 'channel:live-channel'
  });
  coveredMatching.plugin._loggerOwnedModalKeys.delete('unrelated-discord-modal');
  const coveredMatchingDom = installShortcutMenuDocument(coveredMatching.plugin);
  try {
    assert.equal(coveredMatching.plugin.openLogsFromShortcut('channel'), true);
    await waitForShortcutTransition();
    assert.deepEqual(coveredMatching.closeOrder, ['logger-modal']);
    assert.equal(coveredMatching.modalKeys.has('logger-modal'), true);
    assert.equal(coveredMatching.modalKeys.has('unrelated-discord-modal'), true);
    assert.equal(coveredMatching.plugin.menu.filter, 'channel:live-channel');
    assert.equal(coveredMatching.opened, 1, 'the matching non-all shortcut restores Logger above the unrelated modal');
  } finally {
    coveredMatchingDom.restore();
  }

  const unavailable = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: 'message:custom'
  });
  unavailable.plugin.ModalStack.useModalsStore = undefined;
  const unavailableDom = installShortcutMenuDocument(unavailable.plugin);
  try {
    assert.equal(unavailable.plugin.isLoggerShortcutModalForeground(true), false);
    assert.equal(unavailable.plugin.openLogsFromShortcut('channel'), true);
    await waitForShortcutTransition();
    assert.deepEqual(unavailable.closeOrder, ['logger-modal']);
    assert.equal(unavailable.opened, 1);
    assert.equal(unavailable.plugin.menu.filter, 'channel:live-channel');
  } finally {
    unavailableDom.restore();
  }
});

test('a matching shortcut applies a pending typed filter once, then repeats as a no-op', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal'],
    filter: 'channel:live-channel'
  });
  let staleFilterRuns = 0;
  const dom = installShortcutMenuDocument(state.plugin);
  dom.input.value = 'channel:live-channel';
  state.plugin.menu.filterSetTimeout = setTimeout(() => { staleFilterRuns++; }, 10);
  try {
    assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
    assert.equal(state.plugin.menu.filterSetTimeout, null);
    assert.equal(state.refreshed, 1, 'the pending typed filter is rendered before its timer is cancelled');
    assert.equal(dom.input.value, 'channel:live-channel');

    assert.equal(state.plugin.openLogsFromShortcut('channel'), true);
    assert.equal(state.refreshed, 1, 'a repeated matching shortcut does not rebuild rows');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(staleFilterRuns, 0);
  } finally {
    dom.restore();
  }
});

test('filter input ignores unchanged shortcut keyups and clears completed or cancelled pending work', () => {
  const source = require('node:fs').readFileSync(require.resolve('../MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('    const onUpdate = e => {');
  const end = source.indexOf("    inputEl.addEventListener('keyup', onUpdate);", start);
  assert.ok(start >= 0 && end > start, 'exercise the real filter input callback');
  const input = { value: '' };
  const queued = new Map();
  let nextTimer = 0;
  let refilters = 0;
  const plugin = createPlugin({ menu: { filter: '', filterSetTimeout: null }, refilterMessages() { refilters++; } });
  const onUpdate = new Function('inputEl', 'setTimeout', 'clearTimeout', `${source.slice(start, end)}; return onUpdate;`).call(
    plugin, input, callback => { queued.set(++nextTimer, callback); return nextTimer; }, id => queued.delete(id)
  );

  onUpdate({ key: 'Control' });
  assert.equal(queued.size, 0);
  input.value = 'channel:live-channel';
  onUpdate({ key: 'l' });
  const timer = plugin.menu.filterSetTimeout;
  onUpdate({ key: 'Control' });
  assert.equal(queued.size, 1, 'modifier release keeps the original pending filter');
  assert.equal(plugin.menu.filterSetTimeout, timer);
  const finish = queued.get(timer);
  queued.delete(timer);
  finish();
  assert.equal(plugin.menu.filterSetTimeout, null, 'a completed timer is no longer pending');
  assert.equal(refilters, 1);

  input.value = 'server:live-guild';
  onUpdate({ key: 'd' });
  input.value = '';
  onUpdate({ key: 'Backspace' });
  assert.equal(queued.size, 0);
  assert.equal(plugin.menu.filterSetTimeout, null, 'clearing the filter cancels pending work');
  assert.equal(refilters, 2);
});

test('channel/server switches close and reopen around MessageLogger auxiliary overlays and native media', async () => {
  const state = createShortcutModalPlugin({
    openKeys: ['logger-modal', 'filter-help', 'unrelated-discord-modal'],
    filter: 'message:custom',
    mediaViewerOpen: true,
    popoutCount: 1
  });
  state.plugin._loggerOwnedModalKeys.delete('unrelated-discord-modal');
  const dom = installShortcutMenuDocument(state.plugin);
  try {
    assert.equal(state.plugin.openLogsFromShortcut('server'), true);
    await waitForShortcutTransition();
    assert.deepEqual(state.closeOrder, ['discord-media-viewer', 'filter-help', 'logger-modal']);
    assert.equal(state.modalKeys.has('logger-modal'), true);
    assert.equal(state.modalKeys.has('unrelated-discord-modal'), true);
    assert.equal(state.plugin.menu.filter, 'server:live-guild');
    assert.equal(state.popoutCloses, 1);
    assert.equal(state.opened, 1);
  } finally {
    dom.restore();
  }
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
  const dom = installShortcutMenuDocument(dm.plugin);

  try {
    assert.equal(dm.plugin.openLogsFromShortcut('channel'), true);
    await waitForShortcutTransition();
    assert.equal(dm.plugin.menu.filter, 'channel:dm-or-group-channel');

    assert.equal(dm.plugin.openLogsFromShortcut('all'), true);
    assert.equal(dm.plugin.menu.filter, '');
    assert.equal(dm.opened, 1, 'Ctrl+M clears the channel filter without another open');
    assert.equal(dm.modalKeys.has('logger-modal'), true);
    assert.equal(toastEvents.length, 0);
  } finally {
    dom.restore();
  }
});
