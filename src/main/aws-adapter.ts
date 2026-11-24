import type { Connection } from "../shared/contracts";
import type {
  DescribeLogGroupsCommandOutput,
  DescribeLogStreamsCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";
import { delay, Semaphore, throwIfAborted, withAbort } from "./async";
import { awsSdk, identifier, type CloudWatchCommand } from "./aws-common";
import { createHistoryEvents } from "./aws-history";
import { liveTail } from "./aws-live";
import { createRecentEvents } from "./aws-recent";
import type { LogAdapter } from "./log-adapter";

export interface AwsTransport {
  send(
    command: CloudWatchCommand,
    options?: { abortSignal?: AbortSignal },
  ): Promise<unknown>;
  destroy(): void;
}
export interface AwsAdapterOptions {
  allowAws: () => boolean;
  transportFactory?: (connection: Connection) => Promise<AwsTransport>;
}

class MetadataContinuations {
  private searches = new Map<string, { seen: Set<string>; expires: number }>();
  observe(
    key: string,
    input: string | undefined,
    next: string | undefined,
  ): void {
    const now = Date.now();
    for (const [search, value] of this.searches)
      if (value.expires <= now) this.searches.delete(search);
    if (!input) this.searches.delete(key);
    const history = this.searches.get(key) ?? {
      seen: new Set<string>(),
      expires: now + 15 * 60000,
    };
    if (next) {
      if (next === input || history.seen.has(next))
        throw new Error(
          "CloudWatch returned a repeated resource continuation; refresh or narrow the resource search",
        );
      if (history.seen.size >= 256)
        throw new Error(
          "Resource pagination limit reached; narrow the resource search",
        );
      history.seen.add(next);
      if (!this.searches.has(key) && this.searches.size >= 100)
        this.searches.delete(this.searches.keys().next().value!);
      this.searches.set(key, history);
    }
  }
  clear(): void {
    this.searches.clear();
  }
}

async function defaultTransport(
  connection: Connection,
  allowAws: () => boolean,
): Promise<AwsTransport> {
  if (!allowAws()) throw new Error("AWS access is disabled");
  const [{ CloudWatchLogsClient }, { fromIni }] = await Promise.all([
    import("@aws-sdk/client-cloudwatch-logs"),
    import("@aws-sdk/credential-providers"),
  ]);
  if (!allowAws()) throw new Error("AWS access is disabled");
  const credentials = fromIni({
    profile: connection.profile || "default",
    clientConfig: { region: connection.region },
  });
  const client = new CloudWatchLogsClient({
    region: connection.region,
    credentials,
    maxAttempts: 1,
    retryMode: "standard",
  });
  return {
    send: (command, options) => client.send(command as never, options),
    destroy: () => client.destroy(),
  };
}
export function createAwsAdapter(
  connection: Connection,
  options: AwsAdapterOptions,
): LogAdapter {
  const slots = new Semaphore(4);
  const metadataContinuations = new MetadataContinuations();
  const arnCache = new Map<string, { arn: string; expires: number }>();
  let transport: Promise<AwsTransport> | undefined;
  let destroyed = false;
  function gate() {
    if (!options.allowAws())
      throw new Error(
        "AWS access is disabled. It is available in the packaged application and npm run dev, not in test runs.",
      );
    if (destroyed) throw new Error("AWS connection was closed");
  }
  async function getTransport(): Promise<AwsTransport> {
    gate();
    if (!transport) {
      transport = (
        options.transportFactory
          ? options.transportFactory(connection)
          : defaultTransport(connection, options.allowAws)
      ).catch((error) => {
        transport = undefined;
        throw error;
      });
    }
    const client = await transport;
    gate();
    return client;
  }
  async function send<T>(
    command: CloudWatchCommand,
    signal: AbortSignal,
  ): Promise<T> {
    gate();
    const release = await slots.acquire(signal);
    try {
      const client = await getTransport();
      for (let attempt = 0; ; attempt++) {
        gate();
        throwIfAborted(signal);
        try {
          const timeout = new AbortController();
          const timer = setTimeout(() => timeout.abort(), 30000);
          const operationSignal = AbortSignal.any([signal, timeout.signal]);
          try {
            return (await withAbort(
              client.send(command, { abortSignal: operationSignal }),
              operationSignal,
            )) as T;
          } catch (error) {
            if (timeout.signal.aborted && !signal.aborted)
              throw Object.assign(new Error("CloudWatch request timed out"), {
                name: "TimeoutError",
              });
            throw error;
          } finally {
            clearTimeout(timer);
          }
        } catch (error) {
          throwIfAborted(signal);
          const name =
            error && typeof error === "object" && "name" in error
              ? String(error.name)
              : "";
          const retryable =
            /Throttl|TooManyRequests/.test(name) ||
            /ServiceUnavailable|TimeoutError|RequestTimeout|InternalFailure|InternalServerError/.test(
              name,
            );
          if (!retryable || attempt >= 2) throw error;
          await delay(
            Math.min(2000, 200 * 2 ** attempt) +
              Math.floor(Math.random() * 100),
            signal,
          );
        }
      }
    } finally {
      release();
    }
  }
  async function resolveArn(
    group: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (group.startsWith("arn:")) return group.replace(/:\*$/, "");
    const cached = arnCache.get(group);
    if (cached && cached.expires > Date.now()) return cached.arn;
    let token: string | undefined;
    const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const response = await send<DescribeLogGroupsCommandOutput>(
        new (await awsSdk()).DescribeLogGroupsCommand({
          logGroupNamePrefix: group,
          limit: 50,
          nextToken: token,
        }),
        signal,
      );
      const found = response.logGroups?.find(
        (value) => value.logGroupName === group,
      );
      if (found) {
        if (found.logGroupClass && found.logGroupClass !== "STANDARD")
          throw new Error(
            "Live Tail is supported only for STANDARD log groups",
          );
        const arn = (found.logGroupArn ?? found.arn)?.replace(/:\*$/, "");
        if (!arn)
          throw new Error(
            "CloudWatch did not return a log group ARN for Live Tail",
          );
        if (arnCache.size >= 100)
          arnCache.delete(arnCache.keys().next().value!);
        arnCache.set(group, { arn, expires: Date.now() + 60000 });
        return arn;
      }
      token = response.nextToken;
      if (!token) break;
      if (seen.has(token))
        throw new Error("CloudWatch returned a repeated resource continuation");
      seen.add(token);
    }
    throw new Error(
      "Log group was not found for Live Tail; verify the region and logs:DescribeLogGroups permission",
    );
  }
  const recent = createRecentEvents(send);
  const history = createHistoryEvents(send);
  return {
    async listGroups(search, cursor, signal) {
      const response = await send<DescribeLogGroupsCommandOutput>(
        new (await awsSdk()).DescribeLogGroupsCommand({
          logGroupNamePattern: search || undefined,
          nextToken: cursor,
          limit: 50,
        }),
        signal,
      );
      throwIfAborted(signal);
      let groups = (response.logGroups ?? []).filter(
        (group) => !!group.logGroupName,
      );
      if (search && groups.length) {
        // Pattern searches omit class, retention and byte counts. Fetch the same
        // page by exact names so search results retain complete group metadata.
        const names = groups.map((group) => group.logGroupName!);
        const details = new Map<string, (typeof groups)[number]>();
        const seen = new Set<string>();
        let token: string | undefined;
        for (let page = 0; page < 100; page++) {
          const metadata = await send<DescribeLogGroupsCommandOutput>(
            new (await awsSdk()).DescribeLogGroupsCommand({
              logGroupIdentifiers: names,
              limit: 50,
              nextToken: token,
            }),
            signal,
          );
          throwIfAborted(signal);
          for (const group of metadata.logGroups ?? [])
            if (group.logGroupName) details.set(group.logGroupName, group);
          token = metadata.nextToken;
          if (!token) break;
          if (seen.has(token))
            throw new Error(
              "CloudWatch returned a repeated resource continuation",
            );
          seen.add(token);
          if (page === 99)
            throw new Error(
              "CloudWatch returned too many metadata pages; narrow the group search",
            );
        }
        // A group deleted between the search and metadata calls is no longer a
        // usable result. Do not represent missing metadata as STANDARD/indefinite.
        groups = groups.flatMap((group) => {
          const detail = details.get(group.logGroupName!);
          return detail ? [detail] : [];
        });
      }
      metadataContinuations.observe(
        `groups:${search}`,
        cursor,
        response.nextToken,
      );
      return {
        items: groups.map((group) => ({
          name: group.logGroupName!,
          arn: group.logGroupArn ?? group.arn,
          storedBytes: group.storedBytes,
          retentionDays: group.retentionInDays,
          logClass: group.logGroupClass,
        })),
        cursor: response.nextToken,
      };
    },
    async listStreams(group, prefix, cursor, signal) {
      const response = await send<DescribeLogStreamsCommandOutput>(
        new (await awsSdk()).DescribeLogStreamsCommand({
          ...identifier(group),
          logStreamNamePrefix: prefix || undefined,
          nextToken: cursor,
          limit: 50,
          orderBy: prefix ? "LogStreamName" : "LastEventTime",
          descending: true,
        }),
        signal,
      );
      throwIfAborted(signal);
      metadataContinuations.observe(
        `streams:${group}:${prefix}`,
        cursor,
        response.nextToken,
      );
      return {
        items: (response.logStreams ?? [])
          .filter((stream) => !!stream.logStreamName)
          .map((stream) => ({
            name: stream.logStreamName!,
            lastEventTime: stream.lastEventTimestamp,
          })),
        cursor: response.nextToken,
      };
    },
    async events(request, signal) {
      gate();
      throwIfAborted(signal);
      return request.direction === "older"
        ? recent.events(request, signal)
        : history.events(request, signal);
    },
    async live(request, signal, emit) {
      gate();
      return liveTail(request, signal, emit, send, (group) =>
        resolveArn(group, signal),
      );
    },
    destroy() {
      destroyed = true;
      history.clear();
      recent.clear();
      metadataContinuations.clear();
      arnCache.clear();
      if (transport)
        void transport.then((client) => client.destroy()).catch(() => {});
      transport = undefined;
    },
  };
}
