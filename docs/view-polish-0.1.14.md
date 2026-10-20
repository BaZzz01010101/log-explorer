# Favorite menus, source column and row hover (0.1.14)

Favorite context menus use the installed Mantine cursor-positioning mechanism. Mouse menus open beside the right-click point, and keyboard menus anchor inside the focused row so the floating menu remains visible within a scroll-clipped list. Rename favorite edits the saved entry's alias; it preserves the saved tab configuration and does not rename open copies. Unchanged snapshots remain deduplicated after an alias is renamed.

Table and Hybrid views automatically include a configurable Source column when multiple groups or explicit streams are selected. It reuses source-badge shortening, adds profile/region labels across connections, expands ambiguous stream names, and exposes full group/stream/endpoint details on hover. Explicit hidden choices persist, column removal records a hidden choice, and the existing 80-column limit remains. Source data is available for sorting and CSV export. Retained results use the executed request's source/connection snapshots while edits are stale.

Selected row hover uses the theme selection tint in JSON/Table/Hybrid, including the Hybrid gutter/detail and pinned cells. Ordinary rows retain their normal hover style. Row highlight rules retain their colors outside selection hover.

- [x] Reproduce pointer-menu distance and missing Source column in hidden native tests; reproduce selected-hover behavior and alias persistence.
- [x] Implement rename and deduplication, pointer/keyboard positioning, automatic/configurable Source and selection tint.
- [x] Reproduce/fix reviewed identical stream suffixes across dates and retained request-source/connection snapshot cases, including an empty additional-connection list.
- [x] Verify final Windows artifacts with targeted packaged regressions and stage the normal launch-folder update after natural exit. Keep all results in `.tmp`; no real AWS, profile/credential discovery, user workspace access, installation or commits.

All 482 unit/integration tests in 62 files and 21 targeted packaged desktop regressions passed, with no failures, skips or flaky results. The standard launch folder contains 0.1.14, with the previous build retained. All four hidden standard-path checks passed. Evidence: `.tmp/final-verification-0.1.14.json`.
