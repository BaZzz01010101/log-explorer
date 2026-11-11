import { Entry, v2, type protos } from "@google-cloud/logging";
import { OAuth2Client } from "google-auth-library";
import { Root } from "protobufjs";
import auditDescriptor from "./gcp-audit-proto.json";
import type { Connection, LogEvent, LogSource } from "../shared/contracts";
import { gcloudAuth } from "./gcloud-auth";
import { gcpSourceFilter, normalizeGcpEntry } from "./gcp-log-query";

type RpcEntry = protos.google.logging.v2.ILogEntry;
// Generated from google/cloud/audit/audit_log.proto (googleapis, Apache-2.0).
const auditType = Root.fromJSON(auditDescriptor).lookupType("google.cloud.audit.AuditLog");

function plainStruct(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainStruct);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length === 1 && object.fields && typeof object.fields === "object")
    return Object.fromEntries(Object.entries(object.fields as Record<string, unknown>).map(([key, entry]) => [key, plainValue(entry)]));
  return Object.fromEntries(Object.entries(object).map(([key, entry]) => [key, plainStruct(entry)]));
}
function plainValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  if ("nullValue" in item) return null;
  for (const key of ["stringValue", "numberValue", "boolValue"]) if (key in item) return item[key];
  if ("structValue" in item) return plainStruct(item.structValue);
  if ("listValue" in item) return ((item.listValue as { values?: unknown[] })?.values ?? []).map(plainValue);
  return plainStruct(value);
}

export function normalizeGcpRpcEntry(raw: RpcEntry, group: string): LogEvent {
  const timestamp = raw.timestamp;
  if (!timestamp || timestamp.seconds == null) throw new Error("Google Cloud returned a live entry without a timestamp.");
  const nanos = Number(timestamp.nanos ?? 0);
  const iso = new Date(Number(timestamp.seconds) * 1000).toISOString().slice(0, 19);
  const digits = String(nanos).padStart(9, "0");
  const fraction = nanos === 0 ? "" : nanos % 1_000_000 === 0 ? digits.slice(0, 3) : nanos % 1_000 === 0 ? digits.slice(0, 6) : digits;
  const decoded = Entry.fromApiResponse_({ ...raw } as protos.google.logging.v2.LogEntry);
  let payload = decoded.data;
  const any = raw.protoPayload as unknown as { type_url?: string; typeUrl?: string; value?: Uint8Array } | undefined;
  const type = any?.type_url ?? any?.typeUrl;
  if (type === "type.googleapis.com/google.cloud.audit.AuditLog" && any?.value) {
    const audit = auditType.toObject(auditType.decode(any.value), { longs: String, enums: String, bytes: String });
    payload = { "@type": type, ...(plainStruct(audit) as Record<string, unknown>) };
  }
  const entry = { ...raw, timestamp: `${iso}${fraction ? `.${fraction}` : ""}Z`, jsonPayload: typeof payload === "object" && payload !== null ? payload : undefined, textPayload: typeof payload === "string" ? payload : undefined };
  return normalizeGcpEntry(entry, group);
}

function matchesSource(source: LogSource, raw: RpcEntry): boolean {
  const gcp = source.gcp;
  const labels = raw.resource?.labels ?? {};
  if (!gcp) return false;
  if (gcp.kind === "function") return gcp.generation === "v2"
    ? raw.resource?.type === "cloud_run_revision" && labels.service_name === (gcp.service || gcp.functionName) && labels.location === gcp.region
    : raw.resource?.type === "cloud_function" && labels.function_name === gcp.functionName && labels.region === gcp.region;
  return raw.resource?.type === "k8s_container" && labels.location === gcp.region && labels.cluster_name === gcp.cluster && labels.namespace_name === gcp.namespace && labels.container_name === gcp.container && (!source.logStreams?.length || source.logStreams.includes(labels.pod_name));
}

export async function streamGcpProject(connection: Connection, sources: LogSource[], filter: string, signal: AbortSignal, emit: (events: LogEvent[], suppressed: boolean) => void): Promise<void> {
  const identity = connection.gcpIdentity;
  if (!identity || !sources[0]?.gcp) throw new Error("Google Cloud account or source is not configured.");
  const authClient = new OAuth2Client();
  authClient.refreshHandler = async () => ({ access_token: await gcloudAuth.token(identity), expiry_date: Date.now() + 240000 });
  const client = new v2.LoggingServiceV2Client({ projectId: sources[0].gcp.project, authClient });
  const conditions = sources.map((source) => {
    const pod = source.gcp?.kind === "kubernetes" && source.logStreams?.length ? ` AND (${source.logStreams.map((name) => `resource.labels.pod_name=${JSON.stringify(name)}`).join(" OR ")})` : "";
    return `(${gcpSourceFilter(source.gcp!)}${pod})`;
  }).join(" OR ");
  const stream = client.tailLogEntries(identity.quotaProject ? { otherArgs: { headers: { "x-goog-user-project": identity.quotaProject } } } : undefined);
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      stream.cancel();
      void client.close();
      if (error && !signal.aborted) reject(error); else resolve();
    };
    const abort = () => finish();
    signal.addEventListener("abort", abort, { once: true });
    stream.on("error", (error: Error) => finish(error));
    stream.on("end", () => finish(signal.aborted ? undefined : new Error("Google Cloud live stream ended.")));
    stream.on("data", (response: protos.google.logging.v2.ITailLogEntriesResponse) => {
      try {
        const events: LogEvent[] = [];
        for (const raw of response.entries ?? []) {
          const source = sources.find((item) => matchesSource(item, raw));
          if (source) events.push({ ...normalizeGcpRpcEntry(raw, source.logGroup), gcpSource: source.gcp });
        }
        emit(events, Boolean(response.suppressionInfo?.some((item) => Number(item.suppressedCount) > 0)));
      } catch (error) { finish(error instanceof Error ? error : new Error("Could not decode a live log entry.")); }
    });
    if (signal.aborted) { abort(); return; }
    stream.write({ resourceNames: [`projects/${sources[0].gcp!.project}`], filter: `(${conditions})${filter ? ` AND (${filter})` : ""}` });
  });
}
