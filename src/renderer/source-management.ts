import type { LogSource } from "../shared/contracts";
import { z } from "zod";

export const RESOURCE_MIME = "application/x-aws-log-explorer-resource";
const source = z.object({
  connectionId: z.string().min(1).max(160).optional(),
  logGroup: z.string().min(1).max(512),
  logStreams: z.array(z.string().min(1).max(512)).min(1).max(100).optional(),
  gcp: z.object({ kind: z.enum(["function", "kubernetes"]), project: z.string().min(1).max(30), region: z.string().min(1).max(40), functionName: z.string().min(1).max(253).optional(), generation: z.enum(["v1", "v2"]).optional(), service: z.string().min(1).max(253).optional(), cluster: z.string().min(1).max(253).optional(), namespace: z.string().min(1).max(253).optional(), container: z.string().min(1).max(253).optional() }).refine((value) => value.kind === "function" ? !!value.functionName && !!value.generation : !!value.cluster && !!value.namespace && !!value.container).optional(),
});
const payload = z.object({
  connectionId: z.string().min(1).max(160),
  sources: z.array(source).min(1).max(100),
});
export function decodeResourceDrop(
  text: string,
): z.infer<typeof payload> | null {
  if (typeof text !== "string" || text.length > 100_000) return null;
  try {
    const result = payload.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function mergeSources(
  current: LogSource[],
  added: LogSource[],
  defaultConnectionId?: string,
  maxGroups = 50,
): LogSource[] {
  const groups = new Map<string, LogSource>();
  for (const original of [...current, ...added]) {
    const item = { ...original };
    if (item.connectionId === defaultConnectionId) delete item.connectionId;
    if (!source.safeParse(item).success)
      throw new Error("Enter a valid group and stream name.");
    const key = JSON.stringify([item.connectionId ?? "", item.logGroup, item.gcp ?? null]);
    const existing = groups.get(key);
    if (!existing)
      groups.set(key, {
        ...item,
        ...(item.logStreams
          ? { logStreams: [...new Set(item.logStreams)] }
          : {}),
      });
    else if (!existing.logStreams?.length || !item.logStreams?.length)
      groups.set(key, {
        logGroup: item.logGroup,
        ...(item.gcp ? { gcp: item.gcp } : {}),
        ...(item.connectionId ? { connectionId: item.connectionId } : {}),
      });
    else {
      const streams = [
        ...new Set([...existing.logStreams, ...item.logStreams]),
      ];
      if (streams.length > 100)
        throw new Error("A group can select at most 100 streams.");
      groups.set(key, {
        ...item,
        logStreams: streams,
      });
    }
  }
  if (groups.size > maxGroups)
    throw new Error(`A tab can include at most ${maxGroups} log groups.`);
  return [...groups.values()];
}
