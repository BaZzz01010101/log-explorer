import { describe, expect, it, vi } from "vitest";
import { collectGcpPages } from "../src/renderer/gcp-pagination";

describe("GCP discovery pagination", () => {
  it("scans empty pages and returns all unique items", async () => {
    const load = vi.fn(async (cursor?: string) =>
      cursor === undefined
        ? { items: ["one"], cursor: "first" }
        : cursor === "first"
          ? { items: [], cursor: "second" }
          : { items: ["one", "two"] },
    );
    const updates: string[][] = [];
    await collectGcpPages(
      load,
      (items) => updates.push(items),
      (item) => item,
    );
    expect(updates.at(-1)).toEqual(["one", "two"]);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("rejects repeated continuation tokens", async () => {
    await expect(
      collectGcpPages(
        async () => ({ items: [], cursor: "same" }),
        () => {},
        String,
      ),
    ).rejects.toThrow(/continuation/i);
  });
  it("stops publishing after cancellation", async () => {
    const controller = new AbortController();
    const update = vi.fn();
    await collectGcpPages(
      async () => {
        controller.abort();
        return { items: ["late"] };
      },
      update,
      String,
      controller.signal,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
