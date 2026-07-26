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
- **Upstream status:** `origin/fix/native-media-networking` remains at the
  published handoff commit `54a1f385`; local staged implementation is
  intentionally ahead and has not been pushed. `develop` and `main` both still
  point to the same released base commit and track their matching `origin`
  branches.
- **Paused attachment work:** The renamed `fix/attachment-gate` remains
  separate and tracks `origin/fix/attachment-gate`. Its standalone handoff
  commit is protected by the local-only `local/attachment-gate-handoff` tag.
  Do not merge or implement that feature as part of this networking branch.
- **Implementation state:** Stage 2's central media network handler is
  implemented and passes its focused and full automated gates. Persistent
  media-cache downloads now default to native BetterDiscord networking while
  synchronous API incompatibility or the force setting selects renderer
  networking. Output-aware legacy-routing diagnostics remain Stage 4 work.
- **Current tracked task changes:** Stages 1-2 are limited to
  `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/settings-recovery.test.js`, `tests/source-contracts.test.js`, and this
  checklist.
- **Live plugin:** Not updated for this task because implementation has not
  started.
- **Publishing authority:** The user explicitly authorized pushing both working
  branches to `origin` on 2026-07-26. No merge into `develop`/`main` is
  authorized.

### Exact next action

Commit the passing Stage 2 implementation, record that exact commit hash in
this checklist through the immediate checklist checkpoint, then add Stage 3
source contracts that freeze updater and clipboard transports outside the
media selector. Do not sync the plugin live; the user requested a pre-live
report and separate authorization before that copy.

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

### Session reconstruction references

Current root task session/thread:

- Session ID:
  `019f8e91-06a7-7683-aa18-bdf936727474`
- Local rollout:
  `$HOME/.codex/sessions/2026/07/23/rollout-2026-07-23T20-41-36-019f8e91-06a7-7683-aa18-bdf936727474.jsonl`

Earlier completed-session handoff:

- Session ID:
  `019f8d43-e4c7-7d53-9e2a-f52cb62a03a1`
- Handoff:
  `tmp/MessageLoggerV2SessionHandoff-019f8d43.md`
- Local rollout:
  `$HOME/.codex/sessions/2026/07/23/rollout-2026-07-23T14-37-44-019f8d43-e4c7-7d53-9e2a-f52cb62a03a1.jsonl`

Supporting networking fetch-inventory explorer:

- Session ID:
  `019f9e65-b51a-7792-9614-9bd92451993b`
- Local rollout:
  `$HOME/.codex/sessions/2026/07/26/rollout-2026-07-26T22-28-13-019f9e65-b51a-7792-9614-9bd92451993b.jsonl`

These references are optional local provenance for reconstructing why decisions
were made. This tracked file is the complete branch handoff and remains usable
if the local rollouts or ignored `tmp/` handoff are absent.

### Plan authority

The latest **Approved contract**, **Debug reporting**, **Behavior that must
remain unchanged**, **Amendments and discoveries**, and **Handoff activity
log** entries are authoritative for this branch. They supersede the earlier
exploratory idea of routing every plugin-owned remote request through one
selector. A newer explicit user instruction wins over this file and must be
recorded as an amendment before implementation.

## Current status

- [x] Networking scope audited without changing plugin behavior.
- [x] Existing explicit fetch call sites inventoried.
- [x] Local cache/blob behavior separated from remote networking behavior.
- [x] User-approved architecture recorded below.
- [x] Baseline test gate passed.
- [x] Implementation started.
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

The intended default for persistent media-cache downloads is BetterDiscord's
native networking API, which performs the remote request outside the restricted
Discord renderer request path. The legacy method remains available for explicit
media-cache compatibility testing and for BetterDiscord versions that do not
expose a compatible native API.

The existing updater and clipboard transports are outside this overhaul:

- update checks continue calling `BdApi.Net.fetch()` directly;
- remote-image clipboard reads continue calling `BdApi.Net.fetch()` directly;
- local `blob:` clipboard reads continue calling renderer `fetch()` directly.

This narrower boundary is deliberate. A live Discord-console probe proved that
the current raw updater URL succeeds through `BdApi.Net.fetch()` but fails
through renderer `fetch()` because of the renderer's network restrictions.

## Approved contract

- [x] Add an Advanced setting named **Force legacy media fetching**.
- [x] Default the setting to `false`.
- [x] With the setting off, use `BdApi.Net.fetch()` for persistent media-cache
      downloads when it is available and compatible.
- [x] With the setting on, route only persistent media-cache downloads through
      the legacy Discord renderer `fetch()` method.
- [x] Automatically route media-cache downloads to legacy networking when
      `BdApi.Net.fetch()` is missing or synchronously incompatible.
- [x] Keep media-cache transport selection inside one central media network
      handler.
- [x] Keep update checks on their existing direct `BdApi.Net.fetch()` call.
- [x] Keep remote-image clipboard reads on their existing direct
      `BdApi.Net.fetch()` call.
- [x] Keep local `blob:` clipboard reads on renderer `fetch()` regardless of
      the force setting because they are local object-URL reads.
- [x] Do not switch the media-cache session to legacy mode for an ordinary HTTP
      failure, timeout, abort, DNS failure, 403, 404, or one bad URL.
- [x] Keep remote renderer `fetch()` reachable only through the media handler's
      forced/compatibility legacy branch; local `blob:` reads are the explicit
      non-network exception.

### Transport matrix

This matrix applies only to persistent media-cache downloads.

| Force legacy media fetching | Native API state | Selected media transport |
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
- Do not try the legacy method after every media request failure; doing so would
  duplicate downloads and reintroduce the same renderer restrictions this work
  is meant to avoid.
- Use only native options common to the local BetterDiscord fork and mainstream
  BetterDiscord. Do not rely unconditionally on fork-only networking options.

## Media-cache handler coverage

Every persistent media-cache remote download must use the central media
handler:

- [x] Persistent media-cache downloads.
- [x] Deferred media-cache queue replays.
- [x] Removed-attachment recovery downloads.
- [x] Normal attachment, embed, component-media, and sticker downloads.
- [x] Anti-Nuke media pre-caching.
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
- [x] The image-context **Copy to Clipboard** action intentionally keeps its
      existing independent choice: renderer `fetch()` for local `blob:` URLs
      and `BdApi.Net.fetch()` for remote URLs.
- [x] No Axios, Node HTTP/HTTPS, Electron `net`, external request library, or
      separate XHR downloader was found.

### Current source map at the branch base

Line numbers are orientation aids and may move; symbol names are authoritative.

| Approximate line | Symbol/path | Current behavior |
|---|---|---|
| 576 | `checkNewUpdate()` | Intentionally remains a direct `BdApi.Net.fetch()` call for plugin source. |
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
| 17271 | Image context-menu local request | Intentionally retains renderer `fetch()` for local `blob:` reads and `BdApi.Net.fetch()` for remote clipboard reads. |

### Expected implementation shape

The final names may be adjusted for consistency, but responsibility must remain
separated:

```text
media-cache caller
  -> fetchMediaCacheResponse(url)
       -> cache-specific timeout/abort bookkeeping
       -> central fetchMediaNetworkResponse(...)
            -> native BdApi.Net.fetch()    [default]
            -> legacy renderer fetch()     [forced or API incompatible]
       -> existing Response processing and filesystem write

update checker
  -> direct BdApi.Net.fetch()              [unchanged]

remote clipboard image
  -> direct BdApi.Net.fetch()              [unchanged]

local blob clipboard image
  -> direct renderer fetch()               [unchanged local read]
```

`fetchMediaCacheResponse()` should continue owning cache-specific cancellation
and timeout behavior. The lower media network handler should own media
transport selection and legacy-mode reporting. Non-cache callers must retain
their audited direct behavior.

## Local data that must stay local

The networking handler is for remote fetches/downloads. Existing local data
must not be sent through networking merely to read it again:

- [ ] Read already-cached files from the filesystem.
- [ ] Keep `blob:` object URLs local.
- [ ] Keep `data:` resources and the local error placeholder local.
- [ ] Keep cache file writes, deletion, reveal-in-folder, and cleanup local.
- [ ] Keep **Copy to Clipboard** on its current split: local `blob:` reads use
      renderer `fetch()` and remote reads use `BdApi.Net.fetch()`.
- [ ] Do not route either clipboard branch through the media-cache handler.
- [ ] Continue revoking locally created object URLs during cleanup.

`http://localhost:7474/...` is only a synthetic cache lookup key. The plugin
does not start a server or listen on port 7474. Its simulator parses the key,
reads the matching cache file with `fs`, and returns a local `blob:` URL.

### Clipboard behavior

The MessageLogger image-context menu adds its own **Copy to Clipboard** action.
It currently obtains image bytes, converts them to a `Uint8Array`, and passes
them to `DiscordNative.clipboard.copyImage()`.

- For a genuinely remote source, preserve the existing direct
  `BdApi.Net.fetch()` call.
- For a MessageLogger-owned cached/blob source, preserve the existing local
  renderer `fetch()` call regardless of the media force setting.
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
- [x] Plugin update checks and remote clipboard reads remain direct
      `BdApi.Net.fetch()` consumers outside the media-cache selector.
- [x] Local `blob:` clipboard reads remain direct renderer `fetch()` consumers
      outside remote networking.
- [ ] Do not broaden this transport change into a renderer prefetch/blob
      conversion redesign without a separate user decision.

## Debug reporting

Use this exact message for both forced and automatic legacy selection:

> Networking: media routing is using the old Discord renderer fetch()
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
- [ ] Direct `BdApi.Net.fetch()` update checks.
- [ ] Direct `BdApi.Net.fetch()` remote clipboard reads.
- [ ] Direct renderer `fetch()` local `blob:` clipboard reads.

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

- [x] Default setting is `false` and normalizes missing older values safely.
- [x] Advanced **Force legacy media fetching** placement, note, and action
      behavior are stable.
- [x] Native available + force off selects `BdApi.Net.fetch()` for persistent
      media-cache downloads.
- [x] Force on selects legacy renderer `fetch()` for persistent media-cache
      downloads even when native exists.
- [x] Native API missing selects legacy renderer `fetch()` for persistent
      media-cache downloads.
- [x] Synchronous native incompatibility selects legacy media fetching for the
      session.
- [x] Ordinary asynchronous media request rejection does not change the
      session's selected media transport.
- [x] Native media calls receive compatible headers, abort signals, and
      timeout-related behavior required by the cache caller.
- [ ] All persistent media-cache downloads enter the central media handler.
- [ ] The update checker retains its direct `BdApi.Net.fetch()` call and is
      unaffected by the media force setting.
- [ ] Remote clipboard reads retain their direct `BdApi.Net.fetch()` call and
      are unaffected by the media force setting.
- [ ] Local `blob:` clipboard reads retain renderer `fetch()` and are
      unaffected by the media force setting.
- [ ] A source audit permits only those documented non-cache direct calls and
      proves there is no alternate remote persistent-cache downloader.
- [ ] Forced and automatic legacy selection use the exact same message.
- [ ] Console and toast routes remain independent.
- [ ] Debug reporting is silent with both debug flags off.
- [ ] Multiple files and retries do not repeat the notice.
- [x] Existing media timeout, abort, retry, status, file-size, and write-epoch
      tests remain green.

## Stage 0 — Baseline gate

- [x] Confirm branch is `fix/native-media-networking`.
- [x] Confirm the worktree contains no unexpected user changes.
- [x] Run `npm test` before editing plugin behavior.
- [x] Record the baseline result below.
- [x] Baseline passed, so the failure stop gate was not triggered.

Baseline result:

- Initial audit gate: PASS on 2026-07-26 at
  `a5eadbe736f5a0cf4b7a3730bf9950ade17ad752` — `npm test` completed with
  339 tests passed, 0 failed; `node --check MessageLoggerV2.plugin.js` and
  `git diff --check` passed.
- Implementation-resume gate: PASS on 2026-07-26 at
  `54a1f3858140e319873135fcb3485b3ee8fd1266` — `npm test` completed with
  339 tests passed, 0 failed; `node --check MessageLoggerV2.plugin.js` passed
  as part of `npm test`; `git diff --check` passed; the worktree was clean
  before this checklist update.

## Stage 1 — Setting and transport contracts

- [x] Add the defaulted `Force legacy media fetching` boolean setting.
- [x] Add it to the Advanced settings UI with concise media-cache compatibility
      wording.
- [x] Confirm older settings normalize the missing value to `false`.
- [x] Add media-only transport-selection state and helpers.
- [x] Add source/settings regression coverage.
- [x] Run the focused settings and source-contract suites.
- [x] Run `npm test`.
- [x] Run `git diff --check`.
- [x] Commit only after the stage passes.

Stage 1 commit/result:

- Commit: `cedf3a65bf020abe3608642b63a62e4a6cb1633b`
  (`feat: add media fetch transport setting`).
- Tests: PASS — focused
  `node --test tests/settings-recovery.test.js tests/source-contracts.test.js tests/media.test.js`
  completed with 108 passed, 0 failed; full `npm test` completed with 340
  passed, 0 failed; `node --check MessageLoggerV2.plugin.js` passed within the
  full suite; `git diff --check` passed.
- Notes: The setting defaults to `false`; generic owned-setting normalization
  repairs missing or malformed older values while retaining a saved `true`;
  the Advanced action updates only session transport-selection state. Stage 1
  does not route a media request, emit the legacy notice, or touch updater or
  clipboard behavior.

## Stage 2 — Central media network handler

- [x] Implement one low-level media-cache network handler.
- [x] Preserve media caller headers, signals, and compatible options.
- [x] Route the media-cache response function through it.
- [x] Prove all persistent media-cache callers still converge through
      `cacheImage()` and `fetchMediaCacheResponse()`.
- [x] Preserve the update checker and both clipboard branches exactly as the
      documented direct non-cache transports.
- [x] Re-run a repository search proving no alternate remote persistent-cache
      fetch remains outside the media handler.
- [x] Add native, forced-legacy, and automatic media-fallback tests.
- [x] Prove ordinary media request failures do not change the session's media
      transport mode.
- [x] Run focused tests, `npm test`, and `git diff --check`.
- [x] Commit only after the stage passes.

Stage 2 commit/result:

- Commit: `3c13374bb1a387cbb6ae13e7294cabb1317c99e5`
  (`feat: route media cache through native networking`).
- Tests: PASS — `node --test tests/media.test.js` completed with 47 passed, 0
  failed; full `npm test` completed with 349 passed, 0 failed;
  `node --check MessageLoggerV2.plugin.js` passed within the full suite;
  `git diff --check` passed.
- Remaining direct-fetch audit: `rg -n
  "fetchMediaNetworkResponse|fetchMediaCacheResponse|cacheImage\\(|cacheMessageImages\\(|BdApi\\.Net\\.fetch|\\bfetch\\("
  MessageLoggerV2.plugin.js` found updater native fetch at line 578, all media
  renderer branches inside `fetchMediaNetworkResponse()` at lines 11904-11925,
  the sole cache response/write chain at lines 11930-12015, and the unchanged
  clipboard split at line 17340. No alternate persistent-cache downloader was
  found.
- Notes: `fetchMediaNetworkResponse()` is deliberately non-async so it can
  distinguish synchronous API incompatibility from a later rejected network
  promise. Native calls preserve the caller's common options and receive
  `timeout: null`, leaving the logger's existing 15-second AbortController
  timeout authoritative. HTTP failures and asynchronous rejections remain on
  the native session path and never trigger a duplicate renderer request.

## Stage 3 — Preserve non-cache fetch boundaries

- [ ] Keep update checks on their direct `BdApi.Net.fetch()` call.
- [ ] Keep remote clipboard reads on their direct `BdApi.Net.fetch()` call.
- [ ] Keep local `blob:` clipboard reads on renderer `fetch()`.
- [ ] Prove the media force setting does not alter any of those three paths.
- [ ] Keep both clipboard branches out of the media-cache handler.
- [ ] Preserve clipboard failure logging and user notification behavior.
- [ ] Preserve update-check parsing, failure, and notification behavior.
- [ ] Add source-contract and deterministic regression coverage for these
      boundaries where practical.
- [ ] Run focused tests, `npm test`, and `git diff --check`.
- [ ] Commit only after the stage passes.

Stage 3 commit/result:

- Commit:
- Tests:
- Notes:

## Stage 4 — Debug routing and de-duplication

- [ ] Implement the exact shared legacy-routing message.
- [ ] Confirm the shared console/toast text is exactly:
      `Networking: media routing is using the old Discord renderer fetch()
      method.`
- [ ] Cover automatic media compatibility detection, forced activation, and
      forced startup.
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

- [ ] Document the Advanced media-fetching setting and automatic media
      fallback.
- [ ] Document the exact media-routing debug event.
- [ ] Document that updater and clipboard transports are intentionally outside
      the media selector.
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
- [ ] Verify update checks still use direct native networking and work with the
      media force setting both off and on.
- [ ] Verify local `blob:` clipboard copying still uses renderer `fetch()` and
      works with the media force setting both off and on.
- [ ] Verify remote-image clipboard copying still uses direct native networking
      and works with the media force setting both off and on.
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
| 2026-07-26 | Audit | The initial design proposed one handler for every explicit plugin-owned remote request. This was superseded by the later media-only scope decision below. | Earlier user clarification, retained as history |
| 2026-07-26 | Audit | Cached files and blob-backed clipboard data stay local where possible. | User clarification |
| 2026-07-26 | Audit | `localhost:7474` is a synthetic cache key, not a listening service. | Static source audit |
| 2026-07-26 | Handoff | The tracked checklist will also be the growing, commit-by-commit session handoff. | User requirement |
| 2026-07-26 | Handoff | Publish both working branches to `origin`; rename the attachment branch to `fix/attachment-gate`. | User instruction |
| 2026-07-26 | Audit | A Discord-console probe of the raw updater URL failed through renderer `fetch()` in 88 ms but succeeded through `BdApi.Net.fetch()` with HTTP 200, version `2.8.2.8`, 815109 bytes, in 69 ms. | Runtime evidence in ignored `tmp/discord.com-1785071943229.log` |
| 2026-07-26 | Scope | The selector and force toggle govern only persistent media-cache downloads. Update checks and remote clipboard reads remain direct native calls; local `blob:` clipboard reads remain direct renderer calls. | Final user decision after runtime probe |
| 2026-07-26 | Debug | Forced and automatic legacy media selection use: `Networking: media routing is using the old Discord renderer fetch() method.` | User wording requirement |
| 2026-07-26 | Compatibility | Both BetterDiscord targets support native `headers`, `signal`, and `timeout`; native media calls must pass `timeout: null` so the host's 8-second default does not replace the logger's existing 15-second timeout. Fork-only `maxResponseBytes` and `httpsOnly` options remain out of scope. | Read-only comparison of local `develop` and `upstream-development` |
| 2026-07-26 | Resume | Resume implementation, keep every checklist addition/amendment current, preserve all existing functionality, run every focused/full check before deployment, then report and stop before live sync until the user separately authorizes it. | Current user instruction |
| 2026-07-26 | Stage 2 | The central media selector is non-async and latches legacy mode only for a missing/non-callable native API, a synchronous invocation throw, or an unusable thenable shape. A rejected native promise or HTTP failure remains an ordinary request failure and never starts a second renderer request. | Approved compatibility boundary plus deterministic regression evidence |

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
  Local cached clipboard data stays local. This was the initial broad design;
  the later runtime transport-scope entry below supersedes it for updater and
  clipboard requests.
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

### 2026-07-26 — Runtime transport scope correction

- **Completed:** Inspected the ignored Discord-console probe log, re-audited the
  direct updater, media-cache, and clipboard fetch paths, and narrowed the
  planned selector to persistent media-cache downloads only.
- **Decisions:** Update checks remain direct `BdApi.Net.fetch()` calls. Remote
  clipboard reads remain direct `BdApi.Net.fetch()` calls. Local `blob:`
  clipboard reads remain direct renderer `fetch()` calls because they read
  local object URLs. Only the persistent media-cache pipeline uses the new
  selector, force setting, and compatibility fallback.
- **Debug text:** Console and toast reporting will use the exact shared message
  `Networking: media routing is using the old Discord renderer fetch()
  method.` when forced or automatic legacy media routing activates.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md` only.
- **Tests and exact results:** PASS — `npm test` reported 339 passed and 0
  failed. Final `git diff --check` and privacy checks are required immediately
  before this handoff update is committed.
- **Runtime evidence:** Renderer updater fetch failed with
  `TypeError: Failed to fetch` after 88 ms. Native `BdApi.Net.fetch()` returned
  HTTP 200, detected plugin version `2.8.2.8`, and transferred 815109 bytes in
  69 ms.
- **Failures or blockers:** None. Plugin implementation remains intentionally
  paused.
- **Commit:** The documentation-only commit containing this activity entry;
  resolve its exact hash from the current branch history.
- **Exact next action:** After this checklist-only update is committed and
  pushed, leave `fix/native-media-networking` paused until the user explicitly
  resumes implementation.

### 2026-07-26 — Implementation resume and fresh baseline

- **Completed:** Re-read the complete tracked handoff; reconstructed root
  sessions `019f8e91-06a7-7683-aa18-bdf936727474` and
  `019f8d43-e4c7-7d53-9e2a-f52cb62a03a1` plus networking inventory session
  `019f9e65-b51a-7792-9614-9bd92451993b`; verified the clean branch, published
  upstream, checklist-only branch history, and unchanged plugin source; ran a
  fresh implementation baseline.
- **Decisions:** Implement only persistent media-cache networking. Preserve
  updater, clipboard, cache, retry, cancellation, persistence, forum,
  Anti-Nuke, version, and changelog behavior. Complete all pre-live checklist
  work and report before any live plugin copy.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md` only at this checkpoint.
- **Tests and exact results:** PASS — `npm test` reported 339 passed and 0
  failed; `node --check MessageLoggerV2.plugin.js` passed within that command;
  `git diff --check` passed before this checklist edit.
- **Runtime evidence:** Existing probe evidence was reconstructed; no new
  Discord probe or live-plugin change was required.
- **Failures or blockers:** None.
- **Commit:** `f3f4b6c` (`docs: resume networking implementation`).
- **Exact next action:** Implement and validate Stage 1, update this file with
  exact evidence, and commit only after the full stage passes.

### 2026-07-26 — Stage 1 setting and transport contracts

- **Completed:** Added the default-off **Force legacy media fetching** Advanced
  switch, older-config normalization coverage, per-session native
  compatibility selection state/helpers, and focused setting/source/media
  contracts. The renderer media fetch path remains unchanged in this stage.
- **Decisions:** Keep the force preference separate from native compatibility:
  forcing legacy does not label the BetterDiscord API incompatible, while an
  actual session-latched incompatibility will survive turning the force switch
  off. Debug activation/delivery state remains Stage 4 work.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/settings-recovery.test.js`, `tests/source-contracts.test.js`, and
  `NETWORKING-OVERHAUL-CHECKLIST.md`.
- **Tests and exact results:** PASS — focused setting/source/media run: 108
  passed, 0 failed; full `npm test`: 340 passed, 0 failed; plugin syntax passed
  within the full suite; `git diff --check` passed.
- **Runtime evidence:** None required; Stage 1 does not route network traffic.
- **Failures or blockers:** An initial worker draft moved native requests out
  of the established AbortController path. Parent review rejected that draft
  before commit; the final Stage 1 diff restores the existing request path
  byte-for-byte and has no known blocker.
- **Commit:** `cedf3a65bf020abe3608642b63a62e4a6cb1633b`
  (`feat: add media fetch transport setting`).
- **Exact next action:** Commit Stage 1, record its hash, then implement the
  central media-only network handler and its deterministic transport coverage.

### 2026-07-26 — Stage 2 central media network handler

- **Completed:** Added `fetchMediaNetworkResponse()` as the only selector for
  persistent media-cache transport, routed the existing
  `fetchMediaCacheResponse()` timeout/AbortController path through it, and
  covered native default, forced legacy, missing native API, synchronous throw,
  non-thenable/throwing-then incompatibility, asynchronous rejection, HTTP
  failure, option propagation, and session latching.
- **Decisions:** Keep the selector non-async so synchronous compatibility
  defects can be separated from ordinary rejected requests. Pass
  `timeout: null` only to native BetterDiscord requests so the plugin's existing
  15-second timeout remains authoritative. Never retry one failed native
  request through renderer networking.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/media.test.js`, and
  `NETWORKING-OVERHAUL-CHECKLIST.md`.
- **Tests and exact results:** PASS — focused media run: 47 passed, 0 failed;
  full `npm test`: 349 passed, 0 failed; plugin syntax passed within the full
  suite; `git diff --check` passed.
- **Runtime evidence:** None required at this stage. The BetterDiscord native
  request contract was verified read-only against local `develop` and
  mainstream `upstream-development`.
- **Failures or blockers:** None. A test-only draft assertion attempted to
  preserve renderer `credentials`, which is not a shared BetterDiscord native
  option; parent review removed that assertion before commit. No product code
  relied on it.
- **Commit:** `3c13374bb1a387cbb6ae13e7294cabb1317c99e5`
  (`feat: route media cache through native networking`).
- **Exact next action:** Add Stage 3 source contracts proving update checks,
  remote clipboard reads, and local `blob:` clipboard reads remain independent
  of the media-only selector.

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
