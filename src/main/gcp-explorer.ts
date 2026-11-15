import type {
  GcpIdentity,
  GcpLog,
  GcpProject,
  Page,
} from "../shared/contracts";
import { gcloudAuth } from "./gcloud-auth";
import { googleFetch, type GoogleAuth } from "./gcp-http";

type Request = (options: {
  url: string;
  params: Record<string, string | number>;
  timeout: number;
  signal?: AbortSignal;
}) => Promise<{ data: unknown }>;

const projectId = /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{1,30})$/;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const token = (value: unknown) =>
  typeof value === "string" && value.length <= 100000 && value
    ? value
    : undefined;

export function createGcpExplorer(request: Request) {
  return {
    async projects(cursor?: string): Promise<Page<GcpProject>> {
      const { data } = await request({
        url: "https://cloudresourcemanager.googleapis.com/v1/projects",
        params: { pageSize: 100, ...(cursor ? { pageToken: cursor } : {}) },
        timeout: 30000,
      });
      const response = record(data);
      const items = (Array.isArray(response.projects) ? response.projects : [])
        .map(record)
        .filter(
          (project) =>
            typeof project.projectId === "string" &&
            projectId.test(project.projectId) &&
            project.lifecycleState === "ACTIVE",
        )
        .map((project) => ({
          id: project.projectId as string,
          name:
            typeof project.name === "string" && project.name
              ? project.name
              : (project.projectId as string),
        }));
      return {
        items,
        ...(token(response.nextPageToken)
          ? { cursor: token(response.nextPageToken) }
          : {}),
      };
    },
    async logs(project: string, cursor?: string): Promise<Page<GcpLog>> {
      if (!projectId.test(project))
        throw new Error("Enter a valid Google Cloud project ID or number.");
      const { data } = await request({
        url: `https://logging.googleapis.com/v2/projects/${project}/logs`,
        params: { pageSize: 100, ...(cursor ? { pageToken: cursor } : {}) },
        timeout: 30000,
      });
      const response = record(data);
      const prefix = `projects/${project}/logs/`;
      const numericProject = /^\d+$/.test(project);
      const items = (Array.isArray(response.logNames) ? response.logNames : [])
        .filter(
          (name): name is string =>
            typeof name === "string" &&
            (name.startsWith(prefix) ||
              (numericProject && /^projects\/[^/]+\/logs\//.test(name))) &&
            name.length <= 2048,
        )
        .map((name) => {
          const suffix = name.slice(name.indexOf("/logs/") + 6);
          let label = suffix;
          try {
            label = decodeURIComponent(suffix);
          } catch {
            /* Preserve malformed names. */
          }
          return { name, label };
        });
      return {
        items,
        ...(token(response.nextPageToken)
          ? { cursor: token(response.nextPageToken) }
          : {}),
      };
    },
  };
}

export function createGoogleRequest(
  auth: GoogleAuth | GoogleAuth["token"],
  transport: typeof fetch = fetch,
) {
  const client: GoogleAuth = typeof auth === "function" ? { token: auth } : auth;
  return async (
    options: Parameters<Request>[0],
    identity: GcpIdentity,
  ): Promise<{ data: unknown }> => {
    const url = new URL(options.url);
    for (const [key, value] of Object.entries(options.params))
      url.searchParams.set(key, String(value));
    const data = await googleFetch<unknown>(
      client,
      identity,
      {
        url,
        signal: options.signal,
        timeout: options.timeout,
        forbidden:
          "Google Cloud denied access. Check project permissions, API enablement and the configuration's quota project.",
      },
      transport,
    );
    return { data };
  };
}
const googleRequest = createGoogleRequest(gcloudAuth);
export const gcpExplorer = (identity: GcpIdentity, signal?: AbortSignal) =>
  createGcpExplorer((options) => googleRequest({ ...options, signal }, identity));
