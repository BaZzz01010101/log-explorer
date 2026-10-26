# Grouping guides, AWS activity icon and shortcut keys (0.1.41)

- [x] Replace the broken per-label bracket fragments with one continuous guide,
      upward ticks at the ends/unit boundaries and centered labels beneath.
- [x] Replace the near-duplicate cloud icon with a distinct AWS wordmark and
      orange smile, retaining the small rounded activity-button frame.
- [x] Show each shortcut key in its own compact rounded badge, with thin borders,
      1px/3px padding and combination separators outside. Keep a literal plus key
      separate from its preceding separator, including Ctrl + [+].
- [x] Verify the final package in both themes, inspect actual rendering and stage
      the standard-folder update after natural app exit.

The previous guide used two flex fragments around each caption, leaving holes
and inverted end ticks. The baseline now spans the group gaps, with one tick per
boundary. The shortcut formatter treats a terminal plus as a key; hints continue
to follow configured shortcuts. No query, persistence or tab-drag behavior changed.
All edits remain uncommitted.

All 908 unit/integration tests and all eight targeted hidden packaged scenarios
pass. The native assertions measure connected guide edges, upward ticks, aligned
baselines and compact key badges, including the separate plus key. Captures show
the actual pane/modal and light/dark menus. The hidden compositor is kept awake
while waiting for menu opacity before capturing; a screenshot-only wait in the
initial test could otherwise suspend its transition. Original reports remain.
Typecheck, formatting, whitespace, build, NSIS packaging and hashes pass.

Artifacts: `release/0.1.41/artifact-manifest.json`. Evidence:
`.tmp/unit-0.1.41-final.json`, `.tmp/test-results-0.1.41-verified/report.json` and
`.tmp/desktop-verification-0.1.41.json`. The gated handoff records
`.tmp/standard-build-update-0.1.41.json`, retains a backup, waits for natural app
exit and queues three hidden exact-standard-path checks. Native tests are offline;
real AWS and installer installation were not exercised.
