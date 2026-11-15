import { expect, it } from "vitest";
import { createLogService } from "../src/main/log-service";
import { createOfflineAdapter } from "../src/main/offline-adapter";
import type { Connection } from "../src/shared/contracts";

it("evicts the least recently used adapter instead of refusing new connections", async () => {
  const destroyed: string[] = [];
  let next = 0;
  const service = createLogService(() => {}, {
    allowAws: () => false,
    offlineAdapterFactory: () => {
      const name = `adapter-${next++}`;
      return { ...createOfflineAdapter(), destroy: () => void destroyed.push(name) };
    },
  });
  const connection = (index: number): Connection => ({
    id: `c${index}`,
    name: `C${index}`,
    profile: "default",
    region: "eu-west-1",
    mode: "offline",
  });
  for (let index = 0; index < 32; index++)
    await service.listGroups(connection(index), "");
  await service.listGroups(connection(0), "", undefined, true); // c0 is now recent
  await service.listGroups(connection(32), "");
  expect(destroyed).toEqual(["adapter-1"]);
  await service.shutdown();
});
