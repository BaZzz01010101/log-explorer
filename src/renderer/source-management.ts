import type { LogSource } from "../shared/contracts";
import { z } from "zod";

export const RESOURCE_MIME = "application/x-aws-log-explorer-resource";
const source = z.object({
  logGroup: z.string().min(1).max(512),
  logStreams: z.array(z.string().min(1).max(512)).min(1).max(100).optional(),
});
const payload = z.object({
  connectionId: z.string().min(1).max(100),
  sources: z.array(source).min(1).max(50),
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
): LogSource[] {
  const groups = new Map<string, LogSource>();
  for (const item of [...current, ...added]) {
    if (!source.safeParse(item).success)
      throw new Error("Enter a valid group and stream name.");
    const existing = groups.get(item.logGroup);
    if (!existing)
      groups.set(item.logGroup, {
        ...item,
        ...(item.logStreams
          ? { logStreams: [...new Set(item.logStreams)] }
          : {}),
      });
    else if (!existing.logStreams?.length || !item.logStreams?.length)
      groups.set(item.logGroup, { logGroup: item.logGroup });
    else {
      const streams = [
        ...new Set([...existing.logStreams, ...item.logStreams]),
      ];
      if (streams.length > 100)
        throw new Error("A group can select at most 100 streams.");
      groups.set(item.logGroup, {
        logGroup: item.logGroup,
        logStreams: streams,
      });
    }
  }
  if (groups.size > 50)
    throw new Error("A tab can include at most 50 log groups.");
  return [...groups.values()];
}
