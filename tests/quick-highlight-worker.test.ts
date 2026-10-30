import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("applies quick regex flags when processing a real worker message", async () => {
  const output: unknown[] = [];
  const worker = {
    onmessage: (_event: { data: unknown }) => {},
    postMessage: (message: unknown) => output.push(message),
  };
  vi.stubGlobal("self", worker);
  await import("../src/renderer/highlight.worker");
  worker.onmessage({
    data: {
      events: [
        {
          id: "one",
          timestamp: 0,
          message: "A1 a2",
          logGroup: "g",
          logStream: "s",
        },
      ],
      profiles: [],
      columns: [],
      theme: "light",
      timezone: "utc",
      needle: "a\\d",
      quick: { regex: true, caseSensitive: true },
    },
  });
  expect(output).toEqual([
    { ready: true },
    {
      batch: [
        {
          id: "one",
          result: {
            row: {},
            text: {},
            manual: { '["@message","A1 a2"]': [{ start: 3, end: 5 }] },
          },
        },
      ],
    },
    { done: true },
  ]);
});
