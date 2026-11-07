const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const harness = require('./helpers/plugin-harness');
harness.React.Component = class { constructor(props) { this.props = props; } };
const Plugin = require(path.join(__dirname, '..', 'MessageLoggerV2.plugin.js'));

function fixture({ deleted = false } = {}) {
  const attachment = { id: 'a', filename: 'a.txt', url: 'https://example.invalid/a.txt' };
  const message = { id: 'm', channel_id: 'c', attachments: [] };
  const record = { message, removed_attachments: [attachment], ...(deleted ? { delete_data: {} } : {}) };
  const plugin = new Plugin({ name: 'MessageLoggerV2', version: 'test' });
  Object.assign(plugin, {
    __started: true, _startupGeneration: 1, _savedInlineTextAttachmentProbeGeneration: 1,
    _savedInlineTextAttachmentProbeInFlight: new Map(), messageRecord: { m: record },
    settings: { cacheAllImages: true, onlyRenderCachedAttachments: false },
    normalizeSavedAttachmentMediaUrl: url => url,
    isSavedInlineTextCodeAttachment: () => true,
    getRemovedAttachmentIdentity: item => item.id,
    getRecordRemovedAttachments: value => value.removed_attachments,
    getSavedAttachmentDescriptor(item) { return { channel_id: 'c', message_id: 'm', attachment_id: item.id,
      filename: item.filename, remote_urls: [item.url] }; },
    _hasSavedInlineTextAttachmentProbeNativeFetch: () => true,
    resolveSavedAttachmentMediaFailureContext: descriptor => ({ descriptor }),
    _releaseSavedInlineTextAttachmentProbeResponse: () => Promise.resolve()
  });
  let requests = 0, coordinated = 0;
  const resolvers = [];
  plugin.fetchMediaNetworkResponse = () => { requests++; return new Promise(resolve => resolvers.push(resolve)); };
  plugin.coordinateSavedAttachmentMediaFailure = () => { coordinated++; return { plan: { action: 'remote', url: 'proxy' } }; };
  function consumer() {
    let active = false;
    const queued = [], outcomes = [];
    const context = plugin.createOwnedRemovedTextProbeContext(record, attachment, attachment.url, {},
      allowDetached => allowDetached || active,
      (plan, url) => outcomes.push({ plan, url }), 'logger');
    context.deferUntilActive = callback => { if (active) callback(); else queued.push(callback); };
    const Sentinel = plugin.getSavedInlineTextAttachmentProbeComponent();
    const sentinel = new Sentinel({ context });
    return { context, sentinel, outcomes, queued,
      setActive(value) { active = value; },
      resume() { active = true; for (const callback of queued.splice(0)) callback(); },
      unmount() { sentinel.componentWillUnmount(); }
    };
  }
  return { plugin, record, attachment, consumer, resolvers,
    get requests() { return requests; }, get coordinated() { return coordinated; },
    current() { return [...plugin._savedInlineTextAttachmentProbeInFlight.values()][0]; } };
}
async function drain() { for (let i = 0; i < 5; i++) await Promise.resolve(); }

test('not-started probe resumes once only when the retained owner returns', async () => {
  const f = fixture();
  const c = f.consumer();
  c.sentinel.componentDidMount();
  const initial = f.current().promise;
  await initial;
  assert.equal(f.requests, 0);
  assert.equal(c.queued.length, 1);
  c.resume();
  await drain();
  assert.equal(f.requests, 1);
  const request = f.current().promise;
  f.resolvers.shift()({ ok: true });
  await request;
  assert.equal(c.outcomes.length, 0);
  c.unmount();
});

test('parked verified failure transitions on resume without refetching failed source', async () => {
  const f = fixture({ deleted: true });
  const c = f.consumer();
  c.setActive(true);
  c.sentinel.componentDidMount();
  const request = f.current().promise;
  await drain();
  assert.equal(f.requests, 1);
  c.setActive(false);
  f.resolvers.shift()({ ok: false });
  await request;
  assert.equal(f.coordinated, 0);
  assert.equal(c.outcomes.length, 0);
  assert.equal(c.queued.length, 1);
  c.resume();
  assert.equal(f.requests, 1);
  assert.equal(f.coordinated, 1);
  assert.deepEqual(c.outcomes, [{ plan: { action: 'remote', url: 'proxy' }, url: f.attachment.url }]);
  c.unmount();
});

test('shared active and parked consumers coordinate once and preserve the parked transition', async () => {
  const f = fixture({ deleted: true });
  const a = f.consumer(), b = f.consumer();
  a.setActive(true); b.setActive(true);
  a.sentinel.componentDidMount(); b.sentinel.componentDidMount();
  const request = f.current().promise;
  await drain();
  assert.equal(f.requests, 1);
  b.setActive(false);
  f.resolvers.shift()({ ok: false });
  await request;
  assert.equal(f.coordinated, 1);
  assert.equal(a.outcomes.length, 1);
  assert.equal(b.outcomes.length, 0);
  b.resume();
  assert.equal(f.coordinated, 1);
  assert.equal(f.requests, 1);
  assert.deepEqual(b.outcomes, a.outcomes);
  a.unmount(); b.unmount();
});

test('deferred failures are dropped after source changes, removal, generation change or unmount', async () => {
  for (const change of ['source', 'remove', 'generation', 'unmount']) {
    const f = fixture({ deleted: true });
    const c = f.consumer();
    c.setActive(true); c.sentinel.componentDidMount();
    const request = f.current().promise;
    await drain();
    c.setActive(false);
    f.resolvers.shift()({ ok: false });
    await request;
    assert.equal(c.queued.length, 1, change);
    if (change === 'source') f.attachment.url += '?changed';
    if (change === 'remove') delete f.plugin.messageRecord.m;
    if (change === 'generation') f.plugin._savedInlineTextAttachmentProbeGeneration++;
    if (change === 'unmount') c.unmount();
    c.resume();
    assert.equal(f.coordinated, 0, change);
    assert.equal(c.outcomes.length, 0, change);
    assert.equal(f.requests, 1, change);
    c.unmount();
  }
});

test('cancelled not-started probe does not reacquire on resume', async () => {
  const f = fixture();
  const c = f.consumer();
  c.sentinel.componentDidMount();
  const initial = f.current().promise;
  await initial;
  c.unmount();
  c.resume();
  await drain();
  assert.equal(f.requests, 0);
});

test('parking between admission and request does not turn an unstarted request into a failure', async () => {
  const f = fixture({ deleted: true });
  const c = f.consumer();
  c.setActive(true);
  c.sentinel.componentDidMount();
  const initial = f.current().promise;
  c.setActive(false);
  await initial;
  assert.equal(f.requests, 0);
  assert.equal(f.coordinated, 0);
  assert.equal(c.outcomes.length, 0);
  assert.equal(c.queued.length, 1);
  c.resume();
  await drain();
  assert.equal(f.requests, 1);
  const current = f.current().promise;
  f.resolvers.shift()({ ok: true });
  await current;
  c.unmount();
});

test('not-started resume checks source and startup generation before reacquiring', async () => {
  for (const change of ['source', 'startup']) {
    const f = fixture();
    const c = f.consumer();
    c.sentinel.componentDidMount();
    await f.current().promise;
    if (change === 'source') f.attachment.url += '?changed';
    else f.plugin._startupGeneration++;
    c.resume();
    await drain();
    assert.equal(f.requests, 0, change);
    c.unmount();
  }
});

function canonicalConsumer(f, { owned = true } = {}) {
  let active = false;
  const queued = [], checks = [];
  const initialUrl = f.attachment.url;
  f.record.message.attachments = [f.attachment];
  const base = { record: f.record, message: f.record.message, attachment: f.attachment,
    renderedAttachment: f.attachment, identityKey: 'identity', sourceKey: initialUrl,
    sourceUrl: initialUrl, sourceKind: 'attachment', action: 'remote',
    descriptor: { channel_id: 'c', message_id: 'm', attachment_id: 'a' } };
  f.plugin.revalidateSavedInlineTextAttachmentProbeContext = value => {
    if (f.plugin.messageRecord.m !== f.record || f.attachment.url !== initialUrl
      || value.sourceUrl !== initialUrl || f.plugin._startupGeneration !== 1) return null;
    return { ...base };
  };
  const context = { ...base };
  if (owned) Object.assign(context, {
    viewportEntry: {}, ownerToken: {},
    isActive(allowDetached) { checks.push(allowDetached); return allowDetached || active; },
    deferUntilActive(callback) { if (active) callback(); else queued.push(callback); }
  });
  const Sentinel = f.plugin.getSavedInlineTextAttachmentProbeComponent();
  const sentinel = new Sentinel({ context });
  return { sentinel, context, checks, queued,
    setActive(value) { active = value; },
    resume() { active = true; for (const callback of queued.splice(0)) callback(); },
    unmount() { sentinel.componentWillUnmount(); } };
}

test('fresh canonical probe validation retains owner metadata and defers parked failure', async () => {
  const f = fixture({ deleted: true });
  const c = canonicalConsumer(f);
  c.setActive(true);
  c.sentinel.componentDidMount();
  const entry = f.current();
  const saved = [...entry.consumers.values()][0];
  assert.equal(saved.ownerToken, c.context.ownerToken);
  assert.equal(saved.viewportEntry, c.context.viewportEntry);
  assert.equal(saved.deferUntilActive, c.context.deferUntilActive);
  assert.ok(c.checks.includes(true));
  await drain();
  assert.equal(f.requests, 1);
  c.setActive(false);
  f.resolvers.shift()({ ok: false });
  await entry.promise;
  assert.equal(f.coordinated, 0);
  assert.equal(c.queued.length, 1);
  c.resume();
  assert.equal(f.coordinated, 1);
  assert.equal(f.requests, 1);
  c.unmount();
});

test('canonical not-started owner revalidates before resume and unowned behavior stays eager', async () => {
  const f = fixture({ deleted: true });
  const c = canonicalConsumer(f);
  c.sentinel.componentDidMount();
  await f.current().promise;
  assert.equal(f.requests, 0);
  assert.equal(c.queued.length, 1);
  f.attachment.url += '?replaced';
  c.resume();
  await drain();
  assert.equal(f.requests, 0);
  c.unmount();
  const unownedFixture = fixture({ deleted: true });
  const unowned = canonicalConsumer(unownedFixture, { owned: false });
  unowned.sentinel.componentDidMount();
  const request = unownedFixture.current().promise;
  await drain();
  assert.equal(unownedFixture.requests, 1);
  unownedFixture.resolvers.shift()({ ok: true });
  await request;
  unowned.unmount();
});

test('canonical owner detached admission is denied when its explicit guard refuses it', () => {
  const f = fixture({ deleted: true });
  const c = canonicalConsumer(f);
  c.context.isActive = () => false;
  c.sentinel.componentDidMount();
  assert.equal(f.current(), undefined);
  assert.equal(f.requests, 0);
  c.unmount();
});

test('equivalent context rerender resumes a not-started Sentinel exactly once', async () => {
  const f = fixture();
  const c = f.consumer();
  c.sentinel.componentDidMount();
  await f.current().promise;
  assert.equal(c.queued.length, 1);
  const previousProps = c.sentinel.props;
  const current = { ...c.context };
  c.sentinel.props = { context: current };
  c.sentinel.componentDidUpdate(previousProps);
  assert.equal(f.requests, 0);
  c.resume();
  await drain();
  assert.equal(f.requests, 1);
  const request = f.current().promise;
  f.resolvers.shift()({ ok: true });
  await request;
  assert.equal(f.requests, 1);
  c.unmount();
});

test('materially changed owner or source cannot resume a stale subscription', async () => {
  for (const change of ['owner', 'viewport', 'source', 'record']) {
    const f = fixture();
    const c = f.consumer();
    c.sentinel.componentDidMount();
    await f.current().promise;
    const previousProps = c.sentinel.props;
    const next = { ...c.context };
    if (change === 'owner') next.ownerToken = {};
    if (change === 'viewport') next.viewportEntry = {};
    if (change === 'source') next.sourceUrl += '?changed';
    if (change === 'record') next.record = { ...next.record };
    c.sentinel.props = { context: next };
    c.sentinel.componentDidUpdate(previousProps);
    await drain();
    c.resume();
    await drain();
    const max = change === 'owner' || change === 'viewport' ? 1 : 0;
    assert.equal(f.requests, max, change);
    if (max) {
      const current = f.current().promise;
      f.resolvers.shift()({ ok: true });
      await current;
    }
    c.unmount();
  }
});
