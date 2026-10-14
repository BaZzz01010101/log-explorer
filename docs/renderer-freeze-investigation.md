# Renderer freeze investigation

## Failure and cause

The initial desktop suite dispatched `element.click()` and synthetic input events. Those checks bypassed Chromium's trusted pointer and keyboard event processing. Native input timeouts had been incorrectly attributed to the test environment, leaving a serious application defect undetected.

The failure was reproduced unattended against the original production renderer: trusted typing into the CloudWatch filter stopped the renderer, a subsequent Run click timed out, and the main process remained responsive. The same path was then captured by replacing the desktop suite's click, text entry and keyboard helpers with Playwright's trusted input APIs. That regression failed before the fix.

`LogViewer` allocated a new sorting array on every render, including an empty array when sorting was disabled. TanStack Table treated the reference as a sort change and queued its automatic page-index reset. Resetting that state caused another render and another new sorting array, creating a feedback loop. An isolated reproduction using the installed table dependencies reached its safety cap of 20 state updates with unstable sorting; a stable sorting array produced zero.

The idle renderer also consumed approximately one CPU core. Its CPU profile showed repeated React cell rendering and timestamp formatting. Trusted discrete input could turn that churn into renderer starvation, which also prevented the close-time save acknowledgement. The workspace-save timeout dialog was a secondary symptom.

The fix memoizes sorting by field and direction and disables the unused automatic page-index reset in the virtualized viewer. The original trusted typing/Run reproduction passes afterward. A five-second idle profile changed from repeated rendering to predominantly idle samples.

## Validation changes

- Desktop tests now use trusted Chromium mouse and keyboard input, including actual drag gestures, rather than DOM event dispatch.
- Regression coverage measures idle task time with unsorted, sorted and cleared sorting state and asserts responsiveness afterward.
- `--background-verification` keeps the Electron window hidden, disables background throttling for that verification run and permanently disables AWS access. Focus emulation operates inside Chromium without activating a Windows window.
- Separate tests cover native window close, final workspace edits, restart, save-failure handling, three- and four-pane geometry, pane drops and keyboard divider controls.

Deeper testing also exposed missing-primary backup recovery, sidebar keyboard focus ordering, pointer-to-keyboard divider focus, already-loaded buffer-limit enforcement and visibility of query-cleanup failures. Their regression tests and fixes accompany this release.

Numeric settings now retain an editing draft until blur or Enter. A regression reproduced `14` becoming `20` through per-keystroke clamping; another reproduced typing `25000` prematurely evicting 540 loaded events down to 250. Committing only finished edits prevents those effects. The close-time save also finishes the focused editor synchronously before taking its workspace snapshot, covering an immediate close without blur.

These tests exercise the actual renderer, preload, main process and local files with fixtures and injected SDK transports. They do not establish physical OS input, screen-reader compatibility, installer installation or real AWS interoperability. No AWS credentials, profiles, tokens or real services were accessed.

## Final verification

Version 0.1.1 passed TypeScript, 120 unit/integration tests across 14 files, and all nine desktop regressions in one 3.8-minute run. The deep-interaction and investigation suites used the packaged executable with AWS hard-disabled. All windows remained hidden. The final installer and executable hashes are in `release/artifact-manifest.json`.
