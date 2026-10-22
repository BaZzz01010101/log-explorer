# Tab drag rendering and inspector decoding (0.1.26)

- [x] Reproduce drag corruption in an isolated hidden desktop window.
- [x] Remove rectangle scaling from dragged tabs and keep their surfaces opaque.
- [x] Keep neighbouring tabs at stable slots while the insertion marker previews the drop.
- [x] Cover light/dark themes, shared/separate pin rows and wrapped tabs.
- [x] Add explicit URL and Base64 text decode actions to structured-field menus.
- [x] Retain original messages and reuse temporary, color-marked view projections.
- [x] Support decoding followed by JSON deserialization and folding.
- [x] Verify production build, all unit tests and targeted packaged desktop interactions.
- [x] Stage the verified build for the standard launch folder without interrupting the app.

## Decoding decisions

URL decoding requires valid percent escapes and valid UTF-8. It decodes once and
preserves literal plus signs; form encoding cannot reliably be inferred from a
property value alone.

Base64 decoding supports standard and URL-safe alphabets, padded or unpadded.
Strict syntax, canonical round-trip validation, fatal UTF-8 decoding and control
character rejection exclude malformed encodings and binary payloads. Valid
printable text is decoded only on explicit action; encoding cannot be inferred
with certainty from arbitrary text. No automatic guessing, decompression,
external requests or dependency is involved. Inputs use the existing 524,288
character inspection bound, and eligibility runs only while a field menu is open.

Both actions replace the field temporarily in the current view and label it.
Decoded JSON remains a string until Deserialize is selected. Original messages
and raw export remain unchanged; columns, local filters and record/CSV output use
the projected values, as they already do for deserialization.

## Verification

All 586 unit/integration tests in 77 files and 19 targeted packaged desktop checks in five files passed, with no failures, skips or flaky results. This is targeted desktop verification, not a full desktop-suite run. Native checks cover drag painting in both themes and shared/separate/wrapped pin strips, unequal labels, protected pin boundaries, left-quarter pickup, tab/split lifecycle, panel final-area previews, detach/dissolution and hover/cancel transfer. Inspector checks cover both decoding actions, invalid and binary rejection, chained JSON deserialization, folding, decoded columns/filtering, raw message preservation, records/CSV, view reset and theme rendering. Independent static review found no concrete issues. TypeScript, formatting, whitespace, production build and NSIS packaging passed.

The verified standard-folder update waits for the running app to exit naturally, with the previous build retained. Three hidden exact-standard-path checks are queued after promotion. Evidence: `.tmp/final-verification-0.1.26.json`, `.tmp/unit-0.1.26-release.json`, `.tmp/test-results-0.1.26-release/report.json` and `.tmp/standard-build-update-0.1.26-release.json`. Artifact hashes: `release/0.1.26/artifact-manifest.json`; executable: `release/0.1.26/win-unpacked/AWS Log Explorer.exe`.
