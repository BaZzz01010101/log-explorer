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
      : url !== pathToFileURL(rendererFile).href
  )
    throw new Error("Untrusted renderer URL");
}
