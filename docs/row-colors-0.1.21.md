# Event row selection and hover colors (0.1.21)

- [x] Reproduce profile colors overriding selection, missing highlighted-row hover, and the partial outline across pinned cells.
- [x] Give selection priority over profile row background and foreground colors without requiring hover.
- [x] Gray each primary row's current background slightly on hover, including plain, selected and profile-highlighted rows.
- [x] Use one shared row color for pinned/unpinned cells and the Hybrid gutter; remove the partial selection outline/shadow.
- [x] Keep expanded content stable on hover and preserve text-match highlights and profile detail colors.
- [x] Finish packaged regressions and verified local delivery.

Profile selectors previously followed and outweighed normal selection CSS. Only the selected hover rule could override them. Unselected hover explicitly excluded profile-highlighted rows. A separate outline on highlighted selections was painted behind sticky pinned columns, creating the partial border and bottom line.

Row styles now resolve regular, profile and selected background/foreground values in that order. Hover mixes the resolved background with 12% neutral gray. All primary table cells and Hybrid gutters consume the same color; JSON primary sections use the same hover tint without changing expanded details. Selected foreground uses the theme's normal text color for readability. The existing theme selection color is retained.

Hidden offline tests against 0.1.20 reproduced the failures in both themes and all three modes. The first candidate satisfied the interaction assertions; its test also incorrectly required computed outline width to be zero even with outline style none. That unused computed width does not render an outline; the test now checks outline style and box shadow, alongside captures and pinned/unpinned colors.

All 550 unit/integration tests in 72 files and 32 targeted packaged desktop checks in eight files passed with no failures, skips or flaky results. This is targeted verification of 0.1.21, not a full desktop-suite run. The standard launch folder contains 0.1.21, with the previous build retained. Three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.21.json`, `.tmp/unit-0.1.21-final.json`, `.tmp/test-results-0.1.21-final/report.json`, `.tmp/test-results-row-legacy-0.1.21-final/report.json` and `.tmp/standard-build-update-0.1.21-final.json`.
