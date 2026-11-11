import { spawn } from "node:child_process";
import type {
  GcpContext,
  GcpIdentity,
  GcpSource,
  GcpSourcePage,
} from "../shared/contracts";

type Request = (options: {
  url: string;
  params: Record<string, string | number>;
  timeout: number;
}) => Promise<{ data: unknown }>;
type Kubectl = (args: string[], identity: GcpIdentity) => Promise<string>;
const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" ? (value as Record<string, any>) : {};
const projectPattern = /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{1,30})$/;
const validPart = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(value) &&
  value.length <= 253;

function contextInfo(project: string, name: string): GcpContext | undefined {
  if (!projectPattern.test(project) || !name.startsWith(`gke_${project}_`))
    return;
  const parts = name.slice(`gke_${project}_`.length).split("_");
  if (parts.length !== 2 || !validPart(parts[0]) || !validPart(parts[1]))
    return;
  return { name, location: parts[0], cluster: parts[1] };
}

export function createSourceDiscovery(request: Request, kubectl: Kubectl) {
  return {
    async clusters(
      project: string,
    ): Promise<Array<{ cluster: string; location: string }>> {
      if (!projectPattern.test(project))
        throw new Error("Invalid Google Cloud project.");
      const { data } = await request({
        url: `https://container.googleapis.com/v1/projects/${project}/locations/-/clusters`,
        params: {},
        timeout: 30000,
      });
      const clusters = object(data).clusters;
      return (Array.isArray(clusters) ? clusters : [])
        .map(object)
        .filter((entry) => validPart(entry.name) && validPart(entry.location))
        .map((entry) => ({
          cluster: entry.name as string,
          location: entry.location as string,
        }));
    },
    async functions(
      project: string,
      generation: "v1" | "v2",
      cursor?: string,
    ): Promise<GcpSourcePage> {
      if (!projectPattern.test(project) || !["v1", "v2"].includes(generation))
        throw new Error("Invalid Google Cloud project or function generation.");
      const { data } = await request({
        url: `https://cloudfunctions.googleapis.com/${generation}/projects/${project}/locations/-/functions`,
        params: { pageSize: 100, ...(cursor ? { pageToken: cursor } : {}) },
        timeout: 30000,
      });
      const response = object(data);
      const items: GcpSource[] = [];
      for (const entry of Array.isArray(response.functions)
        ? response.functions
        : []) {
        const name = object(entry).name;
        if (typeof name !== "string") continue;
        const parts =
          /^projects\/([^/]+)\/locations\/([^/]+)\/functions\/([^/]+)$/.exec(
            name,
          );
        if (
          !parts ||
          (parts[1] !== project && !/^\d+$/.test(project)) ||
          !validPart(parts[2]) ||
          !validPart(parts[3])
        )
          continue;
        const rawService = object(object(entry).serviceConfig).service;
        const serviceName = typeof rawService === "string" ? rawService.split("/").at(-1) : undefined;
        items.push({
          name: `function:${project}:${parts[2]}:${parts[3]}`,
          label: `/gcp/functions/${parts[3]}`,
          kind: "function",
          project,
          region: parts[2],
          generation: object(entry).environment === "GEN_1" ? "v1" : generation,
          ...(validPart(serviceName) ? { service: serviceName } : {}),
        });
      }
      return {
        items,
        ...(typeof response.nextPageToken === "string" &&
        response.nextPageToken.length <= 100000
          ? { cursor: response.nextPageToken }
          : {}),
        ...(Array.isArray(response.unreachable) && response.unreachable.length
          ? {
              warnings: [
                `Some function locations could not be reached: ${response.unreachable.filter((x: unknown) => typeof x === "string").join(", ")}`,
              ],
            }
          : {}),
      };
    },
    async contexts(
      project: string,
      identity: GcpIdentity,
    ): Promise<GcpContext[]> {
      if (!projectPattern.test(project))
        throw new Error("Invalid Google Cloud project.");
      const text = await kubectl(
        ["config", "get-contexts", "-o", "name"],
        identity,
      );
      return text
        .split(/\r?\n/)
        .map((name) => contextInfo(project, name.trim()))
        .filter((value): value is GcpContext => !!value);
    },
    async workloads(
      project: string,
      context: string,
      identity: GcpIdentity,
    ): Promise<GcpSourcePage> {
      const info = contextInfo(project, context);
      if (!info)
        throw new Error(
          "Kubernetes context does not belong to the selected project.",
        );
      const kinds = [
        "deployments",
        "statefulsets",
        "daemonsets",
        "jobs",
        "cronjobs",
        "pods",
      ];
      const fetchKinds = async (names: string) => {
        const output = await kubectl(
          [
            "--context",
            info.name,
            "get",
            names,
            "--all-namespaces",
            "--chunk-size=100",
            "--request-timeout=20s",
            "-o",
            "json",
          ],
          identity,
        );
        const data = object(JSON.parse(output));
        if (!Array.isArray(data.items))
          throw new Error("Kubernetes returned an invalid workload list.");
        return data.items as unknown[];
      };
      let entries: unknown[];
      const warnings: string[] = [];
      try {
        entries = await fetchKinds(kinds.join(","));
      } catch {
        entries = [];
        for (const kind of kinds) {
          try {
            entries.push(...(await fetchKinds(kind)));
          } catch (failure) {
            warnings.push(
              `${kind}: ${failure instanceof Error ? failure.message : String(failure)}`,
            );
          }
        }
      }
      const sources = new Map<string, GcpSource>();
      for (const raw of entries) {
        const item = object(raw),
          metadata = object(item.metadata),
          spec = object(item.spec);
        if (!validPart(metadata.namespace)) continue;
        const podSpec =
          item.kind === "Pod"
            ? spec
            : item.kind === "CronJob"
              ? object(object(object(spec.jobTemplate).spec).template).spec
              : object(spec.template).spec;
        const containerSpec = object(podSpec);
        const containers = [
          ...(Array.isArray(containerSpec.containers)
            ? containerSpec.containers
            : []),
          ...(Array.isArray(containerSpec.initContainers)
            ? containerSpec.initContainers
            : []),
        ];
        for (const value of containers) {
          const container = object(value).name;
          if (!validPart(container)) continue;
          const id = [
            "kubernetes",
            project,
            info.location,
            info.cluster,
            metadata.namespace,
            container,
          ].join(":");
          const source = sources.get(id) ?? {
            name: id,
            label: `/gcp/kubernetes/${container}/${info.cluster}`,
            kind: "kubernetes" as const,
            project,
            region: info.location,
            cluster: info.cluster,
            namespace: metadata.namespace,
            container,
            workloads: [],
          };
          if (
            item.kind !== "Pod" &&
            validPart(metadata.name) &&
            !source.workloads!.includes(metadata.name)
          )
            source.workloads!.push(metadata.name);
          sources.set(id, source);
        }
      }
      return {
        items: [...sources.values()],
        ...(warnings.length ? { warnings } : {}),
      };
    },
  };
}

/** Run only fixed kubectl commands, without a shell or mutating kubeconfig. */
export function runKubectl(
  args: string[],
  identity: GcpIdentity,
): Promise<string> {
  const env = {
    ...process.env,
    CLOUDSDK_ACTIVE_CONFIG_NAME: identity.configuration,
    CLOUDSDK_CORE_ACCOUNT: identity.account,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "kubectl.exe" : "kubectl",
      args,
      {
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "",
      errors = "",
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(output);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Kubernetes discovery timed out."));
    }, 60000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (part: string) => {
      output += part;
      if (output.length > 30_000_000) {
        child.kill();
        finish(new Error("Kubernetes workload list is too large."));
      }
    });
    child.stderr.on("data", (part: string) => {
      errors = (errors + part).slice(-2000);
    });
    child.once("error", () =>
      finish(
        new Error(
          "Could not start kubectl. Install it and configure your GKE contexts.",
        ),
      ),
    );
    child.once("close", (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(
              `Kubernetes discovery failed: ${errors.trim() || "kubectl exited with an error."}`,
            ),
      ),
    );
  });
}
