const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./helpers/plugin-harness');

const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
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
