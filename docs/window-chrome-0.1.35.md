# Compact window chrome

The activity rail contains the application menu at the top and Settings at the bottom. Explorer starts at the top beside it. Tabs occupy the workspace's top edge with panel actions and native Windows window controls on the right. The separate application header, Commands palette, AWS badge and native menu bar are removed.

Use Electron's hidden title bar with a window-controls overlay to retain native snapping, maximize/restore and the existing close/save handshake. Reserve the actual overlay width through CSS environment variables. Only empty title-bar space drags the window; tabs, scrollbars and controls retain their normal pointer behavior.

Implementation and validation:

- [x] Add hidden desktop regression checks for top-edge geometry, control clearance, menu actions, theme changes, wrapped/pinned rows and close-time saving; confirm the old layout fails.
- [x] Remove Commands and the old header; add the compact application menu, panel actions and native overlay with validated theme/action IPC.
- [x] Check tab dragging, resource drops, split panes, menu exclusivity and window persistence in hidden isolated instances.
- [x] Run the full unit suite and build, package the tested version, and queue a hash-checked standard-build update after the normal application exits naturally.

Pay particular attention to minimum window width, a wide Explorer, multiple tab rows, native caption button hit regions, theme contrast and preventing window drag regions from swallowing normal interactions. No verification should show or focus a native window, use AWS credentials, or terminate the user's app.

Native testing reproduced and corrected a one-DIP restart-size drift with the hidden title bar. Saved bounds are reapplied with a bounded correction for the measured native conversion error. Normal and minimum outer bounds stay stable over three hidden restarts.

Independent review identified a zoom-out overlap: caption controls became taller in CSS pixels than the tab row. The row, toolbar and drag handle now reserve `env(titlebar-area-height)` as well as overlay width; Explorer also shrinks at narrow effective viewports. A native regression reproduced the overlap before the correction and passes at zoom levels -3, 3 and 0. Native window shortcuts run in a separate capture listener so focused log-event menus cannot swallow them. Configurable workspace shortcuts retain their existing event behavior. Portaled menus, tooltips and dialogs explicitly exclude native dragging.

Physical OS dragging/snapping, actual native fullscreen transitions, mixed-monitor DPI combinations, macOS/Linux, AWS interoperability and installer installation are outside this hidden Windows verification. Fullscreen overlay notifications are tested without physically showing a verification window.

All 817 unit/integration tests passed. The broad packaged run passed 58 scenarios covering both themes, header geometry, menu/tooltip behavior, close/save and restore, three-restart normal/minimum bounds, Explorer drops, pinning, wrapped rows, tab animation and pane transfers. Independent review approved the corrected geometry and keyboard handling. A final one-line CSS exclusion keeps the overlapping top of the Explorer separator out of the native window drag region; the eight focused header cases were then repeated on the final package, including actual upper-edge separator resizing in both themes. All eight passed. The final report records 66 successful executions across these runs and distinguishes the archived broad-test candidate from the final package.

Evidence: `.tmp/unit-0.1.35-verified.json`, `.tmp/desktop-verification-0.1.35-final.json` and the three raw reports it references. Final package: `release/0.1.35-verified/artifact-manifest.json`. The standard-folder handoff is gated by those results and artifact hashes, waits for natural app exit, and retains a backup. State: `.tmp/standard-build-update-0.1.35-release.json`; three exact-standard-path hidden checks are queued after promotion. No normal application was stopped or launched, no installer was installed, and changes remain uncommitted.
