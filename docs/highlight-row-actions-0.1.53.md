# Highlights row editing and actions

Profiles and rules use the same fields in view and edit modes. View mode keeps
them read-only while allowing text selection. Edit unlocks the existing controls;
their positions, scroll offset and DOM identity stay unchanged. Priority remains
visible in the table order, without a redundant field in the expanded editor.

The pencil sits directly before Delete. Editing colors the summary and expanded
editor green; adding an item colors both blue. New items remain local until Save;
Cancel removes them. Saved-item edits remain drafts until validated and saved.

Delete colors only the summary row red and reveals an inline Delete / Cancel strip
from right to left. Editing uses a Save / Cancel strip in the same position. These
overlays fill the row height without changing column widths. Cancel stays over
the original icon position throughout the reveal, so a double-click cannot
confirm deletion. Escape cancels the current row action. Delete confirmation
also dismisses when clicking outside the row.

Ordinary expansion folds other rows in the same list. Shift expansion keeps them
open. Folded drafts survive profile changes and docking, and profiles and rules
retain independent expansion state.

## Alternative tree editor

The additional Highlights tree tab leaves the existing Highlights table design
available. Profiles expand into rules on the left; selecting an item shows its
editor on the right. Disabled profiles and rules are gray, including rules in a
disabled profile. The editor's enabled switch controls the selected item.

Valid edits apply immediately to the shared configuration. Incomplete regex,
pointer or color input stays visible with its validation error without replacing
the last valid configuration. There are no Save, Cancel or Delete editor buttons.
Context menus provide Edit, Move up/down, additions and a red Delete action.
Profiles offer Add profile and Add rule; rules offer Add rule. Deletion uses a
modal dialog with the item name, owning profile and affected rule count. Cancel
and Escape preserve the item and keep Settings open.

Arrow keys navigate the tree; Left/Right fold and unfold profiles. Enter/F2 focus
the editor, Delete opens confirmation, and Shift+F10 opens the item's menu.
Selection, expansion and panel sizes survive docking. The modal preview reuses
the captured events, synchronized selection, folds and both scroll axes. Pane
dividers resize the tree/editor and the preview without splitting the themes.

Verification uses hidden isolated offline windows; real AWS and installer
installation are outside this UI change. Test artifacts stay in `.tmp` and the
versioned package goes in `release/0.1.53`. The standard app update waits for
natural exit and retains the previous build. Changes remain uncommitted.

Final evidence: all 960 unit/integration tests and 56 distinct packaged checks
pass. The aggregate in `.tmp/desktop-verification-0.1.53.json` identifies the final
passing result for every case, preserves earlier selector failures and verifies
the unchanged installer, executable and ASAR hashes. Native tests cover both
themes, exact field geometry and DOM retention, deletion safety, nested Escape,
provisional items, both editors, docking, all Settings pages at three widths,
panel dividers, preview synchronization, text selection, persistence and regex
timeout recovery. This is targeted desktop verification, not the entire desktop
suite.
