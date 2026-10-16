import { describe, expect, it } from "vitest";
import {
  highlightEvent,
  textHighlightKey,
} from "../src/renderer/highlight-engine";
import {
  parseHighlightProfiles,
  type HighlightProfile,
} from "../src/shared/highlights";
import type { LogEvent } from "../src/shared/contracts";

const event: LogEvent = {
  id: "one",
  timestamp: 0,
  logGroup: "/aws/lambda/orders",
  logStream: "s",
  message:
    '{"message":"failed twice","level":"ERROR","other":"ERROR","a/b":{"~id":"red"}}',
};
const profile = (patch: Partial<HighlightProfile> = {}): HighlightProfile => ({
  id: "p",
  name: "Errors",
  enabled: true,
  groupPattern: "",
  groupIgnoreCase: false,
  rules: [
    {
      id: "r",
      enabled: true,
      scope: "text",
      path: "",
      pattern: "ERROR",
      ignoreCase: false,
      target: "row",
      colors: { foreground: "#ffffff", background: "#990000" },
      separateThemeColors: false,
    },
  ],
  ...patch,
});
const run = (p = profile(), e = event, theme: "dark" | "light" = "dark") =>
  highlightEvent(e, [p], theme, [], "utc");

describe("highlight profiles", () => {
  it("matches raw JSON and plain events and applies row colors", () => {
    expect(run().row).toEqual({ foreground: "#ffffff", background: "#990000" });
    expect(
      run(profile(), { ...event, message: "ERROR plain text" }).row.background,
    ).toBe("#990000");
    expect(
      run(profile(), { ...event, message: "error plain text" }).row,
    ).toEqual({});
  });
  it("scopes profiles to group regexes and supports optional disabling", () => {
    expect(run(profile({ groupPattern: "payments$" })).row).toEqual({});
    expect(run(profile({ groupPattern: "orders$" })).row.background).toBe(
      "#990000",
    );
    expect(run(profile({ enabled: false })).row).toEqual({});
    expect(run(profile({ groupPattern: "[" })).row).toEqual({});
  });
  it("uses exact escaped JSON Pointer paths without matching another field", () => {
    const p = profile();
    Object.assign(p.rules[0], {
      scope: "structured",
      path: "/level",
      target: "text",
    });
    const result = run(p);
    expect(result.text[textHighlightKey("/level", '"ERROR"')][0]).toMatchObject(
      { start: 1, end: 6 },
    );
    expect(result.text[textHighlightKey("/other", '"ERROR"')]).toBeUndefined();
    p.rules[0].pattern = "^ERROR$";
    expect(run(p).text[textHighlightKey("/level", '"ERROR"')][0]).toMatchObject(
      { start: 1, end: 6 },
    );
    Object.assign(p.rules[0], {
      path: "/a~1b/~0id",
      pattern: "red",
      target: "row",
    });
    expect(run(p).row.background).toBe("#990000");
    expect(run(p, { ...event, message: "red" }).row).toEqual({});
  });
  it("highlights repeated regex text matches and respects zero-width matches", () => {
    const p = profile();
    Object.assign(p.rules[0], {
      pattern: "fail\\w+",
      target: "text",
      ignoreCase: true,
    });
    const e = { ...event, message: "FAILED, failed again" };
    expect(
      run(p, e).text[textHighlightKey("@message", e.message)].map((s) => [
        s.start,
        s.end,
      ]),
    ).toEqual([
      [0, 6],
      [8, 14],
    ]);
    p.rules[0].pattern = "^|$";
    expect(run(p, e).text).toEqual({});
    p.rules[0].pattern = "[";
    expect(run(p, e).row).toEqual({});
  });
  it("uses shared colors by default and theme colors only when enabled", () => {
    const p = profile();
    p.rules[0].lightColors = { background: "#ffff00" };
    p.rules[0].darkColors = { background: "#660000" };
    expect(run(p, event, "light").row.background).toBe("#990000");
    p.rules[0].separateThemeColors = true;
    expect(run(p, event, "light").row.background).toBe("#ffff00");
    expect(run(p, event, "dark").row.background).toBe("#660000");
  });
  it("handles escaped quoted structured strings, rule disabling and case-sensitive paths", () => {
    const p = profile();
    Object.assign(p.rules[0], {
      scope: "structured",
      path: "/value",
      pattern: '^a\\nb"c$',
      target: "text",
    });
    const e = {
      ...event,
      message: JSON.stringify({ value: 'a\nb"c', Value: 'a\nb"c' }),
    };
    const text = JSON.stringify('a\nb"c');
    expect(run(p, e).text[textHighlightKey("/value", text)][0]).toMatchObject({
      start: 1,
      end: text.length - 1,
    });
    expect(run(p, e).text[textHighlightKey("/Value", text)]).toBeUndefined();
    p.rules[0].enabled = false;
    expect(run(p, e).text).toEqual({});
  });
  it("preserves first rule precedence and schema round trips while rejecting unsafe values", () => {
    const p = profile();
    p.rules.push({
      ...p.rules[0],
      id: "next",
      colors: { background: "#00ff00" },
    });
    expect(run(p).row.background).toBe("#990000");
    expect(parseHighlightProfiles([p])).toEqual([p]);
    expect(parseHighlightProfiles([p, p])).toEqual([p]);
    expect(
      parseHighlightProfiles([{ ...p, rules: [p.rules[0], p.rules[0]] }]),
    ).toEqual([]);
    expect(
      parseHighlightProfiles([
        {
          ...p,
          rules: [{ ...p.rules[0], colors: { background: "url(secret)" } }],
        },
      ]),
    ).toEqual([]);
    expect(parseHighlightProfiles(undefined)).toEqual([]);
  });
});
