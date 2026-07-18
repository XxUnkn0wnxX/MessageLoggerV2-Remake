# ⚙️ Settings Reference

This page documents the controls shown in **BetterDiscord Settings > Plugins > MessageLoggerV2 Settings**. Defaults refer to a fresh installation; older installations retain saved values when new settings are added.

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
| Ignore bots | On | Skips messages authored by bots. |
| Ignore messages posted by you | Off | Applies author filtering per message, including messages inside forums and threads. |
| Ignore message edits from you | Off | Skips edit-history logging for your messages while keeping their current deletion baseline updated. |
| Ignore message deletes from you | Off | Skips deletion actions initiated by the local client. For a locally deleted forum post or thread, the root deletion is not logged. |
| Ignore blocked users | On | Skips messages from blocked users, excluding the local user. |
| Ignore NSFW channels | Off | Skips unwhitelisted NSFW channels when enabled. |
| Only log whitelist | On | Requires servers or channels to be whitelisted unless an override applies. |
| Always log selected channel | On | Logs the selected channel or a selected thread's parent regardless of normal scope rules. |
| Always log DMs | On | Logs DMs regardless of normal scope rules. |
| Always log ghost pings | Off | Watches ignored locations for mentions and only persists the message if it becomes a ghost ping. |

`Ignore messages posted by you` and `Ignore message deletes from you` answer different questions: the first checks who authored each message; the second checks whether the deletion was initiated locally.

Self-related gates are cumulative across sent, edited, deleted, bulk-delete, ghost-ping, forum, and thread events:

- An author ignore excludes your message regardless of who acts on it.
- A local-action ignore excludes only actions initiated by this client.

## 🎨 Display Settings

| Setting | Default | Behavior |
| --- | --- | --- |
| Display dates with timestamps | On | Shows the date as well as the time in logger timestamps. |
| Display saved messages in chat | On | Master switch for live mounting enabled Deleted and Purged records in chat, forum, and thread views. Turning it off hides mounted records without deleting saved logs. |
| Include Deleted messages | On | Live-mounts messages captured from individual deletions when **Display saved messages in chat** is enabled. |
| Include Purged messages | On | Live-mounts messages captured from bulk deletions. **Display saved messages in chat must be enabled first.** |
| Display edited messages in chat | On | Shows saved edit history with messages. |
| Max number of shown edits | `0` | Limits visible edits; `0` means no configured limit. |
| Show oldest edit instead of newest | On | When the edit limit is exceeded, keeps older edits visible instead of newer ones. |
| Use background instead of text tint | Off | Uses the configured deleted-message color as a background tint. |
| Show amount of new deleted messages | On | Displays the unseen deleted-message count when entering a channel. |
| Show amount of new edited messages | On | Displays the unseen edited-message count when entering a channel. |
| Show Hidden tab in logger | Off | Adds the **Hidden** tab. Hidden records remain stored when the tab is disabled. |
| Display update notes | On | Shows the plugin changelog after a version change. |
| Menu sort direction | New to old | Controls message ordering in the logger window. |
| Use BdApi basic notifications | On | Selects BetterDiscord notifications or plugin custom toasts for every logger alert and system/UI message. Switching it off immediately dismisses the active native notification and clears its memory-only queue. |

## 🧰 Misc Settings

| Setting | Default | Behavior |
| --- | --- | --- |
| Disable saving data | Off | Keeps new logs in memory and disables automatic backups. Existing disk history remains untouched. If the plugin started in this mode, re-enabling saving validates and merges disk history with eligible session records before atomically replacing the primary file. A failed recovery leaves saving disabled and directs you to the console. |
| Auto backup data | Off | Maintains a fallback copy of the logger data. It reduces, but cannot eliminate, data-loss risk. |
| Auto backup interval (seconds) | 20 | Waits this many seconds after saved data changes before refreshing the backup. Accepts whole numbers from 10 through 86,400; for example, `300` is five minutes. Blank is valid and saves the 20-second default. Other invalid drafts remain unsaved and are marked with a red field border and inline error instead of a toast. Invalid settings or manual config edits reset to 20 at startup. |
| Deleted messages color | Empty | Sets deleted text and forum/thread tints; an empty value uses the built-in red. |
| Cache media locally | On | Master switch for caching attachments, embed images, and stickers. |
| Aggresive message caching | On (locked) | Legacy setting retained for compatibility. It must remain enabled on this fork so message history is available for reliable forum and thread restoration. A saved `false` value is reset to `true` at startup. |
| Use new cached images system | On (locked) | Legacy setting retained for compatibility. The organized server/channel cache layout must remain enabled for reliable forum and thread media restoration. A saved `false` value is reset to `true` at startup. |
| Always show notifications for selected channel | Off | Allows enabled alerts while viewing the active channel, thread, or parent forum and overrides notification location lists there. |
| Always show notifications for selected guild | Off | Treats the currently open server as an override for notification location lists. |
| Add user ID to saved media filename | Off | Includes the author ID in hierarchical cache filenames. |
| Show notifications to whitelisted only | Off | Restricts logger notifications to the notification whitelist. |
| Media cache path | Empty | Uses a custom existing directory instead of `MLV2_IMAGE_CACHE`. |
| Cache all attachment types | Off | Also caches videos, audio, and other non-image files. |
| Max cache file size | `0` MB | Skips larger attachment files; blank or `0` disables the limit. Embed images and stickers are unaffected. |
| Display open logs button | On | Shows the logger button beside channel search. |
| Toggle all logs keybind | `Ctrl+M` | Uses BetterDiscord's native keybind recorder. It closes an open unfiltered logger; any other logger state or stacked plugin-owned panel closes and reopens as all logs. An open native media viewer closes first, including one opened from a normal Discord message. Clear the recorder to disable it. Unsafe or overlapping captures are rejected inline. |
| Toggle selected channel logs keybind | `Ctrl+N` | Resolves the selected channel when pressed. It closes an open logger already filtered to that exact channel; any other logger state or stacked plugin-owned panel closes and reopens with that channel filter. Native media viewers close first; all other Discord panels remain open. Clear the recorder to disable it. |
| Toggle selected server logs keybind | `Ctrl+S` | Resolves the selected server when pressed and uses its server ID filter. It closes an open logger already filtered to that exact server; any other logger state or stacked plugin-owned panel closes and reopens with that server filter. It does nothing except show a warning in DMs and group DMs; the all-log and selected-channel shortcuts continue working there. Native media viewers close first; all other Discord panels remain open. Clear the recorder to disable it. |
| Automatically refresh new forum posts | On | Uses Discord's native **New Post(s)** control so cards appear without leaving and reopening the forum. |
| Block spam edit notifications | Off | When enabled, reaching the configured threshold for one author within 60 seconds shows one warning and suppresses that author's edit alerts for 60 seconds. Toggling either way clears all author counts and pauses; turning it off shows the same reset notice as a threshold change only when something active was cleared, while turning it on resets silently. A preceding threshold reset consumes that state, so disabling immediately afterward cannot show a duplicate notice. The warning keeps expiring while hovered and dismisses immediately from a left- or right-click anywhere on its card. Edit history and Ghost Ping alerts continue normally. |
| Edit spam threshold | `10` | Sets the eligible edit count within 60 seconds that triggers the warning and fixed 60-second notification pause. Whole numbers `1` or higher are valid. Invalid input, including `0`, stays red with an inline error while the saved value resets to `10`; reopening the panel shows `10`. While blocking is enabled, changing this value clears all existing author counts and active pauses and shows a replaceable info notice only when live state existed. While blocking is off, changing it cannot clear state or send the notice. |

### Local files

BetterDiscord stores the plugin's data beside the installed plugin:

- `MessageLoggerV2.config.json`: settings.
- `MessageLoggerV2Data.config.json`: active logs.
- `MessageLoggerV2DataBackup.config.json`: optional backup.
- `MLV2_IMAGE_CACHE/`: default attachment cache.

### Config safety

- The two legacy cache settings remain present and locked to `true`. Manual `false` values are restored at startup.
- Missing or invalid owned settings are repaired to current defaults. Valid custom values and unknown fork-specific keys are retained.
- Keybinds accept modifiers plus one key, or `F1`–`F24` alone. Unsafe, duplicate, or overlapping combinations are rejected.
- Damaged JSON is repaired when possible; valid individual values are retained and the original is saved as `MessageLoggerV2.config.corrupt-backup.json`.
- First-time help appears only when no config existed. Legacy, incomplete, and repaired configs do not trigger it.

### Saving and recovery

- **Disable saving data** keeps new records in memory and cancels queued primary and backup writes.
- Re-enabling without a reload queues the current in-memory changes. Re-enabling after a no-save reload merges disk and session history, de-duplicates indexes, preserves hidden/forum/thread state, applies normal caps, then atomically writes the primary before the backup.
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

### Guilds

| Setting | Default |
| --- | --- |
| Message sent | Off |
| Message edited | On |
| Message deleted | On |
| Ghost pings | On |
| Disable toasts for local user | Off |

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
- Anti Nuke bypasses normal logging ignores and overrides; only its own toggle disables capture.
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
| Obfuscate CSS classes | On | Uses plugin-specific class names to reduce conflicts with themes and plugins. |
| Automatic updates | On | Checks the repository for a newer plugin version, then reloads the Discord renderer cleanly. |
| Contextmenu submenu name | Empty | Replaces the **Message Logger** label. Empty values use the built-in label. |
| Only render locally cached attachments | Off | Prevents uncached attachments from rendering through Discord CDN. The saved record shows a filename placeholder instead. Toggling this reevaluates open logger and channel views immediately. |
| Delete cached files with log records | Off | Permanently deletes related cached attachments, embeds, and stickers whenever their final log record is removed, including purges and thread/forum cascades. |

## 🐞 Debug

The Debug category title and both setting labels use Discord's native warning color so the opt-in controls remain visible in light and dark themes.

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable debug logging | Off | Writes automatic-backup lifecycle events and edit-spam diagnostics to the console. Edit-spam output shows each username's current/threshold counter, cooldown start, 10-second warning, final reset, and early settings reset without printing user IDs. |
| Show debug messages as toasts | Off | Sends the same backup and edit-spam events through the selected BetterDiscord-notification or custom-toast mode. Debug alerts are warning-colored, expire without pausing on hover, and dismiss on a left- or right-click. This control is independent of console debug logging. |

Debug output covers the automatic-backup lifecycle and edit-spam counters/cooldowns. It does not change backup timing, persistence, or normal error reporting.

## 📣 High-Impact Setting Feedback

The plugin reports only settings with broad logging, persistence, media, update, or destructive effects; ordinary display and filter toggles remain quiet.

- **Only log whitelist**
- **Auto backup data**
- **Cache media locally**
- **Enable Anti Nuke**
- **Automatic updates**
- **Only render locally cached attachments**
- **Delete cached files with log records**

Each change writes one explicit `enabled` or `disabled` console message and follows the selected notification mode.

- Enabled: Discord info/brand color.
- Disabled: a theme-neutral grey custom toast; native BetterDiscord cards use a neutral icon because the API has no grey type.
- Rapid changes replace only that setting's active or queued alert.
- Setting alerts keep expiring while hovered; left- or right-click dismisses either style immediately.
- Debug alerts remain warning-colored; errors remain red.

The same no-hover-pause and whole-card dismissal behavior applies to other system/UI feedback, including Hide/Unhide, validation, copy/delete confirmations, migration, backup recovery, no-save merging, and errors. Actual saved-message event alerts retain their View/Jump actions and hover-aware timeout behavior.

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
