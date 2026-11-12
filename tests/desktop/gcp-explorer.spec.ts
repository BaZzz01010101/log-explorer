import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import { createWorkspace } from "../../src/renderer/workspace";

for (const theme of ["light", "dark"] as const)
  test(`${theme}: browses GCP source pages without disturbing AWS explorer`, async () => {
    const root = resolve(".tmp/gcp-explorer-desktop");
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "case-"));
    const workspace = createWorkspace();
    workspace.preferences.theme = theme;
    await writeFile(
      join(directory, "workspace.json"),
      JSON.stringify(workspace),
    );
    const env: Record<string, string> = {};
    for (const key of [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "COMSPEC",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    Object.assign(env, {
      EXPLORER_TEST_USER_DATA: directory,
      USERPROFILE: directory,
      APPDATA: directory,
      LOCALAPPDATA: directory,
      AWS_EC2_METADATA_DISABLED: "true",
    });
    const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
    const app = await electron.launch({
      executablePath: packaged ? desktopExecutablePath() : undefined,
      args: [
        ...(packaged ? [] : [process.cwd()]),
        "--offline-verification",
        "--background-verification",
        "--disable-background-networking",
      ],
      env,
    });
    try {
      await app.evaluate(({ ipcMain }) => {
        const testState = globalThis as typeof globalThis & { __gcpQueryCursors?: boolean[]; __gcpScanCount?: number };
        testState.__gcpQueryCursors = [];
        testState.__gcpScanCount = 0;
        ipcMain.removeHandler("gcp:projects");
        ipcMain.removeHandler("gcp:logs");
        ipcMain.removeHandler("gcp:functions");
        ipcMain.removeHandler("gcp:contexts");
        ipcMain.removeHandler("gcp:clusters");
        ipcMain.removeHandler("gcp:workloads");
        ipcMain.removeHandler("gcp:signin");
        ipcMain.removeHandler("gcp:profiles");
        ipcMain.removeHandler("explorer:query");
        ipcMain.handle("explorer:query", async (event, request) => {
          if (request.connection.mode !== "gcp") return;
          testState.__gcpQueryCursors!.push(Boolean(request.cursor));
          const events = Array.from({ length: request.cursor ? 1 : 101 }, (_, index) => ({ id: `${request.cursor ? "next" : "first"}-${index}`, timestamp: 2000 + index, message: '{"message":"Google event loaded"}', severity: "ERROR", logGroup: request.sources[0].logGroup, logStream: "example", connectionId: request.connection.id }));
          setTimeout(() => event.sender.send("explorer:update", { requestId: request.requestId, state: "complete", replace: !request.cursor, cursor: request.cursor ? undefined : "next-page", events }), 20);
        });
        ipcMain.handle("gcp:profiles", async () => ({
          configurations: [
            {
              name: "work",
              active: true,
              account: "user@example.com",
              project: "demo-123",
            },
            { name: "other", active: false, account: "second@example.com" },
          ],
          accounts: ["user@example.com", "second@example.com"],
        }));
        let signInAttempts = 0;
        ipcMain.handle("gcp:signin", async () => {
          if (signInAttempts++ === 0)
            throw new Error(
              "Google sign-in was cancelled or failed. Please try again.",
            );
        });
        ipcMain.handle("gcp:projects", async (_event, identity, cursor) => {
          if (
            identity.configuration === "other" &&
            identity.account === "user@example.com"
          )
            return { items: [{ id: "other-123", name: "Other project" }] };
          if (
            identity.configuration !== "work" ||
            identity.account !== "user@example.com" ||
            identity.quotaProject !== undefined
          )
            throw new Error("Wrong identity");
          return cursor
            ? { items: [{ id: "other-123", name: "Other" }] }
            : { items: [{ id: "demo-123", name: "Demo" }], cursor: "next" };
        });
        ipcMain.handle(
          "gcp:logs",
          async (_event, identity, project, cursor) => {
            if (
              identity.configuration !== "work" ||
              identity.account !== "user@example.com"
            )
              throw new Error("Wrong identity");
            if (project === "denied-123") throw new Error("Permission denied");
            return cursor
              ? {
                  items: [
                    {
                      name: `projects/${project}/logs/later`,
                      label: "Later match",
                    },
                  ],
                }
              : {
                  items: [
                    {
                      name: `projects/${project}/logs/first`,
                      label: "First log",
                    },
                  ],
                  cursor: "next",
                };
          },
        );
        ipcMain.handle(
          "gcp:functions",
          async (_event, identity, project, generation, cursor) => {
            testState.__gcpScanCount!++;
            if (
              identity.configuration !== "work" ||
              identity.account !== "user@example.com"
            )
              throw new Error("Wrong identity");
            if (project === "denied-123") throw new Error("Permission denied");
            if (generation === "v2") return { items: [] };
            return cursor
              ? {
                  items: [
                    {
                      name: "function:later",
                      label: "/gcp/functions/later",
                      kind: "function",
                      generation: "v1",
                      project,
                      region: "eu-west2",
                    },
                  ],
                }
              : {
                  items: [
                    {
                      name: "function:first",
                      label: "/gcp/functions/first",
                      kind: "function",
                      generation: "v1",
                      project,
                      region: "eu-west2",
                    },
                  ],
                  cursor: "next",
                };
          },
        );
        ipcMain.handle("gcp:contexts", async (_event, _identity, project) =>
          project === "denied-123"
            ? []
            : [{ name: "ctx", cluster: "dev", location: "eu-west2" }],
        );
        ipcMain.handle("gcp:clusters", async (_event, _identity, project) =>
          project === "denied-123"
            ? []
            : [{ cluster: "dev", location: "eu-west2" }],
        );
        ipcMain.handle("gcp:workloads", async (_event, _identity, project) => ({
          items: [
            {
              name: "k8s:worker",
              label: "/gcp/kubernetes/worker/dev",
              kind: "kubernetes",
              project,
              region: "eu-west2",
              cluster: "dev",
              namespace: "default",
              container: "worker",
              workloads: ["worker"],
            },
          ],
        }));
      });
      const page = await app.firstWindow();
      await (
        await page.context().newCDPSession(page)
      ).send("Emulation.setFocusEmulationEnabled", { enabled: true });
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
      ).toBe(false);
      await page
        .getByRole("button", { name: "Google Cloud logs explorer" })
        .click();
      const explorer = page.getByRole("complementary", {
        name: "Google Cloud resources",
      });
      await expect(
        explorer.getByText("Select a project to browse sources."),
      ).toBeVisible();
      await expect(
        explorer.getByLabel("Google Cloud configuration"),
      ).toHaveValue("work");
      await expect(
        explorer.getByLabel("Google Cloud account", { exact: true }),
      ).toHaveValue("user@example.com");
      await explorer.getByRole("button", { name: "Sign in" }).click();
      await expect(explorer.getByRole("alert").last()).toContainText(
        "cancelled or failed",
      );
      await explorer.getByRole("button", { name: "Sign in" }).click();
      await explorer
        .getByLabel("Google Cloud project", { exact: true })
        .click();
      await page.getByRole("option", { name: "Demo (demo-123)" }).click();
      await expect(
        explorer.getByRole("option", { name: "/gcp/functions/later" }),
      ).toBeVisible();
      await expect(
        explorer.getByRole("option", { name: "/gcp/kubernetes/worker/dev" }),
      ).toBeVisible();
      await expect(explorer.getByLabel("Source type")).toHaveCount(0);
      await explorer.getByLabel("Search GCP sources").fill("later");
      await expect(
        explorer.getByRole("option", { name: "/gcp/functions/first" }),
      ).toHaveCount(0);
      await explorer
        .getByRole("option", { name: "/gcp/functions/later" })
        .click();
      await expect(page.getByText("Google event loaded", { exact: false }).first()).toBeVisible();
      const before = await app.evaluate(() => ({ scans: (globalThis as typeof globalThis & { __gcpScanCount?: number }).__gcpScanCount!, queries: (globalThis as typeof globalThis & { __gcpQueryCursors?: boolean[] }).__gcpQueryCursors!.length }));
      await explorer.getByRole("button", { name: "Sign in" }).click();
      await expect(explorer.getByText("Signed in. Refresh requested.")).toBeVisible();
      await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __gcpScanCount?: number }).__gcpScanCount!)).toBeGreaterThan(before.scans);
      await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __gcpQueryCursors?: boolean[] }).__gcpQueryCursors!.length)).toBeGreaterThan(before.queries);
      await expect(explorer.getByLabel("Favorite views")).toBeVisible();
      await page.getByRole("tab", { selected: true }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Save view to Favorites" }).click();
      await expect(explorer.locator(".saved-view-favorite")).toHaveCount(1);
      await expect(page.getByRole("combobox", { name: "Google Cloud log type" })).toHaveCount(0);
      await explorer.getByLabel("Search GCP sources").fill("");
      await explorer.getByRole("option", { name: "/gcp/kubernetes/worker/dev" }).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Add to current tab" }).click();
      await expect(page.getByRole("group", { name: "Log sources" })).toContainText("2 Sources");
      await expect(page.getByText("Google event loaded", { exact: false }).first()).toBeVisible();
      await explorer.getByLabel("Search GCP sources").fill("later");
      await expect(
        explorer.getByText("/gcp/functions/later", { exact: true }).last(),
      ).toBeVisible();
      await page.getByRole("button", { name: "AWS logs explorer" }).click();
      await expect(
        page.getByRole("complementary", { name: "AWS resources" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Google Cloud logs explorer" })
        .click();
      await expect(
        explorer.getByRole("option", { name: "/gcp/functions/later" }),
      ).toBeVisible();
      await expect(page.locator(".desktop-app")).toHaveAttribute(
        "data-theme",
        theme,
      );
      await explorer.getByLabel("Search GCP sources").fill("LATER");
      await explorer.getByLabel("Search GCP sources").press("Alt+c");
      await expect(
        explorer.getByRole("button", { name: "Match case" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        explorer.getByRole("option", { name: "/gcp/functions/later" }),
      ).toHaveCount(0);
      await explorer.getByLabel("Google Cloud configuration").click();
      await page.getByRole("option", { name: "other", exact: true }).click();
      await expect(
        explorer.getByLabel("Google Cloud account", { exact: true }),
      ).toHaveValue("user@example.com");
      await explorer
        .getByLabel("Google Cloud project", { exact: true })
        .click();
      await expect(
        page.getByRole("option", { name: "Other project (other-123)" }),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });
