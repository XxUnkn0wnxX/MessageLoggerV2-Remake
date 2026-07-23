const path = require('node:path');

const dataStore = new Map();
const loggerEvents = [];
const notificationEvents = [];
const toastEvents = [];
const confirmationEvents = [];
const ReactDOM = {};
const Plugins = {};
const DOM = {};
const Patcher = {};
const Webpack = {Filters: {}};
const Components = {
  KeybindInput() {},
  SwitchInput() {}
};
const React = {
  createElement(type, props, ...children) {
    return { type, props: { ...props, children } };
  },
  useState(initialValue) {
    const value = typeof initialValue === 'function' ? initialValue() : initialValue;
    return [value, () => {}];
  },
  useEffect(effect) {
    effect();
  }
};

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
  showConfirmationModal(...args) { confirmationEvents.push(args); },
  showNotification(options) {
    notificationEvents.push(options);
    return { close() {} };
  }
};

class MockBdApi {
  constructor() {
    return {
      React,
      ReactDOM,
      Webpack,
      UI,
      Plugins,
      DOM,
      Patcher,
      Components,
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
  confirmationEvents.length = 0;
  for (const key of Object.keys(ReactDOM)) delete ReactDOM[key];
  for (const key of Object.keys(Plugins)) delete Plugins[key];
  for (const key of Object.keys(DOM)) delete DOM[key];
  for (const key of Object.keys(Patcher)) delete Patcher[key];
  for (const key of Object.keys(Webpack)) {
    if (key !== 'Filters') delete Webpack[key];
  }
  for (const key of Object.keys(Webpack.Filters)) delete Webpack.Filters[key];
}

module.exports = {
  Data,
  DOM,
  Logger,
  Components,
  Patcher,
  Plugins,
  React,
  ReactDOM,
  UI,
  Webpack,
  createPlugin,
  confirmationEvents,
  dataStore,
  loggerEvents,
  notificationEvents,
  resetHarness,
  toastEvents
};
