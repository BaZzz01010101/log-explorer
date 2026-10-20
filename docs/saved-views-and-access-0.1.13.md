# Saved views and remembered access (0.1.13)

Favorites hold configuration snapshots of a normal or combined tab. Save from the tab's context menu or drag the whole tab into the existing Favorites section. Reopening creates independent view IDs while preserving sources, referenced profile/region connections, tab names, split layout/proportions/active pane, exact absolute bounds or relative preset, server/Insights queries, local filters, columns/formats/pinning/sort/wrapping and per-view highlight text. Loaded events and credentials are never saved. Global appearance and highlight-rule profiles remain shared workspace settings. Existing group/stream favorites migrate to single-view snapshots. Right-click a favorite to remove it without closing any open copy. The entire saved list is scrollable rather than limited to the first eight entries.

Connection snapshots retain the original endpoint when a live connection is edited or removed. Invalid/capacity-limited opens leave the workspace unchanged. Re-saving an unchanged entry does not duplicate it. Saving a changed configuration creates another snapshot. A size guard uses the same formatted UTF-8 budget as workspace persistence and displays an error before exceeding 5 MB.

Connections retain the friendly profile/region editor; the advanced editor is removed. Explicit AWS enable/disable choices persist in a separate local application preference, never in workspace imports. Development and offline/background verification ignore that preference and cannot enable AWS. Disabling closes the in-memory gate even if saving the preference fails; enabling requires a successful preference write first. Changing access refreshes Explorer generations, invalidates stale pages, and retries affected AWS log views once without re-querying fixture views or double-running startup queries.

- [x] Reproduce missing snapshot/migration, access refresh and remembered-preference behavior.
- [x] Implement snapshots, schema validation/migration, save/open/remove and drag target.
- [x] Remove advanced UI and implement access persistence/refresh.
- [x] Reproduce/fix reviewed deleted-group and failed-revocation-write cases.
- [x] Complete hidden desktop interactions, review follow-up, package and full regression; stage the normal launch-folder handoff after natural app exit.

Validation remains isolated and hidden, with all evidence under .tmp. Real AWS/profile/credential discovery and user application-data workspace reads are excluded. The access-enable UI test uses injected IPC handlers while immutable offline/background flags keep the actual gate disabled.

Final evidence: 477 unit/integration tests in 61 files and all 88 packaged desktop cases passed. The standard launch folder contains the matching 0.1.13 package, with the previous build retained. All four hidden standard-path checks passed. See `.tmp/final-verification-0.1.13.json`.
