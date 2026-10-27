# Stable Settings window (0.1.47)

- [x] Name the overall pane, dialog and activity button Settings; keep Workspace
      as the category for workspace configuration.
- [x] Use one size across categories, independent of content length. Scroll only
      the active page; keep the header and category tabs fixed.
- [x] Drag by the header and resize from all edges and corners. Support keyboard
      arrows on the bottom-right grip (Shift uses a larger step).
- [x] Retain the frame when closing/reopening or docking/undocking during the
      current session; fit it to the app after resizing or zooming.
- [x] Cancel gestures with Escape, pointer cancellation, capture loss or blur;
      restore selection/cursor and release capture when closing/unmounting.
- [x] Verify and stage the final package without stopping the user's app.

The previous dialog used content height and changed width for Highlights. On
0.1.46, an automated category switch reduced its height from 583px to 529px and
moved its top from 134px to 161px. Evidence:
`.tmp/test-results-0.1.47-baseline/report.json`.

The Settings frame now belongs to its component state rather than a category.
It starts at 1100 x 760 CSS pixels, constrained to the app viewport with a 16px
margin. Minimum size is 560 x 360 where the viewport permits it. Geometry is
retained for the current session; restart persistence was not added. The existing
Mantine Modal still owns focus trapping, overlay, close and docking behavior.
Escape closing is disabled during gestures so cancellation does not also close
the modal through Mantine's capture-phase handler.

Pure geometry checks cover every edge, corner, opposite-edge anchoring and
viewport limits. Hidden native checks cover both themes, every category, short
page scrolling, resizing, dragging, Escape/capture/blur cancellation, close/reopen,
docking and zoom. Independent static review found no correctness issues; its
cleanup-coverage suggestion is addressed by native cancellation checks.

Evidence belongs in `.tmp`; versioned build artifacts belong in `release/0.1.47`.
All 918 unit/integration tests and all 31 targeted final packaged desktop cases
pass without failures, skips or flaky cases. Two additional theme captures pass
after waking the hidden compositor for visual inspection. Typecheck, formatting,
whitespace, build, NSIS packaging and hashes pass. Final evidence:
`.tmp/unit-0.1.47-final.json`, `.tmp/test-results-0.1.47-final/report.json`,
`.tmp/test-results-0.1.47-visual/report.json` and
`.tmp/desktop-verification-0.1.47.json`. The hash-gated standard update waits for
natural app exit, retains a backup and queues three hidden checks afterward.
State: `.tmp/standard-build-update-0.1.47.json`.
Actual AWS interoperability and installer installation are outside this UI-only
verification. Changes remain uncommitted.
