# ❓ Help and Usage

## 🚀 First Setup

MessageLoggerV2 starts in whitelist-only mode.

1. Right-click a server, channel, DM, or thread.
2. Open **Message Logger**.
3. Add the target to the whitelist.

For broader logging, disable **Only log whitelist** under **Ignores and overrides**. The selected channel and DMs also have enabled-by-default overrides; see the [settings reference](settings.md#logging-scope).

Default shortcuts, configurable under Misc settings:

- `Ctrl+M`: all logs.
- `Ctrl+N`: selected channel.
- `Ctrl+S`: selected server; unavailable in DMs.

> Logged content and enabled media caches remain local to this device. Review **Cache media locally** and **Disable saving data** before using the plugin.

## 📂 Opening Logs

- Click the **Open Logs** button beside channel search to open all logs.
- Right-click that button to open logs filtered to the selected channel.
- Use **Message Logger > Open Logs** from supported context menus.
- Use **Open Log For Server**, **Channel**, **Thread**, **DM**, or **User** where available.
- Keyboard shortcuts are captured under **Misc settings**:
  - `Ctrl+M` by default: toggle all logs.
  - `Ctrl+N` by default: toggle logs filtered to the channel selected when the shortcut is pressed.
  - `Ctrl+S` by default: toggle logs filtered to the server selected when the shortcut is pressed. It is unavailable in DMs and group DMs.
  - `Ctrl+M` and `Ctrl+N` remain available in DMs and group DMs; only the server shortcut is restricted there.
  - A matching view closes, including one opened manually. A different logger view closes and reopens with the requested filter.
  - A native media viewer closes first, even if it came from a normal Discord message. MessageLogger help, filter-help, tracked plugin panels, and logger user popouts then close top-down; other Discord panels remain open.
  - Custom printable/navigation shortcuts require modifiers and exactly one trigger key; `F1` through `F24` may be used alone. Overlapping bindings are rejected inline.
  - Clear any recorder to disable that shortcut.

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

Double-click a saved row to jump when a destination remains available.

- Blank space beside an attachment also jumps without selecting the row.
- A warning-orange username marks an available destination; the normal username color means no destination remains.
- Links, avatars, media, and Delete controls retain their own actions. Clicking an image still opens Discord's media viewer.
- Deleted-channel Anti-Nuke records and records with no live channel or saved forum/thread parent do nothing.

Right-click saved messages in the logger or channel view to access applicable actions:

- Jump to message.
- Hide or unhide the record.
- Hide or unhide edits.
- Delete the saved logger record.
- Add or remove deleted tint.
- Copy content or message ID.
- Open related logs.

**Hide** preserves the record and moves it to the Hidden tab. Red **Delete** permanently deletes the stored logger record. Direct restored-item and logger-window Delete actions confirm first; **Delete** inside the injected **Message Logger** submenu removes immediately because that submenu is already a logger-only action.

The same permanent-delete flow applies to restored chat messages, logger rows, forum cards, sidebar threads, and thread-browser cards:

- Right-click the saved item and choose red **Delete** to confirm removal.
- Choosing **Delete** inside the nested **Message Logger** submenu removes the saved record immediately.
- Hold Shift while hovering to reveal Trash; Shift-click removes immediately without selecting text.
- If Discord hides Delete or Trash because you lack permission, the logger adds a matching local-only action for that exact restored row.
- Normal live Discord messages remain untouched. Logger fallbacks never grant or call a server delete.

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
- A deleted forum post or thread appears as one root row: its latest title is highlighted in the location line and its initial message body appears as the row content.
- Replies and their edits remain separate saved messages. Only a distinct initial thread starter is folded into the root.
- Author ignores apply per message. A saved thread can therefore contain messages from some authors but not others.
- Hiding or unhiding the root applies to all related child records.
- Removing the root from the logger removes all related records.
- Child messages can be hidden, unhidden, or removed individually while the root remains.
- Child records jump to their live thread message when it still exists; otherwise they fall back to the restored parent. No live thread or parent means no Jump action.
- A restored forum card opens a logger view limited to that thread.
- Saved preview mentions on restored forum cards and thread-browser entries use Discord's normal rendered mention markup.
- Fully restored cards, thread entries, and logger rows are DOM clones, so the logger provides their Trash control.
  - It reuses Discord's observed Delete action when possible; otherwise it combines a current native toolbar button with Discord's Trash icon.
  - Trash appears only while Shift is held and removes immediately. Direct right-click **Delete** still confirms first, including root-and-child removal; nested **Message Logger > Delete** is immediate.
- **Automatically refresh new forum posts** uses Discord's native **New Post(s)** control so new cards appear without leaving and reopening the forum.
- Fully deleted cards and thread entries need at least one live item as a layout anchor. Without one, they remain logged but unrendered.
- **Anti Nuke** captures a deleted parent forum or text channel under **Purged** and bypasses normal scope rules.
  - Thread/forum, message, and attachment caps default to `15`, `45`, and `15` per deletion event.
  - Captured channel threads retain the same title metadata, initial body, author/media, and separate replies as ordinary deleted threads.
  - Capture is newest-first. Attachments count only after their message is admitted; roots bypass the message cap but their attachments still count.
  - Blank or `0` is unlimited and unsafe for large channels. Anti-Nuke records cannot Jump because their parent channel is gone.
- Parent-channel “started a thread” system messages are left to Discord and are not logged.
- Message-history caching and hierarchical media storage stay enabled internally so complete post/thread deletions do not lose unloaded messages or media paths.
- Flat media-cache files from older versions or forks remain supported for rendering.

## 🛠️ Troubleshooting

### Saving was re-enabled after a no-save reload

After a no-save reload:

1. Existing disk history stays untouched while the logger starts a temporary in-memory session.
2. Re-enabling saving validates and merges disk and eligible session records, de-duplicates indexes, preserves saved state, applies caps, then atomically writes the primary before the backup.
3. A failed validation or primary write leaves saving disabled and both existing files untouched.

Disabling saving reports the memory-only state. Re-enabling without a reload queues in-memory changes; re-enabling after a reload reports the merge. Every message uses the selected notification mode and includes console detail.

### Legacy or mixed-fork data was detected

- Legacy `deletedata` and `editHistory` fields are merged with surviving canonical and enhanced data, indexes are rebuilt, and the complete primary is atomically rewritten.
- Current MessageLoggerV2 forks can still read the core fields. Metadata an older fork removed cannot be recreated and remains blank.
- Migration reports progress and success through the selected notification mode. On failure, the primary and backup remain available and the alert directs you to the console.
- A missing or invalid primary is rebuilt from a valid normalized backup. The backup remains untouched; newer schemas fail closed instead of being downgraded.
- **Debug** can report backup queueing, reschedules, cancellations, starts, retries, and completions. Console and toast diagnostics are independent and off by default.
- Startup salvages common config comma/bracket damage, preserves valid settings, saves the exact damaged text as `MessageLoggerV2.config.corrupt-backup.json`, and never treats an existing repaired config as a first install.

### High-impact setting feedback

These settings report one console entry and one routed alert: **Only log whitelist**, **Auto backup data**, **Cache media locally**, **Enable Anti Nuke**, **Automatic updates**, **Only render locally cached attachments**, and **Delete cached files with log records**.

- Enabled: info color.
- Disabled: theme-neutral presentation; native cards use a neutral icon when BetterDiscord cannot request grey.
- Rapid changes replace only that setting's previous alert.
- Hover does not pause setting alerts. Left- or right-click dismisses them immediately.
- Debug alerts remain warning-colored; errors remain red.

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

- Remote attachment and sticker URLs can expire or return `403`/`404`. Keep **Cache media locally** enabled when local preservation matters.
- Enable **Only render locally cached attachments** to block CDN fallback. Missing files remain as full-filename placeholders; already-expired content cannot be recovered.
- **Delete cached files with log records** removes related media during permanent record, purge, cap, or thread/forum cleanup. It cannot be undone and reports successful deletion through the console and selected notification mode.

### Plugin conflicts

- [SuppressUserMentions](https://github.com/Metalloriff/BetterDiscordPlugins/blob/master/SuppressUserMentions.plugin.js) patches Discord's mention detection and can interfere with mention and ghost-ping logs.
- The original source for the historical **NoDeleteMessages** plugin could not be located.

> Avoid plugins that suppress, retain, rewrite, or consume deletion events. They may prevent MessageLoggerV2 from recording or rendering deletions correctly.
