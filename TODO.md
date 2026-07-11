# Project TODO

This file tracks planned MessageLoggerV2 work that should survive across development sessions.

Status markers:

- [ ] Planned or incomplete.
- [x] Implemented and verified.

## Preserve Data After No-Save Sessions

Status: Planned

### Problem

When **Disable saving data** is enabled, reloading the plugin or Discord starts the logger with an empty in-memory record while leaving existing history on disk. If saving is later re-enabled, the temporary session can overwrite that older disk-backed history.

### Required Behavior

- [ ] Preserve existing disk-backed history.
- [ ] Preserve eligible records captured during the no-save session.
- [ ] Merge both sets when saving is re-enabled after a reload.
- [ ] Keep duplicate message IDs out of every category index.
- [ ] Preserve deleted, edited, purged, hidden, forum/thread, and suppressed-root state.
- [ ] Apply normal saved-message caps after merging.
- [ ] Keep the existing behavior when the setting is toggled without a reload.

### Implementation

- [ ] Add a helper that loads and validates the persisted data payload.
- [ ] Merge `messageRecord` by message ID using a documented deterministic conflict rule.
- [ ] Union and de-duplicate deleted, edited, and purged channel indexes.
- [ ] Union suppressed forum/thread IDs.
- [ ] Rebuild corresponding in-memory sets and sorted caches.
- [ ] Save the merged primary payload and backup only after the merge completes.
- [ ] Update the setting note and documentation to explain preserved history behavior.
- [ ] Add automated regression tests for merge, de-duplication, caps, and category indexes.

### Validation

- [ ] Create a known saved record while normal saving is enabled.
- [ ] Enable **Disable saving data**, then reload Discord or the plugin.
- [ ] Create deleted, edited, purged, and forum/thread test records.
- [ ] Re-enable saving.
- [ ] Confirm original and temporary records remain in their correct tabs after another reload.
- [ ] Confirm hidden state and forum/thread root-child relationships survive the merge.
- [ ] Confirm **Remove From Log** still removes the correct merged records.

## Multi-Instance Storage Isolation

Status: Backlog

- [ ] Decide whether separate Discord instances should use isolated logger data and media-cache paths.
- [ ] Define a stable profile or instance identifier without breaking existing installations.
- [ ] Plan migration and fallback behavior for the current shared data files.

This is separate from the no-save merge. Until implemented, simultaneous Discord instances can still write the same logger files and the last complete writer wins.

## Completed: Atomic Data Writes

Status: Completed

- [x] Write primary and backup payloads to same-directory temporary files.
- [x] Close each complete temporary write before replacing its destination.
- [x] Atomically rename completed temporary files over their destinations.
- [x] Preserve the previous JSON file when a write or rename fails.
- [x] Remove failed temporary writes.
- [x] Remove stale logger temp files during startup while preserving recent active writes.
- [x] Keep shutdown flushes on the same safe write path.
- [x] Add automated tests for normal, backup, shutdown, failure, and stale-cleanup paths.

Implemented in `729da20` and completed with startup cleanup and official tests in `927b99e`.
