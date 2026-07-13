# 🏗️ Developer Architecture

This document maps the major responsibilities inside the distributed `MessageLoggerV2.plugin.js` file. The plugin remains a single-file BetterDiscord artifact, so use the method names and state fields below as stable search anchors when maintaining it.

## 🔄 Lifecycle and Compatibility

- `start`, `initialize`, and `stop` own plugin startup, module readiness, timers, patches, synchronous shutdown persistence, and cleanup.
- `DiscordModules` lazily resolves Discord Webpack exports. Missing-module fixes must follow the runtime trace workflow in `AGENTS.md`; do not hide lookup warnings without proving the live export path.
- `getChanges`, `checkNewUpdate`, and `performUpdate` provide the in-plugin changelog and maintained-fork updater.
- Startup settings normalization preserves old installations, migrates legacy caps, and forces the two locked cache compatibility settings on.

## ⚙️ Settings and Scope Policy

- `getSettingsPanel`, `createSetting`, and `createGroup` build the accordion settings interface. `buildSetting` assigns changes only to BetterDiscord's panel-level callback because BetterDiscord invokes both item-level and panel-level callbacks when both are supplied.
- The standalone warning-colored Debug group keeps console and routed-toast diagnostics independently opt-in. `reportDebugEvent` is the shared router and currently accepts only automatic-backup lifecycle events.
- `reportSettingState` keeps console detail and routed alerts aligned. `reportMajorSettingChange` deliberately covers only broad logging, persistence, media, update, and destructive settings; enabled states route as info and disabled states route through the theme-neutral presentation. Per-setting replacement keys discard obsolete alerts after rapid changes.
- Logging scope combines whitelist, blacklist, muted server/channel, NSFW, selected-channel, and DM rules.
- Author and local-action gates are intentionally separate: bot, blocked-user, self-author, local-edit, and local-delete rules must remain per message.
- Guild and DM notification lists affect alerts rather than record eligibility.

## 🗃️ Record Model and Indexes

- `messageRecord` is the source of truth keyed by Discord message ID.
- `deletedMessageRecord`, `editedMessageRecord`, and `purgedMessageRecord` are channel-to-ID indexes. A record may legitimately appear in more than one category, but each category/channel list must remain de-duplicated.
- `deletedMessageSet`, `editedMessageSet`, and `purgedMessageSet` mirror those indexes for fast membership checks.
- `suppressedForumThreadIds` prevents intentionally hidden or removed restored roots from reappearing.
- `_getDataPayload`, `installDataPayload`, and `sanitizeDataPayload` define the persisted/runtime boundary and rebuild derived sets and sorted caches.

## 💾 Persistence and No-Save Recovery

- `saveData` batches ordinary writes; `handleDataSaving` creates the current payload and schedules optional backups using the validated 10-to-86,400-second interval (20 seconds by default). `queueAutoBackup` owns timer creation and reports its delay through the optional debug router.
- `efficientlySaveData` writes complete JSON to a same-directory temporary file and atomically renames it over the destination. Its commit predicate prevents stale in-flight writes from renaming after saving is disabled.
- `cleanUpStaleDataTempFiles` removes only old logger-owned temp files.
- When the plugin starts with `dontSaveData`, disk history is intentionally skipped and the session starts empty. `_needsNoSaveDataMerge` distinguishes this from toggling saving without a reload.
- `loadPersistedDataForNoSaveMerge` reads files directly because BetterDiscord's data API can return a cached payload after direct atomic writes.
- The namespaced `mlv2RemakeSchemaVersion` marks this fork's additive canonical payload without replacing the standard four logger maps. Current forks can ignore the marker and enhanced fields; when another fork drops them, their absence triggers normalization on the next load. A schema newer than this build is never rewritten automatically, and unknown top-level fork extensions are retained.
- Persisted forum/thread metadata, saved locations, suppression lists, and locked cache-setting keys are optional compatibility additions. Older forks without them remain valid; legacy `deletedata` and `editHistory` values are merged into canonical `delete_data` and `edit_history`, while missing enhanced values receive safe empty defaults.
- `prepareDataPayloadForNormalization` fills only reconstructable derived collections and refuses to invent a missing core `messageRecord`. `normalizePersistedDataPayload` then normalizes records, re-keys mismatched message IDs, de-duplicates edit/cache identities, rebuilds indexes by the record's canonical channel, and performs strict final validation.
- A detected legacy/mixed payload is installed only after normalization succeeds, then `rewriteCanonicalDataPayload` atomically replaces the entire primary file. The old backup is deliberately retained until a later normal backup, and progress/failure uses the configured notification router.
- `selectStartupDataPayload` distinguishes a missing primary from a fresh empty payload and restores a valid backup even when automatic backup writing is currently disabled. Backup restoration is tracked separately from legacy migration so console and routed progress/success/failure messages describe rebuilding the primary file. `readDataPayloadFile` applies the same normalization to no-save recovery sources.
- A higher `mlv2RemakeSchemaVersion` is an incompatible state rather than corruption: startup and no-save recovery stop before falling back or writing. Opaque extension conflicts use a persisted-wins recursive merge because the temporary no-save session does not own another fork's disk state.
- `mergeSavedRecords` combines same-ID records field-by-field: newer session message fields, unioned edit history and media IDs, preserved delete/forum metadata, and hidden state that cannot be silently cleared by a collision.
- `mergeDataPayloads` unions category indexes and suppressed roots. `applySavedMessagesCapToPayload` applies caps to the detached result before persistence and cascades removed forum/thread roots to children. Recovery cap cleanup intentionally does not delete local media while the transaction can still fail; preserving a harmless orphaned cache file is safer than irreversible pre-commit deletion.
- `mergeNoSaveSessionIntoPersistedData` is a transaction ordered as load, validate, merge, cap, install, primary write, then backup. Primary failure keeps saving disabled and leaves both files untouched.
- `cancelPendingDataWrites` clears queued timers and increments a write epoch. Async writers check that epoch before rename.
- Recovery failures always log detailed stage, path, cause, and state information, then route a concise alert through `_showNotification` so the selected native-notification/custom-toast mode is respected.

## 📡 Discord Event Capture

- `patchMessages` and `onDispatchEvent` intercept Discord Flux message and channel events.
- Create, update, single-delete, and bulk-delete paths update the record model and category indexes before scheduling persistence.
- Thread-created system messages are intentionally excluded from logger interception so Discord retains native delete behavior.
- Local-delete tracking distinguishes actions initiated by this client from remote deletions of locally authored messages.

## 🧵 Forum Posts and Channel Threads

- Forum/thread metadata snapshots preserve parent IDs, names, types, paths, starter IDs, and card information after live Discord objects disappear.
- Complete root deletion stores the root and eligible children under the thread ID; root hide/unhide/remove actions cascade through `getForumThreadRecordIds`.
- Restored forum cards, channel sidebar entries, and thread-browser entries require a live Discord item as a DOM/React layout anchor.
- Thread-scoped logger views, context labels, jump routing, tinting, and suppression must continue distinguishing forum posts from ordinary channel threads.

## 🛡️ Anti-Nuke Recovery

- Channel deletion capture stores bounded snapshots under Purged.
- Thread/forum-root, total-message, and attachment caps are separate and apply newest-first.
- Root records bypass the total-message budget but their attachments still consume the attachment budget.
- Anti-Nuke intentionally overrides normal logging scope and author ignores; only its own enable switch disables the cascade.
- Parent channels no longer exist, so Anti-Nuke records do not offer impossible jump actions.

## 🖼️ Media Lifecycle

- Core message-history caching and the hierarchical server/channel cache layout remain enabled for forum/thread reliability.
- `cacheMessageImages` and `cacheImage` handle attachments, embed images, stickers, file-type policy, custom paths, and size limits.
- Legacy flat-cache paths remain readable even though new files use hierarchical paths.
- Cache-only rendering replaces unavailable remote media with manageable filename placeholders.
- Optional cached-file deletion is record-aware and must never scan or delete outside configured cache roots.

## 🎨 Rendering, Tinting, and Navigation

- Message-content and message-component patches render saved edits and deletions in live chat.
- Deleted text/background tinting, forum cards, restored thread entries, and logger views share saved record state but use different mounted DOM targets.
- Sorted ID caches accelerate logger rendering and must be invalidated when category indexes change.
- Jump logic uses live message routes when available, restored forum/thread parents as fallback, and suppresses Jump when no valid destination exists.

## 🖱️ Logger UI and Record Actions

- The logger window provides deleted, edited, purged, sent, ghost-ping, and optional Hidden tabs.
- Filters support server, channel, user, content/message, and media predicates.
- Hide/unhide changes visibility without deleting records; Remove From Log and Clear Log permanently update records, indexes, restored entries, and optional cached files.
- Context-menu injections expose scope lists and record actions while preserving Discord and other plugins' native items.

## 🔔 Notifications

- `_showNotification` is the single routing point between BetterDiscord native notifications and the plugin's custom toasts.
- Custom toast colors use Discord CSS variables. The plugin-owned `neutral` state becomes a theme-grey custom toast or a supported native `info` notification with a neutral icon, because BetterDiscord exposes no grey notification type.
- Setting-state alerts use wall-clock expiry rather than hover pause. Custom setting toasts also dismiss immediately on a mouse action, while their normal timeout retains the standard exit animation.
- Native notifications use a memory-only FIFO queue with hover-aware yielding; queue state is never persisted.
- Guild and DM event settings, local-user rules, active-location overrides, and notification lists are evaluated separately from logging eligibility.

## 🧪 Testing and Change Safety

- `tests/helpers/plugin-harness.js` loads the real exported class with narrow BetterDiscord mocks.
- Persistence, merge, policy, records, media, Anti-Nuke, and source contracts have focused Node tests; `docs/tests.md` is the authoritative matrix.
- Run `npm test` before and after behavior changes and `git diff --check` before deployment.
- Discord Webpack, Flux, DOM, and mount behavior still require the relevant live `RT-*` checks. Use disposable profiles or copied data for destructive persistence tests.
- Keep multi-instance storage isolation separate: atomic replacement prevents partial files but does not eliminate last-complete-writer-wins between simultaneous Discord instances.
