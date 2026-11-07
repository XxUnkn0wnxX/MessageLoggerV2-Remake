const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createPlugin, loggerEvents, resetHarness, Webpack } = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const wrapper = { a: 'message_ab other', b: 'cozyMessage_ab' };
const selected = { a: 'selected_ab', b: 'message_ab' };
function setup(available = []) {
  resetHarness();
  const waits = [];
  Webpack.getByKeys = () => null;
  const matchModule = (exports, filter, options = {}) => {
    if (filter(exports)) return exports;
    const defaultKey = Object.hasOwn(exports, 'A') ? 'A'
      : Object.hasOwn(exports, 'Ay') ? 'Ay'
        : exports.__esModule && Object.hasOwn(exports, 'default') ? 'default' : null;
    const keys = options.searchExports ? Object.keys(exports) : defaultKey ? [defaultKey] : [];
    for (const key of keys) if (filter(exports[key])) return exports[key];
    return null;
  };
  Webpack.getModule = (filter, options) => {
    for (const exports of available) {
      const match = matchModule(exports, filter, options);
      if (match != null) return match;
    }
    return null;
  };
  Webpack.waitForModule = (filter, options) => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    waits.push({ filter, options, resolve, deliver(exports) {
      const match = matchModule(exports, filter, options);
      if (match != null) resolve(match);
      return match;
    } });
    return promise;
  };
  let cssCount = 0;
  const plugin = createPlugin({ __started: true, _startupGeneration: 1, classes: { message: '', selected: '' }, updateCSS: () => { cssCount++; } });
  return { plugin, waits, cssCount: () => cssCount };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('warm semantic classes resolve independently without waiting or overwriting existing values', () => {
  const { plugin, waits, cssCount } = setup([wrapper, selected]);
  plugin.recoverStartupMessageClasses();
  assert.equal(plugin.classes.message, 'message_ab');
  assert.equal(plugin.classes.selected, 'selected_ab');
  assert.equal(cssCount(), 2, 'CSS refreshes as each recovered class becomes available');
  assert.equal(waits.length, 0);
  plugin.recoverStartupMessageClasses();
  assert.equal(cssCount(), 2);
  const second = setup([wrapper, selected]);
  second.plugin.classes = { message: 'existing_message', selected: 'existing_selected' };
  second.plugin.recoverStartupMessageClasses();
  assert.deepEqual(second.plugin.classes, { message: 'existing_message', selected: 'existing_selected' });
  assert.equal(second.waits.length, 0);
  assert.equal(second.cssCount(), 0);
});

test('late waits filter malformed candidates and complete independently', async () => {
  const { plugin, waits, cssCount } = setup();
  plugin.recoverStartupMessageClasses();
  plugin.recoverStartupMessageClasses();
  assert.equal(waits.length, 2);
  const [messageWait, selectedWait] = waits;
  assert.equal(messageWait.options.searchExports, false);
  assert.equal(selectedWait.options.searchExports, false);
  assert.equal(messageWait.filter(selected), false);
  assert.equal(messageWait.filter({ message: '', cozyMessage: 'cozyMessage_ab' }), false);
  assert.equal(selectedWait.filter({ selected: ' ', message: 'message_ab' }), false);
  assert.equal(selectedWait.filter({ selected: 'bad.token', message: 'message_ab' }), false);
  assert.equal(messageWait.filter({ message: 'message_ab', groupStart: 'groupStart_ab' }), true);
  selectedWait.resolve(selected);
  await flush();
  assert.equal(plugin.classes.selected, 'selected_ab');
  assert.equal(plugin.classes.message, '');
  assert.equal(cssCount(), 1);
  messageWait.resolve(wrapper);
  await flush();
  assert.equal(plugin.classes.message, 'message_ab');
  assert.equal(cssCount(), 2, 'late message-class recovery refreshes the stylesheet too');
});

test('message class resolving before selected also refreshes the stylesheet in both stages', async () => {
  const { plugin, waits, cssCount } = setup();
  plugin.recoverStartupMessageClasses();

  waits[0].resolve(wrapper);
  await flush();
  assert.equal(plugin.classes.message, 'message_ab');
  assert.equal(plugin.classes.selected, '');
  assert.equal(cssCount(), 1);

  waits[1].resolve(selected);
  await flush();
  assert.equal(plugin.classes.selected, 'selected_ab');
  assert.equal(cssCount(), 2);
});

test('stop aborts waits and stale results cannot affect a restarted instance', async () => {
  const { plugin, waits, cssCount } = setup();
  plugin.recoverStartupMessageClasses();
  const old = [...waits];
  plugin.__started = false;
  plugin.stop();
  assert.ok(old.every(wait => wait.options.signal.aborted));
  plugin.__started = true;
  plugin.classes = { message: '', selected: '' };
  plugin.recoverStartupMessageClasses();
  assert.equal(waits.length, 4);
  old[0].resolve(wrapper); old[1].resolve(selected);
  await flush();
  assert.deepEqual(plugin.classes, { message: '', selected: '' });
  assert.equal(cssCount(), 0);
  waits[2].resolve(wrapper); waits[3].resolve(selected);
  await flush();
  assert.deepEqual(plugin.classes, { message: 'message_ab', selected: 'selected_ab' });
  assert.equal(cssCount(), 2);
});

test('stylesheet keeps hover selector valid before and after selected class arrives', () => {
  const start = source.indexOf('    this.updateCSS = () => {');
  const end = source.indexOf('    this.updateCSS();', start);
  assert.ok(start >= 0 && end > start);
  const assignment = source.slice(start, end);
  let css = '';
  const context = {
    style: { deletedAlt: 'deleted-alt', removedAttachmentPreview: 'removed-preview' },
    classes: { selected: '', message: 'message_ab' }, settings: {}, stringHeldCaptive: 'scratch'
  };
  vm.runInNewContext(`(function() { ${assignment} }).call(context);`, {
    context, DOM: { removeStyle() {}, addStyle(_key, value) { css = value; } }, hexToRgb() { return 'rgb'; }
  });
  context.updateCSS();
  assert.match(css, /html #app-mount \.deleted-alt:hover \{/);
  assert.doesNotMatch(css, /\.deleted-alt\.\s*\{/);
  assert.match(css, /\.theme-dark \.removed-preview:not\(:hover\) \{\s*filter: grayscale\(100%\) !important;/);
  assert.match(css, /\.message_ab:hover \.removed-preview \{\s*filter: none !important;/);
  assert.match(css, /\.removed-preview \{\s*transition: filter 0\.3s !important;/);
  context.classes.selected = 'selected_ab';
  context.updateCSS();
  assert.match(css, /html #app-mount \.deleted-alt:hover, html #app-mount \.deleted-alt\.selected_ab \{/);
});

test('late malformed results and replaced class state cannot change existing presentation', async () => {
  const first = setup();
  first.plugin.recoverStartupMessageClasses();
  first.plugin.classes.selected = 'already_selected';
  first.waits[0].resolve({ message: '', cozyMessage: 'cozyMessage_ab' });
  first.waits[1].resolve(selected);
  await flush();
  assert.deepEqual(first.plugin.classes, { message: '', selected: 'already_selected' });
  assert.equal(first.cssCount(), 0);

  const second = setup();
  second.plugin.recoverStartupMessageClasses();
  second.plugin.classes = { message: '', selected: '' };
  second.waits[0].resolve(wrapper);
  second.waits[1].resolve(selected);
  await flush();
  assert.deepEqual(second.plugin.classes, { message: '', selected: '' });
  assert.equal(second.cssCount(), 0);
});

test('unavailable or rejecting waits are contained without scheduling timers or requests', async () => {
  const { plugin } = setup();
  let waits = 0;
  Webpack.waitForModule = () => {
    waits++;
    if (waits === 1) throw Error('unavailable');
    return Promise.reject(Error('failed'));
  };
  Webpack.getByKeys = () => null;
  Webpack.getModule = () => null;
  plugin.recoverStartupMessageClasses();
  await flush();
  assert.equal(waits, 2);
  assert.deepEqual(plugin.classes, { message: '', selected: '' });
});


test('stylesheet application failures are reported and cancelled completions stay silent', async () => {
  const first = setup();
  first.plugin.updateCSS = () => { throw Error('stylesheet unavailable'); };
  first.plugin.recoverStartupMessageClasses();
  first.waits[1].resolve(selected);
  await flush();
  assert.equal(first.plugin.classes.selected, 'selected_ab');
  assert.ok(loggerEvents.some(event => event[0] === 'warn' && String(event[1]).includes('Could not recover Discord selected class.')));

  const second = setup();
  let cssCalls = 0;
  second.plugin.updateCSS = () => { cssCalls++; throw Error('stale stylesheet'); };
  second.plugin.recoverStartupMessageClasses();
  second.plugin.__started = false;
  second.plugin.stop();
  second.waits[1].resolve(selected);
  await flush();
  assert.equal(second.plugin.classes.selected, '');
  assert.equal(cssCalls, 0);
  assert.equal(loggerEvents.some(event => event[0] === 'warn' && String(event[1]).includes('Could not recover Discord selected class.')), false);
});


test('unrelated named enum is skipped in immediate and late scans; raw and default CSS still recover', async () => {
  const enumOwner = { X: {
    MESSAGE_REQUESTS_NOTICE_SETTING: 'message_requests_notice_setting',
    SELECTED_CHANNEL_NOTIFICATIONS: 'selected_channel_notifications',
    MESSAGE_SEARCH_DEFAULT_DM_SEARCH_BEHAVIOR: 'message_search_default_dm_search_behavior'
  } };
  const first = setup([enumOwner, { Ay: wrapper }]);
  first.plugin.recoverStartupMessageClasses();
  assert.equal(first.plugin.classes.message, 'message_ab');
  assert.equal(first.plugin.classes.selected, '');
  assert.equal(first.cssCount(), 1);
  assert.equal(first.waits.length, 1);
  assert.equal(first.waits[0].deliver(enumOwner), null);
  await flush();
  assert.equal(first.plugin.classes.selected, '');
  assert.equal(first.cssCount(), 1);
  assert.strictEqual(first.waits[0].deliver({ __esModule: true, default: selected }), selected);
  await flush();
  assert.equal(first.plugin.classes.selected, 'selected_ab');
  assert.equal(first.cssCount(), 2);

  const second = setup([enumOwner, { A: selected }]);
  second.plugin.recoverStartupMessageClasses();
  assert.equal(second.plugin.classes.selected, 'selected_ab');
  assert.equal(second.plugin.classes.message, '');
  assert.equal(second.waits.length, 1);
  assert.strictEqual(second.waits[0].deliver(wrapper), wrapper);
  await flush();
  assert.equal(second.plugin.classes.message, 'message_ab');
  assert.equal(second.cssCount(), 2);
});
