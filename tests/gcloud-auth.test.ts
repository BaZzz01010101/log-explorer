import { describe, expect, it, vi } from "vitest";
import { createGcloudAuth } from "../src/main/gcloud-auth";

describe("gcloud authentication", () => {
  it("loads named configurations and credentialed accounts", async () => {
    const run = vi.fn(async (args: string[]) =>
      args[0] === "config"
        ? JSON.stringify([
            {
              name: "work",
              is_active: true,
              properties: {
                core: { account: "user@example.com", project: "demo-project" },
              },
            },
          ])
        : JSON.stringify([{ account: "user@example.com", status: "ACTIVE" }]),
    );
    const auth = createGcloudAuth(run);
    expect(await auth.profiles()).toEqual({
      configurations: [
        {
          name: "work",
          active: true,
          account: "user@example.com",
          project: "demo-project",
        },
      ],
      accounts: ["user@example.com"],
    });
  });

  it("reuses tokens per identity and refreshes after invalidation", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce("first-token\n")
      .mockResolvedValueOnce("second-token\n");
    const auth = createGcloudAuth(run);
    expect(
      await auth.token({ configuration: "work", account: "user@example.com" }),
    ).toBe("first-token");
    expect(await auth.token({ configuration: "work", account: "user@example.com" })).toBe("first-token");
    expect(run).toHaveBeenCalledTimes(1);
    auth.invalidateToken({ configuration: "work", account: "user@example.com" }, "first-token");
    expect(await auth.token({ configuration: "work", account: "user@example.com" })).toBe("second-token");
    expect(run).toHaveBeenCalledWith([
      "auth",
      "print-access-token",
      "--configuration=work",
      "--account=user@example.com",
      "--quiet",
    ]);
  });

  it("coalesces simultaneous token requests and isolates accounts", async () => {
    const run = vi.fn(async (args: string[]) => args.find((arg) => arg.startsWith("--account="))!);
    const auth = createGcloudAuth(run);
    const a = { configuration: "work", account: "a@example.com" };
    const b = { configuration: "work", account: "b@example.com" };
    const result = await Promise.all([auth.token(a), auth.token(a), auth.token(b)]);
    expect(result).toEqual(["--account=a@example.com", "--account=a@example.com", "--account=b@example.com"]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never includes command output in authentication errors", async () => {
    const auth = createGcloudAuth(
      vi.fn().mockRejectedValue(new Error("secret-token")),
    );
    await expect(
      auth.token({ configuration: "work", account: "user@example.com" }),
    ).rejects.toThrow("Could not obtain a Google Cloud access token");
    await expect(
      auth.token({ configuration: "work", account: "user@example.com" }),
    ).rejects.not.toThrow("secret-token");
  });
});
