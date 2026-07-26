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

- [x] Tick the completed work in that stage.
- [x] Record exact commands and results in the stage result block.
- [x] Record changed files and important implementation decisions.
- [x] Record failures, unresolved questions, and runtime-only work still needed.
- [x] Update **Exact next action** below.
- [x] Add an entry to **Handoff activity log**.

Never mark a stage complete merely because code was written. Its required tests,
review, checklist update, and commit must also be complete.

## Living handoff snapshot

- **Last updated:** 2026-07-27
- **Repository:** `$HOME/Apps/Dev/BD/BD-Plugins/MessageLoggerV2-Remake`
- **Working branch:** `fix/native-media-networking`
- **Branch base:** a5eadbe736f5a0cf4b7a3730bf9950ade17ad752
  (`docs: prepare 2.8.2.8 release notes`)
- **Upstream status:** The binary-read correction was published through
  fb514813a9c8851f7c5ff69153c7e1678c2467d4; local, tracking, and direct remote
  refs matched exactly after that push. The completed earlier implementation
  and live-sync history was first published through
  e84bfaaf6fffc4b809f7e4fb6fe70ef6ac5c5897. `develop`, `main`,
  `origin/develop`, and `origin/main` all remain untouched at
  a5eadbe736f5a0cf4b7a3730bf9950ade17ad752.
- **Paused attachment work:** The renamed `fix/attachment-gate` remains
  separate and tracks `origin/fix/attachment-gate`. Its standalone handoff
  commit is protected by the local-only `local/attachment-gate-handoff` tag.
  Do not merge or implement that feature as part of this networking branch.
- **Implementation state:** Stages 1-5D are implemented and pass their focused
  and full automated gates. Persistent media-cache downloads use the central
  selector; updater and clipboard behavior are independently locked to their
  existing transports; exact output-aware legacy-routing diagnostics are
  de-duplicated per activation and per output. Stage 5A retains the 15-second
  initial response deadline and adds a 30-second rolling no-data body watchdog
  with no fixed total download deadline. Stop or **Cache media locally** Off
  cancels active response/body work without retrying or writing late. Stage 5B
  passes numeric `timeout: 0` so the host's inherited five-second socket timer
  no longer preempts those Logger watchdogs. Stage 5C now emits truthful,
  console-only per-attempt diagnostics with one managed terminal outcome, and
  Stage 5D updates the release to `2.8.2.9`. The accepted networking
  implementation is committed at 15eb75b7c5e9125cab64bb8e657721f223ab914f,
  recorded by checkpoint d25576f84aa62b41c2149fae30b7b809f86a3e1d, and its
  first final live replacement is recorded by
  fd8e027b7e67b4985f3d911555d39c9c630c7c41. A final user-requested Debug
  amendment now makes both child switches effective only while the console
  master is On while retaining each saved child value. It is fully validated,
  committed at 135eeb37baecfbb153784ce46c6767c2ea7362e2, recorded by checklist
  checkpoint c7d4d32bfb9633f302bd433681bf02fb1766598b, and its matching live sync
  is recorded at 8b7487225e3c1c694b76c89d1f97a7468f874304. The initial clipboard
  repair at db781e1c77f9257122ad469405d8bab09f8cdb58 was followed by the
  cache-scoped local-file implementation at
  15705f0fdc6a82fbb4c472e3c9ff53ceb3ca8fb4 and plugin-disable presentation
  cleanup at f312df53c334fe912cc9073d1c6f5ce6e78bb102. The BetterDiscord
  binary-read correction is committed at
  a26f05c1cfcf15ec39a3d44e71142d0452d04d87. Its live copy has exact hash
  parity and clean hot-reload evidence; user-driven clipboard/disable checks
  remain before the built-in changelog is amended.
- **Current tracked task changes:** Stages 1-5D are limited to
  `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/persistence.test.js`, `tests/settings-recovery.test.js`,
  `tests/source-contracts.test.js`, `tests/clipboard.test.js`,
  `tests/records.test.js`, `README.md`, `TODO.md`,
  `docs/architecture.md`, `docs/help.md`, `docs/settings.md`, `docs/tests.md`,
  and this checklist.
- **Live plugin:** The combined `2.8.2.9` networking, cache-scoped clipboard,
  and disable-cleanup build is live. Repository and live SHA-256 both equal
  `83f47ce110f1d179a36e1d6db839dfbb75f304a033e8d8d8eb50e08a9e055a4c`.
  The UTC hot-reload segment at `2026-07-26 19:56:23-19:56:24` shows patch
  cleanup, successful reinitialization, UI refresh completion, and immediate
  completion without a matching Logger error. Discord was not relaunched. No
  MessageLogger trace/probe/clipboard helper is linked in the live plugin
  directory.
- **Publishing authority:** The user explicitly authorized pushing both working
  branches to `origin` on 2026-07-26 and explicitly re-authorized pushing the
  current `fix/native-media-networking` branch after live sync on 2026-07-27.
  No merge into `develop`/`main` is authorized.

### Exact next action

Ask the user to repeat static image copy and inspect the resulting log. Amend
the built-in changelog only after runtime confirmation. Keep provisional
Anti-Nuke/Ghost-Ping retention as a separate post-networking stage.

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
- [x] Automated verification passed.
- [x] Response-body inactivity hardening approved as a separate pre-live stage.
- [x] Stage 5A response-body inactivity hardening implemented and verified.
- [x] Post-hardening final audit completed and pre-live report prepared.
- [x] Live plugin sync separately authorized, completed, and hash-verified.
- [x] Cache-scoped clipboard hardening implemented and verified.
- [x] Plugin-disable presentation cleanup implemented and verified.
- [x] Combined clipboard/disable build live-synced and hash-verified.
- [x] Static-image clipboard binary-read runtime defect fixed and resynced.
- [ ] User `RT-26` live behavior result received and recorded.
- [x] Final implementation committed.

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
- [x] Future wildcard attachment integration is documented: when that separate
      feature is implemented on its own branch, its persistent downloads must
      call this handler rather than adding another fetch. No wildcard
      attachment implementation is included here.

### Audited current call sites

- [x] `checkNewUpdate()` directly uses `BdApi.Net.fetch()`.
- [x] `fetchMediaCacheResponse()` directly uses renderer `fetch()`.
- [x] `cacheImage()` is the sole persistent cache-write downloader and calls
      `fetchMediaCacheResponse()`.
- [x] `cacheMessageImages()` funnels attachments, embeds, component media, and
      stickers through `cacheImage()`.
- [x] Anti-Nuke calls `cacheMessageImages()` and does not have a separate
      downloader.
- [x] The old image-context **Copy to Clipboard** implementation was statically
      present and kept its fetch split, but `RT-26` proved that current Discord
      no longer invokes that hook. The approved replacement is tracked under
      **Clipboard behavior** and Stage 6 below.
- [x] No Axios, Node HTTP/HTTPS, Electron `net`, external request library, or
      separate XHR downloader was found.

### Current source map

Line numbers are orientation aids and may move; symbol names are authoritative.

| Approximate line | Symbol/path | Current behavior |
|---|---|---|
| 566 | `checkNewUpdate()` | Intentionally remains a direct `BdApi.Net.fetch()` call for plugin source. |
| 977 | `imageCacheServerSimulator` | Resolves synthetic cache keys to local files and returns local object URLs. |
| 3764 | `reportDebugEvent()` | Routes console output through the Debug master and toast/notification output only while both the master and saved toast child are enabled. |
| 4560 | Advanced settings category | Holds the force-legacy and linked detailed-media diagnostics switches. |
| 7424 | `flushPendingMediaCacheRequests()` | Replays queued downloads through `cacheImage()`. |
| 8816 | `_getChangedAttachments()` | Sends removed attachments through `cacheImage()`. |
| 12136 | `fetchMediaNetworkResponse()` | Selects BetterDiscord native networking by default and renderer fetch only for forced or compatible fallback routing. |
| 12430 | `fetchMediaCacheResponse()` | Owns initial-response timeout, rolling body watchdog, cancellation, and bounded cleanup. |
| 12542 | `cacheImage()` | Sole persistent cache-write downloader; consumes a Response and writes bytes. |
| 12652 | `cacheMessageImages()` | Enumerates qualifying attachments, embeds, components, and stickers. |
| 13810 | Anti-Nuke pre-cache helper | Calls `cacheMessageImages()` before ordinary policy returns. |
| 14243 | Normal incoming-message cache path | Calls `cacheMessageImages()`. |
| 16049 | Saved-media clipboard helpers | Resolve record-owned image media, retain the local `blob:`/remote native split, replace one deleted-message native action, and add one Logger-viewer action. |

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

normal Discord image
  -> Discord-owned native Copy image       [unchanged]

deleted/restored Discord image
  -> patched native Copy image action
       -> shared Logger clipboard reader
            -> direct BdApi.Net.fetch()     [remote]
            -> direct renderer fetch()      [local blob]

Logger viewer image
  -> Logger Copy media action
       -> same shared Logger clipboard reader
```

`fetchMediaCacheResponse()` should continue owning cache-specific cancellation
and timeout behavior. The lower media network handler should own media
transport selection and legacy-mode reporting. Non-cache callers must retain
their audited direct behavior.

## Local data that must stay local

The networking handler is for remote fetches/downloads. Existing local data
must not be sent through networking merely to read it again:

- [x] Read already-cached files from the filesystem.
- [x] Keep `blob:` object URLs local.
- [x] Keep `data:` resources and the local error placeholder local.
- [x] Keep cache file writes, deletion, reveal-in-folder, and cleanup local.
- [x] Keep **Copy image** on the existing fetch split: local `blob:` reads use
      renderer `fetch()` and remote reads use `BdApi.Net.fetch()`.
- [x] Do not route either clipboard branch through the media-cache handler.
- [x] Continue revoking locally created object URLs during cleanup.

`http://localhost:7474/...` is only a synthetic cache lookup key. The plugin
does not start a server or listen on port 7474. Its simulator parses the key,
reads the matching cache file with `fs`, and returns a local `blob:` URL.

### Clipboard behavior

`RT-26` found that the old `image-context` patch is no longer called by current
Discord. The Logger viewer also builds its own context menu and had no image
copy action. The user approved this self-contained replacement:

- [x] Leave Discord's native **Copy image** action untouched for ordinary,
      non-deleted messages.
- [x] For deleted/restored live message mounts only, patch the existing native
      Discord **Copy image** action so Logger reads the saved image source.
      Preserve one visible action rather than adding a duplicate.
- [x] Add one Logger-owned **Copy media** action to supported media in the
      Logger viewer.
- [x] Share one byte-copy helper across both Logger-owned paths. Remote sources
      use direct `BdApi.Net.fetch()`; local `blob:` sources use renderer
      `fetch()`; neither path uses the media-cache transport selector.
- [x] Pass successful bytes to `DiscordNative.clipboard.copyImage()` and never
      invoke the native writer after a failed or non-200 read.
- [x] Preserve one user-facing failure notification plus a console error.
- [x] Keep clipboard reads independent from **Force legacy media fetching**,
      media diagnostics, cache writes, and Logger record creation.
- [x] Remove the obsolete `image-context` clipboard patch. Do not implement the
      separate future **Reveal in folder** feature as part of this fix.

The installed Discord desktop bridge exposes `copyImage(bytes, source)` and
`copyFile(localPath)`, but no raw video-byte clipboard writer. Match native
Discord rather than inventing an unsafe temporary-file feature:

- Images, including GIF/WebP/APNG sources which Discord's native image bridge
  can decode, use the shared byte reader and `copyImage()`.
- A deleted/restored live mount is patched only when Discord already supplies a
  native clipboard-copy action for that target.
- Videos and other non-image remote attachments retain Discord's normal
  link/save actions. `copyFile()` is not used with a URL because it requires an
  existing local filesystem path.

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
- [x] Do not broaden this transport change into a renderer prefetch/blob
      conversion redesign without a separate user decision.

## Debug reporting

Use this exact message for both forced and automatic legacy selection:

> Networking: media routing is using the old Discord renderer fetch()
> method.

- [x] Route the message through the existing debug console/toast controls.
- [x] With `debugLogging` enabled, print it once to the console.
- [x] With `debugLogging` and the saved `debugToasts` child enabled, show it
      once through the configured debug notification route.
- [x] With both enabled, emit once to each output.
- [x] With the master disabled, remain silent even when either child retains a
      saved On value.
- [x] Emit once when automatic compatibility detection activates legacy mode.
- [x] Emit immediately when the force toggle changes from off to on.
- [x] Emit once at startup when forced mode was already saved.
- [x] Permit a new notice after leaving and later re-entering legacy mode.
- [x] Do not repeat it per request, file, retry, or failure.
- [x] If legacy mode was selected while a debug output was disabled, allow that
      output to receive one notice when it is subsequently enabled.
- [x] Re-enabling the master restores each child's saved effective state:
      a saved toast On receives its pending notice, while a saved toast Off
      remains Off and is never rewritten.

The existing `reportDebugEvent()` helper remains the one shared router.
`debugLogging` is now the Debug master: `debugToasts` and
`detailedMediaNetworkDebug` keep their persisted values while greyed, but both
are ineffective while the master is Off. Re-enabling the master restores only
the children whose saved values were already On. De-duplication state must be
per legacy-mode activation and sufficiently output-aware that a debug output
which was disabled at detection can receive one later notice without causing
per-request spam.

## Behavior that must remain unchanged

- [x] Media-cache master gating.
- [x] Maximum cache file-size enforcement.
- [x] Timeout and cancellation behavior.
- [x] Abort-controller tracking and plugin-stop cleanup.
- [x] Existing retry count and delay.
- [x] Terminal 403/404 handling.
- [x] Cache paths, filenames, and local object-URL cleanup.
- [x] Disable-saving deferred queue behavior.
- [x] Delete-cached-files-with-log-record behavior.
- [x] Forum, post, thread, and restored-message behavior.
- [x] Anti-Nuke capture ordering and ignore-policy bypass behavior.
- [x] Persisted message/schema compatibility.
- [x] Direct `BdApi.Net.fetch()` update checks.
- [x] Direct `BdApi.Net.fetch()` remote clipboard reads.
- [x] Direct renderer `fetch()` local `blob:` clipboard reads.

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
- [x] All persistent media-cache downloads enter the central media handler.
- [x] The update checker retains its direct `BdApi.Net.fetch()` call and is
      unaffected by the media force setting.
- [x] Remote clipboard reads retain their direct `BdApi.Net.fetch()` call and
      are unaffected by the media force setting.
- [x] Local `blob:` clipboard reads retain renderer `fetch()` and are
      unaffected by the media force setting.
- [x] A source audit permits only those documented non-cache direct calls and
      proves there is no alternate remote persistent-cache downloader.
- [x] Forced and automatic legacy selection use the exact same message.
- [x] Console output remains the Debug master while per-destination delivery
      and de-duplication stay output-aware.
- [x] Debug reporting is silent whenever the master is Off, including while a
      child retains a saved On value.
- [x] Multiple files and retries do not repeat the notice.
- [x] Existing media timeout, abort, retry, status, file-size, and write-epoch
      tests remain green.
- [x] Initial response acquisition still aborts after 15 seconds without a
      response.
- [x] A response body that makes no byte progress for 30 seconds is aborted.
- [x] Each non-empty body chunk restarts the 30-second watchdog, allowing a
      transfer to take longer than 30 seconds in total while bytes continue to
      arrive.
- [x] There is no fixed overall response-body download deadline.
- [x] Plugin stop or media-cache disable aborts header and body phases
      immediately, without a retry or a late cache write.
- [x] **Cache all attachment types** is not a global cancellation gate. Its
      known-incomplete selective non-image behavior remains deferred to the
      later file-type-gate repair.
- [x] A same-instance restart cannot allow a body started by an older
      activation to write.
- [x] Supported streaming responses and the guarded non-streaming fallback are
      both deterministic and cannot leave stale timers, readers, or abort
      controllers behind.

## Stage 0 — Baseline gate

- [x] Confirm branch is `fix/native-media-networking`.
- [x] Confirm the worktree contains no unexpected user changes.
- [x] Run `npm test` before editing plugin behavior.
- [x] Record the baseline result below.
- [x] Baseline passed, so the failure stop gate was not triggered.

Baseline result:

- Initial audit gate: PASS on 2026-07-26 at
  a5eadbe736f5a0cf4b7a3730bf9950ade17ad752 — `npm test` completed with
  339 tests passed, 0 failed; `node --check MessageLoggerV2.plugin.js` and
  `git diff --check` passed.
- Implementation-resume gate: PASS on 2026-07-26 at
  54a1f3858140e319873135fcb3485b3ee8fd1266 — `npm test` completed with
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

- Commit: cedf3a65bf020abe3608642b63a62e4a6cb1633b
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

- Commit: 3c13374bb1a387cbb6ae13e7294cabb1317c99e5
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

- [x] Keep update checks on their direct `BdApi.Net.fetch()` call.
- [x] Keep remote clipboard reads on their direct `BdApi.Net.fetch()` call.
- [x] Keep local `blob:` clipboard reads on renderer `fetch()`.
- [x] Prove the media force setting does not alter any of those three paths.
- [x] Keep both clipboard branches out of the media-cache handler.
- [x] Preserve clipboard failure logging and user notification behavior.
- [x] Preserve update-check parsing, failure, and notification behavior.
- [x] Add source-contract and deterministic regression coverage for these
      boundaries where practical.
- [x] Run focused tests, `npm test`, and `git diff --check`.
- [x] Commit only after the stage passes.

Stage 3 commit/result:

- Commit: ffec3316aed4b7e0559899b04f387a814fa64f38
  (`test: lock media networking boundaries`).
- Tests: PASS — `node --test tests/source-contracts.test.js` completed with 61
  passed, 0 failed; full `npm test` completed with 353 passed, 0 failed;
  `node --check MessageLoggerV2.plugin.js` passed within the full suite;
  `git diff --check` passed.
- Notes: Four source contracts use symbol-bounded slices and one updater
  behavior mock to freeze the intentional transport split. They also retain
  updater parsing/error notices, clipboard byte-copy/error feedback, the sole
  cache write chain, deferred/removed/normal/Anti-Nuke convergence, and the
  absence of a second persistent-cache downloader. No product source changed
  in Stage 3.

## Stage 4 — Debug routing and de-duplication

- [x] Implement the exact shared legacy-routing message.
- [x] Confirm the shared console/toast text is exactly:
      `Networking: media routing is using the old Discord renderer fetch()
      method.`
- [x] Cover automatic media compatibility detection, forced activation, and
      forced startup.
- [x] Historical Stage 4 coverage proved console-only, toast-only, both, and
      neither under the then-independent switches. The later Debug master-link
      amendment supersedes that settings matrix while retaining destination
      de-duplication.
- [x] Prove retries and multiple downloads do not create message spam.
- [x] Prove a later debug-output enable can receive one pending notice.
- [x] Run focused tests, `npm test`, and `git diff --check`.
- [x] Commit only after the stage passes.

Stage 4 commit/result:

- Commit: 3ef7e6caae738d298ebada5bcab2241204d87571
  (`feat: report legacy media routing`).
- Tests: PASS — `node --check MessageLoggerV2.plugin.js`; focused
  `node --test tests/media.test.js tests/source-contracts.test.js
  tests/persistence.test.js` reported 150 passed, 0 failed; full `npm test`
  reported 358 passed, 0 failed; `git diff --check` passed.
- Notes: The notice uses one shared constant and the existing debug router.
  Delivery state is reset on each new legacy activation and tracked separately
  for console and toast, so disabled outputs remain pending without per-request
  spam. Forced mode does not overwrite native-compatibility state; missing or
  synchronously incompatible native fetch latches legacy for the session;
  asynchronous rejection and HTTP failure remain native request failures.
  Parent review also added behavioral coverage for native receiver preservation
  and a throwing native `fetch` property getter.

## Stage 5 — Documentation and static final review

- [x] Document the Advanced media-fetching setting and automatic media
      fallback.
- [x] Document the exact media-routing debug event.
- [x] Document that updater and clipboard transports are intentionally outside
      the media selector.
- [x] Update the official automated/runtime test matrix.
- [x] Keep the networking notes brief and avoid attachment-overhaul promises.
- [x] Confirm no version bump.
- [x] Confirm no built-in changelog change unless separately requested.
- [x] Review the final diff for unrelated behavior changes.
- [x] Run `npm test`.
- [x] Run `git diff --check`.
- [x] Verify final file contents and commit the passing stage.

Stage 5 commit/result:

- Commit: ee902036fa083e20ec6700863a5093b9afa1bbec
  (`fix: finalize media networking overhaul`).
- Tests: PASS — focused `node --test tests/media.test.js
  tests/source-contracts.test.js tests/persistence.test.js` reported 151
  passed, 0 failed; independent focused media/source/settings review reported
  127 passed, 0 failed; full `npm test` reported 359 passed, 0 failed;
  `npm run check`, `git diff --check`, and `cmark` parsing of both changed
  documentation files passed.
- Notes: Added the Advanced setting, exact debug event, and media-only boundary
  to `docs/settings.md`; added `AT-47` and the deferred live plan `RT-26` to
  `docs/tests.md`; added a source contract for both documents. Final static
  review found and fixed one networking-only startup edge case:
  `_hasMediaCacheNativeFetch()` now treats a throwing native `Net`/`fetch`
  getter as unavailable instead of allowing initialization to fail. The
  initializer regression covers the safe legacy selection. Independent review
  found no remaining scope, transport, version, changelog, or attachment-gate
  issue.

## Stage 5A — Response-body inactivity watchdog

This approved pre-live hardening changes timeout ownership only; it must not
change transport selection, retry counts, HTTP status handling, cache size
rules, filenames, no-save behavior, Anti-Nuke convergence, updater networking,
or clipboard networking.

- [x] Keep the existing 15-second initial response-acquisition deadline.
- [x] Keep one cache-owned `AbortController` registered through both response
      acquisition and response-body consumption.
- [x] Consume supported response bodies incrementally.
- [x] Start a 30-second no-data watchdog for body consumption and restart it
      after every non-empty chunk.
- [x] Do not impose a fixed total body-transfer deadline; a slow download may
      continue for as long as bytes keep arriving within each watchdog window.
- [x] If a response does not expose a readable stream, retain a guarded
      `arrayBuffer()` fallback with the same lifecycle/write protections and a
      finite no-progress escape.
- [x] On plugin stop or media-cache disable, immediately abort and release the
      active response/body operation; do not retry it and do not write a file.
- [x] Interpret “media-cache disable” here only as the **Cache media locally**
      master switch. Do not make **Cache all attachment types** abort every
      request. Its later repair should selectively cancel only in-flight
      non-image attachment/file-component requests that cease to qualify while
      allowing image, embed, sticker, thumbnail, and gallery work to continue.
- [x] Preserve write-epoch protection for completion races and same-instance
      restarts.
- [x] Preserve existing response-size enforcement and release body resources
      on success, timeout, abort, HTTP terminal status, and ordinary failure.
- [x] Add focused deterministic regression coverage for header timeout, stalled
      body, rolling progress beyond 30 seconds total, stop/disable cancellation,
      completion races, restart isolation, non-streaming fallback, HTTP
      terminal responses, and no-`AbortController` compatibility.
- [x] Re-run the existing media/networking regression suites.
- [x] Run `npm test`, `npm run check`, `git diff --check`, and checklist/docs
      Markdown parsing.
- [x] Complete a parent edge-case audit and record any finding before changing
      behavior further.
- [x] Commit only after all Stage 5A checks pass, record the exact commit here,
      and stop before live sync.

Stage 5A commit/result:

- Plan commit: ab5f56ebc3c1195a23597794f1bcdf9a0a0d1ba2
  (`docs: plan media body inactivity watchdog`).
- Cancellation-scope clarification commit:
  f17a96e42348d725adcc578fb0ec3b489011afb0
  (`docs: clarify media watchdog cancellation scope`).
- Draft-audit checkpoint commit:
  503035bfe886035d02ed42d93ca738e824c752c0
  (`docs: record media watchdog draft audit`).
- Implementation commit: 9e5871c75039fc34f262598854701083190df1fd
  (`fix: guard media cache body transfers`).
- Draft tests: focused media PASS `61/61`; full suite FAIL `367/368` because the
  existing central-handler source contract no longer matched the draft call
  shape. This draft must not be committed as the implementation.
- Final tests: focused media PASS `66/66`; focused source contracts PASS
  `62/62`; full `npm test` PASS `373/373`; `npm run check`,
  `git diff --check`, and `cmark` parsing for the checklist and both amended
  docs PASS.
- Notes: The approved policy measures inactivity rather than total transfer
  duration: 15 seconds to receive the initial response, then at most 30 seconds
  with no incoming bytes. Any non-empty chunk restarts the body watchdog. The
  approved correction keeps cancellation cleanup non-blocking, releases
  retryable HTTP responses before backoff, preserves the existing central
  handler call contract, and closes the missing deterministic coverage.
  Independent review found no blocking defect. A deliberately malformed stream
  whose cancel promise never settles can make lock release best-effort, but the
  logger still exits promptly, clears its active handle, avoids retries/writes,
  and has a deterministic regression for that case.

## Stage 5B — Native socket-idle timeout override

The live Stage 6 stall probe exposed a host/runtime timeout below Logger's
rolling body watchdog. This corrective stage remains limited to native
media-cache requests.

- [x] Reproduce the early abort twice with public httpbin and once with a
      controlled local server.
- [x] Confirm the controlled request closes after about five seconds despite
      Logger passing `timeout: null`.
- [x] Trace the supported BetterDiscord implementations and Node HTTP-agent
      behavior before changing code.
- [x] Verify independently that explicit `timeout: 0` survives the controlled
      35-second response gap.
- [x] Obtain user approval for the plugin-only fix and automatic live sync.
- [x] Change only the native media-cache request override from `timeout: null`
      to `timeout: 0`.
- [x] Preserve caller options, the 15-second initial-response watchdog, the
      rolling 30-second body-inactivity watchdog, transport selection, retries,
      updater networking, clipboard networking, and every cache behavior.
- [x] Add deterministic regression coverage for the exact timeout override and
      unchanged media-only boundary.
- [x] Run focused media/source-contract tests, full `npm test`, `npm run check`,
      `git diff --check`, and checklist Markdown parsing.
- [x] Complete an independent edge-case review and parent final audit.
- [x] Commit the implementation and record the exact commit and validation
      results here before live sync.
- [x] Copy only the plugin file live, confirm hash parity and clean hot reload,
      then repeat the controlled stall probe.

Stage 5B plan/result:

- Root cause: supported BetterDiscord maps `timeout: null` to an undefined
  `http.request()` timeout. Modern Node global HTTP/HTTPS agents carry a
  five-second socket timeout, so five seconds without body data terminates the
  native response before Logger's 30-second watchdog.
- Approved fix: pass numeric `timeout: 0` for native media-cache requests so
  the host timer is explicitly disabled and Logger retains timeout ownership.
- Scope: no BetterDiscord host edit, no renderer/legacy-path change, and no
  updater, clipboard, attachment-gate, release-metadata, or unrelated plugin
  change.
- Plan commit: 486fc1b214729338bbd59e0c24aee0d6d4b5218a.
- Implementation result: the native call now receives exactly `timeout: 0`;
  caller-supplied options remain unchanged and Logger's own watchdogs retain
  timeout ownership.
- Deterministic validation: focused media/source-contract tests passed
  `128/128`; full `npm test` passed `373/373`; `npm run check`,
  `git diff --check`, and checklist `cmark` parsing passed.
- Independent review: no blocking or non-blocking findings. Both supported
  BetterDiscord implementations forward numeric zero to `http.request`, and
  the change remains confined to the native media-cache route.
- Implementation commit: aaf31b69659131fb7e67f01c249cb988c81f7474.

## Stage 5C — Detailed media-network console diagnostics

This stage adds opt-in support evidence for media-cache requests without
changing their networking, retry, cache, notification, or persistence behavior.

- [x] Obtain user approval for the feature and its automatic live sync after
      implementation, tests, documentation, and final review.
- [x] Add a persisted `detailedMediaNetworkDebug` boolean that defaults to
      `false` and normalizes malformed or missing legacy values.
- [x] Place the child switch directly below **Enable debug logging**, link it
      with `enableWith: 'debugLogging'`, and retain its saved value while the
      master console switch is Off.
- [x] Require both the master console switch and the child switch at runtime.
      Detailed media events must always be console-only and must never use
      debug toasts, even when toast debugging is enabled.
- [x] Give each actual network attempt its own request ID and log method, full
      URL, truthful native/legacy transport, response status, received bytes,
      elapsed time, and terminal success/cancel/timeout/failure state.
- [x] Keep transport attribution correct across forced legacy mode, compatibility
      fallback, native synchronous incompatibility, and native asynchronous
      rejection. Never claim a native attempt before a synchronous fallback.
- [x] Reuse existing response bytes and lifecycle state. Do not clone or
      re-read bodies, inspect response bodies for diagnostics, log headers, or
      let a logging failure change media behavior.
- [x] Preserve the existing activation-scoped legacy-routing notice and its
      existing console/toast routing contract.
- [x] Add deterministic coverage for settings defaults/repair/dependency,
      master/child/toast truth tables, native and legacy attribution, status,
      exact byte counts, retries, cancellations/timeouts/failures, and
      duplicate-terminal suppression.
- [x] Document the setting, output contract, and the privacy warning that full
      URLs may contain signed or query data and exported console logs should be
      handled accordingly.
- [x] Run focused tests, full `npm test`, `npm run check`, `git diff --check`,
      Markdown parsing, independent review, and the parent final audit.
- [x] Commit the implementation and record its exact commit and validation
      results here before live sync.
- [x] Sync only the plugin file live, confirm hash parity and clean hot reload,
      then use the new diagnostics during the remaining Stage 6 runtime checks.
- [x] After live sync and the final checklist checkpoint, push
      `fix/native-media-networking` to `origin` and verify local/remote ref
      alignment before the final report.

Stage 5C plan/result:

- Scope: media-cache request diagnostics and the new Debug child setting only.
  No updater, clipboard, cache eligibility, retry, timeout, notification,
  release metadata, or unrelated plugin behavior change.
- Output: console lines only. The existing master console toggle is mandatory;
  `debugToasts` can never route these detailed events to a toast.
- Privacy: the user requested full request URLs. Headers and response/request
  bodies remain excluded; documentation will warn that full URLs can contain
  sensitive signed/query values.
- Request identity: one monotonic ID per actual HTTP attempt, so retries remain
  distinguishable and concurrent native/legacy activity is attributable.
- Plan commit: 1ecd08c189893f538725f7d6034fd005b8f09b2b.
- Initial implementation commit:
  429701ebd65afdac8841b5f77e2173e4bbf2d2a5. Its full automated suite passed
  `376/376`, but the parent pre-live audit rejected it as final: it could print
  a native route before validating the native thenable, and it did not yet own
  exact body-terminal outcome/partial-byte reporting inside the managed
  response lifecycle. Nothing from that draft was synced live.
- Rejected correction commit:
  16e5355a0c73eab7146f34a62c1f74e5195af89e. Its suite also passed `376/376`,
  but review still found early false native-start output, missing acquired
  status/timing, incorrect non-OK release outcome, unnecessary request IDs
  while diagnostics were disabled, and insufficient edge coverage. The worker
  also changed this checklist, committed, and synced that intermediate plugin
  live contrary to the sequencing gate. Treat it only as audit history.
- Accepted correction result: native is announced only after a valid thenable;
  synchronous native incompatibility announces only legacy; one request ID is
  allocated only when both console switches are effective; the managed
  response emits one terminal outcome with status and exact or partial bytes;
  and diagnostics are failure-isolated and forcibly console-only.
- Accepted deterministic validation: focused media/settings/source-contract
  suites passed `147/147`; full `npm test` passed `379/379`; the media suite
  passed ten repeated runs; `npm run check`, `git diff --check`, and Markdown
  parsing passed.
- Accepted independent review: the production audit found no blocking or
  non-blocking defect. A separate release audit found only stale `TODO.md`
  wording, which was reported first and corrected before this checkpoint.
- Accepted implementation commit:
  15eb75b7c5e9125cab64bb8e657721f223ab914f.

## Stage 5D — Networking release metadata

- [x] Obtain the user's explicit request to increment the plugin version and
      replace the built-in changelog before live sync.
- [x] Increment `@version` from `2.8.2.8` to `2.8.2.9`; do not change data
      schema or unrelated release metadata.
- [x] Replace `getChanges()` with a concise summary of this networking branch:
      native media routing and legacy fallback/override, the Logger-owned
      initial/body watchdogs and inherited five-second timeout correction,
      immediate cache-off/plugin-stop cancellation, deterministic cleanup, and
      opt-in console-only detailed request diagnostics.
- [x] Retain a clear note that **Cache all attachment types** still has its
      known arbitrary non-image limitation and is not fixed by this branch.
- [x] Update deterministic changelog/version contracts and any directly stale
      release-number wording without expanding into unrelated documentation.
- [x] Include release metadata in the final full-suite validation, final audit,
      implementation commit, live hash check, and branch push.

Stage 5D plan/result:

- Requested version: `2.8.2.9`, the next patch after the current `2.8.2.8`.
- Changelog scope: networking-overhaul behavior only, plus the still-open
  arbitrary non-image attachment-cache limitation so the release does not
  overpromise.
- Authorization: update the plugin metadata and built-in changelog before the
  already authorized live sync, then push the current feature branch before
  the final report.
- Plan amendment commit: adf773e81cc189d1f9fa841fb0ef0de1f4cc29c8.
- Implementation result: plugin metadata is `2.8.2.9`; the built-in changelog
  now covers native routing/fallback, Logger-owned watchdogs, inherited socket
  timeout correction, immediate cancellation, console-only diagnostics, and
  the still-open all-attachment-types limitation. Directly stale release
  wording was updated without changing the data schema.

## Stage 6 — Live BetterDiscord verification

- [x] The user separately authorized final live sync on 2026-07-27.
- [x] Replace the premature intermediate copy with the final validated
      `2.8.2.9` `MessageLoggerV2.plugin.js`.
- [x] Verify final repository/live SHA-256 parity.
- [x] Do not relaunch Discord.
- [x] Confirm the final hot-reloaded plugin initializes without a matching
      startup/runtime error in the current logs.
- [ ] Complete and record the remaining user-driven `RT-26` behavior checks:
  - [x] Verify default native routing with a normal Discord CDN URL. Current
        detailed logs show successful Discord CDN requests using BetterDiscord
        native fetch, including request `#103` with HTTP 200 and 334,583 bytes.
  - [x] Verify the previously failing Waifugami cross-origin URL:
    `https://www.waifugami.com/catalog/81448138f5f163ccdba4acc69819f280/1dacb10f0623c67cb7dbb37587d8b38a/images/76135`.
    It returned HTTP 200 `image/png` without an
    `Access-Control-Allow-Origin` header when rechecked on 2026-07-27. A stable
    backup with the same missing CORS header is
    `https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png`.
    The live Logger probe completed with HTTP 200 and 1,091,999 bytes in 2.5
    seconds.
  - [x] Verify an HTTP/mixed-content media URL:
    `http://httpbin.org/image/png` returned HTTP 200 `image/png` without an
    HTTPS redirect when rechecked on 2026-07-27. Live native request `#290`
    completed HTTP 200 with all 8,090 bytes in 0.4 seconds from Discord's HTTPS
    page.
  - [x] Verify slow progress with
    `https://httpbin.org/drip?duration=40&numbytes=40&delay=0&code=200`;
    the initial live Logger probe completed all 40 bytes in 42.0 seconds. A
    final detailed run used native request `#102`, acquired HTTP 200 in 645 ms,
    and completed all 40 bytes successfully in 39.8 seconds, confirming that
    continuing body progress keeps the request alive.
  - [x] Verify body inactivity with
    `https://httpbin.org/drip?duration=70&numbytes=2&delay=0&code=200`;
    it sends one byte immediately, then leaves a roughly 35-second gap, so the
    logger should abort after about 30 seconds without progress.
    Two public attempts returned generic `Error: aborted` results after 6.0 and
    5.9 seconds. A controlled localhost response then closed after 5.0 seconds,
    proving that the supported native host transport's inherited socket
    timeout ran before Logger's watchdog. After Stage 5B's `timeout: 0` fix, the
    controlled `http://127.0.0.1:32109/stall` probe reached Logger's body
    watchdog and returned `AbortError: Media cache response body timed out` at
    exactly 30.0 seconds.
  - [x] Verify media-cache file-size limits. With the accepted whole-number
        limit set to 1 MB, a real 2.12 MB Discord image attachment emitted
        `Skipping cache for MessageLogger-size-limit-test-2.2MB.jpg: 2.12MB
        exceeds limit` immediately after message creation. No deletion was
        required and no media-cache network request was started for that
        attachment.
  - [x] Verify abort/cancellation behavior:
    - [x] Turning **Cache media locally** Off cancelled native request `#160`
          immediately after three received bytes. It emitted one
          `outcome=cancelled` terminal event and returned
          `AbortError: Media cache request was cancelled` after 3.4 seconds.
          No retry or late completion appeared through and beyond the original
          40-second completion window.
    - [x] Disabling/stopping the plugin cancelled native request `#174` after
          three received bytes. Plugin cleanup began, then the request emitted
          one `outcome=cancelled` terminal event and returned
          `AbortError: Media cache request was cancelled` at 3.6 seconds. No
          retry or late completion appeared beyond the original 40-second
          completion window, and re-enabling the plugin started fresh work
          normally.
  - [x] Verify forced legacy routing. Requests `#231` and `#232` both used
        renderer fetch, returned HTTP 200, and completed all 32 bytes in 0.7
        and 0.2 seconds respectively.
  - [x] Verify the force toggle can return to native routing immediately.
        After turning force Off, request `#246` used BetterDiscord native
        fetch and completed the same HTTP 200 / 32-byte response in 0.9
        seconds.
  - [x] Verify disabled (master Off), console-only (master On/toast child Off),
        and both (master On/toast child On) debug output, plus the one
        destination-specific pending toast after console delivery:
    - [x] With the master Off, the user observed no toast and both logs stayed
          free of the routing notice while ordinary media caching continued.
    - [x] Re-enabling the master with the toast child Off produced exactly one
          console notice at `18:13:01` UTC and no toast.
    - [x] Enabling the toast child while legacy routing remained active
          delivered exactly one pending toast without duplicating the console
          notice.
    - [x] Starting a fresh legacy activation with both outputs On produced one
          new toast and exactly one new console notice at `18:14:29` UTC.
  - [x] Verify only one routing notice appears per legacy activation. Exactly
        one required notice appeared after force was enabled despite multiple
        automatic media requests plus both manual probes using legacy routing.
  - [x] Verify update checks still use direct native networking and work with
        the media force setting both off and on. Manual checks returned HTTP
        200 at `18:16:36` UTC with force Off and `18:17:18` UTC with force On.
        Neither check received a media request ID or entered detailed media
        diagnostics.
  - [x] Supersede the old local-`blob:` and remote-image clipboard checks.
        Logger clipboard actions now require the exact physical local cache
        file and perform no media-network request, so **Force legacy media
        fetching** is irrelevant to copying.
  - [ ] Verify a physically cached restored static image copies from both the
        live mount and Logger viewer, pastes into another app, and emits one
        green success toast per copy.
  - [ ] Verify a physically cached GIF exposes **Copy media** on both Logger
        surfaces, places the original GIF file on the system clipboard, and
        emits one green success toast.
  - [ ] Turn **Cache media locally** Off and confirm Logger copy actions plus
        Discord's native row disappear only from Logger-restored media while
        an ordinary live image keeps Discord's native action.
  - [ ] Confirm a missing local file, placeholder, video, and all-file-only
        attachment receive no Logger clipboard action.
  - [ ] Disable Logger while restored rows/tints and any available forum,
        sidebar, or thread-browser clones are visible. Confirm they disappear
        without deleting records/files, then re-enable and confirm they can
        mount again.
  - [x] Runtime defect found before those checks: current Discord did not invoke
        Logger's old `image-context` patch, and the Logger viewer's custom menu
        exposed no image copy action. The approved narrow replacement is now
        implemented and passes deterministic tests plus independent review.
        The two clipboard rows require only the final live sync and user checks.
  - Record any runtime-only findings and amend earlier stages if necessary.

Live result:

- Date: 2026-07-27 combined clipboard/disable `2.8.2.9` live replacement and
  partial `RT-26` run.
- Result: **CURRENT 2.8.2.9 SYNC, HASH, HOT-RELOAD, NATIVE/CORS,
  SLOW-PROGRESS, CONTROLLED-STALL, FILE-SIZE, DEBUG-OUTPUT, AND UPDATER PASS;
  CLIPBOARD/DISABLE USER TESTING AND CHANGELOG AMENDMENT PENDING.**
- Notes: Repository and live SHA-256 both equal
  `83f47ce110f1d179a36e1d6db839dfbb75f304a033e8d8d8eb50e08a9e055a4c`.
  The current logs prove native Discord-CDN success, Waifugami HTTP 200 with
  1,091,999 bytes in 2.5 seconds, a successful 40-byte progressing body in
  39.8 seconds, the controlled no-progress body aborting through Logger's
  watchdog at exactly 30.0 seconds, and master cache-off cancelling an active
  body at 3.4 seconds without retry or late completion. Plugin stop likewise
  cancelled its active body at 3.6 seconds without retry or late completion,
  and the plugin re-enabled successfully. Two forced-legacy probes passed,
  emitted one activation-scoped routing notice, and the next post-toggle probe
  returned directly to native. A plain-HTTP image then passed through native
  routing with HTTP 200 and 8,090 bytes. A 2.12 MB attachment was rejected
  immediately by the 1 MB cache limit without deletion or a media-cache fetch.
  The full linked Debug matrix then passed: master-Off silence, console-only
  delivery, one pending toast without console duplication, and one console
  notice plus one toast for a fresh both-output activation. Manual update
  checks returned HTTP 200 with media force Off and On without entering the
  media request route. The final cache-scoped clipboard and disable-cleanup
  build plus the static binary-read correction hot-reloaded cleanly at
  `19:56:23-19:56:24` UTC with matching source/live bytes and no new matching
  Logger error. Discord was not relaunched.

Historical result:

- Date: 2026-07-27 earlier authorized pre-Stage-5B live sync.
- BetterDiscord/runtime version: Not separately probed.
- Result: **HISTORICAL BASIC HOT-RELOAD PASS; FINAL SYNC/TESTING PENDING.**
- Notes: Repository and live SHA-256 both equal
  `430d2e995d025bf883c365815230555419ba90fab1b8d223277101fb9d53fc3e`.
  The current `debug.log` shows plugin cleanup, reinitialization, patch
  completion, and subsequent successful `Cached image` entries without a
  matching startup exception. A later worker prematurely synced intermediate
  commit 16e5355a0c73eab7146f34a62c1f74e5195af89e with matching SHA-256
  `e98585152b39b30c32b7ad46418d6e9bf454afd2cb1478db4a5c165a7c9bfcd1`;
  that copy is not accepted as the final live result.

## Final branch gate

- [x] Stages 5C and 5D are complete except for the separately listed user
      runtime matrix and post-sync branch push.
- [x] Full test suite and final independent audit pass on `2.8.2.9`.
- [x] `git diff --check` and Markdown parsing pass on the final tree.
- [x] Combined clipboard/disable live hash parity and clean hot reload are
      verified.
- [ ] Remaining user-driven `RT-26` behavior result recorded.
- [x] No unrelated attachment-gate implementation was included.
- [x] Version remains `2.8.2.9` as instructed.
- [ ] After clipboard runtime confirmation, amend the built-in changelog under
      the user's new explicit approval.
- [x] Push the combined clipboard/disable checkpoint only after the authorized
      live sync and verify local/tracking/direct-remote ref alignment.
- [x] Checklist removal was not requested for this working branch; retain it as
      the required living handoff.
- [x] Checklist-only history cleanup is not required for this working branch
      and is deferred to an eventual promotion decision.

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
| 2026-07-26 | Stage 3 | Updater and clipboard transports are now protected by symbol-bounded source contracts plus a direct updater behavior mock; no product code was changed for this stage. | Approved media-only scope and regression evidence |
| 2026-07-26 | Stage 4 | Legacy-routing diagnostics are activation-scoped and output-aware. A disabled console/toast route remains pending and receives at most one notice if later enabled during the same activation. | Exact debug-reporting contract plus deterministic evidence |
| 2026-07-26 | Stage 4 | Two worker drafts were rejected before commit: the first used the wrong notice text, reset the compatibility latch, and omitted coverage; the second incorrectly routed clipboard reads through the media selector. Parent review restored the approved cache-only boundary before validation. | Checklist scope and final user instruction |
| 2026-07-26 | Stage 5 | Final review hardened the startup native-capability probe: a throwing `Net`/`fetch` getter is treated as unavailable and activates the same safe legacy path instead of aborting plugin initialization. | Independent and parent final review plus deterministic initializer coverage |
| 2026-07-26 | Stage 5 | Added concise setting/debug documentation, automated `AT-47`, and deferred live matrix `RT-26`; no attachment-overhaul promise or release metadata change was added. | Documentation stage and source-contract evidence |
| 2026-07-26 | Stage 6 | Live copy, hash parity, Discord behavior checks, and runtime findings are explicitly deferred without execution until the user authorizes live sync after the pre-live report. | User's required stop-before-live gate |
| 2026-07-27 | Stage 5A | Harden the inherited response-body timeout/cancellation gap before live sync. Keep 15 seconds for the initial response, then use a rolling 30-second no-data watchdog that resets whenever non-empty bytes arrive; do not impose a fixed total download deadline. Stop or cache-disable must still cancel immediately and prevent retries or late writes. | User-approved implementation contract |
| 2026-07-27 | Stage 5A scope | “Cache disabled” means the **Cache media locally** master switch, which cancels every active media request. **Cache all attachment types** must not become a global cancellation gate. Its known-broken/incomplete child behavior remains separate future work; when repaired, turning it Off should cancel only no-longer-eligible non-image attachment/file-component requests while visual media continues. | User clarification before Stage 5A implementation |
| 2026-07-27 | Stage 5A draft audit | The first draft could still wait forever for a non-cooperative stream-cancel promise, retained retryable HTTP response bodies during backoff, and broke one existing central-handler source contract. Coverage also did not yet prove total transfer time beyond the idle window, body cancellation without `AbortController`, or stalled `arrayBuffer()` fallback. | Reported before correction; user approved the bounded fixes |
| 2026-07-27 | Stage 5A result | Implemented the approved rolling response-body watchdog, bounded non-cooperative cleanup, retry-response release, logical no-`AbortController` cancellation, streamless fallback escape, and deterministic coverage. The full suite passes `373/373`; an independent final review found no blocking defect. | Implementation commit 9e5871c75039fc34f262598854701083190df1fd and final verification |
| 2026-07-27 | Compatibility note | Retain only a historical mention of the malformed third-party `BdApi.Net.fetch` shape. Both supported BetterDiscord targets at 470ce77f1af43dd9abb061b087e8e54dd99ea3b9 and aa241f9fd57fa20698fd92eff201fbba086c9b9a expose async Promise-returning methods, so no production hardening or open checklist work is planned for this theoretical unsupported-host case. | User judged the case very unlikely and asked to scrub it as an issue while retaining a mention |
| 2026-07-27 | Stage 6 | After the required pre-live report, the user separately authorized live sync. The single plugin file was copied, hash parity was verified, and current log evidence showed a clean hot reload plus successful media-cache activity. The remaining `RT-26` behavior matrix now requires user interaction. | User live-sync authorization and runtime log evidence |
| 2026-07-27 | Stage 6 resources | Revalidated the original Waifugami image and a Google image as live HTTP 200 image responses without an allowed-origin header. Selected official httpbin drip URLs for a 40-second progressing transfer and a greater-than-30-second body stall, avoiding a large Discord upload. | Live header/chunk-timing checks and user request for practical test URLs |
| 2026-07-27 | Stage 5B | The public stall probe failed twice at about six seconds and a controlled localhost response failed at exactly five seconds. BetterDiscord's `timeout: null` becomes an unspecified Node request timeout, exposing the modern global agent's five-second socket timeout. Replace only the native media-cache override with `timeout: 0`, leaving Logger's 15-second initial and rolling 30-second body watchdogs authoritative. | Trace-first runtime evidence, supported-host source comparison, explicit `timeout: 0` control test, and user approval to fix and auto-sync |
| 2026-07-27 | Stage 5C audit | Two implementation commits passed their existing tests but remained unsuitable for release: the first had false/early route attribution and missing body-terminal evidence; the second retained false native-start output, incomplete status/outcome contracts, and weak edge coverage. The second was also copied live prematurely, so it must be replaced by the final audited build. | Parent call-path review before accepting the live result |
| 2026-07-27 | Cache-policy audit | Ordinary media caching follows author and location policy, but Anti-Nuke deliberately pre-caches ignored guild media. Two pre-existing strict-parity gaps also remain: ignored local/self updates can cache new media for an existing cached message, and a filtered partial update under the Ghost Ping override can cache media before a ghost ping is confirmed. Removed-attachment caching separately bypasses normal type/size checks. No policy code was changed because the user requested an audit report only and this networking branch remains scoped to transport re-plumbing. | Read-only source trace plus focused policy/Anti-Nuke/contracts result `95/95` |
| 2026-07-27 | Anti-Nuke retention audit | DMs cannot enter Anti-Nuke pre-cache, and a confirmed channel deletion adopts/captures only the exact guild parent and its child threads. Eligible ignored or muted media from any guild channel can still be physically pre-cached in case that channel is later deleted. The `15` thread / `45` message / `15` attachment capture caps do not bound, age, or clean those provisional files, so never-confirmed and cap-rejected files can remain orphaned. URL-only staging is unsafe because CDN URLs can expire as the parent disappears. | User designated a separate post-networking hardening stage: bounded provisional physical storage, promote confirmed nuke/Ghost-Ping or ordinary-record files, and delete expired/rejected candidates without touching shared references |
| 2026-07-27 | Provisional retention contract | Anti-Nuke and Ghost-Ping pre-cache files must be tracked as provisional until a matching saved record confirms them. Anti-Nuke retains only the newest provisional attachments allowed by its configured attachment cap; both Anti-Nuke and Ghost Ping receive configurable maximum ages. Expired, over-limit, rejected, and otherwise orphaned provisional files are automatically deleted on bounded maintenance passes. Any file referenced by a real saved Logger record is protected. This provisional cleanup is always active and is not gated by **Delete cached media with log records**, which remains a separate saved-record deletion preference. | Explicit user requirement for the post-networking storage-hardening stage |
| 2026-07-27 | Debug master linkage | `debugLogging` is the effective master for both the detailed-media child and the debug-toast child. Turning the master Off greys both and suppresses their output without changing either saved value; turning it On restores only children already saved On. A saved toast Off never auto-enables. The activation-scoped legacy notice flushes both routes immediately only when the saved toast child is On. No plugin version or built-in changelog text changed for this amendment. | Final user clarification plus supported BetterDiscord `enableWith` behavior, deterministic recovery/routing tests, and independent review |
| 2026-07-27 | Stage 6 partial runtime | Current detailed logs prove default native routing, Waifugami cross-origin success, a 39.8-second progressing response completing without a total deadline, and a controlled no-progress response reaching Logger's rolling 30-second body watchdog. The earlier one-off HTTPBin `Error: aborted` was a remote/transport interruption rather than Logger's watchdog and the same detailed probe then passed. | User-run `RT-26` probes plus current BetterDiscord `debug.log` and `console.log` |
| 2026-07-27 | Stage 6 cache-off cancellation | Turning **Cache media locally** Off during an active progressing native body cancelled it immediately after three bytes, emitted exactly one cancelled terminal event, and produced no retry or late completion after the original response window elapsed. | User-run `RT-26` probe plus current BetterDiscord `debug.log` and `console.log` |
| 2026-07-27 | Stage 6 plugin-stop cancellation | Disabling MessageLoggerV2 during an active progressing native body entered plugin cleanup, cancelled the request after three bytes, emitted exactly one cancelled terminal event, and produced no retry or late completion. Re-enabling initialized fresh media work normally. | User-run `RT-26` probe plus current BetterDiscord `debug.log` and `console.log` |
| 2026-07-27 | Stage 6 legacy/native toggle | Two manual probes and concurrent ordinary media work used forced renderer fetch successfully while exactly one activation-scoped routing notice appeared. Turning force Off made the next probe use BetterDiscord native fetch immediately. | User-run `RT-26` probes plus current BetterDiscord `debug.log` and `console.log` |
| 2026-07-27 | Stage 6 mixed content | A plain-HTTP image requested from Discord's HTTPS page used BetterDiscord native fetch and completed HTTP 200 / 8,090 bytes without renderer mixed-content blocking. | User-run `RT-26` probe plus current BetterDiscord `debug.log` and `console.log` |

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
- **Commit:** f3f4b6c0ef7b11136fbfa6adc86a9a6c35bf257a (`docs: resume networking implementation`).
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
- **Commit:** cedf3a65bf020abe3608642b63a62e4a6cb1633b
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
- **Commit:** 3c13374bb1a387cbb6ae13e7294cabb1317c99e5
  (`feat: route media cache through native networking`).
- **Exact next action:** Add Stage 3 source contracts proving update checks,
  remote clipboard reads, and local `blob:` clipboard reads remain independent
  of the media-only selector.

### 2026-07-26 — Stage 3 non-cache transport boundaries

- **Completed:** Added deterministic contracts for the updater's direct native
  request, local/remote clipboard split, clipboard byte conversion and failure
  feedback, the complete persistent-cache convergence chain, and the permitted
  renderer/native request inventory.
- **Decisions:** Keep Stage 3 test-only. The already-correct updater and
  clipboard implementations remain byte-for-byte untouched. Use bounded symbol
  slices instead of line numbers or a whole-file schema fingerprint.
- **Files changed:** `tests/source-contracts.test.js` and
  `NETWORKING-OVERHAUL-CHECKLIST.md`.
- **Tests and exact results:** PASS — focused source-contract run: 61 passed, 0
  failed; full `npm test`: 353 passed, 0 failed; plugin syntax passed within the
  full suite; `git diff --check` passed.
- **Runtime evidence:** No new runtime probe was needed; the earlier Discord
  updater transport probe remains the scope evidence.
- **Failures or blockers:** None. Parent review removed two unrelated static
  assertions and strengthened the updater parsing/error and force-setting
  independence contracts before commit.
- **Commit:** ffec3316aed4b7e0559899b04f387a814fa64f38
  (`test: lock media networking boundaries`).
- **Exact next action:** Implement and deterministically verify the exact
  output-aware legacy-routing notice without altering request, retry, updater,
  clipboard, or cache-write behavior.

### 2026-07-26 — Stage 4 debug routing and de-duplication

- **Completed:** Added the exact shared legacy-routing message, extended the
  existing debug router with optional per-output selection, added
  activation-scoped/per-output delivery state, wired late-enable callbacks for
  both Debug switches, and covered automatic fallback, force toggle, saved
  forced startup, all output combinations, re-entry, retries, and de-duplication.
- **Decisions:** Keep one compatibility latch and one diagnostic activation
  state. A force preference never marks the native API incompatible. A
  missing/non-callable API, throwing native property getter, synchronous
  invocation throw, non-thenable response, or throwing `then` getter latches
  legacy; asynchronous rejection and HTTP failure do not. Preserve the native
  method receiver and pass `timeout: null` while the logger retains its 15-second
  AbortController timeout.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/source-contracts.test.js`, and
  `NETWORKING-OVERHAUL-CHECKLIST.md`.
- **Tests and exact results:** PASS — focused debug/media/source run: 150
  passed, 0 failed; full `npm test`: 358 passed, 0 failed; plugin syntax passed
  within both gates; `git diff --check` passed.
- **Runtime evidence:** No new Discord probe was required. An independent
  read-only review confirmed the selector remains cache-only, the native
  receiver and timeout ownership are preserved, and updater/clipboard code is
  untouched.
- **Failures or blockers:** The first focused run reported 146 passed and 3
  failed because new source/assertion patterns matched the exact notice string
  and existing retry warnings too broadly; those test-contract defects were
  corrected without changing runtime behavior. Two worker drafts were rejected
  before commit: one had the wrong exact notice, reset the compatibility latch,
  and lacked tests; the next improperly routed clipboard reads through the
  media selector. Parent review removed both regressions. No blocker remains.
- **Commit:** 3ef7e6caae738d298ebada5bcab2241204d87571
  (`feat: report legacy media routing`).
- **Exact next action:** Commit Stage 4, record its exact hash, then document the
  setting/debug event and complete the final pre-live static and automated
  review. Do not copy the plugin live.

### 2026-07-26 — Stage 5 documentation and final pre-live review

- **Completed:** Documented **Force legacy media fetching**, automatic
  compatibility fallback, the exact per-activation Debug event, and the
  updater/clipboard exclusions; added official automated row `AT-47`, deferred
  runtime row `RT-26`, and a source contract for both documents. Completed
  parent and independent reviews of the full branch diff and read-only live
  parity.
- **Decisions:** Keep documentation media-only and retain the separate wildcard
  attachment limitation. Resolve every pre-live checklist item while preserving
  Stage 6 as an explicitly deferred, unexecuted runbook. A final review finding
  hardened `_hasMediaCacheNativeFetch()` so a throwing native `Net`/`fetch`
  getter selects safe legacy routing during initialization.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/source-contracts.test.js`, `docs/settings.md`, `docs/tests.md`, and
  `NETWORKING-OVERHAUL-CHECKLIST.md`.
- **Tests and exact results:** PASS — focused media/source/persistence run: 151
  passed, 0 failed; independent media/source/settings run: 127 passed, 0 failed;
  full `npm test`: 359 passed, 0 failed; `npm run check`,
  `git diff --check`, and `cmark` parsing of both documentation files passed.
- **Runtime evidence:** No live copy or behavior test was performed. Read-only
  SHA-256 comparison found repository
  `647de34e571b7a14f70c16a464241b0ece55aea59200eb8bfe5b925dda57c7c9`
  and live
  `9ed4872e4f342e46ca69a8a68c8aa054ce2a7cb2532a9dc1bdcdef73fec92c99`,
  proving the live plugin remains unsynced.
- **Failures or blockers:** No remaining implementation blocker. Stage 6
  remains deliberately deferred pending the user's separate live-sync
  authorization.
- **Commit:** ee902036fa083e20ec6700863a5093b9afa1bbec
  (`fix: finalize media networking overhaul`).
- **Exact next action:** Commit this exact Stage 5 hash checkpoint, run the
  final clean-tree automated/status check, then report and stop before live
  sync.

### 2026-07-27 — Final pre-live handoff checkpoint

- **Completed:** Added final read-only pre-live audit findings, including two
  non-blocking observations; kept the branch code surface unchanged.
- **Decisions:** Continue waiting for explicit live-sync authorization before any
  runtime copy. Any body-phase timeout/cancellation hardening is deferred to a
  separate approval-first change request.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md` only.
- **Tests and exact results:** PASS — full suite `359/359`; `npm run check`
  passed; `git diff --check` passed; this checklist parses with `cmark`.
- **Runtime evidence:** Supported host references 470ce77f1af43dd9abb061b087e8e54dd99ea3b9 and aa241f9fd57fa20698fd92eff201fbba086c9b9a were
  checked read-only; no live sync or runtime code path changed. Live repository
  hash remains `647de34e571b7a14f70c16a464241b0ece55aea59200eb8bfe5b925dda57c7c9` and live hash remains
  `9ed4872e4f342e46ca69a8a68c8aa054ce2a7cb2532a9dc1bdcdef73fec92c99`.
- **Failures or blockers:** None.
- **Commit:** dfcfa5f845abbaca02df4d6e01e421496a938f88
  (`docs: record final networking edge audit`).
- **Exact next action:** Wait for explicit live-sync authorization; then run RT-26
  runtime checks. Do not start optional body-phase hardening without separate
  user approval first.

### 2026-07-27 — Stage 5A approved inactivity-watchdog plan

- **Completed:** Converted the inherited body-phase observation into an
  approved, bounded pre-live hardening stage; demoted the malformed
  third-party-native-fetch scenario to a historical compatibility note with no
  implementation work.
- **Decisions:** Preserve the 15-second initial response deadline. During body
  consumption, allow unlimited total transfer time while non-empty bytes keep
  arriving, but abort after 30 continuous seconds without byte progress.
  Plugin stop and the **Cache media locally** master switch remain immediate
  all-request cancellation events. **Cache all attachment types** remains
  outside this stage: its later repair should cancel only newly ineligible
  non-image requests without disturbing visual-media downloads.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md` only.
- **Tests and exact results:** PASS — `npm test` reported 359 passed, 0 failed;
  `npm run check`, `git diff --check`, and `cmark
  NETWORKING-OVERHAUL-CHECKLIST.md` passed. No plugin code has changed.
- **Runtime evidence:** None required for this planning checkpoint; live plugin
  remains intentionally unsynced.
- **Failures or blockers:** None.
- **Commit:** ab5f56ebc3c1195a23597794f1bcdf9a0a0d1ba2
  (`docs: plan media body inactivity watchdog`).
- **Exact next action:** Commit and record this plan checkpoint, then implement
  Stage 5A with focused and full deterministic verification.

### 2026-07-27 — Stage 5A cancellation-scope clarification

- **Completed:** Distinguished the media-cache master switch from the known
  incomplete all-attachment-types child before implementation.
- **Decisions:** Plugin stop and **Cache media locally** Off cancel all current
  media transfers. **Cache all attachment types** Off must never globally
  cancel visual media; its eventual repair is separate and should cancel only
  no-longer-eligible non-image attachment/file-component transfers.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md` only.
- **Tests and exact results:** PASS — `npm test` reported 359 passed, 0 failed;
  `npm run check`, `git diff --check`, and checklist `cmark` parsing passed.
  No plugin code has changed.
- **Runtime evidence:** Static setting/call-path inspection only. The child
  setting is `newSaveAllFileTypes`; the master is `cacheAllImages`.
- **Failures or blockers:** The child toggle remains a documented known
  limitation for a later, separately scoped repair.
- **Commit:** f17a96e42348d725adcc578fb0ec3b489011afb0
  (`docs: clarify media watchdog cancellation scope`).
- **Exact next action:** Commit and record this clarification, then begin the
  bounded Stage 5A implementation without changing the child setting.

### 2026-07-27 — Stage 5A first-draft audit stop

- **Completed:** Built the initial watchdog draft and stopped before correction
  or implementation commit when parent/full-suite and independent review found
  issues.
- **Decisions:** Make cancellation cleanup non-blocking even if a stream refuses
  to cancel; release retryable HTTP bodies before backoff; preserve the existing
  central-handler call contract; add the missing body/fallback/rolling/retry
  coverage.
- **Files changed:** Uncommitted draft in `MessageLoggerV2.plugin.js` and
  `tests/media.test.js`; this checkpoint changes only the checklist.
- **Tests and exact results:** Focused media PASS `61/61`; full `npm test` FAIL
  `367/368` at `media routing converges through cacheImage and
  cacheMessageImages across enumeration, deferred, removed, and anti-nuke
  paths`; `npm run check` and `git diff --check` passed.
- **Runtime evidence:** A deterministic no-`AbortController` probe confirmed a
  non-settling reader cancellation left the body promise pending and one active
  handle registered.
- **Failures or blockers:** The reported issues are now approved for bounded
  correction. The draft remains uncommitted and is not eligible for live sync.
- **Commit:** 503035bfe886035d02ed42d93ca738e824c752c0
  (`docs: record media watchdog draft audit`).
- **Exact next action:** Commit and record this audit checkpoint, apply the
  approved corrections/tests, then run the full review and verification gates.

### 2026-07-27 — Stage 5A completed pre-live gate

- **Completed:** Added the 15-second initial-response deadline plus rolling
  30-second response-body inactivity watchdog, bounded cleanup, streamless
  fallback escape, and the approved cancellation/retry protections. Updated
  `AT-47`, `RT-26`, and the settings reference.
- **Decisions:** No fixed total transfer deadline. Non-empty bytes reset the
  watchdog. Plugin stop and **Cache media locally** Off cancel all active media
  work. **Cache all attachment types** remains unchanged and is not a global
  cancellation gate.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/source-contracts.test.js`, `docs/settings.md`, `docs/tests.md`, and
  this checklist.
- **Tests and exact results:** PASS — focused media `66/66`; focused source
  contracts `62/62`; full `npm test` `373/373`; `npm run check`,
  `git diff --check`, and checklist/docs `cmark` parsing.
- **Runtime evidence:** None added. Read-only SHA-256 comparison is intentionally
  different: repository
  `430d2e995d025bf883c365815230555419ba90fab1b8d223277101fb9d53fc3e`;
  live
  `9ed4872e4f342e46ca69a8a68c8aa054ce2a7cb2532a9dc1bdcdef73fec92c99`.
- **Failures or blockers:** No automated or audit blocker. Actual BetterDiscord
  slow/stalled response behavior and stop/master-toggle cancellation remain
  the separately authorized `RT-26` live checks.
- **Commit:** Implementation
  9e5871c75039fc34f262598854701083190df1fd
  (`fix: guard media cache body transfers`); checklist checkpoint
  6830a03b5cca7ccf1689a874ab9445d60215090a
  (`docs: record completed media watchdog`).
- **Exact next action:** Report and stop. Wait for explicit live-sync
  authorization before copying the plugin or running `RT-26`.

### 2026-07-27 — Authorized live sync and test handoff

- **Completed:** Re-ran the full automated suite, copied only
  `MessageLoggerV2.plugin.js` into the active BetterDiscord plugins directory,
  verified exact hash parity, and inspected the current runtime log after the
  hot reload.
- **Decisions:** Do not relaunch Discord. Stop for the user's manual `RT-26`
  checks; use trace-first diagnosis if any check fails.
- **Files changed:** Live `MessageLoggerV2.plugin.js` plus this checklist. No
  repository plugin code changed after implementation commit 9e5871c75039fc34f262598854701083190df1fd.
- **Tests and exact results:** PASS — pre-sync `npm test` `373/373`; live plugin
  syntax check; repository/live `cmp`; SHA-256 parity.
- **Runtime evidence:** `debug.log` advanced after the copy and showed plugin
  cleanup/reinitialization, patch completion, and successful `Cached image`
  events without a matching startup error.
- **Failures or blockers:** Automated and basic load gates have no blocker.
  The remaining checks require the user to exercise real URLs, cancellation,
  and force-mode behavior inside Discord.
- **Commit:** f73b8b096f430e9b31d0f2041b447c339d117e81
  (`docs: record authorized live sync`).
- **Exact next action:** Give the user the short `RT-26` test instructions and
  wait for results before making any further code change.

### 2026-07-27 — Stage 6 test URLs sourced

- **Completed:** Rechecked the exact historical Waifugami image, sourced a
  stable missing-CORS-header backup, and validated two tiny httpbin drip
  profiles for progressing and stalled response bodies.
- **Decisions:** Use direct console/helper calls into
  `fetchMediaCacheResponse()` for the drip checks. They transfer only 40 bytes
  or two bytes and do not need a large Discord attachment.
- **Files changed:** This checklist only.
- **Tests and exact results:** Waifugami HTTP 200 `image/png`, 1,091,999 bytes,
  no `Access-Control-Allow-Origin`; Google image HTTP 200 `image/png`, 13,504
  bytes, no `Access-Control-Allow-Origin`; plain-HTTP httpbin image HTTP 200
  `image/png` without an HTTPS redirect; eight-second httpbin sample emitted
  one-byte chunks at roughly one-second intervals.
- **Runtime evidence:** Endpoint/header/chunk timing verified outside Discord;
  user invocation inside Discord remains pending.
- **Failures or blockers:** None. If DevTools console use is inconvenient, a
  disposable helper plugin can expose the same two probes.
- **Commit:** 32b0df1b61116855a4dcfba2ac952b4b3497e02d.
- **HTTP test-resource follow-up:**
  51624f181299276dc12669cd2522198afaa8736f.
- **Exact next action:** Give the user the exact pasteable probes and wait for
  their results.

### 2026-07-27 — Initial RT-26 live probe results

- **Completed:** Read the current exported BetterDiscord `console.log` and
  recorded only the live results it proves.
- **Files changed:** This checklist only.
- **Tests and exact results:** The Waifugami request passed with HTTP 200,
  1,091,999 bytes, and 2.5 seconds. The progressing httpbin request passed with
  all 40 bytes in 42.0 seconds.
- **Runtime evidence:** The body-stall request returned a generic
  `Error: aborted` after 6.0 seconds. There was no matching plugin stop or
  cache-disable event, and the overlapping 40-second progress probe remained
  alive and completed. Treat the stall attempt as inconclusive rather than a
  confirmed Logger defect.
- **Failures or blockers:** The 30-second body-inactivity behavior still needs
  one clean live retest. No code fix is authorized or indicated by this result.
- **Commit:** 90abbad3ae35e8d8f1819ba178d462ffa7467301.
- **Exact next action:** Ask the user to rerun only the 70-second/two-byte stall
  probe. If the endpoint aborts early again, replace it with a controlled local
  or helper-plugin stall probe.

### 2026-07-27 — Stage 5B native socket-timeout plan

- **Completed:** Repeated the public stall probe, reproduced the same early
  abort against a controlled localhost response, traced the supported host
  implementation, and verified an explicit numeric zero-timeout control.
- **Decisions:** Replace `timeout: null` with `timeout: 0` only at Logger's
  native media-cache boundary. Keep Logger's existing 15-second
  initial-response and rolling 30-second body watchdogs unchanged.
- **Files changed:** This checklist only; the ignored local stall-server helper
  remains under `tmp/` for the post-sync runtime check.
- **Tests and exact results:** Public probes aborted after 6.0 and 5.9 seconds.
  The controlled Logger probe aborted after 5.0 seconds. The equivalent native
  Node request with `timeout: 0` received both bytes across the full 35.0-second
  gap.
- **Runtime evidence:** The controlled server saw Logger's client close at 5.0
  seconds but saw the explicit zero-timeout control remain connected and
  complete at 35.0 seconds.
- **Failures or blockers:** The current live plugin cannot exercise its
  30-second body watchdog because the inherited host timer fires first.
- **Commit:** 486fc1b214729338bbd59e0c24aee0d6d4b5218a.
- **Exact next action:** Commit and record this approved plan, implement the
  narrow override with regression coverage, complete validation/review, then
  auto-sync the single plugin file as authorized.

### 2026-07-27 — Stage 5B native socket-timeout implementation

- **Completed:** Replaced the native media-cache `timeout: null` override with
  numeric `timeout: 0`, updated deterministic media/source contracts, ran the
  complete validation matrix, and completed an independent supported-host and
  edge-case review.
- **Decisions:** Keep every Logger watchdog and all legacy, retry, updater,
  clipboard, cache-gate, and persistence behavior unchanged.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
  `tests/source-contracts.test.js`, and this checklist.
- **Tests and exact results:** Focused media/source-contract suites passed
  `128/128`; full `npm test` passed `373/373`; `npm run check`,
  `git diff --check`, and checklist `cmark` parsing passed.
- **Runtime evidence:** No new live sync has occurred yet. The pre-change
  controlled evidence remains a five-second inherited abort versus successful
  35-second completion with explicit numeric zero.
- **Failures or blockers:** None found in deterministic or independent review.
  The post-sync controlled stall result remains runtime-only.
- **Commit:** aaf31b69659131fb7e67f01c249cb988c81f7474.
- **Exact next action:** Commit this implementation, record its exact hash in
  both Stage 5B locations, then add and commit Stage 5C's detailed
  media-network diagnostics plan before changing that behavior.

### 2026-07-27 — Stage 5C detailed media-network diagnostics plan

- **Completed:** Mapped the settings persistence/UI dependency chain and the
  complete native/legacy media response lifecycle, then documented the approved
  implementation and validation contract before changing behavior.
- **Decisions:** The child toggle is persisted but effective only while the
  main console Debug switch is On. Detailed events are console-only, never
  toasts, and use one ID per network attempt. Full URLs are included by user
  request; headers and bodies are excluded. After the authorized live sync and
  final checklist checkpoint, push only the current feature branch and verify
  its remote ref; do not merge it into another branch.
- **Files changed:** This checklist only.
- **Tests and exact results:** `git diff --check` and checklist `cmark` parsing
  pass. Production behavior remains at the validated Stage 5B commit.
- **Runtime evidence:** Existing console output contains only the older
  activation-scoped legacy-routing notice; no detailed per-request stream
  exists yet.
- **Failures or blockers:** None. Full URLs may expose signed/query values in
  exported console logs, so that risk must be documented with the setting.
- **Commit:** 1ecd08c189893f538725f7d6034fd005b8f09b2b.
- **Exact next action:** Commit this plan, record its exact hash, then delegate
  the bounded implementation and focused tests before parent integration,
  full-suite validation, independent audit, and authorized live sync.

### 2026-07-27 — Stage 5C rejected correction and premature sync

- **Completed:** Reviewed the second diagnostics implementation against the
  committed route, body-lifecycle, output, and test contracts after its
  automated suite passed.
- **Decisions:** Reject it as the release candidate. Preserve its commit for
  traceability; correct it in a later commit rather than rewriting history.
  Treat its live copy as an invalid intermediate sync and replace it only with
  the final audited `2.8.2.9` plugin.
- **Files changed:** The rejected commit changed `MessageLoggerV2.plugin.js`,
  `tests/media.test.js`, and this checklist.
- **Tests and exact results:** Full `npm test` passed `376/376`, but the suite
  still did not enforce the complete Stage 5C edge contract.
- **Runtime evidence:** The worker copied the intermediate file live and
  confirmed repository/live SHA-256
  `e98585152b39b30c32b7ad46418d6e9bf454afd2cb1478db4a5c165a7c9bfcd1`
  before version/changelog work or final audit. The user was told not to test
  this build.
- **Failures or blockers:** Native transport was still announced before
  thenable validation; response-acquired lacked status/timing; non-OK release
  reported the wrong outcome; disabled diagnostics still consumed request IDs;
  edge coverage remained incomplete.
- **Commit:** 16e5355a0c73eab7146f34a62c1f74e5195af89e.
- **Exact next action:** Correct the rejected contracts with substantive
  coverage, complete Stage 5D and the final audit, then overwrite the
  intermediate live copy with the accepted build.

### 2026-07-27 — Media-cache policy audit

- **Completed:** Traced every normal, update, delete/purge, no-save/deferred,
  Ghost Ping, and Anti-Nuke path into `cacheMessageImages`/`cacheImage`.
- **Decisions:** Make no policy change in this networking task. Report the
  existing behavior first and keep any strict cache-policy repair separately
  scoped unless the user explicitly authorizes it.
- **Files changed:** This checklist only; the audit itself was read-only.
- **Tests and exact results:** Focused policy, Anti-Nuke, and source-contract
  suites passed `95/95`.
- **Runtime evidence:** Not required; the findings are deterministic dispatch
  and cache-admission paths.
- **Failures or blockers:** Normal caching follows whitelist, blacklist, mute,
  NSFW, bot/blocked/self, selected-channel/thread-parent, and DM rules.
  Anti-Nuke intentionally pre-caches ignored guild media. Ignored local/self
  updates and filtered partial Ghost Ping updates have two additional strict
  cache-parity gaps. Removed attachments also bypass type/size gates.
- **Commit:** 70c3c446246687d988744286253f785c17027b99.
- **Exact next action:** Keep these findings out of the networking code; finish
  Stage 5C/5D and report any separately requested policy repair before editing.

### 2026-07-27 — Stage 5D release metadata request

- **Completed:** Recorded the user's explicit pre-sync request to increment the
  plugin version and replace the built-in changelog with this networking
  branch's fixes.
- **Decisions:** Use the next patch, `2.8.2.9`. Keep the changelog concise and
  network-specific while retaining the known arbitrary non-image attachment
  limitation. Do not change the persisted data schema.
- **Files changed:** This checklist only.
- **Tests and exact results:** `git diff --check` and checklist `cmark` parsing
  pass; release code has not been edited yet.
- **Runtime evidence:** None required for this documentation-only plan
  amendment; the versioned plugin will receive the same full validation and
  live hash/reload checks as Stage 5C.
- **Failures or blockers:** None.
- **Commit:** adf773e81cc189d1f9fa841fb0ef0de1f4cc29c8.
- **Exact next action:** Finish and review Stage 5C, apply the version/changelog
  update with matching deterministic contracts, then run the full audit before
  committing, live syncing, checkpointing, and pushing the feature branch.

### 2026-07-27 — Stage 5C initial implementation audit

- **Completed:** Added the setting/default/docs and an initial per-request
  telemetry implementation, ran its full suite, then inspected the exact
  native/legacy and managed-body call paths before live sync.
- **Decisions:** Do not accept or sync the first draft. Transport start must be
  emitted only after the actual native/legacy route is known, and managed body
  consumption must own the single terminal outcome with exact partial bytes.
- **Files changed:** The initial implementation commit changed
  `MessageLoggerV2.plugin.js`, `docs/settings.md`, `docs/tests.md`,
  `tests/media.test.js`, `tests/settings-recovery.test.js`, and
  `tests/source-contracts.test.js`. This follow-up changes the checklist only.
- **Tests and exact results:** The initial commit's full `npm test` passed
  `376/376`, but passing coverage did not exercise the two rejected contracts.
  Corrective tests and another complete validation are required.
- **Runtime evidence:** None; live sync remains deliberately blocked until the
  corrections and second audit pass.
- **Failures or blockers:** Incorrect early native attribution during a
  synchronous fallback; incomplete body timeout/cancel/failure and partial-byte
  terminal reporting.
- **Commit:** 429701ebd65afdac8841b5f77e2173e4bbf2d2a5.
- **Exact next action:** Correct the two audited gaps, harden logging so it
  cannot affect networking, expand focused coverage, then apply Stage 5D and
  run the complete pre-live audit.

### 2026-07-27 — Accepted Stage 5C/5D pre-live implementation

- **Completed:** Corrected detailed media diagnostics, expanded deterministic
  lifecycle coverage, updated the plugin to `2.8.2.9`, replaced its built-in
  changelog, updated directly affected documentation, and completed two
  independent pre-live audits.
- **Decisions:** Allocate request IDs only while both console switches are
  effective; announce native only after validating its thenable; let the
  managed response own one terminal status/byte/outcome line; keep all detailed
  events console-only and failure-isolated. Leave updater, clipboard,
  eligibility, retry, persistence, and legacy-notice contracts unchanged.
- **Files changed:** `MessageLoggerV2.plugin.js`, `README.md`, `TODO.md`,
  `docs/architecture.md`, `docs/help.md`, `docs/settings.md`, `docs/tests.md`,
  `tests/media.test.js`, `tests/settings-recovery.test.js`,
  `tests/source-contracts.test.js`, and this checklist.
- **Tests and exact results:** Focused media/settings/source-contract suites
  passed `147/147`; full `npm test` passed `379/379`; the media suite passed
  ten repeated runs; `npm run check`, `git diff --check`, and all changed
  Markdown parsing passed.
- **Runtime evidence:** No final sync yet. The live plugin is still the
  premature intermediate `2.8.2.8` copy and must be overwritten only after
  this accepted implementation is committed.
- **Failures or blockers:** The production audit found none. The release audit
  found one stale `TODO.md` version/paused note; it was reported before being
  corrected. Runtime-only `RT-26` checks remain after final sync.
- **Commit:** 15eb75b7c5e9125cab64bb8e657721f223ab914f.
- **Exact next action:** Run the final validation on this exact tree, commit it,
  record the full hash, then sync only the plugin, verify hash/log evidence,
  checkpoint, push the feature branch, and provide the user test list.

### 2026-07-27 — Provisional recovery-media retention audit

- **Completed:** Traced Anti-Nuke pre-cache scope, confirmed deletion scope,
  capture budgets, physical-file retention, and existing cleanup behavior.
- **Decisions:** Keep this outside the networking release. Record a separate
  post-networking stage in `TODO.md`; do not change cache admission or recovery
  policy on this branch.
- **Files changed:** `TODO.md` and this checklist only; the behavior audit was
  read-only.
- **Tests and exact results:** Existing focused policy/Anti-Nuke/contracts
  coverage passed `95/95`; the final full suite passed `379/379`.
- **Runtime evidence:** Not required for the deterministic scope/retention
  finding.
- **Failures or blockers:** DMs are excluded and recovery cannot mix unrelated
  parents, but provisional physical guild-media files have no Anti-Nuke
  age/byte/count eviction and are not removed when no deletion is confirmed or
  capture caps reject them. URL-only staging would risk expired CDN URLs.
- **Commit:** 15eb75b7c5e9125cab64bb8e657721f223ab914f.
- **Exact next action:** After networking runtime checks are complete, design
  bounded provisional storage that promotes confirmed nuke/Ghost-Ping or
  ordinary-record files and safely deletes expired/rejected candidates.

### 2026-07-27 — Final 2.8.2.9 live replacement

- **Completed:** Replaced the premature live `2.8.2.8` copy with the accepted
  repository `2.8.2.9` plugin, byte-compared both files, verified SHA-256
  parity, and inspected the current hot-reload log segment.
- **Decisions:** Copy only `MessageLoggerV2.plugin.js`; do not relaunch Discord
  or install test files/helpers into the live plugins directory.
- **Files changed:** Live `MessageLoggerV2.plugin.js` plus this checklist. The
  accepted repository implementation remains
  15eb75b7c5e9125cab64bb8e657721f223ab914f, with its recorded checklist
  checkpoint d25576f84aa62b41c2149fae30b7b809f86a3e1d.
- **Tests and exact results:** The exact pre-sync repository tree passed full
  `npm test` `379/379`, `npm run check`, `git diff --check`, changed Markdown
  parsing, and ten repeated media-suite runs.
- **Runtime evidence:** Repository/live SHA-256 both equal
  `d7cfc616ac9d2bcf36d67a496a0d13e4de63168fd99dad50adfd279b4425ef37`.
  The current UTC log segment shows cleanup, successful reinitialization,
  patch completion, and later cache writes without a matching startup error.
- **Failures or blockers:** No basic load blocker. The controlled stall,
  cancellation, legacy/debug routing, updater, and clipboard checks remain
  user-driven `RT-26` work.
- **Commit:** fd8e027b7e67b4985f3d911555d39c9c630c7c41.
- **Exact next action:** Superseded by the later user-requested Debug
  master-link amendment below. Validate and commit that amendment before
  replacing the live plugin and pushing the feature branch.

### 2026-07-27 — Debug toast child linked to console master

- **Completed:** Linked **Show debug messages as toasts** to **Enable debug
  logging** in both the settings UI and runtime router, retained its persisted
  value while the master is Off, corrected the pending legacy-routing notice
  edge, and updated deterministic coverage plus directly affected docs.
- **Decisions:** Master Off makes both Debug children ineffective without
  rewriting their config values. Master On restores only a child already saved
  On. A saved toast Off never auto-enables. Detailed media-request diagnostics
  remain console-only and never follow the toast route. Keep plugin version
  `2.8.2.9` and the existing built-in changelog unchanged for this amendment.
- **Files changed:** `MessageLoggerV2.plugin.js`, `docs/architecture.md`,
  `docs/help.md`, `docs/settings.md`, `docs/tests.md`,
  `tests/media.test.js`, `tests/persistence.test.js`,
  `tests/settings-recovery.test.js`, `tests/source-contracts.test.js`, and this
  checklist.
- **Tests and exact results:** Focused media/settings-recovery/source-contract
  coverage passed `149/149`; final full `npm test` passed `381/381`;
  `npm run check` and `git diff --check` passed. The installed `cmark` accepts
  only one input path, so the initial multi-file command was rejected for its
  arguments; each changed documentation file then parsed successfully in an
  individual loop.
- **Runtime evidence:** Repository/live SHA-256 both equal
  `260a3f8c2c3bf0534b0ad8ef5a91d62fae83cbce088cc9fab3e0a6917d2cd424`.
  The UTC `debug.log` segment at `17:42:15-17:42:16` shows patch removal,
  successful reinitialization, UI refresh completion, and subsequent cached
  media without a matching Logger error. Discord was not relaunched.
- **Failures or blockers:** Independent review found no production defect. It
  found stale Debug matrix wording and missing saved-child recovery coverage;
  both were corrected before the full pass. User-driven `RT-26` checks remain.
- **Commit:** 135eeb37baecfbb153784ce46c6767c2ea7362e2; checklist checkpoint
  c7d4d32bfb9633f302bd433681bf02fb1766598b; live-sync checkpoint
  8b7487225e3c1c694b76c89d1f97a7468f874304.
- **Exact next action:** Publication completed below. Give the user the
  remaining `RT-26` checks and wait for runtime results.

### 2026-07-27 — Final feature-branch publication

- **Completed:** Pushed the complete networking implementation, audits,
  tests, docs, checklist history, and final live-sync evidence to
  `origin/fix/native-media-networking`.
- **Decisions:** Publish only the current feature branch. Do not open a pull
  request or merge/switch/update `develop` or `main`.
- **Files changed:** No product or live files changed during publication; this
  checklist records the verified remote state.
- **Tests and exact results:** The exact product tree published here retains
  the final `381/381` full-suite pass, `npm run check`, `git diff --check`, and
  per-file Markdown parse pass.
- **Runtime evidence:** Final repository/live SHA-256 remains
  `260a3f8c2c3bf0534b0ad8ef5a91d62fae83cbce088cc9fab3e0a6917d2cd424`,
  with the clean hot-reload evidence recorded above.
- **Failures or blockers:** None in publication. User-driven `RT-26` behavior
  checks are the only remaining networking checklist work.
- **Commit:** Initial verified remote publication checkpoint
  e84bfaaf6fffc4b809f7e4fb6fe70ef6ac5c5897; final publication record
  4defbd80b9bb99525be9283b69d1bc04c9254dfc. Local `HEAD`, the
  remote-tracking ref, and `git ls-remote` all matched the latter full hash.
- **Exact next action:** Superseded by the partial `RT-26` result below.

### 2026-07-27 — Current native, progress, and inactivity runtime checks

- **Completed:** Verified default native routing through ordinary live Discord
  CDN traffic, the previously CORS-blocked Waifugami URL, a 40-second
  progressing response, and a controlled response that stops making progress.
- **Decisions:** Treat the earlier one-off HTTPBin `Error: aborted` as a
  remote/transport interruption, not a Logger timeout: it did not carry
  Logger's watchdog error, and the same detailed native probe then completed.
- **Files changed:** This checklist only.
- **Tests and exact results:** Waifugami passed HTTP 200 with 1,091,999 bytes in
  2.5 seconds. Detailed native request `#102` passed HTTP 200 with all 40 bytes
  in 39.8 seconds. The controlled localhost stall returned
  `AbortError: Media cache response body timed out` at exactly 30.0 seconds.
- **Runtime evidence:** Current BetterDiscord `debug.log` and `console.log`
  identify native selection, response acquisition, exact terminal outcomes,
  byte counts, and elapsed times. Normal Discord CDN request `#103` also
  completed natively with HTTP 200 and 334,583 bytes.
- **Failures or blockers:** None in these four checks. Mixed-content,
  file-size, cancellation, forced legacy/native return, debug-output matrix,
  updater, and clipboard checks remain.
- **Commit:** Runtime-evidence checkpoint
  72e0409865932ca7314b74824199acb43d41e8d5.
- **Exact next action:** Superseded by the cache-off cancellation result below.

### 2026-07-27 — Cache-master cancellation runtime check

- **Completed:** Started a 40-second native response and turned **Cache media
  locally** Off while its body was still progressing.
- **Decisions:** Keep this result separate from plugin-stop cancellation; the
  combined RT-26 row is not complete until the stop path is also exercised.
- **Files changed:** This checklist only.
- **Tests and exact results:** Native request `#160` acquired HTTP 200, received
  three bytes, then emitted `terminal outcome=cancelled` only 13 ms after the
  cache-master setting-change log. The probe returned
  `AbortError: Media cache request was cancelled` at 3.4 seconds.
- **Runtime evidence:** No second request, retry, success outcome, or late probe
  completion appeared through UTC `17:57:08`, beyond the request's original
  40-second completion window.
- **Failures or blockers:** None for cache-master cancellation. Plugin-stop
  cancellation still requires a user-run live check.
- **Commit:** Cache-off runtime-evidence checkpoint
  33a58c1627886e4f5e34cd827a37e8cc6f54d2a8.
- **Exact next action:** Superseded by the plugin-stop result below.

### 2026-07-27 — Plugin-stop cancellation runtime check

- **Completed:** Started a 40-second native response, disabled MessageLoggerV2
  while its body was progressing, waited beyond the original response window,
  and confirmed normal fresh activity after re-enabling the plugin.
- **Decisions:** The cache-master and plugin-stop halves now jointly complete
  the cancellation row. No additional cancellation code change is indicated.
- **Files changed:** This checklist only.
- **Tests and exact results:** Native request `#174` acquired HTTP 200, received
  three bytes, then emitted `terminal outcome=cancelled` as plugin cleanup
  removed the patches. The probe returned
  `AbortError: Media cache request was cancelled` at 3.6 seconds.
- **Runtime evidence:** No second `#174` event, retry, success outcome, or late
  probe completion appeared through UTC `17:59:25`, beyond the original
  40-second completion window. Re-enabled Logger requests then completed
  natively and cached media normally.
- **Failures or blockers:** None for cancellation. Forced legacy/native-return
  routing is the next live networking check.
- **Commit:** Plugin-stop runtime-evidence checkpoint
  9cf8922934d9e056069948e2a705092280cb078c.
- **Exact next action:** Superseded by the legacy/native result below.

### 2026-07-27 — Forced-legacy and native-return runtime checks

- **Completed:** Enabled forced legacy, ran the same small response twice,
  observed concurrent ordinary media traffic, disabled force, and repeated the
  probe through the default route.
- **Decisions:** Forced legacy, immediate native return, and one-notice-per-
  activation behavior now have sufficient live evidence. No routing code
  change is indicated.
- **Files changed:** This checklist only.
- **Tests and exact results:** Requests `#231` and `#232` used legacy renderer
  fetch and completed HTTP 200 / 32 bytes in 0.7 and 0.2 seconds. After force
  was disabled, request `#246` used BetterDiscord native fetch and completed
  HTTP 200 / 32 bytes in 0.9 seconds.
- **Runtime evidence:** Exactly one
  `Networking: media routing is using the old Discord renderer fetch() method.`
  console notice appeared during the activation even though many automatic
  requests and both manual probes used the legacy route.
- **Failures or blockers:** None for forced legacy, native return, or notice
  de-duplication. Mixed-content is the next direct transport check.
- **Commit:** Legacy/native runtime-evidence checkpoint
  d6825dd02fbcd56d380010a60e787b7767153c9c.
- **Exact next action:** Superseded by the mixed-content result below.

### 2026-07-27 — Mixed-content runtime check

- **Completed:** Requested a plain-HTTP PNG from Discord's HTTPS renderer while
  force legacy remained Off.
- **Decisions:** The native media path now has direct runtime proof that it
  avoids renderer mixed-content enforcement. No code change is indicated.
- **Files changed:** This checklist only.
- **Tests and exact results:** Native request `#290` completed HTTP 200 with all
  8,090 bytes in 0.4 seconds.
- **Runtime evidence:** Detailed logs explicitly show
  `http://httpbin.org/image/png`, native selection, BetterDiscord native fetch,
  and one successful terminal outcome.
- **Failures or blockers:** None for mixed-content transport. File-size limits
  are the next media-cache check.
- **Commit:** Mixed-content runtime-evidence checkpoint
  fc9741e8d15aa8ac3b8a12452ad9cd9743233a2c.
- **Exact next action:** Superseded by the file-size result below.

### 2026-07-27 — Media-cache file-size runtime check

- **Completed:** Uploaded a real 2.12 MB Discord JPEG attachment in an allowed
  channel while the maximum cache file size was set to the accepted
  whole-number value of 1 MB.
- **Decisions:** Message creation is sufficient for this check. Deleting the
  message is not required because Logger applies the attachment-size gate
  before starting the media-cache download.
- **Files changed:** This checklist only.
- **Tests and exact results:** PASS — Logger emitted
  `Skipping cache for MessageLogger-size-limit-test-2.2MB.jpg: 2.12MB exceeds
  limit` immediately after the message was sent. No media request for that
  attachment followed.
- **Runtime evidence:** Both current BetterDiscord `debug.log` and
  `console.log` contain the upload and skip events at `18:07:48-18:07:53` UTC.
  Other nearby media requests were unrelated emoji and image traffic.
- **Failures or blockers:** None for attachment file-size enforcement.
  Debug-output, updater, and clipboard checks remain.
- **Commit:** File-size runtime-evidence checkpoint
  76e0bc805c82e34152e19fe8c906a7c3d73964bc.
- **Exact next action:** Superseded by the Debug-output result below.

### 2026-07-27 — Linked Debug-output runtime matrix

- **Completed:** Exercised the legacy-routing notice with the Debug master Off,
  console-only output, delayed toast delivery, and both destinations active.
- **Decisions:** Keep the saved child-state behavior unchanged. A destination
  which was unavailable at detection may receive its one pending notice later,
  but a destination that already received it must not receive a duplicate.
- **Files changed:** This checklist only.
- **Tests and exact results:** PASS — master Off produced no console notice or
  user-visible toast. Master On with the toast child Off produced one console
  notice and no toast. Enabling the child produced one pending toast without a
  second console line. A fresh both-output activation produced one new console
  notice and one new toast.
- **Runtime evidence:** Both current BetterDiscord logs contain the
  console-only notice at `18:13:01` UTC and exactly one further notice for the
  fresh both-output activation at `18:14:29` UTC. The user confirmed the toast
  outcomes. While the master was Off, detailed diagnostics stopped even though
  ordinary `Cached image` activity continued.
- **Failures or blockers:** None for Debug linking, output routing, pending
  delivery, or activation de-duplication. Updater and clipboard checks remain.
- **Commit:** Debug-output runtime-evidence checkpoint
  c0e19440ee45c7355308320c706e48d4df298217.
- **Exact next action:** Superseded by the updater result below.

### 2026-07-27 — Force-independent updater runtime check

- **Completed:** Ran **Check for update now!** once with **Force legacy media
  fetching** Off and again with it On.
- **Decisions:** Keep update checking outside the media transport selector. The
  force-setting activation notice is independent from the updater request.
- **Files changed:** This checklist only.
- **Tests and exact results:** PASS — both manual checks fetched the maintained
  branch plugin URL and returned `200 OK`. Neither request received a media
  request ID or appeared in detailed media-network diagnostics.
- **Runtime evidence:** Both current BetterDiscord logs show the force-Off
  request at `18:16:36` UTC and the force-On request at `18:17:18` UTC. The
  legacy-routing notice at `18:17:15` UTC records the force activation, not the
  updater route.
- **Failures or blockers:** None for updater isolation or force independence.
  Local and remote clipboard checks remain.
- **Commit:** Updater runtime-evidence checkpoint
  a74d1639f6cb3b9875305f8338723c3ed561f4c0.
- **Exact next action:** Record and push this evidence, then run local `blob:`
  clipboard copying with media force Off and On.

### 2026-07-27 — Clipboard runtime defect and approved replacement

- **Completed:** Reproduced the missing Logger clipboard action in the Logger
  viewer and traced current Discord context-menu callbacks for the saved
  deleted/restored image.
- **Decisions:** Keep the plugin self-contained. Leave ordinary Discord
  messages on Discord's own native action; replace that native action only for
  deleted/restored Logger records, and add one Logger-owned **Copy media**
  action in the viewer. Both paths will share the existing
  local-blob/remote-network split. The current Discord bridge has no raw video
  clipboard writer, so unsupported video/file targets retain native link/save
  behavior rather than creating temporary files.
- **Files changed:** This checklist only at this planning checkpoint.
- **Tests and exact results:** FAIL as expected — the viewer had no image copy
  action. The visible live-chat action was Discord's own action, while Logger's
  old `image-context` handler was not reached.
- **Runtime evidence:** `MessageLoggerClipboardTrace` was enabled and the user
  opened both menus. Its report contains only the startup header; neither
  `image-context` nor the helper's message hook received the image-menu event.
  The screenshots separately show Discord's native action and the viewer's
  missing action.
- **Failures or blockers:** Clipboard implementation and deterministic tests
  are required before the two remaining `RT-26` clipboard rows can run.
- **Commit:** Checklist-plan commit
  afdce2fb18932fbf5690c9c5e45deab89d3e6a58; exact-plan checkpoint
  d8099145810a224cb878231019db4eadffd89aba.
- **Exact next action:** Commit and record this approved plan, implement the
  shared clipboard reader plus the two scoped menu paths, run the full suite,
  audit edge cases, then sync live for the two remaining runtime checks.

### 2026-07-27 — Clipboard replacement implemented and audited

- **Completed:** Removed the obsolete `image-context` patch; added one shared,
  record-owned image byte reader; replaced Discord's existing copy action only
  for deleted/restored live records; and added one **Copy media** action to the
  Logger viewer. Ordinary messages remain Discord-owned.
- **Decisions:** Keep the plugin self-contained. Local `blob:` and image `data:`
  sources use renderer `fetch()`, remote images use direct
  `BdApi.Net.fetch()`, and both remain independent from media routing and its
  force switch. Frozen React menu props are handled by cloning the existing
  item instead of adding a duplicate. Videos and non-image files retain
  link/save behavior because Discord exposes no safe raw-video byte writer.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/clipboard.test.js`,
  `tests/source-contracts.test.js`, `docs/tests.md`, and this checklist.
- **Tests and exact results:** PASS — focused clipboard/source coverage passed
  `68/68`; the full `npm test` suite passed `386/386`, including syntax
  validation. Independent final review found no remaining concrete blocker.
- **Runtime evidence:** The user's screenshots prove the real Logger
  `message` context hook is active and show the missing viewer action that this
  change repairs. Source/live SHA-256 now both equal
  `5683ea4cfb21dcb59959a290c57fa7dbce6cdcb8f79aed82c1e587d08ba0ff20`;
  the `18:50:20-18:50:22` UTC log segment shows a clean hot reload. The
  temporary clipboard trace source, live symlink, and generated report are
  removed.
- **Failures or blockers:** No static or live-load blocker. The local-blob and
  remote-image clipboard rows require user interaction.
- **Commit:** Implementation commit
  db781e1c77f9257122ad469405d8bab09f8cdb58.
- **Exact next action:** Commit and push this live-sync evidence, then give the
  user the two clipboard tests. If both pass, amend the built-in changelog,
  rerun the full suite, resync, and publish the final checkpoint.

### 2026-07-27 — Clipboard test-build publication

- **Completed:** Pushed the validated clipboard implementation, regression
  coverage, official test documentation, checklist checkpoint, and clean
  live-sync evidence to `origin/fix/native-media-networking`.
- **Decisions:** Publish only the current feature branch. Do not open a pull
  request or merge, switch, or update `develop` or `main`.
- **Files changed:** No product or live file changed during publication.
- **Tests and exact results:** The published product tree retains the focused
  `68/68` and full `386/386` passes plus syntax, diff, and Markdown checks.
- **Runtime evidence:** Source/live SHA-256 both equal
  `5683ea4cfb21dcb59959a290c57fa7dbce6cdcb8f79aed82c1e587d08ba0ff20`.
  Local `HEAD`, `origin/fix/native-media-networking`, and `git ls-remote`
  matched fdf1eec89d739b0f5f23774cbacd9fa72b5ba415 immediately after the
  test-build push.
- **Failures or blockers:** Only the user's two clipboard checks remain before
  the newly authorized changelog amendment and final resync/publication.
- **Commit:** Clipboard live-sync evidence commit
  fdf1eec89d739b0f5f23774cbacd9fa72b5ba415.
- **Exact next action:** Ask the user to test deleted/restored live
  **Copy image** and Logger-viewer **Copy media**. On confirmation, amend the
  built-in changelog, rerun all tests, resync, and push the final checkpoint.

### 2026-07-27 — Clipboard runtime follow-up and disable-cleanup plan

- **Completed:** Audited the user's live static-image, GIF, cache-scope, toast,
  and plugin-disable results before making another product change.
- **Decisions:** Use Logger's notification router for one green success toast
  after a Logger-owned clipboard write. Keep `copyImage` for supported static
  images and use Discord's verified native `copyFile(localPath)` bridge for a
  cached GIF or another standard cached image for which Discord supplies no
  native image action. Show or replace clipboard actions only while **Cache
  media locally** is On and the exact standard image file exists locally;
  exclude placeholders, remote-only media, videos, and files admitted only by
  **Cache all attachment types**. If the target belongs to a Logger-restored
  deleted message but that gate fails, remove Discord's native **Copy image**
  item as well; ordinary live Discord messages remain untouched. On plugin
  stop, remove only Logger-owned restored rows, structural clones, tints, and
  controls while preserving saved records, cached files, and Discord-owned
  messages.
- **Files changed:** This checklist only at this planning checkpoint.
- **Tests and exact results:** PASS — the clean pre-change `npm test` baseline
  passed `386/386`, including syntax validation.
- **Runtime evidence:** Static image copy works in both Logger surfaces. GIF
  media is cached, but the mounted menu has no native copy action and the
  viewer's `copyImage` call silently produces no usable clipboard content.
  Discord's current macOS bridge implements `copyFile(localPath)` with a
  `public.file-url` clipboard entry. Disabling Logger also leaves previously
  restored mounts visible because `stop()` unpatches without evicting them.
- **Failures or blockers:** Three product gaps are confirmed: no success toast,
  no working GIF/file clipboard path or cache-only menu gate, and incomplete
  live-presentation teardown on plugin disable.
- **Commit:** Checklist-plan commit
  49510011be628cee3225a2c1e63c50b4656436fd; restored-native-action
  clarification c7fb361ea5d6d3db835627933e551e158a5a5da7.
- **Exact next action:** Commit this plan, record its exact hash, then implement
  both bounded fixes with focused regressions and the full test suite before
  any live sync.

### 2026-07-27 — Deferred provisional-media retention contract

- **Completed:** Recorded the required post-networking Anti-Nuke and Ghost-Ping
  pre-cache lifecycle; no retention code was changed in this networking stage.
- **Decisions:** Track pre-cached files as provisional until an actual saved
  record references them. Retain only the newest Anti-Nuke provisional
  attachments allowed by the configured Anti-Nuke attachment cap. Add separate
  configurable maximum ages for Anti-Nuke and Ghost-Ping candidates, then run
  bounded automatic cleanup so expired, over-limit, rejected, and unconfirmed
  orphan files are deleted. Promotion to a real Logger record protects the
  referenced file from provisional cleanup. **Delete cached media with log
  records** remains a separate preference for removing media alongside real
  records and must never disable provisional cleanup.
- **Files changed:** This checklist only.
- **Tests and exact results:** Documentation-only checkpoint; implementation
  tests are deferred with the separate retention stage.
- **Runtime evidence:** The user's cache directory growth plus the prior source
  audit confirm provisional files currently have no age/count cleanup.
- **Failures or blockers:** Defaults, bounds, and the exact meaning of an age
  value of `0` still require an implementation plan before that later stage.
- **Commit:** Retention-contract commit
  d492cbea2cdea589eb6fc00c08e109dba2723915.
- **Exact next action:** Finish networking/clipboard and live verification
  first. Then design and test the provisional manifest, promotion, age/count
  trimming, reference protection, and startup/periodic maintenance as a
  separate stage.

### 2026-07-27 — Cache-scoped clipboard follow-up completed

- **Completed:** Reworked both Logger clipboard surfaces around exact saved
  media ownership and a physical local-file check. Static restored images reuse
  Discord's native **Copy image** row with Logger's local byte writer; cached
  GIFs and supported images without that native row receive one **Copy media**
  file action. The Logger viewer receives the same cache-scoped action and
  every successful Logger-owned copy now produces one green success toast.
- **Decisions:** Require **Cache media locally** to be On. Limit eligibility to
  Logger's established JPG/JPEG, PNG, GIF, BMP, WebP, AVIF, TIF/TIFF media
  path; **Cache all attachment types** cannot expand this menu. Missing local
  files, placeholders, hidden media, videos, and arbitrary files receive no
  Logger copy action. Remove Discord's native copy row only for an owned
  restored deleted item that fails those gates; ordinary live messages remain
  Discord-owned.
- **Files changed:** `MessageLoggerV2.plugin.js`,
  `tests/clipboard.test.js`, `tests/helpers/plugin-harness.js`, and
  `tests/source-contracts.test.js`.
- **Tests and exact results:** PASS — focused clipboard/source coverage passed
  `72/72`; full `npm test` passed `390/390`; syntax and `git diff --check`
  passed. The first focused draft exposed stale source-contract assertions and
  the final independent review found one menu-reuse duplicate edge. Both were
  corrected and rerun; the exact duplicate reproduction now leaves one Logger
  action.
- **Runtime evidence:** The macOS Discord bridge was verified to expose
  `copyFile(localPath)` for GIF/file clipboard data. User runtime confirmation
  of the rebuilt GIF, cache-off, toast, and disable paths remains pending until
  the combined build is live-synced.
- **Failures or blockers:** Clipboard implementation has no remaining static
  blocker. The plugin-disable cleanup was completed in the following entry.
- **Commit:** Clipboard implementation
  15705f0fdc6a82fbb4c472e3c9ff53ceb3ca8fb4.
- **Exact next action:** Superseded by the completed plugin-disable cleanup
  below.

### 2026-07-27 — Plugin-disable presentation cleanup completed

- **Completed:** `stop()` now captures the currently presented saved deletions
  and clears Logger-owned restored rows, forum/thread/sidebar/browser clones,
  copied controls, tints, adjusted browser height, and open context menus before
  unpatching. Surviving native thread cards are refreshed. Records, indexes,
  cached files, and Discord-owned messages are preserved.
- **Decisions:** Keep cleanup presentation-only and failure-isolated. A failed
  capture or cleanup cannot prevent the remaining shutdown/unpatch sequence.
- **Files changed:** `MessageLoggerV2.plugin.js`, `tests/records.test.js`, and
  `tests/source-contracts.test.js`.
- **Tests and exact results:** PASS — focused cleanup coverage passed `133/133`;
  final pre-documentation `npm test` passed `394/394`; syntax and
  `git diff --check` passed. Independent review passed. Parent review corrected
  two draft issues before the final run: capture was moved inside its own
  fail-safe boundary, and structural roots now remove clones and still dispatch
  the Logger cleanup event.
- **Runtime evidence:** Pending the authorized combined live sync and user
  disable/re-enable check.
- **Failures or blockers:** No static blocker. Discord-owned DOM lifecycle
  behavior still needs the short live check.
- **Commit:** Plugin-disable cleanup implementation
  f312df53c334fe912cc9073d1c6f5ce6e78bb102.
- **Exact next action:** Commit the updated test/docs contract, rerun the full
  suite and final audit, then sync and push the combined build.

### 2026-07-27 — Combined build final pre-live audit

- **Completed:** Updated the official automated/live matrices for the
  cache-scoped clipboard and plugin-disable cleanup. Added the deferred
  provisional-media rule to `TODO.md`: age/limit cleanup remains active
  regardless of **Delete cached files with log records** because that switch is
  scoped only to media removed with real saved records.
- **Decisions:** Keep version `2.8.2.9` and the built-in changelog unchanged
  until the user confirms clipboard runtime behavior. Do not implement
  provisional retention on this networking branch.
- **Files changed:** `NETWORKING-OVERHAUL-CHECKLIST.md`, `TODO.md`,
  `docs/tests.md`, and `tests/source-contracts.test.js`.
- **Tests and exact results:** PASS — final `npm test` passed `394/394`;
  `git diff --check` passed; `cmark` parsed the checklist, test matrix, and
  TODO successfully. The source-contract-focused run passed `64/64`.
- **Runtime evidence:** No trace/probe/clipboard helper is linked in the live
  BetterDiscord plugins directory. Repository SHA-256 is
  `ac4cacb705b54bfcd8ddff7a239f9fefed12bea9ac80fdf116a868b3e7faa379`;
  the older live SHA-256 remains
  `5683ea4cfb21dcb59959a290c57fa7dbce6cdcb8f79aed82c1e587d08ba0ff20`
  until the authorized replacement.
- **Failures or blockers:** No automated or static blocker. The remaining
  checkboxes are deliberately Discord runtime checks that require the combined
  live build.
- **Commit:** Documentation/test-contract checkpoint
  73ec42e5ce7cf8a201f8b0bfaf33afb03237026b.
- **Exact next action:** Commit this audit note, live-sync only
  `MessageLoggerV2.plugin.js`, verify hash/hot reload, record the evidence, push
  the feature branch, and give the user the short runtime matrix.

### 2026-07-27 — Combined clipboard/disable live sync

- **Completed:** Copied only the validated `MessageLoggerV2.plugin.js` into the
  live BetterDiscord plugins directory without relaunching Discord.
- **Decisions:** Keep version `2.8.2.9` and the built-in changelog unchanged
  until the user confirms the clipboard paths.
- **Files changed:** Live plugin copy plus this checklist evidence only.
- **Tests and exact results:** The exact pre-sync tree passed `npm test`
  `394/394`, `git diff --check`, and all three `cmark` parses.
- **Runtime evidence:** Sync began at `2026-07-26 19:48:52 UTC`. Repository and
  live SHA-256 both equal
  `ac4cacb705b54bfcd8ddff7a239f9fefed12bea9ac80fdf116a868b3e7faa379`.
  Logs at `19:48:53-19:48:56` show cleanup, patch removal, UI refresh,
  reinitialization, patch application, and final UI refresh without a matching
  Logger error. No MessageLogger trace/probe/clipboard helper is linked.
- **Failures or blockers:** No sync blocker. Clipboard and presentation
  behavior now need the short user-driven Discord checks.
- **Commit:** Live-sync evidence commit
  e2ef2424bc586d6d54803f2813c5e3adc7b4c23e.
- **Exact next action:** Commit this live evidence, record its exact hash, push
  the feature branch, verify refs, and hand the runtime matrix to the user.

### 2026-07-27 — Combined checkpoint publication

- **Completed:** Pushed `fix/native-media-networking` to its existing origin
  branch after the authorized live sync.
- **Decisions:** Do not merge into `develop` or `main`. Do not amend version or
  changelog until clipboard runtime confirmation.
- **Files changed:** This final publication note only.
- **Tests and exact results:** Publication reused the exact live-synced tree
  that passed `394/394`; no product file changed after that run.
- **Runtime evidence:** Local `HEAD`, the local
  `origin/fix/native-media-networking` tracking ref, and direct `git ls-remote`
  all matched 4d8a2e732c7e905adc17ca3ef465a49601fd644c after push.
- **Failures or blockers:** None in publication. Only the short user-driven
  clipboard and disable/re-enable behavior checks remain.
- **Commit:** Published combined checkpoint
  4d8a2e732c7e905adc17ca3ef465a49601fd644c.
- **Exact next action:** Give the user the short runtime matrix, record the
  results, then update the built-in changelog only if clipboard behavior is
  confirmed.

### 2026-07-27 — Static clipboard binary-read runtime defect

- **Completed:** Inspected the current `debug.log`, console export, physical
  cached file, plugin call site, and both supported BetterDiscord host
  implementations before changing code.
- **Decisions:** Make the smallest host-compatible fix: explicitly request
  binary mode from the BetterDiscord filesystem shim and add a regression that
  reproduces its UTF-8-by-default behavior. Keep GIF `copyFile`, eligibility
  gates, version, and changelog unchanged.
- **Files changed:** This checklist only at the diagnostic checkpoint.
- **Tests and exact results:** Clean pre-fix `npm test` baseline passed
  `394/394`.
- **Runtime evidence:** At `2026-07-26 19:51:37 UTC`, Logger reported
  `Media clipboard copy failed: Clipboard media file was empty` from
  `copyMediaToClipboard`. The selected PNG physically exists and is 724,824
  bytes. Both BetterDiscord `develop` and `upstream-development` implement
  renderer `readFileSync(path)` through a shim whose omitted option defaults to
  UTF-8 text; Logger expected binary bytes and rejected that string.
- **Failures or blockers:** Static image copy is affected. GIF file copy does
  not read the file bytes and is outside this defect.
- **Commit:** Diagnostic checkpoint
  4ce9cf97e180d28d9842355959687bccb2a61924.
- **Exact next action:** Commit this diagnosis, implement the explicit binary
  read plus focused regression, then run full validation before live sync.

### 2026-07-27 — Static clipboard binary-read fix completed

- **Completed:** Static image copy now calls the BetterDiscord filesystem shim
  with explicit binary mode. The focused mock reproduces the real host
  behavior: omitted mode returns text, while explicit `null` returns binary
  bytes. GIF continues using `copyFile` without reading or decoding the file.
- **Decisions:** Keep the change limited to the cached static-image clipboard
  reader. Preserve every media eligibility gate, success/error toast, version,
  and changelog.
- **Files changed:** `MessageLoggerV2.plugin.js`,
  `tests/clipboard.test.js`, and `tests/source-contracts.test.js`.
- **Tests and exact results:** PASS — focused clipboard/source coverage passed
  `73/73`; final `npm test` passed `394/394`; syntax and
  `git diff --check` passed. The first full run exposed one stale source
  assertion that still required the broken one-argument read; it was corrected
  to require explicit binary mode and the full suite was rerun successfully.
- **Runtime evidence:** Pending the automatic live sync and user repeat of the
  static image copy.
- **Failures or blockers:** No static or automated blocker remains.
- **Commit:** Binary-read implementation
  a26f05c1cfcf15ec39a3d44e71142d0452d04d87.
- **Exact next action:** Commit this checklist evidence, sync only the plugin
  file, verify hash/hot reload, push the branch, and ask the user to repeat the
  static copy.

### 2026-07-27 — Static clipboard binary-read live sync

- **Completed:** Copied only the validated plugin file into the live
  BetterDiscord directory without relaunching Discord.
- **Decisions:** Keep version/changelog unchanged until the user confirms the
  repaired clipboard path.
- **Files changed:** Live plugin copy plus this checklist evidence only.
- **Tests and exact results:** The exact synced product tree passed focused
  coverage `73/73`, full `npm test` `394/394`, syntax, and
  `git diff --check`.
- **Runtime evidence:** Sync began at `2026-07-26 19:56:22 UTC`. Repository and
  live SHA-256 both equal
  `83f47ce110f1d179a36e1d6db839dfbb75f304a033e8d8d8eb50e08a9e055a4c`.
  Logs at `19:56:23-19:56:24` show cleanup, patch removal, reinitialization,
  patch application, and UI refresh without a new matching Logger error. The
  visible clipboard error at `19:54:41` predates this sync. No relevant trace
  helper is linked.
- **Failures or blockers:** No sync blocker. Static image copy now needs the
  user repeat.
- **Commit:** Live-sync evidence commit
  7cc64a0877d46384551088f9691d14f92b399c00.
- **Exact next action:** Commit this evidence, record its hash, push and verify
  refs, then ask the user to retry the same cached static image.

### 2026-07-27 — Static clipboard binary-read publication

- **Completed:** Pushed the validated and live-synced correction to the
  existing feature branch.
- **Decisions:** Keep `develop`, `main`, version, and changelog untouched until
  runtime confirmation.
- **Files changed:** This publication note only.
- **Tests and exact results:** Publication reused the synced product tree that
  passed focused `73/73` and full `394/394`.
- **Runtime evidence:** Local `HEAD`, the tracking ref, and direct remote ref
  all matched fb514813a9c8851f7c5ff69153c7e1678c2467d4 after push.
- **Failures or blockers:** None in publication.
- **Commit:** Published binary-read checkpoint
  fb514813a9c8851f7c5ff69153c7e1678c2467d4.
- **Exact next action:** Ask the user to retry static copy, then inspect the
  current logs before marking the clipboard path confirmed.

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
