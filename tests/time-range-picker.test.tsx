import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TimeRangePicker } from "../src/renderer/components/TimeRangePicker";
import { createWorkspace } from "../src/renderer/workspace";
import type { Preferences } from "../src/shared/contracts";

vi.mock("@mantine/core", async () => {
  const { createElement } = await import("react");
  const component = ({ children, ...props }: Record<string, unknown>) =>
    createElement("div", props, children as ReactNode);
  const button = ({ children, ...props }: Record<string, unknown>) =>
    createElement("button", props, children as ReactNode);
  return {
    Button: button,
    Group: component,
    Select: component,
    SimpleGrid: component,
    Stack: component,
    Text: component,
    TextInput: component,
    Popover: Object.assign(component, {
      Target: component,
      Dropdown: component,
    }),
    Tabs: Object.assign(component, {
      List: component,
      Tab: component,
      Panel: component,
    }),
  };
});

let renderer: ReactTestRenderer | undefined;
const patched = vi.fn();
function Harness({
  timezone = "utc",
  relativeTimeTemplates,
  onOpenTimeRangeSettings,
}: {
  timezone?: Preferences["timezone"];
  relativeTimeTemplates?: Preferences["relativeTimeTemplates"];
  onOpenTimeRangeSettings?(): void;
}) {
  const [tab, setTab] = useState(createWorkspace().tabs[0]);
  return (
    <TimeRangePicker
      tab={tab}
      timezone={timezone}
      relativeTimeTemplates={relativeTimeTemplates}
      onOpenTimeRangeSettings={onOpenTimeRangeSettings}
      onTimezoneChange={() => {}}
      onPatch={(patch) => {
        patched(patch);
        setTab((previous) => ({ ...previous, ...patch }));
      }}
    />
  );
}
const element = (label: string) =>
  renderer!.root
    .findAllByProps({ "aria-label": label })
    .find((node) => typeof node.type === "string")!;
beforeEach(() => {
  patched.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("TZ", "Europe/Madrid");
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("stages a relative choice until Apply and clears it without keeping absolute bounds", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await act(async () => element("Time range").props.onClick());
  const relative = element("Last 5 minutes");
  await act(async () => relative.props.onClick());
  expect(patched).not.toHaveBeenCalled();
  await act(async () =>
    renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(patched).toHaveBeenLastCalledWith({ timePreset: "5m" });
  await act(async () => element("Recent logs").props.onClick());
  expect(patched).toHaveBeenLastCalledWith({
    timePreset: "clear",
    customStart: undefined,
    customEnd: undefined,
  });
});

it("highlights an applied custom relative range and transfers selection to a shortcut", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await act(async () => element("Time range").props.onClick());
  await act(async () => element("Last 2 hours").props.onClick());
  expect(patched).not.toHaveBeenCalled();
  await act(async () =>
    renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(patched).toHaveBeenLastCalledWith({ timePreset: "2h" });
  expect(element("Time range").props["aria-pressed"]).toBe(true);
  expect(element("Recent logs").props["aria-pressed"]).toBe(false);
  await act(async () => element("Set last 5 minutes").props.onClick());
  expect(patched).toHaveBeenLastCalledWith({ timePreset: "5m" });
  expect(element("Time range").props["aria-pressed"]).toBe(false);
  expect(element("Set last 5 minutes").props["aria-pressed"]).toBe(true);
});

it.each([
  ["Set last 5 minutes", "5m"],
  ["Set last 1 day", "1d"],
])("applies the %s shortcut immediately", async (name, preset) => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  expect(element(name)).toBeDefined();
  await act(async () => element(name).props.onClick());
  expect(patched).toHaveBeenCalledExactlyOnceWith({ timePreset: preset });
  expect(element(name).props["aria-pressed"]).toBe(true);
  expect(element("Time range").props["aria-pressed"]).toBe(false);
});

it("keeps separate date/time edits as drafts until Apply commits a valid absolute pair", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await act(async () => element("Time range").props.onClick());
  await act(async () =>
    renderer!.root
      .findAll(
        (node) =>
          typeof node.type === "string" &&
          node.props.value === "relative" &&
          typeof node.props.onChange === "function",
      )[0]
      .props.onChange("absolute"),
  );
  await act(async () =>
    element("Start date").props.onChange({
      currentTarget: { value: "2099/10/15" },
    }),
  );
  expect(patched).not.toHaveBeenCalled();
  expect(element("Start date").props.value).toBe("2099/10/15");
  await act(async () =>
    element("End date").props.onChange({
      currentTarget: { value: "2099/10/15" },
    }),
  );
  await act(async () =>
    element("Start time").props.onChange({
      currentTarget: { value: "10:00:00" },
    }),
  );
  await act(async () =>
    element("End time").props.onChange({
      currentTarget: { value: "11:00:00" },
    }),
  );
  expect(patched).not.toHaveBeenCalled();
  await act(async () =>
    renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(patched).toHaveBeenCalledExactlyOnceWith({
    timePreset: "custom",
    customStart: "2099-10-15T10:00:00.000Z",
    customEnd: "2099-10-15T11:00:00.000Z",
  });
  await act(async () => renderer!.update(<Harness timezone="local" />));
  await act(async () => element("Time range").props.onClick());
  expect(element("Start time").props.value).toBe("12:00:00");
  expect(patched).toHaveBeenCalledTimes(1);
  expect(element("Recent logs")).toBeDefined();
  expect(element("Time range").props["aria-pressed"]).toBe(true);
  await act(async () => element("Recent logs").props.onClick());
  expect(patched).toHaveBeenLastCalledWith({
    timePreset: "clear",
    customStart: undefined,
    customEnd: undefined,
  });
  expect(element("Time range").props["aria-pressed"]).toBe(false);
});

it("uses numeric shortcuts grouped by scale after migrating configured templates", async () => {
  await act(async () => {
    renderer = create(
      <Harness
        relativeTimeTemplates={{
          quick: [{ id: "shift", label: "Shift", duration: 8, unit: "h" }],
          dropdown: [
            { id: "fortnight", label: "Fortnight", duration: 2, unit: "w" },
            { id: "break", label: "Break", duration: 20, unit: "m" },
          ],
        }}
      />,
    );
  });
  expect(element("Set last 8 hours")).toBeDefined();
  await act(async () => element("Set last 8 hours").props.onClick());
  expect(patched).toHaveBeenLastCalledWith({ timePreset: "8h" });
  await act(async () => element("Time range").props.onClick());
  const rows = renderer!.root.findAllByProps({
    className: "relative-range-row",
  });
  expect(
    rows.map((row) =>
      row.findAllByType("button").map((button) => button.props.children),
    ),
  ).toEqual([
    [5, 10, 15, 20, 30],
    [1, 2, 3, 6, 8, 12],
    [1, 2, 3, 4, 5, 6],
    [1, 2, 3, 4],
  ]);
  await act(async () => element("Last 2 weeks").props.onClick());
  expect(patched).toHaveBeenCalledTimes(1);
  await act(async () =>
    renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }),
  );
  expect(patched).toHaveBeenLastCalledWith({ timePreset: "2w" });
});

it("opens time-range settings from the dropdown without applying a draft", async () => {
  const openSettings = vi.fn();
  await act(async () => {
    renderer = create(<Harness onOpenTimeRangeSettings={openSettings} />);
  });
  await act(async () => element("Time range").props.onClick());
  const gear = element("Time range settings");
  expect(gear.props.children.type).toBeDefined();
  expect(gear.parent?.props.className).toBe("time-range-mode-list");
  await act(async () => element("Time range settings").props.onClick());
  expect(openSettings).toHaveBeenCalledOnce();
  expect(patched).not.toHaveBeenCalled();
});
