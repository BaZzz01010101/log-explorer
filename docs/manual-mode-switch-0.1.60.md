# Manual query switching and column visibility

Changing Events/Insights retires the previous mode's operation and leaves the
new mode idle until Run (or the existing query keyboard action). The two query
drafts and their independent undo histories remain available. Late results and
acknowledgements from the retired mode cannot update the new mode.

A sleeping Live session or pending time-refresh timer is discarded when retiring
the old operation, preventing an implicit query on later activation. A manual
run that already owns the new configuration remains authoritative. Explicit
source/date changes retain their existing refresh behavior; opening a new source
still loads it. Selecting an existing idle tab does not start a query.

Focused unit/native regressions reproduced automatic querying in 0.1.59. Tests
cover manual execution, drafts, mode/tab switching, stale responses, Live sleep,
periodic refresh and both themes. Verification uses hidden isolated offline
windows, with evidence stored in `.tmp`.

The columns editor uses a single eye toggle in place of each visibility checkbox.
Visible columns show an eye, hidden columns show an eye-off icon and dimmed name;
both states remain interactive. The separate right-side hide buttons are removed.
Protected columns have no delete action; custom columns retain their remove
button. The existing last-visible-column guard explains itself inside the modal
and clears its message after a valid edit. Visibility remains part of the saved
view configuration.

Final evidence: all 1,039 unit/integration tests and 11 targeted packaged desktop
checks pass without failures, skips or flaky cases. Both automatic mode querying
and the old visibility controls were reproduced before the fixes. Evidence and
artifact hashes are recorded in `.tmp/desktop-verification-0.1.60.json`. The normal
launch folder was updated after natural app exit. All three promoted hashes match,
and all four post-update checks pass; see
`.tmp/test-results-standard-0.1.60/report.json`.
