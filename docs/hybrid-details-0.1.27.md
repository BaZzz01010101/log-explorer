# Hybrid details and message previews (0.1.27)

- [x] Reproduce Hybrid double-click, preview priority and consecutive-expansion defects in hidden offline desktop checks.
- [x] Toggle inline details on Hybrid primary-row double-click, retaining explicit Open inspector and Table/JSON behavior.
- [x] Preserve cached measurements of unchanged rows; remeasure mounted rows after global layout/bulk changes.
- [x] Add independent bounded scroll regions and live pointer/keyboard height resizing.
- [x] Retain chosen heights through folding and virtualization without retaining evicted events.
- [x] Choose a non-empty string `msg`, then `message`, consistently in automatic cells and profile highlights.
- [x] Verify native hit targets, scroll/resize lifecycle and related viewer regressions.
- [x] Complete unit checks, build/package and safe standard-folder handoff.

## Root cause and approach

Individual expansion changed the `expansion` object, triggering a global
virtualizer measurement reset. Previously measured expanded rows reverted to
the 260px estimate while their actual DOM height remained around 330px. The next
row overlapped the prior scroll area by about 70px. Per-row ResizeObserver updates
now retain unrelated measurements. Global mode, density, font, wrapping and bulk
expansion changes invalidate and immediately remeasure mounted rows.

Virtual rows use absolute `top` positioning rather than transformed stacking
contexts. Expanded details stay above neighboring pinned cells and beneath the
table header, allowing the centered separator to receive pointer input. Exact
fractional row measurement avoids subpixel overlaps at scaled display settings.

Expanded Table/Hybrid details have one scroll owner for structured and raw
content. The bottom separator supports pointer capture, Up/Down keys, cancellation
and cleanup; double-click or Home restores automatic height. Explicit heights are
local to the view and keyed weakly by the original event identity.
Normal wheel chaining remains enabled so a detail region cannot trap scrolling
when it has no overflow or has reached its boundary. Bulk-expanded Table and
Hybrid scrolling exposed this regression in the first packaged candidate; that
candidate was rejected before promotion and the corrected behavior was retested.

Automatic message previews use string `msg` when non-empty after trimming,
otherwise non-empty string `message`, otherwise the original raw message. The
selected field's original text is preserved, and profile spans use its exact
property path. Raw exports and message-copy semantics remain unchanged.

## Verification

All 603 unit/integration tests in 79 files and 20 distinct targeted packaged desktop checks in seven files passed across the final suite and the focused Live rerun. The 20-case suite had 19 passes and one pre-mouse-down coordinate-race failure in the test harness; both Live theme checks passed after stabilizing that harness. Raw reports are preserved. No cases were skipped. This is targeted desktop verification, not a full desktop-suite run. Hidden native checks cover Hybrid double-click, consecutive expansions with independent scroll positions, two expanded rows during live resizing, separator geometry/hit testing, fold/virtualization height retention, raw multiline scrolling, message priority, Table inspector navigation/resizing, bulk fold/unfold in all modes, both-theme hover/highlight rendering, fast regex-highlight scrolling and Hybrid Live text selection. The existing app reproduced a roughly 70px row overlap before correction. The native resize probe identified the following pinned cell intercepting the separator; final positioning/layering restored its hit target. Independent static review found no concrete issues. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.27.json`, `.tmp/unit-0.1.27-release2.json`, `.tmp/desktop-verification-0.1.27.json` and `.tmp/standard-build-update-0.1.27-release3.json`. Artifact hashes: `release/0.1.27/artifact-manifest.json`; executable: `release/0.1.27/win-unpacked/AWS Log Explorer.exe`.
