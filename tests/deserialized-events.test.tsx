import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDeserializedEvents } from "../src/renderer/useDeserializedEvents";
import { getPointer, parseLogMessage } from "../src/shared/log-data";
import type { LogEvent } from "../src/shared/contracts";
const event: LogEvent = {
  id: "event-a",
  timestamp: 1,
  logGroup: "/group",
  logStream: "stream",
  message: JSON.stringify({ payload: '{"value":7,"nested":"[1,2]"}' }),
};
const prepare = (item: LogEvent) => ({
  event: item,
  parsed: parseLogMessage(item.message),
  level: "info" as const,
});
let renderer: ReactTestRenderer;
let result: ReturnType<typeof useDeserializedEvents>;
function Probe({ events }: { events: LogEvent[] }) {
  result = useDeserializedEvents(events, prepare);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps decoded fields local to their event and current view, while retaining raw messages and stable rows during arrivals", async () => {
  await act(async () => {
    renderer = create(<Probe events={[event]} />);
  });
  await act(async () => result.deserialize(event, "/payload"));
  const decoded = result.rows[0];
  expect(getPointer(decoded.parsed.value, "/payload/value")).toBe(7);
  expect(decoded.event.message).toBe(event.message);
  expect(result.pathsFor(event)?.has("/payload")).toBe(true);
  const next = { ...event, id: "event-b" };
  await act(async () => renderer.update(<Probe events={[event, next]} />));
  expect(result.rows[0]).toBe(decoded);
  expect(typeof getPointer(result.rows[1].parsed.value, "/payload")).toBe(
    "string",
  );
  await act(async () => result.deserialize(event, "/payload/nested"));
  expect(getPointer(result.rows[0].parsed.value, "/payload/nested/1")).toBe(2);
  await act(async () => renderer.unmount());
  await act(async () => {
    renderer = create(<Probe events={[event]} />);
  });
  expect(typeof getPointer(result.rows[0].parsed.value, "/payload")).toBe(
    "string",
  );
});
it("discards a projection when the same event ID arrives with a new message", async () => {
  await act(async () => {
    renderer = create(<Probe events={[event]} />);
  });
  await act(async () => result.deserialize(event, "/payload"));
  const changed = { ...event, message: '{"payload":"invalid"}' };
  await act(async () => renderer.update(<Probe events={[changed]} />));
  expect(result.rows[0].parsed.value).toEqual({ payload: "invalid" });
  expect(result.pathsFor(changed)).toBeUndefined();
});
