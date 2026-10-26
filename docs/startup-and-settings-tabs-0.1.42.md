# Startup theme and connected Settings tabs (0.1.42)

- [x] Reproduce both the hard-coded dark native background and renderer's dark
      default workspace before saved light preferences arrive.
- [x] Read validated/recovered startup preferences before creating the native
      window, use matching caption/background colors and deliver that same load
      result once to the renderer (including recovery warnings).
- [x] Wait for workspace restoration before rendering the theme provider and UI;
      retain all hooks and close/save guards during initialization.
- [x] Add a thin separator beneath the main application-menu activity button.
- [x] Replace Settings button cards/container with attached tabs: rounded top
      corners, square bottoms, shared baseline and active tab joined to content.
      Narrow strips scroll independently instead of wrapping into button grids.
- [x] Run final packaged regressions, inspect both themes and stage the update
      after natural app exit. Keep all changes uncommitted.

The prior native background stayed `#10141C` even after light preferences loaded.
Renderer mutation samples also recorded four dark paints while the workspace
load was deliberately held. Initial native colors now come from the validated
workspace or its recovered backup, and the default UI is not painted before it
is restored. Subsequent workspace loads remain fresh; runtime theme switches also
update the native background. No new IPC channels or renderer privileges added.

Six native regressions cover primary/backup light startup, saved/default dark
startup and delayed restoration in both themes. Pixel samples check the pending
first frame; theme mutations check the first UI paint. The icon-divider geometry
is checked on cold starts. Settings assertions check top/bottom corners, matching
panel/tab fill and the absence of the old outer button container. Startup lifecycle,
cache, close/save and recovery behavior received independent static review.

All 908 unit/integration tests and all 30 final packaged native scenarios pass
without failures, skips or flaky cases. The native suite includes all six startup
regressions, Settings pane/modal/narrow-strip checks, activity and pinned dragging,
window chrome/zoom/menu actions and close-time saving. Actual light/dark captures
were inspected. Typecheck, formatting, whitespace, build, NSIS packaging and
artifact hashes pass. Real AWS and installer installation were not exercised.

Artifacts: `release/0.1.42/artifact-manifest.json`. Evidence:
`.tmp/unit-0.1.42-final.json`, `.tmp/test-results-0.1.42-final/report.json` and
`.tmp/desktop-verification-0.1.42.json`. Standard-folder handoff state:
`.tmp/standard-build-update-0.1.42.json`. It waits for natural exit, retains a
backup and queues three hidden exact-standard-path startup checks afterward.
No normal app is stopped or launched, and all edits remain uncommitted.
