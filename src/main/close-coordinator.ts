export interface CloseCallbacks {
  save(): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  confirmDiscard(error: unknown): Promise<boolean>;
  confirmShutdownFailure?(error: unknown): Promise<boolean>;
  closeWindow(): void;
  quit(): void;
}

/** One final save/cleanup operation owns all concurrent close and quit requests. */
export function createCloseCoordinator(
  callbacks: CloseCallbacks,
  quitOnWindowClose: boolean,
) {
  let pending: Promise<void> | undefined;
  let exitRequested = false;
  return {
    request(exit: boolean): Promise<void> {
      exitRequested ||= exit;
      if (pending) return pending;
      pending = (async () => {
        try {
          try {
            await callbacks.save();
            await callbacks.flush();
          } catch (error) {
            if (!(await callbacks.confirmDiscard(error))) return;
          }
          // Skipping a failed save never skips cancellation of server-side jobs.
          try {
            await callbacks.shutdown();
          } catch (error) {
            let closeAnyway = false;
            try {
              closeAnyway =
                (await callbacks.confirmShutdownFailure?.(error)) ?? false;
            } catch {
              // A failed confirmation must leave the window available to retry.
            }
            if (!closeAnyway) return;
          }
          if (exitRequested || quitOnWindowClose) callbacks.quit();
          else callbacks.closeWindow();
        } finally {
          pending = undefined;
          exitRequested = false;
        }
      })();
      return pending;
    },
  };
}
