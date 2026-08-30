# Discord Webpack/Asset Compatibility Handoff

Prepared: 2026-08-30 (Australia/Melbourne)

Active root Codex session ID: `01a05291-de83-7d30-864b-ada47ac1ac10`

Active root rollout:
`$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T22-08-06-01a05291-de83-7d30-864b-ada47ac1ac10.jsonl`

Previous continuation session ID: `01a022f7-17f8-7b52-8cf3-e0e009dff3b3`

Previous continuation rollout:
`$HOME/.codex/sessions/2026/08/21/rollout-2026-08-21T16-16-54-01a022f7-17f8-7b52-8cf3-e0e009dff3b3.jsonl`

Earlier compatibility-handoff session ID:
`01a05172-deb0-71d1-8089-b7186c453a3d`

Earlier compatibility-handoff rollout:
`$HOME/.codex/sessions/2026/08/30/rollout-2026-08-30T16-54-37-01a05172-deb0-71d1-8089-b7186c453a3d.jsonl`

## Purpose

This is the implementation and runtime-audit handoff for hardening
`MessageLoggerV2.plugin.js` against Discord's current Rspack/Webpack export
changes. The separate deleted-attachment cache/rendering checklist remains
paused except for the explicitly authorized Stage 9 optional Webpack-
availability cleanup.

## 2026-08-30 continuation checkpoint

The production compatibility correction is complete, published, live-synced,
and clean. The permanent audit helper's eight known classification defects are
also corrected and deterministically accepted. No production Logger source,
release metadata, cache/embed behavior, or BetterDiscord host source changed in
this audit-only continuation.

Repository/runtime boundary entering this correction:

- Branch: `develop`
- Production-code commit:
  `670d6de861a032c00e9999147adf99eabb84b9cb`
  (`Fix Discord runtime module compatibility`)
- Audit-handoff checkpoint shared by local `develop`, `origin/develop`, and
  remote `refs/heads/develop` before this correction:
  `832ee3688a196b684b1520318efc06d100935798`
  (`Record runtime audit continuation checkpoint`)
- Tracked worktree: clean before this correction
- `git stash list`: empty
- Repo/live Logger SHA-256:
  `c9250059c7ad79abf7483a27a9db3764894c5e5056219a526ff228f4919f1269`
- Repo/live Logger comparison after audit-helper cleanup: byte-identical
  (`cmp` exit 0)

The one-pass live audit command was:

```js
await MessageLoggerRuntimeCompatibilityAudit.dump("full-audit", {
  loadEntry: true,
  externalAssets: true
});
```

The pre-correction report was generated at `2026-08-30T12:01:27.065Z` and
contains `89` contracts:
`53` pass, `28` warn, and `8` fail. Its scanner completed over `7834` loaded
root/candidate identities with no scanner error. It confirmed the host and
platform capabilities, common and forum DOM surfaces, Logger-owned styles and
mount markers, Logger link integration, all three fixed renderer assets, and
the optional `loadEntry` transition. Native document and audio targets were
already loaded, so no speculative lazy entry was invoked.

The inventory itself is complete: deterministic coverage maps all `53`
production `DiscordModules` lazy getters, semantic CSS signatures, generic
class consumers, Logger-owned classes/attributes, fixed renderer assets, host
capabilities, and the two guarded optional `loadEntry` consumers. The remaining
work at report time was audit selection/status correctness, not another
production-module inventory pass; that bounded work is now complete below.

### Completed audit-helper correction

- Selected stores now use one guarded `Webpack.Stores[storeName]` read, which
  intentionally invokes BetterDiscord's Proxy `get` trap only for this known
  consumer. A missing/throwing Proxy path falls back to the public
  `Webpack.getStore(storeName)` API, including when `Webpack.Stores` itself is
  unavailable. Caught errors use fixed audit-owned labels; arbitrary host error
  messages are not copied into the report.
- Generic module, candidate, and cache scans remain descriptor-only and do not
  invoke unknown getters.
- `Dispatcher` is derived from the selected `UserStore._dispatcher`; it no
  longer requires an unrelated public module root.
- `Css.ContainerClasses` is the sole optional CSS contract. Its absent legacy
  `containerCozyBounded` shape now warns, while every other unresolved CSS
  contract remains required/failing. No replacement class or resolver
  broadening was introduced.

Deterministic evidence for the accepted correction:

- Baseline full `npm test`: `667/667`.
- Focused `npm run test:runtime-audit`: `7/7`.
- `npm run check`: passed.
- Final full `npm test`: `667/667`.
- `git diff --check`: passed.
- An independent read-only review's medium coverage finding for missing and
  throwing `Webpack.Stores` roots was closed with two public-fallback report
  variants. Re-review returned GO with no blocking, high, or medium finding;
  the CSS optionality invariant also closes the earlier low-priority coverage
  suggestion.

The old live report proved the loaded candidate shapes and the rest of the
89-contract inventory; the focused Proxy/fallback, derived-Dispatcher, error-
sanitization, and CSS-status regressions prove the corrected classifications.
That combined evidence is sufficient, so no second live dump or Discord
restart was requested. After acceptance, the installed audit helper and report
were removed from the live plugins directory. They were initially moved to:

`$HOME/.Trash/MessageLoggerRuntimeCompatibilityAudit-accepted-2026-08-30/`

Final verification found that the Trash destination was absent, so the raw
report is not recoverable from the live or Trash locations. The old helper
source remains recoverable from Git history. Their original live paths and the
report temporary path are also absent. The report's decision-grade facts remain
summarized in this handoff, and the corrected permanent helper remains tracked
under `tools/` for future Discord drift.

The commit containing this entry should publish only the audit helper, its
focused regression file, and the two handoffs to `develop`. No further
compatibility-audit action remains after that commit is confirmed on
`origin/develop`; Stage 9 warning identity, Logger-viewer embed/Components V2,
release metadata, `main`, and all other branch work remain paused.

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

The permanent compatibility-audit tool now has seven deterministic tests. Its
accepted correction evidence is:

- `npm run check` passes for both the distributed Logger and the audit helper.
- `npm run test:runtime-audit` passes `7/7`.
- Full `npm test` passes `667/667`.
- `git diff --check` passes.
- An independent read-only review's medium missing/throwing-`Stores` coverage
  finding was closed with two public-fallback report variants, and re-review
  returned GO with no blocking, high, or medium finding. The earlier
  low-priority CSS suggestion was closed by an invariant proving
  `Css.ContainerClasses` is the only optional CSS contract.

The Proxy-backed store fixture proves guarded selected-store access and the
public fallback while keeping generic scanning passive. Missing and throwing
`Webpack.Stores` root variants force every store consumer through the public
fallback. They also prove the derived `UserStore._dispatcher` path and verify
that hostile thrown store errors are not serialized. Focused status checks
prove an unresolved `Css.ContainerClasses` warns and an unresolved required
CSS contract fails.

The first copied helper failed before `start()` because BetterDiscord's addon
loader interpreted Node's `node:fs` specifier as the plugin-relative path
`/node:fs`. The tracked helper now uses BetterDiscord-compatible `fs` and
`path` builtin specifiers at every deployable require site, with a regression
test that rejects future `require("node:...")` usage.

## User-controlled live acceptance gate

The CSS compatibility correction was committed and pushed on `develop` as
`9019c074e18f30854db61ce561aa4446b054784b`, live-synced, and accepted. The
complete module/class/asset audit and its bounded helper corrections are also
accepted. The existing pre-correction live report plus the final deterministic
regressions were sufficient; no second live dump, plugin sync, or Discord
restart was needed.

For any future Discord drift that reopens live validation, verify at least:

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
reused after future Discord or BetterDiscord breakage. After the final report
and deterministic correction were accepted, the installed helper and report
were removed from the live plugins directory and initially moved to
`$HOME/.Trash/MessageLoggerRuntimeCompatibilityAudit-accepted-2026-08-30/`.
Final verification found that the Trash destination was absent, so the raw
report is not recoverable from the live or Trash locations; the helper source
remains recoverable from Git history. Their original live paths and report
temporary path are also absent; no Discord restart was performed.

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
