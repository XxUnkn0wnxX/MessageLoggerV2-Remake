const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createPlugin, resetHarness, loggerEvents } = require('./helpers/plugin-harness');

const sourcePath = path.join(__dirname, '..', 'MessageLoggerV2.plugin.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function createDebugPlugin({ debugLogging = true, debugToasts = false } = {}) {
  const consoleEvents = [];
  const notifications = [];
  const plugin = createPlugin({
    settings: { debugLogging, debugToasts },
    _logStyledConsoleEvent(category, message) { consoleEvents.push({ category, message }); },
    notifyUser(message, options) { notifications.push({ message, options }); }
  });
  return { plugin, consoleEvents, notifications };
}

test.beforeEach(resetHarness);

test('hydration notice stays silent while master debug logging is off', () => {
  const { plugin, consoleEvents, notifications } = createDebugPlugin({ debugLogging: false, debugToasts: true });
  assert.deepEqual(plugin.reportViewportDebugIssue('row-hydration-failure'), { console: false, toast: false });
  plugin.settings.debugLogging = true;
  assert.deepEqual(plugin.reportViewportDebugIssue('row-hydration-failure'), { console: true, toast: true });
  assert.equal(consoleEvents.length, 1);
  assert.equal(notifications.length, 1);
});

test('console-only hydration notices deduplicate console and can deliver a later toast', () => {
  const { plugin, consoleEvents, notifications } = createDebugPlugin();
  assert.deepEqual(plugin.reportViewportDebugIssue('resource-resume-failure'), { console: true, toast: false });
  assert.deepEqual(plugin.reportViewportDebugIssue('resource-resume-failure'), { console: false, toast: false });
  plugin.settings.debugToasts = true;
  assert.deepEqual(plugin.reportViewportDebugIssue('resource-resume-failure'), { console: false, toast: true });
  assert.deepEqual(plugin.reportViewportDebugIssue('resource-resume-failure'), { console: false, toast: false });
  assert.equal(consoleEvents.length, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].options.type, 'warning');
  assert.match(notifications[0].message, /Hydration/);
});

test('hydration notice can deliver and deduplicate both destinations independently', () => {
  const { plugin, consoleEvents, notifications } = createDebugPlugin({ debugToasts: true });
  assert.deepEqual(plugin.reportViewportDebugIssue('unexpected-native-accessory-envelope'), { console: true, toast: true });
  assert.deepEqual(plugin.reportViewportDebugIssue('unexpected-native-accessory-envelope'), { console: false, toast: false });
  assert.equal(consoleEvents[0].category, 'DEBUG · HYDRATE');
  assert.equal(notifications.length, 1);
});

test('unknown hydration reasons use fixed generic text and do not expose input', () => {
  const { plugin, consoleEvents, notifications } = createDebugPlugin({ debugToasts: true });
  plugin.reportViewportDebugIssue('https://private.example/message/123?token=secret');
  plugin.reportViewportDebugIssue('toString');
  assert.equal(consoleEvents[0].message, 'Hydration encountered an unexpected issue.');
  assert.equal(notifications[0].message, 'Hydration encountered an unexpected issue.');
  assert.equal(consoleEvents.length, 1, 'unknown reasons share one safe generic notice');
  assert.doesNotMatch(JSON.stringify({ consoleEvents, notifications }), /private\.example|123|secret|function/);
});

test('stop resets hydration notice deduplication for the next startup', () => {
  const { plugin, consoleEvents } = createDebugPlugin();
  plugin.reportViewportDebugIssue('resource-dispose-failure');
  plugin.stop();
  assert.deepEqual(plugin.reportViewportDebugIssue('resource-dispose-failure'), { console: true, toast: false });
  assert.equal(consoleEvents.length, 2);
});

test('debug event categories preserve generic default, output gates, and fixed category routing', () => {
  const { plugin, consoleEvents, notifications } = createDebugPlugin({ debugToasts: true });
  plugin.reportDebugEvent('backup text');
  plugin.reportDebugEvent('request text', 4000, { console: true, toast: false }, 'NETWORK');
  plugin.reportDebugEvent('render text', 4000, 'console', 'RENDER');
  assert.deepEqual(consoleEvents.map(event => event.category), ['DEBUG', 'DEBUG · NETWORK', 'DEBUG · RENDER']);
  assert.equal(notifications.length, 1, 'console-only calls remain toast-free');
  assert.match(source, /reportDebugEvent\(message, timeout = 4000, outputSelection = null, category = 'DEBUG'\)/);
  assert.match(source, /if \(output\.console && this\.settings\?\.debugLogging\)[\s\S]*_logStyledConsoleEvent\(label, message\)[\s\S]*if \(output\.toast && this\.settings\?\.debugLogging && this\.settings\?\.debugToasts\)[\s\S]*notifyUser\(message/);
  assert.match(source, /_logStyledConsoleEvent\('DEBUG · HYDRATE', message\)[\s\S]*reportDebugEvent\(message, 4000, \{ console: false, toast: true \}\)/);
  assert.match(source, /\{ console: true, toast: false \},\s*'NETWORK'/);
  assert.match(source, /'console',\s*'RENDER'/);
  for (const category of ['BACKUP', 'EDIT', 'CHANNEL', 'NETWORK', 'RENDER']) {
    assert.ok(source.includes(`'${category}'`), `missing fixed ${category} classification`);
  }
});

test('debug console output orders DEBUG, class and message in styled and plain modes', () => {
  const plugin = createPlugin();
  const original = console.log;
  const calls = [];
  try {
    console.log = (...args) => calls.push(args);
    assert.equal(plugin._logStyledConsoleEvent('DEBUG · HYDRATE', 'Hydration failed.'), true);
    assert.equal(calls[0][0], '%cMessageLoggerV2%c%c DEBUG %c%c HYDRATE %c');
    assert.equal(calls[0].at(-1), 'Hydration failed.');
    console.log = () => { throw new Error('styled console unavailable'); };
    assert.equal(plugin._logStyledConsoleEvent('DEBUG · HYDRATE', 'Hydration failed.'), false);
    assert.deepEqual(loggerEvents.at(-1), ['log', '[DEBUG] [HYDRATE] Hydration failed.']);
  } finally { console.log = original; }
});
