# Query completion/cancellation race and Events undo

Switching modes can cancel an Insights query after CloudWatch has already
completed it. StopQuery then rejects with an already-ended error. Previously this
was always reported as a cleanup failure, even though the query was no longer
running. This could also leave an unnecessary cleanup warning on later shutdown.

Cleanup now verifies the same query ID with GetQueryResults after a rejected stop
or success=false response. Complete, Cancelled, Failed and Timeout confirm that
the query has ended. Running, Scheduled, Unknown, missing or unreadable status
preserves the stop error and warning. Normal confirmed stopping needs no extra
read. Both cleanup commands share one existing client, semaphore slot and total
five-second deadline, independent of the cancelled caller signal. Cleanup never
starts a new query and does not publish retired results.

Events filters now have their own stable per-tab edit-history key, separate from
Insights SQL. Undo/redo and clear-button history survive mode and tab switches;
the existing bounded history and external-value invalidation remain unchanged.

The exact already-ended failure and Events undo loss were reproduced before the
fix. Tests use deterministic AWS transports and hidden isolated offline windows,
including both themes, permission/status failures, cleanup deadlines, access
revocation, independent Events/Insights histories and clear-button edits. Real AWS
and installer installation are not exercised by these tests.

AWS references:

- [StopQuery](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_StopQuery.html)
- [GetQueryResults](https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_GetQueryResults.html)

Final evidence: all 1,038 unit/integration tests and 10 targeted packaged native
checks pass without failures, skips or flaky cases. Native Events history failed
on 0.1.58 before the change, and the adapter/service reproduced the exact stop
error before the fix. Evidence and artifact hashes are in
`.tmp/desktop-verification-0.1.59.json`. The normal-folder update remains gated on
natural exit, with four hidden post-update undo checks queued.
