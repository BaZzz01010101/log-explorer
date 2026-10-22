# Pinned tabs and resource insertion

Preserve all existing views, split layouts, query state and hover-to-activate behavior.

- [x] Add persisted pin state to normal and split strip entries; order pinned entries first, preserve order within each section, and protect them from shortcuts, Delete and middle-click closing. Context-menu Close remains available.
- [x] Add pin/unpin menu actions and an unpin button in place of Close; pinning promotes previews. Add a saved Preferences checkbox for a separate pinned row (default off).
- [x] Share insertion geometry for tab/header and Explorer drags. Separate pinned rows accept drops anywhere; shared rows pin only before or between pinned tabs, never after the last pinned tab. Empty separate pinned rows remain usable.
- [x] Insert selected Explorer resources as individual tabs at the displayed boundary, atomically validating sources and capacity; keep delayed hover activation, split/source destinations and cancellation restoration.
- [x] Improve inactive tab text and hover colors without obscuring active, selected or dragging states. Apply valid log font-size edits immediately while keeping buffer/refresh preferences deferred.
- [x] Verify reducer ordering, persistence, protected closing, resource batch insertion and drag boundaries with focused regressions; exercise actual hidden desktop drags, live font edits and both themes.
- [x] Build and verify 0.1.25; stage the usual hash-checked handoff after natural app exit. Keep evidence in `.tmp` and leave changes uncommitted.

Files: `contracts.ts` and `workspace-entries.ts` own persisted entry metadata;
`workspace.ts` owns validated atomic actions; a small `tab-insertion.ts` helper
owns visual boundary geometry; `WorkspaceTabs.tsx` and `ResourceDropSurface.tsx`
reuse it for both drag systems. `Settings.tsx` scopes live numeric changes to font
size. Tests cover state behavior separately from native pointer interactions.

## Verification

All 580 unit/integration tests in 76 files and 32 targeted packaged desktop checks in seven files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.25, not a full desktop-suite run. Native checks cover protected closing, persistence, live font edits, empty/wrapped pin rows, shared pin boundaries, left-quarter pickup reordering, Explorer batch placement, hover activation/cancel/split drops and both themes, plus existing tab/split/Explorer/menu behavior. Independent review found transformed source rectangles could block reordering; stable layout slots fixed the reproduced regression. Pin inheritance across split creation, exit, detach and dissolution is covered. Re-selecting the current theme no longer resets light to dark. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.25.json`, `.tmp/unit-0.1.25-release.json`, `.tmp/test-results-0.1.25-release/report.json` and `.tmp/standard-build-update-0.1.25-release.json`. Artifact hashes: `release/0.1.25/artifact-manifest.json`; executable: `release/0.1.25/win-unpacked/AWS Log Explorer.exe`.
