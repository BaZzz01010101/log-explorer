import type {
  Connection,
  LogGroup,
  LogStream,
  Page,
  QueryRequest,
  QueryUpdate,
} from "../shared/contracts";
import {
  createAwsAdapter,
  Semaphore,
  throwIfAborted,
  type LogAdapter,
} from "./aws-adapter";
import { createMultiSourceEvents, scopedQueries } from "./multi-source-events";
import { createOfflineAdapter } from "./offline-adapter";

export interface LogServiceOptions {
  allowAws: () => boolean;
  awsAdapterFactory?: (connection: Connection) => LogAdapter;
  offlineAdapterFactory?: () => LogAdapter;
}
interface Job {
  controller: AbortController;
  done: Promise<void>;
  terminal: boolean;
  cancelled: boolean;
  cancellation?: Promise<void>;
  cleanupError?: string;
}
interface MetadataCache {
  expires: number;
  value: Page<LogGroup> | Page<LogStream>;
}

function errorMessage(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  if (
    /Credentials|Token|SSO|Unauthorized|UnrecognizedClient|ExpiredToken/.test(
      name,
    )
  )
    return "AWS authentication failed. Sign in with AWS CLI SSO or refresh this profile outside the application, then retry.";
  if (/AccessDenied/.test(name))
    return "Permission denied. Verify the selected profile and CloudWatch Logs IAM permissions.";
  if (/Throttl|TooManyRequests/.test(name))
    return "CloudWatch throttled this operation after bounded retries. Narrow the query or wait and retry.";
  if (/ResourceNotFound/.test(name))
    return "The log group or stream no longer exists in this region. Refresh resources and retry.";
  return error instanceof Error
    ? error.message
    : "An unexpected log operation failed";
}

function validateQuery(request: QueryRequest, live: boolean): void {
  if (request.kind !== "events")
    throw new Error("Only Events queries are supported");
  if (!request.requestId || request.requestId.length > 200)
    throw new Error("A bounded request ID is required");
  if (
    !Number.isFinite(request.startTime) ||
    !Number.isFinite(request.endTime) ||
    request.startTime < 0 ||
    request.endTime <= request.startTime
  )
    throw new Error("Choose a valid start and end time");
  if (
    !Number.isInteger(request.limit) ||
    request.limit < 1 ||
    request.limit > 10000
  )
    throw new Error("Result limits must be between 1 and 10000 events");
  if (!request.sources.length || request.sources.length > 50)
    throw new Error("Select between 1 and 50 log groups");
  if (
    new Set(
      request.sources.map((source) =>
        JSON.stringify([
          source.connectionId ?? request.connection.id,
          source.logGroup,
        ]),
      ),
    ).size !== request.sources.length
  )
    throw new Error("Each log group can appear only once in a query");
  if (
    request.sources.some(
      (source) =>
        !source.logGroup ||
        (source.logStreams && source.logStreams.length > 100),
    )
  )
    throw new Error(
      "Choose a valid log group and at most 100 streams per group",
    );
  const scoped = scopedQueries(request);
  if (scoped.length > 1 && live)
    throw new Error(
      "Live Tail requires sources from one connection and region. Use Events for a combined cross-region view.",
    );
  if (live && request.cursor)
    throw new Error("Live monitoring cannot use a historical continuation");
}
export function createLogService(
  emit: (update: QueryUpdate) => void,
  options: LogServiceOptions,
) {
  const adapters = new Map<string, LogAdapter>();
  const jobs = new Map<string, Job>();
  // Cleanup failures remain relevant after their local jobs are removed.
  const cleanupFailures = new Map<string, Error>();
  let additionalCleanupFailures = 0;
  const cache = new Map<string, MetadataCache>();
  const pending = new Map<string, Promise<Page<LogGroup> | Page<LogStream>>>();
  const metadataControllers = new Set<AbortController>();
  const querySlots = new Semaphore(4);
  const liveSlots = new Semaphore(2);
  const metadataSlots = new Semaphore(4);
  let stopping = false;
  function gate(connection: Connection) {
    if (stopping) throw new Error("Log connections are closing; retry shortly");
    if (connection.mode === "aws" && !options.allowAws())
      throw new Error(
        "AWS access is disabled. Enable it explicitly in a packaged application.",
      );
  }
  function connectionKey(connection: Connection): string {
    return JSON.stringify([
      connection.id,
      connection.mode,
      connection.profile,
      connection.region,
    ]);
  }
  function adapterFor(connection: Connection): LogAdapter {
    gate(connection);
    const key = connectionKey(connection);
    let adapter = adapters.get(key);
    if (!adapter) {
      if (adapters.size >= 32)
        throw new Error(
          "Connection limit reached. Close and reopen the workspace to release unused connections.",
        );
      adapter =
        connection.mode === "aws"
          ? (options.awsAdapterFactory?.(connection) ??
            createAwsAdapter(connection, { allowAws: options.allowAws }))
          : (options.offlineAdapterFactory?.() ?? createOfflineAdapter());
      adapters.set(key, adapter);
    }
    return adapter;
  }
  const multiSourceEvents = createMultiSourceEvents(adapterFor);
  async function metadata<T extends LogGroup | LogStream>(
    connection: Connection,
    key: string,
    operation: (adapter: LogAdapter, signal: AbortSignal) => Promise<Page<T>>,
  ): Promise<Page<T>> {
    gate(connection);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now())
      return structuredClone(cached.value) as Page<T>;
    const existing = pending.get(key);
    if (existing) return structuredClone(await existing) as Page<T>;
    const controller = new AbortController();
    metadataControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    const task = (async () => {
      const release = await metadataSlots.acquire(controller.signal);
      try {
        gate(connection);
        const value = await operation(
          adapterFor(connection),
          controller.signal,
        );
        throwIfAborted(controller.signal);
        gate(connection);
        if (cache.size >= 150) cache.delete(cache.keys().next().value!);
        cache.set(key, {
          value: structuredClone(value),
          expires: Date.now() + 60000,
        });
        return value;
      } catch (error) {
        throw new Error(errorMessage(error));
      } finally {
        release();
      }
    })().finally(() => {
      clearTimeout(timer);
      metadataControllers.delete(controller);
      pending.delete(key);
    });
    pending.set(key, task);
    return structuredClone(await task) as Page<T>;
  }
  async function cancel(requestId: string): Promise<void> {
    const job = jobs.get(requestId);
    if (!job) return;
    if (job.cancellation) return job.cancellation;
    if (!job.terminal && !job.cancelled) {
      job.cancelled = true;
      job.controller.abort();
      job.terminal = true;
      job.cancellation = job.done.then(() => {
        emit({
          requestId,
          state: "cancelled",
          ...(job.cleanupError ? { error: job.cleanupError } : {}),
        });
        // The source/tab may already be gone, so its update is not sufficient
        // to report failed cleanup to the cancellation caller.
        if (job.cleanupError) {
          const failure = new Error(job.cleanupError);
          if (cleanupFailures.size < 32 || cleanupFailures.has(requestId))
            cleanupFailures.set(requestId, failure);
          else additionalCleanupFailures++;
          throw failure;
        }
      });
      return job.cancellation;
    }
    await job.done;
  }
  async function schedule(request: QueryRequest, live: boolean): Promise<void> {
    validateQuery(request, live);
    for (const query of scopedQueries(request)) gate(query.connection);
    await cancel(request.requestId);
    if (jobs.size >= 32)
      throw new Error(
        "Too many active operations. Cancel a query or Live Tail session first.",
      );
    const input = structuredClone(request);
    const job: Job = {
      controller: new AbortController(),
      done: Promise.resolve(),
      terminal: false,
      cancelled: false,
    };
    jobs.set(input.requestId, job);
    emit({ requestId: input.requestId, state: "queued" });
    const update = (value: QueryUpdate) => {
      if (
        jobs.get(input.requestId) !== job ||
        job.cancelled ||
        job.controller.signal.aborted ||
        job.terminal
      )
        return;
      if (
        value.state === "complete" ||
        value.state === "error" ||
        value.state === "cancelled"
      )
        job.terminal = true;
      emit(value);
    };
    job.done = (async () => {
      let release: (() => void) | undefined;
      try {
        release = await (live ? liveSlots : querySlots).acquire(
          job.controller.signal,
        );
        throwIfAborted(job.controller.signal);
        for (const query of scopedQueries(input)) gate(query.connection);
        update({ requestId: input.requestId, state: "running" });
        const queries = scopedQueries(input);
        if (queries.length > 1) {
          update(await multiSourceEvents.events(input, job.controller.signal));
        } else {
          const query = queries[0];
          const adapter = adapterFor(query.connection);
          const scopedUpdate = (value: QueryUpdate) =>
            update({
              ...value,
              events: value.events?.map((event) => ({
                ...event,
                connectionId: query.connection.id,
              })),
            });
          if (live)
            await adapter.live(query, job.controller.signal, scopedUpdate);
          else scopedUpdate(await adapter.events(query, job.controller.signal));
        }
        if (!job.terminal)
          update({ requestId: input.requestId, state: "complete" });
      } catch (error) {
        if (
          job.cancelled &&
          error instanceof Error &&
          error.name !== "AbortError"
        )
          job.cleanupError = errorMessage(error);
        if (!job.cancelled && jobs.get(input.requestId) === job) {
          const aborted =
            job.controller.signal.aborted ||
            (error &&
              typeof error === "object" &&
              "name" in error &&
              error.name === "AbortError");
          job.terminal = true;
          emit({
            requestId: input.requestId,
            state: aborted ? "cancelled" : "error",
            ...(aborted ? {} : { error: errorMessage(error) }),
          });
        }
      } finally {
        release?.();
        if (jobs.get(input.requestId) === job) jobs.delete(input.requestId);
      }
    })();
  }
  return {
    listGroups(
      connection: Connection,
      prefix: string,
      cursor?: string,
    ): Promise<Page<LogGroup>> {
      const key = JSON.stringify([
        connectionKey(connection),
        "groups",
        prefix,
        cursor,
      ]);
      return metadata(connection, key, (adapter, signal) =>
        adapter.listGroups(prefix, cursor, signal),
      );
    },
    listStreams(
      connection: Connection,
      group: string,
      prefix: string,
      cursor?: string,
    ): Promise<Page<LogStream>> {
      const key = JSON.stringify([
        connectionKey(connection),
        "streams",
        group,
        prefix,
        cursor,
      ]);
      return metadata(connection, key, (adapter, signal) =>
        adapter.listStreams(group, prefix, cursor, signal),
      );
    },
    query: (request: QueryRequest) => schedule(request, false),
    live: (request: QueryRequest) => schedule(request, true),
    cancel,
    async shutdown(): Promise<void> {
      stopping = true;
      try {
        for (const controller of metadataControllers) controller.abort();
        const cancellations = await Promise.allSettled(
          [...jobs.keys()].map(cancel),
        );
        await Promise.allSettled([...pending.values()]);
        const failures: unknown[] = [...cleanupFailures.values()];
        if (additionalCleanupFailures)
          failures.push(
            new Error(
              `${additionalCleanupFailures} additional operation cleanup failures occurred in this session.`,
            ),
          );
        for (const result of cancellations)
          if (result.status === "rejected" && !failures.includes(result.reason))
            failures.push(result.reason);
        // Release every connection even when earlier cleanup/destruction failed.
        for (const adapter of adapters.values()) {
          try {
            adapter.destroy();
          } catch (error) {
            failures.push(error);
          }
        }
        multiSourceEvents.clear();
        adapters.clear();
        cache.clear();
        if (failures.length)
          throw new AggregateError(
            failures,
            `Could not finish all log operation cleanup.\n${failures.map(errorMessage).join("\n")}`,
          );
      } finally {
        stopping = false;
      }
    },
  };
}
