# Remove Insights from the desktop client

The user superseded the mode-retention work and requested removal of Insights.
Only Events and Live Tail remain available. Do not implement mode-result caching.

- Remove the mode selector, SQL editor and Insights-only messages/actions.
  Search menus and Settings list only Events searches. Preserve legacy saved SQL
  records in serialized configuration for compatibility, without exposing them.
- Normalize legacy tabs, closed tabs and favorite/split views to Events while
  preserving sources, Events filters, time windows, titles and view configuration.
  New queries must be Events-only; retain legacy type/schema input support only
  where needed to safely import older saved workspaces.
- Remove Insights execution from AWS/offline adapters and service dispatch; reject
  legacy Insights execution requests before any transport work. Remove unused
  query-mode runtime branches and normalize requests to Events.
- Retire obsolete Insights-specific tests and replace them with migration,
  execution-rejection and Events/Live regressions. Preserve generic lifecycle,
  query state, pagination, undo and retained-view coverage.
- Verify full units/build and hidden isolated offline native checks. Package and
  hash-check the next release, then use natural-exit promotion with a backup.
- Restrict ordinary local text searches to event messages; source metadata must
  not cause every Lambda row to match `$latest`. Keep property/level syntax.
- Center both filter-field drag handles in the gap between adjacent controls and
  remove the local-filter help button next to the level selector.
- Hide empty saved/recent search sections and increase dropdown height within
  viewport bounds.
- Split the current pane by duplicating its view, leaving neighboring tabs alone.
- Use Ctrl+Tab / Ctrl+Shift+Tab for recent tab focus order; preserve that order
  while Ctrl remains held. Ctrl+Page Down / Up follow the visible tab order.

Ownership: UI worker owns QueryPane and its focused unit tests; backend worker
owns adapters/service, query execution validation and related tests; migration
worker owns workspace restoration, runtime/query-state logic and related tests.
Primary agent owns App/Settings integration, inspector wording, native checks,
release verification and preserving the existing uncommitted changes.
