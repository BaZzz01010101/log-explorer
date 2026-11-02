import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ViewConfig } from "../src/shared/contracts";
import { useMessageExpansion } from "../src/renderer/useMessageExpansion";

let renderer: ReactTestRenderer;
let expansion: ReturnType<typeof useMessageExpansion>;
function Harness({ mode }: { mode: ViewConfig["mode"] }) {
  expansion = useMessageExpansion(mode);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original = console.error.bind(console);
  vi.spyOn(console, "error").mockImplementation((...args) => {
    if (!String(args[0]).startsWith("react-test-renderer is deprecated"))
      original(...args);
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mode(value: ViewConfig["mode"], initial = false) {
  await act(async () => {
    if (initial) renderer = create(<Harness mode={value} />);
    else renderer.update(<Harness mode={value} />);
  });
}
it("starts JSON at first-level fields and Table and Hybrid at their collapsed defaults", async () => {
  await mode("json", true);
  expect(expansion.isExpanded("event-1")).toBe(false);
  await mode("table");
  expect(expansion.isExpanded("event-1")).toBe(false);
  await mode("hybrid");
  expect(expansion.isExpanded("event-1")).toBe(false);
});
it("unfolds all current and future messages, then folds them all", async () => {
  await mode("hybrid", true);
  await act(async () => expansion.toggleAll());
  expect(expansion.isExpanded("loaded-event")).toBe(true);
  expect(expansion.isExpanded("next-page-event")).toBe(true);
  await act(async () => expansion.toggleAll());
  expect(expansion.isExpanded("loaded-event")).toBe(false);
  expect(expansion.isExpanded("next-page-event")).toBe(false);
});
it("keeps individual exceptions and clears them on an all-message choice", async () => {
  await mode("json", true);
  await act(async () => expansion.toggleAll());
  await act(async () => expansion.toggle("event-1"));
  expect(expansion.isExpanded("event-1")).toBe(false);
  expect(expansion.isExpanded("event-2")).toBe(true);
  await act(async () => expansion.toggleAll());
  expect(expansion.isExpanded("event-1")).toBe(false);
  expect(expansion.isExpanded("event-2")).toBe(false);
  await act(async () => expansion.toggle("event-1"));
  expect(expansion.isExpanded("event-1")).toBe(true);
  await act(async () => expansion.toggleAll());
  expect(expansion.isExpanded("event-1")).toBe(true);
  expect(expansion.isExpanded("event-2")).toBe(true);
});
it("preserves each mode's expansion choice and exceptions while switching", async () => {
  await mode("table", true);
  await act(async () => expansion.toggleAll());
  await act(async () => expansion.toggle("event-1"));
  await mode("hybrid");
  expect(expansion.isExpanded("event-2")).toBe(false);
  await mode("json");
  await act(async () => expansion.toggleAll());
  await mode("table");
  expect(expansion.isExpanded("event-1")).toBe(false);
  expect(expansion.isExpanded("event-2")).toBe(true);
  await mode("json");
  expect(expansion.isExpanded("event-2")).toBe(true);
});
