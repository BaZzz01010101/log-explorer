# Highlight tables and synchronized preview

The requested layout is a profile table and a rule table above a shared preview.
Both tables use expandable rows: compact summaries stay visible, and expansion
shows read-only configuration. Edit starts a local draft; Save validates and
commits it, and Cancel discards it. Row switches enable items immediately. Header
plus buttons add items; each row has a delete action followed by confirmation.
Existing priority reordering, structured paths and theme-specific colors remain.

The implementation reuses the current sortable tables and real hybrid log viewer
rather than creating another settings modal or a second log renderer. Profile and
rule drafts live above the dock/modal boundary. Expanding a row reveals it in its
table, aligning the summary to the top when its full content is too tall. Narrow
Settings stacks the two lists without clipping controls.

Both preview themes share horizontal/vertical scrolling, row selection, message
and structured-object folding, and column/sort configuration. They remain isolated
from the captured main tab and global theme. Preview is still modal-only and uses
the actual loaded data captured when Settings opened.

## Implementation checklist

- [x] Prove draft Save/Cancel, validation, toggles and deletion behavior in tests.
- [x] Replace profile configuration and separate rule editor with expandable tables.
- [x] Retain drafts and selection across profile changes and docking.
- [x] Synchronize preview state and scroll without synthetic click forwarding.
- [x] Verify expansion reveal, scrolling, reordering and constrained layouts in native tests.
- [x] Review, run unit and packaged desktop checks, and stage a hashed release.

Changes remain uncommitted. Tests use hidden isolated windows and put artifacts
under `.tmp`. The standard build is replaced only after natural app exit.

Native testing caught unequal-height drag collisions: a tall expanded item could
remain over its old position when its grip reached a short sibling. Pointer drags
now use pointer containment, and keyboard moves aim at the next logical sibling's
center. Only the selected expanded item adjusts scroll after a drop; it never
does so during the drag. This preserves the summary and editor identity across
both table viewports, including moves across a scrolling boundary.

Short Settings containers keep a usable minimum height for both tables and the
preview, with page scrolling between sections. Wide/tall Settings retains local
table scrolling. This prevents sticky headers from obscuring row controls in the
smallest modal layout.

Final verification: 940 unit/integration tests and 39 packaged desktop cases pass.
See `.tmp/desktop-verification-0.1.51.json` and
`release/0.1.51/artifact-manifest.json` for the report and checked hashes.
