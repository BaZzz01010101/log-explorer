import { resolve } from "node:path";

export function desktopExecutablePath(): string {
  return resolve(
    process.env.EXPLORER_DESKTOP_APP_PATH ||
      "release/win-unpacked/AWS Log Explorer.exe",
  );
}
