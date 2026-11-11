import type {
  GcpIdentity,
  GcpLog,
  GcpProject,
  Page,
} from "../shared/contracts";
import { gcloudAuth } from "./gcloud-auth";

type Request = (options: {
  url: string;
  params: Record<string, string | number>;
  timeout: number;
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
  getToken: (identity: GcpIdentity) => Promise<string>,
  transport: typeof fetch = fetch,
) {
  return async (
    options: Parameters<Request>[0],
    identity: GcpIdentity,
  ): Promise<{ data: unknown }> => {
    const token = await getToken(identity);
    const url = new URL(options.url);
    for (const [key, value] of Object.entries(options.params))
      url.searchParams.set(key, String(value));
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (identity.quotaProject)
      headers["X-Goog-User-Project"] = identity.quotaProject;
    const response = await transport(url, {
      headers,
      signal: AbortSignal.timeout(options.timeout),
      redirect: "error",
    });
    if (!response.ok) {
      if (response.status === 401)
        throw new Error(
          "Google Cloud credentials expired. Sign in again and retry.",
        );
      if (response.status === 403)
        throw new Error(
          "Google Cloud denied access. Check project permissions, API enablement and the configuration's quota project.",
        );
      throw new Error(`Google Cloud request failed (HTTP ${response.status}).`);
    }
    return { data: await response.json() };
  };
}
const googleRequest = createGoogleRequest(gcloudAuth.token);
export const gcpExplorer = (identity: GcpIdentity) =>
  createGcpExplorer((options) => googleRequest(options, identity));
