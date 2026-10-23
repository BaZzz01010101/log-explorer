# Activity panels and contextual pinned row

The activity bar switches the left pane between AWS logs and Settings. AWS toggles its pane; selecting Settings opens it there, with a header action to expand the same settings into the existing modal. Main-menu Settings uses the same pane. Explorer retains refresh but loses its header settings button. The window tab toolbar loses Explorer and split buttons.

Tab groups are removed from controls, drag targets, model actions and persisted configuration. Old grouping metadata is ignored while tabs, split views, order and sources survive migration.

When a separate pinned row has no tabs, it occupies no space. An active tab or pane-header drag reaching the window top edge reveals it; negative pointer coordinates above the client area are accepted. After reveal it stays available until the drag ends to prevent layout oscillation. Dropping pins the tab, cancellation hides the still-empty row, and unpinning/closing its last tab hides it again. Existing pin rows and shared-row pin behavior remain supported.

- [x] Add regression checks for hidden/revealed pin rows, above-window drops, cancellation and wrapped rows.
- [x] Reuse Settings content in pane/modal presentations and wire activity selection without losing Explorer state.
- [x] Remove tab groups safely, including saved workspace/favorite migration.
- [x] Run unit/integration and hidden packaged desktop checks; review native drag exclusions, zoom and narrow layouts.
- [x] Package 0.1.36 and queue the verified standard-folder update without closing or focusing the user's app.

Review caught a pane-to-modal remount resetting nested editor state. Settings now owns the highlight profile/rule selection, preview expansion/drafts and pending connection choices; standalone editors retain local state. Regression checks reproduced the reset before the fix and exercise both presentation directions. Explorer remains mounted while hidden so its filter and expanded tree survive panel switches. The source/pane drop mechanisms are reused for contextual pinning, and document-body pointer capture retains delivery above the window edge.

All 828 unit/integration tests and all 72 affected packaged desktop scenarios passed on the same final artifact, without failures, skipped or flaky cases. Coverage includes both themes, narrow/wrapped rows, above-window pointer drops, cancellation, resource/header pinning, legacy group migration, Settings category/draft continuity, existing panel/tab reordering, middle-click closing, menus/tooltips, event text selection, native controls, zoom and close-time saves. Independent review approved the corrected continuity fix. Typecheck, formatting, whitespace, production build, NSIS packaging and artifact hashes pass.

The desktop run uses isolated fixture workspaces, disabled AWS access and hidden windows throughout. It does not exercise real AWS, installer installation or physical OS pointer delivery across every maximized/multi-monitor configuration. Evidence: `.tmp/unit-0.1.36-final.json`, `.tmp/test-results-0.1.36-final/report.json`, `.tmp/desktop-verification-0.1.36-final.json` and `release/0.1.36/artifact-manifest.json`.

The hash-gated standard-folder update waits for natural app exit and retains the previous build. Three additional hidden checks of the exact standard path are queued after promotion. State: `.tmp/standard-build-update-0.1.36-release.json`. No normal app was stopped, focused or launched; changes remain uncommitted.
