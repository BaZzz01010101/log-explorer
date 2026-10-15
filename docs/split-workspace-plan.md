# Combined split tabs implementation plan

**Goal:** Implement the user's combined-tab split workflow and accompanying selection, duplication, connection and column-drag changes.

**Architecture:** Keep log views and runtimes flat; add combined entries owning layouts and a top-level order/active ID. Project only the active entry into renderer panes, with validated persistence and legacy migration.

**Spec:** [Combined split tabs](split-workspace-design.md).

**Constraints:** No commits or installation. No AWS calls, credential/profile inspection or user application-data workspace access. Desktop tests remain hidden and use isolated storage. Preserve existing renderer-freeze, query-generation and live-resize fixes.

## Tasks

- [x] Model and schema: add combined entries, top-level order/activation, retained connection selection, adjacent duplicate, rename, exit, member close, merge/drop, pane reorder and migration. Add failing model/schema tests first; run the relevant suites after implementation.
- [x] Tab interaction: render only top-level entries, implement anchored Shift ranges and Ctrl toggles including the active entry, adjacent duplication, rename/exit context actions, split icon and member tooltip, whole-entry drag and delayed destination hover activation. Remove the pane strip. Test selection and native gestures.
- [x] Viewer: add direct header dragging in Table and Hybrid; protect resize/sort/header controls and pinning, persist order and verify horizontal scrolling. Reproduce with trusted pointer input and retain the live-resize regressions.
- [x] App integration: render the selected entry's pane projection, wire persistent explorer selection, handle combined entries in commands/shortcuts, add pane-header dragging and retain direction icons and exact drop previews.
- [x] Verification: migrate existing desktop expectations from global panes to combined tabs; add hidden tests for normal/split activation, destination-hover drag, rename/exit, pane-header reorder, range selection, adjacent duplication, last-tab connection preservation and column drag. Run unit/type/format checks, independent review and a combined packaged run; rebuild the Windows artifacts and verification record.

## Review focus

- Selecting a normal tab must never inherit another entry's split layout.
- Source/destination membership changes and cancelled drags must not lose views or duplicate ownership.
- Renaming a combined entry must survive its layout updates and restart; exiting removes only that combined name.
- Closing the last view must preserve the selected connection; connection deletion must choose a valid remaining connection.
- Column dragging must not sort accidentally, swallow resize events or disturb pinned/hidden columns.

## Completion

Implemented in 0.1.3. All 244 isolated tests and 27 hidden desktop tests passed; the Windows artifacts and final verification record were rebuilt.
