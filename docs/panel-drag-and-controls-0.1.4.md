# Panel dragging and query controls in 0.1.4

The [implementation plan](panel-drag-and-query-controls-plan.md) extends the existing combined-tab model. Supported layouts retain the existing four-panel limit.

## Panel movement

Panel headers previously used a separate header-to-header swap handler. They never entered tab placement mode, so there was no floating preview, pane highlighting or tab-strip detachment. The existing model also rejected member edge drops and interpreted cross-entry member drops as moving the entire combined tab.

Headers now capture a stable log-view ID and reuse tab hover activation, floating previews, pane hit testing and projected placement. That identity survives the source header unmounting when another tab is revealed. Dropping into the strip uses a visible insertion marker, including its trailing whitespace. Header controls remain separate from dragging. Opening a tab context menu immediately hides its tooltip.

Center drops swap member views. Edge drops first remove the source leaf and collapse its vacated branch, then insert beside the destination. Preview geometry comes from that same pure operation used by the reducer. Moving between two side-by-side panels consequently previews the final half, rather than splitting the old destination into a quarter. Two-, three- and four-panel layouts, nested splits and unequal divider ratios use the same operation.

Detaching does not close or duplicate the view. Flat IDs, queries, filters, dates, columns, labels and buffers remain associated with their views. A combined entry with one remaining member dissolves into a normal tab at its original strip position; the combined alias ends with the split. Cross-entry transfers move only the dragged member. Outside drops and Escape restore activation after a hover switch without changing ownership.

## Date and message controls

The range picker provides Relative presets and Absolute start/end inputs, with Local/UTC beside it. This follows the [documented CloudWatch range choices](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html). New tabs start with Clear: available history through the current time. Existing saved ranges retain their meaning. Invalid or incomplete absolute edits stay as drafts; valid pairs apply automatically using the existing query debounce and cancellation.

Absolute ranges store explicit UTC instants. Switching display timezone preserves those instants. Review reproduced a repeated-hour defect: editing only the end of a Madrid range could move an untouched `2026-10-25T01:30Z` start to `00:30Z`. Unchanged bounds now retain their original canonical instant instead of being reparsed from an ambiguous wall time.

Fold/unfold-all sits beside line wrapping in JSON, Table and Hybrid. Each mode retains its own default and individual exceptions; newly loaded or virtualized messages inherit its default. JSON and Hybrid support individual expansion. Table uses the bulk control and keeps its existing cell geometry. Rendering and inspection remain virtualized and bounded.

## Automatic pagination

Groups, expanded streams and event results load automatically when their end approaches the viewport. Short pages fill the viewport without another scroll. Normal pagination buttons are removed; errors retain retry. A shared scroll/resize hook consumes each page request synchronously, preventing duplicate scroll notifications from starting the same page twice. Busy, stale, cancelled, failed, live, truncated and full-buffer results cannot auto-page.

AWS event cursors identify a mutable server-side session and can remain unchanged across valid pages. Event page keys therefore include the completed request ID as well as the opaque cursor; query scope remains stable during queued continuations. Group and stream APIs use their actual continuation tokens. Empty-page chaining pauses after a bounded burst, and downward scrolling, wheel input or navigation keys can resume it even in an underfilled viewport. Adapter-level repeated-token detection remains intact.

## Verification

The initial trusted hidden regression reproduced the missing header preview before the fix. Model tests exercise every source, target and edge for supported panel counts, strict ownership/schema invariants, detachment, source dissolution, capacity and state preservation. Desktop cases compare preview rectangles with final pane rectangles within two pixels, and cover selected-position/whitespace detachment, cross-entry hover transfers and cancellation.

Component and helper tests cover automatic group/stream continuations, event request guards, repeated opaque cursors over multiple pages, underfilled viewports, empty-page limits, timezone/DST preservation and fold defaults/exceptions. The offline desktop fixture has nine groups and four streams per group; it exercises actual group pagination. Its events and stream lists fit within one service batch, so their continuation branches use injected component/adapter tests rather than a real AWS connection.

See [feature status](feature-status.md) for final counts and artifact hashes. All desktop runs use hidden windows, Chromium focus emulation, temporary storage and an immutable offline gate. No real AWS requests, credential/profile inspection, user application-data access, installation or commits are part of this work. Pointer dragging is covered; physical OS input, screen readers, installer lifecycle and other platforms remain separate release checks.
