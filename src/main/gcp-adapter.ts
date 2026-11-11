import { createHash, randomUUID } from "node:crypto";
import type { Connection, LogEvent, QueryRequest, QueryUpdate } from "../shared/contracts";
import { delay, throwIfAborted, type LogAdapter } from "./aws-adapter";
import { gcloudAuth } from "./gcloud-auth";
import { gcpSourceFilter, normalizeGcpEntry } from "./gcp-log-query";
import { streamGcpProject } from "./gcp-live";
import { waitForGcpRequest } from "./gcp-request-gate";

type Body = { resourceNames: string[]; filter: string; orderBy: string; pageSize: number; pageToken?: string };
type Post = (body: Body, signal: AbortSignal) => Promise<{ entries?: unknown[]; nextPageToken?: string }>;
const quote = (value: string) => JSON.stringify(value);

export function createGcpAdapter(connection: Connection, transport?: Post): LogAdapter {
  const cursors = new Map<string, { token: string; signature: string; expires: number }>();
  const post: Post = transport ?? (async (body, signal) => {
    if (!connection.gcpIdentity) throw new Error("Google Cloud account is not configured.");
    throwIfAborted(signal);
    let token = await gcloudAuth.token(connection.gcpIdentity);
    const send = () => fetch("https://logging.googleapis.com/v2/entries:list", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(connection.gcpIdentity!.quotaProject ? { "X-Goog-User-Project": connection.gcpIdentity!.quotaProject } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), redirect: "error",
    });
    throwIfAborted(signal);
    let response: Response;
    let refreshed = false, retries = 0;
    for (;;) {
      await waitForGcpRequest(body.resourceNames[0], signal);
      response = await send();
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        gcloudAuth.invalidateToken(connection.gcpIdentity, token);
        token = await gcloudAuth.token(connection.gcpIdentity);
        throwIfAborted(signal);
        continue;
      }
      if ((response.status === 429 || response.status === 503) && retries < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await delay(Math.min(30000, Math.max(1000 * 2 ** retries, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0)), signal);
        retries++;
        continue;
      }
      break;
    }
    if (response.status === 401) throw new Error("Google Cloud credentials expired. Sign in again and retry.");
    if (response.status === 403) throw new Error("Google Cloud denied log access. Check logging permissions and the selected account.");
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: { message?: unknown } } | null;
      const message = typeof details?.error?.message === "string" ? details.error.message.slice(0, 500) : "";
      throw new Error(`Google Cloud log query failed (HTTP ${response.status})${message ? `: ${message}` : "."}`);
    }
    return await response.json() as { entries?: unknown[]; nextPageToken?: string };
  });
  async function events(request: QueryRequest, signal: AbortSignal): Promise<QueryUpdate> {
    throwIfAborted(signal);
    if (request.sources.length !== 1 || !request.sources[0].gcp) throw new Error("A single Google Cloud source is required.");
    const source = request.sources[0];
    const signature = createHash("sha256").update(JSON.stringify({ ...request, requestId: undefined, cursor: undefined })).digest("hex");
    for (const [id, cursor] of cursors) if (cursor.expires <= Date.now()) cursors.delete(id);
    const saved = request.cursor ? cursors.get(request.cursor) : undefined;
    if (request.cursor && (!saved || saved.signature !== signature)) throw new Error("Continuation expired or belongs to a different query. Run the query again.");
    const podFilter = source.gcp?.kind === "kubernetes" && source.logStreams?.length ? `(${source.logStreams.map((pod) => `resource.labels.pod_name=${quote(pod)}`).join(" OR ")})` : "";
    const filter = [gcpSourceFilter(source.gcp!), podFilter, `timestamp >= ${quote(new Date(request.startTime).toISOString())}`, `timestamp <= ${quote(new Date(request.endTime).toISOString())}`, request.gcpFilterPattern ? `(${request.gcpFilterPattern})` : ""].filter(Boolean).join(" AND ");
    const started = Date.now();
    let pageToken = saved?.token;
    let data: { entries?: unknown[]; nextPageToken?: string } = {};
    const seen = new Set<string>();
    if (pageToken) seen.add(pageToken);
    for (let page = 0; page < 8; page++) {
      data = await post({ resourceNames: [`projects/${source.gcp!.project}`], filter, orderBy: "timestamp asc", pageSize: request.limit, ...(pageToken ? { pageToken } : {}) }, signal);
      throwIfAborted(signal);
      if (data.nextPageToken && seen.has(data.nextPageToken)) throw new Error("Google Cloud returned a repeated continuation token.");
      if (data.nextPageToken) seen.add(data.nextPageToken);
      if (data.entries?.length || !data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    const events = (Array.isArray(data.entries) ? data.entries : []).map((entry) => ({ ...normalizeGcpEntry(entry, source.logGroup), gcpSource: source.gcp }));
    let cursor: string | undefined;
    if (data.nextPageToken) {
      cursor = request.cursor ?? `gcp:${randomUUID()}`;
      if (cursors.size >= 128) cursors.delete(cursors.keys().next().value!);
      cursors.set(cursor, { token: data.nextPageToken, signature, expires: Date.now() + 15 * 60000 });
    } else if (request.cursor) cursors.delete(request.cursor);
    return { requestId: request.requestId, state: "complete", events, cursor, replace: !request.cursor, stats: { recordsMatched: events.length, elapsedMs: Date.now() - started } };
  }
  return {
    events,
    async live(request, signal, emit) {
      if (!transport) {
        const stop = new AbortController();
        const activeSignal = AbortSignal.any([signal, stop.signal]);
        const recent = new Map<string, number>();
        const publish = (items: LogEvent[], sampled = false) => {
          const fresh = items.filter((event) => {
            if (recent.has(event.id)) return false;
            recent.set(event.id, Date.now());
            if (recent.size > 100000) recent.delete(recent.keys().next().value!);
            return true;
          });
          if (fresh.length || sampled) emit({ requestId: request.requestId, state: "running", liveState: "streaming", events: fresh, ...(sampled ? { sampled: true } : {}) });
        };
        const groups = new Map<string, typeof request.sources>();
        for (const source of request.sources) {
          if (!source.gcp) throw new Error("A Google Cloud source is required.");
          const group = groups.get(source.gcp.project) ?? [];
          group.push(source); groups.set(source.gcp.project, group);
        }
        emit({ requestId: request.requestId, state: "running", liveState: "connecting" });
        try {
          await Promise.all([...groups.values()].map(async (sources) => {
            let since = Date.now() - 30000, failures = 0;
            while (!activeSignal.aborted) {
              let streamFailure: unknown, streamFailureAt = 0;
              const started = Date.now();
              const attempt = new AbortController();
              const attemptSignal = AbortSignal.any([activeSignal, attempt.signal]);
              const stream = streamGcpProject(connection, sources, request.gcpFilterPattern ?? "", attemptSignal, (events, sampled) => { failures = 0; publish(events, sampled); }).catch((error) => { streamFailure = error; streamFailureAt = Date.now(); });
              try {
                await Promise.all(sources.map(async (source) => {
                  let cursor: string | undefined;
                  do {
                    const result = await events({ ...request, sources: [source], startTime: Math.max(0, since), endTime: Math.max(since + 1, started), cursor }, attemptSignal);
                    publish(result.events ?? []);
                    cursor = result.cursor;
                  } while (cursor && !activeSignal.aborted);
                }));
                emit({ requestId: request.requestId, state: "running", liveState: "streaming" });
                await stream;
                if (activeSignal.aborted) return;
                throw streamFailure ?? new Error("Google Cloud live stream ended.");
              } catch (error) {
                if (activeSignal.aborted) return;
                attempt.abort();
                if (typeof error === "object" && error && "code" in error && error.code === 16 && connection.gcpIdentity) gcloudAuth.invalidateToken(connection.gcpIdentity);
                if (++failures >= 3) throw error;
                emit({ requestId: request.requestId, state: "running", liveState: "connecting" });
                since = Math.max(0, (streamFailureAt || Date.now()) - 30000);
                await delay(Math.min(12000, 1000 * 2 ** failures), activeSignal);
              } finally { attempt.abort(); }
            }
          }));
        } finally { stop.abort(); }
        return;
      }
      // Poll with an overlapping window and stable IDs, so events arriving after an empty initial query are included.
      let since = Date.now() - 30000;
      const recent = new Map<string, number>();
      emit({ requestId: request.requestId, state: "running", liveState: "connecting" });
      while (!signal.aborted) {
        const end = Date.now();
        await Promise.all(request.sources.map(async (source) => {
          let cursor: string | undefined;
          do {
            const result = await events({ ...request, sources: [source], startTime: Math.max(0, since), endTime: Math.max(since + 1, end), cursor }, signal);
            const fresh = (result.events ?? []).filter((event) => {
              if (recent.has(event.id)) return false;
              recent.set(event.id, Date.now());
              if (recent.size > 100000) recent.delete(recent.keys().next().value!);
              return true;
            });
            if (fresh.length) emit({ requestId: request.requestId, state: "running", liveState: "streaming", events: fresh });
            cursor = result.cursor;
          } while (cursor && !signal.aborted);
        }));
        emit({ requestId: request.requestId, state: "running", liveState: "streaming" });
        for (const [id, seen] of recent) if (seen < end - 120000) recent.delete(id);
        since = Math.max(0, end - 30000);
        await delay(3000, signal);
      }
    },
    async listGroups() { throw new Error("Use the Google Cloud explorer to select sources."); },
    async listStreams() { throw new Error("Use the Google Cloud explorer to select sources."); },
    destroy() { cursors.clear(); },
  };
}
