# Help and Usage

## First Setup

MessageLoggerV2 starts in whitelist-only mode.

1. Right-click a server or channel.
2. Open **Message Logger**.
3. Add the target to the whitelist.

To log all eligible unmuted servers instead, disable **Only log whitelist** under **Ignores and overrides**. The selected channel and DMs also have enabled-by-default logging overrides; see the [settings reference](settings.md#logging-scope).

## Opening Logs

- Click the **Open Logs** button beside channel search to open all logs.
- Right-click that button to open logs filtered to the selected channel.
- Use **Message Logger > Open Logs** from supported context menus.
- Use **Open Log For Guild**, **Channel**, **Thread**, **DM**, or **User** where available.
- Default shortcuts:
  - `Ctrl+M`: open the logger.
  - `Ctrl+N`: open the logger filtered to the selected channel.

## Logger Tabs

- **Sent**: cached sent messages used by logger features.
- **Deleted**: individually deleted messages and deleted forum/thread roots.
- **Edited**: saved edit history.
- **Purged**: messages captured from bulk deletes.
- **Ghost pings**: removed mentions that targeted the local user.
- **Hidden**: hidden records from every category, when enabled in Display settings.

Unhiding a record returns it to its original category.

## Filtering

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

## Logger Window Controls

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

## Toasts and Notifications

For custom toasts:

- Left-click: open the relevant logger tab.
- Right-click: jump to the relevant message or forum/thread location.
- Middle-click: dismiss the toast.

For BetterDiscord notifications:

- Left-click: open the relevant logger tab.
- Right-click: jump to the relevant location.

Notification settings affect alerts only. Logging scope is controlled separately.

## Whitelist and Blacklist Rules

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

## Forum Posts and Channel Threads

- Deleting a complete forum post or thread saves the eligible root and child messages under one thread ID.
- Author ignores apply per message. A saved thread can therefore contain messages from some authors but not others.
- Hiding or unhiding the root applies to all related child records.
- Removing the root from the logger removes all related records.
- Child messages can be hidden, unhidden, or removed individually while the root remains.
- Jumping from a child record opens the exact message when its live thread still exists. Fully deleted threads fall back to the restored parent card or thread entry.
- A restored forum card opens a logger view limited to that thread.
- **Automatically refresh new forum posts** uses Discord's native **New Post(s)** control so new cards appear without leaving and reopening the forum.
- Fully deleted forum cards and thread entries use an anchor system: Discord must have at least one live forum post or thread entry whose current layout can be cloned. If the list is empty, deleted items remain logged but are not rendered until a live item exists.
- Parent-channel “started a thread” system messages are left to Discord and are not logged.
- Message-history caching and hierarchical media storage stay enabled internally so complete post/thread deletions do not lose unloaded messages or media paths.
- Flat media-cache files from older versions or forks remain supported for rendering.

## Troubleshooting

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

### Plugin conflicts

**NoDeleteMessages** and **SuppressUserMentions** are unsupported alongside MessageLoggerV2 and should be disabled.
