# Pointer-following tab reorder (0.1.30)

The dragged tab follows the horizontal pickup offset immediately while staying on its current visual row. It clamps at the first and last occupied positions in that row. Moving to another row changes its vertical position with a 160ms transition; horizontal position has no transition delay. The existing inert presentation clone now covers every pointer reorder, above all tab strips, so overflow and stacking contexts cannot clip or cover a row jump.

Neighbor movement is separate from the dragged surface. Candidate gaps are computed from final packed layouts using each tab's real width. Adjacent gap positions differ by the intervening tab's width, so their midpoint is the strict halfway crossing threshold. At an exact tie, the previous gap remains selected. Animated client rectangles do not influence this decision. This handles reversal, fractional sizes, unequal labels and narrower dragged tabs without repeated swapping at a stationary pointer.

The original nodes stay mounted for sortable registration and hover activation. Pointer reorder uses the same resolved insertion for preview and drop. Wrapped height changes trigger a geometry refresh. Keyboard dragging retains its existing sortable path. Pane-header and Explorer insertion markers remain available; the blue line is removed for ordinary and combined tab pointer reordering, where the rearranged neighbors show the gap.

## Verification

Unit coverage includes immediate pointer movement, both sides of the exact threshold, tie retention in both directions, repeated stationary evaluations, fractional narrow/wide tabs, row locking/jumping and occupied-range clamping. Native checks use isolated hidden offline instances. Results, including failed harness attempts, remain under `.tmp`.

The old 0.1.29 package failed the new pointer-preview check. Two new geometry assertions also failed before implementation. Hidden compositor throttling initially prevented intermediate CSS frame sampling; a native hidden capture advances the compositor, and the test pauses the actual top transition at 80ms to verify its intermediate position and top-level stacking. Earlier reversal assertions referred to the removed insertion line or counted the inert preview as a second real tab; they now address the registered source and its normalized next-tab boundary.

No AWS, normal application windows or user workspace data are used for verification. No installer is installed and changes remain uncommitted.

All 628 unit/integration tests and all 32 affected packaged desktop tests in five files passed, with no failed, skipped or flaky cases. This is targeted desktop verification. Coverage includes the new motion behavior, both themes and pin layouts, wrapped rows, first/middle/last reversals, whole tab and combined-tab movement, panel transfers/detachment/dissolution, hover activation, Explorer insertion, seven-pane resource drops and invalid/cancelled drops. Independent read-only reviews found no actionable issues. Typecheck, formatting, whitespace, production build and NSIS packaging passed.

Final evidence: `.tmp/final-verification-0.1.30.json`, `.tmp/unit-0.1.30-final.json`, `.tmp/test-results-0.1.30-final/report.json` and `release/0.1.30/artifact-manifest.json`. The standard-folder handoff is hash-checked and waits for the current app to exit naturally; its authoritative state is `.tmp/standard-build-update-0.1.30-release.json`. Three hidden pointer/midpoint/row-animation checks are queued against that exact standard path after promotion. Keyboard drag animation and all display scaling combinations were not separately exercised.
