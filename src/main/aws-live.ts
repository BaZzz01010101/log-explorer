import type { StartLiveTailCommandOutput } from "@aws-sdk/client-cloudwatch-logs";
import type { QueryRequest, QueryUpdate } from "../shared/contracts";
import { throwIfAborted, withAbort } from "./async";
import { awsSdk, nameFromIdentifier, type SendCommand } from "./aws-common";

/** The service sends an update about every second, even without events. */
const IDLE_TIMEOUT_MS = 30000;

/** Streams one Live Tail session until it ends. */
export async function liveTail(
  request: QueryRequest,
  signal: AbortSignal,
  emit: (update: QueryUpdate) => void,
  send: SendCommand,
  resolveArn: (group: string) => Promise<string>,
): Promise<void> {
  if (request.sources.length > 10)
    throw new Error("CloudWatch Live Tail supports at most 10 log groups");
  if (
    request.sources.length > 1 &&
    request.sources.some((source) => source.logStreams?.length)
  )
    throw new Error(
      "CloudWatch Live Tail permits stream selection only when one log group is selected",
    );
  throwIfAborted(signal);
  const identifiers = await Promise.all(
    request.sources.map((source) => resolveArn(source.logGroup)),
  );
  const streamController = new AbortController();
  const streamSignal = AbortSignal.any([signal, streamController.signal]);
  try {
    const response = await send<StartLiveTailCommandOutput>(
      new (await awsSdk()).StartLiveTailCommand({
        logGroupIdentifiers: identifiers,
        logStreamNames: request.sources[0]?.logStreams?.length
          ? request.sources[0].logStreams
          : undefined,
        logEventFilterPattern: request.filterPattern || undefined,
      }),
      streamSignal,
    );
    if (!response.responseStream)
      throw new Error("CloudWatch did not return a Live Tail response stream");
    const iterator = response.responseStream[Symbol.asyncIterator]();
    let session = "live";
    let sequence = 0;
    let announced = false,
      lastSampled = false;
    try {
      while (true) {
        throwIfAborted(signal);
        let idleTimeout = false;
        const timer = setTimeout(() => {
          idleTimeout = true;
          streamController.abort();
        }, IDLE_TIMEOUT_MS);
        const next = await withAbort(iterator.next(), streamSignal)
          .catch((error) => {
            if (idleTimeout && !signal.aborted)
              throw new Error(
                "Live Tail connection stopped sending updates. Start Live again to reconnect.",
              );
            throw error;
          })
          .finally(() => clearTimeout(timer));
        throwIfAborted(signal);
        if (next.done) break;
        const chunk = next.value;
        if (chunk.SessionTimeoutException)
          throw new Error(
            chunk.SessionTimeoutException.message ??
              "Live Tail session reached its service time limit",
          );
        if (chunk.SessionStreamingException)
          throw new Error(
            chunk.SessionStreamingException.message ??
              "Live Tail session failed",
          );
        if (chunk.sessionStart) {
          session = chunk.sessionStart.sessionId ?? session;
          emit({
            requestId: request.requestId,
            state: "running",
            liveState: "streaming",
            sampled: false,
          });
        }
        if (chunk.sessionUpdate) {
          const results = chunk.sessionUpdate.sessionResults ?? [];
          const events = results.map((event) => ({
            id: `${session}:${sequence++}`,
            timestamp: event.timestamp ?? Date.now(),
            ingestionTime: event.ingestionTime,
            message: event.message ?? "",
            logGroup: nameFromIdentifier(event.logGroupIdentifier ?? ""),
            logStream: event.logStreamName ?? "",
          }));
          const sampled = chunk.sessionUpdate.sessionMetadata?.sampled ?? false;
          // The service sends an update about every second; skip empty ones
          // that change nothing, so idle live views do not re-render.
          if (!events.length && announced && sampled === lastSampled) continue;
          announced = true;
          lastSampled = sampled;
          emit({
            requestId: request.requestId,
            state: "running",
            events,
            replace: false,
            liveState: "streaming",
            sampled,
            truncated: false,
          });
        }
      }
      emit({ requestId: request.requestId, state: "complete" });
    } finally {
      streamController.abort();
      if (iterator.return) {
        try {
          await withAbort(iterator.return(), AbortSignal.timeout(1000));
        } catch {
          /* The request abort signal closes the transport even if the iterator cannot finish promptly. */
        }
      }
    }
  } finally {
    streamController.abort();
  }
}
