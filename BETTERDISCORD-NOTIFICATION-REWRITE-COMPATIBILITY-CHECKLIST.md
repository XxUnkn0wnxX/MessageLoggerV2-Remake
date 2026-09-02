# BetterDiscord Notification Compatibility Cleanup Checklist

Status: **ACTIVE COMPATIBILITY / DEFERRED CLEANUP**. Keep one Logger build
compatible with both BetterDiscord's current older stable notifications and the
store-backed rewrite used by upstream development and the local fork. No Logger
source change is needed now.

## Keep until upstream stable promotion

- [x] Use only public `BdApi.UI.showNotification` with unique string IDs,
  shared standard options, and guarded returned-handle `close()` calls.
- [x] Keep Logger's queue, replacement cleanup, wall-clock expiry, and click
  handling. The development rewrite does not yet replace these behaviors with
  equivalent public controls.
- [x] Do not add BetterDiscord internal imports, a fork-only API, or a host
  version gate.

## Cleanup after promotion

- [ ] Confirm an official upstream stable tag/release contains the rewrite and
  compare its final public behavior with the fork and Logger.
- [ ] Explicitly end support for the older implementation before removing code
  that it still needs.
- [ ] Remove only notification compatibility code that the promoted stable API
  fully replaces. Keep unique IDs, queue ordering, replacement, close cleanup,
  and interaction/expiry handling unless stable provides tested equivalents.
- [ ] Record exactly what became redundant, what was removed, and why every
  retained compatibility helper is still necessary.

## Verification for that cleanup

- [ ] Run:

  ```text
  node --test --test-name-pattern='notification|native setting|rapid same-setting|non-hovering|mode changes' tests/persistence.test.js tests/notification-events.test.js
  npm test
  npm run check
  git diff --check
  ```

- [ ] On promoted stable and the fork, verify native/custom switching, click
  dismissal, queue advancement, replacement, actions, and stop/reload cleanup
  without stale cards.
- [ ] Make no Logger runtime/code release change without separate approval.
