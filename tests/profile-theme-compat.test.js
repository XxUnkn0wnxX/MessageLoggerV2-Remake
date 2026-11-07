const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const start = source.indexOf('class PopoutManager {');
const end = source.indexOf('module.exports = class MessageLoggerV2', start);
assert.ok(start >= 0 && end > start);
function NativeProvider(props) {
  const { primaryColor, secondaryColor, enabledExperiments, reduceAdaptiveTheme } = props;
  const previous = React.useContext(context);
  return React.useMemo(() => context.Provider, [previous, primaryColor, secondaryColor, enabledExperiments, reduceAdaptiveTheme]);
}
function NativeClassHelper(theme) {
  if (theme === 'broken') throw Error('invalid theme');
  return 'theme-' + theme + ' images-' + theme + ' extra-alias';
}
function secondClassHelper(theme) { return 'theme-' + theme + ' images-' + theme; }
function secondProvider(props) {
  const { primaryColor, secondaryColor, enabledExperiments, reduceAdaptiveTheme } = props;
  const previous = React.useContext(context);
  return React.useMemo(() => context.Provider, [previous, primaryColor, secondaryColor, enabledExperiments, reduceAdaptiveTheme]);
}
function setup(owners = [{ a: NativeProvider, b: NativeClassHelper }]) {
  let listener = null, cleanup = null, state, updates = 0, effect;
  const warnings = [];
  const store = {
    theme: 'dark', added: 0, removed: 0,
    addChangeListener(fn) { assert.strictEqual(this, store); this.added++; listener = fn; },
    removeChangeListener(fn) { assert.strictEqual(this, store); assert.strictEqual(fn, listener); this.removed++; }
  };
  const Webpack = {
    getStore(name) { assert.equal(name, 'ThemeStore'); return store; },
    getModules(filter, options) {
      assert.equal(options.searchExports, true);
      const results = [];
      for (const owner of owners) {
        if (filter(owner)) results.push(owner);
        if (owner && (typeof owner === 'object' || typeof owner === 'function')) {
          for (const key of Object.keys(owner)) {
            const value = owner[key];
            if (filter(value)) results.push(value);
          }
        }
      }
      return results;
    }
  };
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useState(initial) {
      if (state === undefined) state = initial;
      return [state, update => { const next = update(state); if (next !== state) { updates++; state = next; } }];
    },
    useEffect(fn) { if (!effect) effect = fn; }
  };
  const Logger = { warn(message) { warnings.push(message); } };
  const exports = vm.runInNewContext(`${source.slice(start, end)}\n({ PopoutManager, ProfileThemeBoundary });`, { Webpack, React, Logger });
  return { ...exports, store, warnings, get state() { return state; }, get updates() { return updates; },
    get listener() { return listener; }, mountEffect() { cleanup = effect(); }, unmount() { cleanup(); } };
}

test('theme discovery deduplicates aliases and keeps full native class string', () => {
  const ctx = setup([{ x: NativeProvider, y: NativeProvider, c: NativeClassHelper, d: NativeClassHelper }]);
  const theme = new ctx.PopoutManager().findProfileTheme();
  assert.strictEqual(theme.provider, NativeProvider);
  assert.equal(theme.initialSnapshot.theme, 'dark');
  assert.equal(theme.initialSnapshot.classes, 'theme-dark images-dark extra-alias');
});

test('theme boundary reconciles subscription race, updates dynamically, and preserves child identity', () => {
  const ctx = setup();
  const theme = new ctx.PopoutManager().findProfileTheme();
  const child = { type: 'existing-layer-provider', key: 'same', children: [{ type: 'profile' }, { type: 'layer-container' }] };
  const first = ctx.ProfileThemeBoundary({ theme, children: child });
  assert.strictEqual(first.type, NativeProvider);
  assert.equal(first.props.theme, 'dark');
  assert.equal(first.children[0].props.className, 'theme-dark images-dark extra-alias');
  assert.strictEqual(first.children[0].children[0], child);
  ctx.store.theme = 'light';
  ctx.mountEffect();
  assert.equal(ctx.store.added, 1);
  assert.equal(ctx.state.theme, 'light');
  assert.equal(ctx.updates, 1);
  ctx.listener();
  assert.equal(ctx.updates, 1);
  ctx.store.theme = 'future-custom';
  ctx.listener();
  const updated = ctx.ProfileThemeBoundary({ theme, children: child });
  assert.equal(updated.props.theme, 'future-custom');
  assert.equal(updated.children[0].props.className, 'theme-future-custom images-future-custom extra-alias');
  assert.strictEqual(updated.children[0].children[0], child);
  assert.equal(ctx.updates, 2);
  ctx.store.theme = 'broken';
  ctx.listener(); ctx.listener();
  assert.equal(ctx.state.theme, 'future-custom');
  assert.equal(ctx.updates, 2);
  assert.equal(ctx.warnings.length, 1);
  const stale = ctx.listener;
  ctx.unmount();
  assert.equal(ctx.store.removed, 1);
  ctx.store.theme = 'light';
  stale();
  assert.equal(ctx.state.theme, 'future-custom');
  assert.equal(ctx.updates, 2);
});

test('missing or ambiguous capabilities and invalid initial snapshot fail safely', () => {
  for (const owners of [[], [{ p: NativeProvider }], [{ p: NativeProvider, p2: secondProvider, c: NativeClassHelper }], [{ p: NativeProvider, c: NativeClassHelper, c2: secondClassHelper }]]) {
    const ctx = setup(owners);
    assert.equal(new ctx.PopoutManager().findProfileTheme(), null);
  }
  const throws = setup([{ get candidate() { throw Error('host export unavailable'); } }]);
  assert.equal(new throws.PopoutManager().findProfileTheme(), null);
  const ctx = setup();
  ctx.store.theme = 'broken';
  assert.equal(new ctx.PopoutManager().findProfileTheme(), null);
  ctx.store.theme = 'dark';
  ctx.store.removeChangeListener = null;
  assert.equal(new ctx.PopoutManager().findProfileTheme(), null);
});
