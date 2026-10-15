import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { createLogService } from "./log-service";
import {
  AwsAccessGate,
  connectionSchema,
  querySchema,
  workspaceSchema,
} from "./security";
import { WorkspaceStore } from "./persistence";
import { createCloseCoordinator } from "./close-coordinator";
import { parseWorkspaceInput } from "./workspace-input";

// No AWS environment variables, shared profiles or tokens are inspected at startup.
if (process.env.EXPLORER_TEST_USER_DATA)
  app.setPath("userData", process.env.EXPLORER_TEST_USER_DATA);
app.setAppUserModelId("dev.awslogexplorer.desktop");
const backgroundVerification = process.argv.includes(
  "--background-verification",
);
const canEnableAws =
  app.isPackaged &&
  !process.argv.includes("--offline-verification") &&
  !backgroundVerification;
const gate = new AwsAccessGate(canEnableAws);
let window: BrowserWindow | null = null;
let quitting = false;
let allowWindowClose = false;
let closeToken = "";
let acknowledgeClose: ((success: boolean) => void) | null = null;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
const store = new WorkspaceStore(app.getPath("userData"), parseWorkspaceInput);
const service = createLogService(
  (update) => {
    if (window && !window.isDestroyed())
      window.webContents.send("explorer:update", update);
  },
  { allowAws: () => gate.enabled },
);
const environment = () => ({
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
  awsEnabled: gate.enabled,
  canEnableAws,
});
const rendererFile = join(__dirname, "../renderer/index.html");
const developmentUrl = !app.isPackaged
  ? process.env.ELECTRON_RENDERER_URL
  : undefined;

function trusted(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Untrusted renderer");
  const url = event.senderFrame?.url;
  if (
    developmentUrl
      ? url !== developmentUrl && url !== `${developmentUrl}/`
      : url !== pathToFileURL(rendererFile).href
  )
    throw new Error("Untrusted renderer URL");
}
ipcMain.on("explorer:close-ready", (event, token, success) => {
  try {
    trusted(event);
    if (token === closeToken && typeof success === "boolean")
      acknowledgeClose?.(success);
  } catch {
    /* Ignore acknowledgements from other frames. */
  }
});

function flushRenderer(): Promise<void> {
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isLoadingMainFrame()
  )
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      acknowledgeClose = null;
      reject(new Error("The renderer did not finish saving its workspace."));
    }, 5000);
    closeToken = randomUUID();
    acknowledgeClose = (success) => {
      clearTimeout(timer);
      acknowledgeClose = null;
      if (success) resolve();
      else reject(new Error("The latest workspace could not be saved."));
    };
    window!.webContents.send("explorer:prepare-close", closeToken);
  });
}
const closeCoordinator = createCloseCoordinator(
  {
    save: flushRenderer,
    flush: () => store.flush(),
    shutdown: () => service.shutdown(),
    confirmDiscard: async (error) => {
      if (!window || window.isDestroyed()) return true;
      const choice = await dialog.showMessageBox(window, {
        type: "error",
        title: "Workspace save failed",
        message:
          error instanceof Error ? error.message : "Workspace save failed",
        detail: "Your previous saved workspace remains available.",
        buttons: ["Keep working", "Close without saving"],
        defaultId: 0,
        cancelId: 0,
      });
      return choice.response === 1;
    },
    confirmShutdownFailure: async (error) => {
      if (!window || window.isDestroyed()) return true;
      const choice = await dialog.showMessageBox(window, {
        type: "warning",
        title: "Query cleanup failed",
        message: "A CloudWatch query could not be stopped",
        detail:
          (error instanceof Error ? error.message : String(error)) +
          "\nThe query may continue running in AWS. Closing the application does not confirm that it has stopped.",
        buttons: ["Keep working", "Close anyway"],
        defaultId: 0,
        cancelId: 0,
      });
      return choice.response === 1;
    },
    quit: () => {
      allowWindowClose = true;
      quitting = true;
      app.quit();
    },
    closeWindow: () => {
      allowWindowClose = true;
      window?.close();
    },
  },
  process.platform !== "darwin",
);

function finishClose(exit: boolean): Promise<void> {
  return closeCoordinator.request(exit);
}
function handle(channel: string, operation: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    trusted(event);
    return operation(...args);
  });
}
const boundedString = z.string().max(512);
const cursorSchema = z.string().max(100000).optional();
handle("explorer:environment", environment);
handle("explorer:enable-aws", async (enabled) => {
  const requested = z.boolean().parse(enabled);
  if (!requested) {
    try {
      await service.shutdown();
    } finally {
      gate.setEnabled(false);
    }
  } else gate.setEnabled(true);
  return environment();
});
handle("explorer:profiles", async () => {
  if (!gate.enabled) return [];
  // This is reached only after deliberate authorization in a packaged application.
  const { loadSharedConfigFiles } =
    await import("@smithy/shared-ini-file-loader");
  const { configFile, credentialsFile } = await loadSharedConfigFiles();
  return [
    ...new Set([...Object.keys(configFile), ...Object.keys(credentialsFile)]),
  ].sort();
});
handle("explorer:groups", (connection, prefix, cursor) =>
  service.listGroups(
    connectionSchema.parse(connection),
    boundedString.parse(prefix),
    cursorSchema.parse(cursor),
  ),
);
handle("explorer:streams", (connection, group, prefix, cursor) =>
  service.listStreams(
    connectionSchema.parse(connection),
    boundedString.parse(group),
    boundedString.parse(prefix),
    cursorSchema.parse(cursor),
  ),
);
handle("explorer:query", (request) =>
  service.query(querySchema.parse(request)),
);
handle("explorer:live", (request) => service.live(querySchema.parse(request)));
handle("explorer:cancel", (id) =>
  service.cancel(z.string().min(1).max(160).parse(id)),
);
handle("explorer:load", () => store.load());
handle("explorer:save", (workspace) =>
  store.save(workspaceSchema.parse(workspace)),
);
handle("explorer:copy", (text) =>
  clipboard.writeText(z.string().max(50_000_000).parse(text)),
);
handle("explorer:export", async (content, extension) => {
  const data = z.string().max(50_000_000).parse(content);
  const ext = z.enum(["json", "csv", "jsonl"]).parse(extension);
  if (!window) return false;
  const choice = await dialog.showSaveDialog(window, {
    title: "Export loaded data",
    defaultPath: `logs-${new Date().toISOString().slice(0, 10)}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (choice.canceled || !choice.filePath) return false;
  await writeFile(choice.filePath, data, { encoding: "utf8", mode: 0o600 });
  return true;
});

function createWindow(): void {
  allowWindowClose = false;
  window = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 860,
    minHeight: 580,
    title: "AWS Log Explorer",
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(__dirname, "../../build/icon.png"),
    backgroundColor: "#10141c",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling:
        !backgroundVerification &&
        (app.isPackaged || !process.env.EXPLORER_TEST_USER_DATA),
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.once("ready-to-show", () => {
    if (!backgroundVerification) window?.show();
  });
  window.on("close", (event) => {
    if (!allowWindowClose && !quitting) {
      event.preventDefault();
      void finishClose(false);
    }
  });
  window.on("closed", () => {
    window = null;
    if (!allowWindowClose)
      void service.shutdown().catch((error) => {
        console.error(
          "Query cleanup after unexpected window closure failed",
          error,
        );
      });
  });
  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(rendererFile);
}

void app.whenReady().then(() => {
  if (!primaryInstance) return;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
      { label: "File", submenu: [{ role: "close" }] },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
          ...(!app.isPackaged ? [{ role: "toggleDevTools" as const }] : []),
        ],
      },
      { role: "windowMenu" },
    ]),
  );
  createWindow();
  app.on("activate", () => {
    if (!window) createWindow();
  });
});
app.on("second-instance", () => {
  if (backgroundVerification) return;
  window?.show();
  window?.focus();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  void finishClose(true);
});
