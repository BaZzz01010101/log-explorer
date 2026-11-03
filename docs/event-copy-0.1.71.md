# Event copying

The event-row menu offers three commands:

- **Copy selected text** copies the exact native text selection inside the clicked event. It is enabled only for a selection contained in that row. Menu focus does not alter the captured text.
- **Copy messages** copies selected events in displayed order. Structured events use a nonempty string `msg`, then `message`; other events retain their complete original text. Temporary decoded/deserialized values are respected.
- **Copy selected rows** copies visible cell values in displayed column order, including pinned columns and configured formatting. It uses tab-separated rows without headers. Tabs, quotes and line breaks within cells are quoted, and values behind visual truncation are retained. JSON mode hides this command.

A native text selection enables only the text command; otherwise the message and row commands are available. Ctrl/Cmd+C uses messages when event rows own focus and no native text is selected. Ctrl/Cmd+Shift+C copies rows in Table/Hybrid mode. Editing fields keep their native shortcuts.

Copying retains the clipboard size limit and leaves exports unchanged. Verification artifacts are kept under `.tmp`.
