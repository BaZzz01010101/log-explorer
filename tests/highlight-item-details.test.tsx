import { MantineProvider } from "@mantine/core";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  ProfileFields,
  RuleFields,
  profileDraftError,
  ruleDraftError,
  type ProfileDraft,
  type RuleDraft,
} from "../src/renderer/components/HighlightItemDetails";

// The platform eye dropper is the external boundary; keep Mantine's actual
// components while exercising a host where the native picker is available.
vi.mock("@mantine/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@mantine/hooks")>()),
  useEyeDropper: () => ({ supported: true, open: vi.fn() }),
}));

const profile: ProfileDraft = {
  name: "Production",
  groupPattern: "/aws/lambda/production",
  groupIgnoreCase: true,
};
const rule: RuleDraft = {
  scope: "structured",
  path: "/request/status",
  target: "row",
  pattern: "ERROR|timeout",
  ignoreCase: true,
  colors: { foreground: "#ffffff", background: "#713f12" },
  separateThemeColors: false,
};
const markup = (children: ReactNode) =>
  renderToStaticMarkup(<MantineProvider>{children}</MantineProvider>);
const inputs = (html: string) => html.match(/<input\b[^>]*>/g) ?? [];
const fields = (html: string) =>
  (html.match(/<(?:input|label)\b[^>]*>/g) ?? []).map((tag) =>
    tag
      .replace(/ readonly=""| aria-readonly="[^"]*"/gi, "")
      .replace(/ id="[^"]*"| for="[^"]*"| aria-labelledby="[^"]*"/g, ""),
  );

it.each([false, true])(
  "disables writing assistance for pattern and pointer fields in readOnly=%s",
  (readOnly) => {
    const profileFields = ProfileFields({
      draft: profile,
      readOnly,
      onChange: vi.fn(),
    });
    const ruleFields = RuleFields({ draft: rule, readOnly, onChange: vi.fn() });
    for (const [node, label] of [
      [profileFields, "Log group regex"],
      [ruleFields, "Match regex"],
      [ruleFields, "JSON Pointer path"],
    ] as const) {
      expect(field(node, label).props).toMatchObject({
        spellCheck: false,
        autoCorrect: "off",
        autoCapitalize: "off",
      });
    }
  },
);

// Exercise the field's callback boundary directly; native interaction and
// geometry checks run in the packaged desktop tests, not a mocked DOM.
function field(node: ReactNode, label: string): ReactElement<any> {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ label?: string; children?: ReactNode }>(child))
      continue;
    if (child.props.label === label) return child;
    if (child.props.children) {
      try {
        return field(child.props.children, label);
      } catch {
        // The label may be in a sibling section.
      }
    }
  }
  throw new Error(`Missing field: ${label}`);
}

it("locks profile fields while preserving the editor's enabled input structure", () => {
  const view = markup(
    <ProfileFields draft={profile} readOnly onChange={vi.fn()} />,
  );
  const edit = markup(<ProfileFields draft={profile} onChange={vi.fn()} />);
  expect(inputs(view)).toHaveLength(3);
  expect(inputs(view).every((input) => /readonly=""/i.test(input))).toBe(true);
  expect(inputs(view).some((input) => input.includes("disabled"))).toBe(false);
  expect(fields(view)).toEqual(fields(edit));
  expect(view).not.toContain('type="number"');
});

it.each([false, true])(
  "locks structured rule fields with separateThemeColors=%s without changing their editor structure",
  (separateThemeColors) => {
    const value = {
      ...rule,
      separateThemeColors,
      lightColors: { foreground: "#111827", background: "#fef08a" },
      darkColors: { foreground: "#ffffff", background: "#713f12" },
    };
    const view = markup(
      <RuleFields draft={value} readOnly onChange={vi.fn()} />,
    );
    const edit = markup(<RuleFields draft={value} onChange={vi.fn()} />);
    const visibleInputs = inputs(view).filter(
      (input) => !input.includes('type="hidden"'),
    );
    expect(visibleInputs.every((input) => /readonly=""/i.test(input))).toBe(
      true,
    );
    expect(visibleInputs.some((input) => input.includes("disabled"))).toBe(
      false,
    );
    expect(fields(view)).toEqual(fields(edit));
    expect(view).toContain('value="/request/status"');
    expect(view).toContain('value="ERROR|timeout"');
    expect(view).not.toContain('type="number"');
  },
);

it("rejects attempted read-only switch changes and unlocks the same field for editing", () => {
  const onChange = vi.fn();
  const view = ProfileFields({ draft: profile, readOnly: true, onChange });
  const input = field(view, "Ignore case in log group pattern");
  const preventDefault = vi.fn();
  input.props.onClick?.({ preventDefault });
  input.props.onChange({ currentTarget: { checked: false } });
  expect(onChange).not.toHaveBeenCalled();
  expect(preventDefault).toHaveBeenCalledOnce();
  const edit = ProfileFields({ draft: profile, onChange });
  field(edit, "Ignore case in log group pattern").props.onChange({
    currentTarget: { checked: false },
  });
  expect(onChange).toHaveBeenCalledExactlyOnceWith({ groupIgnoreCase: false });
});

it("keeps the eye dropper visible in read-only color fields on supported hosts", () => {
  const view = markup(<RuleFields draft={rule} readOnly onChange={vi.fn()} />);
  expect(view.match(/<button\b/g)).toHaveLength(2);
  expect(view.match(/<button\b[^>]*aria-hidden="true"/g)).toHaveLength(2);
});

it("rejects read-only rule changes and unlocks its selects, text, and switches", () => {
  const onChange = vi.fn();
  const view = RuleFields({ draft: rule, readOnly: true, onChange });
  const changes = [
    ["Search in", "text"],
    ["Highlight", "text"],
    ["JSON Pointer path", { currentTarget: { value: "/response/status" } }],
    ["Match regex", { currentTarget: { value: "success" } }],
    ["Ignore case", { currentTarget: { checked: false } }],
    ["Separate light and dark colors", { currentTarget: { checked: true } }],
  ] as const;
  for (const [label, value] of changes)
    field(view, label).props.onChange(value);
  expect(onChange).not.toHaveBeenCalled();
  const edit = RuleFields({ draft: rule, onChange });
  for (const [label, value] of changes)
    field(edit, label).props.onChange(value);
  expect(onChange.mock.calls).toEqual([
    [{ scope: "text" }],
    [{ target: "text" }],
    [{ path: "/response/status" }],
    [{ pattern: "success" }],
    [{ ignoreCase: false }],
    [
      {
        separateThemeColors: true,
        lightColors: { foreground: "#111827", background: "#fef08a" },
        darkColors: { foreground: "#ffffff", background: "#713f12" },
      },
    ],
  ]);
});

it("validates matching patterns, structured paths, and both theme palettes without priority", () => {
  expect(profileDraftError(profile)).toBeUndefined();
  expect(profileDraftError({ ...profile, groupPattern: "[" })).toBeTruthy();
  expect(ruleDraftError(rule)).toBeUndefined();
  expect(ruleDraftError({ ...rule, pattern: "[" })).toBeTruthy();
  expect(ruleDraftError({ ...rule, path: "request/status" })).toBeTruthy();
  expect(ruleDraftError({ ...rule, path: "/bad~escape" })).toBeTruthy();
  expect(ruleDraftError({ ...rule, path: "/a~1b/~0status" })).toBeUndefined();
  expect(
    ruleDraftError({ ...rule, colors: { foreground: "#12" } }),
  ).toBeTruthy();
  expect(
    ruleDraftError({
      ...rule,
      separateThemeColors: true,
      lightColors: { foreground: "#111827" },
      darkColors: { background: "#12" },
    }),
  ).toBeTruthy();
});
