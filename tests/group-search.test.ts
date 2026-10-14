import { describe, expect, it } from "vitest";
import type { Connection } from "../src/shared/contracts";
import {
  createAwsAdapter,
  type CloudWatchCommand,
} from "../src/main/aws-adapter";
import { createOfflineAdapter } from "../src/main/offline-adapter";

const connection: Connection = {
  id: "test",
  name: "Test",
  mode: "aws",
  profile: "unused",
  region: "eu-west-1",
};
const signal = () => new AbortController().signal;
function adapterWith(send: (command: CloudWatchCommand) => Promise<unknown>) {
  return createAwsAdapter(connection, {
    allowAws: () => true,
    transportFactory: async () => ({ send, destroy() {} }),
  });
}

describe("log group substring search", () => {
  it("keeps the largest requested search page within the 50-identifier hydration limit", async () => {
    const names = Array.from(
      { length: 50 },
      (_, index) => `/company/orders-${String(index).padStart(2, "0")}`,
    );
    const calls: unknown[] = [];
    const adapter = adapterWith(async (command) => {
      calls.push(command.input);
      return {
        logGroups: names.map((logGroupName) => ({
          logGroupName,
          logGroupClass: "STANDARD",
        })),
      };
    });
    const result = await adapter.listGroups("orders", undefined, signal());
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      logGroupNamePattern: "orders",
      limit: 50,
    });
    expect(calls[1]).toEqual({
      logGroupIdentifiers: names,
      limit: 50,
      nextToken: undefined,
    });
    expect(result.items.map((group) => group.name)).toEqual(names);
  });
  it("matches fixture names anywhere with the same case-sensitive semantics as AWS", async () => {
    const adapter = createOfflineAdapter();
    const result = await adapter.listGroups("orders", undefined, signal());
    expect(result.items.map((group) => group.name)).toEqual([
      "/aws/lambda/orders-api",
    ]);
    expect(result.items[0].logClass).toBe("STANDARD");
    expect(
      (await adapter.listGroups("Orders", undefined, signal())).items,
    ).toEqual([]);
  });

  it("uses server substring search and hydrates complete metadata without changing search pagination", async () => {
    const calls: unknown[] = [];
    const adapter = adapterWith(async (command) => {
      calls.push(command.input);
      if (calls.length === 1)
        return {
          logGroups: [
            { logGroupName: "/aws/lambda/orders-api", arn: "old-arn" },
            { logGroupName: "/company/orders-archive" },
          ],
          nextToken: "search-next",
        };
      return {
        logGroups: [
          {
            logGroupName: "/company/orders-archive",
            logGroupClass: "INFREQUENT_ACCESS",
            retentionInDays: 90,
            storedBytes: 123,
          },
          {
            logGroupName: "/aws/lambda/orders-api",
            logGroupClass: "STANDARD",
            logGroupArn: "full-arn",
            retentionInDays: 30,
            storedBytes: 456,
          },
        ],
      };
    });
    const result = await adapter.listGroups(
      "orders",
      "search-current",
      signal(),
    );
    expect(calls[0]).toEqual({
      logGroupNamePattern: "orders",
      nextToken: "search-current",
      limit: 50,
    });
    expect(calls[1]).toEqual({
      logGroupIdentifiers: [
        "/aws/lambda/orders-api",
        "/company/orders-archive",
      ],
      limit: 50,
      nextToken: undefined,
    });
    expect(result).toEqual({
      items: [
        {
          name: "/aws/lambda/orders-api",
          arn: "full-arn",
          logClass: "STANDARD",
          retentionDays: 30,
          storedBytes: 456,
        },
        {
          name: "/company/orders-archive",
          arn: undefined,
          logClass: "INFREQUENT_ACCESS",
          retentionDays: 90,
          storedBytes: 123,
        },
      ],
      cursor: "search-next",
    });
  });

  it("hydrates every metadata page and skips a group removed during search", async () => {
    const calls: unknown[] = [];
    const adapter = adapterWith(async (command) => {
      calls.push(command.input);
      if (calls.length === 1)
        return {
          logGroups: [
            { logGroupName: "/service-orders" },
            { logGroupName: "/deleted-orders" },
          ],
        };
      if (calls.length === 2)
        return { logGroups: [], nextToken: "metadata-next" };
      return {
        logGroups: [
          {
            logGroupName: "/service-orders",
            logGroupClass: "DELIVERY",
            storedBytes: 1,
          },
        ],
      };
    });
    const result = await adapter.listGroups("orders", undefined, signal());
    expect(calls[2]).toEqual({
      logGroupIdentifiers: ["/service-orders", "/deleted-orders"],
      limit: 50,
      nextToken: "metadata-next",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].logClass).toBe("DELIVERY");
  });

  it("does not hydrate complete unfiltered pages or empty search pages", async () => {
    const calls: unknown[] = [];
    const adapter = adapterWith(async (command) => {
      calls.push(command.input);
      return { logGroups: [] };
    });
    await adapter.listGroups("", undefined, signal());
    await adapter.listGroups("missing", undefined, signal());
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      logGroupNamePattern: undefined,
      nextToken: undefined,
      limit: 50,
    });
  });

  it("rejects repeated metadata continuations instead of getting stuck", async () => {
    let calls = 0;
    const adapter = adapterWith(async () =>
      ++calls === 1
        ? { logGroups: [{ logGroupName: "/orders" }] }
        : { logGroups: [], nextToken: "repeat" },
    );
    await expect(
      adapter.listGroups("orders", undefined, signal()),
    ).rejects.toThrow(/repeated.*continuation/i);
    expect(calls).toBe(3);
  });
});
