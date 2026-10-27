# Responsive Settings pages (0.1.49)

- [x] Size layouts against the actual Settings container, in both pane and modal.
- [x] Keep category navigation fixed and scroll the active page independently.
- [x] Reflow profile cards, add actions, long names and region descriptions.
- [x] Use one/two columns for Preferences and one/two/three for Shortcuts.
- [x] Preserve the wide time-toolbar row and guide; wrap unit groups and relative
      slots at narrow sizes without clipping inputs or spinner controls.
- [x] Fit Highlights to Settings width and height. Keep master/detail side by
      side when usable, stack it below 900px, and keep rules-table scrolling local.
- [x] Stack color fields in narrow layouts so the complete hex value remains
      readable alongside the swatch and color-picker control.
- [x] Keep workspace buttons and long saved-item names inside the available width.
- [x] Complete final packaged validation, visual inspection and stage the local handoff.

The previous layout mixed application-viewport breakpoints, fixed minimum widths
and unconditional pane stacking. On 0.1.47, the 260px docked Time ranges page had
dozens of controls outside the visible panel. Reproduction:
`.tmp/test-results-0.1.48-baseline-verified/report.json`.

The bounded flex Tabs root is now a named size container. Both presentations use
the same layout rules, and highlight editor height uses container-height units
instead of the application viewport. Existing tab shapes, gray baseline, blue
accent, unit slots, shortcut bindings and editor state are retained. The overall
frame remains stable and draggable/resizable. Horizontal scrolling is confined
to category navigation and the rules table where its columns need it.

Native responsive checks cover all six pages at three sizes in each presentation
and theme, including 260px panes and short 560px dialogs. They check page overflow,
individual control bounds, useful columns, editing, preview expand/collapse,
vertical reachability and draft retention through resizing. Actual captures cover
narrow time fields, narrow preview and wide master/detail. Independent review
found no additional issues; preview reachability coverage was added from review.

The 0.1.48 candidate was superseded before promotion after visual review caught
clipped hex values inside otherwise correctly bounded color inputs. Final checks
measure available text width as well as the input's outer bounds.

Evidence belongs in `.tmp`, and immutable artifacts in `release/0.1.49`.
All 918 unit/integration tests and all 11 targeted final packaged desktop cases
pass without failures, skips or flaky cases. The final matrix covers 72
page/size/presentation/theme combinations, readable color values, editing,
preview reachability, state retention and tab borders at fractional zoom.
The preceding candidate's broader 25-case Settings suite also passed before the
isolated color-field correction; it was not promoted. Evidence:
`.tmp/unit-0.1.49-final.json`, `.tmp/test-results-0.1.49-final/report.json`,
`.tmp/test-results-0.1.48-final/report.json` and
`.tmp/desktop-verification-0.1.49.json`. Build/typecheck, formatting, whitespace,
NSIS packaging, hashes and visual inspection pass. The final gated handoff waits
for natural app exit, retains a backup and queues a hidden standard-path check.
State: `.tmp/standard-build-update-0.1.49.json`.
Validation stays hidden, isolated and offline. Real AWS and installer installation
are outside this UI change. Work remains uncommitted.
