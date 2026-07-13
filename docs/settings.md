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

Self-related gates are cumulative across sent, edited, deleted, bulk-delete, ghost-ping, forum, and thread events. An author ignore excludes your message regardless of who acts on it; an event-specific local ignore only excludes actions initiated by this client.

## 🎨 Display Settings

| Setting | Default | Behavior |
| --- | --- | --- |
| Display dates with timestamps | On | Shows the date as well as the time in logger timestamps. |
| Display deleted messages in chat | On | Restores and displays logged deletions in channel views. |
| Display edited messages in chat | On | Shows saved edit history with messages. |
| Max number of shown edits | `0` | Limits visible edits; `0` means no configured limit. |
| Show oldest edit instead of newest | On | When the edit limit is exceeded, keeps older edits visible instead of newer ones. |
| Use background instead of text tint | Off | Uses the configured deleted-message color as a background tint. |
| Display purged messages in chat | On | Restores messages captured from bulk deletes. |
| Restore deleted messages after reload | On | Re-adds saved messages when Discord reloads channel history. |
| Show amount of new deleted messages | On | Displays the unseen deleted-message count when entering a channel. |
| Show amount of new edited messages | On | Displays the unseen edited-message count when entering a channel. |
| Show Hidden tab in logger | Off | Adds the **Hidden** tab. Hidden records remain stored when the tab is disabled. |
| Display update notes | On | Shows the plugin changelog after a version change. |
| Menu sort direction | New to old | Controls message ordering in the logger window. |
| Use BdApi basic notifications | On | Uses BetterDiscord notifications instead of the plugin's custom toasts. Switching it off immediately dismisses the active native notification and clears its memory-only queue. |

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
| Automatically refresh new forum posts | On | Uses Discord's native **New Post(s)** control so cards appear without leaving and reopening the forum. |
| Block spam edit notifications | Off | Reduces repeated edit notifications from rapid edits. |

### Local files

BetterDiscord stores the plugin's data beside the installed plugin:

- `MessageLoggerV2.config.json`: settings.
- `MessageLoggerV2Data.config.json`: active logs.
- `MessageLoggerV2DataBackup.config.json`: optional backup.
- `MLV2_IMAGE_CACHE/`: default attachment cache.

The two locked legacy cache settings remain present in `MessageLoggerV2.config.json` with a value of `true`. Editing either value to `false` does not disable the fork's required caching behavior; the plugin restores and saves `true` the next time it starts.

At startup, the plugin fills every missing setting from the current defaults and repairs invalid types, nested toast options, numeric bounds, lists, colors, and the automatic-backup interval before saving the canonical config. Valid custom values are retained, including paths, colors, caps, lists, and backup intervals within range. Unknown top-level and nested keys are also retained for compatibility with other forks; only a completely malformed settings container is replaced with the full default object.

When saving is disabled, queued primary and backup writes are cancelled. Re-enabling it without reloading keeps the current in-memory behavior. Re-enabling it after a no-save reload performs a one-time disk/session merge, removes duplicate indexes, preserves hidden and forum/thread state, applies the configured saved-message cap, writes the primary atomically, and updates the backup only after the primary succeeds. If the primary is missing or invalid, an available valid backup is used; if recovery cannot validate a source or complete the primary write, neither file is replaced and saving remains disabled.

When a data file was written by a legacy or different MessageLoggerV2 fork, the plugin normalizes the complete payload to its current schema and atomically rewrites the primary file. The standard message record and deleted/edited/purged indexes remain compatible with current logger forks; this fork's forum/thread, saved-location, suppression, Anti-Nuke, and cache fields are additive. Surviving legacy and enhanced fields are merged, while metadata already removed by another fork is left blank. Unknown top-level metadata owned by another fork is retained, including during no-save recovery. Migration progress, success, and errors use the selected BetterDiscord-notification or custom-toast mode; detailed errors are also written to the console.

If the primary is missing or invalid, a valid backup is normalized and used to atomically recreate the primary. The selected notification mode reports **Valid backup loaded. Rebuilding the main data file.**, followed by a recovery-specific success or error; the console records the reason and detailed failure information. The backup itself is deliberately left untouched during that recovery as a rollback copy, and a later normal backup can update it after the restored primary is active. A data or backup schema created by a newer version of this fork is never downgraded: loading and saving fail closed until the plugin is updated.

Disabling a display option does not necessarily delete its stored records. Use **Remove From Log** or **Clear log** when permanent removal is intended.

## 🔔 Toast Notifications

Guilds and DMs have separate notification controls. These affect alerts, not whether records are saved. BetterDiscord notifications from every location share one memory-only FIFO queue; custom toasts continue to stack.

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

**Disable toasts for local user** suppresses alerts for actions initiated by this Discord client. It does not suppress a remote deletion merely because you authored the deleted message or thread. If **Ignore messages posted by you** is also enabled, your ignored message or thread root does not produce an alert.

## 🛡️ Anti Nuke

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable Anti Nuke | On | Captures a bounded snapshot under **Purged** when a parent forum or text channel is deleted. This emergency path overrides whitelist, blacklist, mute, NSFW, bot, blocked-user, self-author, and local-delete rules. Turning it off suppresses the entire cascade. |
| Thread and forum post cap | `10` | Limits structural thread/forum-post roots captured per deleted parent channel. Blank or `0` is unlimited. |
| Total message cap | `10` | One total shared allowance for child replies across all captured threads/forum posts plus ordinary parent-channel messages. Root messages do not consume this cap, so the total saved record count can exceed it. Blank or `0` is unlimited. |
| Total attachment cap | `10` | One total shared allowance for Discord file attachments across the deleted channel. A single message can consume the entire cap. Blank or `0` is unlimited. |

All three caps are shared across one parent-channel deletion event. Thread/forum roots are captured newest-first, replies within them are captured newest-first, and the remaining message allowance then captures the newest ordinary parent-channel messages. The attachment allowance is consumed only after its owning message is admitted by the message cap, so attachments from an excluded message are never stored. It only governs Discord file attachments; roots are still retained when their attachments exceed the budget. Anti Nuke intentionally bypasses normal logging ignores and overrides; only its own toggle disables capture. Unlimited values can freeze or crash Discord or use substantial disk space on large channels.

Anti Nuke records are archival because their parent channel no longer exists, so they do not offer **Jump to Message**. The same channel-aware rule applies outside Anti Nuke: Jump is omitted whenever neither the message channel nor a saved thread/forum parent still exists.

## 📏 Message Caps

| Setting | Default | Behavior |
| --- | --- | --- |
| Cached messages cap | `1000` | Maximum sent messages retained in the working cache. |
| Saved messages cap | `1000` | Separate maximum for deleted, edited, and purged records. |
| Menu message render cap | `50` | Number rendered before **Load More** appears. |

Caps are enforced periodically. Increasing a cap does not restore records that were already removed.

Message-history caching and hierarchical media storage are core behavior and no longer have separate toggles. Disabling either made complete forum-post and thread deletions vulnerable to missing unloaded messages or inconsistent media paths. Legacy flat-cache files from older versions and other logger forks remain readable; only new downloads are forced into hierarchical folders.

## 🔧 Advanced

| Setting | Default | Behavior |
| --- | --- | --- |
| Obfuscate CSS classes | On | Uses plugin-specific class names to reduce conflicts with themes and plugins. |
| Automatic updates | On | Checks the repository for a newer plugin version, then reloads the Discord renderer cleanly. |
| Contextmenu submenu name | Empty | Replaces the **Message Logger** label. Empty values use the built-in label. |
| Only render locally cached attachments | Off | Prevents uncached attachments from rendering through Discord CDN. The saved record shows a filename placeholder instead. Toggling this reevaluates open logger and channel views immediately. |
| Delete cached files with log records | Off | Permanently deletes related cached attachments, embeds, and stickers whenever their final log record is removed, including purges and thread/forum cascades. |

## 🐞 Debug

Both Debug setting labels use Discord's native warning color so the opt-in controls remain visible in light and dark themes.

| Setting | Default | Behavior |
| --- | --- | --- |
| Enable debug logging | Off | Writes automatic-backup queue delay, reschedule, cancellation, write start, verification retry, and completion events to the console. |
| Show debug messages as toasts | Off | Sends the same backup events through the selected BetterDiscord-notification or custom-toast mode. This is independent of console debug logging. |

Debug output currently covers only the automatic-backup lifecycle. It does not change backup timing, persistence, or normal error reporting.

## 🖱️ Settings Actions

- **Stats**: shows saved and cached message counts.
- **Check for update now!**: runs an immediate update check.
- **Support server**: opens the BetterDiscord invite prompt.
- **Help**: opens the built-in logger help page.

## 🧵 Forum Posts and Threads

- Forum posts and channel threads retain server, parent-channel, thread, author, and message metadata when available.
- Fully deleted forum cards and thread entries use an anchor system. At least one live forum post or thread entry must exist so its current Discord layout can be cloned; logged deletions remain unrendered while that list is empty.
- Hiding or unhiding a saved root post applies to its related child messages. Individual child messages can still be managed separately.
- Permanently removing a saved root post also removes related messages and cached attachment references for that thread ID.
- Thread-created system rows in parent channels are never stored as deleted or purged messages.
