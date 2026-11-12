import { createHash } from "node:crypto";
import type { GcpLogSource, LogEvent } from "../shared/contracts";

const quote = (value: string) => JSON.stringify(value);
const field = (name: string, value: string | undefined) => {
  if (!value) throw new Error(`Missing Google Cloud source ${name}.`);
  return `${name}=${quote(value)}`;
};

export function gcpSourceFilter(source: GcpLogSource): string {
  const project = /^\d+$/.test(source.project) ? [] : [field("resource.labels.project_id", source.project)];
  if (source.kind === "function") {
    if (source.generation === "v2") return [
      'resource.type="cloud_run_revision"',
      field("resource.labels.service_name", source.service || source.functionName),
      field("resource.labels.location", source.region),
      ...project,
    ].join(" AND ");
    return [
      'resource.type="cloud_function"',
      field("resource.labels.function_name", source.functionName),
      field("resource.labels.region", source.region),
      ...project,
    ].join(" AND ");
  }
  return [
    'resource.type="k8s_container"',
    field("resource.labels.location", source.region),
    field("resource.labels.cluster_name", source.cluster),
    field("resource.labels.namespace_name", source.namespace),
    field("resource.labels.container_name", source.container),
    ...project,
  ].join(" AND ");
}

export function normalizeGcpEntry(value: unknown, logGroup: string): LogEvent {
  const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const resource = entry.resource && typeof entry.resource === "object" ? entry.resource as Record<string, unknown> : {};
  const labels = resource.labels && typeof resource.labels === "object" ? resource.labels as Record<string, unknown> : {};
  const rawTimestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
  const timestamp = Date.parse(rawTimestamp);
  const fraction = rawTimestamp.match(/\.(\d+)(?:Z|[+-])/i)?.[1] ?? "";
  const timestampSubMillis = Number(fraction.padEnd(9, "0").slice(3, 9));
  if (!Number.isFinite(timestamp)) throw new Error("Google Cloud returned a log entry without a valid timestamp.");
  const payload = entry.jsonPayload ?? entry.textPayload ?? entry.protoPayload ?? "";
  const message = typeof payload === "string" ? payload : JSON.stringify(payload);
  const logName = typeof entry.logName === "string" ? entry.logName : "";
  const insertId = typeof entry.insertId === "string" ? entry.insertId : "";
  const stableResource = Object.fromEntries(Object.entries(resource).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, key === "labels" ? Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))) : item]));
  const id = createHash("sha256").update(JSON.stringify([logName, rawTimestamp, insertId, stableResource, insertId ? "" : message])).digest("hex");
  const received = typeof entry.receiveTimestamp === "string" ? Date.parse(entry.receiveTimestamp) : NaN;
  return { id, timestamp, ...(timestampSubMillis ? { timestampSubMillis } : {}), ...(Number.isFinite(received) ? { ingestionTime: received } : {}), message, logGroup, logStream: typeof labels.pod_name === "string" ? labels.pod_name : logName, ...(typeof entry.severity === "string" ? { severity: entry.severity } : {}) };
}
