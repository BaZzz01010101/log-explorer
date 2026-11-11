import { expect, it } from "vitest";
import { gcpErrorMessage } from "../src/renderer/gcp-errors";

it("keeps a useful permission failure without Electron's IPC wrapper", () => {
  expect(
    gcpErrorMessage(
      new Error(
        "Error invoking remote method 'gcp:logs': Error: Permission denied",
      ),
    ),
  ).toBe("Permission denied");
});
