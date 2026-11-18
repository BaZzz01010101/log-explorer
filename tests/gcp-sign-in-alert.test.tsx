// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GcpSignInAlert } from "../src/renderer/components/GcpSignInAlert";
import {
  GCP_SIGNED_IN_EVENT,
  isGcpAuthorizationError,
} from "../src/renderer/gcp-errors";

const gcpSignIn = vi.fn<() => Promise<void>>();
beforeEach(() => {
  gcpSignIn.mockReset();
  (
    window as unknown as { explorer: { gcpSignIn: typeof gcpSignIn } }
  ).explorer = { gcpSignIn };
});
afterEach(() => cleanup());

const show = (onRetry: () => void, live = false) =>
  render(
    <MantineProvider env="test">
      <GcpSignInAlert live={live} onRetry={onRetry} />
    </MantineProvider>,
  );

it("recognizes expired Google Cloud authorization, including Live stream failures", () => {
  for (const message of [
    "Error invoking remote method 'explorer:query': Error: Google Cloud credentials expired. Sign in again and retry.",
    "Could not obtain a Google Cloud access token. Check the selected account and sign in again if needed.",
    "16 UNAUTHENTICATED: Request had invalid authentication credentials.",
  ])
    expect(isGcpAuthorizationError(message), message).toBe(true);
  expect(isGcpAuthorizationError("Quota exceeded for logging API")).toBe(false);
});

it("signs in and reruns the view automatically", async () => {
  gcpSignIn.mockResolvedValue();
  const retry = vi.fn();
  show(retry, true);
  expect(screen.getByText(/Live streaming resumes/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
  expect(gcpSignIn).toHaveBeenCalledTimes(1);
});

it("keeps the prompt with the error when sign-in fails, without rerunning", async () => {
  gcpSignIn.mockRejectedValue(new Error("Sign-in was cancelled."));
  const retry = vi.fn();
  show(retry);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Sign-in was cancelled.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(retry).not.toHaveBeenCalled();
});

it("reruns when the user signs in elsewhere in the app", () => {
  const retry = vi.fn();
  show(retry);
  act(() => {
    window.dispatchEvent(new Event(GCP_SIGNED_IN_EVENT));
  });
  expect(retry).toHaveBeenCalledTimes(1);
  expect(gcpSignIn).not.toHaveBeenCalled();
});
