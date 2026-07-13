const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
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
  return {
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
}

function payload(records = {}, indexes = {}, suppressedForumThreadIds = []) {
  return {
    messageRecord: records,
    deletedMessageRecord: indexes.deleted || {},
    editedMessageRecord: indexes.edited || {},
    purgedMessageRecord: indexes.purged || {},
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
    ...overrides
  });
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

test.beforeEach(resetHarness);

test('disk and no-save session payloads merge without duplicate indexes', () => {
  const plugin = createMergePlugin();
  const persisted = payload({
    '100': record('100', 'channel', {
      content: 'old',
      delete_data: { time: 100, hidden: true, forum_metadata: { parentId: 'forum', name: 'saved' } },
      edit_history: [{ time: 10, content: 'first' }],
      logged_attachments: ['old-file']
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
      logged_attachments: ['new-file']
    }),
    '200': record('200', 'channel', { delete_data: { time: 300 } })
  }, {
    deleted: { channel: ['100', '200'] },
    edited: { channel: ['100', '100'] }
  }, ['900', '901']);

  const merged = plugin.mergeDataPayloads(persisted, session);

  assert.deepEqual(Object.keys(merged.messageRecord).sort(), ['100', '200']);
  assert.deepEqual(merged.deletedMessageRecord.channel, ['100', '200']);
  assert.deepEqual(merged.editedMessageRecord.channel, ['100']);
  assert.deepEqual(merged.suppressedForumThreadIds, ['900', '901']);
  assert.equal(merged.messageRecord['100'].message.content, 'new');
  assert.equal(merged.messageRecord['100'].delete_data.hidden, true);
  assert.equal(merged.messageRecord['100'].delete_data.forum_metadata.parentId, 'forum');
  assert.equal(merged.messageRecord['100'].delete_data.forum_metadata.name, 'session');
  assert.deepEqual(merged.messageRecord['100'].edit_history.map(edit => edit.content), ['first', 'second']);
  assert.deepEqual(merged.messageRecord['100'].logged_attachments, ['old-file', 'new-file']);
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

  assert.equal(plugin.isValidDataPayload(legacy, { strict: true }), true);
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
  assert.deepEqual(normalized.editedMessageRecord, { 'channel-a': ['100'] });
  assert.deepEqual(normalized.purgedMessageRecord, {});
  assert.deepEqual(normalized.suppressedForumThreadIds, []);
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
  assert.deepEqual(normalized.editedMessageRecord, { 'channel-a': ['100'] });
  assert.deepEqual(normalized.purgedMessageRecord, {});
  assert.deepEqual(normalized.suppressedForumThreadIds, []);
  assert.equal(normalizedRecord.deletedata, undefined);
  assert.equal(normalizedRecord.editHistory, undefined);
});

test('normalization scopes de-duplication to message IDs and independent category indexes', () => {
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
  assert.deepEqual(normalized.deletedMessageRecord, { 'channel-a': ['100'], 'channel-b': ['200'] });
  assert.deepEqual(normalized.editedMessageRecord, { 'channel-b': ['200'] });
  assert.deepEqual(normalized.purgedMessageRecord, { 'channel-b': ['200'] });
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

  for (const key of ['messageRecord', 'deletedMessageRecord', 'editedMessageRecord', 'purgedMessageRecord']) {
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
  const backup = payload({ '100': record('100', 'channel') });

  const selected = plugin.selectStartupDataPayload(null, backup);
  assert.equal(selected.source, 'backup');
  assert.equal(selected.primaryWasPresent, false);
  assert.deepEqual(Object.keys(selected.data.messageRecord), ['100']);

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
  assert.deepEqual(normalized.editedMessageRecord, { 'channel-b': ['200'] });
  assert.deepEqual(normalized.purgedMessageRecord, { 'channel-b': ['200'] });
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

test('forum root cap removal cascades across deleted, edited, and purged indexes', () => {
  const plugin = createMergePlugin();
  const data = payload({
    '100': record('100', '100', { delete_data: { time: 100, forum_thread_delete: true } }),
    '101': record('101', '100', { edit_history: [{ time: 200, content: 'edit' }] }),
    '102': record('102', '100', { delete_data: { time: 250, anti_nuke: true } }),
    '300': record('300', 'channel', { delete_data: { time: 300 } })
  }, {
    deleted: { '100': ['100'], channel: ['300'] },
    edited: { '100': ['101'] },
    purged: { '100': ['102'] }
  });

  const capped = plugin.applySavedMessagesCapToPayload(data, 1);

  assert.deepEqual(Object.keys(capped.messageRecord), ['300']);
  assert.deepEqual(capped.deletedMessageRecord, { channel: ['300'] });
  assert.deepEqual(capped.editedMessageRecord, {});
  assert.deepEqual(capped.purgedMessageRecord, {});
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

test('the public setting handler completes the guarded reload merge', async t => {
  const pluginDir = temporaryDirectory(t);
  const filePath = path.join(pluginDir, 'MessageLoggerV2Data.config.json');
  fs.writeFileSync(filePath, JSON.stringify({ data: payload() }));
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
  plugin.settings.dontSaveData = false;

  plugin.handleDataSaveSetting(false);
  await plugin._noSaveMergePromise;

  assert.equal(plugin.settings.dontSaveData, false);
  assert.equal(plugin._needsNoSaveDataMerge, false);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8')).data.messageRecord), ['200']);
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

test('no-reload disable and re-enable keeps the existing save behavior', () => {
  let primarySaves = 0;
  let backupSaves = 0;
  const plugin = createMergePlugin({
    settings: { dontSaveData: false, autoBackup: true },
    _needsNoSaveDataMerge: false,
    saveData() { primarySaves++; },
    saveBackup() { backupSaves++; }
  });

  plugin.handleDataSaveSetting(false);

  assert.equal(primarySaves, 1);
  assert.equal(backupSaves, 1);
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
