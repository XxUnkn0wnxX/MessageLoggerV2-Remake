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
- **Verified HEAD:** Stage 3 cache-completion commit
  `ca1c127ddda93824c63c8da129c3f1d29d003a03`; `develop` is five commits ahead
  of `origin/develop` and nothing has been pushed.
- **Verified worktree:** clean immediately after `ca1c127`; this checklist is
  now modified to track the forum transition-flicker follow-up. Disposable trace
  work remains ignored under `tmp/`.
- **Baseline:** `npm test` passed `471/471` before this checklist was created.
- **Checklist verification:** the Stage 2 parent rerun of `npm test` passes
  `476/476`; the checklist new-file whitespace check is clean.
- **Live parity:** verified for the forum timing correction. Repository and
  installed plugin SHA-256 both equal
  `32a611291cb964268f79f0cb813f0ba3529f914ca81236b00e928edc6704aba0`.
- **Implementation state:** Stage 1 runtime tracing and Stage 2 persistence are
  complete. Stage 3 now has full-message remount refresh plus one shared
  attachment-presentation order across native mounts, Logger rows, deleted
  thread/forum logs, and inline history: direct CDN, distinct media proxy, then
  existing cached Blob, otherwise the classified placeholder. The archive is
  unchanged. The visible master is now **Render & Cache media** with every Media
  child linked to it. The reopened Stage 3 timing correction now schedules one
  exact, coalesced local-only remount after a confirmed cache promotion or
  write. Its live gate is accepted; forum mounts can show the classified
  placeholder for a moment during an initial image/attachment deletion or a
  **Render & Cache media** Off-to-On transition before the cached Blob replaces
  it. The user accepted the functional result but requested one final
  trace-first Stage 3 follow-up. `refreshCacheOnlyMessage` now resolves its
  detached presentation inside the already scheduled callback, so a same-turn
  pre-cache promotion is observed before the one update is dispatched. Stage 4
  still separately owns external opening. The user confirmed the initial forum
  deletion no longer flickers. A separate master Off-to-On transition lag or
  flicker remains and must be traced after this accepted correction is committed.
- **Runtime-trace state:** The forum-media timing trace captured both requested
  transitions and its live symlink has been removed. Its valid evidence is
  recorded below. The helper itself contained a repeated `idSource` reference
  error and over-captured data URLs into a 229 MB report, so that trace-induced
  settings stall is not attributed to MessageLogger. After the compact evidence
  was integrated, the ignored helper source and generated report were removed.
- **Current gate:** Parent syntax/check passes. The current combined media,
  live-mount-setting, and source-contract suites pass `193/193`. `npm test`
  resolves exactly to `node --check MessageLoggerV2.plugin.js && node --test
  tests/*.test.js` and passes `512/512`; `git diff --check` is clean. Runtime
  evidence proved the target direct CDN URL is live while its media proxy is
  dead, and the saved legacy record contains that proxy in both canonical URL
  fields. The implementation therefore derives the equivalent CDN URL only in
  detached presentation state, fails one candidate at a time, and remounts the
  exact saved message. The committed build passes those gates, but fresh live
  uploads exposed a missing cache-completion refresh in local-only mode. The
  correction now supplies that exact remount after `PROMOTE` or a confirmed
  write. The timing trace proved initial forum deletion computes a placeholder
  clone before pre-cache promotion, dispatches it at `09:08:59.069`, and then
  dispatches the cached Blob at `09:08:59.077`. The Off-to-On handler instead
  completed normally and dispatched the Blob directly. No new MessageLogger
  exception accompanies the accepted build; the repeated runtime exception was
  isolated to the disposable helper. The narrow timing correction and its
  deterministic late-Blob regression now pass every local gate; live sync and
  the focused forum deletion retest passed. The master-toggle transition still
  visibly lags/flickers, but it is not part of the now-accepted stale deletion
  clone correction.
- **Checklist state:** include this file in every user-confirmed stage commit;
  archive it only after implementation, validation, and user acceptance are
  complete.
- **Change-control state:** `ed59642` is the accepted Stage 3 checkpoint. The
  narrow local-cache-completion correction passed its parent and live gates,
  and its follow-up is committed as `ca1c127`. The user requested tracing and a
  final forum-flicker fix before Stage 4; commit that correction only after its
  automated and live gates pass. Version bumps, changelog edits, pushes,
  merges, and releases remain unauthorized.

### Exact next action

Commit the accepted deletion-timing correction (`MessageLoggerV2.plugin.js`,
`tests/media.test.js`, and this checklist) without pushing. Only after that
checkpoint, prepare a new minimal master-toggle trace that does not patch the
high-frequency presentation planner or serialize DOM data URLs. Determine
whether the residual Off-to-On lag is Blob revocation/recreation, image decode,
or the broad cache/UI refresh before changing tracked source again.

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
- [x] The setting currently labelled **Cache media locally** cancels cache work
      when turned Off but does not hide saved images that can still load
      remotely. This is the pre-fix behavior being replaced.
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

- [x] Preserve the exact captured direct `attachment.url` and
      `attachment.proxy_url` as separate fields whether caching is On or Off.
- [x] Never persist a Blob URL or local `file:` URL into the saved message.
- [x] Never invent or persist a replacement canonical direct URL for a legacy
      proxy-only record. A detached presentation descriptor may derive the
      equivalent `cdn.discordapp.com` attachment candidate from a saved
      `media.discordapp.net` attachment URL while retaining the saved value.
- [x] Keep canonical saved records unchanged while producing detached render
      clones.

### Display policy

| Cache master | Only render locally cached attachments | Saved-attachment presentation on every covered surface |
|---|---|---|
| Off | Either | Never render or fetch saved direct attachment media; native mounted rows and Logger-owned views show plain `[image:filename.ext]` for current image types or `[attachment:filename.ext]` for every other direct attachment |
| On | Off | Use the direct/derived Discord CDN candidate first, then a distinct saved media proxy; where an existing local Blob renderer already exists, use it only after both remote candidates fail |
| On | Off | If CDN and proxy loading fail and no existing local renderer can produce a view, replace the failed attachment with its classified text placeholder on native mounts and Logger-owned views |
| On | On | Bypass remote presentation for every direct attachment; use a fresh Blob only for types with an existing local Blob renderer and a physical cache file |
| On | On | When no existing supported local Blob can be created, replace the attachment with its classified text placeholder on native mounts and Logger-owned views; the existing new-message cache flow and the explicit Stage 5 Off-to-On hydration pass may still use stored URLs |

- [x] Rename the visible master setting to **Render & Cache media**. Keep its
      internal `cacheAllImages` id unchanged so no setting/schema migration is
      required.
- [x] **Render & Cache media** controls both saved-media presentation and cache
      work; Off overrides **Only render locally cached attachments**.
- [x] Keep the linked setting note concise while preserving its existing
      enabled/disabled and no-save guidance: On renders saved media, caches
      eligible files, and retries saved URLs after a real Off-to-On transition;
      Off shows attachment placeholders while child values remain saved.
- [x] When the master is Off, visibly disable/grey every other control in the
      Media settings group while preserving each stored child value. Re-enable
      them immediately when the master returns On.
- [x] With the local-only child Off, do not prefer a Blob merely because a
      cache file exists. Direct/derived CDN is first, a distinct proxy is
      second, and an already-supported Blob renderer is the final display
      fallback.
- [x] With the local-only child On, bypass CDN/proxy presentation entirely but
      retain both URLs. The explicit Stage 5 Off-to-On hydration pass may use
      them in the background without presenting them remotely.
- [x] Do not treat "Discord can show a remote attachment card" as permission to
      invent local rendering for that file type. If no local renderer exists,
      local-only mode uses classified placeholder text instead.
- [x] Turning the master Off preserves existing cache files but performs no new
      downloads or writes.
- [ ] Turning the master Off live-refreshes every covered visible surface,
      closes only a Logger-owned open media viewer, and removes/revokes its
      active Blob presentation without touching ordinary Discord media.
- [ ] Changing the local-only child live-refreshes the same surfaces so the
      display order changes immediately.
- [x] While the master is Off, use literal `[image:filename.ext]` or
      `[attachment:filename.ext]` text in native mounted saved messages, the
      main Logger, and deleted forum/thread log views. No attachment/media node
      is created and no saved media source is requested.
- [x] Native mount rule is fail-closed and source-specific: remote-first mounts
      CDN, then a distinct proxy, then an available existing Blob fallback;
      local-only mounts only an available existing Blob; master Off mounts no
      media. If the permitted set is empty, render the classified text label
      instead of an attachment node.
- [x] Prefer `attachment.filename`; otherwise derive only a safe basename from
      the saved URL, then fall back to `unknown file`.
- [x] Use the same exact `[image:filename.ext]` or
      `[attachment:filename.ext]` label whenever the selected master/child
      policy has no usable source; do not leave an empty message shell.
- [x] Blob substitution is render-only and must not mutate the archive.
- [x] Revoke or release Blob URLs through the existing cache lifecycle.

### Click and external-open policy

| Cache master | Local-only child | Media viewer display | Logger-owned open action |
|---|---|---|---|
| Off | Either | Placeholder only; no Logger-owned media viewer | Probe/open only the retained CDN URL in the default browser; if unavailable, warn and open nothing |
| On | Off | CDN first, then distinct proxy, then an already-cached Blob on display failure; otherwise placeholder | Probe CDN first, then a distinct proxy; open the live HTTPS candidate in the default browser, otherwise open an existing resolved cache path in the default file app; warn if none exists |
| On | On | Existing cached Blob only; otherwise placeholder | Bypass CDN and open the existing resolved cache path directly in the default file app; warn if absent |

- [ ] Keep display source and external-open destination separate: Blob is an
      in-Discord display source, never the browser destination.
- [ ] In remote-first mode, test the exact preserved or presentation-derived
      direct CDN URL when the user invokes **Open in Browser**, then test a
      distinct saved proxy before falling back to an existing local file.
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
      show a concise warning toast such as **Attachment is no longer
      available.** and open nothing.
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
      `delete_data` and de-duplicate eligible ordinary image attachments by
      cache key.
- [ ] Skip attachments whose resolved local cache file already exists.
- [ ] Try the preserved direct URL first, then a distinct preserved proxy URL.
- [ ] Reuse existing eligibility, size limits, request de-duplication, abort
      handling, media-write epoch, no-save queueing, and atomic promotion.
- [ ] Refresh mounted/Logger presentation once after the batch settles, not once
      per attachment.
- [ ] If both saved URLs fail and no local file exists, use classified
      placeholder text in native mounted messages and Logger-owned views.
- [ ] Rehydration may use stored remote URLs in the background even while the
      local-only child prevents those URLs from being used for presentation.
- [ ] Do not add an automatic archive-wide startup download; rehydration is tied
      only to an explicit real Off to On transition.
- [ ] Keep failed availability state transient. Do not add a persisted
      unavailable tombstone or schema field; a later real Off to On transition
      may retry, while the attachment remains a placeholder whenever no usable
      remote source or local file exists.

## Behavior that must remain unchanged

- [x] Scope boundary: implementation changes are limited to saved direct
      attachment URL preservation, image/attachment presentation, Logger-owned
      media viewing/opening, setting-driven presentation refresh, and source
      liveness/lifecycle behavior required by those paths, plus the explicit
      bounded Off-to-On deleted-image hydration pass.
- [x] Do not require the user to manually retest already-confirmed general
      plugin behavior. The complete automated suite guards unrelated logging,
      persistence, notification, shortcut, forum, Anti-Nuke, settings, and
      recovery contracts; live testing stays limited to the changed
      image/render/cache matrix.
- [ ] Ordinary live Discord messages retain Discord's normal rendering and
      media actions.
- [ ] Text-only restored forum cards, sidebar entries, and thread-browser cards
      remain mounted when media caching is Off.
- [ ] Logger text, edits, category indexes, hide/unhide, and purged/nuked records
      retain their existing behavior apart from the approved attachment labels.
- [ ] Cache Off and plugin stop still cancel in-flight work without late writes.
- [ ] **Disable saving data** continues to block physical writes and use the
      existing deferred queue semantics.
- [ ] Maximum cache-file size remains enforced for both the unchanged
      new-message cache pipeline and Stage 5 hydration fetches.
- [ ] Existing cached files are not deleted merely because the master is Off.
- [ ] Updater and clipboard network transports are not changed.
- [ ] **Cache all attachment types** eligibility/cache behavior remains
      unchanged. Approved non-image changes are presentation-only: master-Off
      labels plus no-source classified text in native and Logger views where no
      existing permitted renderer is available.
- [ ] No version or built-in changelog change is made during the focused fix.

## Expected implementation files

- [x] `MessageLoggerV2.plugin.js`
- [x] `tests/media.test.js`
- [x] `tests/records.test.js` or `tests/persistence.test.js` only if needed to
      lock URL preservation at the appropriate boundary.
- [x] `tests/live-mount-settings.test.js` only if the shared mount/setting
      contract belongs there.
- [x] `tests/source-contracts.test.js` only for a meaningful structural
      invariant that behavior tests cannot cover.
- [x] `docs/help.md` and `docs/settings.md` for the final visible setting label
      and short combined render/cache behavior note.
- [x] `docs/tests.md` only if the final runtime matrix needs a lasting update.

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
- [ ] Implement Stages 2-5 in bounded increments. After each active stage, run its
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
- **Commit state:** Committed and verified as
  `62152b8632860a0d0037c7713314d8f9c3357daa` (`Preserve deleted attachment
  source URLs`). The commit contains exactly the plugin, media tests, record
  tests, and this checklist.

## Stage 3 - Mounted and Logger rendering

### Stage 3 bounded design

- [x] Native guild, DM/group-DM, thread, and forum-post chat mounts share
      `LOAD_MESSAGES_SUCCESS -> reAddDeletedMessages() -> getCacheOnlyMessage()`;
      no channel-type-specific implementation is needed.
- [x] Main Logger rows and deleted forum/thread log modals share
      `populateParent()`; every registered thread-modal refresher must be
      invoked, not only the selected channel's refresher.
- [x] Inline removed-media history is the only separate React consumer; it is
      refreshed by broadcasting `MLV2_FORCE_UPDATE_MESSAGE_CONTENT`.
- [x] Use the Stage 2 descriptor plus the existing `isImage()`/`isVideo()`
      predicates. Do not introduce a MIME/cache-eligibility system or an
      arbitrary-file renderer.
- [x] Native remote failure handling will be a capture-phase media-error path
      scoped to a mounted `chat-messages-<channel>-<message>` row whose exact
      saved record has `delete_data`. It may switch only the matching detached
      attachment clone to the existing cached Blob or its exact classified text
      label; ordinary live Discord media is never rewritten.
- [x] Keep canonical attachment URLs untouched. Remote failure state and Blob
      URLs are session-only presentation state and are cleared on setting
      transitions/stop through the existing cache lifecycle.
- [x] ImageUtilities 5.6.7 is enabled. Its current rescaling settings are Off,
      it does not patch media `onError` or Blob rendering, and it need not be
      disabled for mounted/Logger Blob tests. It does modify the native viewer
      and media context menus, so use one disabled control only if Stage 4's
      viewer/open action fails; MessageLogger must work in both states.

- [x] Make the shared saved-attachment presentation policy master-aware.
- [x] Apply remote-first display when the local-only child is Off: the existing
      Discord/Logger remote renderer or attachment card first, then a freshly
      resolved cached Blob only where that local renderer already exists.
- [x] Apply local-only display when the child is On: existing cached Blob
      renderers only, with no remote presentation request for any direct
      attachment.
- [x] In local-only mode, replace native and Logger attachment presentation with
      classified text when no existing local renderer/file is available.
- [x] Keep restored native rows and Logger-owned renderers aligned with the same
      setting-dependent policy.
- [x] When cache is Off, replace every saved direct attachment with classified
      text in native mounted rows without fetching it.
- [x] When cache is Off, replace current image types in the main Logger and
      deleted forum/thread log views with literal `[image:filename.ext]` text.
- [x] In the same Logger views, replace every other direct attachment with
      literal `[attachment:filename.ext]` text.
- [ ] Cover the shared native row path for guild channels, DMs/group DMs, open
      threads, and open forum-post chats.
- [x] Cover the shared `populateParent()` path for the main Logger and every open
      deleted forum/thread log modal.
- [x] Add the same master/local-only presentation gates to separate inline
      removed-attachment history without adding new arbitrary-file rendering.
- [x] Invalidate every Discord channel-message cache, refetch only the selected
      channel, and refresh the Logger window, all open Logger thread modals, and
      edit-history wrappers after relevant setting/cache changes.
- [x] Track and close only a currently open Logger-owned media viewer when the
      cache master is turned Off.

### Stage 3 focused checks

- [x] The complete Stage 3 display-policy table has deterministic coverage.
- [x] Ordinary live messages are not filtered or Blob-rewritten.
- [x] Cache-master Off replaces already saved attachments with text labels
      without deleting files.
- [x] Cache-master Off uses no replacement media node and uses the exact
      `[image:filename.ext]`/`[attachment:filename.ext]` forms in native mounts
      and Logger-owned list/log views.
- [x] Remote-first mode still starts from CDN when a local file already exists.
- [x] Local-only mode makes no remote presentation request for images or any
      other direct attachment type.
- [x] Existing remote-only text/PDF/other cards do not gain a new Blob renderer.
- [x] Object URL cleanup remains bounded across refresh/hot reload.

### Stage 3 result

- **Checkpoint implementation:** Added one detached saved-attachment
  presentation policy for native restored rows, shared Logger/deleted-thread
  rows, and inline removed-media history. Remote-first begins from the
  preserved direct/proxy URL and falls back to an existing cached image/video
  Blob after media-load failure; local-only bypasses remote presentation and
  uses only an existing supported cached Blob. The checkpoint's native
  cache-Off omission policy is now superseded by classified placeholder text.
- **Live refresh:** Cache-master and local-only transitions close only tracked
  Logger-owned attachment viewers before revoking Blob URLs, clear transient
  failure state, and refresh the selected native rows, main Logger, every open
  deleted thread/forum log, and inline edit-history wrappers.
- **Viewer ownership:** Native viewer ownership is recorded through duplicate-
  safe scoped `ModalStack.openModal`/`closeModal` observers; a later ordinary
  Discord viewer overwrites Logger ownership and is not closed by a cache
  setting transition. Custom Logger image/video modal keys are tracked
  separately.
- **Host correction:** Parent review caught and fixed an initially unbound
  `BoundPatcher.after` call before live sync. The final implementation binds the
  BetterDiscord scoped patcher receiver and has a regression assertion for both
  observer installs.
- **Focused parent checks:** `npm run check` passed. The combined
  `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` run passed `183/183` with zero failures,
  skips, cancellations, or todos.
- **Full parent suite:** `npm test` ran exactly
  `node --check MessageLoggerV2.plugin.js && node --test tests/*.test.js` and
  passed `501/501` with zero failures, skips, cancellations, or todos.
- **Review/checks:** Parent reviewed the complete Stage 3 source and test diff;
  `git diff --check` is clean. No version, changelog, schema, cache-all-file-
  types, updater, clipboard, arbitrary-file renderer, or external-open behavior
  changed.
- **Live sync:** Synced only `MessageLoggerV2.plugin.js`; repository/live SHA-256
  both equal
  `fd659400e598e038c0ad12a14236c5cce0f950d6d3996bcdb4e26fec6ab64ff2`.
  BetterDiscord removed/reapplied MessageLogger patches and completed the UI
  refresh with no new MessageLogger error. A simultaneous `PersonalPins`
  dispatch error is from that separate plugin.
- **First live result:** Local-only On passed for the known older cached image:
  the native mounted row and full viewer both rendered the Blob. Local-only Off
  failed after the remote URL expired: neither the mounted row nor full viewer
  recovered to the local Blob. Cache Off removed that old image but left its
  empty attachment-only message shell; the exact Logger placeholder worked.
  Two recent saved image rows in another channel remained mounted because
  Discord reused previously injected cached-channel messages instead of passing
  them through the new presentation clone.
- **Runtime evidence:** Normal logs show the local-only and cache-master setting
  transitions, expired-attachment reloads, cached channel loads, and repeated
  media error events without a new MessageLogger exception. The failed recent
  rows are confirmed saved deletion records, not ordinary live messages.
- **Remaining gate at checkpoint:** Targeted trace and correction of the three
  native-mount symptoms, parent regression/full gates, resync, focused live
  retest, and user confirmation before Stage 3 is complete.

- **Correction trace:** With the disposable fallback trace enabled, the known
  expired remote attachment successfully produced a Blob presentation while
  local-only was Off. Cache Off produced detached clones with zero attachments,
  reinserted the attachment-only record as an empty row, and left non-selected
  previously injected rows in Discord's cached channel results. The trace
  helper, live symlink, and report were removed after capture.
- **Superseding correction contract:** Any source selection that yields neither
  a permitted remote node nor an existing supported Blob now produces the same
  exact classified text label in native mounts and Logger-owned views. Policy
  transitions invalidate every channel-message cache and refetch only the
  selected channel. Stage 5 separately owns bounded CDN-to-file hydration on a
  real Off-to-On transition.
- **Correction implementation:** Initial restore, native media failure, reload,
  and setting refresh now use one detached native placeholder helper. Logger
  image/video errors and inline removed-media fallbacks carry the same plan
  label without altering canonical attachments. Cache refresh invalidates all
  known channel rows even when no ordinary channel is selected and refetches
  only the selected channel when one exists.
- **Correction focused checks:** Parent syntax and diff checks pass. The current
  combined `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` run passes `187/187` with zero failures,
  skips, cancellations, or todos.
- **Correction full suite:** `npm test` ran exactly
  `node --check MessageLoggerV2.plugin.js && node --test tests/*.test.js` and
  passed `506/506` with zero failures, skips, cancellations, or todos. The
  dedicated attachment-only forum/thread promotion selection passed `7/7` and
  proves only the detached presentation clone becomes a placeholder.
- **Correction remaining gate:** The user-authorized checkpoint may be created,
  but Stage 3 is not complete. Trace and fix the same-channel remount timing,
  repeat the focused live cases, inspect the fresh log boundary, and wait for
  user acceptance before the Stage 3 completion commit.
- **Correction live sync:** Synced only `MessageLoggerV2.plugin.js`; repository
  and live SHA-256 both equal
  `a707f0814d91f4254a543ed8d0a543c2b5a39395924be1a11852bc439ba699d3`.
  MessageLogger removed and reapplied its patches and completed both UI force
  updates without a new MessageLogger error. The simultaneous `PersonalPins`
  dispatch error is from that separate plugin. The exact leftover disposable
  fallback-trace report was removed; no trace helper remains installed.

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
- [ ] Use classified text in both native saved-message mounts and Logger-owned
      views when neither remote nor local media works.
- [ ] Confirm no Logger-owned action leaks onto ordinary Discord media.

### Stage 4 focused checks

- [ ] Remote-first, live CDN plus local cache: display CDN; external open uses
      CDN.
- [ ] Remote-first, expired CDN plus local cache: display falls back to Blob;
      external open uses the operating system's default file app.
- [ ] Live CDN without local cache: remote display/open works and caching starts.
- [ ] No usable CDN and no local cache: native mounts and Logger-owned views show
      their placeholder/classified text; no broken modal; external open warns
      and launches nothing.
- [ ] Local-only plus local cache: display Blob; external open uses the resolved
      local path through the default file app without a CDN request.
- [ ] Local-only without local cache: native mounts and Logger-owned views show
      their placeholder/classified text; no CDN display/probe/open; external
      open warns and launches nothing.

## Stage 5 - Off to On rehydration

- [x] Rename the visible switch from **Cache media locally** to
      **Render & Cache media**, retaining the `cacheAllImages` id.
- [x] Reword its existing linked note briefly: On renders and caches media and
      retries saved live URLs; Off shows placeholders and keeps child values;
      retain the existing **Disable saving data** queue warning.
- [ ] Trigger only on a real Off to On transition.
- [ ] Scan only deleted records' eligible normal image attachments.
- [ ] De-duplicate work and skip existing files/non-images/out-of-scope media.
- [ ] Try the exact preserved direct URL, then a distinct proxy URL.
- [ ] Respect existing size, cancellation, no-save, epoch, request-sharing, and
      atomic-write contracts.
- [ ] Refresh presentation once after immediate/deferred completion as
      appropriate.
- [ ] Confirm Off during the batch cancels without retry or late write.
- [ ] Add no persisted unavailable marker or schema field.

### Stage 5 focused checks

- [ ] Recent saved URL is re-cached and appears after Off to On.
- [ ] Expired direct URL falls back to a distinct live proxy when available.
- [ ] Both URLs unavailable and no existing local file leaves exact classified
      placeholder text in native and Logger-owned views.
- [ ] Existing local files are not downloaded again.
- [ ] No startup-wide backfill occurs merely because the saved setting is On.
- [ ] A later real Off to On may retry a prior transient failure without a
      persisted schema marker.

## Stage 6 - Automated verification

- [ ] Cover the master/local-only display matrix for detached render clones and
      prove canonical records retain their direct/proxy URLs.
- [ ] Cover immediate master/child refresh of selected native rows, the main
      Logger, every registered deleted thread modal, and edit-history wrappers.
- [ ] Cover remote display failure to Blob, local-only remote bypass, Blob
      cleanup, and exact no-source `[image:filename.ext]` versus
      `[attachment:filename.ext]` classification in native and Logger views.
- [ ] Prove the label classifier reuses the existing image predicate: current
      JPG/JPEG, PNG, GIF, BMP, WebP, AVIF, TIF/TIFF cases use `[image:...]`,
      while TXT, PDF, video, audio, and other direct files use `[attachment:...]`.
- [ ] Cover missing/unsafe filenames with a safe basename or `unknown file`
      without allowing markup/HTML interpretation.
- [ ] Cover liveness success/failure/timeout, duplicate-click sharing,
      generation cancellation, cross-platform `shell.openExternal()` versus
      `shell.openPath()` routing, nonempty open-path errors, and missing-file
      failure with a warning toast and without opening a Blob externally.
- [ ] Prove Off to On hydrates only eligible missing deleted-image files through
      the preserved URL order and existing safe write pipeline.
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
      is removed immediately; native saved-message rows, Logger/main, and
      deleted forum/thread log views show `[image:filename.ext]` for a current
      image and `[attachment:filename.ext]` for a representative non-image
      direct attachment; any Logger-owned media viewer closes; cache files
      remain; deleting a new image creates no cache file.
- [ ] **Cache back On:** a prior local image follows the selected child policy;
      a recent uncached deletion is retried and cached from its stored direct or
      distinct proxy URL; an expired no-local image shows its placeholder in
      native and Logger-owned views.
- [ ] **Mount coverage smoke:** repeat the master Off/On presentation refresh in
      one DM and one open forum-post chat. Confirm the forum list/sidebar/browser
      text-only entries remain present.
- [ ] **Hot reload/Cmd+R:** local images receive valid regenerated Blob URLs and
      no stale/revoked Blob remains clickable.
- [ ] **Unavailable external open:** expired CDN plus no existing local file
      opens nothing and shows the concise unavailable warning toast.
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

### 2026-08-17 - Stage 2 commit verified and focused scope reaffirmed

- Created and verified Stage 2 commit
  `62152b8632860a0d0037c7713314d8f9c3357daa`; its scope is exactly the plugin,
  media tests, record tests, and this checklist.
- The user reaffirmed that remaining work is primarily image rendering with
  only the small cache-logic adjustments necessary for that rendering.
- General plugin behavior will be protected by the full automated suite, not a
  broad manual retest. User live checks remain limited to the changed
  attachment render/cache/open behavior.

### 2026-08-17 - Stage 3 source map and ImageUtilities control audited

- Confirmed one shared restored-message clone path covers guilds, DMs/group
  DMs, open threads, and open forum-post chats; main Logger and deleted
  thread-log rows share `populateParent()`, while inline removed-media history
  is the only separate React consumer.
- Locked Stage 3 to detached presentation clones, an ML2-record-scoped native
  media-error fallback, Logger/inline consumers, and setting refresh. No
  logging, filtering, schema, persistence, cache eligibility, or arbitrary-file
  behavior belongs in this stage.
- Audited enabled ImageUtilities 5.6.7. Its current message/viewer rescaling is
  disabled and it has no media-error or Blob-render override, so it remains
  enabled for the normal Stage 3 test. It alters the native viewer/context menu;
  use a disabled control only if the later viewer/open action fails.

### 2026-08-17 - Stage 3A native mounted-row policy verified

- Added a detached saved-attachment presentation plan that preserves canonical
  records and selects remote, cached Blob, placeholder metadata, or omission
  from the cache-master and local-only settings.
- Native restored guild, DM/group-DM, thread, and forum-post rows now start from
  the preserved direct/proxy remote source in remote-first mode, use cached
  image/video Blobs in local-only mode, and omit direct attachments when the
  cache master is Off.
- Added a capture-phase, exact saved-row media-error listener so only failed
  deleted-message image/video mounts can retry from an existing cached Blob;
  ordinary live Discord media is ignored.
- Cache-master and local-only transitions clear transient media-failure and
  Blob presentation state, then refresh selected restored rows, the Logger,
  all open Logger thread modals, and inline edit-history wrappers.
- Parent checks pass: syntax, `105/105` combined media/live-mount focused tests,
  and `git diff --check`. The full suite and live sync remain gated on the rest
  of Stage 3.

### 2026-08-17 - Stage 3B shared Logger rows verified

- Added a pure Logger presentation-entry planner over canonical current and
  removed direct attachments. It preserves order, deduplicates removed-history
  identities, and never mutates saved records or their direct/proxy URLs.
- Wired the planner into shared `populateParent()`, covering both the main
  Logger and every deleted thread/forum log modal without a separate modal
  implementation.
- Cache-master Off and local-only missing/unsupported entries now use exact
  classified Logger text. Remote-first omissions retain the existing
  `[Attachment not cached: filename]` wording.
- Remote-first Logger media no longer switches to an existing cache before a
  load failure. Cached image/video Blob plans enter the existing local renderer,
  while proxy-only remote non-media links use the selected planned URL and no
  new arbitrary-file renderer is introduced.
- Parent checks pass: syntax, `165/165` combined media/source-contract focused
  tests, and `git diff --check`. Inline removed-media history and Logger-owned
  viewer shutdown remain before the complete Stage 3 gate.

### 2026-08-17 - Stage 3 first live gate exposed native-mount gaps

- Local-only On passed on the known older cached image in its restored native
  row and full viewer.
- Local-only Off failed to recover that expired remote image to its existing
  cached Blob in both the restored row and viewer.
- Cache Off removed the old attachment but left an empty attachment-only row;
  its Logger-owned `[image:Capture3.PNG]` placeholder passed.
- Two recent saved deletion records in another channel retained their images
  after Cache Off. Log timing and saved-data inspection confirm Discord reused
  cached-channel copies of those injected rows, while the setting refresh only
  replaced records in the selected channel.
- Created the user-authorized Stage 3 checkpoint with the passing local gates
  and known live failures in its commit message. It is a restore point, not
  Stage 3 completion.

### 2026-08-17 - Stage 3 correction trace completed and removed

- Installed the disposable `MessageLoggerMountFallbackTrace` helper only long
  enough to capture the local-only Off and cache-master Off reproductions.
- With cache On and local-only Off, the known expired attachment produced a
  detached Blob output from its already-existing physical cache file; the user
  confirmed its restored row remained rendered during this traced run.
- With cache Off, the same canonical attachment produced a detached clone with
  zero attachments. `reAddDeletedMessages()` then inserted the attachment-only
  saved record as an empty row, proving the visible shell was a logger
  presentation defect rather than Discord media rendering.
- The trace also captured recent saved records producing zero-attachment clones
  while previously injected copies survived in non-selected Discord channel
  caches. The policy refresh therefore must invalidate every channel cache and
  refetch only the selected channel.
- Removed the exact live helper symlink, generated JSON report, and ignored
  helper source. No disposable trace artifact remains.

### 2026-08-17 - Final presentation and no-hydration contract superseded earlier omission rules

- Cache master Off now uses the same exact classified text placeholders in
  native saved-message mounts and Logger history. It renders/fetches no saved
  attachment media and creates no new cache file; existing files and canonical
  direct/proxy URLs remain intact.
- Cache On with local-only Off uses CDN first, then an already-existing local
  Blob after remote media failure. If neither source works, every covered view
  shows the classified placeholder instead of an empty row or broken node.
- Cache On with local-only On bypasses CDN and uses an already-existing local
  Blob only. A missing/unsupported local source becomes the same classified
  placeholder.
- Turning cache On is presentation-only for historical deletions. It never
  enumerates or downloads old deleted attachments into new cache files. New
  live messages retain the existing cache pipeline while the master is On.
- External opening keeps Blob and canonical destinations separate: live CDN
  uses the configured default browser; an existing local file uses the
  operating system's default application for that file type; no usable source
  opens nothing and shows **Attachment is no longer available.**
- Updated the current implementation, Stage 3-7 checks, and handoff next action
  to make these rules authoritative over older activity-log entries that
  described native omission or Off-to-On rehydration.

### 2026-08-17 - Stage 5 Off-to-On hydration restored

- The user explicitly restored Stage 5 after the temporary no-hydration
  decision. This entry supersedes only the prior no-hydration statements; the
  classified placeholder and source-selection rules remain unchanged.
- A real Cache Off to On transition will enumerate eligible saved deleted-image
  attachments that lack local files, de-duplicate them, and try the exact
  preserved direct URL followed by a distinct proxy URL through the existing
  limits, cancellation, no-save, epoch, request-sharing, and atomic-write path.
- Successful responses create normal cache files and refresh presentation once
  the batch settles. Existing files are skipped.
- Expired/unavailable URLs with no existing local file remain exact classified
  placeholders in native mounted messages and Logger history. External open
  warns and launches nothing when neither source is usable.
- Failure remains transient rather than persisted: no schema/tombstone is
  added, and a later real Off to On transition may retry the stored URLs. No
  automatic archive-wide startup hydration is added.

### 2026-08-17 - Master media setting wording finalized

- Rename the visible **Cache media locally** switch to **Render & Cache media**
  because it now governs both saved-media rendering and cache activity.
- Keep the internal `cacheAllImages` id unchanged, so this is a presentation
  change and does not require a schema migration.
- Preserve the useful linked-note behavior in shorter wording: On renders saved
  media, caches eligible files, and retries saved live URLs after an Off-to-On
  transition; Off shows classified attachment placeholders while retaining
  child values. Keep the existing no-save queue warning.

### 2026-08-17 - Stage 3 native placeholder correction implemented

- Added one detached native saved-attachment presentation helper and used it
  for initial restoration, media-error fallback, reload, and switch-driven
  refresh. Attachment-only saved rows now become exact classified text rather
  than empty shells when no permitted media source exists.
- Carried the same plan label through Logger remote/Blob image and video errors,
  and through inline removed-attachment media fallbacks. Saved direct/proxy URLs
  and canonical records remain unchanged.
- Policy refresh now invalidates every known Discord channel-message cache,
  including DM and thread caches, while refetching only the selected channel.
  Global invalidation still occurs when no ordinary channel is selected.
- Parent focused verification passes `187/187` across the affected media,
  live-mount-setting, and source-contract suites. `npm run check` passes and the
  bounded `npm test` command runs only `tests/*.test.js`, passing `505/505`.
  A separate attachment-only forum/thread promotion selection passes `7/7`,
  and the final bounded suite passes `506/506` after that regression was added.
  Whitespace is clean; the focused live retest is the remaining Stage 3 gate.
- Synced only the plugin after all local gates. Repository/live SHA-256 match at
  `a707f0814d91f4254a543ed8d0a543c2b5a39395924be1a11852bc439ba699d3`,
  hot reload completed without a new MessageLogger error, and the last
  generated fallback-trace report was removed. User live acceptance is the
  remaining Stage 3 gate.

### 2026-08-17 - Stage 3 second live gate isolated same-channel remount defect

- Local-only Off still fails immediately after plugin hot reload. Toggling the
  media master Off and back On does not recover the row.
- Toggling local-only On also remains broken in the same channel, but changing
  to another channel and back rebuilds the row and renders the existing local
  Blob correctly. After that successful rebuild, toggling local-only Off keeps
  the image rendered.
- This proves the physical cache file and Blob resolver work. The remaining
  defect is scoped to hot-reload/same-channel saved-row remount or refresh
  timing, not CDN-to-Blob source selection itself.
- The master must also visibly disable every other Media settings control while
  Off, without clearing child values. This dependency requirement is now part
  of the focused correction.
- The user explicitly authorized committing the current passing tree as an
  incomplete Stage 3 checkpoint. Do not mark Stage 3 complete in that commit.

### 2026-08-17 - Stage 3 CDN, proxy, and Blob ordering corrected

- The user proved the target `cdn.discordapp.com` attachment URL still loads in
  a browser while the equivalent `media.discordapp.net` proxy is dead. A safe
  data inspection then confirmed the legacy saved record contains the dead
  proxy in both `url` and `proxy_url`; the physical cached file remains present.
- Added presentation-only derivation of the equivalent Discord CDN attachment
  URL from proxy-only legacy records. Path, signed query, and fragment are
  retained, while canonical `url`/`proxy_url` values are never rewritten.
- Remote failure is now transient per attachment and per candidate. Native
  restored rows, Logger rows, deleted thread/forum logs, and inline removed
  media use CDN first, then the distinct proxy, then an existing cached Blob;
  if all permitted sources fail, they use the exact classified placeholder.
- Detached render clones assign both `url` and `proxy_url` to the selected
  candidate so Discord cannot silently prefer a stale proxy. Each native
  candidate promotion remounts only the exact saved message; setting changes
  retain the existing current-surface remount policy.
- Attachment videos share the same candidate order through their existing
  video renderer. Embed, sticker, Components V2, cache-all-attachment-types,
  text/order, thread/forum promotion, schema, persistence, and Stage 4 external
  opening remain unchanged.
- Parent checks pass: the combined affected suites are `190/190`, `npm run
  check` passes, the bounded full `npm test` suite is `509/509`, and `git diff
  --check` is clean. Live sync is deliberately pending until the Media-setting
  wording/dependency slice and its rerun are complete.

### 2026-08-17 - Stage 3 Media master gate completed locally

- Renamed only the visible `cacheAllImages` control to **Render & Cache media**;
  its persisted id and schema remain unchanged. The linked note now describes
  saved-media presentation, eligible caching, Off-to-On URL retries,
  placeholders, retained child values, and the existing no-save queue.
- Linked every other Media control to the master. Turning it Off now greys the
  complete group without changing child values; the always-locked legacy cache
  switch remains locked in both states.
- Updated first-install help, settings/help references, and the official RT-11
  settings check without changing release metadata.
- Parent verification after the settings edit passes syntax, the focused
  `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` selection at `190/190`, `npm run check`, the
  strict `tests/*.test.js` full suite at `509/509`, and `git diff --check`.
- The unsynced repository plugin SHA-256 is
  `1aff8ea21a0ede6c77c60866778d28f436bd609f9dba90cc75c3e1ce71cb0a6c`;
  the installed plugin remains
  `e40d8df9ceaad0b65fdb727cad11d1dc3b1ee35f421b4d9db7b2ac59f5276c98`.
  The next action is the focused live sync and user runtime matrix.

### 2026-08-17 - Stage 3 live build accepted for commit

- Synced only `MessageLoggerV2.plugin.js`; repository and installed SHA-256
  match at
  `1aff8ea21a0ede6c77c60866778d28f436bd609f9dba90cc75c3e1ce71cb0a6c`.
  The hot reload removed and reapplied MessageLogger patches and refreshed the
  target channel without a new MessageLogger exception. The simultaneous
  `PersonalPins` dispatch failure remains unrelated.
- Runtime logs show the tested master Off, master On, and local-only On
  transitions rebuilding the exact target channel. The local-only cached image
  reached Blob presentation; clicking it still handed the temporary `blob:` URL
  to macOS and produced the expected no-application dialog.
- The user explicitly authorized committing this Stage 3 rendering state. The
  failed external open is recorded as Stage 4, where Logger must resolve the
  physical cache path and use Electron's cross-platform default-file-app API.
- Pause after the commit. The user will perform a light forum/thread check on
  the committed live build before Stage 4 begins.

### 2026-08-17 - Stage 3 reopened for newly cached local-only media

- After `ed59642`, the user tested newly uploaded and deleted images in normal
  channels, threads, and forums. With local-only On, the first saved mount shows
  its classified placeholder; local-only Off renders remotely as expected, and
  cycling the main master makes the already-cached local image appear.
- Fresh runtime logs show repeated successful `PROMOTE` events for those exact
  new saved records with no following Logger presentation refresh. The current
  `cacheImage()` path returns immediately after `promotePreCachedMedia()`, and
  the confirmed direct-write path also ends after logging `MEDIA CACHED`; neither
  path remounts saved attachment presentation after the file exists.
- The correction is limited to the exact direct attachment whose confirmed
  local file became available. It must coalesce duplicate completion events,
  remount the saved record, and refresh Logger-owned consumers. It must not
  alter remote-first ordering, ordinary live media, forum/thread promotion,
  text mounting, schema, persistence, Stage 4 opening, or unrelated cached
  embeds/stickers/Components V2.

### 2026-08-17 - Stage 3 local cache-completion correction verified locally

- Confirmed cache promotion and direct-write completion now schedule one
  coalesced refresh keyed by the exact message and attachment. The callback
  runs only while **Render & Cache media** and local-only are both On, rechecks
  that the exact attachment resolves to a usable local Blob, and then remounts
  only that saved record plus Logger-owned viewers.
- Local-only still passes only `allowBlob`; CDN and proxy candidates are not
  selected or failed by this completion path. Remote-first ordering remains
  CDN, proxy, local Blob, then placeholder through its existing media-error
  listener.
- Added regression coverage for promotion, confirmed direct writes, duplicate
  coalescing, wrong-attachment isolation, remote-first bypass, removed-media
  Logger refresh, and transition-state cleanup.
- Parent verification passes `node --check`, the affected media,
  live-mount-setting, and source-contract selection at `192/192`, `npm run
  check`, the strict `tests/*.test.js` full suite at `511/511`, and `git diff
  --check`.
- Synced only `MessageLoggerV2.plugin.js`; repository and installed SHA-256
  match at
  `551690965624202ce67d0dfbe6bc032b3643c396116dcd0fe140751c47cd9770`.
  The 08:39 hot reload removed and reapplied Logger patches successfully with
  no new MessageLogger exception; the simultaneous PersonalPins dispatch error
  remains unrelated.

### 2026-08-17 - Stage 3 cache-completion live gate accepted

- With local-only On, the user confirmed a newly uploaded and deleted image now
  remounts from the physical local cache without toggling settings or changing
  channels.
- Forum mounts show a very brief classified-placeholder flash before the Blob
  remount completes, both on the initial image/attachment deletion and when the
  main **Render & Cache media** gate changes from Off to On. The user accepted
  this transition and explicitly requested the commit; it is recorded as
  non-blocking presentation polish rather than a failed rendering or
  forum/thread promotion path.
- Commit only the plugin, two regression files, and this checklist. Stage 4
  remains paused and no push or release action is authorized.

### 2026-08-17 - Forum transition-flicker follow-up opened

- The user requested one final Stage 3 polish pass before Stage 4. The forum
  image eventually renders correctly, but the exact classified placeholder is
  briefly visible on both an initial attachment deletion and the main media
  gate's Off-to-On transition.
- Keep the investigation trace-first. Time saved-presentation plans, Logger
  remount methods, ML2 dispatcher events, cache promotion, MessageStore state,
  and the DOM transition. Do not infer a fix from the final successful Blob.
- Preserve the committed source-selection rules, text mounting, forum/thread
  promotion, schema, persistence, and external-open boundary. ImageUtilities
  may remain enabled because this trace targets saved-message presentation and
  DOM timing rather than its viewer/context-menu changes.

### 2026-08-17 - Forum transition-flicker trace completed

- The trace captured forum message `1538837015364108309` with attachment
  `1538837015187951656`. On deletion, `refreshCacheOnlyMessage` computed the
  placeholder before the local pre-cache promotion completed. Promotion then
  succeeded, but the previously captured placeholder still dispatched at
  `09:08:59.069`; the Blob remount dispatched at `09:08:59.077`.
- The DOM subsequently showed the classified label alongside the loading Blob
  before settling to the Blob-only presentation. This proves the flicker is an
  intermediate detached presentation clone, not forum/thread promotion or a
  failed local renderer.
- The master Off transition correctly dispatched the placeholder. The matching
  On transition completed normally and dispatched the existing Blob directly;
  it did not generate a second placeholder plan after enabling.
- The disposable trace helper itself threw `ReferenceError: idSource is not
  defined` from its after-hook and serialized data URLs into a 229 MB report,
  which explains the settings stall seen during tracing. Its exact live symlink
  was unlinked immediately; after recording the evidence, its ignored source
  and generated report were removed. No tracked MessageLogger source caused
  that error.
- The narrow implementation target is therefore only evaluation timing inside
  `refreshCacheOnlyMessage`. Do not alter forum promotion, text mounting,
  source ordering, persistence, settings, or Stage 4 external-open behavior.

### 2026-08-17 - Forum deletion presentation timing corrected locally

- `refreshCacheOnlyMessage` now calls
  `getNativeDeletedAttachmentPresentationMessage` inside its existing
  `setImmediate` callback. It still emits at most one detached
  `MESSAGE_UPDATE`, but it observes a pre-cache promotion that completed before
  dispatch instead of sending a stale clone.
- Added a deterministic regression proving that a Blob which becomes available
  after `refreshCacheOnlyMessage` is called but before its callback runs is the
  presentation dispatched. The existing master-Off placeholder regression is
  unchanged and still passes.
- Parent validation passed: `npm run check`; the combined
  `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` gate at `193/193`; bounded `npm test` at
  `512/512`; and `git diff --check`.
- Only `MessageLoggerV2.plugin.js` was synced live. Repository/live SHA-256 is
  `32a611291cb964268f79f0cb813f0ba3529f914ca81236b00e928edc6704aba0`;
  BetterDiscord hot-reloaded it without a new MessageLogger exception.
- Changed scope remains `MessageLoggerV2.plugin.js`, `tests/media.test.js`, and
  this checklist. The smallest forum runtime retest is next; do not commit
  until the user confirms that gate.

### 2026-08-17 - Forum deletion timing live gate accepted

- With ImageUtilities enabled, the user confirmed a fresh forum image deletion
  now moves to the cached Blob without the previous placeholder flash.
- The master **Render & Cache media** Off-to-On transition still has a visible
  flicker or lag. The earlier trace proved that transition selected the Blob
  directly, so it remains a separate lifecycle/render-timing issue rather than
  a reason to reopen the accepted stale deletion clone fix.
- The user explicitly requested committing this confirmed correction before a
  new master-toggle trace is prepared. Commit only the plugin, its one media
  regression file, and this checklist; do not push and do not begin Stage 4.
