# Discord Webpack/Asset Compatibility Handoff

Prepared: 2026-08-30 (Australia/Melbourne)

Codex session ID: `01a05172-deb0-71d1-8089-b7186c453a3d`

## Purpose

This is the implementation and runtime-audit handoff for hardening
`MessageLoggerV2.plugin.js` against Discord's current Rspack/Webpack export
changes. The separate deleted-attachment cache/rendering checklist remains
paused except for the explicitly authorized Stage 9 optional Webpack-
availability cleanup.

Repository state when audited:

- Repository: `$HOME/Apps/Dev/BD/BD-Plugins/MessageLoggerV2-Remake`
- Branch: `develop`
- HEAD before the permanent audit-tool change:
  `9019c074e18f30854db61ce561aa4446b054784b`
- Tracked worktree: clean before the permanent audit-tool work began
- Repo/live `MessageLoggerV2.plugin.js` SHA-256:
  `27688c055eebfd31a3133359f7da63a8ae6c4aa15c75c6b6bb6fb2a3e3387a1c`
- Repo/live plugin comparison: byte-identical (`cmp` exit 0)

## Executive verdict

There is no confirmed current MessageLogger startup, ReactDOM, patcher, store,
native-media, or native-delete failure from the Discord update. The baseline
live plugin repeatedly completed initialization after the same renderer update
that broke BDFDB.

Official Discord assets now include CSS modules whose JavaScript export keys
are mangled while their string values retain semantic class tokens. The clean
live trace found both the mangled and semantic keys on the same runtime
`module.exports` object. A later source audit confirmed that BetterDiscord does
not synthesize those aliases: its Webpack hooks observe and return Discord's
exports unchanged. The raw asset/live-export difference therefore belongs to
Discord's runtime module path; the exact Discord loader transformation was not
available in the host source and remains unproven.

Logger still benefited from a narrow fail-safe for an older host or a class-
module factory shape the host recognizer misses. The compatibility correction
keeps BetterDiscord's direct semantic lookup first and performs exact value-
token normalization only after that lookup misses. It also fixes two confirmed
consumer hazards found during the audit: empty observer classes matching every
string and a whole Webpack module object being passed to
`classList.contains()`.

## Confirmed runtime evidence

Primary log:

`$HOME/Library/Application Support/BetterDiscord/data/stable/debug.log`

After the relevant Discord renderer change, MessageLogger repeatedly logged:

- `Found ImageModal using pattern: zoomThumbnailPlaceholder`
- `All patches applied, forcing UI update...`
- `UI force update completed`
- `Found native media modal`
- `Captured Discord's native Delete button presentation for restored logger items.`

Representative successful windows:

- 2026-08-30 06:31:20 through 06:31:33
- 2026-08-30 06:33:53 through 06:33:59
- 2026-08-30 06:48:39 through 06:48:44
- 2026-08-30 06:50:10 through 06:50:14
- 2026-08-30 06:51:02 through 06:51:07
- 2026-08-30 06:52:58 through 06:53:07
- 2026-08-30 07:06:40 through 07:06:54
- 2026-08-30 07:07:48 through 07:07:55
- Native media modal resolved at 07:16:22
- Native Delete presentation was captured at 07:18:11

No same-day stack refers to `MessageLoggerV2.plugin.js`, and no current logger
diagnostic reports a missing critical module, missing React container, missing
class component, unavailable `forceUpdate`, or failed UI force-update.

The hard errors in those windows are BDFDB-side and include:

- `Internal.LibraryModules.ReactDOM.render is not a function`
- `Internal.LibraryModules.ReactDOM.findDOMNode is not a function`
- `SearchBar not found in DiscordClassModules`
- `ConnectionProviderUtils.filter is not a function`

MessageLogger is standalone: it has no BDFDB or ZeresPluginLibrary dependency.

## Noise that must not be misattributed

The post-update MessageLogger warnings found in the live log are media transport
or source-content cases already handled by the cache code:

- HTTP 403/404 media unavailable, skipping cache
- Could not determine a file extension
- One exhausted request ending in `socket hang up`

The same warning classes occurred before the renderer update. They are not
Webpack/module-discovery evidence.

The repeated warning below has no component stack or plugin attribution:

`useManaContext must be used within a ManaContext.Provider`

Do not claim MessageLogger causes it, and do not fold a Mana-provider rewrite
into this CSS compatibility fix unless a targeted live trace supplies a
MessageLogger component stack.

## React and component paths already compatible

Do not replace these merely because BDFDB broke:

- `BdApiInstance` supplies `ReactDOM`.
- MessageLogger uses `ReactDOM.createRoot`, not removed legacy
  `ReactDOM.render` or `ReactDOM.findDOMNode`.
- Current mount sites use `createRoot`; the synchronous document path retains
  its existing `flushSync` call.
- `Components.Button.Colors` is the BetterDiscord public Button component API;
  it is separate from the vulnerable CSS map named `ButtonClasses`.
- Export-aware probes for native document messages, native audio, and
  `MessageAccessories` deliberately use `searchExports: true` and inspect the
  resolved export/prototype.
- Forum upload routing deliberately receives an export map, identifies its
  function dynamically, and patches the discovered key. Minified export keys
  are acceptable on that path.

`forceUpdateUI()` still depends on React internals
(`__reactContainer$` and a class `stateNode.forceUpdate`), but it completed in
every current startup window. Treat it as a monitored future risk, not part of
this fix.

## Raw asset and live host evidence

The clearest official-asset example is Discord module `211182` in
`139987.d79f28bdc167c679.js`. Its raw Button CSS export uses mangled keys:

- `x6: "button__201d5"`
- `PG: "contents__201d5"`
- `WL: "lookFilled__201d5"`
- `x8: "colorBrand__201d5"`
- `uu: "lookOutlined__201d5"`

The semantic names exist in the class-string values but not as raw JavaScript
keys. Discord's web bundle consumes the mangled fields directly.

The clean live trace was run with BDFDB disabled after a complete Discord
restart. It inspected 737 loaded modules/candidates and reported 31 unique
Logger CSS contracts, 11 deliberately ambiguous single-key contracts, and four
missing legacy alternatives. Live module `211182` exposed both the mangled keys
and the semantic aliases in the same `module.exports` object.

Read-only inspection of the local BetterDiscord `develop` fork and
`upstream/development` found no CSS-alias mapper. The relevant host paths only
observe completed module factories, traverse existing exports, and return the
matched object unchanged. The inspected fork/upstream Webpack differences are
cache and safe-declaration-read changes, not CSS-export mutation. This rules
out a BetterDiscord-owned alias polyfill but does not prove the unavailable
Discord loader/factory step that produced the dual live export.

The four clean-trace misses were old fallback shapes rather than evidence of a
current used surface failing: `containerCozyBounded`,
`content + marginCompactIndent`, `container + containerCompactBounded`, and the
old `spoilerText + hidden` alternative. Current `spoilerContent + hidden`
resolved. The later complete audit must still decide whether the other three
legacy definitions can be removed or should remain harmless retryable
fallbacks.

## Implemented compatibility contract

The correction adds a logger-owned semantic CSS resolver next to
`DiscordModules`; it does not introduce BDFDB or change BetterDiscord globally.
It:

1. keeps `Webpack.getByKeys()` first and returns that exact object when it
   succeeds;
2. scans through the public `Webpack.getModule()` API only after a direct miss;
3. matches exact whitespace-delimited `${property}_` class tokens, never broad
   substrings;
4. requires all requested semantic properties from one candidate;
5. preserves complete composite class strings and direct-property precedence;
6. reads descriptors/getters defensively and clones the normalized view without
   mutating Discord's export object;
7. caches successful results only, leaving misses retryable; and
8. retains `searchExports: true` only on paths that already required it.

The resolver now covers the CSS `DiscordModules` definitions, eager startup
classes, generic legacy renderer classes, timestamp classes, native-audio
`mosaicItemContent`, and therefore the existing toolbar consumer. Ordinary
stores, actions, components, and source/prototype lookups remain separate until
the complete live audit proves a specific miss.

Two consumer corrections are included:

- Observer matching now requires a nonempty exact class token, preventing an
  unresolved empty class from matching every string.
- Logger-view group collection passes the first resolved `message` token to
  `classList.contains()`, not the whole Webpack module. If that class is
  unavailable, it returns only the current message id instead of walking
  arbitrary following siblings.

## Automated validation status

`tests/webpack-css-compat.test.js` contains 20 tests covering the direct path,
the exact current Button fixture, composite values, precedence, same-module completeness,
substring rejection, throwing getters, descriptor/nonmutation behavior,
retry-after-miss, unchanged `Components.Button.Colors`, every routed consumer,
native-audio options, exact observer matching, and safe group-boundary source
contracts.

For the completed CSS compatibility correction:

- `node --check MessageLoggerV2.plugin.js` passes.
- The focused compatibility file passes `20/20`.
- Full `npm test` passes `658/658`.
- `git diff --check` passes.
- An independent read-only review returned GO with no blocking, high, or medium
  finding.
- The tracked/staged/outgoing privacy scans passed, commit
  `9019c074e18f30854db61ce561aa4446b054784b` was pushed to `develop`, and the
  repository/live plugin copies remain byte-identical at the SHA-256 recorded
  above.

The follow-up permanent compatibility-audit tool adds six deterministic
coverage tests. Its current pre-commit evidence is:

- `npm run check` passes for both the distributed Logger and the audit helper.
- `npm run test:runtime-audit` passes `6/6`.
- The first expanded full run passed every new audit test but one unrelated
  existing media idle-timeout test missed its narrow timing window. That exact
  test passed immediately in isolation, and the unchanged full suite then
  passed `662/662`. After the final native-modal-alternative regression was
  added, the complete suite passed `663/663`. After correcting the helper's
  BetterDiscord builtin-module specifiers, the complete suite passed `664/664`.
- `git diff --check` passes.
- A final independent read-only review returned GO with no blocking, high, or
  medium finding.

The first copied helper failed before `start()` because BetterDiscord's addon
loader interpreted Node's `node:fs` specifier as the plugin-relative path
`/node:fs`. The tracked helper now uses BetterDiscord-compatible `fs` and
`path` builtin specifiers at every deployable require site, with a regression
test that rejects future `require("node:...")` usage.

## User-controlled live acceptance gate

The CSS compatibility correction was committed and pushed on `develop` as
`9019c074e18f30854db61ce561aa4446b054784b`, live-synced, and accepted. The
complete module/class/asset audit is the current stage. Do not restart or kill
Discord.

When live validation is authorized, verify at least:

- No `Failed to load module` or `Critical Discord modules missing` warning
- `All patches applied` and `UI force update completed`
- Logger settings buttons retain native styling
- Logger window tabs, filter, and list rendering
- Restored/deleted message styling and selectors
- Message and media context-menu entries
- Native media modal open path
- Native Delete presentation capture and restored-item Delete behavior
- No new `getDiscordClass`, timestamp-class, or native-audio class warnings

Record which checks are source-level, automated, and genuinely live. A clean
startup alone does not prove every CSS-dependent feature.

## Trace disposition

The existing `MessageLoggerCssExportTrace` helper was used for the CSS stage.
After its evidence was incorporated here, its live symlink, ignored source, and
generated report were removed. It is not linked or needed for the complete
audit.

The complete audit uses the tracked manual helper
`tools/MessageLoggerRuntimeCompatibilityAudit.plugin.js`. Its installation,
one-pass command, report path, privacy contract, and cleanup are documented in
`docs/runtime-compatibility-audit.md`. Keeping this helper in the repository is
intentional so its dependency inventory can evolve with MessageLoggerV2 and be
reused after future Discord or BetterDiscord breakage.

## Hard stops

- Do not copy the BDFDB hotfix wholesale into MessageLogger.
- Do not add BDFDB/Zeres dependencies.
- Do not replace working `createRoot` mounts with legacy ReactDOM calls.
- Do not claim the Mana warnings are fixed or logger-owned without a stack.
- Do not treat 403/404/extension/socket media warnings as Webpack failures.
- Do not broaden this into persistence, schema, attachment-cache, or deleted
  image rendering work; those WIP surfaces have separate contracts/checklists.
- Do not restart Discord; use BetterDiscord's normal hot reload after the
  authorized plugin-only live sync.

## Reference incident evidence

- Current Button CSS asset:
  `https://discord.com/assets/139987.d79f28bdc167c679.js`
- Current Discord web bundle inspected during the BDFDB trace:
  `https://discord.com/assets/web.e3526df05a0a7718.js`
- Matching upstream BDFDB failure report:
  `https://github.com/mwittrien/BetterDiscordAddons/issues/3369`
- Additional affected-plugin report:
  `https://github.com/mwittrien/BetterDiscordAddons/issues/3370`

The BDFDB incident is useful evidence for Discord's renderer/API drift, but it
is a separate library failure. MessageLogger's remediation target is its own
CSS/module-discovery layer described above.
