import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useInactivitySleep } from "../src/renderer/useInactivitySleep";

const MINUTE = 60_000;
let target: EventTarget;
let focused: boolean;
let asleep: boolean;
let renderer: ReactTestRenderer;

function Harness({
  background = 5,
  idle = 15,
}: {
  background?: number;
  idle?: number;
}) {
  asleep = useInactivitySleep(background, idle);
  return null;
}
const input = (type: string, at = 0) =>
  act(async () => {
    target.dispatchEvent(
      Object.assign(new Event(type), { screenX: at, screenY: 0 }),
    );
  });
const focus = (value: boolean) => {
  focused = value;
  return input(value ? "focus" : "blur");
};
const wait = (minutes: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(minutes * MINUTE);
  });
async function mount(props: { background?: number; idle?: number } = {}) {
  await act(async () => {
    renderer = create(<Harness {...props} />);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  target = new EventTarget();
  focused = true;
  vi.stubGlobal("window", target);
  vi.stubGlobal("document", { hasFocus: () => focused });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("sleeps after the idle time and wakes on any input", async () => {
  await mount();
  await wait(10);
  await input("keydown");
  await wait(14);
  expect(asleep).toBe(false);
  await wait(1);
  expect(asleep).toBe(true);
  await input("pointermove", 1);
  expect(asleep).toBe(false);
  await wait(15);
  expect(asleep).toBe(true);
  // Content scrolling under a still pointer.
  await input("pointermove", 1);
  expect(asleep).toBe(true);
  await input("wheel");
  expect(asleep).toBe(false);
});

it("uses the background time and wakes when activated", async () => {
  await mount();
  await wait(10);
  await focus(false);
  await wait(4);
  expect(asleep).toBe(false);
  // Moving over an unfocused window is activity.
  await input("pointermove", 1);
  await wait(4);
  expect(asleep).toBe(false);
  await wait(1);
  expect(asleep).toBe(true);
  await focus(true);
  expect(asleep).toBe(false);
  await wait(14);
  expect(asleep).toBe(false);
});

it("stays asleep when another application takes the focus", async () => {
  await mount();
  await wait(15);
  await focus(false);
  expect(asleep).toBe(true);
});

it("never sleeps at 0 and applies a changed time", async () => {
  await mount({ idle: 0 });
  await wait(1000);
  expect(asleep).toBe(false);
  await focus(false);
  await wait(5);
  expect(asleep).toBe(true);
  await act(async () => renderer.update(<Harness background={0} idle={0} />));
  expect(asleep).toBe(false);
});
