# Tab dragging, Live activity and field copying (0.1.28)

- [x] Reproduce stationary-neighbor painting with the existing packaged app.
- [x] Preview the same order and pin state that the drop reducer applies.
- [x] Move all visible tabs into their proposed slots with translation only.
- [x] Preserve each label's dimensions and stable insertion/hover coordinates.
- [x] Support direction reversal, wrapping and movement between pin rows.
- [x] Keep the floating pane-placement preview and delayed activation behavior.
- [x] Include strip borders and natural empty-row height without unnecessary wrapped scrollbars.
- [x] Sleep hidden Live sessions and periodic refresh; resume Live with retained history and counts.
- [x] Add inspector Copy value using the full current decoded/deserialized projection.
- [x] Complete final packaged regression verification and stage the safe standard-folder handoff.

## Cause and implementation

The previous correction stopped width scaling but disabled neighbor movement.
The dragged tab still used sortable transforms whose output depends on the
collision target. It could cover stationary neighbors, clamp at some targets,
and lose its transform when the strip itself became the collision target.

Pointer reorder painting now projects the existing `tab/move` reducer action.
Every visible tab slides to a packed destination using its own measured width;
wrapped rows use their final occupied widths and reserve sufficient height.
Logical DOM order and slots stay stable for insertion decisions and delayed
hover activation. The insertion marker follows the proposed source slot.
Keyboard dragging retains sortable registration and coordinate handling.

Moving between separate pin rows uses an inert presentation clone at the bar
destination, outside the source row's overflow clip. The source is hidden only
during that crossing. The clone has no IDs or drag targets, cannot receive
input, and is removed on cancellation, drop, return or unmount. Moving away
from the bar still uses the existing floating preview for split placement.

## Inactive Live and field copying

Live sessions pause when their view is hidden and reconnect for new events on return, preserving loaded events and received counts. All visible split panes stay live, manual Stop stays stopped even if tabs change before cancellation finishes, and historical automatic refresh skips hidden tabs. Inspector field menus add Copy value using the full current decoded/deserialized value, with JSON formatting for objects and arrays.

Reconnection receives new events. Use Run or time filters to retrieve history from the inactive period. Sleep intent is runtime-only and does not persist a running session across restarts.

## Verification

All 618 unit/integration tests in 80 files and 42 distinct targeted packaged desktop scenarios in six files passed. The broad candidate passed all 42 checks. After correcting the explicit Stop/switch race in useLogJobs.ts, all 11 affected Live/field cases passed again on the final package; unchanged tab/pane code retains its 31-case verification. Both native runs have no failures, skipped or flaky cases. The aggregate records each candidate manifest and report explicitly. This is targeted verification, not the full desktop suite. Checks cover unequal tab widths, both themes, shared/separate/wrapped layouts, animated reversal from first/middle/last slots, wrapped strip overflow, pin crossing, Explorer drops, combined tabs, split/panel transfers and cancellation. Live verification observes actual fixture-session cancellation while hidden, absence of further packets, fresh-session resumption, retained history, explicit Stop, mode changes and Table/Hybrid text selection. Field tests intercept clipboard writes and verify decoded text, deserialized nested values, raw-message preservation, filtering and columns. Unit checks cover split visibility, delayed and failed cancellation, source changes while asleep and inactive refresh. The same final painting assertion reproduces persistent overlap in the old 0.1.27 package. Independent reviews found no further concrete issues after correcting cross-pin clipping. TypeScript, formatting, whitespace, production build and NSIS packaging passed. Real AWS, keyboard drag animation and all display scaling combinations were not separately exercised.

Earlier candidate reports and the old-package failure remain in `.tmp`; the final verification record records the broad candidate and the affected-scope rerun against their exact artifact hashes.

The standard-folder build was updated after the previous app exited naturally; its backup is retained and final artifact hashes match. All three hidden exact-standard-path smoke checks passed. Evidence: `.tmp/final-verification-0.1.28.json`, `.tmp/unit-0.1.28-final2.json`, `.tmp/desktop-verification-0.1.28-final2.json` and `.tmp/standard-build-update-0.1.28-final3.json`. Artifact hashes: `release/0.1.28-final/artifact-manifest.json`; executable: `release/0.1.28-final/win-unpacked/AWS Log Explorer.exe`.
