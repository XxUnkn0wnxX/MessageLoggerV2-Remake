const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  Components,
  createPlugin,
  resetHarness,
  Webpack
} = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');

function useCandidate(candidate) {
  Webpack.getByKeys = () => null;
  Webpack.getModule = filter => filter(candidate) ? candidate : null;
}

test.beforeEach(() => {
  delete Components.Button;
  resetHarness();
});

test.afterEach(() => {
  delete Components.Button;
  resetHarness();
});

test('direct semantic lookup returns the exact object and forwards options', () => {
  const plugin = createPlugin();
  const direct = { button: 'button', lookFilled: 'lookFilled' };
  const options = { searchExports: false };
  let call;
  Webpack.getByKeys = (...args) => {
    call = args;
    return direct;
  };

  assert.strictEqual(plugin.resolveSemanticCssModule(['button', 'lookFilled'], options), direct);
  assert.deepEqual(call, ['button', 'lookFilled', options]);
  assert.equal(Webpack.getModule, undefined);
});

test('the current Button CSS export fixture receives semantic aliases', () => {
  const plugin = createPlugin();
  const fixture = {
    x6: 'button__201d5',
    PG: 'contents__201d5',
    WL: 'lookFilled__201d5',
    x8: 'colorBrand__201d5',
    uu: 'lookOutlined__201d5'
  };
  useCandidate(fixture);

  const result = plugin.resolveSemanticCssModule([
    'button',
    'contents',
    'lookFilled',
    'colorBrand',
    'lookOutlined'
  ]);

  assert.notStrictEqual(result, fixture);
  assert.equal(result.button, fixture.x6);
  assert.equal(result.contents, fixture.PG);
  assert.equal(result.lookFilled, fixture.WL);
  assert.equal(result.colorBrand, fixture.x8);
  assert.equal(result.lookOutlined, fixture.uu);
});

test('composite class values retain their complete original strings', () => {
  const plugin = createPlugin();
  const fixture = {
    first: 'button__201d5 extra-class',
    second: 'contents__201d5 another-class'
  };
  useCandidate(fixture);

  const result = plugin.resolveSemanticCssModule(['button', 'contents']);

  assert.equal(result.button, fixture.first);
  assert.equal(result.contents, fixture.second);
});

test('direct semantic string properties take precedence over derived aliases', () => {
  const plugin = createPlugin();
  const fixture = {
    button: 'direct-button',
    generated: 'button__201d5 generated-companion'
  };
  useCandidate(fixture);

  const result = plugin.resolveSemanticCssModule(['button']);

  assert.equal(result.button, fixture.button);
  assert.equal(result.generated, fixture.generated);
});

test('a partial candidate is rejected and the complete candidate is selected', () => {
  const plugin = createPlugin();
  const partial = { buttonExport: 'button__partial' };
  const complete = { both: 'button__complete contents__complete' };
  Webpack.getByKeys = () => null;
  const inspected = [];
  Webpack.getModule = filter => [partial, complete].find(candidate => {
    inspected.push(candidate);
    return filter(candidate);
  }) || null;

  const result = plugin.resolveSemanticCssModule(['button', 'contents']);

  assert.strictEqual(inspected[0], partial);
  assert.strictEqual(inspected[1], complete);
  assert.equal(result.button, complete.both);
  assert.equal(result.contents, complete.both);
});

test('class token matching does not accept substring lookalikes', () => {
  const plugin = createPlugin();
  useCandidate({ unrelated: 'notbutton__201d5 innerContainer__201d5' });

  assert.equal(plugin.resolveSemanticCssModule(['button', 'container']), null);
});

test('throwing getters are skipped without aborting a valid candidate scan', () => {
  const plugin = createPlugin();
  const fixture = { valid: 'button__201d5 contents__201d5' };
  Object.defineProperty(fixture, 'throwing', {
    enumerable: true,
    configurable: true,
    get() {
      throw new Error('getter failed');
    }
  });
  useCandidate(fixture);

  const result = plugin.resolveSemanticCssModule(['button', 'contents']);

  assert.equal(result.button, fixture.valid);
  assert.equal(result.contents, fixture.valid);
});

test('fallback normalization preserves raw descriptors and never mutates Discord exports', () => {
  const plugin = createPlugin();
  const fixture = Object.create({ inherited: 'inherited' });
  Object.defineProperty(fixture, 'css', {
    value: 'button__201d5 contents__201d5 companion',
    enumerable: false,
    configurable: false,
    writable: false
  });
  const rawKeys = Reflect.ownKeys(fixture);
  const rawDescriptors = Object.getOwnPropertyDescriptors(fixture);
  useCandidate(fixture);

  const result = plugin.resolveSemanticCssModule(['button', 'contents']);

  assert.notStrictEqual(result, fixture);
  assert.strictEqual(Object.getPrototypeOf(result), Object.getPrototypeOf(fixture));
  assert.deepEqual(Reflect.ownKeys(fixture), rawKeys);
  assert.deepEqual(Object.getOwnPropertyDescriptors(fixture), rawDescriptors);
  for (const key of rawKeys) {
    assert.deepEqual(Object.getOwnPropertyDescriptor(result, key), rawDescriptors[key]);
  }
  assert.equal(result.button, fixture.css);
  assert.equal(result.contents, fixture.css);
  assert.equal(Object.prototype.hasOwnProperty.call(fixture, 'button'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(fixture, 'contents'), false);
});

test('a failed lookup retries and can succeed after the next module scan', () => {
  const plugin = createPlugin();
  const fixture = { css: 'button__201d5' };
  let available = false;
  let scans = 0;
  Webpack.getByKeys = () => null;
  Webpack.getModule = filter => {
    scans++;
    return available && filter(fixture) ? fixture : null;
  };

  assert.equal(plugin.resolveSemanticCssModule(['button']), null);
  available = true;
  assert.equal(plugin.resolveSemanticCssModule(['button']).button, fixture.css);
  assert.equal(scans, 2);
});

test('resolver leaves Components.Button.Colors unchanged', () => {
  const plugin = createPlugin();
  const colors = { BRAND: 'brand', RED: 'red' };
  Components.Button = { Colors: colors };
  Webpack.getByKeys = () => null;
  Webpack.getModule = () => null;

  assert.equal(plugin.resolveSemanticCssModule(['button']), null);
  assert.strictEqual(Components.Button.Colors, colors);
});

test('CSS DiscordModules getters use the semantic resolver without changing alternatives', () => {
  const start = source.indexOf('  return Object.defineProperties({}, {');
  const end = source.indexOf("    CUser: lazyGet('CUser'", start);
  assert.ok(start >= 0 && end > start, 'DiscordModules CSS getter range was not found');
  const cssGetters = source.slice(start, end);
  const getters = [
    ['ClickableClasses', ['clickable']],
    ['ColorClasses', ['colorDanger', 'colorPremium']],
    ['ButtonClasses', ['button', 'colorBrand', 'lookFilled']],
    ['MessageToolbarClasses', ['messageListItem', 'buttons']],
    ['ContainerClasses', ['containerCozyBounded']],
    ['ChatContentClasses', ['chatContent']],
    ['MarkupClasses', ['markup']],
    ['FocusedClasses', ['focused']],
    ['TabBarClasses', ['tabBar']],
    ['DefaultColorClasses', ['defaultColor']],
    ['BotTagClasses', ['botTag']],
    ['ExecutedCommandClasses', ['executedCommand']],
    ['TitleClasses', ['title', 'chatContent']],
    ['ContentClasses', ['content', 'marginCompactIndent']],
    ['ContainerCompactClasses', ['container', 'containerCompactBounded']],
    ['ErrorPageClasses', ['errorPage']],
    ['TabItemClasses', ['item', 'selected', 'topPill']]
  ];
  for (const [name, keys] of getters) {
    const keyList = keys.map(key => `'${key}'`).join(', ');
    assert.match(
      cssGetters,
      new RegExp(`${name}: lazyGet\\('${name}', \\(\\) => resolveSemanticCssModule\\(\\[${keyList}\\]\\)`),
      `${name} should call resolveSemanticCssModule with its semantic keys`
    );
  }
  assert.match(
    cssGetters,
    /MessageWrapperClasses: lazyGet\('MessageWrapperClasses', \(\) => resolveSemanticCssModule\(\['message', 'cozyMessage'\]\) \|\| resolveSemanticCssModule\(\['message', 'groupStart'\]\)\)/
  );
  assert.match(
    cssGetters,
    /SpoilerClasses: lazyGet\('SpoilerClasses', \(\) => resolveSemanticCssModule\(\['spoilerText', 'hidden'\]\) \?\? resolveSemanticCssModule\(\['spoilerContent', 'hidden'\]\)\)/
  );
});

test('TimestampClasses keeps both resolver alternatives and searchExports options', () => {
  const start = source.indexOf("    TimestampClasses: lazyGet('TimestampClasses'");
  const end = source.indexOf('    Parser:', start);
  assert.ok(start >= 0 && end > start, 'TimestampClasses getter range was not found');
  const timestampGetter = source.slice(start, end);

  assert.equal((timestampGetter.match(/resolveSemanticCssModule/g) || []).length, 2);
  assert.equal((timestampGetter.match(/\{ searchExports: true \}/g) || []).length, 2);
  assert.match(timestampGetter, /'latin24CompactTimeStamp',[\s\S]*\], \{ searchExports: true \}\)/);
  assert.match(timestampGetter, /'timestampInline',[\s\S]*\], \{ searchExports: true \}\)/);
});

test('eager CSS class paths use the resolver before preserving existing splits', () => {
  const start = source.indexOf('    this.classes = {');
  const end = source.indexOf('    };', start);
  assert.ok(start >= 0 && end > start, 'eager classes block was not found');
  const eagerClasses = source.slice(start, end);

  assert.match(eagerClasses, /username:\s+resolveSemanticCssModule\(\['username'\]\)\?\.username\?\.split/);
  assert.match(eagerClasses, /timestamp:\s+resolveSemanticCssModule\(\['timestamp'\]\)\?\.timestamp\?\.split/);
  assert.match(eagerClasses, /selected:\s+resolveSemanticCssModule\(\['selected', 'message'\]\)\?\.selected\?\.split/);
  assert.match(eagerClasses, /container:\s+resolveSemanticCssModule\(\['container', 'content'\]\)\?\.container\?\.split/);
  assert.match(eagerClasses, /messageContent:\s+resolveSemanticCssModule\(\['messageContent'\]\)\?\.messageContent\?\.split/);
});

test('getDiscordClass uses the resolver fallback and caches only successful results', () => {
  const plugin = createPlugin();
  const fixture = { css: 'button__201d5 lookFilled__201d5' };
  let scans = 0;
  Webpack.getByKeys = () => null;
  Webpack.getModule = filter => {
    scans++;
    return filter(fixture) ? fixture : null;
  };

  assert.equal(plugin.getDiscordClass('button lookFilled'), fixture.css);
  assert.equal(plugin.getDiscordClass('button lookFilled'), fixture.css);
  assert.equal(scans, 1);
});

test('getDiscordClass retries after a null resolver result', () => {
  const plugin = createPlugin();
  const fixture = { css: 'button__201d5' };
  let available = false;
  let scans = 0;
  Webpack.getByKeys = () => null;
  Webpack.getModule = filter => {
    scans++;
    return available && filter(fixture) ? fixture : null;
  };

  assert.equal(plugin.getDiscordClass('button'), '');
  available = true;
  assert.equal(plugin.getDiscordClass('button'), fixture.css);
  assert.equal(scans, 2);
});

test('native audio class lookup uses the semantic resolver and preserves options', () => {
  const plugin = createPlugin();
  const fixture = { css: 'mosaicItemContent__201d5' };
  let directArgs;
  let moduleOptions;
  Webpack.getByKeys = (...args) => {
    directArgs = args;
    return null;
  };
  Webpack.getModule = (filter, options) => {
    moduleOptions = options;
    return filter(fixture) ? fixture : null;
  };

  assert.equal(plugin.getLoggerNativeAudioClassName(), fixture.css);
  assert.deepEqual(directArgs, ['mosaicItemContent', { searchExports: true }]);
  assert.deepEqual(moduleOptions, { searchExports: true });
});

test('generic, timestamp, and native-audio class methods route through the resolver', () => {
  const genericStart = source.indexOf('  getDiscordClass(arg, thrw) {');
  const genericEnd = source.indexOf('  getSingleDiscordClass(', genericStart);
  const genericMethod = source.slice(genericStart, genericEnd);
  assert.match(genericMethod, /this\._classCache\[cacheKey\] \?\?= resolveSemanticCssModule\(args\)/);
  assert.doesNotMatch(genericMethod, /Webpack\.getByKeys/);

  const timestampStart = source.indexOf('  getTimestampClassesModule() {');
  const timestampEnd = source.indexOf('  getTimestampClass(', timestampStart);
  const timestampMethod = source.slice(timestampStart, timestampEnd);
  assert.equal((timestampMethod.match(/resolveSemanticCssModule/g) || []).length, 2);
  assert.equal((timestampMethod.match(/\{ searchExports: true \}/g) || []).length, 2);
  assert.match(timestampMethod, /DiscordModules\.TimestampClasses \|\| resolveSemanticCssModule\(\[/);

  const audioStart = source.indexOf('  getLoggerNativeAudioClassName() {');
  const audioEnd = source.indexOf('  createLoggerNativeAudioProps(', audioStart);
  const audioMethod = source.slice(audioStart, audioEnd);
  assert.match(audioMethod, /resolveSemanticCssModule\(\['mosaicItemContent'\], \{ searchExports: true \}\)/);
  assert.doesNotMatch(audioMethod, /Webpack\.getModule/);
});

test('observer matching uses exact nonempty class tokens', () => {
  const start = source.indexOf('  observer({ addedNodes }) {');
  const end = source.indexOf('  getSettingEnableDependencies(', start);
  const observerMethod = source.slice(start, end);
  assert.match(observerMethod, /const classTokens = isString \? className\.split\(\/\\s\+\/\)\.filter\(Boolean\) : \[\]/);
  assert.match(observerMethod, /const matchesClass = token => !!token && classTokens\.includes\(token\)/);
  assert.doesNotMatch(observerMethod, /className\.includes/);
});

test('observer ignores empty and substring-only class candidates', () => {
  const plugin = createPlugin({
    settings: { showDeletedCount: false, showEditedCount: false }
  });
  const observerMethod = plugin.observer;
  const originalClasses = {
    chatClass: observerMethod.chatClass,
    chatContentClass: observerMethod.chatContentClass,
    titleClass: observerMethod.titleClass,
    containerCozyClass: observerMethod.containerCozyClass
  };
  let selectedChannelCalls = 0;
  plugin.getSelectedTextChannel = () => {
    selectedChannelCalls++;
    return { id: 'channel-id' };
  };

  try {
    observerMethod.chatClass = '';
    observerMethod.chatContentClass = '';
    observerMethod.titleClass = '';
    observerMethod.containerCozyClass = '';
    plugin.observer({ addedNodes: [{ className: 'anything', style: {} }] });
    assert.equal(selectedChannelCalls, 0);

    observerMethod.chatClass = 'chat__201d5';
    plugin.observer({ addedNodes: [{ className: 'notchat__201d5', style: {} }] });
    assert.equal(selectedChannelCalls, 0);

    plugin.observer({ addedNodes: [{ className: 'other chat__201d5', style: {} }] });
    assert.equal(selectedChannelCalls, 1);
  } finally {
    Object.assign(observerMethod, originalClasses);
  }
});

test('group collection derives one wrapper token and stops safely when unavailable', () => {
  const start = source.indexOf('      const messageWrapperClass =');
  const end = source.indexOf('      const removeGroupFromLog', start);
  assert.ok(start >= 0 && end > start, 'group collection range was not found');
  const groupCollection = source.slice(start, end);
  assert.match(groupCollection, /const messageWrapperClass = typeof DiscordModules\.MessageWrapperClasses\?\.message === 'string'[\s\S]*split\(\/\\s\+\/\)\.find\(Boolean\)/);
  assert.match(groupCollection, /if \(messageWrapperClass\) \{/);
  assert.doesNotMatch(groupCollection, /if \(!messageWrapperClass\) return messages;/);
  assert.match(groupCollection, /for \(const msg of messages\) if \(msg\?\.messageId\) messageIds\.push\(msg\.messageId\)/);
  assert.match(groupCollection, /target\.classList\.contains\(messageWrapperClass\)/);
  assert.doesNotMatch(groupCollection, /target\.classList\.contains\(DiscordModules\.MessageWrapperClasses\)/);
});
