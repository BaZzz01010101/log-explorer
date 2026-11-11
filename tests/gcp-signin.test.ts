import { describe, expect, it, vi } from "vitest";
import { createGcpSignIn, googleLoginCommand } from "../src/main/gcp-signin";

describe("Google sign-in", () => {
  it("launches the supported browser flow without a shell and refreshes cached credentials", async () => {
    const launch = vi.fn().mockResolvedValue(undefined);
    const reset = vi.fn();
    const signIn = createGcpSignIn(launch, reset);
    await signIn();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not discard the current credentials when sign-in fails", async () => {
    const reset = vi.fn();
    const signIn = createGcpSignIn(
      vi.fn().mockRejectedValue(new Error("Sign-in cancelled")),
      reset,
    );
    await expect(signIn()).rejects.toThrow("Sign-in cancelled");
    expect(reset).not.toHaveBeenCalled();
  });

  it("allows retry after a cancelled sign-in", async () => {
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error("cancelled"))
      .mockResolvedValueOnce(undefined);
    const reset = vi.fn();
    const signIn = createGcpSignIn(launch, reset);
    await expect(signIn()).rejects.toThrow("cancelled");
    await signIn();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("reports when the Google Cloud CLI is missing", () => {
    expect(() =>
      googleLoginCommand("win32", { Path: "C:\\missing" }, () => false),
    ).toThrow(/Google Cloud CLI was not found/);
  });

  it("shares an in-progress sign-in instead of launching multiple browser flows", async () => {
    let finish!: () => void;
    const launch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const reset = vi.fn();
    const signIn = createGcpSignIn(launch, reset);
    const one = signIn();
    const two = signIn();
    expect(launch).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([one, two]);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("runs the Windows SDK's bundled Python with fixed arguments, without cmd.exe", () => {
    const command = googleLoginCommand(
      "win32",
      { Path: "C:\\Google Cloud SDK\\bin;C:\\other" },
      (path) =>
        path.endsWith("gcloud.cmd") ||
        path.endsWith("gcloud.py") ||
        path.endsWith("python.exe"),
    );
    expect(command.file).toContain("python.exe");
    expect(command.args).toEqual([
      "-S",
      expect.stringContaining("gcloud.py"),
      "auth",
      "login",
      "--no-activate",
      "--quiet",
    ]);
    expect(command.file.toLowerCase()).not.toContain("cmd.exe");
  });

  it("finds Python on PATH when the Windows SDK has no bundled interpreter", () => {
    const command = googleLoginCommand(
      "win32",
      { Path: "C:\\SDK\\bin;C:\\Python" },
      (name) =>
        name === "C:\\SDK\\bin\\gcloud.cmd" ||
        name === "C:\\SDK\\lib\\gcloud.py" ||
        name === "C:\\Python\\python.exe",
    );
    expect(command.file).toBe("C:\\Python\\python.exe");
  });
});
