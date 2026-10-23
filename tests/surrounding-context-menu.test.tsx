import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Menu, MENU_OPEN_EVENT } from "../src/renderer/components/AppMenu";
import { SurroundingContextMenu } from "../src/renderer/components/SurroundingContextMenu";
import type { LogEvent } from "../src/shared/contracts";

vi.mock("@mantine/core", () => {
  const Sub = Object.assign(
    ({ children }: any) => <section data-submenu="">{children}</section>,
    {
      Target: ({ children }: any) => children,
      Item: (props: any) => <button {...props} />,
      Dropdown: (props: any) => <div {...props} data-sub-dropdown="" />,
    },
  );
  return {
    Menu: Object.assign(
      ({ children }: any) => <section data-menu="">{children}</section>,
      {
        Target: ({ children }: any) => children,
        ContextMenu: ({ children }: any) => children,
        Dropdown: (props: any) => <div {...props} data-root-dropdown="" />,
        Item: (props: any) => <button {...props} />,
        Label: (props: any) => <label {...props} />,
        Divider: () => <hr />,
        Sub,
      },
    ),
  };
});

class MenuElement {
  constructor(private readonly owner: string | null) {}
  closest() {
    return this;
  }
  getAttribute() {
    return this.owner;
  }
  hasAttribute() {
    return false;
  }
}

let renderer: ReactTestRenderer;
let documentEvents: EventTarget;
let windowEvents: EventTarget;
const event: LogEvent = {
  id: "selected-event",
  timestamp: 123456789,
  connectionId: "profile-region",
  logGroup: "/aws/lambda/service",
  logStream: "selected-stream",
  message: "message",
};

beforeEach(() => {
  documentEvents = new EventTarget();
  windowEvents = new EventTarget();
  vi.stubGlobal("document", documentEvents);
  vi.stubGlobal("window", windowEvents);
  vi.stubGlobal("Element", MenuElement);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(
  selected = event,
  onContext = vi.fn(),
  onSelect = vi.fn(),
  onChange = vi.fn(),
) {
  await act(async () => {
    renderer = create(
      <Menu opened onChange={onChange}>
        <Menu.Target>
          <button>Event row</button>
        </Menu.Target>
        <Menu.Dropdown>
          <SurroundingContextMenu
            event={selected}
            onContext={onContext}
            onSelect={onSelect}
          />
        </Menu.Dropdown>
      </Menu>,
    );
  });
  return { onContext, onSelect, onChange };
}

it("keeps both submenu levels under the same singleton owner", async () => {
  const opened = vi.fn();
  windowEvents.addEventListener(MENU_OPEN_EVENT, opened);
  await mount();
  const dropdowns = renderer.root.findAll(
    (node) => node.type === "div" && node.props["data-app-menu-id"],
  );
  expect(dropdowns).toHaveLength(5);
  expect(
    new Set(dropdowns.map((node) => node.props["data-app-menu-id"])).size,
  ).toBe(1);
  expect(renderer.root.findAllByProps({ "data-menu": "" })).toHaveLength(1);
  expect(opened).toHaveBeenCalledTimes(1);
});

it("opens the selected event with each direction and calls the selection callback", async () => {
  const { onContext, onSelect } = await mount();
  const choices = renderer.root.findAll(
    (node) => node.type === "button" && node.props.children === "5 seconds",
  );
  expect(choices).toHaveLength(3);
  for (const [index, direction] of ["past", "future", "both"].entries()) {
    await act(async () => choices[index].props.onClick());
    expect(onContext).toHaveBeenLastCalledWith(event, {
      direction,
      durationMs: 5000,
    });
  }
  expect(onSelect).toHaveBeenCalledTimes(3);
});

it.each(["logGroup", "logStream"] as const)(
  "disables context without %s",
  async (field) => {
    const { onContext } = await mount({ ...event, [field]: "" });
    const trigger = renderer.root.findAll(
      (node) =>
        node.type === "button" && node.props.children === "Surrounding context",
    )[0];
    expect(trigger.props.disabled).toBe(true);
    expect(trigger.props["data-tooltip"]).toContain("no source stream");
    const choice = renderer.root.findAll(
      (node) => node.type === "button" && node.props.children === "1 second",
    )[0];
    await act(async () => choice.props.onClick());
    expect(onContext).not.toHaveBeenCalled();
  },
);

it("retains the root for submenu clicks and dismisses it for outside clicks or another menu", async () => {
  const { onChange } = await mount();
  const dropdown = renderer.root.findAll(
    (node) => node.type === "div" && node.props["data-sub-dropdown"] === "",
  )[0];
  const pointer = new Event("pointerdown");
  Object.defineProperty(pointer, "target", {
    value: new MenuElement(dropdown.props["data-app-menu-id"]),
  });
  await act(async () => {
    documentEvents.dispatchEvent(pointer);
  });
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => {
    documentEvents.dispatchEvent(new Event("pointerdown"));
  });
  expect(onChange).toHaveBeenLastCalledWith(false);
  onChange.mockClear();
  await act(async () => {
    windowEvents.dispatchEvent(
      new CustomEvent(MENU_OPEN_EVENT, { detail: "another-menu" }),
    );
  });
  expect(onChange).toHaveBeenLastCalledWith(false);
});
