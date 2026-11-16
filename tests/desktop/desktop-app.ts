import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { ElectronApplication } from "@playwright/test";

export function desktopExecutablePath(): string {
  return resolve(
    process.env.EXPLORER_DESKTOP_APP_PATH ||
      // Release builds ignore test switches; use `npm run package:verification`.
      "release/verification/win-unpacked/AWS Log Explorer.exe",
  );
}

/** One limit for a natural close, sized for a machine running parallel apps. */
export const APP_CLOSE_TIMEOUT = 20_000;

/**
 * The dark theme changes colors, not behavior or layout. Tests that compare
 * colors run in both themes; the rest run in light only, which keeps about a
 * fifth of the suite's work out of each run. Set DESKTOP_THEMES=all to run
 * every theme loop in both, e.g. after changing theme code.
 */
export const behaviorThemes: readonly ("light" | "dark")[] =
  process.env.DESKTOP_THEMES === "all" ? ["light", "dark"] : ["light"];

/** In a loop over both themes, whether a test without color checks runs. */
export const runsBehaviorTest = (theme: string) =>
  (behaviorThemes as readonly string[]).includes(theme);

function within<T>(promise: Promise<T>, timeout: number, message: string) {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Closes the app the way a user does (its main window by default) and returns
 * the process exit code once it has ended.
 *
 * Playwright keeps a debugger connection to the app's main process, and Node
 * holds the final exit until that connection drops. Left to Playwright this
 * took 0.1–0.6 s normally and over 8 s on a loaded machine, after the app had
 * already saved and quit. So once the app reports its own process exit (a
 * verification-only log line), the connection is released here.
 */
export async function closeAppNaturally(
  app: ElectronApplication,
  options: { close?: () => Promise<unknown>; timeout?: number } = {},
): Promise<number | null> {
  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null)
    return child.exitCode;
  const timeout = options.timeout ?? APP_CLOSE_TIMEOUT;
  const exited = new Promise<number | null>((done) =>
    child.once("exit", (code) => done(code)),
  );
  let listen: ((chunk: unknown) => void) | undefined;
  const finished = new Promise<void>((done) => {
    listen = (chunk) => {
      if (/\[shutdown \d+\] process exit/.test(String(chunk))) done();
    };
    child.stderr?.on("data", listen);
  });
  try {
    await (options.close
      ? options.close()
      : app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].close(),
        ));
    await within(
      Promise.race([finished, exited]),
      timeout,
      "The app did not finish its close sequence",
    );
    // The app has saved and quit; only Playwright's connection holds it.
    void app.close().catch(() => {});
    return await within(exited, timeout, "The app did not exit after quitting");
  } finally {
    if (listen) child.stderr?.off("data", listen);
    if (child.exitCode === null && child.signalCode === null) {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        // Already gone.
      }
      // Callers check the exit state afterwards, so wait until Node has seen it.
      await within(exited, 5000, "The app did not end").catch(() => {});
    }
  }
}
