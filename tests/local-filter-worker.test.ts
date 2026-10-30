import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("filters real worker messages by regex, stream ID, case and selected levels", async () => {
  const output: any[] = [];
  const worker = {
    onmessage: (_event: { data: unknown }) => {},
    postMessage: (message: unknown) => output.push(message),
  };
  vi.stubGlobal("self", worker);
  await import("../src/renderer/local-filter.worker");
  const base = {
    timestamp: 123456,
    ingestionTime: 888888,
    logGroup: "/hidden",
    connectionId: "private-profile",
    logStream: "2026/10/30/[$LATEST]Stream-A42",
  };
  worker.onmessage({
    data: {
      jobId: 7,
      query: "^Stream-A\\d+$",
      level: ["error"],
      options: { regex: true, caseSensitive: true },
      events: [
        { ...base, id: "one", message: "ERROR ordinary" },
        { ...base, id: "two", message: "INFO ordinary" },
        {
          ...base,
          id: "three",
          logStream: "2026/10/30/[23]stream-a42",
          message: "ERROR ordinary",
        },
      ],
    },
  });
  expect(output).toEqual([
    { jobId: 7, ready: true },
    {
      jobId: 7,
      batch: [
        { id: "one", matched: true },
        { id: "two", matched: false },
        { id: "three", matched: false },
      ],
      done: true,
    },
  ]);
  output.length = 0;
  worker.onmessage({
    data: {
      jobId: 8,
      query: "2026|LATEST|private|hidden|888888|123456",
      level: "all",
      options: { regex: true },
      events: [{ ...base, id: "one", message: "ordinary" }],
    },
  });
  expect(output.at(-1).batch).toEqual([{ id: "one", matched: false }]);
});

it.each([
  { query: "[", message: "ordinary", error: /invalid.*regex/i },
  { query: "x".repeat(8193), message: "ordinary", error: /8192/ },
  { query: "a$", message: "x".repeat(524289), error: /message.*limit/i },
])(
  "reports unsupported regex input without presenting partial matches",
  async ({ query, message, error }) => {
    const output: any[] = [];
    const worker = {
      onmessage: (_event: { data: unknown }) => {},
      postMessage: (message: unknown) => output.push(message),
    };
    vi.stubGlobal("self", worker);
    await import("../src/renderer/local-filter.worker");
    worker.onmessage({
      data: {
        jobId: 1,
        query,
        level: "all",
        options: { regex: true },
        events: [
          { id: "one", timestamp: 0, logGroup: "g", logStream: "s", message },
        ],
      },
    });
    expect(output.at(-1)).toMatchObject({ jobId: 1, done: true });
    expect(output.at(-1).error).toMatch(error);
    expect(output.some((item) => item.batch?.length)).toBe(false);
  },
);
