# History, settings and activity controls (0.1.40)

- [x] Make closed-view history up to 760px wide and use available window height;
      avoid horizontal scrolling, ellipsize names with custom tooltips and show
      the tab kind icon and source-count badge.
- [x] Persist a maximum history age in Preferences (7 days by default), prune
      expired entries on restore, closing, preference updates and reopening;
      preserve closing order and migrate undated legacy entries once.
- [x] Put quick time-template slots in one row with Minutes/Hours/Days group
      brackets beneath, retaining the existing relative-dropdown layout.
- [x] Give docked and detached Settings visible, themed tab shapes and make its
      activity button toggle its current presentation.
- [x] Replace the AWS activity glyph with a cloud/log icon matching the app icon,
      use a gear for Settings, and remove the heavy pinned-row separator.
- [x] Show the app version in the main menu, rename the side-panel command and
      show working shortcut hints for every action.
- [x] Verify behavior and geometry in both themes and small/large windows using
      hidden isolated native tests; run unit checks, review and package.
- [x] Complete the queued standard-folder handoff after natural app exit and its
      three post-promotion checks. Preserve all existing uncommitted work.

Use existing Mantine menus/tabs, custom tooltip and source-count mechanisms.
History retains its existing count and workspace-size bounds as well as the new
age bound. Undated legacy entries receive a migration timestamp, so they do not
remain forever. The menu refreshes its time bound whenever opened.

The Quick toolbar uses six fields on one axis, with 3/2/1 group brackets beneath.
Relative dropdown rows keep their established structure, steppers, focused wheel
handling and ascending neighbor adjustments. Settings navigation has a shared
themed border/background/active shape and adapts its grid to the available pane
or modal width. Docked settings hide/show without losing their selected page;
detached presentation is still remembered.

The application menu shows the native runtime version. Hints use configured
bindings for New view, Reopen, Toggle side panel, Theme and Settings, and fixed
native bindings for zoom, full screen and window close. New view, Theme and
Settings now have corresponding configurable keyboard actions. Toggling the side
panel preserves its current content. Activity tooltips open to the right, avoiding
the AWS control after a top-edge application-menu hover.

Three baseline native failures reproduce the old narrow history, activity icon
and missing menu version. Unit tests verify retention boundaries, migration,
pruning and preference persistence. Independent static review approved the
implementation. All 906 unit/integration tests and all 39 final packaged native
scenarios passed without failures, skips or flaky cases. Eight new native cases
cover the requested changes; existing checks cover window chrome/zoom/close,
activity panels, pinned dragging, tab/split state, Live markers, dropdown templates
and every stepper/wheel input in both themes. Typecheck, formatting, whitespace,
production build, NSIS packaging, artifact hashes and visual inspection pass.
Real AWS interoperability and installer installation were not exercised.

Artifacts: `release/0.1.40/artifact-manifest.json` and
`release/0.1.40/win-unpacked/AWS Log Explorer.exe`. Evidence:
`.tmp/unit-0.1.40-verified.json`, `.tmp/test-results-0.1.40-final/report.json` and
`.tmp/desktop-verification-0.1.40.json`. The hash-gated handoff state is
`.tmp/standard-build-update-0.1.40.json`; it waits for natural exit, retains a
backup, and runs three hidden exact-standard-path checks after promotion.
The standard folder is not replaced while an app is using it. No commits made.

The handoff subsequently completed after natural exit. All three standard-path
checks passed in `.tmp/test-results-standard-0.1.40/report.json`.
