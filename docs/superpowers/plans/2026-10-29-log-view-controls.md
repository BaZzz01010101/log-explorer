# Log view controls and map readability

Implement the requested changes in the existing desktop workspace, preserving
current highlighting rules, event selection, native text selection and tab state.

1. Ctrl-click on a row expander opens its JSON recursively and fits its details
   into the available event viewport, subject to existing inspection limits.
   Reuse JsonTree's bounded recursive expansion and the current height control.
2. Remove JSON-key path tooltips; add Copy path to the existing field menu using
   the value-copy callback and exact escaped JSON Pointer.
3. Put centered, keyboard-accessible resize handles after the local filter and
   quick-highlight fields. Save their widths per view and constrain them to the
   available pane width. Add case and regex toggles to quick highlighting with
   the same compact controls used by the Explorer filter.
4. Match quick regexes in the existing deadline-bound worker, carry explicit
   text spans to the renderer, and retain fast literal matching. Persist flags
   with the view and include them in worker configuration/cache identity.
5. Adjust colors only at scrollbar-map render boundaries. Remove inspector lane
   separator lines, preserve geometry/navigation, improve washed-out colors and
   keep dark-theme marks readable without excessive brightness.
6. Route custom clear buttons through the existing per-control edit history so
   clearing is one undoable edit, preserving focus, selection and redo.
7. Use focused failing tests, full unit checks with workspace-local temporary
   files, and hidden offline native checks of both themes, resize/folding,
   regex/case, clear/undo, copy path, and map contrast. Package and hash-check a
   versioned release, then stage only after all checks pass and natural app exit.

Independent map, edit-history, and worker work uses separate files. The primary
agent owns renderer integration and final native validation. Do not commit or
disturb the normal running app.
