# Combined split tabs

The requested behavior replaces global split mode. A top-level tab is either one log view or a combined split containing two to four log views. Activating a normal tab shows one full-size pane. Activating a combined tab restores its own layout and active pane. Member log configurations and query runtimes remain independent and persist when another top-level tab is active.

Combined tabs use a split icon, a default title joining member labels, and a structured hover tooltip listing every member label. Rename changes only the visible title; a combined custom title survives member/layout changes until the split is broken. Renaming a normal view survives source/query/view changes until that view is closed. Exit split screen restores member views as adjacent normal tabs and drops the combined custom title. Closing a combined tab closes its member views; ordinary closed-view history remains available.

Dragging a normal or combined tab near the strip reorders it. Hovering another top-level tab while dragging activates that destination after a short delay so its pane layout can receive a drop. An edge drop merges the dragged member views with that destination in the indicated place, with at most four panes and an accurate projected layout. A combined tab drags as one unit. Dropping outside or pressing Escape changes neither membership nor ordering. Pane headers become drag handles to reorder panes within the active combined tab. The separate pane-control strip is removed.

Shift selects an inclusive range from the selection anchor; Ctrl toggles individual tabs. The active tab is included when a selection starts. Duplication inserts immediately after its original, including an independent copy of a combined layout. Explorer connection selection is persisted separately from active view selection and remains selected after the last tab closes.

Table and Hybrid column headers support direct pointer dragging, with a threshold to distinguish sorting from dragging and separate resize handles. Column order persists with the view. Resize, sort, pinned columns, horizontal scrolling and header controls retain their behavior.

## State and validation

`Workspace.tabs` continues to contain log views so query ownership and cancellation stay unchanged. `splitTabs` stores combined entries with their own pane IDs, layout, active pane and optional custom title. `tabOrder` stores top-level order; `activeTabId` selects a normal or combined entry. Existing `panes`, `layout` and `activePaneId` are the active entry's rendered projection. `activeConnectionId` preserves explorer selection independently. A log view belongs to at most one combined entry and appears only once in the top-level strip.

Persistence validates every member, layout, entry ID and active reference, strips unknown keys and bounds layouts to four panes. Old global split sessions migrate into one combined entry while unassigned normal tabs remain available. Invalid combined entries dissolve safely without dropping valid log views. Development and verification keep AWS disabled, use isolated application data, and never show desktop windows or inspect credentials.
