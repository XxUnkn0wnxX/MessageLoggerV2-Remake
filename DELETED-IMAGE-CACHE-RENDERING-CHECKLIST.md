# Deleted Image Cache Rendering Checklist

> Tracked working checklist and handoff for the remaining MessageLogger
> media/viewer work on `develop`.
> Keep it in the repository root while implementation and validation are in
> progress, include its current evidence in every user-confirmed stage commit,
> and leave it in the repository root after the current release. Archive it
> only if the user explicitly requests that in a later session.

## How to use this file

The `## Active remaining roadmap` section is the authoritative forward tracker.
New sessions read it together with `## Living handoff snapshot` before starting
work. Unchecked boxes outside the roadmap may be historical or superseded.
Mark roadmap items complete only after implementation, automated validation,
focused live acceptance, and the requested commit/push. Keep detailed evidence
and notes in the existing stage and activity sections; never add them to the
compact roadmap.

- Read the roadmap and living snapshot before re-scanning source or beginning
  implementation.
- Tick an item only after its evidence exists.
- Record commands, results, changed files, failures, and runtime findings in
  the detailed sections below.
- Update **Exact next action** after every material stage.
- Refresh the repository snapshot, session reference, blockers, and exact next
  action before handing the work to another session.
- Keep plugin implementation, tests, and live validation separate.
- Do not mark the work complete until the final automated and live gates pass.

## Active remaining roadmap

- [x] Accepted foundation: native + Logger-view image/video/audio/TXT/PDF;
      direct/CDN -> proxy -> cached Blob -> placeholder; external open routing;
      compatibility audit 87 contracts / 0 failures.
- [ ] R1 — Full classic embeds, message snapshots, legacy components, and
      Components V2 viewer work: trace the safe live model/render boundary;
      implement a MessageLogger-owned read-only renderer with interactions
      disabled and a safe fallback; never pass archived wire JSON unsafely
      through `new MessageRecord(raw)`
      and never overwrite native `embeds`/`components`; deterministic and
      focused live acceptance.
- [ ] R2 — Cache All Attachment Types gate: exact master/child eligibility
      matrix; preserve the established media and Anti-Nuke master write
      boundary; tests/live.
- [ ] R3 — Stage 5 Off-to-On hydration: eligible missing saved attachments
      only; dedupe/skip existing; direct then distinct proxy; preserve
      size/no-save/cancel/request-share/atomic write; one refresh; tests/live.
- [ ] R4 — Provisional Anti-Nuke/Ghost-Ping recovery-media hardening and exact
      Stage 4b acceptance: bounded ancestry/age/count/bytes; promote confirmed;
      clean unclaimed without deleting shared files; define the exact Stage 4b
      matrix. Core Anti-Nuke is not presently classified broken.
- [ ] R5 — Stage 9 safe cache warning identity: useful filename/path/host
      identity; redact query/fragment/credentials/control chars; no
      behavior change; tests/live.
- [ ] R6 — Integrated validation/release: full checks/live matrix; reconcile
      checklist/TODO; version/changelog only if explicitly requested; branch
      promotion/reconciliation only with explicit approval.
- [ ] Parked — optional Stage 4a Reveal File; define its scope before activation.
- [ ] Parked — multi-instance storage isolation; separate architecture and not
      a blocker for the active media/viewer path.
- [ ] Exact next feature stage: R1. Finish the current compatibility hotfix and
      its native validation first; feature implementation remains deferred.

## Living handoff snapshot

### Current compatibility checkpoint — 2026-11-07

- **Current session:** `01a1b4bc-271d-77a1-b213-6ab542bcd323`.
- **Scope:** current Logger errors, module lookups and evidenced caching faults
  on `develop`. Preserve unfinished features, saved data, schema and release
  metadata until the requested final `2.8.2.20` hotfix entry. That entry must
  state active development and unfinished features. R1–R6 remain incomplete.
  Local commits are authorized; pushing is
  gated on the user’s UI checks and resolution of the known runtime issues.
- **Source checkpoints:** local commits `ccabb77` (runtime compatibility, safe
  cleanup and cache warning identity), `77da772` (native profile layer),
  `4d58406` (installed-layer audit), `323f437` (native dynamic theme), and
  `1e9f56c` (dismissed-profile shortcut), `5982c93` (modal class lifetime),
  and `838a22a` (clear an open filter in place), followed by `beb7ef1`
  (owned-media fallback) and `285a69c` (renewed remote sources). The current
  source passes **766/766** tests with no skips in 4.685 seconds. None has
  been pushed.
- **Installed Stable:**
  `4bcf885a5e08a2340758e4b62326a486ce9ca537f1b8726992b15444c281352b`,
  matching `285a69c`. Stable was fully closed before installation and then
  restarted; data/settings/backup/Pins bytes were unchanged during the copy.
  This includes corrected class recovery and cache warning IDs.
- **Preserved behavior:** modal/audio/image discovery repairs; scoped immutable
  eviction for Logger-owned presentation cleanup; media refresh only for actual
  ordinary evictions; native-thread branches, saved media fallback, selected-channel
  settings refresh, cache/data ownership and all unfinished feature contracts.
- **Native findings:** old Logger emitted false deletion events during cleanup,
  triggering Pins errors; no actual pin loss observed. Old window trace proved
  82 history fetches across 31 channels in 5.855 seconds from absent-entry media
  failures. The first fixed window capture recorded zero history fetches and
  zero synthetic deletes. A controlled disable/re-enable on `838a22a` added
  two ordinary history requests and zero synthetic deletes or trace errors.
  Pins config bytes were unchanged, and the user confirms saved history remains.
- **Startup consumer findings:** a warmed lookup audit passed while Logger kept
  a null user-popout renderer and empty message/selected classes. Action-time
  popout lookup is now user-verified. Two bounded, cancellable CSS waits recover
  missing classes. Native testing exposed an unrelated named enum export being
  accepted as selected CSS; the latest tested source now preserves the original
  root/default search scope. Actual class comparison is added to the audit.
- **Profile menu:** native tracing proved that the More button opens its state,
  but its Layer receives a null container. The installed repair gives the
  profile a locally owned native App layer and includes its menu in dismissal
  containment. The user and native trace confirm the menu now renders.
  The user also verifies theme parity after switching themes and reopening.
  The user also verifies Copy User ID, the row user context menu, and first-press
  shortcut dismissal after closing a profile.
  The audit now checks the actual installed App layer and theme resolvers.
  The theme repair uses the native provider, class generator and reactive
  ThemeStore; no fixed theme, palette, selector hash or enum mapping is copied.
  Settings closes the profile during theme changes, so continuously mounted
  theme switching has deterministic coverage but no live acceptance. Profile
  impression warnings are documented separately; locale warnings are traced
  to PermissionsViewer and also occur on normal-channel/bot profiles. No suppression
  or whole-application provider wrapper was added. Supplying the native
  impression callback would enable tracking for this UI, so that separate
  warning is retained without changing telemetry or OpenAsar blocking.
- **Current runtime audit:** the installed `285a69c` build's full audit at
  `2026-11-07T11:47:25.475Z` has **67 passes, 23 warnings and zero failures**
  across 90 contracts. All warning entries validate their selected contracts;
  actual message/selected classes, profile layer and theme resolver pass.
  The fresh audit confirms both startup classes recovered in generation 1
  with no pending class waits. Earlier lifecycle checks passed on `838a22a`;
  native media acceptance of the combined cache repair remains pending.
- **Shortcut follow-up:** the user reproduced first-press close/reopen after
  dismissing a Logger profile; a second press closes it. Source review identifies
  a stale popout-stack ID overriding the empty actual manager. Local commit
  `1e9f56c` corrects the check; the user now confirms first-press dismissal.
  The same reproduction also exposed a native modal class rewrite that removes
  Logger's root class, losing its author tint and dimensions while the stylesheet
  remains present. An owned-root class boundary now covers classed nonempty
  element-array dialogs, with scoped restoration and cleanup; legacy child
  shapes retain their previous handling. The user verifies colour/dimension
  preservation on `5982c93`; 44 native Logger samples retain the owned class,
  with no trace errors. The user then clarified the all-log shortcut contract:
  `Ctrl+M` must clear a filter in an already-open Logger without closing and
  reopening it. The user now verifies this on `838a22a`, including retained
  tab, colours and dimensions and the following press closing the unfiltered
  Logger. Channel/server shortcuts and auxiliary dismissal retain their paths.
- **Owned-media fallback follow-up:** source regressions reproduced edited-only
  Logger and inline removed-media callbacks stopping after the first remote
  failure. A separate mount-local continuation now advances existing image,
  video, audio and supported-sticker sources through their advertised candidates
  and existing Blob/filename fallback. Canonical membership, strict native
  resolver restrictions, acquisition, retries, schema and saved records remain
  unchanged. Package A is committed as `beb7ef1` with **761/761** tests
  passing. The follow-up now derives normal remote exhaustion from the existing
  full-URL failure keys, allowing renewed sources without retrying unchanged
  failed candidates or reusing a failed Blob. It adds no failure ledger or scan
  through unrelated history. Package B is committed as `285a69c`; the combined
  source passes **766/766** tests and the installed 90-contract audit has no
  failures. Native media interaction remains pending. Acquisition/network,
  request sharing, queues, retries, promotion, write gates, persistence and
  mode handlers have exact source parity with the pre-media-fix checkpoint.
  The new continuation is per mount: reopening may retry remote sources, and
  repaired fallback can reach a proxy previously skipped by the broken path.
  This does not resume media admission or other parked feature work.
- **Cache-warning scope:** the current `Image null unavailable (403)` warning
  was reproduced. A missing embed/component source ID does not imply a null URL.
  The misleading identity is repaired through the existing cache-file ID, with
  unchanged-byte/request/ID tests, and is now installed. Full R5
  filename/path/host labeling remains parked; cache behavior is unchanged.
- **Removed-attachment follow-up — implemented; native acceptance pending:**
  removing an upload while retaining message text exposed an oversized inline
  history preview: native capture measured a 1560 × 1376 image at approximately
  1007 × 888, with no height limit. The user approved a narrow presentation rule:
  historical removed uploads use existing cached previews/file cards, while
  unavailable media retains text. Suppress only recognized deletion markers
  represented by a non-hidden cached preview; preserve canonical history and
  unknown markers. Cover existing image/GIF/video/audio/document handling;
  inline history retains its existing image/video preview support. Constrain
  only inline thumbnails, preserve Logger-window sizing and viewer metadata,
  and reuse deleted-media grayscale/hover without overriding tint controls.
  Acquisition, retries, storage, current attachments and exclusive tab
  classification remain unchanged. This is a hotfix feeding into the existing
  rework, not completion of a parked feature stage. Native capture now confirms
  cached Blob selection and a 396.8 × 350 thumbnail for the same image. A
  follow-up makes colour restore on message-row hover; edit-history dimming
  remains. Broader media/category acceptance is still open. See AT-55 and RT-09.
- **Historical correction:** older claims that Pins errors were unrelated are
  superseded by the proven Logger synthetic-delete trigger. Historical notes
  saying ordinary-row synthetic deletes remain are also superseded. PersonalPins
  source is unchanged; its saved config still matches the retained baseline.
- **Evidence:** authoritative compatibility records and all new traces/backups
  remain under `$HOME/Apps/Dev/BD/.tmp/startup-20261107/`. Historical local
  feature handoffs remain references, not current recovery commands.

Hotfix acceptance (does not complete any parked feature stage):

- [x] Modal startup/partial-start repair: deterministic checks and user's basic
      native verification passed.
- [x] Attribute false delete events and window history amplification; implement
      bounded source fixes and preserve protected behavior in regressions.
- [x] Reproduce the Logger-window trigger on the first fixed build with zero
      observed history fetches and synthetic deletes.
- [x] Restore Logger username/avatar profile opening; user supplied native proof.
- [ ] Complete cold-to-warm class recovery against the actual native CSS owner
      in the same generation, plus hover/selected presentation checks. Native
      recovery now reaches the correct owners in generation 1; visual checks
      remain pending.
- [x] Repair and verify the Logger-profile More menu interaction. Source tests
      and native dependencies pass; opening, theme changes after reopening,
      Copy User ID, row context menus and dismissed-profile shortcuts are
      user-verified on `5982c93`.
- [x] Apply the user-requested all-log shortcut clarification: clear an open
      filtered Logger in place, while retaining modal styling, selected tab
      and unfiltered toggle. User verified on `838a22a`; regression checks
      also preserve auxiliary dismissal behavior.
- [x] Verify disable/re-enable cleanup, Pins preservation and saved history
      on `838a22a`: user history check passed, Pins bytes unchanged, zero
      synthetic deletes and no request burst.
- [ ] Complete relevant media and native-thread checks. The user reports
      404 resource errors; attribution and current fallback handling are under
      review. Preserve aggressive acquisition, alternate URLs, retry/recovery,
      existing cache modes and saved files; do not add a blanket dead-file
      blacklist or advance parked feature stages.
- [x] Correct null cache-warning identity; deterministic tests verify unchanged
      cache IDs, bytes, requests, terminal failure behavior and deferred toast.
      Installed with the final native verification gate still open.
- [ ] Reconcile final evidence, remove live temporary helpers, and leave the
      remaining feature roadmap parked. Push only after the user’s UI results
      and runtime acceptance are complete.

### Previous accepted feature checkpoint — 2026-08-31

- **Last updated:** 2026-08-31
- **Repository:**
  `$HOME/Apps/Dev/BD/BD-Plugins/MessageLoggerV2-Remake`
- **Historical root Codex session ID:**
  `01a05291-de83-7d30-864b-ada47ac1ac10`
- **Historical root rollout record:**
  `$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T22-08-06-01a05291-de83-7d30-864b-ada47ac1ac10.jsonl`
- **Previous continuation session ID:**
  `01a022f7-17f8-7b52-8cf3-e0e009dff3b3`
- **Previous continuation rollout:**
  `$HOME/.codex/sessions/2026/08/21/rollout-2026-08-21T16-16-54-01a022f7-17f8-7b52-8cf3-e0e009dff3b3.jsonl`
- **Earlier compatibility-handoff session ID:**
  `01a05172-deb0-71d1-8089-b7186c453a3d`
- **Earlier compatibility-handoff rollout:**
  `$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T16-54-37-01a05172-deb0-71d1-8089-b7186c453a3d.jsonl`
- **Working branch:** `develop`
- **Pre-roadmap repository checkpoint:** `develop` and `origin/develop` are
  clean at `847aa31edb1f89f63a6caf6d30c94e5363b86a01`.
- **Compatibility audit:** complete and archived at
  `docs/archive/handoffs/DISCORD-WEBPACK-ASSET-COMPATIBILITY-HANDOFF.md`;
  final compatibility source through `860186550db2e7fd9e6326fcbff37af7fa703108`;
  audit 87 contracts: 57 pass, 30 validated warnings, 0 failures, 0 unresolved
  items, and 0 false positives.
- **Live parity:** repository and installed BetterDiscord copies of
  `MessageLoggerV2.plugin.js` are byte-identical at SHA-256
  `8c0294a84b0d029ff4e67fc589a3f772695cd58d5f2cd7e315aabd9d3b17032e`.
- **Current deterministic gate:** the clean baseline and final full
  `npm test` runs pass `667/667`; `npm run test:runtime-audit` passes `7/7`;
  `npm run check` and `git diff --check` pass. An independent review's medium
  missing/throwing-`Stores` coverage finding was closed with two report
  variants, and re-review returned GO with no blocking, high, or medium
  finding. The earlier low-priority CSS suggestion is also enforced by a
  focused invariant.
- **Runtime/live gate:** BetterDiscord hot-reloaded the exact live plugin,
  resolved the native image modal, applied all MessageLogger patches, and
  completed both UI refreshes without a new MessageLogger exception. The user
  accepted the renderer-triggered attachment fallback smoke. The recurring
  `useManaContext` warnings predate this checkpoint, and the observed
  `PersonalPins` dispatch error belongs to that separate plugin.
- **Immediate runtime repairs retained:** the function-bearing
  `MESSAGE_UPDATE` canonical-clone repair and durable deleted-channel cache-path
  resolution remain covered and published in `b329f72`.
- **Shared render-failure policy:** exact saved direct attachments now converge
  through CDN/direct -> distinct proxy -> existing cached local Blob -> exact
  classified placeholder. The same transient coordinator is used by restored
  rows, Logger-owned image/video/audio presentations, Logger-owned native
  viewers, the custom video modal, inline edit-history media, and the explicit
  attachment-open route where that route already applies. Canonical records and
  signed source URLs remain unchanged.
- **Native ownership correction:** Logger suppresses the duplicate native
  attachment accessory for its saved video mount. Lazy discovery uses
  `Webpack.waitForModule` with abort/generation ownership and one event-driven
  refresh; there is no fixed delay, polling loop, animation-frame retry, or DOM
  observation timer.
- **Inline text/code render check:** strict inline TXT/MD/JSON/JS/PY/HTML/CSV/
  XML/LOG/CSS/SH/ZSH/COMMAND and accepted text/JSON/JavaScript/XML MIME previews
  mount one exact React-lifecycle probe for their currently rendered remote
  candidate. The probe uses the native Electron network path with
  `Range: bytes=0-0`, no timeout, shared in-flight ownership, response release,
  revalidation, cancellation, and the existing fallback coordinator. It is
  wired to both live restored `MessageAccessories.render` and detached Logger
  document hosts without double-probing the same candidate.
- **Intentional renderer boundary:** PDF, BIN, archives, fonts, executables,
  unknown generic cards, and other unsupported direct files do not gain an
  inline content renderer or a background render probe. They retain their
  existing exact open/download and local-file behavior. This checkpoint does
  not broaden cache eligibility or execute attachment content.
- **Trace and stash state:** `git stash list` is empty. The user explicitly
  requested deletion of the failed unsafe embed stash, and it must not be
  recreated or treated as a future implementation source. The old embed and
  document-attachment trace helpers are not linked in BetterDiscord. The
  accepted runtime-audit helper and its pre-correction report were removed from
  the live plugins directory and initially moved to
  `$HOME/.Trash/MessageLoggerRuntimeCompatibilityAudit-accepted-2026-08-30/`.
  Final verification found that the Trash destination was absent, so the raw
  report is not recoverable from the live or Trash locations; the helper
  source remains recoverable from Git history. Their original live paths and
  report temporary path are also absent. The report's decision-grade facts
  remain recorded in the compatibility handoff; no Discord restart was
  performed. Ignored `tmp/` evidence may remain local-only.
- **Expected cache/network noise:** current 403/404 misses, DNS failures,
  socket resets, request timeouts, certificate failures, and files with no
  inferable extension are remote-cache outcomes rather than Logger renderer or
  dispatch crashes. Their richer filename/URL/hostname warning work remains
  deferred to Stage 9.
- **Embed safety boundary and pause:** the user explicitly paused Logger-viewer
  embed/Components V2 work until a later session. When resumed, start from the
  clean published source and new trace evidence. Do not feed archived wire JSON
  directly to native renderers or overwrite an already-native message's
  `embeds`/`components`. The discarded experiment proved `new MessageRecord(raw)`
  is not a safe raw-wire hydration boundary; future work needs a trace-proven
  Discord wire-to-model factory or a fail-closed summary path.
- **Historical implementation-worker state:** the configured primary `worker`
  handled the earlier bounded implementation and focused-test slices; no
  Spark-to-Luna fallback condition was reported for that work. The runtime
  exposed the worker role but not a concrete model name. The Sol parent
  integrated and verified every result.
- **Checklist state:** include this file in every user-confirmed stage commit
  and keep it in the repository root after the current release. Do not archive
  it unless the user explicitly requests that in a later session.
- **Privacy state:** persistent paths must use `$HOME`. Before any future
  commit, merge, rewrite, or push, scan the tracked tree, staged diff, and
  outgoing range for an expanded macOS home path.
- **Change-control state:** compatibility is complete and archived; this
  docs-only roadmap update does not authorize a production Logger edit,
  version/changelog update, release step, `main` merge, or other branch
  operation. Future implementation follows the ordered roadmap and its stated
  gates.

### Exact next action

Resume the bounded compatibility hotfix from its current handoff. Deployment
and startup verification are complete; inspect the fresh warmed audit and
Logger-window trace, including actual instance state for unresolved cold-start
lookups. Then verify native cleanup, Pins coexistence, media and thread
behavior. Publication requires the user's instruction. The next feature stage remains R1 when the user separately
resumes feature work; later features retain the roadmap order.

### Resume procedure

1. Read the repository `AGENTS.md` and this complete checklist.
2. Source `~/.zshrc`; confirm `/usr/local/bin/git` is selected.
3. Confirm repository path, branch, HEAD, status, and live-plugin hash.
4. Preserve unrelated user changes; do not reset, clean, switch, merge, or push.
5. Expect the uncommitted compatibility changes described above; preserve them.
   Check stash and live-helper state against the current compatibility handoff
   instead of assuming the historical clean/helper-free state still applies.
6. Recheck `debug.log` for any newer MessageLogger stack and
   separate external cache failures from plugin exceptions.
7. Compare the checkout with this snapshot and record drift.
8. Treat the August compatibility acceptance as historical. Complete the current
   hotfix and its fresh native gates before resuming features. R1 still requires
   a current Discord model/factory trace; do not reconstruct or reapply the
   discarded unsafe embed experiment.
9. Update this file after each implementation, test, or live-runtime stage.

### Session reconstruction references

- The historical root session ID was
  `01a05291-de83-7d30-864b-ada47ac1ac10`.
- Its exact rollout is
  `$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T22-08-06-01a05291-de83-7d30-864b-ada47ac1ac10.jsonl`.
- The previous continuation session is
  `01a022f7-17f8-7b52-8cf3-e0e009dff3b3`, recorded at
  `$HOME/.codex/sessions/2026/08/21/rollout-2026-08-21T16-16-54-01a022f7-17f8-7b52-8cf3-e0e009dff3b3.jsonl`.
- The earlier compatibility-handoff session is
  `01a05172-deb0-71d1-8089-b7186c453a3d`, recorded at
  `$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T16-54-37-01a05172-deb0-71d1-8089-b7186c453a3d.jsonl`.
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

The user's latest instruction and the **Active remaining roadmap** above control
forward work. The **Approved focused contract** below records accepted historical
behavior and constraints. A later explicit user instruction supersedes this
checklist and must be recorded before implementation continues.

## Historical / superseded release boundary and paused work

- [x] Restore, verify, and publish the clean `8c2b3b2` saved-attachment policy
      baseline before addressing the immediate runtime errors.
- [x] Obtain explicit approval for the stale assertion plus the two proven
      baseline runtime-error fixes.
- [x] Implement and verify the `MESSAGE_UPDATE` canonical-clone repair.
- [x] Implement and verify durable deleted-channel cache-path resolution.
- [x] Pass focused tests, full `npm test`, `git diff --check`, live parity, and
      a fresh hot-reload log window.
- [x] Obtain the user's focused edit and Anti-Nuke message/media smoke result and
      accept the error-first checkpoint.
- [x] Implement the pre-embed saved-attachment failure coordinator across
      restored rows, Logger media, owned viewers/modals, and attachment-open
      routing; publish its accepted `e6b27c1` checkpoint.
- [x] Wire strict inline text/code render candidates into that coordinator with
      exact lifecycle-owned native probes and no fixed timers or polling.
- [x] Pass the final `638/638` automated gate, verify repo/live parity, and
      receive the user's renderer-triggered fallback smoke acceptance.
- [x] Delete the failed unsafe embed stash and unlink the obsolete embed and
      attachment trace helpers.
- [x] Record the user's decision to keep Logger-viewer embed/Components V2 work
      paused until a later session.
- [x] Keep Stage 4a Reveal File, Stage 4b Anti-Nuke validation, Stage 5
      hydration, Stage 9 warning identity, release metadata, `main` promotion,
      and branch deletion/promotion paused at this checkpoint until separately
      authorized.
- [x] Keep this checklist in the repository root through and after the current
      release; do not move it to `docs/archive/checklists/`.
- [ ] If the user later resumes native embed/Components V2 work, restart from
      clean published source and current trace evidence. Do not feed archived
      wire JSON directly to native renderers or reconstruct the deleted stash.

The historical status and activity entries below remain evidence of completed
earlier stages. Where they conflict with the active roadmap, the roadmap and
latest explicit user instruction control forward work; the living snapshot is
the factual repository/runtime checkpoint.

## Accepted historical implementation status

- [x] Current Blob, saved-URL, Logger-viewer, and restored-message paths audited.
- [x] Cache Off/On transition behavior audited.
- [x] Local BetterDiscord `develop` compared with upstream for the relevant
      Webpack/Patcher APIs; no fork-only dependency was found.
- [x] Focused product contract recorded.
- [x] Focused automated and live validation planned.
- [x] Every current Logger-owned saved-attachment mount surface mapped.
- [x] Setting-dependent remote-first versus local-only contract recorded.
- [x] Native viewer field/action behavior traced in the live runtime.
- [x] Plugin implementation completed.
- [x] Deterministic regression coverage completed.
- [x] Full automated gate completed.
- [x] Focused live gate completed.
- [x] User acceptance received.
- [x] Shared CDN/direct -> proxy -> local Blob -> placeholder failure handling
      completed for the supported saved-attachment render surfaces.
- [x] Strict inline text/code render-time failure checks completed without
      timers, polling, canonical-record mutation, or duplicate probes.
- [x] Repository/live plugin parity confirmed for the accepted final build.
- [x] Embed/Components V2 stage explicitly paused by the user.

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

- [x] Keep display source and external-open destination separate: Blob is an
      in-Discord display source, never the browser destination.
- [x] In remote-first mode, test the exact preserved or presentation-derived
      direct CDN URL when the user invokes **Open Attachment**, then test a
      distinct saved proxy before falling back to an existing local file.
- [x] Use a bounded native-network one-byte range probe, share only identical
      in-flight probes, and abort stale probes on stop, cache Off, or a
      local-only policy transition.
- [x] Do not retain a long-lived liveness result: availability and signed URL
      expiry can change between clicks.
- [x] Open an accepted live HTTP(S) CDN URL with
      `require('electron').shell.openExternal(url)` so the operating system uses
      its configured default browser.
- [x] If remote liveness fails and the resolved cache file exists, pass the
      platform-native absolute path to
      `require('electron').shell.openPath(resolvedPath)` so macOS, Windows, and
      Linux use the file type's configured default application.
- [x] Keep this routing completely operating-system neutral. Electron receives
      the validated HTTP(S) URL or platform-native absolute file path and the
      operating system chooses its registered default browser or file-type
      application. Do not branch on `process.platform`, discover an executable,
      invoke `open`/`start`/`xdg-open`, convert a local path to `file:`, or name a
      particular browser/viewer.
- [x] In local-only mode, do not probe or open the CDN; re-resolve the physical
      file and open its platform-native absolute path with `shell.openPath()`.
- [x] If the required local file is absent and no permitted live remote exists,
      show a concise warning toast such as **Attachment is no longer
      available.** and open nothing.
- [x] Treat a nonempty `shell.openPath()` result as an error and report a concise
      unavailable/open-failed notice; also handle a rejected or missing shell
      API without throwing from the UI action.
- [x] Obtain the local path only from the existing cache resolver, require an
      existing physical file, and never construct it from an
      attachment-controlled filename or URL.
- [x] Do not discover or launch a browser executable for local files. Remote
      HTTP(S) uses the default browser; local cache files use the default file
      application consistently across supported desktop platforms.
- [x] Never ask the external browser to open a `blob:` URL.
- [x] Keep any native viewer/action patch limited to Logger-owned restored
      media; do not globally replace Discord's media actions.
- [x] Route every existing Logger-owned direct-attachment open point through
      this same policy, including image, video, audio, and generic file rows.
      This later user instruction supersedes the earlier image-only action
      boundary without adding a new renderer, preview, player, MIME map, or
      cache-eligibility path for any file type.

### Cache Off to On rehydration

- [ ] On an actual Off to On transition, enumerate canonical records containing
      `delete_data` and de-duplicate every ordinary attachment that is eligible
      under Logger's existing cache-support settings and predicates by cache
      key. This is not image-only.
- [ ] Skip attachments whose resolved local cache file already exists.
- [ ] Try the preserved direct URL first, then a distinct preserved proxy URL.
- [ ] Attempt hydration only when the canonical record actually retains an
      accepted HTTP(S) CDN/direct or proxy candidate. Do not synthesize a
      missing remote URL or persist a Blob/file URL in the record.
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
- [ ] Freeze eligibility to the file types and the **Cache all attachment
      types** behavior Logger already supports when Stage 5 begins. Hydrating
      those supported types must not be confused with, or silently expand into,
      the separate deferred gate for arbitrary/all file-type support.

## Behavior that must remain unchanged

- [x] Scope boundary: implementation changes are limited to saved direct
      attachment URL preservation, image/attachment presentation, Logger-owned
      media viewing/opening, setting-driven presentation refresh, and source
      liveness/lifecycle behavior required by those paths, plus the explicit
      bounded Off-to-On hydration pass for currently supported saved attachment
      types.
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
- [x] Stage 4 proves the descriptor's exact resolved path is passed unchanged to
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
  `26f8558b6559a440ca6631ca44ececfcf767a612` (`Preserve deleted attachment
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
- [x] Cover the shared native row path for guild channels, DMs/group DMs, open
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

### Stage 3 deleted-MP4 native-mount follow-up (reopened)

The user reported this after Stage 4 foundation work began, then explicitly
set the final ordering: finish, validate, and live-sync the complete Stage 4
image implementation first. After that image gate, return here for the Stage 3
native-video trace; the requested media fixture pack is preparation for that
later matrix and must not pull video/audio fixes into Stage 4.

- [x] Create and validate the copyright-free fixture pack at
      `$HOME/Downloads/MessageLoggerV2-Media-Format-Tests`. Its 15
      numbered cases cover the current Logger/Discord rendering scope: five
      documented image extensions; MP4 H.264, HEVC, and AV1; MOV H.264; WebM
      VP8 and VP9; MP3; OGG/Opus; TXT preview; and a PDF generic-row control.
      `README.md` and `TEST-RESULTS.md` record the exact settings, order,
      container, codec, and four result surfaces. All media passed format
      inspection and full decoding.
- [ ] Have the user test all numbered fixtures before installing a trace.
      Trace only the formats that fail their new-upload or saved/deleted native
      mounts; retain passing formats as controls.
- [ ] Reproduce one newly uploaded then deleted MP4 with **Render & Cache
      media** On and the local-only child Off, then repeat with the child On.
- [ ] Confirm the exact classified placeholder, native Store attachment state,
      presentation plan, mounted DOM node/classes, remote candidate state, and
      physical cache/Blob availability. Compare the same canonical record in
      the Logger view, which the user reports renders correctly.
- [ ] Determine from runtime evidence whether the native row loses video
      attachment data, misses the placeholder-to-media transition, rejects the
      detached video shape, or remains pinned to stale Store/DOM content. Do not
      infer the image fix applies without this trace.
- [ ] Before the final live gate, publish a complete current-runtime format
      matrix and test every format Discord's native direct-attachment renderer
      actually supports. Keep four results distinct: Discord native live row,
      restored Logger-owned native row, Logger custom view, and local Blob.
- [x] Start the audit from the plugin's current extension claims—images:
      JPG/JPEG, PNG, GIF, BMP, WebP, AVIF, TIF/TIFF; videos: MP4, WebM, MOV,
      AVI, MKV—and compare them with current official Discord guidance. Per the
      user's intersection-only scope, exclude BMP, AVIF, TIF/TIFF, AVI, MKV,
      and unestablished audio extensions from the final upload set rather than
      claiming Discord support. Audit MP3 and OGG/Opus separately because
      MessageLogger currently has no dedicated audio classifier.
- [x] Record container and codec together for audiovisual samples. Upload
      acceptance, a recognized filename extension, caching, and actual inline
      decoding/rendering are separate results; one valid MP4 result must not be
      generalized to every MP4 codec combination. The fixture manifest records
      all combinations and the blank results sheet keeps the four surfaces
      distinct.
- [ ] Correct only the proved native saved-direct-video mount/refresh path.
      Preserve direct/proxy/Blob ordering, local-only remote bypass, image
      behavior, Logger rendering, ordinary Discord media, arbitrary-file scope,
      cache eligibility, persistence, and the accepted Stage 4 foundation.
- [ ] Add deterministic coverage for remote-first and local-only deleted-MP4
      mounts, transition completion, ordinary-row isolation, and the traced
      failure mode; run the affected suites, `npm run check`, `npm test`, and
      `git diff --check` before live sync.
- [ ] Sync only the plugin, compare hashes, and repeat the two-setting MP4 live
      gate before requesting acceptance of the reopened Stage 3 correction.

### Stage 3 format-rendering follow-up points (current order)

This ordered follow-up supersedes the earlier no-new-renderer boundary only for
the trace-proven Discord formats named below. It does not authorize an arbitrary
file renderer or a cache-eligibility expansion.

Across every supported image, video, audio, text, and PDF presentation, live
mounts and Logger views share the same source policy but remain separate
consumers: local-only Off uses CDN -> proxy -> cached local Blob -> placeholder;
local-only On uses cached local Blob -> placeholder with zero remote
presentation. Disabling the live restored-message mount affects only live chat
rows and must never disable or degrade the Logger viewer.

1. [x] **Video live/restored rendering:** accepted and committed locally as
       `82106f79028bedcad6c1968c5bacac52fd12cce7`. Discord-native duplicate
       ownership is suppressed and the working Logger video presentation keeps
       the shared remote/local policy. Nothing was pushed.
2. [x] **Logger-view audio rendering:** reuse the semantically traced Discord
       native player, with a browser `<audio>` fallback only when unavailable.
       The implementation and focused deterministic checks are complete; the
       user verified remote-first and local-only Logger-view playback and the
       accepted open behavior. Its focused gate is the authorized point 2
       checkpoint; the full suite remains paused until point 3 is complete.
3. [x] **TXT/PDF Blob and Logger-view rendering:** the user reports that
       Discord's ordinary/live remote text and PDF presentations already work,
       while their local Blob/restored path does not and the Logger viewer has
       no inline renderer. Preserve the working remote presentation and trace
       the exact native ownership/component contract before changing either
       missing path.
   - [x] **Trace baseline:** v1.0.6 / `mount-trace-v6` captured C01/C02 in
         remote-first and local-only states. Both remote rows are owned by
         Discord `MessageAccessories`; its mosaic selects the plaintext preview
         for C01 and generic file component for C02. Both local Blob plans are
         `omit` despite verified cache files and become exact attachment labels.
   - [x] **Gate 3.1 — restored live rows first:** make the cached-Blob-only
         TXT/PDF path render through the trace-proven Discord live mount, run
         focused checks, live-sync it, and obtain the user's live acceptance.
         Do not implement the Logger-view port before this gate passes.
     - [x] The bounded source slice and deterministic gate are complete:
           correct TXT/PDF MIME Blobs, exact extension/MIME classification,
           local-only document plans, remount scheduling, canonical
           immutability, bounded generic-file exclusion, Stage 4 Blob-anchor
           ownership, and native video-only projection pass `241/241` focused
           media/source-contract tests under the parent.
     - [x] Live-sync and confirm C01 TXT and C02 PDF render through Discord's
           native restored-row components from cached Blobs.
   - [x] **Gate 3.2 — Logger viewer second:** after Gate 3.1 is accepted, port
         the proven TXT/PDF native presentation into Logger's viewer using the
         same guarded/native-first pattern established for audio. The Logger
         viewer owns this path independently of the live restored-message mount
         toggle: disabling live mounting must not disable or degrade Logger-view
         attachment rendering.
   - [x] Cover extension and MIME discovery for `.txt` / `text/plain` and
         `.pdf` / `application/pdf` without minified export names or keys.
   - [x] With local-only Off, preserve CDN -> proxy -> cached Blob -> exact
         placeholder order. With local-only On, begin from the verified cache
         only and make zero remote presentation requests. Cache-master Off
         remains the exact attachment placeholder. Apply this source order to
         both live mounts and Logger views; only the live-mount toggle may skip
         the former, while Logger-view rendering continues through its own path.
   - [x] Reuse Discord's trace-proven native text/PDF presentation in restored
         live Blob mounts and the Logger viewer where available. Do not use an
         unsandboxed custom iframe, execute attachment text, or route either
         format through image/video/audio renderers.
   - [x] Show the neutral Stage 4 `Open Attachment` action on every exact-owned
         text/PDF preview or container where practical, including restored live
         rows, Logger-view rows, and native preview surfaces. Remote opens use
         accepted HTTP(S) candidates; local-only opens the verified physical
         cache path through the OS default application, never a Blob URL.
   - [x] Fail closed for ambiguous or foreign mounts and preserve canonical
         records, signed URLs, current/removed order, mixed attachments, and all
         existing image/video/audio/sticker/embed/Components V2 behavior.
         Prevent duplicate native/Logger mounts and duplicate Attachment text.
   - [x] Add focused deterministic coverage for classification, both policy
         modes, master Off, missing cache/module, render failure, mixed formats,
         duplicate suppression, canonical immutability, menu/open ownership,
         and lifecycle cleanup. Then run trace-backed live TXT/PDF checks on
         both restored rows and Logger views before the full gate and commit.

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

## Stage 4 - Viewer and Open Attachment

- [x] Apply the field contract proved in Stage 1.
- [x] Keep the native modal `url` on the actual remote/Blob render source and
      keep canonical remote/local open data in a separate Logger-owned action;
      do not attempt the failed `url=file`, `proxyUrl=blob` field split.
- [x] In remote-first mode, probe the preserved direct CDN only when resolving
      the external-open action; share the in-flight probe for duplicate clicks.
- [x] In remote-first mode, open the live CDN with `shell.openExternal()` or the
      resolved local cache path with `shell.openPath()` when liveness fails.
- [x] In local-only mode, bypass the probe/CDN and open the resolved local cache
      path directly with `shell.openPath()`.
- [x] Recheck the cache master, local-only generation, and physical file after
      every awaited probe so stale completions cannot open anything.
- [x] Use classified text in both native saved-message mounts and Logger-owned
      views when neither remote nor local media works.
- [x] Confirm no Logger-owned action leaks onto ordinary Discord media.

### Stage 4 focused checks

- [x] Remote-first, live CDN plus local cache: display CDN; external open uses
      CDN.
- [x] Remote-first, expired CDN plus local cache: display falls back to Blob;
      external open uses the operating system's default file app.
- [x] Live CDN without local cache: remote display/open works and caching starts.
- [x] No usable CDN and no local cache: native mounts and Logger-owned views show
      their placeholder/classified text; no broken modal; external open warns
      and launches nothing.
- [x] Local-only plus local cache: display Blob; external open uses the resolved
      local path through the default file app without a CDN request.
- [x] Local-only without local cache: native mounts and Logger-owned views show
      their placeholder/classified text; no CDN display/probe/open; external
      open warns and launches nothing.

The Stage 4 focused checks above are complete in deterministic coverage. The
separate Stage 7 runtime checklist remains open until the live-synced build is
exercised in Discord.

### Stage 4 local result

- **Implementation:** Added strict HTTP(S) and physical-file Electron launch
  helpers, a bounded native-only range probe, remote/master/local-only policy,
  exact canonical current/removed attachment descriptor resolution, and one
  Logger-owned menu/viewer route labelled **Open Attachment**. Existing image,
  video, audio, and generic attachment open points use the same policy without
  gaining a new renderer. Exact ImageUtilities and Discord native open actions
  are rerouted only for the owned saved attachment; embeds, stickers,
  components, authored links/text, avatars, and ordinary Discord actions are
  left untouched. Blob/file URLs never reach Electron.
- **Lifecycle:** Exact concurrent probes share only their active request; no
  settled liveness result persists. Stop and media-policy transitions abort or
  invalidate probes. Native-viewer descriptors bind only to the matching active
  Logger-owned modal key or the exact asynchronously mounted dialog/media
  source and clear on close, source mismatch, timeout, teardown, or stop.
- **Validation:** `npm run check` passed; `tests/media.test.js` passed
  `156/156`; `tests/clipboard.test.js` passed `16/16`; source contracts passed
  `68/68`; full `npm test` passed `561/561`; plugin/test syntax and
  `git diff --check` passed. The
  repository plugin SHA-256 is
  `9cf2fad325fe7d4ea4f234bfbf1fc1c632692ff487d5f273f1fdfcd054f365f1`.
- **Accepted gate:** the user verified the two previously escaping native
  controls and ordinary Discord isolation. The disposable trace artifacts are
  removed from the live/repository locations and retained recoverably in
  Trash. Final Sol-parent review found no correctness, security, ownership, or
  platform-specific routing issue; the requested independent reviewer could
  not start because the runtime reported stale thread capacity.

## Stage 5 - Off to On rehydration

- [x] Rename the visible switch from **Cache media locally** to
      **Render & Cache media**, retaining the `cacheAllImages` id.
- [x] Reword its existing linked note briefly: On renders and caches media and
      retries saved live URLs; Off shows placeholders and keeps child values;
      retain the existing **Disable saving data** queue warning.
- [ ] Trigger only on a real Off to On transition.
- [ ] Scan only deleted records' ordinary attachments that are eligible under
      Logger's existing cache-support settings and predicates. Include every
      currently supported type rather than restricting the pass to images.
- [ ] De-duplicate work and skip existing files, unsupported types, and all
      other out-of-scope media.
- [ ] Try the exact preserved direct URL, then a distinct proxy URL.
- [ ] Skip cleanly when neither accepted stored HTTP(S) candidate exists; do
      not reconstruct a URL, persist a Blob/file URL, or mutate the canonical
      attachment merely to make it fetchable.
- [ ] Respect existing size, cancellation, no-save, epoch, request-sharing, and
      atomic-write contracts.
- [ ] Refresh presentation once after immediate/deferred completion as
      appropriate.
- [ ] Confirm Off during the batch cancels without retry or late write.
- [ ] Add no persisted unavailable marker or schema field.
- [ ] Do not broaden file-type eligibility in this stage. A later explicit
      all-file-types support/acceptance gate remains separate work.

### Stage 5 focused checks

- [ ] Each file type Logger supports when Stage 5 begins is represented in the
      hydration matrix: a recent stored URL is re-cached and appears after Off
      to On, subject to the existing eligibility setting for that type.
- [ ] Expired direct URL falls back to a distinct live proxy when available.
- [ ] Both URLs unavailable and no existing local file leaves exact classified
      placeholder text in native and Logger-owned views.
- [ ] Existing local files are not downloaded again.
- [ ] No startup-wide backfill occurs merely because the saved setting is On.
- [ ] A later real Off to On may retry a prior transient failure without a
      persisted schema marker.

## Stage 6 - Automated verification

- [x] Cover the master/local-only display matrix for detached render clones and
      prove canonical records retain their direct/proxy URLs.
- [x] Cover immediate master/child refresh of selected native rows, the main
      Logger, every registered deleted thread modal, and edit-history wrappers.
- [x] Cover remote display failure to Blob, local-only remote bypass, Blob
      cleanup, and exact no-source `[image:filename.ext]` versus
      `[attachment:filename.ext]` classification in native and Logger views.
- [x] Prove the label classifier reuses the existing image predicate: current
      JPG/JPEG, PNG, GIF, BMP, WebP, AVIF, TIF/TIFF cases use `[image:...]`,
      while TXT, PDF, video, audio, and other direct files use `[attachment:...]`.
- [x] Cover missing/unsafe filenames with a safe basename or `unknown file`
      without allowing markup/HTML interpretation.
- [x] Cover liveness success/failure/timeout, duplicate-click sharing,
      generation cancellation, cross-platform `shell.openExternal()` versus
      `shell.openPath()` routing, nonempty open-path errors, and missing-file
      failure with a warning toast and without opening a Blob externally.
- [ ] Prove Off to On hydrates only eligible missing files for every currently
      supported saved attachment type through the preserved URL order and
      existing safe write pipeline, with an unsupported-type control that is
      not broadened into eligibility.
- [x] Lock `newSaveAllFileTypes` eligibility/cache behavior and prove no new
      arbitrary-file renderer, player, or cache route was introduced.
- [x] Run `npm run check`.
- [x] Run the directly affected test files during implementation.
- [x] Add regression tests for every deterministic behavior changed above.
- [x] Confirm `package.json` still limits full-suite test entry discovery to
      `tests/*.test.js`, with no test entries selected from any other folder.
- [x] Run `npm test` after the complete implementation and record the exact
      passed/failed/total counts.
- [x] Run `git diff --check`.
- [x] Review the final diff for unrelated edits, release metadata, persisted
      Blob/file URLs, and accidental host-specific assumptions.

### Stage 6 result

- **Focused commands/results:** `tests/media.test.js` `155/155`,
  `tests/clipboard.test.js` `16/16`, `tests/source-contracts.test.js` `68/68`,
  and `npm run check` all pass under the parent.
- **Full suite:** `npm test` passes `560/560` with zero failures.
- **Diff check:** `git diff --check` passes. Final Sol-parent review found no
  unrelated edit, release metadata change, persisted Blob/file URL, or
  platform-specific launch branch.

## Stage 7 - Focused live verification

Use one ordinary text channel, one known older cached image, and one recent live
CDN image for the full behavior matrix. Then perform only a mount/unmount smoke
check in a DM and one open forum-post chat; deterministic tests cover group DMs
and ordinary channel threads that share the same native row path.

- [x] **Local-only On:** mounted restored row, Logger window, and deleted
      forum/thread log modal render a fresh Blob only; **Open Attachment** opens
      the resolved cache file in the operating system's default app; no CDN
      presentation/probe occurs.
- [x] **Local-only Off, live CDN:** the same surfaces render the CDN first and
      **Open Attachment** opens the preserved `https://cdn.discordapp.com/` URL.
- [x] **Local-only Off, expired CDN:** image load falls back to the cached Blob
      and **Open Attachment** falls back to the default app for the resolved
      local cache path.
- [x] **Live child-toggle round trip:** with the cache master remaining On and
      the same saved image still mounted, switch local-only Off -> On without a
      reload and confirm CDN presentation changes immediately to Blob-only plus
      direct default-app local opening. Switch On -> Off and confirm it immediately
      returns to CDN-first rendering/opening when the URL is live, or to the
      Blob/default-app local fallback when that URL is expired.
- [x] **Cache Off:** every currently visible native mounted saved-attachment node
      is removed immediately; native saved-message rows, Logger/main, and
      deleted forum/thread log views show `[image:filename.ext]` for a current
      image and `[attachment:filename.ext]` for a representative non-image
      direct attachment; any Logger-owned media viewer closes; cache files
      remain; deleting a new image creates no cache file.
- [x] **Cache back On presentation:** a prior local image follows the selected
      child policy and an expired no-local image shows its placeholder in native
      and Logger-owned views.
- [ ] **Cache back On hydration:** a recent uncached deletion is retried and
      cached from its stored direct or distinct proxy URL. This remains the
      separate Stage 5 implementation/live gate and is not inferred from the
      repeatedly accepted presentation matrix.
- [x] **Mount coverage smoke:** repeat the master Off/On presentation refresh in
      one DM and one open forum-post chat. Confirm the forum list/sidebar/browser
      text-only entries remain present.
- [x] **Hot reload/Cmd+R:** local images receive valid regenerated Blob URLs and
      no stale/revoked Blob remains clickable.
- [x] **Unavailable external open:** expired CDN plus no existing local file
      opens nothing and shows the concise unavailable warning toast.
- [x] Check `debug.log` and optional `console.log` for new Logger errors.

Relevant matrix coverage: focused portions of `RT-09`, `RT-11`, `RT-13`, and
`RT-26`. Shared deterministic coverage plus the DM/forum-post smoke replaces a
full setting matrix in every channel type.

### Stage 7 result

- **Accepted repeated coverage:** the user has now exercised the presentation,
  child/master toggle, mount-coverage, hot-reload, unavailable-open, and global
  Stage 4 routing paths repeatedly across the later Stage 3/4 live gates and
  explicitly accepted this historical matrix as complete. The earlier native
  **Open Link** / **Open in Browser** partial failure was subsequently traced,
  corrected through the global attachment policy, and accepted.
- **Last accepted pre-point-3 checkpoint:** commit
  `9dfd6d85be45072f85441d378db38858b1aba1a6`; repository/live plugin hashes
  matched at
  `f4dc7aa4bdc225c7b80094e9aa0d6438cce3fafb4b88c38c894ebd876d033b62`
  before the current unsynced TXT/PDF Gate 3.1 work began.
- **Remaining distinct live gates:** only behavior newly introduced after that
  acceptance must be smoke-tested: Stage 3 point 3 TXT/PDF live Blob and Logger
  viewer paths, plus the future Stage 5 Off-to-On hydration behavior. Those are
  not grounds to repeat the completed image/video/audio matrix.

## Stage 8 - Final gate and handoff

- [x] Re-run `npm test` after any live-found correction.
- [x] Re-run `git diff --check`.
- [x] Sync only `MessageLoggerV2.plugin.js` to the live plugins folder.
- [x] Compare repository/live hashes.
- [x] Remove all disposable trace helpers, symlinks, and generated reports.
- [x] Present the exact changed files, automated results, live results, and any
      remaining limitation to the user.
- [x] Wait for user acceptance before any separately requested commit/push or
      release work.
- [x] After current release acceptance, keep the deferred warning pass below
      paused for a later session and leave this checklist in the repository
      root.

## Stage 9 - Final post-cleanup media-cache warning identity

This is a deliberately deferred diagnostic-polish pass, with one optional
Webpack-availability compatibility cleanup. It starts only after Stages 4-8
are accepted and must not change caching eligibility, request order, retry
behavior, persistence, rendering, or external-open behavior.

- [ ] Replace unhelpful warnings such as
      `Image null unavailable (403), skipping cache` with a concise identity for
      the actual failed media request.
- [ ] Prefer a known attachment/sticker/component filename or label. When none
      exists, derive a safe decoded basename from the URL path; when that is
      also absent, identify the sanitized hostname and media kind/index instead
      of printing `null`.
- [ ] Retain the HTTP status and terminal action/reason so the warning still
      explains why caching stopped.
- [ ] Never include URL query parameters, fragments, signatures, tokens, or
      credentials in the normal warning. Any hostname/path hint must be parsed
      from an accepted HTTP(S) URL, strip control characters, and be bounded in
      length so console markup/log injection cannot obscure the message.
- [ ] Apply the same identity helper to related terminal cache warnings where
      they currently interpolate only a nullable attachment id, without
      increasing retry-log noise or changing warning levels.
- [ ] Cover ordinary attachments, stickers, embeds, Components V2 media, null
      source ids, malformed URLs, Unicode/spaces, query redaction, control
      characters, and a hostname-only fallback in deterministic tests.
- [ ] Confirm ordinary successful caching and request/retry/cancellation paths
      are byte-for-byte behaviorally unchanged apart from diagnostic text.
- [x] **Optional Webpack availability cleanup:** inventory Logger's semantic
      Discord-module lookups that can remain unresolved because their owning
      lazy entry has not loaded. Use live trace evidence to identify each exact
      owning entry; do not generalize from minified export names or keys.
      The permanent audit now covers all 53 `DiscordModules` lazy getters and
      the broader 89-contract Logger/host/runtime inventory. Only the
      trace-proven `MessageAccessories` owner is used for native document and
      audio discovery; no speculative owner was added.
- [x] For each trace-proven entry, keep the existing semantic resolver first.
      If it misses and `BdApi.Utils.loadEntry` exists, allow a guarded,
      deduplicated best-effort load either during Logger startup warm-up or
      immediately before the feature's first use, then retry that same semantic
      resolver. Never bulk-load arbitrary Discord entries. Native document and
      audio paths retain semantic-first discovery and share only their own
      guarded in-flight load attempt.
- [x] If `loadEntry` is unavailable, rejects, returns null/empty, completes
      without revealing the target, or Logger stops before completion, retain
      the feature's current resolver/mount fallback unchanged. Do not cache a
      miss permanently, use stale post-stop results, or suppress a still-valid
      missing-module warning. Generation checks, promise-identity cleanup, and
      retryable misses preserve that behavior.
- [x] Cover the optional loader path with focused tests for already-resolved,
      successful load-and-retry, unavailable API, rejection, null/empty result,
      post-load unresolved, shared concurrent request, and stop/restart cases;
      confirm upstream BetterDiscord remains supported without the new API.
      The compatibility work passed `npm run check`, full `npm test` `667/667`,
      and `git diff --check` at published commit `670d6de`; the final live audit
      also reported `Webpack.OptionalLoadEntryTransition` pass with both native
      targets already loaded and therefore no unnecessary load attempt.
- [ ] Run the focused media-cache warning tests, `npm run check`, `npm test`, and
      `git diff --check`; sync only the plugin, compare hashes, and inspect the
      hot-reload log before user acceptance.
- [ ] After any later Stage 9 acceptance, keep this checklist in the repository
      root unless the user separately requests archival.

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
  `26f8558b6559a440ca6631ca44ececfcf767a612`; its scope is exactly the plugin,
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

- After `d8cded3`, the user tested newly uploaded and deleted images in normal
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

### 2026-08-17 - Master Off-to-On stale placeholder correction ready for live gate

- The earlier runtime trace already proved the master On transition dispatches
  the correct Blob attachment with empty content. The remaining visible defect
  is that Discord temporarily retains the preceding classified placeholder in
  its live message content while mounting the new attachment; no additional
  Blob-performance trace is needed unless this targeted correction fails live.
- Saved attachment rows now provide the current presentation content through a
  detached `MessageContent` render input. This removes the stale placeholder in
  the same render that mounts available media without mutating MessageStore or
  canonical Logger data and without sending a protected forum/thread root a
  synthetic `MESSAGE_DELETE`.
- The correction is content-only, requires an actively presented saved
  deletion with canonical attachments, and skips Discord reply-preview content.
  Ordinary text mounting, forum/thread root promotion, source ordering,
  persistence, settings, embeds/stickers, and Stage 4 external opening remain
  unchanged.
- BetterDiscord `develop` and `upstream-development` use the same supported
  before-patch argument mutation contract required by this render-only input.
- Parent validation passes `npm run check`; the affected media,
  live-mount-setting, and source-contract suites at `194/194`; the bounded full
  `tests/*.test.js` suite at `513/513`; and `git diff --check`. Sync only the
  plugin next, then test master Off-to-On on the existing cached forum image.

### 2026-08-17 - Master Off-to-On missing content callback corrected locally

- A compact follow-up trace captured 123 events for forum message
  `1538840760789504031` in channel `1538832876395569233`. At `09:55:12.691`,
  Discord received the expected empty-content update with one Blob attachment;
  at `09:55:12.692`, MessageLogger dispatched its content refresh. The saved row
  reported `registryCallbackCount: 0`, and delayed DOM samples still contained
  the placeholder until Discord performed a later broad rerender.
- This proves the residual delay was neither a dead Blob nor incorrect source
  selection. The presentation helper already returned empty content for the
  Blob state; the mounted deletion-only row simply had no content callback to
  consume that transition.
- Saved attachment message content now stays inside a lightweight mounted React
  boundary. It registers the same per-message callback set already used by
  content refresh events, recomputes only a detached render message, and
  unregisters on unmount. A re-entry marker prevents recursive wrapping while
  still allowing the existing edit-history and deleted-tooltip branches to run.
- The functional regression covers placeholder-to-Blob and Blob-to-placeholder
  detached content without mutating the live or canonical message. Source
  contracts pin callback registration/cleanup, reply-preview exclusion,
  re-entry ordering, and null-safe existing wrappers.
- Parent validation passes `npm run check`; the focused media,
  live-mount-setting, and source-contract suites at `194/194`; full `npm test`
  at `513/513`; and `git diff --check`. No test outside `tests/*.test.js` ran.
- The trace helper, live symlink, and report are removed. Only the plugin was
  synced live; repository/live SHA-256 is
  `1dbd3e8043d10e50b8779a8476ea5b1ca2fc28dfa9dd12ca5164171853428605`,
  and BetterDiscord hot-reloaded without a new MessageLogger exception. The one
  same-forum master Off-to-On live gate is ready; do not commit or push until
  the user confirms it.

### 2026-08-17 - Latest master-toggle trace supersedes callback diagnosis

- The user confirmed the mounted wrapper build still leaves the exact
  placeholder visible for a variable period during master Off-to-On. A second
  console-only trace produced 147 events for the same forum message
  `1538840760789504031` and attachment `Synology_AUX.png`.
- This newer trace supersedes the preceding zero-callback diagnosis. The saved
  row contains `SavedAttachmentPresentationContent`, reports
  `registryCallbackCount: 1`, and invokes the presentation helper. With the
  master enabled, that helper correctly converts the retained
  `[image:Synology_AUX.png]` input to empty content while the presentation has
  the valid cached Blob attachment.
- Discord nevertheless retains the placeholder in MessageStore and the DOM
  after the empty-content Blob `MESSAGE_UPDATE`; only a later broad recache
  clears it. The duration observed by the trace is runtime-dependent and must
  not become a delay constant.
- The bounded correction is event-driven and applies only to protected
  Discord-owned forum/thread attachment mounts whose desired final content is
  empty and whose currently mounted content exactly matches the generated
  attachment placeholder. Arm a per-message `MutationObserver`, send a truthy
  internal sentinel with no attachments to make Discord accept placeholder
  removal, and send the recomputed Blob presentation only after that exact
  placeholder node is absent. If the row is not mounted, proceed immediately.
- Pending transitions must be tokenized and cancelled on a newer transition,
  setting change, presentation reset, or plugin stop. Before the final dispatch,
  recheck the current record and settings. The existing render wrapper must
  prevent the sentinel from appearing to the user. Do not use `setTimeout`, a
  hardcoded millisecond delay, a fixed number of animation frames, or a
  synthetic `MESSAGE_DELETE`.
- Current trace artifacts intentionally remain available for handoff:
  `tmp/MessageLoggerForumMediaTransitionTrace.plugin.js`, its exact live
  BetterDiscord symlink, and
  `MessageLoggerForumMediaTransitionTrace-report.json`. Remove all three after
  the correction no longer needs runtime evidence.
- No implementation for this final correction has been made. The resumed
  session could not spawn the configured Spark worker because the runtime
  reported the agent-thread limit reached. Continue with a fresh session and a
  micro-sliced worker assignment, unless the user explicitly authorizes the
  parent to implement. The current four tracked modifications remain
  uncommitted, and `develop` remains six commits ahead of `origin/develop`.

### 2026-08-17 - Event-driven master-toggle transition passes local gates

- Reconstructed the handoff from this complete checklist and the referenced
  session's final trace/decision window, then reverified `develop`, HEAD
  `7074e129692d15af91619430431dc40b229b9f04`, the four-file tracked scope,
  trace artifacts, and the preceding repo/live plugin hash parity.
- Implemented one protected forum/thread-only two-phase transition. Eligibility
  requires the live MessageStore content and exact mounted message-content node
  to equal the generated attachment placeholder while the detached canonical
  presentation is naturally empty-content and Blob-only. Store attachments may
  already contain the Blob, matching the runtime trace.
- The transition observes the exact message row before sending a truthy internal
  content sentinel with zero attachments. The mounted presentation wrapper
  hides the sentinel. Observer callbacks re-query the exact row/content node;
  only after the placeholder is absent do they validate the current token,
  record, settings, and presentation and dispatch a freshly recomputed Blob.
  An unmounted row or unavailable observer uses the existing immediate final
  update.
- A newer same-message transition, presentation reset, either media-setting
  change through reset, and plugin stop disconnect and invalidate pending
  observers. The implementation adds no timeout, polling loop, fixed animation
  frame count, synthetic `MESSAGE_DELETE`, persisted marker, schema field,
  version, changelog, or source-order change.
- Deterministic coverage models canonical content separately from the live Store
  placeholder-plus-Blob state, real content-node replacement under a row
  observer, fresh Blob recomputation, unmounted/observer-unavailable fallback,
  newer-transition/reset/stop cancellation, stale callbacks, sentinel hiding,
  canonical/Store immutability, and structural no-timer/no-delete contracts.
- Parent verification passes `npm run check`; the focused
  `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` run at `197/197`; bounded `npm test` at
  `516/516`; and `git diff --check`. Parent review also corrected three isolated
  source-contract slicing/assertion defects before these final results.
- The verified repository plugin SHA-256 is
  `563d6ba2ca1dc97e0ded11c2b86d49c9365f98f3f77ee22cd9b7fc6b246ec97a`;
  the installed plugin remains the prior wrapper build at
  `1dbd3e8043d10e50b8779a8476ea5b1ca2fc28dfa9dd12ca5164171853428605`.
  Live sync and the one same-forum Off-to-On test are next. Nothing is committed
  or pushed.

### 2026-08-17 - Pending-transition cancellation race closed locally

- An independent final review found that a saved-message display or Hidden
  state change could invalidate a pending observer after the sentinel reached
  MessageStore. The old callback removed its transition state before checking
  visibility, which could strand or expose the literal sentinel instead of
  restoring the pre-transition placeholder presentation.
- Protected two-phase arming now requires
  `shouldPresentSavedMessage(channelId, messageId) === true`. A disabled or
  hidden saved record receives neither the sentinel nor a final Blob update.
  The pending state retains a detached rollback payload containing the exact
  pre-sentinel Store placeholder and attachments.
- Cancellation marks the state stale, disconnects its observer, and dispatches
  that rollback only while the exact current Store content is still the plugin
  sentinel. The state remains available to the render wrapper during the
  synchronous rollback dispatch, and guarded deletion cannot remove a newer
  state armed reentrantly for the same message.
- Saved-message display-setting cache refreshes cancel all transitions before
  invalidation. Hide/Unhide cancels the exact record before changing Hidden
  flags. Final observer callbacks now validate current ownership, record
  identity, visibility, media settings, and a freshly recomputed Blob-only
  presentation before removing state; every invalid outcome uses the rollback
  cancellation path.
- The Spark retry left the bounded correction and tests in the shared checkout
  but stalled before reporting. Per the user's direction, the parent integrated
  the small remaining fixes: corrected the interrupted test contracts, kept
  MessageStore mutation simulated rather than performed by plugin code, and
  added the reentrant state-deletion guard. A fresh read-only review found no
  remaining correctness issue.
- Parent validation passes `npm run check`; the focused
  `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` run at `199/199`; full `npm test` at
  `518/518`; and `git diff --check`. Version `2.8.2.18`, changelog, schema,
  source ordering, ordinary-row `MESSAGE_DELETE`, and Stage 4 remain unchanged.
- The repository plugin SHA-256 is now
  `669013ace2db662de0d811dbc1e20b7462fa167c319179b9d4558c045fff0320`;
  the installed plugin is still
  `1dbd3e8043d10e50b8779a8476ea5b1ca2fc28dfa9dd12ca5164171853428605`.
  Sync only the plugin next, inspect the hot reload, then run the one same-forum
  local-only master Off-to-On live gate. Keep all trace artifacts until that
  gate passes; do not commit or push beforehand.

### 2026-08-17 - Stage 3 final hanging-fruit build synced for live gate

- Synced only `MessageLoggerV2.plugin.js`; repository and installed SHA-256 now
  match at
  `669013ace2db662de0d811dbc1e20b7462fa167c319179b9d4558c045fff0320`.
  Discord was not relaunched.
- The 11:16 hot reload removed the old MessageLogger patches, completed its UI
  cleanup, reapplied the current patches, refreshed exact target channel
  `1538832876395569233`, and reattached
  `MessageLoggerForumMediaTransitionTrace`. No new MessageLogger error or
  exception appeared after initialization.
- One simultaneous `PersonalPins` dispatch error remains unrelated to this
  plugin and predates the MessageLogger initialization sequence.
- This is the final Stage 3 hanging-fruit live gate: remain in the same cached
  forum/thread with local-only rendering On, turn **Render & Cache media** Off,
  verify the exact classified placeholder, then turn it On. The placeholder
  must disappear before the cached Blob mounts, with no literal internal
  sentinel, overlap, or variable lag.
- Keep the trace helper, live symlink, and report until the user confirms this
  gate. After confirmation, remove those three artifacts, record the result,
  commit only the four tracked Stage 3 files, and push `develop` only. Do not
  start Stage 4, change release metadata, merge, tag, or publish a release.

### 2026-08-17 - Visible internal transition marker removed locally

- The live gate materially improved the transition and mounted the cached image,
  but briefly exposed text beginning with `_mlv2Saved` before that image
  appeared. The user considered the result acceptable and left this final polish
  decision to the implementation review.
- The retained trace is decisive: for exact message
  `1538840760789504031`, the Store accepted the internal sentinel; about 21 ms
  later `SavedAttachmentPresentationContent` returned empty rendered content,
  yet Discord's native message-content path committed the literal raw Store
  value roughly 120 ms later. The row observer then saw the classified
  placeholder was gone and dispatched the final empty-content Blob
  presentation. This proves the helper and observer ordering work, while one
  native render path can bypass the helper for the intermediate Store update.
- Kept the required truthy Store transition but replaced the readable internal
  marker with the single intrinsically invisible U+2063 INVISIBLE SEPARATOR
  (`'\u2063'`). The existing render wrapper still maps that exact value to an
  empty string, and a bypassing native surface can no longer expose plugin
  implementation text. No timer, polling, fixed-frame wait, schema field,
  version, changelog, Stage 4 behavior, or ordinary-row path changed.
- Added deterministic contracts proving the sentinel is one truthy zero-width
  character, is not trimmed away as whitespace, contains no readable ASCII
  identifier, and remains the exact source assignment expected by the wrapper.
- Parent validation passes `npm run check`; the focused
  `tests/media.test.js`, `tests/live-mount-settings.test.js`, and
  `tests/source-contracts.test.js` run at `199/199`; full `npm test` at
  `518/518`; and `git diff --check`.
- The repository plugin SHA-256 is
  `c9c093b7248c2377d56f17b85c4d9758404556de573f854284f714dadd7db56e`;
  the installed plugin now matches that hash. Discord was not relaunched.
- The 21:23 local hot reload removed the previous patches, completed its UI
  cleanup, reapplied the current patches, refreshed target channel
  `1538832876395569233`, and reattached the transition trace helper. No new
  MessageLogger error or exception appeared. The simultaneous `PersonalPins`
  dispatch error is the same unrelated external-plugin failure seen at the
  preceding sync.
- Repeat the same one-message Off-to-On live gate before cleaning trace
  artifacts, committing, or pushing. The classified placeholder may become a
  momentary blank state while the Blob mounts, but no readable `_mlv2Saved...`
  marker may appear.

### 2026-08-17 - Stage 3 final live gate passed

- The user repeated the exact same-forum local-only **Render & Cache media**
  Off-to-On gate with the zero-width transition build and confirmed the visible
  `_mlv2Saved...` marker is gone. The cached image still mounts after the
  placeholder transition, closing the remaining Stage 3 hanging-fruit defect.
- Removed the now-unneeded disposable trace source
  `tmp/MessageLoggerForumMediaTransitionTrace.plugin.js`, its exact BetterDiscord
  plugins-folder symlink, and
  `MessageLoggerForumMediaTransitionTrace-report.json`. These artifacts were
  local-only runtime evidence and remain untracked.
- Repository and installed plugin SHA-256 remain identical at
  `c9c093b7248c2377d56f17b85c4d9758404556de573f854284f714dadd7db56e`.
  Stage 3 is accepted for its four-file commit and `develop` push. Do not merge,
  tag, publish a release, change version/changelog metadata, or begin Stage 4
  implementation inside the Stage 3 commit.

### 2026-08-17 - Pre-Stage 4 media-master note styling completed

- At the user's request, the **Render & Cache media** note now renders the
  embedded **Off-to-On transition** with **Off** through the existing danger
  state label and **On** through the existing positive state label. The wording,
  setting id, setting behavior, and the note's other state labels are unchanged.
- Extended the deterministic source contract to require those exact semantic
  label calls and replaced its brittle fixed-length setting lookup with the
  setting's actual `name` boundary. RT-11 now includes the visual requirement.
- `npm run check`, focused `tests/source-contracts.test.js` at `68/68`, full
  `npm test` at `518/518`, and `git diff --check` pass.
- Synced only the plugin without relaunching Discord. Repository and installed
  SHA-256 match at
  `ceaa39c043c00cda0d872afa58265f727e81a9addedeab7e1b92348e3bc074a7`;
  the 11:30 hot reload completed patch removal, initialization, and UI refresh
  without a new MessageLogger error. Stage 4 implementation remains untouched.

### 2026-08-17 - Stage 4 system-default opening contract reaffirmed

- The user explicitly requires Stage 4 to remain operating-system neutral. A
  validated remote HTTP(S) URL must be passed to Electron
  `shell.openExternal()` so the operating system chooses its configured default
  browser. A trusted resolved cache path must be passed unchanged to Electron
  `shell.openPath()` so the operating system chooses the application registered
  for that file type.
- The official Electron shell contract confirms `openExternal()` opens an
  external protocol URL in the desktop's default manner and `openPath()` opens
  a filesystem path in the desktop's default manner. `openPath()` resolves to
  an empty string on success and a nonempty error string on failure.
- Read-only BetterDiscord comparison confirmed that fork `develop`
  `e5657da0f049ec1ad0b7565118699eab04c76c35` and both local upstream development
  refs at `49e7f14222b8bcc00c144e8d760b6751e3f0ba8d` expose the same Electron shell
  bridge to plugins through `require('electron')`. The plugin already stores
  that supported bridge in `this.nodeModules.electron`; no fork-only API is
  needed.
- Stage 4 must not branch on the platform, launch a shell command, discover a
  browser/viewer executable, use BetterDiscord's internal Windows-specialized
  IPC path, convert a cache path to a `file:` URL, or hand a `blob:` URL to an
  external application. Missing APIs, rejected calls, and nonempty
  `openPath()` results warn and launch nothing.
- Parent-owned implementation order is: first add the isolated resolver,
  one-byte native liveness probe, cancellation, and guarded Electron launch;
  then add exact saved-direct-image action sourcing; finally wire only the
  Logger-owned mounted/viewer context-menu seams. Each slice receives focused
  tests and parent verification before the next begins.

### 2026-08-17 - Final post-cleanup cache-warning identity deferred

- The user's console screenshot shows repeated MessageLogger warnings in the
  current form `Image null unavailable (403), skipping cache`. The adjacent
  `AnalyticsTrackingStore` failures belong to Discord and are outside this
  plugin cleanup.
- Source inspection traced the MessageLogger text to the terminal 403/404 path
  in `cacheImage()`: it interpolates only `attachmentId`, while indexed embed
  and component media may legitimately lack a derived source id. That makes
  `null` a diagnostic-identity defect, not proof that the cache request itself
  lacked a URL.
- The user explicitly deferred this polish until the final post-cleanup stage.
  Stage 9 will prefer a known safe filename/label, otherwise use a sanitized
  URL-path basename or hostname plus media kind/index. Normal warnings must
  redact queries, fragments, credentials, signatures, and tokens, retain the
  status/reason, and make no network, caching, rendering, or retry change.

### 2026-08-17 - Stage 4 shell and liveness foundation parent-verified

- Added guarded, operating-system-neutral launch helpers only. HTTP(S) values
  pass unchanged to Electron `shell.openExternal()`; existing physical files
  pass unchanged to Electron `shell.openPath()`. Blob/file/other URL protocols,
  missing APIs, non-files, rejections, synchronous throws, and every nonempty or
  unexpected `openPath()` result fail closed and log one concise diagnostic.
- Added a separate native-network liveness probe with a ten-second default
  bound, `GET` plus `Range: bytes=0-0`, exact-URL in-flight sharing, no settled
  result cache, response-body release, and late-response cleanup when
  `AbortController` is absent. Stop, master transitions, and either local-only
  transition increment its generation, clear the map, and abort where possible.
- No helper is called from a menu or viewer yet. No toast, source selection,
  descriptor policy, display behavior, cache write, persistence, or native
  viewer field changed in these foundation slices.
- Parent verification passes plugin/test syntax, the exact saved-media shell and
  probe selection at `14/14`, `npm run check`, and `git diff --check`.

### 2026-08-17 - Stage 3 reopened for deleted MP4 native mounts

- While the Stage 4 policy slice was already isolated and active, the user
  reported that a newly uploaded then deleted MP4 remains stuck as its
  attachment placeholder on the restored live Discord mount with local-only
  either Off or On. The same saved MP4 renders correctly in Logger views.
- This narrows the defect to the native saved-message video mount/refresh path;
  it does not yet identify whether the failing boundary is Store attachment
  state, detached video shape, source selection, transition timing, or mounted
  DOM behavior.
- The user later superseded the initial pause point: complete, validate, and
  live-sync Stage 4 for images before returning to the MP4 trace. Do not copy
  the image fix by analogy or alter the accepted Stage 4 behavior during the
  later video correction.

### 2026-08-17 - Static media-format boundary mapped for the live matrix

- MessageLogger's current extension/path classifier claims JPG/JPEG, PNG, GIF,
  BMP, WebP, AVIF, TIF/TIFF as images and MP4, WebM, MOV, AVI, MKV as videos.
  Its Logger view uses dedicated `img`/`video` elements for those classes.
- Direct saved-attachment presentation classification does not currently use
  attachment MIME as a fallback. MIME is used only for a smaller extensionless
  cache-write map; `video/mpeg` and `audio/mpeg` there do not establish a
  dedicated native or Logger renderer.
- Audio has no MessageLogger `isAudio` classifier or custom audio element.
  Discord may still render audio through its native generic-attachment path, so
  native audio support must be discovered and reported separately.
- Restored live rows pass detached attachment objects to Discord's own renderer,
  whereas Logger views construct their own DOM. This matches the user's MP4
  observation: a successful Logger video does not prove the native restored row
  accepted the same detached attachment/container/codec.
- The complete live matrix will exercise every claimed extension in both
  remote-first and local-only modes, record video container plus codec, include
  discovered native audio formats, and use PDF/TXT as non-media controls.
  Existing RT-09 covers only a representative deleted-video/fallback case, not
  this full format matrix.
- Discord's current first-party File Attachments FAQ gives examples rather than
  an exhaustive renderer list. It specifically identifies MOV and MP4, and for
  MP4 names H.264/AVC, HEVC/H.265, and AV1. Its separate current Windows codec
  guidance confirms attachment playback can depend on operating-system codec
  availability, so one desktop result cannot be generalized blindly.
- Discord's developer message schema identifies attachment MIME plus image/video
  dimensions, and documents current voice messages as Opus in an OGG container.
  The first-party File Preview article separately documents small plain-text
  previews. Add MP4 codec variants, OGG/Opus voice/audio, MP3, MOV, and TXT to
  the discovery matrix while retaining an explicit “documented example” versus
  “live native render verified” distinction.

### 2026-08-17 - Stage 4 saved-image external opening completed locally

- Implemented the complete image-only action path. Exact saved direct or
  removed attachment targets resolve a detached descriptor carrying preserved
  direct/proxy HTTP(S) candidates and the existing cache resolver's exact local
  path. Blob remains display-only.
- Master Off probes/opens only the retained direct candidate. Master On plus
  remote-first tries direct then distinct proxy and falls back to the existing
  local file only after liveness failure. Local-only performs no probe and
  opens only the freshly verified physical file.
- Remote URLs use Electron `shell.openExternal()` and local paths use
  `shell.openPath()` unchanged, leaving browser/application choice to the host
  operating system. No platform branch, executable discovery, shell command,
  `file:` conversion, or Blob launch exists.
- Added exact mounted-row, Logger custom-view, edit-history, and Logger-opened
  native-viewer descriptor seams. The native/ImageUtilities action is rerouted
  only for a Logger-owned saved image; a stable Logger fallback is inserted
  when no recognized open action exists. Ordinary Discord, videos, audio,
  embeds, stickers, components, avatars, errors, mismatches, and ambiguous
  targets remain outside the action.
- Kept native-only probing inside the existing network-call boundary with an
  explicit native-only mode that never selects renderer fetch, mutates cache
  transport compatibility, or emits cache-routing diagnostics.
- Parent validation passed `npm run check`, probe selection `7/7`, clipboard
  `16/16`, source contracts `68/68`, full `npm test` `554/554`, syntax checks,
  and `git diff --check`. Repository/live sync and focused runtime acceptance
  are the remaining Stage 4 gates.

### 2026-08-17 - Stage 4 image build synced for the live gate

- Synced only `MessageLoggerV2.plugin.js`. Repository and installed SHA-256
  both equal
  `de5d22687f3c5b5449f9bf8bc24a1b9ad13f9a31c959a4868f27db9fc15439fa`.
- BetterDiscord hot reload logged MessageLogger patch removal, initialization,
  patch application, and both UI force-update completions without a new
  MessageLogger error. The concurrent `PersonalPins` dispatch error is from
  that separate plugin.
- No Discord relaunch, trace helper, commit, push, merge, version/changelog
  edit, tag, or release occurred. The four focused image checks and user
  acceptance remain before the Stage 4 commit gate.

### 2026-08-17 - Stage 4 generalized global attachment policy ready for live sync

- Generalized the already-proved image opener into one `Open Attachment`
  policy for every existing Logger-owned canonical current/removed attachment
  target: raw Logger views, restored native message/image menus, the exact
  ImageUtilities action when present, and the Logger-owned native media viewer.
  The descriptor and policy accept image, video, audio, and generic files while
  leaving renderer support to the existing Discord/Logger paths.
- Remote-first mode probes and opens the preserved/derived direct HTTP(S)
  candidate, then a distinct proxy, then an existing trusted cache path.
  Local-only mode performs zero remote probe/open work and uses only an existing
  physical resolver path through Electron `shell.openPath()`. Cache-master Off
  permits only its first canonical remote candidate. Electron and the operating
  system choose the default browser or registered file-type application; there
  is no platform branch, executable lookup, shell command, `file:` conversion,
  or external Blob launch.
- Hardened target ownership so authored URLs, masked links, filename text,
  embeds, stickers, Components V2 media, avatars, mismatched rows, ambiguous
  attachment ids/sources, and ordinary Discord media cannot borrow a Logger
  attachment descriptor. Explicit Logger attachment markers remain the
  authoritative exact-identity path.
- Kept the Logger action inside its own submenu and rerouted only the exact
  native Discord or ImageUtilities open action for an owned target. Mutable
  menu trees update in place; frozen descendant arrays/nodes are cloned through
  a mutable ancestor; an irreducibly frozen root fails closed because the local
  BetterDiscord context-menu callback is mutation-only.
- Bound native-viewer routing and the neutral label to the exact active
  Logger-owned modal key plus its display/Blob source. Tooltip rewriting follows
  only the owned open control's `aria-describedby` relation and restores every
  touched node on close/teardown; unrelated page tooltips and controls remain
  unchanged.
- Two sequential stale source-contract regexes were updated only after the
  user's explicit approvals. They now require attachment identity to flow into
  unavailable placeholders and preserve the tracked marker contract; no plugin
  behavior was changed by those test-only corrections.
- Parent validation passes `npm run check`; `tests/media.test.js` at `155/155`;
  `tests/clipboard.test.js` at `16/16`; `tests/source-contracts.test.js` at
  `68/68`; full `npm test` at `560/560`; plugin/test syntax; and
  `git diff --check`. Final Sol-parent review found no remaining correctness,
  security, ownership, or platform-specific routing issue. The requested
  independent reviewer could not start because the runtime reported stale
  thread capacity while only the root thread was visible.
- Repository plugin SHA-256 is
  `3694cf0fb27c27c42f336fc92116ba1e209143745e9bc7752f8a8c29b2acdc89`;
  installed SHA-256 remains the earlier image-only build at
  `de5d22687f3c5b5449f9bf8bc24a1b9ad13f9a31c959a4868f27db9fc15439fa`.
  Current root session ID is
  `01a00f41-b9c3-7841-b0e0-175368f05084`.
- Repeated the complete parent gate after the final handoff correction with the
  same passing counts. Then moved the unused saved-image helper, its verified
  exact live symlink, and the old 2.1 MB forum-transition report to Trash. No
  trace helper or generated report remains active; all three artifacts are
  recoverable from Trash.
- Controlled live sync, reload-log inspection, and user runtime acceptance
  remain. Nothing is committed or pushed.

### 2026-08-17 - Stage 4 generalized build synced for cross-surface gate

- Synced only `MessageLoggerV2.plugin.js`; Discord was not relaunched.
  Repository and installed SHA-256 match at
  `3694cf0fb27c27c42f336fc92116ba1e209143745e9bc7752f8a8c29b2acdc89`.
- The 13:33:16 BetterDiscord hot reload removed the preceding patches, finished
  the cleanup UI update, initialized the generalized build, applied all current
  patches, finished both post-initialization UI updates, and scheduled the
  shared cache trimmer. No MessageLogger error or exception appeared in the
  authoritative `debug.log` boundary.
- One simultaneous `PersonalPins` dispatch exception belongs to that separate
  plugin. The optional console exporter added one empty `WINDOW:ERROR` with no
  message, filename, line, or column; 10,275 identical empty exporter events
  already exist and this one has no `debug.log` counterpart, so it is not
  attributed to MessageLogger.
- The remaining Stage 4 gate is user-visible behavior: cached local-only open,
  remote-first open, restored Logger submenu, exact ImageUtilities action,
  Logger-owned native-viewer label/action, ordinary Discord isolation, and one
  non-image/MP4 placeholder open smoke test. Do not judge the known deleted-MP4
  native rendering defect here; that remains the reopened Stage 3 follow-up.
- Nothing is committed or pushed. After the user accepts this live build,
  commit and push Stage 4, then prepare the requested Downloads media fixtures
  before tracing the reopened Stage 3 format/rendering matrix.

### 2026-08-17 - Surviving native open controls isolated for live trace

- The live gate proved the policy implementation itself: every mount already
  labelled **Open Attachment** works. The remaining failure is limited to
  Logger-owned mount points that still expose Discord-native **Open Link** or
  **Open in Browser** controls, which therefore escaped the Stage 4 ownership
  replacement and continue using their original Blob-unaware path.
- Installed one ignored opt-in helper at
  `tmp/MessageLoggerOpenMountTrace.plugin.js` through the exact BetterDiscord
  symlink `MessageLoggerOpenMountTrace.plugin.js`. It starts disabled/unarmed,
  makes no network request, suppresses no action, and emits no toast.
- When explicitly armed, the helper records the pre-menu DOM target, the final
  `image-context`/`message` React tree including ids/labels/callback shapes and
  frozen state, relevant native-viewer clicks, and observed `window.open`,
  Electron `shell.openExternal`, or `shell.openPath` calls/outcomes. HTTP(S)
  query strings and fragments are redacted from the local JSON report.
- Parent validation passes `node --check` plus a mocked start/arm/menu-capture/
  finish/stop smoke test. The Spark worker could not start because the runtime
  still reported stale thread capacity while only the root thread was visible;
  this is not a Spark quota trigger, so the parent implemented only the
  disposable helper and Luna fallback was not activated.
- The helper report will be written to
  `$HOME/Library/Application Support/BetterDiscord/plugins/MessageLoggerOpenMountTrace-report.json`.
  No tracked production/test behavior changed in this trace step, and nothing
  was committed or pushed.
- The first operator pass did not arm the helper: the runtime log records start
  at 13:42:21 and `finish()` at 13:42:50 with no intervening **Trace armed**
  entry. Its valid report consequently has `eventCount: 0`. Repeat the same
  reproduction only after `MessageLoggerOpenMountTrace.arm()` returns the
  report path and the console logs **Trace armed**; do not infer any menu or
  viewer identity from the empty pass.

### 2026-08-17 - Native Open Link and async viewer escapes corrected locally

- The successful second trace contains 12 events with no drops. The exact
  restored target was saved message `1538829870644199445` in channel
  `361510651807531009`; its display source was the session Blob
  `blob:https://discord.com/d48b5a03-9342-4e08-91c4-c26db41b0934`.
- The final message menu retained mutable native action `open-native-link`
  labelled **Open Link** at nested path
  `root.children.children[7].children[1].children[1]`. The Logger message patch
  skipped it solely because it incorrectly required `ret.props.children` itself
  to be an array, even though the reconciliation walker already supports the
  traced nested React tree.
- The native Media Viewer button labelled **Open in Browser** called
  `window.open()` with that same Blob. The viewer remained unowned because its
  lazy mount happened after the click capture's synchronous/0 ms modal context;
  therefore no Logger descriptor was available to the existing window-open
  router. Neither failure reached Electron `shell.openExternal()` or
  `shell.openPath()`.
- Corrected the message/image menu path by running reconciliation on any exact
  resolved descriptor regardless of root nesting. Native Discord and exact
  ImageUtilities entries keep their existing label, id, and placement; only
  their callback is replaced with the shared Logger attachment policy. Legacy
  Logger external-open duplicates are still removed, and unrelated actions are
  unchanged.
- Corrected the viewer path by retaining a short pending descriptor only long
  enough to observe the lazy mount, then binding persistent ownership only when
  the exact Blob/display source is present in the actual Media Viewer dialog.
  Later browser-open and viewer-context actions use that binding even when the
  native modal key cannot be resolved. Source mismatch, disconnect, timeout,
  close, routing teardown, tracking teardown, and plugin stop clear the state.
- Added deterministic coverage for the traced nested message-menu shape,
  preserved native labels, frozen descendant replacement, asynchronous viewer
  mount after the 0 ms context clears, repeated exact Blob routing, and
  mismatched/ordinary viewer refusal.
- Parent validation passes: `npm run check`; clipboard `16/16`; media
  `156/156`; source contracts `68/68`; full `npm test` `561/561`; plugin/test
  syntax; and `git diff --check`. Corrected repository SHA-256 is
  `9cf2fad325fe7d4ea4f234bfbf1fc1c632692ff487d5f273f1fdfcd054f365f1`;
  the live plugin remains on the prior hash until the controlled sync.
- Spark and a supporting explorer both remained unavailable because the runtime
  reported the stale thread-capacity limit while only `/root` was visible. No
  quota or rate-limit signal occurred, so Luna fallback was not activated; the
  parent implemented and verified these two small trace-proved slices.

### 2026-08-17 - Corrected Stage 4 native routes synced for focused acceptance

- Copied only `MessageLoggerV2.plugin.js` into the BetterDiscord plugins folder;
  Discord was not relaunched. Repository and live SHA-256 both equal
  `9cf2fad325fe7d4ea4f234bfbf1fc1c632692ff487d5f273f1fdfcd054f365f1`.
- The 13:57:28 hot reload removed the prior MessageLogger patches, completed
  the cleanup UI update, initialized the corrected build, applied all current
  patches, completed the final UI refresh, and scheduled the shared cache
  trimmer. No MessageLogger error or exception appeared in the new
  authoritative `debug.log` boundary.
- The simultaneous `PersonalPins` dispatch exception again belongs to that
  separate plugin and is not attributed to MessageLogger.
- The disposable open-mount trace helper stays installed but unarmed, and its
  successful report remains available until the user confirms the restored
  **Open Link**, native-viewer **Open in Browser**, and ordinary-viewer isolation
  checks. Nothing is committed or pushed.

### 2026-08-18 - Stage 4 live gate accepted and trace retired

- The user confirmed the corrected Stage 4 controls are all working, including
  the formerly escaping restored-message **Open Link** and native-viewer
  **Open in Browser** routes, and authorized a local commit without a push.
- Moved the ignored helper source, its verified exact BetterDiscord symlink,
  and the successful 12-event JSON report to the recoverable Trash folder
  `$HOME/.Trash/MessageLoggerOpenMountTrace-2026-08-18-stage4-accepted`.
  Their original repository/live paths are absent, so no Stage 4 helper remains
  installed.
- Stage 4 closes with parent-owned `npm run check`, clipboard `16/16`, media
  `156/156`, source contracts `68/68`, full `npm test` `561/561`,
  `git diff --check`, clean live reload, and exact repository/live plugin hash
  parity at
  `9cf2fad325fe7d4ea4f234bfbf1fc1c632692ff487d5f273f1fdfcd054f365f1`.
- Commit only the plugin, the three regression files, and this checklist. Do
  not push. Then prepare the requested Downloads media fixtures and resume the
  trace-first Stage 3 deleted-MP4/native-media renderer investigation; keep the
  accepted Stage 4 routing policy unchanged.

### 2026-08-18 - Stage 4 committed locally and Stage 3 fixtures prepared

- Committed the accepted five-file Stage 4 change on `develop` as
  `64464efd45bcb3e95c7d752cd35dc8a908c84eaa` (`Complete saved attachment open
  routing`). The parent reran full `npm test` at `561/561`, `git diff --check`,
  and repository/live hash parity immediately before the commit.
- Did not push. Local `develop` is ahead by one; a read-only `git ls-remote`
  confirmed actual remote `develop` remains at
  `eec8f4e664c5fc3eaf3007473e067e4a0ddff440`.
- Created the 744 KB copyright-free fixture pack at
  `$HOME/Downloads/MessageLoggerV2-Media-Format-Tests` using
  ImageMagick 7.1.2-8 and FFmpeg 8.0.1 with speed-first settings. The final 15
  numbered cases are five images, six video container/codec combinations, two
  native-audio candidates, TXT preview, and a PDF generic-row control; the
  three generation sources are isolated under `00-sources`.
- Kept the final upload matrix inside the Logger/Discord render boundary.
  Logger-only or unestablished candidates (BMP, AVIF, TIF/TIFF, AVI, MKV,
  AAC, FLAC, M4A, standalone Opus, WAV, and extra Vorbis/Opus variants) were
  moved to the recoverable Trash folder
  `$HOME/.Trash/MessageLoggerV2-Media-Format-Tests-out-of-scope-2026-08-18`
  instead of being presented as supported.
- ImageMagick identified all five final images at 320x180, including a two-frame
  GIF. FFprobe confirmed every declared container and codec; strict complete
  FFmpeg decoding passed all six video and both audio files; `file` identified
  the controls as plain text and PDF 1.4.
- `README.md` records scope, sources, settings, and one-file-per-message test
  order. `TEST-RESULTS.md` has separate columns for new-upload, deleted remote-
  first, deleted local-only, and Logger-view behavior. At the user's direction,
  install no trace yet: wait for their complete pass/fail matrix, then trace
  only the failing native mount types.
- A final cleanup audit caught BetterDiscord writing the same 12-event report
  once more while unloading the already-loaded helper after its symlink was
  removed. Moved that unarmed late copy to
  `MessageLoggerOpenMountTrace-report-after-unload.json` in the existing Stage
  4 Trash folder, waited, and reverified that the ignored helper, live symlink,
  and live report paths all remain absent.

### 2026-08-18 - Stage 3 video/audio failure matrix isolated and manual mount trace installed

- The user completed the relevant fixture pass. All five image cases work.
  Every deleted video case shows Discord's **Image failed to load.** card in
  both remote-first and local-only modes, while the Logger viewer renders the
  videos. Both audio cases render through Discord in remote-first mode, show
  placeholder text in local-only mode, and have no Logger-view audio renderer.
  New-upload and TXT/PDF control cells remain unrecorded rather than inferred.
- Stage 4 remains accepted: the open file/attachment policy works. Do not alter
  its global routing while correcting Stage 3 rendering.
- The saved V01 record retains `content_type: video/mp4`, dimensions, duration,
  and its `.mp4` identity; A01 retains Discord's normalized
  `content_type: audio/mpeg3` plus `original_content_type: audio/mpeg`. Their
  physical `.mp4` and `.mp3` cache files both exist. This rules out a missing
  cache write and makes the next gate the actual native DOM/React mount shape.
- Installed the ignored, snapshot-only helper
  `tmp/MessageLoggerAttachmentMountTrace.plugin.js` through the live symlink
  `$HOME/Library/Application Support/BetterDiscord/plugins/MessageLoggerAttachmentMountTrace.plugin.js`.
  It starts idle, performs no network calls or renderer/action interception,
  and exposes `MessageLoggerAttachmentMountTrace.dump(label)`, `.status()`, and
  `.clear()` only while enabled.
- Run one manual `dump("off")` with **Only render locally cached attachments**
  Off and one `dump("on")` after switching it On, keeping the fixture rows in
  the selected channel. Reports are written separately as
  `MessageLoggerAttachmentMountTrace-report-<label>-<timestamp>.json` in the
  BetterDiscord plugins folder. The snapshots are restricted to V01-V06 and
  A01-A02 saved rows and capture attachment metadata, the current presentation
  plan, cache-file existence, DOM media/failure nodes, and bounded React
  component/prop shape with signed URL queries and message content excluded.
- Spark produced the initial helper slice. Parent review corrected its empty
  collection snapshot, tightened fixture scoping/redaction and traversal
  bounds, made plan inspection match the actual Off/On state without retaining
  failure-set mutations, and added attachment MIME/dimension/duration fields.
  Parent `node --check`, empty-runtime lifecycle smoke, and a mocked V01
  failure-card smoke all pass. Repository/plugin source and live
  `MessageLoggerV2.plugin.js` were not changed for this trace.
- The first live `dump("off")` reached a React fiber without a DOM state node
  and exposed one helper-only null `tagName` guard. Added that guard, passed a
  targeted null-state fiber check plus `node --check` and `git diff --check`,
  and reconfirmed helper/live-symlink hash parity before retrying the dump.

### 2026-08-18 - Stage 3 Off/On mount trace proved video-poster and audio-plan defects

- Captured complete state-separated reports for all six saved videos and both
  saved audio fixtures:
  `MessageLoggerAttachmentMountTrace-report-off-2026-08-17T14-36-19-537Z.json`
  and
  `MessageLoggerAttachmentMountTrace-report-on-2026-08-17T14-37-07-661Z.json`.
  Both are in the BetterDiscord plugins folder and contain every fixture row.
- Video classification is correct in both states. V01-V06 retain their video
  MIME, dimensions, duration, and `mediaType: video`; their selected plan is
  remote with local-only Off and Blob with local-only On. Discord then enters
  its playable video path but passes the selected stream through its poster
  `Image` component. Logger has replaced canonical `proxy_url` with the same
  raw CDN video or video Blob, so that poster fails and Discord replaces the
  row with **Image failed to load.** No native `VIDEO` node survives.
- Audio is a separate defect. With local-only Off Discord mounts real
  `AUDIO`/`SOURCE` nodes. With it On, A01/A02 are deliberately planned as
  generic `attachment` plus `omit`, despite their physical `.mp3`/`.ogg` cache
  files existing, so Logger supplies the visible filename placeholder.
- The user locked the live-render policy to CDN, then proxy, then cached local
  Blob, then exact filename placeholder when local-only is Off; local Blob,
  then placeholder with zero remote fallback when it is On. Images, videos,
  and audio must mount through their proper media containers rather than using
  an image renderer for non-image files. Stage 4 opening remains unchanged.
- The user also split the remaining work into commit gates. First fix and
  live-verify restored live mounts, run the complete parent gate, and commit
  that change without pushing. Only after that commit may a separate stage
  port Discord's native audio renderer into the Logger viewer.
- Parent baseline before the live-render implementation remains `561/561`.
  The first bounded implementation slice adds first-class audio MIME/extension
  planning, cached MP3/OGG Blob eligibility, and cache-completion remounts; its
  three focused parent tests pass. It does not touch either renderer.

### 2026-08-18 - Stage 3 video/audio live-render build ready for manual gate

- Restored videos no longer pass through Discord's failing poster `Image`
  route. `SavedAttachmentPresentationContent` removes only planned video
  attachments from the detached native render input and mounts Logger-owned
  React `<video controls preload="metadata">` hosts with the existing exact
  message/attachment ownership markers. Native image and audio attachments
  remain in Discord's renderer, and canonical saved records are not mutated.
- The video host owns its exact fallback chain. Remote-first mode advances the
  failed CDN candidate to proxy, then to a cached Blob when available, and
  finally to the plan's exact filename label. Local-only begins at the cached
  Blob and changes directly to that label on failure; it never asks for a
  remote plan. The global native-media error listener excludes Logger's video
  host so one failure cannot advance the chain twice.
- Audio is now a first-class saved media type for `.mp3`, `.ogg`, `.oga`, and
  `.opus` attachments or `audio/*` MIME metadata. Cached audio may receive a
  Blob plan, cache completion can remount it, and Discord's native
  `<audio>/<source>` renderer remains the live container. Native `AUDIO` and
  `SOURCE` errors use the shared candidate-failure/remount path, giving audio
  the same CDN -> proxy -> cached Blob -> exact filename policy when
  remote-first is active. Local-only retains its existing zero-remote guard.
- The accepted Stage 4 global open-attachment policy and the Logger viewer are
  unchanged. In particular, Logger-view audio remains intentionally deferred
  until this live-render build passes the user's manual gate and is committed
  locally without pushing.
- Luna completed the two bounded renderer/error-routing slices after Spark
  reported model capacity. Parent review corrected only stale fake-DOM/source
  contract expectations, including the established same-channel recache
  coalescing behavior. The final parent gate passes `npm run check`, focused
  media/source contracts, `git diff --check`, and the complete `566/566`
  tracked test suite.
- Required live matrix before commit: retest V01-V06 and A01-A02 from
  `~/Downloads/MessageLoggerV2-Media-Format-Tests`, first with **Only render
  locally cached attachments** Off and then On. Each video must show a real
  video control rather than **Image failed to load**; each audio item must show
  Discord's audio control rather than placeholder text; Stage 4 **Open
  attachment/Open link/Open in Browser** routes must remain functional. Mixed
  image/video ordering and Discord layout styling remain live-only checks for
  messages containing more than one media type.
- Live-synced only `MessageLoggerV2.plugin.js`; repository and BetterDiscord
  copies match SHA-256
  `5b330c86dab516fe19ab6a6c63574c5a8b5f163333c59c891d6494a5ff80387b`.
  BetterDiscord hot-reloaded the plugin through patch removal and a clean new
  initialization with no immediate MessageLogger error. Discord was not
  relaunched. Keep the ignored mount-trace helper and the two prior reports in
  place until this manual gate is accepted or a failing row needs a fresh dump.

### 2026-08-18 - Stage 3 duplicate native video accessory suppression ready for live gate

- Fresh post-render reports
  `MessageLoggerAttachmentMountTrace-report-off-fixed-2026-08-17T15-01-38-483Z.json`
  and
  `MessageLoggerAttachmentMountTrace-report-on-fixed-2026-08-17T15-02-18-303Z.json`
  prove that V01-V06 now mount one healthy Logger-owned native `VIDEO` host in
  both modes. Each row also retained a separate Discord accessory branch ending
  in its old SVG **Image failed to load.** card. A01/A02 retained real native
  `AUDIO`/`SOURCE` nodes in both reports, so audio rendering is not part of this
  duplicate defect.
- The duplicate is not the Logger video host or a React alternate-fiber
  artifact. The custom path is
  `SavedAttachmentPresentationContent -> SavedAttachmentPresentationVideo -> VIDEO`,
  while the stale native path separately enters Discord's class-based message
  accessories renderer with the original one-video attachment list. The
  Logger re-entry already receives zero video attachments.
- Added a guarded `MessageAccessories.renderAttachments` policy hook resolved
  through the mainstream/fork-compatible `renderEmbeds` and
  `renderAttachments` prototype keys. For an exact, visible saved deletion it
  gives only that synchronous native call a detached attachment projection
  with Logger-owned remote/Blob videos removed. Images, audio, generic files,
  canonical records, and unrelated messages remain untouched. The component's
  original props reference is restored in `finally`; lookup or projection
  failure leaves Discord's native behavior active.
- Behavioral coverage proves remote-first and cached local-only projection,
  video-only filtering, image/audio/generic preservation, immutable `.set`
  support, canonical/input immutability, exact channel/display gating, native
  receiver/argument preservation, one original call, and exact prop
  restoration. Source-contract coverage binds module discovery, the patch
  point, video/action policy, identity matching, immutable projection, and the
  `finally` restore path.
- Spark completed the isolated source-contract slice after the full activity
  grace window. Parent review corrected two test-only regex assumptions; no
  production behavior changed. The parent gate passes `npm run check`, focused
  media behavior, source contracts, `git diff --check`, and the complete
  `569/569` suite.
- Live-synced only `MessageLoggerV2.plugin.js`; repository and BetterDiscord
  copies are byte-identical at SHA-256
  `457a511d0ff102405ecb1f957cffd5bea26ef0e8ff0faeec7b4d68a1f92eab2f`.
  The 15:20:08 hot reload removed the old patches, initialized the new build,
  applied all patches, completed its UI refresh, and scheduled the shared cache
  timer. No `MessageAccessories` lookup warning or MessageLogger exception
  appeared at that boundary. The simultaneous `PersonalPins` exception remains
  unrelated, and the later named cache 404 is an ordinary media warning.
  Discord was not relaunched. The user's Off/On duplicate-card check remains
  before the Stage 3 commit gate; nothing is committed or pushed.

### 2026-08-18 - Stage 3 duplicate gate still failing; enhanced ownership trace ready

- The user confirmed that the `MessageAccessories.renderAttachments` build
  still produces two video mounts. Treat that hook as an unaccepted runtime
  hypothesis: keep it only long enough to observe whether it fires, and do not
  commit it or replace it with another static guess.
- The ignored body snapshot `tmp/1.html` makes the surviving layout boundary
  explicit. Each V01-V06 row has one native Discord visual-media placeholder
  under `message-accessories-<message id>`, while the working Logger `<video>`
  is a separate sibling inside the message `contents` container. A01/A02 have
  one native audio/source mount and no Logger video host. The body dump remains
  ignored and must not be committed.
- Enhanced ignored helper
  `tmp/MessageLoggerAttachmentMountTrace.plugin.js` to version `1.0.3`, schema
  `mount-trace-v3`, through the existing exact BetterDiscord symlink. Its new
  manual `armRenderOwnershipTrace(label)` / `disarmRenderOwnershipTrace()` APIs
  install observation-only, bounded hooks for the live Logger accessories
  callback, the semantically resolved native accessories method, and the two
  MessageContent calls. Reports preserve all capped events, including the
  zero-attachment Logger re-entry.
- Each fixture row now also records the exact native placeholder/failure fiber
  ancestry and compares its live type, prototype, and `renderAttachments`
  function identity with the resolved module. It targets both the current
  `imagePlaceholderVisible` body shape and the earlier Discord failure-asset /
  **Image failed to load.** shapes. It records names, IDs, filenames, counts,
  method names, and sanitized URL categories only—never message text, authors,
  signed queries, function bodies, stacks, headers, tokens, or cookies.
- Parent validation passes `node --check`, exact helper/live-symlink hash
  parity, a three-hook lifecycle mock that retains the zero-attachment re-entry,
  a native-placeholder fiber/prototype identity mock, and `git diff --check`.
  The helper neither changes arguments/props/results nor invokes originals,
  dispatches, forces renders, or performs network work. Fresh Off/On ownership
  reports are now required before changing the tracked production hook.

### 2026-08-18 - Stage 3 ownership trace proved the duplicate and early suppression is ready

- Captured the required reports:
  `MessageLoggerAttachmentMountTrace-report-off-owner-2026-08-17T15-34-35-212Z.json`
  and
  `MessageLoggerAttachmentMountTrace-report-on-owner-2026-08-17T15-35-13-102Z.json`.
  Both are valid `mount-trace-v3` reports with no trace diagnostics and all
  three targets resolved.
- The live Logger `renderSavedAttachmentAccessories` callback recorded zero
  calls in both reports. The actual native
  `MessageAccessories.prototype.renderAttachments` recorded 13 calls Off and
  11 calls On, while `MessageContentComponent.type` recorded 20 calls in each
  state. The failed V01 placeholder fiber reaches the exact live `cO`
  MessageAccessories type/prototype and patched `renderAttachments` function at
  distance 22. This rules out a wrong Webpack export and proves the production
  accessories callback was not an effective ownership boundary.
- V01-V06 each enter the first non-reentry MessageContent render with one video
  attachment, then enter Logger's marked reentry with zero video attachments.
  A01/A02 retain one audio attachment in both calls. This makes the first
  MessageContent input the earliest trace-proven place to prevent Discord's
  stale video accessory without disturbing native audio.
- Removed the ineffective MessageAccessories resolver/hook and its receiver-
  swap helper. The first non-reentry MessageContent pass now applies the saved
  content policy and removes only displayed attachments independently classified
  as video. Logger's working video host remains the sole video renderer; image,
  audio, and generic attachments stay with Discord's native render path.
- The projection uses displayed attachment classification instead of ID/URL
  cross-matching. This covers ID-less legacy Blob clones and avoids hiding a
  non-video attachment that shares a malformed ID or URL with a video. It keeps
  Immutable `.set('attachments', ...)` support plus a detached object fallback;
  canonical saved records remain unchanged.
- Source inspection confirmed the Logger viewer does not reuse Discord's live
  MessageAccessories video component: it constructs its own HTML `<video>` and
  play overlay. Keeping the analogous Logger-owned live video host is therefore
  the smaller working path; routing local Blob video back through the already-
  failing native image/placeholder path would not reuse the Logger viewer.
- Parent-focused validation passes plugin syntax, `tests/media.test.js` plus
  `tests/source-contracts.test.js` at `231/231`, and `git diff --check`. The
  focused media coverage includes remote-first, local-only, master-off,
  ID-less Blob video, shared malformed ID/URL preservation, canonical
  immutability, native audio/image/generic retention, and the first-render
  source contract. The user explicitly paused the full suite for this live-gate
  stage, so no new full-suite result is claimed.
- Spark applied the initial traced suppression before an explicit model-capacity
  failure. Luna completed the bounded classification cleanup, and a read-only
  reviewer found no remaining normal-flow duplicate or canonical-write path
  after those edge cases were closed. Nothing is committed or pushed. The next
  action is controlled live sync followed by the user's Off/On V01-V06 and
  A01/A02 check.
- Live-synced only `MessageLoggerV2.plugin.js`; repository and installed hashes
  match at
  `1d06b24f2fb07a6845a67bc2e9f532f58da1a3199e7eeb6d029e34cef69f953b`.
  The 15:47:01 hot reload removed the previous patches, found ImageModal,
  applied the new patches, completed its UI refresh, and scheduled the shared
  cache timer. No MessageLogger exception or removed-MessageAccessories warning
  appears in the fresh boundary. The simultaneous `PersonalPins` exception is
  unrelated. The user's Off/On duplicate-card check remains; nothing is
  committed or pushed.

### 2026-08-18 - Main-branch live control installed for duplicate attribution

- The first-render suppression build still produced two blocks in the user's
  live check. At the user's request, installed a reversible unmodified
  `main`-branch control to determine whether the second block predates the
  current Stage 3 renderer.
- Local `main` and `origin/main` both resolve to
  `131c928f2c8b5c73e2d28efc69699eb9d6c87ca9` (`release: bump
  MessageLoggerV2 to 2.8.2.18`). No branch switch, checkout, tracked-file edit,
  merge, commit, or push occurred. `git archive` extracted only that plugin blob
  to `/tmp/mlv2-main-control.osPtFj/MessageLoggerV2.plugin.js`.
- The installed BetterDiscord plugin now exactly matches the `main` control at
  SHA-256
  `4240e49193286cc7b99d32a12822150b59fc010bde8aad3deda1550cba7751fc`.
  The 15:48:26 hot reload removed/applied patches and completed its UI refresh
  without a MessageLogger exception; the concurrent `PersonalPins` exception
  is unrelated.
- The user confirmed that `main` produced no duplicate block. The then-current
  repository Stage 3 build was restored live at SHA-256
  `1d06b24f2fb07a6845a67bc2e9f532f58da1a3199e7eeb6d029e34cef69f953b`
  before the follow-up ownership edit recorded below. Nothing was committed or
  pushed, and the full suite remained paused.

### 2026-08-18 - Main control passed; top-level native accessory ownership live gate

- The user confirmed the unmodified `main` control has no duplicate video
  block. This isolates the second block to the reopened Stage 3 custom live
  video path rather than Discord's baseline mount.
- Restored the working repository build after the control, then replaced the
  ineffective `MessageAccessories.renderAttachments`/first-MessageContent-only
  ownership attempts with a guarded top-level
  `MessageAccessories.prototype.render` projection. During only an exact
  visible saved-deletion render, its detached props expose a video-free message
  to Discord while Logger keeps the working video host. Original props are
  restored in `finally`; a missing resolver or non-writable props fail closed
  to Discord's unchanged native render. Images, audio, generic attachments,
  canonical records, and unrelated messages remain untouched.
- Parent-focused validation passes plugin syntax,
  `tests/media.test.js` plus `tests/source-contracts.test.js` at `232/232`, and
  `git diff --check`. The full suite remains deliberately paused for the live
  gate.
- Live-synced only `MessageLoggerV2.plugin.js`; repository and installed hashes
  match at
  `cf3347cce594996a198903364ed7b38cdc8b3f52a157f991f5abda92d1be457e`.
  The 15:54:39-15:54:42 hot reload removed the previous patches, found
  ImageModal, applied all patches, completed its UI refresh, and scheduled the
  shared cache timer. No MessageLogger exception or MessageAccessories lookup
  warning appears in that boundary. The simultaneous PersonalPins exception is
  unrelated. Nothing is committed or pushed.

### 2026-08-18 - Stage 3 live render accepted and full pre-commit gate passed

- The user confirmed the top-level native accessory ownership build removes the
  duplicate Discord placeholder while retaining the working Logger video
  renderer. This closes the Stage 3 live-render gate for the tested video and
  audio attachment fixtures.
- The parent resumed the deferred complete gate after that runtime acceptance:
  `node --check MessageLoggerV2.plugin.js`, `npm run check`, all `569/569`
  tests through `npm test`, and `git diff --check` pass.
- The accepted commit scope is exactly this checklist,
  `MessageLoggerV2.plugin.js`, `tests/media.test.js`, and
  `tests/source-contracts.test.js`. Do not include ignored trace helpers,
  reports, or `tmp/1.html`; do not push the commit.

### 2026-08-18 - Logger-view native audio ownership trace ready

- The accepted Stage 3 correction is committed locally as
  `82106f79028bedcad6c1968c5bacac52fd12cce7`; nothing was pushed. Logger-view
  audio now proceeds as a separate change.
- Existing A01/A02 reports prove deleted live rows use Discord's native
  `H -> eA -> audio/source` React chain for remote and Blob URLs, but the old
  report did not expose a stable Webpack export identity. The Logger viewer
  currently admits audio presentation entries but renders neither an inline
  audio player nor a native audio component.
- Enhanced the ignored helper only to version `1.0.4` / `mount-trace-v4` with
  `dumpAudioOwner(label)`. It captures only A01/A02, walks the mounted audio
  fiber owner chain, records bounded component/prototype/source-marker and raw
  Webpack export-identity evidence, and reports `BdApi.Utils.loadEntry` plus
  `Webpack.waitForModule` capabilities without recording function bodies,
  message text, authors, secrets, or full Blob URLs.
- Read-only host comparison confirms `BdApi.Utils.loadEntry` is public in both
  the live fork's `develop` and mainstream `upstream/development`. The final
  plugin must still feature-detect it for older BetterDiscord builds and retain
  a direct loaded-module/Logger React-mount fallback.
- The parent passed helper syntax and tracked diff hygiene, forced an
  unload/reload event for the exact helper symlink, and enabled
  `MessageLoggerAttachmentMountTrace` in Stable's plugin state. The user should
  keep A01/A02 mounted and run
  `MessageLoggerAttachmentMountTrace.dumpAudioOwner("logger-audio-owner")`.
  Only focused tests are authorized until the Logger-view player passes live.

### 2026-08-18 - Live lazy-entry proof and native audio discovery infrastructure

- Hot-reloaded the ignored helper at version `1.0.5` / `mount-trace-v5` and
  ran
  `await MessageLoggerAttachmentMountTrace.verifyAudioLoadEntry("logger-audio-load-entry")`
  with A01/A02 mounted. The report is
  `MessageLoggerAttachmentMountTrace-report-logger-audio-load-entry-2026-08-17T16-18-02-444Z.json`.
- The scoped `BdApi.Utils.loadEntry` call was supported and attempted, completed
  in 22 ms, returned an array containing one module object, and reported no
  error. This proves the live fork's older-client backend port can parse and
  load the real `MessageAccessories` lazy entry; capability detection alone is
  no longer being treated as success.
- Both A01/A02 still resolved the same native `eA` media-player export after the
  call. Its stable prototype contains `renderAudio`, `renderVideo`,
  `renderControls`, and `checkVideoDecodability`; the traced obfuscated export
  name/key are evidence only and must not become production selectors.
- The native prop contract records `type: "AUDIO"`, `playable: true`, a formatted
  string `fileSize`, numeric `fileSizeBytes`, a MIME array, function-valued
  `volume` and `autoMute` getters, one-argument mute/volume callbacks, zero-
  argument volume visibility callbacks, a three-argument play callback, and a
  one-argument link renderer.
- Added production infrastructure only: semantic native-player discovery,
  guarded `Utils.loadEntry(MessageAccessories)` with direct Webpack retry,
  shared non-sticky load promises, stale-generation protection, and scoped
  React-root/listener cleanup on Logger refilter, DOM removal, hot unload, and
  same-instance restart. No Logger-view audio is rendered by this slice.
- Parent syntax and `git diff --check` pass. Focused behavior tests remain for
  the complete mount slice; no full suite or live production sync is claimed.
- Recorded a separate optional Stage 9 compatibility cleanup for Logger module
  lookups hidden behind Discord lazy entries. It may use a guarded startup
  warm-up or first-use `BdApi.Utils.loadEntry` call only for a trace-proven
  owner, then retry the existing semantic resolver; unavailable, rejected,
  empty, stale, or still-unresolved loads retain today's resolver/mount fallback
  and warning behavior.

### 2026-08-18 - Logger-view native audio focused build ready for live gate

- Added one Logger-view audio host that first resolves Discord's native player
  by the traced semantic prototype, invokes the proven guarded
  `BdApi.Utils.loadEntry(MessageAccessories)` path only when missing, and falls
  back to a browser `<audio controls preload="metadata">` element when native
  resolution is unavailable.
- The native prop adapter follows the v5 trace: `AUDIO`, playable state,
  formatted and numeric size, MIME array, function-valued volume/auto-mute,
  bounded callbacks, the semantic mosaic class, and a neutral non-escaping link
  renderer. No obfuscated component/export key is used.
- Logger-view audio now uses the same detached saved-attachment plan as image /
  video: CDN -> proxy -> cached Blob -> exact placeholder in remote-first mode,
  Blob/placeholder only in local-only mode, and the existing placeholder when
  cache master is Off. Canonical records are never mutated and successful
  inline audio no longer receives a duplicate Attachment/Voice text row.
- Stage 4 message/attachment markers are present on native and browser-fallback
  audio hosts. React roots and capture listeners are cleaned on remount,
  placeholder replacement, Logger refilter, DOM removal, stop, and restart.
- A read-only defect review found that Logger audio errors could also reach the
  global restored-message media listener. The parent added the audio-host
  exclusion beside the existing video-host exclusion, preventing one error from
  advancing the candidate state twice, and added a focused regression case.
- Parent syntax checks, `tests/media.test.js` plus
  `tests/source-contracts.test.js` at `236/236`, and `git diff --check` pass.
  The full suite remains deliberately paused until the user accepts the live
  Logger-view audio result.
- Per the user's corrected ordering, TXT/PDF work is no longer Stage 9A. It is
  Stage 3 point 3 after audio acceptance: preserve their already-working remote
  live presentation, fix cached Blob/restored rendering, add Logger-view
  rendering, and expose Stage 4 `Open Attachment` on every exact-owned surface
  where practical. Stage 9 remains warning identity plus optional guarded
  Webpack warm-up only.
- Live-synced only `MessageLoggerV2.plugin.js`; repository and installed hashes
  match at
  `f4dc7aa4bdc225c7b80094e9aa0d6438cce3fafb4b88c38c894ebd876d033b62`.
  The 16:40:25-16:40:28 hot reload removed the old patches, resolved ImageModal,
  applied the new patches, completed its UI refresh, and scheduled the shared
  cache timer without a MessageLogger exception or module-resolution warning.
  The simultaneous `PersonalPins` dispatch exception is unrelated. At that
  boundary, user verification of Logger-view audio Off/On, playback, single
  ownership, and `Open Attachment` was the only remaining point 2 gate.
- The user completed that gate successfully. Debug-log evidence records
  local-only On at 16:41:20, cache-master Off at 16:41:41, and cache-master On
  again at 16:41:57 with the expected refreshes and no MessageLogger exception.
  Stage 3 point 2 is accepted for a local focused-gate commit without a push.
- Committed point 2 as
  `9dfd6d85be45072f85441d378db38858b1aba1a6` (`Add native audio rendering to
  Logger viewer`), then pushed `develop` at the user's explicit request. Local
  `develop`, `origin/develop`, and the remote `refs/heads/develop` were each
  verified at that exact SHA. Point 3 begins from this clean published state.

### 2026-08-18 - Stage 5 hydration scope expanded to current supported types

- The user clarified that the real **Render & Cache media** Off-to-On pass must
  attempt recovery for every file type Logger supports at the time Stage 5
  begins, rather than only images, whenever an accepted stored CDN/direct or
  proxy URL is available.
- The pass still reuses current eligibility settings and predicates, direct
  then distinct proxy ordering, de-duplication, existing-file checks, size and
  cancellation rules, no-save/epoch handling, request sharing, and atomic
  writes. It must not invent missing URLs or persist Blob/file URLs.
- This does not authorize broader arbitrary-file support. The separate gate for
  adding or accepting all file types remains deferred to a later user-directed
  session. Stage 5 itself also remains paused until the current point-3 release
  boundary is complete.

### 2026-08-18 - TXT/PDF native-owner and local-omit trace completed

- Hot-reloaded the ignored helper at version `1.0.6` /
  `mount-trace-v6`. The user captured
  `MessageLoggerAttachmentMountTrace-report-txt-pdf-remote-2026-08-17T16-56-37-382Z.json`
  with local-only Off and
  `MessageLoggerAttachmentMountTrace-report-txt-pdf-local-before-2026-08-17T16-57-04-113Z.json`
  with local-only On.
- C01 TXT (`1538949288774602875`) and C02 PDF (`1538949305178529903`)
  both have verified physical cache files with the expected `text/plain` and
  `application/pdf` types. Their remote plans preserve CDN then proxy order.
- Both working remote endpoints traverse Discord's resolved
  `MessageAccessories.renderAttachments` owner and reach the message row. The
  native mosaic selects its plaintext-preview callback for C01 and generic-file
  callback for C02; obfuscated component names and export keys remain evidence
  only and are not production selectors.
- In local-only mode, both `{allowBlob:true}` plans return `omit` and the rows
  contain exact `[attachment:filename]` labels with no native endpoint. Source
  review identified the two pre-native blockers: Blob eligibility is restricted
  to image/video/audio, and the cache Blob factory hard-codes `image/<ext>`.
- No additional pre-change trace is required. Gate 3.1 will make only exact
  TXT/PDF attachments Blob-eligible, assign correct MIME types, preserve the
  detached canonical metadata contract, and let Discord choose the same native
  renderers. Logger-view work remains blocked on the user's post-change live
  acceptance.

### 2026-08-18 - Stage 7 repeated smoke matrix accepted

- The user confirmed that the image/video/audio presentation, setting-toggle,
  mount-coverage, hot-reload, unavailable-open, and Stage 4 routing checks have
  already been exercised repeatedly and may be treated as accepted Stage 7
  coverage rather than rerun for point 3.
- Only behavior introduced after that accepted checkpoint remains live-gated:
  TXT/PDF cached-Blob rendering in restored rows, its later Logger-view port,
  and the separately deferred Stage 5 Off-to-On hydration pass.

### 2026-08-18 - Gate 3.1 TXT/PDF Blob build ready for live gate

- Cached attachment Blob construction now uses a bounded MIME map instead of
  treating every cached file as an image. Existing supported image, video, and
  audio extensions keep explicit types; TXT uses `text/plain`, PDF uses
  `application/pdf`, and an unknown extension fails to
  `application/octet-stream` without becoming Blob-presentation eligible.
- The detached presentation plan recognizes exact `.txt` / `text/plain` and
  `.pdf` / `application/pdf` metadata, including current camelCase aliases.
  Local-only permits cached document Blobs while unsupported generic files stay
  omitted; Discord's restored-row projection still removes only Logger-owned
  videos, leaving TXT/PDF on its trace-proven native path.
- Cache completion may now schedule restored-row refreshes for text and PDF.
  The existing exact attachment descriptor resolves a native document Blob
  anchor back to the trusted physical cache path, so Stage 4 opens the local
  file through the operating system rather than sending the Blob externally.
- Parent validation passes plugin/test syntax, the combined focused
  `tests/media.test.js` plus `tests/source-contracts.test.js` gate at `241/241`,
  and `git diff --check`. One initial test run was `167/168`: the sole failure
  was a new immutability snapshot that omitted its unchanged `closest` function;
  the parent corrected that test-only defect and the rerun passed `168/168`.
  The full suite remains deliberately paused until point 3 is complete.
- Live-synced only `MessageLoggerV2.plugin.js`; repository and installed hashes
  match at
  `375fdbb28cd9620914f9ca3f38d28dff6601eb9410ddbffe0cc908af4d808f12`.
  The hot reload removed the previous patches, completed its clearing refresh,
  initialized the updated plugin, applied all patches, completed the new UI
  refresh, and scheduled the shared cache timer without a MessageLogger error.
  A simultaneous `PersonalPins` dispatch exception is unrelated.
- The user confirmed both cached-Blob restored-row presentations now work and
  authorized a local checkpoint commit before Gate 3.2. Gate 3.1 is accepted;
  no post-change trace was necessary.
- Committed the accepted Gate 3.1 checkpoint locally as
  `3478423f4f9de98a864578cf0fbb126f10b19b1e` (`Render cached documents in
  restored rows`). Nothing was pushed; `develop` is one commit ahead of
  `origin/develop` at this boundary.
- The user also authorized the final release metadata after Gate 3.2 is done:
  bump the plugin version and replace the stale built-in changelog with a
  concise summary of all user-facing work since the last `main` release,
  including Logger-view TXT/PDF, before the full gate, final live smoke, and
  requested `main` merge/push. Update `docs/settings.md` and `docs/tests.md` at
  the same boundary so the documented cache/render policy, display-toggle
  ownership, supported renderers, placeholder behavior, and attachment-opening
  policy match the accepted implementation.

### 2026-08-18 - Gate 3.2 Logger-view document build ready for live gate

- The v1.0.7 detached full-`MessageAccessories` probe failed because the plain
  synthetic object omitted native message-model fields consumed by
  `renderCodedLinks`. The v1.0.8 retry constructed a fresh detached native
  Discord message record with one attachment and safe empty accessory fields.
  It rendered the local TXT preview and PDF generic row without a boundary
  error. The probe's blue frame was disposable UI only and is not in production.
- Production resolves a semantic native message class through supplied/store
  records first, then guarded Webpack discovery. When needed it calls
  `BdApi.Utils.loadEntry(MessageAccessories)` only if available, and rejects
  stale generations or failed discovery without mutating canonical records.
- Logger viewer creates one detached native document message and one React root
  per exact TXT/PDF attachment. Every host carries its saved message and
  attachment IDs, omits Discord's context-menu interception callback so the
  Logger owner can receive right-clicks, and has isolated root cleanup and
  placeholder fallback. The viewer path does not consult the live-mount toggle.
- Batch coverage uses two independent document hosts and a six-attachment live
  record. It proves each image/video/audio/TXT/PDF/generic target resolves its
  own descriptor and **Open Attachment** action, never the first sibling, while
  ambiguous subtrees fail closed. The Logger viewer's exact marked descendants
  also remain authoritative when message content repeats a URL or label.
- Parent validation passes `node --check`, focused media plus source contracts
  at `246/246`, focused clipboard/context coverage at `18/18`, and
  `git diff --check`. The full suite remains paused until live acceptance.

### 2026-08-18 - Gate 3.2 Logger-view document live gate accepted

- Synced only `MessageLoggerV2.plugin.js`; repository and installed plugin
  SHA-256 both equal
  `4ab847d2b0153b96ec3862af7ebaf0d6ede6eeca721f37737db8671217fefa96`,
  and `cmp` confirmed byte-for-byte parity.
- The fresh reload boundary removed and reapplied the plugin cleanly. No new
  MessageLoggerV2 error appeared during the subsequent smoke; later log entries
  showed the expected separate TXT/PDF and mixed JPEG/MP4/MOV/TXT promotions.
- The user accepted Logger-view TXT/PDF rendering with local-only both Off and
  On, Logger-view independence when live restored-message mounting is disabled,
  each item's exact **Open Attachment** route, multiple documents in one batch,
  and a mixed batch of different file types without duplicates or sibling
  misrouting.
- Removed the exact trace-helper symlink and moved the ignored helper, saved
  HTML dump, and 12 generated trace reports recoverably to
  `$HOME/.Trash/MessageLoggerV2-Gate3.2-trace.o2kbqF`. No runtime helper or
  report remains in the BetterDiscord plugins folder or repository `tmp/`.
- Gate 3.2 is ready for its five-file local checkpoint commit. The full suite
  remains paused until the requested documentation/version/changelog release
  slice is assembled.

### 2026-08-18 - Handoff path privacy rewrite completed

- Converted every expanded home path in this checklist to `$HOME` and added a
  local repository privacy rule to the ignored `AGENTS.md` so future persistent
  docs, handoffs, examples, commit content, and release artifacts cannot record
  a literal username/home directory.
- Audited `main`, `develop`, `fix/attachment-gate`, the attachment-gate handoff,
  both Networking checklist locations, and the archive branch. The other
  handoffs were already `$HOME`-based; only this checklist on `develop` needed
  rewriting.
- Rebased all 12 `develop` commits after `main`, preserving the current tracked
  file hashes, and force-updated only the previously published remote boundary
  with an exact lease. Rewritten `origin/develop` is
  `9dfd6d85be45072f85441d378db38858b1aba1a6`; rewritten local Gate 3.1 is
  `3478423f4f9de98a864578cf0fbb126f10b19b1e` and remains unpushed.
- Reachable-tree scans, commit subjects/bodies, Git notes, tag messages, and
  remote refs contain no expanded home path. Existing author identity metadata
  is normal Git authorship, separate from handoff/commit-note content, and was
  not rewritten.
- At the final paused Stage 5 boundary, merge the accepted release from
  `develop` to `main`, then merge that resulting `main` into
  `fix/attachment-gate`; verify and publish each intended ref separately.

### 2026-08-21 - Error-first restart handoff prepared

- Current root session ID is
  `01a00f41-b9c3-7841-b0e0-175368f05084`; its exact rollout record is
  `$HOME/.codex/sessions/2026/08/17/rollout-2026-08-17T20-26-00-01a00f41-b9c3-7841-b0e0-175368f05084.jsonl`.
- Local `develop` and `origin/develop` both remain at clean committed boundary
  `8c2b3b28aaf0bfa7ec8d765de118511297d4e043`. Before this handoff-only edit,
  repository and installed `MessageLoggerV2.plugin.js` copies matched SHA-256
  `997b68c211b5c1c4d43a3e5219eafdbbfd583ab646f9f3cc386d7ba6c749aebc`.
- Preserved unsafe embed experiment `stash@{0}` remains object
  `5d15a3ceca72837c2738f0f22599fd6330ea4233`. Do not pop or apply it wholesale;
  future embed work may inspect its individual diffs only as evidence.
- The deterministic baseline is `597/598`. The only failure is the stale
  thread-promotion assertion expecting `[image:reply.png]` instead of the
  established `[Not cached: reply.png]` cache-off placeholder. Obtain explicit
  approval for that exact test correction before changing it or plugin code.
  One verification run also transiently failed the media non-stream fallback
  timeout under full-suite load; that exact test then passed three focused runs
  and the next full suite, so it is recorded as a possible timing flake rather
  than a second reproducible baseline failure.
- Stable-log triage found two real committed-baseline defects to repair first:
  function-bearing Discord update objects fail inside
  `createMessageUpdateSnapshot()` because of `structuredClone()`, and deferred
  deleted-channel cache writes lose their live `ChannelStore` name before
  `resolveNewCachePath()` calls `.normalize()`. The living snapshot records the
  bounded designs and focused regression requirements for both fixes.
- Current 403/404 misses, DNS/socket/timeout/certificate failures, and files
  without inferable extensions are expected remote-cache outcomes. Their richer
  filename, URL, and hostname diagnostics remain deferred to Stage 9 and must
  not distract from the two proven exceptions.
- Next-session order is strict: obtain approval for the stale assertion plus
  the two runtime repairs; implement and verify focused regressions; run the
  full suite and `git diff --check`; live-sync only the accepted plugin; confirm
  repo/live hash parity and a fresh stable-log window; then obtain the user's
  runtime acceptance. Only after that checkpoint may embed and Components V2
  rendering restart from clean source rather than from the stash.
- The ignored embed trace helper and its live symlink remain available for the
  later trace-first embed stage. No source, test, live plugin, stash, branch,
  commit, remote, release metadata, or helper state was changed by this handoff
  update; this checklist is the sole intended tracked modification.

### 2026-08-21 - Immediate runtime-error repairs synced for smoke testing

- The user approved the exact three-part error-first package. The stale
  attachment-only thread assertion now expects `[Not cached: reply.png]`
  without a plugin behavior change.
- `createMessageUpdateSnapshot()` now canonicalizes the shallow-merged prior
  and partial update before any saved-record clone. The new function-bearing
  regression proves update completion, retained fields, media-delta behavior,
  unchanged inputs, and detached saved-record data.
- Deleted-channel cache resolution now uses live identity, then durable
  `delete_data.location`/`saved_location`, then an exact existing folder, and
  otherwise fails closed. Read, pre-cache promotion, and confirmed-write paths
  are covered, including the no-write/no-move/no-refresh unresolved case.
- Parent verification passed `npm run check`, records `76/76`, media `192/192`,
  full `npm test` `610/610`, and `git diff --check`.
- Only `MessageLoggerV2.plugin.js` was synced live. Repository and installed
  copies are byte-identical at SHA-256
  `e9413014efcce42b7797c127f0359cf763e730e3ecfddc791b5524d5a4a46abc`.
- The `2026-08-21 06:50:22` through `06:50:28` hot-reload window removed and
  reapplied MessageLoggerV2 cleanly, completed its UI refresh, and scheduled
  its shared cache timer without a new MessageLoggerV2 exception. A separate
  PersonalPins `guild_id` error immediately before reload is unrelated and was
  not changed in this scope.
- Luna Extra High completed only the remaining promotion/write threading after
  the user reported that Spark usage had reached its current limit. The Sol
  parent reviewed the diff and reran every focused and full gate.
- Local `develop`, `origin/develop`, and HEAD remain at `8c2b3b2`; preserved
  `stash@{0}` remains object `5d15a3ceca72837c2738f0f22599fd6330ea4233`.
  No commit, push, merge, version/changelog edit, branch operation, stash
  application, or deferred embed/Components V2 work occurred.
- The user accepted both focused smokes and clarified the product boundary:
  Anti-Nuke stores eligible messages and per-message location metadata from a
  deleted channel; it does not archive or recreate the channel itself.
- The post-smoke stable-log window contains no `DataCloneError`, old
  `normalize` exception, resolver failure, or MessageLoggerV2 error. It records
  successful Anti-Nuke captures at `07:05:25`, `07:06:12`, and `07:08:45`,
  followed by saved-message media promotion or confirmed caching. The final
  capture recovered one thread/forum root plus three messages and two
  attachments; the next lines recorded one promotion and one confirmed media
  write.
- The user authorized committing and pushing exactly this immediate-error
  checkpoint to `develop`. Deferred embed/Components V2 and release work remain
  paused.

### 2026-08-21 - Saved-attachment fallback add-on accepted and embed stage paused

- Published `e6b27c1799976be6561dc3e893acadc20ac06140` (`Complete saved
  attachment fallback handling`) to `develop`. It replaces per-surface failure
  drift with one exact saved-attachment coordinator: CDN/direct -> distinct
  proxy -> existing cached local Blob -> classified placeholder. Canonical
  records and signed URLs remain unchanged.
- Restored native rows, Logger image/video/audio mounts, inline edit-history
  media, Logger-owned native image/video viewers, the custom video modal, and
  existing attachment-open routes now converge on that policy where each
  surface has a trace-proven load/open failure signal. Ordinary Discord media
  and foreign or ambiguous targets fail closed.
- Logger-owned native viewer handling now covers image/video and nested
  `<source>` errors, URL normalization, exact modal ownership, and terminal
  local-Blob failure. Logger-specific Blob renderers remount to their existing
  exact placeholder rather than remaining broken.
- Restored saved videos no longer retain a second Discord-native attachment
  accessory beside Logger's owned mount. The late `MessageAccessories.render`
  patch uses immediate semantic lookup followed by abortable
  `Webpack.waitForModule`; a successful late resolution performs one refresh.
  No fixed millisecond timer, polling loop, animation-frame retry, or
  MutationObserver was introduced.
- The disposable exact-fault helper and batch policy harness were used only to
  exercise transient failure/remount state against exact saved attachment
  identities. Their findings were incorporated into production and tests; the
  live helper link and generated report were removed afterward.
- The final pre-embed addition wires inline text/code renderer availability to
  the same coordinator. Only strict text/code extensions and accepted text,
  JSON, JavaScript, or XML MIME types receive the React-lifecycle-owned native
  `Range: bytes=0-0` probe. One in-flight request is shared per exact candidate,
  responses are released, and stop/setting/generation changes cancel or reject
  stale work. Live restored `MessageAccessories` and detached Logger document
  hosts are both covered without duplicate probes.
- PDF, BIN, archives, fonts, executables, unknown generic cards, and other
  unsupported direct files deliberately keep their existing open/download or
  local-file path. This add-on does not create an arbitrary-file renderer,
  expand cache eligibility, execute attachment content, or persist transient
  availability state.
- Final parent validation passed focused media/source-contract tests `297/297`,
  full `npm test` `638/638`, `npm run check`, and `git diff --check`. An
  independent final review returned go with no blocking or high-risk issue.
- The repository and installed BetterDiscord plugin are byte-identical at
  SHA-256
  `8977f3ce02a896e60fa29cb8e6414d140640747c6080ae4aa901a9d4f863bfb6`.
  BetterDiscord hot-reloaded the plugin, found the native image modal, applied
  all patches, and completed its UI refreshes without a new MessageLogger
  exception. The user accepted the final renderer-triggered fallback smoke.
- `git stash list` is empty. At the user's request, the failed unsafe embed
  experiment was deleted rather than preserved. No old embed or attachment
  trace helper is linked in the live BetterDiscord plugin folder.
- The commit containing this entry is the final four-file pre-embed checkpoint:
  this checklist, `MessageLoggerV2.plugin.js`, `tests/media.test.js`, and
  `tests/source-contracts.test.js`. The user authorized pushing it to
  `develop`, then explicitly paused Logger-viewer embed/Components V2 work until
  later. Stage 4a, Stage 4b, Stage 5, Stage 9, release metadata, `main`, and all
  other branch work remain untouched and paused.

### 2026-08-30 - Discord compatibility audit continuation checkpoint

- Published production compatibility commits through
  `670d6de861a032c00e9999147adf99eabb84b9cb` on `develop`. The current Logger
  and permanent audit helper are byte-identical to their installed BetterDiscord
  copies at SHA-256
  `c9250059c7ad79abf7483a27a9db3764894c5e5056219a526ff228f4919f1269`
  and
  `01ac8a9c546378e38c8881c22a3d0bfd0972af52b2ec4edfe82cc8f08a031163`
  respectively.
- Production now has guarded semantic CSS normalization, exact class-token
  observer handling, corrected Logger-view group boundaries, a semantic
  MaskedLink resolver with a safe absolute-HTTP(S) fallback, and the audited
  optional `BdApi.Utils.loadEntry` behavior. Six dead Logger lookup definitions
  were removed. No version, changelog, embed renderer, cache policy, or
  BetterDiscord host source changed.
- The final automated production gate passed `npm run check`, full `npm test`
  `667/667`, and `git diff --check`; an independent review returned GO.
- The user ran the permanent helper's combined `full-audit` exactly once with
  optional load-entry and external-asset checks enabled. The retained report at
  `$HOME/Library/Application Support/BetterDiscord/plugins/MessageLoggerRuntimeCompatibilityAudit-report.json`
  contains `89` contracts: `53` pass, `28` warn, and `8` fail, with no scanner
  error. Host/platform, common and forum DOM, Logger-owned styles/mounts,
  Logger link integration, fixed renderer assets, and optional load-entry
  transition all passed.
- The audit inventory is complete, but the helper is not yet fully accepted.
  Seven failures are known selection false negatives caused by descriptor-only
  access to BetterDiscord's `Webpack.Stores` Proxy: `UserStore`, `MessageStore`,
  `SelectedChannelStore`, `SelectedGuildStore`, `GuildStore`,
  `GuildMemberStore`, and the derived `Dispatcher`. The eighth is the absent
  fallback-backed legacy `containerCozyBounded` CSS shape, which must be
  optional/warn rather than a required failure.
- The next session must implement only those helper selection/status fixes and
  focused regressions before deciding whether one final live dump is needed.
  Do not redo the broad inventory. Logger-viewer embed/Components V2 and Stage
  9 warning-identity work remain paused.
- Active root session ID:
  `01a022f7-17f8-7b52-8cf3-e0e009dff3b3`; rollout:
  `$HOME/.codex/sessions/2026/08/21/rollout-2026-08-21T16-16-54-01a022f7-17f8-7b52-8cf3-e0e009dff3b3.jsonl`.

### 2026-08-30 - Runtime audit helper correction accepted

- Corrected only the permanent audit helper and its deterministic coverage.
  Selected stores now use guarded `Webpack.Stores[storeName]` Proxy access
  with the public `Webpack.getStore(storeName)` fallback, including when the
  Proxy is unavailable or throws. Caught host error messages are not copied
  into the report, and generic/cache scans remain descriptor-only.
- `Dispatcher` now validates the selected `UserStore._dispatcher` instead of
  requiring a separate public module root. `Css.ContainerClasses` is the sole
  optional CSS contract, so its absent fallback-backed legacy
  `containerCozyBounded` shape warns while unresolved current CSS contracts
  continue to fail.
- The Proxy/fallback, Dispatcher, error-sanitization, and CSS-status regression
  coverage passes `7/7`. The clean baseline and final full `npm test` runs pass
  `667/667`; `npm run check` and `git diff --check` pass. An independent
  review's medium missing/throwing-`Stores` coverage finding was closed with
  two public-fallback report variants, and re-review returned GO with no
  blocking, high, or medium finding. The earlier low-priority CSS invariant was
  also added.
- The existing `89`-contract live report remains the pre-correction evidence
  for loaded candidate shapes and the broader inventory. Combined with the
  deterministic correction, it is sufficient for acceptance; no second live
  dump, helper sync, or Discord restart was needed.
- The installed audit helper and report were removed from the live plugins
  directory and initially moved to
  `$HOME/.Trash/MessageLoggerRuntimeCompatibilityAudit-accepted-2026-08-30/`.
  Final verification found that the Trash destination was absent, so the raw
  report is not recoverable from the live or Trash locations; the helper
  source remains recoverable from Git history. Their original live paths and
  report temporary path are also absent. The report's decision-grade facts
  remain recorded in the compatibility handoff, and the corrected helper
  remains tracked under `tools/` for future runtime drift.
- `MessageLoggerV2.plugin.js` was not edited and remains byte-identical to the
  installed copy at SHA-256
  `c9250059c7ad79abf7483a27a9db3764894c5e5056219a526ff228f4919f1269`.
  No version, changelog, cache policy, embed renderer, BetterDiscord host,
  `main`, or release work was changed or resumed.
- Active root session ID:
  `01a05291-de83-7d30-864b-ada47ac1ac10`; rollout:
  `$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T22-08-06-01a05291-de83-7d30-864b-ada47ac1ac10.jsonl`.

### 2026-08-30 - Obsolete optional contracts resolved and final audit accepted

- This follow-up supersedes the historical `Css.ContainerClasses` optional-
  warning status immediately above. The user authorized deciding the two
  remaining optional consumers rather than retaining dead fallbacks.
- Removed the stale `TextModule` source lookup and intentionally retained its
  already-active local Clear Log confirmation body. The user confirmed the
  dialog renders live after sync and cancelled it successfully.
- Removed the unused `containerCozyBounded` getter and observer hint. Its
  previous fallback was a nonmatching sentinel; the current `chat`,
  `chatContent`, `title`, and exact inline-style observer paths remain.
- Removed both obsolete contracts from the permanent audit helper. It now maps
  all `51` Logger lazy getters in an `87`-contract report. Guarded native
  document/audio `BdApi.Utils.loadEntry(MessageAccessories)` behavior remains
  unchanged.
- Baseline and final `npm test` pass `667/667`; focused production coverage
  passes `104/104`; runtime-audit coverage passes `7/7`; `npm run check` and
  `git diff --check` pass. Independent review returned GO with no blocking,
  high, or medium finding.
- The final live report generated at `2026-08-30T13:10:47.062Z` reports `57`
  pass, `30` warn, `0` fail, and `87` total across `8469` roots with no scanner
  error. Every warning has a selected, valid consumer; unresolved and false-
  positive counts are both zero. Assets pass, and the optional load-entry check
  reports `targets-already-loaded` without invoking a load.
- Repo/live Logger copies match SHA-256
  `8c0294a84b0d029ff4e67fc589a3f772695cd58d5f2cd7e315aabd9d3b17032e`.
  The report and helper symlink were removed from the live plugins directory
  and archived under
  `$HOME/.Trash/MessageLoggerRuntimeCompatibilityAudit-final-clean-2026-08-30-1310/`.
  No Discord restart, release metadata, commit, push, `main`, or paused
  cache/embed scope was changed.
