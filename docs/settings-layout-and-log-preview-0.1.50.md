# Settings layout and captured log preview

Connections, Preferences and Shortcuts use a single column capped at 680px and
center the whole page, including descriptions and headings. Time range settings
retain their existing arrangement and center at their 840px cap. Workspace JSON
uses the available page width and fills the remaining height as Settings grows.

Highlights gives the rule list and Edit rule panel the remaining Settings height.
On wide, tall windows, the rule list and rule fields scroll independently without
adding an outer page scrollbar when Test and preview opens. Narrow or short
windows use one page scrollbar for stacked form content. The preview tables keep
their own scrolling area.

Test and preview is available only in detached Settings. It shows the actual
loaded events from the focused pane when Settings first opened, using independent
hybrid viewers for light and dark themes. A narrow window stacks these viewers.
Docking, detaching and switching the main tab retain the captured data; closing
Settings and opening it again captures the new active view. Empty tabs show an
empty state. No sample events or AWS requests are introduced by previewing.

The viewers reuse the normal parsing, highlighting, virtualization, expansion and
column mechanisms. Preview edits and theme providers stay isolated from the main
tab and application theme. Escape during a preview column gesture cancels it
without closing Settings; Escape after releasing the pointer closes normally.

Validation covers both themes, single-column centering including notes, Workspace
editor growth, rule editor growth, repeated preview folding, constrained window
sizes, snapshot retention across tab changes and docking, actual hybrid expansion,
theme-specific colors, gesture cancellation, honest empty data and regex worker
timeout recovery. Evidence is stored under `.tmp`; release artifacts are versioned
under `release/0.1.50`. The local handoff preserves the running app and promotes
only after verification and natural app exit. Changes remain uncommitted.
