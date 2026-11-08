# 📝 MessageLoggerV2 Remake

[![CI tests on develop](https://github.com/XxUnkn0wnxX/MessageLoggerV2-Remake/actions/workflows/ci.yml/badge.svg?branch=develop&event=push)](https://github.com/XxUnkn0wnxX/MessageLoggerV2-Remake/actions/workflows/ci.yml?query=branch%3Adevelop)

> [!WARNING]
> **Active development:** rework and native Discord testing are still in progress. Unfinished features and known limitations remain. **develop** is the working/default branch; **main** currently contains only a holding README.

This is a maintained fork of [NightBirde’s MessageLoggerV2-Remake](https://git.slowb.ro/NightBirde/MessageLoggerV2-Remake), retaining credit for the earlier work by Lighty, Davilarek, NightBirde, and other contributors.

A maintained BetterDiscord message logger for deleted, edited, purged, nuked, and ghost-pinged messages.

This fork also restores logged forum posts and channel threads, preserves their metadata, and provides controls for hiding or permanently removing related records.

> [!IMPORTANT]
> Message content and optionally attachments are stored locally. Review the logging scope and cache settings before enabling the plugin.

## ✨ Features

### 📜 Logging and restoration

- Deleted, edited, purged, Nuked, and ghost-ping history, plus a bounded memory-only **Sent** tab that clears on reload.
- In-chat restoration of logged deleted and purged messages, saved edit history, configurable tints, and unseen-event counts.
- Attachment-only messages, embeds, stickers, voice messages, and other file references remain manageable in Logger views; image/video media and guarded Discord-native audio, TXT, and PDF presentation are isolated per attachment in mixed batches.
- Newly captured embeds, message snapshots, and legacy/Components V2 trees retain their complete JSON-serializable payload for native restoration. Component-only records receive a concise Logger-view summary, and Components V2 thumbnail/gallery media participates in local caching while a full Logger-owned renderer remains future work.
- Saved image/video/audio/TXT/PDF attachments use the remote-first CDN -> distinct proxy -> cached local Blob/file -> exact-filename placeholder policy. Local-only rendering uses cached local Blob/file -> exact-filename placeholder, and **Open Attachment** uses the exact clicked sibling through the OS default browser or application without externalizing Blob URLs.
- Search filters, scoped log views, context-menu actions, double-click-to-jump logger rows, and cross-category Hidden records.
- Captured toggle keybinds for all logs, the selected channel, and the selected server. Channel/server shortcuts switch a foreground Logger filter in place when no auxiliary surface is open; `Ctrl+M` clears an open filter in place and closes an unfiltered Logger on repeat. Switching views closes any open native media viewer first.
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

- Server, channel, DM, thread, mute, NSFW, bot/app/webhook, blocked-user, author, and local-action logging controls.
- Separate guild/DM alert toggles, notification location lists, selected-location overrides, native BetterDiscord notifications, and custom actionable toasts. A shared manager in Settings and the Logger resolves listed IDs to live server names/icons when available, groups linked channels, and removes an entry from its current list or all four lists.
- One console entry and routed alert per high-impact setting change.
- Info-blue enabled states, theme-neutral disabled states, warning-colored backup diagnostics, and red errors.
- Optional local media caching, cache-size/type controls, local-only rendering, CDN fallback, custom cache paths, cached-file cleanup, and a memory-only no-save media queue. **Cache all attachment types** controls admission of new ordinary non-image attachment cache requests, not remote or existing-cache rendering. That gate remains a deferred limitation: arbitrary non-image files may remain CDN-backed or uncached when On and may still log their references when Off.
- Persistent media downloads default to BetterDiscord native networking with guarded legacy fallback and progress-aware timeouts. Per-message pre-cache staging promotes confirmed files without re-downloading, while one shared scheduled trimmer applies independent live/pre-cache age and GB limits in cooperative batches.
- Safe no-save sessions: keep saved history visible or hot-detach every archive-owned mount, retain temporary activity and actions in memory, and validate/merge before an atomic primary-file replacement. The two large state controls grey out with a warning-orange pulse while their save/media or archive-view transition settles; a failed three-attempt/timeout recovery can be bypassed on the next resume by discarding the temporary session and reloading the last valid archive.
- Atomic legacy/mixed-fork normalization and recoverable settings-config repair.
- Clearly reported valid-backup recovery, configurable bounded backup timing, optional queue/write diagnostics, additive metadata, and fail-closed newer-schema protection.
- Built-in settings/help pages, update notes, automatic update checks, and compatibility with legacy flat media caches.

## 📦 Install

1. Download [MessageLoggerV2.plugin.js from develop](https://github.com/XxUnkn0wnxX/MessageLoggerV2-Remake/blob/develop/MessageLoggerV2.plugin.js).
2. Place it in the BetterDiscord plugins folder.
3. Enable **MessageLoggerV2** in BetterDiscord settings.
4. Right-click a server, channel, DM, or thread to configure the **Message Logger** whitelist and blacklist.

The default scope is whitelist-only, although the selected channel and DMs have separate override settings.

## 📚 Documentation

- [Settings reference](docs/settings.md)
- [Help and usage](docs/help.md)
- [Official test matrix](docs/tests.md)
- [Developer architecture](docs/architecture.md)
- [Runtime compatibility audit](docs/runtime-compatibility-audit.md)
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
