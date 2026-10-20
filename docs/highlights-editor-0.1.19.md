# Highlights editor and event text selection (0.1.19)

- [x] Compact profile selection, naming, ordering, enablement and group matching at the top.
- [x] Rule table with saved priority, enable checkboxes, scope/path, target, regex and color swatches.
- [x] One selected-rule detail panel, with structured paths, case options and shared or theme-specific colors.
- [x] Drag handle, keyboard reordering, move buttons and numeric priority all update the same saved rule order.
- [x] Add/delete rules and profiles, retain independent selection and preserve existing schema, matching precedence and limits.
- [x] Collapsible live profile preview, retaining sample input while folded and pausing its matching effects.
- [x] Select event text directly under the pointer in Table/Hybrid, including highlighted spans. Preserve row selection, inspector navigation and native text-copy behavior.
- [x] Finish packaged regression checks and hash-checked local delivery.

Baseline desktop checks reproduced three simultaneous full rule editors and an empty text selection after dragging across message glyphs. Event cells used buttons; replacing them with focusable text content and preserving native ranges after a drag fixes selection without changing row-selection shortcuts.

The editor uses the existing sortable library and highlight worker. Rule priority remains array order, with the first matching colors and overlapping text spans taking precedence. Escape cancels a reorder without dismissing settings. The preview is collapsed initially to keep the editor compact. Theme, scope, persistence and regex-timeout regressions remain covered.

All 542 unit/integration tests in 72 files and 32 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.19; the prior full 116-case run belongs to 0.1.16. The staged standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.19.json`, `.tmp/unit-0.1.19-final.json`, `.tmp/test-results-0.1.19-final/report.json`, `.tmp/test-results-highlights-0.1.19-final/report.json` and `.tmp/standard-build-update-0.1.19-final.json`.
