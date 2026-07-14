# 🧪 Official Test Matrix

The repository uses Node's built-in test runner.

- Tests call real `MessageLoggerV2.plugin.js` methods through a minimal BetterDiscord mock.
- They do not start Discord, modify BetterDiscord data, or copy files into the live plugins folder.

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
| AT-03 | Settings defaults | Every fresh-install toggle, cap, list, nested toast option, captured keybind, locked legacy cache toggle, bounded automatic-backup interval, and opt-in debug control remains stable. |
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
| AT-18 | Anti-Nuke budgets | Thread, total-message, and attachment budgets are independent; defaults are `15`/`45`/`15`, and `0` remains unlimited. |
| AT-19 | Anti-Nuke eligibility | Thread-created system messages, ephemeral records, and unsupported message types are excluded. |
| AT-20 | Supported payloads | Text, attachments, embeds, and sticker-only messages remain eligible for logging. |
| AT-21 | Media identity | Attachments, embed images, stickers, and later-added media retain stable cache keys and record IDs. |
| AT-22 | Cache-only rendering | Rendered messages are detached from canonical saved records, cached attachments remain mounted, and uncached files receive filename placeholders. |
| AT-23 | Sticker media | Supported static and animated sticker formats render; unsupported formats are rejected. |
| AT-24 | Cached-file deletion | Removing a record deletes only its related local media files and preserves unrelated files. |
| AT-25 | No-save merge | Disk and session payloads merge deterministically with de-duplicated, mutually exclusive base-category indexes while retaining edit stacks and other shared record state. |
| AT-26 | No-save failure safety | Empty sessions, corrupt sources, failed renames, and stale in-flight writes cannot erase or replace existing history. |
| AT-27 | No-save state | Disabling reports the memory-only state, no-reload re-enabling reports queued in-memory changes, and reload recovery reports its merge path while preserving hidden, forum/thread, suppression, cap, and backup ordering contracts. |
| AT-28 | Cross-fork normalization | Legacy aliases, mixed enhanced fields, missing derived maps, scoped de-duplication, canonical defaults on newly captured records, idempotent output across changing Discord channel-store availability, canonical output shape, whole-file atomic migration, routed migration and backup-rebuild status, missing-primary backup restoration, opaque fork extensions, newer-schema fail-closed behavior, and legacy round trips remain covered. |
| AT-29 | Backup diagnostics | Console and routed-toast debug controls remain independent and off by default; backup events use the warning type and follow the selected native-notification or custom-toast route. |
| AT-30 | High-impact setting feedback | Every settings callback runs once. Logging scope, automatic backup, media caching, Anti-Nuke, automatic update, local-only rendering, and cached-file deletion actions log explicit states and follow the selected route; same-setting alerts replace stale ones, do not pause on hover, dismiss immediately on native-card or custom-toast left/right clicks, enabled uses info, disabled uses a theme-neutral presentation, debug remains warning, and errors remain red. |
| AT-31 | Settings config recovery | Valid legacy strict JSON initializes missing current settings without corruption classification or a corrupt backup, while preserving custom and fork-specific values. Extra, trailing, and missing commas, missing/extra/mismatched brackets, isolated invalid values, missing outer structure, and severe mixed corruption preserve recoverable owned and fork-specific settings, default only unrecoverable owned keys, atomically rewrite the config, retain the exact corrupt source, and never classify an existing config as a first install. |
| AT-32 | Logger keybinds | Native keybind arrays normalize safely across the all-log, selected-channel, and selected-server shortcuts; missing, unsafe, conflicting, or invalid config values receive safe defaults; empty arrays remain disabled; exact order-independent matches ignore repeats and extra held keys; recorder changes and modifier release clear stale chords. Every shortcut compares the requested filter with the actual logger state regardless of how it opened: matching states close, differing/custom/stale states close and reopen correctly, rapid transitions cancel stale callbacks, missing-channel/server attempts leave the current view untouched, DMs and group DMs cannot activate the server scope, native media viewers close first regardless of where they opened, and stacked MessageLogger-owned panels and user popouts close top-down without dismissing any other Discord modal. |
| AT-33 | Restored-item Trash | Native Trash is consumed only for exact indexed saved deletions and returns a completed async delete contract so native confirmation dismisses; live, edit-only, and unindexed records stay on Discord's original path; mismatched indexed metadata fails closed. The permission-independent restored-toolbar fallback retains no native callback, resolves direct/default and unambiguous single-function icon exports used by current Discord builds, mounts in the shared native action row, rebuilds an early outer fallback without moving its React root, and is visible only while the Shift root marker is active. Logger-owned hosts, SVGs, and Trash paths use Discord's current `--text-feedback-critical` destructive foreground with `--status-danger` fallback. When permissions omit native context Delete, an exact indexed saved deletion gains one top-level red local-only Delete; native Delete is never duplicated. Nested action mutations find their closest toolbar so native and fallback Trash controls cannot remain together, clone clicks stop parent navigation, every permanent record action is labeled and styled as destructive Delete, direct right-click Delete confirms, Shift-click and the injected logger submenu Delete remove immediately without starting text selection, ordinary presses retain focus behavior, lifecycle cleanup does not abandon or prematurely unmount React roots, and every removal uses the complete local record/UI cleanup flow. |
| AT-34 | Logger double-click | Logger-viewer rows, including blank attachment-wrapper space, jump only when the saved record still has a valid message or forum/thread destination and suppress selection on the second press. Direct media, links, Delete-key mode, and interactive controls retain their own actions. Hidden and Nuked records never expose Jump or its username cue. A structurally deleted forum/thread root requires an exact mounted target or a native card/thread template that can anchor restoration; a cached channel or surviving parent alone is insufficient. Only jumpable usernames receive the logger-window-scoped native warning cue. |
| AT-35 | Thread starter normalization | Restored forum-card and thread-browser previews pass only saved message text through the native parser, so mentions render normally while generated author and deletion labels remain literal text. Structurally deleted forum cards and compact threads mount from either the visible Deleted or Purged root index without duplication; disabling one category removes only its restored roots. Hidden records remain indexed but produce neither restored mounts nor warning/deleted tint on surviving native mounts. A surviving forum/thread card uses its exact saved preview-message ID to tint only deleted preview content; fully deleted roots retain full-card styling. The logger highlights a thread/post title only for a structurally deleted root carrying `forum_thread_delete`; only that full root may cascade child removal. Forum replies cannot overwrite a forum post's self-keyed starter identity. Deleting a saved starter while Discord still owns the post/thread removes only the starter and its aggressive-cache copy, immediately refetches the native message cache, and avoids the crash-causing synthetic Discord deletion. The exact stale forum snapshot remains preview-tinted for the session; after Discord reloads it as `Original message was deleted`, both the native card preview and the open post/thread self-keyed placeholder keep the same text-only tint without styling the title or replies. If the full root later disappears, every saved record belonging to that thread/post competes by original message timestamp regardless of Deleted, Purged, Edited, Ghost Ping, or Hidden state. The absolute oldest is promoted once as root context and keeps its category, hidden, edit, ghost-ping, media, and cache state; later records remain children. With no saved context, an explicit placeholder remains under the title. Normal and Anti-Nuke captures share this fallback. A distinct real starter still folds into one root with its body, author, media, edits, and original cache ID. A previously Purged starter stays exactly once in Purged when the full root is later deleted, and no Purged message is copied into Deleted. Identifiable legacy Anti-Nuke placeholders are repaired, and normalization is idempotent. |
| AT-36 | Nuked category | Anti-Nuke captures write to the fork-specific Nuked index, old Anti-Nuke-in-Purged records migrate once and idempotently, and existing Edited/Deleted/Purged/Ghost Ping records belonging to a deleted parent channel are immediately adopted into Nuked without losing hidden state, edits, metadata, or media. Forum/thread roots use the same real-starter, absolute-oldest-saved-context, then placeholder order as ordinary deletion; promoted records are de-duplicated and no longer consume a reply slot. Ordinary unrelated records remain separate, and disabling the conditional tab preserves both visible and hidden Nuked records. The optional detection alert defaults off, uses the destructive event theme, targets Nuked, bypasses normal logging/alert scope, rejects zero-content deletions, and remains dependent on both Anti-Nuke toggles. |
| AT-37 | Exclusive category precedence | Every canonical record keeps its full edit, ghost, hidden, metadata, and media state while using one base index. Display precedence is `Hidden > Nuked > Ghost Pings > Purged > Deleted > Edited`: ghost pings remain in Ghost Pings through edits and ordinary deletion/purge, Nuked permanently takes them over, and Hidden suppresses every visible category. Startup normalization, no-save merging, live event transitions, and forum/thread promotion must preserve this order. |

## 💬 Live Discord Matrix

The following checks depend on Discord's current Webpack exports, Flux events, React tree, or mounted DOM.

Run the relevant targeted manual check after a Discord UI update or related plugin change; Node tests cannot prove these runtime behaviors.

| ID | Area | Manual validation |
| --- | --- | --- |
| RT-01 | Startup and hot swap | Enable, disable, and hot-swap the plugin. Discord must not blank, freeze, or report a missing React component. |
| RT-02 | Normal channels | Delete, edit, bulk-delete, and ghost-ping messages. Confirm logging, tinting, restoration, context actions, and jump behavior. |
| RT-03 | Forum posts | Rename a post and edit its starter before testing partial and complete deletion. Test both a normal starter deletion and a bulk-purged starter before deleting the whole post: only one root may remain and its title/body must stay distinct. Toggling either category must mount only its eligible restored roots. Deleting only the starter must tint only the surviving card's preview content, not its title or background, and its logger location title must stay neutral. Delete that saved starter from Logger: saved replies must remain, the native confirmation must dismiss, and the forum view must not crash. Its exact stale native card snapshot must remain red for the session; after reload, Discord's `Original message was deleted` replacement must be red in both the card and open post/thread header while the title, card, and replies stay neutral. Create an older Purged reply and a later Deleted command, then delete the whole post: the restored red root must use the older reply, inherit Purged membership, and leave the later command under Deleted. Reverse those categories, then repeat with the oldest record hidden or present only as an edited ghost ping; original timestamp must always win and Hidden must remain hidden. With no saved context, the root shows the empty-content placeholder. Native surviving cards must open Discord's thread view; fully restored cards must open the filtered logger view, saved user mentions must render instead of showing raw `<@id>` text, and the main logger must keep the latest title in the highlighted root location line. |
| RT-04 | Forum anchors | Confirm fully deleted cards render only while at least one live forum card exists, including live refresh after deleting the currently open post. When the deleted post/thread was the only entry and no native anchor remains, its logger username must stay neutral and row/context Jump must be absent. Hide any otherwise jumpable forum/thread record and confirm Hidden exposes zero jump cues or actions. |
| RT-05 | Channel threads | Rename a thread and edit its initial message, then add replies B/C. Test both a normal initial-message deletion and a bulk-purged initial message before deleting the whole thread: the starter must fold into one root, a Purged starter/root must remain under Purged and restore in the sidebar/thread browser when Purged display is enabled, and a Purged reply alone must not move the root out of Deleted. Toggling either category must mount only its eligible restored roots. Deleting only the initial message must tint the native Threads-dialog preview without tinting its title or background, and its logger location title must stay neutral. Removing that saved initial message from Logger must leave B/C intact, avoid a native React crash, and refetch without the former 500 ms delay. Delete the oldest saved message, purge newer replies, hide that oldest record, and then delete the whole thread: the hidden oldest record must still become the root by original timestamp and remain Hidden. Category and deletion order must never outweigh timestamp. Deleting the whole thread while another live thread exists must apply full deleted styling; only this red full-root state may cascade children. With no saved context, the root shows the empty-content placeholder. Sidebar/browser restoration, labels, parsed mentions, filtered logger opening, media, and root actions must remain correct. |
| RT-06 | Root actions | Hide, unhide, and remove a forum/thread root from both its restored entry and logger window. Confirm child records and mounted entries update immediately; hidden roots and children must leave no restored mount or warning/deleted tint on surviving native content. |
| RT-07 | Native context menus | Confirm live Discord cards use native menus and restored cards expose logger actions without displacing injected items from other plugins. |
| RT-08 | Notifications | Test BetterDiscord and custom notification modes for guilds and DMs. Confirm queue order, hover pause, dismissal, View, and Jump actions. |
| RT-09 | Media lifecycle | Delete attachment-only, sticker, embed, video, and Add-to-Post media. Confirm cache/CDN fallback, placeholders, tinting, context actions, and optional local-file deletion. |
| RT-10 | Anti-Nuke dispatch | Before deleting a populated text or forum channel, create visible and hidden Deleted/Purged records in both the parent and one child thread/post. Delete the parent and confirm every existing related record moves immediately into Nuked, retains its hidden state, and does not remain in Deleted/Purged; unhiding one must return it to Nuked. Confirm newly captured records also appear only under Nuked while ordinary bulk deletes elsewhere remain under Purged. Enable nuke detection toasts and confirm one destructive-colored alert opens Nuked through the selected notification mode; disable it and confirm capture continues silently. For a channel thread whose title differs from its initial message, confirm one Nuked root uses the highlighted title metadata and initial body while later replies remain separate. Disable Anti Nuke and confirm the Nuked tab disappears without deleting records; hidden Nuked records must remain under Hidden. Unhide one while disabled, re-enable Anti Nuke, and confirm it returns under Nuked. Also confirm newest-first capture, configured budgets, root preservation, location metadata, and unavailable Jump actions. |
| RT-11 | Settings UI | Open each settings group, confirm only one group remains expanded, and verify changed settings apply when the logger window is reopened without restarting Discord. |
| RT-12 | Persistence recovery | In a disposable BetterDiscord profile, verify primary corruption loads a valid automatic backup, reports that the main file is being rebuilt, and retains the backup. Never corrupt the active profile for this check. |
| RT-13 | No-save recovery | In a disposable profile, save known records, restart with saving disabled, create temporary deleted/edited/purged/nuked/forum records, then re-enable saving and confirm both generations survive another reload. |
| RT-14 | Backup diagnostics | Open the warning-colored **Debug** group and verify both toggles default off. Enable console-only, toast-only, then both; schedule a backup and confirm queue, reschedule, cancellation, start, retry, and completion events use only the selected destinations. |
| RT-15 | High-impact setting feedback | In both BetterDiscord-notification and custom-toast modes, toggle each high-impact setting listed in AT-30. Confirm exactly one console entry and alert per change, then toggle one setting rapidly and confirm only its latest alert remains. Verify hover does not pause the visible countdown or expiry, native cards and custom toasts dismiss immediately on both left and right click, enabled is info blue, disabled is theme-neutral grey or a neutral native icon/card, and the setting's existing behavior still applies. |
| RT-16 | Settings config recovery | With a copied config and Discord fully closed, introduce representative comma/bracket damage while leaving several custom values intact. Relaunch and confirm valid values survive, invalid/missing keys use defaults, the canonical config and exact corrupt backup are written, and no first-user help appears. Separately test a disposable profile with no config: the help must match **First Setup**, use current setting/context-menu names, show one full-width **OK** button, and dismiss without opening the logger. |
| RT-17 | Logger keybinds | Under **Misc settings**, confirm `Ctrl+M` opens all logs and a second press closes them; `Ctrl+N` opens the currently selected channel and a second press closes it; `Ctrl+S` opens the currently selected server and a second press closes it. Open each state manually and confirm its matching shortcut still closes it. Switch among all/channel/server states and confirm the old modal closes before the requested state reopens without changing the selected logger tab. In a DM and group DM, `Ctrl+S` must show a warning and leave any current logger untouched. From stacked MessageLogger filter/help pages, press each shortcut and confirm every owned page closes top-down before the requested logger appears. Open a native media viewer from both MessageLogger and a normal Discord message; each must close before the requested logger view opens. An unrelated Discord modal or settings panel must remain untouched. Repeat rapid all/channel/server switching, location changes before `Ctrl+N` or `Ctrl+S`, chat focus, and a Discord reload. Capture three distinct safe combinations, clear each recorder, and test bare printable, modifier-only, and overlapping chords as in AT-32. |
| RT-18 | Restored-item Trash | On restored deleted messages in a normal channel, DM, open thread, and forum-post chat, confirm no logger-owned Trash is visible from hover alone. Hold Shift while hovering, then click Trash and confirm it immediately removes only the local logger record without highlighting nearby text. Include another author's message while using an account without moderation permissions on any supported Discord client: the logger must add its red local-only Shift action when Discord omits native Trash and one top-level red **Delete** when Discord omits its context item. Confirm that top-level Delete opens the local-only confirmation while nested **Message Logger > Delete** removes immediately. Verify an ordinary live message still follows Discord's normal permission and deletion flow. For a logger-window row, fully restored forum card, sidebar thread entry, and thread-browser card, repeat the hover-versus-Shift visibility check; every Trash glyph and permanent record context action must be red, direct right-click **Delete** must use the native icon and confirm, and Shift-click Trash removes immediately without selecting text. Hot-reload MessageLoggerV2 and repeat the confirmed native Delete path; the modal must dismiss after local removal. Deleting a root must remove its saved children without affecting live cards or threads. |
| RT-19 | Category precedence | Edit a message, then single-delete it: it must leave Edited and appear only in Deleted while retaining its edit stack. Repeat with bulk purge for Purged and parent-channel deletion for Nuked. Create ghost pings through edit, single delete, and purge: each must appear only in Ghost Pings until its parent is Nuked, after which it appears only in Nuked. Hide representatives from every state and confirm they appear only in Hidden; unhide them and confirm they return to the correct current category. Repeat with a promoted forum/thread root and verify promotion preserves its edit stack without creating a second category entry. |

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
  keybinds.test.js
  media.test.js
  no-save-merge.test.js
  persistence.test.js
  policy.test.js
  records.test.js
  source-contracts.test.js
```

The helper exposes only the BetterDiscord APIs needed to load the exported class. Add narrow mocks to each plugin instance instead of turning the helper into a fake Discord client.
