# 📋 Project TODO

This file tracks planned MessageLoggerV2 work that should survive across development sessions.

Status markers:

- [ ] Planned or incomplete.
- [x] Implemented and verified.

## 📎 Cache All Attachment Types Gate

Status: Known limitation in 2.8.2.9; follow-up after the networking release

- [ ] With **Cache media locally** Off, block every attachment type from ordinary Logger attachment capture and local caching, regardless of the saved child value.
- [ ] With the master On and **Cache all attachment types** Off, preserve established image, embed, sticker, and visual Components V2 handling while blocking every other file type from ordinary attachment history and local caching.
- [ ] With both switches On, accept any attachment type subject to the existing file-size limit, no-save queue, cache path, and record-based cached-file cleanup.
- [ ] Keep Anti-Nuke capture independent of ordinary ignores and the child gate while leaving all filesystem writes controlled by the master.
- [ ] Add deterministic on/off coverage and complete live validation without regressing the established media path.

## 🛡️ Bounded Provisional Recovery Media

Status: Audit complete; separate post-networking hardening stage

Anti-Nuke currently excludes DMs and only recovers records owned by the exact
deleted guild parent or its child threads. Its early media pre-cache may still
write eligible files from any guild channel because a future channel deletion
cannot be predicted. The Anti-Nuke record caps do not bound or clean up those
provisional files, so never-confirmed and cap-rejected candidates can remain
orphaned.

- [ ] Keep provisional physical media rather than URL-only references because
      Discord CDN URLs can expire as a channel disappears.
- [ ] Scope provisional candidates to guild parent/thread ancestry and never
      admit DMs.
- [ ] Keep only the newest Anti-Nuke provisional attachments allowed by its
      configured attachment limit, and add separate configurable maximum ages
      for Anti-Nuke and Ghost-Ping candidates.
- [ ] Apply bounded age, file-count, and byte limits with deterministic
      eviction.
- [ ] Promote only files referenced by a confirmed channel-deletion capture,
      confirmed Ghost Ping, or ordinary saved Logger record.
- [ ] Delete expired, unconfirmed, and capture-cap-rejected candidates without
      deleting a file still referenced by another saved record.
- [ ] Run provisional age/limit cleanup regardless of **Delete cached files
      with log records**. That switch controls media removed with real records;
      it must never disable orphan/provisional maintenance.
- [ ] Preserve the **Cache media locally**, no-save, file-size, cancellation,
      and Anti-Nuke ignore-bypass contracts.
- [ ] Add deterministic DM, unrelated-parent, ignored-guild, confirmation,
      capture-cap, eviction, and shared-file regression coverage before live
      testing.

## 💾 Preserve Data After No-Save Sessions

Status: Implemented and covered by automated tests; live validation pending

### Problem

When **Disable saving data** is enabled, saved history remains loaded by default while new records stay memory-only. The linked **Disable loading archived data** preference may instead detach the archive without changing it on disk.

Re-enabling saving must still merge the current session with the latest disk-backed history without duplicates or lost state.

### Required Behavior

- [x] Preserve existing disk-backed history.
- [x] Keep existing history visible after a no-save reload.
- [x] Optionally skip or hot-detach archived history while preserving temporary session activity.
- [x] Hot-reattach the archive in memory without writing and block archive removal writes while detached.
- [x] Preserve eligible records captured during the no-save session.
- [x] Merge both sets when saving is re-enabled after a reload.
- [x] Keep duplicate message IDs out of every category index.
- [x] Preserve deleted, edited, purged, nuked, hidden, forum/thread, and suppressed-root state.
- [x] Apply normal saved-message caps after merging.
- [x] Keep the existing behavior when the setting is toggled without a reload.

### Implementation

- [x] Add a helper that loads and validates the persisted data payload.
- [x] Merge `messageRecord` by message ID using a documented deterministic conflict rule.
- [x] Union and de-duplicate deleted, edited, purged, and nuked channel indexes.
- [x] Union suppressed forum/thread IDs.
- [x] Rebuild corresponding in-memory sets and sorted caches.
- [x] Save the merged primary payload and backup only after the merge completes.
- [x] Update the setting note and documentation to explain preserved history behavior.
- [x] Add automated regression tests for merge, de-duplication, caps, and category indexes.

### Validation

- [x] Create a known saved record while normal saving is enabled.
- [x] Enable **Disable saving data**, then reload Discord or the plugin.
- [x] Confirm the existing archive remains visible before creating temporary records.
- [x] Create deleted, edited, purged, nuked, and forum/thread test records.
- [x] Re-enable saving.
- [x] Confirm original and temporary records remain in their correct tabs after another reload.
- [x] Confirm hidden state and forum/thread root-child relationships survive the merge.
- [x] Confirm **Delete** still removes the correct merged records.

## ✅ Completed: Cross-Fork Data Normalization

Status: Implemented and live validated

- [x] Accept legacy `deletedata` and `editHistory` aliases alongside canonical fields.
- [x] Preserve surviving forum/thread, saved-location, hidden, Anti-Nuke, and cache metadata.
- [x] Fill missing optional enhanced fields with safe empty values.
- [x] Rebuild missing or misplaced deleted, edited, purged, and nuked channel indexes from canonical records.
- [x] Keep de-duplication scoped to message IDs, individual category indexes, edit entries, and attachment identities.
- [x] Keep canonical output stable when DM, deleted-channel, or referenced-message channels are absent from Discord's live store.
- [x] Keep Discord renderer mutations isolated from canonical saved message and user objects.
- [x] Initialize newly captured records with every canonical empty collection used by normalization.
- [x] Atomically rewrite the complete primary payload while retaining the previous backup as a recovery point.
- [x] Normalize a valid backup and restore the primary when the primary is missing or invalid.
- [x] Preserve opaque top-level metadata owned by other forks, including across no-save merges.
- [x] Fail closed without backup fallback or writes when a newer schema is detected.
- [x] Route migration progress, success, and failure alerts through the selected notification/toast handler.
- [x] Keep the standard four core payload maps and canonical record fields readable by current MessageLoggerV2 forks.
- [x] Add mixed-schema, legacy round-trip, compatibility-shape, migration-success, and migration-failure tests.

Enhanced metadata that another fork completely removes cannot be reconstructed and remains blank after normalization.

## 🧱 Full Embeds and Components in the Logger Viewer

Status: Backlog; raw serializable source is preserved and component-only records now receive a concise Logger-view summary

- [ ] Add a MessageLogger-owned render box for complete embeds, message snapshots, and legacy/Components V2 trees.
- [ ] Reuse the viewer's existing image and media-opening behavior.
- [ ] Preserve nested layouts, fields, buttons, selects, accessories, and unknown future serializable fields.
- [ ] Render archived interactive controls as read-only/disabled so they cannot send stale interactions.
- [ ] Keep safe fallbacks for older records whose embed/component fields were already discarded.
- [ ] Add deterministic renderer-shape coverage and live checks for classic, nested, app/webhook, and Components V2 examples.

## 🧩 Multi-Instance Storage Isolation

Status: Backlog

- [ ] Decide whether separate Discord instances should use isolated logger data and media-cache paths.
- [ ] Define a stable profile or instance identifier without breaking existing installations.
- [ ] Plan migration and fallback behavior for the current shared data files.

This is separate from the no-save merge. Until implemented, simultaneous Discord instances can still write the same logger files and the last complete writer wins.

## ✅ Completed: Atomic Data Writes

Status: Completed

- [x] Write primary and backup payloads to same-directory temporary files.
- [x] Close each complete temporary write before replacing its destination.
- [x] Atomically rename completed temporary files over their destinations.
- [x] Preserve the previous JSON file when a write or rename fails.
- [x] Remove failed temporary writes.
- [x] Remove stale logger temp files during startup while preserving recent active writes.
- [x] Keep shutdown flushes on the same safe write path.
- [x] Add automated tests for normal, backup, shutdown, failure, and stale-cleanup paths.

Implemented in 729da2024e8b7c5e18b582879bf9fd5b0ed80720.

Startup cleanup and official tests completed in 927b99e6949b2a8457c680428997fea4a5766188.
