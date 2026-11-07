#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ZERO_SHA = /^0{40}$/;
const SHA = /^[0-9a-f]{40}$/i;

function fileNeedsTests(file) {
  const path = file.replaceAll('\\', '/');

  if (/^\.github\/(?:ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)\/[^/]+\.md$/i.test(path)
    || /^\.github\/PULL_REQUEST_TEMPLATE\.md$/i.test(path)) return false;
  if (path.startsWith('.github/')) return true;
  if (path.startsWith('tests/') || path.startsWith('tools/')) return true;
  if (path.startsWith('docs/')) {
    return !/\.(?:md|mdx|markdown|rst|txt|adoc|asciidoc|html|pdf|png|jpe?g|gif|svg|webp|ico)$/i.test(path);
  }
  if (!path.includes('/') && /\.md$/i.test(path)) return false;
  if (!path.includes('/') && /^(README|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|AUTHORS|CONTRIBUTORS)$/i.test(path)) return false;
  if (!path.includes('/') && /^(LICENSE|NOTICE)(\.(?:md|txt))?$/i.test(path)) return false;

  return true;
}

function selectScope(eventName, event, files) {
  if (eventName === 'workflow_dispatch') {
    return { run: true, reason: 'Manual dispatch runs the full test suite.' };
  }

  if (eventName === 'push') {
    const ref = event && typeof event.ref === 'string' ? event.ref : '';
    if (ref && ref !== 'refs/heads/develop') {
      return { run: false, reason: 'Push is outside the develop branch CI scope.' };
    }
    if (!ref) {
      return { run: true, reason: 'Push branch is unavailable; running tests conservatively.' };
    }
  }

  if (eventName === 'pull_request') {
    const baseRef = event && event.pull_request && event.pull_request.base && event.pull_request.base.ref;
    if (typeof baseRef === 'string' && baseRef !== 'develop') {
      return { run: false, reason: 'Pull request does not target develop; skipping this workflow scope.' };
    }
  }

  if (!Array.isArray(files)) {
    return { run: true, reason: 'Changed-file range is unavailable; running tests conservatively.' };
  }

  const codeChanged = files.some(fileNeedsTests);
  return codeChanged
    ? { run: true, reason: 'Code, tests, tooling, or workflow files changed; running tests.' }
    : { run: false, reason: 'Documentation-only changes; no test workload is needed.' };
}

function changedFiles(eventName, event, cwd = process.cwd(), execGit = execFileSync) {
  let range;
  if (eventName === 'pull_request') {
    const base = event && event.pull_request && event.pull_request.base && event.pull_request.base.sha;
    const head = event && event.pull_request && event.pull_request.head && event.pull_request.head.sha;
    if (!SHA.test(base || '') || !SHA.test(head || '')) return null;
    range = `${base}...${head}`;
  } else if (eventName === 'push') {
    const before = event && event.before;
    const after = event && event.after;
    if (!SHA.test(before || '') || !SHA.test(after || '') || ZERO_SHA.test(before)) return null;
    range = `${before}..${after}`;
  } else {
    return null;
  }

  try {
    const output = execGit('git', ['diff', '--name-only', '-z', '--no-renames', range], {
      cwd,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.toString('utf8').split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  try {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const eventName = process.env.GITHUB_EVENT_NAME || '';
    const files = eventName === 'workflow_dispatch' ? [] : changedFiles(eventName, event);
    const scope = selectScope(eventName, event, files);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${scope.run}\n`);
    console.log(scope.reason);
  } catch (error) {
    const reason = `Event scope could not be read (${error.message}); running tests conservatively.`;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'run=true\n');
    console.log(reason);
  }
}

if (require.main === module) main();

module.exports = { changedFiles, fileNeedsTests, selectScope };
