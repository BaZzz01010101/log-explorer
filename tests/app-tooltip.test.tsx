import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tooltip, TextTooltips } from "../src/renderer/components/AppTooltip";
import {
  sized,
  TooltipElement,
  TooltipNode,
  tooltipDocument,
} from "./tooltip-dom";

vi.mock("@mantine/core", () => ({
  Tooltip: ({ children, ...props }: Record<string, unknown>) =>
    createElement(
      "aside",
      { ...props, "data-surface": "tooltip" },
      children as ReactNode,
    ),
}));
vi.mock("../src/renderer/components/AppMenu", () => ({
  MENU_OPEN_EVENT: "explorer:menu-open",
}));
class Mouse extends Event {
  buttons = 0;
  relatedTarget: TooltipElement | null;
  constructor(type: string, relatedTarget: TooltipElement | null = null) {
    super(type);
    this.relatedTarget = relatedTarget;
  }
}
class Focus extends Event {}
let renderer: ReactTestRenderer;
let browser: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  browser = new EventTarget();
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", tooltipDocument);
  vi.stubGlobal("Element", TooltipElement);
  vi.stubGlobal("HTMLElement", TooltipElement);
  vi.stubGlobal("Node", TooltipNode);
  vi.stubGlobal("MouseEvent", Mouse);
  vi.stubGlobal("FocusEvent", Focus);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  tooltipDocument.documentElement.dataset.inputModality = "keyboard";
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).includes("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const openHints = () =>
  renderer.root
    .findAllByProps({ "data-surface": "tooltip" })
    .filter((node) => node.props.opened);
const advance = async (ms = 450) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};
async function hover(
  target: TooltipElement,
  related: TooltipElement | null = null,
) {
  await act(async () => {
    const event = new Mouse("mouseover", related);
    Object.defineProperty(event, "target", { value: target });
    tooltipDocument.dispatchEvent(event);
  });
}
async function leave(
  target: TooltipElement,
  related: TooltipElement | null = null,
) {
  await act(async () => {
    const event = new Mouse("mouseout", related);
    Object.defineProperty(event, "target", { value: target });
    tooltipDocument.dispatchEvent(event);
  });
}
const item = (text: string, hint = text) => {
  const node = sized(new TooltipElement("SPAN", text), 200);
  node.dataset.tooltip = hint;
  return node;
};

it("checks custom ReactNode tooltip redundancy at delayed-open time and retains clipped labels", async () => {
  const target = sized(new TooltipElement("BUTTON", "Order ID"), 40);
  target.style.overflowX = "hidden";
  target.scrollWidth = 140;
  await act(async () => {
    renderer = create(
      <Tooltip label={<span>Order ID</span>}>
        <button>Order ID</button>
      </Tooltip>,
    );
  });
  await act(async () =>
    renderer.root
      .findByType("button")
      .props.onMouseEnter({ buttons: 0, currentTarget: target }),
  );
  sized(target, 200);
  await advance();
  expect(openHints()).toHaveLength(0);
  sized(target, 40);
  target.scrollWidth = 140;
  await act(async () =>
    renderer.root
      .findByType("button")
      .props.onMouseEnter({ buttons: 0, currentTarget: target }),
  );
  await advance();
  expect(openHints()).toHaveLength(1);
  expect(openHints()[0].props.interactive).toBe(true);
  expect(openHints()[0].props.classNames.tooltip).toBe("app-tooltip");
});

it("hides an already open custom tooltip when its label becomes fully redundant", async () => {
  const target = item("Orders");
  await act(async () => {
    renderer = create(
      <Tooltip label="Orders · Ctrl+T">
        <button>Orders</button>
      </Tooltip>,
    );
  });
  await act(async () =>
    renderer.root
      .findByType("button")
      .props.onMouseEnter({ buttons: 0, currentTarget: target }),
  );
  await advance();
  expect(openHints()).toHaveLength(1);
  await act(async () =>
    renderer.update(
      <Tooltip label={<strong>Orders</strong>}>
        <button>Orders</button>
      </Tooltip>,
    ),
  );
  expect(openHints()).toHaveLength(0);
});

it("suppresses delegated duplicates and still dismisses a tooltip opened by another owner", async () => {
  await act(async () => {
    renderer = create(
      <>
        <Tooltip label="Useful description">
          <button>Control</button>
        </Tooltip>
        <TextTooltips />
      </>,
    );
  });
  await act(async () =>
    renderer.root
      .findByType("button")
      .props.onMouseEnter({ buttons: 0, currentTarget: item("Control") }),
  );
  await advance();
  expect(openHints()).toHaveLength(1);
  await hover(item("Orders"));
  await advance();
  expect(openHints()).toHaveLength(0);
});

it("rechecks current delegated content and clipping before opening and on resize", async () => {
  await act(async () => {
    renderer = create(<TextTooltips />);
  });
  const target = item("Orders", "Orders · useful extra");
  await hover(target);
  target.dataset.tooltip = "Orders";
  await advance();
  expect(openHints()).toHaveLength(0);
  sized(target, 25);
  target.style.overflowX = "hidden";
  target.scrollWidth = 120;
  await hover(target);
  await advance();
  expect(openHints()).toHaveLength(1);
  sized(target, 200);
  await act(async () => {
    browser.dispatchEvent(new Event("resize"));
  });
  expect(openHints()).toHaveLength(0);
});

it("retains icon-only hints and interactive text while rapid hover shows only the newest useful hint", async () => {
  await act(async () => {
    renderer = create(<TextTooltips />);
  });
  const icon = new TooltipElement("BUTTON");
  icon.dataset.tooltip = "Run";
  icon.setAttribute("aria-label", "Run");
  await hover(icon);
  await advance();
  expect(openHints()[0].props.label).toBe("Run");
  const overlay = new TooltipElement("DIV");
  overlay.dataset.textTooltip = "";
  await leave(icon, overlay);
  await hover(overlay, icon);
  await advance(1000);
  expect(openHints()).toHaveLength(1);
  const first = item("First", "First description"),
    second = item("Second", "Second description");
  await hover(first);
  await leave(first);
  await hover(second);
  await advance();
  expect(openHints()).toHaveLength(1);
  expect(openHints()[0].props.label).toBe("Second description");
});

it("hides the current delegated owner's hint when descendant hover finds it redundant", async () => {
  await act(async () => {
    renderer = create(<TextTooltips />);
  });
  const target = item("Orders", "Orders description"),
    child = new TooltipElement("SVG");
  target.append(child);
  await hover(target);
  await advance();
  expect(openHints()).toHaveLength(1);
  target.dataset.tooltip = "Orders";
  await hover(child, target);
  expect(openHints()).toHaveLength(0);
});
