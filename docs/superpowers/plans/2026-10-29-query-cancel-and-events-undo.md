# Query completion race and Events undo

- Reproduce StopQuery rejection after Insights completes during cancellation.
  Verify already-ended queries by reading their status with the existing client,
  within the existing cleanup deadline. Confirm only explicit ended states;
  preserve errors for running, unknown or inaccessible query state. Do not emit
  retired results or start another server query while reconciling cleanup.
- Retain Events filter edit history with a separate stable per-tab control key.
  Preserve SQL history, clear-button undo, independent fields/tabs and external
  query replacement invalidation.
- Test adapter and service lifecycle transitions with deterministic transports,
  including permission/read failures, shared cleanup deadline and normal stopping.
  Reproduce Events undo loss in the previous packaged app; check both themes and
  mode/tab switches in hidden isolated offline windows.
- Verify the full units/build, package and hash-check 0.1.59, and stage the gated
  update after natural app exit. Preserve the current uncommitted work and do not
  close or relaunch the normal app.
