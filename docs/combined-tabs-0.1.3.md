# Combined tabs and interaction fixes in 0.1.3

The [design](split-workspace-design.md) and [implementation plan](split-workspace-plan.md) replace global split mode with layouts owned by combined tabs.

## Workspace behavior

- Normal entries show one full pane. Combined entries show only their own two-to-four-pane layout when activated. Their split icon, combined label and structured hover tooltip identify the members.
- Ctrl toggles individual selections and includes the active entry when selection starts. Shift selects an inclusive anchored range. The previous behavior toggled one tab instead of selecting the range; a trusted test reproduced one selected tab where three were expected.
- Duplication inserts an independent copy directly after the original. A trusted middle-tab test reproduced the old appended copy at index 4 instead of adjacent index 2. Combined copies retain an independent layout and member configurations.
- Right-click **Rename tab** supports both entry types. A normal custom label persists while the view is open and resets on close. A combined custom name survives member/layout changes until the split ends. **Exit split screen** restores its members as adjacent normal entries.
- Normal and combined entries drag from their bodies. Dwelling over another entry activates its destination panes during the drag. Edge/center merge previews use the same pure drop operation as the final reducer, including the whole dragged subtree. Outside drops and Escape preserve membership/order and restore the original activation after a hover switch.
- Pane headers swap their panes directly; the separate pane-control strip is removed. Existing divider sizing, direction icons, exact highlights and the four-pane limit remain.
- Explorer connection selection has its own persisted ID. Closing the last tab no longer changes it to Offline fixtures. A hidden test reproduced that exact settled reset and now verifies retention through natural close and restart.

Flat log-view IDs remain stable when views are combined, moved or reordered, so their requests and buffers remain independent. Activating another entry changes the rendered projection rather than replacing an inactive combined layout.

## Direct column dragging

Table and Hybrid headers support pointer-captured dragging with a six-pixel threshold. Simple clicks still sort; a completed drag suppresses its trailing click. Resize handles and other controls have separate behavior, and Escape/outside cancellation restores the original order. Hidden configurations retain their slots, formatting and widths. Dragging stays within the corresponding pinned/unpinned section and supports horizontal edge scrolling.

Trusted tests first reproduced unchanged order in both modes. The fixed sequence moved Level after `/service/name`, persisted the hidden `@logGroup` slot, retained a pinned Timestamp, resized after dragging, sorted normally, and reordered `/request/id` before Message after horizontal scrolling. The earlier live-resize, modifier-focus and Hybrid geometry tests still pass.

## Persistence and review findings

Main-process validation checks member ownership, top-level order, active projections and bounded layouts. Old global split workspaces migrate into a combined entry. File/import restoration validates view data, repairs bounded layout metadata, then strictly validates the resulting workspace. Renderer IPC saves remain strict. A damaged split can dissolve while retaining valid current views, rather than replacing three current views with a one-view backup; an actual file-store regression covers this.

Independent review found an ID collision with schema-valid custom combined IDs such as `tab-1`. Allocation now reserves view, combined and closed-history IDs across duplication, open, preview, reopen, split and migration. Eleven regressions reproduce and prevent those collisions. Review also fixed group memberships resurfacing after exiting an ungrouped combined tab, and active-view connection edits now update the explorer while inactive/unchanged edits preserve manual selection.

## Verification

See [feature status](feature-status.md) for final test counts, packaged execution and artifact hashes. All desktop tests use trusted Chromium input in hidden windows with isolated storage and AWS hard-disabled. AWS profiles, credentials, requests and the user's application-data workspace are not accessed. The installer is unsigned; real AWS, installation/uninstallation, physical OS input, screen readers and other platforms remain outside this verification.
