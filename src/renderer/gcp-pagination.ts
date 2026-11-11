import type { Page } from "../shared/contracts";

/** Scan names across pages so filtering does not miss unloaded results. */
export async function collectGcpPages<T>(
  load: (cursor?: string) => Promise<Page<T>>,
  update: (items: T[]) => void,
  key: (item: T) => string,
  signal?: AbortSignal,
): Promise<void> {
  const items = new Map<string, T>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    if (signal?.aborted) return;
    const result = await load(cursor);
    if (signal?.aborted) return;
    for (const item of result.items) items.set(key(item), item);
    update([...items.values()]);
    if (!result.cursor) return;
    if (seen.has(result.cursor))
      throw new Error("Google returned a repeated continuation token.");
    seen.add(result.cursor);
    cursor = result.cursor;
  }
  throw new Error(
    "The list exceeded 100 pages. Narrow the project scope and retry.",
  );
}
