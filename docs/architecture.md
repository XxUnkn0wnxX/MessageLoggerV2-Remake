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
  - Toggling compares the requested filter with the actual logger state: matching views close. The all-log shortcut clears an open filtered Logger in place; channel/server switches retain their close-and-reopen transition.
  - Reopening waits for native media, tracked MessageLogger modals, and logger user popouts. This includes media opened from normal Discord messages, but no other Discord panel.
  - A transition token cancels stale rapid reopens; no global modal or layer clearing is used.
- The standalone warning-colored Debug group keeps console and routed diagnostics linked by the console master switch. `reportDebugEvent` labels backup, edit, channel, network, and render events; viewport activity uses `DEBUG HYDRATE` for numbered batches with per-entry outcomes, current-viewport/background labels and queue progress, plus grouped retained reuse and rebuild reasons, plus deduplicated failure notices. The existing Debug master controls console output. Successful hydration summaries are console-only; hydration toasts report failures only and honor the toast-child setting and per-reason deduplication. No new setting is added.
- `reportSettingState` keeps console detail and routed alerts aligned.
- `reportMajorSettingChange` covers only broad logging, persistence, media, update, and destructive settings. Enabled states are info; disabled states use the theme-neutral presentation.
- Per-setting replacement keys discard obsolete alerts after rapid changes.
- Logging scope combines whitelist, blacklist, muted server/channel, NSFW, selected-channel, and DM rules.
- `showLocationListManagerModal` exposes those persisted logging and notification lists without adding entries. Resolution prefers live guild/channel stores, preserves unresolved IDs, groups live channels and threads under their server, and routes clickable rows through the same guarded modal-close/history navigation path. Current-list removal and remove-from-all remain separate actions.
- Author and local-action gates are intentionally separate: the bot gate recognizes bot authors plus webhook, application, and interaction markers; blocked-user, self-author, local-edit, and local-delete rules remain per message.
- Components V2 is a supported payload format, not an author classifier. Any message carrying Discord's Ephemeral flag bit is excluded before caching or capture, even when Components V2 or other flags are also set.
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
- Forum/thread metadata, saved locations, suppression lists, locked cache-setting keys, and canonical webhook/application/interaction fields are optional compatibility additions.
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
- Anti-Nuke intentionally overrides normal logging scope and unrelated author ignores. Ordinary ignores do not apply to adopted or captured channel-deletion snapshots, while ephemeral messages are always excluded.
- The Nuked tab is conditional on that switch. Disabling it hides the view only; records and Hidden-tab state remain persisted.
- Parent channels no longer exist, so Anti-Nuke records do not offer impossible jump actions.

## 🖼️ Media Lifecycle

- Core message-history caching and the hierarchical server/channel cache layout remain enabled for forum/thread reliability.
- `cacheMessageImages` and `cacheImage` handle attachments, embed images, Components V2 thumbnails/media galleries, stickers, file-type policy, custom paths, and size limits. In 2.8.2.13, `newSaveAllFileTypes` expresses the intended arbitrary-file eligibility but does not enforce the complete live logging/cache gate reliably: non-image files may stay remote when On or remain Logger references when Off. The established image, embed, sticker, and visual Components V2 path remains supported. Unresolved `attachment://` references are not fetched independently.
- An upload removed through Discord's message-edit attachment action is retained as optional record-level `removed_attachments` metadata. It remains absent from the current `message.attachments` used by native restored chat, while the Logger viewer, `has:image`, no-save merge, and cached-file cleanup can still use it. This path never snapshots disappearing embeds or Components V2, so Discord-generated link previews remain current-state only.
- With media enabled, edit-history inline markers for removed uploads use existing renderers under the selected CDN/proxy/local or local-only source policy only when they match the exact marker URL (query/hash-insensitive) or the marker's embedded attachment ID. Images/videos use the bounded preview; audio and other supported files reuse Logger's native player/file-card adapters. Exhausted, hidden or unmatched markers retain their existing text fallback. Inline thumbnails are bounded to 400 × 350 without changing viewer dimensions. Logger also uses existing audio and document/file-card renderers for removed uploads under that policy. Recognized markers represented by an admitted preview are filtered from temporary display strings only; canonical history is unchanged. Removed previews use the existing deleted-media tint convention: hovering the message row restores colour, while the existing edit-history dimming remains. Later whole-message deletion returns tint ownership to the normal deleted-row controls.
- Native audio/file cards in inline edit history sit outside the message-text markup and message-content element. Text keeps Discord's dynamic markup classes; cards retain their native formatting and are not exposed as message code blocks to text-only consumers. The original native message id/ref remains unique, edit tooltips and limits still apply, and current text keeps its original element. Logger-window layout is independent and unchanged.
- `cacheImage` is the only new-media filesystem writer. During no-save mode, eligible logger-media parameters are de-duplicated in memory; the queue drains only after a successful primary archive commit. Active requests remain tracked through three bounded fetch attempts and retry delays. A terminal media-only failure is reported and drops that item without invalidating the saved archive or otherwise-valid session. Reload, stop, or disabling media caching aborts and discards the queue.
- A monotonic media-write generation invalidates pre-disable, retrying, and in-flight work across rapid off/on changes and same-instance restarts. No-save startup also avoids creating an absent default cache directory, and stale work is never promoted into the later queue.
- This write guard does not block intentional deletion of media belonging to a loaded archived record. That cleanup remains part of the deletion-only journal and becomes unavailable only while the archive is detached.
- Legacy flat-cache paths remain readable even though new files use hierarchical paths.
- Cache-only rendering replaces unavailable remote media with manageable filename placeholders.
- Optional cached-file deletion is record-aware and must never scan or delete outside configured cache roots.

## 🎨 Rendering, Tinting, and Navigation

- Message-content and message-component patches render saved edits and deletions in live chat.
- Master media Off projects only detached rendering copies: attachments, stickers and complete embeds disappear, including their generated Logger references. Known Components V2 media leaves are omitted while text/control nodes remain; a section losing its thumbnail retains its Text Display children. Both snapshot aliases are projected independently, preserving forwarded text and wrapper metadata. Canonical archives and the media-On rendering path remain unchanged. Media-only edit snapshots have no generated wrapper or edited marker while Off. Either setting direction resets retained presentation, including text-only records; the existing viewport queue rebuilds visible content first. Component shapes follow the [Discord component reference](https://docs.discord.com/developers/components/reference#section).
- Presentation-only removal validates the canonical saved deletion and its index before ownership changes, then removes only present entries through the native immutable channel cache and notifies MessageStore listeners. It does not broadcast a server-deletion event. Surviving native-thread paths retain their existing ownership and transition handling. Ordinary attachment-error refreshes recache only successfully evicted channels; Logger-only fallback updates remain independent, and explicit media-setting changes retain their selected-channel refresh.
- Legacy/Components V2 and message-snapshot payloads use EmbedCopy's `toJS()`/`toJSON()` then JSON-clone contract. Embeds match EmbedCopy's raw-message path by serializing the live embed directly first, then falling back to `toJS()` and restoring Discord's inbound wire aliases such as `title`, `description`, and field `name`/`value`. Component-model camel aliases are supplemented with the corresponding API wire names before native reconstruction. Unknown serializable fields remain intact instead of being reduced to a fixed allow-list, including in nested embed collections.
- The Logger-owned viewer gives component-only records a concise text/control/media summary and includes that text in `message:`/`content:` search; its complete read-only Components V2 renderer remains tracked in `TODO.md`.
- Renderer clones canonicalize URL-only/proxy-only singular and gallery embed media and omit dimension-only image, thumbnail, video, or gallery entries. Discord currently calls `.url.split()` for singular and gallery images and dereferences the first gallery item, so invalid or empty media collections must never reach the native renderer. The canonical archive remains isolated from render-time mutations.
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
- Matching views close. With the Logger modal and menu open and no auxiliary surface, the all-log shortcut clears a nonempty filter and its input in place, cancels stale filter/reopen callbacks, and refreshes rows without replacing the modal or selected tab. Different channel/server views and stale or auxiliary states retain their close-and-reopen path. Empty recorder arrays disable their shortcut.
- Hide/unhide changes visibility without deleting records; red Delete actions and Clear Log permanently update records, indexes, restored entries, and optional cached files.
- Context-menu injections expose scope lists and record actions while preserving Discord and other plugins' native items.

### R7 — Viewport loading and session retention

Viewport loading and session retention are implemented for all available tabs, filters, and automatic batch states in the main Logger window, saved thread/forum log windows, and Logger additions within native channels, threads, forum conversations, cards and restored sidebar entries. Server sidebar rendering waits for the active guild and its native sidebar; a cold boot into DMs leaves those entries unbuilt until the server is visited. Entering the server admits its eligible forum cards, thread cards and deleted sidebar entries in bounded batches without viewport gating, once their existing native owning container is available; absent Discord views are not materialized. Message text and supported attachments share the viewport admission path, including DMs and group DMs. Only the open or jumped-to conversation admits new work; other conversations stay cold until visited. Native viewport and scroll-container geometry adjusts priority as the window resizes. Media-disabled and local-only cache-miss modes still hydrate text and history through this queue; their existing media gates produce file text instead of forbidden previews. It starts at most four jobs per frame and yields between jobs once eight milliseconds have elapsed; one expensive row can exceed that time budget. Currently visible work takes priority over admitted rows passed during scrolling. Passed rows remain queued and drain in the same small batches while their view is active; traversal uses only registered content within existing rendering limits. This avoids an initial backlog burst without unloading already mounted rows. Visible pending message content shows a stable, theme-aware “MLV2: Loading saved message” placeholder with animated dots and reduced-motion support. Forum/thread cards and sidebar entries appear directly when ready, with no loading label or animated dots; silent layout shells preserve positions and jump targets. This is an implementation description, not a measured speedup claim.

A non-clickable batch bar replaces manual **Load More** controls in Logger and saved thread/forum log windows. Approaching it admits the next configured render-cap batch on a frame, and a large viewport can fill progressively. The bar uses the active theme’s neutral background and bold warning-colour text for a persistent batch label, without message counts. Detailed hydration batches remain in debug logging; expensive rendering still follows the shared viewport queue. Closing, parking or replacing a view cancels its batch observer and pending admission. The zero-cap setting retains its existing unbatched behavior.

Bulk parking measures retained row heights before pausing media or detaching any row, avoiding repeated layout read/write interleaving. Formatted text roots successfully registered with the viewport manager use its explicit cleanup lifecycle instead of separate document-wide removal observers; unowned roots keep their existing removal cleanup. Rapid tab requests coalesce to the latest selection before old leases are parked and the new view is selected. A changed tab starts at the top with its configured initial batch, while previously loaded roots remain reusable. Clicking the active tab only jumps to the top and preserves its current rows and expanded batches.

Avatar selection in Logger rows is presentation-only: an available live user supplies the displayed avatar, while an unavailable user falls back to the saved snapshot. Rendering does not rewrite the saved author or invalidate the row.

The Logger session retains its owned DOM and React roots across scrolling, navigation, Logger tabs/filters, and closing/reopening Logger windows. A loaded row scrolling offscreen preserves existing player behavior. Navigating away, closing a view or removing a row from its filter parks that row, pauses media and defers display continuations until it is active again. Actual record or presentation changes invalidate only affected messages; hide/show resets the relevant retained presentation. Media-source fallback and local-cache completion invalidate the affected retained message without refiltering owned Logger or saved thread/forum lists, preserving scroll position and the expanded row count. Eager or stale views retain their legacy refresh path. Plugin stop/reload, relevant settings that rehydrate records, and Forget dispose retained roots. No user-facing setting toggle was added.

Native bridges preserve Discord's original text anchor/ref and message accessory envelope while the retained root owns saved history and content. Restored forum/thread-browser cards use same-tag shell swaps that preserve native ancestry. Other Discord chrome stays native. Existing source policy, acquisition/retries, schema, history, Pins, batch behavior, and rendering caps remain unchanged; retention does not introduce display-driven retries or hidden playback, and native ownership and canonical-source guards remain in force.

The new native DOM behavior still needs live Discord acceptance. The intermittent startup missing-history issue is deferred and is not fixed by R7. See the [R7 acceptance checklist](../DELETED-IMAGE-CACHE-RENDERING-CHECKLIST.md#r7--viewport-loading-and-session-retention).

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
