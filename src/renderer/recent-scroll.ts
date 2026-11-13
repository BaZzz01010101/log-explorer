/**
 * Recent (newest-first paging) scroll locks.
 *
 * - `bottom`: a freshly started Recent query keeps the table scrolled to the
 *   very bottom (and the newest event selected) until the viewer interacts,
 *   so late row measurements, highlight results and auto-loaded older pages
 *   cannot drift the initial position.
 * - `row`: an older page, requested at the top (scrolled to the top, Up on the
 *   first row, PageUp reaching it, or Home), anchors the first loaded row.
 *   While `tracking` (loading) it lands just below the header, unless the
 *   viewer scrolls away, which keeps it where they put it; once the rows are
 *   prepended it is `holding` the row there until the layout settles or the
 *   viewer interacts.
 */
export type RecentScrollLock =
  | { kind: "bottom" }
  | {
      kind: "row";
      id: string;
      offset: number;
      phase: "tracking" | "holding";
      /** The loading bar has not appeared yet for this page. */
      awaitingIndicator: boolean;
      /** Release time; Infinity while the page is loading. */
      expires: number;
    };

/** How long prepended rows are held in place after an older page arrives. */
export const RECENT_HOLD_MS = 1500;

/** A requested page that never starts loading stops tracking after this. */
export const RECENT_START_MS = 10000;

/** User input ends a lock, except a loading page keeps following the viewer. */
export function releasedByInput(lock: RecentScrollLock | null): RecentScrollLock | null {
  return lock?.kind === "row" && lock.phase === "tracking" ? lock : null;
}

/** The scrollTop correction that puts a row back at its locked offset. */
export function lockCorrection(currentOffset: number, lockedOffset: number): number {
  const delta = currentOffset - lockedOffset;
  return Math.abs(delta) > 0.5 ? delta : 0;
}

/** Index of the newest event, preferring the later row for equal timestamps. */
export function newestIndex(timestamps: readonly number[]): number {
  let latest = -1;
  for (let index = 0; index < timestamps.length; index++)
    if (latest < 0 || timestamps[index]! >= timestamps[latest]!) latest = index;
  return latest;
}
