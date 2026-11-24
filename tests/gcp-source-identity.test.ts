import { expect, it } from "vitest";
import type { Connection, GcpSource } from "../src/shared/contracts";
import { querySchema } from "../src/main/security";
import { gcpResourceToLogSource } from "../src/renderer/gcp-open";
import {
  eventSourceDisplay,
  hiddenSourcePredicate,
  sourceBadgeKey,
} from "../src/shared/source-labels";
import { sourceIdentity } from "../src/shared/source-identity";
import { mergeSources } from "../src/shared/source-management";
import {
  createTab,
  createWorkspace,
  workspaceReducer,
} from "../src/shared/workspace";

const connection: Connection = {
  id: "g",
  name: "Google Cloud",
  profile: "work",
  region: "europe-west1",
  mode: "gcp",
  gcpIdentity: { configuration: "work", account: "me" },
};
const opened = gcpResourceToLogSource({
  kind: "kubernetes",
  label: "/gcp/kubernetes/orders",
  project: "demo-123",
  region: "europe-west1",
  cluster: "main",
  namespace: "shop",
  container: "orders",
} as GcpSource);
// A validated copy, as the main process and saved workspaces have it.
const validated = querySchema.parse({
  requestId: "1",
  connection,
  sources: [opened],
  startTime: 1,
  endTime: 2,
  kind: "events",
  filterPattern: "",
  query: "",
  limit: 1,
}).sources[0];

it("treats a freshly opened and a validated Google Cloud source as the same", () => {
  expect(JSON.stringify(validated.gcp)).not.toBe(JSON.stringify(opened.gcp));
  expect(sourceIdentity("g", [opened], connection)).toBe(
    sourceIdentity("g", [validated], connection),
  );
  expect(sourceBadgeKey(opened, undefined, "g")).toBe(
    sourceBadgeKey(validated, undefined, "g"),
  );
  expect(mergeSources([validated], [opened], "g")).toHaveLength(1);
});

it("hides and names events of a freshly opened Google Cloud source", () => {
  const event = {
    id: "1",
    timestamp: 1,
    message: "",
    logGroup: opened.logGroup,
    logStream: "pod-1",
    connectionId: "g",
    gcpSource: validated.gcp,
  };
  const hidden = hiddenSourcePredicate(
    [opened],
    [sourceBadgeKey(opened, undefined, "g")],
    "g",
  )!;
  expect(hidden(event)).toBe(true);
  expect(hidden({ ...event, logGroup: "/other" })).toBe(false);
  expect(eventSourceDisplay(event, [opened], [connection], "g").label).toBe(
    "orders · main",
  );
});

it("shows the open tab of a Google Cloud source instead of opening it twice", () => {
  let state = createWorkspace();
  state = workspaceReducer(state, {
    type: "connections/set",
    connections: [...state.connections, connection],
  });
  state = workspaceReducer(state, {
    type: "tab/open",
    tab: createTab("g", [validated]),
  });
  const next = workspaceReducer(state, {
    type: "tab/open-resource",
    tab: createTab("g", [opened]),
  });
  expect(next.tabs).toHaveLength(state.tabs.length);
});
