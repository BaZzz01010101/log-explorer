import type { GcpSource, LogSource } from "../shared/contracts";

export function gcpResourceToLogSource(source: GcpSource): LogSource {
  const base = { project: source.project, region: source.region };
  if (source.kind === "function") {
    const functionName = source.label.split("/").at(-1);
    if (!functionName || !source.generation) throw new Error("This cached function has incomplete metadata. Refresh the source list.");
    return { logGroup: source.label, gcp: { ...base, kind: "function", functionName, generation: source.generation, ...(source.service ? { service: source.service } : {}) } };
  }
  if (!source.cluster || !source.namespace || !source.container) throw new Error("This cached container has incomplete metadata. Refresh the source list.");
  return { logGroup: source.label, gcp: { ...base, kind: "kubernetes", cluster: source.cluster, namespace: source.namespace, container: source.container } };
}
