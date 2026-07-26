const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPlugin,
  loggerEvents,
  resetHarness
} = require('./helpers/plugin-harness');

test.beforeEach(() => {
  resetHarness();
});

function createRecord({ deleted = true } = {}) {
  return {
    message: {
      id: 'message-1',
      channel_id: 'channel-1',
      attachments: [{ id: 'attachment-1', filename: 'image.png' }],
      embeds: [],
      components: [],
      sticker_items: []
    },
    ...(deleted ? { delete_data: { time: Date.now() } } : {})
  };
}

function createImage(overrides = {}) {
  return {
    tagName: 'IMG',
    id: 'attachment-1',
    messageId: 'message-1',
    currentSrc: 'blob:logger-image',
    src: 'blob:logger-image',
    classList: { contains: () => false },
    closest: () => null,
    ...overrides
  };
}

test('clipboard source resolution accepts only image media owned by the saved record', () => {
  const plugin = createPlugin({
    style: { imageError: 'image-error' },
    errorImage: 'data:image/png;base64,error'
  });
  const record = createRecord();

  assert.equal(plugin.getClipboardMediaSource(createImage(), record), 'blob:logger-image');
  assert.equal(
    plugin.getClipboardMediaSource(createImage({
      messageId: undefined,
      currentSrc: 'https://cdn.discordapp.com/attachments/image.webp',
      src: 'https://cdn.discordapp.com/attachments/image.webp'
    }), record),
    'https://cdn.discordapp.com/attachments/image.webp'
  );
  assert.equal(plugin.getClipboardMediaSource(createImage({ id: 'avatar', messageId: undefined }), record), null);
  assert.equal(plugin.getClipboardMediaSource(createImage({ tagName: 'VIDEO' }), record), null);
  assert.equal(
    plugin.getClipboardMediaSource(createImage({
      classList: { contains: className => className === 'image-error' }
    }), record),
    null
  );
  assert.equal(
    plugin.getClipboardMediaSource(createImage({
      currentSrc: 'file:///tmp/image.png',
      src: 'file:///tmp/image.png'
    }), record),
    null
  );
  const wrappedGif = createImage({
    messageId: undefined,
    currentSrc: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==',
    src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA=='
  });
  const wrapper = {
    tagName: 'A',
    querySelectorAll: selector => selector === 'img' ? [wrappedGif] : [],
    parentElement: null,
    closest: () => null
  };
  assert.equal(
    plugin.getClipboardMediaSource(wrapper, record),
    'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA=='
  );
});

test('clipboard copying keeps local and remote transports independent from the media force setting', async () => {
  const originalFetch = global.fetch;
  const originalNetApi = global.BdApi.Net;
  const originalDiscordNative = global.DiscordNative;
  const rendererUrls = [];
  const nativeUrls = [];
  const writes = [];

  try {
    global.fetch = async url => {
      rendererUrls.push(url);
      return {
        status: 200,
        async arrayBuffer() {
          return Uint8Array.from([1, 2, 3]).buffer;
        }
      };
    };
    global.BdApi.Net = {
      async fetch(url) {
        nativeUrls.push(url);
        return {
          status: 200,
          async arrayBuffer() {
            return Uint8Array.from([4, 5, 6]).buffer;
          }
        };
      }
    };
    global.DiscordNative = {
      clipboard: {
        copyImage(bytes, source) {
          writes.push({ bytes: [...bytes], source });
        }
      }
    };

    for (const forceLegacyMediaFetching of [false, true]) {
      const plugin = createPlugin({ settings: { forceLegacyMediaFetching } });
      plugin.fetchMediaNetworkResponse = () => assert.fail('clipboard must bypass the media transport selector');
      plugin.fetchMediaCacheResponse = () => assert.fail('clipboard must bypass media-cache lifecycle handling');

      assert.equal(await plugin.copyMediaToClipboard('blob:logger-image'), true);
      assert.equal(
        await plugin.copyMediaToClipboard('DATA:image/apng;base64,iVBORw0KGgo='),
        true
      );
      assert.equal(
        await plugin.copyMediaToClipboard('https://cdn.discordapp.com/attachments/remote.webp'),
        true
      );
    }

    assert.deepEqual(rendererUrls, [
      'blob:logger-image',
      'DATA:image/apng;base64,iVBORw0KGgo=',
      'blob:logger-image',
      'DATA:image/apng;base64,iVBORw0KGgo='
    ]);
    assert.deepEqual(nativeUrls, [
      'https://cdn.discordapp.com/attachments/remote.webp',
      'https://cdn.discordapp.com/attachments/remote.webp'
    ]);
    assert.deepEqual(writes, [
      { bytes: [1, 2, 3], source: 'image.png' },
      { bytes: [1, 2, 3], source: 'image.png' },
      { bytes: [4, 5, 6], source: 'image.png' },
      { bytes: [1, 2, 3], source: 'image.png' },
      { bytes: [1, 2, 3], source: 'image.png' },
      { bytes: [4, 5, 6], source: 'image.png' }
    ]);
  } finally {
    global.fetch = originalFetch;
    global.BdApi.Net = originalNetApi;
    if (originalDiscordNative === undefined) delete global.DiscordNative;
    else global.DiscordNative = originalDiscordNative;
  }
});

test('clipboard failures notify once, log once, and never pass missing bytes to Discord', async () => {
  const originalNetApi = global.BdApi.Net;
  const originalDiscordNative = global.DiscordNative;
  const notifications = [];
  let writes = 0;
  const plugin = createPlugin({
    notifyUser(...args) {
      notifications.push(args);
    }
  });

  try {
    global.DiscordNative = {
      clipboard: {
        copyImage() {
          writes++;
        }
      }
    };
    global.BdApi.Net = {
      async fetch() {
        return {
          status: 404,
          async arrayBuffer() {
            assert.fail('a non-200 response body must not be copied');
          }
        };
      }
    };

    assert.equal(await plugin.copyMediaToClipboard('https://example.com/missing.png'), false);
    assert.equal(writes, 0);
    assert.equal(notifications.length, 1);
    assert.deepEqual(notifications[0], [
      'Failed to copy. Details in the console.',
      { type: 'error' }
    ]);
    assert.equal(loggerEvents.filter(event => event[0] === 'error').length, 1);

    notifications.length = 0;
    loggerEvents.length = 0;
    global.BdApi.Net.fetch = async () => {
      throw new Error('network unavailable');
    };
    assert.equal(await plugin.copyMediaToClipboard('https://example.com/failure.png'), false);
    assert.equal(writes, 0);
    assert.equal(notifications.length, 1);
    assert.equal(loggerEvents.filter(event => event[0] === 'error').length, 1);

    notifications.length = 0;
    loggerEvents.length = 0;
    global.BdApi.Net.fetch = async () => ({
      status: 200,
      async arrayBuffer() {
        return new ArrayBuffer(0);
      }
    });
    assert.equal(await plugin.copyMediaToClipboard('https://example.com/empty.png'), false);
    assert.equal(writes, 0);
    assert.equal(notifications.length, 1);
    assert.equal(loggerEvents.filter(event => event[0] === 'error').length, 1);
  } finally {
    global.BdApi.Net = originalNetApi;
    if (originalDiscordNative === undefined) delete global.DiscordNative;
    else global.DiscordNative = originalDiscordNative;
  }
});

test('deleted live messages replace one native media-copy action while ordinary messages stay native', () => {
  const plugin = createPlugin();
  const copiedSources = [];
  plugin.copyMediaToClipboard = source => {
    copiedSources.push(source);
    return Promise.resolve(true);
  };
  const originalAction = () => {};
  const copyItem = {
    props: {
      id: 'message-copy-image',
      label: 'Copy image',
      action: originalAction
    }
  };
  const tree = { props: { children: [{ props: { children: [copyItem] } }] } };
  const image = createImage({
    currentSrc: 'https://cdn.discordapp.com/attachments/deleted.png',
    src: 'https://cdn.discordapp.com/attachments/deleted.png'
  });

  assert.equal(plugin.replaceNativeSavedMediaCopyAction(tree, createRecord(), image), true);
  assert.notEqual(copyItem.props.action, originalAction);
  assert.equal(tree.props.children[0].props.children.length, 1, 'no duplicate action may be added');
  copyItem.props.action();
  assert.deepEqual(copiedSources, ['https://cdn.discordapp.com/attachments/deleted.png']);

  const ordinaryAction = () => {};
  const ordinaryItem = { props: { id: 'copy-image', action: ordinaryAction } };
  const ordinaryTree = { props: { children: [ordinaryItem] } };
  assert.equal(
    plugin.replaceNativeSavedMediaCopyAction(ordinaryTree, createRecord({ deleted: false }), image),
    false
  );
  assert.equal(ordinaryItem.props.action, ordinaryAction);

  const linkAction = () => {};
  const linkItem = { props: { id: 'copy-image-link', label: 'Copy image link', action: linkAction } };
  assert.equal(
    plugin.replaceNativeSavedMediaCopyAction(
      { props: { children: [linkItem] } },
      createRecord(),
      image
    ),
    false
  );
  assert.equal(linkItem.props.action, linkAction);

  const frozenAction = () => {};
  const frozenItem = {
    props: Object.freeze({
      id: 'copy-image',
      label: 'Copy image',
      action: frozenAction
    })
  };
  const frozenChildren = [frozenItem];
  const frozenTree = { props: { children: frozenChildren } };
  assert.equal(plugin.replaceNativeSavedMediaCopyAction(frozenTree, createRecord(), image), true);
  assert.equal(frozenItem.props.action, frozenAction);
  assert.notEqual(frozenChildren[0], frozenItem);
  frozenChildren[0].props.action();
  assert.deepEqual(copiedSources, [
    'https://cdn.discordapp.com/attachments/deleted.png',
    'https://cdn.discordapp.com/attachments/deleted.png'
  ]);
});

test('Logger viewer adds one Copy media action only for supported saved images', () => {
  const plugin = createPlugin();
  const copiedSources = [];
  plugin.copyMediaToClipboard = source => {
    copiedSources.push(source);
    return Promise.resolve(true);
  };
  const record = createRecord();
  const image = createImage();
  const items = [];

  assert.equal(plugin.addLoggerViewerCopyMediaItem(items, image, record), true);
  assert.equal(plugin.addLoggerViewerCopyMediaItem(items, image, record), false);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'mlv2-copy-media');
  assert.equal(items[0].label, 'Copy media');
  items[0].action();
  assert.deepEqual(copiedSources, ['blob:logger-image']);

  assert.equal(
    plugin.addLoggerViewerCopyMediaItem([], createImage({ tagName: 'VIDEO' }), record),
    false
  );
  assert.equal(
    plugin.addLoggerViewerCopyMediaItem([], createImage({ id: 'avatar', messageId: undefined }), record),
    false
  );
});
