import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EventLoadingIndicator } from "../src/renderer/components/EventLoadingIndicator";
import { EventStatus } from "../src/renderer/components/EventStatus";
import type { TabRuntime } from "../src/renderer/useLogJobs";

function status(runtime?: Partial<TabRuntime>, shown = 12, loaded = 12) {
  return renderToStaticMarkup(
    <EventStatus
      runtime={
        runtime
          ? {
              events: [],
              state: "complete",
              live: false,
              evicted: 0,
              ...runtime,
            }
          : undefined
      }
      eventsShown={shown}
      eventsLoaded={loaded}
    />,
  );
}

function text(markup: string) {
  return markup.replace(/<[^>]*>/g, "");
}

it("combines loaded counts and timing without decorating a completed query", () => {
  const markup = status({ stats: { elapsedMs: 1250 } });
  expect(markup).toContain('class="query-status event-status"');
  expect(markup).toContain('data-query-state="complete"');
  expect(text(markup)).toBe("12 loaded1.3s");
  expect(text(status(undefined, 0, 0))).toBe("0 loaded");
});

it("keeps the visible and loaded counts distinct when local filters hide events", () => {
  expect(text(status({}, 3, 12))).toBe("3 shown / 12 loaded");
  expect(text(status({}, 0, 12))).toBe("0 shown / 12 loaded");
});

it.each([
  ["queued", false, "Queued"],
  ["running", false, "Loading events"],
  ["running", true, "Live stream"],
  ["complete", true, "Live stream stopped"],
  ["cancelled", false, "Cancelled"],
  ["error", false, "Query failed"],
] as const)("retains meaningful %s state for live=%s", (state, live, label) => {
  const markup = status({ state, live });
  expect(markup).toContain(`data-query-state="${state}"`);
  expect(text(markup)).toContain(label);
});

it("keeps scan metrics available with filtered counts", () => {
  const markup = status(
    { stats: { bytesScanned: 1572864, recordsScanned: 50, elapsedMs: 2400 } },
    3,
    12,
  );
  expect(text(markup)).toBe(
    "3 shown / 12 loaded1.50 MiB scanned50 scanned2.4s",
  );
});

it("distinguishes Live connection, an active stream and a stopped session", () => {
  expect(
    text(status({ state: "running", live: true, liveState: "connecting" })),
  ).toContain("Connecting to Live Tail");
  expect(
    text(
      status(
        {
          state: "running",
          live: true,
          liveState: "streaming",
          liveReceived: 2,
        },
        12,
        12,
      ),
    ),
  ).toBe("Live stream · connected12 loaded2 new in this session");
  expect(
    text(
      status({
        state: "cancelled",
        live: false,
        liveState: "stopped",
        liveReceived: 2,
      }),
    ),
  ).toContain("Live stopped");
});

it.each(["empty", "more"] as const)(
  "gives the %s loading indicator an accessible label and placement",
  (position) => {
    const markup = renderToStaticMarkup(
      <EventLoadingIndicator position={position} />,
    );
    expect(markup).toContain(`event-loading-${position}`);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Loading events"');
  },
);
