import { expect, it, vi } from "vitest";
import { createLogService } from "../src/main/log-service";
import { createOfflineAdapter } from "../src/main/offline-adapter";
import type { Connection, QueryRequest, QueryUpdate } from "../src/shared/contracts";

const connection: Connection = {
  id: "c",
  name: "C",
  profile: "default",
  region: "eu-west-1",
  mode: "offline",
};
// Two groups whose pages interleave in time across page boundaries.
const pages: Record<string, number[][]> = {
  "/a": [[1, 2], [10, 11]],
  "/b": [[3, 4], [5, 6]],
};

it("keeps single-connection multi-group pages in chronological order", async () => {
  const updates: QueryUpdate[] = [];
  const service = createLogService((update) => updates.push(update), {
    allowAws: () => false,
    offlineAdapterFactory: () => ({
      ...createOfflineAdapter(),
      events: async (request) => {
        const group = request.sources[0]!.logGroup;
        const index = Number(request.cursor ?? 0);
        return {
          requestId: request.requestId,
          state: "complete",
          events: pages[group]![index]!.map((timestamp) => ({
            id: `${group}-${timestamp}`,
            timestamp,
            message: String(timestamp),
            logGroup: group,
            logStream: "s",
          })),
          cursor: index + 1 < pages[group]!.length ? String(index + 1) : undefined,
        };
      },
    }),
  });
  const base: QueryRequest = {
    requestId: "q0",
    connection,
    sources: [{ logGroup: "/a" }, { logGroup: "/b" }],
    startTime: 0,
    endTime: 100,
    kind: "events",
    filterPattern: "",
    query: "",
    limit: 2,
  };
  const seen: number[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 4; page++) {
    const requestId = `q${page}`;
    await service.query({ ...base, requestId, cursor });
    await vi.waitFor(() =>
      expect(updates.some((u) => u.requestId === requestId && u.state === "complete")).toBe(true),
    );
    const done = updates.filter((u) => u.requestId === requestId);
    seen.push(...done.flatMap((u) => u.events ?? []).map((event) => event.timestamp));
    cursor = done.find((u) => u.state === "complete")?.cursor;
    if (!cursor) break;
  }
  expect(seen).toEqual([1, 2, 3, 4, 5, 6, 10, 11]);
  await service.shutdown();
});
