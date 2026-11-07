const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const modulesStart = source.indexOf('const DiscordModules = (() => {');
const lazyStart = source.indexOf('  const lazyGet = (key, getter) => ({', modulesStart);
const lazyEnd = source.indexOf('\n  return Object.defineProperties({}, {', lazyStart);
const getterStart = source.indexOf("    RenderUserPopout: lazyGet('RenderUserPopout'", lazyEnd);
const getterEnd = source.indexOf(',\n', getterStart);
const methodStart = source.indexOf('      showUserPopout(hookTo, user, channelId) {');
const methodEnd = source.indexOf('\n      },\n    };', methodStart);
assert.ok(modulesStart >= 0 && lazyStart > modulesStart && lazyEnd > lazyStart);
assert.ok(getterStart >= 0 && getterEnd > getterStart && methodStart >= 0 && methodEnd > methodStart);

const lazyGetterSource = source.slice(lazyStart, lazyEnd);
const renderGetterSource = source.slice(getterStart, getterEnd).replace(/^\s*RenderUserPopout:\s*/, '');
const showUserPopoutSource = source.slice(methodStart, methodEnd + '\n      }'.length);

function createTools() {
  let currentRenderer = null;
  const lookups = [];
  const warnings = [];
  const selectedChannelStore = { getChannelId() { return 'selected-channel'; } };
  const Webpack = {
    getByStrings(...strings) {
      lookups.push(strings);
      return currentRenderer;
    }
  };
  const Logger = { warn(message) { warnings.push(message); } };
  const result = vm.runInNewContext(`
    const cache = {};
    ${lazyGetterSource}
    const renderUserPopoutDescriptor = ${renderGetterSource};
    const DiscordModules = Object.defineProperties({}, {
      RenderUserPopout: renderUserPopoutDescriptor,
      SelectedChannelStore: { value: selectedChannelStore, enumerable: true }
    });
    const tools = { ${showUserPopoutSource} };
    ({ DiscordModules, tools });
  `, { Webpack, Logger, selectedChannelStore });
  return {
    ...result,
    lookups,
    warnings,
    setRenderer(value) { currentRenderer = value; }
  };
}

test('user popout resolves RenderUserPopout when opened after the startup miss', () => {
  const runtime = createTools();
  assert.equal(runtime.DiscordModules.RenderUserPopout, null);
  assert.equal(runtime.lookups.length, 1);

  const calls = [];
  const renderer = (...args) => {
    calls.push(args);
    return { type: 'rendered-user-popout' };
  };
  runtime.setRenderer(renderer);
  const hook = { id: 'username-hook' };
  const user = { id: 'user-id' };
  const popout = { id: 'popout' };
  const showCalls = [];
  const tools = {
    ...runtime.tools,
    popoutStack: [],
    popoutManager: {
      showPopout(...args) {
        showCalls.push(args);
        return popout;
      }
    }
  };

  tools.showUserPopout(hook, user, 'caller-channel');

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], null);
  assert.equal(calls[0][1].type, 1);
  assert.strictEqual(calls[0][1].author, user);
  assert.equal(calls[0][1].channel_id, 'caller-channel');
  assert.equal(showCalls.length, 1);
  assert.strictEqual(showCalls[0][0], hook);
  assert.equal(showCalls[0][1].type, 'rendered-user-popout');
  assert.equal(showCalls[0][2].position, 'right');
  assert.equal(showCalls[0][2].align, 'top');
  assert.deepEqual(tools.popoutStack, [popout]);
  assert.equal(runtime.lookups.length, 2);
  assert.deepEqual(runtime.lookups[1], ['"SENDING"===', 'renderUserGuildPopout: channel should never be']);
  assert.deepEqual(runtime.warnings, []);
});

test('user popout warns and leaves the popout stack alone while the renderer is still missing', () => {
  const runtime = createTools();
  assert.equal(runtime.DiscordModules.RenderUserPopout, null);
  const showCalls = [];
  const existingPopout = { id: 'existing' };
  const tools = {
    ...runtime.tools,
    popoutStack: [existingPopout],
    popoutManager: { showPopout(...args) { showCalls.push(args); } }
  };

  tools.showUserPopout({}, { id: 'user-id' }, 'channel-id');

  assert.deepEqual(showCalls, []);
  assert.deepEqual(tools.popoutStack, [existingPopout]);
  assert.deepEqual(runtime.warnings, ['Could not show user popout because the Discord renderer is unavailable.']);
  assert.equal(runtime.lookups.length, 2);
});
