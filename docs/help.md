# ❓ Help and Usage

## 🚀 First Setup

MessageLoggerV2 starts in whitelist-only mode.

1. Right-click a server, channel, DM, or thread.
2. Open **Message Logger**.
3. Add the target to the whitelist.

To log all eligible unmuted servers instead, disable **Only log whitelist** under **Ignores and overrides**. The selected channel and DMs also have enabled-by-default logging overrides; see the [settings reference](settings.md#logging-scope).

## 📂 Opening Logs

- Click the **Open Logs** button beside channel search to open all logs.
- Right-click that button to open logs filtered to the selected channel.
- Use **Message Logger > Open Logs** from supported context menus.
- Use **Open Log For Guild**, **Channel**, **Thread**, **DM**, or **User** where available.
- Default shortcuts:
  - `Ctrl+M`: open the logger.
  - `Ctrl+N`: open the logger filtered to the selected channel.

## 📑 Logger Tabs

- **Deleted**: individually deleted messages and deleted forum/thread roots.
- **Edited**: saved edit history.
- **Purged**: messages captured from bulk deletes.
- **Sent**: the bounded in-memory message cache used to reconstruct later deletions and edits. It clears on plugin or Discord reload.
- **Ghost pings**: removed mentions that targeted the local user.
- **Hidden**: hidden records from every category, when enabled in Display settings.

Unhiding a record returns it to its original category.

## 🔎 Filtering

Enter comma-separated filters in the logger search field.

| Filter | Matches |
| --- | --- |
| `server:<name or id>` | Server name or ID. |
| `channel:<name or id>` | Channel name or ID. |
| `user:<name or id>` | Username, nickname, or user ID. |
| `message:<text or id>` | Message content or message ID. |
| `content:<text or id>` | Alias of `message:`. |
| `has:image` | Messages containing images. |
| `has:link` | Messages containing links. |

Example:

```text
server:tom's bd stuff, message:heck
```

The question-mark button beside the filter opens the built-in filter help.

## 🖱️ Logger Window Controls

### Delete-key actions

Hold `Delete` and left-click:

- A message to permanently remove that record.
- An edit to remove that specific edit.
- A timestamp to remove the entire displayed message group.

Right-click a timestamp for group-level actions.

### Message actions

Right-click saved messages in the logger or channel view to access applicable actions:

- Jump to message.
- Hide or unhide the record.
- Hide or unhide edits.
- Remove from log.
- Add or remove deleted tint.
- Copy content or message ID.
- Open related logs.

**Hide** preserves the record and moves it to the Hidden tab. **Remove From Log** permanently deletes the stored record.

### Media-only records

- Attachment-only messages retain the same hide, remove, and context-menu actions as text messages.
- Media added later through a forum post's **Add to Post** action is retained from the message update.
- Supported image and animated stickers render as media when their source or local cache is available.
- Embeds show a plain-text reference; voice messages, non-image files, and unsupported stickers show a compact reference.
- Restored channel messages retain their saved payload so Discord can render supported content natively.

### Clear log

**Clear log** applies to the selected tab and active filter. For example, clearing a channel-filtered Deleted tab removes matching deleted records, not every category and location.

## 🔔 Toasts and Notifications

For custom toasts:

- Left-click: run the first available action. Saved events open the relevant logger tab; sent-message alerts jump directly to the live message.
- Right-click: run the second action when available, normally jumping to the relevant message or forum/thread location.
- Middle-click: dismiss the toast.
- Hover: pause the remaining timeout until the pointer leaves.

For BetterDiscord notifications:

- Deleted, edited, and ghost-ping alerts provide **View** and **Jump**.
- Sent-message alerts provide **Jump** only. The Sent tab itself is memory-only and clears on reload.
- Bulk-delete summaries provide **View** only.
- Guild and DM alerts share one memory-only FIFO queue. Persistent ghost pings yield after 4.5 seconds when another alert is waiting.
- Hovering pauses the remaining notification timeout and queued ghost-ping yield.

Notification settings affect alerts only. Logging scope is controlled separately.

## 🎯 Whitelist and Blacklist Rules

### Whitelist-only mode

- Unwhitelisted servers are ignored.
- Channels in a whitelisted server are logged unless blacklisted.
- Muted channels remain ignored when **Ignore muted channels** is enabled, unless the channel is explicitly whitelisted.

### Normal mode

- Servers are logged unless blacklisted or ignored because they are muted.
- Whitelisted channels can override a muted or blacklisted parent server.
- Blacklisted channels remain excluded inside whitelisted servers.
- Unwhitelisted NSFW channels are excluded only when **Ignore NSFW channels** is enabled.

### Overrides

- **Always log selected channel** bypasses normal scope checks for the selected channel or thread parent.
- **Always log DMs** bypasses normal scope checks for DMs.
- **Always log ghost pings** can monitor ignored locations, but only persists the message if a ghost ping occurs.

## 🧵 Forum Posts and Channel Threads

- Deleting a complete forum post or thread saves the eligible root and child messages under one thread ID.
- Author ignores apply per message. A saved thread can therefore contain messages from some authors but not others.
- Hiding or unhiding the root applies to all related child records.
- Removing the root from the logger removes all related records.
- Child messages can be hidden, unhidden, or removed individually while the root remains.
- Jumping from a child record opens the exact message when its live thread still exists. Fully deleted threads fall back to the restored parent card or thread entry. Jump is unavailable when both the thread and its parent channel are gone.
- A restored forum card opens a logger view limited to that thread.
- **Automatically refresh new forum posts** uses Discord's native **New Post(s)** control so new cards appear without leaving and reopening the forum.
- Fully deleted forum cards and thread entries use an anchor system: Discord must have at least one live forum post or thread entry whose current layout can be cloned. If the list is empty, deleted items remain logged but are not rendered until a live item exists.
- **Anti Nuke** captures a deleted parent forum or text channel under **Purged**, overriding all normal logging ignores and location rules unless Anti Nuke itself is disabled. Thread/forum-post, total-message, and total-attachment caps default to `10` and are shared across one deletion event. Capture runs newest-first; attachments are considered only after their owning message is admitted, while root messages bypass the total-message cap but their files still consume the attachment cap. Blank or `0` is unlimited and unsafe for large channels. Anti Nuke records do not offer Jump because their parent channel is gone.
- Parent-channel “started a thread” system messages are left to Discord and are not logged.
- Message-history caching and hierarchical media storage stay enabled internally so complete post/thread deletions do not lose unloaded messages or media paths.
- Flat media-cache files from older versions or forks remain supported for rendering.

## 🛠️ Troubleshooting

### Saving was re-enabled after a no-save reload

When **Disable saving data** was active at startup, the plugin leaves existing disk history untouched and starts a temporary in-memory session. Turning saving back on validates the disk history, merges it with eligible session records, applies saved-message caps, and atomically replaces the primary file before updating the backup. Duplicate category entries are removed while deleted, edited, purged, hidden, forum/thread, and suppressed-root state is preserved.

Disabling saving reports that new logger changes will remain in memory and will not be written to disk. Re-enabling saving without a reload reports that those in-memory logger changes are queued to save. Re-enabling it after a no-save reload instead reports that saved history and in-memory logger changes are being merged. All messages follow your selected BetterDiscord-notification or custom-toast mode and also write details to the console.

If validation or the primary write fails, saving remains disabled and the existing primary and backup files remain untouched. The plugin reports a short error through your selected BetterDiscord-notification or custom-toast mode and writes detailed paths, stage information, and the underlying error to the console.

### Legacy or mixed-fork data was detected

The plugin accepts the legacy `deletedata` and `editHistory` names as input, merges them with any surviving canonical and enhanced fields, rebuilds channel indexes, and rewrites the complete primary data payload atomically. The standard core fields remain readable by current MessageLoggerV2 forks. Metadata that an older fork already removed, such as saved forum/thread details, cannot be recreated and remains blank.

You will receive a migration-in-progress alert followed by success through your selected BetterDiscord-notification or custom-toast mode. If the rewrite fails, the existing primary and backup remain available, and the error alert directs you to detailed console information.

If the primary file is missing or invalid, the same normalization is applied to a valid backup before the plugin atomically recreates the primary. Your selected notification mode reports that the valid backup was loaded and the main data file is being rebuilt, then reports recovery-specific success or failure. The console includes the recovery reason and detailed write errors. The original backup remains untouched during this recovery. Files marked with a schema newer than the installed plugin are not replaced from an older backup; the plugin fails closed so updating it cannot destroy newer data.

The separate **Debug** settings group can report automatic-backup queue delays, reschedules, cancellations, starts, verification retries, and completions. Console logging and routed debug toasts are independent and both default off; enabling them does not change the backup schedule or normal error alerts.

### High-impact setting feedback

Changing **Only log whitelist**, **Auto backup data**, **Cache media locally**, **Enable Anti Nuke**, **Automatic updates**, **Only render locally cached attachments**, or **Delete cached files with log records** writes the new state once to the console and reports it once through your selected notification mode. Enabled states use the info color; disabled states use Discord's theme-neutral presentation. If the native notification API cannot request a grey type, the plugin keeps its theme-colored native card and uses a neutral icon. Rapid changes replace the previous alert for that setting, setting alerts do not pause while hovered, and left- or right-clicking either a native card or custom setting toast dismisses it immediately. Debug alerts remain warning-colored, and actual errors remain red.

### Nothing is logged

1. Check **Only log whitelist**.
2. Whitelist the server or channel from its **Message Logger** context menu.
3. Check mute, bot, blocked-user, NSFW, self, and local-delete ignores.
4. Confirm the relevant saved-message cap is not too low.

### A deleted forum post or thread is missing

- Confirm its messages pass the active author and local-delete ignores.
- Open the parent forum or channel.
- Ensure at least one live forum post or thread entry exists. Fully deleted items cannot render in an empty list until Discord provides this layout anchor.

### Hidden records are missing

Enable **Show Hidden tab in logger** under Display settings. Disabling the tab does not erase hidden records.

### Attachments are unavailable

Remote Discord attachment and sticker URLs can expire or return `403`/`404`. Keep **Cache media locally** enabled when local preservation is required. Enable **Only render locally cached attachments** to block CDN fallback; uncached or unavailable files remain manageable as full-filename placeholders. Content already expired before it was cached cannot be recovered.

Enable **Delete cached files with log records** to remove related local media when records are permanently removed. This applies to individual records, purges, automatic cap cleanup, and complete thread/forum removals, and cannot be undone. Successful file deletions are written to the console and confirmed through the same notification mode used for logger alerts.

### Plugin conflicts

- [SuppressUserMentions](https://github.com/Metalloriff/BetterDiscordPlugins/blob/master/SuppressUserMentions.plugin.js) patches Discord's mention detection and can interfere with mention and ghost-ping logs.
- The original source for the historical **NoDeleteMessages** plugin could not be located.

> Avoid plugins that suppress, retain, rewrite, or consume deletion events. They may prevent MessageLoggerV2 from recording or rendering deletions correctly.
