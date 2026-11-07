const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'MessageLoggerRuntimeCompatibilityAudit.plugin.js'), 'utf8');
const start = source.indexOf('function describeRestoredForumCardLayout() {');
const end = source.indexOf('function describeLoggerOwnedStyleContract(api)', start);
assert.ok(start >= 0 && end > start);
const collect = vm.runInThisContext(`(${source.slice(start, end).trim()})`);

function fixture() {
  const entries = [
    ['[data-list-item-id^="forum-channel-list-"]', 'focusTarget_'],
    ['[class*="left_"]', 'left_'], ['[class*="body_"]', 'body_'],
    ['[class*="header_"]', 'header_'], ['[class*="headerText_"]', 'headerText_'],
    ['[class*="postTitleText_"]', 'postTitleText_'], ['[class*="message_"]', 'message_'],
    ['[class*="message_"] > span', 'author_'],
    ['[class*="messageFocusBlock_"]', 'messageFocusBlock_'], ['[class*="footer_"]', 'footer_']
  ];
  const list = {}, native = {}, restored = {}, focus = { closest: () => native };
  const makeNode = (prefix, side) => ({
    token: `${prefix}private-native`,
    style: { display: prefix === 'message_' || prefix === 'body_' ? 'flex' : 'block', flexDirection: prefix === 'body_' ? 'column' : 'row', fontSize: prefix === 'postTitleText_' ? '20px' : '16px', lineHeight: prefix === 'postTitleText_' ? '24px' : '16px', color: side },
    getAttribute: () => `${prefix}private-native`
  });
  const nativeNodes = {}, restoredNodes = {};
  for (const [selector, prefix] of entries) {
    nativeNodes[selector] = makeNode(prefix, 'native-private-color');
    restoredNodes[selector] = makeNode(prefix, 'restored-muted-color');
  }
  const previewSelector = '[class*="messageFocusBlock_"] > div';
  nativeNodes[previewSelector] = makeNode('body-sm/semibold_', 'native');
  restoredNodes[previewSelector] = makeNode('body-sm/semibold_', 'restored');
  for (const node of [nativeNodes[previewSelector], restoredNodes[previewSelector]]) { node.style.fontSize = '14px'; node.style.lineHeight = '18px'; }
  const footerSelector = '[class*="footer_"] [class*="body-sm/normal_"], [class*="footer_"] [class*="text-sm/normal_"]';
  nativeNodes[footerSelector] = makeNode('body-sm/normal_', 'native');
  restoredNodes[footerSelector] = makeNode('body-sm/normal_', 'restored');
  for (const nodes of [nativeNodes, restoredNodes]) {
    nodes['[class*="message_"] > span'].getAttribute = () => 'author_private-native body-sm/semibold_private-native';
    nodes['[class*="message_"]'].contains = child => child === nodes['[class*="message_"] > span'] || child === nodes['[class*="messageFocusBlock_"]'];
    nodes['[class*="body_"]'].contains = () => false;
  }
  const docRoot = { style: { display: 'block', visibility: 'visible', opacity: '1' }, parentElement: null };
  Object.assign(list, { style: { display: 'block', visibility: 'visible', opacity: '1' }, parentElement: docRoot });
  const nativeLi = { parentElement: list, style: { display: 'block', visibility: 'visible', opacity: '1' } }, restoredLi = { parentElement: list, style: { display: 'block', visibility: 'visible', opacity: '1' } };
  Object.assign(native, { isConnected: true, closest: () => nativeLi, parentElement: nativeLi, hasAttribute: () => false, querySelector: key => nativeNodes[key], getBoundingClientRect: () => ({ width: 300, height: 80, left: 10, top: 10, right: 310, bottom: 90 }), style: { display: 'flex', visibility: 'visible', opacity: '1' } });
  Object.assign(restored, { isConnected: true, closest: () => restoredLi, parentElement: restoredLi, hasAttribute: () => true, querySelector: key => restoredNodes[key], getBoundingClientRect: () => ({ width: 300, height: 80, left: 10, top: 10, right: 310, bottom: 90 }), style: { display: 'flex', visibility: 'visible', opacity: '1' } });
  list.querySelectorAll = () => [focus];
  const doc = { documentElement: docRoot, querySelectorAll: () => [restored] };
  return { doc, native, restored, nativeNodes, restoredNodes, list, style: node => node.style };
}

function run(f) {
  const oldDocument = global.document, oldWindow = global.window;
  global.document = f.doc; global.window = { getComputedStyle: f.style, innerWidth: 1200, innerHeight: 800 };
  try { return collect(); } finally { global.document = oldDocument; global.window = oldWindow; }
}

test('restored forum audit catches stale classes despite their presence and layout differences', () => {
  const f = fixture();
  for (const selector of ['[class*="left_"]', '[class*="body_"]', '[class*="header_"]', '[class*="headerText_"]', '[class*="message_"]', '[class*="messageFocusBlock_"]', '[class*="footer_"]']) {
    const node = f.restoredNodes[selector];
    node.getAttribute = () => node.token.replace('private-native', 'private-stale');
  }
  f.restoredNodes['[class*="message_"]'].style.display = 'block';
  const report = run(f);
  assert.equal(report.status, 'fail');
  assert.equal(report.roles.message, false);
  assert.equal(report.layout.messageDisplay, false);
  assert.doesNotMatch(JSON.stringify(report), /private|color|16px|18px|forum-channel-list-/);
});

test('restored forum audit accepts matched native layout with intentionally different author colour', () => {
  const report = run(fixture());
  assert.equal(report.status, 'pass');
  assert.equal(report.validation.booleans.allRolesMatch, true);
  assert.equal(report.validation.booleans.allLayoutMatches, true);
  assert.equal(Object.keys(report.roles).length, 13);
  assert.doesNotMatch(JSON.stringify(report), /private|muted|color|20px|24px/);
});

test('restored forum audit warns for missing, invisible, truncated and malformed surfaces', () => {
  for (const prepare of [
    f => { f.doc.querySelectorAll = () => []; },
    f => { f.restored.isConnected = false; },
    f => { f.native.getBoundingClientRect = () => ({ width: 0, height: 0 }); },
    f => { f.doc.querySelectorAll = () => Array(41).fill(f.restored); },
    f => { f.doc.querySelectorAll = () => { throw Error('secret id and path'); }; },
    f => { f.restoredNodes['[class*="body_"]'].getAttribute = () => { throw Error('secret'); }; },
    f => { f.restoredNodes['[class*="postTitleText_"]'].style.fontSize = ''; }
  ]) {
    const f = fixture(); prepare(f);
    const report = run(f);
    assert.equal(report.status, 'warn');
    assert.doesNotMatch(JSON.stringify(report), /secret|private|path/);
  }
});

test('restored forum audit rejects a text-size mismatch even when classes match', () => {
  const f = fixture();
  f.restoredNodes['[class*="messageFocusBlock_"] > div'].style.lineHeight = '21px';
  const report = run(f);
  assert.equal(report.status, 'fail');
  assert.equal(report.layout.previewLineHeight, false);
});

test('restored forum audit refuses a native control from a different list', () => {
  const f = fixture();
  f.native.closest = () => ({ parentElement: {} });
  const report = run(f);
  assert.equal(report.status, 'warn');
  assert.equal(report.state, 'not-exercised-or-incomplete');
  assert.equal(report.loadedMatchCount, 0);
});

test('a later broken card fails even when an earlier card passes, including truncated samples', () => {
  for (const truncated of [false, true]) {
    const f = fixture(), second = fixture();
    second.restored.closest().parentElement = f.list;
    second.restored.parentElement.parentElement = f.list;
    second.restoredNodes['[class*="message_"]'].style.display = 'block';
    const cards = [f.restored, second.restored];
    if (truncated) while (cards.length < 9) cards.push(f.restored);
    f.doc.querySelectorAll = () => cards;
    const report = run(f);
    assert.equal(report.status, 'fail');
    assert.equal(report.layout.messageDisplay, false);
    assert.equal(report.loadedMatchCount, truncated ? 8 : 2);
    assert.equal(report.validation.booleans.incomplete, truncated);
  }
});

test('author class and typography changes fail even when colour is intentionally different', () => {
  for (const mutation of [
    node => { node.getAttribute = () => 'author_stale body-sm/semibold_private-native'; },
    node => { node.getAttribute = () => 'author_private-native text-sm/semibold_stale'; },
    node => { node.style.fontSize = '16px'; }
  ]) {
    const f = fixture();
    const author = f.restoredNodes['[class*="message_"] > span'];
    author.style.fontSize = '14px';
    f.nativeNodes['[class*="message_"] > span'].style.fontSize = '14px';
    mutation(author);
    assert.equal(run(f).status, 'fail');
  }
});

test('footer nesting and message child relationships are validated without requiring identical wrapper trees', () => {
  for (const mutation of [
    f => { f.restoredNodes['[class*="body_"]'].contains = node => node === f.restoredNodes['[class*="footer_"]']; },
    f => { f.restoredNodes['[class*="message_"]'].contains = () => false; }
  ]) {
    const f = fixture(); mutation(f);
    const report = run(f);
    assert.equal(report.status, 'fail');
    assert.ok(Object.values(report.structure).includes(false));
  }
});

test('hidden or incomplete ancestor styles and offscreen cards cannot pass', () => {
  for (const mutation of [
    f => { f.list.style.opacity = '0'; },
    f => { delete f.list.style.visibility; },
    f => { f.restored.getBoundingClientRect = () => ({ left: 1500, right: 1800, top: 10, bottom: 90, width: 300, height: 80 }); }
  ]) {
    const f = fixture(); mutation(f);
    assert.equal(run(f).status, 'warn');
  }
});
