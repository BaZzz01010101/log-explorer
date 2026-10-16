# Feature status

This describes implemented application paths and their current scope. Offline fixtures exercise the same service/preload/renderer path as AWS adapters, but do not establish real AWS interoperability or commercial production readiness.

| Area            | Implemented                                                                                                                                                   | Scope and limits                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop         | Electron window, sandboxed renderer, validated IPC, local clipboard/export                                                                                    | Development cannot authorize AWS; distribution/signing require release checks                                                                |
| Workspace       | Normal/combined entries, scroll/wrapped tab rows, middle-click close, preview/rename/exit, anchored selection and whole-entry dragging                        | Each combined entry owns two to four panes; projected header placement/detachment and persistent dividers; only the active entry is shown    |
| Navigation      | Profile/region dropdowns, group/stream virtual tree, explicit profile/region add/remove controls, substring search, lazy pages and favorites/recents          | Only the selected region is shown; automatic group/stream continuation; removal retains tabs and connections; group search is case-sensitive |
| Event queries   | Two-month calendar, segmented date/time wheel edits, relative durations and adjacent timezone, automatic event continuation, server patterns and cancellation | Up to 50 groups and 10,000 events per fetch; empty-page scans are bounded and retain continuation                                            |
| Insights        | CWLI submission, polling, partial/final results, scan statistics, cancellation, structured aggregation rows                                                   | At most 10,000 rows; no additional Insights-result pagination, SQL or PPL interface                                                          |
| Live monitoring | Official SDK Live Tail stream, sampling/error status, cancellation; explicit offline simulation                                                               | Up to 10 Standard groups; selected streams require a single group; service sampling can omit events                                          |
| Visualization   | JSON/table/hybrid, selected virtual rows, direct column reordering/resizing, docked resizable inspection and structured folding                               | Header dragging stays in its pinning section and preserves hidden column slots; existing parsing/export bounds remain                        |
| Local tools     | Loaded-event text/property/level filters, inline per-view literal highlights, advanced regex profiles with theme colors, copy/export and source context       | Local filtering/export operates on loaded events; automatic pagination can load more; context requires source metadata                       |
| Configuration   | Saved queries/history, per-group view presets, column formats, themes/density/fonts, shortcuts, refresh and buffer preferences                                | Auto/JSON/IEC bytes/duration/local-UTC date formats; automatic refresh disabled by default; credentials/events are not persisted             |
| Authentication  | Main-process official profile provider, existing SSO sessions and supported role profiles                                                                     | No embedded SSO login/MFA prompt; no real AWS authentication test performed                                                                  |
| Persistence     | Atomic writes/backups, close-time saves, combined-layout migration and repair, validated membership/order and label lifetimes                                 | Invalid split metadata dissolves safely while current valid views remain; malformed view data still requires backup recovery                 |
| Distribution    | Electron Builder host-platform configurations: NSIS, DMG, AppImage                                                                                            | Code signing, notarization, automatic updates and macOS/Linux verification remain release work                                               |

## Offline interpreter

Event patterns accept positive words and quoted phrases. Insights accepts `fields`, `sort @timestamp asc/desc`, `limit`, simple field equality, a literal `@message like /text/` filter, and terminal `stats count(*) as name [by field]`. Unsupported syntax errors explicitly; fixtures do not approximate the full CloudWatch language. See [README examples](../README.md#offline-query-examples).

## Final verification record

The normal `release/win-unpacked/AWS Log Explorer.exe` is now also 0.1.8 with matching verified executable/ASAR hashes. Two additional hidden checks passed against that exact path: profile/region selection and Hybrid quick highlighting with restart. Report: `.tmp/test-results-standard-0.1.8/report.json`. The older folder was backed up after the user app closed naturally; `.tmp/standard-build-update-0.1.8.json` records `updated`.

Verified version 0.1.8 locally on 2026-10-16. The user revised Explorer to use separate profile/region dropdowns, an exclusively group/stream tree, explicit connection add/remove controls and inline per-view quick highlighting.

| Check                 | Result                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Unit/integration      | 427 passed in 53 files; `.tmp/unit-0.1.8-final.json`                                                                    |
| Packaged desktop      | All 70 passed in 13.7 minutes; zero skipped, flaky or failed; `.tmp/test-results-0.1.8-final-verified/report.json`      |
| Focused desktop       | All 5 revised Explorer/settings/highlight checks passed before packaging; `.tmp/test-results-0.1.8-focused/report.json` |
| TypeScript/formatting | Integrated typecheck, Prettier and diff whitespace checks passed                                                        |
| Build                 | Main/preload/renderer build and versioned Windows NSIS packaging passed                                                 |
| App                   | `release/0.1.8/win-unpacked/AWS Log Explorer.exe`                                                                       |
| Installer             | `release/0.1.8/AWS Log Explorer Setup 0.1.8.exe`; unsigned; not installed                                               |
| Delivery              | Versioned build verified; standard-folder handoff state: `.tmp/standard-build-update-0.1.8.json`                        |
| Dependencies          | Lockfile dependency tree unchanged; external advisory scan not rerun                                                    |
| Real AWS              | No AWS requests, profile discovery, credentials or user workspace access during verification                            |

The complete suite retains the other 65 workspace, calendar, tab/pane drag/drop, viewer/inspector, advanced highlight, source-management and lifecycle cases. The five revised cases cover profile/region selection and group/stream-only levels, correct connection identities and keyboard traversal, removal/re-addition of profiles and regions across restart while keeping open tabs, and quick literal highlighting in JSON/Table/Hybrid and inspector content. Editing/clearing highlights preserves event counts and produces no query updates; the Hybrid case also verifies restart and independent new-view text. Focused model/component regressions cover old-view fallback and bounds, known-only choice lists, custom/object-like names, stable connection IDs and scroll reset on region changes.

Actual hidden captures were inspected for the flat tree/selectors, compact added-profile/region cards and highlighted messages/inspector. All evidence remains under `.tmp`. Verification windows remain hidden with trusted Chromium input and immutable AWS denial. Real AWS interoperability, physical OS input, screen readers, installation, signing and macOS/Linux remain separate checks.

The user's older app was running from `release/win-unpacked`, so its files and workspace were left intact. A hidden helper staged and hash-checked 0.1.8, waits for this full passing report and the old app to close naturally, then swaps the standard folder with a retained backup. Its state file records pending/success/failure explicitly; the versioned executable above is available immediately. The helper never launches/closes the user app or installs anything. Installed copies still require the new installer.

See [0.1.8 changes](explorer-selectors-0.1.8.md). `release/0.1.8/artifact-manifest.json` records the stable artifact hashes. Installer SHA-256: `6d7801735c9ec373916b477b6e1ecd276a9e706945a3fe66ee4df5454bc8984d`.

## Account Explorer verification record (0.1.7)

Delivery-path correction: the normal `release/win-unpacked/AWS Log Explorer.exe` now also contains 0.1.7, with the same verified executable/ASAR hashes as the versioned package. Its prior 0.1.5 folder is retained as a backup. One additional hidden Explorer test passed against the standard path; see `.tmp/test-results-standard-0.1.7/report.json`. The root `release/artifact-manifest.json` now records standard-path artifacts. Installed applications have not been upgraded.

Verified version 0.1.7 locally on 2026-10-16, including the final own-key lookup fixes. All 68 desktop checks launched the final versioned Windows package in hidden windows with isolated application storage and immutable AWS denial.

| Check                 | Result                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit/integration      | 425 passed in 52 files; `.tmp/unit-0.1.7-verified-final.json`                                                      |
| Packaged desktop      | All 68 passed in 13.5 minutes; zero skipped, flaky or failed; `.tmp/test-results-0.1.7-final-verified/report.json` |
| TypeScript/formatting | Typecheck, Prettier and diff whitespace checks passed                                                              |
| Build                 | Integrated build and versioned Windows NSIS packaging passed using the installed Electron runtime                  |
| App                   | `release/0.1.7/win-unpacked/AWS Log Explorer.exe`                                                                  |
| Installer             | `release/0.1.7/AWS Log Explorer Setup 0.1.7.exe`; unsigned; not installed                                          |
| Dependencies          | Lockfile dependency tree unchanged; external advisory scan not rerun                                               |
| Real AWS              | No real AWS, credentials, profile discovery or user application-data workspace accessed                            |

The full suite retains all 65 previous workspace, calendar, drag/drop, viewer, inspector, highlighting, source-management, lifecycle and geometry cases. Three additional native cases cover one/multiple accounts, independent region expansion, duplicate group names with correct source identity, logical keyboard traversal, account collapse, search and stream expansion in one tree, profile/region switches, natural restart and preserving open tabs. The final checks also exercise a restored connection ID and profile named `constructor`.

Focused regressions reproduced and fixed expanded-stream refresh stalls, obsolete pending stream replies, hide/re-enable request races, hidden favorites for legacy duplicate connection IDs and inherited object-property collisions. Actual hidden captures of the hierarchy and profile/region settings were inspected. All evidence is under `.tmp`; an earlier full run was intentionally stopped after review found the final key-handling fixes and is not counted as passing.

No OS window was shown for verification. Real AWS authentication/interoperability, physical input, screen readers, installation/uninstallation, signing and macOS/Linux remain separate checks. Hidden maximize/minimize verification retains the state-accessor emulation described in the 0.1.6 record.

See [Explorer changes and limits](explorer-accounts-0.1.7.md). `release/0.1.7/artifact-manifest.json` and the latest `release/artifact-manifest.json` record stable nonzero sizes and hashes. Installer SHA-256: `02d5106f2661f64ea8469d4f5305fc6216a67b1d9c123a7adb3181293368ddda`.

## Viewer and workspace verification record (0.1.6)

Verified version 0.1.6 locally on 2026-10-16, after the final immediate-minimize persistence fix. All desktop checks launched the same versioned Windows package with immutable AWS denial and isolated application storage.

| Check                     | Result                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Unit/integration          | 406 passed in 48 files; `.tmp/unit-0.1.6-verified-final.json`                                                      |
| Packaged desktop          | All 65 passed in 13.1 minutes; zero skipped, flaky or failed; `.tmp/test-results-0.1.6-final-verified/report.json` |
| TypeScript and formatting | Typecheck and full Prettier checks passed                                                                          |
| Build                     | Integrated build and Windows NSIS packaging passed using the installed Electron distribution                       |
| App                       | `release/0.1.6/win-unpacked/AWS Log Explorer.exe`                                                                  |
| Installer                 | `release/0.1.6/AWS Log Explorer Setup 0.1.6.exe`; unsigned; not installed                                          |
| Dependencies              | Lockfile dependency tree unchanged; no fresh external advisory scan                                                |
| Real AWS                  | No real AWS, credentials, profiles or user application-data workspace accessed                                     |

The suite covers calendar ranges and text geometry in both themes; tab wrapping, selection, middle-click and persistence; two- to four-pane projected drag/drop and detachment; column ordering/resizing, Hybrid scrolling and folding; initial/continuation loading and timestamp offsets; row/keyboard selection and docked inspection; property filters; exports/Insights; renderer idle/freeze and close/recovery paths. New checks exercise profile editing, row/structured text colors, theme overrides and restart, worker timeout on a catastrophic regex, repeated group/stream drops, source editor Apply/Cancel, drag cancellation and connection mismatch, exact window geometry restart, and immediate maximize/minimize persistence.

Native position/size checks use hidden BrowserWindows. The maximize/minimize regression emulates state accessors and emits the real main listeners to avoid showing a verification window. Physical maximize restoration, OS input, screen readers, installation/uninstallation, signing and macOS/Linux remain separate checks.

Actual hidden captures were inspected for the selected date label, initial/bottom loaders, resized inspector, both-theme structured highlighting and source editor. All generated evidence remains under `.tmp`. Earlier failing/interrupted reports are preserved and are not counted as passing runs. The final full run is independent of the earlier packaged-metadata and accessibility-locator harness corrections.

See [0.1.6 changes and limits](viewer-workspace-0.1.6.md). `release/0.1.6/artifact-manifest.json` records verified nonzero sizes/hashes. Installer SHA-256: `c13f3b78286b6bd46422750432255058ea387cc235f2828e5363db172d1810ab`.

## Calendar verification record (0.1.5)

Verified version 0.1.5 locally on 2026-10-15. Service tests use injected command transports. Desktop checks use isolated storage, fixtures and an immutable offline verification gate.

| Check                           | Final result                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                      | Passed independently and through the integrated build                                                                                                                 |
| Isolated unit/integration suite | `npm test`: 324 passed in 36 files                                                                                                                                    |
| Formatting                      | Prettier checks passed for source, tests, docs and package files                                                                                                      |
| Bundle and installer            | `npm run build` and `electron-builder --win nsis` passed                                                                                                              |
| Desktop suite                   | 47 checks verified: 46 passed in the full packaged run (9.2 minutes); the layout/capture/alignment check passed separately on the final rebuilt package (1.4 minutes) |
| Windows app                     | `release/win-unpacked/AWS Log Explorer.exe` built and launched hidden                                                                                                 |
| Installer                       | `release/AWS Log Explorer Setup 0.1.5.exe` built; unsigned; installation/uninstallation not performed                                                                 |
| Dependency advisories           | Not rerun; dependency tree unchanged; the earlier external scan required authorization to disclose metadata                                                           |
| Real AWS                        | No requests, profiles, credentials or user application-data workspace accessed                                                                                        |
| Other release checks            | macOS/Linux, signing, physical OS input, screen readers and broad performance/security audits remain unverified                                                       |

The full command set `EXPLORER_DESKTOP_PACKAGED=1` and ran Playwright with `--workers=2 --reporter=list,json --output .tmp/test-results-0.1.5-verified`. The lifecycle suite includes development and packaged launches; other suites use the packaged executable. Its report is `.tmp/test-results-0.1.5-verified/report.json`: 46 passed, one failed during Playwright screenshot capture of a hidden window after the normal-layout assertions had passed. Native hidden-window capture corrected the test harness, and the affected test then passed in `.tmp/test-results-0.1.5-calendar-fit/report.json`. Visual inspection subsequently found a vertically misaligned Custom label; a new text-geometry assertion reproduced an 11.26px offset. The only production change after the full run set that block label's height to auto. The app and installer were rebuilt, and the complete layout/capture/alignment test passed against the final package in `.tmp/test-results-0.1.5-calendar-fit-final-green/report.json`. Full-suite repetition after this one CSS property change was not performed. All reports, including the alignment regression's red report, are preserved. There were no skipped or flaky tests. Hidden windows, Chromium focus emulation, isolated storage and intercepted native dialogs preserved desktop focus.

Nine new trusted desktop cases cover two-click inclusive range selection, same/reversed selection, month navigation, focused wheel and arrow edits with caret retention, Cancel/Escape/outside clicks without queries, arbitrary relative duration/unit persistence, exact canonical DST/subsecond restoration, duration bounds, immediate toolbar shortcuts, and light/dark layout fit in normal/narrow panes. The initial baseline reproduced the missing separate fields before implementation. Focused calendar/date/context verification passed all 13 cases before the packaged run.

Model/component tests cover complete 23-hour and 25-hour local days, inclusive final milliseconds, untouched repeated-hour precision, leap years, month-end clipping, time segment wrapping, native non-passive wheel handling, focus guards, callback/selection persistence, relative query construction/restoration and unique calendar grids at years 0001/9999. Review found and fixed repeated last-day cells at the maximum calendar year.

The prior tab/panel drag, projected geometry, detach/dissolution, multi-selection, rename/exit, column reordering/resizing, modifier focus, Hybrid scrolling, message folding, automatic pagination, renderer idle/freeze, filters, exports, Insights, source context and persistence/recovery cases remain in the combined suite. Stream/event continuation uses injected tests because the desktop fixtures fit one service batch. No real AWS interoperability claim is made.

Existing generated evidence was moved into ignored `.tmp`: 33 directories, 84 files, matching file hashes. Copies of 43 formerly tracked generated files remain there; their tracked deletions remove results from source control. Default Playwright output is `.tmp/test-results`; optional JSON/HTML examples also use `.tmp`. The relocation manifest is `.tmp/test-artifact-relocation-2026-10-15.json`. Earlier 0.1.4 results remain at `.tmp/test-results-0.1.4-verified/report.json`.

See the [0.1.5 calendar notes](calendar-filter-0.1.5.md) and [plan](calendar-filter-plan.md). Earlier [panel/query controls](panel-drag-and-controls-0.1.4.md), [combined tabs](combined-tabs-0.1.3.md), [interaction fixes](interaction-fixes-0.1.2.md) and [renderer freeze](renderer-freeze-investigation.md) investigations remain available.

The archived `.tmp/artifact-manifest-0.1.5-final.json` records the 0.1.5 artifact sizes and hashes. Installer SHA-256: `737ef789e42e0732151c76defd45c92634012b0c6d526ecfdeccdd76c8a8ebfe`. Authenticode reports `NotSigned`.
