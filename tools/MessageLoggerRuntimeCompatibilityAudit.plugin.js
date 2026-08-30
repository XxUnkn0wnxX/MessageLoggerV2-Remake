/**
 * @name MessageLoggerRuntimeCompatibilityAudit
 * @author MessageLoggerV2 Remake
 * @version 0.1.0
 * @description Manual-only BetterDiscord host and core-module compatibility audit.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_NAME = 'MessageLoggerRuntimeCompatibilityAudit';
const REPORT_FILE_NAME = `${PLUGIN_NAME}-report.json`;
const MAX_CANDIDATE_RECORDS = 512;
const MAX_OWN_KEYS = 160;
const REDACTED_PROPERTY_PATH = '[redacted]';
const REPORT_LABELS = new Set(['manual', 'full-audit', 'unit']);

function safeType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function safeLabel(value) {
  return typeof value === 'string' && REPORT_LABELS.has(value) ? value : 'custom';
}

function normalizeDumpOptions(options) {
  const source = options !== null && (typeof options === 'object' || typeof options === 'function') ? options : null;
  const loadEntry = dataRead(source, 'loadEntry');
  const externalAssets = dataRead(source, 'externalAssets');
  return {
    loadEntry: loadEntry.ok && loadEntry.value === true,
    externalAssets: externalAssets.ok && externalAssets.value === true
  };
}

function sanitizeModuleId(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && Number.isInteger(value) && value >= 0
      ? `webpack:${String(value)}`
      : null;
  }
  if (typeof value === 'string' && /^\d{1,10}$/.test(value)) return `webpack:${value}`;
  return null;
}

function safePropertyKey(key) {
  if (key === '<root>' || key === '<export>' || key === 'BdApi' || key === 'window') return key;
  return REDACTED_PROPERTY_PATH;
}

function getModuleIdValue(moduleId, module) {
  if (moduleId !== null && moduleId !== undefined) return moduleId;
  const fallback = dataRead(module, 'id');
  return fallback.ok ? fallback.value : undefined;
}

function internalPathIdentity(pathValue) {
  try {
    if (typeof pathValue === 'symbol') return `symbol:${pathValue.description || ''}`;
    return `string:${String(pathValue)}`;
  } catch {
    return 'unreadable';
  }
}

function getOwnDescriptors(value) {
  try {
    return { descriptors: Object.getOwnPropertyDescriptors(value), error: null };
  } catch {
    return { descriptors: null, error: 'own-descriptors-unavailable' };
  }
}

function safeRead(value, key) {
  if (value === null || value === undefined) return { ok: false, value: undefined, error: 'missing-parent' };
  let current = value;
  for (let depth = 0; current !== null && depth < 16; depth += 1) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return { ok: false, value: undefined, error: 'property-descriptor-failed' };
    }
    if (descriptor) {
      try {
        if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
          return { ok: true, value: descriptor.value, error: null };
        }
        if (typeof descriptor.get === 'function') {
          return { ok: true, value: descriptor.get.call(value), error: null };
        }
        return { ok: true, value: undefined, error: null };
      } catch {
        return { ok: false, value: undefined, error: 'property-getter-failed' };
      }
    }
    try {
      current = Object.getPrototypeOf(current);
    } catch {
      return { ok: false, value: undefined, error: 'prototype-unavailable' };
    }
  }
  return { ok: false, value: undefined, error: 'property-missing' };
}

function safeReadPath(value, keys) {
  let current = value;
  for (const key of keys) {
    const result = safeRead(current, key);
    if (!result.ok) return result;
    current = result.value;
  }
  return { ok: true, value: current, error: null };
}

function callable(value) {
  return typeof value === 'function';
}

function hasCallable(value, key) {
  const result = safeRead(value, key);
  return { ok: result.ok && callable(result.value), error: result.ok && callable(result.value) ? null : result.error || `missing-callable-${key}` };
}

function hasPresent(value, key) {
  const result = safeRead(value, key);
  return { ok: result.ok && result.value != null, error: result.ok && result.value != null ? null : result.error || `missing-${key}` };
}

function hasPrototypeMethod(value, key) {
  const prototype = safeRead(value, 'prototype');
  if (!prototype.ok) return { ok: false, error: prototype.error || `missing-prototype-${key}` };
  return hasCallable(prototype.value, key);
}

function dataRead(value, key) {
  if (value === null || value === undefined) return { ok: false, value: undefined, error: 'missing-parent' };
  let current = value;
  for (let depth = 0; current !== null && depth < 16; depth += 1) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
    } catch {
      return { ok: false, value: undefined, error: 'property-descriptor-failed' };
    }
    if (descriptor) {
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return { ok: false, value: undefined, error: 'accessor-skipped' };
      }
      return { ok: true, value: descriptor.value, error: null };
    }
    try {
      current = Object.getPrototypeOf(current);
    } catch {
      return { ok: false, value: undefined, error: 'prototype-unavailable' };
    }
  }
  return { ok: false, value: undefined, error: 'property-missing' };
}

function dataReadPath(value, keys) {
  let current = value;
  for (const key of keys) {
    const result = dataRead(current, key);
    if (!result.ok) return result;
    current = result.value;
  }
  return { ok: true, value: current, error: null };
}

function dataCallable(value, key) {
  const result = dataRead(value, key);
  return {
    ok: result.ok && callable(result.value),
    error: result.ok && callable(result.value) ? null : result.error || `missing-callable-${key}`
  };
}

function dataPresent(value, key) {
  const result = dataRead(value, key);
  return {
    ok: result.ok && result.value != null,
    error: result.ok && result.value != null ? null : result.error || `missing-${key}`
  };
}

function dataPrototypeMethod(value, key) {
  const prototype = dataRead(value, 'prototype');
  if (!prototype.ok) return { ok: false, error: prototype.error || `missing-prototype-${key}` };
  return dataCallable(prototype.value, key);
}

function hasDataPrototypeWithFormatters(value) {
  if (value === null || value === undefined) return { ok: false, error: 'missing-value' };
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return { ok: false, error: 'prototype-unavailable' };
  }
  if (prototype === null || prototype === undefined) return { ok: false, error: 'missing-prototype' };
  return dataPresent(prototype, 'withFormatters');
}

function getGetSrcCallableExportChecks(value) {
  const descriptorInfo = getOwnDescriptors(value);
  let sourceMetadataMatches = 0;
  let getSrcMatches = 0;
  let sourceMatchedCallableExports = 0;
  let sourceMatchedPrototypeGetSrc = 0;
  let sourceReadFailures = 0;
  if (!descriptorInfo.descriptors) {
    return {
      sourceMetadataMatches,
      getSrcMatches,
      sourceMatchedCallableExports,
      sourceMatchedPrototypeGetSrc,
      sourceReadFailures,
      error: descriptorInfo.error
    };
  }
  for (const key of Reflect.ownKeys(descriptorInfo.descriptors)) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptorInfo.descriptors[key];
    if (!descriptor?.enumerable) continue;
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value !== 'function') continue;
    let source;
    try {
      source = Function.prototype.toString.call(descriptor.value);
    } catch {
      sourceReadFailures += 1;
      continue;
    }
    const hasSourceMetadata = source.includes('sourceMetadata:');
    const hasGetSrc = source.includes('getSrc');
    if (hasSourceMetadata) sourceMetadataMatches += 1;
    if (hasGetSrc) getSrcMatches += 1;
    if (!hasSourceMetadata || !hasGetSrc) continue;
    sourceMatchedCallableExports += 1;
    const prototypeMethod = dataPrototypeMethod(descriptor.value, 'getSrc');
    if (prototypeMethod.ok) sourceMatchedPrototypeGetSrc += 1;
  }
  return {
    sourceMetadataMatches,
    getSrcMatches,
    sourceMatchedCallableExports,
    sourceMatchedPrototypeGetSrc,
    sourceReadFailures,
    error: null
  };
}

function hasPrototypeWithFormatters(value) {
  if (value === null || value === undefined) return { ok: false, error: 'missing-value' };
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return { ok: false, error: 'prototype-unavailable' };
  }
  if (prototype === null || prototype === undefined) return { ok: false, error: 'missing-prototype' };
  const withFormatters = dataRead(prototype, 'withFormatters');
  return {
    ok: withFormatters.ok && withFormatters.value != null,
    error: withFormatters.ok && withFormatters.value != null ? null : withFormatters.error || 'missing-withFormatters'
  };
}

function getFunctionSourceFlags(value, markers) {
  if (typeof value !== 'function') return { callable: false, readable: false, flags: markers.map(() => false) };
  let source;
  try {
    source = Function.prototype.toString.call(value);
  } catch {
    return { callable: true, readable: false, flags: markers.map(() => false) };
  }
  return {
    callable: true,
    readable: true,
    flags: markers.map(marker => {
      try {
        if (marker instanceof RegExp) {
          return new RegExp(marker.source, marker.flags.replace(/[gy]/g, '')).test(source);
        }
        return source.includes(String(marker));
      } catch {
        return false;
      }
    })
  };
}

function getOwnCallableExportChecks(value, markers = []) {
  const descriptorInfo = getOwnDescriptors(value);
  let boundedOwnDataExportCount = 0;
  let callableExportCount = 0;
  let sourceMatchedCallableCount = 0;
  let sourceReadFailures = 0;
  if (!descriptorInfo.descriptors) {
    return {
      boundedOwnDataExportCount,
      callableExportCount,
      sourceMatchedCallableCount,
      sourceReadFailures,
      truncated: false,
      error: descriptorInfo.error
    };
  }
  const keys = Reflect.ownKeys(descriptorInfo.descriptors);
  for (const key of keys.slice(0, MAX_OWN_KEYS)) {
    const descriptor = descriptorInfo.descriptors[key];
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    boundedOwnDataExportCount += 1;
    if (typeof descriptor.value !== 'function') continue;
    callableExportCount += 1;
    const source = getFunctionSourceFlags(descriptor.value, markers);
    if (!source.readable) {
      sourceReadFailures += 1;
      continue;
    }
    if (source.flags.every(Boolean)) sourceMatchedCallableCount += 1;
  }
  return {
    boundedOwnDataExportCount,
    callableExportCount,
    sourceMatchedCallableCount,
    sourceReadFailures,
    truncated: keys.length > MAX_OWN_KEYS,
    error: null
  };
}

function getOwnEnumerableCallableExportChecks(value, markers = []) {
  const descriptorInfo = getOwnDescriptors(value);
  let boundedOwnDataExportCount = 0;
  let callableExportCount = 0;
  let sourceMatchedCallableCount = 0;
  let sourceReadFailures = 0;
  if (!descriptorInfo.descriptors) {
    return {
      boundedOwnDataExportCount,
      callableExportCount,
      sourceMatchedCallableCount,
      sourceReadFailures,
      truncated: false,
      error: descriptorInfo.error
    };
  }
  const keys = Reflect.ownKeys(descriptorInfo.descriptors);
  for (const key of keys.slice(0, MAX_OWN_KEYS)) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptorInfo.descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    boundedOwnDataExportCount += 1;
    if (typeof descriptor.value !== 'function') continue;
    callableExportCount += 1;
    const source = getFunctionSourceFlags(descriptor.value, markers);
    if (!source.readable) {
      sourceReadFailures += 1;
      continue;
    }
    if (source.flags.every(Boolean)) sourceMatchedCallableCount += 1;
  }
  return {
    boundedOwnDataExportCount,
    callableExportCount,
    sourceMatchedCallableCount,
    sourceReadFailures,
    truncated: keys.length > MAX_OWN_KEYS,
    error: null
  };
}

function dataSourceMatches(value, markers) {
  const direct = getFunctionSourceFlags(value, markers);
  if (direct.callable) return direct.readable && direct.flags.every(Boolean);
  const checks = getOwnEnumerableCallableExportChecks(value, markers);
  return checks.sourceMatchedCallableCount > 0
    && checks.sourceReadFailures === 0
    && !checks.error;
}

function getMediaExportMapChecks(value, marker) {
  const descriptorInfo = getOwnDescriptors(value);
  let sourceMatchedCallableCount = 0;
  let callableExportCount = 0;
  let nonemptyStringExportCount = 0;
  let sourceReadFailures = 0;
  if (!descriptorInfo.descriptors) {
    return {
      sourceMatchedCallableCount,
      callableExportCount,
      nonemptyStringExportCount,
      sourceReadFailures,
      truncated: false,
      error: descriptorInfo.error
    };
  }
  const keys = Reflect.ownKeys(descriptorInfo.descriptors);
  for (const key of keys.slice(0, MAX_OWN_KEYS)) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptorInfo.descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'string' && descriptor.value.length > 0) nonemptyStringExportCount += 1;
    if (typeof descriptor.value !== 'function') continue;
    callableExportCount += 1;
    const source = getFunctionSourceFlags(descriptor.value, [marker]);
    if (!source.readable) {
      sourceReadFailures += 1;
      continue;
    }
    if (source.flags[0]) sourceMatchedCallableCount += 1;
  }
  return {
    sourceMatchedCallableCount,
    callableExportCount,
    nonemptyStringExportCount,
    sourceReadFailures,
    truncated: keys.length > MAX_OWN_KEYS,
    error: null
  };
}

function getMediaExportAlternativeChecks(value, alternatives) {
  const descriptorInfo = getOwnDescriptors(value);
  let sourceMatchedCallableCount = 0;
  let callableExportCount = 0;
  let nonemptyStringExportCount = 0;
  let sourceReadFailures = 0;
  if (!descriptorInfo.descriptors) {
    return {
      sourceMatchedCallableCount,
      callableExportCount,
      nonemptyStringExportCount,
      sourceReadFailures,
      error: descriptorInfo.error
    };
  }
  const matchingExports = new Set();
  const markers = alternatives.map(alternative => alternative.marker);
  const keys = Reflect.ownKeys(descriptorInfo.descriptors);
  for (const key of keys.slice(0, MAX_OWN_KEYS)) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptorInfo.descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'string' && descriptor.value.length > 0) nonemptyStringExportCount += 1;
    if (typeof descriptor.value !== 'function') continue;
    callableExportCount += 1;
    const source = getFunctionSourceFlags(descriptor.value, markers);
    if (!source.readable) {
      sourceReadFailures += 1;
      continue;
    }
    if (source.flags.some(Boolean)) matchingExports.add(descriptor.value);
  }
  sourceMatchedCallableCount = matchingExports.size;
  return {
    sourceMatchedCallableCount,
    callableExportCount,
    nonemptyStringExportCount,
    sourceReadFailures,
    truncated: keys.length > MAX_OWN_KEYS,
    error: null
  };
}

function getTrashResolverChecks(value) {
  const directCallable = callable(value);
  const defaultExport = dataRead(value, 'default');
  const defaultCallable = defaultExport.ok && callable(defaultExport.value);
  const map = getOwnEnumerableCallableExportChecks(value);
  const singleCallableEnumerableExport = map.callableExportCount === 1;
  return {
    directCallable,
    defaultCallable,
    singleCallableEnumerableExport,
    resolverShape: directCallable || defaultCallable || singleCallableEnumerableExport,
    error: map.error,
    sourceReadFailures: map.sourceReadFailures
  };
}

function hasBetterDiscordLazyEntryShape(value) {
  if (typeof value !== 'function') return false;
  let source;
  try {
    source = String(value).replace(/\s+/g, '');
  } catch {
    return false;
  }
  return /Promise\.all\(\[((?:\w\.e\("?\d+"?\),?)+)\]\)\.then\(\w(?:\.\w)?\.bind\(\w,\s*"?\d+"?\)\)/.test(source);
}

function getFirstOwnEnumerableDataExport(value) {
  const descriptorInfo = getOwnDescriptors(value);
  if (!descriptorInfo.descriptors) {
    return { present: false, callable: false, type: 'undefined', truncated: false, error: descriptorInfo.error };
  }
  const keys = Reflect.ownKeys(descriptorInfo.descriptors);
  for (const key of keys.slice(0, MAX_OWN_KEYS)) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptorInfo.descriptors[key];
    if (!descriptor?.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    return {
      present: true,
      callable: typeof descriptor.value === 'function',
      type: safeType(descriptor.value),
      truncated: keys.length > MAX_OWN_KEYS,
      error: null
    };
  }
  return {
    present: false,
    callable: false,
    type: 'undefined',
    truncated: keys.length > MAX_OWN_KEYS,
    error: null
  };
}

function getPropertyFunctionSourceFlags(value, key, markers) {
  const property = dataRead(value, key);
  if (!property.ok) return { callable: false, readable: false, flags: markers.map(() => false), error: property.error };
  const source = getFunctionSourceFlags(property.value, markers);
  return { ...source, error: source.readable ? null : 'property-source-unavailable' };
}

function getDataPropertyFunctionSourceFlags(value, key, markers) {
  const property = dataRead(value, key);
  if (!property.ok) return { callable: false, readable: false, flags: markers.map(() => false), error: property.error };
  const source = getFunctionSourceFlags(property.value, markers);
  return { ...source, error: source.readable ? null : 'property-source-unavailable' };
}

function collectValidation(booleans, errors = []) {
  const validationBooleans = {};
  for (const [key, value] of Object.entries(booleans)) validationBooleans[key] = value === true;
  const validationErrors = [...errors];
  for (const [key, value] of Object.entries(validationBooleans)) {
    if (!value && !validationErrors.includes(key)) validationErrors.push(key);
  }
  return {
    ok: Object.values(validationBooleans).every(Boolean),
    booleans: validationBooleans,
    errors: validationErrors
  };
}

function summarizeCandidate(value, module, moduleId, exportPaths = ['<root>'], summaryOptions = {}) {
  return {
    moduleId: sanitizeModuleId(getModuleIdValue(moduleId, module)),
    exportPaths: exportPaths.map(safePropertyKey).slice(0, MAX_OWN_KEYS),
    types: [{ path: '<root>', type: safeType(value) }],
    ownKeyNames: [],
    prototypeMethodNames: [],
    errors: []
  };
}

function exportPathsFor(value, module) {
  const paths = [];
  const exportsResult = dataRead(module, 'exports');
  if (!exportsResult.ok) return ['<export>'];
  const exportsValue = exportsResult.value;
  if (exportsValue === value) paths.push('<root>');
  const { descriptors } = getOwnDescriptors(exportsValue);
  if (descriptors) {
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value') && descriptor.value === value) {
        paths.push(key);
      }
    }
  }
  return paths.length ? paths : ['<export>'];
}

function summarizeSelected(value, selection = {}, summaryOptions = {}) {
  const fixedAlternatives = [
    'defaultRenderLinkComponent',
    'renderMaskedLinkComponent',
    'native-startingIndex-items-media-viewer',
    'native-numMediaItems-shouldHideMediaOptions',
    'native-MEDIA_VIEWER-OPEN_MODAL-backdropStyle',
    'image-zoomThumbnailPlaceholder',
    'image-.MEDIA_MODAL_CLOSE,',
    'image-renderMobileCloseButton'
  ];
  const summary = {
    found: value !== null && value !== undefined,
    type: safeType(value),
    moduleId: sanitizeModuleId(selection.moduleId),
    exportPaths: Array.isArray(selection.exportPaths) ? selection.exportPaths.map(safePropertyKey).slice(0, MAX_OWN_KEYS) : [],
    ownKeyNames: [],
    prototypeMethodNames: [],
    errors: [],
    semanticAlternative: fixedAlternatives.includes(selection.semanticAlternative)
      ? selection.semanticAlternative
      : null
  };
  return summary;
}

function selectionFromFilter(api, filter, options = {}) {
  let selection = {};
  if (typeof api?.getModule !== 'function') return { value: null, selection, error: 'Webpack.getModule-unavailable' };
  const wrapped = (value, module, moduleId) => {
    let matched = false;
    try {
      matched = filter(value, module, moduleId) === true;
    } catch {
      return false;
    }
    if (matched) {
      selection = {
        moduleId: getModuleIdValue(moduleId, module),
        exportPaths: exportPathsFor(value, module)
      };
    }
    return matched;
  };
  try {
    return { value: api.getModule(wrapped, options), selection, error: null };
  } catch {
    return { value: null, selection, error: 'Webpack.getModule-threw' };
  }
}

function collectMatches(api, filter, options = {}, summaryOptions = {}) {
  const matches = [];
  const seen = new Set();
  let loadedMatchCount = 0;
  const errors = [];
  if (typeof api?.getModules !== 'function') return { loadedMatchCount: 0, matches, errors: ['Webpack.getModules-unavailable'], truncated: false };
  const collector = (value, module, moduleId) => {
    let matched = false;
    try {
      matched = filter(value, module, moduleId) === true;
    } catch {
      errors.push('contract-filter-threw');
      return false;
    }
    if (!matched) return false;
    const exportPaths = exportPathsFor(value, module);
    const identity = `${internalPathIdentity(getModuleIdValue(moduleId, module))}:${exportPaths.map(internalPathIdentity).join('|')}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    loadedMatchCount = seen.size;
    if (matches.length < MAX_CANDIDATE_RECORDS) {
      matches.push(summarizeCandidate(value, module, moduleId, exportPaths, summaryOptions));
    }
    return false;
  };
  try {
    api.getModules(collector, options);
  } catch {
    errors.push('Webpack.getModules-threw');
  }
  return {
    loadedMatchCount,
    matches,
    errors,
    truncated: loadedMatchCount > MAX_CANDIDATE_RECORDS
  };
}

function collectRootMatches(api, filter, summaryOptions = {}) {
  const matches = [];
  const seen = new Set();
  const errors = [];
  if (typeof api?.getModules !== 'function') return { loadedMatchCount: 0, matches, errors: ['Webpack.getModules-unavailable'], truncated: false };
  const collector = (value, module, moduleId) => {
    let matched = false;
    try {
      matched = filter(value, module, moduleId) === true;
    } catch {
      errors.push('contract-filter-threw');
      return false;
    }
    if (!matched) return false;
    const exportPaths = exportPathsFor(value, module);
    const identity = `${internalPathIdentity(getModuleIdValue(moduleId, module))}:${exportPaths.map(internalPathIdentity).join('|')}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    if (matches.length < MAX_CANDIDATE_RECORDS) {
      matches.push(summarizeCandidate(value, module, moduleId, exportPaths, summaryOptions));
    }
    return false;
  };
  try {
    api.getModules(collector, { searchExports: false, searchDefault: false });
  } catch {
    errors.push('Webpack.getModules-threw');
  }
  return {
    loadedMatchCount: seen.size,
    matches,
    errors,
    truncated: seen.size > MAX_CANDIDATE_RECORDS
  };
}

function coreModuleFilter(keys) {
  return value => keys.every(key => dataCallable(value, key).ok);
}

function getStore(api, key) {
  const stores = safeRead(api, 'Stores');
  if (!stores.ok) return { value: null, error: stores.error || 'Stores-unavailable' };
  const selected = safeRead(stores.value, key);
  return { value: selected.ok ? selected.value : null, error: selected.error };
}

function callWebpackMethod(api, method, args) {
  const webpack = safeRead(api, 'Webpack');
  if (!webpack.ok) return { value: null, error: webpack.error || 'Webpack-unavailable' };
  const callableMethod = safeRead(webpack.value, method);
  if (!callableMethod.ok || typeof callableMethod.value !== 'function') {
    return { value: null, error: callableMethod.error || `Webpack.${method}-unavailable` };
  }
  try {
    return { value: callableMethod.value.apply(webpack.value, args), error: null };
  } catch {
    return { value: null, error: `Webpack.${method}-threw` };
  }
}

function selectStoreThenGetStoreThenKeys(api, storeName, keys) {
  const direct = getStore(api, storeName);
  if (direct.value != null) return direct;
  const fromWebpackStore = callWebpackMethod(api, 'getStore', [storeName]);
  if (fromWebpackStore.value != null) return fromWebpackStore;
  return callWebpackMethod(api, 'getByKeys', keys);
}

function getHostContract(api) {
  const react = safeRead(api, 'React');
  const reactDom = safeRead(api, 'ReactDOM');
  const reactUtils = safeRead(api, 'ReactUtils');
  const components = safeRead(api, 'Components');
  const patcher = safeRead(api, 'Patcher');
  const contextMenu = safeRead(api, 'ContextMenu');
  const utils = safeRead(api, 'Utils');
  const webpack = safeRead(api, 'Webpack');
  const ui = safeRead(api, 'UI');
  const plugins = safeRead(api, 'Plugins');
  const dom = safeRead(api, 'DOM');
  const hooks = safeRead(api, 'Hooks');
  const staticBdApi = safeRead(globalThis, 'BdApi');
  const staticData = safeReadPath(staticBdApi.value, ['Data']);
  const staticNet = safeReadPath(staticBdApi.value, ['Net']);
  const staticLogger = safeReadPath(staticBdApi.value, ['Logger']);
  const filters = safeReadPath(webpack.value, ['Filters']);
  const button = safeRead(components.value, 'Button');
  const pluginsFolder = safeRead(plugins.value, 'folder');
  const buttons = safeReadPath(components.value, ['Button', 'Colors']);
  const booleans = {
    React: react.ok && react.value != null,
    'React.createElement': hasCallable(react.value, 'createElement').ok,
    'React.memo': hasCallable(react.value, 'memo').ok,
    'React.Component': hasCallable(react.value, 'Component').ok,
    'React.Fragment': hasPresent(react.value, 'Fragment').ok,
    'React.cloneElement': hasCallable(react.value, 'cloneElement').ok,
    'React.isValidElement': hasCallable(react.value, 'isValidElement').ok,
    'React.useEffect': hasCallable(react.value, 'useEffect').ok,
    'React.useRef': hasCallable(react.value, 'useRef').ok,
    'React.useState': hasCallable(react.value, 'useState').ok,
    ReactDOM: reactDom.ok && reactDom.value != null,
    'ReactDOM.createRoot': hasCallable(reactDom.value, 'createRoot').ok,
    'ReactDOM.flushSync': hasCallable(reactDom.value, 'flushSync').ok,
    'ReactUtils.wrapElement': hasCallable(reactUtils.value, 'wrapElement').ok,
    Components: components.ok && components.value != null,
    'Components.Button': button.ok && callable(button.value),
    'Components.Tooltip': hasCallable(components.value, 'Tooltip').ok,
    'Components.SettingGroup': hasCallable(components.value, 'SettingGroup').ok,
    'Components.Button.Colors.RED': hasPresent(buttons.value, 'RED').ok,
    'Components.Button.Colors.BRAND': hasPresent(buttons.value, 'BRAND').ok,
    Patcher: patcher.ok && patcher.value != null,
    'Patcher.before': hasCallable(patcher.value, 'before').ok,
    'Patcher.instead': hasCallable(patcher.value, 'instead').ok,
    'Patcher.after': hasCallable(patcher.value, 'after').ok,
    ContextMenu: contextMenu.ok && contextMenu.value != null,
    'ContextMenu.patch': hasCallable(contextMenu.value, 'patch').ok,
    'ContextMenu.open': hasCallable(contextMenu.value, 'open').ok,
    'ContextMenu.close': hasCallable(contextMenu.value, 'close').ok,
    'ContextMenu.buildMenu': hasCallable(contextMenu.value, 'buildMenu').ok,
    'ContextMenu.buildMenuChildren': hasCallable(contextMenu.value, 'buildMenuChildren').ok,
    'Utils.findInTree': hasCallable(utils.value, 'findInTree').ok,
    'Webpack.getModule': hasCallable(webpack.value, 'getModule').ok,
    'Webpack.getModules': hasCallable(webpack.value, 'getModules').ok,
    'Webpack.getByKeys': hasCallable(webpack.value, 'getByKeys').ok,
    'Webpack.getBySource': hasCallable(webpack.value, 'getBySource').ok,
    'Webpack.getByStrings': hasCallable(webpack.value, 'getByStrings').ok,
    'Webpack.getStore': hasCallable(webpack.value, 'getStore').ok,
    'Webpack.waitForModule': hasCallable(webpack.value, 'waitForModule').ok,
    'Webpack.Filters': hasPresent(webpack.value, 'Filters').ok,
    'Webpack.Filters.byKeys': hasCallable(filters.value, 'byKeys').ok,
    'Webpack.Filters.byStrings': hasCallable(filters.value, 'byStrings').ok,
    'Webpack.Filters.combine': hasCallable(filters.value, 'combine').ok,
    'Webpack.Filters.not': hasCallable(filters.value, 'not').ok,
    'Webpack.Filters.byPrototypeKeys': hasCallable(filters.value, 'byPrototypeKeys').ok,
    'Webpack.Filters.bySource': hasCallable(filters.value, 'bySource').ok,
    'UI.buildSettingsPanel': hasCallable(ui.value, 'buildSettingsPanel').ok,
    'UI.showChangelogModal': hasCallable(ui.value, 'showChangelogModal').ok,
    'UI.showConfirmationModal': hasCallable(ui.value, 'showConfirmationModal').ok,
    'UI.showInviteModal': hasCallable(ui.value, 'showInviteModal').ok,
    'UI.showNotification': hasCallable(ui.value, 'showNotification').ok,
    'Plugins.folder': pluginsFolder.ok
      && typeof pluginsFolder.value === 'string'
      && pluginsFolder.value.length > 0,
    'Plugins.get': hasCallable(plugins.value, 'get').ok,
    'Plugins.isEnabled': hasCallable(plugins.value, 'isEnabled').ok,
    'Plugins.reload': hasCallable(plugins.value, 'reload').ok,
    'DOM.addStyle': hasCallable(dom.value, 'addStyle').ok,
    'DOM.removeStyle': hasCallable(dom.value, 'removeStyle').ok,
    'Hooks.useForceUpdate': hasCallable(hooks.value, 'useForceUpdate').ok,
    'BdApi.Data.load': hasCallable(staticData.value, 'load').ok,
    'BdApi.Data.save': hasCallable(staticData.value, 'save').ok,
    AbortController: typeof globalThis?.AbortController === 'function'
  };
  const optionalAvailability = {
    'Utils.loadEntry': hasCallable(utils.value, 'loadEntry').ok,
    'BdApi.Data.recache': hasCallable(staticData.value, 'recache').ok,
    'ReactUtils.getInternalInstance': hasCallable(reactUtils.value, 'getInternalInstance').ok,
    'Components.SwitchInput': hasCallable(components.value, 'SwitchInput').ok,
    'Components.KeybindInput': hasCallable(components.value, 'KeybindInput').ok,
    'UI.showToast': hasCallable(ui.value, 'showToast').ok,
    'Plugins.disable': hasCallable(plugins.value, 'disable').ok,
    'Plugins.enable': hasCallable(plugins.value, 'enable').ok,
    'BdApi.Net.fetch': hasCallable(staticNet.value, 'fetch').ok,
    'BdApi.Logger.log': hasCallable(staticLogger.value, 'log').ok,
    'BdApi.Logger.warn': hasCallable(staticLogger.value, 'warn').ok,
    'BdApi.Logger.error': hasCallable(staticLogger.value, 'error').ok
  };
  const validation = collectValidation(booleans);
  return {
    status: validation.ok ? 'pass' : 'fail',
    expectedUniqueness: 'host capability surface (singleton)',
    loadedMatchCount: 1,
    selected: summarizeSelected(api, { exportPaths: ['BdApi'] }, { includeOwnKeys: false }),
    validation,
    optionalAvailability
  };
}

function getPlatformContract() {
  let electron = null;
  let fsModule = null;
  let pathModule = null;
  try { electron = require('electron'); } catch {}
  try { fsModule = require('node:fs'); } catch {}
  try { pathModule = require('node:path'); } catch {}

  const windowRead = safeRead(globalThis, 'window');
  const windowObject = windowRead.ok && windowRead.value != null ? windowRead.value : globalThis;
  const documentRead = safeRead(windowObject, 'document');
  const documentObject = documentRead.ok ? documentRead.value : null;
  const rendererValue = (key, fallback = undefined) => {
    const value = safeRead(windowObject, key);
    if (value.ok) return value.value;
    const globalValue = safeRead(globalThis, key);
    return globalValue.ok ? globalValue.value : fallback;
  };
  const electronShell = safeRead(electron, 'shell');
  const fsPromises = safeRead(fsModule, 'promises');
  const pathSeparator = safeRead(pathModule, 'sep');
  const discordNative = rendererValue('DiscordNative', null);
  const discordNativeClipboard = safeRead(discordNative, 'clipboard');
  const discordNativeApp = safeRead(discordNative, 'app');
  const nodeValue = rendererValue('Node', null);
  const urlValue = rendererValue('URL', null);
  const xhrValue = rendererValue('XMLHttpRequest', null);
  const navigatorValue = rendererValue('navigator', null);
  const consoleValue = rendererValue('console', null);
  const locationValue = rendererValue('location', null);
  const staticBdApiRead = safeRead(globalThis, 'BdApi');
  const contentManager = safeReadPath(staticBdApiRead.value, ['ContentManager']);
  const pluginUpdates = safeReadPath(staticBdApiRead.value, ['PluginUpdates']);
  const scrollX = safeRead(windowObject, 'scrollX');
  const scrollY = safeRead(windowObject, 'scrollY');
  const required = {
    'electron.shell.openExternal': hasCallable(electronShell.value, 'openExternal').ok,
    'electron.shell.openPath': hasCallable(electronShell.value, 'openPath').ok,
    'fs.existsSync': hasCallable(fsModule, 'existsSync').ok,
    'fs.lstatSync': hasCallable(fsModule, 'lstatSync').ok,
    'fs.mkdirSync': hasCallable(fsModule, 'mkdirSync').ok,
    'fs.readFileSync': hasCallable(fsModule, 'readFileSync').ok,
    'fs.readdirSync': hasCallable(fsModule, 'readdirSync').ok,
    'fs.realpathSync': hasCallable(fsModule, 'realpathSync').ok,
    'fs.renameSync': hasCallable(fsModule, 'renameSync').ok,
    'fs.rmdirSync': hasCallable(fsModule, 'rmdirSync').ok,
    'fs.statSync': hasCallable(fsModule, 'statSync').ok,
    'fs.unlinkSync': hasCallable(fsModule, 'unlinkSync').ok,
    'fs.writeFileSync': hasCallable(fsModule, 'writeFileSync').ok,
    'fs.writeFile': hasCallable(fsModule, 'writeFile').ok,
    'fs.unlink': hasCallable(fsModule, 'unlink').ok,
    'fs.rename': hasCallable(fsModule, 'rename').ok,
    'fs.promises.writeFile': hasCallable(fsPromises.value, 'writeFile').ok,
    'fs.promises.unlink': hasCallable(fsPromises.value, 'unlink').ok,
    'fs.promises.rename': hasCallable(fsPromises.value, 'rename').ok,
    'path.isAbsolute': hasCallable(pathModule, 'isAbsolute').ok,
    'path.join': hasCallable(pathModule, 'join').ok,
    'path.parse': hasCallable(pathModule, 'parse').ok,
    'path.relative': hasCallable(pathModule, 'relative').ok,
    'path.resolve': hasCallable(pathModule, 'resolve').ok,
    'path.sep': pathSeparator.ok && typeof pathSeparator.value === 'string' && pathSeparator.value.length > 0,
    'DiscordNative.clipboard.copy': hasCallable(discordNativeClipboard.value, 'copy').ok,
    structuredClone: callable(rendererValue('structuredClone', null)),
    Blob: callable(rendererValue('Blob', null)),
    URL: callable(urlValue),
    'URL.createObjectURL': hasCallable(urlValue, 'createObjectURL').ok,
    'URL.revokeObjectURL': hasCallable(urlValue, 'revokeObjectURL').ok,
    MutationObserver: callable(rendererValue('MutationObserver', null)),
    requestAnimationFrame: callable(rendererValue('requestAnimationFrame', null)),
    fetch: callable(rendererValue('fetch', null)),
    'document.createElement': hasCallable(documentObject, 'createElement').ok,
    'document.createTextNode': hasCallable(documentObject, 'createTextNode').ok,
    'document.querySelector': hasCallable(documentObject, 'querySelector').ok,
    'document.querySelectorAll': hasCallable(documentObject, 'querySelectorAll').ok,
    'document.getElementById': hasCallable(documentObject, 'getElementById').ok,
    'document.addEventListener': hasCallable(documentObject, 'addEventListener').ok,
    'document.removeEventListener': hasCallable(documentObject, 'removeEventListener').ok,
    'document.body': hasPresent(documentObject, 'body').ok,
    'document.head': hasPresent(documentObject, 'head').ok,
    'document.documentElement': hasPresent(documentObject, 'documentElement').ok,
    'window.addEventListener': hasCallable(windowObject, 'addEventListener').ok,
    'window.removeEventListener': hasCallable(windowObject, 'removeEventListener').ok,
    'window.scrollX': scrollX.ok && typeof scrollX.value === 'number' && Number.isFinite(scrollX.value),
    'window.scrollY': scrollY.ok && typeof scrollY.value === 'number' && Number.isFinite(scrollY.value),
    'console.log': hasCallable(consoleValue, 'log').ok,
    'console.warn': hasCallable(consoleValue, 'warn').ok,
    'console.error': hasCallable(consoleValue, 'error').ok,
    setTimeout: callable(rendererValue('setTimeout', null)),
    clearTimeout: callable(rendererValue('clearTimeout', null)),
    setInterval: callable(rendererValue('setInterval', null)),
    clearInterval: callable(rendererValue('clearInterval', null)),
    'Node.TEXT_NODE': hasPresent(nodeValue, 'TEXT_NODE').ok
  };
  const optionalAvailability = {
    'DiscordNative.app.getPreferredSystemLanguages': hasCallable(discordNativeApp.value, 'getPreferredSystemLanguages').ok,
    queueMicrotask: callable(rendererValue('queueMicrotask', null)),
    'XMLHttpRequest.prototype.open': hasPrototypeMethod(xhrValue, 'open').ok,
    'navigator.languages': hasPresent(navigatorValue, 'languages').ok,
    'navigator.language': hasPresent(navigatorValue, 'language').ok,
    cancelAnimationFrame: callable(rendererValue('cancelAnimationFrame', null)),
    setImmediate: callable(rendererValue('setImmediate', null)),
    'BdApi.ContentManager.pluginsFolder': (() => {
      const folder = safeRead(contentManager.value, 'pluginsFolder');
      return folder.ok && typeof folder.value === 'string' && folder.value.length > 0;
    })(),
    'location.reload': hasCallable(locationValue, 'reload').ok,
    'BdApi.PluginUpdates.plugins': (() => {
      const plugins = safeRead(pluginUpdates.value, 'plugins');
      return plugins.ok && plugins.value !== null && typeof plugins.value === 'object';
    })()
  };
  const validation = collectValidation(required);
  return {
    status: validation.ok ? 'pass' : 'fail',
    expectedUniqueness: 'platform capability surface (singleton)',
    loadedMatchCount: 1,
    selected: summarizeSelected(windowObject, { exportPaths: ['window'] }, { includeOwnKeys: false }),
    validation,
    optionalAvailability
  };
}

function describeCommonDomContract() {
  const windowRead = safeRead(globalThis, 'window');
  const windowObject = windowRead.ok && windowRead.value != null ? windowRead.value : globalThis;
  const documentRead = safeRead(windowObject, 'document');
  const documentObject = documentRead.ok && documentRead.value != null
    ? documentRead.value
    : safeRead(globalThis, 'document').value || null;
  const querySelectorRead = safeRead(documentObject, 'querySelector');
  const querySelectorAllRead = safeRead(documentObject, 'querySelectorAll');
  const documentQuery = querySelectorRead.ok
    && callable(querySelectorRead.value)
    && querySelectorAllRead.ok
    && callable(querySelectorAllRead.value);
  const querySelectorAll = querySelectorAllRead.value;
  const checkNodes = (selector, predicate = null) => {
    if (!documentQuery) return { count: 0, status: 'query-error' };
    try {
      const nodes = querySelectorAll.call(documentObject, selector);
      const length = nodes?.length;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-node-list');
      let count = 0;
      for (let index = 0; index < length; index += 1) {
        const node = nodes[index];
        if (predicate === null || predicate(node)) count += 1;
      }
      return { count, status: count > 0 ? 'present' : 'not-mounted-or-not-present' };
    } catch {
      return { count: 0, status: 'query-error' };
    }
  };
  const selectorCheck = (selector, result) => ({ selector, count: result.count, status: result.status });
  const sortDirection = checkNodes('button, [role="button"]', node => {
    const textContent = safeRead(node, 'textContent');
    if (!textContent.ok) throw new Error('text-content-unavailable');
    return typeof textContent.value === 'string' && textContent.value.trim() === 'Sort direction';
  });
  const surfaces = {
    core: {
      'app-mount': selectorCheck('#app-mount', checkNodes('#app-mount'))
    },
    commonChat: {
      'chat-message-list-id': selectorCheck('[id^="chat-messages-"]', checkNodes('[id^="chat-messages-"]')),
      'chat-message-list-item': selectorCheck('[data-list-item-id^="chat-messages___chat-messages-"]', checkNodes('[data-list-item-id^="chat-messages___chat-messages-"]')),
      article: selectorCheck('[role="article"]', checkNodes('[role="article"]')),
      'data-item': selectorCheck('[data-item-id]', checkNodes('[data-item-id]')),
      'message-content-id': selectorCheck('[id^="message-content-"]', checkNodes('[id^="message-content-"]')),
      'markdown-container': selectorCheck('[class*="markdownContainer"]', checkNodes('[class*="markdownContainer"]')),
      mention: selectorCheck('.mention', checkNodes('.mention')),
      reactions: selectorCheck('.reactions', checkNodes('.reactions')),
      'highlighted-code': selectorCheck('.hljs', checkNodes('.hljs')),
      'theme-root': selectorCheck('.theme-dark, .theme-light', checkNodes('.theme-dark, .theme-light'))
    },
    loggerViewer: {
      'sort-direction-button': selectorCheck('button, [role="button"]', sortDirection),
      'semantic-markup': selectorCheck('[class*="markup"]', checkNodes('[class*="markup"]')),
      'semantic-message-content': selectorCheck('[class*="messageContent"]', checkNodes('[class*="messageContent"]')),
      'semantic-avatar': selectorCheck('[class*="avatar"]', checkNodes('[class*="avatar"]'))
    },
    toolbarModal: {
      'section-search': selectorCheck('section [class*="search"]', checkNodes('section [class*="search"]')),
      'section-toolbar': selectorCheck('section [class*="toolbar"]', checkNodes('section [class*="toolbar"]')),
      'icon-wrapper': selectorCheck('[class*="iconWrapper"]', checkNodes('[class*="iconWrapper"]')),
      buttons: selectorCheck('button, [role="button"]', checkNodes('button, [role="button"]')),
      modal: selectorCheck('[role="dialog"], [aria-modal="true"]', checkNodes('[role="dialog"], [aria-modal="true"]')),
      'visible-native-trash-signature': selectorCheck('button path[d*="2.81h8.36a3"]', checkNodes('button path[d*="2.81h8.36a3"]')),
      'mana-modal': selectorCheck('[data-mana-component="modal"]', checkNodes('[data-mana-component="modal"]')),
      'mana-button': selectorCheck('[data-mana-component="button"]', checkNodes('[data-mana-component="button"]'))
    }
  };
  const appMount = surfaces.core['app-mount'];
  const appMountPresent = appMount.status === 'present';
  const errors = [];
  if (documentObject === null) errors.push('document-unavailable');
  if (!documentQuery) errors.push('document-query-unavailable');
  if (appMount.status === 'query-error') errors.push('app-mount-query-error');
  const validation = collectValidation({ documentQuery, appMountPresent }, errors);
  return {
    status: documentQuery && appMountPresent ? 'pass' : 'fail',
    expectedUniqueness: 'one mounted Discord renderer root; route/content surfaces observational',
    loadedMatchCount: appMount.count,
    selected: {
      found: documentObject !== null,
      type: 'dom-document',
      moduleId: null,
      exportPaths: ['window'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    surfaces,
    validation
  };
}

function describeForumThreadDomContract() {
  const documentRead = safeRead(globalThis, 'document');
  const documentObject = documentRead.ok && documentRead.value != null ? documentRead.value : null;
  const querySelectorRead = safeRead(documentObject, 'querySelector');
  const querySelectorAllRead = safeRead(documentObject, 'querySelectorAll');
  const classLookupRead = safeRead(documentObject, 'getElementsByClassName');
  const documentQuery = querySelectorRead.ok
    && callable(querySelectorRead.value)
    && querySelectorAllRead.ok
    && callable(querySelectorAllRead.value);
  const documentClassLookup = classLookupRead.ok && callable(classLookupRead.value);
  const enumerateSelector = selector => {
    if (!documentQuery) return { count: 0, status: 'query-error' };
    try {
      const nodes = querySelectorAllRead.value.call(documentObject, selector);
      const length = nodes?.length;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-node-list');
      let count = 0;
      for (let index = 0; index < length; index += 1) {
        count += 1;
      }
      return {
        count,
        status: count > 0 ? 'present' : 'not-mounted-or-not-present'
      };
    } catch {
      return { count: 0, status: 'query-error' };
    }
  };
  const selectorCheck = (selector, result) => ({
    selector,
    count: result.count,
    status: result.status
  });
  const structuralManifest = [
    ['forum-list-item', '[data-list-item-id^="forum-channel-list-"]'],
    ['forum-list', '[data-list-id^="forum-channel-list-"]'],
    ['channel-list-item', '[data-list-item-id^="channels___"]'],
    ['group-list-item', 'ul[role="group"] > :scope > li[role="listitem"]'],
    ['thread-search', 'input[placeholder="Search for Thread Name"]'],
    ['dialog-button', '[role="dialog"] div[role="button"]']
  ];
  const fragmentManifest = [
    ['post-title', 'postTitleText', '[class*="postTitleText"]'],
    ['message-content', 'messageContent_', '[class*="messageContent_"]'],
    ['message-focus-block', 'messageFocusBlock_', '[class*="messageFocusBlock_"]'],
    ['message', 'message_', '[class*="message_"]'],
    ['thread-name', 'threadName_', 'h2 [class*="threadName_"]'],
    ['name', 'name_', '[class*="name_"]'],
    ['subtext', 'subtext_', '[class*="subtext_"]'],
    ['facepile', 'facepile_', '[class*="facepile_"]'],
    ['pill', 'pill_', '[class*="pill_"]'],
    ['reaction', 'reaction_', '[class*="reaction_"]'],
    ['reaction-count', 'reactionCount', '[class*="reactionCount"]'],
    ['pin-icon', 'pinIcon', '[class*="pinIcon"]'],
    ['message-count-text', 'messageCountText', '[class*="messageCountText"]'],
    ['thumbnail', 'thumbnail', '[class*="thumbnail"]'],
    ['image-content', 'imageContent', '[class*="imageContent"] img'],
    ['tags', 'tags_', '[class*="tags_"]'],
    ['forum-author-normalized', 'author', '.message_faa96b > span[class*="author"], [class*="message_"] > span[class*="author"], span[class*="author"]'],
    ['forum-author-metadata', 'author', '[class*="message_"] > span, [class*="author"]'],
    ['text-small-normal', 'text-sm/normal', '[class*="text-sm/normal"]']
  ];
  const fallbackClassTokens = [
    'focusTarget_faa96b',
    'left_faa96b',
    'body_faa96b',
    'header_faa96b',
    'headerText_faa96b',
    'message_faa96b',
    'messageFocusBlock_faa96b',
    'messageContent_c19a55',
    'footer_faa96b',
    'tags__08166',
    'lineClamp2Plus__4bd52',
    'heading-lg/semibold_cf4812',
    'defaultColor__5345c',
    'text-sm/semibold_cf4812',
    'author_d3eee8',
    'postTitleText_faa96b',
    'defaultColor__4bd52',
    'text-sm/normal_cf4812'
  ];
  const structural = Object.fromEntries(structuralManifest.map(([id, selector]) => [
    id,
    selectorCheck(selector, enumerateSelector(selector))
  ]));
  const fragments = Object.fromEntries(fragmentManifest.map(([id, fragment, selector]) => {
    const result = enumerateSelector(selector);
    return [id, {
      ...selectorCheck(selector, result),
      fragment
    }];
  }));
  const fallbackClasses = Object.fromEntries(fallbackClassTokens.map(classToken => {
    if (!documentClassLookup) return [classToken, { classToken, count: 0, status: 'query-error' }];
    try {
      const nodes = classLookupRead.value.call(documentObject, classToken);
      const length = nodes?.length;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-class-list');
      for (let index = 0; index < length; index += 1) void nodes[index];
      return [classToken, {
        classToken,
        count: length,
        status: length > 0 ? 'present' : 'fallback-not-observed'
      }];
    } catch {
      return [classToken, { classToken, count: 0, status: 'query-error' }];
    }
  }));
  const errors = [];
  if (documentObject === null) errors.push('document-unavailable');
  if (!documentQuery) errors.push('document-query-unavailable');
  if (!documentClassLookup) errors.push('document-class-lookup-unavailable');
  const validation = collectValidation({ documentQuery, documentClassLookup }, errors);
  return {
    status: documentQuery && documentClassLookup ? 'pass' : 'fail',
    expectedUniqueness: 'current document; forum/thread surfaces observational',
    loadedMatchCount: documentObject === null ? 0 : 1,
    selected: {
      found: documentObject !== null,
      type: 'dom-document',
      moduleId: null,
      exportPaths: ['window'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    surfaces: {
      structural,
      fragments,
      fallbackClasses
    },
    validation
  };
}

function describeLoggerOwnedStyleContract(api) {
  const styleSeeds = [
    'ml2-deleted',
    'ml2-deleted-attachment-renderer',
    'ml2-deleted-alt',
    'ml2-deleted-forum-text',
    'ml2-forum-log-path',
    'ml2-jump-available-author',
    'ml2-edited',
    'ml2-edited-compact',
    'ml2-tab',
    'ml2-tab-selected',
    'ml2-help-text-indent',
    'ml2-help-content',
    'ml2-help-subheading',
    'ml2-startup-help-title',
    'ml2-filter-help-modal',
    'ml2-settings-help-modal',
    'ml2-startup-help-modal',
    'ml2-location-lists-modal',
    'ml2-logger-settings-modal',
    'ml2-logger-settings-scroller',
    'ml2-cached-files-modal',
    'ml2-css-class-restart-warning',
    'ml2-setting-transition-active',
    'ml2-setting-transition-pulse',
    'ML2-MENU',
    'ML2-OL',
    'ML2-FILTER',
    'ML2-MENU-MESSAGES',
    'ML2-MENU-TABBAR',
    'MLv2-menu-root',
    'MLv2-toolbar-button',
    'MLv2-image-root',
    'MLv2-image-error',
    'MLv2-restored-forum-item',
    'MLv2-restored-forum-card',
    'MLv2-restored-forum-meta',
    'MLv2-restored-forum-jump',
    'MLv2-restored-thread-entry',
    'MLv2-restored-thread-browser-card',
    'MLv2-restored-thread-browser-section',
    'MLv2-restored-delete-host',
    'MLv2-restored-delete-button',
    'MLv2-restored-inline-delete-button',
    'MLv2-shift-delete-active',
    'MLv2-deleted-forum-modal',
    'MLv2-deleted-forum-root',
    'MLv2-deleted-forum-header',
    'MLv2-deleted-forum-title',
    'MLv2-deleted-forum-meta',
    'MLv2-deleted-forum-messages',
    'MLv2-input-wrapper',
    'MLv2-input',
    'MLv2-input-first',
    'MLv2-input-input',
    'MLv2-location-list-row',
    'MLv2-location-list-grouped-row',
    'MLv2-location-list-group-header',
    'MLv2-location-list-scroller',
    'MLv2-location-list-delete',
    'MLv2-location-list-button',
    'MLv2-location-list-link',
    'MLv2-question-mark',
    'MLv2-tab-bar-container',
    'MLv2-tab-bar',
    'MLv2-tab-bar-item',
    'mlv2-toast-progress'
  ];
  const runtimeOnlySeeds = [
    { seed: 'ml2-settings-buttonbox', status: 'not-probed-runtime-obfuscated-identifier' },
    { seed: 'undo-show-as-message', status: 'not-probed-runtime-obfuscated-identifier' }
  ];
  const pluginsRead = safeRead(api, 'Plugins');
  const isEnabledRead = safeRead(pluginsRead.value, 'isEnabled');
  let pluginEnabled = 'unknown';
  const errors = [];
  if (!isEnabledRead.ok || !callable(isEnabledRead.value)) {
    errors.push('Plugins.isEnabled-unavailable');
  } else {
    try {
      const enabled = isEnabledRead.value.call(pluginsRead.value, 'MessageLoggerV2');
      if (enabled === true || enabled === false) pluginEnabled = enabled;
      else errors.push('Plugins.isEnabled-invalid');
    } catch {
      errors.push('Plugins.isEnabled-threw');
    }
  }
  const documentRead = safeRead(globalThis, 'document');
  const documentObject = documentRead.ok && documentRead.value != null ? documentRead.value : null;
  const querySelectorAllRead = safeRead(documentObject, 'querySelectorAll');
  const documentQuery = querySelectorAllRead.ok && callable(querySelectorAllRead.value);
  let styleElementCount = 0;
  let stableMarkerStyleCount = 0;
  let styleTexts = [];
  let styleRead = documentObject !== null && documentQuery;
  if (documentObject === null) errors.push('document-unavailable');
  if (!documentQuery) errors.push('document-query-unavailable');
  if (styleRead) {
    try {
      const styles = querySelectorAllRead.value.call(documentObject, 'style');
      const length = styles?.length;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-style-list');
      styleElementCount = length;
      styleTexts = [];
      for (let index = 0; index < length; index += 1) {
        const textContent = safeRead(styles[index], 'textContent');
        if (!textContent.ok || typeof textContent.value !== 'string') throw new Error('style-text-unavailable');
        styleTexts.push(textContent.value);
      }
      stableMarkerStyleCount = styleTexts.filter(text => text.includes('ml2-deleted')).length;
    } catch {
      styleRead = false;
      styleElementCount = 0;
      stableMarkerStyleCount = 0;
      styleTexts = [];
      errors.push('style-query-or-read-failed');
    }
  }
  const seedResults = styleSeeds.map(seed => {
    const count = styleRead ? styleTexts.filter(text => text.includes(seed)).length : 0;
    return {
      seed,
      styleElementCount: count,
      status: count > 0 ? 'literal-present' : 'obfuscated-or-not-literal'
    };
  });
  const literalSeedPresenceCount = seedResults.filter(result => result.status === 'literal-present').length;
  let inferredMode = 'unknown';
  if (styleRead) {
    if (stableMarkerStyleCount === 0) inferredMode = 'logger-style-missing';
    else if (literalSeedPresenceCount === styleSeeds.length) inferredMode = 'literal';
    else inferredMode = 'obfuscated-or-partial';
  }
  const stableMarkerPresent = stableMarkerStyleCount > 0;
  const validation = collectValidation({
    documentQuery,
    styleRead,
    loggerNotDisabled: pluginEnabled !== false,
    stableMarkerPresent
  }, errors);
  const status = validation.ok && stableMarkerPresent ? 'pass' : 'fail';
  return {
    status,
    expectedUniqueness: 'Logger-owned style surface (singleton document)',
    loadedMatchCount: documentObject === null ? 0 : 1,
    selected: {
      found: documentObject !== null,
      type: 'logger-owned-style-surface',
      moduleId: null,
      exportPaths: ['window'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    pluginEnabled,
    styleElementCount,
    stableMarkerStyleCount,
    literalSeedPresenceCount,
    inferredMode,
    styleSeeds: seedResults,
    runtimeOnlySeeds,
    validation
  };
}

function describeLoggerOwnedMountContract() {
  const markerAttributes = [
    'data-ml2-attachment-audio-host',
    'data-ml2-attachment-id',
    'data-ml2-attachment-message-id',
    'data-ml2-attachment-video-host',
    'data-ml2-channel-id',
    'data-ml2-fallback-delete-control',
    'data-ml2-forum-list-item-id',
    'data-ml2-inline-delete-control',
    'data-ml2-log-details',
    'data-ml2-message-id',
    'data-ml2-native-delete-host',
    'data-ml2-pending-delete-control',
    'data-ml2-plain-forum-author',
    'data-ml2-remove-from-log',
    'data-ml2-restored-forum-card',
    'data-ml2-restored-forum-thread',
    'data-ml2-restored-thread-browser-card',
    'data-ml2-restored-thread-browser-section',
    'data-ml2-restored-thread-entry',
    'data-ml2-thread-log-messages'
  ];
  const fixedSelectors = [
    '.mlv2-toasts',
    '.mlv2-toast',
    '#mlv2-toast-styles',
    '#mlv2-popout-container',
    '.mlv2-popout',
    '[data-mlv2-native-notification-id]',
    '.bd-notification',
    '#ML2-CSS',
    '[id^="ML2-thread-log-"]',
    '[id^="ml2-native-delete-"]',
    '#mlv2-copy-media',
    '#mlv2-delete-saved-record',
    '#mlv2-guild-logger',
    '#mlv2-image-logger',
    '#mlv2-message-logger',
    '#mlv2-user-logger',
    '#mlv2-open-saved-attachment',
    '#mlv2-open-saved-media-externally'
  ];
  const identifierInventory = [
    { id: '#ML2-CSS', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '[id^="ML2-thread-log-"]', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '[id^="ml2-native-delete-"]', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-copy-media', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-delete-saved-record', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-guild-logger', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-image-logger', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-message-logger', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-user-logger', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-open-saved-attachment', kind: 'selector', status: 'tracked-static-identifier' },
    { id: '#mlv2-open-saved-media-externally', kind: 'selector', status: 'tracked-static-identifier' },
    { id: 'ml2-settings-buttonbox', kind: 'runtime-identifier', status: 'tracked-static-identifier' },
    { id: 'undo-show-as-message', kind: 'runtime-identifier', status: 'tracked-static-identifier' },
    { id: 'mlv2-setting-transition-active', kind: 'runtime-identifier', status: 'tracked-static-identifier' },
    { id: 'ML2-CSS', kind: 'identifier', status: 'tracked-static-identifier' },
    { id: 'ML2-thread-log-{threadId}', kind: 'identifier-pattern', status: 'tracked-static-identifier' },
    { id: 'ml2-native-delete-{counter}-{index}', kind: 'identifier-pattern', status: 'tracked-static-identifier' }
  ];
  const documentRead = safeRead(globalThis, 'document');
  const documentObject = documentRead.ok && documentRead.value != null ? documentRead.value : null;
  const querySelectorAllRead = safeRead(documentObject, 'querySelectorAll');
  const documentQuery = querySelectorAllRead.ok && callable(querySelectorAllRead.value);
  const markerResults = markerAttributes.map(attribute => {
    if (!documentQuery) return { attribute, count: 0, status: 'query-error' };
    try {
      const nodes = querySelectorAllRead.value.call(documentObject, `[${attribute}]`);
      const length = nodes?.length;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-marker-list');
      for (let index = 0; index < length; index += 1) void nodes[index];
      return {
        attribute,
        count: length,
        status: length > 0 ? 'mounted' : 'not-mounted-or-not-present'
      };
    } catch {
      return { attribute, count: 0, status: 'query-error' };
    }
  });
  const queryErrors = markerResults.some(result => result.status === 'query-error');
  const fixedSelectorResults = fixedSelectors.map(selector => {
    if (!documentQuery) return { selector, count: 0, status: 'query-error' };
    try {
      const nodes = querySelectorAllRead.value.call(documentObject, selector);
      const length = nodes?.length;
      if (!Number.isSafeInteger(length) || length < 0) throw new Error('invalid-selector-list');
      for (let index = 0; index < length; index += 1) void nodes[index];
      return {
        selector,
        count: length,
        status: length > 0 ? 'mounted' : 'not-mounted-or-not-present'
      };
    } catch {
      return { selector, count: 0, status: 'query-error' };
    }
  });
  const fixedSelectorQueryErrors = fixedSelectorResults.some(result => result.status === 'query-error');
  const errors = [];
  if (documentObject === null) errors.push('document-unavailable');
  if (!documentQuery) errors.push('document-query-unavailable');
  if (queryErrors) errors.push('marker-query-failed');
  if (fixedSelectorQueryErrors) errors.push('fixed-selector-query-failed');
  const validation = collectValidation({
    documentQuery,
    markerQueries: documentQuery && !queryErrors && !fixedSelectorQueryErrors
  }, errors);
  return {
    status: validation.ok ? 'pass' : 'fail',
    expectedUniqueness: 'Logger-owned mount marker surface (current document)',
    loadedMatchCount: documentObject === null ? 0 : 1,
    selected: {
      found: documentObject !== null,
      type: 'logger-owned-mount-surface',
      moduleId: null,
      exportPaths: ['window'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    totalMountedMarkerCount: markerResults.reduce((total, result) => total + result.count, 0),
    markers: markerResults,
    fixedSelectors: fixedSelectorResults,
    identifierInventory,
    validation
  };
}

function describeLoggerIntegrationRenderLinkComponent(api) {
  const errors = [];
  const pluginsRead = safeRead(api, 'Plugins');
  const pluginApiAvailable = pluginsRead.ok && pluginsRead.value != null;
  const getRead = safeRead(pluginsRead.value, 'get');
  const pluginGetAvailable = pluginApiAvailable && getRead.ok && callable(getRead.value);
  if (!pluginApiAvailable) errors.push('plugins-api-unavailable');
  else if (!pluginGetAvailable) errors.push('plugins-get-unavailable');

  let addon = null;
  if (pluginGetAvailable) {
    try {
      addon = getRead.value.call(pluginsRead.value, 'MessageLoggerV2');
    } catch {
      errors.push('plugins-get-threw');
    }
  }
  const addonFound = addon !== null && addon !== undefined;
  if (!addonFound) errors.push('logger-addon-unavailable');

  const instanceRead = dataRead(addon, 'instance');
  const instanceAvailable = instanceRead.ok && instanceRead.value != null;
  if (!instanceAvailable) errors.push('logger-instance-unavailable');
  const toolsRead = dataRead(instanceRead.value, 'tools');
  const toolsAvailable = toolsRead.ok && toolsRead.value != null;
  if (!toolsAvailable) errors.push('logger-tools-unavailable');
  const wrapperRead = dataRead(toolsRead.value, 'renderLinkComponent');
  const renderLinkComponentCallable = wrapperRead.ok && callable(wrapperRead.value);
  if (!renderLinkComponentCallable) errors.push('render-link-wrapper-unavailable');

  let wrapperInvoked = false;
  let element;
  if (renderLinkComponentCallable) {
    wrapperInvoked = true;
    try {
      element = wrapperRead.value({ children: null });
    } catch {
      errors.push('render-link-wrapper-threw');
    }
  }
  const elementReturned = element !== null && element !== undefined;
  if (!elementReturned) errors.push('render-link-element-unavailable');
  const elementTypeRead = dataRead(element, 'type');
  const elementTypePresent = elementTypeRead.ok && elementTypeRead.value != null;
  const elementType = elementTypeRead.value;
  const simpleReactType = typeof elementType === 'string'
    || typeof elementType === 'function'
    || typeof elementType === 'symbol';
  const markerRead = !simpleReactType
    && elementType !== null
    && (typeof elementType === 'object' || typeof elementType === 'function')
    ? dataRead(elementType, '$$typeof')
    : { ok: false, value: undefined };
  const markedReactType = markerRead.ok && markerRead.value != null;
  const elementTypeValid = elementTypePresent && (simpleReactType || markedReactType);
  if (!elementTypeValid) errors.push('render-link-element-type-invalid');

  const validation = collectValidation({
    pluginApiAvailable,
    pluginGetAvailable,
    addonFound,
    instanceAvailable,
    toolsAvailable,
    renderLinkComponentCallable,
    wrapperInvoked,
    elementReturned,
    elementTypePresent,
    elementTypeValid
  }, errors);
  return {
    status: validation.ok ? 'pass' : 'fail',
    expectedUniqueness: 'single enabled MessageLoggerV2 render-link integration',
    loadedMatchCount: addonFound ? 1 : 0,
    selected: {
      found: renderLinkComponentCallable,
      type: 'logger-owned-render-link-wrapper',
      moduleId: null,
      exportPaths: ['<root>'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    validation
  };
}

function probeDetachedImage(source) {
  const documentRead = safeRead(globalThis, 'document');
  const documentObject = documentRead.ok && documentRead.value != null ? documentRead.value : null;
  const createElementRead = safeRead(documentObject, 'createElement');
  if (!createElementRead.ok || !callable(createElementRead.value)) return Promise.resolve('image-api-unavailable');
  let image;
  try {
    image = createElementRead.value.call(documentObject, 'img');
    if (image === null || image === undefined) return Promise.resolve('image-api-unavailable');
  } catch {
    return Promise.resolve('image-api-unavailable');
  }
  return new Promise(resolve => {
    let settled = false;
    let timeoutId = null;
    const finish = status => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) {
        try { clearTimeout(timeoutId); } catch {}
        timeoutId = null;
      }
      try { image.onload = null; } catch {}
      try { image.onerror = null; } catch {}
      try { image.src = ''; } catch {}
      resolve(status);
    };
    try {
      image.onload = () => finish('loaded');
      image.onerror = () => finish('failed');
      try { image.referrerPolicy = 'no-referrer'; } catch {}
      timeoutId = setTimeout(() => finish('timeout'), 7000);
      image.src = source;
    } catch {
      finish('image-api-unavailable');
    }
  });
}

async function describeFixedRendererAssetContract(externalAssets = false) {
  const probes = [
    {
      id: 'discord-default-avatar-legacy-hash',
      kind: 'discord-relative-default-avatar',
      source: '/assets/322c936a8c8be1b803cd94861bdfa868.png'
    },
    {
      id: 'external-image-placeholder',
      kind: 'external-placeholder'
    },
    {
      id: 'inline-image-error-svg',
      kind: 'inline-image-error-svg',
      source: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="104" viewBox="0 0 200 104"%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23666" font-family="Arial" font-size="14"%3EImage Error%3C/text%3E%3C/svg%3E'
    }
  ];
  const statuses = await Promise.all([
    probeDetachedImage(probes[0].source),
    externalAssets
      ? probeDetachedImage('https://i.clouds.tf/q2vy/r8q6.png')
      : Promise.resolve('not-requested'),
    probeDetachedImage(probes[2].source)
  ]);
  const reportedProbes = probes.map((probe, index) => ({
    id: probe.id,
    kind: probe.kind,
    status: statuses[index]
  }));
  const requiredDefault = statuses[0] === 'loaded';
  const requiredInline = statuses[2] === 'loaded';
  const requiredApiAvailable = statuses[0] !== 'image-api-unavailable'
    && statuses[2] !== 'image-api-unavailable';
  const requiredPassed = requiredDefault && requiredInline && requiredApiAvailable;
  const errors = [];
  if (!requiredApiAvailable) errors.push('image-api-unavailable');
  if (!requiredDefault) errors.push('required-default-avatar-probe-failed');
  if (!requiredInline) errors.push('required-inline-image-error-probe-failed');
  if (statuses[1] === 'failed' || statuses[1] === 'timeout') errors.push('external-placeholder-probe-failed');
  const validation = collectValidation({
    requiredDefaultAvatar: requiredDefault,
    requiredInlineImageErrorSvg: requiredInline,
    requiredImageApi: requiredApiAvailable
  }, errors);
  let status = requiredPassed ? 'pass' : 'fail';
  if (requiredPassed && (statuses[1] === 'failed' || statuses[1] === 'timeout')) status = 'warn';
  const referenceInventory = [
    { id: 'discord-cdn-host', kind: 'discord-cdn-host', host: 'cdn.discordapp.com', status: 'not-probed-runtime-template' },
    { id: 'discord-media-proxy-host', kind: 'discord-media-proxy-host', host: 'media.discordapp.net', status: 'not-probed-runtime-template' },
    { id: 'avatar-path-template', kind: 'avatar-path-template', template: '/avatars/{userId}/{avatar}.png?size=128', status: 'not-probed-runtime-template' },
    { id: 'sticker-path-template', kind: 'sticker-path-template', template: '/stickers/{stickerId}.{png|gif}?size=160', status: 'not-probed-runtime-template' },
    { id: 'attachment-ephemeral-path-prefixes', kind: 'attachment-ephemeral-path-prefixes', prefixes: '/attachments/|/ephemeral-attachments/', status: 'not-probed-runtime-template' },
    { id: 'localhost-cache-key-pseudo-origin', kind: 'localhost-cache-key-pseudo-origin', origin: 'http://localhost:7474', status: 'not-probed-runtime-template' },
    { id: 'native-trash-svg-signature', kind: 'native-trash-svg-signature', signature: '2.81h8.36a3', status: 'not-probed-runtime-template' }
  ];
  return {
    status,
    expectedUniqueness: 'fixed renderer asset probes (three sources)',
    loadedMatchCount: reportedProbes.filter(probe => probe.status === 'loaded').length,
    selected: {
      found: requiredPassed,
      type: 'renderer-asset-probes',
      moduleId: null,
      exportPaths: ['window'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    probes: reportedProbes,
    referenceInventory,
    validation
  };
}

async function describeOptionalLoadEntryTransition(api, options = {}, loadEntryAttempted = false, onAttempt = null) {
  const webpackRead = safeRead(api, 'Webpack');
  const webpack = webpackRead.ok ? webpackRead.value : null;
  const targetPredicates = {
    nativeDocument: value => callable(value)
      && dataPrototypeMethod(value, 'isPoll').ok
      && dataPrototypeMethod(value, 'hasFlag').ok,
    nativeAudio: value => callable(value)
      && dataPrototypeMethod(value, 'renderAudio').ok
      && dataPrototypeMethod(value, 'renderVideo').ok
      && dataPrototypeMethod(value, 'renderControls').ok
      && dataPrototypeMethod(value, 'checkVideoDecodability').ok
  };
  const assessTargets = () => {
    const nativeDocument = selectionFromFilter(webpack, targetPredicates.nativeDocument, { searchExports: true });
    const nativeAudio = selectionFromFilter(webpack, targetPredicates.nativeAudio, { searchExports: true });
    const errors = [];
    if (nativeDocument.error || nativeAudio.error) errors.push('target-assessment-unavailable');
    return {
      available: errors.length === 0,
      booleans: {
        nativeDocument: nativeDocument.value != null,
        nativeAudio: nativeAudio.value != null
      },
      errors
    };
  };
  const utilsRead = safeRead(api, 'Utils');
  const loadEntryRead = safeRead(utilsRead.value, 'loadEntry');
  const loadEntryAvailable = loadEntryRead.ok && callable(loadEntryRead.value);
  const loadEntryRequested = options?.loadEntry === true;
  const beforeAssessment = assessTargets();
  let ownerFound = false;
  let ownerExactConsumerShape = false;
  let ownerLazyEntryShape = false;
  let ownerSelectionAvailable = true;
  const errors = [...beforeAssessment.errors];
  let ownerValue = null;
  if (beforeAssessment.available) {
    const filtersRead = safeRead(webpack, 'Filters');
    const byPrototypeKeysRead = safeRead(filtersRead.value, 'byPrototypeKeys');
    if (!byPrototypeKeysRead.ok || !callable(byPrototypeKeysRead.value)) {
      ownerSelectionAvailable = false;
      errors.push('MessageAccessories-filter-unavailable');
    } else {
      try {
        const ownerFilter = byPrototypeKeysRead.value.call(filtersRead.value, 'renderEmbeds', 'renderAttachments');
        const ownerSelection = selectionFromFilter(webpack, ownerFilter, { searchExports: true });
        if (ownerSelection.error) {
          ownerSelectionAvailable = false;
          errors.push('MessageAccessories-selection-unavailable');
        }
        ownerValue = ownerSelection.value;
        ownerFound = ownerValue != null;
        ownerExactConsumerShape = ownerFound
          && callable(ownerValue)
          && dataPrototypeMethod(ownerValue, 'renderEmbeds').ok
          && dataPrototypeMethod(ownerValue, 'renderAttachments').ok;
        ownerLazyEntryShape = ownerFound && hasBetterDiscordLazyEntryShape(ownerValue);
      } catch {
        ownerSelectionAvailable = false;
        errors.push('MessageAccessories-selection-unavailable');
      }
    }
  } else {
    ownerSelectionAvailable = false;
  }
  const ownerValid = ownerFound && ownerExactConsumerShape && ownerLazyEntryShape;
  const owner = {
    found: ownerFound,
    exactConsumerShape: ownerExactConsumerShape,
    lazyEntryShape: ownerLazyEntryShape
  };
  const before = beforeAssessment.booleans;
  const beforeBothLoaded = before.nativeDocument && before.nativeAudio;
  let after = { nativeDocument: false, nativeAudio: false };
  let afterAssessmentAvailable = true;
  let attempted = false;
  let outcome = 'targets-already-loaded';
  let loadResultType = 'not-attempted';
  let loadResultCount = 0;
  if (!beforeAssessment.available) {
    outcome = 'target-assessment-unavailable';
    afterAssessmentAvailable = false;
  } else if (beforeBothLoaded) {
    after = { ...before };
    if (!loadEntryAvailable) errors.push('Utils.loadEntry-unavailable');
    if (!ownerValid) errors.push('MessageAccessories-owner-unavailable-or-invalid');
  } else if (!loadEntryRequested) {
    outcome = 'load-entry-not-requested';
    after = { ...before };
  } else if (loadEntryAttempted) {
    outcome = 'load-entry-already-attempted';
    after = { ...before };
  } else if (!loadEntryAvailable) {
    outcome = 'load-entry-unavailable';
    errors.push('Utils.loadEntry-unavailable');
    const recheck = assessTargets();
    after = recheck.booleans;
    afterAssessmentAvailable = recheck.available;
    errors.push(...recheck.errors);
    if (!afterAssessmentAvailable) outcome = 'target-assessment-unavailable';
  } else if (!ownerSelectionAvailable || !ownerValid) {
    outcome = 'owner-unavailable-or-invalid';
    errors.push('MessageAccessories-owner-unavailable-or-invalid');
    const recheck = assessTargets();
    after = recheck.booleans;
    afterAssessmentAvailable = recheck.available;
    errors.push(...recheck.errors);
    if (!afterAssessmentAvailable) outcome = 'target-assessment-unavailable';
  } else {
    attempted = true;
    if (typeof onAttempt === 'function') {
      try { onAttempt(); } catch { errors.push('load-entry-attempt-state-failed'); }
    }
    let hostPromise;
    try {
      hostPromise = Promise.resolve(loadEntryRead.value.call(utilsRead.value, ownerValue));
    } catch {
      hostPromise = Promise.reject(new Error('load-entry-rejected'));
    }
    hostPromise.then(() => {}, () => {});
    let timeoutId = null;
    const timeoutPromise = new Promise(resolve => {
      try {
        timeoutId = setTimeout(() => resolve({ type: 'timeout' }), 15000);
      } catch {
        resolve({ type: 'timeout' });
      }
    });
    const settled = await Promise.race([
      hostPromise.then(value => ({ type: 'fulfilled', value }), () => ({ type: 'rejected' })),
      timeoutPromise
    ]);
    if (timeoutId !== null) {
      try { clearTimeout(timeoutId); } catch {}
      timeoutId = null;
    }
    if (settled.type === 'timeout') {
      loadResultType = 'timeout';
      outcome = 'load-entry-timeout';
      errors.push('Utils.loadEntry-timeout');
    } else if (settled.type === 'rejected') {
      loadResultType = 'rejected';
      outcome = 'load-entry-rejected';
      errors.push('Utils.loadEntry-rejected');
    } else {
      const loadResult = settled.value;
      if (Array.isArray(loadResult)) {
        loadResultType = 'array';
        try {
          loadResultCount = Number.isSafeInteger(loadResult.length) && loadResult.length >= 0 ? loadResult.length : 0;
        } catch {
          errors.push('load-result-shape-unavailable');
        }
      } else if (loadResult === null) {
        loadResultType = 'null';
      } else {
        loadResultType = 'other';
      }
    }
    const recheck = assessTargets();
    after = recheck.booleans;
    afterAssessmentAvailable = recheck.available;
    errors.push(...recheck.errors);
    if (!afterAssessmentAvailable) outcome = 'target-assessment-unavailable';
    else if (outcome !== 'load-entry-rejected' && outcome !== 'load-entry-timeout') outcome = after.nativeDocument && after.nativeAudio
      ? 'targets-observed-after-load-entry'
      : 'targets-still-missing';
  }
  if (!beforeAssessment.available) after = { nativeDocument: false, nativeAudio: false };
  const afterBothLoaded = after.nativeDocument && after.nativeAudio;
  const validation = collectValidation({
    targetAssessmentAvailable: beforeAssessment.available,
    targetRecheckAvailable: afterAssessmentAvailable
  }, errors);
  let status = 'warn';
  if (!beforeAssessment.available || !afterAssessmentAvailable) status = 'fail';
  else if ((beforeBothLoaded && loadEntryAvailable && ownerValid)
    || (attempted && outcome === 'targets-observed-after-load-entry' && afterBothLoaded)) status = 'pass';
  return {
    status,
    expectedUniqueness: 'optional MessageAccessories lazy-entry transition',
    loadedMatchCount: Number(after.nativeDocument) + Number(after.nativeAudio),
    selected: {
      found: ownerFound,
      type: 'optional-load-entry-transition',
      moduleId: null,
      exportPaths: ['<root>'],
      ownKeyNames: [],
      prototypeMethodNames: [],
      errors: []
    },
    attempted,
    outcome,
    attribution: outcome === 'targets-observed-after-load-entry'
      ? 'temporal-observation-not-exclusive-proof'
      : 'not-applicable',
    before,
    after,
    transitions: {
      nativeDocument: !before.nativeDocument && after.nativeDocument,
      nativeAudio: !before.nativeAudio && after.nativeAudio
    },
    owner,
    loadEntryAvailable,
    loadResultType,
    loadResultCount,
    validation: {
      ok: validation.ok,
      booleans: validation.booleans,
      errors: [...new Set(validation.errors)]
    }
  };
}

function isNonemptyCssString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validSemanticKeyList(keys) {
  return Array.isArray(keys) && keys.length > 0
    && keys.every(key => typeof key === 'string' && key.length > 0);
}

function inspectSemanticCssCandidate(value, requestedKeys, consumerKeys) {
  const requestedValidation = Object.fromEntries((Array.isArray(requestedKeys) ? requestedKeys : []).map(key => [key, false]));
  const consumerValidation = Object.fromEntries((Array.isArray(consumerKeys) ? consumerKeys : []).map(key => [key, false]));
  const actualConsumerKeys = [];
  const errors = [];
  if (!validSemanticKeyList(requestedKeys) || !validSemanticKeyList(consumerKeys)) {
    return {
      valid: false,
      requestedValid: false,
      consumerValid: false,
      strategy: null,
      requestedValidation,
      consumerValidation,
      actualConsumerKeys,
      errors: ['css-invalid-semantic-keys']
    };
  }
  const descriptorInfo = getOwnDescriptors(value);
  if (!descriptorInfo.descriptors) {
    return {
      valid: false,
      requestedValid: false,
      consumerValid: false,
      strategy: null,
      requestedValidation,
      consumerValidation,
      actualConsumerKeys,
      errors: [descriptorInfo.error || 'css-own-descriptors-unavailable']
    };
  }
  const descriptors = descriptorInfo.descriptors;
  const stringExports = [];
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') continue;
    const descriptor = descriptors[key];
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (!isNonemptyCssString(descriptor.value)) continue;
    stringExports.push({ key, tokens: descriptor.value.split(/\s+/).filter(Boolean) });
  }
  let usesValueToken = false;
  for (const semanticKey of requestedKeys) {
    if (Object.prototype.hasOwnProperty.call(descriptors, semanticKey)) {
      const descriptor = descriptors[semanticKey];
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        errors.push('css-accessor-skipped');
      } else if (isNonemptyCssString(descriptor.value)) {
        requestedValidation[semanticKey] = true;
      } else {
        errors.push('css-requested-key-invalid');
      }
      continue;
    }
    const tokenPrefix = `${semanticKey}_`;
    const derived = stringExports.some(exported => exported.tokens.some(token => token.startsWith(tokenPrefix)));
    if (derived) {
      requestedValidation[semanticKey] = true;
      usesValueToken = true;
    } else {
      errors.push('css-requested-key-missing');
    }
  }
  for (const consumerKey of consumerKeys) {
    if (Object.prototype.hasOwnProperty.call(requestedValidation, consumerKey)) {
      consumerValidation[consumerKey] = requestedValidation[consumerKey];
    } else if (Object.prototype.hasOwnProperty.call(descriptors, consumerKey)) {
      const descriptor = descriptors[consumerKey];
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        errors.push('css-accessor-skipped');
      } else {
        consumerValidation[consumerKey] = isNonemptyCssString(descriptor.value);
        if (!consumerValidation[consumerKey]) errors.push('css-consumer-key-invalid');
      }
    } else {
      errors.push('css-consumer-key-missing');
    }
    if (consumerValidation[consumerKey]) actualConsumerKeys.push(consumerKey);
  }
  const requestedValid = Object.values(requestedValidation).every(Boolean);
  const consumersValid = Object.values(consumerValidation).every(Boolean);
  return {
    valid: requestedValid && consumersValid,
    requestedValid,
    consumerValid: consumersValid,
    strategy: requestedValid ? (usesValueToken ? 'value-token' : 'direct') : null,
    requestedValidation,
    consumerValidation,
    actualConsumerKeys,
    errors: [...new Set(errors)]
  };
}

function cssCandidateIdentity(value, module, moduleId) {
  if (module !== null && (typeof module === 'object' || typeof module === 'function')) return module;
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) return value;
  return `primitive:${internalPathIdentity(getModuleIdValue(moduleId, module))}`;
}

function callCssWebpackMethod(api, method, args, options) {
  const methodArgs = Array.isArray(args) ? [...args] : [];
  if (options !== undefined) methodArgs.push(options);
  return callWebpackMethod(api, method, methodArgs);
}

function resolveSemanticCssAuditAlternative(api, alternative) {
  const requestedKeys = alternative.requestedKeys;
  const consumerKeys = alternative.consumerKeys;
  if (!validSemanticKeyList(requestedKeys) || !validSemanticKeyList(consumerKeys)) {
    return {
      attempted: true,
      candidateCount: 0,
      usableCandidateCount: 0,
      inspectedCandidateCount: 0,
      collectionErrors: ['css-invalid-semantic-keys'],
      candidateErrors: [],
      candidateSummaries: [],
      selectedValue: null,
      selected: {},
      inspection: null,
      fallbackUsed: false
    };
  }
  const direct = callCssWebpackMethod(api, 'getByKeys', requestedKeys, alternative.options);
  const collectionErrors = direct.error ? [direct.error] : [];
  const candidateSummaries = [];
  const candidateErrors = [];
  const addCandidateSummary = (value, module, moduleId) => {
    if (candidateSummaries.length >= MAX_CANDIDATE_RECORDS) return;
    candidateSummaries.push(summarizeCandidate(
      value,
      module,
      moduleId,
      exportPathsFor(value, module),
      { includeOwnKeys: false }
    ));
  };
  const hasDirectValue = direct.value != null;
  let directInspection = null;
  if (hasDirectValue) {
    directInspection = inspectSemanticCssCandidate(direct.value, requestedKeys, consumerKeys);
    addCandidateSummary(direct.value, null, null);
    candidateErrors.push(...directInspection.errors);
  }
  let firstMatch = null;
  let matchedCandidateCount = 0;
  let usableCandidateCount = 0;
  const seenCandidates = new Set();
  const scanAvailable = typeof api?.getModule === 'function';
  if (scanAvailable) {
    const findCandidate = (value, module, moduleId) => {
      const identity = cssCandidateIdentity(value, module, moduleId);
      if (seenCandidates.has(identity)) return false;
      seenCandidates.add(identity);
      const inspection = inspectSemanticCssCandidate(value, requestedKeys, consumerKeys);
      if (inspection.requestedValid) {
        addCandidateSummary(value, module, moduleId);
        candidateErrors.push(...inspection.errors);
        matchedCandidateCount += 1;
        if (inspection.valid === true) usableCandidateCount += 1;
        if (firstMatch === null) {
          firstMatch = {
            value,
            moduleId: getModuleIdValue(moduleId, module),
            exportPaths: exportPathsFor(value, module),
            inspection
          };
        }
      }
      return false;
    };
    const scan = callCssWebpackMethod(api, 'getModule', [findCandidate], alternative.options);
    if (scan.error) collectionErrors.push(scan.error);
  } else {
    collectionErrors.push('Webpack.getModule-unavailable');
  }
  if (hasDirectValue) {
    return {
      attempted: true,
      candidateCount: matchedCandidateCount,
      usableCandidateCount,
      inspectedCandidateCount: seenCandidates.size,
      collectionErrors: [...new Set(collectionErrors)],
      candidateErrors: [...new Set(candidateErrors)],
      candidateSummaries,
      selectedValue: direct.value,
      selected: { moduleId: null, exportPaths: ['<root>'] },
      inspection: { ...directInspection, strategy: 'direct' },
      fallbackUsed: false
    };
  }
  return {
    attempted: true,
    candidateCount: matchedCandidateCount,
    usableCandidateCount,
    inspectedCandidateCount: seenCandidates.size,
    collectionErrors: [...new Set(collectionErrors)],
    candidateErrors: [...new Set(candidateErrors)],
    candidateSummaries,
    selectedValue: firstMatch ? firstMatch.value : null,
    selected: firstMatch ? { moduleId: firstMatch.moduleId, exportPaths: firstMatch.exportPaths } : {},
    inspection: firstMatch?.inspection || null,
    fallbackUsed: scanAvailable
  };
}

function describeSemanticCssContract(api, contract) {
  const alternatives = [];
  let selected = null;
  for (const alternative of contract.alternatives) {
    const result = resolveSemanticCssAuditAlternative(api, alternative);
    alternatives.push({
      label: alternative.label,
      requestedKeys: alternative.requestedKeys,
      consumerKeys: alternative.consumerKeys,
      candidateCount: result.candidateCount,
      usableCandidateCount: result.usableCandidateCount,
      inspectedCandidateCount: result.inspectedCandidateCount,
      collectionErrors: result.collectionErrors,
      candidateErrors: result.candidateErrors,
      candidateSummaries: result.candidateSummaries,
      fallbackUsed: result.fallbackUsed
    });
    if (!selected
      && result.selectedValue !== null
      && result.selectedValue !== undefined
      && result.inspection) selected = { alternative, result };
  }
  const requestedKeys = selected?.alternative.requestedKeys || contract.alternatives[0]?.requestedKeys || [];
  const consumerKeys = selected?.alternative.consumerKeys || contract.alternatives[0]?.consumerKeys || [];
  const requestedValidation = Object.fromEntries(requestedKeys.map(key => [key, selected?.result.inspection?.requestedValidation?.[key] === true]));
  const consumerValidation = Object.fromEntries(consumerKeys.map(key => [key, selected?.result.inspection?.consumerValidation?.[key] === true]));
  const actualConsumerKeys = selected?.result.inspection?.actualConsumerKeys || [];
  const allCollectionErrors = alternatives.flatMap(alternative => alternative.collectionErrors);
  const selectionValid = selected !== null;
  const requestedValid = Object.values(requestedValidation).every(Boolean) && requestedKeys.length > 0;
  const consumersValid = Object.values(consumerValidation).every(Boolean) && consumerKeys.length > 0;
  const validation = collectValidation({
    selection: selectionValid,
    requestedKeys: requestedValid,
    consumerKeys: consumersValid,
    ...Object.fromEntries(Object.entries(consumerValidation).map(([key, value]) => [`consumer.${key}`, value]))
  }, [...new Set(allCollectionErrors)]);
  const selectedAlternative = selected?.alternative.label || null;
  const selectedCandidateCount = selected?.result.candidateCount || 0;
  const selectedUsableCandidateCount = selected?.result.usableCandidateCount || 0;
  const ambiguous = selectedUsableCandidateCount !== 1
    || alternatives.some(alternative => alternative.collectionErrors.length > 0);
  let status = validation.ok ? 'pass' : 'fail';
  if (validation.ok && ambiguous) status = 'warn';
  return {
    status,
    expectedUniqueness: 'single semantic CSS module per ordered alternative',
    loadedMatchCount: selectedCandidateCount,
    candidateCount: selectedCandidateCount,
    usableCandidateCount: selectedUsableCandidateCount,
    selected: summarizeSelected(
      selected ? selected.result.selectedValue : null,
      selected?.result.selected || {},
      { includeOwnKeys: false }
    ),
    requestedKeys,
    consumerKeys,
    actualConsumerKeys,
    requestedValidation,
    consumerValidation,
    resolutionStrategy: selected?.result.inspection?.strategy || null,
    selectedAlternative,
    alternatives,
    validation: {
      ok: validation.ok,
      booleans: {
        selection: selectionValid,
        requestedKeys: requestedValid,
        consumerKeys: consumersValid,
        consumer: consumerValidation
      },
      errors: [...new Set(validation.errors)]
    }
  };
}

function semanticCssContracts() {
  return [
    {
      name: 'Css.ClickableClasses',
      alternatives: [
        { label: 'clickable', requestedKeys: ['clickable'], consumerKeys: ['clickable'] }
      ]
    },
    {
      name: 'Css.ColorClasses',
      alternatives: [
        { label: 'color-danger-premium', requestedKeys: ['colorDanger', 'colorPremium'], consumerKeys: ['colorDanger'] }
      ]
    },
    {
      name: 'Css.ButtonClasses',
      alternatives: [
        {
          label: 'button-brand-filled',
          requestedKeys: ['button', 'colorBrand', 'lookFilled'],
          consumerKeys: ['button', 'colorBrand', 'lookFilled', 'sizeSmall', 'grow', 'contents']
        }
      ]
    },
    {
      name: 'Css.MessageWrapperClasses',
      alternatives: [
        { label: 'message-cozy', requestedKeys: ['message', 'cozyMessage'], consumerKeys: ['message'] },
        { label: 'message-group-start', requestedKeys: ['message', 'groupStart'], consumerKeys: ['message'] }
      ]
    },
    {
      name: 'Css.MessageToolbarClasses',
      alternatives: [
        { label: 'message-toolbar', requestedKeys: ['messageListItem', 'buttons'], consumerKeys: ['buttons'] }
      ]
    },
    {
      name: 'Css.ContainerClasses',
      alternatives: [
        { label: 'container-cozy-bounded', requestedKeys: ['containerCozyBounded'], consumerKeys: ['containerCozyBounded'] }
      ]
    },
    {
      name: 'Css.ChatContentClasses',
      alternatives: [
        { label: 'chat-content', requestedKeys: ['chatContent'], consumerKeys: ['chatContent', 'chat'] }
      ]
    },
    {
      name: 'Css.MarkupClasses',
      alternatives: [
        { label: 'markup', requestedKeys: ['markup'], consumerKeys: ['markup'] }
      ]
    },
    {
      name: 'Css.SpoilerClasses',
      alternatives: [
        { label: 'spoiler-text-hidden', requestedKeys: ['spoilerText', 'hidden'], consumerKeys: ['hidden'] },
        { label: 'spoiler-content-hidden', requestedKeys: ['spoilerContent', 'hidden'], consumerKeys: ['hidden'] }
      ]
    },
    {
      name: 'Css.FocusedClasses',
      alternatives: [
        { label: 'focused', requestedKeys: ['focused'], consumerKeys: ['focused'] }
      ]
    },
    {
      name: 'Css.TabBarClasses',
      alternatives: [
        { label: 'tab-bar', requestedKeys: ['tabBar'], consumerKeys: ['tabBar'] }
      ]
    },
    {
      name: 'Css.DefaultColorClasses',
      alternatives: [
        { label: 'default-color', requestedKeys: ['defaultColor'], consumerKeys: ['defaultColor'] }
      ]
    },
    {
      name: 'Css.BotTagClasses',
      alternatives: [
        { label: 'bot-tag', requestedKeys: ['botTag'], consumerKeys: ['botTag'] }
      ]
    },
    {
      name: 'Css.ExecutedCommandClasses',
      alternatives: [
        { label: 'executed-command', requestedKeys: ['executedCommand'], consumerKeys: ['header'] }
      ]
    },
    {
      name: 'Css.TitleClasses',
      alternatives: [
        { label: 'title-chat-content', requestedKeys: ['title', 'chatContent'], consumerKeys: ['title'] }
      ]
    },
    {
      name: 'Css.ContentClasses',
      alternatives: [
        { label: 'content-margin-compact-indent', requestedKeys: ['content', 'marginCompactIndent'], consumerKeys: ['content'] }
      ]
    },
    {
      name: 'Css.ContainerCompactClasses',
      alternatives: [
        { label: 'container-compact-bounded', requestedKeys: ['container', 'containerCompactBounded'], consumerKeys: ['container'] }
      ]
    },
    {
      name: 'Css.ErrorPageClasses',
      alternatives: [
        { label: 'error-page', requestedKeys: ['errorPage'], consumerKeys: ['errorPage'] }
      ]
    },
    {
      name: 'Css.TabItemClasses',
      alternatives: [
        { label: 'tab-item-selected-top-pill', requestedKeys: ['item', 'selected', 'topPill'], consumerKeys: ['item', 'selected', 'topPill'] }
      ]
    },
    {
      name: 'Css.TimestampClasses',
      alternatives: [
        {
          label: 'timestamp-full',
          requestedKeys: ['separator', 'timestamp', 'timestampInline', 'timestampVisibleOnHover', 'latin24CompactTimeStamp'],
          consumerKeys: ['separator', 'timestamp', 'timestampInline', 'timestampVisibleOnHover', 'latin24CompactTimeStamp'],
          options: { searchExports: true }
        },
        {
          label: 'timestamp-reduced',
          requestedKeys: ['separator', 'timestamp', 'timestampInline'],
          consumerKeys: ['separator', 'timestamp', 'timestampInline', 'timestampVisibleOnHover', 'latin24CompactTimeStamp'],
          options: { searchExports: true }
        }
      ]
    },
    {
      name: 'Css.Eager.Username',
      alternatives: [
        { label: 'eager-username', requestedKeys: ['username'], consumerKeys: ['username'] }
      ]
    },
    {
      name: 'Css.Eager.Timestamp',
      alternatives: [
        { label: 'eager-timestamp', requestedKeys: ['timestamp'], consumerKeys: ['timestamp'] }
      ]
    },
    {
      name: 'Css.Eager.SelectedMessage',
      alternatives: [
        { label: 'eager-selected-message', requestedKeys: ['selected', 'message'], consumerKeys: ['selected'] }
      ]
    },
    {
      name: 'Css.Eager.ContainerContent',
      alternatives: [
        { label: 'eager-container-content', requestedKeys: ['container', 'content'], consumerKeys: ['container'] }
      ]
    },
    {
      name: 'Css.Eager.MessageContent',
      alternatives: [
        { label: 'eager-message-content', requestedKeys: ['messageContent'], consumerKeys: ['messageContent'] }
      ]
    },
    {
      name: 'Css.Eager.HeaderAvatar',
      alternatives: [
        { label: 'eager-header-avatar', requestedKeys: ['header', 'avatar'], consumerKeys: ['avatar'] }
      ]
    },
    {
      name: 'Css.NativeAudioMosaic',
      alternatives: [
        { label: 'native-audio-mosaic', requestedKeys: ['mosaicItemContent'], consumerKeys: ['mosaicItemContent'], options: { searchExports: true } }
      ]
    },
    {
      name: 'Css.Generic.GroupStartMessage',
      alternatives: [
        { label: 'generic-group-start-message', requestedKeys: ['groupStart', 'message'], consumerKeys: ['message'] }
      ]
    },
    {
      name: 'Css.Generic.GroupStartCozyMessage',
      alternatives: [
        { label: 'generic-group-start-cozy-message', requestedKeys: ['groupStart', 'cozyMessage'], consumerKeys: ['cozyMessage'] }
      ]
    },
    {
      name: 'Css.Generic.SystemMessageGroupStart',
      alternatives: [
        { label: 'generic-system-message-group-start', requestedKeys: ['systemMessage', 'groupStart'], consumerKeys: ['groupStart'] }
      ]
    },
    {
      name: 'Css.Generic.ZalgoWrapper',
      alternatives: [
        { label: 'generic-zalgo-wrapper', requestedKeys: ['zalgo', 'wrapper'], consumerKeys: ['wrapper'] }
      ]
    },
    {
      name: 'Css.Generic.ZalgoCozy',
      alternatives: [
        { label: 'generic-zalgo-cozy', requestedKeys: ['zalgo', 'cozy'], consumerKeys: ['cozy'] }
      ]
    },
    {
      name: 'Css.Generic.CozyZalgo',
      alternatives: [
        { label: 'generic-cozy-zalgo', requestedKeys: ['cozy', 'zalgo'], consumerKeys: ['zalgo'] }
      ]
    },
    {
      name: 'Css.Generic.EditedAvatar',
      alternatives: [
        { label: 'generic-edited-avatar', requestedKeys: ['edited', 'avatar'], consumerKeys: ['avatar'] }
      ]
    },
    {
      name: 'Css.Generic.EditedAvatarClickable',
      alternatives: [
        { label: 'generic-edited-avatar-clickable', requestedKeys: ['edited', 'avatar', 'clickable'], consumerKeys: ['clickable'] }
      ]
    },
    {
      name: 'Css.Generic.UserJoinUsername',
      alternatives: [
        { label: 'generic-user-join-username', requestedKeys: ['userJoinSystemMessageIcon', 'username'], consumerKeys: ['username'] }
      ]
    },
    {
      name: 'Css.Generic.ButtonContainerMarkupRtl',
      alternatives: [
        { label: 'generic-button-container-markup-rtl', requestedKeys: ['buttonContainer', 'markupRtl'], consumerKeys: ['markupRtl'] }
      ]
    },
    {
      name: 'Css.Generic.GiftCodeContainer',
      alternatives: [
        { label: 'generic-gift-code-container', requestedKeys: ['giftCodeContainer', 'container'], consumerKeys: ['container'] }
      ]
    },
    {
      name: 'Css.Generic.ZalgoCompactTimestamp',
      alternatives: [
        { label: 'generic-zalgo-compact-timestamp', requestedKeys: ['zalgo', 'latin24CompactTimeStamp'], consumerKeys: ['latin24CompactTimeStamp'] }
      ]
    },
    {
      name: 'Css.Generic.ZalgoContents',
      alternatives: [
        { label: 'generic-zalgo-contents', requestedKeys: ['zalgo', 'contents'], consumerKeys: ['contents'] }
      ]
    }
  ];
}

function describeContract(api, contract) {
  let selectedResult;
  let selection = {};
  let selectionError = null;
  try {
    const result = contract.select(api);
    selectedResult = result?.value;
    selection = result?.selection || {};
    selectionError = result?.error || null;
  } catch {
    selectedResult = null;
    selectionError = 'selection-threw';
  }
  let match = contract.match;
  const matchErrors = [];
  if (contract.matchFilterFactory) {
    try {
      match = contract.matchFilterFactory(api);
    } catch {
      match = null;
      matchErrors.push('match-filter-factory-threw');
    }
  }
  const matches = match ? (contract.rootMatch
    ? collectRootMatches(api.Webpack, match, contract.summaryOptions || {})
    : collectMatches(api.Webpack, match, contract.matchOptions || {}, contract.summaryOptions || {})) : {
    loadedMatchCount: selectedResult == null ? 0 : 1,
    matches: [],
    errors: matchErrors
  };
  matches.errors.push(...matchErrors);
  let validation;
  try {
    validation = contract.validate(selectedResult);
  } catch {
    validation = collectValidation({}, ['validation-threw']);
  }
  if (selectionError) validation.errors.push(selectionError);
  validation.ok = validation.ok && !selectionError;
  const collectionError = matches.errors.length > 0;
  let status = validation.ok ? 'pass' : 'fail';
  if (collectionError) status = validation.ok ? 'warn' : 'fail';
  else if (status === 'pass' && matches.loadedMatchCount !== 1) status = 'warn';
  return {
    status,
    expectedUniqueness: contract.expectedUniqueness,
    loadedMatchCount: matches.loadedMatchCount,
    loadedCandidates: matches.matches,
    selected: summarizeSelected(selectedResult, selection, contract.summaryOptions || {}),
    validation: {
      ok: validation.ok,
      booleans: validation.booleans,
      errors: [...new Set([...validation.errors, ...matches.errors])]
    }
  };
}

function moduleContracts() {
  const store = (name, keys, selector, expected = 'single canonical store') => ({
    name,
    expectedUniqueness: expected,
    select: selector,
    match: coreModuleFilter(keys),
    summaryOptions: { includeOwnKeys: false },
    validate: value => collectValidation(Object.fromEntries(keys.map(key => [key, dataCallable(value, key).ok])))
  });
  const channelActionsShape = value => dataCallable(value, 'deleteChannel').ok
    && (dataCallable(value, 'updateChannel').ok || dataCallable(value, 'selectChannel').ok);
  const messageStoreShape = value => ['getMessage', 'getMessages', 'getLastEditableMessage']
    .every(key => dataCallable(value, key).ok);
  const muteModuleShape = value => dataCallable(value, 'isChannelMuted').ok
    && dataCallable(value, 'isMuted').ok;
  const messageActionsShape = value => [
    'sendMessage', 'editMessage', 'deleteMessage', 'startEditMessage', 'fetchMessages'
  ].every(key => dataCallable(value, key).ok);
  const modalActionsShape = value => {
    const store = dataRead(value, 'useModalsStore');
    return dataCallable(value, 'openModal').ok
      && dataCallable(value, 'hasModalOpen').ok
      && dataCallable(value, 'closeModal').ok
      && store.ok
      && store.value != null
      && dataCallable(store.value, 'subscribe').ok;
  };
  const httpModuleShape = value => dataCallable(value, 'get').ok
    && dataCallable(value, 'post').ok
    && dataCallable(value, 'put').ok
    && (dataCallable(value, 'del').ok || dataCallable(value, 'delete').ok);
  const timestampPrimaryShape = value => dataPresent(value, 'relativeTimeRounding').ok
    && dataPresent(value, 'locales').ok;
  const timestampFallbackShape = value => dataPresent(value, 'createFromInputFallback').ok;
  const timestampUtilsShape = value => callable(value)
    && (timestampPrimaryShape(value) || timestampFallbackShape(value));
  const nativeMediaModalAlternatives = [
    { searches: ['startingIndex', 'items', 'Media Viewer Modal'], marker: 'startingIndex', label: 'native-startingIndex-items-media-viewer' },
    { searches: ['numMediaItems', 'shouldHideMediaOptions'], marker: 'numMediaItems', label: 'native-numMediaItems-shouldHideMediaOptions' },
    { searches: ['MEDIA_VIEWER', 'OPEN_MODAL', 'backdropStyle'], marker: 'MEDIA_VIEWER', label: 'native-MEDIA_VIEWER-OPEN_MODAL-backdropStyle' }
  ];
  const imageModalAlternatives = [
    { searches: ['zoomThumbnailPlaceholder'], marker: 'zoomThumbnailPlaceholder', label: 'image-zoomThumbnailPlaceholder' },
    { searches: ['.MEDIA_MODAL_CLOSE,'], marker: '.MEDIA_MODAL_CLOSE,', label: 'image-.MEDIA_MODAL_CLOSE,' },
    { searches: ['renderMobileCloseButton'], marker: 'renderMobileCloseButton', label: 'image-renderMobileCloseButton' }
  ];
  const trashIconPrimarySearch = '2.81h8.36a3';
  const trashIconFallbackSearch = /M5\.06 7a1 1 0 0 0-1 1\.06l\.76 12\.13/;
  const selectSourceMapAlternative = (api, alternatives, checksFor) => {
    let lastError = null;
    for (const alternative of alternatives) {
      const selected = callWebpackMethod(api, 'getBySource', [...alternative.searches, { searchExports: false }]);
      if (selected.value == null) {
        lastError = selected.error || lastError;
        continue;
      }
      const checks = checksFor(selected.value, alternative);
      if (checks.valid) {
        return {
          value: selected.value,
          selection: { semanticAlternative: alternative.label },
          error: null
        };
      }
    }
    return { value: null, selection: {}, error: lastError };
  };
  const imageModalValidation = value => {
    const checks = imageModalAlternatives.map(alternative => getMediaExportMapChecks(value, alternative.marker));
    const winning = checks.some(check => check.sourceMatchedCallableCount === 1
      && check.sourceReadFailures === 0
      && !check.error);
    const sourceReadComplete = checks.every(check => check.sourceReadFailures === 0 && !check.error);
    return collectValidation({
      exactlyOneWinningCallable: winning,
      sourceReadComplete
    }, checks.flatMap(check => [check.error, check.sourceReadFailures ? 'callable-source-read-failed' : null].filter(Boolean)));
  };
  const trashIconValidation = value => {
    const checks = getTrashResolverChecks(value);
    const validation = collectValidation({ resolverShape: checks.resolverShape },
      [checks.error, checks.sourceReadFailures ? 'callable-source-read-failed' : null].filter(Boolean));
    validation.booleans.directCallable = checks.directCallable;
    validation.booleans.defaultCallable = checks.defaultCallable;
    validation.booleans.singleCallableEnumerableExport = checks.singleCallableEnumerableExport;
    return validation;
  };
  const renderUserPopoutMarkers = ['"SENDING"===', 'renderUserGuildPopout: channel should never be'];
  const renderUserPopoutShape = value => {
    const source = getFunctionSourceFlags(value, renderUserPopoutMarkers);
    return source.callable && source.readable && source.flags.every(Boolean);
  };
  const messageContentMarkers = ['.isCommandType()', '.isFirstMessageInForumPost'];
  const messageContentShape = value => {
    const source = getDataPropertyFunctionSourceFlags(value, 'type', messageContentMarkers);
    return source.callable && source.readable && source.flags[0] && !source.flags[1];
  };
  const manaModalMarkers = ['actionBarInput', 'notice', 'caretConfig'];
  const manaModalShape = value => {
    const source = getFunctionSourceFlags(value, manaModalMarkers);
    return source.callable && source.readable && source.flags[0] && source.flags[1] && !source.flags[2];
  };
  const nativeMediaModalShape = value => nativeMediaModalAlternatives.some(alternative =>
    dataSourceMatches(value, alternative.searches)
  );
  const imageModalShape = value => imageModalAlternatives.some(alternative =>
    dataSourceMatches(value, [alternative.marker])
  );
  const trashIconShape = marker => value => dataSourceMatches(value, [marker]);
  const textModuleShape = value => {
    const checks = getOwnEnumerableCallableExportChecks(value, ['case"always-white"']);
    const firstExport = getFirstOwnEnumerableDataExport(value);
    return checks.sourceMatchedCallableCount > 0
      && checks.sourceReadFailures === 0
      && !checks.error
      && firstExport.present
      && firstExport.callable;
  };
  const userContextMenuShape = value => {
    const checks = getOwnEnumerableCallableExportChecks(value, ['isGroupDM', 'moderationAlertId']);
    return checks.sourceMatchedCallableCount === 1
      && checks.sourceReadFailures === 0
      && !checks.error;
  };
  const nativeDocumentMessageClassShape = value => callable(value)
    && dataPrototypeMethod(value, 'isPoll').ok
    && dataPrototypeMethod(value, 'hasFlag').ok;
  const nativeAudioPlayerShape = value => callable(value)
    && dataPrototypeMethod(value, 'renderAudio').ok
    && dataPrototypeMethod(value, 'renderVideo').ok
    && dataPrototypeMethod(value, 'renderControls').ok
    && dataPrototypeMethod(value, 'checkVideoDecodability').ok;
  const forumUploadRouteMarkers = ['castChannelIdAsMessageId', '.isForumPost()', '.ownerId', '.getCount('];
  const forumUploadRouteShape = value => {
    const checks = getOwnEnumerableCallableExportChecks(value, forumUploadRouteMarkers);
    return checks.sourceMatchedCallableCount === 1 && checks.sourceReadFailures === 0;
  };
  const userContextMenuMarkers = ['isGroupDM', 'targetIsUser'];
  const i18nShape = value => {
    const descriptors = getOwnDescriptors(value).descriptors;
    if (!descriptors) return false;
    const withFormatters = Reflect.ownKeys(descriptors).some(key => {
      const descriptor = descriptors[key];
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.value == null) return false;
      return hasDataPrototypeWithFormatters(descriptor.value).ok;
    });
    const intlFormat = dataReadPath(value, ['intl', 'format']);
    const translation = dataRead(value, 't');
    const translationMarker = dataRead(translation.value, 'C8sXIM');
    return withFormatters
      && intlFormat.ok
      && callable(intlFormat.value)
      && translation.ok
      && translation.value != null
      && translationMarker.ok
      && translationMarker.value != null;
  };
  return [
    store('UserStore', ['getCurrentUser', 'getUser', 'getUsers'], api => getStore(api, 'UserStore')),
    {
      name: 'MessageStore',
      expectedUniqueness: 'single canonical message store with edit consumers',
      select: api => getStore(api, 'MessageStore'),
      match: messageStoreShape,
      summaryOptions: { includeOwnKeys: false },
      validate: value => collectValidation({
        getMessage: dataCallable(value, 'getMessage').ok,
        getMessages: dataCallable(value, 'getMessages').ok,
        getLastEditableMessage: dataCallable(value, 'getLastEditableMessage').ok
      })
    },
    store('ChannelStore', ['getChannel', 'getDMFromUserId'], api => {
      const selected = getStore(api, 'ChannelStore');
      if (selected.value != null) return selected;
      const fallback = typeof api?.Webpack?.getByKeys === 'function'
        ? (() => {
          try { return { value: api.Webpack.getByKeys('getChannel', 'getDMFromUserId'), error: null }; } catch { return { value: null, error: 'Webpack.getByKeys-threw' }; }
        })()
        : { value: null, error: 'Webpack.getByKeys-unavailable' };
      return fallback;
    }),
    store('SelectedChannelStore', ['getChannelId'], api => getStore(api, 'SelectedChannelStore')),
    {
      name: 'GuildChannelStore',
      expectedUniqueness: 'single guild channel store',
      select: api => selectStoreThenGetStoreThenKeys(api, 'GuildChannelStore', ['getChannels', 'getDefaultChannel']),
      match: coreModuleFilter(['getChannels', 'getDefaultChannel']),
      summaryOptions: { includeOwnKeys: false },
      validate: value => collectValidation({
        getChannels: dataCallable(value, 'getChannels').ok,
        getDefaultChannel: dataCallable(value, 'getDefaultChannel').ok
      })
    },
    {
      name: 'ImageResolver',
      expectedUniqueness: 'single image resolver module',
      select: api => callWebpackMethod(api, 'getByKeys', ['getUserAvatarURL', 'getGuildIconURL']),
      match: coreModuleFilter(['getUserAvatarURL', 'getGuildIconURL']),
      validate: value => collectValidation({
        getUserAvatarURL: dataCallable(value, 'getUserAvatarURL').ok,
        getGuildIconURL: dataCallable(value, 'getGuildIconURL').ok
      })
    },
    store('SelectedGuildStore', ['getGuildId'], api => getStore(api, 'SelectedGuildStore')),
    {
      name: 'LocaleStore',
      expectedUniqueness: 'single locale store',
      select: api => {
        const direct = getStore(api, 'LocaleStore');
        if (direct.value != null) return direct;
        return callWebpackMethod(api, 'getStore', ['LocaleStore']);
      },
      match: value => dataPresent(value, 'locale').ok,
      summaryOptions: { includeOwnKeys: false },
      validate: value => collectValidation({
        selectedObject: value != null && (typeof value === 'object' || typeof value === 'function'),
        locale: dataPresent(value, 'locale').ok
      })
    },
    store('GuildStore', ['getGuild'], api => getStore(api, 'GuildStore')),
    store('GuildMemberStore', ['getMember'], api => getStore(api, 'GuildMemberStore')),
    {
      name: 'RelationshipStore',
      expectedUniqueness: 'single relationship store',
      select: api => {
        const direct = getStore(api, 'RelationshipStore');
        if (direct.value != null) return direct;
        return callWebpackMethod(api, 'getByKeys', ['isBlocked']);
      },
      match: coreModuleFilter(['isBlocked']),
      summaryOptions: { includeOwnKeys: false },
      validate: value => collectValidation({ isBlocked: dataCallable(value, 'isBlocked').ok })
    },
    {
      name: 'ChannelActions',
      expectedUniqueness: 'single channel action module with either update or select',
      select: api => {
        const primary = callWebpackMethod(api, 'getByKeys', ['deleteChannel', 'updateChannel']);
        if (primary.value != null || primary.error === 'Webpack.getByKeys-threw') return primary;
        return callWebpackMethod(api, 'getByKeys', ['deleteChannel', 'selectChannel']);
      },
      match: channelActionsShape,
      validate: value => collectValidation({
        deleteChannel: dataCallable(value, 'deleteChannel').ok,
        'updateChannel-or-selectChannel': dataCallable(value, 'updateChannel').ok || dataCallable(value, 'selectChannel').ok
      })
    },
    {
      name: 'ManaModal',
      expectedUniqueness: 'single callable Mana modal renderer',
      select: api => selectionFromFilter(api.Webpack, manaModalShape, { searchExports: true }),
      matchOptions: { searchExports: true },
      match: manaModalShape,
      validate: value => {
        const source = getFunctionSourceFlags(value, manaModalMarkers);
        return collectValidation({
          callable: source.callable,
          sourceReadable: source.readable,
          'source.actionBarInput': source.flags[0],
          'source.notice': source.flags[1],
          'source.notCaretConfig': !source.flags[2]
        });
      }
    },
    {
      name: 'ManaConfirmModal',
      expectedUniqueness: 'single callable ConfirmModal export',
      select: api => {
        const module = callWebpackMethod(api, 'getByKeys', ['ConfirmModal']);
        if (module.value == null) return module;
        const selected = dataRead(module.value, 'ConfirmModal');
        return {
          value: selected.ok ? selected.value : null,
          error: selected.ok ? null : selected.error
        };
      },
      match: value => dataCallable(value, 'ConfirmModal').ok,
      validate: value => collectValidation({ callable: callable(value) })
    },
    {
      name: 'ManaModalSize',
      expectedUniqueness: 'single module with all Mana modal sizes',
      select: api => callWebpackMethod(api, 'getByKeys', ['SMALL', 'MEDIUM', 'LARGE', 'DYNAMIC', { searchExports: true }]),
      matchOptions: { searchExports: true },
      match: value => ['SMALL', 'MEDIUM', 'LARGE', 'DYNAMIC'].every(key => dataPresent(value, key).ok),
      validate: value => collectValidation({
        SMALL: dataPresent(value, 'SMALL').ok,
        MEDIUM: dataPresent(value, 'MEDIUM').ok,
        LARGE: dataPresent(value, 'LARGE').ok,
        DYNAMIC: dataPresent(value, 'DYNAMIC').ok
      })
    },
    {
      name: 'ImageModalRenderLinkCandidate',
      expectedUniqueness: 'single callable render-link repair candidate',
      select: api => {
        const primaryModule = callWebpackMethod(api, 'getByKeys', ['defaultRenderLinkComponent']);
        if (primaryModule.value != null) {
          const primary = dataRead(primaryModule.value, 'defaultRenderLinkComponent');
          if (primary.ok && primary.value != null) {
            return {
              value: primary.value,
              selection: { semanticAlternative: 'defaultRenderLinkComponent' },
              error: null
            };
          }
        }
        const fallbackModule = callWebpackMethod(api, 'getByKeys', ['renderMaskedLinkComponent']);
        if (fallbackModule.value == null) return fallbackModule;
        const fallback = dataRead(fallbackModule.value, 'renderMaskedLinkComponent');
        return {
          value: fallback.ok ? fallback.value : null,
          selection: fallback.ok ? { semanticAlternative: 'renderMaskedLinkComponent' } : {},
          error: fallback.ok ? null : fallback.error
        };
      },
      match: value => dataCallable(value, 'defaultRenderLinkComponent').ok
        || dataCallable(value, 'renderMaskedLinkComponent').ok,
      validate: value => collectValidation({ callable: callable(value) })
    },
    {
      name: 'NativeMediaModal',
      expectedUniqueness: 'single native media modal export map',
      select: api => selectSourceMapAlternative(api, nativeMediaModalAlternatives, (value, alternative) => {
        const checks = getMediaExportMapChecks(value, alternative.marker);
        return {
          valid: checks.sourceMatchedCallableCount === 1
            && checks.nonemptyStringExportCount > 0
            && checks.sourceReadFailures === 0
            && !checks.error
        };
      }),
      rootMatch: true,
      match: nativeMediaModalShape,
      summaryOptions: { includeOwnKeys: false },
      validate: value => {
        const checks = getMediaExportAlternativeChecks(value, nativeMediaModalAlternatives);
        return collectValidation({
          exactlyOneSupportedAlternativeCallable: checks.sourceMatchedCallableCount === 1,
          nonemptyStringModalKey: checks.nonemptyStringExportCount > 0,
          sourceReadComplete: checks.sourceReadFailures === 0
        }, [checks.error, checks.sourceReadFailures ? 'callable-source-read-failed' : null].filter(Boolean));
      }
    },
    {
      name: 'ImageModal',
      expectedUniqueness: 'single image modal export map',
      select: api => selectSourceMapAlternative(api, imageModalAlternatives, (value, alternative) => {
        const checks = getMediaExportMapChecks(value, alternative.marker);
        return {
          valid: checks.sourceMatchedCallableCount === 1
            && checks.sourceReadFailures === 0
            && !checks.error
        };
      }),
      rootMatch: true,
      match: imageModalShape,
      summaryOptions: { includeOwnKeys: false },
      validate: imageModalValidation
    },
    {
      name: 'TrashIconPrimary',
      expectedUniqueness: 'single primary native trash icon source export',
      select: api => callWebpackMethod(api, 'getBySource', [trashIconPrimarySearch, { searchExports: true }]),
      rootMatch: true,
      match: trashIconShape(trashIconPrimarySearch),
      summaryOptions: { includeOwnKeys: false },
      validate: trashIconValidation
    },
    {
      name: 'TrashIconFallback',
      expectedUniqueness: 'single fallback native trash icon source export',
      select: api => callWebpackMethod(api, 'getBySource', [trashIconFallbackSearch, { searchExports: true }]),
      rootMatch: true,
      match: trashIconShape(trashIconFallbackSearch),
      summaryOptions: { includeOwnKeys: false },
      validate: trashIconValidation
    },
    {
      name: 'NativeDocumentMessageClass',
      expectedUniqueness: 'single native document message class',
      select: api => selectionFromFilter(api.Webpack, nativeDocumentMessageClassShape, { searchExports: true }),
      matchOptions: { searchExports: true },
      match: nativeDocumentMessageClassShape,
      validate: value => collectValidation({
        callable: callable(value),
        'prototype.isPoll': dataPrototypeMethod(value, 'isPoll').ok,
        'prototype.hasFlag': dataPrototypeMethod(value, 'hasFlag').ok
      })
    },
    {
      name: 'NativeAudioPlayer',
      expectedUniqueness: 'single native audio player class',
      select: api => selectionFromFilter(api.Webpack, nativeAudioPlayerShape, { searchExports: true }),
      matchOptions: { searchExports: true },
      match: nativeAudioPlayerShape,
      validate: value => collectValidation({
        callable: callable(value),
        'prototype.renderAudio': dataPrototypeMethod(value, 'renderAudio').ok,
        'prototype.renderVideo': dataPrototypeMethod(value, 'renderVideo').ok,
        'prototype.renderControls': dataPrototypeMethod(value, 'renderControls').ok,
        'prototype.checkVideoDecodability': dataPrototypeMethod(value, 'checkVideoDecodability').ok
      })
    },
    {
      name: 'ForumUploadAsReplyRouteModule',
      expectedUniqueness: 'single forum upload route module with one source-matched export',
      select: api => selectionFromFilter(api.Webpack, forumUploadRouteShape, { searchExports: false }),
      rootMatch: true,
      match: forumUploadRouteShape,
      validate: value => {
        const checks = getOwnEnumerableCallableExportChecks(value, forumUploadRouteMarkers);
        return collectValidation({
          exactlyOneSourceMatchedCallable: checks.sourceMatchedCallableCount === 1,
          sourceReadComplete: checks.sourceReadFailures === 0
        }, [checks.error, checks.sourceReadFailures ? 'callable-source-read-failed' : null].filter(Boolean));
      }
    },
    {
      name: 'DiscordUtils',
      expectedUniqueness: 'single Discord utility module',
      select: api => callWebpackMethod(api, 'getByKeys', ['bindAll', 'debounce']),
      match: coreModuleFilter(['bindAll', 'debounce']),
      validate: value => collectValidation({
        bindAll: dataCallable(value, 'bindAll').ok,
        debounce: dataCallable(value, 'debounce').ok
      })
    },
    {
      name: 'TimestampUtils',
      expectedUniqueness: 'single callable timestamp utility with one supported shape',
      select: api => {
        const primary = callWebpackMethod(api, 'getByKeys', ['relativeTimeRounding', 'locales']);
        if (primary.value != null || primary.error === 'Webpack.getByKeys-threw') return primary;
        return callWebpackMethod(api, 'getByKeys', ['createFromInputFallback']);
      },
      match: timestampUtilsShape,
      validate: value => collectValidation({
        selectedCallable: callable(value),
        'relativeTimeRounding-and-locales-or-createFromInputFallback': timestampPrimaryShape(value) || timestampFallbackShape(value)
      })
    },
    {
      name: 'Parser',
      expectedUniqueness: 'single parser module',
      select: api => callWebpackMethod(api, 'getByKeys', ['parse', 'astParserFor']),
      match: coreModuleFilter(['parse', 'astParserFor']),
      validate: value => collectValidation({
        parse: dataCallable(value, 'parse').ok,
        astParserFor: dataCallable(value, 'astParserFor').ok
      })
    },
    {
      name: 'ParserNew',
      expectedUniqueness: 'single parser module with default rules',
      select: api => callWebpackMethod(api, 'getByKeys', ['defaultRules', 'parse']),
      match: value => dataPresent(value, 'defaultRules').ok && dataCallable(value, 'parse').ok,
      validate: value => collectValidation({
        defaultRules: dataPresent(value, 'defaultRules').ok,
        parse: dataCallable(value, 'parse').ok
      })
    },
    {
      name: 'GuildUtils',
      expectedUniqueness: 'single guild utility module',
      select: api => callWebpackMethod(api, 'getByKeys', ['getGuild', 'getGuildCount']),
      match: coreModuleFilter(['getGuild', 'getGuildCount']),
      validate: value => collectValidation({
        getGuild: dataCallable(value, 'getGuild').ok,
        getGuildCount: dataCallable(value, 'getGuildCount').ok
      })
    },
    {
      name: 'MuteModule',
      expectedUniqueness: 'single mute module with both consumer predicates',
      select: api => selectionFromFilter(api.Webpack, value => dataCallable(value, 'isChannelMuted').ok),
      match: muteModuleShape,
      validate: value => collectValidation({
        isChannelMuted: dataCallable(value, 'isChannelMuted').ok,
        isMuted: dataCallable(value, 'isMuted').ok
      })
    },
    {
      name: 'ChannelMessages',
      expectedUniqueness: 'single channel message cache module',
      select: api => selectionFromFilter(api.Webpack, value => dataPresent(value, '_channelMessages').ok),
      match: value => dataPresent(value, '_channelMessages').ok,
      validate: value => {
        const mapping = dataRead(value, '_channelMessages');
        return collectValidation({
          _channelMessages: mapping.ok && mapping.value != null,
          usableMapping: mapping.ok && mapping.value != null
            && (typeof mapping.value === 'object' || typeof mapping.value === 'function')
        });
      }
    },
    {
      name: 'ChannelListModule',
      expectedUniqueness: 'single channel list module',
      select: api => callWebpackMethod(api, 'getByKeys', ['getChannels']),
      match: coreModuleFilter(['getChannels']),
      validate: value => collectValidation({ getChannels: dataCallable(value, 'getChannels').ok })
    },
    {
      name: 'SystemLocaleUtils',
      expectedUniqueness: 'single system locale utility module',
      select: api => callWebpackMethod(api, 'getByKeys', ['getSystemLocale', { searchExports: true }]),
      matchOptions: { searchExports: true },
      match: coreModuleFilter(['getSystemLocale']),
      validate: value => collectValidation({ getSystemLocale: dataCallable(value, 'getSystemLocale').ok })
    },
    {
      name: 'RenderUserPopout',
      expectedUniqueness: 'single callable user popout renderer',
      select: api => callWebpackMethod(api, 'getByStrings', renderUserPopoutMarkers),
      match: renderUserPopoutShape,
      validate: value => {
        const source = getFunctionSourceFlags(value, renderUserPopoutMarkers);
        return collectValidation({
          callable: source.callable,
          sourceReadable: source.readable,
          'source."SENDING"===': source.flags[0],
          'source.renderUserGuildPopout': source.flags[1]
        });
      }
    },
    {
      name: 'MessageContentComponent',
      expectedUniqueness: 'single command-aware message content component',
      select: api => selectionFromFilter(api.Webpack, value => messageContentShape(value)),
      match: messageContentShape,
      validate: value => {
        const source = getDataPropertyFunctionSourceFlags(value, 'type', messageContentMarkers);
        return collectValidation({
          'type.callable': source.callable,
          'type.sourceReadable': source.readable,
          'type.source.isCommandType': source.flags[0],
          'type.source.notFirstMessageInForumPost': !source.flags[1]
        });
      }
    },
    {
      name: 'MessageAccessories',
      expectedUniqueness: 'single message accessories class with embed and attachment renderers',
      select: api => selectionFromFilter(api.Webpack, value => callable(value)
        && dataPrototypeMethod(value, 'renderEmbeds').ok
        && dataPrototypeMethod(value, 'renderAttachments').ok, { searchExports: true }),
      matchOptions: { searchExports: true },
      match: value => callable(value)
        && dataPrototypeMethod(value, 'renderEmbeds').ok
        && dataPrototypeMethod(value, 'renderAttachments').ok,
      validate: value => {
        const validation = collectValidation({
          callable: callable(value),
          'prototype.renderEmbeds': dataPrototypeMethod(value, 'renderEmbeds').ok,
          'prototype.renderAttachments': dataPrototypeMethod(value, 'renderAttachments').ok,
          'loadEntry.lazyEntryShape': hasBetterDiscordLazyEntryShape(value)
        });
        return validation;
      }
    },
    {
      name: 'TextModule',
      expectedUniqueness: 'single source-matched text export map with callable candidate',
      select: api => callWebpackMethod(api, 'getBySource', ['case"always-white"', { searchExports: true }]),
      rootMatch: true,
      match: textModuleShape,
      validate: value => {
        const checks = getOwnCallableExportChecks(value);
        const firstExport = getFirstOwnEnumerableDataExport(value);
        return collectValidation({
          boundedOwnDataExports: checks.boundedOwnDataExportCount > 0,
          callableExportCandidate: checks.callableExportCount > 0,
          firstEnumerableDataExportPresent: firstExport.present,
          firstEnumerableDataExportCallable: firstExport.callable
        }, [checks.error, firstExport.error].filter(Boolean));
      }
    },
    {
      name: 'UserContextMenuModule',
      expectedUniqueness: 'single source-matched user context menu export',
      select: api => callWebpackMethod(api, 'getBySource', ['isGroupDM', 'moderationAlertId', { searchExports: true }]),
      rootMatch: true,
      match: userContextMenuShape,
      validate: value => {
        const checks = getOwnEnumerableCallableExportChecks(value, userContextMenuMarkers);
        return collectValidation({
          exactlyOneCallableExport: checks.sourceMatchedCallableCount === 1,
          sourceReadComplete: checks.sourceReadFailures === 0
        }, [checks.error, checks.sourceReadFailures ? 'callable-source-read-failed' : null].filter(Boolean));
      }
    },
    {
      name: 'MessageActions',
      expectedUniqueness: 'single action module with required consumer shape',
      select: api => {
        try {
          return { value: api?.Webpack?.getByKeys?.('sendMessage', 'editMessage', 'deleteMessage'), error: null };
        } catch {
          return { value: null, error: 'Webpack.getByKeys-threw' };
        }
      },
      match: messageActionsShape,
      validate: value => {
        const core = ['sendMessage', 'editMessage', 'deleteMessage'];
        const consumer = ['startEditMessage', 'fetchMessages'];
        const booleans = Object.fromEntries([
          ...core.map(key => [key, dataCallable(value, key).ok]),
          ...consumer.map(key => [`consumer.${key}`, dataCallable(value, key).ok])
        ]);
        const validation = collectValidation(booleans);
        return validation;
      }
    },
    {
      name: 'HistoryUtils',
      expectedUniqueness: 'single history utility module',
      select: api => callWebpackMethod(api, 'getByKeys', ['getHistory']),
      match: coreModuleFilter(['getHistory']),
      validate: value => collectValidation({ getHistory: dataCallable(value, 'getHistory').ok })
    },
    {
      name: 'HttpModule',
      expectedUniqueness: 'single HTTP module with delete alias',
      select: api => {
        const primary = callWebpackMethod(api, 'getByKeys', ['get', 'post', 'put', 'del']);
        if (primary.value != null || primary.error === 'Webpack.getByKeys-threw') return primary;
        return callWebpackMethod(api, 'getByKeys', ['get', 'post', 'put', 'delete']);
      },
      match: httpModuleShape,
      validate: value => collectValidation({
        get: dataCallable(value, 'get').ok,
        post: dataCallable(value, 'post').ok,
        put: dataCallable(value, 'put').ok,
        'del-or-delete': dataCallable(value, 'del').ok || dataCallable(value, 'delete').ok
      })
    },
    {
      name: 'Endpoints',
      expectedUniqueness: 'single endpoints/action types module',
      select: api => callWebpackMethod(api, 'getByKeys', ['Endpoints', 'ActionTypes']),
      match: value => dataPresent(value, 'Endpoints').ok && dataPresent(value, 'ActionTypes').ok,
      validate: value => collectValidation({
        Endpoints: dataPresent(value, 'Endpoints').ok,
        ActionTypes: dataPresent(value, 'ActionTypes').ok
      })
    },
    {
      name: 'Dispatcher',
      expectedUniqueness: 'single UserStore dispatcher',
      select: api => {
        const userStore = getStore(api, 'UserStore');
        const dispatcher = dataRead(userStore.value, '_dispatcher');
        return { value: dispatcher.ok ? dispatcher.value : null, error: dispatcher.error };
      },
      match: coreModuleFilter(['dispatch', 'subscribe']),
      validate: value => collectValidation({ dispatch: dataCallable(value, 'dispatch').ok, subscribe: dataCallable(value, 'subscribe').ok })
    },
    {
      name: 'ModalActions',
      expectedUniqueness: 'single modal action module with store subscription',
      select: api => {
        try {
          return { value: api?.Webpack?.getByKeys?.('openModal', 'hasModalOpen'), error: null };
        } catch {
          return { value: null, error: 'Webpack.getByKeys-threw' };
        }
      },
      match: modalActionsShape,
      validate: value => {
        const store = dataRead(value, 'useModalsStore');
        return collectValidation({
          openModal: dataCallable(value, 'openModal').ok,
          hasModalOpen: dataCallable(value, 'hasModalOpen').ok,
          closeModal: dataCallable(value, 'closeModal').ok,
          useModalsStore: store.ok && store.value != null,
          'useModalsStore.subscribe': dataCallable(store.value, 'subscribe').ok
        });
      }
    },
    {
      name: 'CUser',
      expectedUniqueness: 'single class with both prototype methods',
      select: api => selectionFromFilter(api.Webpack, value => callable(value)
        && dataPrototypeMethod(value, 'getAvatarSource').ok
        && dataPrototypeMethod(value, 'isLocalBot').ok),
      match: value => callable(value)
        && dataPrototypeMethod(value, 'getAvatarSource').ok
        && dataPrototypeMethod(value, 'isLocalBot').ok,
      validate: value => collectValidation({
        callable: callable(value),
        'prototype.getAvatarSource': dataPrototypeMethod(value, 'getAvatarSource').ok,
        'prototype.isLocalBot': dataPrototypeMethod(value, 'isLocalBot').ok
      })
    },
    {
      name: 'GetSrcModule',
      expectedUniqueness: 'single source module with exactly one callable export',
      select: api => {
        try {
          return { value: api?.Webpack?.getBySource?.('sourceMetadata:', 'getSrc', { searchExports: true }), error: null };
        } catch {
          return { value: null, error: 'Webpack.getBySource-threw' };
        }
      },
      matchOptions: { searchExports: true },
      match: value => {
        const checks = getGetSrcCallableExportChecks(value);
        return checks.sourceMatchedCallableExports === 1 && checks.sourceMatchedPrototypeGetSrc === 1;
      },
      validate: value => {
        const checks = getGetSrcCallableExportChecks(value);
        return collectValidation({
          'sourceMetadata:': checks.sourceMetadataMatches === 1,
          getSrc: checks.getSrcMatches === 1,
          exactlyOneSourceMatchedCallable: checks.sourceMatchedCallableExports === 1,
          sourceMatchedCallablePrototypeGetSrc: checks.sourceMatchedPrototypeGetSrc === 1,
          sourceReadComplete: checks.sourceReadFailures === 0
        }, [checks.error, checks.sourceReadFailures ? 'callable-source-read-failed' : null].filter(Boolean));
      }
    },
    {
      name: 'I18nModule',
      expectedUniqueness: 'single internationalization module',
      select: api => {
        const filter = value => {
          const descriptors = getOwnDescriptors(value).descriptors;
          if (!descriptors) return false;
          return Reflect.ownKeys(descriptors).some(key => {
            const descriptor = descriptors[key];
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.value == null) return false;
            return hasDataPrototypeWithFormatters(descriptor.value).ok;
          });
        };
        return selectionFromFilter(api.Webpack, filter);
      },
      match: i18nShape,
      validate: value => {
        const descriptors = getOwnDescriptors(value).descriptors;
        let withFormatters = false;
        if (descriptors) {
          withFormatters = Reflect.ownKeys(descriptors).some(key => {
            const descriptor = descriptors[key];
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value') || descriptor.value == null) return false;
            return hasPrototypeWithFormatters(descriptor.value).ok;
          });
        }
        const intlFormat = dataReadPath(value, ['intl', 'format']);
        const translation = dataRead(value, 't');
        const translationMarker = dataRead(translation.value, 'C8sXIM');
        return collectValidation({
          'prototype.withFormatters': withFormatters,
          'intl.format': intlFormat.ok && callable(intlFormat.value),
          t: translation.ok && translation.value != null,
          't.C8sXIM': translationMarker.ok && translationMarker.value != null
        }, descriptors ? [] : ['own-descriptors-unavailable']);
      }
    }
  ];
}

module.exports = class MessageLoggerRuntimeCompatibilityAudit {
  constructor() {
    this.api = null;
    this.dumpPromise = null;
    this.active = false;
    this.dumpGeneration = 0;
    this.loadEntryAttempted = false;
    this.bdApi = new BdApi(PLUGIN_NAME);
    const plugins = this.bdApi?.Plugins || BdApi?.Plugins;
    if (typeof plugins?.folder !== 'string' || !plugins.folder) throw new Error(`${PLUGIN_NAME}: Plugins.folder is unavailable`);
    this.reportPath = path.join(plugins.folder, REPORT_FILE_NAME);
    const instanceToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    this.temporaryPath = path.join(plugins.folder, `${PLUGIN_NAME}-${instanceToken}.tmp`);
    this.host = typeof window === 'object' && window ? window : globalThis;
  }

  start() {
    this.active = true;
    this.dumpGeneration += 1;
    this.api = {
      dump: (label, options) => this.dump(label, options),
      reportPath: this.reportPath,
      clear: () => this.clear()
    };
    this.host[PLUGIN_NAME] = this.api;
    const instruction = `[${PLUGIN_NAME}] Ready. Run await window.${PLUGIN_NAME}.dump("manual") to write the sanitized compatibility report; call .clear() to remove it.`;
    try { console.info(instruction); } catch {}
    try { this.bdApi.UI?.showToast?.(instruction, { type: 'info', timeout: 6000 }); } catch {}
  }

  stop() {
    this.active = false;
    this.dumpGeneration += 1;
    if (this.host?.[PLUGIN_NAME] === this.api) delete this.host[PLUGIN_NAME];
    this.api = null;
    this.dumpPromise = null;
    try { if (fs.existsSync(this.temporaryPath)) fs.unlinkSync(this.temporaryPath); } catch {}
  }

  clear() {
    this.dumpGeneration += 1;
    this.dumpPromise = null;
    let cleanupSucceeded = true;
    try {
      if (fs.existsSync(this.temporaryPath)) fs.unlinkSync(this.temporaryPath);
    } catch {
      cleanupSucceeded = false;
    }
    try {
      if (fs.existsSync(this.reportPath)) fs.unlinkSync(this.reportPath);
    } catch {
      cleanupSucceeded = false;
    }
    return cleanupSucceeded;
  }

  dump(label = 'manual', options = {}) {
    if (this.dumpPromise) return this.dumpPromise;
    const safeDumpLabel = safeLabel(label);
    const normalizedOptions = normalizeDumpOptions(options);
    const generation = this.dumpGeneration;
    const activeAtStart = this.active;
    const task = Promise.resolve().then(async () => {
      const report = await this.buildReport(safeDumpLabel, normalizedOptions, {
        loadEntryAttempted: this.loadEntryAttempted,
        onAttempt: () => { this.loadEntryAttempted = true; }
      });
      if (!activeAtStart || !this.active || this.dumpGeneration !== generation) throw new Error('audit-dump-cancelled');
      this.writeAtomically(report, generation);
      return report;
    });
    const promise = task.finally(() => {
      if (this.dumpPromise === promise) this.dumpPromise = null;
    });
    this.dumpPromise = promise;
    return promise;
  }

  writeAtomically(report, generation) {
    const temporaryPath = this.temporaryPath;
    const cancelled = () => new Error('audit-dump-cancelled');
    if (!this.active || this.dumpGeneration !== generation) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
      throw cancelled();
    }
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });
      if (!this.active || this.dumpGeneration !== generation) {
        try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
        throw cancelled();
      }
      fs.renameSync(temporaryPath, this.reportPath);
    } catch (error) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
      throw error;
    }
  }

  scanLoadedModules() {
    const api = this.bdApi?.Webpack;
    const moduleIds = [];
    const seenModuleIds = new Set();
    const seenRoots = new Set();
    const errors = [];
    let candidateCardinality = 0;
    if (typeof api?.getModules !== 'function') {
      return { loadedRootCount: 0, candidateCardinality, moduleIds, errors: ['Webpack.getModules-unavailable'], truncated: false };
    }
    try {
      api.getModules((value, module, moduleId) => {
        const moduleIdValue = getModuleIdValue(moduleId, module);
        const rootIdentity = module !== null && (typeof module === 'object' || typeof module === 'function')
          ? module
          : moduleIdValue !== null && moduleIdValue !== undefined
            ? `module-id:${internalPathIdentity(moduleIdValue)}`
            : value !== null && (typeof value === 'object' || typeof value === 'function')
              ? value
              : `primitive:${internalPathIdentity(moduleIdValue)}`;
        if (seenRoots.has(rootIdentity)) return false;
        seenRoots.add(rootIdentity);
        candidateCardinality = seenRoots.size;
        const safeModuleId = sanitizeModuleId(moduleIdValue);
        if (safeModuleId !== null && !seenModuleIds.has(safeModuleId)) {
          seenModuleIds.add(safeModuleId);
          if (moduleIds.length < MAX_CANDIDATE_RECORDS) moduleIds.push(safeModuleId);
        }
        return false;
      }, { searchExports: false, searchDefault: false });
    } catch {
      errors.push('Webpack.getModules-threw');
    }
    return {
      loadedRootCount: candidateCardinality,
      candidateCardinality,
      moduleIds,
      errors,
      truncated: candidateCardinality > MAX_CANDIDATE_RECORDS
    };
  }

  async buildReport(label, options = {}, transitionControl = {}) {
    const normalizedOptions = normalizeDumpOptions(options);
    const assetPromise = describeFixedRendererAssetContract(normalizedOptions.externalAssets);
    const transitionPromise = describeOptionalLoadEntryTransition(
      this.bdApi,
      normalizedOptions,
      transitionControl.loadEntryAttempted === true,
      transitionControl.onAttempt
    );
    const host = getHostContract(this.bdApi);
    const platform = getPlatformContract();
    const dom = describeCommonDomContract();
    const contracts = [
      { name: 'HostCapabilities', ...host },
      { name: 'PlatformCapabilities', ...platform },
      { name: 'Dom.CommonSurfaces', ...dom },
      { name: 'Dom.ForumThreadSurfaces', ...describeForumThreadDomContract() },
      { name: 'LoggerOwned.Styles', ...describeLoggerOwnedStyleContract(this.bdApi) },
      { name: 'LoggerOwned.MountMarkers', ...describeLoggerOwnedMountContract() },
      { name: 'LoggerIntegration.RenderLinkComponent', ...describeLoggerIntegrationRenderLinkComponent(this.bdApi) }
    ];
    const assetContract = await assetPromise;
    const transitionContract = await transitionPromise;
    const scanner = this.scanLoadedModules();
    const moduleResults = moduleContracts().map(contract => ({ name: contract.name, ...describeContract(this.bdApi, contract) }));
    const cssResults = semanticCssContracts().map(contract => ({ name: contract.name, ...describeSemanticCssContract(this.bdApi, contract) }));
    contracts.push(
      { name: 'Assets.FixedRenderer', ...assetContract },
      { name: 'Webpack.OptionalLoadEntryTransition', ...transitionContract },
      ...moduleResults,
      ...cssResults
    );
    const totals = { pass: 0, warn: 0, fail: 0, total: contracts.length };
    for (const contract of contracts) totals[contract.status] += 1;
    return {
      schemaVersion: 1,
      label: safeLabel(label),
      options: normalizedOptions,
      generatedAt: new Date().toISOString(),
      scanner: {
        api: 'BdApi.Webpack public APIs',
        loadedRootCount: scanner.loadedRootCount,
        candidateCardinality: scanner.candidateCardinality,
        moduleIds: scanner.moduleIds,
        truncated: scanner.truncated,
        errors: scanner.errors
      },
      contracts,
      totals
    };
  }
};
