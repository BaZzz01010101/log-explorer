# Log view controls and readable maps

Ctrl-click on an event expander opens the row and its JSON recursively, then fits
the detail height into the available event viewport. Large content remains
scrollable within the existing inspection limits. Ordinary expansion, manual
resizing, independent heights and tab state remain available. JSON keys no longer
show path tooltips; the field menu includes Copy path with the exact JSON Pointer.

The local filter and quick-highlight input have centered pointer/keyboard resize
handles. Widths are bounded by the pane, persist in the view and survive reload.
Quick highlighting has case and regex toggles matching Explorer controls. These
settings persist per view. Arbitrary regex matching uses the existing bounded
worker, including displayed text spans, structured paths and map evidence; plain
matching remains available while worker results arrive. Invalid regexes are
marked without executing them on the renderer thread.

Scrollbar map colors are adapted independently from row/text paint. Narrow marks
target at least 3:1 against the actual track, strengthen washed-out hues and cap
dark-track luminance when contrast permits. Severity paint and event geometry are
preserved. Inspector lanes no longer have three gray separator lines.

Custom clear crosses now emit one edit through the existing per-control undo
history. Local, highlight, server and Explorer edits support restoring text and
selection with undo, and clearing again with redo.

Focused tests first reproduced missing expansion/copy-path controls, missing
field controls, stripped saved widths and clear-history failures. Verification
uses workspace-local temporary files and hidden isolated offline native windows.
Versioned artifacts and final verification evidence are recorded separately after
the package passes its final checks.

Final evidence: all 997 unit/integration tests and 36 targeted packaged native
checks pass with no failures, skips or flaky cases. Evidence and artifact hashes
are recorded in `.tmp/desktop-verification-0.1.57.json`. A virtualized remount
regression was reproduced and corrected before the final package. Checks used
hidden offline windows; real AWS and installer installation were not tested.

The standard launch folder was updated after natural app exit with a backup
retained. All three promoted hashes match, and four hidden post-update checks
pass: recursive expansion, field resizing/persistence, clear undo/redo and dark
map readability. See `.tmp/test-results-standard-0.1.57/report.json`.
