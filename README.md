# MessageLoggerV2 Remake

A maintained BetterDiscord message logger for deleted, edited, purged, and ghost-pinged messages. This fork also restores logged forum posts and channel threads, preserves their metadata, and provides controls for hiding or permanently removing related records.

> [!IMPORTANT]
> Message content and optionally attachments are stored locally. Review the logging scope and cache settings before enabling the plugin.

## Features

- Deleted, edited, purged, sent, and ghost-ping logs.
- Restored deleted messages after reload.
- Forum post and channel thread logging with parent-channel metadata.
- Whitelist, blacklist, mute, author, and local-action controls.
- Search filters, context-menu actions, notifications, hidden records, and attachment caching.

## Install

1. Download [MessageLoggerV2.plugin.js](MessageLoggerV2.plugin.js).
2. Place it in the BetterDiscord plugins folder.
3. Enable **MessageLoggerV2** in BetterDiscord settings.
4. Right-click servers or channels to configure the **Message Logger** whitelist and blacklist.

The default scope is whitelist-only, although the selected channel and DMs have separate override settings.

## Documentation

- [Settings reference](docs/settings.md)
- [Help and usage](docs/help.md)

The same help pages are available inside Discord from **MessageLoggerV2 Settings > Help** or the question-mark button in the logger window.

## Compatibility

Do not run this plugin alongside **NoDeleteMessages** or **SuppressUserMentions**. The plugin reports both combinations as unsupported.

## Support

Use the **Support server** button in the plugin settings or [join the support server](https://discord.gg/e66JbKte2P).
