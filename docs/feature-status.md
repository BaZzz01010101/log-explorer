# Feature status

This describes implemented application paths and their current scope. Offline fixtures exercise the same service/preload/renderer path as AWS adapters, but do not establish real AWS interoperability or commercial production readiness.

| Area            | Implemented                                                                                                                    | Scope and limits                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop         | Electron window, sandboxed renderer, validated IPC, local clipboard/export                                                     | Development cannot authorize AWS; distribution/signing require release checks                                                                  |
| Workspace       | Independent tabs, close/reopen/cycling, named colored groups, direct pane drop targets, up to four panes, saved divider sizes  | Two-, three- and four-pane arrangements; dividers support pointer, keyboard and reset controls                                                 |
| Navigation      | Connections/regions, group prefix search, lazy pages, streams, favorites/recents, resizable sidebar                            | Stream search covers loaded names; region/profile choices use configured connection values                                                     |
| Event queries   | Time presets/custom ranges, server filter patterns, stream selection, multiple groups, continuation, cancellation              | Up to 50 groups in one connection/region and 10,000 events per fetch; continuation expires                                                     |
| Insights        | CWLI submission, polling, partial/final results, scan statistics, cancellation, structured aggregation rows                    | At most 10,000 rows; no additional Insights-result pagination, SQL or PPL interface                                                            |
| Live monitoring | Official SDK Live Tail stream, sampling/error status, cancellation; explicit offline simulation                                | Up to 10 Standard groups; selected streams require a single group; service sampling can omit events                                            |
| Visualization   | JSON/table/hybrid, nested arrays and literal keys, virtualized rows, configurable columns, inspection                          | Parsing, tree expansion, message display and column discovery have deliberate bounds; raw copy/export preserves full text within export limits |
| Local tools     | Loaded-event text/level search, sorting, highlighting, copy, JSON/JSONL/CSV export, surrounding context                        | Local filtering/export does not fetch unloaded data; context requires source group/stream metadata                                             |
| Configuration   | Saved queries/history, per-group view presets, column formats, themes/density/fonts, shortcuts, refresh and buffer preferences | Auto/JSON/IEC bytes/duration/local-UTC date formats; automatic refresh disabled by default; credentials/events are not persisted               |
| Authentication  | Main-process official profile provider, existing SSO sessions and supported role profiles                                      | No embedded SSO login/MFA prompt; no real AWS authentication test performed                                                                    |
| Persistence     | Versioned configuration, atomic writes, backup recovery, close-time save coordination                                          | Platform/restart/recovery verification belongs in the final record below                                                                       |
| Distribution    | Electron Builder host-platform configurations: NSIS, DMG, AppImage                                                             | Code signing, notarization, automatic updates and macOS/Linux verification remain release work                                                 |

## Offline interpreter

Event patterns accept positive words and quoted phrases. Insights accepts `fields`, `sort @timestamp asc/desc`, `limit`, simple field equality, a literal `@message like /text/` filter, and terminal `stats count(*) as name [by field]`. Unsupported syntax errors explicitly; fixtures do not approximate the full CloudWatch language. See [README examples](../README.md#offline-query-examples).

## Final verification record

Verified locally on 2026-10-14. AWS tests used injected command transports; Electron tests used fixtures and an immutable offline verification gate.

| Check                                      | Final result                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                                 | `npm run typecheck` passed                                                                                                                                          |
| Isolated unit/integration suite            | `npm test`: 120 tests passed in 14 files                                                                                                                            |
| Production bundle                          | Built by `npm run dist -- --win nsis`                                                                                                                               |
| Electron desktop regressions               | 9 tests passed in the final combined run, including trusted input, idle CPU, dragging, dividers, focused edits, restart, exports, context and multi-source Insights |
| Unpacked Windows application               | Built and launched: `release/win-unpacked/AWS Log Explorer.exe`                                                                                                     |
| Windows installer                          | Built: `release/AWS Log Explorer Setup 0.1.1.exe`; unsigned; installation/uninstallation not performed                                                              |
| Dependency advisory scan                   | `npm audit --json`: zero reported vulnerabilities                                                                                                                   |
| macOS/Linux builds                         | Not verified in this Windows session                                                                                                                                |
| Real AWS access                            | Not executed; prohibited during this development task                                                                                                               |
| Signing/security/performance release audit | Not completed                                                                                                                                                       |

There is no benchmark establishing responsiveness across all log volumes, hardware, accounts or regions. Future release validation should use representative datasets and the intended operating systems while preserving the AWS authorization boundary.

The final desktop run used `EXPLORER_DESKTOP_PACKAGED=1` for the deep-interaction and investigation suites; the lifecycle suite covers both unpackaged and packaged launches. All nine passed in 3.8 minutes. Packaged idle task time was approximately 1.5–3.2 ms per 1.81 seconds for unsorted, sorted and cleared-sort views. This is a regression check for the render loop, not a large-volume benchmark.

Desktop tests now use trusted Chromium pointer and keyboard input in hidden Electron windows. They cover actual tab dragging, divider controls, numeric editing, source/query workflows and real export files. Chromium focus emulation avoids activating desktop windows; native dialogs are intercepted in the test harness. Physical OS input and screen-reader behavior remain release checks. Natural window closure is verified by waiting for process exit code 0, including save-failure handling and a focused numeric edit. The [renderer freeze investigation](renderer-freeze-investigation.md) explains the initial synthetic-input coverage gap and its correction.

Distribution hashes and sizes are recorded in `release/artifact-manifest.json`, generated by `python build/artifact_manifest.py`. The installer SHA-256 is `c18196c9a99fce839213334c0e652cf79035a036bbfbff2038eb13065992e52e`. Authenticode verification reports `NotSigned`.
