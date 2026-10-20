# Selected event copying and Hybrid previews (0.1.18)

- [x] Preserve one-click raw-message copying and Ctrl/Cmd+C.
- [x] Add record copying to the adjacent arrow menu, row context menu and Ctrl/Cmd+Shift+C.
- [x] Serialize selected rows in displayed filter/sort order into newline-delimited JSON, using visible column IDs in pinned/display order. Preserve raw JSON values, use `null` for missing cells and exclude hidden columns.
- [x] Retain native copy behavior in editable fields and selected text, disable empty-selection actions and reject oversized clipboard payloads before joining them.
- [x] Keep Hybrid primary rows on one line, including when wrapping is enabled. Expanded details, inspector and copied messages retain the full raw text.
- [x] Complete hidden packaged regression checks and hash-checked delivery.

Baseline verification reproduced the missing record action and a 51.9px height increase for multiline Hybrid messages. The new serializer tests first failed against the previous message-only behavior. Test artifacts stay under `.tmp`.

All 542 unit/integration tests in 72 files and 29 targeted packaged desktop regressions in eight files passed, with no failures, skips or flaky results. This is targeted verification of 0.1.18; the prior full 116-case run belongs to 0.1.16. The standard launch folder contains 0.1.18, with the previous build retained. Three hidden exact-standard-path checks passed. Evidence: `.tmp/final-verification-0.1.18.json`, `.tmp/unit-0.1.18-final.json`, `.tmp/test-results-0.1.18-final/report.json` and `.tmp/standard-build-update-0.1.18-final.json`.
