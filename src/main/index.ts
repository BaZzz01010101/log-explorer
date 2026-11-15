import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { COPY_TEXT_LIMIT } from "../shared/event-copy";
import type { Workspace, WorkspaceLoad } from "../shared/contracts";
import {
  WINDOW_CHROME_COLORS,
  WINDOW_CHROME_HEIGHT,
} from "../shared/window-chrome";
import { createLogService } from "./log-service";
import { createGoogleRequest, gcpExplorer } from "./gcp-explorer";
import { gcloudAuth } from "./gcloud-auth";
import { createSourceDiscovery, runKubectl } from "./gcp-sources";
import {
  cancelGoogleLogin,
  createGcpSignIn,
  launchGoogleLogin,
} from "./gcp-signin";
import { connectionSchema, querySchema, workspaceSchema } from "./security";
import { AwsAccessPreference } from "./aws-access-preference";
import { setAwsAccess } from "./aws-access-toggle";
import { WorkspaceStore } from "./persistence";
import { createCloseCoordinator } from "./close-coordinator";
import { parseWorkspaceInput } from "./workspace-input";
import { setFixturesAvailable } from "../renderer/workspace";
import {
  loadWindowState,
  restoreWindowBounds,
  saveWindowState,
} from "./window-state";

// Verification switches exist only in development and in builds made with
// `--mode verification`; release builds ignore and strip them.
const verificationSwitches =
  !app.isPackaged ||
  (typeof __VERIFICATION_BUILD__ !== "undefined" && __VERIFICATION_BUILD__);
// Saved workspaces lose their offline fixture connections in release builds.
setFixturesAvailable(verificationSwitches);
if (!verificationSwitches) {
  delete process.env.EXPLORER_TEST_USER_DATA;
  delete process.env.EXPLORER_TEST_QUERY_DELAY_MS;
}
// Isolate verification storage before reading local application preferences.
if (process.env.EXPLORER_TEST_USER_DATA)
  app.setPath("userData", process.env.EXPLORER_TEST_USER_DATA);
app.setAppUserModelId("dev.awslogexplorer.desktop");
const backgroundVerification =
  verificationSwitches && process.argv.includes("--background-verification");
const offlineVerification =
  verificationSwitches && process.argv.includes("--offline-verification");
// Like AWS, development and unpackaged builds never reach Google Cloud.
const canUseGcp =
  app.isPackaged && !offlineVerification && !backgroundVerification;
const canEnableAws =
  app.isPackaged &&
  !offlineVerification &&
  !backgroundVerification;
const gate = new AwsAccessPreference(
  canEnableAws,
  join(app.getPath("userData"), "access-settings.json"),
);
// With offline fixtures removed, the packaged app always uses AWS; development
// and verification builds still never reach it.
if (canEnableAws && !gate.enabled) gate.setEnabled(true);
let window: BrowserWindow | null = null;
let quitting = false;
let allowWindowClose = false;
let closeToken = "";
let acknowledgeClose: ((success: boolean) => void) | null = null;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
const store = new WorkspaceStore(app.getPath("userData"), parseWorkspaceInput);
let startupWorkspace: WorkspaceLoad | undefined;
let windowTheme: Workspace["preferences"]["theme"] = "dark";
const service = createLogService(
  (update) => {
    if (window && !window.isDestroyed())
      window.webContents.send("explorer:update", update);
  },
  { allowAws: () => gate.enabled, allowGcp: () => canUseGcp, allowOffline: () => verificationSwitches },
);
const environment = () => ({
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
  awsEnabled: gate.enabled,
  canEnableAws,
  fixtures: verificationSwitches,
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
        title: "Shutdown cleanup failed",
        message: "Some log connections could not be closed cleanly",
        detail: error instanceof Error ? error.message : String(error),
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
function allowGcpDiscovery() {
  if (!canUseGcp)
    throw new Error(
      app.isPackaged
        ? "Google Cloud access is disabled in verification mode."
        : "Google Cloud access is available only in the packaged application.",
    );
}
const signInToGoogle = createGcpSignIn(launchGoogleLogin, () => gcloudAuth.clearTokens());
const gcpIdentity = z.object({
  configuration: z.string().min(1).max(256),
  account: z.string().min(1).max(256),
  quotaProject: z.string().min(1).max(256).optional(),
});
handle("gcp:profiles", () => {
  allowGcpDiscovery();
  return gcloudAuth.profiles();
});
handle("gcp:signin", () => {
  allowGcpDiscovery();
  return signInToGoogle();
});
handle("gcp:install-cli", () => {
  allowGcpDiscovery();
  return shell.openExternal("https://cloud.google.com/sdk/docs/install");
});
// Discovery runs through the log service: cache, concurrency limit, timeout
// and cancellation on shutdown, like AWS resource listing.
const discover = <T>(
  parts: unknown[],
  operation: (signal: AbortSignal) => Promise<T>,
  timeout?: number,
) => service.discover(JSON.stringify(parts), operation, { timeout });
handle("gcp:refresh", () => service.clearDiscovery());
handle("gcp:projects", (identity, cursor) => {
  allowGcpDiscovery();
  const selected = gcpIdentity.parse(identity);
  const page = cursorSchema.parse(cursor);
  return discover(["projects", selected, page], (signal) =>
    gcpExplorer(selected, signal).projects(page),
  );
});
handle("gcp:logs", (identity, project, cursor) => {
  allowGcpDiscovery();
  const selected = gcpIdentity.parse(identity);
  const id = z.string().max(30).parse(project);
  const page = cursorSchema.parse(cursor);
  return discover(["logs", selected, id, page], (signal) =>
    gcpExplorer(selected, signal).logs(id, page),
  );
});
const sourceRequest = createGoogleRequest(gcloudAuth);
const gcpSourceDiscovery = (
  identity: z.infer<typeof gcpIdentity>,
  signal: AbortSignal,
) =>
  createSourceDiscovery(
    (options) => sourceRequest({ ...options, signal }, identity),
    (args, selected) => runKubectl(args, selected, signal),
  );
handle("gcp:functions", (identity, project, generation, cursor) => {
  allowGcpDiscovery();
  const selected = gcpIdentity.parse(identity);
  const id = z.string().max(30).parse(project);
  const kind = z.enum(["v1", "v2"]).parse(generation);
  const page = cursorSchema.parse(cursor);
  return discover(["functions", selected, id, kind, page], (signal) =>
    gcpSourceDiscovery(selected, signal).functions(id, kind, page),
  );
});
handle("gcp:contexts", (identity, project) => {
  allowGcpDiscovery();
  const selected = gcpIdentity.parse(identity);
  const id = z.string().max(30).parse(project);
  return discover(
    ["contexts", selected, id],
    (signal) => gcpSourceDiscovery(selected, signal).contexts(id, selected),
    70000,
  );
});
handle("gcp:clusters", (identity, project) => {
  allowGcpDiscovery();
  const selected = gcpIdentity.parse(identity);
  const id = z.string().max(30).parse(project);
  return discover(["clusters", selected, id], (signal) =>
    gcpSourceDiscovery(selected, signal).clusters(id),
  );
});
handle("gcp:workloads", (identity, project, context) => {
  allowGcpDiscovery();
  const selected = gcpIdentity.parse(identity);
  const id = z.string().max(30).parse(project);
  const name = z.string().max(256).parse(context);
  return discover(
    ["workloads", selected, id, name],
    (signal) => gcpSourceDiscovery(selected, signal).workloads(id, name, selected),
    70000,
  );
});
handle("explorer:environment", environment);
handle("explorer:window-theme", (theme) => {
  const mode = z.enum(["light", "dark"]).parse(theme);
  windowTheme = mode;
  window?.setBackgroundColor(WINDOW_CHROME_COLORS[mode].color);
  if (process.platform === "win32" || process.platform === "linux")
    window?.setTitleBarOverlay({
      ...WINDOW_CHROME_COLORS[mode],
      height: WINDOW_CHROME_HEIGHT,
    });
});
handle("explorer:window-action", (input) => {
  const action = z
    .enum(["close", "toggle-fullscreen", "zoom-in", "zoom-out", "reset-zoom"])
    .parse(input);
  if (!window || window.isDestroyed()) return;
  switch (action) {
    case "close":
      window.close();
      break;
    case "toggle-fullscreen":
      window.setFullScreen(!window.isFullScreen());
      break;
    case "reset-zoom":
      window.webContents.setZoomLevel(0);
      break;
    case "zoom-in":
      window.webContents.setZoomLevel(
        Math.min(3, window.webContents.getZoomLevel() + 1),
      );
      break;
    case "zoom-out":
      window.webContents.setZoomLevel(
        Math.max(-3, window.webContents.getZoomLevel() - 1),
      );
      break;
  }
});
handle("explorer:enable-aws", async (enabled) => {
  const requested = z.boolean().parse(enabled);
  await setAwsAccess(gate, requested, () => service.shutdown());
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
handle("explorer:groups", (connection, prefix, cursor, fresh) =>
  service.listGroups(
    connectionSchema.parse(connection),
    boundedString.parse(prefix),
    cursorSchema.parse(cursor),
    z.boolean().optional().parse(fresh),
  ),
);
handle("explorer:streams", (connection, group, prefix, cursor, fresh) =>
  service.listStreams(
    connectionSchema.parse(connection),
    boundedString.parse(group),
    boundedString.parse(prefix),
    cursorSchema.parse(cursor),
    z.boolean().optional().parse(fresh),
  ),
);
handle("explorer:query", (request) =>
  service.query(querySchema.parse(request)),
);
handle("explorer:live", (request) => service.live(querySchema.parse(request)));
handle("explorer:cancel", (id) =>
  service.cancel(z.string().min(1).max(160).parse(id)),
);
handle("explorer:load", () => {
  const loaded = startupWorkspace;
  startupWorkspace = undefined;
  return loaded ?? store.load();
});
handle("explorer:save", (workspace) =>
  store.save(workspaceSchema.parse(workspace)),
);
handle("explorer:copy", (text) =>
  clipboard.writeText(z.string().max(COPY_TEXT_LIMIT).parse(text)),
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
  const statePath = join(app.getPath("userData"), "window-state.json");
  const savedState = loadWindowState(statePath);
  const bounds = savedState
    ? restoreWindowBounds(
        savedState.bounds,
        screen.getAllDisplays().map((display) => display.workArea),
      )
    : { width: 1500, height: 980 };
  window = new BrowserWindow({
    ...bounds,
    minWidth: 860,
    minHeight: 580,
    title: "AWS Log Explorer",
    ...(process.platform === "win32" || process.platform === "linux"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            ...WINDOW_CHROME_COLORS[windowTheme],
            height: WINDOW_CHROME_HEIGHT,
          },
        }
      : {}),
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.png")
      : join(__dirname, "../../build/icon.png"),
    backgroundColor: WINDOW_CHROME_COLORS[windowTheme].color,
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
  // Hidden title bars can add a DIP during native/physical-pixel conversion.
  // Correct the measured error before showing the window so it cannot accrue
  // across restarts. Bound retries for dimensions the OS cannot represent.
  if (savedState && "x" in bounds) {
    let requested = { ...bounds };
    for (let attempt = 0; attempt < 3; attempt++) {
      window.setBounds(requested);
      const actual = window.getBounds();
      if (
        (["x", "y", "width", "height"] as const).every(
          (key) => actual[key] === bounds[key],
        )
      )
        break;
      requested = {
        x: requested.x + bounds.x - actual.x,
        y: requested.y + bounds.y - actual.y,
        width: Math.max(860, requested.width + bounds.width - actual.width),
        height: Math.max(580, requested.height + bounds.height - actual.height),
      };
    }
  }
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.once("ready-to-show", () => {
    if (!backgroundVerification) {
      if (savedState?.maximized) window?.maximize();
      window?.show();
    }
  });
  const currentWindow = window;
  // A crashed renderer cannot answer the close handshake or own its jobs.
  let reloadRequested = false;
  currentWindow.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    void service
      .shutdown()
      .catch((error) => console.error("Cleanup after renderer crash", error))
      .then(async () => {
        if (currentWindow.isDestroyed()) return;
        if (reloadRequested || backgroundVerification) {
          reloadRequested = false;
          currentWindow.webContents.reload();
          return;
        }
        const choice = await dialog.showMessageBox(currentWindow, {
          type: "error",
          title: "Window stopped",
          message: "The application window stopped unexpectedly",
          detail: `Reason: ${details.reason}. Reloading restores the last saved workspace.`,
          buttons: ["Reload", "Close"],
          defaultId: 0,
          cancelId: 0,
        });
        if (currentWindow.isDestroyed()) return;
        if (choice.response === 0) currentWindow.webContents.reload();
        else {
          allowWindowClose = true;
          currentWindow.close();
        }
      });
  });
  currentWindow.on("unresponsive", () => {
    if (backgroundVerification) return;
    void dialog
      .showMessageBox(currentWindow, {
        type: "warning",
        title: "Window not responding",
        message: "The application window is not responding",
        detail: "Wait for it to recover, or reload the last saved workspace.",
        buttons: ["Wait", "Reload"],
        defaultId: 0,
        cancelId: 0,
      })
      .then((choice) => {
        if (choice.response === 1 && !currentWindow.isDestroyed()) {
          reloadRequested = true;
          currentWindow.webContents.forcefullyCrashRenderer();
        }
      });
  });
  let stateTimer: ReturnType<typeof setTimeout> | undefined;
  const persistState = () => {
    clearTimeout(stateTimer);
    if (currentWindow.isDestroyed() || currentWindow.isMinimized()) return;
    saveWindowState(statePath, {
      bounds: currentWindow.getNormalBounds(),
      maximized: currentWindow.isMaximized(),
    });
  };
  const scheduleState = () => {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(persistState, 250);
  };
  currentWindow.on("move", scheduleState);
  currentWindow.on("resize", scheduleState);
  currentWindow.on("maximize", persistState);
  currentWindow.on("unmaximize", persistState);
  window.on("close", (event) => {
    persistState();
    if (!allowWindowClose && !quitting) {
      event.preventDefault();
      void finishClose(false);
    }
  });
  window.on("closed", () => {
    clearTimeout(stateTimer);
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

void app.whenReady().then(async () => {
  if (!primaryInstance) return;
  Menu.setApplicationMenu(null);
  // Use the validated/recovered workspace before the first native paint. The
  // renderer consumes this same result once, preserving any recovery warning.
  startupWorkspace = await store.load();
  windowTheme =
    (startupWorkspace.workspace as Workspace | null)?.preferences.theme ??
    "dark";
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
app.on("will-quit", cancelGoogleLogin);
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  void finishClose(true);
});
