# Audit Checklist

Tick a box when the finding is fixed and verified. Order follows [README.md](README.md); details in [FINDINGS.md](FINDINGS.md).

## High
- [x] AUD-001 — Unreadable workspace file overwritten by autosave *(unreadable files copied to `*.corrupt-<time>.json`; no autosave after load failure; lenient-repair step 2 not done)*
- [x] AUD-002 — Every view queries at startup; >32 views fail *(hidden views deferred until shown, incl. after AWS enable; main job cap 32 → 128, extra jobs queue on query slots)*

## Medium
- [x] AUD-003 — Leftover Insights cleanup state → false "could not be stopped" warnings *(cleanup-failure tracking removed; shutdown fails only on that call's destroy errors)*
- [x] AUD-004 — Explorer Refresh returns 60 s cached results *(Refresh passes `fresh`; groups and first stream page bypass the cache)*
- [x] AUD-012 — Renderer dependencies shipped twice in `app.asar` *(11 renderer-only packages → devDependencies; description updated; asar size checked at final packaging)*
- [x] AUD-010 — Test/verification switches active in production builds *(honoured only in dev or `npm run package:verification` builds → `release/verification/`; desktop tests now default to that path)*
- [~] AUD-006 — Continuations: 16-entry global cap, deleted on error, early expiry *(partial: cap 16 → 128, still bounded by 16 MB; delete-on-error kept on purpose — a retry could reuse child cursors the adapters already moved past; expiry unchanged)*
- [x] AUD-005 — Same-millisecond ties reversed; multi-source forward pages not merged *("older" pages use a stable newest-first sort so same-ms rows keep ingestion order; every multi-source history query now goes through the k-way merge in `multi-source-events.ts`, tested in `tests/multi-source-order.test.ts`; the adapter's own multi-source forward path (with the always-false `truncated`) is no longer used by the service)*
- [~] AUD-013 — Release process unversioned; daily app runs from `release/`; no CI/lint *(partial: `.github/workflows/ci.yml` runs typecheck + unit tests; desktop tests use `release/verification/` (AUD-010); not done: release scripts out of `.tmp/`, moving the installed app out of `release/`, `release/` cleanup, format check (90 files unformatted — needs a separate format-only commit))*
- [ ] AUD-014 — Test gaps: no DOM, deprecated `react-test-renderer`, IPC untested
- [x] AUD-008 — Main bundles renderer code; types vs zod; workspace validated 4× per save *(workspace module + 6 pure helpers moved to `src/shared` and payload types to `shared/resource-payload.ts` — main imports nothing from `src/renderer`; `tests/workspace-schema-types.test.ts` fails the typecheck if a persisted type and its schema declare different fields; a save validates once (IPC schema) and does not re-read a file the store already loaded or wrote; `validateQuery` uses `querySchema` and keeps only cross-field rules. Not done: `.strict()` schemas in dev builds; full type equality — schemas are deliberately stricter than some types, e.g. `view.levels`)*
- [~] AUD-007 — Nominal provider abstraction; GCP bypasses job service *(done: one event-ID minter `src/shared/event-id.ts` used for every query shape; one Google HTTP client `gcp-http.ts` (401 refresh, 429/503 retry, cancellation); all GCP discovery runs through `service.discover` (cache, limits, timeout, shutdown cancel, `gcp:refresh` for the Refresh button); GCP errors no longer get AWS advice; adapter cap → LRU eviction. Not done: formal `CloudProvider` interface, `kubectl` JSON parsed off the main thread, real token lifetime instead of fixed 5 min; AWS Live IDs still differ from history because Live Tail has no event ID)*
- [ ] AUD-009 — Oversized central modules; persisted layout checked by `JSON.stringify`

## Low
- [x] AUD-011 — GCP has no consent gate *(both providers now packaged-only with no opt-in switch — AWS switch removed after fixtures were dropped)*
- [x] AUD-016 — Cloud SDKs load eagerly *(AWS client and `gcp-live` now loaded on first use; main bundle has no static SDK require)*
- [x] AUD-017 — Insights leftovers in contracts, schemas, UI text *(`QueryRequest.kind` narrowed to `"events"`; dead adapter check and dialog text removed; persisted `LogTab`/`SavedQuery` kinds and `query` field kept for old workspaces)*
- [x] AUD-019 — Test-only GCP Live code path *(polling loop removed; tail function injectable; tests run the production backfill/dedup path)*
- [x] AUD-018 — No renderer crash/hang handling *(on crash: jobs shut down, Reload/Close dialog; on hang: Wait/Reload; not unit-tested — `index.ts` has no harness)*
- [~] AUD-015 — O(n) buffer rebuild per update; empty Live updates *(partial: AWS Live drops empty updates that change nothing; incremental `mergeEvents` (persistent key set, sorted-batch merge) not done; not profiled)*

## Not yet audited
- [ ] Workspace reducer (`workspace.ts` lines 780–3121)
- [ ] Tab/pane drag-and-drop
- [ ] `LogViewer.tsx` internals (virtualization, copy/export)
- [ ] Highlight and local-filter workers
- [ ] Time-range / DST math
- [ ] Settings editors
- [ ] Playwright desktop suite run
- [ ] Installer run
