# Direct source management (0.1.11)

Replace the sources dropdown and editor modal with a compact, horizontally scrolling strip of removable source badges. Only this strip accepts Explorer resource drops. Use common directory prefixes for group labels and a short stream identifier, with full resource and region information available on hover. Source edits rerun the current query automatically and update generated titles while preserving manual names and view settings.

Source identity includes the connection as well as the group. Merge streams only within that identity; a whole-group selection includes its streams already. Preserve this identity through workspace restoration, query snapshots, pagination and event context navigation. Historical event queries spanning connections fan out through the existing adapters and share cancellation. Live Tail and Insights retain their single-connection semantics and explain that restriction instead of querying the wrong region or pretending regional aggregates are global.

Connection checks, fixture/interpreter hints and Live cost descriptions use the selected sources, including after removing the original badge. Editing an unused default connection must not stale results; removing it preserves views that have remaining valid sources and chooses their connection as the new default. Query matching and lifecycle ownership share one canonical source identity.

Order Explorer streams by most recent event, requesting descending event time from AWS when no name prefix is present and sorting merged cached pages defensively.

- [x] Add failing model, query lifecycle, region isolation and stream-order regressions.
- [x] Implement badges, scoped drops, generated titles and automatic queries; remove modal.
- [x] Implement bounded multi-connection historical querying and preserve source context.
- [x] Run unit/type/build checks and hidden offline desktop interactions, then package and verify the versioned release. Store results under `.tmp`; do not disturb the user's app.

Final verification: all 460 unit/integration tests passed. All 81 hidden packaged desktop cases passed before the last service-only guard, and all 11 source/investigation cases passed again on the final package. Reports: `.tmp/unit-0.1.11-budget-final.json`, `.tmp/test-results-0.1.11-reviewed-verified/report.json` and `.tmp/test-results-0.1.11-budget-final/report.json`. Independent review findings were reproduced, fixed and rechecked. Package comparison verifies only the main-process guard changed. No real AWS or user app state was accessed; the installer was not installed. See [feature status](feature-status.md) for exact limits and release evidence.

The standard launch folder was updated to 0.1.11 after natural app exit, with a retained backup and matching executable/ASAR/installer hashes. Two additional hidden checks passed against the exact standard path: `.tmp/test-results-standard-0.1.11/report.json`.
