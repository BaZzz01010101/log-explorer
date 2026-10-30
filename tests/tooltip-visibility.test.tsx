import { expect, it, vi } from "vitest";
import { tooltipIsRedundant } from "../src/renderer/tooltip-visibility";
import { box, sized, TooltipElement, TooltipText } from "./tooltip-dom";

it("suppresses exact whitespace-normalized visible text including ReactNode labels", () => {
  const target = sized(new TooltipElement("SPAN", "Order   ID"), 150);
  expect(tooltipIsRedundant(target.html(), <span>Order {"ID"}</span>)).toBe(
    true,
  );
  expect(
    tooltipIsRedundant(target.html(), ["Order ", <strong key="id">ID</strong>]),
  ).toBe(true);
  expect(tooltipIsRedundant(new TooltipElement("SPAN", "42").html(), 42)).toBe(
    true,
  );
  const Dynamic = vi.fn(() => <span>Generated description</span>);
  expect(tooltipIsRedundant(target.html(), <Dynamic />)).toBe(false);
  expect(Dynamic).not.toHaveBeenCalled();
});

it("keeps icon hints, extra descriptions, shortcuts and full source paths", () => {
  const icon = new TooltipElement("BUTTON");
  icon.setAttribute("aria-label", "Run");
  icon.append(new TooltipElement("SVG", "Run"));
  expect(tooltipIsRedundant(icon.html(), "Run")).toBe(false);
  const title = new TooltipElement("SPAN", "Orders");
  for (const hint of [
    "Orders · Ctrl+T",
    "Orders\nSources: orders-api",
    "/aws/lambda/Orders",
  ])
    expect(tooltipIsRedundant(title.html(), hint)).toBe(false);
});

it("ignores hidden, icon and nested control text when comparing the visible item", () => {
  const target = sized(new TooltipElement("DIV", "Orders"), 200);
  const hidden = new TooltipElement("SPAN", "Hidden note");
  hidden.style.display = "none";
  const ariaHidden = new TooltipElement("SPAN", "Hidden count");
  ariaHidden.setAttribute("aria-hidden", "true");
  target.append(
    hidden,
    ariaHidden,
    new TooltipElement("SVG", "icon title"),
    new TooltipElement("BUTTON", "Close"),
  );
  expect(tooltipIsRedundant(target.html(), "Orders")).toBe(true);
});

it("keeps a clipped descendant label even when the outer target itself fits", () => {
  const target = sized(new TooltipElement("DIV"), 300);
  const label = sized(new TooltipElement("SPAN", "Long complete title"), 70);
  label.style.overflowX = "hidden";
  label.style.textOverflow = "ellipsis";
  label.scrollWidth = 180;
  target.append(label);
  expect(tooltipIsRedundant(target.html(), "Long complete title")).toBe(false);
});

it("detects ancestor clipping through text ranges without treating every scrollable ancestor as clipped", () => {
  const parent = sized(new TooltipElement("DIV"), 80, 40);
  parent.style.overflowX = "hidden";
  const target = sized(new TooltipElement("SPAN"), 0);
  target.style.display = "inline";
  target.rect = box(0, 0, 140, 18);
  target.append(new TooltipText("Full event identifier", [box(0, 0, 140, 18)]));
  parent.append(target);
  expect(tooltipIsRedundant(target.html(), "Full event identifier")).toBe(
    false,
  );
  parent.clientWidth = 200;
  parent.rect = box(0, 0, 200, 40);
  parent.style.overflowY = "auto";
  parent.scrollHeight = 2000;
  expect(tooltipIsRedundant(target.html(), "Full event identifier")).toBe(true);
});

it("suppresses wrapped inline inspector code whose complete text is visible", () => {
  const parent = sized(new TooltipElement("DIV"), 100, 60);
  parent.style.overflowX = "hidden";
  const target = sized(new TooltipElement("CODE"), 0);
  target.style.display = "inline";
  target.rect = box(0, 0, 98, 54);
  target.append(
    new TooltipText("abcdefgh-ijklmnop-qrstuvwx", [
      box(0, 0, 98, 18),
      box(0, 18, 98, 18),
      box(0, 36, 70, 18),
    ]),
  );
  parent.append(target);
  expect(tooltipIsRedundant(target.html(), "abcdefgh-ijklmnop-qrstuvwx")).toBe(
    true,
  );
});

it("keeps line-clamped text and suppresses complete text after the clamp is removed", () => {
  const target = sized(new TooltipElement("DIV"), 100, 18);
  target.style.overflowY = "hidden";
  target.style.webkitLineClamp = "1";
  target.append(
    new TooltipText("Wrapped event identifier", [
      box(0, 0, 98, 18),
      box(0, 18, 98, 18),
    ]),
  );
  target.scrollHeight = 36;
  expect(tooltipIsRedundant(target.html(), "Wrapped event identifier")).toBe(
    false,
  );
  target.clientHeight = target.offsetHeight = target.scrollHeight = 36;
  target.rect = box(0, 0, 100, 36);
  expect(tooltipIsRedundant(target.html(), "Wrapped event identifier")).toBe(
    true,
  );
});
