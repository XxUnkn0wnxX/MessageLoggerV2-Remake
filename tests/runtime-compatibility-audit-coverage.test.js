const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const helperPath = path.join(__dirname, '..', 'tools', 'MessageLoggerRuntimeCompatibilityAudit.plugin.js');

test('runtime audit uses BetterDiscord-compatible builtin module specifiers', () => {
  const helperSource = fs.readFileSync(helperPath, 'utf8');
  assert.doesNotMatch(helperSource, /require\(['"]node:/);
  assert.match(helperSource, /require\('fs'\)/);
  assert.match(helperSource, /require\('path'\)/);
});

test('PlatformCapabilities accepts callback atomic-save fallback without promise fs APIs', async () => {
  const savedGlobals = saveGlobals(['BdApi', 'document', 'window']);
  const cachedHelper = require.cache[helperPath];
  const pluginFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-platform-audit-'));
  const realFs = fs;
  const fallbackFs = Object.create(realFs);
  Object.defineProperties(fallbackFs, {
    promises: { configurable: true, value: {} },
    writeFileSync: { configurable: true, value: undefined },
    unlinkSync: { configurable: true, value: undefined },
    rename: { configurable: true, value: undefined }
  });
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'fs') return fallbackFs;
    if (request === 'electron') return { shell: { openExternal() {}, openPath() {} } };
    return originalLoad.call(this, request, parent, isMain);
  };
  const documentObject = createDocumentMock();
  const webpack = buildWebpackMock({}, { id: 2, exports: {} });
  const addon = {
    instance: {
      tools: {
        renderLinkComponent() {
          return { type: function ValidType() {} };
        }
      }
    }
  };
  const api = {
    Plugins: {
      folder: pluginFolder,
      isEnabled() { return true; },
      get(name) { return name === 'MessageLoggerV2' ? addon : null; }
    },
    Webpack: webpack,
    UI: {},
    React: {},
    ReactDOM: {},
    ReactUtils: {},
    Components: {},
    Patcher: {},
    ContextMenu: {},
    Utils: {},
    DOM: {},
    Hooks: {},
    Logger: {}
  };
  class MockBdApi {
    constructor() {
      return api;
    }
  }
  const Url = function URL() {};
  Url.createObjectURL = () => '';
  Url.revokeObjectURL = () => {};
  globalThis.BdApi = MockBdApi;
  globalThis.document = documentObject;
  globalThis.window = {
    document: documentObject,
    scrollX: 0,
    scrollY: 0,
    DiscordNative: { clipboard: { copy() {} }, app: {} },
    Node: { TEXT_NODE: 3 },
    URL: Url,
    MutationObserver: function MutationObserver() {},
    requestAnimationFrame() {},
    fetch() {},
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {}
  };

  try {
    delete require.cache[helperPath];
    const Audit = require(helperPath);
    const report = await new Audit().buildReport('platform-fallback', { loadEntry: false, externalAssets: false });
    const platform = report.contracts.find(({ name }) => name === 'PlatformCapabilities');
    assert.equal(platform?.status, 'pass');
    assert.equal(platform?.validation?.booleans?.['fs.atomicSavePath'], true);
    for (const key of ['fs.promises.writeFile', 'fs.promises.unlink', 'fs.promises.rename']) {
      assert.equal(Object.hasOwn(platform.validation.booleans, key), false);
      assert.equal(platform.optionalAvailability[key], false);
    }
  } finally {
    Module._load = originalLoad;
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
    fs.rmSync(pluginFolder, { recursive: true, force: true });
  }
});

function buildWebpackMock(candidate, moduleRecord, hooks = {}) {
  let getModuleCalls = 0;
  const hostileFilter = () => {
    hooks.filterFactoryCalls = (hooks.filterFactoryCalls || 0) + 1;
    return () => {
      hooks.hostFilterInvocations = (hooks.hostFilterInvocations || 0) + 1;
      return candidate.secretPropertyName === 'host-filter-never-matches';
    };
  };
  const Filters = {
    byKeys: hostileFilter,
    byStrings: hostileFilter,
    combine: hostileFilter,
    not: hostileFilter,
    byPrototypeKeys: hostileFilter,
    bySource: hostileFilter
  };
  return {
    Filters,
    Stores: {},
    getByKeys: () => null,
    getBySource: () => null,
    getByStrings: () => null,
    getStore: () => null,
    getModule(filter) {
      getModuleCalls += 1;
      if (getModuleCalls <= (hooks.throwGetModuleCount || 0)) throw new Error('target assessment unavailable');
      if (typeof filter === 'function') {
        try { filter(candidate, moduleRecord, 'secret-module-id'); } catch {}
      }
      return null;
    },
    getModules(callback) {
      if (typeof callback === 'function') callback(candidate, moduleRecord, 'secret-module-id');
    },
    waitForModule: () => null
  };
}

function saveGlobals(names) {
  return new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
}

function restoreGlobals(saved) {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

function createDocumentMock() {
  const createImage = () => {
    const image = { onload: null, onerror: null, referrerPolicy: '' };
    let source = '';
    Object.defineProperty(image, 'src', {
      configurable: true,
      get: () => source,
      set: value => {
        source = value;
        if (value) setTimeout(() => {
          if (typeof image.onload === 'function') image.onload();
        }, 0);
      }
    });
    return image;
  };
  return {
    body: {},
    head: {},
    documentElement: {},
    createElement(tag) {
      return tag === 'img' ? createImage() : {};
    },
    createTextNode() { return {}; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    getElementsByClassName() { return []; },
    addEventListener() {},
    removeEventListener() {}
  };
}

test('runtime audit builds a sanitized no-write report in a mocked host', async () => {
  const savedGlobals = saveGlobals(['BdApi', 'document', 'window']);
  const cachedHelper = require.cache[helperPath];
  const pluginFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-runtime-audit-'));
  let accessorReads = 0;
  function ValidType() {}
  const candidate = {};
  Object.defineProperties(candidate, {
    secretPropertyName: {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'secret-property-value';
      }
    },
    getMessage: {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        return () => null;
      }
    }
  });
  const moduleRecord = { id: 'secret-module-id', exports: candidate };
  const documentObject = createDocumentMock();
  const webpackHooks = {};
  let selectedAccessorReads = 0;
  let storesAccessorReads = 0;
  let publicStoreLookups = 0;
  const addon = {
    instance: {
      tools: {
        renderLinkComponent() {
          return { type: ValidType };
        }
      }
    }
  };
  const plugins = {
    folder: pluginFolder,
    isEnabled() { return true; },
    get(name) { return name === 'MessageLoggerV2' ? addon : null; }
  };
  const webpack = buildWebpackMock(candidate, moduleRecord, webpackHooks);
  const imageModalModule = {};
  Object.defineProperty(imageModalModule, 'imageExport', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function ImageModalExport() {
        return 'zoomThumbnailPlaceholder';
      };
    }
  });
  const trashPrimaryModule = {};
  Object.defineProperty(trashPrimaryModule, 'default', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function TrashPrimaryExport() {};
    }
  });
  const trashFallbackModule = {};
  Object.defineProperty(trashFallbackModule, 'iconExport', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function TrashFallbackExport() {};
    }
  });
  const userContextMenuModule = {};
  Object.defineProperty(userContextMenuModule, 'contextExport', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function UserContextExport() {
        return 'isGroupDM targetIsUser';
      };
    }
  });
  userContextMenuModule.additionalContextExport = function AdditionalContextExport() {
    return 'isGroupDM targetIsUser';
  };
  function GetSrcExport() {
    return 'sourceMetadata: getSrc';
  }
  GetSrcExport.prototype.getSrc = function getSrc() {};
  function AdditionalGetSrcExport() {
    return 'sourceMetadata: getSrc';
  }
  AdditionalGetSrcExport.prototype.getSrc = function getSrc() {};
  const getSrcModule = {};
  Object.defineProperty(getSrcModule, 'getSrcExport', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return GetSrcExport;
    }
  });
  getSrcModule.additionalGetSrcExport = AdditionalGetSrcExport;
  const i18nFormatter = Object.create({ withFormatters: true });
  const i18nModule = { formatter: i18nFormatter };
  Object.defineProperty(i18nModule, 'intl', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return { format() {} };
    }
  });
  const translations = {};
  Object.defineProperty(translations, 'C8sXIM', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return 'edited';
    }
  });
  Object.defineProperty(i18nModule, 't', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return translations;
    }
  });
  const messageContentComponent = {};
  Object.defineProperty(messageContentComponent, 'type', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function MessageContentType() {
        return '.isCommandType()';
      };
    }
  });
  const forumUploadModule = {};
  Object.defineProperty(forumUploadModule, 'routeExport', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function ForumUploadRouteExport() {
        return 'castChannelIdAsMessageId .isForumPost() .ownerId .getCount(';
      };
    }
  });
  function NativeMaskedLink() {
    return 'MASKED_LINK onAuxClick';
  }
  const memoComponent = {
    $$typeof: Symbol.for('react.memo'),
    type: NativeMaskedLink
  };
  const maskedLinkModule = {};
  Object.defineProperty(maskedLinkModule, 'A', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return memoComponent;
    }
  });
  const originalGetBySource = webpack.getBySource;
  webpack.getBySource = function(...args) {
    if (args[0] === 'zoomThumbnailPlaceholder' && args[1]?.searchExports === false) return imageModalModule;
    if (args[0] === '2.81h8.36a3' && args[1]?.searchExports === true) return trashPrimaryModule;
    if (args[0] instanceof RegExp) return trashFallbackModule;
    if (args[0] === 'isGroupDM' && args[1] === 'moderationAlertId' && args[2]?.searchExports === true) return userContextMenuModule;
    if (args[0] === 'sourceMetadata:' && args[1] === 'getSrc' && args[2]?.searchExports === true) return getSrcModule;
    if (args[0] === 'MASKED_LINK' && args[1] === 'onAuxClick' && args[2]?.searchExports === true) return maskedLinkModule;
    return originalGetBySource(...args);
  };
  const originalGetModule = webpack.getModule;
  let forumUploadSelectionHandled = false;
  let messageContentSelectionHandled = false;
  let i18nSelectionHandled = false;
  webpack.getModule = function(filter, options) {
    if (!forumUploadSelectionHandled && options?.searchExports === false) {
      try {
        if (filter(forumUploadModule, { exports: forumUploadModule }, 'forum-upload-module-id')) {
          forumUploadSelectionHandled = true;
          return forumUploadModule;
        }
      } catch {}
    }
    if (!i18nSelectionHandled && (!options || options.searchExports === undefined)) {
      try {
        if (!messageContentSelectionHandled
          && filter(messageContentComponent, { exports: messageContentComponent }, 'message-content-module-id')) {
          messageContentSelectionHandled = true;
          return messageContentComponent;
        }
        if (filter(i18nModule, { exports: i18nModule }, 'i18n-module-id')) {
          i18nSelectionHandled = true;
          return i18nModule;
        }
      } catch {}
    }
    return originalGetModule.call(this, filter, options);
  };
  const userStore = {
    getCurrentUser() { return null; },
    getUser() { return null; },
    getUsers() { return []; },
    _dispatcher: {
      dispatch() {},
      subscribe() {}
    }
  };
  const messageStore = {
    getMessage() { return null; },
    getMessages() { return []; },
    getLastEditableMessage() { return null; },
    emitChange() {}
  };
  const channelStore = {
    getChannel() { return null; },
    getDMFromUserId() { return null; }
  };
  const selectedChannelStore = {
    getChannelId() { return 'channel-id'; }
  };
  const selectedGuildStore = {
    getGuildId() { return 'guild-id'; }
  };
  const guildStore = {
    getGuild() { return null; }
  };
  const guildMemberStore = {
    getMember() { return null; }
  };
  const relationshipStore = {
    isBlocked() { return false; }
  };
  const localeStore = {};
  Object.defineProperty(localeStore, 'locale', {
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return 'en-US';
    }
  });
  const guildChannelStore = {
    getChannels() { return []; },
    getDefaultChannel() { return null; }
  };
  const storesByName = {
    UserStore: userStore,
    ChannelStore: channelStore,
    SelectedChannelStore: selectedChannelStore,
    SelectedGuildStore: selectedGuildStore,
    GuildStore: guildStore,
    GuildMemberStore: guildMemberStore,
    RelationshipStore: relationshipStore,
    LocaleStore: localeStore
  };
  const publicStoreFallbackMap = {
    UserStore: userStore,
    MessageStore: messageStore,
    ChannelStore: channelStore,
    SelectedChannelStore: selectedChannelStore,
    SelectedGuildStore: selectedGuildStore,
    GuildStore: guildStore,
    GuildMemberStore: guildMemberStore,
    LocaleStore: localeStore,
    RelationshipStore: relationshipStore,
    GuildChannelStore: guildChannelStore
  };
  webpack.Stores = new Proxy({}, {
    get(_target, property) {
      storesAccessorReads += 1;
      if (typeof property === 'symbol') return undefined;
      if (property === 'MessageStore') {
        throw new Error('MessageStore access should be proxied through getStore');
      }
      if (Object.prototype.hasOwnProperty.call(storesByName, property)) return storesByName[property];
      return undefined;
    }
  });
  webpack.getStore = name => {
    publicStoreLookups += 1;
    return publicStoreFallbackMap[name] || null;
  };
  const confirmModule = {};
  Object.defineProperty(confirmModule, 'ConfirmModal', {
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function ConfirmModal() {};
    }
  });
  const parserNew = {};
  Object.defineProperty(parserNew, 'parse', {
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function parse() {};
    }
  });
  const systemLocaleUtils = {};
  Object.defineProperty(systemLocaleUtils, 'getSystemLocale', {
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function getSystemLocale() { return 'en-US'; };
    }
  });
  const modalStore = {};
  Object.defineProperty(modalStore, 'subscribe', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return function subscribe() {};
    }
  });
  const modalActionsModule = {};
  for (const key of ['openModal', 'hasModalOpen', 'closeModal']) {
    Object.defineProperty(modalActionsModule, key, {
      configurable: true,
      enumerable: true,
      get() {
        selectedAccessorReads += 1;
        return function modalAction() {};
      }
    });
  }
  Object.defineProperty(modalActionsModule, 'useModalsStore', {
    configurable: true,
    enumerable: true,
    get() {
      selectedAccessorReads += 1;
      return modalStore;
    }
  });
  webpack.getByKeys = function(...args) {
    if (args[0] === 'ConfirmModal') return confirmModule;
    if (args[0] === 'defaultRules' && args[1] === 'parse') return parserNew;
    if (args[0] === 'getSystemLocale') return systemLocaleUtils;
    if (args[0] === 'openModal' && args[1] === 'hasModalOpen') return modalActionsModule;
    return null;
  };
  const api = {
    Plugins: plugins,
    Webpack: webpack,
    UI: {
      buildSettingsPanel() {},
      showChangelogModal() {},
      showConfirmationModal() {},
      showInviteModal() {},
      showNotification() {}
    },
    React: {},
    ReactDOM: {},
    ReactUtils: {},
    Components: {},
    Patcher: {},
    ContextMenu: {},
    Utils: {},
    DOM: {},
    Hooks: {},
    Logger: {}
  };
  class MockBdApi {
    constructor() {
      return api;
    }
  }
  globalThis.BdApi = MockBdApi;
  globalThis.document = documentObject;
  globalThis.window = {
    document: documentObject,
    addEventListener() {},
    removeEventListener() {}
  };

  try {
    delete require.cache[helperPath];
    const Audit = require(helperPath);
    const audit = new Audit();
    const report = await audit.buildReport('https://audit.invalid/?token=secret-label-value', { loadEntry: false, externalAssets: false });
    const requiredStoreContractsForFallback = [
      'UserStore',
      'MessageStore',
      'ChannelStore',
      'SelectedChannelStore',
      'SelectedGuildStore',
      'LocaleStore',
      'GuildStore',
      'GuildMemberStore',
      'RelationshipStore',
      'GuildChannelStore',
      'Dispatcher'
    ];
    const assertRequiredStoreContractsPass = (variantReport, label) => {
      for (const name of requiredStoreContractsForFallback) {
        const contract = variantReport.contracts.find(({ name: contractName }) => contractName === name);
        assert.equal(contract?.selected?.found, true, `${label} ${name} selected`);
        assert.equal(contract?.validation?.ok, true, `${label} ${name} validation`);
        assert.equal(contract?.status, 'pass', `${label} ${name} status`);
      }
    };
    const buildFallbackReport = async (label, setupStores) => {
      const lookupsBefore = publicStoreLookups;
      if (setupStores) setupStores();
      const variantReport = await audit.buildReport(label, { loadEntry: false, externalAssets: false });
      const variantSerialized = JSON.stringify(variantReport);
      assertRequiredStoreContractsPass(variantReport, label);
      assert.ok(publicStoreLookups > lookupsBefore);
      return { variantReport, variantSerialized };
    };
    const enableStoreMatchingCandidateShape = () => {
      const fields = {
        getCurrentUser: { value() { return null; } },
        getUser: { value() { return null; } },
        getUsers: { value() { return []; } },
        _dispatcher: { value: {
          dispatch() {},
          subscribe() {}
        } },
        isBlocked: { value() { return false; } },
        locale: { value: 'en-US' },
        getMessage: { value() { return null; } },
        getMessages: { value() { return []; } },
        getLastEditableMessage: { value() { return null; } },
        getChannels: { value() { return []; } },
        getDefaultChannel: { value() { return null; } },
        getChannel: { value() { return null; } },
        getDMFromUserId: { value() { return null; } },
        getChannelId: { value() { return 'channel-id'; } },
        getGuildId: { value() { return 'guild-id'; } },
        getGuild: { value() { return null; } },
        getMember: { value() { return null; } }
      };
      for (const [key, descriptor] of Object.entries(fields)) {
        Object.defineProperty(candidate, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          ...descriptor
        });
      }
    };
    const storesRootSentinel = 'secret-stores-root-getter-8f5d1f';
    let storesRootAccessorCalls = 0;
    const serialized = JSON.stringify(report);
    const integration = report.contracts.find(({ name }) => name === 'LoggerIntegration.RenderLinkComponent');
    const maskedLink = report.contracts.find(({ name }) => name === 'MaskedLink');
    const transition = report.contracts.find(({ name }) => name === 'Webpack.OptionalLoadEntryTransition');
    const optionalInvalid = report.contracts.find(({ name }) => name === 'NativeMediaModal');
    const requiredInvalid = report.contracts.find(({ name }) => name === 'RenderUserPopout');
    const assets = report.contracts.find(({ name }) => name === 'Assets.FixedRenderer');
    const userStoreContract = report.contracts.find(({ name }) => name === 'UserStore');
    const clickable = report.contracts.find(({ name }) => name === 'Css.ClickableClasses');
    const localeStoreContract = report.contracts.find(({ name }) => name === 'LocaleStore');
    const messageStoreContract = report.contracts.find(({ name }) => name === 'MessageStore');
    const channelStoreContract = report.contracts.find(({ name }) => name === 'ChannelStore');
    const selectedChannelStoreContract = report.contracts.find(({ name }) => name === 'SelectedChannelStore');
    const selectedGuildStoreContract = report.contracts.find(({ name }) => name === 'SelectedGuildStore');
    const guildStoreContract = report.contracts.find(({ name }) => name === 'GuildStore');
    const guildMemberStoreContract = report.contracts.find(({ name }) => name === 'GuildMemberStore');
    const dispatcherContract = report.contracts.find(({ name }) => name === 'Dispatcher');
    const guildChannelStoreContract = report.contracts.find(({ name }) => name === 'GuildChannelStore');
    const manaConfirmModal = report.contracts.find(({ name }) => name === 'ManaConfirmModal');
    const parserNewContract = report.contracts.find(({ name }) => name === 'ParserNew');
    const systemLocaleContract = report.contracts.find(({ name }) => name === 'SystemLocaleUtils');
    const modalActionsContract = report.contracts.find(({ name }) => name === 'ModalActions');
    const i18nContract = report.contracts.find(({ name }) => name === 'I18nModule');
    const messageContentContract = report.contracts.find(({ name }) => name === 'MessageContentComponent');
    const forumUploadContract = report.contracts.find(({ name }) => name === 'ForumUploadAsReplyRouteModule');
    const cssContracts = report.contracts.filter(({ name }) => typeof name === 'string' && name.startsWith('Css.'));
    const reportPath = path.join(pluginFolder, 'MessageLoggerRuntimeCompatibilityAudit-report.json');

    assert.equal(report.totals.total, 89);
    assert.equal(report.label, 'custom');
    assert.deepEqual(report.options, { loadEntry: false, externalAssets: false });
    assert.equal(integration?.status, 'pass');
    assert.equal(maskedLink?.validation?.ok, true);
    assert.equal(maskedLink?.selected?.type, 'object');
    assert.equal(transition?.outcome, 'load-entry-not-requested');
    assert.equal(transition?.validation?.booleans?.targetAssessmentAvailable, true);
    assert.equal(transition?.owner?.found, false);
    assert.equal(optionalInvalid?.required, false);
    assert.equal(optionalInvalid?.validation?.ok, false);
    assert.equal(optionalInvalid?.status, 'warn');
    assert.equal(requiredInvalid?.required, true);
    assert.equal(requiredInvalid?.validation?.ok, false);
    assert.equal(requiredInvalid?.status, 'fail');
    assert.equal(clickable?.required, true);
    assert.equal(clickable?.validation?.ok, false);
    assert.equal(clickable?.status, 'fail');
    assert.equal(report.contracts.some(({ name }) => name === 'Css.ContainerClasses'), false);
    assert.equal(report.contracts.some(({ name }) => name === 'TextModule'), false);
    assert.deepEqual(
      cssContracts.filter(({ required }) => required === false).map(({ name }) => name).sort(),
      []
    );
    assert.equal(assets?.status, 'pass');
    assert.equal(userStoreContract?.selected?.found, true);
    assert.equal(userStoreContract?.validation?.ok, true);
    assert.equal(messageStoreContract?.selected?.found, true);
    assert.equal(messageStoreContract?.validation?.ok, true);
    assert.equal(channelStoreContract?.selected?.found, true);
    assert.equal(channelStoreContract?.validation?.ok, true);
    assert.equal(selectedChannelStoreContract?.selected?.found, true);
    assert.equal(selectedChannelStoreContract?.validation?.ok, true);
    assert.equal(selectedGuildStoreContract?.selected?.found, true);
    assert.equal(selectedGuildStoreContract?.validation?.ok, true);
    assert.equal(guildStoreContract?.selected?.found, true);
    assert.equal(guildStoreContract?.validation?.ok, true);
    assert.equal(guildMemberStoreContract?.selected?.found, true);
    assert.equal(guildMemberStoreContract?.validation?.ok, true);
    assert.equal(localeStoreContract?.validation?.ok, true);
    assert.equal(guildChannelStoreContract?.selected?.found, true);
    assert.equal(guildChannelStoreContract?.validation?.ok, true);
    assert.equal(dispatcherContract?.selected?.found, true);
    assert.equal(dispatcherContract?.validation?.ok, true);
    assert.equal(dispatcherContract?.status, 'pass');
    assert.equal(manaConfirmModal?.validation?.ok, true);
    assert.equal(parserNewContract?.validation?.ok, true);
    assert.equal(systemLocaleContract?.validation?.ok, true);
    assert.equal(modalActionsContract?.validation?.ok, true);
    assert.equal(i18nContract?.validation?.ok, true);
    assert.equal(messageContentContract?.validation?.ok, true);
    assert.equal(forumUploadContract?.validation?.ok, true);
    const imageModal = report.contracts.find(({ name }) => name === 'ImageModal');
    const trashPrimary = report.contracts.find(({ name }) => name === 'TrashIconPrimary');
    const trashFallback = report.contracts.find(({ name }) => name === 'TrashIconFallback');
    const userContextMenuContract = report.contracts.find(({ name }) => name === 'UserContextMenuModule');
    const getSrcContract = report.contracts.find(({ name }) => name === 'GetSrcModule');
    assert.equal(imageModal?.validation?.ok, true);
    assert.equal(trashPrimary?.validation?.ok, true);
    assert.equal(trashFallback?.validation?.ok, true);
    assert.equal(userContextMenuContract?.validation?.ok, true);
    assert.equal(getSrcContract?.validation?.ok, true);
    assert.ok(selectedAccessorReads > 4);
    assert.ok(storesAccessorReads > 6);
    assert.equal(publicStoreLookups, 2);
    assert.doesNotMatch(serialized, /MessageStore access should be proxied through getStore/);
    assert.equal(clickable?.alternatives?.[0]?.collectionErrors?.includes('Webpack.getModule-unavailable'), false);
    assert.equal(fs.existsSync(reportPath), false);
    assert.equal(accessorReads, 0);
    assert.equal(webpackHooks.filterFactoryCalls || 0, 0);
    assert.equal(webpackHooks.hostFilterInvocations || 0, 0);
    assert.doesNotMatch(serialized, /secret-module-id|secretPropertyName|secret-property-value|secret-label-value|audit\.invalid/);
    assert.doesNotMatch(serialized, new RegExp(pluginFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, /classSamples|function ValidType|https:\/\//);
    assert.doesNotMatch(serialized, /load-entry-attempted/);

    await buildFallbackReport('missing-Stores', () => {
      delete webpack.Stores;
      enableStoreMatchingCandidateShape();
    });

    const throwingStoresReport = await buildFallbackReport('throwing-Stores', () => {
      enableStoreMatchingCandidateShape();
      Object.defineProperty(webpack, 'Stores', {
        configurable: true,
        get() {
          storesRootAccessorCalls += 1;
          throw new Error(storesRootSentinel);
        }
      });
    });
    assert.ok(storesRootAccessorCalls > 0);
    assert.doesNotMatch(throwingStoresReport.variantSerialized, new RegExp(storesRootSentinel));
  } finally {
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
    fs.rmSync(pluginFolder, { recursive: true, force: true });
  }
});

test('DiscordModules lazy-getter inventory is covered by the audit helper', () => {
  const productionSource = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const helperSource = fs.readFileSync(helperPath, 'utf8');
  const blockStart = productionSource.indexOf('const DiscordModules = (() => {');
  const blockEnd = productionSource.indexOf('\nclass PopoutManager', blockStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart, 'DiscordModules source block was not found');
  const block = productionSource.slice(blockStart, blockEnd);
  const lazyGetters = [...block.matchAll(/^\s{4}([A-Za-z_$][\w$]*):\s*lazyGet\('([^']+)'/gm)]
    .map(([, property, label]) => ({ property, label }));
  assert.ok(lazyGetters.length > 0, 'DiscordModules lazy getters were not found');
  for (const { property, label } of lazyGetters) assert.equal(property, label);

  const cssNames = [
    'ClickableClasses', 'ColorClasses', 'ButtonClasses', 'MessageWrapperClasses',
    'MessageToolbarClasses', 'ChatContentClasses', 'MarkupClasses',
    'SpoilerClasses', 'FocusedClasses', 'DefaultColorClasses',
    'BotTagClasses', 'ExecutedCommandClasses', 'TitleClasses', 'ErrorPageClasses',
    'TimestampClasses'
  ];
  const nonCssNames = [
    'UserStore', 'MessageStore', 'ChannelStore', 'GuildChannelStore', 'ImageResolver',
    'SelectedChannelStore', 'SelectedGuildStore', 'LocaleStore', 'GuildStore',
    'GuildMemberStore', 'RelationshipStore', 'MessageActions',
    'ModalActions', 'HistoryUtils', 'HttpModule', 'TrashIcon',
    'TrashIconFallback', 'CUser', 'DiscordUtils', 'TimestampUtils', 'Parser',
    'ParserNew', 'GuildUtils', 'MuteModule', 'Dispatcher', 'ChannelMessages',
    'RenderUserPopout', 'ChannelListModule', 'ManaModule', 'MessageContentComponent',
    'MessageAccessories', 'I18nModule', 'SystemLocaleUtils',
    'GetSrcModule', 'UserContextMenuModule', 'MaskedLink'
  ];
  const actualCssNames = lazyGetters
    .map(({ property }) => property)
    .filter(property => cssNames.includes(property));
  const actualNonCssNames = lazyGetters
    .map(({ property }) => property)
    .filter(property => nonCssNames.includes(property));
  const actualNames = lazyGetters.map(({ property }) => property);
  const expectedNames = [...new Set([...cssNames, ...nonCssNames])];
  assert.deepEqual([...actualNames].sort(), [...expectedNames].sort());
  assert.equal(actualNames.length, 51);
  assert.deepEqual([...actualCssNames].sort(), [...cssNames].sort());
  assert.deepEqual([...actualNonCssNames].sort(), [...nonCssNames].sort());

  for (const name of cssNames) assert.match(helperSource, new RegExp(`name: 'Css\\.${name}'`));
  const helperMappings = Object.fromEntries(nonCssNames.map(name => [name, [name]]));
  helperMappings.TrashIcon = ['TrashIconPrimary'];
  helperMappings.ManaModule = ['ManaModal', 'ManaConfirmModal', 'ManaModalSize'];
  for (const [productionName, helperNames] of Object.entries(helperMappings)) {
    assert.ok(lazyGetters.some(({ property }) => property === productionName));
    for (const helperName of helperNames) {
      assert.match(helperSource, new RegExp(`(?:name:\\s*|store\\()'${helperName}'`));
    }
  }
  assert.match(helperSource, /name: 'MaskedLink'/);
  assert.match(helperSource, /name: 'LoggerIntegration\.RenderLinkComponent'/);
  assert.match(helperSource, /name: 'LoggerIntegration\.AppLayerResolver'/);
  assert.equal(lazyGetters.some(({ property }) => property === 'MaskedLink'), true);
});

test('semantic CSS and Logger-owned literals are covered by the audit helper', () => {
  const productionSource = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const helperSource = fs.readFileSync(helperPath, 'utf8');
  const findClosingBracket = (text, openIndex) => {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = openIndex; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (character === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '/' && next === '/') {
        lineComment = true;
        index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === '\'' || character === '"' || character === '`') {
        quote = character;
        continue;
      }
      if (character === '[') depth += 1;
      else if (character === ']' && --depth === 0) return index;
    }
    return -1;
  };
  const extractResolverSignatures = text => {
    const signatures = [];
    const marker = 'resolveSemanticCssModule([';
    let offset = 0;
    while (true) {
      const markerIndex = text.indexOf(marker, offset);
      if (markerIndex < 0) break;
      const openIndex = markerIndex + marker.length - 1;
      const closeIndex = findClosingBracket(text, openIndex);
      assert.ok(closeIndex > openIndex, 'unterminated resolver key array');
      const keys = [...text.slice(openIndex + 1, closeIndex).matchAll(/'([^']+)'/g)].map(([, key]) => key);
      assert.ok(keys.length > 0, 'resolver key array should be nonempty');
      signatures.push(keys.join('|'));
      offset = closeIndex + 1;
    }
    return signatures;
  };
  const resolverSignatures = extractResolverSignatures(productionSource);
  const classMethodSignatures = [...productionSource.matchAll(/\bthis\.(?:getDiscordClass|getSingleDiscordClass)\(\s*'([^']+)'/g)]
    .map(([, argument]) => argument.split(/\s+/).filter(Boolean).join('|'));
  const requestedSignatures = [...helperSource.matchAll(/requestedKeys:\s*\[([^\]]*)\]/g)]
    .map(([, body]) => [...body.matchAll(/'([^']+)'/g)].map(([, key]) => key).join('|'));
  const requestedSignatureSet = new Set(requestedSignatures);

  assert.match(helperSource, /const ambiguous = selectedUsableCandidateCount !== 1/);

  assert.equal(resolverSignatures.length, 26);
  assert.equal(classMethodSignatures.length, 23);
  assert.equal(requestedSignatures.length, 38);
  for (const signature of [...resolverSignatures, ...classMethodSignatures]) {
    assert.ok(requestedSignatureSet.has(signature), `helper is missing requested key signature ${signature}`);
  }

  const seeds = [...productionSource.matchAll(/obfuscatedClass\(\s*'([^']+)'\s*\)/g)].map(([, seed]) => seed);
  assert.equal(seeds.length, 66);
  assert.equal(new Set(seeds).size, 66);
  for (const seed of seeds) assert.ok(helperSource.includes(seed), `helper is missing CSS seed ${seed}`);
  assert.ok(helperSource.includes('ml2-deleted'));
  assert.ok(helperSource.includes('mlv2-toast-progress'));

  const markerTokens = [...new Set([...productionSource.matchAll(/data-(?:ml2|mlv2)-[A-Za-z0-9-]+/g)].map(([token]) => token))];
  assert.equal(markerTokens.length, 21);
  for (const token of markerTokens) assert.ok(helperSource.includes(token), `helper is missing marker ${token}`);

  const fixedDependencies = [
    '322c936a8c8be1b803cd94861bdfa868.png',
    'i.clouds.tf',
    'q2vy/r8q6.png',
    'http://localhost:7474',
    'cdn.discordapp.com',
    'media.discordapp.net',
    '2.81h8.36a3',
    'M5\\.06 7a1 1 0 0 0-1 1\\.06l\\.76 12\\.13',
    '[data-mana-component="modal"]',
    '[data-mana-component="button"]'
  ];
  for (const dependency of fixedDependencies) {
    assert.ok(helperSource.includes(dependency), `helper is missing fixed dependency ${dependency}`);
  }

  const forumFallbackClasses = [
    'focusTarget_faa96b', 'left_faa96b', 'body_faa96b', 'header_faa96b',
    'headerText_faa96b', 'message_faa96b', 'messageFocusBlock_faa96b',
    'messageContent_c19a55', 'footer_faa96b', 'tags__08166',
    'lineClamp2Plus__4bd52', 'heading-lg/semibold_cf4812', 'defaultColor__5345c',
    'text-sm/semibold_cf4812', 'author_d3eee8', 'postTitleText_faa96b',
    'defaultColor__4bd52', 'text-sm/normal_cf4812'
  ];
  assert.equal(forumFallbackClasses.length, 18);
  for (const className of forumFallbackClasses) assert.ok(helperSource.includes(className));
});

test('direct Webpack discovery remains owned by the approved production methods', () => {
  const productionSource = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const helperSource = fs.readFileSync(helperPath, 'utf8');
  const findMatchingBrace = (text, openIndex) => {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = openIndex; index < text.length; index += 1) {
      const character = text[index];
      const next = text[index + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        if (character === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '/' && next === '/') {
        lineComment = true;
        index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === '\'' || character === '"' || character === '`') {
        quote = character;
        continue;
      }
      if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) return index;
    }
    return -1;
  };
  const findBodyRange = (text, marker) => {
    const markerIndex = text.indexOf(marker);
    assert.ok(markerIndex >= 0, `production method marker was not found: ${marker}`);
    const openIndex = text.indexOf('{', markerIndex + marker.length - 1);
    assert.ok(openIndex >= 0, `production method body was not found: ${marker}`);
    const closeIndex = findMatchingBrace(text, openIndex);
    assert.ok(closeIndex > openIndex, `production method body was not balanced: ${marker}`);
    return { start: markerIndex, open: openIndex, end: closeIndex + 1 };
  };
  const maskNonCode = text => {
    const characters = [...text];
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < characters.length; index += 1) {
      const character = characters[index];
      const next = characters[index + 1];
      if (lineComment) {
        if (character === '\n') lineComment = false;
        else characters[index] = ' ';
        continue;
      }
      if (blockComment) {
        if (character === '*' && next === '/') {
          characters[index] = ' ';
          characters[index + 1] = ' ';
          blockComment = false;
          index += 1;
        } else if (character !== '\n') characters[index] = ' ';
        continue;
      }
      if (quote) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        if (character !== '\n') characters[index] = ' ';
        continue;
      }
      if (character === '/' && next === '/') {
        characters[index] = ' ';
        characters[index + 1] = ' ';
        lineComment = true;
        index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        characters[index] = ' ';
        characters[index + 1] = ' ';
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === '\'' || character === '"' || character === '`') {
        quote = character;
        characters[index] = ' ';
      }
    }
    return characters.join('');
  };
  const webpackReferences = text => [...maskNonCode(text).matchAll(
    /\bWebpack\.(getModule|getByKeys|getBySource|getByStrings|getStore|waitForModule)\b/g
  )].map(match => ({ property: match[1], index: match.index }));
  const methodMarkers = [
    ['getNativeMediaModal', '      getNativeMediaModal() {', ['getBySource', 'getBySource', 'getBySource']],
    ['findImageModal', '      findImageModal() {', ['getBySource', 'getModule']],
    ['recoverStartupMessageClasses', '  recoverStartupMessageClasses() {', ['getModule', 'getModule', 'waitForModule', 'waitForModule']],
    ['resolveLoggerNativeDocumentMessageClass', '  resolveLoggerNativeDocumentMessageClass(suppliedMessage = null) {', ['getModule']],
    ['resolveLoggerNativeAudioPlayer', '  resolveLoggerNativeAudioPlayer() {', ['getModule']],
    ['installMessageAccessoriesPatch', '  installMessageAccessoriesPatch() {', ['getModule', 'waitForModule', 'waitForModule']],
    ['patchForumUploadAsReplyRoute', '  patchForumUploadAsReplyRoute() {', ['getModule', 'waitForModule', 'waitForModule']]
  ];
  const methodRanges = methodMarkers.map(([name, marker, expected]) => {
    const range = findBodyRange(productionSource, marker);
    const actual = webpackReferences(productionSource.slice(range.open + 1, range.end - 1))
      .map(({ property }) => property);
    assert.deepEqual(actual, expected, `${name} direct Webpack sequence changed`);
    return { name, ...range };
  });

  const mappedContracts = [
    'NativeMediaModal', 'ImageModal', 'NativeDocumentMessageClass',
    'NativeAudioPlayer', 'MessageAccessories', 'ForumUploadAsReplyRouteModule',
    'Css.MessageWrapperClasses', 'Css.Eager.SelectedMessage'
  ];
  for (const contract of mappedContracts) {
    assert.match(helperSource, new RegExp(`name: '${contract}'`));
  }

  const resolverStart = productionSource.indexOf('function resolveSemanticCssModule(');
  assert.ok(resolverStart >= 0, 'resolveSemanticCssModule was not found');
  const resolverRange = findBodyRange(productionSource, 'function resolveSemanticCssModule(');
  const normalizerRange = findBodyRange(productionSource, 'function normalizeSemanticCssModule(');
  const discordModulesStart = productionSource.indexOf('const DiscordModules = (() => {');
  const discordModulesEnd = productionSource.indexOf('\nclass PopoutManager', discordModulesStart);
  assert.ok(discordModulesStart >= 0 && discordModulesEnd > discordModulesStart, 'DiscordModules block was not found');
  const excludedRanges = [
    [resolverStart, resolverRange.end],
    [normalizerRange.start, normalizerRange.end],
    [discordModulesStart, discordModulesEnd]
  ];
  const blanked = [...productionSource];
  for (const [start, end] of excludedRanges) {
    for (let index = start; index < end; index += 1) {
      if (blanked[index] !== '\n') blanked[index] = ' ';
    }
  }
  const remainingReferences = webpackReferences(blanked);
  for (const reference of remainingReferences) {
    const owners = methodRanges.filter(({ start, end }) => reference.index >= start && reference.index < end);
    assert.equal(owners.length, 1, `unowned direct Webpack reference: ${reference.property}`);
  }
});

test('NativeMediaModal accepts the second ordered source alternative', async () => {
  const savedGlobals = saveGlobals(['BdApi', 'document', 'window']);
  const cachedHelper = require.cache[helperPath];
  const pluginFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ml2-native-modal-audit-'));
  const nativeMediaModal = {
    openMediaModal(input) {
      const { startingIndex, numMediaItems, shouldHideMediaOptions } = input || {};
      return [startingIndex, numMediaItems, shouldHideMediaOptions];
    }
  };
  let selectedGetterReads = 0;
  Object.defineProperty(nativeMediaModal, 'modalKey', {
    configurable: true,
    enumerable: true,
    get() {
      selectedGetterReads += 1;
      return 'MEDIA_VIEWER';
    }
  });
  const alternativeOnlyMediaModal = {
    openMediaModal(input) {
      const { numMediaItems, shouldHideMediaOptions } = input || {};
      return [numMediaItems, shouldHideMediaOptions];
    },
    modalKey: 'MEDIA_VIEWER'
  };
  let selectedModule = nativeMediaModal;
  const moduleRecord = { id: 2, exports: nativeMediaModal };
  const webpack = buildWebpackMock(nativeMediaModal, moduleRecord, { throwGetModuleCount: 2 });
  const sourceLookups = [];
  webpack.getBySource = (...args) => {
    sourceLookups.push(args);
    if (args[0] === 'numMediaItems'
      && args[1] === 'shouldHideMediaOptions'
      && args[2]?.searchExports === false
    ) return selectedModule;
    return null;
  };
  const documentObject = createDocumentMock();
  const addon = {
    instance: {
      tools: {
        renderLinkComponent() {
          return { type: function ValidType() {} };
        }
      }
    }
  };
  const api = {
    Plugins: {
      folder: pluginFolder,
      isEnabled() { return true; },
      get(name) { return name === 'MessageLoggerV2' ? addon : null; }
    },
    Webpack: webpack,
    UI: {
      buildSettingsPanel() {},
      showChangelogModal() {},
      showConfirmationModal() {},
      showInviteModal() {},
      showNotification() {}
    },
    React: {},
    ReactDOM: {},
    ReactUtils: {},
    Components: {},
    Patcher: {},
    ContextMenu: {},
    Utils: {},
    DOM: {},
    Hooks: {},
    Logger: {}
  };
  class MockBdApi {
    constructor() {
      return api;
    }
  }
  globalThis.BdApi = MockBdApi;
  globalThis.document = documentObject;
  globalThis.window = {
    document: documentObject,
    addEventListener() {},
    removeEventListener() {}
  };

  try {
    delete require.cache[helperPath];
    const Audit = require(helperPath);
    const report = await new Audit().buildReport('native-modal', { loadEntry: false, externalAssets: false });
    const contract = report.contracts.find(({ name }) => name === 'NativeMediaModal');
    assert.equal(contract?.required, false);
    assert.equal(contract?.status, 'pass');
    assert.equal(contract?.selected?.semanticAlternative, 'native-numMediaItems-shouldHideMediaOptions');
    assert.equal(contract?.validation?.ok, true);
    assert.ok(selectedGetterReads > 0);
    assert.deepEqual(sourceLookups
      .filter(args => args[args.length - 1]?.searchExports === false)
      .slice(0, 2)
      .map(args => args.slice(0, 2)), [
      ['startingIndex', 'items'],
      ['numMediaItems', 'shouldHideMediaOptions']
    ]);
    selectedModule = alternativeOnlyMediaModal;
    const rejectedReport = await new Audit().buildReport('native-modal-rejected', { loadEntry: false, externalAssets: false });
    const rejectedContract = rejectedReport.contracts.find(({ name }) => name === 'NativeMediaModal');
    assert.equal(rejectedContract?.required, false);
    assert.equal(rejectedContract?.status, 'warn');
    assert.equal(rejectedContract?.validation?.ok, false);
  } finally {
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
    fs.rmSync(pluginFolder, { recursive: true, force: true });
  }
});


test('cleanup audit validates inherited cache and store capabilities without invoking accessors', () => {
  const source = fs.readFileSync(helperPath, 'utf8');
  const end = source.indexOf('module.exports = class');
  assert.ok(end > 0);
  const contracts = vm.runInNewContext(`${source.slice(0, end)}\nmoduleContracts();`, { require });
  const message = contracts.find(contract => contract.name === 'MessageStore');
  const channel = contracts.find(contract => contract.name === 'ChannelMessages');
  class StoreBase { emitChange() {} }
  const store = Object.assign(new StoreBase(), { getMessage() {}, getMessages() {}, getLastEditableMessage() {} });
  class CacheBase { has() {} removeMany() {} }
  class Cache extends CacheBase { static get() {} static commit() {} }
  Cache._channelMessages = {};
  assert.equal(message.validate(store).ok, true);
  assert.equal(channel.validate(Cache).ok, true);
  assert.strictEqual(message.select({ Webpack: { Stores: { MessageStore: store } } }).value, store);
  assert.strictEqual(channel.select({ Webpack: { getModule: filter => filter(Cache) ? Cache : null } }).value, Cache);
  let accessorReads = 0;
  for (const replacement of ['missing', 'noncallable', 'accessor']) {
    const target = Object.create(StoreBase.prototype);
    Object.assign(target, { getMessage() {}, getMessages() {}, getLastEditableMessage() {} });
    if (replacement === 'missing') Object.setPrototypeOf(target, null);
    if (replacement === 'noncallable') target.emitChange = 0;
    if (replacement === 'accessor') Object.defineProperty(target, 'emitChange', { get() { accessorReads++; throw Error('getter'); } });
    assert.equal(message.validate(target).booleans.emitChange, false);
    assert.equal(message.validate(target).ok, false);
  }
  for (const [key, location, label] of [
    ['get', 'static', 'get'], ['commit', 'static', 'commit'],
    ['has', 'prototype', 'prototype.has'], ['removeMany', 'prototype', 'prototype.removeMany']
  ]) {
    for (const replacement of ['missing', 'noncallable', 'accessor']) {
      class Candidate { static get() {} static commit() {} has() {} removeMany() {} }
      Candidate._channelMessages = {};
      const target = location === 'static' ? Candidate : Candidate.prototype;
      if (replacement === 'missing') delete target[key];
      if (replacement === 'noncallable') target[key] = 0;
      if (replacement === 'accessor') Object.defineProperty(target, key, { configurable: true, get() { accessorReads++; throw Error('getter'); } });
      const result = channel.validate(Candidate);
      assert.equal(result.booleans[label], false, `${label}: ${replacement}`);
      assert.equal(result.ok, false);
    }
  }
  assert.equal(accessorReads, 0);
});
