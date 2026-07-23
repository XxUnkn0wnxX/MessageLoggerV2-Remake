# 📝 MessageLoggerV2 Remake

A maintained BetterDiscord message logger for deleted, edited, purged, nuked, and ghost-pinged messages.

This fork also restores logged forum posts and channel threads, preserves their metadata, and provides controls for hiding or permanently removing related records.

> [!IMPORTANT]
> Message content and optionally attachments are stored locally. Review the logging scope and cache settings before enabling the plugin.

## ✨ Features

### 📜 Logging and restoration

- Deleted, edited, purged, Nuked, and ghost-ping history, plus a bounded memory-only **Sent** tab that clears on reload.
- In-chat restoration of logged deleted and purged messages, saved edit history, configurable tints, and unseen-event counts.
- Attachment-only messages, embeds, stickers, voice messages, and other file references remain manageable in logger views.
- Newly captured embeds, message snapshots, and legacy/Components V2 trees retain their complete JSON-serializable payload for native restoration and future full Logger-view rendering.
- Search filters, scoped log views, context-menu actions, double-click-to-jump logger rows, and cross-category Hidden records.
- Captured toggle keybinds for all logs, the selected channel, and the selected server. Switching views closes any open native media viewer first.
- One local-only permanent-delete flow across restored messages, logger rows, and forum/thread mounts.
  - Right-click **Delete** confirms removal.
  - Shift reveals Trash; Shift-click removes immediately, even when Discord hides server-delete controls.

### 🧵 Forums, threads, and channel recovery

- Forum posts and channel threads retain parent-channel, location, author, reply, and later-added attachment metadata.
- Fully deleted forum cards and thread entries can be restored when Discord provides at least one live item as a layout anchor.
- Default-on native forum refresh shows new posts without leaving and reopening the channel.
- Configurable **Anti Nuke** snapshots capture bounded forum posts, threads, messages, and attachments in a dedicated **Nuked** tab when a parent forum or text channel is deleted.
- An optional, default-off Anti-Nuke toast reports only channel deletions that captured records, using the destructive event color and selected notification mode regardless of ordinary logging or alert ignores.
- Disabling Anti Nuke hides its tab without deleting existing records. Hidden Nuked records remain manageable from **Hidden** when that tab is enabled.
- Required message-history caching and the hierarchical media-cache layout remain enabled for reliable forum/thread recovery; their legacy settings are visible but locked on.

### 🛡️ Scope, alerts, media, and reliability

- Server, channel, DM, thread, mute, NSFW, bot, blocked-user, author, and local-action logging controls.
- Separate guild/DM alert toggles, notification location lists, selected-location overrides, native BetterDiscord notifications, and custom actionable toasts.
- One console entry and routed alert per high-impact setting change.
- Info-blue enabled states, theme-neutral disabled states, warning-colored backup diagnostics, and red errors.
- Optional local media caching, cache-size/type controls, local-only rendering, CDN fallback, custom cache paths, cached-file cleanup, and a memory-only no-save media queue.
- Safe no-save sessions: keep saved history visible or hot-detach every archive-owned mount, retain temporary activity and actions in memory, and validate/merge before an atomic primary-file replacement. The two large state controls grey out with a warning-orange pulse while their save/media or archive-view transition settles; a failed three-attempt/timeout recovery can be bypassed on the next resume by discarding the temporary session and reloading the last valid archive.
- Atomic legacy/mixed-fork normalization and recoverable settings-config repair.
- Clearly reported valid-backup recovery, configurable bounded backup timing, optional queue/write diagnostics, additive metadata, and fail-closed newer-schema protection.
- Built-in settings/help pages, update notes, automatic update checks, and compatibility with legacy flat media caches.

## 📦 Install

1. Download [MessageLoggerV2.plugin.js](MessageLoggerV2.plugin.js).
2. Place it in the BetterDiscord plugins folder.
3. Enable **MessageLoggerV2** in BetterDiscord settings.
4. Right-click a server, channel, DM, or thread to configure the **Message Logger** whitelist and blacklist.

The default scope is whitelist-only, although the selected channel and DMs have separate override settings.

## 📚 Documentation

- [Settings reference](docs/settings.md)
- [Help and usage](docs/help.md)
- [Official test matrix](docs/tests.md)
- [Developer architecture](docs/architecture.md)
- [Project TODO](TODO.md)

The same help pages are available inside Discord from **MessageLoggerV2 Settings > Help** or the question-mark button in the logger window.

## 🧩 Compatibility

### ⚠️ Plugin conflicts

- [SuppressUserMentions](https://github.com/Metalloriff/BetterDiscordPlugins/blob/master/SuppressUserMentions.plugin.js) patches Discord's mention detection and can break mention or ghost-ping logging.
- **NoDeleteMessages** is a historical plugin named by the upstream compatibility check; its original source repository could not be located.

> [!WARNING]
> Plugins that suppress, retain, rewrite, or consume message-deletion events may stop MessageLoggerV2 from recording or rendering deletions correctly.

### 💾 Data files

- Standard message, deleted, edited, and purged records remain compatible with current MessageLoggerV2 forks.
- The fork-specific `nukedMessageRecord` index and Anti-Nuke marker are additive. Other forks can ignore them while retaining the core saved messages.
- Older Anti-Nuke records previously indexed as Purged are moved into Nuked during atomic normalization.
- Legacy or mixed-fork files are normalized and atomically rewritten without inventing missing enhanced metadata.
- Missing primaries restore from valid backups; newer schemas fail closed instead of being downgraded.

## 💬 Support

Use the **Support server** button in the plugin settings or [join the support server](https://discord.gg/e66JbKte2P).
