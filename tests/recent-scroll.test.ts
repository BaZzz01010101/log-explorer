import { expect, it } from "vitest";
import { shouldFollowRecentLoad } from "../src/renderer/recent-scroll";

it("does not jump to the bottom while an older page is loading", () => {
  expect(shouldFollowRecentLoad(true, false, false)).toBe(true);
  expect(shouldFollowRecentLoad(true, true, false)).toBe(false);
  expect(shouldFollowRecentLoad(true, false, true)).toBe(false);
});
