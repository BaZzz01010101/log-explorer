# Highlight tree styling, reordering and history width

Use the existing Explorer row, label and expander styles for the Highlights tree.
Keep disabled items gray, use the established highlight-marker icon for rules,
and render profile rule counts as compact badges. Retain the tree editor's
immediate updates, context menus, validation and synchronized modal previews.

Drag any row to reorder siblings. Profiles move with their expanded rule blocks;
rules remain inside their profile. Reuse the installed sortable mechanisms and
variable-height keyboard coordinates. Keep the selected editor mounted and its
incomplete input intact. Commit only on a valid drop; Escape and outside drops
cancel. Use the existing floating shadow during dragging.

Size closed-tab history from its content, with a 760px maximum limited by the
window. Preserve its height limit, vertical scrolling, ellipsis, tooltips, source
metadata, date grouping and reopening behavior. Short histories shrink naturally.

Verify with hidden isolated offline windows in both themes. Keep test artifacts
in `.tmp`, package as `0.1.54`, and stage the standard update behind verification,
artifact hashes and natural app exit. Do not close or relaunch the user's app.

Final evidence: 962 unit/integration tests and 36 targeted packaged desktop checks
passed with zero failures, skips or flaky cases. Both themes cover real pointer
and keyboard drags, long expanded profiles, cancellation, drops outside the tree
and onto another profile/rule, retained editor DOM and incomplete input, menus,
preview synchronization, responsive Settings and history sizing/reopening. Tests
first reproduced the missing drag support, oversized typography and fixed 760px
width against 0.1.53. All new behavior was verified on the final 0.1.54 package.

The aggregate `.tmp/desktop-verification-0.1.54.json` records the unit/native
reports and checked artifact hashes. Installer installation and real AWS were
not exercised. Standard-path promotion and queued postchecks are reported
separately by `.tmp/standard-build-update-0.1.54.json`.
