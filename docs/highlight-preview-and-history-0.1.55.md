# Compact highlight previews and source-aware history

Closed-tab tooltips include the displayed view name and every full log group and
stream name, with the effective profile and region for each source. History keeps
renamed labels across closing and restoration; reopening retains the existing
behavior of returning to the source title. Tooltips keep the shared interactive,
selectable, theme-aware presentation. History width remains content-based.

Both Highlights editors disable native spellchecking, autocorrect and automatic
capitalization for match regex, JSON Pointer path and profile log group regex.
Regex and pointer syntax validation remains available.

Both preview sections are titled Preview. The captured source label and loaded
count no longer occupy a caption above the logs. The tree editor no longer shows
the profile/rule breadcrumb, automatic-application notes or footer hint. The
shared rule fields no longer show the priority explanation. Grid tracks and
preview flex sizing allocate that space to the tables instead. Existing split
resizing, two-theme preview scrolling, selection and unfolding remain available.

Verification uses hidden isolated offline app windows. New checks first reproduced
missing source details, discarded history aliases and enabled spellchecking on
0.1.54. Native checks exercise both editors and themes, preview geometry,
fold/reopen behavior, source metadata, menu sizing and selectable tooltips.
Final packaged evidence and release hashes are recorded separately under `.tmp`
and `release/0.1.55` after verification.

Final evidence: all 966 unit/integration tests and 42 final packaged desktop
checks pass with no failures, skips or flaky cases. The aggregate report is
`.tmp/desktop-verification-0.1.55.json`. Both themes and both editors were checked
with native spellcheck properties and actual preview geometry; preview scroll,
selection, unfolding, resizing and history behavior were rechecked. Independent
review found no actionable issues. Tests remained hidden and offline.
