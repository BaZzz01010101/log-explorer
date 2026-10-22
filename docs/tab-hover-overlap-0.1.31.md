# Overlap-based delayed tab activation (0.1.31)

The hover timer previously checked the mouse point against each tab's original layout slot. That missed a small tab overlapped by a wider dragged tab and could activate the neighbor occupying the old slot after reordering.

Regular tab reorders now require at least 20% horizontal overlap of the smaller of the two tabs. Targets use the same final shifted rectangles as the reorder preview. The source uses its row-bound pointer position. This keeps selection stable during the short neighbor animation and avoids selecting an original-slot neighbor. Only visible portions within the tab strip count, and at least half the smaller height must overlap to exclude adjacent rows. The strongest overlap wins; pending targets retain exact ties, with center proximity resolving an initial tie.

The existing 450ms dwell and movement tolerance remain. The target is checked again when the delay expires; leaving meaningful overlap, switching targets, ending the drag or cancelling clears the timer. The existing original-view restoration and split-drop behavior remain. Pane-header previews retain point-based activation using current visible rectangles. Explorer drag behavior is unchanged.

## Verification

Both reported cases failed in hidden native tests against 0.1.30. The same tests pass with the correction in light and dark themes, including a split drop after activation and restoring the original tab on cancellation. Additional cases cover a narrower source over a wider target, grazing overlap and withdrawing from a pending dwell. Unit tests cover threshold boundaries, shifted geometry, row exclusion, deterministic ties and clipping.

All 634 unit/integration tests passed. All 38 distinct affected packaged native scenarios passed across `.tmp/test-results-0.1.31-final/report.json` (37 unchanged scenarios) and `.tmp/tab-hover-031-combined-final/report.json` (the corrected combined-tab gesture). Their explicit aggregate is `.tmp/desktop-verification-0.1.31-final.json`. The broad run also records the old combined gesture failure: its cursor aimed at an original slot after the tab had shifted. The rerun pauses at 30% overlap with the exact pickup offset instead.

Raw reports remain unchanged under `.tmp`, including `.tmp/tab-hover-031-baseline/report.json`, `.tmp/tab-hover-031-dev1/report.json` and `.tmp/unit-0.1.31-final.json`. The first negative-dwell assertion addressed a hidden real tab with a visible-only role locator; the corrected harness includes that registered source. The next run exposed hidden Chromium input acknowledgements of 0.8–1s, longer than the 450ms dwell. Native capture keeps the hidden compositor awake during the short out-and-back gesture; grazing and pending-dwell cancellation then pass, including in the broad packaged run. Neither harness failure required another product change.

Verification stays hidden and offline with isolated storage. No normal app is stopped or launched, no installer is installed, and changes remain uncommitted.
