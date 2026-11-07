const assert = require('node:assert/strict');
const test = require('node:test');
const { createPlugin, resetHarness } = require('./helpers/plugin-harness');

function fixture(cached) {
  resetHarness();
  const attachment = {
    id: 'image', filename: 'photo.png',
    url: 'https://cdn.discordapp.com/attachments/channel/image/photo.png?sig=old#one',
    proxy_url: 'https://media.discordapp.net/attachments/channel/image/photo.png?sig=old#one'
  };
  const message = { id: 'message', channel_id: 'channel', attachments: [attachment] };
  const record = { message, delete_data: { time: 1 } };
  const plugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    messageRecord: { message: record },
    imageCacheServerSimulator: { _resolveImagePath: () => '/cache/photo.png', get: () => cached ? 'blob://local/photo' : null },
    remountSavedAttachmentPresentationRecords() {}, scheduleLoggerMenuRefresh() {}
  });
  return { attachment, message, plugin };
}
function exhaust(plugin, attachment, message) {
  const initial = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  for (const url of initial.sources) assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, url), true);
  return plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
}

test('a fresh query or fragment retries under the same IDs after prior exhaustion', () => {
  for (const change of ['query', 'fragment']) {
    const { plugin, attachment, message } = fixture(false);
    assert.equal(exhaust(plugin, attachment, message).action, 'omit');
    const oldProxy = attachment.proxy_url;
    attachment.url = change === 'query' ? attachment.url.replace('sig=old', 'sig=new') : attachment.url.replace('#one', '#two');
    const fresh = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
    assert.equal(fresh.action, 'remote');
    assert.equal(fresh.url, attachment.url);
    assert.equal(fresh.fallbackUrl, null, 'unchanged failed proxy remains failed');
    assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, attachment.url), true);
    assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, oldProxy), false);
    assert.equal(plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true }).action, 'omit');
  }
});

test('a failed local Blob never blocks a fresh remote URL but remains an invalid fallback', () => {
  const { plugin, attachment, message } = fixture(true);
  const exhausted = exhaust(plugin, attachment, message);
  assert.equal(exhausted.action, 'blob');
  const descriptor = plugin.getSavedAttachmentDescriptor(attachment, message);
  const failure = plugin.coordinateSavedAttachmentMediaFailure(descriptor, exhausted.url);
  assert.equal(failure.recordedFailure, true);
  attachment.url = attachment.url.replace('sig=old', 'sig=new');
  const fresh = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(fresh.action, 'remote');
  assert.equal(fresh.url, attachment.url);
  assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, attachment.url), true);
  const terminal = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(terminal.action, 'omit');
  assert.equal(terminal.unavailableReason, 'local-failed');
  plugin.settings.onlyRenderCachedAttachments = true;
  const localOnly = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowBlob: true });
  assert.equal(localOnly.action, 'omit');
  plugin.settings.cacheAllImages = false;
  assert.equal(plugin.getSavedAttachmentPresentationPlan(attachment, message, {}).action, 'placeholder');
});

test('fully replaced candidates retain unrelated failure keys and can fail in turn', () => {
  const { plugin, attachment, message } = fixture(false);
  assert.equal(exhaust(plugin, attachment, message).action, 'omit');
  plugin._failedNativeAttachmentMediaCandidateKeys.add('unrelated:preserved');
  attachment.url = 'https://cdn.discordapp.com/attachments/channel/image/new.png?sig=fresh#new';
  attachment.proxy_url = 'https://media.discordapp.net/attachments/channel/image/new.png?sig=fresh#new';
  const fresh = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(fresh.url, attachment.url);
  assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, fresh.url), true);
  const proxy = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(proxy.url, attachment.proxy_url);
  assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, proxy.url), true);
  assert.equal(plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true }).action, 'omit');
  assert.equal(plugin._failedNativeAttachmentMediaCandidateKeys.has('unrelated:preserved'), true);
});

test('legacy terminal-only flag still represents a whole-media failure', () => {
  const { plugin, attachment, message } = fixture(false);
  const key = plugin.getSavedAttachmentMediaFailureKey(message.channel_id, message.id, attachment.id);
  plugin._failedNativeAttachmentMediaKeys = new Set([key]);
  const plan = plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true });
  assert.equal(plan.action, 'omit');
  assert.equal(plan.unavailableReason, 'remote-failed');
  assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, attachment.url), false);
});


test('candidate lookups do not iterate the unrelated failure history', () => {
  const { plugin, attachment, message } = fixture(false);
  class NonIterableFailures extends Set {
    [Symbol.iterator]() { throw Error('failure history must not be scanned'); }
  }
  const failures = new NonIterableFailures();
  for (let index = 0; index < 2000; index++) failures.add(`unrelated:${index}`);
  plugin._failedNativeAttachmentMediaCandidateKeys = failures;
  assert.equal(exhaust(plugin, attachment, message).action, 'omit');
  assert.equal(plugin._failedNativeAttachmentMediaKeys?.size || 0, 0);
  attachment.url = attachment.url.replace('sig=old', 'sig=new');
  assert.equal(plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true }).url, attachment.url);
  assert.equal(plugin.markSavedAttachmentMediaCandidateFailure(attachment, message, attachment.url), true);
  assert.equal(plugin.getSavedAttachmentPresentationPlan(attachment, message, { allowRemote: true }).action, 'omit');
});
