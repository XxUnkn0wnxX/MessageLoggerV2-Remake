# Runtime compatibility audit

`tools/MessageLoggerRuntimeCompatibilityAudit.plugin.js` is a manual BetterDiscord
diagnostic for checking the host APIs, Discord Webpack modules, semantic CSS
exports, DOM surfaces, Logger-owned markers, and fixed renderer assets used by
MessageLoggerV2.

Use it after a Discord or BetterDiscord update, or when Logger reports a missing
module, class, component, or runtime capability. The helper does not modify
MessageLogger data, Webpack exports, or mounted messages. Enabling it only exposes
its console API; it does not start a dump or network probe automatically.

## Install

Copy `MessageLoggerRuntimeCompatibilityAudit.plugin.js` from the repository's
`tools` directory into the BetterDiscord plugins directory for the active stable
client:

- Windows: `%AppData%\BetterDiscord\plugins`
- macOS: `$HOME/Library/Application Support/BetterDiscord/plugins`
- Linux: `$XDG_CONFIG_HOME/BetterDiscord/plugins`, or
  `$HOME/.config/BetterDiscord/plugins` when `XDG_CONFIG_HOME` is unset

Open **User Settings > BetterDiscord > Plugins** and enable
**MessageLoggerRuntimeCompatibilityAudit**. Keep MessageLoggerV2 enabled for the
integration and Logger-owned surface checks.

## Run one complete audit

Open Discord's developer console and run:

```js
await MessageLoggerRuntimeCompatibilityAudit.dump("full-audit", {
  loadEntry: true,
  externalAssets: true
});
```

This is the complete one-pass command. It intentionally permits:

- one guarded, exact `MessageAccessories` `BdApi.Utils.loadEntry` attempt when
  the native audio/document targets are not already loaded; and
- a detached image request for Logger's fixed external failure placeholder.

Neither action runs when its option is omitted. The default passive command is:

```js
await MessageLoggerRuntimeCompatibilityAudit.dump("manual");
```

The exhaustive loaded-module checks may take several seconds. A second command
while the first is running shares the same in-flight audit instead of starting a
duplicate scan.

The helper's own cache scans and validators inspect property descriptors without
executing candidate accessors. It still runs Logger's exact public
`BdApi.Webpack` selectors (`getByKeys`, `getBySource`, and related calls) where
the selector result itself is the compatibility contract being audited; those
calls retain BetterDiscord's normal lookup semantics.

## Report and cleanup

The helper writes a sanitized JSON report beside the installed plugin:

`MessageLoggerRuntimeCompatibilityAudit-report.json`

The report contains fixed contract names and references, booleans, bounded
counts, sanitized numeric Webpack identifiers, and fixed status labels. Fixed
references are limited to Logger-owned host names, URL templates, path prefixes,
and the local renderer-cache origin declared by the plugin. It does not persist
message content, user/channel/message IDs, inspected or signed attachment URLs,
raw CSS values, function source, caught exception text, or local filesystem
paths. Report labels are limited to `manual`, `full-audit`, and the internal
test label; any other caller-supplied label is stored only as `custom`.

After collecting the report, remove it with:

```js
MessageLoggerRuntimeCompatibilityAudit.clear();
```

Then disable the helper and remove its copied plugin file from the BetterDiscord
plugins directory. Keep the tracked source under `tools/` so it can be updated
whenever MessageLoggerV2 gains or removes a runtime dependency.

## Interpreting results

- `pass` means the selected contract and its consumer shape resolved.
- `warn` usually means a valid selection was found but uniqueness could not be
  proven, or an optional transition did not reveal a target.
- `fail` means a required capability or consumer contract did not resolve.
- A zero count on route-specific DOM surfaces normally means that surface was
  not mounted during the dump. Only the Discord renderer root is an
  unconditional DOM requirement.

Use runtime failures as trace evidence. Update the exact lookup or fallback in
MessageLoggerV2, add deterministic coverage where possible, and rerun the
official test suite before syncing the plugin live.
