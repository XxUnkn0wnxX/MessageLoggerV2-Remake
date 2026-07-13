# 📝 MessageLoggerV2 Remake

A maintained BetterDiscord message logger for deleted, edited, purged, and ghost-pinged messages. This fork also restores logged forum posts and channel threads, preserves their metadata, and provides controls for hiding or permanently removing related records.

> [!IMPORTANT]
> Message content and optionally attachments are stored locally. Review the logging scope and cache settings before enabling the plugin.

## ✨ Features

### 📜 Logging and restoration

- Deleted, edited, purged, and ghost-ping history, plus a bounded memory-only **Sent** tab that clears on reload.
- In-chat restoration of logged deleted and purged messages, saved edit history, configurable tints, and unseen-event counts.
- Attachment-only messages, embeds, stickers, voice messages, and other file references remain manageable in logger views.
- Search filters, scoped log views, context-menu actions, state-aware captured toggle keybinds for all/current-channel logs, a Hidden tab, and one local-only permanent-delete flow across restored messages, logger-window rows, and forum/thread mounts: right-click **Delete** confirms, while Shift reveals Trash and Shift-click removes immediately—even when Discord omits server-delete actions for messages you cannot moderate. Shortcut view changes also close an open native media viewer first, regardless of whether Discord or the logger opened it.

### 🧵 Forums, threads, and channel recovery

- Forum posts and channel threads retain parent-channel, location, author, reply, and later-added attachment metadata.
- Fully deleted forum cards and thread entries can be restored when Discord provides at least one live item as a layout anchor.
- Default-on native forum refresh shows new posts without leaving and reopening the channel.
- Configurable **Anti Nuke** snapshots capture bounded forum posts, threads, messages, and attachments when a parent forum or text channel is deleted.
- Required message-history caching and the hierarchical media-cache layout remain enabled for reliable forum/thread recovery; their legacy settings are visible but locked on.

### 🛡️ Scope, alerts, media, and reliability

- Server, channel, DM, thread, mute, NSFW, bot, blocked-user, author, and local-action logging controls.
- Separate guild/DM alert toggles, notification location lists, selected-location overrides, native BetterDiscord notifications, and custom actionable toasts.
- One-per-change console and routed notification feedback for high-impact settings, with info-blue enabled states, theme-neutral disabled states, warning-colored backup diagnostics, and red errors.
- Optional local media caching, cache-size/type controls, local-only rendering, CDN fallback, custom cache paths, and cached-file cleanup when records are removed.
- Safe no-save sessions: re-enabling saving after a reload validates and merges disk and session history before an atomic primary-file replacement.
- Atomic legacy/mixed-fork normalization, recoverable settings-config repair, clearly reported valid-backup recovery, configurable bounded backup timing with optional queue/write diagnostics, additive enhanced metadata, and fail-closed protection for newer schemas.
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
- Forum/thread, location, suppression, Anti-Nuke, and cache metadata are additive.
- Legacy or mixed-fork files are normalized and atomically rewritten without inventing missing enhanced metadata.
- Missing primaries restore from valid backups; newer schemas fail closed instead of being downgraded.

## 💬 Support

Use the **Support server** button in the plugin settings or [join the support server](https://discord.gg/e66JbKte2P).
