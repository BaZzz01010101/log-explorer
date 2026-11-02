# Calendar and context navigation

- Replace the calendar's selection hint with a link-style Today button. Navigate to the current month in the selected timezone without changing the draft, anchor or query.
- Use a local, non-passive wheel listener over the calendar for earlier/later months. Accumulate small trackpad packets, preserve zoom/horizontal gestures, stop at existing date bounds and leave date/time field wheel editing unchanged.
- Opening a tab's pointer or keyboard context menu must preserve the active view, multi-selection and range anchor. Existing menu targeting already distinguishes a selected group from an unselected clicked tab, so remove the selection mutation rather than adding new state.
- Rename event-context direction labels to Back, Forward and Both directions, preserving their internal values and time boundaries.
- Verify unit regressions and trusted hidden/offline desktop behavior; keep results in `.tmp`. Package and hash-check a versioned build, promote only after natural app exit and retain the previous build. No commits or forced user-app closure/relaunch.

Completed in 0.1.67. All 1,116 unit tests and 16 targeted hidden/offline packaged checks pass. Typecheck, build and NSIS packaging pass. See `.tmp/desktop-verification-0.1.67.json`. Safe handoff and four exact-standard-path checks are queued; changes remain uncommitted.
