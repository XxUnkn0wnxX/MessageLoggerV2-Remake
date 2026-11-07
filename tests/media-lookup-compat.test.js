const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createPlugin, resetHarness, Webpack } = require('./helpers/plugin-harness');

const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
const audit = fs.readFileSync(path.join(__dirname, '..', 'tools/MessageLoggerRuntimeCompatibilityAudit.plugin.js'), 'utf8');
const helper = source.slice(source.indexOf('function findCurrentImageComponent('), source.indexOf('function normalizeModalActions('));
const method = source.slice(source.indexOf('      findImageModal() {'), source.indexOf('      manaModule:', source.indexOf('      findImageModal() {')));
const auditEnd = audit.indexOf('module.exports = class');
assert.ok(helper && method && auditEnd > 0);

class LegacyAudio { renderAudio() {} renderVideo() {} renderControls() {} checkVideoDecodability() {} }
class CurrentAudio { renderAudio() {} renderVideo() {} renderControls() {} play() { return this._analytics.checkVideoDecodability(); } }
class UnrelatedAudio { renderAudio() {} renderVideo() {} renderControls() {} }
class CurrentImage { render() { return 'zoomThumbnailPlaceholder'; } getSrc() {} }
class UnrelatedImage { render() {} getSrc() {} }
function LegacyImage() { return 'renderMobileCloseButton'; }

function mockWebpack(owners, legacy = {}) {
  return {
    calls: [],
    getBySource(pattern) { return legacy[pattern] ?? null; },
    getModule(filter, options) {
      this.calls.push(options);
      return owners.find(value => { try { return filter(value); } catch { return false; } }) ?? null;
    },
    getModules(filter) { for (const value of owners) filter(value, { exports: value }, 1); return []; }
  };
}
function imageTools(webpack) {
  return vm.runInNewContext(`${helper}\n({ _imageModal: null, ${method} })`, {
    Webpack: webpack, Logger: { log() {}, error() {} }
  });
}
function auditContract(webpack, name) {
  return vm.runInNewContext(`${audit.slice(0, auditEnd)}\ndescribeContract(api, moduleContracts().find(c => c.name === name));`, {
    require, api: { Webpack: webpack }, name
  });
}

test('production audio recognizes legacy and analytics implementations, rejecting unsafe lookalikes', () => {
  const plugin = createPlugin();
  const sourceThrows = class extends UnrelatedAudio {};
  sourceThrows.toString = () => { throw Error('source'); };
  const getterThrows = class {};
  Object.defineProperty(getterThrows.prototype, 'renderAudio', { get() { throw Error('getter'); } });
  for (const value of [LegacyAudio, CurrentAudio]) assert.equal(plugin.isLoggerNativeAudioPlayer(value), true);
  for (const value of [UnrelatedAudio, sourceThrows, getterThrows]) assert.equal(plugin.isLoggerNativeAudioPlayer(value), false);
  Webpack.getModule = filter => [UnrelatedAudio, CurrentAudio].find(filter);
  assert.strictEqual(plugin.resolveLoggerNativeAudioPlayer(), CurrentAudio);
  assert.strictEqual(plugin.resolveLoggerNativeAudioPlayer(), CurrentAudio);
  resetHarness();
});

test('image fallback skips shadowing owners and unsafe exports, caches actual component and retries misses', () => {
  const badSource = class extends CurrentImage {};
  badSource.toString = () => { throw Error('source'); };
  const owner = { badSource, unrelated: UnrelatedImage, current: CurrentImage };
  Object.defineProperty(owner, 'badGetter', { get() { throw Error('getter'); } });
  const owners = [];
  const webpack = mockWebpack(owners, { zoomThumbnailPlaceholder: { shadow: UnrelatedImage } });
  const tools = imageTools(webpack);
  assert.equal(tools.findImageModal(), null);
  owners.push(owner);
  assert.strictEqual(tools.findImageModal(), CurrentImage);
  assert.strictEqual(tools.findImageModal(), CurrentImage);
  assert.equal(webpack.calls.length, 2);
  assert.equal(webpack.calls[1].searchExports, false);
  assert.equal(webpack.calls[1].searchDefault, false);
});

test('image legacy selected export wins over current fallback', () => {
  const webpack = mockWebpack([{ current: CurrentImage }], { renderMobileCloseButton: { legacy: LegacyImage } });
  assert.strictEqual(imageTools(webpack).findImageModal(), LegacyImage);
  assert.equal(webpack.calls.length, 0);
});

test('audit accepts both audio contracts and the shadowed current image component', () => {
  for (const value of [LegacyAudio, CurrentAudio]) {
    const contract = auditContract(mockWebpack([value]), 'NativeAudioPlayer');
    assert.equal(contract.validation.ok, true);
  }
  const audio = auditContract(mockWebpack([UnrelatedAudio]), 'NativeAudioPlayer');
  assert.equal(audio.validation.ok, false);
  const image = auditContract(mockWebpack([{ current: CurrentImage }], { zoomThumbnailPlaceholder: { shadow: UnrelatedImage } }), 'ImageModal');
  assert.equal(image.validation.ok, true);
  assert.equal(image.selected.type, 'function');
});
