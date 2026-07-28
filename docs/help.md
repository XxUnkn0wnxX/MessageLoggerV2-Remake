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

> Logged content and enabled media caches remain local to this device. Review **Cache media locally** under **Media settings** and **Disable saving data** under **Misc settings** before using the plugin.

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
- **Nuked**: deleted parent-channel snapshots captured by Anti Nuke. This tab is shown only while Anti Nuke is enabled; disabling it keeps existing records stored.
- **Sent**: the bounded in-memory message cache used to reconstruct later deletions and edits. It clears on plugin or Discord reload.
- **Ghost pings**: removed mentions that targeted the local user.
- **Hidden**: hidden records from every category, when enabled in Display settings.

Unhiding a record returns it to its original category. If a Nuked record is unhidden while Anti Nuke is off, it stays stored but remains out of view until Anti Nuke is enabled again.

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

The location-list button beside the filter help opens the same four-tab logging/notification list manager available from plugin Settings. Its live server and channel names are clickable; right-click removes an entry from the current list or all four lists, while Shift-clicking Trash removes it only from the current list. The adjacent cog opens MessageLoggerV2 Settings directly.

### Delete-key actions

Hold `Delete` and left-click:

- A message to permanently remove that record.
- An edit to remove that specific edit.
- A timestamp to remove the entire displayed message group.

Right-click a timestamp for group-level actions.

### Visual cues

- A warning-orange username means the saved record has a valid Jump destination or forum/thread mount anchor. Normal theme text means no valid destination remains; a cached channel alone is not enough.
- A bold red forum/thread title marks the saved structural root. Deleting that root also deletes its saved replies and child records, while deleting an ordinary reply affects only that reply.

### Message actions

Double-click a saved row to jump when a destination remains available.

- Blank space beside an attachment also jumps without selecting the row.
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
- Embeds show a plain-text reference; voice messages, non-image files, and unsupported stickers show a compact reference and may still rely on CDN links in this implementation.
- Restored channel messages retain their saved payload so Discord can render supported content natively.

### Clear log

**Clear log** applies to the selected tab and active filter. For example, clearing a channel-filtered Deleted tab removes matching deleted records, not every category and location.

## 🔔 Toasts and Notifications

The selected notification mode applies to every logger alert and system/UI message.

System/UI feedback—including settings, Debug, Hide/Unhide, validation, migration, backup recovery, and no-save merging—keeps expiring while hovered. Left- or right-click anywhere on its card dismisses it immediately; explicit action buttons still work.

The **Edit Spam Blocked** warning uses the same interaction behavior in either notification mode: hover does not pause its expiry, and a left- or right-click anywhere on the card dismisses it immediately. **Edit spam threshold** defaults to `10`; valid whole numbers start at `1`. Invalid input stays red with an inline error while the saved value resets to `10`. Changing the threshold or toggling the blocker clears all current author counts and notification pauses while blocking is enabled. While blocking is off, threshold changes cannot clear state or send a reset notice; enabling owns the next silent reset. A threshold change while enabled shows the replaceable reset notice only when live state was cleared. Turning the blocker off shows that same notice only if it clears live state. Because the first eligible action consumes the state, threshold and toggle changes cannot both report the same reset. The notice keeps expiring while hovered and dismisses from a left- or right-click anywhere on its card. The rolling window and per-author pause remain fixed at 60 seconds each.

Saved-message event alerts keep their action and hover behavior:

For custom toasts:

- Left-click: run the first available action. Saved events open the relevant logger tab; sent-message alerts jump directly to the live message.
- Right-click: run the second action when available, normally jumping to the relevant message or forum/thread location.
- Middle-click: dismiss the toast.
- Hover: pause the remaining timeout until the pointer leaves.

For BetterDiscord notifications:

- Deleted, edited, and ghost-ping alerts provide **View** and an eligible **Jump**; Jump is omitted while the matching live-display switch is off.
- Sent-message alerts provide **Jump** only. The Sent tab itself is memory-only and clears on reload.
- Bulk-delete summaries provide **View** only.
- Guild and DM alerts share one memory-only FIFO queue. Persistent ghost pings yield after 4.5 seconds when another alert is waiting.
- Repeated delete, thread/forum, purge, and sent-message IDs alert only once per plugin session. Overlapping purges report only their newly alerted IDs.
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

- **Always log selected channel** bypasses normal scope checks for the selected channel. Selecting a parent channel also covers its child threads.
- **Always log DMs** bypasses normal scope checks for DMs.
- **Always log ghost pings** can monitor ignored locations for edits and individual deletes, but only persists the message if a ghost ping occurs. Bulk purges are not covered.

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
- **Anti Nuke** captures a deleted parent forum or text channel under **Nuked** and bypasses normal scope rules.
  - **Show nuke detection toasts** reports only deleted channels that produced saved Anti-Nuke records, avoiding empty/uncached channel false positives. It uses the same destructive color as deleted and purged alerts; logging ignores and ordinary alert scope do not suppress it.
  - Thread/forum, message, and attachment caps default to `15`, `45`, and `15` per deletion event.
  - Captured channel threads retain the same title metadata, initial body, author/media, and separate replies as ordinary deleted threads.
  - Capture is newest-first. Attachments count only after their message is admitted; roots bypass the message cap but their attachments still count.
  - Blank or `0` is unlimited and unsafe for large channels. Anti-Nuke records cannot Jump because their parent channel is gone.
  - Disabling Anti Nuke hides the Nuked tab but does not erase its records. Hidden Nuked records remain in Hidden when that tab is enabled.
- Parent-channel “started a thread” system messages are left to Discord and are not logged.
- Message-history caching and hierarchical media storage stay enabled internally so complete post/thread deletions do not lose unloaded messages or media paths.
- Flat media-cache files from older versions or forks remain supported for rendering.

## 🛠️ Troubleshooting

### Using no-save mode across a reload

After a no-save reload:

1. **Disable saving data** normally keeps the saved archive visible while every new record, edit, counter, attachment reference, and eligible media request stays in a temporary in-memory session. No new media file is created. Loaded archival removals and related cached-file cleanup still commit deletion-only changes.
2. Its linked **Disable loading archived data** setting skips or hot-unloads the archive and keeps only temporary session activity. Turning the child back off hot-loads and combines the archive in memory without writing. Every archive-owned live mount, tint, logger row, modal, and action follows the archive out of memory; session-owned equivalents remain usable. Archive removal and cached-file deletion are unavailable while detached.
3. Re-enabling saving validates and merges disk and eligible session records, de-duplicates indexes, preserves exact saved state, applies caps, then atomically writes the primary before the backup. A failed validation or primary write leaves saving disabled, restores detached session memory when needed, and keeps existing files untouched.

The child preference remains saved but displays and behaves as Off while **Disable saving data** is disabled. Loaded archive and temporary records retain their normal View, Hide, Delete, and eligible Jump actions. Plugin or Discord reload still discards temporary session activity and its media queue. Re-enabling saving downloads queued media only after the primary archive save succeeds. During these larger save/media and archive-view transitions, the affected controls grey out and pulse warning orange until the operation settles. Primary recovery gets three attempts within a 30-second bound; final failure leaves saving disabled and shows a persistent error. Turning **Disable saving data** **Off** again bypasses the failed flush, discards temporary records/media, reloads the last valid archive, and makes later activity save normally. A media-only failure drops and reports only that item. State and failure messages use the selected notification mode and include console detail.

Changing **Obfuscate CSS classes** restarts MessageLogger by temporarily disabling and re-enabling it. With data saving active, the normal shutdown flush runs first. With **Disable saving data** enabled, a danger confirmation appears because memory-only session activity cannot survive the restart; **No** leaves the CSS-class setting unchanged.

### Legacy or mixed-fork data was detected

- Legacy `deletedata` and `editHistory` fields are merged with surviving canonical and enhanced data, indexes are rebuilt, and the complete primary is atomically rewritten.
- Anti-Nuke records saved by earlier builds under Purged are moved into the fork-specific Nuked index during the same rewrite.
- Current MessageLoggerV2 forks can still read the core fields. Metadata an older fork removed cannot be recreated and remains blank.
- Migration reports progress and success through the selected notification mode. On failure, the primary and backup remain available and the alert directs you to the console.
- A missing or invalid primary is rebuilt from a valid normalized backup. The backup remains untouched; newer schemas fail closed instead of being downgraded.
- **Debug** can report backup queueing, reschedules, cancellations, starts, retries, and completions. It also reports edit-spam counters by username, cooldown start, 10 seconds remaining, final reset, and early settings resets. Toast diagnostics are master-linked to **Enable debug logging**; when that switch is off, no debug output is routed anywhere. Edit-spam debug text never prints user IDs.
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
- **Disable saving data** creates no new local media files even if **Cache media locally** remains enabled. Eligible logger media requests wait in memory and download only after a successful primary archive save; reload, plugin stop, or disabling media caching discards the queue.
- Enable **Only render locally cached attachments** to block CDN fallback. Missing files remain as full-filename placeholders; already-expired content cannot be recovered.
- **Cache all attachment types** is incomplete in 2.8.2.13. Arbitrary non-image files may remain CDN-backed or uncached when On and may still be logged as attachment references when Off.
- **Delete cached files with log records** removes related media during permanent record, purge, cap, or thread/forum cleanup. It cannot be undone and reports successful deletion through the console and selected notification mode.

### Plugin conflicts

- [SuppressUserMentions](https://github.com/Metalloriff/BetterDiscordPlugins/blob/master/SuppressUserMentions.plugin.js) patches Discord's mention detection and can interfere with mention and ghost-ping logs.
- The original source for the historical **NoDeleteMessages** plugin could not be located.

> Avoid plugins that suppress, retain, rewrite, or consume deletion events. They may prevent MessageLoggerV2 from recording or rendering deletions correctly.
