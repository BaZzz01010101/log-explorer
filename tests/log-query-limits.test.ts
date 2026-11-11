import { expect, it } from "vitest";
import { queryPageLimit } from "../src/shared/log-query-limits";

it("uses a moderate page for Google sources while retaining AWS page behavior", () => {
  expect(queryPageLimit(new Set(["gcp"]), 10000)).toBe(2000);
  expect(queryPageLimit(new Set(["gcp", "aws"]), 10000)).toBe(2000);
  expect(queryPageLimit(new Set(["aws"]), 10000)).toBe(10000);
  expect(queryPageLimit(new Set(["gcp"]), 500)).toBe(500);
});
