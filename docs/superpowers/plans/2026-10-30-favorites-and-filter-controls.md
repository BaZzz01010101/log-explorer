# Favorites and filter controls

- Favorites use Open, Rename and Delete context actions. A hover/focus trash
  button and the context Delete action both reveal inline Delete / Cancel
  controls on the right of the item. Confirmation survives outside clicks and
  mouseleave until the user chooses; controls never trigger opening the view.
- Remove tooltips from Live and the custom time-range trigger, keeping accessible
  names and existing behavior.
- Add case/regex controls to local event filtering, and configurable contextual
  shortcuts to those controls and quick highlighting. Defaults match Explorer:
  Alt+C for case, Alt+E for regex. Tooltips display current assignments.
- Local matching and its evidence use message content plus the stream identifier.
  Lambda date/version prefixes, group, event ID and ingestion metadata are not
  searched. Preserve plain-mode property filtering and ignore-case defaults.
- Run arbitrary local regexes in a cancellable worker with an execution deadline.
  Keep LIVE arrivals, selection, undo and existing highlighting limits intact;
  distinguish pending matching from a definitive empty result and show errors.
- Persist per-view filter options and retain old workspace defaults. Keep filter
  evidence out of the event-list overview, as before.
- Verify focused regressions, full units/build and hidden isolated offline native
  interactions in both themes. Package the next version, hash-check artifacts and
  stage the existing natural-exit update without disturbing the user's app.

Ownership: favorites/tooltip worker owns ViewFavorites, its stylesheet, QueryPane
and TimeRangePicker plus focused tests. Matching worker owns shared matching and
evidence, worker/hook paths, contracts/view schema/parse and shortcut defaults.
Primary owns LogViewer integration, shared filter-control buttons, Settings labels,
App shortcut scope, desktop verification and release handoff.
