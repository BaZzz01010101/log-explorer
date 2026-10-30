# Source details and search controls implementation plan

**Goal:** Replace obstructive source/event tooltips with deliberate details,
improve saved/recent searches, and preserve editing and table interactions.

**Architecture:** Reuse Explorer metadata and its current click/selection paths,
existing query history/reducers, protected-column actions, event expansion, and
per-control edit history. Add opt-in stable history keys only for remounted SQL
editors. Preserve the current working tree and do not commit.

**Design:** Source details occupies the Explorer footer, has a compact disclosure
header and source type, wraps selectable names and ARN, and presents available
metadata as readable labeled values. It shows one last-interacted source.
The search menu belongs between the query editor and Run. Saved searches have
delete actions; recent searches use a bounded preference (default 30, maximum
100). Saving preselects a single-line query as its editable name. Existing saved
views remain in Favorites and are absent from the search menu.

- [x] Explorer: replace Recent sources UI with source details, remove resource
      tooltips, retain selection, keyboard opening, dragging and context menus.
- [x] Search controls: reposition/restrict the menu, delete saved searches,
      configure retention and focus/select suggested names. Validate persistence.
- [x] SQL undo: retain opt-in history through remounts and tab/mode switches;
      maintain independent control histories and invalidate external replacements.
- [x] Table: prohibit deleting protected columns in the editor (hide them instead),
      remove event content/source tooltips and handle Left/Right on selected rows
      without stealing keys from JSON, edit controls, menus or resize handles.
- [x] Add focused failing regressions, then check the integrated app with complete
      units, production build and targeted hidden isolated offline desktop tests.
- [ ] Package/hash-check 0.1.58 and use the existing gated update workflow: wait
      for natural app exit, retain a backup and verify the promoted copy.

Independent Explorer, query-history and undo work uses separate files and tests.
The primary agent owns LogViewer, App integration, native checks and release.
