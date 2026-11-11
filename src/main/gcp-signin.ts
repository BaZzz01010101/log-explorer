import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface LoginCommand {
  file: string;
  args: string[];
  root?: string;
}
const args = ["auth", "login", "--no-activate", "--quiet"];
let activeLogin: ChildProcess | undefined;
export function cancelGoogleLogin() {
  activeLogin?.kill();
}

/** Execute the SDK's Python entry point directly: no shell or string-built command. */
export function googleLoginCommand(
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  exists: (path: string) => boolean = existsSync,
  commandArgs: string[] = args,
): LoginCommand {
  if (platform !== "win32") return { file: "gcloud", args: [...commandArgs] };
  const win = path.win32;
  const roots = [
    environment.CLOUDSDK_ROOT_DIR,
    ...(environment.Path ?? environment.PATH ?? "")
      .split(";")
      .filter(Boolean)
      .map((entry) => win.resolve(entry, "..")),
    environment.LOCALAPPDATA
      ? win.join(
          environment.LOCALAPPDATA,
          "Google",
          "Cloud SDK",
          "google-cloud-sdk",
        )
      : undefined,
    environment.ProgramFiles
      ? win.join(
          environment.ProgramFiles,
          "Google",
          "Cloud SDK",
          "google-cloud-sdk",
        )
      : undefined,
  ].filter((entry): entry is string => !!entry);
  const root = roots.find(
    (entry) =>
      exists(win.join(entry, "bin", "gcloud.cmd")) &&
      exists(win.join(entry, "lib", "gcloud.py")),
  );
  if (!root)
    throw new Error(
      "Google Cloud CLI was not found. Install it and try again.",
    );
  const paths = (environment.Path ?? environment.PATH ?? "")
    .split(";")
    .filter(Boolean);
  const configured = environment.CLOUDSDK_PYTHON;
  const python = [
    configured,
    ...(configured && !win.isAbsolute(configured)
      ? paths.map((entry) => win.join(entry, configured))
      : []),
    win.join(root, "platform", "bundledpython", "python.exe"),
    ...paths.map((entry) => win.join(entry, "python.exe")),
    ...paths.map((entry) => win.join(entry, "python3.exe")),
  ].find((entry): entry is string => !!entry && exists(entry));
  if (!python)
    throw new Error(
      "Google Cloud CLI's Python interpreter was not found. Repair the CLI installation and try again.",
    );
  return {
    file: python,
    args: ["-S", win.join(root, "lib", "gcloud.py"), ...commandArgs],
    root,
  };
}

export function createGcpSignIn(
  launch: () => Promise<void>,
  reset: () => void,
) {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) return pending;
    const operation = launch().then(() => reset());
    pending = operation.finally(() => {
      pending = undefined;
    });
    return pending;
  };
}

export function launchGoogleLogin(): Promise<void> {
  const command = googleLoginCommand(process.platform, process.env);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(command.root ? { CLOUDSDK_ROOT_DIR: command.root } : {}),
  };
  delete env.PYTHONHOME;
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: "ignore",
    });
    activeLogin = child;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Google sign-in timed out. Please try again."));
    }, 5 * 60_000);
    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (activeLogin === child) activeLogin = undefined;
      reject(
        new Error(
          error.code === "ENOENT"
            ? "Google Cloud CLI was not found. Install it and try again."
            : "Could not start Google sign-in. Check the Google Cloud CLI installation.",
        ),
      );
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (activeLogin === child) activeLogin = undefined;
      if (code === 0) resolve();
      else
        reject(
          new Error(
            "Google sign-in was cancelled or failed. Please try again.",
          ),
        );
    });
  });
}
