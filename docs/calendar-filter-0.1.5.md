# Calendar filter in 0.1.5

The [calendar plan](calendar-filter-plan.md) implements the supplied reference's layout and interactions using the existing application theme.

The compact toolbar offers Clear, 1m, 30m, 1h and 12h shortcuts beside Custom and Local/UTC. Absolute filters display their selected bounds. Custom opens a two-month calendar or grouped minute/hour/day/week presets with an editable duration and unit.

Calendar selection takes two clicks, previews the range while hovering, sorts reversed clicks, and supports same-day selections. Month navigation and arrow/Home/End/PageUp/PageDown keyboard movement work independently of the operating system's native date picker. Start date, Start time, End date and End time are separate fields. New calendar selections span midnight through the last millisecond of the selected end day. Local days remain inclusive through 23-hour and 25-hour daylight-saving transitions.

Focused fields handle wheel input through a non-passive native listener. Only the segment containing the caret changes, and its selection remains in place after the controlled value updates. ArrowUp/ArrowDown use the same operation. Date increments handle leap years and month ends; time segments wrap independently. Relative durations are bounded integers from 1 to 9999. Unfocused fields do not consume wheel input or change values.

Custom edits remain drafts until Apply; applying a valid filter uses the existing automatic query refresh and cancellation. Toolbar shortcuts remain immediate. Cancel, Escape and outside clicks discard draft edits. Stored absolute bounds remain canonical UTC instants. Untouched bounds preserve their original daylight-saving occurrence and subsecond precision despite the fields displaying whole seconds.

Review reproduced repeated December 31 buttons at the maximum supported calendar year because navigation arithmetic clamped overflow cells. Calendar grid generation now emits blank cells outside valid years instead, while wheel/navigation increments retain their bounds.

Actual hidden-window screenshots also exposed a vertically misaligned Custom label: the ellipsis override changed the label to a block while retaining Mantine's full-height label rule. A trusted desktop text-geometry assertion reproduced the 11.26px offset; allowing the label's natural height centers it with the icons. The final package's layout test checks this alignment along with normal/narrow fit in both themes. Screenshot capture uses Electron's hidden-window capture options because Playwright's screenshot operation stalled while the window was hidden.

Playwright output defaults to `.tmp/test-results`. All 33 existing root result directories were relocated into ignored `.tmp`: 84 files were preserved with matching hashes. Copies of 43 previously tracked generated files remain there; their tracked deletions remove generated evidence from the source tree. The relocation manifest is `.tmp/test-artifact-relocation-2026-10-15.json`. README reporting examples route optional JSON/HTML output under `.tmp` too.

Model/component regressions cover relative persistence, full-day/DST boundaries, calendar extremes, selection and native wheel listener behavior. Trusted hidden desktop tests cover range clicks, segment edits, cancellation without queries, duration limits, timezone precision, shortcuts and layout fit in light/dark themes and narrow panes. See [feature status](feature-status.md) for final counts and artifacts. No real AWS access, credential/profile inspection, user application-data access, installation or commits are included.
