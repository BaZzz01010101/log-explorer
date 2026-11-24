import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

const POLL_INTERVAL = 3000;
/** The waiting script touches its file about every 10 seconds. */
const STALE_AFTER = 45_000;
const pendingSchema = z.object({
  version: z.string().regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/),
});

/**
 * Where scripts/local-update.py announces a new local build: the folder that
 * holds `win-unpacked`. Installed copies have no such folder, so they never
 * look for local updates.
 */
export function localUpdateDirectory(options: {
  packaged: boolean;
  platform: string;
  executable: string;
  testDirectory?: string;
}): string | undefined {
  if (options.testDirectory) return options.testDirectory;
  const folder = dirname(options.executable);
  return options.packaged &&
    options.platform === "win32" &&
    basename(folder) === "win-unpacked"
    ? dirname(folder)
    : undefined;
}

/**
 * Watches for a local build that waits for this app to close. The app only
 * asks for a restart; the waiting script replaces the files and starts it.
 */
export class LocalUpdates {
  version: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(
    private readonly directory: string | undefined,
    private readonly currentVersion: string,
    private readonly onChange: (version: string | null) => void,
  ) {}
  async start(): Promise<void> {
    if (!this.directory || this.timer) return;
    this.timer = setInterval(() => void this.check(), POLL_INTERVAL);
    this.timer.unref();
    // A request that nothing answered must not restart a later normal close.
    await this.cancelRestart().catch(() => {});
    await this.check();
  }
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
  async check(): Promise<string | null> {
    const version = await this.read();
    if (version !== this.version) {
      this.version = version;
      this.onChange(version);
    }
    return version;
  }
  /** False when no build is waiting any more. */
  async requestRestart(args: string[]): Promise<boolean> {
    const version = await this.check();
    if (!version) return false;
    await writeFile(this.restartPath, JSON.stringify({ version, args }));
    return true;
  }
  async cancelRestart(): Promise<void> {
    if (this.directory) await rm(this.restartPath, { force: true });
  }
  private get restartPath(): string {
    return join(this.directory!, "local-update-restart.json");
  }
  private async read(): Promise<string | null> {
    if (!this.directory) return null;
    const path = join(this.directory, "local-update.json");
    try {
      const { mtimeMs, size } = await stat(path);
      if (size > 4096 || Date.now() - mtimeMs > STALE_AFTER) return null;
      const { version } = pendingSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      return version === this.currentVersion ? null : version;
    } catch {
      return null;
    }
  }
}
