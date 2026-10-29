# Building and releasing

## Latest local verification build (0.1.56)

Closed-history tooltips no longer lose their opening timer after rapid movement
across unrelated controls. The delegated handler cancels both prior timers and
scopes exit events to the current owner. Renamed and multisource views show a
Sources section using the exact shortened names generated for individual tabs;
ordinary automatic names show only their label. Full paths and endpoint details
are omitted. Interactive text selection, copying and themed presentation remain.

Surrounding-context tabs select and reveal the originating event, automatically
loading continuation pages when necessary. Exact source/event identity takes
precedence; an equivalent timestamp/message can match changed query IDs. The
reveal is transient and consumed, so later keyboard navigation is preserved.
Ctrl-click on an inspector JSON toggle opens the complete subtree if any part is
folded, otherwise folds it recursively, preserving sibling state and existing
inspection limits. See [behavior and evidence](closed-tab-tooltips-0.1.56.md).

All 971 unit/integration tests and 23 targeted final packaged desktop checks pass
with zero failures, skips or flaky cases. Native coverage includes the original
timer failure, both themes, short source labels, selection/copying, history sizing
and reopening, context origin reveal on first/later pages, recursive JSON toggles,
menu dismissal and synchronized preview scrolling/selection/folds. Typecheck/build,
formatting, whitespace, packaging and artifact hashes pass. Evidence:
`.tmp/unit-0.1.56-final4.json`, `.tmp/desktop-verification-0.1.56.json`, and
`release/0.1.56/artifact-manifest.json`.

Tests used hidden isolated offline windows; real AWS and installer installation
were not exercised. The gated handoff waits for natural app exit and preserves
a backup. Four hidden standard-path postchecks are queued. Its state is recorded
in `.tmp/standard-build-update-0.1.56.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.55)

Closed-tab history keeps renamed labels and provides selectable custom tooltips
with every full source group and stream, including profile/region details.
Reopening still returns to the original source title. Highlights regex and JSON
Pointer fields disable native writing assistance while retaining syntax checks.

Both Highlights editors use the compact Preview title and omit the captured source
and loaded-count caption. Redundant tree footer, breadcrumb and rule-priority
hints are removed, with the freed space allocated to logs. Existing two-theme
preview synchronization and pane resizing remain available. See
[behavior and evidence](highlight-preview-and-history-0.1.55.md).

All 966 unit/integration tests and 42 targeted final packaged desktop checks pass
with zero failures, skips or flaky cases. Native checks cover both themes and
editors, writing-assistance flags, actual preview area, fold/reopen cycles,
source-aware history tooltips, intrinsic menu widths, reopening, synchronized
scrolling/selection/folds, drag interactions and responsive Settings. Independent
review, typecheck/build, formatting, whitespace, packaging and artifact hashes
pass. Evidence: `.tmp/unit-0.1.55-final.json`,
`.tmp/desktop-verification-0.1.55.json` and
`release/0.1.55/artifact-manifest.json`.

Tests used hidden isolated offline windows; real AWS and installer installation
were not exercised. The standard-folder handoff waits for natural app exit,
preserves a backup and queues three hidden postchecks. Its state is recorded in
`.tmp/standard-build-update-0.1.55.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.54)

The Highlights tree reuses Explorer's compact rows, typography, selection,
expanders and muted icon treatment. Rules use the existing highlight-marker icon;
profile counts use small badges. Disabled items remain gray.

Drag whole rows to reorder profiles with their expanded rules, or rules within
their profile. Keyboard reordering, scrolling beyond the visible viewport,
Escape cancellation and invalid-drop rejection retain the selected editor and
incomplete input. Order is committed only on a valid drop. Schema-normalized
preference updates no longer discard unfinished fields. Context menus and
immediate validated editing remain available.

Closed-tab history now sizes to its content with only a 760px maximum, further
limited by the window. Short histories shrink; long names retain ellipsis and
interactive tooltips. Date sections, source badges, vertical scrolling and
reopening behavior remain available. See
[behavior and evidence](highlight-tree-drag-and-history-0.1.54.md).

All 962 unit/integration tests and all 36 targeted final packaged desktop checks
pass with no failures, skips or flaky cases. Native coverage includes both themes,
short/medium/capped history, mouse and keyboard reordering, expanded profile
scrolling, canceled and foreign-profile drops, retained input DOM identity,
immediate edits, context menus, deletion, preview synchronization and all Settings
pages at three widths in pane/modal presentations. Independent review,
typecheck/build, formatting, whitespace, NSIS packaging and artifact hashes pass.
Evidence: `.tmp/unit-0.1.54-final2.json` and
`.tmp/desktop-verification-0.1.54.json`. Artifacts:
`release/0.1.54/artifact-manifest.json`.

Tests were hidden, isolated and offline; real AWS and installer installation were
not exercised. The gated handoff waits for natural app exit, retains a backup and
queues three hidden standard-path checks. State:
`.tmp/standard-build-update-0.1.54.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.53)

Highlights keeps the same fields and geometry between view and edit modes. The
summary row contains the pencil/delete icons and animated Save or Delete / Cancel
strips. Editing is green, new drafts are blue, and deletion is red. New items
remain local until Save; Cancel discards their nested changes. Ordinary expansion
folds siblings; Shift keeps them open. Priority remains in table ordering without
an extra editor field.

The additional **Highlights tree** tab keeps the existing design available. Its
left tree contains profiles and rules, with disabled items gray; the right editor
applies valid changes immediately. Context menus offer Edit, sibling ordering,
Add profile/rule and red Delete. A modal confirms deletion with the item name and
affected rule count. Both designs share saved configuration, resizable panels and
the synchronized light/dark hybrid preview. Nested picker/dialog Escape closes
only the current overlay. See [behavior and evidence](highlight-row-actions-0.1.53.md).

All 960 unit/integration tests and 56 distinct final packaged desktop checks pass.
Native coverage includes exact geometry and DOM retention in both themes,
double-click deletion cancellation, reveal animation, provisional additions,
default/Shift folding, tree edits and menus, narrow layouts, resizing, preview
synchronization, text selection, persistence and regex timeout recovery. Six
legacy checks were rerun after scoping selectors away from retained hidden
panels; all raw reports remain available. The package was unchanged between runs.
Typecheck/build, formatting, whitespace, NSIS packaging and artifact hashes pass.
Evidence: `.tmp/unit-0.1.53-final3.json` and
`.tmp/desktop-verification-0.1.53.json`. Artifacts:
`release/0.1.53/artifact-manifest.json`.

Tests were hidden, isolated and offline; real AWS and installer installation were
not exercised. The gated handoff waits for natural app exit, retains a backup and
queues three hidden standard-path checks. State:
`.tmp/standard-build-update-0.1.53.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.52)

Highlights has centered resize dividers between Profiles and Rules and above the
expanded preview. Dragging resizes live; keyboard adjustment, limits, centering and
Escape cancellation are supported. Width and stacked-height ratios stay separate
in the Settings session and survive docking with editor drafts. Narrow Settings
changes the list divider to horizontal, and short modals keep usable scrollports.
Both theme previews retain equal space without a divider between them. See
[implementation and evidence](highlights-pane-dividers-0.1.52.md).

All 940 unit/integration tests and all 17 targeted final packaged desktop checks
pass with no failures, skips or flaky cases. Native checks cover both themes,
live pointer sizing, keyboard bounds, color text fit, cancellation after focus or
category changes, Activity reconnection, docking, editor retention, expanded-row
reveal, preview synchronization and all Settings pages at three widths per
presentation. Independent review, typecheck/build, formatting, whitespace,
NSIS packaging and artifact hashes pass. Evidence:
`.tmp/unit-0.1.52-final2.json` and `.tmp/desktop-verification-0.1.52.json`.
Artifacts: `release/0.1.52/artifact-manifest.json`.

Tests were hidden, isolated and offline; real AWS and installer installation were
not exercised. The gated handoff waits for natural app exit, retains a backup and
queues three hidden standard-path checks. State:
`.tmp/standard-build-update-0.1.52.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.51)

Highlights now uses expandable Profiles and Rules tables above its modal preview.
Rows show read-only details until Edit starts a draft; Save validates and commits,
and Cancel discards. Header plus buttons add items, row switches enable them, and
delete icons require confirmation. Drafts survive profile changes and docking.
Expanded items reveal themselves inside their table and retain their identity
through pointer/keyboard reordering. Short Settings windows scroll between usable
table and preview areas instead of hiding controls behind sticky headers. See
[implementation and evidence](highlight-tables-and-synced-preview-0.1.51.md).

The two real-data hybrid previews synchronize both scrolling axes, selected rows,
message and JSON folding, inner message scrolling and committed detail heights.
View changes remain private to the captured preview. Both themes and narrow
stacked previews retain their state and settle correctly at scroll limits.

All 940 unit/integration tests and all 39 targeted final packaged desktop checks
pass with no failures, skips or flaky cases. Native checks include every Settings
page at three widths per presentation, actual text fit, Save/Cancel and validation,
delete confirmation, enable switches, reordering across a scroll boundary,
profile persistence after restart, regex timeout recovery and viewer text selection.
Independent review, typecheck/build, formatting, whitespace, NSIS packaging and
artifact hashes pass. Evidence: `.tmp/unit-0.1.51-final.json` and
`.tmp/desktop-verification-0.1.51.json`; the final native report is
`.tmp/test-results-0.1.51-final2/report.json`. Artifacts:
`release/0.1.51/artifact-manifest.json`. The earlier candidate was superseded before
promotion after the short-window check failed; its evidence is retained.

Tests were hidden, isolated and offline; real AWS and installer installation were
not exercised. The gated handoff waits for natural app exit, retains a backup and
queues three hidden standard-path checks. State:
`.tmp/standard-build-update-0.1.51.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.50)

Connections, Preferences and Shortcuts are single-column forms with the entire
page centered at a readable width. Time ranges center at their existing width
limit. Workspace JSON fills the available width and grows vertically; Highlights
uses the remaining window height for its rule list and editor with stable scroll
ownership when preview folds. See
[implementation and evidence](settings-layout-and-log-preview-0.1.50.md).

Detached Settings previews the actual loaded events from the focused tab when
Settings opened, in independent light/dark hybrid tables. Docking and switching
main tabs preserve that snapshot. Docked Settings has no preview section. Empty
data is reported honestly, and preview interactions leave the main tab and global
theme unchanged. Escape cancels preview column gestures without closing Settings.

All 925 unit/integration tests and all 28 targeted final packaged desktop checks
pass with no failures, skips or flaky cases. Checks cover both themes, every page,
three widths per presentation, text fit, centered notes, growing editors, repeated
preview folding, captured data, hybrid expansion, regex timeout recovery, resizing,
docking, cancellation and fractional-zoom tab strokes. Independent review,
typecheck/build, formatting, whitespace, NSIS packaging and artifact hashes pass.
Evidence: `.tmp/unit-0.1.50-final.json` and
`.tmp/desktop-verification-0.1.50.json`. Artifacts:
`release/0.1.50/artifact-manifest.json`. Tests remain hidden, isolated and offline;
real AWS and installer installation were not exercised. The gated handoff waits
for natural app exit, retains a backup and queues two hidden standard-path checks.
State: `.tmp/standard-build-update-0.1.50.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.49)

All six Settings pages use their actual container dimensions in docked and
detached presentations. Profiles and actions reflow, Preferences and Shortcuts
gain useful columns, narrow time slots wrap without clipping, and Highlights
switches between side-by-side and stacked editing while using Settings height.
Full color values remain readable; long workspace labels and actions stay inside
the page. Category navigation stays fixed, and drafts survive resizing. See
[implementation and evidence](responsive-settings-0.1.49.md).

All 918 unit/integration tests and all 11 targeted final packaged checks pass
without failures, skips or flaky cases. The matrix covers 72
page/size/presentation/theme combinations, expanded previews, color readability,
editor operations, draft retention and fractional-zoom tab rendering. A broader
25-case Settings suite passed on the preceding candidate before the isolated
color-field correction; that candidate was superseded before promotion.
Independent review, visual inspection, typecheck/build, formatting, whitespace,
NSIS packaging and hashes pass. Evidence: `.tmp/unit-0.1.49-final.json` and
`.tmp/desktop-verification-0.1.49.json`. Artifacts:
`release/0.1.49/artifact-manifest.json`. Tests were hidden, isolated and offline;
real AWS and installer installation were not exercised. The gated handoff waits
for natural exit, retains a backup and queues one hidden standard-path check.
State: `.tmp/standard-build-update-0.1.49.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.47)

Rename the overall view Settings, keeping Workspace as a category. Detached
Settings now keeps one content-independent frame, supports header dragging and
edge/corner resizing, and retains size/position during the session across
reopening and docking. Pages scroll beneath fixed category tabs; geometry stays
inside the app after window resizing or zooming. Gesture cancellation restores
the frame and releases capture/cursor state. See
[implementation and evidence](settings-window-0.1.47.md).

All 918 unit/integration tests and all 31 targeted final packaged desktop cases
pass without failures, skips or flaky cases. Both themes, every category,
short-window scrolling, resizing, dragging, cancellation, docking persistence,
Highlight editor drafts, time templates, native menus and zoom are covered.
Independent review found no correctness issues; its cleanup-coverage suggestion
was addressed. Two additional hidden theme captures pass for visual inspection.
Typecheck, formatting, whitespace, build, NSIS packaging and artifact hashes pass.
Tests remained hidden and offline; actual AWS and installer installation were not
exercised. Artifacts: `release/0.1.47/artifact-manifest.json`. Evidence:
`.tmp/unit-0.1.47-final.json` and `.tmp/desktop-verification-0.1.47.json`.
The gated standard update waits for natural exit, retains a backup and queues
three hidden checks afterward. State: `.tmp/standard-build-update-0.1.47.json`.
Changes remain uncommitted.

## Earlier local verification build (0.1.46)

Add a thin separator above Settings in the activity bar, reusing the themed
separator below the main app menu. Build/typecheck, formatting, whitespace,
packaging and hashes pass. Both targeted packaged activity-panel checks pass in
hidden offline windows, covering light/dark themes and Settings pane/modal
behavior. Existing unit evidence from 0.1.44 is retained for this decorative DOM
addition; the full unit suite was not rerun. Artifacts:
`release/0.1.46/artifact-manifest.json`. Evidence:
`.tmp/desktop-verification-0.1.46.json`. The gated update waits for natural app
exit and queues one hidden check of the standard executable afterward.
State: `.tmp/standard-build-update-0.1.46.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.45)

Remove the thin gray vertical divider beside the window controls. Build/typecheck,
formatting, whitespace, packaging and artifact hashes pass. All eight targeted
packaged window checks pass in hidden offline windows, covering both themes,
narrow wrapping, zoom, menus and close-time saving. Existing unit evidence from
0.1.44 is retained for this CSS-only update; the full unit suite was not rerun.
Artifacts: `release/0.1.45/artifact-manifest.json`. Evidence:
`.tmp/desktop-verification-0.1.45.json`. The gated local update waits for natural
app exit and queues one hidden check of the standard executable afterward.
State: `.tmp/standard-build-update-0.1.45.json`. Changes remain uncommitted.

The standard-folder update completed. Its initial post-update test selector
matched no cases; the corrected hidden check passed in
`.tmp/test-results-standard-0.1.45-verified/report.json`.

## Earlier local verification build (0.1.44)

Settings uses one consistently aligned gray baseline across inactive tabs, gaps and outer margins, preserving the blue active-tab accent. Every workspace tab owns its top edge, including unpinned tabs below a separate pinned row and exposed tabs in ragged wrapped rows. See [details and evidence](tab-border-rendering-0.1.44.md).

All 908 unit/integration tests and all 36 targeted final packaged native scenarios pass without failures, skips or flaky cases. Actual native pixels cover both themes and fractional zoom; interaction checks cover pin rows, wrapping, reordering, hover activation, painting and middle-click closing. Typecheck, formatting, whitespace, build, NSIS packaging and hashes pass. Tests remained hidden and offline; real AWS and installer installation were not exercised. Artifacts: `release/0.1.44/artifact-manifest.json`. Evidence: `.tmp/unit-0.1.44-final.json` and `.tmp/desktop-verification-0.1.44.json`. The gated standard-folder handoff waits for natural exit, retains a backup and queues three hidden checks afterward. State: `.tmp/standard-build-update-0.1.44.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.43)

Minutes/Hours/Days grouping hints use stronger themed text and medium weight. Settings tab content has no left, right or bottom frame, and the tab baseline extends through the body's gutters to both pane/modal edges while preserving the open active tab. See [details and evidence](settings-contrast-and-borders-0.1.43.md).

All 908 unit/integration tests and both targeted packaged native theme scenarios pass. Geometry checks and actual captures cover light/dark panes, modals and narrow navigation. Typecheck, formatting, whitespace, build, NSIS packaging and hashes pass. Tests remained hidden and offline; real AWS and installer installation were not exercised. Artifacts: `release/0.1.43/artifact-manifest.json`. Evidence: `.tmp/unit-0.1.43-verified.json` and `.tmp/desktop-verification-0.1.43.json`. The gated standard-folder handoff waits for natural exit, retains a backup and queues two hidden checks afterward. State: `.tmp/standard-build-update-0.1.43.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.42)

Native caption/background colors use the saved or recovered workspace theme before the first window paint. The renderer waits for restoration before displaying its UI, eliminating the dark default frame when light mode is saved. The validated startup result is reused once, preserving recovery warnings; later workspace loads remain fresh. A thin divider separates the main app-menu icon from other activity controls. Settings now uses tabs joined to a bordered content panel, with top corners, a shared baseline and an open active bottom edge; the old boxed button container is removed. Narrow tab strips scroll independently. See [implementation and evidence](startup-and-settings-tabs-0.1.42.md).

The old native dark background and renderer dark frames were reproduced on 0.1.41. All 908 unit/integration tests and all 30 affected packaged desktop scenarios pass without failures, skips or flaky cases. First-frame pixels and theme mutation samples cover delayed restoration; native checks also cover backup recovery, both themes, connected tab styling, narrow navigation, activity controls, pin dragging, window/menu/zoom and close-time saving. Startup lifecycle/cache/recovery received independent review. Typecheck, formatting, whitespace, build, NSIS packaging, hashes and visual inspection pass. Tests remained hidden and offline; real AWS and installer installation were not exercised.

Artifacts: `release/0.1.42/artifact-manifest.json`; executable: `release/0.1.42/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.42-final.json` and `.tmp/desktop-verification-0.1.42.json`. The gated standard-folder update waits for natural exit, retains a backup and queues three hidden startup checks afterward. State: `.tmp/standard-build-update-0.1.42.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.41)

Quick-template grouping uses a continuous baseline with upward boundary ticks and centered labels. AWS Explorer has a distinct AWS wordmark and orange smile rather than a near-duplicate app icon. Main-menu shortcuts display compact per-key rounded badges with thin borders and separate combination indicators; the plus key remains distinguishable from its separator. See [corrections and evidence](visual-corrections-0.1.41.md).

All 908 unit/integration tests and all eight targeted packaged desktop scenarios pass. Native geometry checks and actual captures cover both themes, pane/modal presentation, connected guides, compact key bounds and literal-plus rendering. Typecheck, formatting, whitespace, build, NSIS packaging and hashes pass. No production changes followed final packaging. Tests remained hidden and offline; real AWS and installer installation were not exercised.

Artifacts: `release/0.1.41/artifact-manifest.json`; executable: `release/0.1.41/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.41-final.json` and `.tmp/desktop-verification-0.1.41.json`. The standard-folder handoff waits for natural exit and retains a backup; three hidden exact-standard-path checks are queued afterward. State: `.tmp/standard-build-update-0.1.41.json`. Changes remain uncommitted.

## Earlier local verification build (0.1.40)

Closed-view history uses up to 760px and the available window height, clips long names with ellipsis and full-name custom tooltips, and displays the corresponding icon/source badge. Preferences sets a seven-day default retention bound, including migration and expiry on restore/reopen. Quick time-template slots occupy one grouped row; relative dropdown rows remain unchanged. Settings uses themed tab shapes, its activity button toggles visibility, the AWS icon matches the app icon and Settings uses a gear. The app menu includes version and working shortcut hints, Toggle side panel preserves panel content, and the heavy pinned-row separator is removed. See [behavior and evidence](interface-polish-0.1.40.md).

All 906 unit/integration tests and all 39 affected packaged desktop scenarios pass without failures, skips or flaky cases on the same artifact. Both themes, narrow windows, retention persistence, full-name tooltips, every numeric stepper/wheel input, pinned dragging, tab/split retention and native menu/zoom/close are covered. Typecheck, formatting, whitespace, build, NSIS packaging, hashes, visual inspection and independent review pass. Tests remained hidden and offline; real AWS and installer installation were not exercised.

Artifacts: `release/0.1.40/artifact-manifest.json`; executable: `release/0.1.40/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.40-verified.json` and `.tmp/desktop-verification-0.1.40.json`. The hash-gated standard-folder update waits for natural app exit, retains a backup and runs three hidden checks afterward. State: `.tmp/standard-build-update-0.1.40.json`. Changes remain uncommitted.

The standard-folder replacement subsequently completed after natural exit. Its three post-promotion checks passed in `.tmp/test-results-standard-0.1.40/report.json`. No normal app was stopped, focused or launched.

## Earlier local verification build (0.1.39)

Open tabs retain their loaded content, list/detail/inspector scroll, expanded rows and branches, resized detail height and temporary decoding when switching views or rearranging splits. Hidden view effects suspend without losing state. The server filter has a clear cross that immediately executes an empty-pattern query. All time-template fields and relative duration support up/down controls and focused wheel editing. Inspector Wrap/Fold sits beside icon-only Copy; the redundant Hide text is removed. See [implementation and evidence](tab-state-and-controls-0.1.39.md).

All 901 unit/integration tests and 54 distinct packaged desktop scenarios have passing evidence on the same artifact. The broad run passed 51; focused checks resolve two stale selectors and one hidden-window animation-stability timeout, with actual folded-marker geometry verified before clicking. Original reports and instrumentation are retained. No production changes followed packaging. Typecheck, formatting, whitespace, build, NSIS packaging, hashes, visual inspection and independent review pass. Native tests remained hidden and offline; actual AWS and installer installation were not exercised.

Artifacts: `release/0.1.39/artifact-manifest.json`; executable: `release/0.1.39/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.39-final.json` and `.tmp/desktop-verification-0.1.39.json`. The hash-gated standard-folder update waits for natural app exit and retains a backup; three hidden exact-standard-path checks follow promotion. State: `.tmp/standard-build-update-0.1.39.json`. Changes remain uncommitted.

The standard-folder update completed. All three additional hidden checks passed against `release/win-unpacked/AWS Log Explorer.exe`; executable, ASAR and installer hashes match the verified package. Report: `.tmp/test-results-standard-0.1.39/report.json`. No normal app was stopped, focused or launched.

## Earlier local verification build (0.1.38)

Relative time presets retain labeled numeric Minutes/Hours/Days/Weeks rows, with a gear-only settings action at the top right. Time ranges settings uses compact fixed numeric slots with ascending neighbor adjustment; quick and dropdown slots remain independent. Explorer profile/region no longer follows tabs or panes, including offline views. Inactive Live tabs retain a paused marker, and the SQL badge is removed. Export precedes the inspector toggle; the toolbar Copy dropdown is removed. Logs and inspector have separate persisted wrap settings, Hybrid respects wrapping, and inspector folding uses one icon toggle. See [implementation and evidence](viewing-corrections-0.1.38.md).

All 890 unit/integration tests and 77 distinct packaged desktop scenarios have passing evidence on the same artifact. The broad run passed 72; five focused reruns resolve two transient process-close waits and three test-only expectations/capture issues. Instrumented parallel close checks recorded prompt saves and clean exits; original reports are retained. No production changes followed packaging; formatting produced byte-identical build output. Typecheck, formatting, whitespace, build, NSIS packaging, artifact hashes, visual inspection and independent review pass. Native testing remained hidden and offline; actual AWS and installer installation were not exercised.

Artifacts: `release/0.1.38/artifact-manifest.json`; executable: `release/0.1.38/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.38-verified.json` and `.tmp/desktop-verification-0.1.38.json`. The hash-gated standard-folder update waits for natural app exit and retains a backup; three hidden exact-standard-path checks follow promotion. State: `.tmp/standard-build-update-0.1.38.json`. Changes remain uncommitted.

The standard-folder update completed after natural app exit. All three additional hidden checks passed against `release/win-unpacked/AWS Log Explorer.exe`; standard executable, ASAR and installer hashes match the verified package. Report: `.tmp/test-results-standard-0.1.38/report.json`.

## Earlier local verification build (0.1.37)

The left pane supports up to 1200px with responsive bounds and immediate resizing after a window narrows. Settings uses detach/dock controls, remembers its last presentation and provides independently configurable quick/dropdown relative-time templates. The narrower time picker links directly to that page. The wider tab menu shows dated closed-tab history newest first, with individual reopen actions. Mixed-source counts use rename-independent badges, while fixed status slots show queries/Live without growing tabs. Floating menus, tooltips and dragged items share one shadow; active pane borders are neutral. Column menus remove custom columns or hide the four protected columns, inspector Hide aligns right, and undo/redo remains in the focused edit control. See [behavior and evidence](workspace-polish-0.1.37.md).

All 859 unit/integration tests and 96 distinct desktop scenarios passed in accepted evidence. The broad candidate exposed stale split/helper-text/encoding expectations, corrected without changing the app, plus native tooltip attributes on new template actions. After that three-prop correction, all 26 affected pane/settings/menu/undo/column checks passed on the final package; 70 unchanged scenarios retain their earlier verification. The aggregate records both manifests and every case/report explicitly. Independent review approved after correcting responsive resize dead zones. Typecheck, formatting, whitespace, build, NSIS packaging and artifact hashes pass. Tests remained hidden and offline; real AWS and installer installation were not exercised.

Final artifacts: `release/0.1.37-final/artifact-manifest.json`; executable: `release/0.1.37-final/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.37-verified.json` and `.tmp/desktop-verification-0.1.37-final.json`. The standard-folder handoff waits for natural app exit and retains a backup; three additional hidden checks follow promotion. State: `.tmp/standard-build-update-0.1.37-final.json`. The earlier candidate's pending helpers were retired without touching the running app. Changes remain uncommitted.

## Earlier local verification build (0.1.36)

The AWS activity button switches or hides Explorer; Settings opens in the left pane and expands into its existing modal while retaining editor selections and drafts. Redundant header Explorer/split actions and the Explorer settings button are removed. The empty separate pinned row appears only during a top-edge drag, including above-window positions; tab, pane-header and Explorer-resource drops reuse existing pin logic. Tab groups are removed, with legacy metadata stripped while retaining tabs, favorites and split views. See [implementation and evidence](activity-panels-0.1.36.md).

All 828 unit/integration tests and all 72 affected packaged desktop cases passed against the same final artifact, without failures, skipped or flaky cases. Both themes, narrow/wrapped layouts, drag/drop/cancellation, settings expansion continuity, migration, menus, text selection, native chrome, zoom and close-time saving are covered. Independent review approved after correcting nested editor remount state loss. Typecheck, formatting, whitespace, build, NSIS packaging and artifact hashes pass. Native tests stayed hidden and offline; real AWS and installer installation were not exercised.

Artifacts: `release/0.1.36/artifact-manifest.json`; executable: `release/0.1.36/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.36-final.json` and `.tmp/desktop-verification-0.1.36-final.json`. Standard-folder handoff state: `.tmp/standard-build-update-0.1.36-release.json`. Promotion waits for natural app exit, retaining a backup; three additional exact-standard-path checks run afterward. No normal app is stopped or focused.

## Earlier local verification build (0.1.35)

The window uses compact integrated chrome: application menu and Settings in the activity rail, Explorer at the top, tabs beside panel actions and native Windows caption controls. Commands, the separate application header, AWS access badge and native menu bar are removed. Native controls follow the selected theme, unused header space moves the window, and interactive areas remain excluded from window dragging. Close-time saving, window bounds, wrapped/pinned tabs and split dragging remain supported. See [implementation and evidence](window-chrome-0.1.35.md).

All 817 unit/integration tests passed. The broad packaged suite passed 58 scenarios. After the final one-line Explorer separator no-drag exclusion, all eight focused header cases passed again on the final package, for 66 successful executions with no failures, skips or flaky cases in the accepted reports. Tests and independent review exposed and corrected native bounds drift, zoom-dependent caption overlap, menu-owned shortcut handling and the separator exclusion. Typecheck, formatting, whitespace, build, packaging and artifact hashes passed. Evidence and limitations are documented in the linked checklist.

Artifacts: `release/0.1.35-verified/artifact-manifest.json`; executable: `release/0.1.35-verified/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/unit-0.1.35-verified.json` and `.tmp/desktop-verification-0.1.35-final.json`. Standard-folder handoff state: `.tmp/standard-build-update-0.1.35-release.json`. Promotion waits for natural app exit and retains the previous folder; three hidden checks of the exact standard path run afterward.

## Earlier local verification build (0.1.34)

AWS/local filter marks now belong to the inspector message overview; the main event map retains severity, quick text and profile matches. The inspector map measures rendered fragments and folded indicators, updates with layout/theme changes, and navigates on both axes. Rows remain visible during highlight updates. The message owns inspector scrolling, controls stay fixed, and metadata folding persists per view. Compact spacing and a shrinkable message basis preserve usable content in short split panes. See [behavior and verification](inspector-scroll-0.1.34.md).

All 817 unit/integration tests and all 33 targeted hidden packaged desktop cases passed against the same final artifact, without failures, skips or flaky cases. Eight intended failures reproduced on 0.1.33. Checks cover both themes, map source separation, proportional wrapped/raw positions, folded paths, both-axis navigation, resize and short-pane geometry, per-tab save/reload, delayed worker presentation, existing inspector/overview behavior, fast scrolling, and Live text selection. Independent review findings and native sizing issues were corrected. Typecheck, formatting, whitespace, build, packaging and artifact hashes passed. Real AWS interoperability and installer installation were not exercised.

Artifacts: `release/0.1.34/artifact-manifest.json`; executable: `release/0.1.34/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/final-verification-0.1.34.json`, `.tmp/unit-0.1.34-final-verified.json` and `.tmp/desktop-verification-0.1.34-final.json`. The standard-folder handoff is gated on these checks and hashes, waits for natural app exit and retains a backup. Three hidden exact-standard-path checks follow promotion. State: `.tmp/standard-build-update-0.1.34-release.json`. No normal app was stopped or launched, no installer was installed, and changes remain uncommitted.

The standard-folder update completed after natural app exit. Three additional checks passed against `release/win-unpacked/AWS Log Explorer.exe`; executable, ASAR and installer hashes match the versioned build. Report: `.tmp/test-results-standard-0.1.34/report.json`.

## Earlier local verification build (0.1.33)

AWS/local/manual matches use distinct colors with expression-aware, field-specific evidence. Folded inspector branches show match dots, and automatic path expansion defaults on in Preferences. Event context ranges now live in a nested row menu with previous/next/both directions and six durations. New tables omit the two fixture-specific JSON columns; conservative migration preserves custom column layouts. See [behavior and limits](filter-highlights-0.1.33.md).

All 801 unit/integration tests passed. All 47 distinct targeted packaged desktop scenarios passed: 39 broad and five context scenarios on the corrected candidate, followed by all 17 affected highlight/cache/Live/source scenarios on the final cache-accounting build. The aggregate retains both manifests and each raw report. Native coverage includes both themes, all event layouts, scoped complex matches, folded markers, auto-expansion, executed versus draft queries, unsupported syntax, all 18 context windows with exact source identity, nested menu dismissal, custom columns, scrolling/overview, profile persistence and Live text selection. Independent review findings and a native tooltip obstruction were corrected. Typecheck, formatting, whitespace, build, packaging and artifact hashes passed. Tests remained hidden and offline; real AWS interoperability and installer installation were not exercised.

Final artifacts: `release/0.1.33-final2/artifact-manifest.json`; executable: `release/0.1.33-final2/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/final-verification-0.1.33.json`, `.tmp/unit-0.1.33-final3.json` and `.tmp/desktop-verification-0.1.33-final.json`. The hash-checked standard-folder handoff waits for natural app exit and keeps a backup; three hidden exact-standard-path checks follow promotion. State: `.tmp/standard-build-update-0.1.33-release2.json`. The earlier candidate handoff was retired before promotion. No normal app was stopped or launched, no installer was installed, and changes remain uncommitted.

## Earlier local verification build (0.1.32)

Neighbors now shift at 80% with a stable reversal band, retaining 20% overlap-based delayed activation. Live state and Follow share the event footer; the banner and query hint line are removed. Follow starts disabled, enables on downward wheel gestures at the bottom even for empty or short lists, and pauses on upward gestures. Nested scrollable content consumes its own wheel motion. Events filters run with Enter and provide persistent Plain Text, AWS Patterns and Auto modes. The fixed AWS badge shows the effective mode; AWS syntax has themed colors and accessible keyboard/mouse keyword completion. See [the implementation and evidence](filter-follow-0.1.32.md).

All 653 unit/integration tests passed. All 52 distinct targeted hidden native scenarios passed across two builds: 35 unchanged tab/pane/split scenarios in the broad run, plus all 17 Live/filter scenarios rerun against the corrected package after fixing JSON nested-scroll handling and updating one history test for Follow's new default. Raw candidate failures and both artifact manifests are preserved in the explicit aggregate. Checks cover both themes, request compilation, completion, pagination, all event modes, empty/short/overflowing Follow, inactive Live, text selection during arrivals, Stop, pins, animation, wrapping, splits and natural close. Typecheck, formatting, whitespace, production build, NSIS packaging and hashes passed. Independent review findings were corrected. This is targeted desktop coverage; real AWS interoperability, keyboard tab-drag animation and all display scaling combinations were not separately exercised.

Corrected artifacts: `release/0.1.32-final/artifact-manifest.json`; executable: `release/0.1.32-final/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/final-verification-0.1.32.json`, `.tmp/unit-0.1.32-final2.json`, `.tmp/desktop-verification-0.1.32-final.json` and its two raw reports. The hash-checked standard-folder handoff waits for natural app exit and keeps the previous folder. Three hidden exact-standard-path checks run after promotion. State: `.tmp/standard-build-update-0.1.32-release.json`. No normal app was stopped or launched, no installer was installed, and changes remain uncommitted.

## Earlier local verification build (0.1.31)

Delayed activation during regular tab reordering uses at least 20% visible overlap of the smaller tab and the final shifted neighbor rectangles. The 450ms timer revalidates its target before selection, and clears when overlap is lost or dragging ends. Unequal-width tabs can activate before the halfway reorder threshold without requiring the cursor to enter the target. Pane-header and Explorer activation retain their existing mechanisms. See [the investigation](tab-hover-overlap-0.1.31.md).

Both reported failures reproduced on 0.1.30. All 634 unit/integration tests passed. All 38 distinct targeted hidden packaged desktop scenarios passed across the broad run and a focused rerun. The broad run passed 37 and failed an old combined-tab gesture that aimed at an original slot after the neighbor had shifted. Updating that gesture to pause at 30% overlap with its exact pickup offset passed; raw reports are preserved. Native coverage includes both themes, wide/narrow sources, shifted targets, grazing and dwell cancellation, split merging, pins, wrapped rows, animations, panel transfers, Explorer drops and natural close. The hidden compositor is kept awake for the short cancellation gesture because background mouse acknowledgements otherwise exceed the dwell. Typecheck, formatting, whitespace, production build, NSIS packaging and artifact hashes passed. Independent review found no actionable issues. This is targeted verification; keyboard drag animation and all display scaling combinations were not separately exercised.

Artifacts: `release/0.1.31/artifact-manifest.json`; executable: `release/0.1.31/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/final-verification-0.1.31.json`, `.tmp/unit-0.1.31-final.json`, `.tmp/desktop-verification-0.1.31-final.json` and its two raw report paths. The standard-folder handoff is gated by these results and matching artifact hashes, waits for natural app exit, and retains the previous folder. Three hidden exact-standard-path overlap checks run after promotion. State: `.tmp/standard-build-update-0.1.31-final.json`. The earlier strict handoff rejected the original-slot test failure before replacing anything. No normal app was stopped or launched, no installer was installed, and changes remain uncommitted.

## Earlier local verification build (0.1.30)

Dragged tabs follow the horizontal pickup point immediately, clamp at occupied row ends, and animate only vertically when changing rows. A consistently topmost inert presentation prevents clipping and covering. Neighbors move at a strict halfway crossing using stable final-slot geometry, retaining the current gap at exact ties. The gap replaces the blue tab-reorder separator. Pins, keyboard dragging, hover activation, splits, panel transfers and Explorer drops retain their existing mechanisms. See [the implementation notes](tab-pointer-motion-0.1.30.md).

All 628 unit/integration tests and 32 affected hidden packaged desktop tests in five files passed, with no failed, skipped or flaky cases. Native checks cover immediate tracking, threshold stability, clamps, an intermediate actual CSS transition frame, reversal from first/middle/last tabs, wrapping, both themes, pin boundaries, combined tabs, panels, resource insertion and cancellation. Typecheck, formatting, whitespace, production build, NSIS packaging and artifact hashes passed. Independent review found no actionable issues. This is targeted verification; keyboard drag animation and all display scaling combinations were not separately exercised.

Artifacts: `release/0.1.30/artifact-manifest.json`; executable: `release/0.1.30/win-unpacked/AWS Log Explorer.exe`. Evidence: `.tmp/final-verification-0.1.30.json`, `.tmp/unit-0.1.30-final.json` and `.tmp/test-results-0.1.30-final/report.json`. The safe standard-folder handoff waits for natural app exit, retaining the previous folder; three exact-standard-path hidden pointer checks are queued after promotion. State: `.tmp/standard-build-update-0.1.30-release.json`. No normal app was stopped or launched, no installer was installed, and changes remain uncommitted.

## Earlier local verification build (0.1.29)

Live startup is protected against periodic historical refresh while the previous request is being cancelled. Obsolete historical pagination cannot replace pending or active Live sessions. Valid empty-page continuation retains its original query bounds. See [the investigation](live-empty-history-0.1.29.md).

All 623 unit/integration tests and 13 affected packaged Live desktop tests passed, with no skipped, flaky or failed cases. New native cases cover empty five-minute history followed by Live arrivals in Table, Hybrid and JSON without Run. An injected AWS transport covers healthy empty heartbeats for 40 seconds followed by an event beyond the historical end time. The races were reproduced in controlled hook tests; the simple empty-result path also worked on the old build. Real AWS interoperability and the user's particular session remain unverified. Typecheck, formatting, whitespace, build, NSIS packaging and artifact hashes passed. Independent review found no actionable issues in the narrow fix.

The standard-folder handoff waits for the current app to exit naturally; three hidden exact-standard-path empty-result Live checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.29.json`, `.tmp/unit-0.1.29-final.json`, `.tmp/test-results-0.1.29-final/report.json` and `.tmp/standard-build-update-0.1.29-release.json`. Artifacts: `release/0.1.29/artifact-manifest.json`; executable: `release/0.1.29/win-unpacked/AWS Log Explorer.exe`. Checks remained hidden and offline. No normal app was stopped or launched, no installer was installed, and changes remain uncommitted.

## Earlier local verification build (0.1.28)

Tab reorder painting uses the existing drop reducer order. All visible tabs slide into their proposed slots at their own widths. Stable logical slots preserve insertion and delayed hover activation. Direction reversals, wrapped rows and separate pin-row crossings keep accurate, unclipped previews. Wrapped height includes borders and existing empty-row content, avoiding unnecessary scrollbars. Floating split-placement previews remain available. Live sessions pause when their view is hidden and reconnect for new events on return, preserving loaded events and received counts. All visible split panes stay live, manual Stop stays stopped even if tabs change before cancellation finishes, and historical automatic refresh skips hidden tabs. Inspector field menus add Copy value using the full current decoded/deserialized value, with JSON formatting for objects and arrays.

All 618 unit/integration tests in 80 files and 42 distinct targeted packaged desktop scenarios in six files passed. The broad candidate passed all 42 checks. After correcting the explicit Stop/switch race in useLogJobs.ts, all 11 affected Live/field cases passed again on the final package; unchanged tab/pane code retains its 31-case verification. Both native runs have no failures, skipped or flaky cases. The aggregate records each candidate manifest and report explicitly. This is targeted verification, not the full desktop suite. Checks cover unequal tab widths, both themes, shared/separate/wrapped layouts, animated reversal from first/middle/last slots, wrapped strip overflow, pin crossing, Explorer drops, combined tabs, split/panel transfers and cancellation. Live verification observes actual fixture-session cancellation while hidden, absence of further packets, fresh-session resumption, retained history, explicit Stop, mode changes and Table/Hybrid text selection. Field tests intercept clipboard writes and verify decoded text, deserialized nested values, raw-message preservation, filtering and columns. Unit checks cover split visibility, delayed and failed cancellation, source changes while asleep and inactive refresh. The same final painting assertion reproduces persistent overlap in the old 0.1.27 package. Independent reviews found no further concrete issues after correcting cross-pin clipping. TypeScript, formatting, whitespace, production build and NSIS packaging passed. Real AWS, keyboard drag animation and all display scaling combinations were not separately exercised.

The standard-folder build was updated after the previous app exited naturally; its backup is retained and final artifact hashes match. All three hidden exact-standard-path smoke checks passed. Evidence: `.tmp/final-verification-0.1.28.json`, `.tmp/unit-0.1.28-final2.json`, `.tmp/desktop-verification-0.1.28-final2.json` and `.tmp/standard-build-update-0.1.28-final3.json`. Artifact hashes: `release/0.1.28-final/artifact-manifest.json`; executable: `release/0.1.28-final/win-unpacked/AWS Log Explorer.exe`.

## Earlier local verification build (0.1.27)

Hybrid primary-row double-click toggles inline details; explicit Open inspector and normal Table/JSON inspection remain available. Expanded Table/Hybrid details have independent structured/raw scroll regions and a bottom pointer/keyboard resize separator. Chosen heights survive folding and virtualization within the view. Individual expansions retain other measured row heights; global layout/bulk changes immediately remeasure mounted rows. Exact fractional heights and top-based positioning avoid boundary overlap and transformed stacking contexts that let following pinned cells intercept the separator. Automatic Message cells prefer a non-empty string msg, then message, then raw text. The same property path is used for highlight spans; original records are preserved.

All 603 unit/integration tests in 79 files and 20 distinct targeted packaged desktop checks in seven files passed across the final suite and the focused Live rerun. The 20-case suite had 19 passes and one pre-mouse-down coordinate-race failure in the test harness; both Live theme checks passed after stabilizing that harness. Raw reports are preserved. No cases were skipped. This is targeted desktop verification, not a full desktop-suite run. Hidden native checks cover Hybrid double-click, consecutive expansions with independent scroll positions, two expanded rows during live resizing, separator geometry/hit testing, fold/virtualization height retention, raw multiline scrolling, message priority, Table inspector navigation/resizing, bulk fold/unfold in all modes, both-theme hover/highlight rendering, fast regex-highlight scrolling and Hybrid Live text selection. The existing app reproduced a roughly 70px row overlap before correction. The native resize probe identified the following pinned cell intercepting the separator; final positioning/layering restored its hit target. Independent static review found no concrete issues. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.27.json`, `.tmp/unit-0.1.27-release2.json`, `.tmp/desktop-verification-0.1.27.json` and `.tmp/standard-build-update-0.1.27-release3.json`. Artifact hashes: `release/0.1.27/artifact-manifest.json`; executable: `release/0.1.27/win-unpacked/AWS Log Explorer.exe`.

Checks stayed hidden and hard offline with isolated storage. No real AWS or user workspace was accessed, no normal app was stopped or launched, and no installer was installed. Changes remain uncommitted.

## Earlier local verification build (0.1.26)

Tab reordering now translates the dragged tab without scaling its contents. Neighbours stay at their layout slots, the insertion marker previews the destination, and the dragged surface is opaque. Structured-field menus add Decode URL encoding and Decode Base64 text. They reuse immutable per-view projections, show temporary-change labels and preserve original messages. Decoded JSON can subsequently be deserialized into foldable fields. URL decoding is a single strict percent-decoding pass preserving literal plus signs. Base64 supports canonical padded/unpadded standard and URL-safe UTF-8 text, rejects malformed and binary values, and checks only an open menu within the existing input bound.

All 586 unit/integration tests in 77 files and 19 targeted packaged desktop checks in five files passed, with no failures, skips or flaky results. This is targeted desktop verification, not a full desktop-suite run. Native checks cover drag painting in both themes and shared/separate/wrapped pin strips, unequal labels, protected pin boundaries, left-quarter pickup, tab/split lifecycle, panel final-area previews, detach/dissolution and hover/cancel transfer. Inspector checks cover both decoding actions, invalid and binary rejection, chained JSON deserialization, folding, decoded columns/filtering, raw message preservation, records/CSV, view reset and theme rendering. Independent static review found no concrete issues. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.26.json`, `.tmp/unit-0.1.26-release.json`, `.tmp/test-results-0.1.26-release/report.json` and `.tmp/standard-build-update-0.1.26-release.json`. Artifact hashes: `release/0.1.26/artifact-manifest.json`; executable: `release/0.1.26/win-unpacked/AWS Log Explorer.exe`.

Checks stayed hidden and hard offline with isolated storage. No real AWS or user workspace was accessed, no normal app was stopped or launched, and no installer was installed. Changes remain uncommitted.

## Earlier local verification build (0.1.25)

Normal and split tabs support persisted pinning. Pinned entries lead a shared strip or use an optional separate row, show an unpin button, and ignore middle-click, Delete and close shortcuts; explicit context-menu Close remains available. Tab/header and Explorer drags share stable insertion geometry. Before/between-pin drops pin new tabs; shared-row drops after the last pin remain unpinned. Empty pinned rows accept drops. Explorer batches open individual group/stream tabs at the selected boundary while delayed hover activation, source drops and split previews remain available. Inactive tab text has stronger contrast with themed hover feedback. Valid font-size edits apply before blur; buffer/refresh numeric edits remain deferred.

All 580 unit/integration tests in 76 files and 32 targeted packaged desktop checks in seven files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.25, not a full desktop-suite run. Native checks cover protected closing, persistence, live font edits, empty/wrapped pin rows, shared pin boundaries, left-quarter pickup reordering, Explorer batch placement, hover activation/cancel/split drops and both themes, plus existing tab/split/Explorer/menu behavior. Independent review found transformed source rectangles could block reordering; stable layout slots fixed the reproduced regression. Pin inheritance across split creation, exit, detach and dissolution is covered. Re-selecting the current theme no longer resets light to dark. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.25.json`, `.tmp/unit-0.1.25-release.json`, `.tmp/test-results-0.1.25-release/report.json` and `.tmp/standard-build-update-0.1.25-release.json`. Artifact hashes: `release/0.1.25/artifact-manifest.json`; executable: `release/0.1.25/win-unpacked/AWS Log Explorer.exe`.

Checks stayed hidden and hard offline with isolated storage. No real AWS or user workspace was accessed, no normal app was stopped or launched, and no installer was installed. Changes remain uncommitted.

## Earlier local verification build (0.1.24)

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

The current implementation is version `0.1.34`. The release configuration and offline tests provide a starting point for distribution; they do not establish a signed, security-audited or commercially validated production release.

The standard launch folder was updated to 0.1.11 after natural app exit, with a retained backup and matching executable/ASAR/installer hashes. Two additional hidden checks passed against the exact standard path: `.tmp/test-results-standard-0.1.11/report.json`.
