# Settings baseline and workspace tab edges (0.1.44)

- [x] Preserve the blue accent on the active Settings tab.
- [x] Draw one gray baseline through tab gaps and both Settings edges, with the
      same thickness, color and vertical alignment beneath inactive tabs.
- [x] Give each workspace tab its own top border, including the unpinned row
      below pinned tabs and the exposed right end of a ragged wrapped row.
- [x] Verify the final package and stage the normal update after natural exit.

The Settings baseline previously combined a gradient on the tab list with
individual tab borders. Native pixel captures reproduced a one-pixel vertical
step: the outer line was at physical row 367 and the inactive-tab edge at 368.
One absolutely positioned border now owns the entire baseline. Individual tab
bottoms are transparent, and the active tab covers the baseline with its body
color. Its blue top border and inset accent remain unchanged.

Workspace tabs previously relied on the row above to supply their top edge.
Each tab now draws that edge itself; wrapped tabs no longer also draw a bottom
border, avoiding doubled separators between rows.

Native pixel tests cover both themes at 80%, 100% and 125% zoom. They compare
the baseline's actual pixel rows and color in the left margin, tab gap,
inactive tab and right margin. Workspace checks sample three positions along
each tab's top edge, including separate pinned rows and ragged wrapping before
and after pointer reordering. Paint assertions wait for hidden native compositing
after a drag, without relaxing the expected border color.

Baseline reproductions: `.tmp/test-results-0.1.44-baseline/report.json` and
`.tmp/test-results-0.1.44-workspace-baseline/report.json` against 0.1.43.
Final packaged report: `.tmp/test-results-0.1.44-final/report.json`.
Artifact hashes: `release/0.1.44/artifact-manifest.json`.
All 908 unit/integration tests and all 36 targeted final packaged native checks
pass, with no failures, skips or flaky cases. Typecheck, formatting, whitespace,
build, NSIS packaging and artifact hashes pass. Proof:
`.tmp/desktop-verification-0.1.44.json`. The gated standard-folder handoff waits
for natural exit and retains a backup; three hidden checks of the exact standard
path follow promotion. State: `.tmp/standard-build-update-0.1.44.json`.
Native checks use isolated offline workspaces and hidden windows; they do not
touch AWS or the user's running app. Changes remain uncommitted.
