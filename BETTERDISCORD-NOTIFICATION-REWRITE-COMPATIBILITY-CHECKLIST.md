# Deferred BetterDiscord Notification Rewrite Compatibility Checklist

Status: **DEFERRED**. Reopen this checklist only after official upstream BetterDiscord promotes the currently development-only notification rewrite to a stable release. This checklist authorizes no runtime or source change.

Related records: [`docs/runtime-compatibility-audit.md`](docs/runtime-compatibility-audit.md) and [`docs/tests.md`](docs/tests.md).

## Checked baseline — 2026-09-02

- [x] Audit snapshot: Logger `develop` at `dc5241c`; BetterDiscord fork `develop` at `fe3a3945`; upstream `development` at `37a229a5`; reviewed range `46b95b20..37a229a5`. These are development baselines only; stable may differ.
- [x] The Logger contract uses only public `BdApi.UI.showNotification`, unique string IDs, and the standard `title`, `content`, `type`, `duration`, `actions`, and `onClose` options. It uses `handle.close()` only; it does not use `render`, `isVisible`, or internal notification imports.
- [x] Relevant Logger symbols are `notifyUser`, `_showNotification`, `_createNativeNotificationId`, `_dismissReplaceableNotification`, `_drainNativeNotificationQueue`, `_scheduleNativeNotificationYield`, `_clearNativeNotificationQueue`, and `handleNotificationModeChange`.
- [x] No current MessageLogger source change is indicated. This checklist is documentation-only and authorizes no runtime or source change.

## Stable-release activation gate

- [ ] Prove that an official stable release, tag, and ref contain the promoted notification rewrite.
- [ ] Compare the final stable implementation with local BetterDiscord `develop` first and with upstream; never assume development code survived unchanged.

## Compatibility objective

- [ ] Treat mainstream BetterDiscord's public notification contract as authoritative so plugins written for it receive the same supported options and handle behavior on the fork.
- [ ] Preserve upstream-compatible optional IDs, custom `render`, deduplication, default actions/timing/`onClose`, and the returned `id`/`isVisible()`/`close()` handle.
- [ ] Keep old-runtime and fork hardening private; do not expose a fork-only notification API or version gate.

## Development-host concerns to re-check in stable

- [ ] Confirm stable does not rely unconditionally on `WeakMap#getOrInsertComputed` in the older runtime; a type declaration alone does not implement it.
- [ ] Verify that removing a notification through `handle.close()` emits the required store update and cannot leave a stale card.
- [ ] Verify that anonymous React notification entries receive stable private keys.
- [ ] Verify that explicit UI initialization preserves early and pre-initialization calls.
- [ ] Keep the fork-only addonupdater migration in BetterDiscord.
- [ ] Re-check the custom-render contract. Development passes `{notification}`, replaces the standard content/actions/close/progress UI, and pauses default expiry. Logger does not use it, but the fork must preserve the final upstream stable behavior for other plugins.

## Host checks

- [ ] Check macOS Big Sur and the older Discord runtime target.
- [ ] Verify ID-bearing `showNotification` calls do not throw.
- [ ] Verify same-ID behavior.
- [ ] Verify close immediately removes the notification and emits the corresponding update.
- [ ] Verify an early notification appears after UI initialization.
- [ ] Verify the standard timer, hover behavior, actions, and `onClose`.
- [ ] Verify custom-render props, replacement behavior, and lifetime match upstream stable.
- [ ] Verify no stale notification DOM remains.

## Logger revisit

- [ ] Capture the baseline before any compatibility work.
- [ ] Run the focused suite:

  ```text
  node --test --test-name-pattern='notification|native setting|rapid same-setting|non-hovering|mode changes' tests/persistence.test.js tests/notification-events.test.js
  ```

- [ ] Then run `npm test`, `npm run check`, `npm run test:runtime-audit`, and `git diff --check`.
- [ ] Add tests only if the stable implementation reveals a Logger coverage gap.
- [ ] Exercise startup/error, finite expiry, timeout `0`/`Infinity` queue yield, `pauseOnHover: false`, instant dismiss, actions/manual close, `replaceKey`, mode change, and stop/reload cleanup. Confirm no stale `.bd-notification` remains and the queue advances once.

## Decision and boundaries

- [ ] If the public contract is preserved, record that no Logger code change is needed.
- [ ] Otherwise trace first and make the smallest guarded public-API adaptation; never import `@stores/notifications` or `@ui/notifications`.
- [ ] Keep host defects and host tests in BetterDiscord.
- [ ] Make no version, changelog, live-sync, restart, or release change without explicit approval.
- [ ] Keep this checklist separate from the active media/viewer checklist and TODO.
- [ ] Archive or move this checklist only after resolution and explicit user request.
