# 🧪 Official Test Matrix

The repository uses Node's built-in test runner. Tests call the real methods exported by `MessageLoggerV2.plugin.js` through a minimal BetterDiscord mock. They do not start Discord, modify BetterDiscord data, or copy files into the live plugins folder.

## 📋 Requirements

- Node.js 20 or newer is recommended.
- No package installation is required.

## ▶️ Running Tests

Run the complete automated audit:

```sh
npm test
```

Equivalent direct Node command:

```sh
node --check MessageLoggerV2.plugin.js
node --test tests/*.test.js
```

Focused commands:

```sh
npm run check
npm run test:persistence
npm run test:runtime-contracts
```

`pnpm test` and `bun run test` may also invoke the same scripts, but Node remains the test runtime.

## 🤖 Automated Matrix

| ID | Area | Automated contract |
| --- | --- | --- |
| AT-01 | Plugin source | The distributed plugin parses successfully with `node --check`. |
| AT-02 | Metadata and updates | Source and update URLs continue to target this fork's `main` branch. |
| AT-03 | Settings defaults | Every fresh-install toggle, cap, list, nested toast option, and locked legacy cache toggle remains stable. |
| AT-04 | Primary persistence | Normal saves atomically replace the primary JSON file without leaving temp files. |
| AT-05 | Shutdown persistence | Synchronous shutdown saves use the same atomic replacement path. |
| AT-06 | Backup persistence | Backup data writes to its own atomic destination. |
| AT-07 | Failed writes | A failed rename preserves the previous JSON and removes the failed temp file. |
| AT-08 | Startup cleanup | Only logger temp files older than 60 seconds are removed; active and unrelated files survive. |
| AT-09 | Author gates | Bot, blocked-user, local-author, and ignore-self decisions remain per message. |
| AT-10 | Local delete tracking | Single-message, request-derived, and bulk local-delete IDs are recognized. |
| AT-11 | Notification scope | Guild, DM, local-user, selected-location, whitelist, and blacklist notification gates retain their precedence. |
| AT-12 | Notification queue | BetterDiscord notifications remain in a memory-only FIFO queue and can be cleared without persistence. |
| AT-13 | Root visibility | Hiding or unhiding a forum/thread root cascades to saved child deletions and edits. |
| AT-14 | Root removal | Removing a forum/thread root removes its child records and every affected index. |
| AT-15 | Suppression | Suppressed restored roots accept Discord IDs, persist in payloads, and can be removed. |
| AT-16 | Dynamic labels | Forum-post and channel-thread hide/remove labels remain distinct. |
| AT-17 | Anti-Nuke ordering | Deleted-channel cache collection is deduplicated, filtered, and newest-first. |
| AT-18 | Anti-Nuke budgets | Thread, total-message, and attachment budgets are independent; `0` remains unlimited. |
| AT-19 | Anti-Nuke eligibility | Thread-created system messages, ephemeral records, and unsupported message types are excluded. |
| AT-20 | Supported payloads | Text, attachments, embeds, and sticker-only messages remain eligible for logging. |
| AT-21 | Media identity | Attachments, embed images, stickers, and later-added media retain stable cache keys and record IDs. |
| AT-22 | Cache-only rendering | Cached attachments remain mounted while uncached files receive filename placeholders. |
| AT-23 | Sticker media | Supported static and animated sticker formats render; unsupported formats are rejected. |
| AT-24 | Cached-file deletion | Removing a record deletes only its related local media files and preserves unrelated files. |
| AT-25 | No-save merge | Disk and session payloads merge deterministically with de-duplicated deleted, edited, and purged indexes. |
| AT-26 | No-save failure safety | Empty sessions, corrupt sources, failed renames, and stale in-flight writes cannot erase or replace existing history. |
| AT-27 | No-save state | No-reload toggles retain existing behavior; reload recovery preserves hidden, forum/thread, suppression, cap, and backup ordering contracts. |
| AT-28 | Cross-fork normalization | Legacy aliases, mixed enhanced fields, missing derived maps, scoped de-duplication, canonical output shape, whole-file atomic migration, routed errors, missing-primary backup restoration, opaque fork extensions, newer-schema fail-closed behavior, and legacy round trips remain covered. |

## 💬 Live Discord Matrix

The following behavior depends on Discord's current Webpack exports, Flux events, React tree, or mounted DOM. Node tests cannot prove it, so these remain targeted manual checks after Discord UI updates or related plugin changes.

| ID | Area | Manual validation |
| --- | --- | --- |
| RT-01 | Startup and hot swap | Enable, disable, and hot-swap the plugin. Discord must not blank, freeze, or report a missing React component. |
| RT-02 | Normal channels | Delete, edit, bulk-delete, and ghost-ping messages. Confirm logging, tinting, restoration, context actions, and jump behavior. |
| RT-03 | Forum posts | Test partial starter deletion and complete post deletion. Native surviving cards must open Discord's thread view; fully restored cards must open the filtered logger view. |
| RT-04 | Forum anchors | Confirm fully deleted cards render only while at least one live forum card exists, including live refresh after deleting the currently open post. |
| RT-05 | Channel threads | Delete a complete thread while another live thread exists. Confirm sidebar/browser restoration, labels, tint, filtered logger opening, and child preservation. |
| RT-06 | Root actions | Hide, unhide, and remove a forum/thread root from both its restored entry and logger window. Confirm child records and mounted entries update immediately. |
| RT-07 | Native context menus | Confirm live Discord cards use native menus and restored cards expose logger actions without displacing injected items from other plugins. |
| RT-08 | Notifications | Test BetterDiscord and custom notification modes for guilds and DMs. Confirm queue order, hover pause, dismissal, View, and Jump actions. |
| RT-09 | Media lifecycle | Delete attachment-only, sticker, embed, video, and Add-to-Post media. Confirm cache/CDN fallback, placeholders, tinting, context actions, and optional local-file deletion. |
| RT-10 | Anti-Nuke dispatch | Delete a populated text or forum channel. Confirm newest-first capture, configured budgets, root preservation, location metadata, and unavailable Jump actions. |
| RT-11 | Settings UI | Open each settings group, confirm only one group remains expanded, and verify changed settings apply when the logger window is reopened without restarting Discord. |
| RT-12 | Persistence recovery | In a disposable BetterDiscord profile, verify primary corruption loads a valid automatic backup when backup is enabled. Never corrupt the active profile for this check. |
| RT-13 | No-save recovery | In a disposable profile, save known records, restart with saving disabled, create temporary deleted/edited/purged/forum records, then re-enable saving and confirm both generations survive another reload. |

## 🔍 Audit Policy

- Run the complete automated suite before every commit that changes plugin behavior.
- Run only the relevant `RT-*` checks for the subsystem changed.
- After a Discord update, run `RT-01`, then the forum/thread/context-menu checks most affected by DOM and Webpack drift.
- A passing automated suite does not replace runtime traces for missing Discord classes, modules, events, or mount points.
- Add a regression test whenever a deterministic bug is fixed. Keep Discord-specific traces under ignored `tmp/` rather than committing them as tests.

## 🗂️ Test Layout

```text
tests/
  helpers/plugin-harness.js
  anti-nuke.test.js
  media.test.js
  no-save-merge.test.js
  persistence.test.js
  policy.test.js
  records.test.js
  source-contracts.test.js
```

The helper provides only the BetterDiscord APIs needed to load the exported class. Tests should add narrow mocks on each plugin instance instead of growing the helper into a fake Discord client.
