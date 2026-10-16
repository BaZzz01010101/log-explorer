# Implementation plan

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
