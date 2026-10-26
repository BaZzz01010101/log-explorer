# Viewing and template corrections (0.1.38)

- [x] Restore relative templates to labeled Minutes, Hours, Days and Weeks rows
      of numeric buttons. Put only a gear icon at the dropdown's top right.
- [x] Replace arbitrary template records with fixed numeric slots in the same
      compact row layout. Editing a slot adjusts neighboring values to maintain
      strict ascending order within 1..9999; migrate the saved template shape.
- [x] Keep Live state visible in inactive tabs while reception sleeps; remove
      the SQL tab badge.
- [x] Make Explorer profile/region independent of tab or pane selection, view
      edits and favorite reopening. Repair selection only if it becomes invalid.
- [x] Move the toolbar inspector toggle after Export and remove its copy
      dropdown, retaining keyboard/context-menu copy actions.
- [x] Separate log-list and inspector wrapping. Support wrapping in Hybrid.
      Put inspector wrap beside a single icon-only expand/collapse toggle.
- [x] Persist independent inspector wrapping; test source selection, template
      ordering, wrapping geometry, fold controls and UI order in hidden windows.
- [x] Package 0.1.38, verify hashes and queue natural-exit standard-folder update.

Retain all uncommitted 0.1.37 work. Avoid unrelated redesigns. Run native checks
offline, hidden and isolated; do not focus or stop the user's running app.

## Implementation

The relative picker retains its original four labeled rows and numeric buttons.
Only numeric slots are editable in Time ranges settings; the existing saved
template schema migrates into fixed per-scale counts, canonical labels and stable
slot identities. Edits push adjacent values in either direction within 1..9999.
Quick toolbar slots remain independent of dropdown slots. The picker gear opens
the matching settings page in the current docked/detached presentation.

Explorer selection previously changed inside the shared entry projection and
active-view update paths. Those implicit writes are removed, including the App
fallback to the active tab. Explicit selectors control Explorer; source metadata
continues to choose query connections. Invalid restored selections use a configured
fallback rather than the selected view.

Inactive Live sessions retain their radio indicator with a paused tooltip; the
existing stop/resume reception behavior is unchanged. Insights no longer has an
extra SQL badge. Toolbar Copy controls are removed while native shortcuts and row
context copy remain. Export precedes the inspector toggle.

The list owns its wrap CSS scope. Inspector wrapping has a separate persisted
boolean that defaults on, and a control beside its single fold/unfold icon. Hybrid
supports soft wraps and literal newlines only when list wrapping is enabled;
virtual row measurements and expanded-content resizing remain independent.

## Verification

All 890 unit/integration tests pass. Typecheck and production build pass; the
versioned NSIS package and its executable/ASAR/installer hashes are recorded in
`release/0.1.38/artifact-manifest.json`. Independent review found no important issues.
All 77 distinct packaged desktop scenarios have passing evidence against that
same artifact. Coverage includes both themes, fixed slots and cascading edits,
Explorer selection and restoration, inactive Live markers, Live after empty
queries, forward/backward text selection during arrivals, independent wrapping,
Hybrid row geometry, inspector maps/folding/resizing, copying, field actions,
calendar input, pane settings, closed-tab history, undo and native chrome.

The broad run passed 72 of 77. Two calendar UI checks completed every assertion
but hit their custom seven-second process-close wait; their final workspace saves
completed in 16–17ms. Both passed unchanged in isolation, then passed instrumented
parallel checks with natural clean exits in 239–321ms. The harness now records
renderer acknowledgement, window closure, application quit and child exit/close,
uses the standard 30-second event budget, and does not mask a natural-exit race
with a failed cleanup command. The original transient close delay remains
unconfirmed; the reports are retained.

The other three failures were test-only: an expectation contradicted its explicit
`inspectorWrap: false` fixture, and two new screenshots used locator capture that
waited for stability in hidden windows. The map assertion now tests off/on/off/on;
native `stayHidden` captures drain compositor frames. All five focused checks
passed; production code and artifact hashes remained unchanged. Formatting-only
edits produced byte-identical output in all seven build files. Both themed picker
and compact editor screenshots were visually inspected.

Accepted evidence: `.tmp/unit-0.1.38-verified.json` and
`.tmp/desktop-verification-0.1.38.json`. The aggregate explicitly lists every
accepted case, report and focused rerun; original failures remain in
`.tmp/test-results-0.1.38-final/report.json`. Typecheck, formatting, whitespace,
production build, packaging and hashes pass. Native checks were hidden, isolated
and offline; real AWS interoperability and installer installation were not run.

Executable: `release/0.1.38/win-unpacked/AWS Log Explorer.exe`. The standard-folder
handoff checks evidence and hashes, waits for natural app exit, and retains the
previous build. State: `.tmp/standard-build-update-0.1.38.json`. Three additional
hidden checks of the exact standard path are queued after promotion. No normal
app was stopped, focused or launched; changes remain uncommitted.

The standard-folder update completed after natural app exit. Three additional
checks passed against `release/win-unpacked/AWS Log Explorer.exe`: fixed slots,
Explorer independence and inactive Live marker behavior. Executable, ASAR and
installer hashes match the verified versioned package. Report:
`.tmp/test-results-standard-0.1.38/report.json`.
