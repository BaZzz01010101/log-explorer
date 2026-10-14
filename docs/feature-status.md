# Feature status

This describes implemented application paths and their current scope. Offline fixtures exercise the same service/preload/renderer path as AWS adapters, but do not establish real AWS interoperability or commercial production readiness.

| Area            | Implemented                                                                                                                                       | Scope and limits                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Desktop         | Electron window, sandboxed renderer, validated IPC, local clipboard/export                                                                        | Development cannot authorize AWS; distribution/signing require release checks                                                    |
| Workspace       | Permanent/preview tabs, close/reopen/cycling, colored groups, multi-selection, right-click actions, adaptive dragging and up to four nested panes | Edge-drop previews project the final layout; dividers support live pointer resize, keyboard controls and saved ratios            |
| Navigation      | Connections/regions, group-name substring search, lazy pages, streams, favorites/recents, resizable sidebar                                       | Group search is server-side and case-sensitive; stream search covers loaded names                                                |
| Event queries   | Automatically applied date changes, server patterns, streams, multiple groups, sparse-page continuation and cancellation                          | Up to 50 groups and 10,000 events per fetch; empty-page scans are bounded and retain continuation                                |
| Insights        | CWLI submission, polling, partial/final results, scan statistics, cancellation, structured aggregation rows                                       | At most 10,000 rows; no additional Insights-result pagination, SQL or PPL interface                                              |
| Live monitoring | Official SDK Live Tail stream, sampling/error status, cancellation; explicit offline simulation                                                   | Up to 10 Standard groups; selected streams require a single group; service sampling can omit events                              |
| Visualization   | JSON/table/hybrid, viewport-sticky expanded rows, virtualized events, live column resizing and inspection                                         | Parsing, tree expansion and column discovery have bounds; raw copy/export preserves full text within export limits               |
| Local tools     | Loaded-event text/level search, sorting, highlighting, copy, JSON/JSONL/CSV export, surrounding context                                           | Local filtering/export does not fetch unloaded data; context requires source group/stream metadata                               |
| Configuration   | Saved queries/history, per-group view presets, column formats, themes/density/fonts, shortcuts, refresh and buffer preferences                    | Auto/JSON/IEC bytes/duration/local-UTC date formats; automatic refresh disabled by default; credentials/events are not persisted |
| Authentication  | Main-process official profile provider, existing SSO sessions and supported role profiles                                                         | No embedded SSO login/MFA prompt; no real AWS authentication test performed                                                      |
| Persistence     | Versioned configuration, atomic writes, backup recovery, close-time save coordination                                                             | Platform/restart/recovery verification belongs in the final record below                                                         |
| Distribution    | Electron Builder host-platform configurations: NSIS, DMG, AppImage                                                                                | Code signing, notarization, automatic updates and macOS/Linux verification remain release work                                   |

## Offline interpreter

Event patterns accept positive words and quoted phrases. Insights accepts `fields`, `sort @timestamp asc/desc`, `limit`, simple field equality, a literal `@message like /text/` filter, and terminal `stats count(*) as name [by field]`. Unsupported syntax errors explicitly; fixtures do not approximate the full CloudWatch language. See [README examples](../README.md#offline-query-examples).

## Final verification record

Verified version 0.1.2 locally on 2026-10-14. AWS tests used injected command transports; desktop checks used isolated storage, fixtures and an immutable offline verification gate.

| Check                           | Final result                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TypeScript                      | `npm run typecheck` passed through the final distribution build                                             |
| Isolated unit/integration suite | `npm test`: 189 tests passed in 22 files                                                                    |
| Formatting                      | Prettier checks passed for source, tests, docs and package files                                            |
| Production bundle and installer | `npm run dist -- --win nsis` passed                                                                         |
| Electron desktop regressions    | All 20 passed in 3.2 minutes with two workers, including the final packaged executable                      |
| Windows application             | `release/win-unpacked/AWS Log Explorer.exe` built and launched hidden                                       |
| Windows installer               | `release/AWS Log Explorer Setup 0.1.2.exe` built; unsigned; installation/uninstallation not performed       |
| Dependency advisory scan        | `npm audit --json`: zero reported vulnerabilities                                                           |
| Real AWS access                 | No requests, profiles, credentials or user application-data workspace accessed                              |
| Other platforms                 | macOS/Linux not verified in this Windows session                                                            |
| Release audits                  | Signing, physical OS input, screen readers and representative performance/security audits remain unverified |

The final combined command set `EXPLORER_DESKTOP_PACKAGED=1` and ran Playwright with `--workers=2 --reporter=list,json --output test-results-0.1.2-verified`. The lifecycle suite covers development and packaged launches; all other suites exercise the packaged executable. The machine-readable result is `test-results-0.1.2-verified/report.json`. Every test process used hidden verification windows and temporary storage, with AWS hard-disabled. Chromium focus emulation and intercepted native dialogs preserved desktop focus.

Trusted input covers the original renderer freeze/idle CPU, server/local query workflows, date auto-refresh, actual exports and context, live column widths before release, resize cancellation/persistence, Hybrid geometry and scrolling, modifier-only focus, preview promotion/replacement, whole-tab reordering, selected-tab splits, all four edge splits, projected placement after a vacated pane collapses, outside/Escape cancellation, four-pane capacity, dividers, focused settings edits, restart and natural close/save-failure behavior.

The [interaction investigation](interaction-fixes-0.1.2.md) records reproduced symptoms and fixes. The [renderer freeze investigation](renderer-freeze-investigation.md) records the original synthetic-input coverage gap. These checks do not establish responsiveness at all event volumes or real AWS interoperability.

Distribution hashes and sizes are recorded in `release/artifact-manifest.json`, generated by `python build/artifact_manifest.py`. The installer SHA-256 is `ff136a230a339c15381d41b2a7f065bbdd5fd9d12eeed721f256e4a96228c77a`. Authenticode reports `NotSigned`.
