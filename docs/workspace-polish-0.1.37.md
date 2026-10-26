# Workspace controls and viewing preferences (0.1.37)

Implement the requested UI refinements using the existing workspace reducer,
Settings presentations, menu/tooltip infrastructure and relative-time parser.
Keep edits uncommitted and preserve existing view configurations. Native checks
must remain hidden, offline and isolated from the user's running application.

- [x] Increase the persisted left-pane maximum from 600 to 1200px, retaining a
      responsive limit that leaves a usable main pane at narrower window sizes.
- [x] Replace Settings maximize with detach/dock actions, preserve editor state
      in both directions and persist the last presentation in preferences.
- [x] Add independently configurable quick/dropdown relative templates in a
      Time ranges settings page, with a shortcut from the narrower time picker.
- [x] Store close timestamps and support reopening any closed tab. Show only
      closed tabs newest first in the wider menu with item/date separators.
- [x] Use one floating shadow token for tooltips, dropdowns, context menus and
      dragged items. Remove active pane-header blue border/outline decorations.
- [x] Render multi-source counts in separate tab badges, including renamed tabs;
      show query/Live status in reserved label space before close/pin controls.
- [x] Remove custom table columns through their context menu; protect timestamp,
      level, message and source with Hide instead. Align inspector Hide right.
- [x] Reproduce native cross-control undo and scope edit history to the focused
      control, preserving redo, selection and normal text editing behavior.
- [x] Verify reducer/schema migrations, UI behavior and dark/light/narrow views;
      run focused background desktop regressions and independent review.
- [x] Package 0.1.37, hash artifacts and promote only after verification and
      natural app exit; retain previous builds and all evidence in `.tmp`.

Decisions: relative templates use independently ordered quick/dropdown lists
of bounded duration/unit entries, with existing defaults for older workspaces.
Legacy closed tabs without timestamps are shown in an Earlier section rather
than inventing close dates. Shadows are CSS elevation, without dimming the
whole window. Settings presentation is a preference; opening its Time ranges
page follows that remembered presentation. Rename affects a tab's text only,
while a separate badge retains the live source count.

Native regressions reproduce Chromium undo switching focus to the other field
and the 600px pane cap on 0.1.36. Scoped edit history uses a WeakMap for each
input/textarea, retains selection and redo, groups contiguous typing and IME,
and resets after external replacement. It is bounded to 100 snapshots and one
million retained characters per control. Actual DOM nodes can be collected.

Review caught a resize dead zone when a saved 1200px pane was capped by a
narrower viewport. Pointer and keyboard resizing now start with rendered width.
Native checks physically narrow the hidden window and verify immediate movement.
Closed-tab history preserves reducer closing order instead of sorting dates.

All 859 unit/integration tests, typecheck, formatting, whitespace, build,
NSIS packaging and artifact hashes pass. Accepted desktop evidence covers all
96 distinct scenarios. After replacing three native `title` attributes on the
new template actions with custom `data-tooltip` hints, all 26 affected Settings,
pane, menu, tooltip, undo and column checks passed again on the final package.
The other 70 checks retain the broad candidate's evidence. The proof records
both manifests, each case and its source report instead of implying every case
was rerun against the final artifact.

The initial broad run exposed five stale expectations: three references to the
removed header split button, one removed helper-text assertion and one
misencoded Context label. Corrected calendar/source suites passed against the
same broad artifact. Its remaining failure caught the actual native-tooltip
regression, which the final package corrects. No accepted checks are skipped or
flaky. Independent review approved after the effective-width resize correction.

Final executable: `release/0.1.37-final/win-unpacked/AWS Log Explorer.exe`.
Evidence: `.tmp/unit-0.1.37-verified.json`,
`.tmp/desktop-verification-0.1.37-final.json` and
`release/0.1.37-final/artifact-manifest.json`. The earlier candidate and staging
are retained; only their owned pending delivery helpers were retired.

The hash-gated standard-folder handoff waits for natural app exit and retains a
backup. State: `.tmp/standard-build-update-0.1.37-final.json`. Three additional
hidden offline checks are queued for the exact standard path after promotion.
No normal app was stopped, focused or launched. Tests used isolated fixture
workspaces; real AWS interoperability and installer installation were not
exercised. Changes remain uncommitted.
