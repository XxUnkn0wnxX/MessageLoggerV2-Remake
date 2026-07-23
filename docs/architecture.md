# 🏗️ Developer Architecture

This document maps the major responsibilities inside the distributed `MessageLoggerV2.plugin.js` file.

The plugin remains a single-file BetterDiscord artifact. Use the method names and state fields below as stable search anchors when maintaining it.

## 🔄 Lifecycle and Compatibility

- `start`, `initialize`, and `stop` own plugin startup, module readiness, timers, patches, synchronous shutdown persistence, and cleanup.
- `requestCssClassModeChange`, `commitCssClassModeChange`, and `restartForCssClassMode` apply class-map changes through BetterDiscord's public disable/enable lifecycle. The controlled custom switch commits only accepted changes; an ordinary stop clears its settings listeners, while the one intentional same-instance restart preserves them for the still-mounted settings panel. Normal saving receives the existing synchronous shutdown archive flush before restart. No-save mode requires explicit danger confirmation because its memory-only session state cannot be flushed.
- `DiscordModules` lazily resolves Discord Webpack exports. Missing-module fixes must follow the runtime trace workflow in `AGENTS.md`; do not hide lookup warnings without proving the live export path.
- `getChanges`, `checkNewUpdate`, and `performUpdate` provide the in-plugin changelog and maintained-fork updater.
- Startup normalization preserves old installations, migrates legacy caps, validates keybind arrays, and forces the two locked cache settings on.
  - `loadSettingsConfigForStartup`, `parseRecoverableSettingsJson`, and `recoverSettingsConfigText` run before BetterDiscord can mistake invalid JSON for a new install.
  - They repair common comma/bracket damage, salvage valid values, atomically rewrite the config, and retain the exact corrupt source as a recovery backup.

## ⚙️ Settings and Scope Policy

- `getSettingsPanel`, `createSetting`, and `createGroup` keep the existing accordion interface while building one BetterDiscord panel per group. Every setting owns its callback and saves accepted changes immediately; the BetterDiscord **Done** action and React unmount lifecycle never own persistence. This works with upstream and the local fork, while older builders simply ignore dependency metadata.
- `createConfirmedCssClassModeSwitch` uses BetterDiscord's public controlled `SwitchInput` because ordinary settings switches update their own visual state before callbacks and cannot represent a cancelled confirmation. Older hosts without that public component receive a controlled checkbox fallback.
- Logger shortcuts use BetterDiscord's native `KeybindInput` recorder in the normal settings row.
  - Validation rejects unsafe or overlapping all-log, channel, and server chords inline, then clears stale pressed state when capture finishes.
  - Capture-phase listeners compare normalized, order-independent key sets. The recorder's earlier window-capture listener suppresses these checks while recording.
  - Toggling compares the requested filter with the actual logger state: matching views close; different views close then reopen.
  - Reopening waits for native media, tracked MessageLogger modals, and logger user popouts. This includes media opened from normal Discord messages, but no other Discord panel.
  - A transition token cancels stale rapid reopens; no global modal or layer clearing is used.
- The standalone warning-colored Debug group keeps console and routed diagnostics independently opt-in. `reportDebugEvent` accepts automatic-backup lifecycle events plus edit-spam counters and cooldown events, and sends UI feedback through `notifyUser`.
- `reportSettingState` keeps console detail and routed alerts aligned.
- `reportMajorSettingChange` covers only broad logging, persistence, media, update, and destructive settings. Enabled states are info; disabled states use the theme-neutral presentation.
- Per-setting replacement keys discard obsolete alerts after rapid changes.
- Logging scope combines whitelist, blacklist, muted server/channel, NSFW, selected-channel, and DM rules.
- Author and local-action gates are intentionally separate: bot, blocked-user, self-author, local-edit, and local-delete rules must remain per message.
- Guild and DM notification lists affect alerts rather than record eligibility.

## 🗃️ Record Model and Indexes

- `messageRecord` is the source of truth keyed by Discord message ID.
- `deletedMessageRecord`, `editedMessageRecord`, `purgedMessageRecord`, and fork-specific `nukedMessageRecord` are mutually exclusive channel-to-ID base indexes. Edit stacks, ghost-ping state, hidden state, metadata, and media remain on the shared canonical record.
- Display precedence is `Hidden > Nuked > Ghost Pings > Purged > Deleted > Edited`. Hidden and Ghost Pings are visibility overlays; Nuked permanently overrides Ghost Pings.
- Matching `*MessageSet` maps mirror those indexes for fast membership checks.
- `suppressedForumThreadIds` prevents intentionally hidden or removed restored roots from reappearing.
- `_getDataPayload`, `installDataPayload`, and `sanitizeDataPayload` define the persisted/runtime boundary and rebuild derived sets and sorted caches.

## 💾 Persistence and No-Save Recovery

- `saveData` batches ordinary writes; `handleDataSaving` creates the current payload and schedules optional backups using the validated 10-to-86,400-second interval (20 seconds by default). `queueAutoBackup` owns timer creation and reports its delay through the optional debug router.
- `efficientlySaveData` writes complete JSON to a same-directory temporary file and atomically renames it over the destination. Its commit predicate prevents stale in-flight writes from renaming after saving is disabled.
- `cleanUpStaleDataTempFiles` removes only old logger-owned temp files.
- With `dontSaveData` enabled alone, persisted history is read directly from current disk bytes, normalized in memory, and installed for viewing while ordinary additions and backup writes remain blocked. Full-record, edit-history, cap, clear-log, and forum/thread removals use the existing deletion-only journal without serializing `_getDataPayload`; direct startup reads prevent a stale BetterDiscord cache from resurrecting those removals.
- `dontLoadArchivedData` is a stored child preference whose runtime effect is `dontSaveData && dontLoadArchivedData`. At startup that state skips archive reads. At runtime it builds a session overlay, installs only changed/new records and temporary suppression state, and releases unchanged archive records, indexes, opaque extensions, archive-only saved-user fallbacks, and BetterDiscord's retained primary/backup data objects.
- Hot reattachment directly validates disk and applies a three-way overlay in memory without writing: session changes win where they differ from the detach baseline, while unrelated newer disk fields, edits, media, and categories survive. Re-enabling saving applies the same delta, category replacements, removal tombstones, and suppression changes before the normal capped atomic primary/backup transaction. Failure or lifecycle cancellation restores the detached session, keeps saving disabled, and leaves the previous archive intact.
- The archive deletion journal and cached-file cleanup are gated off while the archive is detached. Reload or plugin disable discards the temporary overlay and never writes it unless saving is explicitly re-enabled.
- `loadPersistedDataForNoSaveMerge` reads files directly because BetterDiscord's data API can return a cached payload after direct atomic writes.
- `mlv2RemakeSchemaVersion` marks this fork's additive canonical payload without replacing the standard four logger maps.
  - Current forks can ignore the marker and enhanced fields; their absence after another fork writes the file triggers normalization on the next load.
  - A newer schema is never rewritten automatically. Unknown top-level fork extensions are retained.
- Forum/thread metadata, saved locations, suppression lists, and locked cache-setting keys are optional compatibility additions.
  - Older forks without them remain valid.
  - Legacy `deletedata` and `editHistory` values merge into `delete_data` and `edit_history`; missing enhanced values receive safe empty defaults.
- `prepareDataPayloadForNormalization` fills only reconstructable derived collections and refuses to invent a missing core `messageRecord`.
  - `normalizePersistedDataPayload` normalizes records, re-keys mismatched IDs, de-duplicates edit/cache identities, rebuilds canonical channel indexes, and performs final validation.
  - `migrateAntiNukeCategoryRecords` removes marked Anti-Nuke IDs from Deleted/Purged and rebuilds the additive Nuked index. The marker can reconstruct the index after a round trip through another fork.
- A detected legacy/mixed payload is installed only after normalization succeeds, then `rewriteCanonicalDataPayload` atomically replaces the entire primary file. The old backup is deliberately retained until a later normal backup, and progress/failure uses the configured notification router.
- `selectStartupDataPayload` distinguishes a missing primary from a fresh empty payload and restores a valid backup even when automatic backup writing is disabled.
  - Backup restoration is separate from legacy migration so console and routed messages describe rebuilding the primary accurately.
  - `readDataPayloadFile` applies the same normalization to no-save recovery sources.
- A higher `mlv2RemakeSchemaVersion` is an incompatible state rather than corruption: startup and no-save recovery stop before falling back or writing. Opaque extension conflicts use a persisted-wins recursive merge because the temporary no-save session does not own another fork's disk state.
- `mergeSavedRecords` combines same-ID records field-by-field: newer session message fields, unioned edit history and media IDs, preserved delete/forum metadata, and hidden state that cannot be silently cleared by a collision.
- `mergeDataPayloads` handles ordinary no-save union recovery. `buildNoSaveSessionOverlay` and `applyNoSaveSessionOverlay` preserve exact detached-session record/category/removal state. `applySavedMessagesCapToPayload` caps either recovered result before persistence and cascades removed forum/thread roots to children.
- Recovery cap cleanup does not delete local media while the transaction can still fail; a harmless orphaned cache file is safer than irreversible pre-commit deletion.
- `mergeNoSaveSessionIntoPersistedData` is a transaction ordered as load, validate, merge, cap, install, primary write, then backup. Primary failure keeps saving disabled and leaves both files untouched.
- `requestDataSaveModeChange` serializes the save-mode transition. A generation-owned primary flush and active deferred-media map keep the control disabled until the primary callback and every queued media request settle; stale callbacks cannot unlock a newer operation. Primary recovery gets three attempts inside a 30-second transition bound. A final write failure or timeout fails closed and arms `_discardNoSaveSessionOnResume`; the next resume skips persistence, discards temporary state/media, reloads the last valid archive, and returns to normal saving.
- `requestArchiveLoadModeChange` serializes archive attach/detach. Successful swaps retain a short bounded presentation-settle lock so Discord's message, forum/thread, logger, tint, modal, and context-menu surfaces cannot overlap a second swap.
- `cancelPendingDataWrites` clears queued timers and increments a write epoch. Async writers check that epoch before rename.
- Recovery failures always log detailed stage, path, cause, and state information, then route a concise alert through `notifyUser` so the selected native-notification/custom-toast mode is respected.

## 📡 Discord Event Capture

- `patchMessages` and `onDispatchEvent` intercept Discord Flux message and channel events.
- Create, update, single-delete, and bulk-delete paths update the record model and category indexes before scheduling persistence.
- Thread-created system messages are intentionally excluded from logger interception so Discord retains native delete behavior.
- Local-delete tracking distinguishes actions initiated by this client from remote deletions of locally authored messages.

## 🧵 Forum Posts and Channel Threads

- Forum/thread metadata snapshots preserve parent IDs, names, types, paths, starter IDs, and card information after live Discord objects disappear.
- Complete root deletion stores one logical root plus eligible replies under the thread ID; root hide/unhide/remove actions cascade through `getForumThreadRecordIds`.
- Forum posts are naturally self-keyed. If a channel thread has a distinct starter-message ID, its initial payload is folded into the thread root: the title stays in `forum_metadata`, the root message carries the starter body/author/media/edits, and the original starter ID remains in metadata for cache lookup. Replies remain separate records.
- Restored forum cards, channel sidebar entries, and thread-browser entries require a live Discord item as a DOM/React layout anchor. Their saved preview text is passed through the logger's native markup parser so mentions render without parsing the separately generated author and deletion labels.
- Thread-scoped logger views, context labels, jump routing, tinting, and suppression must continue distinguishing forum posts from ordinary channel threads.

## 🛡️ Anti-Nuke Recovery

- Channel deletion capture stores bounded snapshots under the fork-specific Nuked index; Purged remains reserved for ordinary bulk deletes.
- Thread/forum-root, total-message, and attachment caps are separate and apply newest-first.
- Channel-thread snapshots use the same folded starter/root schema as ordinary thread deletion; Anti-Nuke adds archival markers without changing the captured thread metadata or reply boundaries.
- Root records bypass the total-message budget but their attachments still consume the attachment budget.
- Anti-Nuke intentionally overrides normal logging scope and author ignores; only its own enable switch disables the cascade.
- The Nuked tab is conditional on that switch. Disabling it hides the view only; records and Hidden-tab state remain persisted.
- Parent channels no longer exist, so Anti-Nuke records do not offer impossible jump actions.

## 🖼️ Media Lifecycle

- Core message-history caching and the hierarchical server/channel cache layout remain enabled for forum/thread reliability.
- `cacheMessageImages` and `cacheImage` handle attachments, embed images, stickers, file-type policy, custom paths, and size limits.
- `cacheImage` is the only new-media filesystem writer. During no-save mode, eligible logger-media parameters are de-duplicated in memory; the queue drains only after a successful primary archive commit. Active requests remain tracked through three bounded fetch attempts and retry delays. A terminal media-only failure is reported and drops that item without invalidating the saved archive or otherwise-valid session. Reload, stop, or disabling media caching aborts and discards the queue.
- A monotonic media-write generation invalidates pre-disable, retrying, and in-flight work across rapid off/on changes and same-instance restarts. No-save startup also avoids creating an absent default cache directory, and stale work is never promoted into the later queue.
- This write guard does not block intentional deletion of media belonging to a loaded archived record. That cleanup remains part of the deletion-only journal and becomes unavailable only while the archive is detached.
- Legacy flat-cache paths remain readable even though new files use hierarchical paths.
- Cache-only rendering replaces unavailable remote media with manageable filename placeholders.
- Optional cached-file deletion is record-aware and must never scan or delete outside configured cache roots.

## 🎨 Rendering, Tinting, and Navigation

- Message-content and message-component patches render saved edits and deletions in live chat.
- Deleted text/background tinting, forum cards, restored thread entries, and logger views share saved record state but use different mounted DOM targets.
- Discord-rendered saved deletions retain Discord's native context-menu confirmation and Shift-Trash behavior.
  - The final `MessageActions.deleteMessage` becomes local logger **Delete** only when message ID, channel ID, `delete_data`, and deleted/purged indexes all match. Normal and edit-only Discord messages keep Discord's original action.
  - Local interception returns a completed Promise so Discord dismisses its confirmation without calling the server-delete endpoint, including after hot reloads.
  - If permissions hide native Delete or Trash, the logger adds a red local-only equivalent only for that exact indexed saved deletion. Neither fallback calls Discord's server-delete path.
- Hand-built forum/thread clones and logger rows use `data-ml2-*` ownership markers and logger-owned Delete controls because they have no Discord React action toolbar.
  - The logger copies an observed Delete action when available. Otherwise it combines a current native toolbar button with Discord's Trash icon; ambiguous icon exports are rejected.
  - Logger controls retain neither Discord's live callback nor message props. Their host, SVG, and paths use `--text-feedback-critical` with `--status-danger` fallback.
  - Permission fallbacks mount in the lowest shared action row. An early outer fallback is rebuilt there rather than moved, protecting its React icon root.
  - A root marker shows Trash only while Shift is held. Direct right-click **Delete** confirms; Shift-click and the injected logger submenu's explicit **Delete** remove immediately. A Shift-only `mousedown` guard prevents text selection.
  - Nested mutations resolve to their closest toolbar so native Trash replaces a fallback instead of duplicating it. Both paths share the same record/index/media/UI cleanup helper.
- Sorted ID caches accelerate logger rendering and must be invalidated when category indexes change.
- Jump uses live message routes when available, restored forum/thread parents as fallback, and is absent when no destination exists.
- Logger rows use the same gate for non-interactive double-clicks and tint only jumpable usernames with Discord's warning color.
- Links, media, and controls retain native actions. Blank attachment-wrapper space remains row navigation; a second-mousedown guard prevents selection only for a valid row jump.

## 🖱️ Logger UI and Record Actions

- The logger window provides deleted, edited, purged, sent, ghost-ping, and optional Hidden tabs.
- Filters support server, channel, user, content/message, and media predicates.
- The all-logs shortcut clears stale filters; channel and server shortcuts resolve their location at invocation time.
- The server shortcut treats DMs and group DMs as having no server, even if Discord retains stale guild state.
- Matching views close. Different or stale views close and reopen with the requested filter. Empty recorder arrays disable their shortcut.
- Hide/unhide changes visibility without deleting records; red Delete actions and Clear Log permanently update records, indexes, restored entries, and optional cached files.
- Context-menu injections expose scope lists and record actions while preserving Discord and other plugins' native items.

## 🔔 Notifications

- `_showNotification` is the single low-level routing point between BetterDiscord native notifications and the plugin's custom toasts. `_showCustomToast` is an internal renderer and is called only by this router.
- `notifyUser` is the system/UI feedback entry point used by settings, Debug, Hide/Unhide, validation, startup, migration, merge, recovery, and action results. It defaults to wall-clock expiry with whole-card left/right-click dismissal.
- `_notifyEvent` sends actual saved-message events directly through `_showNotification`, preserving eligible View/Jump actions and hover-aware timing.
- Custom toast colors use Discord CSS variables. The plugin-owned `neutral` state becomes a theme-grey custom toast or a supported native `info` notification with a neutral icon, because BetterDiscord exposes no grey notification type.
- System/UI alerts use wall-clock expiry rather than hover pause; custom alerts dismiss through their own handlers.
- Native system/UI alerts use a unique content marker for whole-card left/right-click dismissal and a visible progress animation after BetterDiscord mounts the card. The wall-clock timer remains the fallback.
- Native notifications use a memory-only FIFO queue with hover-aware yielding; queue state is never persisted.
- A separate runtime-only ID ledger gives delete-family events one shared identity across single, thread/forum, and bulk paths, and protects sent-message alerts after ordinary cache eviction. Only IDs that actually produced an alert are claimed.
- Edit-spam blocking is opt-in and tracks each author independently. `editSpamThreshold` defaults to `10`, accepts whole numbers from `1`, and falls back to `10` for invalid runtime or persisted values. Changing the threshold or toggling the blocker clears every author's rolling count and active cooldown; a runtime settings signature provides the same guard outside the settings callback. Threshold changes and disabling the blocker route one replaceable info notice through the shared settings-feedback path only when a live count or cooldown was actually cleared, while enabling resets silently. Reaching the configured count within 60 seconds replaces that edit alert with one warning and starts a fixed 60-second notification cooldown without changing edit persistence or Ghost Ping detection. Each active cooldown owns warning/reset timers that are cancelled on settings resets and plugin unload. Optional debug output reports the username-based `current/threshold` count, cooldown start, 10-second warning, final reset, and early settings reset without exposing user IDs. The warning opts into wall-clock expiry and whole-card left/right-click dismissal in both notification modes.
- Guild and DM event settings, local-user rules, active-location overrides, and notification lists are evaluated separately from logging eligibility.

## 🧪 Testing and Change Safety

- `tests/helpers/plugin-harness.js` loads the real exported class with narrow BetterDiscord mocks.
- Persistence, merge, policy, records, media, Anti-Nuke, and source contracts have focused Node tests; `docs/tests.md` is the authoritative matrix.
- Run `npm test` before and after behavior changes and `git diff --check` before deployment.
- Discord Webpack, Flux, DOM, and mount behavior still require the relevant live `RT-*` checks. Use disposable profiles or copied data for destructive persistence tests.
- Keep multi-instance storage isolation separate: atomic replacement prevents partial files but does not eliminate last-complete-writer-wins between simultaneous Discord instances.
