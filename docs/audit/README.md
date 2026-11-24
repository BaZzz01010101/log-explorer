# Technical Audit — Dashboard

AWS Log Explorer 0.1.89 (commit `254c569`), audited 2026-11-13 – 2026-11-14. Full details: [FINDINGS.md](FINDINGS.md).

## Summary

**Overall assessment.** The Electron security posture is solid: sandboxed renderer, context isolation, a narrow preload API, zod validation and sender checks on every IPC handler, and a CSP. The test suite is large and green (typecheck clean; 1258/1258 unit tests pass).

The main risks are elsewhere:
- **Data safety on load:** an unreadable workspace is overwritten automatically.
- **Scaling with many views:** every view queries at startup, and continuations are capped process-wide.
- **Accumulated design debt:** two cloud providers with duplicated infrastructure, leftovers from the removed Insights feature, and 1,000–3,000-line central modules.
- **Release process:** it lives outside version control, and the daily-use app runs from inside the build folder.

**Findings by severity:** Critical 0 · High 2 · Medium 12 · Low 10 (24 total). AUD-020 comes from the 2026-11-17 follow-up that covered the remaining areas, AUD-021 to AUD-024 from the 2026-11-24 follow-up over the code changed since.

**Most significant risks**
1. Loss of the user's entire workspace when the file fails strict validation (AUD-001).
2. Startup errors and query storms in workspaces with many views (AUD-002).
3. False "query could not be stopped" warnings that never clear (AUD-003).
4. Release and update steps that cannot be reproduced from the repository (AUD-013).

**Recommended remediation order**
1. **Quick, high value (S effort):** AUD-001, AUD-003, AUD-004, AUD-012, AUD-010.
2. **Next:** AUD-002, AUD-006, AUD-005, AUD-013.
3. **Structural work, after the above:** AUD-008, then AUD-007, then AUD-009. AUD-014 runs in parallel to give refactors a safety net.

**Coverage and limitations.**
- **Read in full:** the main process, preload, shared contracts, and the query-job hook.
- **Read in part:** the workspace state module (parsing only) and the App load/save path.
- **Not audited in depth (first pass):** the workspace reducer (lines 780-3121), tab/pane drag-and-drop, most of `LogViewer.tsx`, the highlight and filter workers, time-range math, and the settings editors.
- **Not run (first pass):** the Playwright desktop suite and the installer.
- **Follow-up, 2026-11-17 (0.1.106):** all of the areas above were covered. The reducer was fuzzed across every layout action with save-and-reload checks, and the other areas were read. The desktop suite was run in full (470/470). One new finding: AUD-020. The installer run waits for the owner's approval, because it changes the machine's shortcuts and uninstall entries.

See the coverage table in [FINDINGS.md](FINDINGS.md#audit-coverage).

## Findings

| ID | Severity | Category | Issue | Impact | Effort | Confidence | Details |
|---|---|---|---|---|---|---|---|
| AUD-001 | High | Data integrity | An unreadable workspace file is silently overwritten by an automatic save | User loses all views, favorites and settings after a downgrade or a damaged file | S | Confirmed | [→](FINDINGS.md#aud-001-an-unreadable-workspace-file-is-silently-overwritten-by-an-automatic-save) |
| AUD-002 | High | Reliability | Every open view queries at startup; more than 32 views fail; the visible view waits | Startup errors, slow first results, extra cloud API cost | M | High confidence | [→](FINDINGS.md#aud-002-every-open-view-runs-a-query-at-startup-more-than-32-views-fail-and-the-visible-view-waits-behind-hidden-ones) |
| AUD-003 | Medium | Reliability | Leftover Insights cleanup state causes permanent false "query could not be stopped" warnings | Every close needs "Close anyway"; disabling AWS reports an error | S | High confidence | [→](FINDINGS.md#aud-003-the-leftover-insights-cleanup-machinery-causes-permanent-false-query-could-not-be-stopped-warnings) |
| AUD-004 | Medium | Correctness | Explorer Refresh returns 60-second-cached results | New groups and streams do not appear on Refresh | S | Confirmed | [→](FINDINGS.md#aud-004-the-explorer-refresh-button-returns-cached-results-for-up-to-60-seconds) |
| AUD-012 | Medium | Packaging | Renderer dependencies shipped twice in `app.asar` | About 45 of 96 MB are unused in the installer | S | Confirmed | [→](FINDINGS.md#aud-012-the-packaged-app-ships-the-renderers-dependencies-twice-45-mb-of-a-96-mb-archive) |
| AUD-010 | Medium | Security | Test and verification switches active in production builds | Hidden window or redirected profile via environment variables or arguments | S | Confirmed | [→](FINDINGS.md#aud-010-verification-and-test-switches-remain-active-in-packaged-production-builds) |
| AUD-006 | Medium | Reliability | Continuations: 16-entry global cap, deleted on error or cancel, 15-minute expiry | "Load more" fails in normal multi-view use | M | High confidence | [→](FINDINGS.md#aud-006-query-continuations-are-fragile-16-entry-global-cap-deleted-on-any-error-or-cancel-early-expiry) |
| AUD-005 | Medium | Correctness | Same-millisecond ties reversed; multi-source forward pages not merged | Stack traces read upside-down; rows jump while paging | M | High confidence | [→](FINDINGS.md#aud-005-event-order-is-not-reliably-chronological-for-same-millisecond-events-and-multi-source-forward-pages) |
| AUD-013 | Medium | Tooling / Process | Release process in untracked scripts; daily app runs from `release/`; no CI or lint | Not reproducible; risk to the installed app; 109 GB disk use | M | Confirmed | [→](FINDINGS.md#aud-013-the-release-and-update-process-is-unversioned-machine-local-and-runs-the-daily-use-app-from-inside-the-repository) |
| AUD-014 | Medium | Testing | No DOM for component tests; deprecated `react-test-renderer`; IPC boundary untested | DOM and IPC regressions slip past `npm test` | M | Confirmed | [→](FINDINGS.md#aud-014-test-suite-fidelity-gaps-no-dom-for-component-tests-deprecated-renderer-untested-process-boundary) |
| AUD-008 | Medium | Architecture | Main bundles renderer code; hand-written types vs zod; workspace validated 4× per save | Silent field loss on future changes; per-change CPU and disk cost | M | Confirmed | [→](FINDINGS.md#aud-008-validation-and-normalization-are-split-across-processes-and-layers-main-bundles-renderer-code) |
| AUD-007 | Medium | Architecture | Provider abstraction nominal; GCP bypasses the job service; 2 HTTP clients; 5 event-ID schemes | Divergent retries, auth, cancellation and dedup; features built twice | L | Confirmed | [→](FINDINGS.md#aud-007-the-cloud-provider-abstraction-is-nominal-gcp-bypasses-the-job-service-and-duplicates-its-infrastructure) |
| AUD-009 | Medium | Architecture | Oversized central modules; persisted derived layout checked by `JSON.stringify` | High change cost; recurring "Could not save" if projections diverge | XL | High confidence | [→](FINDINGS.md#aud-009-central-renderer-modules-are-oversized-and-hold-duplicated-derived-state-checked-by-string-comparison) |
| AUD-011 | Low | Security | GCP access has no consent gate, unlike AWS | Dev builds and fresh installs reach GCP; docs are wrong | S | Confirmed | [→](FINDINGS.md#aud-011-google-cloud-access-has-no-consent-gate-contrary-to-the-documented-security-model) |
| AUD-016 | Low | Performance | Cloud SDKs load eagerly | About 250 ms added to every launch | S | Confirmed | [→](FINDINGS.md#aud-016-cloud-sdks-load-eagerly-at-startup) |
| AUD-017 | Low | Maintainability | Insights leftovers in contracts, schemas and UI text | Unreachable states; misleading messages | S | Confirmed | [→](FINDINGS.md#aud-017-leftovers-from-the-removed-insights-feature-remain-in-contracts-schemas-and-ui-text) |
| AUD-019 | Low | Testing | GCP adapter has a test-only Live code path | Production Live reconnect logic is untested | S | Confirmed | [→](FINDINGS.md#aud-019-the-production-gcp-adapter-contains-a-separate-test-only-live-implementation) |
| AUD-018 | Low | Reliability | No renderer crash or hang handling | Blank window; jobs keep running; 5-second close error | S | Needs verification | [→](FINDINGS.md#aud-018-no-handling-of-renderer-crashes-or-hangs) |
| AUD-015 | Low | Performance | O(n) buffer rebuild per update; empty Live updates every second | CPU and GC pressure with large buffers and live views | M | Needs verification | [→](FINDINGS.md#aud-015-event-buffer-updates-do-on-work-per-batch-aws-live-emits-an-update-every-second-even-when-empty) |
| AUD-020 | Low | Correctness | CSV exports have no byte-order mark | Excel garbles non-ASCII text in exported CSV files | S | High confidence | [→](FINDINGS.md#aud-020-csv-exports-have-no-byte-order-mark-so-excel-garbles-non-ascii-text) |
| AUD-021 | Medium | Correctness | Google Cloud sources compared by JSON key order | Hidden badges, source names and duplicate checks fail until a restart | S | Confirmed | [→](FINDINGS.md#aud-021-google-cloud-sources-are-compared-by-json-key-order) |
| AUD-022 | Low | Reliability | A message rule's regular expression runs on the renderer thread | A pathological pattern freezes the window | M | High confidence | [→](FINDINGS.md#aud-022-a-message-rules-regular-expression-runs-on-the-renderer-thread) |
| AUD-023 | Low | Correctness | Edit source checks only the first page of matches | An existing source is reported as not found | S | High confidence | [→](FINDINGS.md#aud-023-edit-source-checks-only-the-first-page-of-matches) |
| AUD-024 | Low | Maintainability | Unreachable code | Larger files to read and change | M | Confirmed | [→](FINDINGS.md#aud-024-unreachable-code) |
