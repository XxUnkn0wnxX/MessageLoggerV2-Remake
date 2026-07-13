const path = require('node:path');

const dataStore = new Map();
const loggerEvents = [];
const notificationEvents = [];
const toastEvents = [];

const Data = {
  load(name, key) {
    return dataStore.get(`${name}:${key}`) ?? null;
  },
  save(name, key, value) {
    dataStore.set(`${name}:${key}`, value);
  },
  delete(name, key) {
    dataStore.delete(`${name}:${key}`);
  }
};

const Logger = {
  log(...args) { loggerEvents.push(['log', ...args]); },
  warn(...args) { loggerEvents.push(['warn', ...args]); },
  error(...args) { loggerEvents.push(['error', ...args]); }
};

const UI = {
  showToast(...args) { toastEvents.push(args); },
  showNotification(options) {
    notificationEvents.push(options);
    return { close() {} };
  }
};

class MockBdApi {
  constructor() {
    return {
      React: {
        createElement(type, props, ...children) {
          return { type, props: { ...props, children } };
        }
      },
      ReactDOM: {},
      Webpack: { Filters: {} },
      UI,
      Plugins: {},
      DOM: {},
      Patcher: {},
      Components: {},
      ContextMenu: {},
      Utils: {},
      Hooks: {},
      ReactUtils: {},
      Logger
    };
  }
}

MockBdApi.Data = Data;
global.BdApi = MockBdApi;

const Plugin = require(path.join(__dirname, '..', '..', 'MessageLoggerV2.plugin.js'));

function createPlugin(overrides = {}) {
  const plugin = new Plugin({
    name: 'MessageLoggerV2',
    version: 'test'
  });
  return Object.assign(plugin, overrides);
}

function resetHarness() {
  dataStore.clear();
  loggerEvents.length = 0;
  notificationEvents.length = 0;
  toastEvents.length = 0;
}

module.exports = {
  Data,
  Logger,
  UI,
  createPlugin,
  dataStore,
  loggerEvents,
  notificationEvents,
  resetHarness,
  toastEvents
};
