import { pathToFileURL } from "node:url";

type Frame = { url?: string } | null | undefined;
export interface IpcSender {
  sender: unknown;
  senderFrame?: Frame;
}
export interface TrustedWindow {
  webContents: { mainFrame: unknown };
}

/**
 * Throws unless an IPC message comes from the main frame of the app window
 * showing the app's own renderer (the dev server URL, or the packaged file).
 */
export function assertTrustedSender(
  event: IpcSender,
  window: TrustedWindow | null,
  renderer: { developmentUrl?: string; rendererFile: string },
  windowsPaths = process.platform === "win32",
): void {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Untrusted renderer");
  const url = event.senderFrame?.url;
  const { developmentUrl, rendererFile } = renderer;
  if (
    developmentUrl
      ? url !== developmentUrl && url !== `${developmentUrl}/`
      : !sameFileUrl(url, pathToFileURL(rendererFile).href, windowsPaths)
  )
    throw new Error("Untrusted renderer URL");
}

/**
 * Windows paths ignore case, and Chromium reports the drive letter in upper
 * case even when the app was started from `d:\...`; compare file URLs there
 * without case. Other platforms compare exactly.
 */
function sameFileUrl(
  url: string | undefined,
  expected: string,
  ignoreCase: boolean,
): boolean {
  if (!url) return false;
  return ignoreCase
    ? url.toLowerCase() === expected.toLowerCase()
    : url === expected;
}
