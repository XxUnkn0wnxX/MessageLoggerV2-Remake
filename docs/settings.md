# ⚙️ Settings Reference

This page documents the controls shown in **BetterDiscord Settings > Plugins > MessageLoggerV2 Settings**. Defaults refer to a fresh installation; older installations retain saved values when new settings are added.

## 🔗 Linked Controls

On current BetterDiscord builds, dependent controls are greyed out while their master is off. Their saved values are retained and become active again when the master is re-enabled; the master does not flip or reset them. Older BetterDiscord builds that do not understand dependency metadata may leave standard child controls usable, but the plugin and saved values continue to work; the plugin-provided **Auto backup interval** and **Edit spam threshold** fields still follow their master.

| Master switch | Controls unavailable while Off |
| --- | --- |
| Display saved messages in chat | Include Deleted messages; Include Purged messages; Use background instead of text tint for deleted messages |
| Display edited messages in chat | Max number of shown edits; Show oldest edit instead of newest if over the shown edits limit |
| Disable saving data | Disable loading archived data |
| Auto backup data (won't fully prevent losing data, just prevent total data loss) | Auto backup interval (seconds) |
| Cache media locally | Add user id to saved media filename; Cache all attachment types; Max cache file size (MB, 0 = no limit) |
| Block spam edit notifications (if enabled) | Edit spam threshold |
| Enable Anti Nuke | Show nuke detection toasts; Thread and forum post cap; Total message cap; Total attachment cap |

The deleted-message color, media-cache path, advanced cached-file policies, and self-message/edit ignores remain independent by design.

## 🎯 Logging Scope

The whitelist and blacklist are managed from the **Message Logger** submenu in server, channel, DM, and thread context menus.

### Scope precedence

1. **Always log selected channel** and **Always log DMs** bypass normal whitelist, blacklist, mute, and NSFW scope checks for their targets.
2. A whitelisted channel can still be logged inside a muted or blacklisted server.
3. A blacklisted channel is excluded inside a whitelisted server.
4. In whitelist-only mode, unlisted servers and channels are ignored.
5. Outside whitelist-only mode, unlisted targets are logged unless excluded by blacklist, mute, or NSFW settings.
6. Threads and forum posts inherit relevant parent-channel whitelist, blacklist, mute, and notification scope.

## 🚫 Ignores and Overrides

| Setting | Default | Behavior |
| --- | --- | --- |
| Ignore muted servers | On | Skips muted servers unless another scope rule overrides it. |
| Ignore muted channels | On | Skips muted channels unless the channel is whitelisted or an override applies. |
| Ignore bots | On | Skips bot-authored, app/interaction, and webhook messages in ordinary logging and Anti-Nuke capture. Their non-ephemeral embeds and Components V2 payloads remain supported when this is off; ephemeral messages are never logged. |
| Ignore messages posted by you | Off | Applies author filtering per message, including messages inside forums and threads. |
| Ignore message edits from you | Off | Skips edit-history logging for your messages while keeping their current deletion baseline updated. |
| Ignore message deletes from you | Off | Skips deletion actions initiated by the local client. For a locally deleted forum post or thread, the root deletion is not logged. |
| Ignore blocked users | On | Skips messages from blocked users, excluding the local user. |
| Ignore NSFW channels | Off | Skips unwhitelisted NSFW channels when enabled. |
| Only log whitelist | On | Requires servers or channels to be whitelisted unless an override applies. |
| Always log selected channel | On | Logs the selected channel regardless of normal scope rules. Selecting a parent channel also covers its child threads. |
| Always log DMs | On | Logs DMs regardless of normal scope rules. |
| Always log ghost pings | Off | Watches ignored locations for ghost pings from edits or individual deletes and only persists the message if it becomes a ghost ping. Bulk purges are not covered. |

`Ignore messages posted by you` and `Ignore message deletes from you` answer different questions: the first checks who authored each message; the second checks whether the deletion was initiated locally.

Self-related gates are cumulative across sent, edited, deleted, bulk-delete, ghost-ping, forum, and thread events:

- An author ignore excludes your message regardless of who acts on it.
- A local-action ignore excludes only actions initiated by this client.

## 🎨 Display Settings

| Setting | Default | Behavior |
| --- | --- | --- |
| Display dates with timestamps | On | Adds the configured date after ordinary plugin timestamps, including edit and deletion tooltips and restored-item labels. Turning it off leaves those displays as time-only; logger-viewer headers still force the date. Discord's native sent-time tooltip is unaffected. |
| Date format | System locale pattern | Type exactly one day token (`D` or `DD`), month token (`M` or `MM`), and year token (`YY` or `YYYY`) in any order, separated by `/`; for example, `DD/MM/YYYY` produces `04/03/2026`, while `D/M/YY` produces `4/3/26`. Other separators, lowercase tokens, duplicates, missing parts, and blank values are invalid. An empty field shows the detected system pattern as faint placeholder text, which disappears when typing. Invalid input stays red with an inline error while the saved value resets to the slash-based pattern derived from Discord's cross-platform native preferred-language call. Discord's locale store and browser locale are guarded fallbacks when that call is unavailable. The field includes a live preview. This format also controls forced logger-viewer dates when **Display dates with timestamps** is off. Plugin timestamps separate time and date with ` - `. |
| Display saved messages in chat | On | Master switch for live mounting enabled **Deleted** and **Purged** records in chat, forum, and thread views; only those two category names are warning-colored. Turning it off hides mounted records without deleting saved logs. Jump is hidden for records excluded by this master or their matching category switch. |
| Include Deleted messages | On | Live-mounts messages captured from individual deletions when the warning-colored phrase **Display saved messages in chat is enabled** applies. |
| Include Purged messages | On | Live-mounts messages captured from bulk deletions. **Display saved messages in chat must be enabled first.** |
| Display edited messages in chat | On | Shows saved edit history with messages. Turning it off hides inline history and its Jump actions, but edits remain logged. |
| Max number of shown edits | `0` | Limits visible edits; `0` means no configured limit. |
| Show oldest edit instead of newest if over the shown edits limit | On | When the edit limit is exceeded, keeps older edits visible instead of newer ones. |
| Use background instead of text tint for deleted messages | Off | Uses the configured deleted-message color as a background tint. |
| Deleted messages color | Empty | Sets deleted text and forum/thread tints. Accepts six hex digits with an optional `#` in any letter case; an empty value uses the built-in red. |
| Show amount of new deleted messages when entering a channel | On | Displays the unseen deleted-message count when entering a channel. Turning it off clears every pending deleted counter and reports the reset only when at least one pending count existed. |
| Show amount of new edited messages when entering a channel | On | Displays the unseen edited-message count when entering a channel. Turning it off clears every pending edited counter and reports the reset only when at least one pending count existed. |
| Show Hidden tab in logger | Off | Adds the **Hidden** tab. Hidden records remain stored when the tab is disabled. |
| Menu sort direction | New to old | Controls message ordering in the logger window. |

## 🧰 Misc Settings

| Setting | Default | Behavior |
| --- | --- | --- |
| Disable saving data | Off | New records, edits, counters, attachment references, and eligible media-cache requests stay in memory while archive additions and ordinary primary/backup/media writes pause. Saved history remains loaded unless the linked child below is enabled. While loaded, deliberate archival removals and related cached-file cleanup still use deletion-only writes. Re-enabling validates and merges when recovery is required, atomically replaces the primary file, and only then downloads queued media. A failed recovery leaves saving disabled and the media queue in memory. |
| Disable loading archived data | Off | When both this setting and **Disable saving data** are enabled, the saved archive is skipped or hot-unloaded and only temporary session records remain in memory. Every archive-owned row, live mount, tint, modal, and action is removed while session-owned equivalents remain usable. The archive stays unchanged on disk, archival removals and cached-file deletion are unavailable, and reload/disable discards the temporary session. Disabling this child hot-loads the latest archive and combines it with the session in memory without writing. Its saved preference remains visible on the greyed control but has no effect while its parent is disabled. |
| Auto backup data (won't fully prevent losing data, just prevent total data loss) | Off | Maintains a fallback copy of the logger data. It reduces, but cannot eliminate, data-loss risk. |
| Auto backup interval (seconds) | 20 | Waits this many seconds after saved data changes before refreshing the backup. Accepts whole numbers from 10 through 86,400; for example, `300` is five minutes. Blank is valid and saves the 20-second default. Other invalid drafts remain unsaved and are marked with a red field border and inline error instead of a toast. Invalid settings or manual config edits reset to 20 at startup. |
| Cache media locally | On | Master switch for caching attachments, embed images, Components V2 thumbnails/media galleries, and stickers. While **Disable saving data** is on, eligible logger media requests remain in a memory-only queue and no media files are created. The queue drains only after the primary archive save succeeds; disabling media caching or reloading first discards it. Pre-disable in-flight work is cancelled rather than revived. |
| Add user id to saved media filename | Off | Includes the author ID in hierarchical cache filenames. |
| Cache all attachment types | Off | Also caches videos, audio, other non-image attachments, and fetchable Components V2 File entries. |
| Max cache file size (MB, 0 = no limit) | `0` MB | Skips larger attachment files; blank or `0` disables the limit. Embed images and stickers are unaffected. |
| Media cache path (optional) | Empty | Uses a custom existing directory instead of `MLV2_IMAGE_CACHE`. |
| Aggresive message caching | On (locked) | Legacy setting retained for compatibility. It must remain enabled on this fork so message history is available for reliable forum and thread restoration. A saved `false` value is reset to `true` at startup. |
| Use new cached images system | On (locked) | Legacy setting retained for compatibility. The organized server/channel cache layout must remain enabled for reliable forum and thread media restoration. A saved `false` value is reset to `true` at startup. |
| Use BdApi notifications instead of custom toasts | On | Selects BetterDiscord notifications or plugin custom toasts for every logger alert and system/UI message. Switching it off immediately dismisses the active native notification and clears its memory-only queue. |
| Always show notifications for selected channel | Off | Allows enabled alerts while viewing the active channel, thread, or parent forum and overrides notification location lists there. |
| Always show notifications for selected guild | Off | Treats the currently open server as an override for notification location lists. |
| Show notifications to whitelisted only | Off | Restricts logger notifications to the notification whitelist. |
| Block spam edit notifications (if enabled) | Off | When enabled, reaching the configured threshold for one author within 60 seconds shows one warning and suppresses that author's edit alerts for 60 seconds. Toggling either way clears all author counts and pauses; turning it off shows the same reset notice as a threshold change only when something active was cleared, while turning it on resets silently. A preceding threshold reset consumes that state, so disabling immediately afterward cannot show a duplicate notice. The warning keeps expiring while hovered and dismisses immediately from a left- or right-click anywhere on its card. Edit history and Ghost Ping alerts continue normally. |
| Edit spam threshold | `10` | Sets the eligible edit count within 60 seconds that triggers the warning and fixed 60-second notification pause. Whole numbers `1` or higher are valid. Invalid input, including `0`, stays red with an inline error while the saved value resets to `10`; reopening the panel shows `10`. While blocking is enabled, changing this value clears all existing author counts and active pauses and shows a replaceable info notice only when live state existed. While blocking is off, changing it cannot clear state or send the notice. |
| Display open logs button next to the search box top right in channels | On | Shows the logger button beside channel search. |
| Toggle all logs keybind | `Ctrl+M` | Uses BetterDiscord's native keybind recorder. It closes an open unfiltered logger; any other logger state or stacked plugin-owned panel closes and reopens as all logs. An open native media viewer closes first, including one opened from a normal Discord message. Clear the recorder to disable it. Unsafe or overlapping captures are rejected inline. |
| Toggle selected channel logs keybind | `Ctrl+N` | Resolves the selected channel when pressed. It closes an open logger already filtered to that exact channel; any other logger state or stacked plugin-owned panel closes and reopens with that channel filter. Native media viewers close first; all other Discord panels remain open. Clear the recorder to disable it. |
| Toggle selected server logs keybind | `Ctrl+S` | Resolves the selected server when pressed and uses its server ID filter. It closes an open logger already filtered to that exact server; any other logger state or stacked plugin-owned panel closes and reopens with that server filter. It does nothing except show a warning in DMs and group DMs; the all-log and selected-channel shortcuts continue working there. Native media viewers close first; all other Discord panels remain open. Clear the recorder to disable it. |
| Automatically refresh new forum posts | On | Uses Discord's native **New Post(s)** control so cards appear without leaving and reopening the forum. |

### Local files

BetterDiscord stores the plugin's data beside the installed plugin:

- `MessageLoggerV2.config.json`: settings.
- `MessageLoggerV2Data.config.json`: active logs.
- `MessageLoggerV2DataBackup.config.json`: optional backup.
- `MLV2_IMAGE_CACHE/`: default attachment cache.

### Config safety

- Every accepted control change saves immediately through that setting's `onChange`. BetterDiscord's **Done** button only closes the panel, and hot reload or another unmount never acts as a save step.
- The two legacy cache settings remain present and locked to `true`. Manual `false` values are restored at startup.
- Missing or invalid owned settings are repaired to current defaults. Valid custom values and unknown fork-specific keys are retained.
- Keybinds accept modifiers plus one key, or `F1`–`F24` alone. Unsafe, duplicate, or overlapping combinations are rejected.
- Damaged JSON is repaired when possible; valid individual values are retained and the original is saved as `MessageLoggerV2.config.corrupt-backup.json`.
- First-time help appears only when no config existed. Legacy, incomplete, and repaired configs do not trigger it.

### Saving and recovery

- **Disable saving data** loads the saved archive by default. New records and edits stay in memory and queued ordinary primary/backup writes are cancelled. While the archive is loaded, removals use deletion-only writes that never serialize session additions.
- **Disable loading archived data** is active only with the parent above. Enabling it hot-detaches unchanged archived records, indexes, suppression state, fork extensions, archive-only author fallbacks, and BetterDiscord's retained archive objects while retaining records changed or created in this temporary session. Disabling it re-reads and reattaches the archive in memory without writing; a three-way delta preserves unrelated newer disk changes.
- These two large-operation controls temporarily grey out with a warning-orange pulse. The save control unlocks after the primary/message flush and queued-media drain settle; archive attach/detach locks both controls through a short presentation refresh. Other settings keep their existing immediate behavior.
- A primary session recovery gets up to three attempts within a 30-second transition window. Final failure keeps saving disabled and reports a persistent error. Turning **Disable saving data** **Off** again uses the recovery bypass: it performs no failed-session write, discards temporary records and queued media, reloads the last valid archive, and resumes normal writes for new activity. An individual media failure only drops and reports that media item.
- Re-enabling saving from detached mode re-reads disk, applies the exact temporary overlay and removals, de-duplicates indexes, preserves hidden/forum/thread state, applies caps, then atomically writes the primary before the backup. The child's stored preference remains available for the next no-save session.
- Progress and errors use the selected notification mode and include detailed console output. A failed recovery leaves existing files untouched and saving disabled.
- If the primary is missing or invalid, a valid backup is normalized and atomically rebuilds it. The backup remains untouched as a rollback copy and reports **Valid backup loaded. Rebuilding the main data file.**

### Compatibility

- Legacy and other-fork data is normalized into the current complete schema and atomically rewritten.
- Core message and legacy index fields remain readable by current MessageLoggerV2 forks. The additive `nukedMessageRecord` index is fork-specific; its core messages remain available to forks that ignore the extra key.
- Earlier Anti-Nuke records indexed as Purged are moved into Nuked during whole-file normalization.
- Surviving metadata and unknown top-level fork keys are retained. Metadata removed by another fork remains blank.
- A newer data or backup schema is never downgraded: the logger fails closed until it is updated.

### Removing records

Disabling a display option does not delete stored records. Use the red **Delete** action or **Clear log** for permanent removal.

## 🔔 Toast Notifications

Guilds and DMs have separate notification controls. These affect alerts, not whether records are saved. BetterDiscord notifications from every location share one memory-only FIFO queue; custom toasts continue to stack. During one plugin session, delete-family and sent-message alerts remember their message IDs so repeated Discord events cannot alert twice.

**Settings that control alert output and their states:**

| Setting | On | Off |
| --- | --- | --- |
| **Message sent**, **Message edited**, **Message deleted**, and **Ghost pings** under Guilds | Allows that guild alert when its other author, location, and scope gates pass. | Suppresses that guild alert without changing logging. |
| **Message sent**, **Message edited**, **Message deleted**, and **Ghost pings** under DMs | Allows that DM alert when its other author and scope gates pass. | Suppresses that DM alert without changing logging. |
| **Disable toasts for local user (yourself)** | Suppresses eligible guild alerts for actions initiated by this Discord client. | Allows those local-action guild alerts when their event toggle and other gates pass. |
| **Show nuke detection toasts** | Alerts only after Anti Nuke actually captures records from a deleted parent channel. | Anti Nuke can keep capturing silently. |
| **Show debug messages as toasts** | Sends eligible Debug events through the selected BetterDiscord-notification or custom-toast route. | Suppresses only Debug toasts; **Enable debug logging** remains independent. |
| **Use BdApi notifications instead of custom toasts** | Routes enabled alerts through BetterDiscord notifications. | Routes enabled alerts through plugin custom toasts; it does not disable them. |
| **Block spam edit notifications** | Rate-limits eligible edit alerts per author after the configured threshold. | Applies no edit-spam rate limit; the guild/DM **Message edited** toggle still decides whether edit alerts are enabled. |

### Guilds

| Setting | Default |
| --- | --- |
| Message sent | Off |
| Message edited | On |
| Message deleted | On |
| Ghost pings | On |
| Disable toasts for local user (yourself) | Off |

### DMs

| Setting | Default |
| --- | --- |
| Message sent | Off |
| Message edited | On |
| Message deleted | On |
| Ghost pings | On |

The notification whitelist and blacklist are managed from the same server, channel, DM, and thread context menus as the logging lists.

Sent alerts accept only Discord's final non-optimistic message event. Guild alerts may include your own messages; DM alerts always suppress messages sent by the local user.

**Disable toasts for local user** suppresses alerts for actions initiated by this Discord client.

- It does not suppress a remote deletion only because you authored the message or thread.
- If **Ignore messages posted by you** is enabled too, the ignored message or thread root produces no alert.

Older configs that stored this Guild-only value under DM toast settings are migrated automatically.

## 🛡️ Anti Nuke

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable Anti Nuke | On | Captures a bounded snapshot under **Nuked** when a parent forum or text channel is deleted. Turning it off stops new captures and hides the Nuked tab without deleting existing records. |
| Show nuke detection toasts | On | Reports only deleted channels that captured Anti-Nuke records, avoiding empty/uncached false positives. Uses the destructive deleted/purged event color and selected native/custom mode; ordinary logging and alert scope do not suppress it. |
| Thread and forum post cap | `15` | Limits structural thread/forum-post roots captured per deleted parent channel. Blank or `0` is unlimited. |
| Total message cap | `45` | One shared allowance for replies across captured threads/forum posts plus ordinary parent-channel messages. Root payloads, including a distinct starter folded into a channel-thread root, do not consume this cap. Blank or `0` is unlimited. |
| Total attachment cap | `15` | One total shared allowance for Discord file attachments across the deleted channel. A single message can consume the entire cap. Blank or `0` is unlimited. |

All three caps apply to one parent-channel deletion event:

- Thread/forum roots, then their replies, then ordinary parent-channel messages are captured newest-first.
- Anti-Nuke channel-thread roots use the same metadata and starter-body schema as ordinary deleted threads; their dedicated Nuked category and marker keep them separate from ordinary bulk deletes.
- Attachments count only after their message is admitted. Excluded messages never store attachments; roots remain even if their attachments exceed the budget.
- Anti Nuke bypasses normal logging scope and unrelated author ignores, but follows **Ignore bots** for bot/app/webhook messages. Ephemeral messages are always excluded.
- Hidden Nuked records remain in **Hidden** while Anti Nuke is off. Unhiding one keeps it stored and makes it visible again when Anti Nuke is re-enabled.
- Blank or `0` is unlimited and can freeze Discord or use substantial disk space on large channels.

Anti-Nuke records are archival because their parent channel no longer exists, so they cannot **Jump to Message**. The same rule applies whenever neither the message channel nor a saved thread/forum parent remains.

## 📏 Message Caps

| Setting | Default | Behavior |
| --- | --- | --- |
| Cached messages cap | `1000` | Maximum sent messages retained in the working cache. |
| Saved messages cap | `1000` | Separate maximum for deleted, edited, purged, and nuked records. |
| Menu message render cap | `50` | Number rendered before **Load More** appears. |

Caps are enforced periodically. Increasing a cap does not restore records that were already removed.

Message-history caching and hierarchical media storage are core behavior with no separate toggles.

- Disabling either made complete post/thread deletions vulnerable to missing unloaded messages or inconsistent media paths.
- Legacy flat-cache files remain readable; new downloads use hierarchical folders.

## 🔧 Advanced

| Setting | Default | Behavior |
| --- | --- | --- |
| Obfuscate CSS classes | On | Uses plugin-specific class names to reduce conflicts with themes and plugins. Changing either direction restarts MessageLogger by temporarily disabling and re-enabling it so the class map can be rebuilt. With **Disable saving data** **Off**, the accepted value saves immediately and the existing shutdown path flushes pending archive data before restart. With it **On**, a compact danger confirmation warns that memory-only session activity will be discarded; **Restart Logger** saves and proceeds, while **No** or dismissing the modal leaves the setting unchanged. |
| Automatic updates | On | Periodically checks the repository for a newer plugin version and offers **Update Now**. Choosing it installs the update and reloads the renderer. |
| Display update notes | On | Shows the plugin changelog after a version change. |
| Contextmenu submenu name | Empty | Replaces the **Message Logger** label. Empty values use the built-in label. |
| Only render locally cached attachments | Off | Prevents uncached attachments from rendering through Discord CDN. The saved record shows a filename placeholder instead. Toggling this reevaluates open logger and channel views immediately. |
| Delete cached files with log records | Off | Permanently deletes related cached attachments, embeds, Components V2 media, and stickers whenever their final log record is removed, including purges and thread/forum cascades. It still runs in ordinary no-save mode, but pauses while **Disable loading archived data** is active because unseen archive records cannot participate in shared-media reference checks. |

## 🐞 Debug

The Debug category title and both setting labels use Discord's native warning color so the opt-in controls remain visible in light and dark themes.

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable debug logging | Off | Writes automatic-backup lifecycle events, edit-spam diagnostics, and deleted/edited channel-entry counter increases to the console. Counter output includes the new total, increase, server, and channel; edit-spam output shows each username's current/threshold counter, cooldown start, 10-second warning, final reset, and early settings reset without printing user IDs. |
| Show debug messages as toasts | Off | Sends the same backup, edit-spam, and channel-entry counter events through the selected BetterDiscord-notification or custom-toast mode. Debug alerts are warning-colored, expire without pausing on hover, and dismiss on a left- or right-click. This control is independent of console debug logging. |

**Settings that can generate Debug output when the relevant event occurs:**

- **Auto backup data**: queue, cancellation, start, retry, write cancellation, and completion events.
- **Auto backup interval (seconds)**: rescheduling details when an automatic backup is already pending.
- **Disable saving data**: cancellation details when disabling saving clears a pending automatic backup.
- **Block spam edit notifications**: per-author counters, cooldown start/warning/completion, and active-state resets. Normal edit-spam diagnostics stop while this setting is off.
- **Edit spam threshold**: active timer-reset details when the value changes while edit-spam blocking is enabled.
- **Show amount of new deleted messages when entering a channel**: every enabled Deleted counter increase, including one combined increase for a bulk purge.
- **Show amount of new edited messages when entering a channel**: every enabled Edited counter increase.

Debug output does not change backup timing, persistence, counter behavior, edit blocking, or normal error reporting.

## 📣 High-Impact Setting Feedback

Settings can also produce their own state-change notification. This is separate from the event-alert controls above.

**Settings that produce state-change notifications and the states that trigger them:**

| Setting | Notification states |
| --- | --- |
| **Only log whitelist** | Both states: enabled uses info; disabled uses neutral. |
| **Disable saving data** | Both states: enabled reports memory-only behavior and whether the archive is loaded or detached; disabled reports normal saving or recovery resuming. |
| **Disable loading archived data** | Both states: reports archive unload or in-memory reload only after the transition succeeds. |
| **Auto backup data** | Both states: enabled reports active or saving-paused backup behavior as info; disabled reports shutdown and any pending cancellation as neutral. |
| **Cache media locally** | Both states: enabled uses info; disabled uses neutral. |
| **Enable Anti Nuke** | Both states: enabled uses info; disabled uses neutral and explains that existing Nuked records remain saved. |
| **Automatic updates** | Both states: enabled uses info; disabled uses neutral. |
| **Only render locally cached attachments** | Both states: enabled uses info; disabled uses neutral. |
| **Delete cached files with log records** | Both states: enabled uses a longer info warning; disabled uses neutral. |
| **Use BdApi notifications instead of custom toasts** | Both states: shows an info preview through the newly selected route. |
| **Block spam edit notifications** | Disable-only, and only when active author counts or pauses were actually cleared. Enabling is silent. |
| **Edit spam threshold** | Change-only, and only when blocking is enabled and active author counts or pauses were actually cleared. |
| **Show amount of new deleted messages when entering a channel** | Disable-only, and only when at least one pending Deleted count was reset to `0`. Enabling and empty disables are silent. |
| **Show amount of new edited messages when entering a channel** | Disable-only, and only when at least one pending Edited count was reset to `0`. Enabling and empty disables are silent. |

The always-reported high-impact changes write one explicit `enabled` or `disabled` console message and follow the selected notification mode. Conditional reset notices report only state they actually cleared.

- Enabled: Discord info/brand color.
- Disabled: a theme-neutral grey custom toast; native BetterDiscord cards use a neutral icon because the API has no grey type.
- Rapid changes replace only that setting's active or queued alert.
- Setting alerts keep expiring while hovered; left- or right-click dismisses either style immediately.
- Debug alerts remain warning-colored; errors remain red.

The same no-hover-pause and whole-card dismissal behavior applies to other system/UI feedback, including Hide/Unhide, validation, copy/delete confirmations, migration, backup recovery, no-save merging, and errors. Actual saved-message event alerts retain their eligible View/Jump actions and hover-aware timeout behavior.

## 🖱️ Settings Actions

- **Stats**: shows saved and cached message counts.
- **Check for update now!**: runs an immediate update check.
- **Support server**: opens the BetterDiscord invite prompt.
- **Help**: opens the built-in logger help page.

## 🧵 Forum Posts and Threads

- Forum posts and channel threads retain server, parent-channel, thread, author, and message metadata when available.
- Fully deleted cards and thread entries require one live item as a layout anchor. Logged deletions remain unrendered while the list is empty.
- Hiding or unhiding a saved root post applies to its related child messages. Individual child messages can still be managed separately.
- Permanently removing a saved root post also removes related messages and cached attachment references for that thread ID.
- Thread-created system rows in parent channels are never stored as deleted or purged messages.
