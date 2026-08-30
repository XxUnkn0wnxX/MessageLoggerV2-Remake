const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const helperPath = path.join(__dirname, '..', 'tools', 'MessageLoggerRuntimeCompatibilityAudit.plugin.js');

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
  const webpackHooks = { throwGetModuleCount: 2 };
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
    const serialized = JSON.stringify(report);
    const integration = report.contracts.find(({ name }) => name === 'LoggerIntegration.RenderLinkComponent');
    const assets = report.contracts.find(({ name }) => name === 'Assets.FixedRenderer');
    const reportPath = path.join(pluginFolder, 'MessageLoggerRuntimeCompatibilityAudit-report.json');

    assert.equal(report.totals.total, 95);
    assert.equal(report.label, 'custom');
    assert.deepEqual(report.options, { loadEntry: false, externalAssets: false });
    assert.equal(integration?.status, 'pass');
    assert.equal(assets?.status, 'pass');
    assert.equal(fs.existsSync(reportPath), false);
    assert.equal(accessorReads, 0);
    assert.equal(webpackHooks.filterFactoryCalls || 0, 0);
    assert.equal(webpackHooks.hostFilterInvocations || 0, 0);
    assert.doesNotMatch(serialized, /secret-module-id|secretPropertyName|secret-property-value|secret-label-value|audit\.invalid/);
    assert.doesNotMatch(serialized, new RegExp(pluginFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, /classSamples|function ValidType|https:\/\//);
    assert.doesNotMatch(serialized, /load-entry-attempted/);
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
    'MessageToolbarClasses', 'ContainerClasses', 'ChatContentClasses', 'MarkupClasses',
    'SpoilerClasses', 'FocusedClasses', 'TabBarClasses', 'DefaultColorClasses',
    'BotTagClasses', 'ExecutedCommandClasses', 'TitleClasses', 'ContentClasses',
    'ContainerCompactClasses', 'ErrorPageClasses', 'TabItemClasses', 'TimestampClasses'
  ];
  const nonCssNames = [
    'UserStore', 'MessageStore', 'ChannelStore', 'GuildChannelStore', 'ImageResolver',
    'SelectedChannelStore', 'SelectedGuildStore', 'LocaleStore', 'GuildStore',
    'GuildMemberStore', 'RelationshipStore', 'MessageActions', 'ChannelActions',
    'ModalActions', 'HistoryUtils', 'HttpModule', 'Endpoints', 'TrashIcon',
    'TrashIconFallback', 'CUser', 'DiscordUtils', 'TimestampUtils', 'Parser',
    'ParserNew', 'GuildUtils', 'MuteModule', 'Dispatcher', 'ChannelMessages',
    'RenderUserPopout', 'ChannelListModule', 'ManaModule', 'MessageContentComponent',
    'MessageAccessories', 'I18nModule', 'SystemLocaleUtils', 'TextModule',
    'GetSrcModule', 'UserContextMenuModule'
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
  assert.equal(actualNames.length, 58);
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
  assert.match(helperSource, /name: 'ImageModalRenderLinkCandidate'/);
  assert.match(helperSource, /name: 'LoggerIntegration\.RenderLinkComponent'/);
  assert.equal(lazyGetters.some(({ property }) => property === 'MaskedLink'), false);
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

  assert.equal(resolverSignatures.length, 31);
  assert.equal(classMethodSignatures.length, 23);
  assert.equal(requestedSignatures.length, 43);
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
    ['findImageModal', '      findImageModal() {', ['getBySource']],
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
    'NativeAudioPlayer', 'MessageAccessories', 'ForumUploadAsReplyRouteModule'
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
      const { numMediaItems, shouldHideMediaOptions } = input || {};
      return [numMediaItems, shouldHideMediaOptions];
    },
    modalKey: 'MEDIA_VIEWER'
  };
  const moduleRecord = { id: 2, exports: nativeMediaModal };
  const webpack = buildWebpackMock(nativeMediaModal, moduleRecord, { throwGetModuleCount: 2 });
  const sourceLookups = [];
  webpack.getBySource = (...args) => {
    sourceLookups.push(args);
    if (args[0] === 'numMediaItems'
      && args[1] === 'shouldHideMediaOptions'
      && args[2]?.searchExports === false
    ) return nativeMediaModal;
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
    assert.equal(contract?.status, 'pass');
    assert.equal(contract?.selected?.semanticAlternative, 'native-numMediaItems-shouldHideMediaOptions');
    assert.equal(contract?.validation?.ok, true);
    assert.deepEqual(sourceLookups.slice(0, 2).map(args => args.slice(0, 2)), [
      ['startingIndex', 'items'],
      ['numMediaItems', 'shouldHideMediaOptions']
    ]);
  } finally {
    delete require.cache[helperPath];
    if (cachedHelper) require.cache[helperPath] = cachedHelper;
    restoreGlobals(savedGlobals);
    fs.rmSync(pluginFolder, { recursive: true, force: true });
  }
});
