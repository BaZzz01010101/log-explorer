# Panel dragging and query controls

Continue in the current checkout and preserve the earlier interaction fixes. All desktop verification stays hidden with isolated storage and AWS disabled. Do not commit or install the application.

1. Share the tab placement pipeline with panel headers. Keep a stable view ID throughout dragging, including hover activation of another entry. Support detaching into a selected tab-strip position and dissolve splits with one remaining member.
2. Project each panel move before displaying its highlight. Remove the source leaf before calculating edge insertion; use that same projected operation on drop. Cover every source, target and edge in supported two-, three- and four-panel layouts, including unequal dividers.
3. Hide a tab's tooltip immediately when its context menu opens.
4. Replace group, stream and event pagination buttons with automatic loading at the end of the scroll area. Prevent duplicate requests, repeated-cursor loops and loading stale queries; retain useful error recovery.
5. Replace the date dropdown with a CloudWatch-style relative/absolute range popover and nearby timezone selection. New views start with a clear date filter (all available history through the current time); existing saved ranges remain intact. Valid date changes continue to refresh automatically.
6. Add fold/unfold-all messages beside line wrapping, retaining virtual rendering and individual expansion controls.
7. Run model and component regressions, trusted hidden desktop interactions, TypeScript, formatting and the full isolated suite. Rebuild the Windows application and installer, then run the combined packaged suite and update the evidence record.

Implemented in 0.1.4. All 299 isolated tests and 38 hidden desktop tests passed; Windows artifacts and the manifest were rebuilt. See [feature status](feature-status.md) and the [investigation](panel-drag-and-controls-0.1.4.md) for verification and limits.
