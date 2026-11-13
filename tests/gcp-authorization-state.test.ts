import { expect, it } from "vitest";
import { isGcpAuthorizationError } from "../src/renderer/gcp-errors";

it("distinguishes expired authentication from project permissions and discovery failures", () => {
  expect(
    isGcpAuthorizationError(
      "Could not obtain a Google Cloud access token. Check the selected account and sign in again if needed.",
    ),
  ).toBe(true);
  expect(
    isGcpAuthorizationError(
      "Google Cloud credentials expired. Sign in again and retry.",
    ),
  ).toBe(true);
  expect(
    isGcpAuthorizationError(
      "Google Cloud denied log access. Check logging permissions and the selected account.",
    ),
  ).toBe(false);
  expect(isGcpAuthorizationError("Project listing failed (HTTP 403)")).toBe(
    false,
  );
});
