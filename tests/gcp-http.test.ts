import { expect, it, vi } from "vitest";
import { googleFetch } from "../src/main/gcp-http";

const identity = { configuration: "work", account: "user@example.com" };
const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

it("refreshes the token once on 401 and retries throttled requests", async () => {
  vi.useFakeTimers();
  try {
    const auth = {
      token: vi.fn().mockResolvedValueOnce("old").mockResolvedValue("new"),
      invalidateToken: vi.fn(),
    };
    const transport = vi
      .fn()
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(429))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const result = googleFetch(auth, identity, { url: "https://x.test" }, transport);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(auth.invalidateToken).toHaveBeenCalledWith(identity, "old");
    expect(transport.mock.calls[2][1].headers.Authorization).toBe("Bearer new");
  } finally {
    vi.useRealTimers();
  }
});

it("stops before sending when the request is already cancelled", async () => {
  const transport = vi.fn();
  const controller = new AbortController();
  controller.abort();
  await expect(
    googleFetch({ token: async () => "t" }, identity, { url: "https://x.test", signal: controller.signal }, transport),
  ).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
});
