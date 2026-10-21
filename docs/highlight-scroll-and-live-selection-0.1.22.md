# Highlight scrolling and Live text selection (0.1.22)

- [x] Reproduce missing row and text regex highlights during fast scrolling in hidden painted frames.
- [x] Keep one worker per rule configuration, cache completed results and prepare loaded offscreen events in batches.
- [x] Prioritize visible rows and retain cached results when events arrive or the viewport changes.
- [x] Bound full-result cache payloads to 10,000 entries and an estimated 32 MiB; reload evicted rows on demand.
- [x] Distinguish pending rows from non-matches instead of painting unchecked content as ordinary events.
- [x] Preserve overview marks, rule/theme invalidation, changed-event safety, cancellation and stalled-regex timeouts.
- [x] Reproduce Live text-node replacement and stabilize source context to preserve native drag anchors and selected ranges.
- [x] Finish final packaged regressions and verified local delivery.

The visible highlight worker previously restarted when scrolling changed its input, discarded offscreen results and recomputed visible rows. Fast scrolling could repeatedly cancel the work before it returned. The old packaged build painted 196 Table, 205 Hybrid and 113 JSON visible row samples without required colors or text spans in the deterministic hidden-frame regression.

Highlighting now schedules bounded batches on a persistent worker. Cached rows paint immediately, visible cache misses take priority and remaining loaded events are prepared in the background. The full-result cache stops background prefetch near its payload budget and evicts older unprotected entries for visible work. Source event storage and overview maps remain outside this payload estimate and retain the existing event-buffer limits. Rows awaiting a result retain layout but show a preparation placeholder; a regex failure remains visible and retains completed results. Worker startup and per-progress deadlines remain bounded, and scrolling does not reset them.

Live selection had an additional cause: every parent update created a fresh source-context object and connection array, recreating TanStack cell renderer functions and replacing their DOM subtrees. Pausing follow on pointer-down could remove the native anchor; later Live packets removed the selected text. The source snapshot is now memoized until its actual inputs change. Tests drag both directions across highlight spans while events arrive, then verify the exact substring and the original text node after further arrivals.

Verification is hidden, hard offline and isolated from normal user data, configured profiles and OS clipboard writes.

All 560 unit/integration tests in 72 files and 39 targeted packaged desktop checks in eight files passed with no failures, skips or flaky results. This is targeted verification of 0.1.22, not a full desktop-suite run. The verified staged update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.22.json`, `.tmp/unit-0.1.22-final-3.json`, `.tmp/test-results-0.1.22-final/report.json`, `.tmp/test-results-highlight-extra-0.1.22-final-2/report.json` and `.tmp/standard-build-update-0.1.22-final.json`.
