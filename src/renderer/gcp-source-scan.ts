import type { ExplorerApi, GcpIdentity, GcpSource } from "../shared/contracts";

type Api = Pick<
  ExplorerApi,
  "gcpFunctions" | "gcpContexts" | "gcpClusters" | "gcpWorkloads"
>;

export async function discoverGcpSources(
  api: Api,
  identity: GcpIdentity,
  project: string,
  update: (items: GcpSource[]) => void,
  signal?: AbortSignal,
): Promise<{ items: GcpSource[]; warnings: string[] }> {
  const sources = new Map<string, GcpSource>();
  const warnings: string[] = [];
  const push = (items: GcpSource[]) => {
    if (signal?.aborted) return;
    for (const item of items) sources.set(item.name, item);
    update(
      [...sources.values()].sort(
        (a, b) =>
          a.label.localeCompare(b.label) || a.name.localeCompare(b.name),
      ),
    );
  };
  const error = (name: string, failure: unknown) => {
    if (!signal?.aborted)
      warnings.push(
        `${name}: ${failure instanceof Error ? failure.message : String(failure)}`,
      );
  };
  const functions = async (generation: "v1" | "v2") => {
    try {
      let cursor: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < 100; page++) {
        if (signal?.aborted) return;
        const result = await api.gcpFunctions(
          identity,
          project,
          generation,
          cursor,
        );
        if (signal?.aborted) return;
        push(result.items);
        if (result.warnings) warnings.push(...result.warnings);
        if (!result.cursor) return;
        if (seen.has(result.cursor))
          throw new Error("Repeated continuation token.");
        seen.add(result.cursor);
        cursor = result.cursor;
      }
      throw new Error("More than 100 pages; results may be incomplete.");
    } catch (failure) {
      error(`Functions ${generation}`, failure);
    }
  };
  const kubernetes = async () => {
    try {
      const [contexts, clusters] = await Promise.all([
        api.gcpContexts(identity, project),
        api.gcpClusters(identity, project).catch((failure) => {
          error("GKE cluster list", failure);
          return undefined;
        }),
      ]);
      if (clusters) {
        const missing = clusters.filter(
          (cluster) =>
            !contexts.some(
              (context) =>
                context.cluster === cluster.cluster &&
                context.location === cluster.location,
            ),
        );
        if (missing.length && !signal?.aborted)
          warnings.push(
            `No configured Kubernetes context for: ${missing.map((item) => `${item.cluster} (${item.location})`).join(", ")}.`,
          );
      } else if (!contexts.length && !signal?.aborted)
        warnings.push("No configured GKE contexts found for this project.");
      let next = 0;
      const worker = async () => {
        while (!signal?.aborted) {
          const context = contexts[next++];
          if (!context) return;
          try {
            const result = await api.gcpWorkloads(
              identity,
              project,
              context.name,
            );
            push(result.items);
            if (result.warnings && !signal?.aborted)
              warnings.push(
                ...result.warnings.map(
                  (warning) => `Cluster ${context.cluster}: ${warning}`,
                ),
              );
          } catch (failure) {
            error(`Cluster ${context.cluster}`, failure);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(3, contexts.length) }, worker),
      );
    } catch (failure) {
      error("Kubernetes", failure);
    }
  };
  await Promise.all([functions("v1"), functions("v2"), kubernetes()]);
  return {
    items: [...sources.values()].sort(
      (a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name),
    ),
    warnings,
  };
}
