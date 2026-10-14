import { contextBridge, ipcRenderer } from "electron";
import type { ExplorerApi, QueryUpdate } from "../shared/contracts";

const api: ExplorerApi = {
  environment: () => ipcRenderer.invoke("explorer:environment"),
  enableAws: (enabled) => ipcRenderer.invoke("explorer:enable-aws", enabled),
  profiles: () => ipcRenderer.invoke("explorer:profiles"),
  listGroups: (connection, prefix, cursor) =>
    ipcRenderer.invoke("explorer:groups", connection, prefix, cursor),
  listStreams: (connection, group, prefix, cursor) =>
    ipcRenderer.invoke("explorer:streams", connection, group, prefix, cursor),
  query: (request) => ipcRenderer.invoke("explorer:query", request),
  live: (request) => ipcRenderer.invoke("explorer:live", request),
  cancel: (requestId) => ipcRenderer.invoke("explorer:cancel", requestId),
  onUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, update: QueryUpdate) =>
      listener(update);
    ipcRenderer.on("explorer:update", handler);
    return () => ipcRenderer.removeListener("explorer:update", handler);
  },
  onBeforeClose: (listener) => {
    const handler = async (
      _event: Electron.IpcRendererEvent,
      token: string,
    ) => {
      try {
        await listener();
        ipcRenderer.send("explorer:close-ready", token, true);
      } catch {
        ipcRenderer.send("explorer:close-ready", token, false);
      }
    };
    ipcRenderer.on("explorer:prepare-close", handler);
    return () => ipcRenderer.removeListener("explorer:prepare-close", handler);
  },
  loadWorkspace: () => ipcRenderer.invoke("explorer:load"),
  saveWorkspace: (workspace) => ipcRenderer.invoke("explorer:save", workspace),
  exportData: (content, extension) =>
    ipcRenderer.invoke("explorer:export", content, extension),
  copy: (text) => ipcRenderer.invoke("explorer:copy", text),
};
contextBridge.exposeInMainWorld("explorer", api);
