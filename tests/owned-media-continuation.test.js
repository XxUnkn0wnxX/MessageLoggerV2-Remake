const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPlugin: standardPlugin, resetHarness, loggerEvents, ReactDOM, Webpack } = require('./helpers/plugin-harness');
const alternatePath = process.env.MLV2_OWNED_BASELINE;
const RuntimePlugin = alternatePath ? require(alternatePath) : null;
const createPlugin = overrides => RuntimePlugin ? Object.assign(new RuntimePlugin({ name: 'MessageLoggerV2', version: 'test' }), overrides) : standardPlugin(overrides);

function fixture(kind, cached = true, localOnly = false) {
  const current = kind === 'audio'
    ? { id: 'current', filename: 'current.mp3', url: 'https://cdn.discordapp.com/attachments/c/current.mp3?sig=one', proxy_url: 'https://media.discordapp.net/attachments/c/current.mp3?sig=one' }
    : { id: 'current', filename: 'current.png', url: 'https://cdn.discordapp.com/attachments/c/current.png?sig=one#part', proxy_url: 'https://media.discordapp.net/attachments/c/current.png?sig=one#part' };
  const removed = { id: 'removed', filename: 'removed.mp4', url: 'https://cdn.discordapp.com/attachments/c/removed.mp4?sig=one', proxy_url: 'https://media.discordapp.net/attachments/c/removed.mp4?sig=one' };
  const sticker = { id: 'sticker', name: 'sticker', format_type: 1 };
  const message = { id: 'm', channel_id: 'c', attachments: [current], sticker_items: [sticker] };
  const record = { message, delete_data: null, edit_history: [], removed_attachments: [removed] };
  const plugin = createPlugin({
    messageRecord: { m: record }, settings: { cacheAllImages: true, onlyRenderCachedAttachments: localOnly },
    imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => cached ? 'blob://local/file' : null },
    dispatcher: { dispatch() { throw Error('unexpected dispatch'); } }, cacheChannelMessages() { throw Error('unexpected fetch'); }
  });
  const entries = plugin.getLoggerSavedAttachmentPresentationEntries(message, record);
  const entry = entries.find(item => kind === 'sticker' ? item.sourceKind === 'sticker' : kind === 'removed' ? item.removed : item.attachment.id === 'current');
  assert.ok(entry);
  return { plugin, record, message, entry };
}

test('owned edited and sticker media advance remote candidates to blob without shared failure state', () => {
  for (const kind of ['current', 'removed', 'sticker']) {
    resetHarness();
    const { plugin, record, entry } = fixture(kind);
    const before = structuredClone(record);
    if (kind === 'removed') entry.plan = plugin.getSavedAttachmentPresentationPlan(entry.attachment, record.message, { allowRemote: true });
    const continuation = plugin.createOwnedLoggerMediaContinuation(record, entry.attachment, entry.sourceKind || (entry.removed ? 'removedAttachment' : 'attachment'), entry.plan);
    const first = continuation(entry.plan.url);
    assert.equal(first.action, kind === 'sticker' ? 'blob' : 'remote', kind);
    const second = kind === 'sticker' ? first : continuation(first.url);
    assert.equal(second.action, 'blob', kind);
    assert.equal(second.url, 'blob://local/file');
    assert.equal(continuation(second.url).action, 'omit');
    assert.equal(plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
    assert.equal(plugin._failedNativeAttachmentMediaKeys?.size || 0, 0);
    assert.deepEqual(record, before);
    const reopened = plugin.createOwnedLoggerMediaContinuation(record, entry.attachment, entry.sourceKind || (entry.removed ? 'removedAttachment' : 'attachment'), entry.plan);
    assert.equal(reopened(entry.plan.url).action, kind === 'sticker' ? 'blob' : 'remote');
  }
});

test('owned continuation rejects stale or changed canonical sources and obeys cache policy', () => {
  const { plugin, record, entry } = fixture('current', false);
  const continuation = plugin.createOwnedLoggerMediaContinuation(record, entry.attachment, 'attachment', entry.plan);
  assert.equal(continuation(entry.plan.url + '&stale=1').action, 'ignore');
  record.message.attachments[0].url += '&new=1';
  assert.equal(continuation(entry.plan.url).action, 'ignore');
  record.message.attachments[0].url = entry.plan.url;
  const next = continuation(entry.plan.url);
  assert.equal(next.action, 'remote');
  const last = continuation(next.url);
  assert.equal(last.action, 'omit');
  assert.match(last.unavailableLabel, /current\.png/);
  plugin.settings.cacheAllImages = false;
  assert.equal(continuation(next.url).action, 'ignore');
});


function fakeNode(tag) {
  const tokens = new Set();
  const node = {
    tagName: tag.toUpperCase(), children: [], dataset: {}, style: {}, textContent: '', parentElement: null,
    classList: { add: (...values) => values.forEach(value => tokens.add(value)), remove: (...values) => values.forEach(value => tokens.delete(value)), contains: value => tokens.has(value) },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; },
    replaceWith(other) { const parent = this.parentElement; if (!parent) return; const index = parent.children.indexOf(this); parent.children[index] = other; other.parentElement = parent; this.parentElement = null; },
    addEventListener() {}, insertAdjacentHTML() {}, querySelectorAll() { return []; },
    get childElementCount() { return this.children.length; }
  };
  const classes = node.classList;
  Object.defineProperty(node, 'classList', { get: () => classes, set: value => { tokens.clear(); String(value).split(/\s+/).filter(Boolean).forEach(token => tokens.add(token)); } });
  return node;
}
function renderLogger(kind, cached = true, localOnly = false) {
  const data = fixture(kind, cached, localOnly);
  const { plugin, record, entry } = data;
  record.edit_history = [];
  const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
  group.appendChild(markup);
  group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
  const previousDocument = global.document;
  global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
  Object.assign(plugin, {
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: localOnly, renderCap: 0 },
    style: { edited: 'edited' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
    menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
    getSingleDiscordClass: () => 'missing', formatMarkup: () => fakeNode('div')
  });
  const audioMounts = [];
  let audioCleanups = 0;
  if (kind === 'audio') {
    plugin.mountLoggerNativeAudio = (host, src, attachment, message, onError) => { audioMounts.push({ host, src, attachment, message, onError }); };
    plugin.cleanupLoggerNativeAudioRoots = () => { audioCleanups++; };
  }
  plugin.populateParent(root, ['m']);
  const host = group.children.find(child => child.dataset.ml2RemovedAttachmentHost === 'true');
  if (!host) throw Error(`media host missing: ${JSON.stringify(loggerEvents.map(x => x.slice(0, 2)))}`);
  const find = (node, predicate) => predicate(node) ? node : node.children?.map(child => find(child, predicate)).find(Boolean);
  const media = kind === 'audio' ? audioMounts[0] : find(host, node => node.id === entry.attachment.id && ['IMG', 'VIDEO'].includes(node.tagName));
  if (!media) throw Error('rendered media missing');
  return { ...data, root, host, media, audioMounts, get audioCleanups() { return audioCleanups; }, restore() { global.document = previousDocument; } };
}

test('actual Logger onError advances edited media to its proxy and local Blob', () => {
  for (const kind of ['current']) {
    const fixture = renderLogger(kind);
    try {
      const { entry, media, host } = fixture;
      assert.equal(media.src, entry.plan.url);
      media.onerror();
      assert.equal(media.src, entry.plan.fallbackUrl);
      media.onerror();
      const all = [];
      const walk = node => { all.push(node); node.children?.forEach(walk); };
      walk(host);
      assert.ok(all.some(node => node.src === 'blob://local/file'));
    } finally { fixture.restore(); }
  }
});

function createInlineHarness(plugin, record, entry) {
  const selectedSource = fs.readFileSync(alternatePath || path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = selectedSource.indexOf('const EditHistoryMedia =');
  const end = selectedSource.indexOf("EditHistoryMedia.displayName = 'EditHistoryMedia';", start);
  assert.ok(start >= 0 && end > start);
  const state = [], refs = [];
  let stateIndex = 0, refIndex = 0, cleanup = null;
  const React = {
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useState(initial) { const index = stateIndex++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; },
    useEffect(effect) { if (!cleanup) cleanup = effect(); },
    createElement(type, props) { return { type, props }; }
  };
  const component = vm.runInNewContext(`${selectedSource.slice(start, end)}\nEditHistoryMedia;`, {
    React, plugin, currentRecord: record, parseContent: text => text,
    DiscordModules: { ClickableClasses: {} }
  });
  return {
    render() { stateIndex = 0; refIndex = 0; return component({ plugin, currentRecord: record, parseContent: text => text, attachment: entry.attachment, presentationPlan: entry.plan, fallback: 'fallback' }); },
    unmount() { cleanup?.(); }
  };
}

test('inline edit-history callback advances an explicitly supplied remote plan to proxy and Blob', () => {
  const { plugin, record, entry } = fixture('removed');
  entry.plan = plugin.getSavedAttachmentPresentationPlan(entry.attachment, record.message, { allowRemote: true });
  const inline = createInlineHarness(plugin, record, entry);
  let media = inline.render();
  assert.equal(media.props.src, entry.plan.url);
  media.props.onError();
  media = inline.render();
  assert.equal(media.props.src, entry.plan.fallbackUrl);
  media.props.onError();
  media = inline.render();
  assert.equal(media.props.src, 'blob://local/file');
});

test('owned inline remote-plan callback ignores old source events and callbacks captured after unmount', () => {
  const { plugin, record, entry } = fixture('removed');
  entry.plan = plugin.getSavedAttachmentPresentationPlan(entry.attachment, record.message, { allowRemote: true });
  let blobReads = 0;
  plugin.imageCacheServerSimulator.get = () => { blobReads++; return 'blob://local/file'; };
  const inline = createInlineHarness(plugin, record, entry);
  inline.render().props.onError({ currentTarget: { currentSrc: entry.plan.url, isConnected: true } });
  let media = inline.render();
  assert.equal(media.props.src, entry.plan.fallbackUrl);
  media.props.onError({ currentTarget: { currentSrc: entry.plan.url, isConnected: true } });
  media = inline.render();
  assert.equal(media.props.src, entry.plan.fallbackUrl);
  assert.equal(blobReads, 0);
  const staleCallback = media.props.onError;
  inline.unmount();
  staleCallback({ currentTarget: { currentSrc: entry.plan.fallbackUrl, isConnected: false } });
  assert.equal(blobReads, 0);
  assert.equal(inline.render().props.src, entry.plan.fallbackUrl);
});


test('actual Logger sticker and failed local media end at the exact placeholder', () => {
  for (const kind of ['current', 'sticker']) {
    const rendered = renderLogger(kind);
    try {
      const { media, entry, host } = rendered;
      media.onerror();
      if (kind !== 'sticker') { assert.equal(media.src, entry.plan.fallbackUrl); media.onerror(); }
      const all = [];
      const walk = node => { all.push(node); node.children?.forEach(walk); };
      walk(host);
      const blob = all.find(node => node.src === 'blob://local/file' && node.id === entry.attachment.id);
      assert.ok(blob, kind);
      assert.doesNotThrow(() => blob.onerror());
      const after = []; const collect = node => { after.push(node); node.children?.forEach(collect); };
      collect(host);
      assert.ok(after.some(node => typeof node.textContent === 'string' && node.textContent.includes(entry.plan.filename)), kind);
    } finally { rendered.restore(); }
  }
});

test('actual Logger absent local Blob renders the exact unavailable filename', () => {
  const rendered = renderLogger('current', false);
  try {
    rendered.media.onerror();
    rendered.media.onerror();
    const all = []; const walk = node => { all.push(node); node.children?.forEach(walk); }; walk(rendered.host);
    assert.ok(all.some(node => node.textContent === '[Deleted: current.png]'));
  } finally { rendered.restore(); }
});

test('local-only and cache-off policies retain their existing admission decisions', () => {
  const { plugin, record, entry } = fixture('current');
  plugin.settings.onlyRenderCachedAttachments = true;
  const local = plugin.getSavedAttachmentPresentationPlan(entry.attachment, record.message, { allowBlob: true });
  assert.equal(local.action, 'blob');
  const oldRemote = plugin.createOwnedLoggerMediaContinuation(record, entry.attachment, 'attachment', entry.plan);
  assert.equal(oldRemote(entry.plan.url).action, 'ignore');
  const blobContinuation = plugin.createOwnedLoggerMediaContinuation(record, entry.attachment, 'attachment', local);
  assert.equal(blobContinuation(local.url).action, 'omit');
  plugin.settings.cacheAllImages = false;
  assert.equal(plugin.getSavedAttachmentPresentationPlan(entry.attachment, record.message, {}).action, 'placeholder');
});

test('actual Logger rejects stale events and changed signed canonical URLs without touching the row', () => {
  const rendered = renderLogger('current');
  try {
    const { media, entry, record } = rendered;
    media.onerror();
    assert.equal(media.src, entry.plan.fallbackUrl);
    media.currentSrc = entry.plan.url;
    media.onerror();
    assert.equal(media.src, entry.plan.fallbackUrl);
    assert.ok(media.parentElement);
    media.currentSrc = entry.plan.fallbackUrl;
    record.message.attachments[0].url += '&new-signature=1';
    media.onerror();
    assert.equal(media.src, entry.plan.fallbackUrl);
    assert.ok(media.parentElement);
  } finally { rendered.restore(); }
});

test('invalid local getter output uses the filename placeholder and reopening retries remote', () => {
  const first = renderLogger('current');
  try {
    first.plugin.imageCacheServerSimulator.get = () => 'data:error-image';
    first.media.onerror();
    first.media.onerror();
    assert.ok(first.host.children.some(node => node.textContent === '[Deleted: current.png]'));
  } finally { first.restore(); }
  const reopened = renderLogger('current', false);
  try { assert.equal(reopened.media.src, reopened.entry.plan.url); }
  finally { reopened.restore(); }
});

test('supported stickers remain eligible when the canonical record is deleted', () => {
  const { plugin, record, entry } = fixture('sticker');
  record.delete_data = { time: 1 };
  const continuation = plugin.createOwnedLoggerMediaContinuation(record, entry.attachment, 'sticker', entry.plan);
  assert.equal(continuation(entry.plan.url).action, 'blob');
  assert.equal(plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
});


test('actual Logger audio error callback retries proxy then Blob and ignores stale sources', () => {
  const rendered = renderLogger('audio');
  try {
    const { audioMounts, entry, host } = rendered;
    assert.equal(audioMounts[0].src, entry.plan.url);
    audioMounts[0].onError(null, entry.plan.url + '&stale=1');
    assert.equal(audioMounts.length, 1);
    audioMounts[0].onError(null, entry.plan.url);
    assert.equal(audioMounts[1].src, entry.plan.fallbackUrl);
    audioMounts[0].onError(null, entry.plan.url);
    assert.equal(audioMounts.length, 2);
    audioMounts[1].onError(null, entry.plan.fallbackUrl);
    assert.equal(audioMounts[2].src, 'blob://local/file');
    audioMounts[2].onError(null, 'blob://local/file');
    assert.equal(rendered.audioCleanups, 1);
    assert.ok(host.children.some(node => node.textContent.includes('current.mp3')));
    assert.equal(rendered.plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
  } finally { rendered.restore(); }
});

test('actual Logger audio error callback uses filename placeholder without a local Blob', () => {
  const rendered = renderLogger('audio', false);
  try {
    const { audioMounts, entry, host } = rendered;
    audioMounts[0].onError(null, entry.plan.url);
    assert.equal(audioMounts[1].src, entry.plan.fallbackUrl);
    audioMounts[1].onError(null, entry.plan.fallbackUrl);
    assert.equal(audioMounts.length, 2);
    assert.equal(rendered.audioCleanups, 1);
    assert.ok(host.children.some(node => node.textContent === '[Deleted: current.mp3]'));
  } finally { rendered.restore(); }
});



test('owned Logger media ignores callbacks after disconnection or plugin stop', () => {
  const rendered = renderLogger('current');
  try {
    let blobReads = 0;
    rendered.plugin.imageCacheServerSimulator.get = () => { blobReads++; return 'blob://local/file'; };
    rendered.media.isConnected = false;
    rendered.media.onerror();
    assert.equal(rendered.media.src, rendered.entry.plan.url);
    assert.equal(blobReads, 0);
    rendered.media.isConnected = true;
    rendered.plugin.__started = false;
    rendered.plugin.stop();
    rendered.media.onerror();
    assert.equal(rendered.media.src, rendered.entry.plan.url);
    assert.equal(blobReads, 0);
  } finally { rendered.restore(); }
});

test('owned Logger audio ignores disconnected and stopped callbacks without remounting', () => {
  const rendered = renderLogger('audio');
  try {
    let blobReads = 0;
    rendered.plugin.imageCacheServerSimulator.get = () => { blobReads++; return 'blob://local/file'; };
    rendered.audioMounts[0].host.isConnected = false;
    rendered.audioMounts[0].onError(null, rendered.entry.plan.url);
    assert.equal(rendered.audioMounts.length, 1);
    rendered.audioMounts[0].host.isConnected = true;
    rendered.plugin.__started = false;
    rendered.plugin.stop();
    rendered.audioMounts[0].onError(null, rendered.entry.plan.url);
    assert.equal(rendered.audioMounts.length, 1);
    assert.equal(blobReads, 0);
  } finally { rendered.restore(); }
});


test('owned inline callbacks after stop do not update fallback state even if policy changed', () => {
  const { plugin, record, entry } = fixture('removed');
  const inline = createInlineHarness(plugin, record, entry);
  const callback = inline.render().props.onError;
  plugin.__started = false;
  plugin.stop();
  plugin.settings.cacheAllImages = false;
  callback({ currentTarget: { currentSrc: entry.plan.url, isConnected: true } });
  assert.equal(inline.render().props.src, entry.plan.url);
});

test('cached removed video renders its selected Blob and failed decode shows its filename', () => {
  const rendered = renderLogger('removed', true, true);
  try {
    assert.equal(rendered.entry.plan.action, 'blob');
    assert.equal(rendered.media.src, rendered.entry.plan.url);
    rendered.media.onerror();
    const nodes = [];
    const walk = node => { nodes.push(node); node.children?.forEach(walk); };
    walk(rendered.host);
    assert.ok(nodes.some(node => node.textContent.includes('removed.mp4')));
    assert.equal(rendered.plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
  } finally { rendered.restore(); }
});

test('cached inline removed video is bounded and viewer retains original dimensions', () => {
  const { plugin, record, entry } = fixture('removed', true, true);
  entry.attachment.width = 1560;
  entry.attachment.height = 1376;
  let options;
  plugin.style = { imageRoot: 'image-root' };
  plugin.createModal = value => { options = value; };
  const inline = createInlineHarness(plugin, record, entry);
  const media = inline.render();
  assert.equal(media.props.src, 'blob://local/file');
  assert.equal(media.props.style.maxWidth, 'min(100%, 400px)');
  assert.equal(media.props.style.maxHeight, '350px');
  assert.equal(media.props.style.width, 'auto');
  media.props.onDoubleClick();
  assert.equal(options.items[0].width, 1560);
  assert.equal(options.items[0].height, 1376);
  media.props.onError({ currentTarget: { currentSrc: media.props.src, isConnected: true } });
  assert.match(inline.render(), /removed\.mp4/);
});

test('Logger removes only markers for admitted previews and preserves source history and missing markers', () => {
  const id = '111111111111111111', missingId = '222222222222222222';
  const url = `https://cdn.discordapp.com/attachments/channel/${id}/photo.gif`;
  const missingUrl = `https://cdn.discordapp.com/attachments/channel/${missingId}/missing.png`;
  const unknownUrl = 'https://example.com/unknown.png';
  const attachment = { id, filename: 'photo.gif', url };
  const message = { id: 'm', channel_id: 'channel', content: 'surviving', attachments: [] };
  const history = `before \`Attachment Deleted: \`${url} middle \`Attachment Deleted: \`${url} missing \`Attachment Deleted: \`${missingUrl} unknown \`Attachment Deleted: \`${unknownUrl}`;
  const record = { message, delete_data: null, edit_history: [{ content: history, time: 0 }], removed_attachments: [attachment, { id: missingId, filename: 'missing.png', url: missingUrl }] };
  const original = structuredClone(record);
  let blobReads = 0;
  const plugin = createPlugin({
    messageRecord: { m: record },
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: true, renderCap: 0 },
    imageCacheServerSimulator: { _resolveImagePath: id => id === missingId ? null : '/cache/file', get: () => { blobReads++; return 'blob://local/selected'; } }
  });
  const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
  group.appendChild(markup); group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
  const previousDocument = global.document;
  global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
  const renderedContents = [];
  Object.assign(plugin, {
    style: { edited: 'edited', removedAttachmentPreview: 'removed-preview' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
    menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
    getSingleDiscordClass: () => 'missing', formatMarkup: text => { renderedContents.push(text); return fakeNode('div'); },
    Tooltip: function () {}, getEditedTimestampClasses: () => '', createTimeStamp: () => '', translatedEdited: 'edited'
  });
  try {
    plugin.populateParent(root, ['m']);
    assert.equal(renderedContents[0], `before  middle  missing \`Attachment Deleted: \`${missingUrl} unknown \`Attachment Deleted: \`${unknownUrl}`);
    assert.equal(renderedContents[1], 'surviving');
    const host = group.children.find(child => child.dataset.ml2RemovedAttachmentHost === 'true');
    const img = host.children.find(child => child.tagName === 'IMG');
    assert.equal(img.src, 'blob://local/selected');
    assert.equal(blobReads, 1, 'the admitted Blob is reused by the renderer');
    assert.equal(img.classList.contains('removed-preview'), true);
    assert.equal(markup.children.some(child => child.textContent.includes('missing.png')), false);
    assert.deepEqual(record, original);
  } finally { global.document = previousDocument; }
});

test('removed inline tint follows edit-only and whole-deleted style decisions', () => {
  const { plugin, record, entry } = fixture('removed');
  plugin.style = { removedAttachmentPreview: 'removed-preview' };
  assert.match(createInlineHarness(plugin, record, entry).render().props.className, /removed-preview/);
  plugin.settings.useAlternativeDeletedStyle = true;
  assert.doesNotMatch(createInlineHarness(plugin, record, entry).render().props.className, /removed-preview/);
  plugin.settings.useAlternativeDeletedStyle = false;
  record.delete_data = { time: 1 };
  assert.doesNotMatch(createInlineHarness(plugin, record, entry).render().props.className, /removed-preview/);
});

test('Logger uses existing native audio and document hosts for cached removed uploads, including deleted records', () => {
  for (const filename of ['sound.mp3', 'document.pdf']) {
    for (const deleted of [false, true]) {
      const attachment = { id: '200', filename, url: `https://cdn.discordapp.com/attachments/channel/200/${filename}` };
      const message = { id: 'm', channel_id: 'channel', content: 'body', attachments: [] };
      const record = { message, delete_data: deleted ? { time: 1 } : null, removed_attachments: [attachment] };
      const plugin = createPlugin({ messageRecord: { m: record }, settings: { cacheAllImages: true, onlyRenderCachedAttachments: true, renderCap: 0 }, imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' } });
      const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
      group.appendChild(markup); group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
      const previousDocument = global.document;
      global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
      let mount, cleaned = false;
      Object.assign(plugin, {
        style: { edited: 'edited', removedAttachmentPreview: 'removed-preview' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
        menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
        getSingleDiscordClass: () => 'missing', formatMarkup: () => fakeNode('div'),
        mountLoggerNativeAudio: (host, src, attachment, source, onError) => { mount = { host, src, onError }; },
        mountLoggerNativeDocument: (host, message, attachment, source, onUnavailable) => { mount = { host, src: attachment.url, onError: onUnavailable }; },
        cleanupLoggerNativeAudioRoots: () => { cleaned = true; }, cleanupLoggerNativeDocumentRoots: () => { cleaned = true; }
      });
      try {
        plugin.populateParent(root, ['m']);
        assert.equal(mount.src, 'blob://local/file');
        assert.equal(mount.host.classList.contains('removed-preview'), !deleted);
        mount.onError(null, mount.src);
        assert.equal(cleaned, true);
        assert.ok(mount.host.parentElement === null);
        const host = group.children.find(child => child.dataset.ml2RemovedAttachmentHost === 'true');
        assert.ok(host.children.some(child => child.textContent.includes(filename)));
      } finally { global.document = previousDocument; }
    }
  }
});

test('surviving inline preview yields to whole-message tint at the existing message reconciliation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('const tintMessageNode = (node) => {');
  const end = source.indexOf('    const findLowestCommonAncestor', start);
  assert.ok(start >= 0 && end > start);
  const preview = fakeNode('img');
  preview.classList.add('removed-preview');
  const node = { id: 'chat-messages-channel-message', querySelectorAll: () => [preview] };
  const wrapper = { tagName: 'DIV' };
  const record = { delete_data: { time: 1 } };
  const plugin = { style: { removedAttachmentPreview: 'removed-preview' }, getSavedMessage: () => record, noTintIds: new Set(['message']) };
  let cleared = false, added = false;
  const tintMessageNode = vm.runInNewContext(`(function () { ${source.slice(start, end)}; return tintMessageNode; }).call(plugin)`, {
    plugin, getMessageTintTarget: () => wrapper, shouldTintMessage: () => true,
    clearTintClasses: () => { cleared = true; }, syncDeletedAttachmentRendererMarker() {}, addTintClass: () => { added = true; }
  });
  tintMessageNode(node);
  assert.equal(preview.classList.contains('removed-preview'), false);
  assert.equal(cleared, true);
  assert.equal(added, false);
});

test('Logger retains empty-content rows with recognized removed markers when cache is unavailable', () => {
  for (const availability of ['missing', 'unreadable', 'master-off']) {
    const attachment = { id: '111111111111111111', filename: 'removed.gif', url: 'https://cdn.discordapp.com/attachments/channel/111111111111111111/removed.gif' };
    const marker = '`Attachment Deleted: `' + attachment.url;
    const message = { id: 'm', channel_id: 'channel', content: '', attachments: [] };
    const record = { message, delete_data: null, edit_history: [{ content: marker, time: 0 }], removed_attachments: [attachment] };
    const original = structuredClone(record);
    const plugin = createPlugin({
      messageRecord: { m: record },
      settings: { cacheAllImages: availability !== 'master-off', onlyRenderCachedAttachments: true, renderCap: 0 },
      imageCacheServerSimulator: { _resolveImagePath: () => availability === 'missing' ? null : '/cache/file', get: () => null }
    });
    const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
    group.appendChild(markup); group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
    const previousDocument = global.document;
    global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
    const contents = [];
    Object.assign(plugin, {
      style: { edited: 'edited' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
      menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
      getSingleDiscordClass: () => 'missing', formatMarkup: content => { contents.push(content); return fakeNode('div'); },
      Tooltip: function () {}, getEditedTimestampClasses: () => '', createTimeStamp: () => '', translatedEdited: 'edited'
    });
    try {
      plugin.populateParent(root, ['m']);
      assert.equal(root.children.includes(group), true, availability);
      assert.equal(contents[0], marker, availability);
      assert.equal(markup.children.length, 2, 'no duplicate fallback is appended');
      assert.deepEqual(record, original);
    } finally { global.document = previousDocument; }
  }
});

function createInlineNativeHarness(mediaType = 'audio', failureReports = new Set()) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('const EditHistoryNativeAttachment =');
  const end = source.indexOf("EditHistoryNativeAttachment.displayName = 'EditHistoryNativeAttachment';", start);
  assert.ok(start >= 0 && end > start);
  const extension = mediaType === 'audio' ? 'mp3' : 'pdf';
  const attachment = { id: '111111111111111111', filename: `file.${extension}`, url: `https://cdn.discordapp.com/attachments/c/111111111111111111/file.${extension}` };
  const message = { id: 'm', channel_id: 'c', content: 'body', attachments: [] };
  const record = { message, removed_attachments: [attachment] };
  const plugin = createPlugin({ __started: true, _startupGeneration: 1, messageRecord: { m: record }, settings: {}, style: { removedAttachmentPreview: 'removed' } });
  const previousDocument = global.document;
  const microtasks = [], mounts = [], cleanups = [];
  const outer = fakeNode('span'); outer.isConnected = true;
  const document = { createElement: tag => { const node = fakeNode(tag); node.isConnected = true; return node; } };
  const originalRemove = outer.appendChild;
  outer.appendChild = child => { originalRemove.call(outer, child); const remove = child.remove; child.remove = () => { remove.call(child); child.isConnected = false; }; return child; };
  Object.assign(plugin, {
    mountLoggerNativeAudio: (host, url, attachment, source, onError) => { mounts.push({ host, url, attachment, source, onError }); return { native: false }; },
    mountLoggerNativeDocument: (host, display, attachment, source, onError, options) => { mounts.push({ host, display, attachment, source, onError, options }); return { native: false, pending: true }; },
    cleanupLoggerNativeAudioRoots: host => cleanups.push(host), cleanupLoggerNativeDocumentRoots: host => cleanups.push(host)
  });
  const state = [], refs = []; let stateIndex, refIndex, effectIndex, effects = [], pending = [], stateWrites = 0;
  const React = {
    useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useState(initial) { const i = stateIndex++; if (!(i in state)) state[i] = initial; return [state[i], value => { stateWrites++; state[i] = value; }]; },
    useEffect(effect, deps) { const i = effectIndex++; const prior = effects[i]; if (!prior || deps.some((v, j) => !Object.is(v, prior.deps[j]))) pending.push(() => { prior?.cleanup?.(); effects[i] = { deps, cleanup: effect() }; }); },
    createElement(type, props) { return { type, props }; }
  };
  const component = vm.runInNewContext(`${source.slice(start, end)}\nEditHistoryNativeAttachment;`, { React, document, structuredClone, inlineNativeFailureReports: failureReports, queueMicrotask: fn => microtasks.push(fn) });
  let props = { plugin, record, attachment, mediaType, url: 'blob://local/selected', fallback: 'original marker' };
  return {
    plugin, record, attachment, message, mounts, cleanups, outer, props, document,
    get stateWrites() { return stateWrites; },
    render(newProps = {}, deferEffects = false) {
      props = { ...props, ...newProps }; stateIndex = 0; refIndex = 0; effectIndex = 0; pending = [];
      const result = component(props);
      if (result?.props?.ref) result.props.ref.current = outer;
      if (!deferEffects) for (const run of pending) run();
      return result;
    },
    runEffects() { for (const run of pending) run(); pending = []; },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
    flush() { while (microtasks.length) microtasks.shift()(); },
    restore() { global.document = previousDocument; }
  };
}

test('native inline adapters use the selected Blob and canonical source while keeping detached file payloads', () => {
  for (const mediaType of ['audio', 'attachment']) {
    const h = createInlineNativeHarness(mediaType);
    try {
      const before = structuredClone(h.record);
      const rendered = h.render();
      assert.equal(rendered.type, 'div');
      assert.equal(rendered.props.style?.display, undefined);
      assert.equal(rendered.props['data-ml2-removed-preview'], 'true');
      assert.equal(rendered.props.className, 'removed');
      assert.equal(h.mounts.length, 1);
      const mount = h.mounts[0];
      assert.equal(mount.source, h.message);
      if (mediaType === 'audio') {
        assert.equal(mount.url, 'blob://local/selected');
        assert.equal(mount.attachment, h.attachment);
      } else {
        assert.notEqual(mount.display, h.message);
        assert.notEqual(mount.attachment, h.attachment);
        assert.equal(mount.attachment.url, 'blob://local/selected');
        assert.equal(mount.attachment.proxy_url, 'blob://local/selected');
        assert.equal(mount.display.attachments[0], mount.attachment);
      }
      h.render({ attachment: { ...h.attachment } });
      assert.equal(h.mounts.length, 1, 'a new plan/attachment object does not remount');
      assert.deepEqual(h.record, before);
    } finally { h.unmount(); h.flush(); h.restore(); }
  }
});

test('native inline failures restore the marker and dispose only their own host', () => {
  for (const mediaType of ['audio', 'attachment']) {
    const h = createInlineNativeHarness(mediaType);
    try {
      h.render();
      const { host, onError } = h.mounts[0];
      if (mediaType === 'audio') onError({}, 'blob://old');
      assert.equal(h.render().type, 'div');
      onError({}, 'blob://local/selected');
      assert.equal(host.isConnected, false);
      assert.equal(h.render(), 'original marker');
      assert.deepEqual(h.cleanups, []);
      h.flush();
      assert.deepEqual(h.cleanups, [host]);
      h.unmount(); h.flush();
      assert.deepEqual(h.cleanups, [host]);
    } finally { h.restore(); }
  }
});

test('native inline stale callbacks and deferred cleanup cannot affect replacement hosts', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.render();
    const old = h.mounts[0];
    h.plugin._startupGeneration++;
    h.render();
    const replacement = h.mounts[1];
    assert.equal(old.host.isConnected, false);
    old.onError({}, old.url);
    h.flush();
    assert.deepEqual(h.cleanups, [old.host]);
    assert.equal(replacement.host.isConnected, true);
    assert.equal(h.render().type, 'div');
    h.plugin.__started = false;
    replacement.onError({}, replacement.url);
    assert.equal(h.render().type, 'div');
    h.plugin.__started = true;
    h.record.removed_attachments = [];
    replacement.onError({}, replacement.url);
    assert.equal(h.render().type, 'div');
    h.unmount(); h.flush();
    replacement.onError({}, replacement.url);
    assert.equal(h.render().type, 'div');
  } finally { h.restore(); }
});

test('inline dispatch sends only cached audio and files to the stable native adapter', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const start = source.indexOf('const renderEditHistoryAttachment =');
  const end = source.indexOf('      const parseEditHistoryContent =', start);
  assert.ok(start >= 0 && end > start);
  const Native = function Native() {}, Media = function Media() {};
  const plugin = {}, currentRecord = { message: {} };
  const render = vm.runInNewContext(`${source.slice(start, end)}\nrenderEditHistoryAttachment;`, {
    React: { createElement: (type, props) => ({ type, props }) },
    plugin, currentRecord, owner: null, parseContent: text => text, EditHistoryNativeAttachment: Native, EditHistoryMedia: Media
  });
  const attachment = { id: 'a' };
  for (const mediaType of ['audio', 'attachment']) {
    const result = render(attachment, 'key', 'marker', { action: 'blob', mediaType, url: 'blob://selected' });
    assert.equal(result.type, Native);
    assert.equal(result.props.record, currentRecord);
    assert.equal(result.props.url, 'blob://selected');
    assert.equal(result.props.fallback, 'marker');
    assert.equal(render(attachment, 'key', 'marker', { action: 'remote', mediaType, url: 'https://remote' }).type, Native);
  }
  assert.equal(render(attachment, 'key', 'marker', { action: 'blob', mediaType: 'image', url: 'blob://selected' }).type, Media);
});

test('native inline synchronous renderer rejection restores its original marker', () => {
  const h = createInlineNativeHarness('attachment');
  try {
    h.plugin.mountLoggerNativeDocument = () => { throw Error('unavailable'); };
    h.render();
    assert.equal(h.outer.children.length, 0);
    assert.equal(h.render(), 'original marker');
    h.flush();
    assert.equal(h.cleanups.length, 1);
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('detached inline hosts suppress actual lazy audio and document retries', async () => {
  for (const mediaType of ['audio', 'attachment']) {
    const h = createInlineNativeHarness(mediaType);
    try {
      global.document = h.document;
      let resolveLoad, mountCount = 0;
      const pending = new Promise(resolve => { resolveLoad = resolve; });
      const proto = Object.getPrototypeOf(h.plugin);
      if (mediaType === 'audio') {
        h.plugin.resolveLoggerNativeAudioPlayer = () => null;
        h.plugin.ensureLoggerNativeAudioPlayer = () => pending;
        h.plugin.cleanupLoggerNativeAudioRoots = proto.cleanupLoggerNativeAudioRoots.bind(h.plugin);
        h.plugin.mountLoggerNativeAudio = (...args) => { mountCount++; return proto.mountLoggerNativeAudio.apply(h.plugin, args); };
      } else {
        h.plugin.tools = { getChannel: () => ({ id: 'c' }) };
        h.plugin.resolveLoggerNativeDocumentMessageClass = () => null;
        h.plugin.ensureLoggerNativeDocumentMessageClass = () => pending;
        h.plugin.cleanupLoggerNativeDocumentRoots = proto.cleanupLoggerNativeDocumentRoots.bind(h.plugin);
        h.plugin.mountLoggerNativeDocument = (...args) => { mountCount++; return proto.mountLoggerNativeDocument.apply(h.plugin, args); };
      }
      h.render();
      const inner = h.outer.children[0];
      assert.equal(mountCount, 1);
      h.unmount();
      assert.equal(inner.isConnected, false);
      resolveLoad(function Ready() {});
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(mountCount, 1, `${mediaType} must not retry a detached host`);
      h.flush();
      const roots = mediaType === 'audio' ? h.plugin._loggerNativeAudioRoots : h.plugin._loggerNativeDocumentRoots;
      assert.equal(roots.has(inner), false);
    } finally { h.restore(); }
  }
});

test('inline native failure diagnostics follow debug console and toast settings and deduplicate', () => {
  const events = [], notifications = [];
  const run = (enabled, toasts, reason, reportsForSession) => {
    const h = createInlineNativeHarness('attachment', reportsForSession);
    h.plugin.settings.debugLogging = enabled;
    h.plugin.settings.debugToasts = toasts;
    h.plugin._logStyledConsoleEvent = (category, message) => events.push({ category, message });
    h.plugin.notifyUser = (message, options) => notifications.push({ message, options });
    try { h.render(); h.mounts[0].onError(reason); assert.equal(h.render(), 'original marker'); }
    finally { h.unmount(); h.flush(); h.restore(); }
  };
  run(false, true, 'messageAccessoriesUnavailable', new Set());
  assert.equal(events.length, 0);
  assert.equal(notifications.length, 0);
  run(true, false, 'messageAccessoriesUnavailable', new Set());
  assert.equal(events.length, 1);
  assert.equal(notifications.length, 0);
  const reports = new Set();
  run(true, true, 'messageAccessoriesUnavailable', reports);
  run(true, true, 'messageAccessoriesUnavailable', reports);
  assert.equal(events.length, 2);
  assert.equal(notifications.length, 1);
  assert.equal(events[1].message, 'Inline attachment fallback: messageAccessoriesUnavailable');
  assert.equal(notifications[0].message, events[1].message);
  run(true, true, Error('secret id filename https://private.invalid'), reports);
  assert.equal(events[2].message, 'Inline attachment fallback: renderFailure');
  run(true, true, 'messageAccessoriesUnavailable', new Set());
  assert.equal(events.length, 4, 'a new patch session has a fresh deduplication set');
  assert.equal(notifications.length, 3);
  assert.ok(events.every(event => !/secret|filename|https:/i.test(event.message)));
});

test('delayed native inline effects never mount after their owner becomes invalid', () => {
  for (const mediaType of ['audio', 'attachment']) {
    for (const invalidate of [
      h => { h.plugin.__started = false; },
      h => { h.plugin._startupGeneration++; },
      h => { h.plugin.settings.cacheAllImages = false; },
      h => { h.plugin.settings.showEditedMessages = false; },
      h => { h.plugin.messageRecord.m = { ...h.record }; },
      h => { h.record.removed_attachments = []; },
      h => { h.record.edits_hidden = true; }
    ]) {
      const h = createInlineNativeHarness(mediaType);
      try {
        h.render({}, true);
        invalidate(h);
        h.runEffects();
        assert.equal(h.mounts.length, 0);
        assert.equal(h.outer.children.length, 0);
        assert.equal(h.stateWrites, 0);
        h.flush();
        assert.equal(h.mounts.length, 0);
        assert.equal(h.cleanups.length, 1);
      } finally { h.unmount(); h.flush(); h.restore(); }
    }
  }
});

test('native inline ownership recognizes proxyURL and ignores changed canonical proxy', () => {
  const h = createInlineNativeHarness('attachment');
  try {
    h.attachment.proxyURL = 'https://media.discordapp.net/original';
    h.render();
    assert.equal(h.mounts.length, 1);
    h.record.removed_attachments[0].proxyURL = 'https://media.discordapp.net/replaced';
    h.mounts[0].onError('messageAccessoriesUnavailable');
    assert.equal(h.render().type, 'div');
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('inline document projection accepts unrelated non-cloneable message fields', () => {
  const h = createInlineNativeHarness('attachment');
  try {
    h.message.unrelatedMethod = () => 'unchanged';
    h.render();
    assert.equal(h.mounts.length, 1);
    assert.notEqual(h.mounts[0].display, h.message);
    assert.notEqual(h.mounts[0].attachment, h.attachment);
    assert.equal(h.mounts[0].display.unrelatedMethod, h.message.unrelatedMethod);
    assert.equal(h.message.attachments.length, 0);
    assert.equal(h.attachment.url.startsWith('https:'), true);
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('whole-deleted preview tint reconciliation settles its class observer after removing the marker', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'), 'utf8');
  const tintStart = source.indexOf('const tintMessageNode = (node) => {');
  const tintEnd = source.indexOf('    const findLowestCommonAncestor', tintStart);
  const observerStart = source.indexOf('const tintObserver = new MutationObserver(');
  const observerEnd = source.indexOf('    tintObserver.observe(', observerStart);
  assert.ok(tintStart >= 0 && tintEnd > tintStart && observerStart >= 0 && observerEnd > observerStart);
  for (const mode of ['normal', 'alternative', 'noTint']) {
    const pending = [], tokens = new Set(['removed-preview']);
    const preview = {
      nodeType: 1,
      classList: {
        contains: token => tokens.has(token),
        remove(token) { tokens.delete(token); pending.push({ type: 'attributes', attributeName: 'class', target: preview }); }
      }
    };
    const node = { id: 'chat-messages-channel-message', querySelectorAll: () => [preview] };
    const wrapper = { tagName: 'DIV' };
    const plugin = {
      style: { removedAttachmentPreview: 'removed-preview' },
      settings: { useAlternativeDeletedStyle: mode === 'alternative' },
      getSavedMessage: () => ({ delete_data: { time: 1 } }),
      noTintIds: new Set(mode === 'noTint' ? ['message'] : [])
    };
    let cleared = 0, added = 0, synced;
    const tintMessageNode = vm.runInNewContext(`(function () { ${source.slice(tintStart, tintEnd)}; return tintMessageNode; }).call(plugin)`, {
      plugin, getMessageTintTarget: () => wrapper, shouldTintMessage: () => true,
      clearTintClasses: () => { cleared++; }, syncDeletedAttachmentRendererMarker: (_wrapper, _id, value) => { synced = value; },
      addTintClass: () => { added++; }
    });
    const observer = vm.runInNewContext(`(function () { ${source.slice(observerStart, observerEnd)}; return tintObserver; }).call(plugin)`, {
      plugin, MutationObserver: class { constructor(callback) { this.callback = callback; } },
      getMessageNodeFromAnyNode: () => node, tintMessageNode,
      tintNativeThreadBrowserPreviews() {}, tintNativeDeletedThreadHeaderPlaceholders() {},
      getForumThreadIdFromAnyNode: () => null, tintForumCardByThreadId() {}, scheduleRestoreDeletedCompactThreads() {}
    });
    pending.push({ type: 'attributes', attributeName: 'class', target: preview });
    let cycles = 0;
    while (pending.length && cycles < 12) {
      observer.callback([pending.shift()]);
      cycles++;
    }
    assert.equal(tokens.has('removed-preview'), false, `${mode} removes the stale edit-only marker`);
    assert.equal(pending.length, 0, `${mode} class observer must settle`);
    assert.equal(cycles, 2, `${mode} performs one removal and one follow-up reconciliation`);
    assert.equal(synced, mode !== 'noTint');
    assert.equal(cleared > 0, mode === 'noTint');
    assert.equal(added > 0, mode !== 'noTint');
    observer.callback([{ type: 'attributes', attributeName: 'class', target: preview }]);
    assert.equal(pending.length, 0, `${mode} repeated reconciliation must not mutate an absent marker`);
  }
});

test('inline removed audio advances CDN to proxy to Blob without touching the canonical record', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.attachment.url += '?token=2';
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.mp3?token=2';
    h.plugin.imageCacheServerSimulator = { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/audio' };
    const before = structuredClone(h.record);
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    assert.equal(h.mounts[0].url, plan.url);
    h.mounts[0].onError({ target: { tagName: 'AUDIO' } }, plan.url);
    h.render();
    assert.equal(h.mounts[1].url, h.attachment.proxy_url);
    h.mounts[0].onError({ target: { tagName: 'AUDIO' } }, plan.url);
    h.mounts[1].onError({ target: { tagName: 'AUDIO' } }, h.attachment.proxy_url);
    h.render();
    assert.equal(h.mounts[2].url, 'blob://local/audio');
    h.mounts[2].onError({ target: { tagName: 'AUDIO' } }, 'blob://local/audio');
    assert.equal(h.render(), 'original marker');
    assert.deepEqual(h.record, before);
    assert.equal(h.plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('inline removed audio without cached media falls back to marker after both remote sources', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.mp3';
    h.plugin.imageCacheServerSimulator = { _resolveImagePath: () => null, get: () => { throw Error('unexpected local read'); } };
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    h.mounts[0].onError({ target: { tagName: 'AUDIO' } }, plan.url);
    h.render();
    h.mounts[1].onError({ target: { tagName: 'AUDIO' } }, h.attachment.proxy_url);
    assert.equal(h.render(), 'original marker');
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('inline remote audio does not queue another remote candidate after local-only is enabled', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.mp3';
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    h.plugin.settings.onlyRenderCachedAttachments = true;
    h.mounts[0].onError({ target: { tagName: 'AUDIO' } }, plan.url);
    assert.equal(h.render(), 'original marker');
    assert.equal(h.mounts.length, 1);
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('Logger removed video advances CDN to proxy then cached Blob using the live error callback', () => {
  const rendered = renderLogger('removed');
  try {
    assert.equal(rendered.entry.plan.action, 'remote');
    assert.equal(rendered.media.src, rendered.entry.plan.url);
    rendered.media.onerror();
    assert.equal(rendered.media.src, rendered.entry.plan.fallbackUrl);
    rendered.media.onerror();
    const nodes = [];
    const walk = node => { nodes.push(node); node.children?.forEach(walk); };
    walk(rendered.host);
    assert.ok(nodes.some(node => node.id === 'removed' && node.src === 'blob://local/file'));
  } finally { rendered.restore(); }
});

test('inline audio mount failure does not misclassify a remote source as failed', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.mp3';
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.plugin.mountLoggerNativeAudio = () => { throw Error('native component unavailable'); };
    h.render({ url: plan.url, presentationPlan: plan });
    assert.equal(h.render(), 'original marker');
    assert.equal(h.plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
    assert.equal(h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true }).url, plan.url);
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('mounted inline removed text advances probe failures through proxy to Blob', async () => {
  const h = createInlineNativeHarness('attachment');
  const oldNet = global.BdApi.Net;
  global.BdApi.Net = { fetch() {} };
  try {
    h.attachment.filename = 'file.txt';
    h.attachment.url = 'https://cdn.discordapp.com/attachments/c/111111111111111111/file.txt?sig=1';
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.txt?sig=1';
    h.plugin.imageCacheServerSimulator = { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' };
    const original = structuredClone(h.record), requests = [];
    h.plugin.fetchMediaNetworkResponse = async url => { requests.push(url); return { ok: false, release() {} }; };
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    for (let i = 0; i < 2; i++) {
      const context = h.mounts[i].options.ownedProbeContext;
      assert.ok(context);
      const release = h.plugin.acquireSavedInlineTextAttachmentProbe(context);
      const entry = h.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value;
      await entry.promise;
      release();
      h.render();
    }
    assert.deepEqual(requests, [h.attachment.url, h.attachment.proxy_url]);
    assert.equal(h.mounts[2].attachment.url, 'blob://local/file');
    assert.equal(h.mounts[2].options.ownedProbeContext, null);
    assert.deepEqual(h.record, original);
    assert.equal(h.plugin._failedNativeAttachmentMediaCandidateKeys?.size || 0, 0);
  } finally { h.unmount(); h.flush(); h.restore(); global.BdApi.Net = oldNet; }
});

test('Logger removed text mounts use the shared probe and retain proxy then cached fallback', async () => {
  const previousDocument = global.document, oldNet = global.BdApi.Net;
  global.BdApi.Net = { fetch() {} };
  const attachment = { id: '111111111111111111', filename: 'file.txt', url: 'https://cdn.discordapp.com/attachments/c/111111111111111111/file.txt', proxy_url: 'https://media.discordapp.net/attachments/c/111111111111111111/file.txt' };
  const message = { id: 'm', channel_id: 'c', content: 'text', attachments: [] };
  const record = { message, edit_history: [], removed_attachments: [attachment] };
  const plugin = createPlugin({ __started: true, _startupGeneration: 1, messageRecord: { m: record }, settings: { cacheAllImages: true, onlyRenderCachedAttachments: false, renderCap: 0 }, imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' } });
  const original = structuredClone(record), requests = [], mounts = [];
  const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
  group.appendChild(markup); group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
  global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
  Object.assign(plugin, {
    style: { edited: 'edited' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
    menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
    getSingleDiscordClass: () => 'missing', formatMarkup: () => fakeNode('div'),
    mountLoggerNativeDocument: (host, renderMessage, display, source, onError, options) => mounts.push({ host, url: display.url, options }),
    cleanupLoggerNativeDocumentRoots() {}, fetchMediaNetworkResponse: async url => { requests.push(url); return { ok: false, release() {} }; }
  });
  try {
    plugin.populateParent(root, ['m']);
    for (let i = 0; i < 2; i++) {
      const context = mounts[i].options.ownedProbeContext;
      assert.ok(context);
      const release = plugin.acquireSavedInlineTextAttachmentProbe(context);
      await plugin._savedInlineTextAttachmentProbeInFlight.values().next().value.promise;
      assert.equal(plugin.revalidateOwnedRemovedTextProbeContext(context), null, 'prior host source is no longer current');
      release();
    }
    assert.deepEqual(requests, [attachment.url, attachment.proxy_url]);
    assert.equal(mounts[2].url, 'blob://local/file');
    assert.equal(mounts[2].options.ownedProbeContext, null);
    assert.deepEqual(record, original);
  } finally { global.document = previousDocument; global.BdApi.Net = oldNet; }
});

test('Logger hidden deleted record retains removed text CDN to proxy to Blob fallback', async () => {
  const previousDocument = global.document, oldNet = global.BdApi.Net;
  global.BdApi.Net = { fetch() {} };
  const attachment = { id: '111111111111111111', filename: 'file.txt', url: 'https://cdn.discordapp.com/attachments/c/111111111111111111/file.txt', proxy_url: 'https://media.discordapp.net/attachments/c/111111111111111111/file.txt' };
  const message = { id: 'm', channel_id: 'c', content: 'text', attachments: [] };
  const record = { message, delete_data: { time: 1, hidden: true }, edit_history: [], removed_attachments: [attachment] };
  const plugin = createPlugin({ __started: true, _startupGeneration: 1, messageRecord: { m: record }, settings: { cacheAllImages: true, onlyRenderCachedAttachments: false, renderCap: 0 }, imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' } });
  const original = structuredClone(record), requests = [], mounts = [];
  const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
  group.appendChild(markup); group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
  global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
  Object.assign(plugin, {
    style: { edited: 'edited' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
    menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
    getSingleDiscordClass: () => 'missing', formatMarkup: () => fakeNode('div'),
    mountLoggerNativeDocument: (host, renderMessage, display, source, onError, options) => mounts.push({ host, url: display.url, options }),
    cleanupLoggerNativeDocumentRoots() {}, fetchMediaNetworkResponse: async url => { requests.push(url); return { ok: false, release() {} }; }
  });
  try {
    plugin.populateParent(root, ['m']);
    for (let i = 0; i < 2; i++) {
      const context = mounts[i].options.ownedProbeContext;
      assert.ok(context);
      const release = plugin.acquireSavedInlineTextAttachmentProbe(context);
      await plugin._savedInlineTextAttachmentProbeInFlight.values().next().value.promise;
      assert.equal(plugin.revalidateOwnedRemovedTextProbeContext(context), null, 'prior host source is no longer current');
      release();
    }
    assert.deepEqual(requests, [attachment.url, attachment.proxy_url]);
    assert.equal(mounts[2].url, 'blob://local/file');
    assert.equal(mounts[2].options.ownedProbeContext, null);
    assert.deepEqual(record, original);
  } finally { global.document = previousDocument; global.BdApi.Net = oldNet; }
});

test('mounted inline removed text with no Blob restores marker after proxy failure', async () => {
  const h = createInlineNativeHarness('attachment'), oldNet = global.BdApi.Net;
  global.BdApi.Net = { fetch() {} };
  try {
    h.attachment.filename = 'file.txt';
    h.attachment.url = 'https://cdn.discordapp.com/attachments/c/111111111111111111/file.txt';
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.txt';
    h.plugin.imageCacheServerSimulator = { _resolveImagePath: () => null, get: () => { throw Error('unexpected local read'); } };
    h.plugin.fetchMediaNetworkResponse = async () => ({ ok: false, release() {} });
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    for (let i = 0; i < 2; i++) {
      const release = h.plugin.acquireSavedInlineTextAttachmentProbe(h.mounts[i].options.ownedProbeContext);
      await h.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value.promise;
      release();
      const next = h.render();
      if (i === 1) assert.equal(next, 'original marker');
    }
    assert.equal(h.mounts.length, 2);
  } finally { h.unmount(); h.flush(); h.restore(); global.BdApi.Net = oldNet; }
});

test('inline removed text rebinds its probe when edited record becomes deleted', async () => {
  const h = createInlineNativeHarness('attachment'), oldNet = global.BdApi.Net;
  global.BdApi.Net = { fetch() {} };
  try {
    h.attachment.filename = 'file.txt';
    h.attachment.url = 'https://cdn.discordapp.com/attachments/c/111111111111111111/file.txt';
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.txt';
    h.plugin.fetchMediaNetworkResponse = async () => ({ ok: false, release() {} });
    let coordinated = 0;
    h.plugin.coordinateSavedAttachmentMediaFailure = () => { coordinated++; return { plan: { action: 'remote', url: h.attachment.proxy_url } }; };
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    const oldContext = h.mounts[0].options.ownedProbeContext;
    h.record.delete_data = { time: 1 };
    assert.equal(h.plugin.revalidateOwnedRemovedTextProbeContext(oldContext), null);
    h.render();
    const nextContext = h.mounts[1].options.ownedProbeContext;
    assert.equal(nextContext.deleted, true);
    const release = h.plugin.acquireSavedInlineTextAttachmentProbe(nextContext);
    await h.plugin._savedInlineTextAttachmentProbeInFlight.values().next().value.promise;
    h.render();
    assert.equal(coordinated, 1);
    assert.equal(h.mounts[2].attachment.url, h.attachment.proxy_url);
    release();
  } finally { h.unmount(); h.flush(); h.restore(); global.BdApi.Net = oldNet; }
});

test('inline audio continuation rebinds to the displayed proxy after canonical record replacement', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.mp3';
    h.plugin.imageCacheServerSimulator = { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/audio' };
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    h.render({ url: plan.url, presentationPlan: plan });
    const event = { target: { tagName: 'AUDIO' } };
    h.mounts[0].onError(event, plan.url);
    h.render();
    const oldProxyMount = h.mounts[1];
    assert.equal(oldProxyMount.url, h.attachment.proxy_url);
    const replacement = structuredClone(h.record);
    h.plugin.messageRecord.m = replacement;
    h.render({ record: replacement, attachment: replacement.removed_attachments[0] });
    const newProxyMount = h.mounts[2];
    assert.equal(newProxyMount.url, replacement.removed_attachments[0].proxy_url);
    oldProxyMount.onError(event, oldProxyMount.url);
    assert.equal(h.mounts.length, 3);
    newProxyMount.onError(event, newProxyMount.url);
    h.render();
    assert.equal(h.mounts[3].url, 'blob://local/audio');
  } finally { h.unmount(); h.flush(); h.restore(); }
});

test('inline audio continuation rebinds after startup generation changes at the proxy', () => {
  const h = createInlineNativeHarness('audio');
  try {
    h.attachment.proxy_url = 'https://media.discordapp.net/attachments/c/111111111111111111/file.mp3';
    h.plugin.imageCacheServerSimulator = { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/audio' };
    const plan = h.plugin.getSavedAttachmentPresentationPlan(h.attachment, h.message, { allowRemote: true });
    const event = { target: { tagName: 'AUDIO' } };
    h.render({ url: plan.url, presentationPlan: plan });
    h.mounts[0].onError(event, plan.url);
    h.render();
    const old = h.mounts[1];
    h.plugin._startupGeneration++;
    h.render();
    const current = h.mounts[2];
    old.onError(event, old.url);
    current.onError(event, current.url);
    h.render();
    assert.equal(h.mounts[3].url, 'blob://local/audio');
  } finally { h.unmount(); h.flush(); h.restore(); }
});

async function exerciseRetainedCapabilityUpgrade(mediaType, invalidate = null) {
  const h = createInlineNativeHarness(mediaType);
  const previousCreateRoot = ReactDOM.createRoot;
  const previousGetModule = Webpack.getModule;
  const previousFilter = Webpack.Filters.byPrototypeKeys;
  const roots = mediaType === 'audio' ? h.plugin._loggerNativeAudioRoots : h.plugin._loggerNativeDocumentRoots;
  const unrelated = fakeNode('div');
  let unrelatedUnmounts = 0, previousUnmounts = 0, nativeMounts = 0, mountCalls = 0, removedListeners = 0, resolveLoad;
  let active = true, ready = false;
  const session = { isActive: () => active, owns: () => true, isOwnerActive: () => false };
  const owner = { buildSerial: 1, builtRevision: 'revision', revision: () => 'revision' };
  h.plugin._viewportSession = session;
  roots.set(unrelated, { host: unrelated, root: { unmount() { unrelatedUnmounts++; } } });
  const createElement = h.document.createElement;
  h.document.createElement = tag => {
    const node = createElement(tag);
    node.removeEventListener = () => { removedListeners++; };
    if (tag === 'div') roots.set(node, { host: node, root: { unmount() { previousUnmounts++; } } });
    return node;
  };
  const pending = new Promise(resolve => { resolveLoad = resolve; });
  const proto = Object.getPrototypeOf(h.plugin);
  ReactDOM.createRoot = () => ({ render() { nativeMounts++; }, unmount() {} });
  Webpack.Filters.byPrototypeKeys = () => () => true;
  Webpack.getModule = () => function MessageAccessories() {};
  global.document = h.document;
  if (mediaType === 'audio') {
    h.plugin.resolveLoggerNativeAudioPlayer = () => ready ? function Player() {} : null;
    h.plugin.ensureLoggerNativeAudioPlayer = () => pending;
    h.plugin.createLoggerNativeAudioProps = () => ({});
    h.plugin.cleanupLoggerNativeAudioRoots = proto.cleanupLoggerNativeAudioRoots.bind(h.plugin);
    h.plugin.mountLoggerNativeAudio = (...args) => { mountCalls++; return proto.mountLoggerNativeAudio.apply(h.plugin, args); };
  } else {
    h.plugin.tools = { getChannel: () => ({ id: 'c' }) };
    h.plugin.resolveLoggerNativeDocumentMessageClass = () => ready ? function Message() {} : null;
    h.plugin.ensureLoggerNativeDocumentMessageClass = () => pending;
    h.plugin.createLoggerNativeDocumentMessage = () => ({});
    h.plugin.createLoggerNativeDocumentProps = () => ({});
    h.plugin.createLoggerNativeDocumentErrorBoundary = () => function Boundary() {};
    h.plugin.getSavedInlineTextAttachmentProbeContext = () => null;
    h.plugin.wrapSavedInlineTextAttachmentProbeRender = value => value;
    h.plugin.cleanupLoggerNativeDocumentRoots = proto.cleanupLoggerNativeDocumentRoots.bind(h.plugin);
    h.plugin.mountLoggerNativeDocument = (...args) => { mountCalls++; return proto.mountLoggerNativeDocument.apply(h.plugin, args); };
  }
  try {
    h.render({ owner });
    const inner = h.outer.children[0];
    assert.equal(mountCalls, 1);
    assert.equal(previousUnmounts, 1, `${mediaType} replaces its existing exact host root`);
    assert.equal(unrelatedUnmounts, 0);
    const previousRemovedListeners = removedListeners;
    active = false;
    inner.isConnected = false;
    ready = true;
    resolveLoad(function Ready() {});
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(mountCalls, 1, `${mediaType} is suspended while parked`);
    assert.equal(nativeMounts, 0);
    assert.equal(owner.nativePendingDisplay?.length, 1);
    if (invalidate === 'record') h.plugin.messageRecord.m = { ...h.record };
    if (invalidate === 'reset') h.plugin._viewportSession = null;
    if (invalidate === 'unmount') { h.unmount(); h.flush(); }
    active = true;
    if (invalidate !== 'unmount') inner.isConnected = true;
    for (const callback of owner.nativePendingDisplay.splice(0)) callback();
    const expected = invalidate ? 1 : 2;
    assert.equal(mountCalls, expected, `${mediaType} ${invalidate || 'resume'}`);
    assert.equal(nativeMounts, invalidate ? 0 : 1);
    assert.equal(unrelatedUnmounts, 0);
    if (!invalidate) {
      assert.ok(roots.get(inner)?.root, `${mediaType} installed its native root`);
      assert.equal(owner.nativePendingDisplay.length, 0);
      if (mediaType === 'audio') assert.ok(removedListeners > previousRemovedListeners, 'fallback listener was removed on upgrade');
    }
  } finally {
    h.unmount(); h.flush(); h.restore();
    if (previousCreateRoot === undefined) delete ReactDOM.createRoot; else ReactDOM.createRoot = previousCreateRoot;
    if (previousGetModule === undefined) delete Webpack.getModule; else Webpack.getModule = previousGetModule;
    if (previousFilter === undefined) delete Webpack.Filters.byPrototypeKeys; else Webpack.Filters.byPrototypeKeys = previousFilter;
  }
}

test('retained native audio and document capabilities upgrade once on resume and ignore stale owners', async () => {
  for (const mediaType of ['audio', 'attachment']) {
    for (const invalidate of [null, 'record', 'reset', 'unmount']) {
      await exerciseRetainedCapabilityUpgrade(mediaType, invalidate);
    }
  }
});
