# Interaction improvements implementation plan

The [panel dragging and query controls plan](panel-drag-and-query-controls-plan.md) tracks the current batch. The earlier [combined split-tab plan](split-workspace-plan.md) supersedes the global split-pane behavior below.

## Scope and constraints

Implement the reported interaction fixes and the additional split-screen requirements together. Preserve the existing AWS safety boundary: no real AWS calls, credential/profile inspection or user application-data access during development. Desktop regressions use isolated storage, fixtures, injected transports and hidden verification windows.

## Viewer

- Reproduce column resizing with trusted pointer input. Update widths continuously while dragging, capture the pointer, suppress text selection and browser drag gestures, and clean up on pointer release/cancel.
- Repair hybrid mode and keep JSON/Table/Hybrid icons and labels on one line at normal and compact pane widths. Verify expanded structured rows and scrolling rather than testing only the mode selector.
- Preserve the stable sorting state and bounded virtual rendering introduced by the renderer-freeze fix.

## Dates and navigation

- Trace custom/local/UTC date input through query construction and the SDK boundary. Lock milliseconds for event APIs and seconds for Insights with injected-request assertions, including timezone and end-boundary cases.
- Automatically run a newly committed valid date range, cancelling superseded work. Debounce custom editing; do not automatically submit unrelated query-text changes.
- Replace prefix-only group filtering with matching text anywhere in the group name, using supported AWS search semantics and honest pagination behavior.

## Tabs

- Single-click a group into a reusable preview tab; selecting another group replaces the preview. Double-click a group or preview tab to make it permanent. Render preview titles in italics and preserve permanent tabs.
- Drag from the tab body, excluding controls. Open tab actions on right-click and the keyboard context-menu gesture instead of a visible ellipsis button.
- Support multi-selection and a context action to show the selected tabs in split mode.
- Ignore modifier-only key presses, including Shift, when deciding to display keyboard-navigation focus indicators.

## Split-screen additions

- Update each split button's icon and accessible description to match the horizontal or vertical split it will apply.
- Near the tab-strip bounds, dragging reorders and highlights the original tab in place. Beyond a small distance threshold, show the dragged tab beside the cursor for pane placement.
- Highlight edge drop zones on each pane. Dropping on the left/right creates a side-by-side split; dropping on the top/bottom creates a stacked split next to the current view.
- Allow dragging to enter or extend split mode, up to four panes. Persist the resulting layout, retain working divider controls, and cancel outside drops without changing the workspace.
- Use a bounded split tree if necessary to represent splitting an individual pane, while preserving existing flat pane IDs and migrating older fixed-grid sessions.

## Verification and delivery

- Add failing model/SDK regressions before their fixes and trusted hidden desktop cases for the user gestures.
- Cover preview promotion/replacement, selected-tab splits, whole-tab dragging, both drag modes, all four edge targets, divider persistence, modifier focus, live column widths, selection suppression, hybrid geometry, substring search and automatic dates.
- Run TypeScript, the isolated unit suite, focused desktop regressions and a combined packaged-executable run. Rebuild the Windows installer and update the release manifest and verification record after the final code changes.

No commit, installation, publishing or real AWS verification is included.

## Completion

Implemented in 0.1.2. All 189 isolated tests and 20 hidden desktop tests passed; the Windows installer was rebuilt. See [feature status](feature-status.md) for the final artifact and verification record.
