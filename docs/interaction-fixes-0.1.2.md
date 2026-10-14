# Interaction fixes in 0.1.2

The changes follow [the interaction plan](interaction-improvements-plan.md). Desktop verification uses trusted Chromium input in hidden Electron windows, isolated application storage and fixtures. AWS tests inject command responses; no real account, credentials or application-data workspace is used.

## Viewer defects reproduced

- The Timestamp column stayed at 194 px while a held pointer moved 90 px. Table resizing used end-only updates. Resizing now renders local width drafts continuously, captures the pointer, suppresses selection/native dragging and persists the final width on release. Escape and cancellation restore the prior width and clean up the cursor and listeners. Keyboard sizing remains available.
- Hybrid's icon and label centers differed by 19 px because mode labels could wrap. Mode labels now stay inline.
- An expanded Hybrid row moved to x=-92 while the viewport began at x=328 after a 420 px horizontal scroll. Expanded JSON now remains constrained to the viewport while table columns scroll. Regression checks cover expansion, header/cell alignment, overlapping rows and horizontal scrolling.
- Modifier-only key presses could promote Chromium's mouse-focused controls to visible keyboard focus. A separate input-modality tracker ignores pure modifiers, returns to pointer mode on pointer input and retains keyboard indicators for Tab navigation.

The stable sorting state and disabled automatic table page reset from the [0.1.1 freeze fix](renderer-freeze-investigation.md) remain in place. Idle CPU and trusted typing are still checked after sorting and clearing the sort.

## Dates and group search

The existing event API millisecond bounds and Insights second conversion were correct. Missing 30-minute, 3-hour and 12-hour preset durations were added. Custom dates reject impossible calendar dates, nonexistent local DST times and reversed bounds. Tests cover local dates, explicit offsets and API end boundaries.

AWS can return empty `FilterLogEvents` pages with continuation tokens despite matching events later in the range. Fetches now follow empty pages automatically, up to 32 per source, with cancellation and repeated-token detection. If the budget ends, continuation remains available and the UI describes the incomplete search. The change is verified with injected AWS responses, including empty pages followed by real events; live account interoperability remains unverified.

Date changes run automatically. Presets apply immediately; valid custom input waits 400 ms while editing. Closing a tab, changing its source or manually running cancels pending date work. Query-text changes remain manual. Hidden desktop checks observed a five-minute selection reduce fixture results from 540 to 57; editing the pattern retained 57 until another date selection applied it.

Group search now uses AWS's case-sensitive substring operation. Searching `orders` can match `/aws/lambda/orders-api`. Matching pages are hydrated by exact name to retain retention, class and storage metadata omitted by pattern responses. Both page size and hydration identifier count remain at most 50. Fixture behavior matches the server search.

## Tabs and panes

Single-click resource navigation reuses an italic preview tab. Double-clicking the resource or preview tab keeps it open. Editing query/source settings also promotes a preview so later navigation cannot discard the edit. Permanent tabs survive preview replacement, and previews/layouts survive validated persistence.

The entire tab body is a drag surface, excluding its controls. Right-click and the keyboard context-menu gesture open tab actions. Ctrl/Shift selection supports **Show in split mode** for two to four tabs. The old tab grip and ellipsis controls are removed.

Dragging near the tab strip reorders the highlighted original tab without a cursor copy. Moving farther away shows a cursor copy for pane placement. Left/right and top/bottom edge drops create side-by-side or stacked views, and split icons describe their next direction. Splitting a view beside itself creates a separate tab with independent configuration. Moving an already visible view collapses its vacated pane. The highlight projects the layout after that collapse, including divider widths; a trusted regression caught a 294 px mismatch before this correction. Dropping on an empty pane highlights its full assignment area. Outside drops and Escape leave the workspace unchanged, and the pane limit is four.

Layouts use a bounded binary split tree with a ratio per divider. Saved fixed-grid sessions migrate to the corresponding tree. Schema validation rejects missing/duplicate pane references and malformed or excessively deep trees. Pointer and keyboard dividers resize locally and persist their final ratios; closing a pane collapses its branch.

## Delivery limits

See [feature status](feature-status.md) for the final test counts and artifact record. The Windows installer is unsigned. Real AWS authentication/data, physical OS input, screen readers, installer installation/uninstallation and macOS/Linux remain outside this verification.
