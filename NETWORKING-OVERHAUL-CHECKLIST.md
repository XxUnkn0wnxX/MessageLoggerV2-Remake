# Networking Overhaul Checklist

> Temporary tracked working checklist for `fix/native-media-networking`.
> The user authorized pushing this working handoff branch to `origin` on
> 2026-07-26. Remove the file before eventual promotion into `develop`/`main`
> if the user still wants it absent from the final product tree.

## How to use this file

This file has two jobs:

1. **Checklist:** complete the unchecked stages in order and tick only work that
   has evidence.
2. **Living handoff:** after every material discovery, scope decision, failed
   check, implementation stage, or runtime test, update the snapshot and
   activity log so a brand-new session can continue without relying on chat
   history.

Before each stage commit:

- [ ] Tick the completed work in that stage.
- [ ] Record exact commands and results in the stage result block.
- [ ] Record changed files and important implementation decisions.
- [ ] Record failures, unresolved questions, and runtime-only work still needed.
- [ ] Update **Exact next action** below.
- [ ] Add an entry to **Handoff activity log**.

Never mark a stage complete merely because code was written. Its required tests,
review, checklist update, and commit must also be complete.

## Living handoff snapshot

- **Last updated:** 2026-07-26
- **Repository:** `$HOME/Apps/Dev/BD/BD-Plugins/MessageLoggerV2-Remake`
- **Working branch:** `fix/native-media-networking`
- **Branch base:** `a5eadbe736f5a0cf4b7a3730bf9950ade17ad752`
  (`docs: prepare 2.8.2.8 release notes`)
- **Upstream status:** Published as `origin/fix/native-media-networking` on
  2026-07-26 with local upstream tracking. `develop` and `main` both still point
  to the same released base commit and track their matching `origin` branches.
- **Paused attachment work:** The renamed `fix/attachment-gate` remains
  separate and tracks `origin/fix/attachment-gate`. Its standalone handoff
  commit is protected by the local-only `local/attachment-gate-handoff` tag.
  Do not merge or implement that feature as part of this networking branch.
- **Implementation state:** Audit and design only. No networking behavior,
  setting, test, documentation, version, changelog, or live-plugin source has
  been changed.
- **Current tracked task changes:** Documentation-only checklist/handoff
  commits; no plugin implementation.
- **Live plugin:** Not updated for this task because implementation has not
  started.
- **Publishing authority:** The user explicitly authorized pushing both working
  branches to `origin` on 2026-07-26. No merge into `develop`/`main` is
  authorized.

### Exact next action

Leave this branch paused after publishing it. When the user later authorizes
implementation, re-read this entire file, verify the handoff snapshot, then run
the Stage 0 baseline gate before editing plugin behavior.

### Resume procedure for a new session

1. Read the repository `AGENTS.md` instructions and this entire file.
2. Source `~/.zshrc`; the expected Git binary is `/usr/local/bin/git`.
3. Confirm the repository path, current branch, `HEAD`, and `git status`.
4. Preserve all existing user changes. Do not reset, clean, switch branches, or
   merge merely because the snapshot has drifted.
5. Compare the actual state with **Living handoff snapshot** and record any
   drift before proceeding.
6. Read the latest **Handoff activity log**, **Amendments and discoveries**, and
   every incomplete stage result block.
7. If plugin behavior has not yet been edited, run the Stage 0 baseline.
8. Continue from **Exact next action**, not from assumptions based on older chat.
9. Before every later commit, update this file so the recorded commit, tests,
   failures, changed files, and next action match reality.

## Current status

- [x] Networking scope audited without changing plugin behavior.
- [x] Existing explicit fetch call sites inventoried.
- [x] Local cache/blob behavior separated from remote networking behavior.
- [x] User-approved architecture recorded below.
- [x] Baseline test gate passed.
- [ ] Implementation started.
- [ ] Automated verification passed.
- [ ] Live BetterDiscord verification passed.
- [ ] Final implementation committed.

## Problem being solved

The current persistent media downloader uses Chromium renderer `fetch()`. Remote
hosts that work in an ordinary browser tab can still fail inside Discord because
renderer fetches are subject to CORS and mixed-content policy. Observed examples
included:

- A Waifugami HTTPS image returning HTTP 200 but being rejected by CORS because
  the response lacks an allowed-origin header.
- An HTTP PlayStation-hosted image being blocked as mixed content on Discord's
  HTTPS page.
- Other hosts returning genuine 403 responses or delivering data extremely
  slowly; those remain ordinary server/network failures rather than transport
  compatibility failures.

The intended default is BetterDiscord's native networking API, which performs
the remote request outside the restricted Discord renderer request path. The
legacy method remains available for explicit compatibility testing and for
BetterDiscord versions that do not expose a compatible native API.

## Approved contract

- [ ] Add an Advanced setting named **Force legacy networking**.
- [ ] Default the setting to `false`.
- [ ] With the setting off, use `BdApi.Net.fetch()` when it is available and
      compatible.
- [ ] With the setting on, route plugin-owned remote requests through the legacy
      Discord renderer `fetch()` method.
- [ ] Automatically route to legacy networking when `BdApi.Net.fetch()` is
      missing or synchronously incompatible.
- [ ] Keep all transport selection inside one central network handler.
- [ ] Leave no direct `BdApi.Net.fetch()` or renderer `fetch()` selection in
      individual callers.
- [ ] Do not switch the entire session to legacy mode for an ordinary HTTP
      failure, timeout, abort, DNS failure, 403, 404, or one bad URL.
- [ ] Keep renderer `fetch()` reachable only through the central handler's
      forced/compatibility legacy branch.

### Transport matrix

| Force legacy | Native API state | Selected transport |
|---|---|---|
| Off | Available and compatible | `BdApi.Net.fetch()` |
| Off | Missing or incompatible | Legacy renderer `fetch()` |
| On | Any | Legacy renderer `fetch()` |

### Compatibility-detection boundary

- Capability detection must at minimum verify that `BdApi.Net.fetch` is a
  callable function.
- If invoking it throws synchronously or does not return a usable asynchronous
  request shape, native networking may be marked unavailable for that plugin
  session.
- Do not interpret a rejected request promise, HTTP response status, timeout, or
  abort as proof that the BetterDiscord API itself is incompatible.
- Do not try the legacy method after every remote failure; doing so would
  duplicate requests and reintroduce the same renderer restrictions this work
  is meant to avoid.
- Use only native options common to the local BetterDiscord fork and mainstream
  BetterDiscord. Do not rely unconditionally on fork-only networking options.

## Central handler coverage

Every explicit remote HTTP(S) request owned by MessageLogger must use the
central handler:

- [ ] Plugin update checks.
- [ ] Persistent media-cache downloads.
- [ ] Remote-image reads for **Copy to Clipboard**.
- [ ] Deferred media-cache queue replays.
- [ ] Removed-attachment recovery downloads.
- [ ] Normal attachment, embed, component-media, and sticker downloads.
- [ ] Anti-Nuke media pre-caching.
- [ ] Future wildcard attachment downloads when that separate feature is
      implemented.

### Audited current call sites

- [x] `checkNewUpdate()` directly uses `BdApi.Net.fetch()`.
- [x] `fetchMediaCacheResponse()` directly uses renderer `fetch()`.
- [x] `cacheImage()` is the sole persistent cache-write downloader and calls
      `fetchMediaCacheResponse()`.
- [x] `cacheMessageImages()` funnels attachments, embeds, component media, and
      stickers through `cacheImage()`.
- [x] Anti-Nuke calls `cacheMessageImages()` and does not have a separate
      downloader.
- [x] The image-context **Copy to Clipboard** action currently selects a fetch
      implementation independently.
- [x] No Axios, Node HTTP/HTTPS, Electron `net`, external request library, or
      separate XHR downloader was found.

### Current source map at the branch base

Line numbers are orientation aids and may move; symbol names are authoritative.

| Approximate line | Symbol/path | Current behavior |
|---|---|---|
| 576 | `checkNewUpdate()` | Calls `BdApi.Net.fetch()` directly for plugin source. |
| 977 | `imageCacheServerSimulator` | Resolves synthetic cache keys to local files and returns local object URLs. |
| 3670 | `reportDebugEvent()` | Independently routes the same debug event to console and/or toast/notification. |
| 4311 | Advanced settings category | Planned location for the force-legacy switch. |
| 7189 | `flushPendingMediaCacheRequests()` | Replays queued downloads through `cacheImage()`. |
| 8588 | `_getChangedAttachments()` | Sends removed attachments through `cacheImage()`. |
| 11888 | `fetchMediaCacheResponse()` | Owns cache timeout/abort handling but currently calls renderer `fetch()`. |
| 11931 | `cacheImage()` | Sole persistent cache-write downloader; consumes a Response and writes bytes. |
| 12035 | `cacheMessageImages()` | Enumerates qualifying attachments, embeds, components, and stickers. |
| 13222 | Anti-Nuke pre-cache helper | Calls `cacheMessageImages()` before ordinary policy returns. |
| 13626 | Normal incoming-message cache path | Calls `cacheMessageImages()`. |
| 17271 | Image context-menu local request | Downloads or reads image bytes for **Copy to Clipboard** and currently chooses a transport itself. |

### Expected implementation shape

The final names may be adjusted for consistency, but responsibility must remain
separated:

```text
plugin-owned remote caller
  -> central fetchNetworkResponse(url, options)
       -> native BdApi.Net.fetch()       [default]
       -> legacy renderer fetch()        [forced or API incompatible]

media cache caller
  -> fetchMediaCacheResponse(url)
       -> cache-specific timeout/abort bookkeeping
       -> central fetchNetworkResponse(...)
       -> existing Response processing and filesystem write
```

`fetchMediaCacheResponse()` should continue owning cache-specific cancellation
and timeout behavior. The lower network handler should own transport selection
and legacy-mode reporting. Callers must not repeat those decisions.

## Local data that must stay local

The networking handler is for remote fetches/downloads. Existing local data
must not be sent through networking merely to read it again:

- [ ] Read already-cached files from the filesystem.
- [ ] Keep `blob:` object URLs local.
- [ ] Keep `data:` resources and the local error placeholder local.
- [ ] Keep cache file writes, deletion, reveal-in-folder, and cleanup local.
- [ ] Make **Copy to Clipboard** use existing cached bytes or the resolved local
      file where possible.
- [ ] Use the central network handler only when clipboard copying genuinely
      requires a remote download.
- [ ] Continue revoking locally created object URLs during cleanup.

`http://localhost:7474/...` is only a synthetic cache lookup key. The plugin
does not start a server or listen on port 7474. Its simulator parses the key,
reads the matching cache file with `fs`, and returns a local `blob:` URL.

### Clipboard behavior

The MessageLogger image-context menu adds its own **Copy to Clipboard** action.
It currently obtains image bytes, converts them to a `Uint8Array`, and passes
them to `DiscordNative.clipboard.copyImage()`.

- For a genuinely remote source, it must use the central remote network handler.
- For a MessageLogger-owned cached/blob source, prefer resolving the existing
  cache entry and reading the local bytes rather than fetching its object URL.
- It does not add a logger record or write a new cache file.
- Preserve the existing user-facing failure notification and console error.

## Boundaries that are not plugin HTTP calls

- [x] Normal message logging uses Discord dispatcher/store events and does not
      fetch message text through this handler.
- [x] Discord's internal `MessageActions.fetchMessages()` remains Discord-owned.
- [x] The XHR patch observes local message-delete requests and does not create a
      downloader.
- [x] Browser loading from `<img src>` or `<video src>` is Chromium element
      loading, not an explicit MessageLogger `fetch()` call.
- [ ] Do not broaden this transport change into a renderer prefetch/blob
      conversion redesign without a separate user decision.

## Debug reporting

Use this exact message for both forced and automatic legacy selection:

> Network: routing plugin requests through the legacy Discord renderer fetch()
> method.

- [ ] Route the message through the existing debug console/toast controls.
- [ ] With `debugLogging` enabled, print it once to the console.
- [ ] With `debugToasts` enabled, show it once through the configured debug
      notification route.
- [ ] With both enabled, emit once to each output.
- [ ] With both disabled, remain silent.
- [ ] Emit once when automatic compatibility detection activates legacy mode.
- [ ] Emit immediately when the force toggle changes from off to on.
- [ ] Emit once at startup when forced mode was already saved.
- [ ] Permit a new notice after leaving and later re-entering legacy mode.
- [ ] Do not repeat it per request, file, retry, or failure.
- [ ] If legacy mode was selected while a debug output was disabled, allow that
      output to receive one notice when it is subsequently enabled.

The existing `reportDebugEvent()` helper already provides independent
`debugLogging` and `debugToasts` routing. Reuse or extend that established route
instead of introducing a competing notification implementation. De-duplication
state must be per legacy-mode activation and sufficiently output-aware that a
debug output which was disabled at detection can receive one later notice
without causing per-request spam.

## Behavior that must remain unchanged

- [ ] Media-cache master gating.
- [ ] Maximum cache file-size enforcement.
- [ ] Timeout and cancellation behavior.
- [ ] Abort-controller tracking and plugin-stop cleanup.
- [ ] Existing retry count and delay.
- [ ] Terminal 403/404 handling.
- [ ] Cache paths, filenames, and local object-URL cleanup.
- [ ] Disable-saving deferred queue behavior.
- [ ] Delete-cached-files-with-log-record behavior.
- [ ] Forum, post, thread, and restored-message behavior.
- [ ] Anti-Nuke capture ordering and ignore-policy bypass behavior.
- [ ] Persisted message/schema compatibility.

## Expected tracked files

Keep the change surface narrow. Amend this list before editing another tracked
area:

- `MessageLoggerV2.plugin.js`
- `tests/media.test.js`
- `tests/source-contracts.test.js`
- `tests/settings-recovery.test.js` if default/normalization coverage belongs
  there
- `tests/persistence.test.js` if debug-router coverage belongs there
- `docs/settings.md`
- `docs/tests.md`
- `NETWORKING-OVERHAUL-CHECKLIST.md` while the local task is active

Do not modify the BetterDiscord host checkout. Read-only comparison against
these compatibility targets is allowed when required:

- Local live fork:
  `$HOME/Apps/Dev/BD/BetterDiscord`, branch `develop`
- Mainstream comparison:
  `upstream/development` or its local tracking branch

## Planned deterministic coverage

- [ ] Default setting is `false` and normalizes missing older values safely.
- [ ] Advanced setting placement, label, note, and action behavior are stable.
- [ ] Native available + force off selects `BdApi.Net.fetch()`.
- [ ] Force on selects legacy renderer `fetch()` even when native exists.
- [ ] Native API missing selects legacy renderer `fetch()`.
- [ ] Synchronous native incompatibility selects legacy for the session.
- [ ] Ordinary asynchronous request rejection does not change global mode.
- [ ] Native call receives compatible headers, abort signal, and timeout-related
      behavior required by its caller.
- [ ] Update checks, cache downloads, and remote clipboard reads all enter the
      central handler.
- [ ] No caller retains a direct transport decision.
- [ ] Cached/blob clipboard reads stay local.
- [ ] Forced and automatic legacy selection use the exact same message.
- [ ] Console and toast routes remain independent.
- [ ] Debug reporting is silent with both debug flags off.
- [ ] Multiple files and retries do not repeat the notice.
- [ ] Existing media timeout, abort, retry, status, file-size, and write-epoch
      tests remain green.

## Stage 0 — Baseline gate

- [x] Confirm branch is `fix/native-media-networking`.
- [x] Confirm the worktree contains no unexpected user changes.
- [x] Run `npm test` before editing plugin behavior.
- [x] Record the baseline result below.
- [x] Baseline passed, so the failure stop gate was not triggered.

Baseline result:

- Date: 2026-07-26
- Commit: `a5eadbe736f5a0cf4b7a3730bf9950ade17ad752`
- Result: PASS — `npm test` completed with 339 tests passed, 0 failed.
- Notes: `node --check MessageLoggerV2.plugin.js` passed as part of `npm test`;
  `git diff --check` also passed. The only worktree change was this expected
  checklist/handoff.

## Stage 1 — Setting and transport contracts

- [ ] Add the defaulted boolean setting.
- [ ] Add it to the Advanced settings UI with concise compatibility wording.
- [ ] Confirm older settings normalize the missing value to `false`.
- [ ] Add central transport-selection state and helpers.
- [ ] Add source/settings regression coverage.
- [ ] Run the focused settings and source-contract suites.
- [ ] Run `npm test`.
- [ ] Run `git diff --check`.
- [ ] Commit only after the stage passes.

Stage 1 commit/result:

- Commit:
- Tests:
- Notes:

## Stage 2 — Central network handler

- [ ] Implement the one low-level plugin network handler.
- [ ] Preserve caller-supplied headers, signals, and compatible options.
- [ ] Route the update checker through it.
- [ ] Route the media-cache response function through it.
- [ ] Route remote clipboard reads through it.
- [ ] Remove direct transport decisions from all callers.
- [ ] Re-run a repository search proving no direct fetch calls remain outside
      the handler.
- [ ] Add native, forced-legacy, and automatic-fallback tests.
- [ ] Prove ordinary request failures do not change the global transport mode.
- [ ] Run focused tests, `npm test`, and `git diff --check`.
- [ ] Commit only after the stage passes.

Stage 2 commit/result:

- Commit:
- Tests:
- Remaining direct-fetch audit:
- Notes:

## Stage 3 — Local clipboard path

- [ ] Resolve MessageLogger-owned cached/blob images back to existing local
      bytes or their cache file where possible.
- [ ] Keep local clipboard reads out of remote networking.
- [ ] Retain remote clipboard support through the central handler.
- [ ] Preserve clipboard failure logging and user notification behavior.
- [ ] Add local, remote, and failure regression coverage where deterministic.
- [ ] Run focused tests, `npm test`, and `git diff --check`.
- [ ] Commit only after the stage passes.

Stage 3 commit/result:

- Commit:
- Tests:
- Notes:

## Stage 4 — Debug routing and de-duplication

- [ ] Implement the exact shared legacy-routing message.
- [ ] Cover automatic detection, forced activation, and forced startup.
- [ ] Cover console-only, toast-only, both, and neither.
- [ ] Prove retries and multiple downloads do not create message spam.
- [ ] Prove a later debug-output enable can receive one pending notice.
- [ ] Run focused tests, `npm test`, and `git diff --check`.
- [ ] Commit only after the stage passes.

Stage 4 commit/result:

- Commit:
- Tests:
- Notes:

## Stage 5 — Documentation and static final review

- [ ] Document the Advanced setting and automatic fallback.
- [ ] Document the debug event.
- [ ] Update the official automated/runtime test matrix.
- [ ] Keep the networking notes brief and avoid attachment-overhaul promises.
- [ ] Confirm no version bump.
- [ ] Confirm no built-in changelog change unless separately requested.
- [ ] Review the final diff for unrelated behavior changes.
- [ ] Run `npm test`.
- [ ] Run `git diff --check`.
- [ ] Verify final file contents and commit the passing stage.

Stage 5 commit/result:

- Commit:
- Tests:
- Notes:

## Stage 6 — Live BetterDiscord verification

- [ ] Copy only `MessageLoggerV2.plugin.js` into the live BetterDiscord plugins
      directory.
- [ ] Compare hashes and confirm the live plugin matches the repository file.
- [ ] Do not relaunch Discord automatically.
- [ ] Verify default native routing with a normal Discord CDN URL.
- [ ] Verify the previously failing Waifugami cross-origin URL.
- [ ] Verify an HTTP/mixed-content media URL.
- [ ] Verify media-cache file-size limits.
- [ ] Verify abort/cancellation behavior when caching is disabled or the plugin
      stops.
- [ ] Verify forced legacy routing.
- [ ] Verify the force toggle can return to native routing immediately.
- [ ] Verify console-only, toast-only, both, and disabled debug output.
- [ ] Verify only one routing notice appears per legacy activation.
- [ ] Verify plugin update checks through the handler.
- [ ] Verify cached-image clipboard copying remains local.
- [ ] Verify remote-image clipboard copying through the handler.
- [ ] Record any runtime-only findings and amend earlier stages if necessary.

Live result:

- Date:
- BetterDiscord/runtime version:
- Result:
- Notes:

## Final branch gate

- [ ] All required stages completed or explicitly deferred with a reason.
- [ ] Full test suite passes.
- [ ] `git diff --check` passes.
- [ ] Live plugin and repository hashes match.
- [ ] No unrelated attachment-gate implementation was included.
- [ ] No version or built-in changelog change was included without approval.
- [x] Working-branch pushes were performed only after explicit approval.
- [ ] Remove this checklist from the final tree when requested.
- [ ] If required, remove or squash checklist-only history before eventual
      promotion into `develop`/`main`.

## Amendments and discoveries

Record changes to the plan here instead of silently changing the agreed scope.

| Date | Stage | Amendment or discovery | Reason/approval |
|---|---|---|---|
| 2026-07-26 | Audit | One central handler will cover every explicit plugin-owned remote request, not only media-cache downloads. | User clarification |
| 2026-07-26 | Audit | Cached files and blob-backed clipboard data stay local where possible. | User clarification |
| 2026-07-26 | Audit | `localhost:7474` is a synthetic cache key, not a listening service. | Static source audit |
| 2026-07-26 | Handoff | The tracked checklist will also be the growing, commit-by-commit session handoff. | User requirement |
| 2026-07-26 | Handoff | Publish both working branches to `origin`; rename the attachment branch to `fix/attachment-gate`. | User instruction |

## Handoff activity log

Append entries; do not replace earlier history. Each entry should leave enough
evidence for another session to understand what changed and why.

### 2026-07-26 — Read-only networking audit and checklist creation

- **Completed:** Inventoried explicit plugin fetch paths, traced all persistent
  media caching into `cacheImage()`/`fetchMediaCacheResponse()`, confirmed
  Anti-Nuke is an early caller rather than a separate downloader, separated
  local blob/cache access from remote requests, and confirmed that the
  `localhost:7474` value is not a listening service.
- **Decisions:** One central handler will own all plugin remote transport
  selection. Native BetterDiscord networking is the default; a new Advanced
  switch or native API incompatibility selects legacy renderer networking.
  Local cached clipboard data stays local.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md` only.
- **Tests:** PASS — `npm test` reported 339 passed and 0 failed;
  `git diff --check` passed.
- **Runtime work:** None; live plugin was not touched.
- **Blockers:** None.
- **Next:** Commit this file alone, then leave the networking work paused until
  implementation is explicitly resumed.

### 2026-07-26 — Working-branch publication

- **Completed:** Renamed the attachment branch to `fix/attachment-gate`,
  committed its separate checklist/living handoff, protected that commit with
  the local-only `local/attachment-gate-handoff` tag, and published the
  attachment branch with upstream tracking.
- **Decisions:** The two provisional attachment code commits may be rebuilt
  after networking lands, but the handoff commit must survive. The local safety
  tag is not part of the authorized branch push.
- **Files changed on this branch:** This handoff status update only.
- **Tests:** The networking branch baseline remains the previously recorded
  339/339 pass; no plugin source changed during publication.
- **Runtime work:** None; the live plugin was not touched.
- **Blockers:** None for publication. Implementation remains paused.
- **Next:** Publish `fix/native-media-networking`, keep it checked out, and wait
  for the user to resume Stage 0.

### Handoff entry template

```text
### YYYY-MM-DD — Stage and outcome

- Completed:
- Decisions:
- Files changed:
- Tests and exact results:
- Runtime evidence:
- Failures or blockers:
- Commit:
- Exact next action:
```
