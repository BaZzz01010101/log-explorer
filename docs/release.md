# Building and releasing

## Latest local verification build (0.1.24)

Light-theme active tabs now use the white body background and inactive tabs use the pale gray hover surface. Multi-selected active tabs retain a lighter blue tint than inactive selections; drag feedback and dark-theme colors retain their existing behavior.

TypeScript, formatting, production build and NSIS packaging passed. All 569 unit/integration tests and three focused packaged startup/tab/tooltip checks passed. Separate hidden packaged rendering checks verified actual normal and multi-selected colors in both themes. This is targeted verification, not a full desktop-suite run. Evidence: `.tmp/final-verification-0.1.24.json`, `.tmp/tab-colors-024-packaged.json`, `.tmp/unit-0.1.24-release.json` and `.tmp/test-results-0.1.24-release/report.json`. The verified standard-folder update waits for the running app to exit naturally, with the previous build retained.

## Earlier local verification build (0.1.23)

Application menus now close peers, outside clicks, window blur and Escape consistently. Group/stream row menus own copy-name and ARN actions. Custom tooltips follow the theme, allow hover and native text selection/copy, and preserve menu/popover ownership. Explorer defaults to case-insensitive matching across pages, with configurable Alt+E regex and Alt+C match-case shortcuts. Structured fields use one action menu before the key. Valid JSON strings can be decoded into temporary foldable violet-marked values; columns, local filters and record/CSV serialization use those values while original messages and full-event exports stay unchanged.

All 569 unit/integration tests in 74 files and 88 targeted packaged desktop checks in 17 files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.23, not a full desktop-suite run. Native checks cover menu exclusivity and Escape focus, tooltip geometry and real mouse selection/copy inside overlays, both themes, configurable shortcuts, nested escaped JSON paths, projection lifetime, CSV/record copies, Live selection, highlight scrolling, column dragging/resizing and split layouts. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. Independent static review found no remaining material issues; native regressions reproduced and fixed tooltip trigger-style leakage, overlay tooltip selection ownership, wildcard stream ARNs and menu Escape closing the inspector. The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.23.json`, `.tmp/unit-0.1.23-release.json`, `.tmp/test-results-0.1.23-release/report.json` and `.tmp/standard-build-update-0.1.23-release.json`.

Artifact hashes: `release/0.1.23/artifact-manifest.json`; executable: `release/0.1.23/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and hard offline with isolated storage and intercepted clipboard writes. No real AWS session was tested. The normal app was never stopped or launched; no installer was installed. Changes remain uncommitted.

## Earlier local verification build (0.1.22)

Regex workers now persist across scrolling and Live batches, retaining completed results and preparing loaded offscreen events in bounded batches. Visible cache misses take priority; the full-result cache is bounded to 10,000 entries and an estimated 32 MiB of payload. Unchecked rows show a brief preparation placeholder instead of false non-matching content. Rule/theme changes, event edits/removal, overview marks and timeout recovery remain covered. Live source context now remains stable across routine updates, preserving cell DOM and native text selection. Pausing follow cancels its in-flight scroll target; reception continues.

All 560 unit/integration tests in 72 files and 39 targeted packaged desktop checks in eight files passed with no failures, skips or flaky results. This is targeted verification of 0.1.22, not a full desktop-suite run. Hidden painted-frame checks cover rapid scrolling with delayed workers in both themes and all event modes. Live selection checks drag both directions across literal/profile marks, receive events while dragging, retain the exact range after further arrivals and verify original text-node identity. Profile editing, preview timeout recovery, persistence, selected/hover colors, pinned columns, inspector/overview, copies and natural close/save are covered. TypeScript, formatting, whitespace, production build and NSIS packaging passed. The verified staged update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.22.json`, `.tmp/unit-0.1.22-final-3.json`, `.tmp/test-results-0.1.22-final/report.json`, `.tmp/test-results-highlight-extra-0.1.22-final-2/report.json` and `.tmp/standard-build-update-0.1.22-final.json`.

Artifact hashes: `release/0.1.22/artifact-manifest.json`; executable: `release/0.1.22/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and hard offline with isolated storage and intercepted OS clipboard writes. The normal user app was never forcibly closed or launched. The installer was not installed. Changes remain uncommitted.

## Earlier local verification build (0.1.21)

Selected event rows now use the theme selection background and text color ahead of profile row colors, even without hover. Hover subtly mixes neutral gray into the current regular, selected or regex-highlighted background. Pinned and unpinned cells and the Hybrid gutter share one resolved color; the partial selection outline and inset shadow are removed. Expanded details keep their colors on hover, and text-match highlights remain available. The change is confined to row CSS.

All 550 unit/integration tests in 72 files and 32 targeted packaged desktop checks in eight files passed with no failures, skips or flaky results. This is targeted verification of 0.1.21, not a full desktop-suite run. Native checks cover both themes and all event modes, row backgrounds and foregrounds, foreground-only profiles, hover in each state, horizontally scrolled pinned columns, expanded details, multiple selection/copy, inspector/overview, Live Tail and natural save/close. TypeScript, formatting, whitespace, production build and NSIS packaging passed. The standard launch folder contains 0.1.21, with the previous build retained. Three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.21.json`, `.tmp/unit-0.1.21-final.json`, `.tmp/test-results-0.1.21-final/report.json`, `.tmp/test-results-row-legacy-0.1.21-final/report.json` and `.tmp/standard-build-update-0.1.21-final.json`.

Artifact hashes: `release/0.1.21/artifact-manifest.json`; executable: `release/0.1.21/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and hard offline with isolated storage and intercepted OS clipboard writes. The installer was not installed. Changes remain uncommitted.

## Earlier local verification build (0.1.20)

Live Tail now distinguishes connecting, connected and stopped sessions, retains matching history and counts newly received events. Connected empty sessions wait without an endless loader. Follow Live scrolls independently of reception and pauses for selection, pointer or keyboard scrolling. Stop and failed/ended sessions remain stopped even with historical refresh enabled; Retry Live explicitly reconnects. Time presets, Run and mode changes return to history. Silent streams abort after 30 seconds without protocol updates. Complete service batches reach the existing bounded buffer, preserving the newest events.

All 550 unit/integration tests in 72 files and 29 targeted packaged desktop regressions in seven files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.20, not a full desktop-suite run. Hidden desktop checks cover quiet and active streams, automatic reception, history retention, wheel and keyboard follow controls, Stop, time presets, Run, Events/Insights transitions, copy, multiline rows, inspector/overview and natural close/save behavior. TypeScript, formatting, whitespace, production build and NSIS packaging passed. Independent review found the keyboard-follow gap; its regression failed before the fix. The staged standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.20.json`, `.tmp/unit-0.1.20-final.json`, `.tmp/test-results-0.1.20-final/report.json` and `.tmp/standard-build-update-0.1.20-final.json`.

Artifact hashes: `release/0.1.20/artifact-manifest.json`; executable: `release/0.1.20/win-unpacked/AWS Log Explorer.exe`. AWS adapter tests use injected transports; desktop checks use hidden hard-offline windows and isolated storage. No real AWS session was tested. The installer was not installed. Changes remain uncommitted.

## Earlier local verification build (0.1.19)

Highlights settings now use a compact profile section above a sortable rule table and one selected-rule detail panel. Pointer/keyboard dragging, move buttons and numeric priority update the existing saved order. Enable checkboxes, scope/path, target, regex and color swatches remain visible in the table; shared/theme colors and all matching options remain editable in the detail panel. A collapsible live preview retains its sample and pauses matching while folded. Table/Hybrid event text is directly selectable with a text cursor, including highlighted spans, while row selection, copy shortcuts and inspector navigation remain available.

All 542 unit/integration tests in 72 files and 32 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.19; the prior full 116-case run belongs to 0.1.16. Native checks cover both themes, smaller windows, drag priority and cancellation, rule/profile add/delete, live preview, structured and theme-specific colors, persistence after restart, regex timeout recovery and native pointer text selection. Existing copy, inspector, overview, column-dragging and natural-close checks passed. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The staged standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.19.json`, `.tmp/unit-0.1.19-final.json`, `.tmp/test-results-0.1.19-final/report.json`, `.tmp/test-results-highlights-0.1.19-final/report.json` and `.tmp/standard-build-update-0.1.19-final.json`.

Artifact hashes: `release/0.1.19/artifact-manifest.json`; executable: `release/0.1.19/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and offline with isolated storage and intercepted OS clipboard writes. The installer is unsigned and was not installed. Changes remain uncommitted.

## Earlier local verification build (0.1.18)

Selected events can be copied as raw messages or newline-delimited JSON records through the toolbar menu, row context menu and keyboard. Records preserve visible column IDs and order, original JSON value types and missing values as null. Hybrid primary rows remain one line for multiline messages, including with wrapping enabled; expanded details, the inspector and copying retain the full raw text.

All 542 unit/integration tests in 72 files and 29 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.18; the prior full 116-case run belongs to 0.1.16. Native checks cover Table/Hybrid/JSON, sorted and filtered selection, pin order, hidden columns, typed fields, native text-copy behavior, both themes and full multiline data retention. Existing inspector, query, overview, export, column-dragging and natural-close checks also passed. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The standard launch folder contains 0.1.18, with the previous build retained. Three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.18.json`, `.tmp/unit-0.1.18-final.json`, `.tmp/test-results-0.1.18-final/report.json` and `.tmp/standard-build-update-0.1.18-final.json`.

Artifact hashes: `release/0.1.18/artifact-manifest.json`; executable: `release/0.1.18/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and offline with isolated storage and intercepted OS clipboard writes. The installer is unsigned and was not installed. Changes remain uncommitted.

## Earlier local verification build (0.1.17)

Centered Table/Hybrid column resize highlights and hit targets on their separators; centered the inspector divider and kept it above the scrollbar overview with 3px of clearance for full map hit testing. Unclipped column handles and ordered pinned-header layers keep both sides draggable. Explorer and both split-pane axes retain their existing alignment.

All 534 unit/integration tests in 71 files and 23 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.17; the prior full 116-case run belongs to 0.1.16. Native tests cover both themes, pinned and horizontally scrolled headers, drag starts on either side of the actual border, Escape/keyboard resizing and normal/increased inspector zoom. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The standard launch folder contains 0.1.17, with the previous build retained. All three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.17.json`, `.tmp/unit-0.1.17-final.json`, `.tmp/test-results-0.1.17-verified/report.json` and `.tmp/standard-build-update-0.1.17-verified.json`.

Artifact hashes: `release/0.1.17/artifact-manifest.json`; executable: `release/0.1.17/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and offline. The installer is unsigned and was not installed. Changes remain uncommitted.

## Earlier local verification build (0.1.16)

Checkbox level selection with exclusive text clicks and additive Ctrl/Cmd clicks; column-header move/pin menus; automatic query-mode refresh with isolated drafts; primary-row-only hover preserving profile colors; full-height Explorer click/drag targets; themed regex tooltips and filled-dot glyphs; centered source-removal buttons and distinct multi-source icons.

All 534 unit/integration tests in 71 files and all 116 packaged desktop regressions in 26 files passed, with no failures, skips or flaky results. Independent review and native tests reproduced and fixed hidden-column editor pinning, early Escape closing the inspector, inactive query-mode text affecting results, and level-button label alignment. No remaining material findings.

TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The standard launch folder contains 0.1.16, with the previous build retained. All eight hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.16.json`, `.tmp/unit-0.1.16-final.json`, `.tmp/test-results-0.1.16-final/report.json` and `.tmp/standard-build-update-0.1.16-final.json`. Artifact hashes: `release/0.1.16/artifact-manifest.json`; versioned executable: `release/0.1.16/win-unpacked/AWS Log Explorer.exe`.

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.16 --config.electronDist=node_modules/electron/dist`, then `python build/artifact_manifest.py --release-dir release/0.1.16`. The installer is unsigned and was not installed. Verification stayed hidden and hard offline with isolated storage.

## Earlier local verification build (0.1.15)

Favorite aliases, exclusive cursor menus and theme-aware tooltips; non-editable selectors and guarded paged regex search; mixed group/stream batch actions and dragging; split layouts beyond four panes; ordered event multi-selection/copy; and remembered AWS access with existing-query cancellation.

All 515 unit/integration tests in 68 files and all 100 packaged desktop regressions in 22 files passed, with no failures, skips or flaky results. Independent review reproduced and corrected preset consistency, interrupted regex-scan resumption, overlapping menu transitions, keyboard context-menu propagation and Insights cancellation after access revocation. No remaining material findings.

TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The standard launch folder contains 0.1.15, with the previous build retained. All five hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.15.json`, `.tmp/unit-0.1.15-final.json`, `.tmp/test-results-0.1.15-verified/report.json` and `.tmp/standard-build-update-0.1.15-verified.json`. Artifact hashes: `release/0.1.15/artifact-manifest.json`; versioned executable: `release/0.1.15/win-unpacked/AWS Log Explorer.exe`.

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.15 --config.electronDist=node_modules/electron/dist`, then `python build/artifact_manifest.py --release-dir release/0.1.15`. The superseded keyboard-fix package is retained separately. The installer is unsigned and was not installed. Verification stayed hidden and hard offline with isolated storage and fake transport/clipboard probes.

## Earlier local verification build (0.1.14)

Favorite menus follow the pointer and support alias renaming; mixed-source views show Source automatically; selected rows retain selection hover color. See [revision notes](view-polish-0.1.14.md).

All 482 unit/integration tests in 62 files and 21 targeted packaged desktop regressions passed, with no failures, skips or flaky results. The targeted suite covers the four requested changes plus source editing and regional drops, exports/Insights, column drag/resize, highlight profiles, Hybrid geometry and table idle responsiveness. The previous full 88-case run belongs to 0.1.13; it is not counted as a full-suite run for this revision.

The standard launch folder contains 0.1.14, with the previous build retained. All four hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.14.json`, `.tmp/unit-0.1.14-final.json`, `.tmp/test-results-0.1.14-final/report.json`, `.tmp/standard-build-update-0.1.14.json` and the standard smoke report when available. The versioned executable is `release/0.1.14/win-unpacked/AWS Log Explorer.exe`.

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.14 --config.electronDist=node_modules/electron/dist`, then `python build/artifact_manifest.py --release-dir release/0.1.14`. The installer is unsigned and not installed.

## Earlier local verification build (0.1.13)

All 477 unit/integration tests and all 88 packaged hidden desktop cases passed on 2026-10-19, with no failures, skips or flaky results. Favorites now save complete normal/combined tab configurations. AWS access choices persist separately from workspace imports and enabling access refreshes Explorer and AWS log views. The advanced connection editor is removed. See [revision notes](saved-views-and-access-0.1.13.md).

The standard launch folder contains the matching 0.1.13 package, with the previous build retained. All four hidden standard-path checks passed. State: `.tmp/standard-build-update-0.1.13.json`; smoke report: `.tmp/test-results-standard-0.1.13/report.json` when available. The versioned executable is `release/0.1.13/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.13-final.json`, `.tmp/test-results-0.1.13-final/report.json`, `.tmp/final-verification-0.1.13.json`.

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.13 --config.electronDist=node_modules/electron/dist`, then `python build/artifact_manifest.py --release-dir release/0.1.13`. The installer is unsigned and not installed.

## Earlier local verification build (0.1.12)

All 466 unit/integration tests and all 84 packaged hidden desktop cases passed against the final package. Evidence: `.tmp/unit-0.1.12-verified.json`, `.tmp/test-results-0.1.12-final-verified/report.json` and `.tmp/final-verification-0.1.12.json`. Explorer pane drops, source badge/count presentation and header contrast are described in [the revision notes](explorer-splits-0.1.12.md).

The current standard-path app is still running. A hidden helper will promote the matching staged build after natural exit, retain the previous folder, verify hashes and then run four hidden offline checks against the exact standard path. It never closes or launches the user app. Handoff: `.tmp/standard-build-update-0.1.12.json`; future smoke report: `.tmp/test-results-standard-0.1.12/report.json`. The versioned build is already available at `release/0.1.12/win-unpacked/AWS Log Explorer.exe`.

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.12 --config.electronDist=node_modules/electron/dist`, then `python build/artifact_manifest.py --release-dir release/0.1.12`. The installer is unsigned and not installed.

## Earlier local verification build (0.1.11)

All 460 unit/integration tests passed. The full 81-case hidden desktop run passed before the final main-process query guard; all 11 source/investigation cases passed again against the final package. Reports: `.tmp/test-results-0.1.11-reviewed-verified/report.json` and `.tmp/test-results-0.1.11-budget-final/report.json`. Package comparison confirms only main-process guards changed. Source badges, automatic source queries, region isolation and newest-first streams are described in [the release notes](sources-0.1.11.md). The installer is unsigned and not installed. Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.11 --config.electronDist=node_modules/electron/dist`, then generate `release/0.1.11/artifact-manifest.json` using `python build/artifact_manifest.py --release-dir release/0.1.11`.

The normal-folder handoff state is `.tmp/standard-build-update-0.1.11.json`. Promotion requires all 81 full-run checks and 11 final-package checks, matching hashes and natural app exit; it retains the previous build and never launches/closes the user app. [Feature status](feature-status.md) records results and limitations.

## Earlier local verification build (0.1.10)

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.10 --config.electronDist=node_modules/electron/dist`, then run `python build/artifact_manifest.py --release-dir release/0.1.10` after packaging exits. All 78 hidden packaged desktop cases were verified across the full run and one corrected-expectation rerun; audited summary: `.tmp/desktop-verification-0.1.10.json`. Raw reports remain linked in [Feature status](feature-status.md). Two additional checks use 5,000 events and a stalled offscreen regex; another verifies formatted timestamp matching across a timezone/year boundary. The installer is unsigned and not installed.

The normal-folder handoff state is `.tmp/standard-build-update-0.1.10.json`. Promotion requires all 78 passing checks, matching artifact hashes and natural app exit, with a retained backup. It never launches/closes the user app. [Feature status](feature-status.md) records results and limitations.

## Earlier local verification build (0.1.9)

Build with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.9 --config.electronDist=node_modules/electron/dist`, then run `python build/artifact_manifest.py --release-dir release/0.1.9` after packaging exits. All 74 hidden packaged desktop checks passed against the corrected artifact; report: `.tmp/test-results-0.1.9-final-verified-corrected/report.json`. Two extra checks use 5,000 events and a stalled offscreen regex. The installer is unsigned and has not been installed.

The normal-folder handoff is tracked in `.tmp/standard-build-update-0.1.9.json`. It promotes only matching corrected hashes after the full passing report and natural app exit, retaining the prior folder. It never launches/closes the user app. [Feature status](feature-status.md) records evidence and limits. Earlier build commands below retain their original version context.

## Local build

Use Node.js 24 and the included npm lockfile:

```sh
npm ci
npx install-electron --no
npm run typecheck
npm test
npm run build
npm run test:desktop
npm run package
```

`install-electron` downloads the Electron runtime on demand; use it when the binary is missing. The [official installation guide](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md) documents this command.

`build` writes main/preload/renderer bundles to `out/`. `package` builds an unpacked host-platform application under `release/`. `npm run dist` builds the configured distributable: Windows NSIS installer, macOS DMG or Linux AppImage. Configuration is in `electron-builder.yml`. Packaging can download Electron or builder tools; it does not require AWS access.

The 0.1.8 verification build uses `release/0.1.8/` to preserve a running older build. Build it with `node node_modules/electron-builder/out/cli/cli.js --win nsis --config.directories.output=release/0.1.8 --config.electronDist=node_modules/electron/dist`; the installed Electron distribution avoids another runtime download. After packaging exits successfully, run `python build/artifact_manifest.py --release-dir release/0.1.8` to record nonempty, stable artifact hashes. Do not hash an installer while packaging is still writing it.

For the versioned packaged desktop checks, set `EXPLORER_DESKTOP_PACKAGED=1` and `EXPLORER_DESKTOP_APP_PATH` to the absolute path of `release/0.1.8/win-unpacked/AWS Log Explorer.exe` in the test runner's environment. Set `PLAYWRIGHT_JSON_OUTPUT_NAME` to an absolute report path under `.tmp`, then run `npx playwright test --workers=2 --reporter=list,json --output=.tmp/test-results-0.1.8-final-verified`. Use a fresh output directory to preserve previous evidence. The executable override is consumed only by the test helper; each app launch still receives an isolated environment and immutable offline/background flags.

After versioned verification, update the normal `release/win-unpacked` launch folder when the application is closed. Retain the previous folder as a backup, copy the verified package, and compare executable/ASAR hashes. Also place the matching installer in `release/`. Keeping only a versioned build leaves users opening the older standard executable.

For 0.1.8, the existing app was running from the standard folder. A hidden handoff helper staged and hash-checked the matching package, waited for the full passing desktop report and for that app to close naturally, then promoted the standard folder and retained a backup. The handoff completed; `.tmp/standard-build-update-0.1.8.json` records `updated`. The standard executable reports 0.1.8.0, and two additional hidden checks passed against that exact path in `.tmp/test-results-standard-0.1.8/report.json`. No user workspace was accessed or application installed. Installed copies require the new installer separately.

## Release requirements

- **Windows:** build and test on Windows, configure Authenticode signing and validate installation/uninstallation, user-selected paths, shortcuts and upgrades. The checked-in NSIS configuration supports an installation-directory choice. Signing credentials and a signed release are not supplied.
- **macOS:** use a macOS release environment, Apple signing credentials and notarization; validate Intel/Apple Silicon targets, window lifecycle and installation. This Windows development session does not verify macOS artifacts.
- **Linux:** build and test the AppImage in a Linux release environment; check sandbox support, desktop integration and supported distributions. Linux artifacts are not verified by Windows tests.

Keep signing secrets outside the repository and workspace files. Signing/notarization is part of the release pipeline; see [Electron code-signing guidance](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md). Automatic updates, a release feed and update signing are not configured.

Before publishing, record artifact paths, hashes, test results and platform versions in [feature status](feature-status.md). Verify persistence across restart, close-time saves, recovery, keyboard navigation, accessible controls and representative large datasets. All checks in this development task must remain offline. Real AWS verification requires the user's separate, specific authorization; neither packaging nor tool approval grants it.

## Windows development sandbox troubleshooting

This managed Windows environment can apply directory ACLs that prevent Electron's sandboxed processes from reading a checkout or runtime files, producing startup/spawn failures. This is an environment-specific issue, not a reason to disable the application's Chromium sandbox. Check the failing paths and inherited permissions, then use an approved readable development location or narrowly correct the affected ACLs. Avoid blanket permission changes and `--no-sandbox` as a release workaround.

Keep the preload sandbox and context isolation enabled. Missing-runtime errors should first be addressed with `npx install-electron --no`, separately from filesystem-permission failures. The desktop test harness provides temporary application storage and an isolated environment; it must never enable AWS access.

## Data and rollback

For packaged verification, launch `AWS Log Explorer.exe --offline-verification`. This flag hard-disables AWS access even if the UI or a restored workspace requests it. Automated tests additionally pass `--background-verification`, which keeps the window hidden, disables background throttling and also hard-disables AWS. Chromium focus emulation lets trusted mouse and keyboard input exercise the real renderer without taking desktop focus. The suite uses actual pointer drags rather than DOM click dispatch. Physical OS input, screen-reader behavior and installer installation/uninstallation remain separate release checks. See the [renderer freeze investigation](renderer-freeze-investigation.md) for the defect missed by the original synthetic-input tests.

Workspace configuration lives in Electron's per-user application-data directory as `workspace.json`, with a previous-file backup. Log payloads are kept in memory and exported only through an explicit local save dialog. Back up configuration before distributing an incompatible workspace migration. Preserve the original file and surface recovery warnings when loading fails.

The current implementation is version `0.1.22`. The release configuration and offline tests provide a starting point for distribution; they do not establish a signed, security-audited or commercially validated production release.

The standard launch folder was updated to 0.1.11 after natural app exit, with a retained backup and matching executable/ASAR/installer hashes. Two additional hidden checks passed against the exact standard path: `.tmp/test-results-standard-0.1.11/report.json`.
