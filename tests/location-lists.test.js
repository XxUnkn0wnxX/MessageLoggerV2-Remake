const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ContextMenu, createPlugin, resetHarness, Webpack } = require('./helpers/plugin-harness');

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

test('guild navigation uses the default channel, leaves failures untouched, and skips unavailable guilds', () => {
  const history = [];
  let closed = 0;
  const plugin = createPlugin({
    settings: listSettings(),
    locationListsModalKey: 'location-lists',
    ChannelStore: { getChannels: () => ({}) },
    GuildChannelStore: { getDefaultChannel: id => id === 'guild-1' ? { id: 'default' } : null },
    tools: {
      getServer: id => id === 'guild-1' ? { id, name: 'Alpha' } : null,
      HistoryUtils: { getHistory: () => ({ push: pathName => history.push(pathName) }) }
    },
    ModalStack: { closeModal: () => { closed++; } },
    menu: { open: true },
    style: { menu: 'logger' }
  });
  assert.equal(plugin.navigateToLocationListGuild({ id: 'guild-1' }), true);
  assert.deepEqual(history, ['/channels/guild-1/default']);
  assert.equal(closed, 2);

  plugin.GuildChannelStore = { getDefaultChannel: () => null };
  assert.equal(plugin.navigateToLocationListGuild({ id: 'guild-1' }), false);
  assert.deepEqual(history, ['/channels/guild-1/default']);
  assert.equal(closed, 2);

  assert.equal(plugin.navigateToLocationListGuild({ id: 'missing-guild' }), false);
  assert.deepEqual(history, ['/channels/guild-1/default']);
  assert.equal(closed, 2);
});

test('manager modal renders tabs and rows while right-click and Shift Trash keep their distinct removal scope', () => {
  let modal;
  let openedMenu;
  const closedModalKeys = [];
  ContextMenu.open = (_event, menu) => { openedMenu = menu; };
  ContextMenu.close = () => {};
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
  plugin.notifyUser = () => {};

  assert.equal(plugin.showLocationListManagerModal(), true);
  assert.equal(modal.key, plugin.locationListsModalKey);
  assert.equal(modal.options.size, 'large');
  assert.equal(modal.options.cancelText, 'Back');
  assert.equal(modal.options.className, 'menu-root location-lists-modal');
  modal.options.onCancel();
  assert.deepEqual(closedModalKeys, ['location-lists']);
  const rendered = modal.options.children[0].type();
  const elements = collectReactElements(rendered);
  assert.equal(elements.filter(element => element.props.role === 'tab').length, 4);
  const row = elements.find(element => element.props.className === 'location-row');
  const trash = elements.find(element => element.props.className === 'location-delete');
  assert.ok(row);
  assert.ok(trash);

  row.props.onContextMenu({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(openedMenu[0].items.map(item => item.label), [
    'Remove from this list',
    'Remove from all four lists'
  ]);
  trash.props.onClick({ shiftKey: false, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, ['guild-1']);
  trash.props.onClick({ shiftKey: true, preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(plugin.settings.whitelist, []);
  assert.deepEqual(plugin.settings.blacklist, ['guild-1']);
});

test('manager renders guild icons before live server names and channel server links', () => {
  let modal;
  const guild = {
    id: 'guild-1',
    name: 'Alpha',
    getIconURL: () => 'https://example.invalid/alpha.png'
  };
  const channel = { id: 'channel-1', name: 'general', guild_id: 'guild-1', type: 0 };
  const plugin = createPlugin({
    settings: listSettings({ whitelist: ['guild-1', 'channel-1'] }),
    locationListsModalKey: 'location-lists',
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

  assert.equal(plugin.showLocationListManagerModal(), true);
  const rendered = modal.options.children[0].type();
  const links = collectReactElements(rendered).filter(element => element.props.className === 'location-link');
  assert.equal(links.length, 2);
  for (const link of links) {
    const label = link.props.children[0];
    assert.equal(label.type, 'span');
    const frame = label.props.children[0];
    assert.equal(frame.type, 'span');
    assert.deepEqual(frame.props.style, {
      boxSizing: 'border-box',
      display: 'block',
      flex: '0 0 auto',
      width: '16px',
      height: '16px',
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
});

test('source contracts cover both manager launch buttons, four tabs, right-click actions, and Shift-only Trash', () => {
  assert.match(source, /createButton\('Manage lists', \(\) => this\.showLocationListManagerModal\(\)\)/);
  assert.match(source, /aria-label', 'Manage location lists'/);
  for (const label of ['Logging Whitelist', 'Logging Blacklist', 'Notification Whitelist', 'Notification Blacklist']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /ContextMenu\.open\(event, plugin\.buildMenu/);
  assert.match(source, /label: 'Remove from this list'/);
  assert.match(source, /label: 'Remove from all four lists'/);
  assert.match(source, /getNativeDeleteIconComponent\(\)/);
  assert.match(source, /if \(!event\.shiftKey\) return;/);
  assert.match(source, /html\.\$\{this\.style\.shiftDeleteActive\} \.\$\{this\.style\.locationListRow\}:hover/);
  assert.match(source, /visibility: hidden/);
  assert.match(source, /const nonEmptyGroups = groups\.filter/);
  assert.match(source, /getElementsByClassName\(classes\.inputMultiInput\)/);
  assert.match(source, /this\.style\.locationListLink/);
});
