# Feature status

## Favorite visibility and useful tooltips (0.1.64)

Favorite rows have distinct hover colors in both themes. Pending deletion keeps the whole row highlighted until Delete or Cancel is chosen, with compact bordered buttons and a filled destructive action.

Both tooltip paths compare their content with the actual visible label at open time. Identical fully visible text is suppressed, including wrapped inspector metadata; clipped text keeps its full tooltip. Icon hints, shortcut descriptions, renamed views, multiple sources and split-member lists remain available and selectable. Ordinary favorite and tab hints use the automatic short source name instead of duplicating it with a raw path.

Verified 1,097 unit tests and 24 targeted hidden/offline packaged desktop checks, with no failures, skips or flaky results. Type checking, production build, formatting, whitespace checks and NSIS packaging pass. Native checks cover both themes, persistent confirmation, actual hover contrast, wrapped versus clipped metadata, tooltip selection/copying, menu exclusivity and rapid closed-tab hovering. Evidence: `.tmp/desktop-verification-0.1.64.json`; artifact hashes: `release/0.1.64/artifact-manifest.json`. No real AWS requests or installer installation were performed.

## Favorite confirmation and filter controls (0.1.63)

Favorites offer Open/Rename/Delete, plus a hover/focus trash button and persistent inline Delete/Cancel confirmation. Live and custom-range hover tooltips are removed. Local filtering and quick highlighting have independent per-view case/regex controls, contextual configurable Alt+C/Alt+E defaults and current shortcut hints.

Local matching/evidence use messages and the full stream identifier only; stream date/version prefixes and other event metadata are excluded. Regex runs in a cancellable worker with cached Live results, stable row references and explicit syntax/timeout/oversize errors. Property actions switch regex searches to plain property mode; exports cannot silently use partially evaluated results. Regex bounds are 8,192 pattern characters, 524,288 message characters and bounded worker execution time. Unicode zero-width matches and empty-data validation have regressions.

Verified 1,081 unit tests, type checking, production build, formatting and 41 targeted hidden/offline packaged desktop checks, including both themes, menu exclusivity, source metadata exclusions, scoped shortcuts, clear/undo, Live and native text selection. No real AWS requests or installer installation were performed. Evidence: `.tmp/desktop-verification-0.1.63.json`.

## Tab context menu (0.1.62)

Removed **Move to a new split** from tab context menus. The duplicate action is named **Duplicate tab** and preserves the original label for normal tabs, renamed tabs, split tabs and their member views. New IDs and independent configurations are retained, and duplicates remain adjacent to their originals.

Verified 1,047 unit tests, type checking, production build and four targeted hidden/offline packaged desktop checks. The checks cover the menu removal, duplicate name/order/independence and pane-header splitting in both themes. No real AWS requests or installer installation were performed. Evidence is in `.tmp/desktop-verification-0.1.62.json`.

## Events and tab navigation (0.1.61)

Removed Insights execution and controls, safely restored older view configurations as Events, fixed hidden-source local matching, centered filter handles and removed the redundant help button. Saved/recent search menus hide empty sections and allow more visible entries. Pane splitting duplicates the current view; recent-focus shortcuts and visual-order shortcuts are separate.

Verified 1,047 unit tests and 43 targeted hidden/offline packaged desktop checks, with zero failures, skips or flaky results. Type checking, production build, formatting, whitespace and Windows packaging passed. No real AWS calls or installer installation were performed. See [behavior and evidence](events-and-tab-navigation-0.1.61.md).

## Final verification record (0.1.28)

Tab reorder painting uses the existing drop reducer order. All visible tabs slide into their proposed slots at their own widths. Stable logical slots preserve insertion and delayed hover activation. Direction reversals, wrapped rows and separate pin-row crossings keep accurate, unclipped previews. Wrapped height includes borders and existing empty-row content, avoiding unnecessary scrollbars. Floating split-placement previews remain available. Live sessions pause when their view is hidden and reconnect for new events on return, preserving loaded events and received counts. All visible split panes stay live, manual Stop stays stopped even if tabs change before cancellation finishes, and historical automatic refresh skips hidden tabs. Inspector field menus add Copy value using the full current decoded/deserialized value, with JSON formatting for objects and arrays.

All 618 unit/integration tests in 80 files and 42 distinct targeted packaged desktop scenarios in six files passed. The broad candidate passed all 42 checks. After correcting the explicit Stop/switch race in useLogJobs.ts, all 11 affected Live/field cases passed again on the final package; unchanged tab/pane code retains its 31-case verification. Both native runs have no failures, skipped or flaky cases. The aggregate records each candidate manifest and report explicitly. This is targeted verification, not the full desktop suite. Checks cover unequal tab widths, both themes, shared/separate/wrapped layouts, animated reversal from first/middle/last slots, wrapped strip overflow, pin crossing, Explorer drops, combined tabs, split/panel transfers and cancellation. Live verification observes actual fixture-session cancellation while hidden, absence of further packets, fresh-session resumption, retained history, explicit Stop, mode changes and Table/Hybrid text selection. Field tests intercept clipboard writes and verify decoded text, deserialized nested values, raw-message preservation, filtering and columns. Unit checks cover split visibility, delayed and failed cancellation, source changes while asleep and inactive refresh. The same final painting assertion reproduces persistent overlap in the old 0.1.27 package. Independent reviews found no further concrete issues after correcting cross-pin clipping. TypeScript, formatting, whitespace, production build and NSIS packaging passed. Real AWS, keyboard drag animation and all display scaling combinations were not separately exercised.

The standard-folder build was updated after the previous app exited naturally; its backup is retained and final artifact hashes match. All three hidden exact-standard-path smoke checks passed. Evidence: `.tmp/final-verification-0.1.28.json`, `.tmp/unit-0.1.28-final2.json`, `.tmp/desktop-verification-0.1.28-final2.json` and `.tmp/standard-build-update-0.1.28-final3.json`. Artifact hashes: `release/0.1.28-final/artifact-manifest.json`; executable: `release/0.1.28-final/win-unpacked/AWS Log Explorer.exe`.

## Offline interpreter

Event patterns accept positive words and quoted phrases. Unsupported syntax errors explicitly; fixtures do not approximate the full CloudWatch language. Insights execution has been removed. See [README examples](../README.md#offline-query-examples).

## Earlier verification record (0.1.27)

Hybrid primary-row double-click toggles inline details; explicit Open inspector and normal Table/JSON inspection remain available. Expanded Table/Hybrid details have independent structured/raw scroll regions and a bottom pointer/keyboard resize separator. Chosen heights survive folding and virtualization within the view. Individual expansions retain other measured row heights; global layout/bulk changes immediately remeasure mounted rows. Exact fractional heights and top-based positioning avoid boundary overlap and transformed stacking contexts that let following pinned cells intercept the separator. Automatic Message cells prefer a non-empty string msg, then message, then raw text. The same property path is used for highlight spans; original records are preserved.

All 603 unit/integration tests in 79 files and 20 distinct targeted packaged desktop checks in seven files passed across the final suite and the focused Live rerun. The 20-case suite had 19 passes and one pre-mouse-down coordinate-race failure in the test harness; both Live theme checks passed after stabilizing that harness. Raw reports are preserved. No cases were skipped. This is targeted desktop verification, not a full desktop-suite run. Hidden native checks cover Hybrid double-click, consecutive expansions with independent scroll positions, two expanded rows during live resizing, separator geometry/hit testing, fold/virtualization height retention, raw multiline scrolling, message priority, Table inspector navigation/resizing, bulk fold/unfold in all modes, both-theme hover/highlight rendering, fast regex-highlight scrolling and Hybrid Live text selection. The existing app reproduced a roughly 70px row overlap before correction. The native resize probe identified the following pinned cell intercepting the separator; final positioning/layering restored its hit target. Independent static review found no concrete issues. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.27.json`, `.tmp/unit-0.1.27-release2.json`, `.tmp/desktop-verification-0.1.27.json` and `.tmp/standard-build-update-0.1.27-release3.json`. Artifact hashes: `release/0.1.27/artifact-manifest.json`; executable: `release/0.1.27/win-unpacked/AWS Log Explorer.exe`.

Checks stayed hidden and hard offline with isolated storage. No real AWS or user workspace was accessed, no normal app was stopped or launched, and no installer was installed. Changes remain uncommitted.

## Earlier verification record (0.1.26)

Tab reordering now translates the dragged tab without scaling its contents. Neighbours stay at their layout slots, the insertion marker previews the destination, and the dragged surface is opaque. Structured-field menus add Decode URL encoding and Decode Base64 text. They reuse immutable per-view projections, show temporary-change labels and preserve original messages. Decoded JSON can subsequently be deserialized into foldable fields. URL decoding is a single strict percent-decoding pass preserving literal plus signs. Base64 supports canonical padded/unpadded standard and URL-safe UTF-8 text, rejects malformed and binary values, and checks only an open menu within the existing input bound.

All 586 unit/integration tests in 77 files and 19 targeted packaged desktop checks in five files passed, with no failures, skips or flaky results. This is targeted desktop verification, not a full desktop-suite run. Native checks cover drag painting in both themes and shared/separate/wrapped pin strips, unequal labels, protected pin boundaries, left-quarter pickup, tab/split lifecycle, panel final-area previews, detach/dissolution and hover/cancel transfer. Inspector checks cover both decoding actions, invalid and binary rejection, chained JSON deserialization, folding, decoded columns/filtering, raw message preservation, records/CSV, view reset and theme rendering. Independent static review found no concrete issues. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.26.json`, `.tmp/unit-0.1.26-release.json`, `.tmp/test-results-0.1.26-release/report.json` and `.tmp/standard-build-update-0.1.26-release.json`. Artifact hashes: `release/0.1.26/artifact-manifest.json`; executable: `release/0.1.26/win-unpacked/AWS Log Explorer.exe`.

Checks stayed hidden and hard offline with isolated storage. No real AWS or user workspace was accessed, no normal app was stopped or launched, and no installer was installed. Changes remain uncommitted.

## Earlier verification record (0.1.25)

Normal and split tabs support persisted pinning. Pinned entries lead a shared strip or use an optional separate row, show an unpin button, and ignore middle-click, Delete and close shortcuts; explicit context-menu Close remains available. Tab/header and Explorer drags share stable insertion geometry. Before/between-pin drops pin new tabs; shared-row drops after the last pin remain unpinned. Empty pinned rows accept drops. Explorer batches open individual group/stream tabs at the selected boundary while delayed hover activation, source drops and split previews remain available. Inactive tab text has stronger contrast with themed hover feedback. Valid font-size edits apply before blur; buffer/refresh numeric edits remain deferred.

All 580 unit/integration tests in 76 files and 32 targeted packaged desktop checks in seven files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.25, not a full desktop-suite run. Native checks cover protected closing, persistence, live font edits, empty/wrapped pin rows, shared pin boundaries, left-quarter pickup reordering, Explorer batch placement, hover activation/cancel/split drops and both themes, plus existing tab/split/Explorer/menu behavior. Independent review found transformed source rectangles could block reordering; stable layout slots fixed the reproduced regression. Pin inheritance across split creation, exit, detach and dissolution is covered. Re-selecting the current theme no longer resets light to dark. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.25.json`, `.tmp/unit-0.1.25-release.json`, `.tmp/test-results-0.1.25-release/report.json` and `.tmp/standard-build-update-0.1.25-release.json`. Artifact hashes: `release/0.1.25/artifact-manifest.json`; executable: `release/0.1.25/win-unpacked/AWS Log Explorer.exe`.

Checks stayed hidden and hard offline with isolated storage. No real AWS or user workspace was accessed, no normal app was stopped or launched, and no installer was installed. Changes remain uncommitted.

## Earlier verification record (0.1.24)

Light-theme active tabs now use the white body background and inactive tabs use the pale gray hover surface. Multi-selected active tabs retain a lighter blue tint than inactive selections; drag feedback and dark-theme colors retain their existing behavior.

TypeScript, formatting, production build and NSIS packaging passed. All 569 unit/integration tests and three focused packaged startup/tab/tooltip checks passed. Separate hidden packaged rendering checks verified actual normal and multi-selected colors in both themes. This is targeted verification, not a full desktop-suite run. Evidence: `.tmp/final-verification-0.1.24.json`, `.tmp/tab-colors-024-packaged.json`, `.tmp/unit-0.1.24-release.json` and `.tmp/test-results-0.1.24-release/report.json`. The verified standard-folder update waits for the running app to exit naturally, with the previous build retained.

## Earlier verification record (0.1.23)

Application menus now close peers, outside clicks, window blur and Escape consistently. Group/stream row menus own copy-name and ARN actions. Custom tooltips follow the theme, allow hover and native text selection/copy, and preserve menu/popover ownership. Explorer defaults to case-insensitive matching across pages, with configurable Alt+E regex and Alt+C match-case shortcuts. Structured fields use one action menu before the key. Valid JSON strings can be decoded into temporary foldable violet-marked values; columns, local filters and record/CSV serialization use those values while original messages and full-event exports stay unchanged.

All 569 unit/integration tests in 74 files and 88 targeted packaged desktop checks in 17 files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.23, not a full desktop-suite run. Native checks cover menu exclusivity and Escape focus, tooltip geometry and real mouse selection/copy inside overlays, both themes, configurable shortcuts, nested escaped JSON paths, projection lifetime, CSV/record copies, Live selection, highlight scrolling, column dragging/resizing and split layouts. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. Independent static review found no remaining material issues; native regressions reproduced and fixed tooltip trigger-style leakage, overlay tooltip selection ownership, wildcard stream ARNs and menu Escape closing the inspector. The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.23.json`, `.tmp/unit-0.1.23-release.json`, `.tmp/test-results-0.1.23-release/report.json` and `.tmp/standard-build-update-0.1.23-release.json`.

Artifact hashes: `release/0.1.23/artifact-manifest.json`; executable: `release/0.1.23/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and hard offline with isolated storage and intercepted clipboard writes. No real AWS session was tested. The normal app was never stopped or launched; no installer was installed. Changes remain uncommitted.

## Earlier verification record (0.1.22)

Regex workers now persist across scrolling and Live batches, retaining completed results and preparing loaded offscreen events in bounded batches. Visible cache misses take priority; the full-result cache is bounded to 10,000 entries and an estimated 32 MiB of payload. Unchecked rows show a brief preparation placeholder instead of false non-matching content. Rule/theme changes, event edits/removal, overview marks and timeout recovery remain covered. Live source context now remains stable across routine updates, preserving cell DOM and native text selection. Pausing follow cancels its in-flight scroll target; reception continues.

All 560 unit/integration tests in 72 files and 39 targeted packaged desktop checks in eight files passed with no failures, skips or flaky results. This is targeted verification of 0.1.22, not a full desktop-suite run. Hidden painted-frame checks cover rapid scrolling with delayed workers in both themes and all event modes. Live selection checks drag both directions across literal/profile marks, receive events while dragging, retain the exact range after further arrivals and verify original text-node identity. Profile editing, preview timeout recovery, persistence, selected/hover colors, pinned columns, inspector/overview, copies and natural close/save are covered. TypeScript, formatting, whitespace, production build and NSIS packaging passed. The verified staged update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.22.json`, `.tmp/unit-0.1.22-final-3.json`, `.tmp/test-results-0.1.22-final/report.json`, `.tmp/test-results-highlight-extra-0.1.22-final-2/report.json` and `.tmp/standard-build-update-0.1.22-final.json`.

Artifact hashes: `release/0.1.22/artifact-manifest.json`; executable: `release/0.1.22/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and hard offline with isolated storage and intercepted OS clipboard writes. The normal user app was never forcibly closed or launched. The installer was not installed. Changes remain uncommitted.

## Row color verification record (0.1.21)

Selected event rows now use the theme selection background and text color ahead of profile row colors, even without hover. Hover subtly mixes neutral gray into the current regular, selected or regex-highlighted background. Pinned and unpinned cells and the Hybrid gutter share one resolved color; the partial selection outline and inset shadow are removed. Expanded details keep their colors on hover, and text-match highlights remain available. The change is confined to row CSS.

All 550 unit/integration tests in 72 files and 32 targeted packaged desktop checks in eight files passed with no failures, skips or flaky results. This is targeted verification of 0.1.21, not a full desktop-suite run. Native checks cover both themes and all event modes, row backgrounds and foregrounds, foreground-only profiles, hover in each state, horizontally scrolled pinned columns, expanded details, multiple selection/copy, inspector/overview, Live Tail and natural save/close. TypeScript, formatting, whitespace, production build and NSIS packaging passed. The standard launch folder contains 0.1.21, with the previous build retained. Three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.21.json`, `.tmp/unit-0.1.21-final.json`, `.tmp/test-results-0.1.21-final/report.json`, `.tmp/test-results-row-legacy-0.1.21-final/report.json` and `.tmp/standard-build-update-0.1.21-final.json`.

Artifact hashes: `release/0.1.21/artifact-manifest.json`; executable: `release/0.1.21/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and hard offline with isolated storage and intercepted OS clipboard writes. The installer was not installed. Changes remain uncommitted.

## Live Tail verification record (0.1.20)

Live Tail now distinguishes connecting, connected and stopped sessions, retains matching history and counts newly received events. Connected empty sessions wait without an endless loader. Follow Live scrolls independently of reception and pauses for selection, pointer or keyboard scrolling. Stop and failed/ended sessions remain stopped even with historical refresh enabled; Retry Live explicitly reconnects. Time presets, Run and mode changes return to history. Silent streams abort after 30 seconds without protocol updates. Complete service batches reach the existing bounded buffer, preserving the newest events.

All 550 unit/integration tests in 72 files and 29 targeted packaged desktop regressions in seven files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.20, not a full desktop-suite run. Hidden desktop checks cover quiet and active streams, automatic reception, history retention, wheel and keyboard follow controls, Stop, time presets, Run, Events/Insights transitions, copy, multiline rows, inspector/overview and natural close/save behavior. TypeScript, formatting, whitespace, production build and NSIS packaging passed. Independent review found the keyboard-follow gap; its regression failed before the fix. The staged standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.20.json`, `.tmp/unit-0.1.20-final.json`, `.tmp/test-results-0.1.20-final/report.json` and `.tmp/standard-build-update-0.1.20-final.json`.

Artifact hashes: `release/0.1.20/artifact-manifest.json`; executable: `release/0.1.20/win-unpacked/AWS Log Explorer.exe`. AWS adapter tests use injected transports; desktop checks use hidden hard-offline windows and isolated storage. No real AWS session was tested. The installer was not installed. Changes remain uncommitted.

## Highlights verification record (0.1.19)

Highlights settings now use a compact profile section above a sortable rule table and one selected-rule detail panel. Pointer/keyboard dragging, move buttons and numeric priority update the existing saved order. Enable checkboxes, scope/path, target, regex and color swatches remain visible in the table; shared/theme colors and all matching options remain editable in the detail panel. A collapsible live preview retains its sample and pauses matching while folded. Table/Hybrid event text is directly selectable with a text cursor, including highlighted spans, while row selection, copy shortcuts and inspector navigation remain available.

All 542 unit/integration tests in 72 files and 32 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.19; the prior full 116-case run belongs to 0.1.16. Native checks cover both themes, smaller windows, drag priority and cancellation, rule/profile add/delete, live preview, structured and theme-specific colors, persistence after restart, regex timeout recovery and native pointer text selection. Existing copy, inspector, overview, column-dragging and natural-close checks passed. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The staged standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.19.json`, `.tmp/unit-0.1.19-final.json`, `.tmp/test-results-0.1.19-final/report.json`, `.tmp/test-results-highlights-0.1.19-final/report.json` and `.tmp/standard-build-update-0.1.19-final.json`.

Artifact hashes: `release/0.1.19/artifact-manifest.json`; executable: `release/0.1.19/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and offline with isolated storage and intercepted OS clipboard writes. The installer is unsigned and was not installed. Changes remain uncommitted.

## Selected event copy verification record (0.1.18)

Selected events can be copied as raw messages or newline-delimited JSON records through the toolbar menu, row context menu and keyboard. Records preserve visible column IDs and order, original JSON value types and missing values as null. Hybrid primary rows remain one line for multiline messages, including with wrapping enabled; expanded details, the inspector and copying retain the full raw text.

All 542 unit/integration tests in 72 files and 29 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.18; the prior full 116-case run belongs to 0.1.16. Native checks cover Table/Hybrid/JSON, sorted and filtered selection, pin order, hidden columns, typed fields, native text-copy behavior, both themes and full multiline data retention. Existing inspector, query, overview, export, column-dragging and natural-close checks also passed. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The standard launch folder contains 0.1.18, with the previous build retained. Three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.18.json`, `.tmp/unit-0.1.18-final.json`, `.tmp/test-results-0.1.18-final/report.json` and `.tmp/standard-build-update-0.1.18-final.json`.

Artifact hashes: `release/0.1.18/artifact-manifest.json`; executable: `release/0.1.18/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and offline with isolated storage and intercepted OS clipboard writes. The installer is unsigned and was not installed. Changes remain uncommitted.

## Divider alignment verification record (0.1.17)

Centered Table/Hybrid column resize highlights and hit targets on their separators; centered the inspector divider and kept it above the scrollbar overview with 3px of clearance for full map hit testing. Unclipped column handles and ordered pinned-header layers keep both sides draggable. Explorer and both split-pane axes retain their existing alignment.

All 534 unit/integration tests in 71 files and 23 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.17; the prior full 116-case run belongs to 0.1.16. Native tests cover both themes, pinned and horizontally scrolled headers, drag starts on either side of the actual border, Escape/keyboard resizing and normal/increased inspector zoom. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. The standard launch folder contains 0.1.17, with the previous build retained. All three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.17.json`, `.tmp/unit-0.1.17-final.json`, `.tmp/test-results-0.1.17-verified/report.json` and `.tmp/standard-build-update-0.1.17-verified.json`.

Artifact hashes: `release/0.1.17/artifact-manifest.json`; executable: `release/0.1.17/win-unpacked/AWS Log Explorer.exe`. Tests stayed hidden and offline. The installer is unsigned and was not installed. Changes remain uncommitted.

## Control improvements verification record (0.1.16)

Checkbox level selection with exclusive text clicks and additive Ctrl/Cmd clicks; column-header move/pin menus; automatic query-mode refresh with isolated drafts; primary-row-only hover preserving profile colors; full-height Explorer click/drag targets; themed regex tooltips and filled-dot glyphs; centered source-removal buttons and distinct multi-source icons.

All 534 unit/integration tests in 71 files and all 116 packaged desktop regressions in 26 files passed, with no failures, skips or flaky results. Independent review and native tests reproduced and fixed hidden-column editor pinning, early Escape closing the inspector, inactive query-mode text affecting results, and level-button label alignment. No remaining material findings.

TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. Hidden tests check all six column actions in Table/Hybrid, keyboard focus, persisted metadata, mode switching and retained drafts, level combinations, full-row captured drags, and expanded-detail/profile/selection colors in both themes. The standard launch folder contains 0.1.16, with the previous build retained. All eight hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.16.json`, `.tmp/unit-0.1.16-final.json`, `.tmp/test-results-0.1.16-final/report.json` and `.tmp/standard-build-update-0.1.16-final.json`. [Revision checklist](control-improvements-0.1.16.md).

No real AWS/profile/credential/user workspace access, installation or commits. Real AWS interoperability, physical OS input, screen readers, signing and other platforms remain unverified.

## Explorer selection verification record (0.1.15)

Favorite aliases, exclusive cursor menus and theme-aware tooltips; non-editable selectors and guarded paged regex search; mixed group/stream batch actions and dragging; split layouts beyond four panes; ordered event multi-selection/copy; and remembered AWS access with existing-query cancellation.

All 515 unit/integration tests in 68 files and all 100 packaged desktop regressions in 22 files passed, with no failures, skips or flaky results. Independent review reproduced and corrected preset consistency, interrupted regex-scan resumption, overlapping menu transitions, keyboard context-menu propagation and Insights cancellation after access revocation. No remaining material findings.

TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. Light/dark tab-tooltip captures inspected; trusted hidden tests cover batch drop geometry, seven-pane persistence, worker timeout/recovery, menus, keyboard selection and ordered virtual-row copy. The standard launch folder contains 0.1.15, with the previous build retained. All five hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.15.json`, `.tmp/unit-0.1.15-final.json`, `.tmp/test-results-0.1.15-verified/report.json` and `.tmp/standard-build-update-0.1.15-verified.json`. [Revision checklist](explorer-selection-0.1.15.md).

No real AWS/profile/credential/user workspace access, clipboard changes, installation or commits. Real AWS interoperability, physical OS input, screen readers, signing and other platforms remain unverified.

## View-polish verification record (0.1.14)

Verified on 2026-10-19: cursor-positioned favorite menus, persistent favorite aliases, automatic/configurable mixed Source column, and consistent selected-row hover in both themes and all event modes. Review reproduced and fixed date/path stream-label collisions and retained result source/connection snapshots. No remaining review findings.

All 482 unit/integration tests in 62 files and 21 targeted packaged desktop regressions passed, with no failures, skips or flaky results. The targeted suite covers the four requested changes plus source editing and regional drops, exports/Insights, column drag/resize, highlight profiles, Hybrid geometry and table idle responsiveness. The previous full 88-case run belongs to 0.1.13; it is not counted as a full-suite run for this revision.

TypeScript, Prettier, whitespace, production build and Windows NSIS packaging passed. Hidden captures inspected. The standard launch folder contains 0.1.14, with the previous build retained. All four hidden standard-path checks passed. Artifacts and hashes: `release/0.1.14/artifact-manifest.json`; verification: `.tmp/final-verification-0.1.14.json`; [revision details](view-polish-0.1.14.md). No real AWS, profiles, credentials or user workspace accessed; no installation or commits. Physical OS input, real AWS interoperability and other platforms remain unverified.

## Saved-view verification record (0.1.13)

Verified on 2026-10-19. Favorites preserve normal/combined tab configuration, connection endpoints, relative/absolute windows, split layout and per-view settings. Save by tab menu or dragging; open independent copies and remove by right-click. Legacy resource favorites migrate. The friendly connection editor remains; advanced settings are removed. Explicit packaged AWS access persists separately from workspace imports and enabling it refreshes data.

| Check            | Result                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/integration | 477 passed in 61 files; `.tmp/unit-0.1.13-final.json`                                                                                                             |
| Packaged desktop | All 88 cases passed in 16.5 minutes, no failures/skips/flaky; `.tmp/test-results-0.1.13-final/report.json`                                                        |
| Review           | Deleted-group restoration, failed preference-write revocation and save/open workspace overflow reproduced and corrected; no further findings                      |
| Build/checks     | TypeScript, Prettier, whitespace, production build and NSIS packaging passed                                                                                      |
| Artifacts        | `release/0.1.13/win-unpacked/AWS Log Explorer.exe`, unsigned installer and `artifact-manifest.json`                                                               |
| Delivery         | The standard launch folder contains the matching 0.1.13 package, with the previous build retained. All four hidden standard-path checks passed.                   |
| Isolation        | Hidden hard-offline windows and isolated storage; access UI uses injected IPC. No real AWS, profiles, credentials, user workspace access, installation or commits |

Hidden Favorites/split-restoration captures inspected. Existing suite covers both themes, all event modes, drag/split geometry, inspector, pagination and highlighting. Real AWS interoperability, physical OS input, screen readers, signing/installation and other platforms remain unverified. [Revision details](saved-views-and-access-0.1.13.md); `.tmp/final-verification-0.1.13.json`.

## Explorer split verification record (0.1.12)

Verified version 0.1.12 locally on 2026-10-16. Explorer group/stream drops create or extend a combined tab using the same final-area projection as tab/panel drags. Source-strip drops add sources to the existing view. Separate bordered badges have a plain source-count label; single-source controls hide except during dragging. Generated multi-source/combined titles use `Mixed Sources (N)`, counting explicit streams across every member pane while preserving manual names. Inactive headers are distinct from event statuses in both themes; titles, region labels and pane numbers pass 4.5:1 contrast.

| Check            | Result                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/integration | 466 passed in 59 files; `.tmp/unit-0.1.12-verified.json`                                                                                                                                                                                                                                            |
| Packaged desktop | All 84 cases passed on the final package in 17.6 minutes, zero failures/skips/flaky; `.tmp/test-results-0.1.12-final-verified/report.json`                                                                                                                                                          |
| Focused coverage | Group/stream insertion, exact preview/final bounds, cross-region hover, cancellation, single-source revelation, source-strip priority, counts, view preservation and four-pane limits                                                                                                               |
| Review           | Both cross-tab lifecycle findings corrected and independently reviewed again; no remaining actionable findings                                                                                                                                                                                      |
| Visuals          | Hidden captures inspected in both themes and JSON/table/hybrid; separate badges and header/secondary-text contrast verified                                                                                                                                                                         |
| Build/checks     | TypeScript, full Prettier/whitespace checks, production build and NSIS packaging passed                                                                                                                                                                                                             |
| Artifacts        | `release/0.1.12/win-unpacked/AWS Log Explorer.exe`, unsigned installer and `release/0.1.12/artifact-manifest.json`                                                                                                                                                                                  |
| Delivery         | Current standard-path app remains running. Matching staged build waits for natural app exit; backup retained. Four hidden standard-path checks are queued after promotion. States/reports: `.tmp/standard-build-update-0.1.12.json`, `.tmp/test-results-standard-0.1.12/report.json` when available |
| Isolation        | No real AWS, profiles, credentials or user workspace accessed; no installation or commits                                                                                                                                                                                                           |

The expanded header check reproduced insufficient dimmed-text contrast before correction. The earlier interrupted packaged run is retained and contributes no passing count; all 84 cases were rerun against the corrected final package. Independent review also found that newly mounted source controls missed drag-start events and cross-connection hover could unmount the drag owner; shared drag state and connection-preserving hover fixed both. Summary: `.tmp/final-verification-0.1.12.json`; [revision details](explorer-splits-0.1.12.md). Real AWS interoperability, physical OS input, screen readers, installation/signing and other platforms remain unverified.

## Source-management verification record (0.1.11)

Verified version 0.1.11 locally on 2026-10-16. Source management is a horizontally scrolling strip of removable badges beside Events/Insights. Only this strip accepts Explorer resource drops. Source changes query automatically, update generated labels and preserve manually renamed tabs. Shared directories are shortened; stream badges include six identifier characters. Full resource/profile/region details remain on hover, with region labels when sources span connections. The separate source modal and manual-Run notification are removed.

| Check               | Result                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/integration    | 460 passed in 58 files; `.tmp/unit-0.1.11-budget-final.json`                                                                                                                                                                                                                               |
| Packaged desktop    | Full 81 cases passed in 15.6 minutes before the final service-only guard; all 11 source/investigation cases passed again on the final package; zero failures/skips/flaky; `.tmp/test-results-0.1.11-reviewed-verified/report.json` and `.tmp/test-results-0.1.11-budget-final/report.json` |
| Final-package scope | All 24,016 packaged files compared: 24,015 identical, only main-process query-budget guards changed; `.tmp/package-delta-0.1.11.json` and its exact code delta                                                                                                                             |
| Source interactions | Trusted pointer drops, restricted targeting, Escape, duplicate suppression, several same-group streams, precise removal, automatic query counts, title preservation and natural restart                                                                                                    |
| Regional behavior   | Equal group names retain connection identity through pagination and context; used-source gating and Live cost/fixture hints; unused original connection edits/deletion preserve remaining views                                                                                            |
| Layout              | Actual hidden captures inspected for dark badges, regional sources and narrow light split panes; clipped offscreen badges remain reachable by scrolling                                                                                                                                    |
| Build/checks        | TypeScript, Prettier, whitespace, production bundles and versioned NSIS packaging passed                                                                                                                                                                                                   |
| Artifacts           | `release/0.1.11/win-unpacked/AWS Log Explorer.exe` and `release/0.1.11/AWS Log Explorer Setup 0.1.11.exe`; installer unsigned, not installed                                                                                                                                               |
| Delivery            | Normal launch folder updated after natural app exit; hashes match and backup retained. Two hidden checks passed against that exact path; `.tmp/test-results-standard-0.1.11/report.json` and `.tmp/standard-build-update-0.1.11.json`                                                      |
| AWS isolation       | No real AWS, profile discovery, credentials or user workspace access; AWS command routing and newest-first stream inputs checked with injected transports                                                                                                                                  |

The independent review reproduced two important cases after removing the original source: an unused AWS connection could block an offline query, and an unused offline connection could label AWS Live execution as simulated. Both were fixed with red-to-green regressions and independently rechecked. Query lifecycle ownership and stale-result matching now share canonical used-source identity. These corrections were packaged before the full 81-case run; the earlier interrupted run is preserved and contributes no passing count. Earlier source test failures from an obsolete CSS selector and missing numeric thousands separator were corrected before final collection.

A later synthetic review found excessive output accumulation and sequential child reads in cross-region pagination. Final guards cap output at 16 million message characters and 128 child adapter reads per call, retaining the unconsumed head and continuation. Independent reproduction delivered all 100 one-million-character events across seven pages and all 10,000 one-event pages across 79 calls, without loss or duplicates. The full 460-test suite and all 11 packaged source/investigation flows passed after this change. The other 70 desktop cases were not rerun after this service-only guard; package comparison proves renderer, preload, dependencies and every other packaged file are identical. The pre-guard package is retained under `release/0.1.11-full-run` and the delivered final package under `release/0.1.11`.

Multi-connection historical Events reuse existing adapters with bounded, ordered merge buffers and query-bound continuations. Failed/cancelled regional reads invalidate their merge continuation; resumable budget stops retain it without setting the truncation flag. Insights and Live Tail intentionally require one connection/region; the app explains this instead of displaying regional aggregates as global results. A whole-group source already includes its streams. Explorer requests descending last-event time and sorts merged stream pages defensively.

See [0.1.11 requirements and scope](sources-0.1.11.md). The dependency tree is unchanged. Stable artifact hashes are recorded in `release/0.1.11/artifact-manifest.json`; installer SHA-256: `0b495649f509ff43f9e7fd0226baf983a69816059194bbcf3c7e8edb9498b6ce`. Real AWS interoperability, physical OS input, screen readers, installation/signing and other platforms remain unverified. All results and captures remain under `.tmp`.

## Inspector and overview verification record (0.1.10)

Verified version 0.1.10 locally on 2026-10-16. New event viewers open a 30% inspector with a toolbar toggle beside Export. The overview now paints proportional event bands, merges adjacent colors and navigates within merged bands. The inspector handle no longer covers the right lane, and quick summaries include decoded/formatted values.

| Check              | Result                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/integration   | 439 passed in 54 files; `.tmp/unit-0.1.10-final.json`                                                                                                                    |
| Packaged desktop   | 78 cases verified across the full run and one targeted rerun; no unresolved failures, skips or flaky cases; `.tmp/desktop-verification-0.1.10.json`                      |
| Extra stress       | 2 passed with 5,000 events and a stalled offscreen regex; `.tmp/test-results-overview-stress-0.1.10/report.json`                                                         |
| Formatted metadata | 1 additional hidden check passed for a formatted timestamp and UTC/local year-boundary change without queries; `.tmp/test-results-overview-formatted-0.1.10/report.json` |
| Native pixels      | Three adjacent errors have one solid band at about three times the single-event height; native captured red coverage exceeds 95% throughout its interior                 |
| Build/checks       | TypeScript, Prettier, whitespace, production bundles and versioned NSIS packaging passed                                                                                 |
| App                | `release/0.1.10/win-unpacked/AWS Log Explorer.exe`                                                                                                                       |
| Installer          | `release/0.1.10/AWS Log Explorer Setup 0.1.10.exe`; unsigned, not installed                                                                                              |
| Delivery           | `.tmp/standard-build-update-0.1.10.json` tracks the hash-checked normal-folder handoff after natural app exit, retaining a backup                                        |
| AWS isolation      | No real AWS, profile discovery, credentials or user workspace access during verification                                                                                 |

New regressions verify default opening and first-event selection, the 30% ratio and parent resizing, toggle placement and width/selection retention, proportional runs/gaps/variable heights, navigation at each third of a three-error band, decoded and formatted quick matching, and full-width right-lane hit testing in both themes. Existing column tests now use visible hit-tested targets and scroll during capture to reveal the insertion-before half in the narrower viewport; their budget accounts for the extra hidden input steps. No column production behavior was changed. All prior workspace, date, drag/drop, inspector, loading and lifecycle cases passed.

The defects were reproduced before fixing: midpoint dots created false gaps; decoded/formatted values were absent from raw-only summaries; and the inspector handle obstructed three pixels of the five-pixel highlight lane. Hidden native captures were inspected, and every verification window remained hidden. Results and captures are under `.tmp`.

The raw full run passed 77 cases in 15.3 minutes and failed one assertion expecting a newly opened Context tab to close its inspector. That expectation conflicts with the requested default-open behavior. It was updated, and the entire filtering/export/context flow passed on targeted rerun against the unchanged package. Both raw reports are retained: `.tmp/test-results-0.1.10-final-verified/report.json` and `.tmp/test-results-context-inspector-0.1.10/report.json`. The audited summary verifies the rerun matches the only failed case and records all 78 final outcomes; the normal-folder handoff requires that summary and matching hashes.

See [0.1.10 behavior and regression details](inspector-overview-0.1.10.md). Stable hashes are in `release/0.1.10/artifact-manifest.json`. Installer SHA-256: `adffdf1049ec1ec88e1bc1d92a65c4f688f5623fd61218115e9032fd0166be7d`. The dependency tree is unchanged. Real AWS interoperability, physical OS input, screen readers, installation/signing and other platforms remain unverified.

## Scrollbar overview verification record (0.1.9)

Verified version 0.1.9 locally on 2026-10-16. The event scrollbar has compact severity and highlight maps around its native draggable thumb.

| Check              | Result                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/integration   | 434 passed in 54 files; `.tmp/unit-0.1.9-final.json`                                                                                                                          |
| Packaged desktop   | All 74 passed in 14.5 minutes; zero failed, skipped or flaky; `.tmp/test-results-0.1.9-final-verified-corrected/report.json`                                                  |
| Extra stress       | 2 hidden checks passed with 5,000 events and a stalled offscreen regex; `.tmp/test-results-overview-stress-verified/report.json`                                              |
| Focused input      | JSON/Table/Hybrid overview and light/dark profile sorting/filtering checks passed; evidence under `.tmp/test-results-overview-input` and `.tmp/test-results-overview-profile` |
| Loading regression | Reproduced a 10-pixel initial-loading shift from reserved scrollbar space; corrected and passed the focused loading check and full suite                                      |
| Build/checks       | TypeScript, Prettier, whitespace, production bundles and versioned Windows NSIS packaging passed                                                                              |
| Delivery           | `release/0.1.9/win-unpacked/AWS Log Explorer.exe`; normal-folder handoff in `.tmp/standard-build-update-0.1.9.json`                                                           |
| Installer          | `release/0.1.9/AWS Log Explorer Setup 0.1.9.exe`; unsigned, not installed                                                                                                     |
| Real AWS           | No real AWS, profile discovery, credentials or user workspace access during verification                                                                                      |

The four new desktop cases cover native scrollbar width/dragging, marker sides, offscreen navigation/selection, clearing, empty filters, inspector placement and profile colors/sorting/filtering without queries. Extra stress checks confirm bounded rendering, warning/error/fatal inference across plain/structured events, visible timeout reporting and responsive controls after an offscreen regex stalls. Actual hidden captures were inspected. All 70 earlier desktop regressions remain covered.

The initial full run was stopped after a targeted check reproduced the empty-loading regression. Only the uniquely identified test tree and waiting handoff helper were stopped. The corrected package was rebuilt and the full suite restarted. The replacement handoff stages and hash-checks this exact artifact, then waits for all 74 passing checks and natural app exit before updating the normal folder with a retained backup. It never closes or launches the user app. Installed copies still require the matching installer.

See [overview behavior and limits](event-overview-0.1.9.md). Hashes are in `release/0.1.9/artifact-manifest.json`. Installer SHA-256: `3c1c28d55bbd14f4d1e2f4609db5b8c7da4b54e8af810f2e38b26fbd15c3cd9e`. The dependency tree is unchanged; no external advisory scan was repeated. Physical OS input, screen readers, installation/signing and real AWS interoperability remain unverified.

## Explorer selectors verification record (0.1.8)

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
