# Explorer details, searches and table interactions

Explorer's Recent sources list is replaced with a collapsible Source details pane.
It follows the last interacted group or stream, independently of multi-selection.
The pane provides selectable names, ARN and available metadata, with direct copy
actions. Long identifiers wrap, the details scroll within a bounded area, and the
tree keeps its own viewport. Changing the Explorer connection clears old details.
Resource hover tooltips are removed; opening, selecting, dragging and resource
context menus remain available.

Event cells and JSON-card source labels no longer show content tooltips. The
inspector remains the deliberate place to read event details. Left/Right folds
or unfolds the current event without toggling already-correct state. Nested JSON
controls, editors, menus and resize handles retain their own keyboard behavior.

The columns editor uses the same protected-column policy as the header menu:
Timestamp, Level, Message and Source can be hidden, but their definitions cannot
be deleted. Custom columns can still be removed. At least one visible column is
retained, and hidden protected columns remain available to show again.

Saved and recent searches is beside the query editor, immediately before Run.
The menu contains search save/load/delete actions and recent queries. Views stay
in Favorites. Saving suggests a single-line version of the query, bounded by the
existing 120-character name limit, and focuses/selects that name for replacement.
Deletion closes the menu and restores focus to its trigger for keyboard users.
Preferences includes Recent searches to keep (default 30, range 1–100), applied
to both restored and newly recorded history.

Insights SQL edit history has a stable per-tab identity during the current app
session. Undo/redo and selections survive Events/Insights and tab switches;
other fields and tabs keep independent histories. Replacing a query externally
starts fresh history. The retained control cache is limited to 100 keys and is
disposed with the document; this is not a persisted query-edit audit trail.

Verification uses hidden isolated offline app windows and temporary evidence in
`.tmp`. Focused tests reproduced the old column, keyboard and tooltip behavior,
and the new separator/menu keyboard edge cases before their fixes. Final package
evidence and promotion status are recorded separately after the checks finish.

Final package evidence: all 1,020 unit/integration tests and 28 targeted native
checks pass with no failures, skips or flaky cases. Hashes and reports are recorded
in `.tmp/desktop-verification-0.1.58.json`. Native regressions confirm the resize
handle keeps its row open, keyboard deletion returns focus, and SQL undo/redo
survives mode/tab changes. Verification stayed hidden/offline; real AWS and
installer installation were not exercised.
