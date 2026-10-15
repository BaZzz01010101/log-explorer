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
function Harness({ timezone = "utc" }: { timezone?: Preferences["timezone"] }) {
  const [tab, setTab] = useState(createWorkspace().tabs[0]);
  return (
    <TimeRangePicker
      tab={tab}
      timezone={timezone}
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

it("commits a relative choice immediately and clears it without keeping absolute bounds", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await act(async () => element("Time range").props.onClick());
  const relative = renderer!.root
    .findAllByType("button")
    .find((node) => node.children.includes("Last 5 minutes"))!;
  await act(async () => relative.props.onClick());
  expect(patched).toHaveBeenLastCalledWith({ timePreset: "5m" });
  await act(async () => element("Clear time filter").props.onClick());
  expect(patched).toHaveBeenLastCalledWith({
    timePreset: "clear",
    customStart: undefined,
    customEnd: undefined,
  });
});

it("keeps invalid edits as drafts and automatically commits a valid absolute pair in UTC", async () => {
  await act(async () => {
    renderer = create(<Harness />);
  });
  await act(async () => element("Time range").props.onClick());
  await act(async () =>
    element("Range start").props.onChange({
      currentTarget: { value: "2099-10-15T10:00" },
    }),
  );
  expect(patched).not.toHaveBeenCalled();
  expect(element("Range start").props.value).toBe("2099-10-15T10:00");
  await act(async () =>
    element("Range end").props.onChange({
      currentTarget: { value: "2099-10-15T11:00" },
    }),
  );
  expect(patched).toHaveBeenCalledExactlyOnceWith({
    timePreset: "custom",
    customStart: "2099-10-15T10:00:00.000Z",
    customEnd: "2099-10-15T11:00:00.000Z",
  });
  await act(async () => renderer!.update(<Harness timezone="local" />));
  expect(element("Range start").props.value).toBe("2099-10-15T12:00:00");
  expect(patched).toHaveBeenCalledTimes(1);
});
