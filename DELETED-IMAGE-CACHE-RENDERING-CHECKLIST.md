# Deleted Image Cache Rendering Checklist

> Tracked working checklist for a focused change on `develop`.
> Keep it in the repository root while implementation and validation are in
> progress, include its current evidence in every user-confirmed stage commit,
> and move it to `docs/archive/checklists/` in the final accepted stage.

## How to use this file

This file is both the implementation checklist and the handoff record.

- [ ] A new session must read this complete file before re-scanning source or
      beginning implementation.
- [ ] Tick an item only after its evidence exists.
- [ ] Record commands, results, changed files, failures, and runtime findings.
- [ ] Update **Exact next action** after every material stage.
- [ ] Refresh the repository snapshot, session reference, blockers, and exact
      next action before handing the work to another session.
- [ ] Keep plugin implementation, tests, and live validation separate.
- [ ] Do not mark the work complete until the final automated and live gates pass.

## Living handoff snapshot

- **Last updated:** 2026-08-17
- **Repository:**
  `$HOME/Apps/Dev/BD/BD-Plugins/MessageLoggerV2-Remake`
- **Root Codex session ID:**
  `01a00d42-4986-7971-94de-11f09f6630d1`
- **Root rollout record:**
  `$HOME/.codex/sessions/2026/08/17/rollout-2026-08-17T11-07-23-01a00d42-4986-7971-94de-11f09f6630d1.jsonl`
- **Working branch:** `develop`
- **Verified HEAD:** `131c928f2c8b5c73e2d28efc69699eb9d6c87ca9`
- **Verified worktree:** tracking `origin/develop`; Stage 2 currently modifies
  `MessageLoggerV2.plugin.js`, `tests/media.test.js`, and
  `tests/records.test.js`, with this checklist still untracked until the first
  user-confirmed stage commit.
- **Baseline:** `npm test` passed `471/471` before this checklist was created.
- **Checklist verification:** the Stage 2 parent rerun of `npm test` passes
  `476/476`; the checklist new-file whitespace check is clean.
- **Live parity:** the Stage 2 repository and live plugin SHA-256 both equal
  `05b38b9c2403d09cd1a9e6deb9619f3b9f70ac54ffd1964d67c9ab9a451d5f15`.
- **Implementation state:** Stage 1 runtime tracing is complete. Stage 2 URL
  persistence and the read-only attachment descriptor are implemented, locally
  verified, and synced live, pending its focused user test, confirmation, and
  first stage commit.
- **Runtime-trace state:** Stage 1 is complete and cleaned up. Removing the exact
  live symlink auto-unloaded the helper and produced a final `stop` report; the
  symlink, report, and ignored helper were then removed.
- **Current gate:** The user confirmed Stage 2 after its automated and live
  gates passed. Create and verify the four-file Stage 2 commit, then begin Stage
  3 mounted and Logger rendering work.
- **Checklist state:** include this file in every user-confirmed stage commit;
  archive it only after implementation, validation, and user acceptance are
  complete.
- **Change-control state:** the user authorized one implementation commit after
  each stage passes its tests and the user explicitly confirms that stage.
  Version bumps, changelog edits, pushes, merges, and releases remain
  unauthorized.

### Exact next action

Stage only `MessageLoggerV2.plugin.js`, `tests/media.test.js`,
`tests/records.test.js`, and this checklist; create and verify the Stage 2
commit. Only after that commit is verified, begin Stage 3 mounted and Logger
rendering work.

### Resume procedure

1. Read the repository `AGENTS.md` and this complete checklist.
2. Source `~/.zshrc`; confirm `/usr/local/bin/git` is selected.
3. Confirm repository path, branch, HEAD, status, and live-plugin hash.
4. Preserve unrelated user changes; do not reset, clean, switch, merge, or push.
5. Compare the checkout with this snapshot and record drift.
6. Continue from **Exact next action** and the first incomplete stage.
7. Update this file after each implementation, test, or live-runtime stage.

### Session reconstruction references

- The root session ID is
  `01a00d42-4986-7971-94de-11f09f6630d1`.
- Its exact rollout is
  `$HOME/.codex/sessions/2026/08/17/rollout-2026-08-17T11-07-23-01a00d42-4986-7971-94de-11f09f6630d1.jsonl`.
- This checklist is the self-contained authority for continuation. Read it
  first; consult the rollout only when the reasoning behind an already-recorded
  decision or runtime observation is needed.
- The completed read-only source, cache-toggle, external-open, runtime-evidence,
  and BetterDiscord fork/upstream audits are already integrated below. Do not
  repeat them unless the verified checkout, live plugin, BetterDiscord host, or
  Discord runtime has materially drifted.
- Stage 1 runtime evidence and cleanup are complete. Reuse the recorded result
  below; do not repeat the trace unless the Discord/BetterDiscord media runtime
  materially changes.
- On resume, verify actual branch, HEAD, status, tests, and repo/live hash
  rather than assuming this snapshot is still current. Record any drift here
  before proceeding.

## Plan authority

The user's latest instruction and the **Approved focused contract** below control
this work. A later explicit user instruction supersedes this checklist and must
be recorded before implementation continues.

## Current status

- [x] Current Blob, saved-URL, Logger-viewer, and restored-message paths audited.
- [x] Cache Off/On transition behavior audited.
- [x] Local BetterDiscord `develop` compared with upstream for the relevant
      Webpack/Patcher APIs; no fork-only dependency was found.
- [x] Focused product contract recorded.
- [x] Focused automated and live validation planned.
- [x] Every current Logger-owned saved-attachment mount surface mapped.
- [x] Setting-dependent remote-first versus local-only contract recorded.
- [x] Native viewer field/action behavior traced in the live runtime.
- [ ] Plugin implementation completed.
- [ ] Deterministic regression coverage completed.
- [ ] Full automated gate completed.
- [ ] Focused live gate completed.
- [ ] User acceptance received.

## Confirmed current behavior and defects

- [x] `blob:https://discord.com/...` is an in-memory renderer URL. It is not a
      CDN redirect and cannot be decoded back into the original CDN URL.
- [x] Blob URLs are session-scoped and may be revoked; they must never be saved
      as canonical attachment data or used as an external-browser destination.
- [x] The Logger window can read a local cache file and create a Blob URL for
      display.
- [x] Restored messages mounted into Discord currently receive the saved remote
      attachment URL instead of the Logger's local Blob URL.
- [x] Deletion persistence currently replaces `attachment.url` with
      `attachment.proxy_url`, which loses the captured direct CDN URL.
- [x] Saved deleted records currently contain no persisted Blob URLs.
- [x] The cached Logger click path currently passes the Blob as both the display
      value and the original/open value.
- [x] The native modal adapter currently collapses `url` and `proxyUrl` to the
      same value, so static source cannot prove which field Discord opens
      externally.
- [x] Turning **Cache media locally** Off cancels cache work but does not hide
      saved images that can still load remotely.
- [x] Turning it back On starts the trimmer but does not retry uncached deleted
      images from their saved remote URLs.
- [x] Recently deleted images can appear correct today because their remote
      proxy URL is still live; an older cached record is needed to expose the
      regression reliably.

## Approved focused contract

### Scope

- [x] Apply the master-Off presentation gate to every saved direct attachment
      already surfaced through normal `message.attachments` or existing
      Logger-owned removed-attachment/edit-history presentation.
- [x] Cover every surface that currently mounts those saved attachments: restored
      guild-channel messages, DMs/group DMs, open channel threads, open forum
      post chats, the main Logger window, deleted forum/thread log modals,
      inline removed-attachment history, and media viewers opened from those
      paths.
- [x] Restored forum-list cards, sidebar thread entries, and thread-browser
      cards are text-only today. Keep them visible and unchanged; their opened
      deleted forum/thread log modal is covered above.
- [x] Classify placeholders with the existing image predicate—not a new list:
      current JPG/JPEG, PNG, GIF, BMP, WebP, AVIF, TIF/TIFF images use
      `[image:filename.ext]`; every other direct attachment uses
      `[attachment:filename.ext]`.
- [x] Do not add a new renderer, preview, player, local-file action, MIME map, or
      cache eligibility for video, audio, text, PDF, Components V2 File, or any
      other arbitrary type. Reuse only what Discord/the Logger already renders.
- [x] Stickers, embeds, and Components V2 visual media are not direct attachment
      placeholders and remain outside this presentation change.
- [x] Treat **Cache all attachment types** (`newSaveAllFileTypes`) as a separate
      future issue. Do not change its UI, value, dependencies, cache eligibility,
      download routing, or documented behavior in this work. A narrow
      non-regression assertion is allowed.
- [x] Keep existing cache roots, file naming, limits, cancellation, trimming,
      atomic writes, and no-save behavior.
- [x] Add no new persisted setting and no schema migration.

### Persisted data

- [ ] Preserve the exact captured direct `attachment.url` and
      `attachment.proxy_url` as separate fields whether caching is On or Off.
- [ ] Never persist a Blob URL or local `file:` URL into the saved message.
- [ ] Never invent a direct CDN URL for legacy records that already contain only
      a proxy URL; retain and use the valid value they still have.
- [ ] Keep canonical saved records unchanged while producing detached render
      clones.

### Display policy

| Cache master | Only render locally cached attachments | Saved-attachment presentation on every covered surface |
|---|---|---|
| Off | Either | Native mounted rows omit every saved direct attachment; Logger-owned views render plain `[image:filename.ext]` for current image types or `[attachment:filename.ext]` for every other direct attachment |
| On | Off | Use the existing Discord/Logger remote renderer or attachment card first; where an existing local Blob renderer already exists, use it after remote media-load failure |
| On | Off | If remote loading fails and no existing local renderer can produce a view, omit it from native mounts and show unavailable/classified text only in Logger-owned views |
| On | On | Bypass remote presentation for every direct attachment; use a fresh Blob only for types with an existing local Blob renderer and a physical cache file |
| On | On | For types without an existing local renderer, omit the native attachment and show the classified Logger text; background caching may still use stored URLs under existing eligibility rules |

- [ ] **Cache media locally** is the master presentation gate for saved direct
      attachments; Off overrides **Only render locally cached attachments**.
- [ ] With the local-only child Off, do not prefer a Blob merely because a
      cache file exists. The existing remote renderer/card is first and an
      already-supported Blob renderer is the media-load-error fallback.
- [ ] With the local-only child On, bypass CDN/proxy presentation entirely but
      retain both URLs and permit the background cache downloader to use them.
- [ ] Do not treat "Discord can show a remote attachment card" as permission to
      invent local rendering for that file type. If no local renderer exists,
      local-only mode uses native omission and Logger-only classified text.
- [ ] Turning the master Off preserves existing cache files but performs no new
      downloads or writes.
- [ ] Turning the master Off live-refreshes every covered visible surface,
      closes only a Logger-owned open media viewer, and removes/revokes its
      active Blob presentation without touching ordinary Discord media.
- [ ] Changing the local-only child live-refreshes the same surfaces so the
      display order changes immediately.
- [ ] While the master is Off, use literal `[image:filename.ext]` or
      `[attachment:filename.ext]` text in the main Logger and deleted
      forum/thread log views; native mounted Discord rows contain no saved
      direct attachment node or replacement attachment node.
- [ ] Never inject placeholder or classified attachment text into native mounted
      Discord rows, including inline mounted edit-history wrappers. When no
      permitted source renders there, omit the attachment/media node.
- [ ] Native mount rule is fail-closed and source-specific: remote-first mounts
      only a working CDN source or an available Blob fallback; local-only mounts
      only an available Blob; master Off mounts nothing. If the permitted set is
      empty, create no attachment node at all.
- [ ] Prefer `attachment.filename`; otherwise derive only a safe basename from
      the saved URL, then fall back to `unknown file`.
- [ ] While the master is On, keep the existing
      `[Attachment not cached: filename]` wording for permitted-source failures.
- [ ] Blob substitution is render-only and must not mutate the archive.
- [ ] Revoke or release Blob URLs through the existing cache lifecycle.

### Click and external-open policy

| Cache master | Local-only child | Media viewer display | Logger-owned open action |
|---|---|---|---|
| Off | Either | No Logger-owned image viewer | No Logger-owned image action |
| On | Off | CDN first, then cached Blob on display failure | Run a bounded CDN liveness check; open live HTTPS in the default browser, otherwise open the resolved cache path in the default file app |
| On | On | Cached Blob only | Bypass CDN and open the resolved cache path directly in the default file app |

- [ ] Keep display source and external-open destination separate: Blob is an
      in-Discord display source, never the browser destination.
- [ ] In remote-first mode, test the exact preserved direct CDN URL when the
      user invokes **Open in Browser**. Use a legacy proxy URL only when no
      recoverable distinct direct URL exists.
- [ ] Use a bounded native-network one-byte range probe, share only identical
      in-flight probes, and abort stale probes on stop, cache Off, or a
      local-only policy transition.
- [ ] Do not retain a long-lived liveness result: availability and signed URL
      expiry can change between clicks.
- [ ] Open an accepted live HTTP(S) CDN URL with
      `require('electron').shell.openExternal(url)` so the operating system uses
      its configured default browser.
- [ ] If remote liveness fails and the resolved cache file exists, pass the
      platform-native absolute path to
      `require('electron').shell.openPath(resolvedPath)` so macOS, Windows, and
      Linux use the file type's configured default application.
- [ ] In local-only mode, do not probe or open the CDN; re-resolve the physical
      file and open its platform-native absolute path with `shell.openPath()`.
- [ ] If the required local file is absent and no permitted live remote exists,
      show a concise unavailable notice and open nothing.
- [ ] Treat a nonempty `shell.openPath()` result as an error and report a concise
      unavailable/open-failed notice; also handle a rejected or missing shell
      API without throwing from the UI action.
- [ ] Obtain the local path only from the existing cache resolver, require an
      existing physical file, and never construct it from an
      attachment-controlled filename or URL.
- [ ] Do not discover or launch a browser executable for local files. Remote
      HTTP(S) uses the default browser; local cache files use the default file
      application consistently across supported desktop platforms.
- [ ] Never ask the external browser to open a `blob:` URL.
- [ ] Keep any native viewer/action patch limited to Logger-owned restored
      media; do not globally replace Discord's media actions.
- [ ] Do not add or change an external-open action for non-image attachment rows
      as part of this work; retain their current master-On behavior.

### Cache Off to On rehydration

- [ ] On an actual Off to On transition, enumerate canonical records containing
      `delete_data` and de-duplicate ordinary image attachments by cache key.
- [ ] Skip attachments whose local cache file already exists.
- [ ] Try the preserved direct URL first, then a distinct preserved proxy URL.
- [ ] Reuse existing size limits, request de-duplication, abort handling,
      media-write epoch, no-save queueing, and atomic promotion.
- [ ] Refresh mounted/Logger presentation once after the batch settles, not once
      per attachment.
- [ ] If both saved URLs fail and no local file exists, omit the native mounted
      attachment and leave placeholder/classified text only in Logger-owned
      views.
- [ ] Rehydration may use stored remote URLs in the background even while the
      local-only child prevents those URLs from being used for presentation.
- [ ] Do not add an automatic archive-wide startup download in this focused
      change; rehydration is tied to the explicit Off to On transition.

## Behavior that must remain unchanged

- [ ] Ordinary live Discord messages retain Discord's normal rendering and
      media actions.
- [ ] Text-only restored forum cards, sidebar entries, and thread-browser cards
      remain mounted when media caching is Off.
- [ ] Logger text, edits, category indexes, hide/unhide, and purged/nuked records
      retain their existing behavior apart from the approved attachment labels.
- [ ] Cache Off and plugin stop still cancel in-flight work without late writes.
- [ ] **Disable saving data** continues to block physical writes and use the
      existing deferred queue semantics.
- [ ] Maximum cache-file size remains enforced before rehydration fetches.
- [ ] Existing cached files are not deleted merely because the master is Off.
- [ ] Updater and clipboard network transports are not changed.
- [ ] **Cache all attachment types** eligibility/cache behavior remains
      unchanged. Approved non-image changes are presentation-only: master-Off
      Logger labels plus local-only native omission/Logger-only classified text
      where no existing local renderer is available.
- [ ] No version or built-in changelog change is made during the focused fix.

## Expected implementation files

- [x] `MessageLoggerV2.plugin.js`
- [x] `tests/media.test.js`
- [x] `tests/records.test.js` or `tests/persistence.test.js` only if needed to
      lock URL preservation at the appropriate boundary.
- [ ] `tests/live-mount-settings.test.js` only if the shared mount/setting
      contract belongs there.
- [ ] `tests/source-contracts.test.js` only for a meaningful structural
      invariant that behavior tests cannot cover.
- [ ] `docs/tests.md` only if the final runtime matrix needs a lasting update.

Tracked working handoff, included in each confirmed stage commit:

- [x] `DELETED-IMAGE-CACHE-RENDERING-CHECKLIST.md`

Keep disposable runtime helpers and reports under ignored `tmp/`. Only
`MessageLoggerV2.plugin.js` may be synced to the BetterDiscord plugins folder.

## Implementation and testing cadence

Use a staged implementation with focused local validation after each code
stage, but do not require a full user live-test cycle after every internal
stage.

- [x] Stage 1 is the single early user-assisted runtime checkpoint. Complete
      the native-media trace and settle the display/open field contract before
      plugin behavior is edited.
- [ ] Implement Stages 2-5 in bounded increments. After each stage, run its
      directly affected tests and update this handoff before continuing.
- [ ] After each implementation stage, run its focused tests, the bounded
      `npm test` suite, and `git diff --check`; report exact results and wait for
      the user's confirmation before committing.
- [x] Role boundary: the named worker performs bounded implementation only;
      the parent runs every syntax check, focused test, full suite, diff review,
      integration check, and final judgment. Explorers remain read-only and
      provide audits, evidence, or reports only.
- [ ] Commit only that stage's plugin/test/documentation files and this updated
      checklist after the user confirms it. Do not begin the next stage until
      the stage commit is verified.
- [ ] If a focused test exposes a conflict with the approved behavior contract,
      stop and report it instead of changing the contract or tests to force a
      pass.
- [ ] After the integrated implementation, run `npm run check`, every directly
      affected test file, the complete `npm test` suite, and `git diff --check`
      before syncing the plugin live.
- [x] The canonical full-suite command is the existing `npm test` script:
      `node --check MessageLoggerV2.plugin.js && node --test tests/*.test.js`.
- [x] Full-suite test discovery is therefore limited to `*.test.js` entry files
      directly under `tests/`. Do not replace it with a bare `node --test`, and
      do not discover test entries from `tmp/`, the repository root, docs, the
      live plugins folder, or any other directory. Imports of the plugin and
      helpers under `tests/helpers/` remain normal test dependencies, not extra
      test-entry discovery.
- [x] Near the end of every implementation stage, after the parent-owned local
      gates pass, sync only `MessageLoggerV2.plugin.js` live and compare hashes.
      The user then performs that stage's smallest useful focused live check;
      inspect its evidence/logs before requesting confirmation and committing.
- [ ] Keep the complete cross-stage behavior matrix as the single focused Stage
      7 live gate; per-stage checks remain narrow and do not repeat that matrix.
- [ ] If live testing finds a defect, make only the targeted correction, rerun
      its focused tests plus the full local suite and diff check, then resync for
      the affected live case.

## Stage 0 - Baseline and drift gate

- [x] Confirm `develop` and record the current HEAD.
- [x] Confirm the worktree and identify every pre-existing user change.
- [x] Compare repository and live plugin hashes.
- [x] Run `npm test` before plugin behavior changes.
- [x] Stop and report if the baseline fails or an existing documented contract
      conflicts with this plan.

### Stage 0 result

- **Commands/results:** On 2026-08-17, `/usr/local/bin/git` confirmed branch
  `develop`, HEAD `131c928f2c8b5c73e2d28efc69699eb9d6c87ca9`, and upstream
  `origin/develop`. Repository/live plugin SHA-256 remained
  `4240e49193286cc7b99d32a12822150b59fc010bde8aad3deda1550cba7751fc`.
  `npm test` ran the bounded `tests/*.test.js` suite and passed `471/471` with
  zero failures, skips, cancellations, or todos.
- **Drift/user changes:** The only worktree entry was this untracked checklist.
  No tracked or live-plugin drift was present.

## Stage 1 - Narrow native media runtime trace

- [x] Create one disposable helper in `tmp/` and symlink it into the live
      BetterDiscord plugins folder.
- [x] Tell the user the helper name, what to enable/run, and its report path.
- [x] Trace one Logger-owned cached restored image only.
- [x] Record the native item shape with sensitive signed URL data redacted.
- [x] Determine whether `proxyUrl` can remain Blob-backed while `url` is a
      separate external-open destination.
- [x] Capture which value **Open in Browser** actually sends to Electron.
- [x] Verify whether the native route accepts a correctly formed `file:///` URL.
- [x] Prove a Logger-owned viewer/action can be identified and closed/replaced
      without affecting an ordinary Discord media viewer.
- [x] Verify `shell.openExternal(fileURL)` behavior on the current Big Sur
      Discord/Electron runtime.
- [x] Remove the helper, symlink, and report when no longer needed.

### Stage 1 hard stop

If Discord cannot separate Blob display from the open destination through the
native item fields, stop and report the exact evidence before introducing a
custom Logger-owned open action. Do not apply a global Discord action patch.

### Stage 1 result

- **Helper:** `tmp/MessageLoggerNativeMediaTrace.plugin.js`, symlinked to the
  live plugins folder with SHA-256
  `b4701214710ab6519c06fae12ccf679959f32e99579912a4dd4d679c0e19a062`.
  It was removed after the live symlink auto-unloaded it.
- **Helper verification:** `node --check` passed. Focused static/runtime-shape
  checks passed for all referenced helper methods, normal Logger attachment,
  Blob/data URL redaction, startup without unsupported `require('url')`, and
  encoded file paths containing spaces, `#`, `%`, and `?`.
- **Report:** Final label `shell-file`, generated at
  `2026-08-17T03:12:51.924Z`, at
  `$HOME/Library/Application Support/BetterDiscord/plugins/MessageLoggerNativeMediaTrace-report.json`.
  Unlinking the live helper produced a final `stop` report at
  `2026-08-17T03:22:31.521Z`; the report was then removed as planned.
- **Current Logger modal:** The physical cache file existed. Logger rendered it
  through a Blob. Native input set both `url` and `proxyUrl` to that Blob, and
  the modal's rendered image source was the same Blob.
- **Current browser action:** Native **Open in Browser** selected `url` and
  called `window.open(blob:...)`; macOS reported that no application could open
  the Blob URL.
- **Field contract:** A separated probe supplied `url=file:///...` and
  `proxyUrl=blob:...`. The native viewer rendered no image, proving display is
  driven by `url` and that `proxyUrl` cannot carry an independent Blob fallback
  for this route. The browser action also selected `url`.
- **Native `file:///` result:** `window.open(file:///...)` showed Discord's
  leaving/file-link confirmation, but confirming it opened nothing. The native
  action is not a usable local-file fallback on this runtime.
- **Direct Electron result:** A scoped direct
  `require('electron').shell.openExternal(fileURL)` call resolved successfully
  and opened the cached PNG in macOS Preview.
- **Ownership result:** Logger/probe viewers were positively tracked. With an
  ordinary Discord image viewer open, including a repeat with `ImageUtilities`
  disabled, `closeIfLoggerOwned()` returned
  `{closed:false, reason:'non-logger-owner'}` and the viewer remained open.
- **Legacy-record observation:** This target's saved `url` and `proxy_url` were
  already identical signed `media.discordapp.net` values. The original distinct
  direct URL cannot be reconstructed for that old record; preservation must
  happen when new records are saved.
- **Required design consequence:** Keep the native display field on the selected
  remote/Blob render source. Use only a Logger-owned action that calls
  `shell.openExternal()` for an accepted live HTTP(S) URL or `shell.openPath()`
  for a resolved local cache file. Do not patch or replace Discord's global
  **Open in Browser** behavior.

### Stage 1 operator procedure

1. In BetterDiscord **Plugins**, manually enable
   **MessageLoggerNativeMediaTrace**. Enabling it does not arm tracing.
2. In Discord's developer console, run:
   `MessageLoggerNativeMediaTrace.clear(); MessageLoggerNativeMediaTrace.arm(); MessageLoggerNativeMediaTrace.status()`
3. Confirm the returned status has `armed: true` and `loggerAttached: true`. If
   not, stop and report the returned status.
4. Open the MessageLogger window and click one locally cached deleted image that
   currently renders there. In the native viewer, invoke its current **Open in
   Browser** action and note what opens or fails, then close the viewer.
5. Run `MessageLoggerNativeMediaTrace.openSeparatedProbe()`. Confirm it returns
   `ok: true`; after the short scheduled delay, note whether the image renders.
   Invoke **Open in Browser** and note whether the encoded local file opens.
6. Close the probe viewer. Open one ordinary live Discord image and run
   `MessageLoggerNativeMediaTrace.status()`. Confirm `nativeModalOwner` is
   `discord`. If it is not, do not run the close command; report the status.
   Otherwise run `MessageLoggerNativeMediaTrace.closeIfLoggerOwned()`. It must
   return `closed: false` and leave the ordinary viewer open.
7. Close the ordinary viewer and run
   `MessageLoggerNativeMediaTrace.dump("stage1-native-media")`.
8. Manually disable **MessageLoggerNativeMediaTrace** and tell the implementing
   session the three observed results: current browser action, separated-probe
   display/local open, and ordinary-viewer refusal. The session then reads the
   report and records the field contract.

## Stage 2 - Persistence and render descriptor

- [x] Stop replacing direct attachment URLs with proxy URLs when saving a
      deletion.
- [x] Add a narrow helper/descriptor that keeps canonical direct, proxy, local
      path, Blob display, and external-open values distinct.
- [x] Derive a local-open path only from the existing resolved absolute cache
      path and retain its platform-native separators.
- [x] Handle legacy `url === proxy_url` records without guessing lost data.
- [x] Prove render clones do not mutate saved records.

### Stage 2 focused checks

- [x] New deletion retains distinct direct and proxy URLs with cache On.
- [x] New deletion retains distinct direct and proxy URLs with cache Off.
- [x] Blob URLs and derived local-open paths never appear in serialized records.
- [x] Resolved local paths containing spaces, `%`, `#`, and Unicode remain exact
      through the descriptor; Windows paths retain native separators.
- [ ] Stage 4 proves the descriptor's exact resolved path is passed unchanged to
      `shell.openPath()`.

### Stage 2 result

- **Implementation:** Removed the deletion-time `attachment.url` to
  `attachment.proxy_url` overwrite. Added a non-mutating descriptor with exact
  direct/proxy fields, ordered de-duplicated HTTP(S) candidates, safe identity
  and extension discovery, exact existing-resolver path passthrough, and fixed
  separate Blob/display/external-open fields that cannot override canonical
  data or route a Blob externally.
- **Compatibility:** Canonical `proxy_url` wins; mixed-fork `proxyUrl` and
  `proxyURL` remain read-only fallbacks. Equal legacy URL/proxy values remain
  equal and collapse to one candidate without inventing lost data. Extension
  case such as `.PNG` and Windows-native path separators are preserved.
- **Focused parent checks:** `node --check MessageLoggerV2.plugin.js` passed.
  `node --test tests/records.test.js tests/media.test.js` passed `155/155` with
  zero failures, skips, cancellations, or todos.
- **Full parent suite:** `npm test` ran exactly
  `node --check MessageLoggerV2.plugin.js && node --test tests/*.test.js` and
  passed `476/476` with zero failures, skips, cancellations, or todos.
- **Review/checks:** Parent reviewed every changed line and removed one unrelated
  worker edit before validation. An independent read-only Explorer found no
  Stage 2 defect or scope leak. `git diff --check` and the untracked-checklist
  whitespace check are clean.
- **Intentional boundary:** The descriptor has no production caller yet. Stage
  3 consumes it for rendering and Stage 4 consumes it for scoped opening; Stage
  2 deliberately adds no render, network probe, Electron action, setting,
  rehydration, or live-plugin behavior.
- **Live sync:** Repository/live SHA-256 both equal
  `05b38b9c2403d09cd1a9e6deb9619f3b9f70ac54ffd1964d67c9ab9a451d5f15`.
  BetterDiscord hot-reloaded the plugin, removed/reapplied its patches, and
  completed its UI refresh without a new MessageLogger startup error.
- **Focused live save check:** Passed. New deleted message
  `1538754977177149511` saved attachment `1538754976908836985` with a signed
  `https://cdn.discordapp.com/` direct URL and a distinct signed
  `https://media.discordapp.net/` proxy URL. Both retained the `ex`, `is`, and
  `hm` query fields; neither was a Blob/file URL and no local-path field was
  serialized. The cache promotion also completed successfully.
- **Fresh log review:** No new MessageLogger error appeared through the live
  save. One `PersonalPins` dispatch error occurred during hot reload and is
  unrelated to MessageLogger Stage 2.
- **Commit state:** User confirmation received. This checklist snapshot belongs
  in the Stage 2 commit with the three tracked implementation/test files; the
  enclosing commit is verified immediately after creation.

## Stage 3 - Mounted and Logger rendering

- [ ] Make the shared saved-attachment presentation policy master-aware.
- [ ] Apply remote-first display when the local-only child is Off: the existing
      Discord/Logger remote renderer or attachment card first, then a freshly
      resolved cached Blob only where that local renderer already exists.
- [ ] Apply local-only display when the child is On: existing cached Blob
      renderers only, with no remote presentation request for any direct
      attachment.
- [ ] In local-only mode, omit native attachments and show classified Logger
      text for types that have no existing local renderer.
- [ ] Keep restored native rows and Logger-owned renderers aligned with the same
      setting-dependent policy.
- [ ] When cache is Off, omit every saved direct attachment from native mounted
      rows without fetching it.
- [ ] When cache is Off, replace current image types in the main Logger and
      deleted forum/thread log views with literal `[image:filename.ext]` text.
- [ ] In the same Logger views, replace every other direct attachment with
      literal `[attachment:filename.ext]` text.
- [ ] Cover the shared native row path for guild channels, DMs/group DMs, open
      threads, and open forum-post chats.
- [ ] Cover the shared `populateParent()` path for the main Logger and every open
      deleted forum/thread log modal.
- [ ] Add the same master/local-only presentation gates to separate inline
      removed-attachment history without adding new arbitrary-file rendering.
- [ ] Refresh the selected channel, Logger window, all open Logger thread
      modals, and edit-history wrappers after relevant setting/cache changes.
- [ ] Track and close only a currently open Logger-owned media viewer when the
      cache master is turned Off.

### Stage 3 focused checks

- [ ] The complete display-policy table has deterministic coverage.
- [ ] Ordinary live messages are not filtered or Blob-rewritten.
- [ ] Cache-master Off hides already saved attachments without deleting files.
- [ ] Cache-master Off uses no replacement media node in Discord mounts and the
      exact `[image:filename.ext]`/`[attachment:filename.ext]` forms in
      Logger-owned list/log views.
- [ ] Remote-first mode still starts from CDN when a local file already exists.
- [ ] Local-only mode makes no remote presentation request for images or any
      other direct attachment type.
- [ ] Existing remote-only text/PDF/other cards do not gain a new Blob renderer.
- [ ] Object URL cleanup remains bounded across refresh/hot reload.

## Stage 4 - Viewer and Open in Browser

- [ ] Apply the field contract proved in Stage 1.
- [ ] Keep the native modal `url` on the actual remote/Blob render source and
      keep canonical remote/local open data in a separate Logger-owned action;
      do not attempt the failed `url=file`, `proxyUrl=blob` field split.
- [ ] In remote-first mode, probe the preserved direct CDN only when resolving
      the external-open action; share the in-flight probe for duplicate clicks.
- [ ] In remote-first mode, open the live CDN with `shell.openExternal()` or the
      resolved local cache path with `shell.openPath()` when liveness fails.
- [ ] In local-only mode, bypass the probe/CDN and open the resolved local cache
      path directly with `shell.openPath()`.
- [ ] Recheck the cache master, local-only generation, and physical file after
      every awaited probe so stale completions cannot open anything.
- [ ] Keep unavailable/classified text limited to Logger-owned views when neither
      remote nor local media works; native mounted rows omit the media entirely.
- [ ] Confirm no Logger-owned action leaks onto ordinary Discord media.

### Stage 4 focused checks

- [ ] Remote-first, live CDN plus local cache: display CDN; external open uses
      CDN.
- [ ] Remote-first, expired CDN plus local cache: display falls back to Blob;
      external open uses the operating system's default file app.
- [ ] Live CDN without local cache: remote display/open works and caching starts.
- [ ] No usable CDN and no local cache: native mount omits the attachment;
      Logger-owned views show their placeholder/classified text; no broken modal.
- [ ] Local-only plus local cache: display Blob; external open uses the resolved
      local path through the default file app without a CDN request.
- [ ] Local-only without local cache: native mount omits the attachment;
      Logger-owned views show their placeholder/classified text; no CDN
      display/probe/open.

## Stage 5 - Off to On rehydration

- [ ] Trigger only on a real Off to On transition.
- [ ] Scan only deleted records' normal image attachments.
- [ ] De-duplicate work and skip existing files/non-images/out-of-scope media.
- [ ] Try direct URL, then distinct proxy URL.
- [ ] Respect size, cancellation, no-save, epoch, and atomic-write contracts.
- [ ] Refresh once after immediate/deferred completion as appropriate.
- [ ] Confirm Off during the batch cancels without retry or late write.

### Stage 5 focused checks

- [ ] Recent saved URL is re-cached and appears after Off to On.
- [ ] Expired direct URL falls back to a live proxy when available.
- [ ] Both URLs unavailable omits the native attachment and leaves
      placeholder/classified text only in Logger-owned views.
- [ ] Existing local files are not downloaded again.
- [ ] No startup-wide backfill occurs merely because the saved setting is On.

## Stage 6 - Automated verification

- [ ] Cover the master/local-only display matrix for detached render clones and
      prove canonical records retain their direct/proxy URLs.
- [ ] Cover immediate master/child refresh of selected native rows, the main
      Logger, every registered deleted thread modal, and edit-history wrappers.
- [ ] Cover remote display failure to Blob, local-only remote bypass, Blob
      cleanup, and exact master-Off `[image:filename.ext]` versus
      `[attachment:filename.ext]` Logger classification.
- [ ] Prove the label classifier reuses the existing image predicate: current
      JPG/JPEG, PNG, GIF, BMP, WebP, AVIF, TIF/TIFF cases use `[image:...]`,
      while TXT, PDF, video, audio, and other direct files use `[attachment:...]`.
- [ ] Cover missing/unsafe filenames with a safe basename or `unknown file`
      without allowing markup/HTML interpretation.
- [ ] Cover liveness success/failure/timeout, duplicate-click sharing,
      generation cancellation, cross-platform `shell.openExternal()` versus
      `shell.openPath()` routing, nonempty open-path errors, and missing-file
      failure without opening a Blob externally.
- [ ] Lock `newSaveAllFileTypes` eligibility/cache behavior and prove no new
      arbitrary-file renderer, player, or cache route was introduced.
- [ ] Run `npm run check`.
- [ ] Run the directly affected test files during implementation.
- [ ] Add regression tests for every deterministic behavior changed above.
- [ ] Confirm `package.json` still limits full-suite test entry discovery to
      `tests/*.test.js`, with no test entries selected from any other folder.
- [ ] Run `npm test` after the complete implementation and record the exact
      passed/failed/total counts.
- [ ] Run `git diff --check`.
- [ ] Review the final diff for unrelated edits, release metadata, persisted
      Blob/file URLs, and accidental host-specific assumptions.

### Stage 6 result

- **Focused commands/results:** Pending.
- **Full suite:** Pending.
- **Diff check:** Pending.

## Stage 7 - Focused live verification

Use one ordinary text channel, one known older cached image, and one recent live
CDN image for the full behavior matrix. Then perform only a mount/unmount smoke
check in a DM and one open forum-post chat; deterministic tests cover group DMs
and ordinary channel threads that share the same native row path.

- [ ] **Local-only On:** mounted restored row, Logger window, and deleted
      forum/thread log modal render a fresh Blob only; **Open in Browser** opens
      the resolved cache file in the operating system's default app; no CDN
      presentation/probe occurs.
- [ ] **Local-only Off, live CDN:** the same surfaces render the CDN first and
      **Open in Browser** opens the preserved `https://cdn.discordapp.com/` URL.
- [ ] **Local-only Off, expired CDN:** image load falls back to the cached Blob
      and **Open in Browser** falls back to the default app for the resolved
      local cache path.
- [ ] **Live child-toggle round trip:** with the cache master remaining On and
      the same saved image still mounted, switch local-only Off -> On without a
      reload and confirm CDN presentation changes immediately to Blob-only plus
      direct default-app local opening. Switch On -> Off and confirm it immediately
      returns to CDN-first rendering/opening when the URL is live, or to the
      Blob/default-app local fallback when that URL is expired.
- [ ] **Cache Off:** every currently visible native mounted saved-attachment node
      is removed immediately; Logger/main and deleted forum/thread log views show
      `[image:filename.ext]` for a current image and
      `[attachment:filename.ext]` for a representative non-image direct
      attachment; any Logger-owned media viewer closes; cache files remain;
      deleting a new image creates no cache file.
- [ ] **Cache back On:** a prior local image follows the selected child policy;
      a recent uncached deletion is retried from stored URLs; an expired
      no-local image is omitted from native mounts and shows a placeholder only
      in Logger-owned views.
- [ ] **Mount coverage smoke:** repeat the master Off/On presentation refresh in
      one DM and one open forum-post chat. Confirm the forum list/sidebar/browser
      text-only entries remain present.
- [ ] **Hot reload/Cmd+R:** local images receive valid regenerated Blob URLs and
      no stale/revoked Blob remains clickable.
- [ ] Check `debug.log` and optional `console.log` for new Logger errors.

Relevant matrix coverage: focused portions of `RT-09`, `RT-11`, `RT-13`, and
`RT-26`. Shared deterministic coverage plus the DM/forum-post smoke replaces a
full setting matrix in every channel type.

### Stage 7 result

- **Live plugin hash:** Pending.
- **Runtime results:** Pending.
- **Logs:** Pending.

## Stage 8 - Final gate and handoff

- [ ] Re-run `npm test` after any live-found correction.
- [ ] Re-run `git diff --check`.
- [ ] Sync only `MessageLoggerV2.plugin.js` to the live plugins folder.
- [ ] Compare repository/live hashes.
- [ ] Remove all disposable trace helpers, symlinks, and generated reports.
- [ ] Present the exact changed files, automated results, live results, and any
      remaining limitation to the user.
- [ ] Wait for user acceptance before any separately requested commit/push or
      release work.
- [ ] After acceptance, move this checklist from the repository root to
      `docs/archive/checklists/` and include that tracked move in the final
      accepted-stage commit.

## Handoff activity log

### 2026-08-17 - Planning audit and checklist creation

- Confirmed the Blob is render-time state, not a saved or recoverable CDN link.
- Confirmed Logger and restored native messages currently use different media
  source paths.
- Confirmed deletion saving loses the original direct URL by replacing it with
  the proxy URL.
- Confirmed Cache Off/On lacks the requested display gate and archive retry.
- Confirmed relevant BetterDiscord fork/upstream APIs do not differ.
- Recorded a focused image-attachment contract, one required native modal trace,
  deterministic coverage, and the minimum five-part live smoke test.
- Re-ran `npm test`: `471/471` passed. Verified the new checklist has no
  whitespace errors.
- Made no plugin behavior, version, changelog, branch, or live-plugin change.

### 2026-08-17 - Checklist location and commit rule clarified

- Moved the working checklist from `docs/checklists/` to the repository root.
- Recorded that the checklist must remain untracked and must not be committed.
- Kept the final archival move to `docs/archive/checklists/` as the last
  post-acceptance checklist step.

### 2026-08-17 - Rendering priority and mount coverage clarified

- Superseded the earlier local-first assumption.
- Recorded remote-first display and CDN liveness/open behavior when **Only
  render locally cached attachments** is Off.
- Recorded Blob-only display and direct `file:///` opening when that child is
  On; persisted remote URLs and background caching remain active.
- Expanded the master Off live refresh to every current Logger-owned
  saved-attachment surface, including DMs, threads/forum-post chats, all open
  Logger thread modals, and inline removed-attachment history.
- Locked **Cache all attachment types** eligibility/caching and all new
  arbitrary-file rendering outside this implementation as a separate issue.
- Confirmed forum-list, sidebar, and thread-browser cards are text-only and must
  remain visible when the media master is Off.
- Kept Blob URLs display-only; external fallback always uses an encoded local
  file URL.
- Recorded the master-Off surface distinction: native mounts omit saved direct
  attachments, while Logger-owned list/log views show classified text.

### 2026-08-17 - Master-Off attachment labels clarified

- Expanded only the master-Off presentation gate from images to every saved
  direct attachment the existing Discord/Logger paths already surface.
- Kept native restored rows attachment-free while the master is Off.
- Recorded `[image:filename.ext]` for types accepted by the existing image
  predicate and `[attachment:filename.ext]` for every other direct attachment.
- Kept **Cache all attachment types**, arbitrary-file caching, and new
  video/audio/text/PDF preview or local-open support as separate future work.
- Made the live local-only Off -> On -> Off round trip explicit so both the
  renderer source and **Open in Browser** destination are verified without a
  Discord or plugin reload.
- Restricted all unavailable/classified placeholder text to the main Logger and
  Logger-owned deleted forum/thread log views. Native message mounts and inline
  mounted edit-history media omit failed/blocked attachment nodes without text.

### 2026-08-17 - Self-contained session handoff added

- Recorded root session ID
  `01a00d42-4986-7971-94de-11f09f6630d1` and its exact rollout path.
- Re-verified `develop`, full HEAD
  `131c928f2c8b5c73e2d28efc69699eb9d6c87ca9`, worktree state, and repository/live
  plugin hash parity.
- Recorded that the only worktree entry is this untracked checklist; it remains
  excluded from every commit.
- Recorded the unresolved Stage 1 runtime trace as the current gate and the
  exact first action for any continuing session.
- Made the completed read-only audits reusable so a handoff session begins with
  drift verification and the first incomplete stage instead of repeating the
  planning investigation.
- Made no plugin, test, live-plugin, version, changelog, branch, or Git-history
  change.

### 2026-08-17 - Staged validation cadence locked

- Chose one early user-assisted Stage 1 runtime trace, followed by bounded
  implementation stages with focused local tests after each stage.
- Kept live sync behind syntax, focused tests, the full suite, and diff checks;
  the user performs one consolidated focused live matrix afterward.
- Verified the canonical `npm test` command is
  `node --check MessageLoggerV2.plugin.js && node --test tests/*.test.js`.
- Locked full-suite test entry discovery to `tests/*.test.js`; no bare
  `node --test` or test discovery from `tmp/`, the repository root, docs, or the
  live plugins folder is permitted for this work.
- Made no plugin, test, live-plugin, package script, or Git-history change.

### 2026-08-17 - Stage 0 passed and Stage 1 helper installed

- Revalidated `develop`, HEAD/upstream, the clean tracked worktree, and
  repository/live plugin hash parity.
- Ran the bounded full suite before behavior changes: `471/471` passed with no
  failures, skips, cancellations, or todos.
- Created the ignored command-armed
  `tmp/MessageLoggerNativeMediaTrace.plugin.js` helper and installed only its
  verified live symlink. The helper was not enabled or armed for the user.
- Parent-reviewed the helper beyond syntax, including target attachment,
  attachment index zero, probe Blob lifetime, URL redaction, ordinary Discord
  ownership, bounded modal snapshots, external-open pass-through, and cleanup.
- Verified helper SHA-256
  `11309e22aae6ba36bad58de3a3080a8179d3c9172b50d8b0abae4449f73f5643`,
  `node --check`, and focused static/runtime-shape assertions.
- Recorded the exact command-triggered operator procedure and report path.
- Made no MessageLogger source, tracked test, live MessageLogger, version,
  changelog, commit, or branch-history change.

### 2026-08-17 - Stage 1 helper startup compatibility repaired

- The first manual enable failed before tracing because the helper called
  `require('url')`; the live BetterDiscord module polyfill does not expose that
  Node core module and resolved it as the nonexistent filesystem path `/url`.
- Removed only that disposable-helper dependency and replaced
  `pathToFileURL()` with a local absolute-path segment encoder that produces an
  encoded `file:///` URL.
- Verified `node --check`, a mocked helper-start smoke test, and paths containing
  spaces, `#`, `%`, and `?`.
- Reverified that the live symlink resolves to the edited helper and both sides
  have SHA-256
  `b4701214710ab6519c06fae12ccf679959f32e99579912a4dd4d679c0e19a062`.
- Made no MessageLogger source, tracked test, live MessageLogger, version,
  changelog, commit, or branch-history change. Runtime Stage 1 remains pending
  the next manual enable.

### 2026-08-17 - Stage 1 runtime contract completed

- Captured one exact cached deleted image that rendered in the Logger but failed
  in its restored native mount. Its physical cache file existed, while its
  legacy saved direct and proxy URLs were already identical.
- Proved the current Logger modal renders a Blob because both native `url` and
  `proxyUrl` contain that Blob; native **Open in Browser** selects `url`, passes
  the Blob to `window.open()`, and causes the macOS no-handler error.
- Proved Discord cannot use `proxyUrl` as an independent display field: with
  `url=file:///...` and `proxyUrl=blob:...`, the viewer showed **Image failed to
  load**, and its native file-link action opened nothing after confirmation.
- Proved a direct scoped Electron `shell.openExternal(fileURL)` call resolved
  and opened the cached PNG in macOS Preview.
- Proved `closeIfLoggerOwned()` refused an ordinary Discord viewer with
  `{closed:false, reason:'non-logger-owner'}` and left it open. Repeating the
  ownership setup with `ImageUtilities` disabled did not alter that safe result.
- Fired the Stage 1 hard stop: the implementation must retain the actual
  remote/Blob source in the native display field and use a separate,
  Logger-owned open action. No global Discord media action patch is permitted.
- Made no MessageLogger source, tracked test, live MessageLogger, version,
  changelog, commit, or branch-history change.

### 2026-08-17 - Cross-platform open routing superseded local file URLs

- The user accepted opening a local cached file in the operating system's
  configured default file application instead of forcing it into a browser.
- Locked remote HTTP(S) opening to Electron `shell.openExternal()`, which uses
  the configured default browser, and local cache opening to
  `shell.openPath(resolvedPath)`, which uses the file type's default application
  on macOS, Windows, and Linux.
- Confirmed both APIs are exposed through BetterDiscord's plugin
  `require('electron').shell` bridge. The relevant preload/polyfill files are
  byte-identical between the local BetterDiscord `develop` fork and
  `upstream-development`; both build definitions use Electron `36.2.1`.
- Recorded that `openPath()` receives the platform-native path and reports
  failure with a nonempty resolved string. The implementation must handle that
  string, rejected/missing APIs, and missing files without throwing.
- Rejected browser-executable discovery or platform-specific launch commands.
  This preserves one implementation path across the three desktop platforms.
- Kept image rendering as the primary unfinished work: mounted rows and Logger
  viewers still require the planned remote-first/Blob-fallback behavior.

### 2026-08-17 - Stage 1 trace cleanup completed

- The user explicitly authorized unlinking the active trace and continuing into
  implementation.
- Verified the live trace path was a symlink to the exact ignored helper and
  that both sides matched SHA-256
  `b4701214710ab6519c06fae12ccf679959f32e99579912a4dd4d679c0e19a062`.
- Unlinked only the live trace symlink. BetterDiscord auto-unloaded the helper
  and wrote a final `stop` report at `2026-08-17T03:22:31.521Z`.
- Removed the exact generated report and ignored helper after unload. No other
  BetterDiscord plugin or report was removed.
- Reverified `develop`; the only worktree entry remained this untracked
  checklist. No tracked source, tests, live MessageLogger, metadata, commit, or
  branch history changed during cleanup.

### 2026-08-17 - Per-stage confirmation and commit gate added

- The user authorized staged commits only after both Codex and the user confirm
  that the current stage's tests work.
- Locked each stage to: implementation, focused tests, bounded `npm test`, diff
  checks, concise user report, explicit user confirmation, then one verified
  commit before the next stage begins.
- Kept this root checklist untracked and excluded from every commit.
- Kept version, changelog, push, merge, and release work outside the authorized
  stage commits.

### 2026-08-17 - Checklist commit rule superseded

- The user explicitly superseded the earlier exclusion and requested that this
  checklist be committed too.
- Starting with the user-confirmed Stage 2 commit, include the updated root
  checklist alongside that stage's plugin/tests. Continue including its
  evidence in every later stage commit.
- Keep the checklist in the repository root while work is active, then commit
  its move to `docs/archive/checklists/` with the final accepted stage.

### 2026-08-17 - Parent-owned validation boundary confirmed

- The user confirmed that workers perform bounded implementation only.
- The root parent owns all syntax checks, focused tests, full-suite execution,
  diff review, integration, and final conclusions.
- Explorers remain read-only and are used only for audits, checks, evidence,
  and reports.

### 2026-08-17 - Stage 2 implemented and locally verified

- Preserved exact signed direct and proxy attachment URLs in new deletion
  records with caching both Off and On; legacy equal values remain unchanged.
- Added the read-only saved-attachment descriptor without wiring later render,
  open, toggle, or rehydration behavior.
- Parent corrected the bounded implementation, reviewed every changed line,
  and added real attachment-serialization plus mixed-fork alias coverage.
- Parent checks passed: syntax, `155/155` focused tests, `476/476` bounded full
  suite, tracked diff whitespace, and checklist whitespace.
- Independent read-only review found no Stage 2 defect. The user-confirmation
  gate is now active; no Stage 2 file is staged or committed yet.

### 2026-08-17 - Per-stage live-sync gate added and Stage 2 synced

- The user required a live plugin sync near the end of every stage once the
  parent-owned local gates pass, followed by that stage's smallest useful user
  test before confirmation and commit.
- Synced only `MessageLoggerV2.plugin.js`; repository/live SHA-256 now match at
  `05b38b9c2403d09cd1a9e6deb9619f3b9f70ac54ffd1964d67c9ab9a451d5f15`.
- BetterDiscord hot reload removed and reapplied MessageLogger patches and
  completed its UI refresh without a new MessageLogger startup error. Discord
  was not relaunched.
- Current live settings are suitable for the narrow persistence check:
  `cacheAllImages=true`, `ignoreSelf=false`, and `dontSaveData=false`.

### 2026-08-17 - Stage 2 focused live persistence check passed

- The user posted and deleted one new PNG after the verified live sync.
- The new record preserved separate signed `cdn.discordapp.com` direct and
  `media.discordapp.net` proxy URLs, including their signing query fields.
- The saved attachment contained no Blob URL, file URL, or local-path field;
  its pre-cached file promoted to the saved cache successfully.
- Fresh-log review found no new MessageLogger error. Stage 2 now waits only for
  the user's explicit confirmation before its four-file commit.

### 2026-08-17 - Stage 2 accepted for commit

- The user explicitly confirmed Stage 2 after reviewing the focused live-test
  result.
- Authorized commit scope is exactly the plugin, the media and record test
  files, and this checklist. Stage 3 must not begin until that commit is
  created and verified.
