import { resolve } from "node:path";

export function desktopExecutablePath(): string {
  return resolve(
    process.env.EXPLORER_DESKTOP_APP_PATH ||
      // Release builds ignore test switches; use `npm run package:verification`.
      "release/verification/win-unpacked/AWS Log Explorer.exe",
  );
}
