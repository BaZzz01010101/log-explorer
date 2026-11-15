import { expect, it, vi } from "vitest";
import { createLogService } from "../src/main/log-service";

it("caches Google Cloud discovery until an explicit refresh", async () => {
  const service = createLogService(() => {}, { allowAws: () => false });
  const operation = vi.fn(async () => ({ items: [1] }));
  await service.discover("projects", operation);
  await service.discover("projects", operation);
  expect(operation).toHaveBeenCalledTimes(1);
  service.clearDiscovery();
  await service.discover("projects", operation);
  expect(operation).toHaveBeenCalledTimes(2);
  await service.shutdown();
});

it("cancels in-flight discovery on shutdown and refuses it when Google Cloud is off", async () => {
  let allowed = true;
  const service = createLogService(() => {}, {
    allowAws: () => false,
    allowGcp: () => allowed,
  });
  let seen!: AbortSignal;
  const running = service.discover("workloads", (signal) => {
    seen = signal;
    return new Promise((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new Error("stopped")), {
        once: true,
      }),
    );
  });
  await vi.waitFor(() => expect(seen).toBeDefined());
  await service.shutdown();
  expect(seen.aborted).toBe(true);
  await expect(running).rejects.toThrow();
  allowed = false;
  await expect(service.discover("projects", async () => 1)).rejects.toThrow(
    /disabled/,
  );
});
