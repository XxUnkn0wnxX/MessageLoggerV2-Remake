const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContextMenu,
  createPlugin,
  loggerEvents,
  resetHarness
} = require('./helpers/plugin-harness');

const MESSAGE_ID = '100000000000000001';
const CHANNEL_ID = '100000000000000002';
const ATTACHMENT_ID = '200000000000000001';

test.beforeEach(() => {
  resetHarness();
});

function createRecord({
  deleted = true,
  extension = 'png',
  attachmentId = ATTACHMENT_ID,
  hidden = false,
  url = `https://cdn.discordapp.com/attachments/${CHANNEL_ID}/${attachmentId}/media.${extension}`
} = {}) {
  return {
    message: {
      id: MESSAGE_ID,
      channel_id: CHANNEL_ID,
      attachments: [{
        id: attachmentId,
        filename: `media.${extension}`,
        url,
        proxy_url: url,
        hidden
      }],
      embeds: [],
      components: [],
      sticker_items: []
    },
    ...(deleted ? { delete_data: { time: Date.now() } } : {})
  };
}

function createImage({
  id = ATTACHMENT_ID,
  messageId = MESSAGE_ID,
  source = 'blob:logger-image',
  errorClass = false,
  ...overrides
} = {}) {
  return {
    tagName: 'IMG',
    id,
    messageId,
    currentSrc: source,
    src: source,
    classList: {
      contains: className => errorClass && className === 'image-error'
    },
    closest: () => null,
    ...overrides
  };
}

function installCachedFiles(plugin, mappings = []) {
  const paths = new Map();
  const files = new Map();
  const reads = [];
  for (const mapping of mappings) {
    paths.set(`${mapping.cacheId}${mapping.extension}`, mapping.path);
    files.set(mapping.path, mapping.bytes ?? Buffer.from([1, 2, 3]));
  }
  plugin.nodeModules = {
    ...(plugin.nodeModules || {}),
    fs: {
      existsSync: path => files.has(path),
      readFileSync(path, encoding) {
        reads.push(`${path}:${encoding === undefined ? 'default' : String(encoding)}`);
        if (!files.has(path)) throw new Error(`Missing test cache file: ${path}`);
        const file = files.get(path);
        if (encoding === null) return file;
        return Buffer.from(file).toString('binary');
      }
    }
  };
  plugin.imageCacheServerSimulator = {
    ...(plugin.imageCacheServerSimulator || {}),
    _resolveImagePath: (cacheId, extension) => paths.get(`${cacheId}${extension}`) || null
  };
  return { files, paths, reads };
}

function createNativeCopyItem(overrides = {}) {
  return {
    props: {
      id: 'message-copy-image',
      label: 'Copy image',
      action() {},
      ...overrides
    }
  };
}

function flattenMenuItems(value, result = [], seen = new Set()) {
  if (value == null || typeof value === 'boolean') return result;
  if (Array.isArray(value)) {
    value.forEach(item => flattenMenuItems(item, result, seen));
    return result;
  }
  if (typeof value !== 'object' || seen.has(value)) return result;
  seen.add(value);
  const props = value.props || value;
  if (typeof props.id === 'string') result.push(props);
  flattenMenuItems(props.children, result, seen);
  return result;
}

function installContextMenuBuilder() {
  const calls = [];
  ContextMenu.buildMenuChildren = setup => {
    calls.push(setup);
    return setup.map(config => {
      assert.equal(config?.props, undefined, 'menu builder must receive raw config, not a built React element');
      if (config.type === 'group') {
        return {
          props: {
            children: config.items.map(item => ({ props: { ...item } }))
          }
        };
      }
      return { props: { ...config } };
    });
  };
  return calls;
}

test('clipboard descriptors require an owned, non-placeholder image and a physical local file', () => {
  const localPath = '/tmp/cache/media.png';
  const plugin = createPlugin({
    style: { imageError: 'image-error' },
    errorImage: 'data:image/png;base64,error',
    settings: { cacheAllImages: true }
  });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: localPath
  }]);
  const record = createRecord();

  assert.deepEqual(plugin.getClipboardMediaSource(createImage(), record), {
    localPath,
    source: 'blob:logger-image',
    extension: '.png',
    copyMode: 'image'
  });

  const remoteSource = `${record.message.attachments[0].url}?width=640`;
  assert.deepEqual(plugin.getClipboardMediaSource(createImage({
    id: '',
    messageId: undefined,
    source: remoteSource
  }), record), {
    localPath,
    source: remoteSource,
    extension: '.png',
    copyMode: 'image'
  });

  const wrappedImage = createImage();
  const wrapper = {
    tagName: 'A',
    querySelectorAll: selector => selector === 'img' ? [wrappedImage] : [],
    querySelector: () => wrappedImage,
    parentElement: null
  };
  assert.equal(plugin.getClipboardMediaSource(wrapper, record)?.localPath, localPath);

  assert.equal(plugin.getClipboardMediaSource(createImage({
    id: 'avatar',
    messageId: undefined,
    source: 'https://cdn.discordapp.com/avatars/user/avatar.png'
  }), record), null);
  assert.equal(plugin.getClipboardMediaSource(createImage({ errorClass: true }), record), null);
  assert.equal(plugin.getClipboardMediaSource(createImage({
    source: 'file:///tmp/cache/media.png'
  }), record), null);

  const hiddenRecord = createRecord({ hidden: true });
  assert.equal(plugin.getClipboardMediaSource(createImage(), hiddenRecord), null);

  const missingPlugin = createPlugin({ settings: { cacheAllImages: true } });
  installCachedFiles(missingPlugin);
  assert.equal(missingPlugin.getClipboardMediaSource(createImage(), record), null);

  const disabledPlugin = createPlugin({ settings: { cacheAllImages: false } });
  installCachedFiles(disabledPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: localPath
  }]);
  assert.equal(disabledPlugin.getClipboardMediaSource(createImage(), record), null);
});

test('clipboard eligibility is limited to normal cached image formats and ignores the all-files toggle', () => {
  const extensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'avif', 'tif', 'tiff'];
  for (const extension of extensions) {
    const plugin = createPlugin({
      settings: {
        cacheAllImages: true,
        newSaveAllFileTypes: true
      }
    });
    const record = createRecord({ extension });
    const path = `/tmp/cache/media.${extension}`;
    installCachedFiles(plugin, [{
      cacheId: ATTACHMENT_ID,
      extension: `.${extension}`,
      path
    }]);
    const descriptor = plugin.getClipboardMediaSource(createImage(), record);
    assert.equal(descriptor?.localPath, path, extension);
    assert.equal(descriptor?.copyMode, extension === 'gif' ? 'file' : 'image', extension);
  }

  const videoPlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: true
    }
  });
  const videoRecord = createRecord({ extension: 'mp4' });
  installCachedFiles(videoPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.mp4',
    path: '/tmp/cache/media.mp4'
  }]);
  assert.equal(videoPlugin.getClipboardMediaSource(createImage({
    source: videoRecord.message.attachments[0].url
  }), videoRecord), null);

  const componentFileId = '300000000000000001';
  const componentPlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: true
    }
  });
  const componentRecord = createRecord();
  componentRecord.message.attachments = [];
  componentRecord.message.components = [{
    type: 13,
    file: {
      attachment_id: componentFileId,
      content_type: 'image/png',
      url: `https://cdn.discordapp.com/attachments/${CHANNEL_ID}/${componentFileId}/component.png`
    }
  }];
  installCachedFiles(componentPlugin, [{
    cacheId: componentFileId,
    extension: '.png',
    path: '/tmp/cache/component.png'
  }]);
  assert.equal(componentPlugin.getClipboardMediaSource(createImage({
    id: componentFileId,
    source: componentRecord.message.components[0].file.url
  }), componentRecord), null);
});

test('clipboard writes static images as image data and GIFs as the original local file', async () => {
  const originalDiscordNative = global.DiscordNative;
  const notifications = [];
  const imageWrites = [];
  const fileWrites = [];
  try {
    global.DiscordNative = {
      clipboard: {
        copyImage(bytes, source) {
          imageWrites.push({ bytes: [...bytes], source });
        },
        copyFile(path) {
          fileWrites.push(path);
        }
      }
    };
    const plugin = createPlugin({
      settings: {
        cacheAllImages: true,
        forceLegacyMediaFetching: true
      },
      notifyUser(...args) {
        notifications.push(args);
      }
    });
    plugin.fetchMediaNetworkResponse = () => assert.fail('clipboard must not use media networking');
    plugin.fetchMediaCacheResponse = () => assert.fail('clipboard must not use cache networking');
    const cache = installCachedFiles(plugin, [
      {
        cacheId: ATTACHMENT_ID,
        extension: '.png',
        path: '/tmp/cache/media.png',
        bytes: Buffer.from([4, 5, 6])
      },
      {
        cacheId: ATTACHMENT_ID,
        extension: '.gif',
        path: '/tmp/cache/media.gif',
        bytes: Buffer.from([7, 8, 9])
      }
    ]);

    assert.equal(await plugin.copyMediaToClipboard({
      localPath: '/tmp/cache/media.png',
      copyMode: 'image'
    }), true);
    assert.equal(await plugin.copyMediaToClipboard({
      localPath: '/tmp/cache/media.gif',
      copyMode: 'file'
    }), true);

    assert.deepEqual(imageWrites, [{ bytes: [4, 5, 6], source: 'image.png' }]);
    assert.deepEqual(fileWrites, ['/tmp/cache/media.gif']);
    assert.deepEqual(cache.reads, ['/tmp/cache/media.png:null']);
    assert.equal(cache.reads[0].endsWith(':null'), true, 'static image copy must read as binary');
    assert.deepEqual(notifications, [
      ['Image was copied to the Clipboard', { type: 'success' }],
      ['Media was copied to the Clipboard', { type: 'success' }]
    ]);
  } finally {
    if (originalDiscordNative === undefined) delete global.DiscordNative;
    else global.DiscordNative = originalDiscordNative;
  }
});

test('clipboard failures produce one error report and never a success toast', async () => {
  const originalDiscordNative = global.DiscordNative;
  const notifications = [];
  let writes = 0;
  try {
    global.DiscordNative = {
      clipboard: {
        copyImage() {
          writes++;
        },
        copyFile() {
          writes++;
        }
      }
    };
    const plugin = createPlugin({
      notifyUser(...args) {
        notifications.push(args);
      }
    });
    installCachedFiles(plugin, [{
      cacheId: ATTACHMENT_ID,
      extension: '.png',
      path: '/tmp/cache/empty.png',
      bytes: new Uint8Array(0)
    }]);

    for (const descriptor of [
      { localPath: '/tmp/cache/missing.png', copyMode: 'image' },
      { localPath: '/tmp/cache/empty.png', copyMode: 'image' },
      { localPath: '/tmp/cache/empty.png', copyMode: 'invalid' }
    ]) {
      notifications.length = 0;
      loggerEvents.length = 0;
      assert.equal(await plugin.copyMediaToClipboard(descriptor), false);
      assert.equal(writes, 0);
      assert.deepEqual(notifications, [[
        'Failed to copy. Details in the console.',
        { type: 'error' }
      ]]);
      assert.equal(loggerEvents.filter(event => event[0] === 'error').length, 1);
      assert.equal(notifications.some(([, options]) => options?.type === 'success'), false);
    }
  } finally {
    if (originalDiscordNative === undefined) delete global.DiscordNative;
    else global.DiscordNative = originalDiscordNative;
  }
});

test('restored live media replaces one native action without touching ordinary messages or avatars', () => {
  const plugin = createPlugin({ settings: { cacheAllImages: true } });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const copied = [];
  plugin.copyMediaToClipboard = descriptor => {
    copied.push(descriptor);
    return Promise.resolve(true);
  };
  const firstAction = () => {};
  const secondAction = () => {};
  const linkAction = () => {};
  const nativeGroup = {
    props: {
      children: [
        createNativeCopyItem({ action: firstAction }),
        createNativeCopyItem({ id: 'copy-image', action: secondAction }),
        {
          props: {
            id: 'copy-image-link',
            label: 'Copy image link',
            action: linkAction
          }
        }
      ]
    }
  };
  const menu = [nativeGroup];
  const tree = { props: { children: menu } };

  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    tree,
    createRecord(),
    createImage(),
    menu
  ), true);
  const items = flattenMenuItems(tree);
  const copyItems = items.filter(item => plugin.isNativeClipboardMediaAction({ props: item }));
  assert.equal(copyItems.length, 1);
  assert.notEqual(copyItems[0].action, firstAction);
  assert.notEqual(copyItems[0].action, secondAction);
  assert.equal(items.find(item => item.id === 'copy-image-link').action, linkAction);
  copyItems[0].action();
  assert.equal(copied.length, 1);
  assert.equal(copied[0].copyMode, 'image');

  const frozenAction = () => {};
  const frozen = {
    props: Object.freeze({
      id: 'copy-image',
      label: 'Copy image',
      action: frozenAction
    })
  };
  const frozenMenu = [frozen];
  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    { props: { children: frozenMenu } },
    createRecord(),
    createImage(),
    frozenMenu
  ), true);
  assert.equal(frozen.props.action, frozenAction);
  assert.notEqual(frozenMenu[0], frozen);

  const ordinary = createNativeCopyItem();
  const ordinaryMenu = [ordinary];
  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    { props: { children: ordinaryMenu } },
    createRecord({ deleted: false }),
    createImage(),
    ordinaryMenu
  ), false);
  assert.equal(ordinaryMenu[0], ordinary);

  const avatar = createNativeCopyItem();
  const avatarMenu = [avatar];
  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    { props: { children: avatarMenu } },
    createRecord(),
    createImage({
      id: 'avatar',
      messageId: undefined,
      source: 'https://cdn.discordapp.com/avatars/user/avatar.png'
    }),
    avatarMenu
  ), false);
  assert.equal(avatarMenu[0], avatar);
});

test('restored owned media hides Discord copy when the cache master or local file gate fails', () => {
  const record = createRecord();
  const disabledPlugin = createPlugin({ settings: { cacheAllImages: false } });
  installCachedFiles(disabledPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const disabledMenu = [createNativeCopyItem()];
  assert.equal(disabledPlugin.replaceNativeSavedMediaCopyAction(
    { props: { children: disabledMenu } },
    record,
    createImage(),
    disabledMenu
  ), true);
  assert.equal(disabledMenu.length, 0);

  const missingPlugin = createPlugin({ settings: { cacheAllImages: true } });
  installCachedFiles(missingPlugin);
  const missingMenu = [createNativeCopyItem()];
  assert.equal(missingPlugin.replaceNativeSavedMediaCopyAction(
    { props: { children: missingMenu } },
    record,
    createImage(),
    missingMenu
  ), true);
  assert.equal(missingMenu.length, 0);

  const errorPlugin = createPlugin({
    style: { imageError: 'image-error' },
    settings: { cacheAllImages: true }
  });
  installCachedFiles(errorPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const errorMenu = [createNativeCopyItem()];
  assert.equal(errorPlugin.replaceNativeSavedMediaCopyAction(
    { props: { children: errorMenu } },
    record,
    createImage({ errorClass: true }),
    errorMenu
  ), true);
  assert.equal(errorMenu.length, 0);
});

test('restored media without a native item gets one real Copy media action using file-copy mode', () => {
  const builderCalls = installContextMenuBuilder();
  const plugin = createPlugin({ settings: { cacheAllImages: true } });
  const copied = [];
  plugin.copyMediaToClipboard = descriptor => {
    copied.push(descriptor);
    return Promise.resolve(true);
  };

  const gifRecord = createRecord({ extension: 'gif' });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.gif',
    path: '/tmp/cache/media.gif'
  }]);
  const gifMenu = [];
  const gifTree = { props: { children: gifMenu } };
  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    gifTree,
    gifRecord,
    createImage({ source: gifRecord.message.attachments[0].url }),
    gifMenu
  ), true);
  assert.equal(builderCalls.length, 1);
  assert.equal(builderCalls[0][0].type, 'group');
  assert.equal(builderCalls[0][0].items[0].id, 'mlv2-copy-media');
  const gifAction = flattenMenuItems(gifTree).find(item => item.id === 'mlv2-copy-media');
  assert.ok(gifAction);
  gifAction.action();
  assert.equal(copied[0].copyMode, 'file');

  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    gifTree,
    gifRecord,
    createImage({ source: gifRecord.message.attachments[0].url }),
    gifMenu
  ), false);
  assert.equal(flattenMenuItems(gifTree).filter(item => item.id === 'mlv2-copy-media').length, 1);

  const staticPlugin = createPlugin({ settings: { cacheAllImages: true } });
  const staticCopied = [];
  staticPlugin.copyMediaToClipboard = descriptor => {
    staticCopied.push(descriptor);
    return Promise.resolve(true);
  };
  installCachedFiles(staticPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const staticMenu = [];
  const staticTree = { props: { children: staticMenu } };
  assert.equal(staticPlugin.replaceNativeSavedMediaCopyAction(
    staticTree,
    createRecord(),
    createImage(),
    staticMenu
  ), true);
  flattenMenuItems(staticTree).find(item => item.id === 'mlv2-copy-media').action();
  assert.equal(staticCopied[0].copyMode, 'file');
});

test('an existing Logger copy action removes a native duplicate before menu reuse', () => {
  const plugin = createPlugin({ settings: { cacheAllImages: true } });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const loggerAction = {
    props: {
      id: 'mlv2-copy-media',
      label: 'Copy media',
      action() {}
    }
  };
  const nativeAction = createNativeCopyItem();
  const menu = [loggerAction, nativeAction];
  const tree = { props: { children: menu } };

  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    tree,
    createRecord(),
    createImage(),
    menu
  ), true);
  assert.equal(menu.length, 1);
  assert.equal(menu[0], loggerAction);
});

test('Logger viewer adds one raw Copy media config only for an eligible cached image', () => {
  const plugin = createPlugin({ settings: { cacheAllImages: true } });
  const copied = [];
  plugin.copyMediaToClipboard = descriptor => {
    copied.push(descriptor);
    return Promise.resolve(true);
  };
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const items = [];
  assert.equal(plugin.addLoggerViewerCopyMediaItem(items, createImage(), createRecord()), true);
  assert.equal(plugin.addLoggerViewerCopyMediaItem(items, createImage(), createRecord()), false);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'mlv2-copy-media');
  assert.equal(items[0].label, 'Copy media');
  assert.equal(items[0].props, undefined, 'viewer menu keeps raw configs for buildMenu');
  items[0].action();
  assert.equal(copied[0].copyMode, 'image');

  const gifPlugin = createPlugin({ settings: { cacheAllImages: true } });
  const gifCopied = [];
  gifPlugin.copyMediaToClipboard = descriptor => {
    gifCopied.push(descriptor);
    return Promise.resolve(true);
  };
  const gifRecord = createRecord({ extension: 'gif' });
  installCachedFiles(gifPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.gif',
    path: '/tmp/cache/media.gif'
  }]);
  const gifItems = [];
  assert.equal(gifPlugin.addLoggerViewerCopyMediaItem(
    gifItems,
    createImage({ source: gifRecord.message.attachments[0].url }),
    gifRecord
  ), true);
  gifItems[0].action();
  assert.equal(gifCopied[0].copyMode, 'file');

  const disabledPlugin = createPlugin({ settings: { cacheAllImages: false } });
  installCachedFiles(disabledPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  assert.equal(disabledPlugin.addLoggerViewerCopyMediaItem([], createImage(), createRecord()), false);

  const videoPlugin = createPlugin({
    settings: {
      cacheAllImages: true,
      newSaveAllFileTypes: true
    }
  });
  const videoRecord = createRecord({ extension: 'mp4' });
  installCachedFiles(videoPlugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.mp4',
    path: '/tmp/cache/media.mp4'
  }]);
  assert.equal(videoPlugin.addLoggerViewerCopyMediaItem(
    [],
    createImage({ source: videoRecord.message.attachments[0].url }),
    videoRecord
  ), false);
});
