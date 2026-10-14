import { afterAll } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import net from "node:net";
import tls from "node:tls";

// Credential resolution must never find real machine state, even in SDK tests.
process.env.AWS_SHARED_CREDENTIALS_FILE =
  "/__aws_log_explorer_test__/credentials";
process.env.AWS_CONFIG_FILE = "/__aws_log_explorer_test__/config";
process.env.AWS_EC2_METADATA_DISABLED = "true";
for (const key of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_PROFILE",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
])
  delete process.env[key];
const dispatcher = new MockAgent();
dispatcher.disableNetConnect();
setGlobalDispatcher(dispatcher);
const originalConnect = net.Socket.prototype.connect;
const originalTls = tls.connect;
export function isIpcSocket(value: unknown): boolean {
  if (typeof value === "object" && value !== null) {
    if ("host" in value || "port" in value) return false;
    return "path" in value && isIpcSocket(value.path);
  }
  return (
    typeof value === "string" &&
    (value.startsWith("\\\\.\\pipe\\") || value.startsWith("/"))
  );
}
// Install guards while setup is evaluated, before test modules can start requests.
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const first = args[0];
  // Vitest workers use local IPC pipes; all TCP sockets are denied.
  if (isIpcSocket(first)) return originalConnect.apply(this, args as never);
  throw new Error("Network access is forbidden in isolated tests");
} as typeof originalConnect;
tls.connect = (() => {
  throw new Error("TLS access is forbidden in isolated tests");
}) as typeof tls.connect;
afterAll(() => {
  net.Socket.prototype.connect = originalConnect;
  tls.connect = originalTls;
});
