# Log controls and Explorer interaction implementation plan

> **For agentic workers:** Execute the authorized tasks in this checkout using isolated unit/native tests and independent review. Keep changes uncommitted.

**Goal:** Make log-level selection, column pinning, query-mode switching and Explorer controls behave as requested without losing saved view state.

**Architecture:** Reuse the current view configuration, captured-pointer resource dragging and query ownership pipeline. Keep level selection and column operations in small reusable controls/helpers. Limit hover feedback to primary event rows, retaining profile colors.

**Tech stack:** TypeScript, React, Mantine, TanStack Table/Virtual and Electron.

**Spec:** The user's control and Explorer improvements requested on 2026-10-20 in this conversation.

## Global constraints

- Preserve previous local work and the running application. No staging, commits, installation or real AWS calls/profile discovery.
- Desktop verification stays hidden with immutable offline flags, isolated `.tmp` storage and intercepted clipboard writes where copying is exercised.
- Build versioned artifacts and update the usual launch folder only after verification and natural application exit, retaining the previous build.

## Tasks

### Level selection

Files: `components/LevelFilter.tsx`, `shared/contracts.ts`, `shared/log-data.ts`, `main/security.ts`, `workspace.ts`, and the filter block in `components/LogViewer.tsx`.

Interface: optional `ViewConfig.levels: string[]`; `matchesLocalFilter` accepts a legacy string or selected-level array. Migrate old single-level settings; default to all seven levels. Explicit `[]` means no matching levels.

- [x] Observe failing tests for OR matching, unknown levels, legacy migration and schema round trips.
- [x] Implement exclusive text clicks, additive checkbox/Ctrl/Cmd text clicks and All/None behavior with persistent selections.
- [x] Verify actual native selection, saved empty selection and reset behavior in `tests/desktop/level-filter.spec.ts`.
- [x] Reproduce the label sitting above the chevron through native text-range geometry; restore vertical centering and preserve long-selection ellipsis.

### Column actions

Files: `renderer/column-actions.ts`, `components/ColumnHeaderMenu.tsx`, `components/LogViewer.tsx`.

Interface: `applyColumnAction(columns, path, action): ColumnConfig[]` with six explicit actions. Move left/right stays within the current pinning pool. Pin inserts beside the last pinned column; Unpin inserts at the front of the unpinned pool. Pin left and Unpin right operate on the displayed prefix/suffix including the clicked column. Preserve hidden slots, formats and widths.

- [x] Observe five failing model assertions and a missing-menu failure through trusted native right-click input.
- [x] Implement bounded pointer/keyboard context menus and use the same single-column pin semantics in the column editor.
- [x] Verify all six actions in Table/Hybrid, keyboard menus and persisted configuration in `tests/desktop/column-context.spec.ts`.

### Explorer and badges

Files: `ExplorerSidebar.tsx`, `WorkspaceTabs.tsx`, `explorer.css`, `sources.css`.

- [x] Reproduce the dark tooltip, hollow regex dot, off-center badge cross, missing multisource icon and dead row edges in hidden native tests.
- [x] Apply theme tokens and a filled dot/asterisk glyph, reset close-button padding, choose a stacked icon for normal multi-source views, and extend the captured-pointer hit area across row height while preserving separate controls.
- [x] Verify edge/corner clicks and drags, Ctrl/Shift selection, stream-count icons, split icons and badge/tooltip geometry in `tests/desktop/explorer-polish.spec.ts`.

### Query mode and hover

Files: `useLogJobs.ts`, `query-state.ts`, `viewer.css`, related hook and desktop tests.

- [x] Reproduce missing mode refresh, duplicate combined refresh and stale retired-operation updates.
- [x] Include query kind in operation ownership, coalesce automatic refresh triggers, and leave query-text edits manual.
- [x] Reproduce and scope hover selectors to the primary event row, retaining selection/profile colors in all modes and themes.
- [x] Verify mode changes, cancellation and expanded-detail hover in `tests/desktop/query-mode-detail-hover.spec.ts`.

## Review and delivery

- [x] Independently review legacy level migration, interleaved/hidden column order, stale query/live updates, row-control hit areas and profile-colored details.
- [x] Complete full unit tests, TypeScript, formatting and meaningful hidden desktop regressions; inspect captures in both themes.
- [x] Build 0.1.16 and record artifact hashes in `.tmp` and the versioned release folder.
- [x] Verify the exact standard executable after its gated update.

All 534 unit/integration tests in 71 files and all 116 packaged desktop regressions in 26 files passed, with no failures, skips or flaky results. The standard launch folder contains 0.1.16, with the previous build retained. All eight hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.16.json`, `.tmp/unit-0.1.16-final.json`, `.tmp/test-results-0.1.16-final/report.json` and `.tmp/standard-build-update-0.1.16-final.json`.
