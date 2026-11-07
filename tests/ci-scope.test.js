'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { changedFiles, selectScope } = require('../tools/ci-scope.cjs');

const sha = (digit) => digit.repeat(40);
const developPr = { pull_request: { base: { ref: 'develop' } } };

test('PR scope includes all cumulative changes and still tests code alongside docs', () => {
  const files = ['docs/release.md', 'MessageLoggerV2.plugin.js'];
  assert.deepEqual(selectScope('pull_request', developPr, files), {
    run: true,
    reason: 'Code, tests, tooling, or workflow files changed; running tests.',
  });
});

test('docs-only PR changes finish successfully without the test workload', () => {
  const files = ['docs/tests.md', 'README.md', 'LICENSE'];
  assert.equal(selectScope('pull_request', developPr, files).run, false);
});

test('only known documentation extensions are excluded from test scope', () => {
  assert.equal(selectScope('pull_request', developPr, ['DELETED-IMAGE-CACHE-RENDERING-CHECKLIST.md']).run, false);
  assert.equal(selectScope('pull_request', developPr, ['README.js']).run, true);
  assert.equal(selectScope('pull_request', developPr, ['docs/probe.js']).run, true);
  assert.equal(selectScope('pull_request', developPr, ['docs/image.png']).run, false);
  assert.equal(selectScope('pull_request', developPr, ['.github/ISSUE_TEMPLATE/bug_report.md']).run, false);
  assert.equal(selectScope('pull_request', developPr, ['.github/ISSUE_TEMPLATE/config.yml']).run, true);
  assert.equal(selectScope('pull_request', developPr, ['.github/PULL_REQUEST_TEMPLATE.md']).run, false);
});

test('tests, tools, unknown paths, and workflow changes always require tests', () => {
  for (const file of ['tests/README.md', 'tools/notes.md', 'unknown/config.txt', '.github/workflows/ci.yml']) {
    assert.equal(selectScope('pull_request', developPr, [file]).run, true, file);
  }
  assert.equal(selectScope('pull_request', developPr, ['package.json']).run, true);
});

test('non-develop pushes stay out of scope even when workflows change', () => {
  const event = { ref: 'refs/heads/feature/example' };
  assert.equal(selectScope('push', event, ['MessageLoggerV2.plugin.js']).run, false);
  assert.equal(selectScope('push', event, ['.github/workflows/ci.yml']).run, false);
});

test('non-develop PR bases stay out of scope even when workflows change or diff is unavailable', () => {
  const event = { pull_request: { base: { ref: 'release' } } };
  assert.equal(selectScope('pull_request', event, ['MessageLoggerV2.plugin.js']).run, false);
  assert.equal(selectScope('pull_request', event, ['.github/workflows/ci.yml']).run, false);
  assert.equal(selectScope('pull_request', event, null).run, false);
});

test('develop pushes test code and skip docs-only changes; manual runs are always full', () => {
  const develop = { ref: 'refs/heads/develop' };
  assert.equal(selectScope('push', develop, ['docs/release.md']).run, false);
  assert.equal(selectScope('push', develop, ['tools/ci-scope.cjs']).run, true);
  assert.equal(selectScope('workflow_dispatch', {}, []).run, true);
  assert.equal(selectScope('workflow_dispatch', { ref: 'refs/heads/feature/example' }, []).run, true);
});

test('unknown and unavailable change ranges conservatively run tests', () => {
  assert.equal(selectScope('pull_request', developPr, null).run, true);
  assert.deepEqual(changedFiles('push', { before: sha('0'), after: sha('1') }), null);
  assert.deepEqual(changedFiles('pull_request', { pull_request: { base: { sha: 'bad' }, head: { sha: sha('1') } } }), null);
  assert.equal(selectScope('push', { ref: 'refs/heads/develop' }, null).run, true);
});

test('Git ranges exclude base-only PR changes, include push changes, and retain rename deletions', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-scope-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (args, input) => execFileSync('git', args, { cwd: repo, input, encoding: 'utf8', stdio: input ? ['pipe', 'pipe', 'pipe'] : 'pipe' });

  git(['init', '-q']);
  git(['fast-import'], [
    'commit refs/heads/root',
    'mark :1',
    'committer CI scope <ci-scope@example.invalid> 1600000000 +0000',
    'data 4',
    'root',
    'M 100644 inline plugin.js',
    'data 7',
    'source\n',
    '',
    'commit refs/heads/develop',
    'mark :2',
    'committer CI scope <ci-scope@example.invalid> 1600000001 +0000',
    'data 4',
    'base',
    'from :1',
    'M 100644 inline base-only.js',
    'data 5',
    'base\n',
    '',
    'commit refs/heads/feature',
    'mark :3',
    'committer CI scope <ci-scope@example.invalid> 1600000002 +0000',
    'data 7',
    'feature',
    'from :1',
    'D plugin.js',
    'M 100644 inline docs/plugin.md',
    'data 7',
    'source\n',
    '',
    'done',
    '',
  ].join('\n'));
  const refs = git(['rev-parse', 'refs/heads/root', 'refs/heads/develop', 'refs/heads/feature']).trim().split('\n');
  const [root, develop, feature] = refs;

  const prFiles = changedFiles('pull_request', {
    pull_request: { base: { ref: 'develop', sha: develop }, head: { sha: feature } },
  }, repo);
  assert.deepEqual(prFiles.sort(), ['docs/plugin.md', 'plugin.js']);
  assert.equal(prFiles.includes('base-only.js'), false, 'three-dot range excludes base-only changes');
  assert.equal(selectScope('pull_request', developPr, prFiles).run, true, 'source deletion keeps a move into docs in test scope');

  const pushFiles = changedFiles('push', { ref: 'refs/heads/develop', before: root, after: develop }, repo);
  assert.deepEqual(pushFiles, ['base-only.js'], 'two-dot range includes the pushed change');
  assert.equal(selectScope('push', { ref: 'refs/heads/develop' }, pushFiles).run, true);
});

test('Git diff failure conservatively selects tests', () => {
  const files = changedFiles('pull_request', {
    pull_request: { base: { ref: 'develop', sha: sha('a') }, head: { sha: sha('b') } },
  }, '/missing-repository');
  assert.equal(files, null);
  assert.equal(selectScope('pull_request', developPr, files).run, true);
});
