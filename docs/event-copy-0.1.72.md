# Readable rows and complete messages

**Copy selected rows** copies visible columns in their displayed order, including pinned columns and configured formatting. Each event occupies exactly one physical line. Tabs and line breaks inside cells become spaces, and leading/trailing cell whitespace is removed. Columns are left aligned to the widest selected value and separated with `|`. There are no headers or CSV-style quote wrappers. Literal quotes and JSON syntax already present in a value remain intact. Alignment padding is included in the clipboard size check before it is allocated.

**Copy messages** copies one JSON object per line, independently of the visible columns and the shortened Message cell:

```json
{"timestamp":"2026-11-03T08:22:52.565Z","level":"INFO","message":{"level":"INFO","msg":"Started","request":{"id":7}}}
{"timestamp":"2026-11-03T08:22:52.566Z","level":"UNKNOWN","message":"TELEMETRY\tName: datadog-agent\n"}
```

The wrapper contains UTC `timestamp`, detected `level`, and the complete structured `message` value or original plain text. Multisource views also include the readable `source` label used by the table. Group, stream, event ID and ingestion metadata are omitted from the wrapper; fields supplied by the application inside its message remain intact. Current decoded/deserialized projections are preserved. Messages beyond structured inspection limits retain their complete raw text.

Native selected text continues to enable only **Copy selected text**. Without a relevant text selection, row/message copying remains available. JSON mode hides row copying. Keyboard copy shortcuts and exports retain their existing ownership and behavior, using the revised clipboard formats.

Regression evidence is in `.tmp/unit-072-copy-red.json`, `.tmp/unit-072-copy-green.json`, `.tmp/test-results-0.1.72-red/` and `.tmp/test-results-0.1.72-source-red/`. The first multi-source fixture returned a nonserializable timer through IPC; its corrected old-package rerun reproduces the actual clipboard regression. Final unit and packaged evidence is in `.tmp/unit-0.1.72-final.json` and `.tmp/desktop-verification-0.1.72.json`.
