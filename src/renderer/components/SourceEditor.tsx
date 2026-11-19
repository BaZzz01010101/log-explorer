import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import type { Connection, GcpSource, LogSource } from "../../shared/contracts";
import { discoverGcpSources } from "../gcp-source-scan";
import { gcpResourceToLogSource } from "../gcp-open";
import { gcpErrorMessage } from "../gcp-errors";

export interface SourceEdit {
  source: LogSource;
  /** A Google Cloud connection the workspace must register first. */
  connection?: Connection;
}

/**
 * Edits one source badge: an AWS log group (and stream) with its region, or a
 * Google Cloud function or container with its cluster. Save checks that the
 * edited source exists before it changes the view.
 */
export function SourceEditor({
  source,
  stream,
  connectionId,
  connections,
  onClose,
  onSave,
}: {
  source: LogSource;
  stream?: string;
  connectionId: string;
  connections: Connection[];
  onClose(): void;
  onSave(edit: SourceEdit): void;
}) {
  const connection = connections.find(
    (item) => item.id === (source.connectionId ?? connectionId),
  );
  const gcp = source.gcp;
  return (
    <Modal
      opened
      onClose={onClose}
      title={gcp ? "Edit Google Cloud source" : "Edit source"}
      size="sm"
    >
      {!connection ? (
        <Text size="sm" c="red" role="alert">
          This source's connection no longer exists.
        </Text>
      ) : gcp ? (
        <GcpSourceForm
          source={source}
          connection={connection}
          connections={connections}
          onClose={onClose}
          onSave={onSave}
        />
      ) : (
        <AwsSourceForm
          source={source}
          stream={stream}
          connection={connection}
          connections={connections}
          onClose={onClose}
          onSave={onSave}
        />
      )}
    </Modal>
  );
}

function Actions({
  busy,
  disabled,
  onClose,
}: {
  busy: boolean;
  disabled: boolean;
  onClose(): void;
}) {
  return (
    <Group justify="flex-end" mt="md">
      <Button variant="default" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" loading={busy} disabled={disabled}>
        Save
      </Button>
    </Group>
  );
}

function AwsSourceForm({
  source,
  stream,
  connection,
  connections,
  onClose,
  onSave,
}: {
  source: LogSource;
  stream?: string;
  connection: Connection;
  connections: Connection[];
  onClose(): void;
  onSave(edit: SourceEdit): void;
}) {
  const [group, setGroup] = useState(source.logGroup);
  const [streamName, setStreamName] = useState(stream ?? "");
  const [target, setTarget] = useState(connection.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Regions come from the connections of the same profile.
  const regions = useMemo(() => {
    const seen = new Set<string>();
    return connections
      .filter(
        (item) =>
          item.mode === connection.mode && item.profile === connection.profile,
      )
      .filter((item) =>
        item.id === connection.id || !seen.has(item.region)
          ? (seen.add(item.region), true)
          : false,
      )
      .map((item) => ({ value: item.id, label: item.region }));
  }, [connections, connection]);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const submit = async () => {
    const name = group.trim();
    const streamValue = streamName.trim();
    const region = connections.find((item) => item.id === target);
    if (!name || !region || (stream !== undefined && !streamValue)) return;
    setBusy(true);
    setError("");
    try {
      const groups = await window.explorer.listGroups(
        region,
        name,
        undefined,
        true,
      );
      if (!groups.items.some((item) => item.name === name))
        throw new Error(
          `Log group "${name}" was not found in ${region.region}.`,
        );
      if (stream !== undefined) {
        const streams = await window.explorer.listStreams(
          region,
          name,
          streamValue,
          undefined,
          true,
        );
        if (!streams.items.some((item) => item.name === streamValue))
          throw new Error(
            `Log stream "${streamValue}" was not found in ${name}.`,
          );
      }
      if (!live.current) return;
      onSave({
        source: {
          connectionId: region.id,
          logGroup: name,
          ...(stream !== undefined ? { logStreams: [streamValue] } : {}),
        },
      });
    } catch (failure) {
      if (live.current)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextInput
        label="Log group"
        data-autofocus
        maxLength={512}
        value={group}
        onChange={(event) => {
          setGroup(event.currentTarget.value);
          setError("");
        }}
      />
      {stream !== undefined && (
        <TextInput
          mt="sm"
          label="Log stream"
          maxLength={512}
          value={streamName}
          onChange={(event) => {
            setStreamName(event.currentTarget.value);
            setError("");
          }}
        />
      )}
      <Select
        mt="sm"
        label="Region"
        description={`Regions added for profile ${connection.profile}`}
        data={regions}
        value={target}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
        onChange={(value) => {
          if (value) setTarget(value);
          setError("");
        }}
      />
      {error && (
        <Text size="sm" c="red" mt="sm" role="alert">
          {error}
        </Text>
      )}
      <Actions
        busy={busy}
        disabled={!group.trim() || (stream !== undefined && !streamName.trim())}
        onClose={onClose}
      />
    </form>
  );
}

function GcpSourceForm({
  source,
  connection,
  connections,
  onClose,
  onSave,
}: {
  source: LogSource;
  connection: Connection;
  connections: Connection[];
  onClose(): void;
  onSave(edit: SourceEdit): void;
}) {
  const gcp = source.gcp!;
  const kubernetes = gcp.kind === "kubernetes";
  const [name, setName] = useState(
    (kubernetes ? gcp.container : gcp.functionName) ?? "",
  );
  const [cluster, setCluster] = useState(gcp.cluster ?? "");
  const [found, setFound] = useState<GcpSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const discovery = useRef<Promise<GcpSource[]> | null>(null);
  const live = useRef(true);
  const identity = connection.gcpIdentity;
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    if (!identity) {
      setLoading(false);
      setError("This source has no Google Cloud account.");
      return;
    }
    discovery.current = discoverGcpSources(
      window.explorer,
      identity,
      gcp.project,
      (items) => {
        if (!controller.signal.aborted) setFound(items);
      },
      controller.signal,
    ).then((result) => {
      if (!controller.signal.aborted) setFound(result.items);
      return result.items;
    });
    discovery.current
      .catch((failure) => {
        if (!controller.signal.aborted) setError(gcpErrorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      live.current = false;
      controller.abort();
    };
  }, []);
  const clusters = useMemo(
    () =>
      [
        ...new Set([
          ...(gcp.cluster ? [gcp.cluster] : []),
          ...found
            .filter((item) => item.kind === "kubernetes" && item.cluster)
            .map((item) => item.cluster!),
        ]),
      ].sort(),
    [found, gcp.cluster],
  );
  const submit = async () => {
    const wanted = name.trim();
    if (!wanted || !discovery.current) return;
    setBusy(true);
    setError("");
    try {
      const items = await discovery.current;
      const matches = items.filter((item) =>
        kubernetes
          ? item.kind === "kubernetes" &&
            item.container === wanted &&
            item.cluster === cluster
          : item.kind === "function" && item.label.split("/").at(-1) === wanted,
      );
      const match =
        matches.find((item) =>
          kubernetes
            ? item.namespace === gcp.namespace
            : item.region === gcp.region,
        ) ?? matches[0];
      if (!match)
        throw new Error(
          kubernetes
            ? `Container "${wanted}" was not found in cluster ${cluster} of project ${gcp.project}.`
            : `Function "${wanted}" was not found in project ${gcp.project}.`,
        );
      const edited = gcpResourceToLogSource(match);
      const existing = connections.find(
        (item) =>
          item.mode === "gcp" &&
          item.region === match.region &&
          item.gcpIdentity?.configuration === identity?.configuration &&
          item.gcpIdentity?.account === identity?.account &&
          item.gcpIdentity?.quotaProject === identity?.quotaProject,
      );
      const created: Connection | undefined = existing
        ? undefined
        : {
            id: `gcp-${crypto.randomUUID()}`,
            name: `Google Cloud · ${match.region}`,
            profile: connection.profile,
            region: match.region,
            mode: "gcp",
            gcpIdentity: { ...identity! },
          };
      if (!live.current) return;
      onSave({
        source: { ...edited, connectionId: (existing ?? created)!.id },
        ...(created ? { connection: created } : {}),
      });
    } catch (failure) {
      if (live.current) setError(gcpErrorMessage(failure));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Text size="xs" c="dimmed" mb="xs">
        Project {gcp.project}
      </Text>
      <TextInput
        label={kubernetes ? "Container" : "Function"}
        data-autofocus
        maxLength={253}
        value={name}
        onChange={(event) => {
          setName(event.currentTarget.value);
          setError("");
        }}
      />
      {kubernetes && (
        <Select
          mt="sm"
          label="Cluster"
          data={clusters}
          value={cluster || null}
          allowDeselect={false}
          searchable
          comboboxProps={{ withinPortal: true }}
          rightSection={loading ? <Loader size={14} /> : undefined}
          onChange={(value) => {
            if (value) setCluster(value);
            setError("");
          }}
        />
      )}
      {loading && (
        <Text size="xs" c="dimmed" mt="sm" role="status">
          Loading Google Cloud sources…
        </Text>
      )}
      {error && (
        <Text size="sm" c="red" mt="sm" role="alert">
          {error}
        </Text>
      )}
      <Actions
        busy={busy}
        disabled={!name.trim() || (kubernetes && !cluster)}
        onClose={onClose}
      />
    </form>
  );
}
