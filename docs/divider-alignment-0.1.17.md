# Divider alignment (0.1.17)

Centered Table/Hybrid column resize highlights and hit targets on their separators; centered the inspector divider and kept it above the scrollbar overview with 3px of clearance for full map hit testing. Unclipped column handles and ordered pinned-header layers keep both sides draggable. Explorer and both split-pane axes retain their existing alignment.

The old column target ended at the separator rather than straddling it. The inspector target started on the inspector side of the border. Header clipping and equal pinned-header stacking hid the newly exposed right half; the overview covered the inspector's left half. The fix positions both targets around the border, leaves label clipping on the sort button, orders pinned-header layers from left to right, and places the inspector handle above the overview.

The baseline produced six expected failures for Table/Hybrid/inspector and six passing reference cases for Explorer and horizontal/vertical splits across both themes. Tests assert border-center geometry, hit testing and hover at both sides, captured pointer movement, cancellation and absence of text selection. Inspector cases include 125% zoom.

All 534 unit/integration tests in 71 files and 23 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.17; the prior full 116-case run belongs to 0.1.16. The standard launch folder contains 0.1.17, with the previous build retained. All three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.17.json`, `.tmp/unit-0.1.17-final.json`, `.tmp/test-results-0.1.17-verified/report.json` and `.tmp/standard-build-update-0.1.17-verified.json`.
