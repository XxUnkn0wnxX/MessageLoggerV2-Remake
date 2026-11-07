const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContextMenu,
  createPlugin,
  loggerEvents,
  resetHarness,
  Utils
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

function createImageTarget({
  id = ATTACHMENT_ID,
  messageId = MESSAGE_ID,
  source = 'https://cdn.discordapp.com/attachments/100000000000000002/200000000000000001/media.png',
  safeSrc = source,
  includeHiddenPlaceholder = false,
  ...overrides
} = {}) {
  const image = createImage({ id, messageId, source, ...overrides });
  const hiddenImage = includeHiddenPlaceholder
    ? createImage({
      id: '',
      messageId,
      source,
      classList: {
        contains: () => false
      }
    })
    : null;
  return {
    tagName: 'A',
    dataset: { role: 'img', safeSrc },
    querySelectorAll: selector => {
      if (selector !== 'img') return [];
      return hiddenImage ? [image, hiddenImage] : [image];
    },
    querySelector: selector => selector === 'img' ? image : null,
    getAttribute: name => {
      if (name === 'data-role') return 'img';
      if (name === 'data-safe-src') return safeSrc;
      if (name === 'href') return source;
      return null;
    },
    href: source,
    closest: () => null,
    ...overrides
  };
}

function createRestoredAttachmentTarget({
  attachmentId = ATTACHMENT_ID,
  messageId = MESSAGE_ID,
  channelId = CHANNEL_ID,
  source,
  tagName = 'A',
  children = [],
  textContent = ''
} = {}) {
  const row = { id: `chat-messages-${channelId}-${messageId}` };
  const target = {
    tagName,
    id: attachmentId,
    dataset: {
      ...(attachmentId ? { ml2AttachmentId: attachmentId } : {}),
      ...(source ? { safeSrc: source } : {})
    },
    currentSrc: source,
    src: source,
    href: source,
    textContent,
    getAttribute(name) {
      if (name === 'data-ml2-attachment-id') return attachmentId || null;
      if (name === 'data-safe-src') return source || null;
      if (name === 'href' || name === 'src') return source || null;
      return null;
    },
    closest(selector) {
      if (selector === '[id^="chat-messages-"]') return row;
      if (selector === 'a[href]') return tagName === 'A' ? target : null;
      return null;
    },
    querySelectorAll: selector => (
      selector === 'img, video, audio, a[href], [data-ml2-attachment-id]'
        ? children
        : []
    )
  };
  return target;
}

function createStage4AttachmentBatch() {
  const attachments = [
    ['200000000000000101', 'stage4-image.png', 'image', 'blob:stage4-image'],
    ['200000000000000102', 'stage4-video.mp4', 'video', 'blob:stage4-video'],
    ['200000000000000103', 'stage4-audio.mp3', 'audio', 'blob:stage4-audio'],
    ['200000000000000104', 'stage4-notes.txt', 'text', 'blob:stage4-text'],
    ['200000000000000107', 'stage4-README.md', 'markdown', 'blob:stage4-markdown'],
    ['200000000000000105', 'stage4-guide.pdf', 'pdf', 'blob:stage4-pdf'],
    ['200000000000000106', 'stage4-archive.bin', 'generic', null]
  ].map(([id, filename, kind, blobUrl]) => {
    const extension = filename.slice(filename.lastIndexOf('.'));
    const url = `https://cdn.discordapp.com/attachments/${CHANNEL_ID}/${id}/${filename}`;
    return {
      id,
      filename,
      kind,
      blobUrl,
      extension,
      url,
      proxy_url: url,
      localPath: `/tmp/cache/${filename}`
    };
  });
  const stickers = [
    ['300000000000000101', 'stage4-sticker-one', 'blob:stage4-sticker-one'],
    ['300000000000000102', 'stage4-sticker-two', 'blob:stage4-sticker-two']
  ].map(([id, name, blobUrl]) => ({
    id,
    name,
    format_type: 1,
    filename: `${name}.png`,
    extension: '.png',
    blobUrl,
    url: `https://media.discordapp.net/stickers/${id}.png?size=160`,
    proxy_url: `https://media.discordapp.net/stickers/${id}.png?size=160`,
    localPath: `/tmp/cache/${name}.png`
  }));
  const record = {
    message: {
      id: MESSAGE_ID,
      channel_id: CHANNEL_ID,
      attachments,
      embeds: [],
      components: [],
      sticker_items: stickers.map(({ id, name, format_type }) => ({ id, name, format_type }))
    },
    delete_data: { time: Date.now() }
  };
  const blobUrls = new Map([...attachments, ...stickers]
    .filter(attachment => attachment.blobUrl)
    .map(attachment => [
      `http://localhost:7474/${attachment.id}${attachment.extension}#${CHANNEL_ID},${attachment.id},${MESSAGE_ID}`,
      attachment.blobUrl
    ]));
  return {
    attachments,
    stickers,
    record,
    install(plugin) {
      plugin.imageCacheServerSimulator = {
        get: cacheUrl => blobUrls.get(cacheUrl) || null
      };
      installCachedFiles(plugin, [...attachments, ...stickers].map(attachment => ({
        cacheId: attachment.id,
        extension: attachment.extension,
        path: attachment.localPath
      })));
    },
    targetFor(attachment, tagName = attachment.kind === 'image' ? 'IMG' : 'A') {
      return createRestoredAttachmentTarget({
        attachmentId: attachment.id,
        source: attachment.blobUrl || attachment.url,
        tagName
      });
    },
    stickerTargetFor(sticker, source = sticker.blobUrl || sticker.url) {
      return createRestoredAttachmentTarget({
        attachmentId: sticker.id,
        source,
        tagName: 'IMG'
      });
    }
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

function createNativeOpenItem(overrides = {}) {
  return {
    props: {
      id: 'open-native-link',
      label: 'Open Link',
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
function installContextMenuPatchCapture() {
  const patches = {};
  ContextMenu.patch = (contextName, callback) => {
    const key = typeof contextName === 'string'
      ? contextName
      : `regex:${contextName?.source ?? String(contextName)}`;
    patches[key] = callback;
    return () => {};
  };
  return patches;
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
  const imageTarget = createImageTarget({ source: record.message.attachments[0].url });
  assert.equal(plugin.getClipboardMediaSource(imageTarget, record)?.localPath, localPath);
  assert.equal(
    plugin.getClipboardMediaSource(createImageTarget({
      source: record.message.attachments[0].url,
      includeHiddenPlaceholder: true
    }), record)?.localPath,
    localPath
  );
  const secondAttachmentId = '200000000000000099';
  const secondUrl = `https://cdn.discordapp.com/attachments/${CHANNEL_ID}/${secondAttachmentId}/second.png`;
  const multiRecord = createRecord();
  multiRecord.message.attachments.push({
    id: secondAttachmentId,
    filename: 'second.png',
    url: secondUrl,
    proxy_url: secondUrl
  });
  const multiPlugin = createPlugin({
    style: { imageError: 'image-error' },
    errorImage: 'data:image/png;base64,error',
    settings: { cacheAllImages: true }
  });
  installCachedFiles(multiPlugin, [
    {
      cacheId: ATTACHMENT_ID,
      extension: '.png',
      path: localPath
    },
    {
      cacheId: secondAttachmentId,
      extension: '.png',
      path: '/tmp/cache/second.png'
    }
  ]);
  const firstAnchor = createImageTarget({
    source: multiRecord.message.attachments[0].url
  });
  const nestedAnchorTarget = {
    tagName: 'SPAN',
    closest: selector => selector === 'a[data-role="img"]' ? firstAnchor : null,
    querySelectorAll: selector => selector === 'img'
      ? [createImage({ id: secondAttachmentId, source: secondUrl })]
      : [],
    parentElement: null
  };
  assert.equal(
    multiPlugin.getClipboardMediaSource(nestedAnchorTarget, multiRecord)?.localPath,
    localPath,
    'the exact image overlay must win over unrelated descendant order'
  );
  const ambiguousTarget = {
    tagName: 'DIV',
    closest: () => null,
    querySelectorAll: selector => selector === 'img'
      ? [
        createImage({ id: secondAttachmentId, source: secondUrl }),
        createImage({ source: multiRecord.message.attachments[0].url })
      ]
      : [],
    parentElement: null
  };
  assert.equal(multiPlugin.getClipboardMediaSource(ambiguousTarget, multiRecord), null);
  const ambiguousMenu = [createNativeCopyItem()];
  assert.equal(multiPlugin.replaceNativeSavedMediaCopyAction(
    { props: { children: ambiguousMenu } },
    multiRecord,
    ambiguousTarget,
    ambiguousMenu
  ), true);
  assert.equal(ambiguousMenu.length, 0, 'an ambiguous restored target must not retain a misleading copy row');
  const avatarTarget = createImageTarget({
    source: 'https://cdn.discordapp.com/avatars/user/avatar.png',
    id: 'avatar'
  });
  assert.equal(plugin.getClipboardMediaSource(avatarTarget, record), null);

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

test('clipboard eligibility is limited to Discord-native cached image formats and ignores the all-files toggle', () => {
  const supported = ['jpg', 'jpeg', 'png'];
  const unsupported = ['gif', 'bmp', 'webp', 'avif', 'tif', 'tiff'];
  for (const extension of supported) {
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
    assert.equal(descriptor?.copyMode, 'image', extension);
  }

  for (const extension of unsupported) {
    const plugin = createPlugin({
      settings: {
        cacheAllImages: true,
        newSaveAllFileTypes: true
      }
    });
    const record = createRecord({ extension });
    installCachedFiles(plugin, [{
      cacheId: ATTACHMENT_ID,
      extension: `.${extension}`,
      path: `/tmp/cache/media.${extension}`
    }]);
    assert.equal(plugin.getClipboardMediaSource(createImage(), record), null, extension);
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

test('clipboard writes static images as image data only', async () => {
  const originalDiscordNative = global.DiscordNative;
  const notifications = [];
  const imageWrites = [];
  try {
    global.DiscordNative = {
      clipboard: {
        copyImage(bytes, source) {
          imageWrites.push({ bytes: [...bytes], source });
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
      }
    ]);

    assert.equal(await plugin.copyMediaToClipboard({
      localPath: '/tmp/cache/media.png',
      copyMode: 'image'
    }), true);
    assert.equal(await plugin.copyMediaToClipboard({
      localPath: '/tmp/cache/media.png',
      copyMode: 'file'
    }), false);

    assert.deepEqual(imageWrites, [{ bytes: [4, 5, 6], source: 'image.png' }]);
    assert.deepEqual(cache.reads, ['/tmp/cache/media.png:null']);
    assert.equal(cache.reads[0].endsWith(':null'), true, 'static image copy must read as binary');
    assert.deepEqual(notifications, [
      ['Image was copied to the Clipboard', { type: 'success' }],
      ['Failed to copy. Details in the console.', { type: 'error' }]
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

test('saved-image external open reconciliation preserves labels while rerouting exact native and ImageUtilities actions', () => {
  const descriptor = {
    remote_urls: ['https://cdn.discordapp.com/attachments/channel/attachment/media.png'],
    local_path: '/tmp/cache/media.png',
    display_url: 'blob:logger-image'
  };
  const opened = [];
  let closed = 0;
  ContextMenu.close = () => { closed++; };
  const plugin = createPlugin({
    openSavedAttachmentDescriptor(value) {
      opened.push(value);
      return Promise.resolve(true);
    }
  });

  const originalNativeAction = () => {};
  const originalNativeBrowserAction = () => {};
  const originalImageUtilitiesAction = () => {};
  const unrelatedAction = () => {};
  const menu = [
    {
      props: {
        id: 'mlv2-open-saved-media-externally',
        label: 'Open attachment externally',
        action() {}
      }
    },
    createNativeOpenItem({ action: originalNativeAction }),
    createNativeOpenItem({
      id: 'open-in-browser',
      action: originalNativeBrowserAction
    }),
    createNativeOpenItem({
      id: 'imageutilities-open-link',
      action: originalImageUtilitiesAction
    }),
    createNativeOpenItem({
      id: 'another-plugin-open-link',
      action: unrelatedAction
    }),
    {
      props: {
        id: 'mlv2-open-saved-media-externally',
        label: 'Open attachment externally',
        action() {}
      }
    }
  ];
  const tree = { props: { children: menu } };

  assert.equal(plugin.reconcileSavedAttachmentOpenActions(tree, descriptor), true);
  const items = flattenMenuItems(tree);
  assert.equal(items.filter(item => item.id === 'mlv2-open-saved-media-externally').length, 0);
  const nativeItems = items.filter(item => plugin.isDiscordNativeSavedAttachmentOpenAction({ props: item }));
  assert.equal(nativeItems.length, 2);
  assert.equal(nativeItems[0].label, 'Open Link');
  assert.equal(nativeItems[1].label, 'Open Link');
  assert.notEqual(nativeItems[0].action, originalNativeAction);
  assert.notEqual(nativeItems[1].action, originalNativeBrowserAction);
  assert.equal(items.filter(item => plugin.isImageUtilitiesSavedAttachmentOpenAction({ props: item })).length, 1);
  const imageUtilitiesItem = items.find(item => plugin.isImageUtilitiesSavedAttachmentOpenAction({ props: item }));
  assert.equal(imageUtilitiesItem.label, 'Open Link');
  assert.notEqual(imageUtilitiesItem.action, originalImageUtilitiesAction);
  assert.equal(items.find(item => item.id === 'another-plugin-open-link').action, unrelatedAction);
  nativeItems[0].action();
  imageUtilitiesItem.action();
  assert.equal(closed, 2);
  assert.deepEqual(
    opened,
    [descriptor, descriptor],
    'each routed action must pass the trusted descriptor, not its Blob display URL'
  );
  assert.equal(menu.length, 4);

  const imageUtilitiesMenu = [createNativeOpenItem({
    id: 'imageutilities-open-link',
    action: originalImageUtilitiesAction
  })];
  imageUtilitiesMenu.push({
    props: {
      id: 'open-in-browser',
      label: 'Open in Browser',
      action: originalNativeAction
    }
  });
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(
    { props: { children: imageUtilitiesMenu } },
    descriptor
  ), true);
  assert.equal(imageUtilitiesMenu[0].props.label, 'Open Link');
  assert.notEqual(imageUtilitiesMenu[0].props.action, originalImageUtilitiesAction);
  assert.equal(imageUtilitiesMenu[1].props.label, 'Open in Browser');
  assert.notEqual(imageUtilitiesMenu[1].props.action, originalNativeAction);

  assert.equal(plugin.isDiscordNativeSavedAttachmentOpenAction({
    props: { label: 'Open in Browser', id: 'open-in-browser', action() {} }
  }), true);
  assert.equal(plugin.isImageUtilitiesSavedAttachmentOpenAction({
    props: { id: 'another-plugin-open-link', label: 'Open Link', action() {} }
  }), false);
});

test('saved-image external open reconciliation does not inject fallback and handles frozen native menus safely', () => {
  const descriptor = { remote_urls: ['https://cdn.example/media.png'] };
  const plugin = createPlugin({
    openSavedAttachmentDescriptor() {
      return Promise.resolve(true);
    }
  });
  const unrelated = createNativeOpenItem({
    id: 'another-plugin-open-link',
    label: 'Other action'
  });
  const fallbackMenu = [
    {
      props: {
        id: 'mlv2-open-saved-media-externally',
        label: 'Open attachment externally',
        action() {}
      }
    },
    unrelated
  ];
  const fallbackTree = { props: { children: fallbackMenu } };

  assert.equal(plugin.reconcileSavedAttachmentOpenActions(fallbackTree, descriptor), true);
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(fallbackTree, descriptor), false);
  let fallbackItems = flattenMenuItems(fallbackTree)
    .filter(item => item.id === 'mlv2-open-saved-attachment');
  assert.equal(fallbackItems.length, 0);
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(fallbackTree, null), false);
  fallbackItems = flattenMenuItems(fallbackTree)
    .filter(item => item.id === 'mlv2-open-saved-attachment');
  assert.equal(fallbackItems.length, 0, 'a reused ordinary menu must not retain Logger-owned fallback state');
  assert.equal(fallbackMenu[fallbackMenu.length - 1], unrelated);

  const originalFrozenAction = () => {};
  const frozenNode = {
    props: Object.freeze({
      id: 'open-native-link',
      label: 'Open Link',
      action: originalFrozenAction
    })
  };
  const mutableParent = [frozenNode];
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(
    { props: { children: mutableParent } },
    descriptor,
    mutableParent
  ), true);
  assert.equal(mutableParent.length, 1);
  assert.equal(mutableParent[0].props.label, 'Open Link');
  assert.notEqual(mutableParent[0].props.action, originalFrozenAction);

  const fullyFrozenNode = {
    props: Object.freeze({
      id: 'open-native-link',
      label: 'Open Link',
      action: originalFrozenAction
    })
  };
  const fullyFrozenMenu = Object.freeze([fullyFrozenNode]);
  const fullyFrozenTree = { props: { children: fullyFrozenMenu } };
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(
    fullyFrozenTree,
    descriptor,
    fullyFrozenMenu
  ), true);
  assert.equal(fullyFrozenMenu[0], fullyFrozenNode);
  assert.equal(fullyFrozenMenu[0].props.action, originalFrozenAction);
  assert.notEqual(fullyFrozenTree.props.children, fullyFrozenMenu);
  assert.equal(fullyFrozenTree.props.children.length, 1);
  assert.equal(fullyFrozenTree.props.children[0].props.label, 'Open Link');
  assert.notEqual(fullyFrozenTree.props.children[0].props.action, originalFrozenAction);

  const originalFrozenImageUtilitiesAction = () => {};
  const frozenImageUtilitiesNode = {
    props: Object.freeze({
      id: 'imageutilities-open-link',
      label: 'Open Link',
      action: originalFrozenImageUtilitiesAction
    })
  };
  const frozenNestedGroup = {
    props: Object.freeze({
      children: Object.freeze([frozenImageUtilitiesNode])
    })
  };
  const frozenNestedMenu = Object.freeze([frozenNestedGroup]);
  const frozenNestedTree = { props: { children: frozenNestedMenu } };
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(frozenNestedTree, descriptor), true);
  const frozenNestedItems = flattenMenuItems(frozenNestedTree);
  const routedImageUtilitiesItem = frozenNestedItems.find(item => (
    plugin.isImageUtilitiesSavedAttachmentOpenAction({ props: item })
  ));
  assert.equal(routedImageUtilitiesItem.label, 'Open Link');
  assert.notEqual(routedImageUtilitiesItem.action, originalFrozenImageUtilitiesAction);
  assert.equal(frozenImageUtilitiesNode.props.label, 'Open Link');
  assert.equal(frozenImageUtilitiesNode.props.action, originalFrozenImageUtilitiesAction);

  const irreducibleTree = Object.freeze({
    props: Object.freeze({ children: Object.freeze([fullyFrozenNode]) })
  });
  assert.equal(plugin.reconcileSavedAttachmentOpenActions(irreducibleTree, descriptor), false);
  assert.equal(irreducibleTree.props.children[0].props.action, originalFrozenAction);
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

test('restored media without a native item never gets a Logger fallback action', () => {
  const plugin = createPlugin({ settings: { cacheAllImages: true } });

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
  ), false);
  assert.equal(flattenMenuItems(gifTree).filter(item => item.id === 'mlv2-copy-media').length, 0);
  assert.equal(gifMenu.length, 0);
  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    gifTree,
    gifRecord,
    createImage({ source: gifRecord.message.attachments[0].url }),
    gifMenu
  ), false);
  assert.equal(flattenMenuItems(gifTree).filter(item => item.id === 'mlv2-copy-media').length, 0);
  assert.equal(gifMenu.length, 0);

  const staticPlugin = createPlugin({ settings: { cacheAllImages: true } });
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
  ), false);
  assert.equal(flattenMenuItems(staticTree).filter(item => item.id === 'mlv2-copy-media').length, 0);
  assert.equal(staticMenu.length, 0);
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
  const originalNativeAction = nativeAction.props.action;
  const menu = [loggerAction, nativeAction];
  const tree = { props: { children: menu } };

  assert.equal(plugin.replaceNativeSavedMediaCopyAction(
    tree,
    createRecord(),
    createImage(),
    menu
  ), true);
  assert.equal(menu.length, 1);
  assert.equal(menu[0], nativeAction);
  assert.notEqual(menu[0].props.action, originalNativeAction);
});

test('dedicated message regex callback updates mounted logger rows only', () => {
  const patchedMenus = installContextMenuPatchCapture();
  const record = createRecord();
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: false
    },
    unpatches: [],
    messageRecord: { [MESSAGE_ID]: record },
    deletedMessageSet: new Map([[CHANNEL_ID, new Set([MESSAGE_ID])]])
  });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);

  const copied = [];
  const opened = [];
  plugin.copyMediaToClipboard = source => {
    copied.push(source);
    return Promise.resolve(true);
  };
  plugin.openSavedAttachmentDescriptor = descriptor => {
    opened.push(descriptor);
    return Promise.resolve(true);
  };
  plugin.patchContextMenus();
  const messageRegexPatch = patchedMenus['regex:^message$'];
  assert.equal(typeof messageRegexPatch, 'function');

  const nativeAction = () => {};
  const nativeOpenAction = () => {};
  const thirdPartyAction = () => {};
  const mountedTarget = createImage({
    closest: selector => selector === '[id^="chat-messages-"]'
      ? { id: `chat-messages-${CHANNEL_ID}-${MESSAGE_ID}` }
      : null
  });
  const mountedMenu = [
    createNativeCopyItem({ action: nativeAction }),
    createNativeOpenItem({ action: nativeOpenAction }),
    {
      props: {
        id: 'third-party-copy-file',
        label: 'Copy image',
        action: thirdPartyAction
      }
    }
  ];
  // Current Discord nests the actual menu array beneath a React navigation node rather than
  // exposing it directly as ret.props.children.
  const mountedTree = { props: { children: { props: { children: mountedMenu } } } };
  messageRegexPatch(mountedTree, {
    message: { id: MESSAGE_ID },
    channel: { id: CHANNEL_ID },
    target: mountedTarget
  });

  const mountedActions = flattenMenuItems(mountedTree)
    .filter(item => item.label === 'Copy image');
  assert.equal(mountedActions.length, 1);
  assert.notEqual(mountedActions[0].action, nativeAction);
  assert.notEqual(mountedActions[0].action, thirdPartyAction);
  mountedActions[0].action();
  assert.equal(copied.length, 1);
  const mountedOpenAction = flattenMenuItems(mountedTree)
    .find(item => item.id === 'open-native-link');
  assert.equal(mountedOpenAction.label, 'Open Link');
  assert.notEqual(mountedOpenAction.action, nativeOpenAction);
  mountedOpenAction.action();
  assert.equal(opened.length, 1);
  assert.equal(opened[0].blob_url, 'blob:logger-image');

  const unmountedMenu = [{
    props: {
      id: 'another-plugin-copy',
      label: 'Copy image',
      action: thirdPartyAction
    }
  }];
  const unmountedTree = { props: { children: unmountedMenu } };
  messageRegexPatch(unmountedTree, {
    message: { id: MESSAGE_ID },
    channel: { id: CHANNEL_ID },
    target: createImage({ closest: () => null })
  });
  assert.equal(unmountedMenu[0].props.action, thirdPartyAction);
  assert.equal(copied.length, 1);
});

test('image-context menu keeps copy action and adds a Message Logger submenu for restored logger images only', () => {
  const patchedMenus = installContextMenuPatchCapture();
  const record = createRecord();
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: false
    },
    unpatches: [],
    messageRecord: { [MESSAGE_ID]: record },
    deletedMessageSet: new Map([[CHANNEL_ID, new Set([MESSAGE_ID])]]),
    purgedMessageSet: new Map()
  });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const copied = [];
  plugin.copyMediaToClipboard = source => {
    copied.push(source);
    return Promise.resolve(true);
  };
  const opened = [];
  plugin.openSavedAttachmentDescriptor = descriptor => {
    opened.push(descriptor);
    return Promise.resolve(true);
  };
  plugin.patchContextMenus();
  installContextMenuBuilder();
  const onOpenImageContext = patchedMenus['regex:^image-context$'];
  assert.equal(typeof onOpenImageContext, 'function');

  const loggerMessageNode = {
    id: `chat-messages-${CHANNEL_ID}-${MESSAGE_ID}`
  };
  const nativeCopyAction = () => {};
  const nativeOpenAction = () => {};
  const menu = [
    createNativeCopyItem({ action: nativeCopyAction }),
    createNativeOpenItem({ action: nativeOpenAction })
  ];
  onOpenImageContext(
    { navId: 'image-context', props: { children: menu } },
    {
      target: createImage({
        source: record.message.attachments[0].url,
        closest: selector => selector === '[id^="chat-messages-"]' ? loggerMessageNode : null
      })
    }
  );
  assert.equal(menu.length, 3);
  const copyItem = menu.find(item => plugin.isNativeClipboardMediaAction(item));
  assert.notEqual(copyItem.props.action, nativeCopyAction);
  copyItem.props.action();
  const nativeOpenItem = menu.find(item => plugin.isDiscordNativeSavedAttachmentOpenAction(item));
  assert.equal(nativeOpenItem.props.label, 'Open Link');
  assert.notEqual(nativeOpenItem.props.action, nativeOpenAction);
  const loggerSubmenuNode = flattenMenuItems(menu).find(item => ['mlv2-message-logger', 'mlv2-image-logger'].includes(item.id));
  assert.notEqual(loggerSubmenuNode, undefined);
  assert.equal(loggerSubmenuNode.label, 'Message Logger');
  const loggerOpenNode = (loggerSubmenuNode?.props?.items || loggerSubmenuNode?.items || []).find(item => {
    const itemProps = item?.props || item || {};
    return itemProps.id === 'mlv2-open-saved-attachment';
  });
  assert.notEqual(loggerOpenNode, undefined);
  const loggerOpenAction = loggerOpenNode?.props?.action || loggerOpenNode?.action;
  assert.equal(typeof loggerOpenAction, 'function');
  assert.notEqual(loggerOpenAction, nativeOpenAction);
  assert.equal(loggerOpenNode.props?.label || loggerOpenNode.label, 'Open Attachment');
  loggerOpenAction();
  nativeOpenItem.props.action();
  assert.equal(copied.length, 1);
  assert.equal(opened.length, 2);
  assert.equal(opened[0].display_url, record.message.attachments[0].url);
  assert.equal(opened[1].display_url, record.message.attachments[0].url);
});

test('batch restored attachments and stickers resolve each exact id and local-only blob source', () => {
  const batch = createStage4AttachmentBatch();
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true
    }
  });
  batch.install(plugin);

  for (const [index, attachment] of batch.attachments.entries()) {
    const descriptor = plugin.getSavedAttachmentOpenDescriptor(
      batch.targetFor(attachment),
      batch.record
    );
    assert.notEqual(descriptor, null, attachment.filename);
    assert.equal(descriptor.attachment_id, attachment.id, attachment.filename);
    assert.equal(descriptor.filename, attachment.filename, attachment.filename);
    assert.equal(descriptor.local_path, attachment.localPath, attachment.filename);
    assert.equal(descriptor.display_url, attachment.blobUrl || attachment.url, attachment.filename);
    assert.equal(descriptor.blob_url, attachment.blobUrl, attachment.filename);
    if (index > 0) {
      assert.notEqual(descriptor.attachment_id, batch.attachments[0].id, attachment.filename);
    }
  }
  for (const [index, sticker] of batch.stickers.entries()) {
    const descriptor = plugin.getSavedAttachmentOpenDescriptor(
      batch.stickerTargetFor(sticker),
      batch.record
    );
    assert.notEqual(descriptor, null, sticker.filename);
    assert.equal(descriptor.attachment_id, sticker.id, sticker.filename);
    assert.equal(descriptor.filename, sticker.filename, sticker.filename);
    assert.equal(descriptor.local_path, sticker.localPath, sticker.filename);
    assert.equal(descriptor.display_url, sticker.blobUrl, sticker.filename);
    assert.equal(descriptor.blob_url, sticker.blobUrl, sticker.filename);
    if (index > 0) {
      assert.notEqual(descriptor.attachment_id, batch.stickers[0].id, sticker.filename);
    }
  }
});

test('saved attachment open targets index marked and unavailable labels without guessing same-name siblings', () => {
  const exactRecord = {
    message: {
      id: MESSAGE_ID,
      channel_id: CHANNEL_ID,
      attachments: [
        {
          id: '200000000000000201',
          filename: 'exact.txt',
          url: 'https://cdn.discordapp.com/attachments/100000000000000002/200000000000000201/exact.txt'
        },
        {
          id: '200000000000000202',
          filename: 'sibling.txt',
          url: 'https://cdn.discordapp.com/attachments/100000000000000002/200000000000000202/sibling.txt'
        }
      ]
    },
    delete_data: { time: Date.now() }
  };
  const exactPlugin = createPlugin({ settings: { cacheAllImages: false } });
  const exactDescriptor = exactPlugin.getSavedAttachmentOpenDescriptor(
    createRestoredAttachmentTarget({
      attachmentId: exactRecord.message.attachments[1].id,
      source: '',
      textContent: '[Not cached: exact.txt]'
    }),
    exactRecord
  );
  assert.equal(exactDescriptor?.attachment_id, exactRecord.message.attachments[1].id);

  const deletedAttachment = {
    id: '200000000000000203',
    filename: 'deleted.txt',
    url: 'https://cdn.discordapp.com/attachments/100000000000000002/200000000000000203/deleted.txt',
    proxy_url: 'https://media.discordapp.net/attachments/100000000000000002/200000000000000203/deleted.txt'
  };
  const deletedRecord = {
    message: { id: MESSAGE_ID, channel_id: CHANNEL_ID, attachments: [deletedAttachment] },
    delete_data: { time: Date.now() }
  };
  const deletedPlugin = createPlugin({
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    imageCacheServerSimulator: { get: () => null, _resolveImagePath: () => null }
  });
  let deletedPlan = deletedPlugin.getSavedAttachmentPresentationPlan(
    deletedAttachment,
    deletedRecord.message,
    { allowRemote: true }
  );
  for (const candidate of deletedPlan.sources) {
    assert.equal(
      deletedPlugin.markSavedAttachmentMediaCandidateFailure(
        deletedAttachment,
        deletedRecord.message,
        candidate
      ),
      true
    );
    deletedPlan = deletedPlugin.getSavedAttachmentPresentationPlan(
      deletedAttachment,
      deletedRecord.message,
      { allowRemote: true }
    );
  }
  assert.equal(deletedPlan.unavailableLabel, '[Deleted: deleted.txt]');
  const deletedDescriptor = deletedPlugin.getSavedAttachmentOpenDescriptor(
    createRestoredAttachmentTarget({
      attachmentId: '',
      source: '',
      textContent: '[Deleted: deleted.txt]'
    }),
    deletedRecord
  );
  assert.equal(deletedDescriptor?.attachment_id, deletedAttachment.id);

  const uniqueRecord = createRecord({ attachmentId: '200000000000000204', extension: 'txt' });
  const uniquePlugin = createPlugin({ settings: { cacheAllImages: false } });
  const uniqueDescriptor = uniquePlugin.getSavedAttachmentOpenDescriptor(
    createRestoredAttachmentTarget({
      attachmentId: '',
      source: '',
      textContent: '[Not cached: media.txt]'
    }),
    uniqueRecord
  );
  assert.equal(uniqueDescriptor?.attachment_id, uniqueRecord.message.attachments[0].id);

  const ambiguousRecord = {
    message: {
      id: MESSAGE_ID,
      channel_id: CHANNEL_ID,
      attachments: [
        {
          id: '200000000000000205',
          filename: 'same.txt',
          url: 'https://cdn.discordapp.com/attachments/100000000000000002/200000000000000205/same.txt'
        },
        {
          id: '200000000000000206',
          filename: 'same.txt',
          url: 'https://cdn.discordapp.com/attachments/100000000000000002/200000000000000206/same.txt'
        }
      ]
    },
    delete_data: { time: Date.now() }
  };
  const ambiguousPlugin = createPlugin({ settings: { cacheAllImages: false } });
  assert.equal(
    ambiguousPlugin.getSavedAttachmentOpenDescriptor(
      createRestoredAttachmentTarget({
        attachmentId: '',
        source: '',
        textContent: '[Not cached: same.txt]'
      }),
      ambiguousRecord
    ),
    null
  );
});

test('batch restored attachment context menus route only the selected sibling and fail closed when ambiguous', () => {
  const patchedMenus = installContextMenuPatchCapture();
  const batch = createStage4AttachmentBatch();
  const opened = [];
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      onlyRenderCachedAttachments: true,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: false
    },
    unpatches: [],
    messageRecord: { [MESSAGE_ID]: batch.record },
    deletedMessageSet: new Map([[CHANNEL_ID, new Set([MESSAGE_ID])]]),
    purgedMessageSet: new Map(),
    openSavedAttachmentDescriptor(descriptor) {
      opened.push(descriptor);
      return Promise.resolve(true);
    }
  });
  batch.install(plugin);
  Utils.findInTree = (node, predicate) => predicate(node) ? node : null;
  installContextMenuBuilder();
  plugin.patchContextMenus();
  const imageContextPatch = patchedMenus['regex:^image-context$'];
  const messageContextPatch = patchedMenus.message;
  const messageRegexPatch = patchedMenus['regex:^message$'];
  assert.equal(typeof imageContextPatch, 'function');
  assert.equal(typeof messageContextPatch, 'function');
  assert.equal(typeof messageRegexPatch, 'function');

  const getLoggerSubmenus = (tree, id) => flattenMenuItems(tree)
    .filter(item => item.id === id && item.label === 'Message Logger');
  const getOpenItems = submenu => (submenu.items || [])
    .filter(item => item.id === 'mlv2-open-saved-attachment');
  const image = batch.attachments.find(attachment => attachment.kind === 'image');
  const imageNativeAction = () => {};
  const imageMenu = [createNativeOpenItem({ action: imageNativeAction })];
  imageContextPatch(
    { navId: 'image-context', props: { children: imageMenu } },
    { target: batch.targetFor(image) }
  );
  const imageSubmenus = getLoggerSubmenus(imageMenu, 'mlv2-image-logger');
  assert.equal(imageSubmenus.length, 1);
  const [imageOpen] = getOpenItems(imageSubmenus[0]);
  assert.equal(getOpenItems(imageSubmenus[0]).length, 1);
  imageOpen.action();
  assert.equal(opened.at(-1).attachment_id, image.id);
  assert.equal(opened.at(-1).display_url, image.blobUrl);

  for (const kind of ['audio', 'text', 'markdown', 'pdf', 'generic']) {
    const attachment = batch.attachments.find(candidate => candidate.kind === kind);
    const target = batch.targetFor(attachment);
    const nativeAction = () => {};
    const menu = [createNativeOpenItem({ action: nativeAction })];
    const tree = { navId: 'message', children: menu, props: { children: menu } };
    const props = {
      message: { id: MESSAGE_ID },
      channel: { id: CHANNEL_ID },
      target
    };

    messageContextPatch(tree, props);
    const submenus = getLoggerSubmenus(tree, 'mlv2-message-logger');
    assert.equal(submenus.length, 1, kind);
    const openItems = getOpenItems(submenus[0]);
    assert.equal(openItems.length, 1, kind);
    openItems[0].action();
    assert.equal(opened.at(-1).attachment_id, attachment.id, kind);

    messageRegexPatch(tree, props);
    messageRegexPatch(tree, props);
    assert.equal(getLoggerSubmenus(tree, 'mlv2-message-logger').length, 1, kind);
    assert.equal(getOpenItems(getLoggerSubmenus(tree, 'mlv2-message-logger')[0]).length, 1, kind);
    const routedNativeItem = flattenMenuItems(tree)
      .find(item => item.id === 'open-native-link');
    assert.notEqual(routedNativeItem.action, nativeAction, kind);
    routedNativeItem.action();
    assert.equal(opened.at(-1).attachment_id, attachment.id, kind);
  }

  const ambiguousTarget = createRestoredAttachmentTarget({
    attachmentId: '',
    source: '',
    children: batch.attachments.slice(0, 2).map(attachment => batch.targetFor(attachment))
  });
  assert.equal(plugin.getSavedAttachmentOpenDescriptor(ambiguousTarget, batch.record), null);
  const ambiguousNativeAction = () => {};
  const ambiguousMenu = [createNativeOpenItem({ action: ambiguousNativeAction })];
  imageContextPatch(
    { navId: 'image-context', props: { children: ambiguousMenu } },
    { target: ambiguousTarget }
  );
  assert.equal(getLoggerSubmenus(ambiguousMenu, 'mlv2-image-logger').length, 0);
  assert.equal(ambiguousMenu[0].props.action, ambiguousNativeAction);
  messageRegexPatch(
    { navId: 'message', props: { children: ambiguousMenu } },
    { message: { id: MESSAGE_ID }, channel: { id: CHANNEL_ID }, target: ambiguousTarget }
  );
  assert.equal(ambiguousMenu[0].props.action, ambiguousNativeAction);
});

test('image-context menu ignores unsupported rows and exact match failures', () => {
  const patchedMenus = installContextMenuPatchCapture();
  const record = createRecord();
  const plugin = createPlugin({
    settings: {
      cacheAllImages: true,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: false
    },
    unpatches: [],
    messageRecord: { [MESSAGE_ID]: record },
    deletedMessageSet: new Map([[CHANNEL_ID, new Set([MESSAGE_ID])]])
  });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  plugin.patchContextMenus();
  const onOpenImageContext = patchedMenus['regex:^image-context$'];
  assert.equal(typeof onOpenImageContext, 'function');
  const unchangedAction = () => {};
  const menu = [createNativeCopyItem({ action: unchangedAction })];
  onOpenImageContext(
    { navId: 'image-context', props: { children: menu } },
    { target: createImage({ closest: () => null }) }
  );
  assert.equal(menu.length, 1);
  assert.equal(menu[0].props.action, unchangedAction);

  const rowMismatchTarget = createImage({
    closest: () => ({ id: `chat-messages-100000000000000000-100000000000000000` })
  });
  const ignoredAction = () => {};
  const mismatchMenu = [createNativeCopyItem({ action: ignoredAction })];
  onOpenImageContext(
    { navId: 'image-context', props: { children: mismatchMenu } },
    { target: rowMismatchTarget }
  );
  assert.equal(mismatchMenu.length, 1);
  assert.equal(mismatchMenu[0].props.action, ignoredAction);

  plugin.settings.showDeletedMessages = false;
  const disabledAction = () => {};
  const disabledMenu = [createNativeCopyItem({ action: disabledAction })];
  onOpenImageContext(
    { navId: 'image-context', props: { children: disabledMenu } },
    {
      target: createImage({
        closest: () => ({ id: `chat-messages-${CHANNEL_ID}-${MESSAGE_ID}` })
      })
    }
  );
  assert.equal(disabledMenu.length, 1);
  assert.equal(disabledMenu[0].props.action, disabledAction);
});

test('image-context uses the separately guarded Logger-owned native-viewer descriptor only', () => {
  const patchedMenus = installContextMenuPatchCapture();
  const descriptor = {
    remote_urls: ['https://cdn.example/viewer.png'],
    display_url: 'https://cdn.example/viewer.png',
    local_path: '/tmp/cache/viewer.png'
  };
  const opened = [];
  let matchingTarget;
  const plugin = createPlugin({
    unpatches: [],
    messageRecord: {},
    deletedMessageSet: new Map(),
    purgedMessageSet: new Map(),
    getLoggerOwnedNativeSavedAttachmentViewerDescriptorForTarget: target => (
      target === matchingTarget ? descriptor : null
    ),
    openSavedAttachmentDescriptor(value) {
      opened.push(value);
      return Promise.resolve(true);
    }
  });
  plugin.patchContextMenus();
  installContextMenuBuilder();
  const imageContextPatch = patchedMenus['regex:^image-context$'];
  const messageContextPatch = patchedMenus['regex:^message$'];
  const matchingDialog = {
    querySelectorAll: selector => selector === 'img, video'
      ? [{ tagName: 'IMG', currentSrc: descriptor.remote_urls[0] }]
      : []
  };
  matchingTarget = createImage({
    source: 'https://cdn.example/matched-target.png',
    closest: selector => selector === '[role=\"dialog\"], [aria-modal=\"true\"]' ? matchingDialog : null
  });
  const originalOpenAction = () => {};
  const viewerMenu = [createNativeOpenItem({ action: originalOpenAction })];

  imageContextPatch(
    { navId: 'image-context', props: { children: viewerMenu } },
    { target: matchingTarget }
  );
  const viewerLoggerSubmenuNode = flattenMenuItems(viewerMenu).find(item => ['mlv2-message-logger', 'mlv2-image-logger'].includes(item.id));
  assert.notEqual(viewerLoggerSubmenuNode, undefined);
  assert.equal(viewerLoggerSubmenuNode.label, 'Message Logger');
  const viewerOpenNode = (viewerLoggerSubmenuNode?.props?.items || viewerLoggerSubmenuNode?.items || []).find(item => {
    const itemProps = item?.props || item || {};
    return itemProps.id === 'mlv2-open-saved-attachment';
  });
  assert.notEqual(viewerOpenNode, undefined);
  const viewerOpenAction = viewerOpenNode?.props?.action || viewerOpenNode?.action;
  assert.equal(typeof viewerOpenAction, 'function');
  assert.notEqual(viewerOpenAction, originalOpenAction);
  viewerOpenAction();
  assert.deepEqual(opened, [descriptor]);

  const ordinaryOpenAction = () => {};
  const ordinaryTarget = createImage({
    source: 'https://cdn.example/ordinary.png',
    closest: () => null
  });
  const ordinaryMenu = [createNativeOpenItem({ action: ordinaryOpenAction })];
  imageContextPatch(
    { navId: 'image-context', props: { children: ordinaryMenu } },
    { target: ordinaryTarget }
  );
  assert.equal(ordinaryMenu[0].props.action, ordinaryOpenAction);
  const ordinaryLoggerSubmenu = flattenMenuItems(ordinaryMenu).find(item => ['mlv2-message-logger', 'mlv2-image-logger'].includes(item.id));
  assert.equal(ordinaryLoggerSubmenu, undefined);

  const ordinaryMessageAction = () => {};
  const ordinaryMessageMenu = [createNativeOpenItem({ action: ordinaryMessageAction })];
  messageContextPatch(
    { navId: 'message', props: { children: ordinaryMessageMenu } },
    { target: matchingTarget, message: { id: MESSAGE_ID }, channel: { id: CHANNEL_ID } }
  );
  assert.equal(
    ordinaryMessageMenu[0].props.action,
    ordinaryMessageAction,
    'the message menu must never fall back to native-viewer ownership'
  );
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
  ), false);
  assert.equal(gifPlugin.getClipboardMediaSource(createImage({
    source: gifRecord.message.attachments[0].url
  }), gifRecord), null);
  assert.equal(gifItems.length, 0);

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

test('Logger viewer adds one raw external-open config only for an exact saved attachment', () => {
  const opened = [];
  let closed = 0;
  ContextMenu.close = () => { closed++; };
  const plugin = createPlugin({
    openSavedAttachmentDescriptor(descriptor) {
      opened.push(descriptor);
      return Promise.resolve(true);
    }
  });
  installCachedFiles(plugin, [{
    cacheId: ATTACHMENT_ID,
    extension: '.png',
    path: '/tmp/cache/media.png'
  }]);
  const record = createRecord();
  const items = [{
    id: 'mlv2-open-saved-media-externally',
    label: 'Open attachment externally',
    type: 'item',
    action() {}
  }];

  assert.equal(plugin.addLoggerViewerSavedAttachmentOpenItem(items, createImage(), record), true);
  assert.equal(plugin.addLoggerViewerSavedAttachmentOpenItem(items, createImage(), record), true);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'mlv2-open-saved-attachment');
  assert.equal(items[0].label, 'Open Attachment');
  assert.equal(items[0].props, undefined, 'Logger buildMenu must receive a raw menu config');
  items[0].action();
  assert.equal(closed, 1);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0].remote_urls, [record.message.attachments[0].url]);
  assert.equal(opened[0].display_url, 'blob:logger-image');
  assert.equal(opened[0].local_path, '/tmp/cache/media.png');

  assert.equal(plugin.addLoggerViewerSavedAttachmentOpenItem(
    [],
    createImage(),
    createRecord({ deleted: false })
  ), false);
  const videoRecord = createRecord({ extension: 'mp4' });
  assert.equal(plugin.addLoggerViewerSavedAttachmentOpenItem(
    [],
    createImage({ source: videoRecord.message.attachments[0].url }),
    videoRecord
  ), true);
});

test('message menu locates an edit through unclassed native-card fallback wrappers', () => {
  const patches = installContextMenuPatchCapture();
  installContextMenuBuilder();
  const record = createRecord({ deleted: false });
  record.edit_history = [{ content: 'first' }, { content: 'second' }, { content: 'third' }];
  const actions = [];
  const plugin = createPlugin({
    unpatches: [], messageRecord: { [MESSAGE_ID]: record }, editModifiers: {}, style: { edited: 'edited' },
    settings: { contextmenuSubmenuName: '' },
    dispatcher: { dispatch: event => actions.push(event) },
    deleteEditedMessageFromRecord: (id, index) => actions.push({ id, index }),
    shouldAddPermissionIndependentContextDelete: () => false
  });
  plugin.patchContextMenus();
  const row = { className: { baseVal: 'edited' }, classList: { contains: token => token === 'edited' }, getAttribute: name => name === 'editNum' ? '2' : null, parentElement: null };
  const wrapper = { className: '', parentElement: row };
  const target = { className: 'markup_native messageContent_native', parentElement: wrapper };
  const menu = [];
  const originalFind = Utils.findInTree;
  Utils.findInTree = () => ({ children: menu });
  try {
    patches.message({ props: { children: menu } }, { message: { id: MESSAGE_ID }, channel: { id: CHANNEL_ID }, target });
    const submenu = flattenMenuItems(menu).find(item => item.id === 'mlv2-message-logger');
    assert.ok(submenu);
    const show = submenu.items.find(item => item.label === 'Show Edit As Message');
    const remove = submenu.items.find(item => item.label === 'Delete Edit');
    assert.ok(show);
    assert.ok(remove);
    show.action();
    assert.equal(plugin.editModifiers[MESSAGE_ID].editNum, '2');
    remove.action();
    assert.deepEqual(actions.find(action => action.index !== undefined), { id: MESSAGE_ID, index: 2 });
  } finally { Utils.findInTree = originalFind; }
});

test('message menu keeps record-level edit actions for unclassed targets outside history', () => {
  const patches = installContextMenuPatchCapture();
  installContextMenuBuilder();
  const record = createRecord({ deleted: false });
  record.edit_history = [{ content: 'edited' }];
  const plugin = createPlugin({
    unpatches: [], messageRecord: { [MESSAGE_ID]: record }, editModifiers: {}, style: { edited: 'edited' },
    settings: { contextmenuSubmenuName: '' }, dispatcher: { dispatch() {} },
    shouldAddPermissionIndependentContextDelete: () => false
  });
  plugin.patchContextMenus();
  const target = { className: '', parentElement: null, getAttribute: () => '7' };
  const originalFind = Utils.findInTree;
  try {
    const makeItems = () => {
      const menu = [];
      Utils.findInTree = () => ({ children: menu });
      patches.message({ props: { children: menu } }, { message: { id: MESSAGE_ID }, channel: { id: CHANNEL_ID }, target });
      return flattenMenuItems(menu).find(item => item.id === 'mlv2-message-logger').items;
    };
    let items = makeItems();
    assert.ok(items.some(item => item.label === 'Hide Edits'));
    assert.equal(items.some(item => item.label === 'Show Edit As Message' || item.label === 'Delete Edit'), false);
    plugin.editModifiers[MESSAGE_ID] = { editNum: 0, noSuffix: false };
    items = makeItems();
    assert.ok(items.some(item => item.label === 'Hide (edited) Tag'));
    assert.ok(items.some(item => item.label === 'Undo Show As Message'));
    assert.equal(items.some(item => item.label === 'Delete Edit'), false);
  } finally { Utils.findInTree = originalFind; }
});
