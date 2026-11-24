import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { assertTrustedSender } from "../src/main/ipc-trust";

// The preload bridge and the main-process handlers are wired only by channel
// strings. These tests fail when one side renames a channel or reorders
// arguments without the other.
const calls: { kind: string; channel: string; args: unknown[] }[] = [];
let api: Record<string, (...args: unknown[]) => unknown> = {};
vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, value: typeof api) => (api = value),
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) =>
      calls.push({ kind: "invoke", channel, args }),
    send: (channel: string, ...args: unknown[]) =>
      calls.push({ kind: "send", channel, args }),
    on: (channel: string, handler: (...args: unknown[]) => unknown) =>
      calls.push({ kind: "on", channel, args: [handler] }),
    removeListener: () => {},
  },
}));

const mainSource = readFileSync("src/main/index.ts", "utf8");
/** channel -> declared parameter names, or null for a named function. */
const mainHandlers = new Map<string, string[] | null>(
  [
    ...mainSource.matchAll(
      /\bhandle\(\s*"([^"]+)",\s*(?:async\s*)?(?:\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*))/g,
    ),
  ].map((match) => [
    match[1]!,
    match[3]
      ? null
      : match[2]!
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
  ]),
);

beforeAll(async () => {
  await import("../src/preload/index");
});

describe("preload and main IPC contract", () => {
  it("routes every preload invoke to a main handler with the same arguments in order", () => {
    const invoked = new Set<string>();
    for (const [name, method] of Object.entries(api)) {
      if (name.startsWith("on")) continue;
      calls.length = 0;
      const args = Array.from({ length: method.length }, (_, index) => `${name}-${index}`);
      method(...args);
      expect(calls, name).toHaveLength(1);
      const [call] = calls;
      expect(call!.kind, name).toBe("invoke");
      expect(call!.args, name).toEqual(args);
      expect(mainHandlers.has(call!.channel), `${name} -> ${call!.channel}`).toBe(true);
      const params = mainHandlers.get(call!.channel);
      if (params) expect(params, `${call!.channel} parameters`).toHaveLength(args.length);
      invoked.add(call!.channel);
    }
    expect([...mainHandlers.keys()].filter((channel) => !invoked.has(channel))).toEqual([]);
  });

  it("subscribes only to channels the main process sends, and replies on a channel it handles", async () => {
    calls.length = 0;
    api.onUpdate!(() => {});
    api.onBeforeClose!(async () => {});
    api.onWindowPress!(() => {});
    const listened = calls.filter((call) => call.kind === "on");
    expect(listened.map((call) => call.channel).sort()).toEqual([
      "explorer:prepare-close",
      "explorer:update",
      "explorer:window-press",
    ]);
    for (const { channel } of listened)
      expect(mainSource, channel).toContain(`webContents.send("${channel}"`);

    const prepare = listened.find((call) => call.channel === "explorer:prepare-close")!;
    calls.length = 0;
    await (prepare.args[0] as (event: unknown, token: string) => Promise<void>)({}, "token");
    expect(calls).toEqual([
      { kind: "send", channel: "explorer:close-ready", args: ["token", true] },
    ]);
    expect(mainSource).toMatch(/ipcMain\.on\("explorer:close-ready", \(event, token, success\)/);
  });
});

describe("assertTrustedSender", () => {
  const mainFrame = { url: pathToFileURL("/app/renderer/index.html").href };
  const window = { webContents: { mainFrame } };
  const packaged = { rendererFile: "/app/renderer/index.html" };
  const event = (sender: unknown, senderFrame: { url?: string } | null) => ({ sender, senderFrame });

  it("accepts the main frame of the app window showing the packaged renderer", () => {
    expect(() => assertTrustedSender(event(window.webContents, mainFrame), window, packaged)).not.toThrow();
  });

  it("rejects other windows, subframes and missing windows", () => {
    expect(() => assertTrustedSender(event({}, mainFrame), window, packaged)).toThrow("Untrusted renderer");
    expect(() => assertTrustedSender(event(window.webContents, { url: mainFrame.url }), window, packaged)).toThrow(
      "Untrusted renderer",
    );
    expect(() => assertTrustedSender(event(window.webContents, mainFrame), null, packaged)).toThrow("Untrusted renderer");
  });

  it("ignores file URL case only for Windows paths", () => {
    const file = { rendererFile: String.raw`d:\App\renderer\index.html` };
    const frame = { url: "file:///D:/App/renderer/index.html" };
    const upper = { webContents: { mainFrame: frame } };
    expect(() => assertTrustedSender(event(upper.webContents, frame), upper, file, true)).not.toThrow();
    const posix = { url: pathToFileURL("/APP/renderer/index.html").href };
    const other = { webContents: { mainFrame: posix } };
    expect(() => assertTrustedSender(event(other.webContents, posix), other, packaged, false)).toThrow(
      "Untrusted renderer URL",
    );
  });

  it("rejects a navigated main frame and accepts only the dev server URL in development", () => {
    const navigated = { url: "https://example.com/" };
    const other = { webContents: { mainFrame: navigated } };
    expect(() => assertTrustedSender(event(other.webContents, navigated), other, packaged)).toThrow(
      "Untrusted renderer URL",
    );
    const dev = { developmentUrl: "http://localhost:5173", rendererFile: packaged.rendererFile };
    for (const url of ["http://localhost:5173", "http://localhost:5173/"]) {
      const frame = { url };
      const devWindow = { webContents: { mainFrame: frame } };
      expect(() => assertTrustedSender(event(devWindow.webContents, frame), devWindow, dev)).not.toThrow();
    }
    const stale = { webContents: { mainFrame } };
    expect(() => assertTrustedSender(event(stale.webContents, mainFrame), stale, dev)).toThrow("Untrusted renderer URL");
  });
});
