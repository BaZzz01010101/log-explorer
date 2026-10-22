# Live startup after empty history (0.1.29)

- [x] Verify empty five-minute history can transition to Live in Table, Hybrid and JSON.
- [x] Reproduce automatic historical refresh superseding Live during delayed cancellation.
- [x] Reproduce obsolete historical pagination cancelling an active Live session.
- [x] Reject historical continuation unless its request still owns the tab and matches its configuration.
- [x] Prevent periodic refresh from taking over while a newer operation owns the tab.
- [x] Preserve valid empty-page continuation and its original time bounds.
- [x] Verify healthy quiet AWS Live heartbeats followed by new events beyond the historical end time.

## Findings

The ordinary empty-result transition already worked in the previous packaged build in all three display modes. No special empty-event-array rendering failure was found.

Two request-ownership races were reproduced in deterministic hook tests. Starting Live allocates a new operation generation, then awaits cancellation of the historical request. During that wait, the displayed runtime can still describe the completed empty query. Automatic historical refresh previously treated that runtime as eligible and superseded the pending Live start. Separately, an obsolete load-more callback could replace a Live session with a historical query. Both new tests failed before the correction.

The existing operation/request generations now guard automatic refresh and pagination before they can allocate a new operation. A pagination callback also requires a completed historical result, a cursor and matching current query configuration. An invalid continuation returns without starting a replacement query. Explicit Run and date/mode changes continue to replace Live as before.

AWS Live Tail receives newly ingested events; the historical five-minute end time is not sent to StartLiveTail. An injected AWS transport test verifies empty history, 40 seconds of healthy empty updates, then delivery from a newly started stream with a timestamp beyond that end time. It does not access AWS. Live does not backfill events ingested before its connection starts; Run retrieves that history.

These races are confirmed defects consistent with a failed transition. This investigation has not reproduced the user's particular AWS session or established that either race caused that occurrence.

## Verification

Evidence is retained under `.tmp`. Unit results: `.tmp/unit-0.1.29-final.json` (623 passing). All 13 affected packaged desktop tests passed in `.tmp/test-results-0.1.29-final/report.json`, with no skipped, flaky or failed cases. The initial red race report is `.tmp/live-empty-race-red.json`; the targeted green report is `.tmp/live-empty-029-targeted2.json`. Native verification uses hidden windows, isolated storage and disabled AWS access. The new three-mode empty-result transition cases stub only the historical query response and receive events through the actual offline Live service. Existing checks cover quiet streams, Stop, inactive-tab pause/resume, following, mode changes and both-theme raw text selection. Typecheck, formatting, whitespace checks, production build and NSIS packaging passed. Independent review found no actionable issues in the narrow fix.

An attempted native timing-race probe passed on the old build, so it is not treated as a reproduction and was removed from the suite. Its raw reports remain available. The causal race evidence comes from the controlled hook tests. Earlier native failures caused by incorrect test assertions are also retained and are not reported as product defects.

Build artifacts: `release/0.1.29`, with hashes in `artifact-manifest.json`. The final evidence summary is `.tmp/final-verification-0.1.29.json`. The hash-checked standard-folder update is waiting for the running app to close naturally, with a backup retained; three hidden exact-standard-path empty-result checks are queued after promotion. Current state: `.tmp/standard-build-update-0.1.29-release.json`. No normal app is stopped or launched, and no installer is installed. Work remains uncommitted.
