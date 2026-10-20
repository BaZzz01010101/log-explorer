# Event scrollbar overview

The event scrollbar is 20 pixels wide. Its native thumb remains in the center; two five-pixel lanes show warning/error/fatal events on the left and highlights on the right. Empty panes do not reserve unused scrollbar space, keeping the initial loading indicator centered.

Severity uses the existing yellow, red and pink level colors. Highlights use the effective profile background, falling back to foreground, and yellow for quick literal matches. Scoped structured and plain-message regex rules retain their enabled state and light/dark overrides. Dense markers keep the highest severity and combine up to four distinct highlight colors.

The overview covers the current filtered/sorted loaded rows, including virtualized offscreen events. Measured row offsets and heights position the markers; unloaded event heights use the virtualizer estimates until measured. Expanding rows, resizing the pane or inspector and horizontal scrolling retain the native track geometry. Click a marker or a lane near it to select and scroll to its event, without opening the inspector. Existing keyboard navigation remains available.

Regex summaries reuse the guarded highlight worker in batches of 100 events. Summaries omit flattened display fields and text spans, post progress in bounded batches and are cancelled on input/configuration changes. The existing startup/progress watchdog terminates stalled regex work; overview failures are shown in the viewer. The worker never has AWS or credential access. Dense marker rendering is bounded by track height, rather than loaded event count.

Regression coverage includes measured positions, dense collisions, severity priority, effective overlapping row colors, disabled/scoped structured rules, theme overrides, zero-width text patterns, chunking and stale-worker cancellation. Hidden native checks exercise all viewer modes, quick-highlight clearing, offscreen jumps, native thumb dragging, inspector placement, sorting, local filtering and light/dark colors. The loading check also reproduces and guards the empty-pane centering regression found during implementation.

Build and final verification results are recorded in [Feature status](feature-status.md). All reports and hidden captures remain under `.tmp`; verification uses isolated offline/background launches.
