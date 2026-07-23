const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  Data,
  createPlugin,
  loggerEvents,
  resetHarness
} = require('./helpers/plugin-harness');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-no-save-test-'));
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  return directory;
}

function record(id, channelId, options = {}) {
  const saved = {
    message: {
      id,
      channel_id: channelId,
      guild_id: 'guild',
      content: options.content || id,
      timestamp: options.timestamp || Number(id),
      attachments: options.attachments || [],
      embeds: []
    },
    saved_location: options.saved_location,
    delete_data: options.delete_data || null,
    edit_history: options.edit_history || null,
    edits_hidden: options.edits_hidden || false,
    logged_attachments: options.logged_attachments || []
  };
  if (options.removed_attachments !== undefined) {
    saved.removed_attachments = options.removed_attachments;
  }
  return saved;
}

function payload(records = {}, indexes = {}, suppressedForumThreadIds = []) {
  return {
    messageRecord: records,
    deletedMessageRecord: indexes.deleted || {},
    editedMessageRecord: indexes.edited || {},
    purgedMessageRecord: indexes.purged || {},
    nukedMessageRecord: indexes.nuked || {},
    suppressedForumThreadIds
  };
}

function createMergePlugin(overrides = {}) {
  return createPlugin({
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      useNotificationsInstead: true
    },
    // Recovery retry tests must stay deterministic and should not spend real time waiting
    // between failed primary-write attempts. Individual tests may still override this.
    _dataSaveRetryDelayMs: 0,
    ...overrides
  });
}

function defer() {
  let resolve;
  const promise = new Promise(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

function createNormalizationPlugin(overrides = {}) {
  return createMergePlugin({
    cleanupMessageObject(message) {
      return {
        ...message,
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        embeds: Array.isArray(message.embeds) ? message.embeds : []
      };
    },
    ...overrides
  });
}

function createNoSaveDeletionPlugin(pluginDir, runtimeData, overrides = {}) {
  const createSetMap = map => new Map(
    Object.entries(map || {}).map(([channelId, ids]) => [channelId, new Set(ids)])
  );
  return createMergePlugin({
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    pluginDir,
    nodeModules: { fs, path },
    ...runtimeData,
    messageRecordIds: new Set(Object.keys(runtimeData.messageRecord || {})),
    deletedMessageSet: createSetMap(runtimeData.deletedMessageRecord),
    editedMessageSet: createSetMap(runtimeData.editedMessageRecord),
    purgedMessageSet: createSetMap(runtimeData.purgedMessageRecord),
    nukedMessageSet: createSetMap(runtimeData.nukedMessageRecord),
    suppressedForumThreadIds: new Set(runtimeData.suppressedForumThreadIds || []),
    cachedMessageRecord: [],
    cachedMessageIds: new Set(),
    cachedMessagesMap: new Map(),
    sortedDeletedMessageIds: new Map(),
    sortedPurgedMessageIds: new Map(),
    sortedNukedMessageIds: new Map(),
    forumThreadMetadataCache: new Map(),
    deletedChatMessagesCount: {},
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    refreshForumThreadLogModal() {},
    ...overrides
  });
}

function createArchiveModePlugin(pluginDir, runtimeData, overrides = {}) {
  return createNoSaveDeletionPlugin(pluginDir, runtimeData, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: false,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    _archiveDetached: false,
    _archiveLoadModeTransitionInProgress: false,
    // Archive-mode tests exercise synchronous data transitions unless they explicitly cover
    // the short UI-settling lock below. Keep the ordinary persistence fixtures deterministic.
    _archiveLoadModeSettleDelayMs: 0,
    _needsNoSaveDataMerge: true,
    _noSaveMergeInProgress: false,
    _noSaveMergeDirty: false,
    _pendingNoSavePersistedRemovals: [],
    _noSavePersistedRemovalTimer: 0,
    _dataWriteEpoch: 0,
    reportSettingState() {},
    notifySettingDependencyChange() {},
    refreshArchiveLoadPresentation() {},
    ...overrides
  });
}

test.beforeEach(resetHarness);

test('disk and no-save session payloads merge without duplicate indexes', () => {
  const plugin = createMergePlugin();
  const persisted = payload({
    '100': record('100', 'channel', {
      content: 'old',
      delete_data: { time: 100, hidden: true, forum_metadata: { parentId: 'forum', name: 'saved' } },
      edit_history: [{ time: 10, content: 'first' }],
      logged_attachments: ['old-file'],
      removed_attachments: [{
        id: 'old-file',
        filename: 'old.png',
        url: 'https://cdn.discordapp.com/attachments/channel/old-file/old.png'
      }]
    })
  }, {
    deleted: { channel: ['100', '100'] },
    edited: { channel: ['100'] }
  }, ['900']);
  const session = payload({
    '100': record('100', 'channel', {
      content: 'new',
      delete_data: { time: 200, hidden: false, forum_metadata: { name: 'session' } },
      edit_history: [{ time: 10, content: 'first' }, { time: 20, content: 'second' }],
      logged_attachments: ['new-file'],
      removed_attachments: [{
        id: 'new-file',
        filename: 'new.gif',
        url: 'https://cdn.discordapp.com/attachments/channel/new-file/new.gif'
      }]
    }),
    '200': record('200', 'channel', { delete_data: { time: 300 } })
  }, {
    deleted: { channel: ['100', '200'] },
    edited: { channel: ['100', '100'] }
  }, ['900', '901']);

  const merged = plugin.mergeDataPayloads(persisted, session);

  assert.deepEqual(Object.keys(merged.messageRecord).sort(), ['100', '200']);
  assert.deepEqual(merged.deletedMessageRecord.channel, ['100', '200']);
  assert.deepEqual(merged.editedMessageRecord, {});
  assert.deepEqual(merged.suppressedForumThreadIds, ['900', '901']);
  assert.equal(merged.messageRecord['100'].message.content, 'new');
  assert.equal(merged.messageRecord['100'].delete_data.hidden, true);
  assert.equal(merged.messageRecord['100'].delete_data.forum_metadata.parentId, 'forum');
  assert.equal(merged.messageRecord['100'].delete_data.forum_metadata.name, 'session');
  assert.deepEqual(merged.messageRecord['100'].edit_history.map(edit => edit.content), ['first', 'second']);
  assert.deepEqual(merged.messageRecord['100'].logged_attachments, ['old-file', 'new-file']);
  assert.deepEqual(
    merged.messageRecord['100'].removed_attachments.map(attachment => attachment.id),
    ['old-file', 'new-file']
  );
});

test('legacy fork payloads without forum metadata or suppression migrate before merging', () => {
  const plugin = createMergePlugin({
    cleanupMessageObject(message) {
      return { attachments: [], embeds: [], ...message };
    }
  });
  const legacy = {
    messageRecord: {
      '100': {
        message: { id: '100', channel_id: 'channel', content: 'legacy', timestamp: 100 },
        deletedata: { deletetime: 150 },
        editHistory: {
          first: { content: 'before', editedAt: 120 }
        }
      }
    },
    deletedMessageRecord: { channel: ['100'] },
    editedMessageRecord: { channel: ['100'] },
    purgedMessageRecord: {}
  };

  assert.equal(plugin.canNormalizePersistedDataPayload(legacy), true);
  const normalized = plugin.normalizePersistedDataPayload(legacy);
  const merged = plugin.mergeDataPayloads(normalized, payload({
    '200': record('200', 'thread', {
      delete_data: { time: 200, forum_thread_delete: true, forum_parent_id: 'forum' }
    })
  }, { deleted: { thread: ['200'] } }));

  assert.equal(merged.messageRecord['100'].delete_data.time, 150);
  assert.deepEqual(merged.messageRecord['100'].edit_history, [{ content: 'before', time: 120 }]);
  assert.equal(merged.messageRecord['100'].delete_data.forum_metadata, undefined);
  assert.deepEqual(merged.suppressedForumThreadIds, []);
  assert.equal(merged.messageRecord['200'].delete_data.forum_parent_id, 'forum');
});

test('mixed legacy and enhanced fields normalize without discarding surviving metadata', () => {
  const plugin = createNormalizationPlugin();
  const mixed = {
    messageRecord: {
      '100': {
        message: {
          id: '100',
          channel_id: 'channel-a',
          guild_id: 'guild-a',
          content: 'mixed',
          timestamp: 100
        },
        saved_location: { guildName: 'Guild A', channelName: 'general' },
        deletedata: { deletetime: 500 },
        delete_data: {
          time: 400,
          hidden: true,
          forum_parent_id: 'forum-a',
          forum_metadata: { name: 'Surviving post metadata' }
        },
        editHistory: {
          old: { content: 'legacy edit', editedAt: 200 }
        },
        edit_history: [
          { content: 'legacy edit', time: 200 },
          { content: 'enhanced edit', time: 300 }
        ],
        logged_attachments: ['cache-a', 'cache-a']
      }
    },
    deletedMessageRecord: { 'wrong-channel': ['100', '100'] }
  };

  const normalized = plugin.normalizePersistedDataPayload(mixed);
  const normalizedRecord = normalized.messageRecord['100'];

  assert.equal(normalized.mlv2RemakeSchemaVersion, 1);
  assert.equal(normalizedRecord.delete_data.time, 500);
  assert.equal(normalizedRecord.delete_data.hidden, true);
  assert.equal(normalizedRecord.delete_data.forum_parent_id, 'forum-a');
  assert.equal(normalizedRecord.delete_data.forum_metadata.name, 'Surviving post metadata');
  assert.deepEqual(normalizedRecord.saved_location, { guildName: 'Guild A', channelName: 'general' });
  assert.deepEqual(normalizedRecord.edit_history.map(edit => edit.content), ['legacy edit', 'enhanced edit']);
  assert.deepEqual(normalizedRecord.logged_attachments, ['cache-a']);
  assert.equal(normalizedRecord.deletedata, undefined);
  assert.equal(normalizedRecord.editHistory, undefined);
  assert.deepEqual(normalized.deletedMessageRecord, { 'channel-a': ['100'] });
  assert.deepEqual(normalized.editedMessageRecord, {});
  assert.deepEqual(normalized.purgedMessageRecord, {});
  assert.deepEqual(normalized.nukedMessageRecord, {});
  assert.deepEqual(normalized.suppressedForumThreadIds, []);
});

test('removed upload metadata normalizes and legacy markers backfill only matching Discord attachments', () => {
  const plugin = createNormalizationPlugin();
  const channelId = '111111111111111111';
  const attachmentId = '222222222222222222';
  const unmatchedId = '333333333333333333';
  const attachmentUrl = `https://cdn.discordapp.com/attachments/${channelId}/${attachmentId}/removed.gif?token=test`;
  const normalized = plugin.normalizePersistedDataPayload(payload({
    '100': record('100', channelId, {
      content: 'current content',
      edit_history: [{
        content: [
          'current content',
          `\`Attachment Deleted: \`${attachmentUrl}`,
          `\`Attachment Deleted: \`https://cdn.discordapp.com/attachments/${channelId}/${unmatchedId}/unmatched.png`,
          `\`Attachment Deleted: \`https://example.com/attachments/${channelId}/${attachmentId}/external.png`,
          'https://cdn.discordapp.com/attachments/ordinary/link-preview.png'
        ].join('\n'),
        time: 200
      }],
      logged_attachments: [attachmentId]
    })
  }, { edited: { [channelId]: ['100'] } }));

  assert.deepEqual(normalized.messageRecord['100'].message.attachments, []);
  assert.deepEqual(normalized.messageRecord['100'].removed_attachments, [{
    id: attachmentId,
    filename: 'removed.gif',
    url: attachmentUrl,
    proxy_url: attachmentUrl
  }]);
});

test('removed upload normalization de-duplicates objects and omits an empty optional field', () => {
  const plugin = createNormalizationPlugin();
  const normalized = plugin.normalizePersistedDataPayload(payload({
    '100': record('100', 'channel', {
      removed_attachments: [
        {
          id: 'attachment',
          filename: 'removed.png',
          url: 'https://cdn.example/removed.png'
        },
        {
          id: 'attachment',
          content_type: 'image/png',
          width: 320
        }
      ]
    }),
    '101': record('101', 'channel', { removed_attachments: [] })
  }, { edited: { channel: ['100', '101'] } }));

  assert.deepEqual(normalized.messageRecord['100'].removed_attachments, [{
    id: 'attachment',
    filename: 'removed.png',
    url: 'https://cdn.example/removed.png',
    content_type: 'image/png',
    width: 320
  }]);
  assert.equal(Object.hasOwn(normalized.messageRecord['101'], 'removed_attachments'), false);
});

test('data rewritten by a legacy fork can round-trip back into the enhanced schema', () => {
  const plugin = createNormalizationPlugin();
  const current = plugin.normalizePersistedDataPayload(payload({
    '100': record('100', 'channel-a', {
      content: 'before legacy fork',
      delete_data: {
        time: 100,
        forum_parent_id: 'forum-a',
        forum_metadata: { name: 'metadata older fork will discard' }
      },
      edit_history: [{ content: 'first edit', time: 90 }],
      saved_location: { guildName: 'Guild A' }
    })
  }, { deleted: { 'channel-a': ['100'] }, edited: { 'channel-a': ['100'] } }, ['900']));

  // Simulate an older fork retaining core records but writing its legacy field names and
  // dropping enhanced fields it does not understand before this fork loads the file again.
  const legacyRewrite = JSON.parse(JSON.stringify(current));
  delete legacyRewrite.mlv2RemakeSchemaVersion;
  delete legacyRewrite.suppressedForumThreadIds;
  delete legacyRewrite.purgedMessageRecord;
  const legacyRecord = legacyRewrite.messageRecord['100'];
  legacyRecord.deletedata = { deletetime: 150 };
  legacyRecord.editHistory = {
    first: { content: 'first edit', editedAt: 90 },
    second: { content: 'edit written by legacy fork', editedAt: 140 }
  };
  delete legacyRecord.delete_data;
  delete legacyRecord.edit_history;
  delete legacyRecord.saved_location;
  delete legacyRecord.logged_attachments;

  const normalized = plugin.normalizePersistedDataPayload(legacyRewrite);
  const normalizedRecord = normalized.messageRecord['100'];

  assert.equal(normalized.mlv2RemakeSchemaVersion, 1);
  assert.equal(normalizedRecord.delete_data.time, 150);
  assert.equal(normalizedRecord.delete_data.forum_metadata, undefined);
  assert.equal(normalizedRecord.saved_location, null);
  assert.deepEqual(normalizedRecord.logged_attachments, []);
  assert.deepEqual(
    normalizedRecord.edit_history.map(edit => edit.content),
    ['first edit', 'edit written by legacy fork']
  );
  assert.deepEqual(normalized.deletedMessageRecord, { 'channel-a': ['100'] });
  assert.deepEqual(normalized.editedMessageRecord, {});
  assert.deepEqual(normalized.purgedMessageRecord, {});
  assert.deepEqual(normalized.nukedMessageRecord, {});
  assert.deepEqual(normalized.suppressedForumThreadIds, []);
  assert.equal(normalizedRecord.deletedata, undefined);
  assert.equal(normalizedRecord.editHistory, undefined);
});

test('canonical normalization stays stable as Discord channel availability changes', () => {
  let channelsAvailable = true;
  const plugin = createMergePlugin({
    ChannelStore: {
      getChannel(channelId) {
        if (!channelsAvailable) return null;
        if (channelId === 'dm-channel') return { id: channelId, guild_id: null };
        if (channelId === 'guild-channel') return { id: channelId, guild_id: 'guild-a' };
        return null;
      }
    },
    UserStore: { getUser() { return null; } },
    messageStore: { getMessage() { return null; } }
  });
  const author = {
    id: 'user-a',
    username: 'User A',
    discriminator: '0001',
    avatar: null,
    bot: false,
    public_flags: 0
  };
  const message = (id, channelId, extra = {}) => ({
    id,
    channel_id: channelId,
    content: id,
    timestamp: Number(id),
    attachments: [],
    embeds: [],
    mentions: [],
    mention_roles: [],
    reactions: [],
    stickers: [],
    sticker_items: [],
    author,
    type: 0,
    flags: 0,
    ...extra
  });
  const current = payload({
    '100': {
      ...record('100', 'dm-channel', { delete_data: { time: 100 } }),
      message: message('100', 'dm-channel', { guild_id: null })
    },
    '200': {
      ...record('200', 'guild-channel', { delete_data: { time: 200 } }),
      message: message('200', 'guild-channel')
    },
    '300': {
      ...record('300', 'dm-channel', { delete_data: { time: 300 } }),
      message: message('300', 'dm-channel', {
        guild_id: null,
        type: 19,
        message_reference: { channel_id: 'dm-channel', message_id: '301' },
        referenced_message: message('301', 'dm-channel', { guild_id: null })
      })
    },
    // Shared data can contain a guild/channel saved by another Discord client that the
    // current account cannot resolve. Its persisted location ID remains authoritative.
    '350': {
      ...record('350', 'foreign-channel', { delete_data: { time: 350 } }),
      message: message('350', 'foreign-channel', { guild_id: 'foreign-guild' })
    }
  }, { deleted: { 'dm-channel': ['100', '300'], 'guild-channel': ['200'], 'foreign-channel': ['350'] } });

  const withChannels = plugin.normalizePersistedDataPayload(current);
  channelsAvailable = false;
  const withoutChannels = plugin.normalizePersistedDataPayload(withChannels);

  assert.equal(withChannels.messageRecord['100'].message.guild_id, null);
  assert.equal(withChannels.messageRecord['200'].message.guild_id, null);
  assert.equal(withChannels.messageRecord['300'].message.referenced_message.guild_id, null);
  assert.equal(withChannels.messageRecord['350'].message.guild_id, 'foreign-guild');
  assert.equal(JSON.stringify(withoutChannels), JSON.stringify(withChannels));

  // Normal live capture can still enrich a new message from the current client's store;
  // only persisted-file normalization is isolated from that transient runtime state.
  channelsAvailable = true;
  assert.equal(plugin.cleanupMessageObject(message('250', 'guild-channel')).guild_id, 'guild-a');

  const deletedChannelRecord = payload({
    '400': {
      ...record('400', 'deleted-channel', { delete_data: { time: 400, anti_nuke: true } }),
      message: message('400', 'deleted-channel')
    }
  }, { purged: { 'deleted-channel': ['400'] } });
  const normalizedWhileMissing = plugin.normalizePersistedDataPayload(deletedChannelRecord);
  channelsAvailable = true;
  const normalizedAfterStoreChange = plugin.normalizePersistedDataPayload(normalizedWhileMissing);

  assert.equal(normalizedWhileMissing.messageRecord['400'].message.guild_id, null);
  assert.equal(JSON.stringify(normalizedAfterStoreChange), JSON.stringify(normalizedWhileMissing));
});

test('normalization de-duplicates IDs and applies exclusive base-category precedence', () => {
  const plugin = createNormalizationPlugin();
  const sameAuthor = { id: 'user-1', username: 'same-user' };
  const mixed = payload({
    '100': {
      ...record('100', 'channel-a', { delete_data: { time: 100 } }),
      message: { ...record('100', 'channel-a').message, guild_id: 'guild-a', author: sameAuthor }
    },
    '200': {
      ...record('200', 'channel-b', { delete_data: { time: 200 }, edit_history: [{ time: 190, content: 'edit' }] }),
      message: { ...record('200', 'channel-b').message, guild_id: 'guild-b', author: sameAuthor }
    }
  }, {
    deleted: { 'wrong-a': ['100', '100'], 'wrong-b': ['200'] },
    edited: { 'wrong-b': ['200', '200'] },
    purged: { 'wrong-b': ['200'] }
  });

  const normalized = plugin.normalizePersistedDataPayload(mixed);

  assert.deepEqual(Object.keys(normalized.messageRecord).sort(), ['100', '200']);
  assert.deepEqual(normalized.deletedMessageRecord, { 'channel-a': ['100'] });
  assert.deepEqual(normalized.editedMessageRecord, {});
  assert.deepEqual(normalized.purgedMessageRecord, { 'channel-b': ['200'] });
  assert.deepEqual(normalized.messageRecord['200'].edit_history, [{ time: 190, content: 'edit' }]);
});

test('normalization rejects payloads missing the core message record map', () => {
  const plugin = createNormalizationPlugin();

  assert.equal(plugin.canNormalizePersistedDataPayload({ deletedMessageRecord: {} }), false);
  assert.throws(
    () => plugin.normalizePersistedDataPayload({ deletedMessageRecord: {} }),
    /messageRecord is not an object map/
  );
});

test('canonical output retains the core payload shape used by current logger forks', () => {
  const plugin = createNormalizationPlugin();
  const normalized = plugin.normalizePersistedDataPayload({
    messageRecord: {
      '100': {
        message: { id: '100', channel_id: 'channel', content: 'core', timestamp: 100 },
        deletedata: { deletetime: 110 },
        editHistory: { one: { content: 'older', editedAt: 105 } }
      }
    },
    deletedMessageRecord: { channel: ['100'] },
    editedMessageRecord: { channel: ['100'] },
    purgedMessageRecord: {}
  });
  plugin.installDataPayload(normalized);
  const output = plugin._getDataPayload();

  for (const key of ['messageRecord', 'deletedMessageRecord', 'editedMessageRecord', 'purgedMessageRecord', 'nukedMessageRecord']) {
    assert.equal(typeof output[key], 'object');
    assert.equal(Array.isArray(output[key]), false);
  }
  assert.ok(output.messageRecord['100'].message);
  assert.ok(output.messageRecord['100'].delete_data);
  assert.ok(Array.isArray(output.messageRecord['100'].edit_history));
  assert.equal(output.messageRecord['100'].deletedata, undefined);
  assert.equal(output.messageRecord['100'].editHistory, undefined);
  assert.equal(output.mlv2RemakeSchemaVersion, 1);
  assert.ok(Array.isArray(output.suppressedForumThreadIds));
});

test('malformed records and edit entries invalidate the candidate instead of being rewritten away', () => {
  const plugin = createNormalizationPlugin();
  const missingMessage = payload({ '100': { delete_data: { time: 100 } } });
  const malformedEdit = payload({
    '100': {
      ...record('100', 'channel'),
      edit_history: [{ time: 100, content: 'valid' }, null]
    }
  });

  assert.throws(() => plugin.normalizePersistedDataPayload(missingMessage), /not a valid message record/);
  assert.throws(() => plugin.normalizePersistedDataPayload(malformedEdit), /invalid edit entry/);
});

test('newer fork schemas fail closed and foreign top-level extensions survive canonical output', () => {
  const plugin = createNormalizationPlugin();

  assert.throws(
    () => plugin.normalizePersistedDataPayload({
      ...payload(),
      mlv2RemakeSchemaVersion: 2
    }),
    /newer than supported schema/
  );

  const normalized = plugin.normalizePersistedDataPayload({
    ...payload({ '100': record('100', 'channel') }),
    anotherForkMetadata: { revision: 7, mode: 'compatible' }
  });
  plugin.installDataPayload(normalized);

  assert.deepEqual(plugin._getDataPayload().anotherForkMetadata, { revision: 7, mode: 'compatible' });
});

test('startup selection restores missing primary data from backup but blocks newer schemas', () => {
  const plugin = createNormalizationPlugin();
  const backup = payload({
    '100': record('100', 'deleted-channel', {
      delete_data: { time: 100, anti_nuke: true, anti_nuke_parent_id: 'deleted-channel' }
    })
  }, { purged: { 'deleted-channel': ['100'] } });

  const selected = plugin.selectStartupDataPayload(null, backup);
  assert.equal(selected.source, 'backup');
  assert.equal(selected.primaryWasPresent, false);
  assert.deepEqual(Object.keys(selected.data.messageRecord), ['100']);
  const normalizedBackup = plugin.normalizePersistedDataPayload(selected.data);
  assert.deepEqual(normalizedBackup.purgedMessageRecord, {});
  assert.deepEqual(normalizedBackup.nukedMessageRecord, { 'deleted-channel': ['100'] });

  assert.throws(
    () => plugin.selectStartupDataPayload(
      { ...payload(), mlv2RemakeSchemaVersion: 2 },
      backup
    ),
    /newer than supported schema/
  );
  assert.throws(
    () => plugin.selectStartupDataPayload(
      null,
      { ...backup, mlv2RemakeSchemaVersion: 2 }
    ),
    /newer than supported schema/
  );
});

test('no-save startup installs the saved archive while session additions stay detached', () => {
  const plugin = createNormalizationPlugin();
  const persisted = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, {
    deleted: { channel: ['100'] }
  });
  const persistedSnapshot = structuredClone(persisted);

  const selected = plugin.selectStartupDataPayload(persisted, null);
  plugin.installDataPayload(plugin.normalizePersistedDataPayload(selected.data));

  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin.messageRecord['100'].message.id, '100');
  assert.deepEqual(plugin.deletedMessageRecord, { channel: ['100'] });

  plugin.messageRecord['200'] = record('200', 'channel', { delete_data: { time: 200 } });
  plugin.deletedMessageRecord.channel.push('200');
  assert.deepEqual(persisted, persistedSnapshot, 'memory-only additions must not mutate BetterDiscord cached disk data');

  const reloaded = plugin.normalizePersistedDataPayload(
    plugin.selectStartupDataPayload(persisted, null).data
  );
  assert.deepEqual(Object.keys(reloaded.messageRecord), ['100']);
  assert.deepEqual(reloaded.deletedMessageRecord, { channel: ['100'] });
});

test('startup reads current archive bytes instead of stale BetterDiscord cached data', t => {
  const pluginDir = temporaryDirectory(t);
  const current = payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } });
  const stale = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  fs.writeFileSync(
    path.join(pluginDir, 'MessageLoggerV2Data.config.json'),
    JSON.stringify({ data: current })
  );
  Data.save('MessageLoggerV2Data', 'data', stale);
  const plugin = createNormalizationPlugin({ pluginDir, nodeModules: { fs, path } });

  const startup = plugin.loadStartupDataPayloadFromDisk();

  assert.equal(startup.selected.source, 'primary');
  assert.deepEqual(Object.keys(startup.selected.data.messageRecord), ['200']);
  assert.deepEqual(Object.keys(Data.load('MessageLoggerV2Data', 'data').messageRecord), ['100']);
});

test('detached overlay excludes unchanged archive state and reapplies exact session changes', () => {
  const plugin = createNormalizationPlugin();
  const archive = {
    ...payload({
      '100': record('100', 'channel', { delete_data: { time: 100 } }),
      '200': record('200', 'channel', { edit_history: [{ time: 10, content: 'old' }] }),
      '300': record('300', 'channel', { delete_data: { time: 300 } }),
      '400': record('400', 'thread', { delete_data: { time: 400, forum_thread_delete: true } })
    }, {
      deleted: { channel: ['100', '300'], thread: ['400'] },
      edited: { channel: ['200'] }
    }, ['900', '901']),
    anotherForkMetadata: { keep: 'disk-only' }
  };
  const runtime = structuredClone(archive);
  runtime.messageRecord['200'].edit_history.push({ time: 20, content: 'session edit' });
  runtime.messageRecord['200'].ghost_pinged = true;
  runtime.deletedMessageRecord.channel = runtime.deletedMessageRecord.channel.filter(id => id !== '300');
  runtime.purgedMessageRecord.channel = ['300'];
  delete runtime.messageRecord['400'];
  delete runtime.deletedMessageRecord.thread;
  runtime.messageRecord['500'] = record('500', 'thread', {
    delete_data: {
      time: 500,
      anti_nuke: true,
      forum_thread_delete: true,
      forum_metadata: { parentId: 'forum', name: 'captured' }
    },
    attachments: [{ id: 'attachment', filename: 'saved.png' }]
  });
  runtime.nukedMessageRecord.thread = ['500'];
  runtime.suppressedForumThreadIds = ['901', '902'];
  runtime.anotherForkMetadata = { keep: 'runtime-copy-must-detach' };

  const overlay = plugin.buildNoSaveSessionOverlay(archive, runtime);

  assert.deepEqual(Object.keys(overlay.payload.messageRecord).sort(), ['200', '300', '500']);
  assert.equal(overlay.payload.messageRecord['100'], undefined);
  assert.equal(overlay.payload.anotherForkMetadata, undefined);
  assert.deepEqual(overlay.payload.purgedMessageRecord, { channel: ['300'] });
  assert.deepEqual(overlay.payload.nukedMessageRecord, { thread: ['500'] });
  assert.deepEqual(overlay.payload.suppressedForumThreadIds, ['902']);
  assert.deepEqual(Array.from(overlay.removedRecordIds), ['400']);
  assert.deepEqual(Array.from(overlay.suppressedRemoves), ['900']);

  const reapplied = plugin.applyNoSaveSessionOverlay(archive, overlay);
  const sanitizedRuntime = plugin.sanitizeDataPayload(
    plugin.prepareDataPayloadForNormalization(structuredClone(runtime))
  );
  assert.deepEqual(reapplied.messageRecord['200'], sanitizedRuntime.messageRecord['200']);
  assert.deepEqual(reapplied.messageRecord['300'], sanitizedRuntime.messageRecord['300']);
  assert.deepEqual(reapplied.messageRecord['500'], sanitizedRuntime.messageRecord['500']);
  assert.equal(reapplied.messageRecord['400'], undefined);
  assert.deepEqual(reapplied.deletedMessageRecord, { channel: ['100'] });
  assert.deepEqual(reapplied.editedMessageRecord, { channel: ['200'] });
  assert.deepEqual(reapplied.purgedMessageRecord, { channel: ['300'] });
  assert.deepEqual(reapplied.nukedMessageRecord, { thread: ['500'] });
  assert.deepEqual(reapplied.suppressedForumThreadIds.sort(), ['901', '902']);
  assert.deepEqual(reapplied.anotherForkMetadata, { keep: 'disk-only' });
});

test('reattaching three-way merges newer disk changes with the detached session delta', () => {
  const plugin = createNormalizationPlugin();
  const baseline = payload({
    '100': record('100', 'channel', {
      content: 'baseline',
      delete_data: { time: 100, hidden: false },
      edit_history: [{ time: 10, content: 'baseline edit' }],
      logged_attachments: ['baseline-file']
    })
  }, { deleted: { channel: ['100'] } });
  const session = structuredClone(baseline);
  session.messageRecord['100'].delete_data.hidden = true;
  session.messageRecord['100'].edit_history.push({ time: 20, content: 'session edit' });
  session.messageRecord['100'].logged_attachments.push('session-file');
  const overlay = plugin.buildNoSaveSessionOverlay(baseline, session);
  const newerDisk = structuredClone(baseline);
  newerDisk.messageRecord['100'].message.content = 'newer disk content';
  newerDisk.messageRecord['100'].edit_history.push({ time: 30, content: 'disk edit' });
  newerDisk.messageRecord['100'].logged_attachments.push('disk-file');
  newerDisk.messageRecord['100'].external_only = { retained: true };
  newerDisk.deletedMessageRecord = {};
  newerDisk.purgedMessageRecord = { channel: ['100'] };

  const attached = plugin.applyNoSaveSessionOverlay(newerDisk, overlay);

  assert.equal(attached.messageRecord['100'].message.content, 'newer disk content');
  assert.equal(attached.messageRecord['100'].delete_data.hidden, true);
  assert.deepEqual(
    new Set(attached.messageRecord['100'].edit_history.map(edit => edit.content)),
    new Set(['baseline edit', 'session edit', 'disk edit'])
  );
  assert.deepEqual(
    new Set(attached.messageRecord['100'].logged_attachments),
    new Set(['baseline-file', 'session-file', 'disk-file'])
  );
  assert.deepEqual(attached.messageRecord['100'].external_only, { retained: true });
  assert.deepEqual(attached.deletedMessageRecord, {});
  assert.deepEqual(attached.purgedMessageRecord, { channel: ['100'] });
});

test('detached recovery atomically preserves newer disk and session changes to the same record', async t => {
  const pluginDir = temporaryDirectory(t);
  const baseline = payload({
    '100': record('100', 'channel', {
      content: 'baseline',
      delete_data: { time: 100 },
      edit_history: [{ time: 10, content: 'baseline edit' }]
    })
  }, { deleted: { channel: ['100'] } });
  const session = structuredClone(baseline);
  session.messageRecord['100'].edit_history.push({ time: 20, content: 'session edit' });
  const builder = createNormalizationPlugin();
  const overlay = builder.buildNoSaveSessionOverlay(baseline, session);
  const newerDisk = structuredClone(baseline);
  newerDisk.messageRecord['100'].message.content = 'newer disk content';
  newerDisk.messageRecord['100'].edit_history.push({ time: 30, content: 'disk edit' });
  fs.writeFileSync(
    path.join(pluginDir, 'MessageLoggerV2Data.config.json'),
    JSON.stringify({ data: newerDisk })
  );
  const plugin = createArchiveModePlugin(pluginDir, overlay.payload, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    _archiveDetached: true
  });
  plugin._noSaveSessionOverlay = overlay;

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  const saved = JSON.parse(
    fs.readFileSync(path.join(pluginDir, 'MessageLoggerV2Data.config.json'), 'utf8')
  ).data;

  assert.equal(saved.messageRecord['100'].message.content, 'newer disk content');
  assert.deepEqual(
    new Set(saved.messageRecord['100'].edit_history.map(edit => edit.content)),
    new Set(['baseline edit', 'session edit', 'disk edit'])
  );
});

test('hot detach and reattach preserve session records without writing archive bytes', t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archive = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  archive.messageRecord['100'].message.author = { id: 'archive-user', username: 'Archived' };
  const originalBytes = JSON.stringify({ data: archive });
  fs.writeFileSync(filePath, originalBytes);
  Data.save('MessageLoggerV2Data', 'data', structuredClone(archive));
  Data.save('MessageLoggerV2DataBackup', 'data', structuredClone(archive));
  const runtime = payload({
    ...structuredClone(archive.messageRecord),
    '200': record('200', 'channel', { edit_history: [{ time: 200, content: 'session' }] })
  }, {
    deleted: { channel: ['100'] },
    edited: { channel: ['200'] }
  });
  const plugin = createArchiveModePlugin(pluginDir, runtime);
  plugin.rebuildSavedUserRecordCache();
  assert.equal(plugin._savedUserRecord['archive-user'].username, 'Archived');

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assert.equal(plugin.settings.dontLoadArchivedData, true);
  assert.equal(plugin._archiveDetached, true);
  assert.deepEqual(Object.keys(plugin.messageRecord), ['200']);
  assert.equal(plugin._savedUserRecord['archive-user'], undefined);
  assert.deepEqual(Data.load('MessageLoggerV2Data', 'data'), {});
  assert.deepEqual(Data.load('MessageLoggerV2DataBackup', 'data'), {});
  assert.equal(fs.readFileSync(filePath, 'utf8'), originalBytes);
  assert.equal(plugin.queueNoSavePersistedRemoval({ type: 'record', id: '100' }), false);

  const detached = structuredClone(plugin._getDataPayload());
  detached.messageRecord['300'] = record('300', 'channel', { delete_data: { time: 300 } });
  detached.deletedMessageRecord.channel = ['300'];
  plugin.installDataPayload(detached);

  assert.equal(plugin.requestArchiveLoadModeChange(false), true);
  assert.equal(plugin.settings.dontLoadArchivedData, false);
  assert.equal(plugin._archiveDetached, false);
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), ['100', '200', '300']);
  assert.equal(plugin._savedUserRecord['archive-user'].username, 'Archived');
  assert.deepEqual(Object.keys(Data.load('MessageLoggerV2Data', 'data').messageRecord).sort(), ['100', '200', '300']);
  assert.equal(fs.readFileSync(filePath, 'utf8'), originalBytes);
});

test('archive mode keeps both related controls locked until presentation settles', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archive = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  fs.writeFileSync(filePath, JSON.stringify({ data: archive }));

  const dependencyNotifications = [];
  const plugin = createArchiveModePlugin(pluginDir, structuredClone(archive), {
    _archiveLoadModeSettleDelayMs: 30,
    notifySettingDependencyChange(settingId) {
      dependencyNotifications.push(settingId);
    }
  });

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assert.equal(plugin.settings.dontLoadArchivedData, true);
  assert.equal(plugin._archiveDetached, true);
  assert.equal(plugin._archiveLoadModeTransitionInProgress, true);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), true);
  assert.ok(dependencyNotifications.includes('dontSaveData'));
  assert.ok(dependencyNotifications.includes('dontLoadArchivedData'));

  assert.equal(plugin.requestArchiveLoadModeChange(false), false, 'an immediate archive reversal is rejected');
  assert.equal(plugin.requestDataSaveModeChange(false), false, 'the parent data-saving switch is locked too');
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin.settings.dontLoadArchivedData, true);
  assert.equal(plugin._archiveDetached, true);

  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(plugin._archiveLoadModeTransitionInProgress, false);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
  assert.equal(plugin.requestArchiveLoadModeChange(false), true, 'archive requests resume after settling');
  assert.equal(plugin.settings.dontLoadArchivedData, false);
  assert.equal(plugin._archiveDetached, false);

  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(plugin._archiveLoadModeTransitionInProgress, false);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);

  const failedAttachNotifications = [];
  fs.writeFileSync(filePath, '{broken');
  const failedAttach = createArchiveModePlugin(pluginDir, payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } }), {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    _archiveDetached: true,
    _archiveLoadModeSettleDelayMs: 30,
    notifySettingDependencyChange(settingId) {
      failedAttachNotifications.push(settingId);
    },
    reportArchiveLoadModeError() {}
  });
  assert.equal(failedAttach.requestArchiveLoadModeChange(false), false);
  assert.equal(failedAttach.settings.dontLoadArchivedData, true);
  assert.equal(failedAttach._archiveLoadModeTransitionInProgress, false, 'failed attach does not wait to unlock');
  assert.equal(failedAttach.isDataSaveModeTransitionBusy(), false);
  assert.ok(failedAttachNotifications.includes('dontSaveData'));
  assert.ok(failedAttachNotifications.includes('dontLoadArchivedData'));

  const failedDetachNotifications = [];
  const failedDetach = createArchiveModePlugin(pluginDir, structuredClone(archive), {
    _archiveLoadModeSettleDelayMs: 30,
    flushNoSavePersistedRemovals() { return { ok: false }; },
    notifySettingDependencyChange(settingId) {
      failedDetachNotifications.push(settingId);
    }
  });
  assert.equal(failedDetach.requestArchiveLoadModeChange(true), false);
  assert.equal(failedDetach.settings.dontLoadArchivedData, false);
  assert.equal(failedDetach._archiveLoadModeTransitionInProgress, false, 'failed detach does not wait to unlock');
  assert.equal(failedDetach.isDataSaveModeTransitionBusy(), false);
  assert.ok(failedDetachNotifications.includes('dontSaveData'));
  assert.ok(failedDetachNotifications.includes('dontLoadArchivedData'));
});

test('reattach rendering cannot dirty archived live records or retain them on the second detach', t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const savedRecord = record('100', 'channel', {
    delete_data: { time: 100 },
    edit_history: [{ time: 101, content: 'archived edit' }]
  });
  savedRecord.message.author = {
    id: 'author',
    username: 'Archived Author',
    discriminator: '0001',
    avatar: 'archived-avatar',
    public_flags: 1
  };
  savedRecord.message.mentions = [{
    id: 'mention',
    username: 'Archived Mention',
    discriminator: '0002',
    avatar: 'archived-mention-avatar',
    public_flags: 2
  }];
  const purgedRecord = structuredClone(savedRecord);
  purgedRecord.message.id = '101';
  purgedRecord.message.content = '101';
  purgedRecord.message.timestamp = 101;
  purgedRecord.delete_data.time = 102;
  purgedRecord.edit_history = null;
  const archive = payload(
    { '100': savedRecord, '101': purgedRecord },
    {
      deleted: { channel: ['100'] },
      edited: { channel: ['100'] },
      purged: { channel: ['101'] }
    }
  );
  fs.writeFileSync(filePath, JSON.stringify({ data: archive }));

  const plugin = createArchiveModePlugin(pluginDir, structuredClone(archive), {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: false,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showEditedMessages: true,
      onlyRenderCachedAttachments: false,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    tools: {
      getUser(id) {
        return {
          id,
          username: `Live ${id}`,
          discriminator: '9999',
          avatar: `live-${id}-avatar`,
          publicFlags: 64
        };
      }
    },
    shouldIgnoreMessageAuthor() { return false; },
    shouldIgnoreSelfMessage() { return false; }
  });

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assert.equal(plugin.requestArchiveLoadModeChange(false), true);

  const canonicalBeforeRender = structuredClone(plugin.messageRecord);
  const mountedMessages = [];
  plugin.reAddDeletedMessages(mountedMessages, plugin.deletedMessageRecord.channel, true, true);
  plugin.reAddDeletedMessages(mountedMessages, plugin.purgedMessageRecord.channel, true, true);

  assert.equal(mountedMessages.length, 2);
  assert.equal(mountedMessages[0].author.username, 'Live author');
  assert.equal(mountedMessages[0].mentions[0].username, 'Live mention');
  assert.deepEqual(plugin.messageRecord, canonicalBeforeRender);
  assert.equal(Object.hasOwn(plugin.messageRecord['100'], '_usersCleaned'), false);
  assert.equal(Object.hasOwn(plugin.messageRecord['101'], '_usersCleaned'), false);

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assert.equal(plugin.messageRecord['100'], undefined, 'the second detach must evict the rendered archive record');
  assert.equal(plugin.messageRecord['101'], undefined, 'the second detach must evict the rendered purge record');
  assert.equal(plugin._noSaveSessionOverlay.archiveBackedUpsertIds.size, 0);
  assert.deepEqual(Object.keys(plugin.messageRecord), []);
});

test('saved Deleted and Purged records stay mounted after ordinary author ignores are enabled', () => {
  const botId = '100';
  const selfId = '101';
  const blockedId = '102';
  const botRecord = record(botId, 'channel', { delete_data: { time: 100 } });
  botRecord.message.author = { id: 'bot', bot: true };
  botRecord.message.webhook_id = 'webhook';
  const selfRecord = record(selfId, 'channel', { delete_data: { time: 101 } });
  selfRecord.message.author = { id: 'local' };
  const blockedRecord = record(blockedId, 'channel', { delete_data: { time: 102 } });
  blockedRecord.message.author = { id: 'blocked' };

  const plugin = createPlugin({
    settings: {
      ignoreBots: true,
      ignoreSelf: true,
      ignoreBlockedUsers: true,
      onlyRenderCachedAttachments: false
    },
    messageRecord: {
      [botId]: botRecord,
      [selfId]: selfRecord,
      [blockedId]: blockedRecord
    },
    deletedMessageRecord: { channel: [botId, selfId] },
    purgedMessageRecord: { channel: [blockedId] },
    tools: { getUser: () => null },
    shouldIgnoreMessageAuthor() {
      throw new Error('saved-record presentation must not apply ordinary author ignores');
    },
    shouldIgnoreSelfMessage() {
      throw new Error('saved-record presentation must not apply the local-author ignore');
    }
  });

  const mountedMessages = [];
  plugin.reAddDeletedMessages(mountedMessages, plugin.deletedMessageRecord.channel, true, true);
  plugin.reAddDeletedMessages(mountedMessages, plugin.purgedMessageRecord.channel, true, true);

  assert.deepEqual(mountedMessages.map(message => message.id), [blockedId, selfId, botId]);
});

test('raw embed-only deleted records render from a clone and detach without touching session or disk state', t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archivedRecord = record('100', 'channel', { delete_data: { time: 100 } });
  archivedRecord.message.content = '';
  archivedRecord.message.embeds = [{
    type: 'rich',
    title: 'Archive embed',
    image: {
      url: 'https://cdn.example/embed-image.png',
      proxy_url: 'https://media.example/embed-image.png',
      width: 320,
      height: 180,
      unknown_media_metadata: { retained: ['nested', 'value'] }
    },
    unknown_embed_metadata: {
      source: { kind: 'raw-rich-embed', flags: [1, 2] }
    }
  }];
  archivedRecord.message.components = [{
    type: 1,
    components: [{
      type: 2,
      custom_id: 'archive-component',
      unknown_component_metadata: { retained: true }
    }],
    unknown_container_metadata: { retained: ['nested', 'component'] }
  }];
  const archive = payload(
    { '100': archivedRecord },
    { deleted: { channel: ['100'] } }
  );
  const originalBytes = JSON.stringify({ data: archive });
  fs.writeFileSync(filePath, originalBytes);

  const runtime = structuredClone(archive);
  runtime.messageRecord['200'] = record('200', 'channel', { delete_data: { time: 200 } });
  runtime.deletedMessageRecord.channel.push('200');
  const deleteEvents = [];
  const plugin = createArchiveModePlugin(pluginDir, runtime, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: false,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    dispatcher: {
      dispatch(event) {
        if (event.type === 'MESSAGE_DELETE') deleteEvents.push({ ...event });
      }
    },
    tools: {
      getUser() { return null; },
      getChannel(id) { return { id, guild_id: 'guild', type: 0 }; }
    },
    shouldIgnoreMessageAuthor() { return false; },
    shouldIgnoreSelfMessage() { return false; }
  });

  const canonicalArchiveRecord = structuredClone(plugin.messageRecord['100']);
  const mountedMessages = [];
  plugin.reAddDeletedMessages(mountedMessages, plugin.deletedMessageRecord.channel, true, true);

  assert.equal(mountedMessages.length, 2, 'both archive and session records enter the actual saved-message insertion path');
  const mountedArchive = mountedMessages.find(message => message.id === '100');
  assert.ok(mountedArchive, 'the archive embed-only record is inserted for rendering');
  assert.notEqual(mountedArchive, plugin.messageRecord['100'].message, 'the renderer receives a detached message clone');
  assert.equal(mountedArchive.content, '', 'an embed-only record remains content-empty');
  assert.deepEqual(mountedArchive.embeds, canonicalArchiveRecord.message.embeds, 'raw rich embed fields survive the render clone');
  assert.deepEqual(mountedArchive.components, canonicalArchiveRecord.message.components, 'nested message components survive the render clone');
  assert.deepEqual(plugin.messageRecord['100'], canonicalArchiveRecord, 'render insertion cannot mutate the canonical archive record');

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assert.equal(plugin._archiveDetached, true);
  assert.equal(plugin.messageRecord['100'], undefined, 'the archive record is removed from memory');
  assert.ok(plugin.messageRecord['200'], 'the session record remains active');
  assert.deepEqual(deleteEvents.map(event => event.id), ['100'], 'only the mounted archive deletion is evicted');
  assert.equal(fs.readFileSync(filePath, 'utf8'), originalBytes, 'detaching never rewrites the saved archive');
});

test('repeated archive detach evicts only archive-owned presentation across every saved category', t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archive = payload({
    '100': record('100', 'channel-deleted', { delete_data: { time: 100 } }),
    '101': record('101', 'channel-purged', { delete_data: { time: 101 } }),
    '102': record('102', 'channel-edited', { edit_history: [{ time: 102, content: 'archived edit' }] }),
    '103': record('103', 'channel-ghost-delete', {
      delete_data: { time: 103 },
      edit_history: [{ time: 103, content: 'archived ghost edit' }]
    }),
    '104': record('104', 'channel-ghost-edit', { edit_history: [{ time: 104, content: 'archived ghost edit' }] }),
    '105': record('105', 'channel-nuked', { delete_data: { time: 105, anti_nuke: true } }),
    '106': record('106', 'channel-hidden', { delete_data: { time: 106, hidden: true } }),
    '200': record('200', '200', {
      delete_data: { time: 200, forum_thread_delete: true, forum_parent_id: 'forum-parent' }
    }),
    '201': record('201', '201', {
      delete_data: { time: 201, forum_thread_delete: true, forum_parent_id: 'thread-parent' }
    }),
    '202': record('202', '202', {
      delete_data: { time: 202, forum_thread_message_delete: true, forum_parent_id: 'forum-parent' }
    })
  }, {
    deleted: {
      'channel-deleted': ['100'],
      'channel-ghost-delete': ['103'],
      'channel-hidden': ['106'],
      '200': ['200'],
      '202': ['202']
    },
    edited: {
      'channel-edited': ['102'],
      'channel-ghost-delete': ['103'],
      'channel-ghost-edit': ['104']
    },
    purged: {
      'channel-purged': ['101'],
      '201': ['201']
    },
    nuked: { 'channel-nuked': ['105'] }
  });
  archive.messageRecord['103'].ghost_pinged = true;
  archive.messageRecord['104'].ghost_pinged = true;
  const originalBytes = JSON.stringify({ data: archive });
  fs.writeFileSync(filePath, originalBytes);

  const runtime = structuredClone(archive);
  runtime.messageRecord['900'] = record('900', 'channel-session-deleted', { delete_data: { time: 900 } });
  runtime.messageRecord['901'] = record('901', 'channel-session-edited', {
    edit_history: [{ time: 901, content: 'session edit' }]
  });
  runtime.messageRecord['902'] = record('902', '902', {
    delete_data: { time: 902, forum_thread_delete: true, forum_parent_id: 'session-parent' }
  });
  runtime.messageRecord['903'] = record('903', '202', {
    edit_history: [{ time: 903, content: 'session reply edit' }]
  });
  runtime.deletedMessageRecord['channel-session-deleted'] = ['900'];
  runtime.deletedMessageRecord['902'] = ['902'];
  runtime.editedMessageRecord['channel-session-edited'] = ['901'];
  runtime.editedMessageRecord['202'] = ['903'];

  const deleteEvents = [];
  const removedRestoredRoots = [];
  const closedThreadLogs = [];
  const recachedLiveThreads = [];
  const plugin = createArchiveModePlugin(pluginDir, runtime, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: false,
      restoreDeletedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showEditedMessages: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    dispatcher: {
      dispatch(event) {
        if (event.type === 'MESSAGE_DELETE') deleteEvents.push({ ...event });
      }
    },
    tools: {
      getChannel(id) { return { id, guild_id: 'guild', type: String(id) === '202' ? 11 : 0 }; },
      getUser() { return null; }
    },
    _invalidateAndRecache(channelId) {
      recachedLiveThreads.push(String(channelId));
    },
    removeRestoredForumThreadMountsFromDom(threadId) {
      removedRestoredRoots.push(String(threadId));
    },
    closeForumThreadLogModal(threadId) {
      closedThreadLogs.push(String(threadId));
      this._forumThreadLogRefreshers?.delete(String(threadId));
    }
  });
  plugin._forumThreadLogRefreshers = new Map([
    ['200', () => {}],
    ['201', () => {}],
    ['202', () => {}],
    ['902', () => {}]
  ]);

  const archiveIds = Object.keys(archive.messageRecord).sort();
  const sessionIds = ['900', '901', '902', '903'];
  const expectedDeletedMounts = ['100', '101', '103', '200', '201'];
  const assertDetachedPresentation = cycle => {
    assert.equal(plugin._archiveDetached, true, `${cycle}: archive is detached`);
    assert.deepEqual(Object.keys(plugin.messageRecord).sort(), sessionIds, `${cycle}: only session records remain`);
    for (const id of archiveIds) {
      assert.equal(plugin.messageRecord[id], undefined, `${cycle}: archived record ${id} is absent`);
      assert.equal(plugin.messageRecordIds.has(id), false, `${cycle}: archived ID ${id} is absent`);
      for (const setMap of [plugin.deletedMessageSet, plugin.editedMessageSet, plugin.purgedMessageSet, plugin.nukedMessageSet]) {
        assert.equal(Array.from(setMap.values()).some(ids => ids.has(id)), false, `${cycle}: archived index ${id} is absent`);
      }
    }
    for (const id of sessionIds) assert.ok(plugin.messageRecord[id], `${cycle}: session record ${id} remains`);
    assert.equal(plugin.deletedMessageSet.get('channel-session-deleted').has('900'), true);
    assert.equal(plugin.editedMessageSet.get('channel-session-edited').has('901'), true);
    assert.equal(plugin.deletedMessageSet.get('902').has('902'), true);
    assert.equal(plugin.editedMessageSet.get('202').has('903'), true);
    assert.equal(plugin.canJumpToSavedRecord(plugin.messageRecord['901']), true, `${cycle}: session edit remains jumpable`);
    assert.equal(plugin.canJumpToSavedRecord(archive.messageRecord['102']), false, `${cycle}: stale archive edit cannot jump`);
    assert.equal(fs.readFileSync(filePath, 'utf8'), originalBytes, `${cycle}: archive bytes stay unchanged`);
  };
  const assertCycleCleanup = cycle => {
    assert.deepEqual(
      deleteEvents.map(event => event.id).sort(),
      expectedDeletedMounts,
      `${cycle}: only former archive live-deletion mounts are evicted`
    );
    assert.ok(deleteEvents.every(event => event.type === 'MESSAGE_DELETE' && event.ML2 === true));
    assert.equal(deleteEvents.some(event => sessionIds.includes(event.id)), false, `${cycle}: session mounts are untouched`);
    assert.deepEqual(removedRestoredRoots.sort(), ['200', '201'], `${cycle}: only structural archive clones are removed`);
    assert.deepEqual(closedThreadLogs.sort(), ['200', '201', '202'], `${cycle}: only archive thread-log views close`);
    assert.deepEqual(recachedLiveThreads, ['202'], `${cycle}: a surviving native thread is reconciled without deleting its card`);
    assert.equal(plugin._forumThreadLogRefreshers.has('902'), true, `${cycle}: session thread-log view stays open`);
  };

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assertDetachedPresentation('first detach');
  assertCycleCleanup('first detach');

  assert.equal(plugin.requestArchiveLoadModeChange(false), true);
  assert.equal(plugin._archiveDetached, false);
  assert.deepEqual(Object.keys(plugin.messageRecord).sort(), [...archiveIds, ...sessionIds].sort());
  plugin._forumThreadLogRefreshers = new Map([
    ['200', () => {}],
    ['201', () => {}],
    ['202', () => {}],
    ['902', () => {}]
  ]);
  deleteEvents.length = 0;
  removedRestoredRoots.length = 0;
  closedThreadLogs.length = 0;
  recachedLiveThreads.length = 0;

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assertDetachedPresentation('second detach');
  assertCycleCleanup('second detach');
});

test('archive detach closes stale same-ID forum views while retaining session-only roots', t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archive = payload({
    '300': record('300', '300', {
      delete_data: { time: 300, forum_thread_delete: true, forum_parent_id: 'archive-parent' }
    })
  }, { deleted: { 300: ['300'] } });
  const originalBytes = JSON.stringify({ data: archive });
  fs.writeFileSync(filePath, originalBytes);

  const runtime = structuredClone(archive);
  runtime.messageRecord['300'].message.content = 'session-updated archive root';
  runtime.messageRecord['400'] = record('400', '400', {
    delete_data: { time: 400, forum_thread_delete: true, forum_parent_id: 'session-parent' }
  });
  runtime.deletedMessageRecord['400'] = ['400'];
  const closed = [];
  const plugin = createArchiveModePlugin(pluginDir, runtime, {
    closeForumThreadLogModal(threadId) {
      closed.push(String(threadId));
      this._forumThreadLogRefreshers?.delete(String(threadId));
    }
  });
  plugin._forumThreadLogRefreshers = new Map([
    ['300', () => {}],
    ['400', () => {}]
  ]);

  assert.equal(plugin.requestArchiveLoadModeChange(true), true);
  assert.equal(plugin.messageRecord['300'].message.content, 'session-updated archive root');
  assert.ok(plugin.messageRecord['400']);
  assert.deepEqual(closed, ['300']);
  assert.equal(plugin._forumThreadLogRefreshers.has('400'), true);
  assert.equal(fs.readFileSync(filePath, 'utf8'), originalBytes);
});

test('failed archive reattach keeps the temporary detached session and setting unchanged', t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, '{broken');
  const session = payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } });
  const errors = [];
  const plugin = createArchiveModePlugin(pluginDir, session, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    _archiveDetached: true,
    reportArchiveLoadModeError(stage, error) { errors.push({ stage, error }); }
  });
  plugin._noSaveSessionOverlay = plugin.createEmptyNoSaveSessionOverlay(session);

  assert.equal(plugin.requestArchiveLoadModeChange(false), false);
  assert.equal(plugin.settings.dontLoadArchivedData, true);
  assert.equal(plugin._archiveDetached, true);
  assert.deepEqual(Object.keys(plugin.messageRecord), ['200']);
  assert.equal(errors[0].stage, 'attach');
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{broken');
});

test('re-enabling saving from detached mode merges archive and refreshes restored presentation', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archive = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  fs.writeFileSync(filePath, JSON.stringify({ data: archive }));
  const session = payload({
    '200': record('200', 'channel', { edit_history: [{ time: 200, content: 'session' }] })
  }, { edited: { channel: ['200'] } });
  let presentationRefreshes = 0;
  const plugin = createArchiveModePlugin(pluginDir, session, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    _archiveDetached: true,
    refreshArchiveLoadPresentation() { presentationRefreshes++; }
  });
  plugin._noSaveSessionOverlay = plugin.createEmptyNoSaveSessionOverlay(session);

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8')).data;
  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(plugin.settings.dontLoadArchivedData, true);
  assert.equal(plugin._archiveDetached, false);
  assert.deepEqual(Object.keys(saved.messageRecord).sort(), ['100', '200']);
  assert.equal(presentationRefreshes, 1, 'restored archive mounts and edit/forum presentation must refresh');
});

test('failed detached recovery restores session-only memory and leaves archive untouched', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archive = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  const originalBytes = JSON.stringify({ data: archive });
  fs.writeFileSync(filePath, originalBytes);
  const failingFs = {
    ...fs,
    renameSync: () => { throw new Error('simulated detached merge failure'); },
    promises: {
      writeFile: fs.promises.writeFile.bind(fs.promises),
      rename: async () => { throw new Error('simulated detached merge failure'); },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const session = payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } });
  const plugin = createArchiveModePlugin(pluginDir, session, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: false
    },
    nodeModules: { fs: failingFs, path },
    _archiveDetached: true,
    reportNoSaveDataError() {}
  });
  plugin._noSaveSessionOverlay = plugin.createEmptyNoSaveSessionOverlay(session);

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin.settings.dontLoadArchivedData, true);
  assert.equal(plugin._archiveDetached, true);
  assert.deepEqual(Object.keys(plugin.messageRecord), ['200']);
  assert.equal(fs.readFileSync(filePath, 'utf8'), originalBytes);
});

test('no-save payload merging preserves opaque persisted fork extensions', () => {
  const plugin = createNormalizationPlugin();
  const persisted = {
    ...payload({ '100': record('100', 'channel') }),
    anotherForkMetadata: { revision: 7, owner: 'persisted', nested: { disk: true } }
  };
  const session = {
    ...payload({ '200': record('200', 'channel') }),
    anotherForkMetadata: { revision: 2, owner: 'session', nested: { session: true } },
    sessionForkExtension: { retained: true }
  };

  const merged = plugin.mergeDataPayloads(persisted, session);

  assert.deepEqual(merged.anotherForkMetadata, {
    revision: 7,
    owner: 'persisted',
    nested: { session: true, disk: true }
  });
  assert.deepEqual(merged.sessionForkExtension, { retained: true });
});

test('message re-keying translates every category index before canonicalization', () => {
  const plugin = createNormalizationPlugin();
  const legacy = payload({
    'old-key': {
      ...record('200', 'channel-b', { delete_data: { time: 200 } }),
      message: { ...record('200', 'channel-b').message, id: '200' }
    }
  }, {
    deleted: {},
    edited: { 'old-channel': ['old-key'] },
    purged: { 'old-channel': ['old-key'] }
  });

  const normalized = plugin.normalizePersistedDataPayload(legacy);

  assert.deepEqual(Object.keys(normalized.messageRecord), ['200']);
  assert.deepEqual(normalized.deletedMessageRecord, {});
  assert.deepEqual(normalized.editedMessageRecord, {});
  assert.deepEqual(normalized.purgedMessageRecord, { 'channel-b': ['200'] });
  assert.ok(normalized.messageRecord['200'].delete_data, 'category cleanup retains the canonical record payload');
});

test('the newer persisted snapshot wins while merge-only state is still unioned', () => {
  const plugin = createMergePlugin();
  const persisted = record('100', 'channel', {
    content: 'newer disk content',
    delete_data: { time: 500, forum_metadata: { name: 'newer disk name' } },
    edit_history: [{ time: 500, content: 'disk edit' }]
  });
  const session = record('100', 'channel', {
    content: 'older session content',
    delete_data: { time: 200, hidden: true },
    edit_history: [{ time: 200, content: 'session edit' }]
  });

  const merged = plugin.mergeSavedRecords(persisted, session);

  assert.equal(merged.message.content, 'newer disk content');
  assert.equal(merged.delete_data.forum_metadata.name, 'newer disk name');
  assert.equal(merged.delete_data.hidden, true);
  assert.deepEqual(merged.edit_history.map(edit => edit.content), ['session edit', 'disk edit']);
});

test('category indexes canonicalize a message ID to exactly one channel', () => {
  const plugin = createMergePlugin();
  const shared = record('100', 'canonical', { delete_data: { time: 100 } });
  const persisted = payload({ '100': shared }, { deleted: { stale: ['100'] } });
  const session = payload({ '100': shared }, { deleted: { canonical: ['100'] } });

  const merged = plugin.mergeDataPayloads(persisted, session);

  assert.deepEqual(merged.deletedMessageRecord, { canonical: ['100'] });
  plugin.installDataPayload(merged);
  plugin.deleteMessageFromRecords('100');
  assert.deepEqual(plugin.deletedMessageRecord, {});
  assert.deepEqual(plugin.messageRecord, {});
});

test('saved-message caps apply after merging and remove dangling indexes', () => {
  const plugin = createMergePlugin({ settings: { savedMessagesCap: 2 } });
  const data = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } }),
    '200': record('200', 'channel', { delete_data: { time: 200 } }),
    '300': record('300', 'channel', { delete_data: { time: 300 } })
  }, { deleted: { channel: ['100', '200', '300', 'missing'] } });

  const capped = plugin.applySavedMessagesCapToPayload(data, 2);

  assert.deepEqual(Object.keys(capped.messageRecord).sort(), ['200', '300']);
  assert.deepEqual(capped.deletedMessageRecord.channel, ['200', '300']);
});

test('forum root cap removal also removes its children and preserves suppression', () => {
  const plugin = createMergePlugin();
  const data = payload({
    '100': record('100', '100', { delete_data: { time: 100, forum_thread_delete: true } }),
    '101': record('101', '100', { delete_data: { time: 200 } }),
    '300': record('300', 'channel', { delete_data: { time: 300 } })
  }, { deleted: { '100': ['100', '101'], channel: ['300'] } });

  const capped = plugin.applySavedMessagesCapToPayload(data, 1);

  assert.deepEqual(Object.keys(capped.messageRecord), ['300']);
  assert.deepEqual(capped.deletedMessageRecord, { channel: ['300'] });
  assert.deepEqual(capped.suppressedForumThreadIds, ['100']);
});

test('forum root cap removal cascades across deleted, edited, purged, and nuked indexes', () => {
  const plugin = createMergePlugin();
  const data = payload({
    '100': record('100', '100', { delete_data: { time: 100, forum_thread_delete: true } }),
    '101': record('101', '100', { edit_history: [{ time: 200, content: 'edit' }] }),
    '102': record('102', '100', { delete_data: { time: 250, anti_nuke: true } }),
    '300': record('300', 'channel', { delete_data: { time: 300 } })
  }, {
    deleted: { '100': ['100'], channel: ['300'] },
    edited: { '100': ['101'] },
    purged: {},
    nuked: { '100': ['102'] }
  });

  const capped = plugin.applySavedMessagesCapToPayload(data, 1);

  assert.deepEqual(Object.keys(capped.messageRecord), ['300']);
  assert.deepEqual(capped.deletedMessageRecord, { channel: ['300'] });
  assert.deepEqual(capped.editedMessageRecord, {});
  assert.deepEqual(capped.purgedMessageRecord, {});
  assert.deepEqual(capped.nukedMessageRecord, {});
});

test('no-save full-record deletion updates primary and backup without leaking session records', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  const archived = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } }),
    '300': record('300', 'channel', { delete_data: { time: 300 } })
  }, { deleted: { channel: ['100', '300'] } });
  fs.writeFileSync(primaryPath, JSON.stringify({ data: archived }));
  fs.writeFileSync(backupPath, JSON.stringify({ data: archived }));
  const runtime = payload({
    ...structuredClone(archived.messageRecord),
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['100', '200', '300'] } });
  const plugin = createNoSaveDeletionPlugin(pluginDir, runtime);

  plugin.deleteMessageFromRecords('100');
  plugin.saveData();

  for (const filePath of [primaryPath, backupPath]) {
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8')).data;
    assert.deepEqual(Object.keys(saved.messageRecord), ['300']);
    assert.deepEqual(saved.deletedMessageRecord, { channel: ['300'] });
    assert.equal(saved.messageRecord['200'], undefined, 'session-only additions never enter an archival deletion write');
  }
});

test('archive-loaded no-save deletion still removes cached media and writes only the removal', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archived = payload({
    '100': record('100', 'channel', {
      delete_data: { time: 100 },
      attachments: [{ id: 'cached-media', filename: 'cached.png' }]
    })
  }, { deleted: { channel: ['100'] } });
  const runtime = structuredClone(archived);
  runtime.messageRecord['200'] = record('200', 'channel', { delete_data: { time: 200 } });
  runtime.deletedMessageRecord.channel.push('200');
  fs.writeFileSync(primaryPath, JSON.stringify({ data: archived }));
  let cacheDeletionCalls = 0;
  const plugin = createNoSaveDeletionPlugin(pluginDir, runtime, {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: false,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: true
    },
    _archiveDetached: false,
    deleteCachedFilesForRecord() { cacheDeletionCalls++; }
  });

  plugin.deleteMessageFromRecords('100');
  plugin.saveData();

  const saved = JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data;
  assert.equal(cacheDeletionCalls, 1);
  assert.deepEqual(saved.messageRecord, {});
  assert.equal(saved.messageRecord['200'], undefined, 'session-only data must not leak through the removal write');
});

test('deleting a session-only record under no-save leaves persisted bytes untouched', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const original = JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  });
  fs.writeFileSync(primaryPath, original);
  const runtime = payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } });
  const plugin = createNoSaveDeletionPlugin(pluginDir, runtime);

  plugin.deleteMessageFromRecords('200');
  plugin.saveData();

  assert.equal(fs.readFileSync(primaryPath, 'utf8'), original);
});

test('detached record removal preserves archive bytes and shared cached media', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  const archived = payload({
    '100': record('100', 'channel', {
      delete_data: { time: 100 },
      attachments: [{ id: 'shared-media', filename: 'shared.png' }]
    })
  }, { deleted: { channel: ['100'] } });
  const original = JSON.stringify({ data: archived });
  fs.writeFileSync(primaryPath, original);
  fs.writeFileSync(backupPath, original);
  let cacheDeletionCalls = 0;
  const plugin = createNoSaveDeletionPlugin(pluginDir, structuredClone(archived), {
    settings: {
      savedMessagesCap: 1000,
      autoBackup: false,
      dontSaveData: true,
      dontLoadArchivedData: true,
      useNotificationsInstead: true,
      deleteCachedFilesWithRecords: true
    },
    _archiveDetached: true,
    deleteCachedFilesForRecord() { cacheDeletionCalls++; }
  });

  plugin.deleteMessageFromRecords('100');
  plugin.saveData();

  assert.equal(cacheDeletionCalls, 0);
  assert.equal(fs.readFileSync(primaryPath, 'utf8'), original);
  assert.equal(fs.readFileSync(backupPath, 'utf8'), original);
  assert.deepEqual(plugin.messageRecord, {});
});

test('no-save forum-root deletion cascades through every archived category and persists suppression', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archived = payload({
    '100': record('100', '100', { delete_data: { time: 100, forum_thread_delete: true } }),
    '101': record('101', '100', { delete_data: { time: 101 } }),
    '102': record('102', '100', { edit_history: [{ time: 102, content: 'edited child' }] }),
    '103': record('103', '100', { delete_data: { time: 103 } }),
    '104': record('104', '100', { delete_data: { time: 104, anti_nuke: true } }),
    '300': record('300', 'channel', { delete_data: { time: 300 } })
  }, {
    deleted: { '100': ['100', '101'], channel: ['300'] },
    edited: { '100': ['102'] },
    purged: { '100': ['103'] },
    nuked: { '100': ['104'] }
  });
  fs.writeFileSync(primaryPath, JSON.stringify({ data: archived }));
  const runtime = structuredClone(archived);
  runtime.messageRecord['999'] = record('999', 'channel', { delete_data: { time: 999 } });
  runtime.deletedMessageRecord.channel.push('999');
  const plugin = createNoSaveDeletionPlugin(pluginDir, runtime);

  plugin.deleteMessageFromRecords('100');
  plugin.saveData();

  const saved = JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data;
  assert.deepEqual(Object.keys(saved.messageRecord), ['300']);
  assert.deepEqual(saved.deletedMessageRecord, { channel: ['300'] });
  assert.deepEqual(saved.editedMessageRecord, {});
  assert.deepEqual(saved.purgedMessageRecord, {});
  assert.deepEqual(saved.nukedMessageRecord, {});
  assert.deepEqual(saved.suppressedForumThreadIds, ['100']);
  assert.equal(saved.messageRecord['999'], undefined);
});

test('no-save edit deletion removes only the matching archived edit', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const first = { time: 10, content: 'first' };
  const second = { time: 20, content: 'second' };
  const sessionOnly = { time: 30, content: 'session only' };
  const archived = payload({
    '100': record('100', 'channel', {
      delete_data: { time: 100 },
      edit_history: [first, second]
    })
  }, { deleted: { channel: ['100'] } });
  fs.writeFileSync(primaryPath, JSON.stringify({ data: archived }));
  const runtime = structuredClone(archived);
  runtime.messageRecord['100'].edit_history.push(sessionOnly);
  const plugin = createNoSaveDeletionPlugin(pluginDir, runtime);

  plugin.deleteEditedMessageFromRecord('100', 0);
  let saved = JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data;
  assert.deepEqual(saved.messageRecord['100'].edit_history, [second]);

  plugin.deleteEditedMessageFromRecord('100', 1);
  saved = JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data;
  assert.deepEqual(saved.messageRecord['100'].edit_history, [second]);
});

test('deleting the final archived edit under no-save removes its edit-only record and index', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archived = payload({
    '100': record('100', 'channel', { edit_history: [{ time: 10, content: 'only edit' }] })
  }, { edited: { channel: ['100'] } });
  fs.writeFileSync(primaryPath, JSON.stringify({ data: archived }));
  const plugin = createNoSaveDeletionPlugin(pluginDir, structuredClone(archived));

  plugin.deleteEditedMessageFromRecord('100', 0);

  const saved = JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data;
  assert.deepEqual(saved.messageRecord, {});
  assert.deepEqual(saved.editedMessageRecord, {});
});

test('a failed no-save deletion-only rename preserves disk and keeps the journal pending', t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const archived = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  const original = JSON.stringify({ data: archived });
  fs.writeFileSync(primaryPath, original);
  const failingFs = {
    ...fs,
    renameSync() { throw new Error('simulated deletion-only rename failure'); }
  };
  const plugin = createNoSaveDeletionPlugin(pluginDir, structuredClone(archived), {
    nodeModules: { fs: failingFs, path }
  });

  plugin.deleteMessageFromRecords('100');
  plugin.saveData();

  assert.equal(fs.readFileSync(primaryPath, 'utf8'), original);
  assert.equal(plugin._pendingNoSavePersistedRemovals.length, 1);
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('re-enabling after a no-save startup atomically preserves disk and session history', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  const session = payload({ '200': record('200', 'channel', { edit_history: [{ time: 200, content: 'before' }] }) }, { edited: { channel: ['200'] } });
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...session,
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  const result = await plugin.mergeNoSaveSessionIntoPersistedData();
  const saved = JSON.parse(fs.readFileSync(filePath, 'utf8')).data;

  assert.equal(result, true);
  assert.equal(plugin.settings.dontSaveData, false);
  assert.deepEqual(Object.keys(saved.messageRecord).sort(), ['100', '200']);
  assert.deepEqual(saved.deletedMessageRecord.channel, ['100']);
  assert.deepEqual(saved.editedMessageRecord.channel, ['200']);
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('an empty no-save session cannot delete existing disk history', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...payload(),
    messageRecordIds: new Set(),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['100']);
});

test('a failed merge write preserves disk history and keeps saving disabled', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(filePath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  fs.writeFileSync(backupPath, JSON.stringify({ data: payload({ '50': record('50', 'channel') }) }));
  const failingFs = {
    ...fs,
    renameSync: () => { throw new Error('simulated merge rename failure'); },
    promises: {
      writeFile: fs.promises.writeFile.bind(fs.promises),
      rename: async () => { throw new Error('simulated merge rename failure'); },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const errors = [];
  const plugin = createMergePlugin({
    settings: { savedMessagesCap: 1000, autoBackup: true, dontSaveData: true, useNotificationsInstead: true },
    pluginDir,
    nodeModules: { fs: failingFs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    reportNoSaveDataError(stage, error) { errors.push({ stage, error }); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['100']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(backupPath, 'utf8')).data.messageRecord), ['50']);
  assert.match(errors[0].error.message, /simulated merge rename failure/);
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('a corrupt primary can recover from a valid automatic backup', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, '{broken');
  fs.writeFileSync(backupPath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  const plugin = createMergePlugin({
    settings: { savedMessagesCap: 1000, autoBackup: true, dontSaveData: true, useNotificationsInstead: true },
    pluginDir,
    nodeModules: { fs, path },
    ...payload({ '200': record('200', 'channel', { edit_history: [{ time: 200, content: 'edit' }] }) }, { edited: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data.messageRecord).sort(), ['100', '200']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(backupPath, 'utf8')).data.messageRecord).sort(), ['100', '200']);
});

test('a missing primary recovers a valid backup instead of treating history as empty', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(backupPath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data.messageRecord).sort(), ['100', '200']);
});

test('semantic primary corruption falls back to a valid backup', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, JSON.stringify({
    data: payload({ broken: { message: null } }, { deleted: { channel: ['broken', 'missing'] } })
  }));
  fs.writeFileSync(backupPath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...payload(),
    messageRecordIds: new Set(),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data.messageRecord), ['100']);
});

test('primary normalization failure still falls back to a valid backup', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, JSON.stringify({
    data: payload({ '100': record('100', 'channel') })
  }));
  fs.writeFileSync(backupPath, JSON.stringify({
    data: payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } })
  }));
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...payload(),
    messageRecordIds: new Set(),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) {
      if (data.messageRecord['100']) throw new Error('simulated normalization failure');
      return this.sanitizeDataPayload(data);
    },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data.messageRecord), ['200']);
});

test('a newer primary schema blocks no-save fallback and leaves both files untouched', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  const newerPrimary = { ...payload({ '100': record('100', 'channel') }), mlv2RemakeSchemaVersion: 2 };
  const olderBackup = { ...payload({ '50': record('50', 'channel') }), mlv2RemakeSchemaVersion: 1 };
  fs.writeFileSync(primaryPath, JSON.stringify({ data: newerPrimary }));
  fs.writeFileSync(backupPath, JSON.stringify({ data: olderBackup }));
  const primaryBefore = fs.readFileSync(primaryPath, 'utf8');
  const backupBefore = fs.readFileSync(backupPath, 'utf8');
  const errors = [];
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...payload({ '200': record('200', 'channel') }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    reportNoSaveDataError(stage, error) { errors.push({ stage, error }); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin._discardNoSaveSessionOnResume, false, 'archive validation failures must remain retryable and never arm the discard bypass');
  assert.equal(fs.readFileSync(primaryPath, 'utf8'), primaryBefore);
  assert.equal(fs.readFileSync(backupPath, 'utf8'), backupBefore);
  assert.equal(errors[0].error.code, 'MLV2_NEWER_DATA_SCHEMA');
});

test('invalid primary and backup files fail closed without overwriting either file', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, '{broken-primary');
  fs.writeFileSync(backupPath, '{broken-backup');
  const errors = [];
  const plugin = createMergePlugin({
    settings: { savedMessagesCap: 1000, autoBackup: true, dontSaveData: true, useNotificationsInstead: true },
    pluginDir,
    nodeModules: { fs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    reportNoSaveDataError(stage, error) { errors.push({ stage, error }); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(fs.readFileSync(primaryPath, 'utf8'), '{broken-primary');
  assert.equal(fs.readFileSync(backupPath, 'utf8'), '{broken-backup');
  assert.match(errors[0].error.message, /Primary and backup/);
});

test('session changes arriving during recovery are included before saving is enabled', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({ data: payload() }));
  let plugin;
  let writes = 0;
  const controlledFs = {
    ...fs,
    promises: {
      writeFile: async (...args) => {
        await fs.promises.writeFile(...args);
        writes++;
        if (writes === 1) {
          plugin.messageRecord['300'] = record('300', 'channel', { delete_data: { time: 300 } });
          plugin.deletedMessageRecord.channel = ['300'];
          plugin.saveData();
        }
      },
      rename: fs.promises.rename.bind(fs.promises),
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs: controlledFs, path },
    ...payload(),
    messageRecordIds: new Set(),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true, JSON.stringify(loggerEvents));
  assert.ok(writes >= 2);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['300']);
});

test('plugin unload cancels an active recovery before rename', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  let plugin;
  const controlledFs = {
    ...fs,
    renameSync: () => { throw new Error('rename should not run after saving is disabled'); },
    promises: {
      writeFile: async (...args) => {
        await fs.promises.writeFile(...args);
        plugin.stop();
      },
      rename: async () => { throw new Error('rename should not run after unload'); },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const previousDocument = global.document;
  global.document = { querySelector: () => null, removeEventListener() {} };
  t.after(() => { global.document = previousDocument; });
  plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs: controlledFs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    removeOpenLogsButton() {},
    _clearNativeNotificationQueue() {},
    unpatches: [],
    __started: true,
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false);
  assert.equal(plugin.__started, false);
  assert.equal(plugin._noSaveMergeInProgress, false);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['100']);
});

test('disabling saving again cancels an active recovery and keeps the old primary', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({
    data: payload({ '100': record('100', 'channel', { delete_data: { time: 100 } }) }, { deleted: { channel: ['100'] } })
  }));
  let plugin;
  const controlledFs = {
    ...fs,
    renameSync: () => { throw new Error('rename should not run after saving is disabled'); },
    promises: {
      writeFile: async (...args) => {
        await fs.promises.writeFile(...args);
        plugin.settings.dontSaveData = true;
        plugin.handleDataSaveSetting(true);
      },
      rename: async () => { throw new Error('rename should not run after saving is disabled'); },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs: controlledFs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), false);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin._noSaveMergeInProgress, false);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['100']);
});

test('backup failure after primary success leaves saving enabled and primary intact', async t => {
  const pluginDir = temporaryDirectory(t);
  const primaryPath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  const backupPath = path.join(pluginDir, 'MessageLoggerV2DataBackup.config.json');
  fs.writeFileSync(primaryPath, JSON.stringify({ data: payload() }));
  fs.writeFileSync(backupPath, JSON.stringify({ data: payload({ '50': record('50', 'channel') }) }));
  const controlledFs = {
    ...fs,
    renameSync: (from, to) => {
      if (to.endsWith('DataBackup.config.json')) throw new Error('simulated backup rename failure');
      return fs.renameSync(from, to);
    },
    promises: {
      writeFile: fs.promises.writeFile.bind(fs.promises),
      rename: async (from, to) => {
        if (to.endsWith('DataBackup.config.json')) throw new Error('simulated backup rename failure');
        return fs.promises.rename(from, to);
      },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  const errors = [];
  const plugin = createMergePlugin({
    settings: { savedMessagesCap: 1000, autoBackup: true, dontSaveData: true, useNotificationsInstead: true },
    pluginDir,
    nodeModules: { fs: controlledFs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    reportNoSaveDataError(stage, error, savingRemainsDisabled) { errors.push({ stage, error, savingRemainsDisabled }); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true, JSON.stringify(errors));
  assert.equal(plugin.settings.dontSaveData, false);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(primaryPath, 'utf8')).data.messageRecord), ['200']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(backupPath, 'utf8')).data.messageRecord), ['50']);
  assert.equal(errors[0].savingRemainsDisabled, false);
});

test('no-save primary recovery retries failed writes through the third attempt', async () => {
  const archived = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  const session = payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } });
  let writes = 0;
  const plugin = createMergePlugin({
    ...session,
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0,
    _dataSaveMaxAttempts: 3,
    loadPersistedDataForNoSaveMerge() {
      return { data: structuredClone(archived), source: 'primary' };
    },
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    writeDataPayloadAtomic() {
      writes++;
      return Promise.resolve(writes === 3
        ? { ok: true }
        : { ok: false, error: new Error(`simulated primary failure ${writes}`) });
    },
    saveSettings() {},
    notifySettingDependencyChange() {},
    flushPendingMediaCacheRequests() {}
  });

  assert.equal(await plugin.mergeNoSaveSessionIntoPersistedData(), true);
  assert.equal(writes, 3, 'recovery must make the bounded third primary-write attempt');
  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(plugin._discardNoSaveSessionOnResume, false);
});

test('a timed-out no-save recovery latches bypass, ignores stale completion, and next resume reloads the archive without writing', async () => {
  const archived = payload({
    '100': record('100', 'channel', { delete_data: { time: 100 } })
  }, { deleted: { channel: ['100'] } });
  const session = payload({
    '200': record('200', 'channel', { delete_data: { time: 200 } })
  }, { deleted: { channel: ['200'] } });
  const primaryWrite = defer();
  let writes = 0;
  let presentationReconciliations = 0;
  let presentationRefreshes = 0;
  const plugin = createMergePlugin({
    ...session,
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0,
    _dataSaveTransitionTimeoutMs: 5,
    __started: true,
    loadPersistedDataForNoSaveMerge() {
      return { data: structuredClone(archived), source: 'primary' };
    },
    flushNoSavePersistedRemovals() { return { ok: true, changed: false }; },
    writeDataPayloadAtomic() {
      writes++;
      return primaryWrite.promise;
    },
    saveSettings() {},
    reportNoSaveDataError() {},
    reportSettingState() {},
    notifySettingDependencyChange() {},
    notifyDataSaveModeTransitionChange() {},
    replaceBetterDiscordDataCache() { return true; },
    captureArchiveLoadPresentationState() { return { recordIds: new Set(Object.keys(this.messageRecord)) }; },
    reconcileDetachedArchivePresentation() { presentationReconciliations++; },
    refreshArchiveLoadPresentation() { presentationRefreshes++; }
  });
  plugin._pendingMediaCacheRequests.set('session-media', { messageId: '200' });

  assert.equal(plugin.requestDataSaveModeChange(false), true);
  await plugin._noSaveMergePromise;

  assert.equal(writes, 1);
  assert.equal(plugin.settings.dontSaveData, true);
  assert.equal(plugin._discardNoSaveSessionOnResume, true);
  assert.equal(plugin._noSaveMergeInProgress, false);
  assert.equal(plugin._noSaveMergePromise, null);
  assert.equal(plugin._noSaveMergeTimeoutTimer, 0);
  assert.equal(plugin._dataSavePrimaryFlushInProgress, false);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false, 'timeout must release every transition lock');

  const stateAfterTimeout = structuredClone(plugin._getDataPayload());
  primaryWrite.resolve({ ok: true });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(plugin.settings.dontSaveData, true, 'a stale completion cannot re-enable saving');
  assert.deepEqual(plugin._getDataPayload(), stateAfterTimeout, 'a stale completion cannot mutate post-timeout session state');
  assert.equal(plugin._discardNoSaveSessionOnResume, true);

  assert.equal(plugin.requestDataSaveModeChange(false), true);
  assert.equal(writes, 1, 'the recovery-bypass resume must skip every archive write');
  assert.deepEqual(Object.keys(plugin.messageRecord), ['100']);
  assert.equal(plugin.messageRecord['200'], undefined, 'the failed temporary session is discarded');
  assert.equal(plugin._pendingMediaCacheRequests.size, 0, 'the failed session media queue is discarded');
  assert.equal(plugin._needsNoSaveDataMerge, false);
  assert.equal(plugin._discardNoSaveSessionOnResume, false);
  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(plugin.isDataSaveModeTransitionBusy(), false);
  assert.equal(presentationReconciliations, 1);
  assert.equal(presentationRefreshes, 1);
});

test('the public setting handler completes the guarded reload merge', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({ data: payload() }));
  const notifications = [];
  const plugin = createMergePlugin({
    pluginDir,
    nodeModules: { fs, path },
    ...payload({ '200': record('200', 'channel', { delete_data: { time: 200 } }) }, { deleted: { channel: ['200'] } }),
    messageRecordIds: new Set(['200']),
    suppressedForumThreadIds: new Set(),
    normalizePersistedDataPayload(data) { return this.sanitizeDataPayload(data); },
    _showNotification(...args) { notifications.push(args); },
    _needsNoSaveDataMerge: true,
    _dataWriteEpoch: 0
  });
  plugin.settings.dontSaveData = false;

  plugin.handleDataSaveSetting(false);
  await plugin._noSaveMergePromise;

  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(plugin._needsNoSaveDataMerge, false);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['200']);
  assert.ok(loggerEvents.some(event => event[0] === 'log'
    && String(event[1]).includes('merging persisted history with in-memory logger changes')));
  assert.equal(notifications[0][0], 'Message Logger Data Recovery');
  assert.match(notifications[0][1], /merging saved history with in-memory logger changes/i);
  assert.equal(notifications[0][2], 'info');
});

test('stale in-flight writes are cancelled before atomic rename', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, '{"data":{"safe":true}}');
  let plugin;
  const controlledFs = {
    ...fs,
    promises: {
      writeFile: async (...args) => {
        await fs.promises.writeFile(...args);
        plugin.cancelPendingDataWrites();
      },
      rename: async () => { throw new Error('rename should not run after cancellation'); },
      unlink: fs.promises.unlink.bind(fs.promises)
    }
  };
  plugin = createMergePlugin({ pluginDir, nodeModules: { fs: controlledFs, path }, _dataWriteEpoch: 0 });
  const epoch = plugin._dataWriteEpoch;
  const result = await plugin.writeDataPayloadAtomic('MessageLoggerV2Data', { unsafe: true }, {
    shouldCommit: () => plugin._dataWriteEpoch === epoch
  });

  assert.equal(result.cancelled, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), { data: { safe: true } });
  assert.deepEqual(fs.readdirSync(pluginDir).filter(name => name.includes('.tmp-')), []);
});

test('no-reload resume requests the primary first and leaves backup scheduling to its successful callback', () => {
  let primarySaves = 0;
  let backupSaves = 0;
  const notifications = [];
  const plugin = createMergePlugin({
    settings: { dontSaveData: false, autoBackup: true },
    _needsNoSaveDataMerge: false,
    saveData() { primarySaves++; },
    saveBackup() { backupSaves++; },
    _showNotification(...args) { notifications.push(args); }
  });

  plugin.handleDataSaveSetting(true);
  assert.ok(loggerEvents.some(event => event[0] === 'log'
    && String(event[1]).includes('new logger additions will remain in memory')));
  assert.equal(notifications[0][0], 'Message Logger Data Saving');
  assert.match(notifications[0][1], /new additions stay in memory.*removing (?:loaded )?saved records or edits still writes through/i);
  assert.equal(notifications[0][2], 'neutral');

  plugin.handleDataSaveSetting(false);

  assert.equal(primarySaves, 1);
  assert.equal(backupSaves, 0, 'backup scheduling belongs to the successful primary-save callback');
  assert.ok(loggerEvents.some(event => event[0] === 'log'
    && String(event[1]).includes('queued current in-memory logger changes')));
  assert.equal(notifications[1][0], 'Message Logger Data Saving');
  assert.match(notifications[1][1], /in-memory logger changes are queued to save/i);
  assert.equal(notifications[1][2], 'info');
  plugin.finishDataSavePrimaryFlush(plugin._dataSavePrimaryFlushGeneration, true);
});

test('merge failures log details and use the configured notification router', () => {
  const notifications = [];
  const plugin = createMergePlugin({
    pluginDir: '/plugins',
    nodeModules: { path },
    _showNotification(...args) { notifications.push(args); }
  });
  const error = new Error('detailed failure');

  plugin.reportNoSaveDataError('validating test data', error, true);

  assert.ok(loggerEvents.some(event => event[0] === 'error' && String(event[1]).includes('validating test data')));
  assert.equal(notifications[0][0], 'Message Logger Data Recovery Error');
  assert.match(notifications[0][1], /Saving remains disabled.*console log/i);
  assert.equal(notifications[0][2], 'error');
});
