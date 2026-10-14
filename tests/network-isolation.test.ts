import { expect, it } from "vitest";
import { isIpcSocket } from "./isolation";

it("rejects TCP connection options even when HTTP agents include a path property", () => {
  expect(
    isIpcSocket({
      host: "logs.eu-west-1.amazonaws.com",
      port: 443,
      path: undefined,
    }),
  ).toBe(false);
  expect(isIpcSocket({ host: "localhost", port: 80, path: "/query" })).toBe(
    false,
  );
  expect(isIpcSocket({ port: 80, path: null })).toBe(false);
});
it("allows only local IPC pipe paths needed by test workers", () => {
  expect(isIpcSocket({ path: "\\\\.\\pipe\\vitest" })).toBe(true);
  expect(isIpcSocket("/tmp/vitest.sock")).toBe(true);
  expect(isIpcSocket("example.invalid")).toBe(false);
});
