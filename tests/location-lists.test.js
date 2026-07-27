const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ContextMenu, createPlugin, React, resetHarness, Webpack } = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');

test.beforeEach(resetHarness);

function listSettings(overrides = {}) {
  return {
    whitelist: [],
    blacklist: [],
    notificationWhitelist: [],
    notificationBlacklist: [],
    ...overrides
  };
}

function collectReactElements(node, output = []) {
  if (Array.isArray(node)) {
    node.forEach(child => collectReactElements(child, output));
    return output;
  }
  if (!node || typeof node !== 'object' || !node.props) return output;
  output.push(node);
  collectReactElements(node.props.children, output);
  return output;
}

test('location list descriptors retain the four persisted list keys and labels', () => {
  const plugin = createPlugin({ settings: listSettings() });
  assert.deepEqual(plugin.getLocationListDescriptors(), [
    { key: 'whitelist', label: 'Logging Whitelist' },
    { key: 'blacklist', label: 'Logging Blacklist' },
    { key: 'notificationWhitelist', label: 'Notification Whitelist' },
    { key: 'notificationBlacklist', label: 'Notification Blacklist' }
  ]);
});

test('location list entries classify live guilds, channels, threads, DMs, and unknown IDs', () => {
  const guild = { id: 'guild-1', name: 'Alpha' };
  const channels = {
    'channel-1': { id: 'channel-1', name: 'general', guild_id: 'guild-1', type: 0 },
    'thread-1': { id: 'thread-1', name: 'topic', guild_id: 'guild-1', type: 11 },
    'dm-1': { id: 'dm-1', type: 1, recipients: ['user-1'] }
  };
  const plugin = createPlugin({
    settings: listSettings(),
    tools: {
      getServer: id => id === guild.id ? guild : null,
      getChannel: id => channels[id] || null,
      getUser: id => id === 'user-1' ? { id, username: 'Ada' } : null
    }
  });

  assert.equal(plugin.resolveLocationListEntry('guild-1').kind, 'guild');
  assert.equal(plugin.resolveLocationListEntry('channel-1').group, 'Channels & Threads');
  assert.equal(plugin.resolveLocationListEntry('thread-1').kind, 'thread');
  assert.equal(plugin.resolveLocationListEntry('dm-1').name, 'Ada');
  assert.deepEqual(plugin.resolveLocationListEntry('unknown-1'), {
    id: 'unknown-1',
    kind: 'unknown',
    group: 'Unavailable IDs',
    name: 'unknown-1',
    guild: null,
    channel: null,
    resolved: false
  });
});

test('location list display names prefer live entries, newest saved guild names, then raw IDs', () => {
  const plugin = createPlugin({
    messageRecord: {
      old: {
        message: { guild_id: 'saved-guild', channel_id: 'saved-channel', timestamp: '2024-01-01T00:00:00.000Z' },
        saved_location: {
          guildId: 'saved-guild',
          guildName: 'Old Guild',
          channelName: 'Old Channel',
          cachedAt: '2024-01-02T00:00:00.000Z'
        }
      },
      newest: {
        message: { guild_id: 'saved-guild', channel_id: 'saved-channel', timestamp: '2024-01-03T00:00:00.000Z' },
        delete_data: {
          location: {
            guildId: 'saved-guild',
            guildName: 'Newest Guild',
            channel_id: 'saved-channel',
            channel_name: 'Newest Channel',
            cachedAt: '2024-01-04T00:00:00.000Z'
          }
        }
      },
      camel: {
        message: { channelId: 'camel-channel', timestamp: '2024-01-05T00:00:00.000Z' },
        saved_location: { channelName: 'Camel Channel', cachedAt: '2024-01-06T00:00:00.000Z' }
      }
    },
    tools: {
      getServer: id => id === 'live-guild' ? { id, name: 'Alpha' } : null,
      getChannel: id => ({
        'channel-1': { id, name: 'general', guild_id: 'live-guild', type: 0 },
        'thread-1': { id, name: 'topic', guild_id: 'live-guild', type: 11 },
        'dm-1': { id, type: 1, recipients: ['user-1'] }
      }[id] || null),
      getUser: id => id === 'user-1' ? { id, username: 'Ada' } : null
    }
  });

  assert.equal(plugin.getLocationListDisplayName('live-guild'), 'Alpha');
  assert.equal(plugin.getLocationListDisplayName('channel-1'), 'general');
  assert.equal(plugin.getLocationListDisplayName('thread-1'), 'topic');
  assert.equal(plugin.getLocationListDisplayName('dm-1'), 'Ada');
  assert.equal(plugin.getLocationListDisplayName('saved-guild'), 'Newest Guild');
  assert.equal(plugin.getLocationListDisplayName('saved-channel'), 'Newest Channel');
  assert.equal(plugin.getLocationListDisplayName('camel-channel'), 'Camel Channel');
  assert.equal(plugin.getLocationListDisplayName('missing-id'), 'missing-id');
});

test('location-list toggle feedback names the target and destination list', () => {
  const cases = [
    {
      id: 'live-guild',
      listName: 'whitelist',
      oppositeListName: 'blacklist',
      displayName: 'Whitelist',
      action: 0,
      expected: 'Added Alpha to Logging Whitelist.'
    },
    {
      id: 'channel-1',
      listName: 'whitelist',
      oppositeListName: 'blacklist',
      displayName: 'Whitelist',
      settings: { whitelist: ['channel-1'] },
      action: 0,
      expected: 'Removed general from Logging Whitelist.'
    },
    {
      id: 'thread-1',
      listName: 'notificationWhitelist',
      oppositeListName: 'notificationBlacklist',
      displayName: 'Notification Whitelist',
      settings: { notificationWhitelist: ['thread-1'] },
      action: 1,
      expected: 'Moved topic to Notification Blacklist.'
    },
    {
      id: 'saved-guild',
      listName: 'notificationWhitelist',
      oppositeListName: 'notificationBlacklist',
      displayName: 'Notification Whitelist',
      messageRecord: {
        record: {
          message: { guild_id: 'saved-guild', timestamp: '2024-01-01T00:00:00.000Z' },
          saved_location: { guildId: 'saved-guild', guildName: 'Saved Guild', cachedAt: '2024-01-02T00:00:00.000Z' }
        }
      },
      expected: 'Added Saved Guild to Notification Whitelist.'
    },
    {
      id: 'saved-channel',
      listName: 'whitelist',
      oppositeListName: 'blacklist',
      displayName: 'Whitelist',
      messageRecord: {
        record: {
          message: { guild_id: 'saved-guild', channel_id: 'saved-channel', timestamp: '2024-01-03T00:00:00.000Z' },
          delete_data: {
            location: {
              guildId: 'saved-guild',
              guildName: 'Saved Guild',
              channel_id: 'saved-channel',
              channel_name: 'Saved Channel',
              cachedAt: '2024-01-04T00:00:00.000Z'
            }
          }
        }
      },
      expected: 'Added Saved Channel to Logging Whitelist.'
    },
    {
      id: 'raw-id',
      listName: 'whitelist',
      oppositeListName: 'blacklist',
      displayName: 'Whitelist',
      action: 1,
      expected: 'Added raw-id to Logging Blacklist.'
    }
  ];
  for (const item of cases) {
    const plugin = createPlugin({
      settings: listSettings(item.settings),
      messageRecord: item.messageRecord,
      tools: {
        getServer: id => id === 'live-guild' ? { id, name: 'Alpha' } : null,
        getChannel: id => ({
          'channel-1': { id, name: 'general', guild_id: 'live-guild', type: 0 },
          'thread-1': { id, name: 'topic', guild_id: 'live-guild', type: 11 }
        }[id] || null)
      }
    });
    const notices = [];
    plugin.saveSettings = () => {};
    plugin.notifyUser = (message, options) => notices.push({ message, options });
    const items = [];
    plugin._addListToggleItems(items, item.id, item.listName, item.oppositeListName, item.displayName);
    items[item.action || 0].action();
    assert.equal(notices.length, 1);
    assert.equal(notices[0].message, item.expected);
    assert.equal(notices[0].options.type, 'success');
  }
});

test('category-nested guild channels remain channels instead of being mistaken for threads', () => {
  const plugin = createPlugin({
    settings: listSettings(),
    tools: {
      getServer: id => id === 'guild-1' ? { id, name: 'Alpha' } : null,
      getChannel: id => id === 'channel-1'
        ? { id, name: 'general', guild_id: 'guild-1', parent_id: 'category-1', type: 0 }
        : null
    }
  });
  assert.equal(plugin.resolveLocationListEntry('channel-1').kind, 'channel');
});

test('guild resolution falls back to the current GuildStore when tools.getServer is unavailable', () => {
  Webpack.Stores = { GuildStore: { getGuild: id => id === 'guild-store' ? { id, name: 'Store guild' } : null } };
  const plugin = createPlugin({
    settings: listSettings(),
    tools: { getServer: () => null, getChannel: () => null }
  });
  assert.equal(plugin.resolveLocationListEntry('guild-store').name, 'Store guild');
});

test('unavailable guild names prefer the newest valid saved location snapshot and fall back to raw ID', () => {
  const plugin = createPlugin({
    settings: listSettings(),
    messageRecord: {
      old: {
        message: { guild_id: 'missing-guild', timestamp: '2024-01-01T00:00:00.000Z' },
        saved_location: { guildId: 'missing-guild', guildName: 'Old name', cachedAt: '2024-01-02T00:00:00.000Z' }
      },
      newest: {
        message: { guild_id: 'missing-guild', timestamp: '2024-01-03T00:00:00.000Z' },
        delete_data: { location: { guildId: 'missing-guild', guildName: 'Current name', cachedAt: '2024-01-04T00:00:00.000Z' } }
      }
    },
    tools: { getServer: () => null, getChannel: () => null }
  });
  const fallbacks = plugin.buildLocationListGuildNameFallbacks();
  assert.equal(plugin.resolveLocationListEntry('missing-guild', fallbacks).name, 'Current name');
  assert.equal(plugin.resolveLocationListEntry('other-guild', fallbacks).name, 'other-guild');
});

test('current-list duplicate removal preserves other lists and saves/toasts only on change', () => {
  const plugin = createPlugin({
    settings: listSettings({ whitelist: ['guild-1', 'guild-1', 'other'], blacklist: ['guild-1'] })
  });
  let saves = 0;
  const toasts = [];
  plugin.saveSettings = () => { saves++; };
  plugin.notifyUser = (...args) => { toasts.push(args); };

  assert.equal(plugin.removeLocationListIds('whitelist', 'guild-1'), true);
  assert.deepEqual(plugin.settings.whitelist, ['other']);
  assert.deepEqual(plugin.settings.blacklist, ['guild-1']);
  assert.equal(saves, 1);
  assert.equal(toasts.length, 1);
  assert.equal(plugin.removeLocationListIds('whitelist', 'missing'), false);
  assert.equal(saves, 1);
  assert.equal(toasts.length, 1);
  assert.equal(plugin.removeLocationListIds('arbitrary-array', 'other'), false);
  assert.deepEqual(plugin.settings.whitelist, ['other']);
  assert.equal(saves, 1);
  assert.deepEqual(plugin.getLocationListEntries('arbitrary-array'), []);
});

test('the manager renders one logical row for duplicate persisted IDs', () => {
  const plugin = createPlugin({
    settings: listSettings({ whitelist: ['guild-1', 'guild-1'] }),
    tools: {
      getServer: id => id === 'guild-1' ? { id, name: 'Alpha' } : null,
      getChannel: () => null
    }
  });
  assert.equal(plugin.getLocationListEntries('whitelist').length, 1);
});

test('all-four removal de-duplicates each persisted list with one save and toast', () => {
  const plugin = createPlugin({
    settings: listSettings({
      whitelist: ['same', 'same', 'keep'],
      blacklist: ['same'],
      notificationWhitelist: ['keep', 'same'],
      notificationBlacklist: ['same', 'same']
    })
  });
  let saves = 0;
  let toasts = 0;
  plugin.saveSettings = () => { saves++; };
  plugin.notifyUser = () => { toasts++; };
  assert.equal(plugin.removeLocationListIdsFromAll('same'), true);
  assert.deepEqual(plugin.settings, {
    whitelist: ['keep'],
    blacklist: [],
    notificationWhitelist: ['keep'],
    notificationBlacklist: []
  });
  assert.equal(saves, 1);
  assert.equal(toasts, 1);
  assert.equal(plugin.removeLocationListIdsFromAll('same'), false);
  assert.equal(saves, 1);
  assert.equal(toasts, 1);
});

test('grouped root batches remove only the active descriptor list across all four tabs', () => {
  const descriptors = ['whitelist', 'blacklist', 'notificationWhitelist', 'notificationBlacklist'];
  for (const activeKey of descriptors) {
    const settings = listSettings();
    for (const key of descriptors) settings[key] = ['guild-1', 'channel-1', 'thread-1', `${key}-keep`];
    const plugin = createPlugin({ settings });
    let saves = 0;
    const toasts = [];
    plugin.saveSettings = () => { saves++; };
    plugin.notifyUser = (message, options) => { toasts.push({ message, options }); };

    assert.equal(plugin.removeLocationListIdsBatch(activeKey, ['guild-1', 'channel-1', 'thread-1']), true);
    assert.deepEqual(plugin.settings[activeKey], [`${activeKey}-keep`]);
    for (const key of descriptors) {
      if (key === activeKey) continue;
      assert.deepEqual(plugin.settings[key], ['guild-1', 'channel-1', 'thread-1', `${key}-keep`]);
    }
    assert.equal(saves, 1);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].options.type, 'success');
  }
});

test('guild navigation uses the default channel, leaves failures untouched, and skips unavailable guilds', () => {
  const history = [];
  const closed = [];
  let settingsOpen = false;
  const plugin = createPlugin({
    settings: listSettings(),
    locationListsModalKey: 'location-lists',
    ChannelStore: { getChannels: () => ({}) },
    GuildChannelStore: { getDefaultChannel: id => id === 'guild-1' ? { id: 'default' } : null },
    loggerSettingsModalKey: 'settings',
    tools: {
      getServer: id => id === 'guild-1' ? { id, name: 'Alpha' } : null,
      HistoryUtils: { getHistory: () => ({ push: pathName => history.push(pathName) }) }
    },
    ModalStack: {
      hasModalOpen: key => key === 'settings' && settingsOpen,
      closeModal: key => {
        closed.push(key);
        if (key === 'settings') settingsOpen = false;
      }
    },
    menu: { open: true },
    style: { menu: 'logger' }
  });
  assert.equal(plugin.navigateToLocationListGuild({ id: 'guild-1' }), true);
  assert.deepEqual(history, ['/channels/guild-1/default']);
  assert.deepEqual(closed, ['location-lists', 'logger']);

  settingsOpen = true;
  plugin.GuildChannelStore = { getDefaultChannel: () => ({ id: 'nested-default' }) };
  assert.equal(plugin.navigateToLocationListGuild({ id: 'guild-1' }), true);
  assert.deepEqual(history, ['/channels/guild-1/default', '/channels/guild-1/nested-default']);
  assert.deepEqual(closed, [
    'location-lists',
    'logger',
    'location-lists',
    'settings',
    'logger'
  ]);

  plugin.GuildChannelStore = { getDefaultChannel: () => null };
  assert.equal(plugin.navigateToLocationListGuild({ id: 'guild-1' }), false);
  assert.deepEqual(history, ['/channels/guild-1/default', '/channels/guild-1/nested-default']);
  assert.equal(closed.length, 5);

  assert.equal(plugin.navigateToLocationListGuild({ id: 'missing-guild' }), false);
  assert.deepEqual(history, ['/channels/guild-1/default', '/channels/guild-1/nested-default']);
  assert.equal(closed.length, 5);
});

test('logger settings shortcut opens the actual settings panel and closes only its modal', () => {
  let modal;
  let createCount = 0;
  let open = false;
  const closed = [];
  const settingsPanel = { type: 'settings-panel' };
  const plugin = createPlugin({
    style: {
      menu: 'logger-modal',
      loggerSettingsModal: 'settings-modal',
      loggerSettingsScroller: 'settings-scroller'
    },
    loggerSettingsModalKey: 'logger-settings',
    tools: { resolvedModalStuff: { ModalSize: { LARGE: 'large' } } },
    ModalStack: {
      hasModalOpen: key => open && key === 'logger-settings',
      closeModal: key => closed.push(key)
    },
    getSettingsPanel: () => settingsPanel,
    createModal(options, image, key) {
      createCount++;
      modal = { options, image, key };
    }
  });

  assert.equal(plugin.showLoggerSettingsModal(), true);
  assert.equal(createCount, 1);
  assert.equal(modal.key, 'logger-settings');
  assert.equal(modal.options.header, 'MessageLoggerV2 Settings');
  assert.equal(modal.options.cancelText, 'Back');
  assert.equal(modal.options.className, 'settings-modal');
  const scroller = modal.options.children[0];
  assert.equal(scroller.props.className, 'settings-scroller');
  assert.equal(scroller.props.children[0], settingsPanel);

  open = true;
  assert.deepEqual(plugin.getOpenLoggerOwnedModalKeys(), ['logger-settings']);
  modal.options.onCancel();
  assert.deepEqual(closed, ['logger-settings']);
  assert.equal(plugin.showLoggerSettingsModal(), false);
  assert.equal(createCount, 1);
});

test('manager modal renders tabs and rows while right-click and Shift Trash keep their distinct removal scope', () => {
  let modal;
  let openedMenu;
  const openedFilters = [];
  let menuCloses = 0;
  const closedModalKeys = [];
  const toasts = [];
  ContextMenu.open = (_event, menu) => { openedMenu = menu; };
  ContextMenu.close = () => { menuCloses++; };
  const plugin = createPlugin({
    settings: listSettings({
      whitelist: ['guild-1'],
      blacklist: ['guild-1']
    }),
    locationListsModalKey: 'location-lists',
    messageRecord: {},
    style: {
      menu: 'logger-modal',
      menuRoot: 'menu-root',
      tabBar: 'tab-bar',
      tabBarItem: 'tab-item',
      tab: 'tab',
      tabSelected: 'selected',
      locationListRow: 'location-row',
      locationListLink: 'location-link',
      locationListDeleteButton: 'location-delete',
      locationListScroller: 'location-list-scroller',
      locationListsModal: 'location-lists-modal'
    },
    multiClasses: { defaultColor: 'default-color' },
    tools: {
      getServer: id => id === 'guild-1' ? { id, name: 'Alpha' } : null,
      getChannel: () => null,
      resolvedModalStuff: { ModalSize: { LARGE: 'large' } }
    },
    ModalStack: {
      hasModalOpen: () => false,
      closeModal: key => closedModalKeys.push(key)
    },
    createModal(options, image, key) {
      modal = { options, image, key };
    },
    getNativeDeleteIconComponent: () => function TrashIcon() {},
    buildMenu: setup => setup
  });
  plugin.saveSettings = () => {};
  plugin.notifyUser = (message, options) => { toasts.push({ message, options }); };
  plugin.openLocationListLoggerFilter = filter => {
    openedFilters.push(filter);
    return true;
  };

  assert.equal(plugin.showLocationListManagerModal(), true);
  assert.equal(modal.key, plugin.locationListsModalKey);
  assert.equal(modal.options.size, 'large');
  assert.equal(modal.options.cancelText, 'Back');
  assert.equal(modal.options.className, 'location-lists-modal');
  modal.options.onCancel();
  assert.deepEqual(closedModalKeys, ['location-lists']);
  const rendered = modal.options.children[0].type();
  const elements = collectReactElements(rendered);
  assert.equal(elements.filter(element => element.props.role === 'tab').length, 4);
  const row = elements.find(element => element.props.className === 'location-row');
  const trash = elements.find(element => element.props.className === 'location-delete');
  assert.ok(row);
  assert.ok(trash);
  assert.equal(row.props.children.length, 2);
  assert.equal(row.props.children[0].props.style.minWidth, 0);
  assert.equal(row.props.children[0].props.style.flex, '0 1 auto');
  assert.equal(row.props.children[1], trash);

  row.props.onContextMenu({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(openedMenu[0].items.map(item => item.label), [
    'Open Log For Server',
    'Remove From Whitelist',
    'Move to Blacklist',
    'Add to Notification Whitelist',
    'Add to Notification Blacklist',
    'Remove from all four lists'
  ]);
  assert.equal(openedMenu[0].items.some(item => item.label === 'Open Logs'), false);
  openedMenu[0].items[0].action();
  assert.deepEqual(openedFilters, ['server:guild-1']);
  assert.equal(menuCloses, 1);
  trash.props.onClick({ shiftKey: false, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, ['guild-1']);
  trash.props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, []);
  assert.deepEqual(plugin.settings.blacklist, ['guild-1']);
  assert.deepEqual(toasts, [{ message: 'Removed Alpha from Logging Whitelist.', options: { type: 'success' } }]);
  openedMenu[0].items.find(item => item.label === 'Remove from all four lists').action();
  assert.deepEqual(plugin.settings.blacklist, []);
  assert.equal(menuCloses, 2);
  assert.deepEqual(toasts, [
    { message: 'Removed Alpha from Logging Whitelist.', options: { type: 'success' } },
    { message: 'Removed Alpha from all MessageLogger location lists.', options: { type: 'success' } }
  ]);
});

test('manager context-menu moves refresh the active list and switched tabs read current settings', () => {
  let modal;
  let openedMenu;
  let menuCloses = 0;
  let saves = 0;
  let hookIndex = 0;
  const hookStates = [];
  const toasts = [];
  const originalUseState = React.useState;
  ContextMenu.open = (_event, menu) => { openedMenu = menu; };
  ContextMenu.close = () => { menuCloses++; };
  React.useState = initialValue => {
    const index = hookIndex++;
    if (!(index in hookStates)) hookStates[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
    return [hookStates[index], next => {
      hookStates[index] = typeof next === 'function' ? next(hookStates[index]) : next;
    }];
  };
  try {
    const plugin = createPlugin({
      settings: listSettings({ whitelist: ['guild-1'] }),
      locationListsModalKey: 'location-lists',
      style: {
        menu: 'logger-modal',
        tabBar: 'tab-bar',
        tabBarItem: 'tab-item',
        tab: 'tab',
        tabSelected: 'selected',
        locationListRow: 'location-row',
        locationListLink: 'location-link',
        locationListDeleteButton: 'location-delete',
        locationListScroller: 'location-list-scroller',
        locationListsModal: 'location-lists-modal'
      },
      multiClasses: { defaultColor: 'default-color' },
      tools: {
        getServer: id => id === 'guild-1' ? { id, name: 'Alpha' } : null,
        getChannel: () => null,
        resolvedModalStuff: { ModalSize: { LARGE: 'large' } }
      },
      ModalStack: { hasModalOpen: () => false },
      createModal(options, image, key) {
        modal = { options, image, key };
      },
      getNativeDeleteIconComponent: () => function TrashIcon() {},
      buildMenu: setup => setup
    });
    plugin.saveSettings = () => { saves++; };
    plugin.notifyUser = (message, options) => { toasts.push({ message, options }); };

    assert.equal(plugin.showLocationListManagerModal(), true);
    const renderManager = () => {
      hookIndex = 0;
      return modal.options.children[0].type();
    };
    let rendered = renderManager();
    const row = collectReactElements(rendered).find(element => element.props.className === 'location-row');
    row.props.onContextMenu({ preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(openedMenu[0].items.map(item => item.label), [
      'Open Log For Server',
      'Remove From Whitelist',
      'Move to Blacklist',
      'Add to Notification Whitelist',
      'Add to Notification Blacklist',
      'Remove from all four lists'
    ]);
    assert.equal(openedMenu[0].items.some(item => item.label === 'Open Logs'), false);
    openedMenu[0].items.find(item => item.label === 'Move to Blacklist').action();
    assert.equal(menuCloses, 1);
    assert.equal(saves, 1);
    assert.deepEqual(plugin.settings.whitelist, []);
    assert.deepEqual(plugin.settings.blacklist, ['guild-1']);
    assert.deepEqual(toasts, [{ message: 'Moved Alpha to Logging Blacklist.', options: { type: 'success' } }]);

    rendered = renderManager();
    assert.equal(collectReactElements(rendered).some(element => element.props.className === 'location-row'), false);
    const blacklistTab = collectReactElements(rendered).find(element => element.props['aria-selected'] === false
      && Array.isArray(element.props.children)
      && element.props.children.includes('Logging Blacklist'));
    assert.ok(blacklistTab);
    blacklistTab.props.onClick();
    rendered = renderManager();
    assert.equal(collectReactElements(rendered).filter(element => element.props.className === 'location-row').length, 1);
  } finally {
    React.useState = originalUseState;
  }
});

test('manager groups live channels under one server header and keeps guild IDs inside clickable labels', () => {
  let modal;
  let saves = 0;
  const toasts = [];
  const guild = {
    id: 'guild-1',
    name: 'Alpha',
    icon: 'alpha-hash'
  };
  const channels = {
    'channel-1': { id: 'channel-1', name: 'general', guild_id: 'guild-1', type: 0 },
    'thread-1': { id: 'thread-1', name: 'topic', guild_id: 'guild-1', type: 11 }
  };
  const plugin = createPlugin({
    settings: listSettings({
      whitelist: ['guild-1', 'channel-1', 'thread-1'],
      blacklist: ['guild-1', 'channel-1', 'thread-1', 'other']
    }),
    locationListsModalKey: 'location-lists',
    style: {
      menu: 'logger-modal',
      menuRoot: 'menu-root',
      tabBar: 'tab-bar',
      tabBarItem: 'tab-item',
      tab: 'tab',
      tabSelected: 'selected',
      locationListRow: 'location-row',
      locationListGroupedRow: 'location-row-grouped',
      locationListGroupHeader: 'location-group-header',
      locationListLink: 'location-link',
      locationListDeleteButton: 'location-delete',
      locationListScroller: 'location-list-scroller',
      locationListsModal: 'location-lists-modal'
    },
    multiClasses: { defaultColor: 'default-color' },
    tools: {
      getServer: id => id === guild.id ? guild : null,
      getChannel: id => channels[id] || null,
      resolvedModalStuff: { ModalSize: { LARGE: 'large' } }
    },
    ImageResolver: {
      getGuildIconURL: target => target === guild && target.icon === 'alpha-hash'
        ? 'https://example.invalid/alpha.png'
        : null
    },
    ModalStack: { hasModalOpen: () => false },
    createModal(options, image, key) {
      modal = { options, image, key };
    },
    getNativeDeleteIconComponent: () => function TrashIcon() {},
    buildMenu: setup => setup
  });
  plugin.saveSettings = () => { saves++; };
  plugin.notifyUser = (message, options) => { toasts.push({ message, options }); };

  assert.equal(plugin.showLocationListManagerModal(), true);
  const rendered = modal.options.children[0].type();
  assert.equal(rendered.props.className, 'default-color location-list-scroller');
  assert.deepEqual(rendered.props.style, {
    height: 'min(420px, calc(100vh - 260px))',
    minHeight: 0,
    boxSizing: 'border-box',
    overflowY: 'auto',
    overflowX: 'hidden'
  });
  const elements = collectReactElements(rendered);
  const allRows = elements.filter(element => String(element.props.className || '').split(' ').includes('location-row'));
  assert.equal(allRows.length, 3);
  for (const row of allRows) {
    assert.equal(row.props.children.length, 2);
    assert.equal(row.props.children[0].props.style.minWidth, 0);
    assert.equal(row.props.children[0].props.style.flex, '0 1 auto');
    assert.equal(row.props.children[1].props.className, 'location-delete');
  }
  const links = elements.filter(element => element.props.className === 'location-link');
  assert.equal(links.length, 4);
  const serverLinks = links.filter(link => link.props['aria-label'] === 'Open server Alpha');
  assert.equal(serverLinks.length, 2);
  for (const link of serverLinks) {
    assert.equal(link.props.children.length, 1);
    const label = link.props.children[0];
    assert.equal(label.type, 'span');
    assert.equal(label.props.style.gap, '6px');
    const labelId = label.props.children[label.props.children.length - 1];
    assert.equal(labelId.props.children[0], '[guild-1]');
    assert.deepEqual(labelId.props.style, {
      color: 'var(--text-muted)',
      fontSize: '12px',
      fontWeight: 400
    });
    const frame = label.props.children[0];
    assert.equal(frame.type, 'span');
    assert.deepEqual(frame.props.style, {
      boxSizing: 'border-box',
      display: 'block',
      flex: '0 0 auto',
      width: '20px',
      height: '20px',
      overflow: 'hidden',
      borderRadius: '50%',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    });
    const image = frame.props.children[0];
    assert.equal(image.type, 'img');
    assert.equal(image.props.src, 'https://example.invalid/alpha.png');
    assert.deepEqual(image.props.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      borderRadius: '50%'
    });
  }
  assert.equal(links.filter(link => link.props['aria-label'] === 'Open channel general').length, 1);
  assert.equal(links.filter(link => link.props['aria-label'] === 'Open thread topic').length, 1);
  const rows = elements.filter(element => String(element.props.className || '').split(' ').includes('location-row'));
  assert.equal(rows.length, 3);
  const channelTree = elements.find(element => element.props.role === 'group'
    && element.props['aria-label'] === 'Alpha channels and threads');
  assert.ok(channelTree);
  assert.deepEqual(channelTree.props.style, {
    marginLeft: '10px',
    paddingLeft: '12px',
    borderLeft: '1px solid var(--background-modifier-accent)'
  });
  const childRows = channelTree.props.children.filter(element => element.props.className === 'location-row location-row-grouped');
  assert.equal(childRows.length, 2);
  for (const row of childRows) {
    assert.equal(row.props.className, 'location-row location-row-grouped');
    assert.equal(row.props.children[0].props.children.filter(Boolean).length, 1);
    assert.equal(typeof row.props.onContextMenu, 'function');
    assert.equal(row.props.children[1].props.className, 'location-delete');
  }
  const standaloneGuildRow = rows.find(row => row.props.children[0]?.props?.children?.[0]?.props?.children?.[0]?.props?.['aria-label'] === 'Open server Alpha');
  assert.ok(standaloneGuildRow);
  assert.equal(standaloneGuildRow.props.children[0].props.children.filter(Boolean).length, 1);
  const parentHeader = serverLinks.find(link => !elements.some(element => element.props.className === 'location-row' && element.props.children?.[0]?.props?.children?.[0] === link));
  assert.ok(parentHeader);
  assert.equal(parentHeader.props.onContextMenu, undefined);

  const groupHeader = elements.find(element => element.props.className === 'location-group-header');
  assert.ok(groupHeader);
  assert.equal(groupHeader.props.children.length, 2);
  assert.equal(groupHeader.props.children[0].props.style.minWidth, 0);
  assert.equal(groupHeader.props.children[0].props.style.flex, '0 1 auto');
  const groupTrash = groupHeader.props.children[1];
  assert.equal(groupTrash.props.className, 'location-delete');
  assert.match(groupTrash.props['aria-label'], /Alpha and its channels and threads/);
  const groupIcon = Array.isArray(groupTrash.props.children) ? groupTrash.props.children[0] : groupTrash.props.children;
  assert.equal(groupIcon.props['aria-hidden'], true);
  assert.equal(groupIcon.props.width, 16);
  assert.equal(groupIcon.props.height, 16);

  childRows[0].props.children[1].props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, ['guild-1', 'thread-1']);
  assert.equal(saves, 1);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].options.type, 'success');
  assert.equal(toasts[0].message, 'Removed general from Logging Whitelist.');
  assert.deepEqual(plugin.settings.blacklist, ['guild-1', 'channel-1', 'thread-1', 'other']);

  saves = 0;
  toasts.length = 0;
  groupTrash.props.onClick({ shiftKey: false, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, ['guild-1', 'thread-1']);
  assert.equal(saves, 0);
  groupTrash.props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, []);
  assert.deepEqual(plugin.settings.blacklist, ['guild-1', 'channel-1', 'thread-1', 'other']);
  assert.equal(saves, 1);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].options.type, 'success');
  assert.equal(toasts[0].message, 'Removed 2 locations from Alpha in Logging Whitelist.');

  plugin.settings.whitelist = ['thread-1'];
  saves = 0;
  toasts.length = 0;
  const remainingRendered = modal.options.children[0].type();
  const remainingHeader = collectReactElements(remainingRendered).find(element => element.props.className === 'location-group-header');
  assert.ok(remainingHeader);
  remainingHeader.props.children[1].props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, []);
  assert.equal(saves, 1);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].options.type, 'success');
  assert.equal(toasts[0].message, 'Removed 1 location from Alpha in Logging Whitelist.');
});

test('standalone server Trash removes only its guild ID, not grouped channel IDs', () => {
  let modal;
  const guild = { id: 'guild-1', name: 'Alpha' };
  const channel = { id: 'channel-1', name: 'general', guild_id: 'guild-1', type: 0 };
  const plugin = createPlugin({
    settings: listSettings({
      whitelist: ['guild-1', 'channel-1'],
      blacklist: ['guild-1', 'channel-1']
    }),
    locationListsModalKey: 'location-lists',
    style: {
      menu: 'logger-modal',
      tabBar: 'tab-bar',
      tabBarItem: 'tab-item',
      tab: 'tab',
      tabSelected: 'selected',
      locationListRow: 'location-row',
      locationListGroupedRow: 'location-row-grouped',
      locationListGroupHeader: 'location-group-header',
      locationListLink: 'location-link',
      locationListDeleteButton: 'location-delete',
      locationListScroller: 'location-list-scroller',
      locationListsModal: 'location-lists-modal'
    },
    multiClasses: { defaultColor: 'default-color' },
    tools: {
      getServer: id => id === guild.id ? guild : null,
      getChannel: id => id === channel.id ? channel : null,
      resolvedModalStuff: { ModalSize: { LARGE: 'large' } }
    },
    ModalStack: { hasModalOpen: () => false },
    createModal(options, image, key) {
      modal = { options, image, key };
    },
    getNativeDeleteIconComponent: () => function TrashIcon() {},
    buildMenu: setup => setup
  });
  plugin.saveSettings = () => {};
  plugin.notifyUser = () => {};

  assert.equal(plugin.showLocationListManagerModal(), true);
  const rendered = modal.options.children[0].type();
  const rows = collectReactElements(rendered).filter(element => String(element.props.className || '').split(' ').includes('location-row'));
  const serverRow = rows.find(row => row.props.children[0]?.props?.children?.[0]?.props?.children?.[0]?.props?.['aria-label'] === 'Open server Alpha');
  assert.ok(serverRow);
  serverRow.props.children[1].props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, ['channel-1']);
  assert.deepEqual(plugin.settings.blacklist, ['guild-1', 'channel-1']);
});

test('grouped server and channel links navigate with their distinct targets and modal closure order', () => {
  let modal;
  const history = [];
  const closed = [];
  let settingsOpen = true;
  const guild = { id: 'guild-1', name: 'Alpha' };
  const channel = { id: 'channel-1', name: 'general', guild_id: 'guild-1', type: 0 };
  const plugin = createPlugin({
    settings: listSettings({ whitelist: ['channel-1'] }),
    locationListsModalKey: 'location-lists',
    loggerSettingsModalKey: 'settings',
    style: {
      menu: 'logger-modal',
      locationListGroupedRow: 'location-row-grouped',
      locationListGroupHeader: 'location-group-header',
      tabBar: 'tab-bar',
      tabBarItem: 'tab-item',
      tab: 'tab',
      tabSelected: 'selected',
      locationListRow: 'location-row',
      locationListLink: 'location-link',
      locationListDeleteButton: 'location-delete',
      locationListScroller: 'location-list-scroller',
      locationListsModal: 'location-lists-modal'
    },
    multiClasses: { defaultColor: 'default-color' },
    GuildChannelStore: { getDefaultChannel: id => id === guild.id ? { id: 'default-channel' } : null },
    menu: { open: true },
    tools: {
      getServer: id => id === guild.id ? guild : null,
      getChannel: id => id === channel.id ? channel : null,
      HistoryUtils: { getHistory: () => ({ push: target => history.push(target) }) },
      resolvedModalStuff: { ModalSize: { LARGE: 'large' } }
    },
    ModalStack: {
      hasModalOpen: key => key === 'settings' && settingsOpen,
      closeModal: key => {
        closed.push(key);
        if (key === 'settings') settingsOpen = false;
      }
    },
    createModal(options, image, key) {
      modal = { options, image, key };
    },
    getNativeDeleteIconComponent: () => function TrashIcon() {},
    buildMenu: setup => setup
  });

  assert.equal(plugin.showLocationListManagerModal(), true);
  const rendered = modal.options.children[0].type();
  const links = collectReactElements(rendered).filter(element => element.props.className === 'location-link');
  const parent = links.find(link => link.props['aria-label'] === 'Open server Alpha');
  const child = links.find(link => link.props['aria-label'] === 'Open channel general');
  assert.ok(parent);
  assert.ok(child);
  parent.props.onClick();
  assert.deepEqual(history, ['/channels/guild-1/default-channel']);
  assert.deepEqual(closed, ['location-lists', 'settings', 'logger-modal']);

  settingsOpen = true;
  child.props.onClick();
  assert.deepEqual(history, ['/channels/guild-1/default-channel', '/channels/guild-1/channel-1']);
  assert.deepEqual(closed, [
    'location-lists',
    'settings',
    'logger-modal',
    'location-lists',
    'settings',
    'logger-modal'
  ]);
});

test('source contracts cover both manager launch buttons, four tabs, right-click actions, and Shift-only Trash', () => {
  assert.match(source, /createButton\('Manage lists', \(\) => this\.showLocationListManagerModal\(\)\)/);
  assert.match(source, /aria-label', 'Manage location lists'/);
  for (const label of ['Logging Whitelist', 'Logging Blacklist', 'Notification Whitelist', 'Notification Blacklist']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /ContextMenu\.open\(event, plugin\.buildMenu/);
  assert.doesNotMatch(source, /label: 'Remove from this list'/);
  assert.match(source, /label: 'Open Log For Server'/);
  assert.match(source, /plugin\._addListToggleItems\(menuItems/);
  assert.match(source, /openLocationListLoggerFilter\(openFilter\.filter\)/);
  assert.match(source, /label: 'Remove from all four lists'/);
  assert.match(source, /getNativeDeleteIconComponent\(\)/);
  assert.match(source, /removeLocationListIdsBatch\(/);
  assert.match(source, /if \(!event\.shiftKey\) return;/);
  assert.match(source, /html\.\$\{this\.style\.shiftDeleteActive\} \.\$\{this\.style\.locationListRow\}:hover > \.\$\{this\.style\.locationListDeleteButton\}/);
  assert.match(source, /html\.\$\{this\.style\.shiftDeleteActive\} \.\$\{this\.style\.locationListGroupHeader\}:hover > \.\$\{this\.style\.locationListDeleteButton\}/);
  assert.doesNotMatch(source, /locationListRow\}:focus-within/);
  assert.doesNotMatch(source, /locationListGroupHeader\}:focus-within/);
  assert.match(source, /visibility: hidden/);
  assert.match(source, /const nonEmptyGroups = groups\.filter/);
  assert.match(source, /locationListGroupedRow/);
  assert.match(source, /locationListGroupHeader/);
  assert.match(source, /this\.style\.locationListGroupHeader\} \{[\s\S]*?gap: 8px;/);
  assert.match(source, /this\.style\.locationListsModal\} \.\$\{this\.style\.locationListRow\}:hover \{[\s\S]*?background-color: var\(--background-mod-subtle, rgba\(128, 128, 128, 0\.12\)\) !important;/);
  assert.match(source, /this\.style\.locationListsModal\} \.\$\{this\.style\.locationListGroupHeader\}:hover \{[\s\S]*?background-color: var\(--background-mod-subtle, rgba\(128, 128, 128, 0\.12\)\) !important;/);
  const locationRowCss = source.match(/\.\$\{this\.style\.locationListRow\} \{([^}]*)\}/)?.[1] || '';
  const locationDeleteCss = source.match(/\.\$\{this\.style\.locationListDeleteButton\} \{([^}]*)\}/)?.[1] || '';
  assert.match(locationRowCss, /gap: 8px;/);
  assert.match(locationDeleteCss, /flex: 0 0 28px;\s+padding: 0;/);
  assert.doesNotMatch(locationDeleteCss, /margin-left: auto;/);
  assert.match(source, /style: \{ minWidth: 0, flex: '0 1 auto' \}/);
  assert.match(source, /min-height: 32px;\s+padding: 4px 4px;/);
  assert.match(source, /style: \{ marginBottom: '4px' \}/);
  assert.match(source, /padding: 2px 4px 0;/);
  assert.match(source, /getElementsByClassName\(classes\.inputMultiInput\)/);
  assert.match(source, /this\.style\.locationListLink/);
  assert.match(source, /ImageResolver: lazyGet\('ImageResolver', \(\) => Webpack\.getByKeys\('getUserAvatarURL', 'getGuildIconURL'\)\)/);
  assert.match(source, /className: this\.style\.locationListsModal/);
  assert.match(source, /width: min\(1100px, calc\(100vw - 32px\)\) !important/);
  assert.match(source, /height: 'min\(420px, calc\(100vh - 260px\)\)'/);
  assert.match(source, /classList\.add\(\.\.\.classNames\)/);
  assert.match(source, /locationListScroller/);
  assert.match(source, /scrollbar-gutter: stable/);
  assert.match(source, /locationListScroller\}::-webkit-scrollbar/);
  assert.match(source, /var\(--scrollbar-thin-thumb\)/);
  assert.match(source, /var\(--scrollbar-thin-track\)/);
  assert.match(source, /multiInput\?\.appendChild\(locationListButton\);\s+const settingsButton = document\.createElement\('span'\)/);
  assert.match(source, /settingsButton\.addEventListener\('click', \(\) => this\.showLoggerSettingsModal\(\)\)/);
  assert.match(source, /settingsButton\.addEventListener\('keydown'/);
  assert.match(source, /Open MessageLogger settings/);
  assert.match(source, /loggerSettingsModalKey/);
  assert.match(source, /className: this\.style\.loggerSettingsModal/);
  assert.match(source, /loggerSettingsScroller\}::-webkit-scrollbar[\s\S]*?display: none/);
});
