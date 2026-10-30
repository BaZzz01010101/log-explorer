import { expect, it, vi } from "vitest";
import {
  createCloseCoordinator,
  type CloseCallbacks,
} from "../src/main/close-coordinator";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function callbacks(patch: Partial<CloseCallbacks> = {}): CloseCallbacks {
  return {
    save: vi.fn(async () => {}),
    flush: vi.fn(async () => {}),
    shutdown: vi.fn(async () => {}),
    confirmDiscard: vi.fn(async () => true),
    closeWindow: vi.fn(),
    quit: vi.fn(),
    ...patch,
  };
}

it("awaits query cleanup even when the user discards a failed final save", async () => {
  const stopped = deferred();
  const hooks = callbacks({
    save: async () => {
      throw new Error("Disk full");
    },
    shutdown: () => stopped.promise,
  });
  const coordinator = createCloseCoordinator(hooks, true);
  const closing = coordinator.request(false);
  await vi.waitFor(() => expect(hooks.confirmDiscard).toHaveBeenCalled());
  expect(hooks.quit).not.toHaveBeenCalled();
  expect(hooks.closeWindow).not.toHaveBeenCalled();
  stopped.resolve();
  await closing;
  expect(hooks.quit).toHaveBeenCalledOnce();
});

it("keeps the application and jobs open when the user cancels after a save failure", async () => {
  const hooks = callbacks({
    save: async () => {
      throw new Error("Disk full");
    },
    confirmDiscard: async () => false,
  });
  await createCloseCoordinator(hooks, true).request(true);
  expect(hooks.shutdown).not.toHaveBeenCalled();
  expect(hooks.quit).not.toHaveBeenCalled();
});

it("coalesces a Quit request arriving during native window-close saving", async () => {
  const saved = deferred();
  const hooks = callbacks({ save: () => saved.promise });
  const coordinator = createCloseCoordinator(hooks, false);
  const close = coordinator.request(false);
  const quit = coordinator.request(true);
  expect(close).toBe(quit);
  saved.resolve();
  await quit;
  expect(hooks.quit).toHaveBeenCalledOnce();
  expect(hooks.closeWindow).not.toHaveBeenCalled();
  expect(hooks.shutdown).toHaveBeenCalledOnce();
});

it("quits directly on Windows when the last native window is closed", async () => {
  const hooks = callbacks();
  await createCloseCoordinator(hooks, true).request(false);
  expect(hooks.quit).toHaveBeenCalledOnce();
  expect(hooks.closeWindow).not.toHaveBeenCalled();
});

it("keeps the app open without an unhandled rejection if server cleanup fails", async () => {
  const hooks = callbacks({
    shutdown: async () => {
      throw new Error("Operation cleanup failed");
    },
  });
  await expect(
    createCloseCoordinator(hooks, true).request(true),
  ).resolves.toBeUndefined();
  expect(hooks.quit).not.toHaveBeenCalled();
  expect(hooks.closeWindow).not.toHaveBeenCalled();
});

it("requires an explicit decision to close after failed server cleanup and can be retried", async () => {
  const failure = new Error("Operation cleanup failed");
  const confirmShutdownFailure = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const hooks = callbacks({
    shutdown: async () => {
      throw failure;
    },
    confirmShutdownFailure,
  });
  const coordinator = createCloseCoordinator(hooks, false);
  await coordinator.request(false);
  expect(confirmShutdownFailure).toHaveBeenCalledWith(failure);
  expect(hooks.closeWindow).not.toHaveBeenCalled();
  await coordinator.request(false);
  expect(confirmShutdownFailure).toHaveBeenCalledTimes(2);
  expect(hooks.closeWindow).toHaveBeenCalledOnce();
  expect(hooks.quit).not.toHaveBeenCalled();
});

it("keeps the app open if its cleanup-failure confirmation cannot be shown", async () => {
  const hooks = callbacks({
    shutdown: async () => {
      throw new Error("Cleanup failed");
    },
    confirmShutdownFailure: async () => {
      throw new Error("Dialog unavailable");
    },
  });
  await expect(
    createCloseCoordinator(hooks, true).request(true),
  ).resolves.toBeUndefined();
  expect(hooks.quit).not.toHaveBeenCalled();
});
