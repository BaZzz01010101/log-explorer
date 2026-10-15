# Feature status

This describes implemented application paths and their current scope. Offline fixtures exercise the same service/preload/renderer path as AWS adapters, but do not establish real AWS interoperability or commercial production readiness.

| Area            | Implemented                                                                                                                           | Scope and limits                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop         | Electron window, sandboxed renderer, validated IPC, local clipboard/export                                                            | Development cannot authorize AWS; distribution/signing require release checks                                                             |
| Workspace       | Normal/combined entries, preview tabs, rename/exit, adjacent duplication, anchored selection, colored groups and whole-entry dragging | Each combined entry owns two to four panes; projected header placement/detachment and persistent dividers; only the active entry is shown |
| Navigation      | Retained connection selection, group-name substring search, lazy pages, streams, favorites/recents and resizable sidebar              | Automatic group/stream continuation; closing the last tab retains the selected connection; group search is case-sensitive                 |
| Event queries   | Clear/relative/absolute dates, adjacent timezone selection, automatic event continuation, server patterns and cancellation            | Up to 50 groups and 10,000 events per fetch; empty-page scans are bounded and retain continuation                                         |
| Insights        | CWLI submission, polling, partial/final results, scan statistics, cancellation, structured aggregation rows                           | At most 10,000 rows; no additional Insights-result pagination, SQL or PPL interface                                                       |
| Live monitoring | Official SDK Live Tail stream, sampling/error status, cancellation; explicit offline simulation                                       | Up to 10 Standard groups; selected streams require a single group; service sampling can omit events                                       |
| Visualization   | JSON/table/hybrid, sticky expanded rows, virtualized events, direct header reordering, live column resizing and inspection            | Header dragging stays in its pinning section and preserves hidden column slots; existing parsing/export bounds remain                     |
| Local tools     | Loaded-event text/level search, sorting, highlighting, copy, JSON/JSONL/CSV export, surrounding context                               | Local filtering/export operates on loaded events; automatic pagination can load more; context requires source metadata                    |
| Configuration   | Saved queries/history, per-group view presets, column formats, themes/density/fonts, shortcuts, refresh and buffer preferences        | Auto/JSON/IEC bytes/duration/local-UTC date formats; automatic refresh disabled by default; credentials/events are not persisted          |
| Authentication  | Main-process official profile provider, existing SSO sessions and supported role profiles                                             | No embedded SSO login/MFA prompt; no real AWS authentication test performed                                                               |
| Persistence     | Atomic writes/backups, close-time saves, combined-layout migration and repair, validated membership/order and label lifetimes         | Invalid split metadata dissolves safely while current valid views remain; malformed view data still requires backup recovery              |
| Distribution    | Electron Builder host-platform configurations: NSIS, DMG, AppImage                                                                    | Code signing, notarization, automatic updates and macOS/Linux verification remain release work                                            |

## Offline interpreter

Event patterns accept positive words and quoted phrases. Insights accepts `fields`, `sort @timestamp asc/desc`, `limit`, simple field equality, a literal `@message like /text/` filter, and terminal `stats count(*) as name [by field]`. Unsupported syntax errors explicitly; fixtures do not approximate the full CloudWatch language. See [README examples](../README.md#offline-query-examples).

## Final verification record

Verified version 0.1.4 locally on 2026-10-15. AWS tests used injected command transports. Desktop checks used isolated storage, fixtures and an immutable offline verification gate.

| Check                           | Final result                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                      | Passed independently and through the integrated build                                                                             |
| Isolated unit/integration suite | `npm test`: 299 tests passed in 34 files                                                                                          |
| Formatting                      | Prettier checks passed for source, tests, docs and package files                                                                  |
| Bundle and installer            | `npm run build` and `electron-builder --win nsis` passed                                                                          |
| Desktop suite                   | All 38 passed in 7.3 minutes with two workers, including the final packaged executable                                            |
| Windows app                     | `release/win-unpacked/AWS Log Explorer.exe` built and launched hidden                                                             |
| Installer                       | `release/AWS Log Explorer Setup 0.1.4.exe` built; unsigned; installation/uninstallation not performed                             |
| Dependency advisories           | Fresh scan not run: automatic approval review rejected external dependency-tree disclosure; lockfile dependency tree is unchanged |
| Real AWS                        | No requests, profiles, credentials or user application-data workspace accessed                                                    |
| Other release checks            | macOS/Linux, signing, physical OS input, screen readers and representative performance/security audits remain unverified          |

The final command set `EXPLORER_DESKTOP_PACKAGED=1` and ran Playwright with `--workers=2 --reporter=list,json --output test-results-0.1.4-verified`. The lifecycle suite covers development and packaged launches; the remaining suites exercise the packaged executable. Machine-readable results are in `test-results-0.1.4-verified/report.json`, with no skipped, flaky or unexpected tests. Hidden windows, Chromium focus emulation, temporary storage and intercepted native dialogs preserved desktop focus.

New trusted input covers shared header/tab floating previews, exact final two-/three-/four-panel rectangles, selected-position and whitespace detachment, singleton dissolution, cross-entry hover transfers and cancellation, tooltip dismissal on right click, relative/UTC absolute automatic dates, Clear restoring all history, fold/unfold in every viewer mode, virtualized row geometry and actual group pagination. Model/component tests cover every panel source/target/edge, unequal dividers, ownership/state preservation, group/stream continuation, repeated opaque event cursors, duplicate/busy/stale guards, empty-page limits and repeated-hour DST preservation.

Previous coverage remains: renderer idle/freeze regression, focused edits and natural close/save-failure handling, preview tabs, anchored selection, adjacent duplication, combined entry rename/exit and tooltips, direct column reorder/resize/pinning/sort, modifier focus, Hybrid scrolling, filters, exports, source context, Insights, persistence/recovery, strict references and custom-ID collisions. The offline fixture has no event or stream continuation; these paths use injected adapter/component tests. No real AWS interoperability claim is made.

The [0.1.4 investigation](panel-drag-and-controls-0.1.4.md) and [plan](panel-drag-and-query-controls-plan.md) record this batch. Earlier [combined-tab](combined-tabs-0.1.3.md), [interaction](interaction-fixes-0.1.2.md) and [renderer freeze](renderer-freeze-investigation.md) investigations remain available.

`release/artifact-manifest.json` records artifact sizes and hashes, generated by `python build/artifact_manifest.py`. Installer SHA-256: `26ec7300453f3e057c1f88f4b0c4f83149b19b11f45d4ed985b775b1b5d2cb3a`. Authenticode reports `NotSigned`.
