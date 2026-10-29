# Highlights pane dividers

Resize Profiles against Rules with the divider between their tables. Resize the
table area against the expanded preview with the horizontal divider above it.
Both theme previews remain equal and share the existing synchronized viewer state.

Resizing is live. Arrow keys adjust the focused divider; Shift makes larger steps,
Home and double-click center it, and End reaches its maximum. Pane minimums keep
summary controls usable. Escape, lost capture, blur or hiding the category cancels
an unfinished gesture and restores document selection/cursor state. Draft editors
and committed pane ratios survive docking; width and stacked-height ratios are
stored separately in the Settings session.

Narrow Settings stacks Profiles and Rules and changes their divider to horizontal.
Short modals retain usable table heights and a resizable preview while the page
scrolls between sections. Hover lines and pointer targets share the same center.

Validation uses hidden isolated offline windows. Evidence and release metadata are
under `.tmp`; versioned artifacts are under `release/0.1.52`. The standard app is
updated only after natural exit, with a previous-build backup. Changes remain
uncommitted.

Final evidence: 940 unit/integration tests and 17 packaged desktop checks passed.
See `.tmp/desktop-verification-0.1.52.json` and
`release/0.1.52/artifact-manifest.json` for results and checked artifacts.
