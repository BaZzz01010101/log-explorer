import type {
  Connection,
  LogGroup,
  LogStream,
  Page,
  QueryRequest,
  QueryUpdate,
} from "../shared/contracts";
import { createAwsAdapter } from "./aws-adapter";
import { Semaphore, throwIfAborted } from "./async";
import type { LogAdapter } from "./log-adapter";
import { createLiveCatchUp } from "./live-catch-up";
import { runMergedLive } from "./live-merge";
import { createMultiSourceEvents, scopedQueries } from "./multi-source-events";
import { createOfflineAdapter } from "./offline-adapter";
import { scopedEventId } from "../shared/event-id";
import { querySchema } from "./security";

// Release builds define this as false, so the fixture adapter is dropped from the bundle.
const fixturesBuild =
  typeof __VERIFICATION_BUILD__ === "undefined" || __VERIFICATION_BUILD__;
function offlineFixtures(): LogAdapter {
  if (!fixturesBuild)
    throw new Error("Offline fixtures are not available in this build.");
  return createOfflineAdapter();
}
import { createGcpAdapter } from "./gcp-adapter";

export interface LogServiceOptions {
  allowAws: () => boolean;
  awsAdapterFactory?: (connection: Connection) => LogAdapter;
  offlineAdapterFactory?: () => LogAdapter;
  gcpAdapterFactory?: (connection: Connection) => LogAdapter;
  allowGcp?: () => boolean;
  allowOffline?: () => boolean;
}
interface Job {
  controller: AbortController;
  done: Promise<void>;
  terminal: boolean;
  cancelled: boolean;
  cancellation?: Promise<void>;
  /** Publishes events a merged Live view still holds back. */
  flush?: () => void;
}
interface MetadataCache {
  expires: number;
  value: unknown;
}

function errorMessage(error: unknown, provider?: Connection["mode"]): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  // AWS SDK exception names only; Google errors already carry readable text.
  if (provider === "gcp")
    return error instanceof Error ? error.message : "Google Cloud operation failed";
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
  // Defense in depth for persisted legacy Insights requests.
  if ((request.kind as string) !== "events")
    throw new Error("Only Events queries are supported");
  // Field bounds come from the IPC schema, the single source of truth; the
  // checks below are the cross-field rules the schema cannot express.
  const parsed = querySchema.safeParse(request);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "The query request is invalid",
    );
  if (
    new Set(
      request.sources.map((source) =>
        JSON.stringify([
          source.connectionId ?? request.connection.id,
          source.logGroup,
          source.gcp ?? null,
        ]),
      ),
    ).size !== request.sources.length
  )
    throw new Error("Each log group can appear only once in a query");
  const scoped = scopedQueries(request);
  if (scoped.some((query) => query.sources.some((source) => (query.connection.mode === "gcp") !== !!source.gcp)))
    throw new Error("A source does not match its cloud connection.");
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
  const cache = new Map<string, MetadataCache>();
  const pending = new Map<string, Promise<unknown>>();
  const metadataControllers = new Set<AbortController>();
  const querySlots = new Semaphore(4);
  const liveSlots = new Semaphore(2);
  const metadataSlots = new Semaphore(4);
  let stopping = false;
  function gate(connection: Connection) {
    if (stopping) throw new Error("Log connections are closing; retry shortly");
    if (connection.mode === "offline" && options.allowOffline && !options.allowOffline())
      throw new Error("Offline fixtures are not available in this build.");
    if (connection.mode === "aws" && !options.allowAws())
      throw new Error(
        "AWS access is disabled. It is available in the packaged application and npm run dev, not in test runs.",
      );
    if (connection.mode === "gcp" && options.allowGcp && !options.allowGcp())
      throw new Error("Google Cloud access is disabled in verification mode.");
  }
  function connectionKey(connection: Connection): string {
    return JSON.stringify([
      connection.id,
      connection.mode,
      connection.profile,
      connection.region,
      connection.gcpIdentity,
    ]);
  }
  function adapterFor(connection: Connection): LogAdapter {
    gate(connection);
    const key = connectionKey(connection);
    let adapter = adapters.get(key);
    if (adapter) {
      // Keep Map order as least-recently-used first.
      adapters.delete(key);
      adapters.set(key, adapter);
    } else {
      if (adapters.size >= 32) {
        const [oldestKey, oldest] = adapters.entries().next().value!;
        adapters.delete(oldestKey);
        try {
          oldest.destroy();
        } catch {
          /* A failed release must not block the connection being opened. */
        }
      }
      adapter =
        connection.mode === "gcp"
          ? (options.gcpAdapterFactory?.(connection) ?? createGcpAdapter(connection))
          : connection.mode === "aws"
          ? (options.awsAdapterFactory?.(connection) ??
            createAwsAdapter(connection, { allowAws: options.allowAws }))
          : (options.offlineAdapterFactory?.() ?? offlineFixtures());
      adapters.set(key, adapter);
    }
    return adapter;
  }
  const multiSourceEvents = createMultiSourceEvents(adapterFor);
  /**
   * Shared path for every cloud metadata/discovery read: 60 s cache, request
   * de-duplication, the metadata concurrency limit, a timeout, and cancellation
   * on shutdown.
   */
  async function limited<T>(
    key: string,
    check: () => void,
    operation: (signal: AbortSignal) => Promise<T>,
    options: { fresh?: boolean; timeout?: number; provider?: Connection["mode"] } = {},
  ): Promise<T> {
    check();
    // An explicit refresh bypasses the cache; an in-flight request is still shared.
    if (options.fresh) cache.delete(key);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now())
      return structuredClone(cached.value) as T;
    const existing = pending.get(key);
    if (existing) return structuredClone(await existing) as T;
    const controller = new AbortController();
    metadataControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), options.timeout ?? 30000);
    const task = (async () => {
      const release = await metadataSlots.acquire(controller.signal);
      try {
        check();
        const value = await operation(controller.signal);
        throwIfAborted(controller.signal);
        check();
        if (cache.size >= 150) cache.delete(cache.keys().next().value!);
        cache.set(key, {
          value: structuredClone(value),
          expires: Date.now() + 60000,
        });
        return value;
      } catch (error) {
        throw new Error(errorMessage(error, options.provider));
      } finally {
        release();
      }
    })().finally(() => {
      clearTimeout(timer);
      metadataControllers.delete(controller);
      pending.delete(key);
    });
    pending.set(key, task);
    return structuredClone(await task) as T;
  }
  function metadata<T extends LogGroup | LogStream>(
    connection: Connection,
    key: string,
    operation: (adapter: LogAdapter, signal: AbortSignal) => Promise<Page<T>>,
    fresh = false,
  ): Promise<Page<T>> {
    return limited(
      key,
      () => gate(connection),
      (signal) => operation(adapterFor(connection), signal),
      { fresh, provider: connection.mode },
    );
  }
  async function cancel(requestId: string): Promise<void> {
    const job = jobs.get(requestId);
    if (!job) return;
    if (job.cancellation) return job.cancellation;
    if (!job.terminal && !job.cancelled) {
      job.flush?.();
      job.cancelled = true;
      job.controller.abort();
      job.terminal = true;
      // Events and Live jobs hold no server-side state, so any error after
      // cancellation is treated as part of the cancellation.
      job.cancellation = job.done.then(() => {
        emit({ requestId, state: "cancelled" });
      });
      return job.cancellation;
    }
    await job.done;
  }
  async function schedule(request: QueryRequest, live: boolean): Promise<void> {
    validateQuery(request, live);
    for (const query of scopedQueries(request)) gate(query.connection);
    await cancel(request.requestId);
    // Above the 100-view workspace budget; extra jobs wait on the query slots.
    if (jobs.size >= 128)
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
      const stopCatchUp = new AbortController();
      try {
        release = await (live ? liveSlots : querySlots).acquire(
          job.controller.signal,
        );
        throwIfAborted(job.controller.signal);
        for (const query of scopedQueries(input)) gate(query.connection);
        update({ requestId: input.requestId, state: "running" });
        const queries = scopedQueries(input);
        // Every multi-source history query uses the k-way merge, so pages from
        // different groups interleave chronologically instead of per batch.
        if (!live && input.sources.length > 1) {
          update(await multiSourceEvents.events(input, job.controller.signal, update));
        } else {
          const scoped = (query: QueryRequest, value: QueryUpdate) => ({
            ...value,
            events: value.events?.map((event) => ({
              ...event,
              connectionId: query.connection.id,
              id: scopedEventId(query.connection.id, event.id),
            })),
          });
          const query = queries[0];
          const adapter = adapterFor(query.connection);
          const { catchUp } = input;
          const historySignal = AbortSignal.any([
            job.controller.signal,
            stopCatchUp.signal,
          ]);
          const missed =
            live && catchUp
              ? createLiveCatchUp({
                  requestId: input.requestId,
                  ...catchUp,
                  load: async (range, cursor) => {
                    const slot = await querySlots.acquire(historySignal);
                    try {
                      for (const item of queries) gate(item.connection);
                      return await multiSourceEvents.events(
                        {
                          ...input,
                          ...range,
                          direction: "older",
                          limit: Math.min(1000, input.limit),
                          cursor,
                        },
                        historySignal,
                      );
                    } finally {
                      slot();
                    }
                  },
                  errorMessage: (error) =>
                    errorMessage(error, input.connection.mode),
                  emit: update,
                })
              : undefined;
          const publishLive = missed
            ? (value: QueryUpdate) => update(missed.track(value))
            : update;
          const waiting = new Set(queries.map((item) => item.connection.id));
          const connected = (id: string) => {
            if (waiting.delete(id) && !waiting.size) missed?.connected();
          };
          void missed?.run(historySignal);
          if (!live)
            update(
              scoped(query, await adapter.events(query, job.controller.signal)),
            );
          else if (queries.length === 1)
            await adapter.live(query, job.controller.signal, (value) => {
              if (value.liveState === "streaming")
                connected(query.connection.id);
              publishLive(scoped(query, value));
            });
          else
            await runMergedLive(
              input.requestId,
              queries.map((item) => ({
                connectionId: item.connection.id,
                name: item.connection.name,
                run: async (signal, publish) =>
                  adapterFor(item.connection)
                    .live(item, signal, (value) => {
                      if (value.liveState === "streaming")
                        connected(item.connection.id);
                      publish(scoped(item, value));
                    })
                    .finally(() => connected(item.connection.id)),
                errorMessage: (error) =>
                  errorMessage(error, item.connection.mode),
              })),
              job.controller.signal,
              publishLive,
              (flush) => {
                job.flush = flush;
              },
            );
        }
        if (!job.terminal)
          update({ requestId: input.requestId, state: "complete" });
      } catch (error) {
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
            ...(aborted ? {} : { error: errorMessage(error, input.connection.mode) }),
          });
        }
      } finally {
        stopCatchUp.abort();
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
      fresh?: boolean,
    ): Promise<Page<LogGroup>> {
      const key = JSON.stringify([
        connectionKey(connection),
        "groups",
        prefix,
        cursor,
      ]);
      return metadata(connection, key, (adapter, signal) =>
        adapter.listGroups(prefix, cursor, signal),
        fresh,
      );
    },
    listStreams(
      connection: Connection,
      group: string,
      prefix: string,
      cursor?: string,
      fresh?: boolean,
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
        fresh,
      );
    },
    clearDiscovery(): void {
      for (const key of cache.keys())
        if (key.startsWith('["gcp-discovery"')) cache.delete(key);
    },
    /** Google Cloud discovery through the same limits, cache and shutdown path. */
    discover<T>(
      key: string,
      operation: (signal: AbortSignal) => Promise<T>,
      settings: { fresh?: boolean; timeout?: number } = {},
    ): Promise<T> {
      return limited(
        JSON.stringify(["gcp-discovery", key]),
        () => {
          if (stopping)
            throw new Error("Log connections are closing; retry shortly");
          if (options.allowGcp && !options.allowGcp())
            throw new Error("Google Cloud access is disabled in this build.");
        },
        operation,
        { ...settings, provider: "gcp" },
      );
    },
    query: (request: QueryRequest) => schedule(request, false),
    live: (request: QueryRequest) => schedule(request, true),
    cancel,
    async shutdown(): Promise<void> {
      stopping = true;
      try {
        for (const controller of metadataControllers) controller.abort();
        await Promise.allSettled([...jobs.keys()].map(cancel));
        await Promise.allSettled([...pending.values()]);
        const failures: unknown[] = [];
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
            `Could not finish all log operation cleanup.\n${failures.map((failure) => errorMessage(failure)).join("\n")}`,
          );
      } finally {
        stopping = false;
      }
    },
  };
}
