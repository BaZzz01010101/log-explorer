# Menus, tooltips and Explorer search

- [x] Inspect independent menu state, tooltip rendering and paginated search.
- [x] Add regressions for unfiltered case-insensitive search, menus and tooltips.
- [x] Coordinate menus across all components and dismiss on outside input.
- [x] Move resource copy actions into group and stream context menus.
- [x] Replace native title hints with selectable, interactive, themed tooltips.
- [x] Add Explorer match-case toggle and scoped, configurable search shortcuts.
- [x] Replace per-field column/filter buttons with one action menu before the field name.
- [x] Add temporary JSON value deserialization, foldable children and a distinct visual cue.
- [x] Validate desktop interactions, raw selection and existing viewer behavior.
- [x] Package and verify the usual launch path without interrupting the user.

The string tooltip is delegated so virtualized event cells retain their DOM and
selection behavior. Rich tooltips use the same styling and Mantine's interactive
hover support. Menu opening dismisses other menus and tooltips across portals.
Literal case-insensitive searches scan unfiltered pages rather than forwarding
an incorrect case-sensitive AWS name filter. Regex evaluation stays in bounded,
terminable workers; both search modes discard results when their scope changes.

Broader checks found that interactive hints inside a compact popover could cover
another control. Such hints now open beside the popover, and pointer focus does
not schedule keyboard hints. Tab tooltips are disabled throughout a workspace
drag. These cases passed alongside level selection and pane moves.

Each structured field has one action menu before its key. Deserialize is enabled
only for valid JSON strings within the existing parser limits. It creates an
immutable, view-local projection, expands that subtree and marks it in violet.
Decoded paths work in columns, sorting, local property filters, record copies and
CSV exports. Raw messages and full-event JSON/JSONL exports remain original.
Projections survive inspector navigation and Live arrivals for the same event;
closing the view or replacing the event discards them. Menu Escape consumes the
key before the inspector can close. Independent static review found no further
issues in pointer replacement, lifecycle or serialization integration.

## Verification

All 569 unit/integration tests in 74 files and 88 targeted packaged desktop checks in 17 files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.23, not a full desktop-suite run. Native checks cover menu exclusivity and Escape focus, tooltip geometry and real mouse selection/copy inside overlays, both themes, configurable shortcuts, nested escaped JSON paths, projection lifetime, CSV/record copies, Live selection, highlight scrolling, column dragging/resizing and split layouts. TypeScript, formatting, whitespace, production build and Windows NSIS packaging passed. Independent static review found no remaining material issues; native regressions reproduced and fixed tooltip trigger-style leakage, overlay tooltip selection ownership, wildcard stream ARNs and menu Escape closing the inspector.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.23.json`, `.tmp/unit-0.1.23-release.json`, `.tmp/test-results-0.1.23-release/report.json` and `.tmp/standard-build-update-0.1.23-release.json`.
