# Viewer and workspace changes in 0.1.6

This follow-up includes the time-toolbar corrections, multiline tabs, event feedback and docked inspection, followed by highlight profiles, window geometry and source management. The authorized changes remain uncommitted.

## Behavior

- Time shortcuts include Clear, 1m, 5m, 30m, 1h, 12h and 1d. Custom relative/absolute selections have an applied-state tint. Absolute ranges keep Clear visible on the left. The selected label uses a full line box, avoiding clipped ascenders and descenders in either theme.
- Settings → Preferences → Tab layout chooses Scroll or Multiple rows. Middle-click closes tabs in either mode. Wrapped-row reorder/detach placement respects both coordinates. Split headers have an active accent and dividers have visible grips.
- The event viewer has one bottom status with useful shown/loaded counts, query statistics and active/error/cancel feedback. Initial loading is centered in an empty viewer; continuation loading sits after the last event and remains visible when pagination starts near the bottom. Decorative LOCAL/complete labels and helper footers are removed.
- Local timestamps use the same numeric date/time fields as UTC and show the event-specific UTC offset, including daylight-saving changes.
- A single click selects a row. Double-click or Enter opens the right-hand inspector. Arrows/Home/End and Previous/Next follow the filtered/sorted rows. Tab focus synchronizes selection; Escape or Hide closes inspection and restores grid focus. A pointer/keyboard divider resizes the inspector without covering the viewer.
- Structured inspection retains per-node folding and adds Fold all/Unfold all. Add to filter appends a quoted JSON Pointer property term to the existing local loaded-event search; Add as column remains available. Raw copy/export and surrounding-source context are preserved.
- Settings → Highlights manages enabled/disabled profiles with optional log-group regexes. Empty profile patterns apply everywhere. Ordered rules search an entire message or an exact JSON Pointer property and highlight the event row or matching text. Foreground/background colors are shared by default; light/dark overrides are opt-in. Profiles and rules can be reordered. The existing literal highlight preference remains compatible.
- Explorer group/stream labels can be dragged onto a log pane, with a floating resource preview and a full-pane target. Escape cancels. Source merging deduplicates groups/streams, preserves all-stream selections and rejects cross-connection drops or limits without truncating data. Query/view settings are retained.
- The staged source editor has selected-group cards, searchable suggestions with automatic continuation, all-stream/specific-stream choices, removable stream chips, direct name entry, bulk group paste and Apply/Cancel. Applying changed sources retains the existing manual Run behavior. Late browse responses cannot overwrite a different connection's draft.
- The main process saves normal window bounds and maximized state in a separate atomic `window-state.json`. Restored bounds are validated against available display work areas. Final close flushes geometry; maximize/unmaximize save immediately so rapid minimization cannot lose the state. Saved outer bounds are reapplied after window creation to avoid Windows constructor rounding drift.

## Implementation limits

Highlight configuration is bounded to 20 profiles with 20 rules each. Patterns are limited to 500 characters; styles accept only six-digit hex colors. Invalid patterns are shown inline and do not execute. First matching colors and overlapping text spans take precedence. Structured text rules match decoded string values, including anchored patterns, then map spans into the displayed JSON string. Exact pointer scope prevents another property with the same value from being highlighted.

Regex execution runs only in a worker for the visible events and open inspector. Input is bounded to the first 200,000 message characters, 256 structured fields, 800 traversal nodes, 100,000 additional displayed characters and 512 spans per event. The worker has a startup deadline and a 500ms progress deadline; a stalled regex is terminated and a notice explains how to retry. Changing column widths does not restart matching. No regex executes against event content on the renderer thread.

Source selection is bounded to 50 groups and 100 streams per group. Stream suggestions use the existing service prefix search; group search uses the existing substring search. Suggestions are capped at 2,000 displayed names; direct entry remains available. Resource dragging uses a captured-pointer gesture because native Windows drag handling stalled hidden automation. It does not change the existing tab/panel drag mechanism.

Window position/size restart tests run against real hidden BrowserWindows. The maximize/minimize race test emulates state accessors and emits the real main-process events; physically maximizing a hidden verification window could show it, so physical maximize restoration remains a separate OS check.

## Verification evidence

All generated reports, traces and screenshots remain under `.tmp`. Focused development checks are preserved in `.tmp/extension-green-candidate/report.json` (five interaction cases) and `.tmp/window-maximize-green/report.json` (the additional immediate-minimize regression). The corresponding failing regression is `.tmp/window-maximize-red/report.json`.

Earlier focused inspector, loading/tab, calendar and renderer-freeze evidence is preserved. Earlier combined-run test failures exposed stale packaged-build metadata and old accessibility-role locators; those harness assertions were corrected and the affected lifecycle/viewer suites passed separately. A Python console-encoding failure interrupted that earlier JSON report, so its log is retained rather than treated as a complete machine-readable result. The final rebuilt package is verified separately and recorded in [feature status](feature-status.md).

All verification uses isolated application storage, allowlisted environment variables, fixtures and immutable AWS denial. Hidden windows and Chromium focus emulation preserve desktop focus. No user application-data workspace, AWS profiles, credentials or real AWS endpoints are inspected. Installer installation, signing, macOS/Linux and physical OS accessibility remain separate release checks.
