const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPlugin: standardPlugin, resetHarness, loggerEvents } = require('./helpers/plugin-harness');
const alternatePath = process.env.MLV2_OWNED_BASELINE;
const RuntimePlugin = alternatePath ? require(alternatePath) : null;
const createPlugin = overrides => RuntimePlugin ? Object.assign(new RuntimePlugin({ name: 'MessageLoggerV2', version: 'test' }), overrides) : standardPlugin(overrides);

function fixture(kind, cached = true) {
  const current = kind === 'audio'
    ? { id: 'current', filename: 'current.mp3', url: 'https://cdn.discordapp.com/attachments/c/current.mp3?sig=one', proxy_url: 'https://media.discordapp.net/attachments/c/current.mp3?sig=one' }
    : { id: 'current', filename: 'current.png', url: 'https://cdn.discordapp.com/attachments/c/current.png?sig=one#part', proxy_url: 'https://media.discordapp.net/attachments/c/current.png?sig=one#part' };
  const removed = { id: 'removed', filename: 'removed.mp4', url: 'https://cdn.discordapp.com/attachments/c/removed.mp4?sig=one', proxy_url: 'https://media.discordapp.net/attachments/c/removed.mp4?sig=one' };
  const sticker = { id: 'sticker', name: 'sticker', format_type: 1 };
  const message = { id: 'm', channel_id: 'c', attachments: [current], sticker_items: [sticker] };
  const record = { message, delete_data: null, edit_history: [], removed_attachments: [removed] };
  const plugin = createPlugin({
    messageRecord: { m: record }, settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
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
function renderLogger(kind, cached = true) {
  const data = fixture(kind, cached);
  const { plugin, record, entry } = data;
  record.edit_history = [];
  const root = fakeNode('div'), group = fakeNode('div'), markup = fakeNode('div');
  group.appendChild(markup);
  group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
  const previousDocument = global.document;
  global.document = { createElement: fakeNode, createTextNode: value => ({ textContent: value }), getElementById: () => null };
  Object.assign(plugin, {
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false, renderCap: 0 },
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
    render() { stateIndex = 0; refIndex = 0; return component({ attachment: entry.attachment, presentationPlan: entry.plan, fallback: 'fallback' }); },
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
  const rendered = renderLogger('removed');
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
  const { plugin, record, entry } = fixture('removed');
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
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false, renderCap: 0 },
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
      const plugin = createPlugin({ messageRecord: { m: record }, settings: { cacheAllImages: true, onlyRenderCachedAttachments: false, renderCap: 0 }, imageCacheServerSimulator: { _resolveImagePath: () => '/cache/file', get: () => 'blob://local/file' } });
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
      settings: { cacheAllImages: availability !== 'master-off', onlyRenderCachedAttachments: false, renderCap: 0 },
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
