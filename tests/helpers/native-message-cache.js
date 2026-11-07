const assert = require('node:assert/strict');

class NativeCache {
  constructor(channelId, collections = {}) {
    this.channelId = channelId;
    this.main = new Set(collections.main || []);
    this.before = new Set(collections.before || []);
    this.after = new Set(collections.after || []);
    this.metadata = collections.metadata || { ready: true };
  }
  has(id) { return this.main.has(id) || this.before.has(id) || this.after.has(id); }
  removeMany(ids) {
    const remove = new Set(ids);
    return new NativeCache(this.channelId, {
      main: [...this.main].filter(id => !remove.has(id)),
      before: [...this.before].filter(id => !remove.has(id)),
      after: [...this.after].filter(id => !remove.has(id)),
      metadata: this.metadata
    });
  }
}
function installNativeCache(plugin, entries) {
  const caches = new Map(entries.map(([channel, values]) => [channel, new NativeCache(channel, values)]));
  const commits = [];
  const owner = {
    get(channel) { assert.strictEqual(this, owner); return caches.get(channel); },
    commit(cache) { assert.strictEqual(this, owner); commits.push(cache); caches.set(cache.channelId, cache); }
  };
  const store = { changes: 0, emitChange() { assert.strictEqual(this, store); this.changes++; } };
  plugin.getLoggerNativeMessageCache = () => owner;
  plugin.messageStore = store;
  return { caches, commits, owner, store };
}
module.exports = { NativeCache, installNativeCache };
