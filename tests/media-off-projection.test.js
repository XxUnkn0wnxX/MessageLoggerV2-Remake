const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./helpers/plugin-harness');

const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };

function fakeNode(tag) {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(), children: [], dataset: {}, style: {}, parentElement: null,
    classList: { add: (...values) => values.forEach(value => classes.add(value)), remove() {} },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    insertAdjacentHTML() {}, querySelectorAll() { return []; }, addEventListener() {}
  };
  return node;
}

test('saved media Off projects nested snapshot and component media without changing canonical data or On projection', () => {
  const thumbnail = { type: 11, id: 11, media: { url: 'https://cdn.example/thumbnail.png' } };
  const message = freeze({ id: 'm', channel_id: 'c', content: 'actual text', flags: 32768,
    embeds: [{ title: 'embed', image: { url: 'https://cdn.example/image' } }], attachments: [{ id: 'a', filename: 'a.png', url: 'https://cdn.example/a.png' }],
    sticker_items: [{ id: 's', format_type: 1 }], stickerItems: [{ id: 's' }], stickers: [{ id: 's' }],
    components: [
      { type: 9, id: 9, components: [{ type: 10, id: 10, content: 'kept text', future: 4 }], accessory: thumbnail },
      { type: 9, id: 19, components: [{ type: 10, id: 20, content: 'button text' }], accessory: { type: 2, custom_id: 'button', label: 'Go' } },
      { type: 1, id: 1, components: [{ type: 2, custom_id: 'action', label: 'Action' }] },
      { type: 17, id: 17, components: [{ type: 12, id: 12, items: [] }, { type: 13, id: 13, file: { url: 'https://cdn.example/file' } }, { type: 10, id: 30, content: 'container text' }] },
      { type: 17, id: 18, components: [thumbnail] },
      { type: 99, id: 99, future: { embeds: [{ title: 'unknown field' }] } }
    ],
    message_snapshots: [],
    messageSnapshots: [{ wrapper: 'kept', message: { content: 'forward text', embeds: [{ title: 'forward embed' }], attachments: [{ id: 'nested' }], stickerItems: [{ id: 'nested-sticker' }], components: [{ type: 12, items: [] }, { type: 10, content: 'forward component' }], message_snapshots: [{ message: { content: 'deep', embeds: [{ title: 'deep embed' }], stickers: [{ id: 'deep-sticker' }] } }] } }]
  });
  const before = structuredClone(message);
  const plugin = createPlugin({ settings: { cacheAllImages: false }, imageCacheServerSimulator: { get: () => null } });
  plugin.settings.cacheAllImages = true;
  const onBefore = plugin.getCacheOnlyMessage(message);
  plugin.settings.cacheAllImages = false;
  const off = plugin.getCacheOnlyMessage(message);
  assert.equal(off.content, 'actual text'); assert.equal(off.flags, 32768);
  assert.deepEqual(off.embeds, []); assert.deepEqual(off.attachments, []);
  for (const alias of ['sticker_items', 'stickerItems', 'stickers']) assert.deepEqual(off[alias], []);
  assert.deepEqual(off.components.map(component => component.id), [10, 19, 1, 17, 99]);
  assert.deepEqual(off.components[0], { type: 10, id: 10, content: 'kept text', future: 4 });
  assert.equal(off.components[1].accessory.custom_id, 'button');
  assert.equal(off.components[2].components[0].custom_id, 'action');
  assert.deepEqual(off.components[3].components.map(component => component.id), [30]);
  assert.deepEqual(off.components[4].future.embeds, [{ title: 'unknown field' }]);
  const forward = off.messageSnapshots[0];
  assert.equal(forward.wrapper, 'kept'); assert.equal(forward.message.content, 'forward text');
  assert.deepEqual(forward.message.embeds, []); assert.deepEqual(forward.message.attachments, []); assert.deepEqual(forward.message.stickerItems, []);
  assert.deepEqual(forward.message.components, [{ type: 10, content: 'forward component' }]);
  assert.deepEqual(forward.message.message_snapshots[0].message.embeds, []);
  assert.deepEqual(forward.message.message_snapshots[0].message.stickers, []);
  assert.deepEqual(message, before);
  const dual = { ...structuredClone(message), message_snapshots: [{ message: { content: 'snake', embeds: [{ title: 'snake embed' }] } }] };
  const dualOff = plugin.getCacheOnlyMessage(dual);
  assert.deepEqual(dualOff.message_snapshots[0].message.embeds, []);
  assert.deepEqual(dualOff.messageSnapshots[0].message.embeds, []);
  plugin.settings.cacheAllImages = true;
  const on = plugin.getCacheOnlyMessage(message);
  assert.deepEqual(on, onBefore); assert.equal(on.attachments[0].url, before.attachments[0].url);
  assert.deepEqual(message, before);
});

test('ordinary native messages remain unchanged outside saved-record presentation', () => {
  const message = { id: 'ordinary', channel_id: 'c', content: 'live', embeds: [{ image: { url: 'https://cdn.example/live' } }], components: [{ type: 12, items: [] }] };
  const plugin = createPlugin({ settings: { cacheAllImages: false }, messageRecord: {} });
  assert.strictEqual(plugin.getNativeDeletedAttachmentPresentationMessageForMessageContent(message), message);
  assert.equal(message.embeds.length, 1);
  assert.equal(message.components.length, 1);
});

test('media Off removes only the generated trailing edit block on both rendering surfaces', () => {
  const record = {
    message: { id: 'm', channel_id: 'c', content: 'live content', attachments: [], embeds: [], components: [] },
    edit_history: [], removed_attachments: []
  };
  const plugin = createPlugin({
    messageRecord: { m: record },
    settings: { cacheAllImages: false, newSaveAllFileTypes: false, renderCap: 0 }
  });
  const beforeGenerated = structuredClone(record);
  const oldAttachments = Array.from({ length: 4 }, (_, index) => ({
    id: `removed-${index}`,
    url: `https://cdn.example/removed-${index}.txt`
  }));
  const generated = plugin._getChangedAttachments(oldAttachments, [], 'm', 'c', null).content;
  const generatedAgain = plugin._getChangedAttachments(oldAttachments.map(attachment => ({
    ...attachment,
    id: `${attachment.id}-again`,
    url: attachment.url.replace('removed-', 'removed-again-')
  })), [], 'm', 'c', null).content;
  assert.equal((generated.match(/`Attachment Deleted: `/g) || []).length, 4);
  assert.equal((generatedAgain.match(/`Attachment Deleted: `/g) || []).length, 4);
  assert.deepEqual(record, beforeGenerated);

  const markerOnly = `\n${generated}`;
  const original = 'text before four removals';
  const trailingLf = 'text with a genuine trailing LF\n';
  const trailingCrlf = 'text with a genuine trailing CRLF\r\n';
  const generatedSuffix = text => `${text}\n${generated}`;
  const repeatedSuffix = text => `${text}\n${generated}\n${generatedAgain}`;
  const inline = 'before `Attachment Deleted: `https://example.com/inline.png middle after';
  const leadingMarker = '`Attachment Deleted: `https://example.com/legacy.png\nKeep this text';

  for (const [source, expected] of [
    [generatedSuffix(original), original],
    [generatedSuffix(trailingLf), trailingLf],
    [generatedSuffix(trailingCrlf), trailingCrlf],
    [repeatedSuffix(trailingLf), trailingLf],
    [repeatedSuffix(trailingCrlf), trailingCrlf]
  ]) {
    assert.equal(plugin.projectMediaOffEditHistoryContent(source), expected);
    assert.equal(plugin.getEditHistoryContentSegments(source, [], record.message).map(segment => segment.value).join(''), expected);
  }
  assert.equal(plugin.projectMediaOffEditHistoryContent(markerOnly), '');
  assert.equal(plugin.isSuppressedMediaOnlyEditHistory(markerOnly), true);
  assert.equal(plugin.getEditHistoryContentSegments(inline, [], record.message).map(segment => segment.value).join(''), 'before  middle after');
  assert.equal(plugin.projectMediaOffEditHistoryContent(leadingMarker), leadingMarker);
  assert.equal(plugin.getEditHistoryContentSegments(leadingMarker, [], record.message).map(segment => segment.value).join(''), '\nKeep this text');

  record.edit_history = [
    { content: generatedSuffix(original), time: '123' },
    { content: repeatedSuffix(original), time: '456' },
    { content: generatedSuffix('text after the real edit'), time: '789' },
    { content: repeatedSuffix('text after the real edit'), time: '987' },
    { content: generatedSuffix(trailingLf), time: '100' },
    { content: generatedSuffix(trailingCrlf), time: '111' },
    { content: leadingMarker, time: '222' },
    { content: markerOnly, time: '333' }
  ];
  const before = structuredClone(record);
  freeze(record);
  const expectedVisible = [original, 'text after the real edit', trailingLf, trailingCrlf, '\nKeep this text'];
  const formatted = [];
  const tooltipLabels = [];
  const root = fakeNode('div');
  const group = fakeNode('div');
  const markup = fakeNode('div');
  group.appendChild(markup);
  group.getElementsByClassName = name => name === 'markup' ? [markup] : [];
  const oldDocument = global.document;
  global.document = {
    createElement: fakeNode,
    createTextNode: text => ({ textContent: text }),
    getElementById: () => null
  };
  Object.assign(plugin, {
    style: { edited: 'edited' }, classes: { markup: 'markup' }, multiClasses: { markup: 'markup' },
    menu: { shownMessages: -1 }, getSavedMessage: () => record, createMessageGroup: () => group,
    getSingleDiscordClass: () => 'missing', formatMarkup: text => { formatted.push(text); return fakeNode('div'); },
    Tooltip: function (_node, label) { tooltipLabels.push(label); }, getEditedTimestampClasses: () => '', createTimeStamp: () => '', translatedEdited: 'edited'
  });
  try {
    plugin.populateParent(root, ['m']);
    assert.deepEqual(formatted.slice(0, expectedVisible.length), expectedVisible);
    assert.deepEqual(markup.children.filter(node => node.edit !== undefined).map(node => node.edit), [1, 3, 4, 5, 6]);
    assert.deepEqual(tooltipLabels, ['Edited at 456', 'Edited at 987', 'Edited at 100', 'Edited at 111', 'Edited at 222']);
    assert.deepEqual(record, before);

    plugin.settings.cacheAllImages = true;
    const onProjection = generatedSuffix(original);
    assert.equal(plugin.projectMediaOffEditHistoryContent(onProjection), onProjection);
    assert.equal(plugin.getEditHistoryContentSegments(onProjection, [], record.message).map(segment => segment.value).join(''), onProjection);
    assert.deepEqual(record, before);
  } finally {
    global.document = oldDocument;
  }
});
