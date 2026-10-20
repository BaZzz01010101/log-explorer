# Live Tail lifecycle and feedback (0.1.20)

- [x] Reproduce the endless loading state and history loss with hidden offline desktop tests.
- [x] Separate connecting, streaming and stopped states; connected empty streams wait for new events without a loading spinner.
- [x] Preserve matching historical rows when starting Live and count new session events separately.
- [x] Receive Live events automatically; distinguish following the newest event from receiving events.
- [x] Pause following on pointer selection, wheel/touch, scrollbar navigation and keyboard scrolling; explicitly resume with Follow Live.
- [x] Keep Stop and failed/ended sessions stopped even when historical automatic refresh is configured.
- [x] Keep time presets, Run and Events/Insights changes explicit transitions back to historical queries.
- [x] Bound a silent transport, abort it and provide an explicit Retry Live action.
- [x] Deliver complete service batches to the existing bounded view buffer rather than discarding their newest events.
- [x] Finish packaged desktop regressions and hash-checked local delivery.

The original UI used the historical running state for the entire streaming session, so a connected session with no new matches looked like an endless load. Starting Live also cleared loaded history. Clicking a time preset stopped the stream and ran a finite query, explaining why historical events then appeared.

AWS Live Tail sends new matching events through a continuous server stream; it does not re-run the selected historical time range. A connected session may legitimately contain no new matches. The app now says this in the Live controls, exposes a new-event count, and keeps receiving while following is paused. Offline Live remains an explicitly simulated stream. Live is limited to Events, one connection/region, up to ten groups, and selected streams from one group.

The existing AWS request timeout handles connection failures; a separate 30-second silence watchdog handles a response stream that stops producing updates. It aborts the underlying transport, retains received rows and offers Retry Live. It does not silently start another session. Sampling warnings remain visible. AWS supplies at most 500 events per session update, and the existing view buffer retains the newest events within its configured limit.

Verification uses injected AWS transports and hidden immutable-offline desktop windows with isolated storage. No real AWS session, user profiles/credentials or normal user workspace is accessed.

All 550 unit/integration tests in 72 files and 29 targeted packaged desktop regressions in seven files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.20, not a full desktop-suite run. The staged standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.20.json`, `.tmp/unit-0.1.20-final.json`, `.tmp/test-results-0.1.20-final/report.json` and `.tmp/standard-build-update-0.1.20-final.json`.
