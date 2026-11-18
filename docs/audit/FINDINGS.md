# AWS Log Explorer — Technical Audit: Detailed Findings

Audit of version 0.1.89 (commit `254c569`), 2026-11-13 – 2026-11-14. Dashboard and priorities: [README.md](README.md).

All paths are repository-relative. Line numbers refer to commit `254c569`. Confidence levels: **Confirmed** (shown by a code trace or a measurement), **High confidence** (strong evidence, not reproduced), **Needs verification**.

---

## Audit coverage

| Area | Depth | Notes |
|---|---|---|
| `src/main/*` (all 19 files) | Full read, except `offline-adapter.ts` (targeted) | IPC, lifecycle, persistence, validation, job service, AWS/GCP adapters, sign-in, discovery |
| `src/preload/index.ts`, `src/renderer/index.html` | Full read | Bridge surface, CSP |
| `src/shared/contracts.ts` and small shared modules | Full read | Field-by-field comparison with `workspaceSchema` |
| `src/renderer/useLogJobs.ts`, `query-state.ts` | Full read | Query lifecycle, merge, ownership protocol |
| `src/renderer/App.tsx` | Lines 225-360 (load/save/close path) | Rest not reviewed |
| `src/renderer/workspace.ts` | Lines 1-780 (parsing/normalization) | Reducer (lines 780-3121) not reviewed |
| `src/renderer/components/LogViewer.tsx` | Lines 675-790 plus targeted greps | Table/virtualization internals not reviewed |
| `src/renderer/useExplorerResources.ts`, `ExplorerSidebar.tsx` | Targeted (refresh path) | |
| Other renderer components, workers, highlight/filter engines | Grep-level only (workers terminate; no `innerHTML`/`eval`) | **Not audited in depth**: tab/pane drag-and-drop, settings, time range picker, highlight engine, local filter worker |
| Tests | Measured (typecheck, full unit run), grep-level structure review | Playwright suite not run (launches the app) |
| Build/packaging/release | `package.json`, builder/vite configs, packaged `app.asar` contents, `.tmp/handoff-0.1.89.py` | No installer was run |
| Docs | `architecture.md` fully, `release.md` partially | Per-version notes not reviewed |

**Baseline:** `npx tsc --noEmit` exits 0. `npx vitest run` passes all 1258 tests in 155 files (8.5 s). No ESLint and no CI configuration exist.

**Process note:** background sub-reviewers were tried for the renderer and test areas, but they were cut off by usage limits and produced nothing. Every finding below comes from the lead auditor's own reading.

**Unexamined areas and how to finish them:** the `workspace.ts` reducer (tab/split/closed-history invariants), `WorkspaceTabs.tsx` and the drag/drop systems, `LogViewer.tsx` virtualization and copy/export, the highlight and local-filter workers (regex timeouts), `TimeRangePicker`/`time-range.ts` (DST and timezone math), and the Settings editors. A follow-up should read these files in full, using the evidence standard of this document. *Done in the follow-up below.*

### Follow-up coverage (version 0.1.106, 2026-11-17)

Line numbers in this section and in AUD-020 refer to the 0.1.106 working tree.

| Area | Depth | Result |
|---|---|---|
| Workspace reducer (`src/shared/workspace-reducer.ts`, 2,248 lines after the AUD-009 split) | Measured: a new seeded fuzz test (`tests/workspace-fuzz.test.ts`) drives 31 action kinds, including every drag/drop, split, detach, swap, merge and source-move action, and checks 15 invariants after each step. The invariants include schema validity, no view in two panes or splits, no dangling pane or split references, consistent layouts and active panes, and an unchanged tab strip and active entry after a save-and-reload round trip. A 400-run sample reached 8 combined splits, 11 panes and 34 views. | No violation. The earlier random test covered 11 actions and only schema validity. |
| Tab/pane drag-and-drop (`WorkspaceTabs.tsx`, `PaneLayout.tsx`, `useColumnHeaderDrag.ts`, `tab-insertion.ts`, `resource-drag.ts`) | Targeted read of drag start/end/cancel, pointer capture, Escape and listener cleanup | No finding. Drags release capture and state on drop, cancel and Escape. Escape reaches dnd-kit before other surfaces. Files dropped from outside cannot navigate (`will-navigate` is prevented). |
| `LogViewer.tsx` copy/export and virtualization caches | Targeted: export path end to end (`LogViewer.tsx:1150-1175`, `log-data.ts:574-623`, `index.ts:427-442`), copy limits, and growth of the per-event caches | **AUD-020.** Caches are bounded: the deserialization projections use a `WeakMap`, and the highlight cache is capped at 10,000 entries / 32 MB. |
| Highlight and local-filter workers (`highlight.worker.ts`, `local-filter.worker.ts`, `group-regex*.ts`, `useLocalFilter.ts`, `useEventHighlights.ts`, `highlight-engine.ts`) | Full read of the workers and their hooks; targeted read of the engine | No finding. Every user regex runs in a terminable worker with a 2 s start and 500 ms per-batch limit. Pattern, message and batch sizes are capped. Zero-width matches advance by code point. |
| Time-range / DST math (`time-range.ts`, `query-state.ts:52-138`, `TimeRangePicker.tsx`, `RangeCalendar.tsx`) | Full read of the math; targeted read of the UI | No finding. Nonexistent local DST times are rejected rather than rolled forward. An unchanged bound keeps its original offset in a repeated hour. Relative ranges are fixed durations. Calendar arithmetic is done in UTC on date strings. |
| Settings editors (`Settings.tsx`, `PreferencesEditor.tsx`, `ShortcutsEditor.tsx`, `ProfileConnectionsEditor.tsx`, `RelativeTimeTemplatesEditor.tsx`, `HighlightItemDetails.tsx`) | Targeted: editor bounds compared with `workspaceSchema` and the highlight schema | No finding. `preferences/update` re-parses and clamps every patch (`workspace-reducer.ts:815-829`), so an editor cannot store a value the save validation rejects. Highlight patterns are capped at 500 characters in the input, the schema and the engine, with a visible error. |
| Playwright desktop suite | Run in full | 470/470 with both themes (0.1.105); 377/377 in the default light-only mode (0.1.106, 3.6 min). |
| Installer | Not run | The NSIS installer is per-user and assisted. Running it adds Start-menu, desktop-shortcut and uninstall entries, and its running-app check can close an open copy of the app, so it waits for the owner's approval. |

---

## Findings

### AUD-001: An unreadable workspace file is silently overwritten by an automatic save

**Metadata**
- Severity: High
- Category: Data integrity
- Confidence: Confirmed (code trace)
- Effort: S
- Files: `src/main/persistence.ts`, `src/main/workspace-input.ts`, `src/renderer/App.tsx`

**Problem**

`WorkspaceStore.load()` validates `workspace.json` and then `workspace.backup.json`. If both fail, it returns `{ workspace: null, warning: "...Starting a fresh workspace; existing files are retained until you save." }` (`persistence.ts:45-49`). The renderer then marks itself ready even though no workspace was restored (`App.tsx:282-287`). The autosave effect (`App.tsx:310-322`) saves the default workspace 400 ms later, with no user action.

`save()` (`persistence.ts:53-81`) then behaves as follows:
- It finds the previous file invalid, so `validPrevious` is false and no backup is taken.
- It renames the new file over `workspace.json`.
- On the next save, it copies that fresh file over `workspace.backup.json`.

After two autosaves, both original files are gone. The warning text is therefore false.

**Evidence**
- Strict validation runs first: `workspace-input.ts:42` calls `workspaceData.parse(value)` before the lenient `restoreWorkspace(value)` normalizer (line 45). A single out-of-range or unknown-enum field rejects the whole file, even though `restoreWorkspace`/`parseTab`/`parseView` (`src/renderer/workspace.ts:232-479`) are written to clamp and repair exactly such values.
- The `.catch` branch at `App.tsx:296-305` also sets `ready`. If loading rejects for any reason (for example an IPC error), the default workspace is saved over a possibly valid file.

**Impact**

Plausible triggers:
- Downgrading to an older build after a newer one wrote a new enum value (for example a new `filterMode`).
- Tightening a schema in a future release.
- A manual edit.
- Partial disk corruption of both files.

In each case the user loses every tab, favorite, saved query, highlight profile and setting without warning.

**Root cause**

Validation is all-or-nothing and runs before normalization. The "do not overwrite until the user saves" promise is not implemented: autosave cannot tell a fresh workspace from a recovered one.

**Recommended solution**
1. In `WorkspaceStore.load()`, when the primary file fails to parse, copy it to `workspace.corrupt-<UTC timestamp>.json` before returning. Do the same for the backup. Never delete these files automatically.
2. In `parseWorkspaceInput`, run the lenient `restoreWorkspace` first, then strict `workspaceSchema.parse` on its output. Keep the strict pre-check only for structural garbage (not an object, wrong version, size).
3. Return a `recovered: "fresh" | "backup"` flag. When it is `fresh`, the renderer's notification should tell the user where the quarantined file is.
4. In `App.tsx`, do not set `ready` (and so do not enable autosave) on the load-failure `.catch` path. Show a blocking error with a Retry action instead.

**Implementation considerations**
- Step 2 changes behaviour for files that are slightly invalid today: they will be repaired instead of rejected. This is the intended effect.
- Keep the 5 MB size limit before parsing.
- Move `restoreWorkspace` out of `src/renderer` (see AUD-008).

**Verification**
- Unit test: write an invalid `workspace.json` and backup, call `load()`, then `save()` twice, and assert that the quarantined copies still exist with their original bytes.
- Unit test: a file with one unknown `filterMode` value loads with that field normalized.
- Desktop test: launch with a corrupt workspace and assert a corrupt copy exists after 1 s.

---

### AUD-002: Every open view runs a query at startup; more than 32 views fail, and the visible view waits behind hidden ones

**Metadata**
- Severity: High
- Category: Reliability / Performance
- Confidence: High confidence (code trace; not reproduced in the app)
- Effort: M
- Files: `src/renderer/useLogJobs.ts`, `src/main/log-service.ts`

**Problem**

After `ready`, the effect at `useLogJobs.ts:688-696` calls `run(tab)` for every tab in `workspace.tabs`, whether visible or not. The same happens when AWS access is enabled (`useLogJobs.ts:810-825`).

On the main side, `schedule()` rejects new work once 32 jobs exist (`log-service.ts:243-246`): "Too many active operations…". Query execution is limited to 4 concurrent jobs by a FIFO `Semaphore(4)` (`log-service.ts:125`, `aws-adapter.ts:106-147`). GCP requests share a 48-requests-per-minute-per-project gate (`gcp-request-gate.ts:3`).

**Impact**
- A workspace with more than 32 views (the schema allows 100) starts with errors on the extra views.
- The view the user is looking at can wait behind dozens of hidden queries.
- Startup cost (AWS API calls, GCP quota, memory for up to `maxEvents` events per view, default 10 000 and maximum 100 000) grows linearly with views the user may never open.
- Pinned/background views multiply CloudWatch `FilterLogEvents` usage and cost.

**Root cause**

Auto-run is driven by "tab exists" rather than "tab is shown". The main-process limit is a hard rejection rather than back-pressure.

**Recommended solution**
- Auto-run only tabs that are displayed in a pane (`isVisible`, which already exists at `useLogJobs.ts:77-81`).
- Mark hidden tabs "stale" and run them on first activation. The live-tail path already does this through `sleepingLive`; reuse the pattern for historical queries.
- In `log-service.ts`, queue jobs beyond the active limit instead of throwing, or raise the limit to the 100-view budget. Cancellation already removes queued jobs because `Semaphore.acquire` honours the abort signal.

**Implementation considerations**
- Tabs moved into view must trigger a run once.
- Retained-history logic (`recentHistory`) must not double-run.
- `tests/use-log-jobs.test.tsx` covers the current eager behaviour and will need updating.

**Verification**
- Unit test: a workspace with 40 tabs and 1 visible pane triggers exactly 1 `window.explorer.query` call at startup.
- Selecting another tab triggers its query.
- Main-process test: 40 scheduled jobs all complete when slots free up.

---

### AUD-003: The leftover Insights cleanup machinery causes permanent false "query could not be stopped" warnings

**Metadata**
- Severity: Medium
- Category: Reliability / Dead design
- Confidence: High confidence (trigger traced; not reproduced)
- Effort: S
- Files: `src/main/log-service.ts`, `src/main/index.ts`, `src/main/gcp-adapter.ts`, `src/main/gcloud-auth.ts`, `src/renderer/components/Settings.tsx`

**Problem**

When a cancelled job ends with an error whose `name` is not `AbortError`, `log-service.ts:305-310` stores `job.cleanupError`. `cancel()` then records it in `cleanupFailures` (lines 227-233). That map and `additionalCleanupFailures` are never cleared. Every later `shutdown()` therefore throws an `AggregateError` (lines 375-400).

The machinery existed to report Insights queries that `StopQuery` failed to stop. Insights execution has been removed: `validateQuery` rejects anything except `events` (lines 62-63). Events and Live jobs have no server-side state to clean up.

**Evidence of the trigger**

`gcloudAuth.token()` rejects with a plain `Error` (`gcloud-auth.ts:77-80`) and is awaited inside the GCP `post` without abort awareness (`gcp-adapter.ts:19, 33`). A cancel while the gcloud CLI is running, followed by a CLI failure, records a "cleanup failure". `fetch` network errors after abort can also surface as `TypeError`.

**Impact**
- **Window close and quit:** every later close/quit shows the warning dialog "A CloudWatch query could not be stopped… may continue running in AWS" (`index.ts:155-169`). The user has to choose "Close anyway" for the rest of the session. The text is false.
- **AWS toggle:** `explorer:enable-aws(false)` rejects (`aws-access-toggle.ts:13`), and Settings shows an error (`Settings.tsx:165-175`).

**Root cause**

Error handling designed for a removed feature was kept. It treats any non-abort error after cancellation as an unconfirmed server-side job.

**Recommended solution**
- Remove `cleanupError`, `cleanupFailures`, `additionalCleanupFailures` and the `confirmShutdownFailure` dialog.
- Treat any error from a cancelled Events/Live job as cancellation.
- Make `shutdown()` throw only for adapter `destroy()` failures, and only for that shutdown call.
- Update the `close-coordinator.ts` callbacks accordingly.

**Verification**
- Unit test: cancel a job whose adapter then rejects with `new Error("x")`; then `shutdown()` resolves.
- Two consecutive `shutdown()` calls never throw because of earlier sessions' jobs.

---

### AUD-004: The Explorer Refresh button returns cached results for up to 60 seconds

**Metadata**
- Severity: Medium
- Category: Correctness
- Confidence: Confirmed (code trace)
- Effort: S
- Files: `src/main/log-service.ts`, `src/renderer/components/ExplorerSidebar.tsx`, `src/renderer/useExplorerResources.ts`, `src/preload/index.ts`

**Problem**

"Refresh selected region" (`ExplorerSidebar.tsx:385-401`) calls `resources.loadGroups(id)`. That calls `window.explorer.listGroups(connection, search, cursor)` (`useExplorerResources.ts:174, 225`). Main's `metadata()` returns a cached page if one is younger than 60 s (`log-service.ts:174-176, 193-196`). The IPC has no cache-bypass parameter (`preload/index.ts:26-29`), and stream listing works the same way.

**Impact**

A user who creates a log group, or waits for a new stream, and presses Refresh sees the old list with no indication that it is stale. The same applies after `refreshKey` changes, unless the AWS-enable shutdown has cleared the cache.

**Recommended solution**
- Add `options?: { fresh?: boolean }` to `listGroups`/`listStreams` across `contracts.ts`, preload, `index.ts` and `log-service.ts`.
- When `fresh` is set, delete matching cache keys and skip `pending` de-duplication.
- Pass `fresh: true` from the Refresh button and from the first-page load after `refreshKey` changes.
- Paging with a cursor may keep using the cache.

**Verification**
- Unit test: `listGroups` twice within 60 s calls the adapter once; with `fresh: true` the second call reaches the adapter again.

---

### AUD-005: Event order is not reliably chronological for same-millisecond events and multi-source forward pages

**Metadata**
- Severity: Medium
- Category: Correctness
- Confidence: High confidence (code trace; not reproduced against real AWS)
- Effort: M
- Files: `src/renderer/query-state.ts`, `src/main/aws-adapter.ts`, `src/main/offline-adapter.ts`, `src/shared/log-order.ts`

**Problem**

There are two independent ordering defects.

1. **Same-millisecond ties on the "Recent" (`direction: "older"`) path.**
   - On this path, pages are produced newest-first (`aws-adapter.ts:525-526, 540`, `offline-adapter.ts:199`).
   - The renderer's `mergeEvents` sorts with `compareLogTime` only, which compares timestamp and sub-millisecond (`query-state.ts:33`, `log-order.ts:4-9`). Equal keys keep insertion order, so events sharing a millisecond stay in reverse order.
   - The forward path's id tiebreak (`aws-adapter.ts:630`) is also discarded by the renderer sort.
   - The viewer applies no other default order: `sorting` is empty unless `view.sort` is set (`LogViewer.tsx:771-775`).
2. **Single-connection, multi-source forward queries are not merged across sources.**
   - `aws-adapter.ts:571-656` fetches one page per source and sorts only that batch.
   - The next page from a source can contain timestamps earlier than events already shown from other sources.
   - `mergeEvents` re-sorts the whole buffer, so rows jump position as pages load, and the eviction boundary (`evictFrom: "oldest"`) can drop events that were just displayed.
   - The multi-connection path (`multi-source-events.ts`) does a correct k-way merge; the two implementations differ.
   - `truncated: unique.length > request.limit` (`aws-adapter.ts:651`) can never be true, because the per-source quotas sum to `limit`.

**Impact**
- Multi-line application logs (stack traces) emitted within one millisecond read upside-down in the default view.
- In multi-group views, rows reorder under the user while paging, and context navigation can land on the wrong neighbour.

**Root cause**

Ordering is decided in three places (adapter, multi-source merge, renderer merge) with different tie-break rules.

**Recommended solution**
- Define one total order in `src/shared/log-order.ts`: timestamp, then sub-millisecond, then a stable per-source sequence (service order within a page), then `id`. Use it everywhere.
- Have adapters attach a monotonic `sequence` (ingestion order) per page.
- Route single-connection multi-source forward queries through `multi-source-events.ts` (`log-service.ts:282` already does this for `older`/GCP) and delete the per-adapter quota merge.

**Verification**
- Unit test: an `older` query returning three events with an identical timestamp shows them in service ascending order after `mergeEvents`.
- Unit test: two sources with interleaved timestamps across pages produce a non-decreasing sequence across page boundaries.

---

### AUD-006: Query continuations are fragile: 16-entry global cap, deleted on any error or cancel, early expiry

**Metadata**
- Severity: Medium
- Category: Reliability
- Confidence: High confidence (code trace)
- Effort: M
- Files: `src/main/multi-source-events.ts`, `src/main/aws-adapter.ts`, `src/main/gcp-adapter.ts`

**Problem**
- **Process-wide cap of 16.** Multi-source continuations are capped at 16 for the whole process (`multi-source-events.ts:200-207`), while a workspace may hold 100 views. Opening a 17th multi-source view evicts the oldest view's continuation, and its "load more" then fails with "Continuation expired…".
- **Deleted on any failure.** Any throw, including cancellation and a single transient source error, deletes the continuation (`multi-source-events.ts:228-231`). The partitions' adapter cursors may already have advanced, so retry is impossible and the user must re-run from the start.
- **Early expiry.** Forward cursors expire after 15 minutes (`aws-adapter.ts:642`, `gcp-adapter.ts:85`, `multi-source-events.ts:210`), although CloudWatch tokens are valid for 24 hours (SDK documentation, `models_0.d.ts:4115`). A user who leaves a view for 15 minutes cannot load more.

**Impact**

"Load more" frequently fails in normal multi-view use, losing the user's position in a long scan.

**Recommended solution**
- Keep the cursor state in the renderer instead of main. The state is small: tokens plus a few unread head events. Return it opaquely, signed or hashed, so main stays stateless.
- Alternatively, if state stays in main:
  - Key it per view and size the cap at least to the view budget.
  - Restore the previous state on failure instead of deleting it.
  - Align expiry with the service token lifetime.

**Verification**
- Unit test: 20 multi-source queries, then continuing the first, succeeds.
- A cancelled continuation can be resumed with the same cursor.

---

### AUD-007: The cloud-provider abstraction is nominal; GCP bypasses the job service and duplicates its infrastructure

**Metadata**
- Severity: Medium
- Category: Architecture
- Confidence: Confirmed (structure)
- Effort: L
- Files: `src/main/index.ts`, `src/main/log-service.ts`, `src/main/gcp-adapter.ts`, `src/main/gcp-explorer.ts`, `src/main/gcp-sources.ts`, `src/main/aws-adapter.ts`, `src/main/multi-source-events.ts`

**Problem**
- **Discovery.** `LogAdapter.listGroups/listStreams` throw for GCP (`gcp-adapter.ts:177-178`). GCP discovery is nine separate `gcp:*` IPC handlers (`index.ts:204-265`) that bypass `LogService`, and so get no metadata cache, no concurrency limit, no cancellation and no `stopping` gate. GKE workload discovery buffers up to 30 MB of `kubectl` JSON and parses it on the main thread (`gcp-sources.ts:143-162, 277`).
- **Two GCP HTTP clients with different behaviour.**
  - `gcp-adapter.ts` `post` refreshes the token once on 401 and retries 429/503 (lines 27-44).
  - `gcp-explorer.ts` `createGoogleRequest` (lines 93-128) does neither and cannot be cancelled.
  - The token cache TTL is a fixed 5 minutes (`gcloud-auth.ts:75`), whatever the token's real lifetime.
- **Provider-specific branches in the generic service.** `log-service.ts:282-296` contains `mode === "gcp"` branches, and `errorMessage` (lines 39-59) maps every error, GCP included, using AWS exception names.
- **Five event-ID schemes:**
  - `${group}:${eventId}` (`aws-adapter.ts:521, 615`)
  - `${session}:${seq}` (`aws-adapter.ts:737`)
  - SHA-256 of entry fields (`gcp-log-query.ts:50`)
  - `JSON.stringify([connectionId, id])` (`multi-source-events.ts:130`, `log-service.ts:294`)
  - the renderer dedup key `${logGroup}\0${logStream}\0${id}` (`query-state.ts:22`)

  The same event can therefore get different IDs depending on the query shape (single vs multi-source; GCP live with one vs several sources, `log-service.ts:293-295`). This undermines dedup and the "reveal originating event" features.
- **Adapter cap.** The adapter cache is capped at 32 with no eviction (`log-service.ts:152-155`). Its error message tells the user to "Close and reopen the workspace", an operation that does not exist.

**Impact**

Each new provider feature must be built twice. Behaviour differs between providers: retries, auth refresh, cancellation, and error text such as AWS-specific advice shown for GCP failures. ID-dependent features break in the less-tested query shapes.

**Recommended solution**
- Define a `CloudProvider` interface with `discover(kind, params, cursor, signal)`, `events`, `live` and `mapError`.
- Route all discovery through `LogService.metadata()`, gaining cache, limits and cancellation.
- Use one Google HTTP client, the `post` implementation generalised to GET.
- Mint IDs in exactly one place, `src/shared`: `connectionId` + provider-native event ID. Main is the only producer; the renderer never re-keys.
- Evict adapters with LRU on connection removal instead of capping.

**Implementation considerations**

Do this incrementally:
1. Unify event IDs, which also fixes dedup.
2. Merge the HTTP clients.
3. Move discovery behind `LogService`.

Saved views and closed history do not store event IDs, so there is no persisted-data migration.

**Verification**
- An existing event keeps the same ID in single-source, multi-source and live queries (property test).
- GCP discovery is cancelled on shutdown.

---

### AUD-008: Validation and normalization are split across processes and layers; main bundles renderer code

**Metadata**
- Severity: Medium
- Category: Architecture / Maintainability
- Confidence: Confirmed
- Effort: M
- Files: `src/main/workspace-input.ts`, `src/main/security.ts`, `src/shared/contracts.ts`, `src/renderer/workspace.ts`, `src/main/index.ts`, `src/main/persistence.ts`, `src/main/log-service.ts`

**Problem**
- **Layering.** `workspace-input.ts:6` imports `restoreWorkspace` from `../renderer/workspace` (3,121 lines). The main bundle contains renderer state code (`out/main/index.js` is 204 KB).
- **Drift.** The TypeScript types (`contracts.ts`) are hand-written, separately from the zod schemas (`security.ts`). A field-by-field comparison found no drift today, but nothing prevents it. `z.object` silently strips unknown keys, so a new `Workspace` field missing from the schema is dropped on every save without any error. `handle()` passes `any[]` to handlers (`index.ts:186-191`).
- **Repeated validation.** Each autosave (every change plus 400 ms, `App.tsx:310-322`) runs:
  1. `workspaceSchema.parse` (`index.ts:346-348`)
  2. `parseWorkspaceInput` = `workspaceData.parse` + `restoreWorkspace` + `workspaceSchema.parse` (`persistence.ts:54`)
  3. a re-read and full re-validation of the previous file from disk (`persistence.ts:68-70`)
  4. `copyFile`
  5. `writeFile(flush:true)` and `rename`

  The full workspace (up to 5 MB, 500 favorites, 100 views) is validated four times per save.
- **Duplicated query validation.** `validateQuery` (`log-service.ts:61-112`) duplicates `querySchema` with different limits, for example a request ID of at most 200 vs at most 160 characters.

**Impact**
- Future schema changes can lose user data silently (see AUD-001 for the related loss on load).
- CPU and disk I/O on every keystroke-driven change in large workspaces.
- Main-process bundles change whenever renderer UI state code changes.

**Recommended solution**
- Move `restoreWorkspace` and its parse helpers into `src/shared/workspace-schema.ts`.
- Derive types from zod (`z.infer`), or add a compile-time equality check between `Workspace` and `z.infer<typeof workspaceSchema>`.
- Use `.strict()` in development/test builds so unknown keys fail loudly.
- In `save()`, validate once. Replace "re-read and validate the previous file" with "previous file exists and was written by us", tracked in memory after the first successful load or save.
- Delete `validateQuery` checks already covered by `querySchema`.

**Verification**
- A type-level test fails when a field is added to `Workspace` but not to the schema.
- Benchmark: saving a 100-view workspace before and after.

---

### AUD-009: Central renderer modules are oversized and hold duplicated derived state checked by string comparison

**Metadata**
- Severity: Medium
- Category: Architecture / Maintainability
- Confidence: High confidence (partial review)
- Effort: XL
- Files: `src/renderer/workspace.ts` (3,121 lines), `components/LogViewer.tsx` (2,993), `components/WorkspaceTabs.tsx` (1,608), `App.tsx` (1,167), `src/main/security.ts`

**Problem**
- **Duplicated projection.** The persisted workspace stores both the source of truth for layouts (`splitTabs[].panes/layout/activePaneId`) and a projection of the active entry (`panes`, `layout`, `activePaneId`). The two must be kept equal by every reducer action. Main enforces this with `JSON.stringify` equality of the projection against the active split (`security.ts:439-455`), so a key-order difference produced by any reducer path rejects the save. That rejection appears only as a transient "Could not save changes" toast (`App.tsx:313-319`) and repeats on every change.
- **One giant reducer.** `workspace.ts` combines action types (about 50 action variants, lines 48-146), persistence parsing/migration (lines 171-780), ID allocation and the reducer in one module. `LogViewer.tsx` combines table and hybrid/JSON rendering, selection, copy/export, inspector and column editing.
- **Untyped extra channels.** `App.tsx:242-250` coordinates through window `CustomEvent`s (`explorer:open-time-range-settings`), a second, untyped message channel next to props and the reducer.

**Impact**
- Every feature touches the same three files, and regressions in tab/split invariants are only caught by desktop tests.
- The persisted projection makes file format, validation and reducer logic three copies of the same invariant.

**Recommended solution**
- Stop persisting `panes`/`layout`/`activePaneId`. Derive them from `activeTabId` + `splitTabs` (a single selector), and keep the migration for old files.
- Split `workspace.ts` into `workspace/parse.ts` (move to `src/shared`, see AUD-008), `workspace/ids.ts`, and per-domain reducers (tabs, splits, favorites, preferences) combined by a thin root reducer.
- Split `LogViewer.tsx` by responsibility: data pipeline hook, table renderer, hybrid/JSON renderer, inspector, toolbar.
- Replace window `CustomEvent`s with reducer actions or context.

**Implementation considerations**

Do this only after AUD-001 and AUD-008 so that file-format changes are safe. Keep version-1 file compatibility by deriving the projection on load.

**Verification**
- Existing unit and desktop suites pass.
- A property test: random sequences of reducer actions always yield a workspace accepted by `workspaceSchema`. This also covers the currently unaudited reducer.

---

### AUD-010: Verification and test switches remain active in packaged production builds

**Metadata**
- Severity: Medium
- Category: Security / Robustness
- Confidence: Confirmed
- Effort: S
- Files: `src/main/index.ts`, `src/main/offline-adapter.ts`

**Problem**

Packaged builds honour:
- `EXPLORER_TEST_USER_DATA`: redirects the whole profile directory (`index.ts:44-45`).
- `--offline-verification` and `--background-verification`: the window is never shown, background throttling is off, second-instance focus is ignored, and cloud access is disabled (`index.ts:47-53, 401-403, 434, 494`).
- `EXPLORER_TEST_QUERY_DELAY_MS`: delays queries (`offline-adapter.ts:196-197`).

These switches exist so the Playwright suite can drive the packaged binary (`tests/desktop/desktop-app.ts:5-6` launches `release/win-unpacked/AWS Log Explorer.exe`).

**Impact**

A process that can set environment variables or arguments for the user (shortcut, scheduled task, other software) can:
- run the app invisibly,
- point it at an attacker-chosen profile directory: workspace, access-settings and window state are read from there, and `awsEnabled` is honoured from it.

The risk is low in a single-user desktop context, but these are hidden production behaviours. They are also invisible to anyone reading the security model in `docs/architecture.md`.

**Recommended solution**
- Compile the switches out of release builds with a build-time define (for example `import.meta.env.VITE_VERIFICATION`), and produce a separate verification build for desktop tests.
- At minimum, honour them only when an explicit build flag is baked in, and document them.

**Verification**
- Grep the packaged `out/main/index.js` for `EXPLORER_TEST_USER_DATA`: the release build has none, the verification build has it.

---

### AUD-011: Google Cloud access has no consent gate, contrary to the documented security model

**Metadata**
- Severity: Low
- Category: Security / Documentation consistency
- Confidence: Confirmed
- Effort: S
- Files: `src/main/index.ts`, `docs/architecture.md`

**Problem**

The documentation says: "Development, tests and unpackaged builds must not read AWS configuration or connect to AWS…" and describes a deliberate opt-in. AWS follows this (`canEnableAws` requires `app.isPackaged`, `index.ts:50-53`; persisted opt-in in `aws-access-preference.ts`).

GCP is enabled whenever neither verification flag is present (`index.ts:73, 194-197`):
- including unpackaged development builds,
- with no persisted opt-in,
- and the "disable" switch in Settings affects AWS only.

GCP discovery also runs the user's `gcloud` and `kubectl` binaries (`gcloud-auth.ts:93-142`, `gcp-sources.ts:240-302`).

**Impact**

The two providers follow inconsistent security policies. The documented guarantee ("dev builds never touch the cloud") is false for GCP.

**Recommended solution**

Generalise `AwsAccessPreference` into a per-provider access preference (`aws`, `gcp`) with the same packaged-only rule. Gate all `gcp:*` handlers and the `gcp` adapter on it. Update `docs/architecture.md`.

**Verification**

Unit test: with GCP access disabled, the `gcp:profiles` handler rejects and no child process is spawned.

---

### AUD-012: The packaged app ships the renderer's dependencies twice (~45 MB of a 96 MB archive)

**Metadata**
- Severity: Medium
- Category: Build / Packaging
- Confidence: Confirmed (measured)
- Effort: S
- Files: `package.json`, `electron-builder.yml`, `electron.vite.config.ts`

**Problem**

React, Mantine, Tabler icons, TanStack, dnd-kit and zod are bundled by Vite into `out/renderer` (3.1 MB). Because they are listed under `dependencies`, electron-builder also copies them into `app.asar/node_modules`, where the main process never loads them.

Measured in `release/win-unpacked/resources/app.asar` (96.2 MB total):

| Package | Size |
|---|---|
| `@tabler/icons` | 11.3 MB |
| `@tabler/icons-react` | 9.9 MB |
| `@mantine/core` | 9.2 MB |
| `react-dom` | 8.1 MB |
| `@tanstack/table-core` | 3.1 MB |
| application code | 3.4 MB |

The package `description` is "A structured CloudWatch Logs desktop workspace", although GCP is a first-class provider.

**Impact**
- Installer and download size roughly double.
- Slower install and upgrade.
- A larger file set for antivirus scanning on Windows.

**Recommended solution**
- Move renderer-only packages to `devDependencies`. They are still bundled by Vite.
- Keep only packages main/preload `require` at runtime in `dependencies` (AWS SDK, Google libraries, protobufjs, zod and the shared-ini loader). Verify with `npm ls --omit=dev` and by launching the packaged app.
- Update the description.

**Verification**

`app.asar` size before and after; the packaged app starts and runs an offline query.

---

### AUD-013: The release and update process is unversioned, machine-local, and runs the daily-use app from inside the repository

**Metadata**
- Severity: Medium
- Category: Tooling / Process
- Confidence: Confirmed
- Effort: M
- Files: `docs/release.md`, `.gitignore`, `tests/desktop/desktop-app.ts`, `package.json`, untracked `.tmp/handoff-0.1.89.py`

**Problem**
- **Not reproducible from the repo.**
  - Release, promotion and verification are done by ad-hoc Python scripts in the git-ignored `.tmp/` (about 3,200 files, 2.1 GB), for example `.tmp/handoff-0.1.89.py`. That script stages `release/0.1.89/win-unpacked`, waits for the running app to exit (polling with `psutil` every 2 s), then renames folders under `release/`.
  - `docs/release.md` (847 lines) cites `.tmp/*.json` "evidence" files that are not version-controlled and cannot be checked by anyone else. Several entries say "Changes remain uncommitted."
- **Daily-use app inside the build tree.** The app the user runs every day is `release/win-unpacked`, inside the build output directory. `npm run package` (`electron-builder --dir`, output `release/` per `electron-builder.yml:4`) writes to that same folder. The Playwright suite launches it by default (`tests/desktop/desktop-app.ts:5-6`).
- **Disk use.** `release/` holds about 109 GB of retained builds, staging and backup folders (`standard-staging-*`, `previous-standard-*`, `*-candidate`).
- **No checks.** No CI, lint or format check exists. `npm run format` rewrites files, and several `src/main/gcp-*` files are visibly not prettier-formatted (very long lines), so the formatter is not run consistently.

**Impact**
- The project cannot be released or verified by anyone else, or from a clean clone.
- Running `npm run package` while the app is open can fail or corrupt the installed copy.
- Tests can run against an outdated binary.
- 109 GB of disk is consumed.

**Recommended solution**
1. Install through the NSIS installer that is already produced, or copy to a folder outside the repository (for example `%LOCALAPPDATA%\Programs\AWS Log Explorer`). Never run from `release/`.
2. Move the handoff/verification logic that is still needed into tracked scripts (`scripts/`, which exists and is empty), parameterised by version and target path, and document it in `docs/release.md` in place of the per-version evidence log.
3. Add `lint` (ESLint with typescript-eslint and react-hooks), `format:check`, and a CI workflow running typecheck, unit tests and build.
4. Point desktop tests at a freshly built `out/` (electron-vite preview) or a build created by the test script, not the daily-use folder.
5. Add a cleanup policy for `release/` (keep the last N builds).

**Verification**

A clean clone can build, test and package with only documented commands. `release/win-unpacked` is no longer referenced by tests or by the update procedure.

---

### AUD-014: Test suite fidelity gaps: no DOM for component tests, deprecated renderer, untested process boundary

**Metadata**
- Severity: Medium
- Category: Testing
- Confidence: Confirmed (structure); impact Needs verification
- Effort: M
- Files: `vitest.config.ts`, `tests/*.tsx`, `tests/desktop/*`

**Problem**
- **No DOM.** All tests run with `environment: "node"` (`vitest.config.ts:6`). None of the 43 `.tsx` test files declares a DOM environment. 39 of them use `react-test-renderer`, which is deprecated in React 19 and does not exercise real DOM events, focus, layout or effects tied to DOM APIs. The rest use custom fakes (`tests/tooltip-dom.ts`).
- **Untested process boundary.** No unit test imports `src/main/index.ts` (IPC registration, `trusted()` sender check, close flow) or `src/preload/index.ts`. The preload↔main contract is covered only by the Playwright suite, which needs a packaged build (AUD-013).
- **Desktop tests.** The 75 Playwright specs use `waitForTimeout` 27 times, run serially (`workers: 1`, 90 s timeout per test), and depend on the packaged binary.
- **Measured run.** 1258 unit tests pass in 8.5 s. Vitest reports 332 modules evaluated 2,123 times, so import cost dominates (41%).

**Impact**

Component behaviour that depends on the DOM (focus, keyboard, pointer capture, measurement) is verified only by the slow, machine-dependent desktop suite. A broken IPC channel name or sender check is invisible to `npm test`.

**Recommended solution**
- Adopt `@testing-library/react` with `happy-dom` or `jsdom` per file (`// @vitest-environment happy-dom`).
- Migrate the 39 `react-test-renderer` files gradually, starting with interaction-heavy components.
- Extract IPC registration into a function taking `ipcMain`-like and `BrowserWindow`-like dependencies, and unit-test the channel table against `ExplorerApi` (every preload method has a handler with the same channel and argument order) and `trusted()`.
- Replace fixed waits with condition waits.

**Verification**

A test that fails when a preload channel name is changed without the matching handler.

---

### AUD-015: Event-buffer updates do O(n) work per batch; AWS Live emits an update every second even when empty

**Metadata**
- Severity: Low
- Category: Performance
- Confidence: Needs verification (code analysis; not profiled)
- Effort: M
- Files: `src/renderer/query-state.ts`, `src/renderer/useLogJobs.ts`, `src/main/aws-adapter.ts`

**Problem**
- **Per-batch cost.** `mergeEvents` (`query-state.ts:12-50`) rebuilds a `Set` of composite string keys for the entire buffer, copies the array, sorts it, and re-sums message lengths on every update. The buffer holds up to `maxEvents` (default 10,000, configurable to 100,000; `workspace.ts:164, 561`). Live tail and the 256-event progress batches (`multi-source-events.ts:170-173`) call it repeatedly.
- **Empty updates.** AWS Live emits a `running` update for every `sessionUpdate`, including empty ones, which the service sends roughly every second (`aws-adapter.ts:734-753`). Each one creates a new `runtimes` object (`useLogJobs.ts:128-189`) and re-runs the effect at lines 785-809.

**Impact**

CPU and garbage-collection pressure and re-renders proportional to buffer size × update rate. Users with high `maxEvents` and several live views are most affected. The history file `docs/renderer-freeze-investigation.md` suggests freezes have occurred before.

**Recommended solution**
- Keep a persistent per-tab `Set` of keys alongside the buffer.
- Append and merge only the incoming sorted batch (merge two sorted arrays).
- Track the character total incrementally.
- Drop empty Live updates in the adapter unless `liveState` or `sampled` changed.

**Verification**

Profile 100,000 events with a live view at 50 events per second: frame time and allocation rate before and after.

---

### AUD-016: Cloud SDKs load eagerly at startup

**Metadata**
- Severity: Low
- Category: Performance
- Confidence: Confirmed (measured)
- Effort: S
- Files: `src/main/aws-adapter.ts`, `src/main/gcp-live.ts`, `src/main/gcp-adapter.ts`, `src/main/log-service.ts`

**Problem**
- `index.ts` → `log-service.ts` → `gcp-adapter.ts` → `gcp-live.ts` statically imports `@google-cloud/logging`, `google-auth-library` and `protobufjs`, and builds a protobuf `Root` at module load (`gcp-live.ts:1-11`).
- `aws-adapter.ts:11-20` statically imports the CloudWatch client, although `defaultTransport` (lines 234-237) was written to load it lazily.
- Measured with Node 24 on this machine: `require("@google-cloud/logging")` about 205 ms, `require("@aws-sdk/client-cloudwatch-logs")` about 48 ms.

**Impact**

About 250 ms added to every launch, before the window is created, including for users who never use GCP or are offline.

**Recommended solution**
- Import command classes lazily, or use type-only imports plus `await import()`.
- Load `gcp-live.ts` with `await import()` inside `live()`.

**Verification**

Measure the time from process start to `ready-to-show` before and after.

---

### AUD-017: Leftovers from the removed Insights feature remain in contracts, schemas and UI text

**Metadata**
- Severity: Low
- Category: Maintainability / Dead code
- Confidence: Confirmed
- Effort: S
- Files: `src/shared/contracts.ts`, `src/main/security.ts`, `src/main/log-service.ts`, `src/main/index.ts`, `src/renderer/useLogJobs.ts`, `src/renderer/workspace.ts`

**Problem**

The leftovers are:
- `QueryRequest.kind: "events" | "insights"` and an always-empty `query` field (`contracts.ts:107, 111`; `useLogJobs.ts:474, 481`).
- `QueryStats.recordsScanned/bytesScanned`, never produced.
- `LogTab.kind` and `SavedQuery.kind` accepting `"insights"` (`security.ts:127, 147`), while `parseTab` forces `"events"` (`workspace.ts:452`).
- Runtime `kind` checks in `log-service.ts:62` and `aws-adapter.ts:659`.
- The "A CloudWatch query could not be stopped" dialog (`index.ts:155-169`).
- The cleanup-failure machinery (AUD-003).

The documentation says SQL text is kept "as compatibility data".

**Impact**

Readers have to reason about states that can no longer happen, and wrong error texts reach users.

**Recommended solution**

Keep the persisted `query` string only on `LogTab` and `SavedQuery` for data retention. Remove `"insights"` from `QueryRequest`, the stats fields, the dialog and the runtime checks. Narrow the schemas with a migration that maps old values to `"events"`.

**Verification**

The typecheck passes after the narrowing, and older workspace fixtures still load.

---

### AUD-018: No handling of renderer crashes or hangs

**Metadata**
- Severity: Low
- Category: Reliability
- Confidence: Needs verification
- Effort: S
- Files: `src/main/index.ts`

**Problem**

There are no `render-process-gone` or `unresponsive` handlers. If the renderer crashes:
- live tails and queries keep running in main and keep sending updates to a dead `webContents`,
- the window stays blank with no recovery,
- closing it goes through `flushRenderer()`, which waits 5 s and then shows "Workspace save failed".

**Recommended solution**

On `render-process-gone`, cancel all jobs (`service.shutdown()`) and offer to reload the window. The last successful autosave is on disk.

**Verification**

Run `webContents.forcefullyCrashRenderer()` in a desktop test, then check that the reload restores the workspace and that no jobs remain.

---

### AUD-019: The production GCP adapter contains a separate test-only Live implementation

**Metadata**
- Severity: Low
- Category: Testing / Maintainability
- Confidence: Confirmed
- Effort: S
- Files: `src/main/gcp-adapter.ts`

**Problem**

`live()` takes the gRPC tail plus REST backfill path only when no `transport` is injected (`gcp-adapter.ts:92-150`). When a transport is injected, which only tests do (`log-service.ts:158` never passes one), a separate 3-second polling loop with its own dedup runs instead (lines 151-176).

**Impact**

Tests of GCP Live exercise code that production never runs. The production path's reconnect, backfill and dedup logic is untested at unit level.

**Recommended solution**

Inject the stream function (`streamGcpProject`) as a dependency in place of the transport switch. Delete the polling loop, and test the real reconnect/backfill logic with a fake stream.

**Verification**

Unit tests for stream failure followed by reconnect with backfill and dedup, using a fake stream.

---

### AUD-020: CSV exports have no byte-order mark, so Excel garbles non-ASCII text

**Metadata**
- Severity: Low
- Category: Correctness
- Confidence: High confidence (code trace; Excel not run)
- Effort: S
- Files: `src/main/index.ts`, `src/shared/log-data.ts`, `src/renderer/components/LogViewer.tsx`

**Problem**

The export menu offers "CSV · visible columns, formula-safe" (`LogViewer.tsx:1467`), which is aimed at spreadsheets. `serializeEvents` builds the CSV text (`log-data.ts:590-612`), and the main process writes it as UTF-8 with no byte-order mark (`index.ts:427-442`). Excel for Windows opens a CSV without a BOM in the system code page rather than UTF-8.

**Impact**

Non-ASCII log content (names, accented text, CJK, emoji, `→`) appears garbled when the export is opened in Excel. The export file itself is correct, so other tools are unaffected.

**Recommended solution**
- When writing a `.csv` export, prefix the file with U+FEFF. JSON and JSONL stay unchanged.

**Verification**
- Export a CSV containing non-ASCII text: the file starts with `EF BB BF`, and Excel shows the text correctly.

**Status:** fixed in 0.1.107. The main process adds the mark when writing CSV, so the renderer's CSV text and its tests are unchanged.

---

## Considered and not reported

| Note | Reason |
|---|---|
| CloudWatch `startFromHead` / `2024-01-01` boundary (`aws-adapter.ts:490`) | Correct: the SDK documentation (`models_0.d.ts:4048-4052`) requires it. |
| CSP and Electron hardening | Sound: `sandbox`, `contextIsolation`, navigation/window-open/permission denial, sender-frame + URL check on every handler. `connect-src` still allows `ws://localhost:*` in production (dev HMR leftover); negligible. |
| `useLogJobs.ts` generation/ownership protocol | Read fully; no race found. |
| GCP filter text spliced into the server filter (`gcp-adapter.ts:63`) | The user's own credentials and data; no trust boundary is crossed. |
| `Entry.fromApiResponse_` (internal API of `@google-cloud/logging`, `gcp-live.ts:38`) | Real but minor upgrade risk; note for dependency updates. |
| Windows `rename` EPERM on save | Not observed; surfaced to the user if it happens. |
| `contracts.ts` vs `workspaceSchema` field drift | None today; the structural risk is in AUD-008. |
| CSV formula guard also quotes negative numbers (`log-data.ts:606`) | Deliberate: OWASP's recommended guard. A leading `-` can start a formula, so `-5` exports as `'-5`. |
| CSV/JSON export is serialized on the renderer thread | Bounded to 20 MB of text (`EXPORT_LIMIT`), behind an explicit menu action that shows an "exporting" state. |
| Regex filters and highlights stop at 500 ms per batch of up to 100 events / 1 MB | Deliberate: a clear "paused" message names the rule to edit. A heavy but legitimate pattern on a slow machine can hit it. |
| Calendar "today" is computed at render (`RangeCalendar.tsx:36`) | It can be stale only if the popover stays open across midnight. |
| Drag-and-drop when the window loses focus mid-drag | Pointer capture keeps the release on this window, and dnd-kit cancels on visibility change; no stuck state was found. |
