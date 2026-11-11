import { spawn } from "node:child_process";
import type { GcpIdentity, GcpProfiles } from "../shared/contracts";
import { googleLoginCommand } from "./gcp-signin";

type Runner = (args: string[]) => Promise<string>;
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.length <= 256 && value ? value : undefined;

export function createGcloudAuth(run: Runner) {
  const tokens = new Map<string, { value: string; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  const keyFor = (identity: GcpIdentity) => JSON.stringify([identity.configuration, identity.account]);
  return {
    async profiles(): Promise<GcpProfiles> {
      const [configs, accounts] = await Promise.all([
        run(["config", "configurations", "list", "--format=json", "--quiet"]),
        run(["auth", "list", "--format=json", "--quiet"]),
      ]);
      const configsJson: unknown = JSON.parse(configs);
      const accountsJson: unknown = JSON.parse(accounts);
      if (!Array.isArray(configsJson) || !Array.isArray(accountsJson))
        throw new Error("Could not read Google Cloud configurations.");
      return {
        configurations: configsJson.map(obj).flatMap((entry) => {
          const name = str(entry.name);
          if (!name) return [];
          const properties = obj(entry.properties),
            core = obj(properties.core),
            billing = obj(properties.billing);
          return [
            {
              name,
              active: entry.is_active === true,
              ...(str(core.account) ? { account: str(core.account) } : {}),
              ...(str(core.project) ? { project: str(core.project) } : {}),
              ...(str(billing.quota_project)
                ? { quotaProject: str(billing.quota_project) }
                : {}),
            },
          ];
        }),
        accounts: [
          ...new Set(
            accountsJson
              .map(obj)
              .map((entry) => str(entry.account))
              .filter((value): value is string => !!value),
          ),
        ],
      };
    },
    async token(identity: GcpIdentity): Promise<string> {
      const key = keyFor(identity);
      const cached = tokens.get(key);
      if (cached && cached.expires > Date.now()) return cached.value;
      const existing = pending.get(key);
      if (existing) return existing;
      const request = (async () => { try {
        const value = (
          await run([
            "auth",
            "print-access-token",
            `--configuration=${identity.configuration}`,
            `--account=${identity.account}`,
            "--quiet",
          ])
        ).trim();
        if (!value || /\s/.test(value) || value.length > 16384)
          throw new Error("Invalid token");
        if (tokens.size >= 64 && !tokens.has(key)) tokens.delete(tokens.keys().next().value!);
        tokens.set(key, { value, expires: Date.now() + 5 * 60000 });
        return value;
      } catch {
        throw new Error(
          "Could not obtain a Google Cloud access token. Check the selected account and sign in again if needed.",
        );
      } })();
      pending.set(key, request);
      try { return await request; } finally { if (pending.get(key) === request) pending.delete(key); }
    },
    invalidateToken(identity: GcpIdentity, expected?: string): void {
      const key = keyFor(identity);
      if (expected === undefined || tokens.get(key)?.value === expected) tokens.delete(key);
    },
  };
}

export function runGcloud(args: string[]): Promise<string> {
  const command = googleLoginCommand(
    process.platform,
    process.env,
    undefined,
    args,
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(command.root ? { CLOUDSDK_ROOT_DIR: command.root } : {}),
  };
  delete env.PYTHONHOME;
  delete env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  delete env.CLOUDSDK_AUTH_ACCESS_TOKEN_FILE;
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Google Cloud CLI timed out."));
    }, 30000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (part: string) => {
      output += part;
      if (output.length > 1_000_000) {
        child.kill();
        reject(new Error("Google Cloud CLI returned too much data."));
      }
    });
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Could not start Google Cloud CLI."));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else
        reject(
          new Error(
            "Google Cloud CLI failed. Check your account and configuration.",
          ),
        );
    });
  });
}

export const gcloudAuth = createGcloudAuth(runGcloud);
