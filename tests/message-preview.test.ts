import { expect, it } from "vitest";
import { messagePreview, parseLogMessage } from "../src/shared/log-data";
import {
  highlightEvent,
  textHighlightKey,
} from "../src/renderer/highlight-engine";
import type { LogEvent } from "../src/shared/contracts";
import type { HighlightProfile } from "../src/shared/highlights";

it.each([
  [
    { message: "old", msg: "preferred" },
    { path: "/msg", value: "preferred" },
  ],
  [
    { message: "fallback", msg: "" },
    { path: "/message", value: "fallback" },
  ],
  [
    { message: "fallback", msg: " \t\n " },
    { path: "/message", value: "fallback" },
  ],
  [
    { message: "fallback", msg: null },
    { path: "/message", value: "fallback" },
  ],
  [
    { message: 5, msg: "new" },
    { path: "/msg", value: "new" },
  ],
  [{ message: "", msg: " " }, undefined],
  [{ message: { nested: true }, msg: 5 }, undefined],
])("chooses a non-empty string preview for %j", (value, expected) => {
  expect(messagePreview(parseLogMessage(JSON.stringify(value)))).toEqual(
    expected,
  );
});

it("leaves plain text and JSON primitives using their raw preview", () => {
  for (const text of ["plain", "null", "123", '"message"'])
    expect(messagePreview(parseLogMessage(text))).toBeUndefined();
});

it("prepares profile spans for the exact preferred column text and property path", () => {
  const event: LogEvent = {
    id: "preview",
    timestamp: 1,
    logGroup: "/group",
    logStream: "stream",
    message: JSON.stringify({ message: "wrong", msg: "preferred" }),
  };
  const profiles: HighlightProfile[] = [
    {
      id: "p",
      name: "p",
      enabled: true,
      groupPattern: "",
      groupIgnoreCase: false,
      rules: [
        {
          id: "r",
          enabled: true,
          scope: "structured",
          path: "/msg",
          pattern: "preferred",
          ignoreCase: false,
          target: "text",
          colors: { background: "#abcdef" },
          separateThemeColors: false,
        },
      ],
    },
  ];
  const highlights = highlightEvent(
    event,
    profiles,
    "light",
    [{ path: "@message", width: 400 }],
    "utc",
  );
  expect(highlights.text[textHighlightKey("/msg", "preferred")]).toEqual([
    { start: 0, end: 9, colors: { background: "#abcdef" } },
  ]);
});
