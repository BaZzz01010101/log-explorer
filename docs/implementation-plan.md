# Implementation plan

## Settings content sizing and captured log preview (0.1.50)

Center single-column forms, stretch Workspace JSON and the Highlight rule editor,
keep scroll ownership stable, and preview the opening tab's actual loaded events
in light/dark hybrid tables only in detached Settings. See
[the checklist](settings-layout-and-log-preview-0.1.50.md).

## Responsive Settings pages (0.1.49)

Adapt all six pages to the actual pane/dialog width and height, preserving state,
navigation and existing features. See [the checklist](responsive-settings-0.1.49.md).

## Stable Settings window (0.1.47)

Rename the overall view Settings, keep one frame across categories, and support
dragging/resizing with retained session geometry and constrained page scrolling.
See [the checklist](settings-window-0.1.47.md).

## Settings activity separator (0.1.46)

Match the main-menu separator above the Settings activity button and verify both
themes and Settings panel behavior in hidden offline windows.

## Window controls divider (0.1.45)

Remove the thin gray vertical divider before the window controls and validate the
existing native window layout and interactions in hidden offline tests.

## Settings baseline and workspace tab edges (0.1.44)

Use one consistent gray Settings baseline while retaining its blue active accent.
Restore top borders below pinned rows and along exposed wrapped tabs.
See [the checklist](tab-border-rendering-0.1.44.md).

## Settings hints and baseline (0.1.43)

Strengthen the unit-hint text, remove the Settings content frame and extend the
tab baseline to the pane/modal edges. See [the checklist](settings-contrast-and-borders-0.1.43.md).

## Startup theme and connected Settings tabs (0.1.42)

Apply the saved theme before native/renderer first paint, separate the main menu
activity icon and replace Settings button cards with tabs joined to their panel.
See [the checklist](startup-and-settings-tabs-0.1.42.md).

## Visual corrections (0.1.41)

Join the time-template grouping guide, use a distinct AWS wordmark and show compact
per-key shortcut badges with unambiguous plus separators. See [the checklist](visual-corrections-0.1.41.md).

## History, settings and activity controls (0.1.40)

Expand and truncate closed-view history with seven-day configurable retention,
align quick-template slots on one axis, refine Settings tabs and activity icons,
and expose app version and working menu shortcuts. See [the checklist](interface-polish-0.1.40.md).

## Tab state and viewing controls (0.1.39)

Retain each tab's loaded viewer state across selection and split transitions, add clear-and-query for server filters, expose time-field steppers/wheel editing, and consolidate inspector actions. See [the checklist](tab-state-and-controls-0.1.39.md).

## Viewing and time-template corrections (0.1.38)

Restore numeric relative-time rows and compact fixed-slot editing, retain inactive Live indicators, decouple Explorer selection from views, and correct toolbar order and independent wrapping. See [the checklist](viewing-corrections-0.1.38.md).

## Workspace controls and viewing preferences (0.1.37)

Raise the pane width limit; persist Settings detach/dock mode; configure quick
and dropdown relative templates; show dated closed-tab history, source-count
badges and query/Live status. Align floating shadows, protect core columns while
supporting removal, and scope undo to the focused input. See [the checklist](workspace-polish-0.1.37.md).

## Activity panels and contextual pinned row (0.1.36)

Hide the empty separate pinned row until a drag reaches the window top edge.
Use AWS Explorer and Settings activity buttons to switch the left pane, with
Settings expandable into its modal. Remove redundant toolbar actions and tab
groups, preserving legacy tabs and split views. See [the checklist](activity-panels-0.1.36.md).

## Compact window chrome (0.1.35)

Remove Commands and the separate application/native menu headers. Keep the app
menu and Settings in the activity rail, align Explorer and tabs with the window
top, and reserve native caption controls beside panel actions. Preserve tab
dragging, wrapped/pinned rows, close-time saves and window geometry. See
[the implementation and verification checklist](window-chrome-0.1.35.md).

## Hybrid details and message previews (0.1.27)

Make Hybrid primary-row double-click toggle inline details, add independent
resizable detail scroll regions, retain valid row measurements across individual
expansions and share `msg`-first non-empty preview selection with highlighting.
See [the checklist and root cause](hybrid-details-0.1.27.md).

## Tab drag rendering and inspector decoding (0.1.26)

Preserve tab dimensions and opaque surfaces during reordering, with stable
neighbours and the existing insertion marker. Add explicit bounded URL and
canonical UTF-8 Base64 decoding through the existing temporary field projection.
See [the checklist and decoding decisions](tab-drag-and-field-decoding-0.1.26.md).

## Pinned tabs, resource insertion and live font edits (0.1.25)

Persist pin state for normal and split entries, protect pinned tabs from ordinary
closing, offer shared/separate pin sections and reuse stable insertion geometry
for tab/header and Explorer drags. Preserve delayed hover activation and existing
split/source destinations. Improve inactive-tab contrast/hover and apply valid
font-size edits before blur. See [the current checklist](pinned-tabs-and-resource-insertion-0.1.25.md).

## Menus, tooltips and Explorer search (0.1.23)

Coordinate all application context menus, dismiss outside clicks and window
blur, and move resource copy actions into row context menus. Replace native
title hints with selectable, hoverable tooltips following the selected theme.
Add case-insensitive Explorer matching by default and configurable Alt+E/Alt+C
regex/case shortcuts scoped to its filter. Track validation and delivery in
[the 0.1.23 checklist](menus-tooltips-and-explorer-0.1.23.md).

Replace structured-field action buttons with one menu before the key, and add
temporary JSON-string decoding with foldable, color-marked children. Preserve
raw records while using decoded values in local columns, filters and record/CSV
serialization.

## Highlight scrolling and Live text selection (0.1.22)

Retain and prepare regex results across scrolling with bounded caching and visible-row priority, distinguish pending rows from non-matches, and preserve native text selection during Live updates. See [the checklist and verification notes](highlight-scroll-and-live-selection-0.1.22.md).

## Event row selection and hover colors (0.1.21)

Give selection priority over profile row colors, apply a neutral hover tint to all primary row states, and remove the partial outline across pinned cells while preserving expanded details. See [the checklist and verification notes](row-colors-0.1.21.md).

## Live Tail lifecycle and feedback (0.1.20)

Separate connecting/streaming/stopped feedback, preserve matching history, make automatic reception and follow behavior explicit, and verify stop/retry, silent transport and complete batch handling. See [the checklist and verification notes](live-tail-0.1.20.md).

## Highlights editor and event text selection (0.1.19)

Replace vertical rule cards with the compact profile/table/detail layout, preserve highlight behavior, add collapsible live preview and make event text directly selectable. See [the checklist and verification notes](highlights-editor-0.1.19.md).

## Selected event copying and Hybrid previews (0.1.18)

Add message/record copying and keep multiline Hybrid previews compact using [the current checklist](event-copy-0.1.18.md). Verify through isolated hidden desktop tests and update the standard build after the running app exits naturally.

## Divider alignment (0.1.17)

Centered column and inspector resize targets, verified Explorer and both split axes, and preserved the full scrollbar map hit area. See [verification notes](divider-alignment-0.1.17.md).

## Control improvements (0.1.16)

Implement the requested checkbox level selection, column header actions, automatic query-mode refresh, row-only hover and Explorer/badge/icon fixes using [the current checklist](control-improvements-0.1.16.md). Preserve existing saved configurations and hidden offline verification.

## Favorite menus, Source and hover (0.1.14)

- [x] Position favorite context menus beside the pointer, preserving keyboard opening and visibility inside the scrolled favorites list.
- [x] Add persistent favorite aliases through Rename, retaining snapshots, open tabs and save deduplication.
- [x] Show a configurable Source column for multiple groups/streams, with shortened names, stream-collision handling and profile/region identity. Retained results use executed request snapshots.
- [x] Keep selected-row hover tint in JSON/Table/Hybrid, including pinned cells and expanded Hybrid areas, in both themes.
- [x] Complete 482 unit/integration tests and 21 targeted packaged regressions; retain prior full-suite evidence separately. Package and stage a hash-checked normal-folder update gated on natural app exit.

## Saved views and remembered access (0.1.13)

- [x] Replace group/stream favorites with self-contained snapshots of normal/combined tabs, preserving sources, connection endpoints, time windows, queries and view settings. Migrate legacy favorites.
- [x] Add tab context-menu save, drag-to-Favorites, independent reopening and right-click removal. Preserve original snapshots and reject capacity overflow atomically with visible feedback.
- [x] Remove advanced connection settings; retain the friendly profile/region editor. Remember explicit packaged AWS-access choices separately from workspace imports. Refresh Explorer and AWS queries on enabling; keep development and verification hard-offline.
- [x] Reproduce and fix reviewed deleted-group restoration, failed preference-write revocation and save/open workspace-size overflow cases. Focused desktop flows and 477 unit/integration tests pass.
- [x] Complete the 88-case packaged suite and visual verification; stage a hash-checked normal-folder handoff gated on natural app exit. All evidence remains in `.tmp`; no real AWS, installation or commits.

## Inspector defaults and proportional overview (0.1.10)

- [x] Open new event viewers with an inspector at 30% of the event area. Keep pointer/keyboard resizing and add a show/hide toggle beside Export.
- [x] Replace midpoint dots with scaled event-area bands; merge adjacent colors, preserve real gaps and variable heights, and keep dense rendering bounded. Navigate to the event at the clicked part of a band.
- [x] Match decoded/formatted quick-highlight text in the right overview and keep that lane visible and clickable beside the inspector. Cover regressions with hidden input, geometry and pixel checks, then package and stage a hash-checked normal-folder update for application after natural close. Keep results in `.tmp` and AWS isolated.

## Event scrollbar overview (0.1.9)

- [x] Keep a compact native scrollbar with warning/error/fatal markers on its left and corresponding quick/profile highlight colors on its right. Cover all currently displayed loaded events, including virtualized offscreen rows.
- [x] Reuse the guarded regex worker for bounded background summaries; cancel stale work and retain responsive scrolling. Aggregate dense markers, follow sorting/filtering and measured row heights, and support clicking markers to jump.
- [x] Verify unit behavior and trusted hidden desktop interactions in all viewer modes, light/dark themes, inspector/resize and native scrolling. Package and update the standard launch path safely; keep evidence in `.tmp` and AWS isolated.

## Explorer selectors and quick highlighting (0.1.8)

The user replaced the account/region tree design with explicit dropdown selection. Continue in place, preserving prior view state and AWS isolation. This bounded revision reuses the resource cache, tree interactions, known-region catalog, visibility model and literal highlight renderer.

- [x] Show only log groups and their streams in the virtual tree, with separate profile and region dropdowns above it. Remove loaded-stream filtering. Fetch/render only the selected connection; preserve per-region cache/request safety, preview opening, dragging, favorites and keyboard/pagination behavior.
- [x] Replace the known-profile checklist with an Add profile dropdown and configured profile cards. Each card shows only added regions and an Add region dropdown. Removal hides entries without deleting connections or disrupting open tabs; legacy configured profiles migrate naturally and removed choices can be added again.
- [x] Put a clearable quick text-highlight field beside loaded-event search. Save it per view, retain older global highlight text as a compatibility fallback, and render it consistently across JSON/Table/Hybrid and the inspector without changing filters or issuing queries. Keep advanced highlight profiles.
- [x] Cover selector isolation, no region/account tree nodes or stream filter, settings add/remove/restore, quick-highlight persistence and view isolation with focused tests and trusted hidden desktop input. Run broader regression checks, inspect hidden captures and package 0.1.8.
- [x] Record verified artifacts/results under `.tmp`; stage a normal-folder update while the app is running, and apply it after close, preserving any running older build and keeping a backup. Do not install or access real AWS/user workspace data.

The user supplied a comprehensive brief and explicitly delegated product and technical decisions. Proceed autonomously inside this empty workspace, without extra approval gates or commits. The AWS restriction is absolute.

1. Establish TypeScript contracts, Electron/Vite configuration and test isolation. Write behavioral tests for JSON Pointer flattening, safe workspace restoration and pane/tab invariants before implementation.
2. Implement `createLogService(emit, { allowAws })` behind `ExplorerApi` contracts. Cover fixture pagination, query updates/cancellation and denial before any AWS provider/client construction. Implement official FilterLogEvents, Insights and Live Tail adapters without executing them against AWS.
3. Implement a secure Electron main process and preload bridge. Validate request payloads and sender frames; expose explicit methods. Persist versioned workspace atomically; support export/copy and close cleanup. Development AWS enablement must fail.
4. Implement the React workspace: profile/region connections, lazy paginated hierarchy, favorites/recents, tabs/groups and four draggable panes. Persist configuration with debounce; support tab cycling, closing/reopening and command palette.
5. Implement the structured viewer: virtualized JSON/table/hybrid modes, column discovery, resizing/sorting/pinning/order/visibility, local filtering, presets, event inspection/copy/export and highlighting. Cover nested arrays, dotted keys, huge messages and invalid JSON.
6. Connect query execution, progress, cancellation, manual continuation, time presets/custom ranges, multi-group selection, saved queries/history, surrounding context, refresh and Live Tail. Distinguish service and local filtering.
7. Run typecheck, critical tests, production build and an isolated Electron smoke test. Review security and lifecycle independently. Fix material findings. Document commands, release requirements, AWS permissions and any limitations honestly.

## Review focus

- Stale/cancelled query results cannot overwrite an active tab.
- Empty paginated AWS pages retain continuation and repeated tokens terminate safely.
- Malformed or older workspace files never enable AWS or crash startup.
- Large/deep/hostile JSON remains bounded, preserves literal keys and renders as text.
- Closing tabs/windows, changing connections and ending live streams release jobs and listeners.

## Ownership

Main/service, visualization and workspace state are independent implementation tasks sharing `src/shared/contracts.ts`. The root implements the desktop shell, sidebar, query UI and integration. Changes remain reviewable and uncommitted.

## Current interaction follow-up

Continue the authorized changes in this checkout; keep earlier calendar and drag behavior. Use hidden, isolated offline desktop verification and versioned build output to avoid the running application's locked directory.

- [x] Finish the time toolbar fixes: untrimmed label line box, applied custom-range selection tint, persistent left Clear for absolute filters, and 5m/1d shortcuts. Preserve staged custom edits and immediate shortcut refresh.
- [x] Add a saved Tab layout preference for horizontal scrolling or multiple rows. Test middle-click close in both modes, row-aware tab reordering and pane detachment into wrapped rows.
- [x] Increase split-divider and pane-header contrast using existing theme tokens, preserving drag and resize geometry.
- [x] Show loading in the center of an initially empty event pane and at the scroll-list bottom while fetching more. Keep one bottom status with useful shown/loaded counts and timing, meaningful running/live/error/cancel states, and no decorative LOCAL/complete labels.
- [x] Remove the instructional/export footer. Format local and UTC timestamps with the same numeric date/time fields, retaining an accurate timezone suffix.
- [x] Separate row selection from inspector visibility: single click selects, double click opens a docked right inspector, arrows/Home/End navigate the filtered/sorted sequence, and the open inspector follows selection. Enter opens and Escape/hide closes it without losing selection.
- [x] Retain structured/raw content, copy, source metadata and surrounding context. Add fold/unfold-all structured data and per-field Add to filter beside Add as column. Filtering uses the existing loaded-event search and does not issue service queries.
- [x] Resize the inspector with a pointer or keyboard separator; clamp within its pane, support cancellation and clean up capture/listeners.
- [x] Verify focused regression tests first, then the full isolated suite and combined hidden packaged desktop suite. Inspect actual screenshots, rebuild versioned Windows artifacts, record hashes/results, and leave changes uncommitted.

Implementation ownership: tab/pane agent owns tab preferences, tab geometry and pane styling; event-status agent owns query feedback components and timestamp formatting; root owns viewer/inspector integration, persistence validation and release evidence. The desktop verification agent owns shared hidden harnesses and interaction regressions.

## Highlight profiles, window state and source management

The user requested these additions during verification and explicitly asked to continue. Implement them inline in this checkout. Reuse existing event rendering, workspace preferences, resource navigation and query validation. Keep the existing literal highlight setting compatible.

- [x] Add bounded, persisted highlight profiles to preferences and the main-process workspace schema. Each profile has a name, enabled flag, optional log-group regex and ordered rules. Each rule has plain-message or JSON Pointer scope, regex and case option, row/text target, optional foreground/background colors, and an opt-in light/dark override. Empty profile patterns match every group. Invalid patterns surface inline; first matching rule wins overlapping colors/text spans.
- [x] Evaluate regexes in a renderer worker, only for visible events and the inspector, with bounded input/results and a timeout that terminates a stalled worker. Reuse the parsed-message and column formatting helpers. Cover plain and structured events, escaped paths, disabled and scoped profiles, light/dark colors, overlapping and zero-width matches, invalid regexes and worker cancellation/timeout.
- [x] Add a Highlights settings tab with profile/rule add, delete, enable, ordering and editing, sensible colors and inline preview. Persist changes through the existing preference pipeline. Apply row and text styling consistently in JSON/Table/Hybrid and the inspector while retaining selection visibility.
- [x] Persist main-window normal bounds and maximized state in a separate small atomic local file. Validate and clamp restoration to available monitor work areas, including removed displays; never persist minimized geometry. Save on move/resize/state changes and final close. Background verification must remain hidden.
- [x] Add a validated resource drag payload and merge helper. Drag group/stream labels from Explorer onto the current event pane to add sources, with a visible drop target, duplicate suppression and existing all-stream selections preserved. Reject mismatched connections/regions and source limits with an explanation; do not silently replace sources.
- [x] Replace the newline source editor with grouped source cards, explicit all-stream/specific-stream choices, removable stream chips, searchable group/stream suggestions with continuation, manual names and a staged Apply/Cancel workflow. Preserve existing selections and validation; changes retain the existing manual Run behavior.
- [x] Add focused model/component and hidden offline desktop checks for profiles, source drag/editor and geometry restart. Run the full unit suite, typecheck and formatting; rebuild versioned Windows artifacts and verify the final package without touching the running app. Keep all evidence in `.tmp` and record exact verification limits.

Review focus: malformed imported profiles must not authorize or query AWS; catastrophic regex must not block the renderer; path scope must not highlight another field with the same value; late browse responses must not change another connection's draft; normal bounds must survive maximization and monitor changes; group/stream drops must preserve query/view state.

## Account and region Explorer (0.1.7)

The user added this scope after the 0.1.6 checkpoint (406 unit tests and all 65 packaged desktop checks passed). Continue inline without another approval gate. Account entries represent AWS profiles; no STS/account-identity lookup is needed. Existing configured connections and IDs remain valid.

- [x] Persist optional connection-region visibility and per-profile enablement, defaulting older configured connections to visible. Disabling visibility must retain tabs, connection IDs and settings, and must not grant or revoke AWS authorization.
- [x] Build a profile/region selection model that merges known profile names with configured profiles, preserves disabled selections, deduplicates region choices and creates a connection only for a newly enabled region. Use the installed AWS SDK partition metadata for known region names; retain custom configured regions. Keep profile discovery behind the existing authorized `profiles()` API.
- [x] Replace the single-connection Explorer data flow with one virtualized account → region → group → stream tree. Hide the account level for a single AWS profile, keep fixtures identifiable, and expose only enabled profile/region combinations. Fetch groups only for expanded regions; retain per-region caches, stream expansion and isolated request generations. Search and automatic continuation must work across expanded regions without stale responses crossing scopes.
- [x] Preserve resource preview/permanent opening, details, favorites/recents, selected-source opening, captured-pointer source dragging and keyboard navigation. Keep the connection selector as a quick jump that reveals a region; it no longer limits which configured regions exist in the tree. Account/region collapse, cross-level arrows and virtualized focus must work with duplicate group names in different regions.
- [x] Add a friendly Connections settings section with known-profile enable switches, searchable known-region checkboxes for each profile, selected-region counts, and explicit offline discovery guidance. Put manual connection fields under Advanced connection settings. Profile/region toggles update Explorer visibility immediately and persist; existing tabs keep their connection.
- [x] Cover model/schema migration, disabled state restoration, region metadata and duplicate IDs/endpoints; lazy loading, concurrent region pagination, stale responses and keyboard traversal; settings toggles and natural restart with hidden offline native checks. Run appropriate full regression checks, rebuild versioned 0.1.7 Windows artifacts and record exact results/hashes under `.tmp`.

Review focus: duplicate log-group names must retain their connection identity; collapsing accounts must not fetch their hidden children; disabling a profile must preserve its selected regions and open tabs; profile discovery must remain impossible in development/offline verification; favorites and drops must use the originating region; search/pagination results must not leak between regions.

## Direct source controls (0.1.11)

The user requested replacing staged source editing with removable horizontal badges, limiting drops to that strip, automatic queries, accurate generated titles, multi-region and multi-stream correctness, and newest-first Explorer streams. Follow [the implementation and verification checklist](sources-0.1.11.md). Preserve manual names, view configuration and isolated background verification.

## Explorer pane drops and source presentation (0.1.12)

Extend resource dragging into pane splits while retaining source-strip additions. Use separate badges and a prominent count label, hide the single-source control except during dragging, generate `Mixed Sources (N)` labels across combined panes, and distinguish pane headers from statuses in both themes. Follow [the implementation and verification checklist](explorer-splits-0.1.12.md).

## Explorer selection and larger split views (0.1.15)

Implement the current favorite aliases, regex filtering, fixed dropdown choices, batch resource context/drag actions, larger splits, remembered access and event multi-selection requirements using [the checklist](explorer-selection-0.1.15.md). Preserve previous behavior and verify the integrated application in hidden offline windows.

## Tab reorder motion (0.1.28)

Complete the coordinated tab preview, wrapped height, inactive Live suspension and inspector value-copy changes using [the checklist](tab-reorder-motion-0.1.28.md). Preserve insertion, delayed activation, splits and view state; verify hidden offline and stage a hash-checked update after natural app exit.

## Live after empty history (0.1.29)

Investigate the reported empty five-minute history to Live transition using [the investigation and checklist](live-empty-history-0.1.29.md). Guard newer Live operations against automatic historical refresh and obsolete pagination, preserve valid continuation, and verify quiet streams and new arrivals with isolated tests.

## Pointer-following tab reorder (0.1.30)

Apply [the pointer-motion changes](tab-pointer-motion-0.1.30.md): immediate horizontal pickup tracking, row-bound vertical animation, strict midpoint neighbor movement using stable geometry, occupied-row endpoint clamps, no blue tab-reorder marker and a consistently topmost dragged surface. Preserve pins, hover activation, split/panel and resource drops; verify using hidden offline native tests.

## Overlap-based drag activation (0.1.31)

Fix [delayed activation during tab dragging](tab-hover-overlap-0.1.31.md) using a 20% overlap threshold relative to the smaller tab and the shifted reorder rectangles. Revalidate at activation time and preserve dwell cancellation, original-view restoration, split drops and pane/resource behavior. Reproduce both reported cases against 0.1.30 and verify the integrated package in hidden offline windows.

## Compact Live controls and AWS filters (0.1.32)

Implement [the current checklist](filter-follow-0.1.32.md): 80% tab movement, compact Live/Follow footer, directional wheel following disabled by default, removal of query help noise, Enter submission, persistent Plain Text/AWS Patterns/Auto modes, fixed mode badge and themed syntax/keyword completion. Preserve existing Live, tab, split and query state mechanisms and verify hidden/offline before packaging.

## Deterministic filter highlights and context ranges (0.1.33)

Implement [the behavior and verification checklist](filter-highlights-0.1.33.md): distinct AWS/local/manual match colors; expression-aware, field-specific evidence; folded-branch dots and default-on automatic path expansion; nested row context ranges preserving source identity; universal default columns and conservative legacy migration. Reuse worker deadlines, highlight layers, workspace persistence and application menus. Verify hidden/offline, package and hash-check before the normal-folder handoff.

## Inspector message map and scrolling (0.1.34)

- [x] Remove AWS/local filter evidence from the main list overview while retaining quick-text/profile and severity lanes. Keep worker-based matching in event text and the inspector.
- [x] Remove row-hiding preparation placeholders; loaded event text remains available while highlights update.
- [x] Add a compact, clickable inspector message map based on rendered match positions, including folded markers and quick highlights; recalculate after folding, wrapping, decoding, resizing and theme changes.
- [x] Make message content the only vertical scroll owner in the inspector. Keep navigation and controls fixed, with a collapsible metadata section whose state is validated and persisted per view.
- [x] Reproduce on the prior build, run focused and full unit checks, validate hidden/offline native regressions, inspect captures, and package a hash-checked update without disturbing the normal app.
