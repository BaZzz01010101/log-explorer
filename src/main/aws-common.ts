import { createHash } from "node:crypto";
import type {
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  FilterLogEventsCommandOutput,
  StartLiveTailCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import type { LogEvent, LogSource, QueryRequest } from "../shared/contracts";

// Loaded on first use so app startup does not pay for the AWS SDK.
export const awsSdk = () => import("@aws-sdk/client-cloudwatch-logs");

export type CloudWatchCommand =
  | DescribeLogGroupsCommand
  | DescribeLogStreamsCommand
  | FilterLogEventsCommand
  | StartLiveTailCommand;

/** Sends a command with the connection's limits, timeout and retries. */
export type SendCommand = <T>(
  command: CloudWatchCommand,
  signal: AbortSignal,
) => Promise<T>;

/** Identifies the query a continuation belongs to. */
export function querySignature(request: QueryRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.connection.region,
        request.connection.profile,
        request.sources,
        request.startTime,
        request.endTime,
        request.filterPattern,
        request.direction,
      ]),
    )
    .digest("hex");
}

export function identifier(
  group: string,
): { logGroupIdentifier: string } | { logGroupName: string } {
  return group.startsWith("arn:")
    ? { logGroupIdentifier: group.replace(/:\*$/, "") }
    : { logGroupName: group };
}

export function nameFromIdentifier(group: string): string {
  return group.includes(":log-group:")
    ? group.split(":log-group:")[1].replace(/:\*$/, "")
    : group;
}

/** The single source of a history query; the service splits the others. */
export function onlySource(request: QueryRequest): LogSource {
  if (request.sources.length !== 1)
    throw new Error("CloudWatch history queries require exactly one source.");
  return request.sources[0];
}

export function filteredEvents(
  response: FilterLogEventsCommandOutput,
  source: LogSource,
  request: QueryRequest,
): LogEvent[] {
  return (response.events ?? []).map((event) => ({
    id: `${source.logGroup}:${
      event.eventId ??
      createHash("sha256")
        .update(
          JSON.stringify([
            event.logStreamName,
            event.timestamp,
            event.ingestionTime,
            event.message,
          ]),
        )
        .digest("hex")
    }`,
    timestamp: event.timestamp ?? request.startTime,
    ingestionTime: event.ingestionTime,
    message: event.message ?? "",
    logGroup: nameFromIdentifier(source.logGroup),
    logStream: event.logStreamName ?? "",
  }));
}
