# AWS filter modes and compact Live controls (0.1.32)

## Implementation checklist

- Delay neighbor movement until 80% of the next tab slot is covered; preserve the current gap within the 20–80% hysteresis band to prevent oscillation. Keep delayed activation at 20% meaningful overlap against shifted rectangles.
- Remove the Live banner and query help/shortcut line. Keep Live state, counts and a Follow button in the existing 29px event footer.
- Start Follow disabled. An upward wheel gesture pauses it; a downward gesture at the bottom enables it, including empty or underfilled lists. Ignore nested expanded-message scrolling when enabling. Existing reading, text-selection and keyboard pauses remain.
- Submit the Events server filter with Enter. Keep the configured global shortcut and Insights multiline editing.
- Add Plain Text, AWS Patterns and Auto. Preserve the typed draft; compile only request patterns. Plain Text uses a quoted phrase with JSON escapes. AWS Patterns stays raw. Auto recognizes explicit AWS JSON, grouped JSON, bracket/ellipsis and percent-delimited regex patterns; ordinary text is literal. New views use Auto; pre-existing saved views/queries without a mode retain AWS Patterns.
- Persist modes in views, favorites, query history and saved queries. Compare compiled patterns for request ownership and pagination.
- Use a fixed-width AWS mode menu, abbreviated effective mode in Auto, syntax colors in both themes, and keyboard/mouse keyword completion. Tab accepts a suggestion, Enter runs, arrows select, Escape dismisses. Preserve input focus and expose the active option through combobox semantics.
- Verify compiler/escaping, mode restoration, pagination/history/Live behavior, both-theme UI, 80% dragging, empty and overflowing Follow, native text selection and safe natural close. Keep all results in `.tmp` and run hidden/offline with isolated storage.
- Build and hash the Windows release, then stage the standard-folder handoff after successful checks and natural exit of the user's app. Do not stop or launch the normal app, install, stage or commit.

## AWS syntax reference

Detection and keyword choices follow [AWS's filter pattern syntax](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html), including `NOT EXISTS`, `IS NULL`, `&&`, `||`, grouped JSON, bracket patterns and `%regex%`. No regex executes in the renderer for server filtering. The fixture interpreter deliberately supports only positive terms and quoted phrases; real AWS syntax is sent unchanged to AWS.

## Verification

Initial unit assertions reproduced the old 50% movement and uncompiled plain-text request; a hidden check against 0.1.31 reproduced the missing footer Follow control. Both raw reports remain under `.tmp/filter-follow-032-red.json` and `.tmp/filter-follow-032-native-red/report.json`.

Independent review found missing grouped/ellipsis Auto forms and missing accessible completion focus. Regression cases reproduced the Auto omissions before correction; both issues were corrected. Final results and release handoff evidence are recorded after packaged validation.

The first packaged run exposed overly broad nested-content exclusion in the new wheel handler. It now ignores only a nested scroll area that can actually consume downward motion. The short-list test keeps one matching event visible while reception continues: otherwise hidden input acknowledgements allow new JSON cards to turn an initially short list into an overflowing one before the wheel reaches it. The history test now explicitly enables Follow before requiring the newest event onscreen, matching the changed default. The corrected five-case Follow run passed in all three event modes; both raw failing runs remain under `.tmp`.

## Final verification and artifacts

All 653 unit/integration tests passed (`.tmp/unit-0.1.32-final2.json`). All 52 distinct targeted native scenarios passed across the broad candidate run and the corrected final run: 35 unchanged tab/pane/split scenarios from `.tmp/test-results-0.1.32-final/report.json`, plus all 17 Live/filter scenarios rerun against the corrected final package in `.tmp/test-results-0.1.32-final2/report.json`. The candidate records 50 passes and the two investigated failures above. Its raw report is unchanged. The explicit aggregate `.tmp/desktop-verification-0.1.32-final.json` maps each scenario to its passing report and records both manifests.

Checks include both themes, compiled requests, completion keys and colors, initial and continuation loaders, all three short-list event modes, empty lists, overflowing history, inactive Live, raw text selection through new events, Stop, natural close, 80% crossings, pins, wrapped rows, reversal, activation, combined tabs and panel transfers. Typecheck, formatting, whitespace, production build and Windows NSIS packaging passed. Independent review's findings were corrected and rechecked.

Corrected artifacts are in `release/0.1.32-final/artifact-manifest.json`; executable: `release/0.1.32-final/win-unpacked/AWS Log Explorer.exe`. The standard-folder handoff verifies hashes and test evidence, waits for natural app exit, retains the previous folder and queues three exact-standard-path hidden checks. State: `.tmp/standard-build-update-0.1.32-release.json`; verification summary: `.tmp/final-verification-0.1.32.json`.

This is targeted desktop coverage. AWS request compilation was checked through isolated transport; a real AWS session was not used. Keyboard tab-drag animation and all display scaling combinations were not separately exercised. No normal app was stopped or launched and no installer was installed. Changes remain uncommitted.
