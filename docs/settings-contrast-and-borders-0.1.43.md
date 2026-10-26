# Settings hints and tab baseline (0.1.43)

- [x] Increase Minutes/Hours/Days hint contrast with themed text colors and medium
      weight while retaining their size and grouped layout.
- [x] Remove left, right and bottom borders around Settings tab content.
- [x] Extend the tab baseline to both outer edges in the pane and modal, retaining
      the active tab's open connection to content and normal field padding.
- [x] Verify the packaged appearance in both themes and stage the update after
      natural app exit. Keep all work uncommitted.

The baseline extends through the Settings body's horizontal padding; content
remains inset, with no surrounding frame. Geometry checks cover both outer edges
and the removed borders, alongside the existing tab and quick-template checks.

All 908 unit/integration tests and both targeted packaged native theme scenarios
pass. Pane/modal/narrow navigation and outer-edge/border geometry are checked;
actual captures confirm stronger hint text and the unframed content layout.
Typecheck, formatting, whitespace, build, NSIS packaging and hashes pass.
Evidence: `.tmp/unit-0.1.43-verified.json`,
`.tmp/test-results-0.1.43-final/report.json` and
`.tmp/desktop-verification-0.1.43.json`. Artifacts:
`release/0.1.43/artifact-manifest.json`. The gated handoff waits for natural app
exit, retains a backup and queues two exact-standard-path checks. State:
`.tmp/standard-build-update-0.1.43.json`. Native tests remained hidden and offline;
real AWS and installer installation were not exercised. No commits made.
