# Calendar date filter

Use the supplied reference for layout and behavior while retaining the application's theme and control styling. Continue offline and keep all desktop verification windows hidden. Do not access AWS profiles, credentials or the user's application-data workspace.

- Add a two-month calendar with a first click choosing the start and a second click choosing the end. Preview the range while hovering, normalize reverse selections, support same-day ranges and keyboard/month navigation.
- Split absolute input into Start date, Start time, End date and End time. Calendar selections default to `00:00:00` through `23:59:59.999`, including complete local days across daylight-saving changes. Preserve untouched saved instants and subsecond precision.
- Step the focused text segment with the mouse wheel or arrow keys, retaining its selection. Support year/month/day, hour/minute/second and relative duration; unfocused fields must not change.
- Add grouped minute/hour/day/week shortcuts and a custom duration from 1 to 9999. Keep compact toolbar shortcuts and adjacent Local/UTC selection.
- Stage custom edits with Clear/Cancel/Apply. Applying refreshes automatically without Run; toolbar shortcuts remain immediate. Escape and outside clicks discard draft edits.
- Move generated test results into ignored `.tmp` and route future Playwright output there. Preserve existing evidence when relocating it.
- Verify model, component and trusted hidden desktop behavior, rebuild Windows artifacts, run the packaged suite, and record the final result.

Implemented in 0.1.5. Verified 324 isolated tests and 47 hidden desktop checks, including a targeted layout/capture/alignment rerun against the final package after correcting hidden screenshot capture and a one-property label alignment issue. Windows artifacts and the manifest were rebuilt; see [feature status](feature-status.md) and [calendar notes](calendar-filter-0.1.5.md).
