# Events and tab navigation (0.1.61)

## Behavior

- Events and Live Tail are the available query features. Insights controls and
  execution are removed. Older tab, closed-tab and favorite configurations
  restore as Events while retaining sources, filter, time window and view state.
  Legacy saved SQL searches stay in serialized configuration but are hidden from
  the search menu and Settings.
- Ordinary local text searches match event message content. The previous search
  included source metadata: `$latest` therefore matched every Lambda stream
  containing `[$LATEST]`, even when its message did not match. Property and level
  filtering remain supported, and match highlighting uses the same scope.
- The local-filter and highlight resize handles are centered between their
  adjacent controls. The filtering-help button beside the level filter is gone.
- Saved/recent search sections appear only when they contain Events searches.
  The menu scrolls up to 720px, bounded by 85% of the window height.
- A pane's split button duplicates that pane's configuration rather than taking
  a neighboring tab. The duplicate has independent sources and view state.
- Ctrl+Tab and Ctrl+Shift+Tab navigate recent focus order. Repeated presses while
  holding Ctrl cycle without reshuffling the list; releasing Ctrl commits the
  focus order. Ctrl+Page Down and Ctrl+Page Up follow the visual tab order.
  Customized shortcuts remain configurable; old default bindings migrate.

## Verification

- [x] Reproduce the local-search bug and 3.5px handle offset in the old packaged
      app using a hidden isolated offline instance.
- [x] Test legacy restoration, execution rejection, message/evidence parity,
      saved/recent sections, and Events/Live cleanup without AWS calls.
- [x] Verify pane duplication, shortcut migration and recent-tab ordering.
- [x] Run full units, type checking, build and packaged desktop regressions in
      both themes. Keep all evidence and sample storage under `.tmp`.
- [x] Package 0.1.61, record final hashes and stage the tested build. Promote the
      standard folder only after natural application exit, retaining a backup.

Real AWS, installer installation and signing are outside this offline check.

Final evidence: 1,047 unit tests and 43 targeted packaged desktop checks passed, with no failures, skips or flaky results. Type checking, build, formatting, whitespace and NSIS packaging passed. Both themes were inspected. Evidence and three artifact hashes are recorded in `.tmp/desktop-verification-0.1.61.json`; normal-folder handoff state is in `.tmp/standard-build-update-0.1.61.json`.

An intermediate three-worker development run had three teardown timeouts after successful interaction assertions. Those traces remain intact. An instrumented isolated packaged close saved successfully and exited naturally with code 0 (main-process exit at 64ms; observed close at 220ms). The original timeout was not reproduced or attributed to a product defect; the final two-worker packaged run passed all close paths. See `.tmp/close-diagnostic-061/summary.json`.
