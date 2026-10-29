# Stable closed-tab tooltips with short source names

The delegated tooltip handler previously replaced its close-timer handle without
canceling the previous timer. Crossing multiple ordinary controls within 350ms
could leave an older timer running. Entering history canceled only the latest
close timer, and the older one canceled the pending 450ms open. Moving to another
item then appeared to repair the tooltip. The handler now replaces both timers
safely and accepts exit events only from the current hint owner or its tooltip.

History tooltips show the view name. A Sources section is added for multisource
views or a name that differs from the automatic source-based title. Sources use
the exact naming function used by separately opened tabs, including short stream
identifiers. Full paths and profile/region details are omitted. Automatic single
source titles, including a rename back to the automatic title, show only the name.

Verification covers the leaked-timer sequence against 0.1.55, rapid real pointer
transitions, both themes, renamed and automatic names, multiple groups/streams,
selecting and copying tooltip text, menu dismissal and history width/reopening.
Native checks run hidden, isolated and offline. Final release evidence belongs in
`.tmp` and artifact hashes in `release/0.1.56/artifact-manifest.json`.

Surrounding-context views keep a transient reference to the originating event,
load continuation pages until it is found or the query ends, select it and center
it in the viewport. Matching preserves source identity and tolerates a changed
query event ID using the exact timestamp/message. The reference is consumed after
revealing and is never saved in the workspace, so later navigation stays under
user control.

Ctrl-clicking an inspector JSON toggle expands every expandable descendant if
any are folded, and folds the entire branch otherwise. Other branches retain
their state. Existing inspection depth/node limits and shared preview expansion
state remain in effect. Plain clicks preserve their existing single-node behavior.

Final evidence: 971 unit/integration tests and all 23 targeted final packaged
desktop checks pass with no failures, skips or flaky cases. Evidence and artifact
hashes are in `.tmp/desktop-verification-0.1.56.json`. The original timer race and
missing context auto-pagination were reproduced on earlier packages. Verification
remained hidden and offline; real AWS and installer installation were not tested.
