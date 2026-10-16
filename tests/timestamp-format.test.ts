import { afterEach, expect, it, vi } from "vitest";
import { formatTimestamp } from "../src/renderer/timestamp-format";

afterEach(() => vi.unstubAllEnvs());

it("keeps the full UTC date, time, and milliseconds", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(formatTimestamp(Date.parse("2026-10-15T00:02:03.004Z"), "utc")).toBe(
    "2026-10-15 00:02:03.004 UTC",
  );
});

it("uses the same numeric format for local dates across year boundaries", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(formatTimestamp(Date.parse("2026-12-31T23:02:03.004Z"), "local")).toBe(
    "2027-01-01 00:02:03.004 UTC+01:00",
  );
});

it("labels the event's local offset on either side of a daylight-saving transition", () => {
  vi.stubEnv("TZ", "Europe/Madrid");
  expect(formatTimestamp(Date.parse("2026-10-25T00:30:00.123Z"), "local")).toBe(
    "2026-10-25 02:30:00.123 UTC+02:00",
  );
  expect(formatTimestamp(Date.parse("2026-10-25T01:30:00.123Z"), "local")).toBe(
    "2026-10-25 02:30:00.123 UTC+01:00",
  );
});

it("supports negative local offsets with minutes", () => {
  vi.stubEnv("TZ", "America/St_Johns");
  expect(formatTimestamp(Date.parse("2026-01-15T04:02:03.004Z"), "local")).toBe(
    "2026-01-15 00:32:03.004 UTC-03:30",
  );
});
