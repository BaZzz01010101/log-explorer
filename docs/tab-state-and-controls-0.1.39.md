# Tab state and viewing controls (0.1.39)

- [x] Reproduce tab-switch state loss and missing server-filter clearing on 0.1.38.
- [x] Retain each open tab's viewer instance and DOM, preserving list/detail/inspector
      scroll, expanded rows and branches, resized details and temporary decoding.
      Suspend hidden viewer effects; keep inactive Live reception asleep.
- [x] Add an accessible cross in nonempty server filters; clear and issue exactly
      one query with an empty pattern while preserving filter mode.
- [x] Add up/down controls and focused wheel editing to every time-template slot
      and relative duration, retaining numeric constraints and neighbor adjustment.
- [x] Remove inspector header Hide text; put Wrap/Fold beside icon-only Copy.
- [x] Run unit and hidden native regressions, review, package and verify 0.1.39,
      then update the standard folder after natural app exit.

The viewer was remounted beneath the active layout projection, although
query runtimes already retain their event buffers. Retaining only serialized
scroll and expansion fields would miss temporary decoding and nested DOM state.
One stable view host per visited open tab is attached to the current pane's slot, with
React Activity suspending hidden effects. This also avoids duplicating every tab
under every split pane. Remove hosts when their tabs close. Query source and Live
visibility ownership continue to use the existing workspace projection.

Chromium resets nested DOM scroll offsets when a subtree is hidden even when the
same nodes survive. A pre-mutation snapshot captures list, expanded-message and
inspector offsets; they restore after reveal or host reparenting. Hidden hosts
are detached and their Activity effects suspended, leaving only current pane
controls in the document. Auto-expansion processes semantic match-path changes
once, so resuming effects does not override a manually folded matched branch.

Clearing a filter patches its saved draft and explicitly executes an empty-pattern
snapshot, avoiding a stale render closure. Existing cancellation retires prior
query/Live ownership. Filter mode remains unchanged. Numeric wheel events apply
only to focused inputs and prevent parent scrolling. Template rows retain readable
input widths and local horizontal scrolling in a narrow settings pane.

No unrelated design changes, new dependencies or commits. Keep prior uncommitted
work intact. Native verification is hidden, isolated and offline; artifacts stay
under `.tmp` and `release`.

Verification: all 901 unit/integration tests pass. All 54 distinct native cases
have passing evidence on the same packaged artifact: 51 in the broad run, two
after correcting stale tooltip/column selectors, and the folded inspector-map
case after checking measured indicator geometry before a trusted pointer click.
A retained probe recorded one expected fold update followed by stable marker
geometry; hidden-window animation-frame stability waits caused the original
click timeout. No production changes followed packaging. Original failures,
probe and focused reruns are retained; the aggregate explicitly identifies
each replacement result rather than treating the broad run as failure-free.

The nine new native cases cover light/dark tab retention (list, expanded detail,
inspector scroll, decoding and unfolding), all three filter modes, manually
folded matched branches, split creation/dissolution, all 27 time-template inputs
in both themes and relative duration. Existing calendar, combined-workspace,
inspector, Hybrid, scrollbar-map and Live regressions are included. Independent
review approved after correcting resumed auto-expansion. Typecheck, formatting,
whitespace, build, NSIS packaging, artifact hashes and visual inspection pass.
Real AWS interoperability and installer installation were not exercised.

Evidence: `.tmp/unit-0.1.39-final.json`,
`.tmp/desktop-verification-0.1.39.json` (all raw report paths),
`release/0.1.39/artifact-manifest.json`. The hash-gated handoff records its state
in `.tmp/standard-build-update-0.1.39.json`, waits for natural exit, retains a
backup and runs three hidden checks on the exact standard executable afterward.

The standard-folder update completed with no running standard app to interrupt.
All three post-promotion hidden cases passed against
`release/win-unpacked/AWS Log Explorer.exe`; executable, ASAR and installer
hashes match the versioned package. Report:
`.tmp/test-results-standard-0.1.39/report.json`. No normal app was launched.
