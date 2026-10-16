import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import type { Connection, LogSource, LogTab } from "../../shared/contracts";
import { mergeSources } from "../source-management";

function ResourceChoices({
  connection,
  group,
  search,
  onChoose,
}: {
  connection?: Connection;
  group?: string;
  search: string;
  onChoose(name: string): void;
}) {
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState<string>();
  const generation = useRef(0),
    seen = useRef(new Set<string>()),
    loading = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const load = async (more = false) => {
    if (!connection || loading.current || (more && !cursor)) return;
    loading.current = true;
    setBusy(true);
    setError("");
    const current = generation.current;
    try {
      const result = group
        ? await window.explorer.listStreams(
            connection,
            group,
            search,
            more ? cursor : undefined,
          )
        : await window.explorer.listGroups(
            connection,
            search,
            more ? cursor : undefined,
          );
      if (current !== generation.current) return;
      setItems((previous) =>
        [
          ...new Set([
            ...(more ? previous : []),
            ...result.items.map((item) => item.name),
          ]),
        ].slice(0, 2000),
      );
      const next =
        result.cursor && !seen.current.has(result.cursor)
          ? result.cursor
          : undefined;
      if (next) seen.current.add(next);
      setCursor(next);
    } catch (error) {
      if (current === generation.current)
        setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === generation.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    generation.current++;
    loading.current = false;
    seen.current.clear();
    setItems([]);
    setCursor(undefined);
    setError("");
    setBusy(false);
    const timer = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timer);
      generation.current++;
    };
  }, [
    connection?.id,
    connection?.region,
    connection?.profile,
    connection?.mode,
    group,
    search,
  ]);
  useEffect(() => {
    const element = list.current;
    if (
      !busy &&
      !error &&
      cursor &&
      items.length < 2000 &&
      element &&
      element.scrollHeight <= element.clientHeight + 2
    )
      void load(true);
  }, [busy, cursor, items, error]);
  return (
    <div
      ref={list}
      className="source-choices"
      aria-label={group ? "Available log streams" : "Available log groups"}
      onScroll={(event) => {
        const e = event.currentTarget;
        if (
          e.scrollHeight - e.scrollTop - e.clientHeight < 40 &&
          items.length < 2000
        )
          void load(true);
      }}
    >
      {items.map((name) => (
        <button
          type="button"
          key={name}
          className="source-choice"
          onClick={() => onChoose(name)}
          title={name}
        >
          <IconPlus size={12} />
          <span>{name}</span>
        </button>
      ))}
      {busy && (
        <Text size="xs" c="dimmed" role="status">
          Loading {group ? "streams" : "groups"}…
        </Text>
      )}
      {error && (
        <Button
          size="compact-xs"
          variant="subtle"
          color="red"
          onClick={() => void load(Boolean(cursor))}
        >
          Retry: {error}
        </Button>
      )}
      {!busy && !error && !items.length && (
        <Text size="xs" c="dimmed">
          No matching {group ? "streams" : "groups"}. Enter a name above to add
          it directly.
        </Text>
      )}
    </div>
  );
}
export function SourcesEditor({
  tab,
  connections,
  onClose,
  onApply,
}: {
  tab: LogTab;
  connections: Connection[];
  onClose(): void;
  onApply(patch: Partial<LogTab>): void;
}) {
  const [connectionId, setConnectionId] = useState(tab.connectionId);
  const [sources, setSources] = useState<LogSource[]>(() =>
    structuredClone(tab.sources),
  );
  const [active, setActive] = useState<string | undefined>(
    tab.sources[0]?.logGroup,
  );
  const [groupSearch, setGroupSearch] = useState("");
  const [streamSearch, setStreamSearch] = useState("");
  const [error, setError] = useState("");
  const connection = connections.find(
    (connection) => connection.id === connectionId,
  );
  const selected = sources.find((source) => source.logGroup === active);
  const addGroup = (name: string) => {
    if (!name.trim()) return;
    try {
      if (!sources.some((source) => source.logGroup === name.trim()))
        setSources(mergeSources(sources, [{ logGroup: name.trim() }]));
      setActive(name.trim());
      setStreamSearch("");
      setError("");
    } catch (error) {
      setError(String(error));
    }
  };
  const addStream = (name: string) => {
    if (!selected || !name.trim()) return;
    const streams = [...new Set([...(selected.logStreams ?? []), name.trim()])];
    if (streams.length > 100 || name.length > 512) {
      setError("Select at most 100 streams, with names up to 512 characters.");
      return;
    }
    setSources(
      sources.map((source) =>
        source === selected ? { ...source, logStreams: streams } : source,
      ),
    );
    setError("");
    setStreamSearch("");
  };
  const valid =
    sources.length > 0 &&
    sources.length <= 50 &&
    sources.every(
      (source) =>
        source.logGroup.length <= 512 &&
        (!source.logStreams || source.logStreams.length > 0),
    );
  return (
    <Modal opened onClose={onClose} title="Log sources" size="xl" centered>
      <Stack gap="md">
        <Select
          label="Connection and region"
          value={connectionId}
          data={connections.map((connection) => ({
            value: connection.id,
            label: `${connection.name} · ${connection.region}`,
          }))}
          onChange={(value) => {
            if (value && value !== connectionId) {
              setConnectionId(value);
              setSources([]);
              setActive(undefined);
              setError("");
            }
          }}
        />
        <Text size="xs" c="dimmed">
          Choose up to 50 groups from one connection and region. Drag Explorer
          groups or streams onto a log pane to add them directly. Apply keeps
          query text and view settings; Run queries the changed sources.
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        <div className="source-editor-columns">
          <Stack gap="xs">
            <Group align="end" wrap="nowrap">
              <TextInput
                style={{ flex: 1 }}
                label="Find or enter a log group"
                value={groupSearch}
                maxLength={512}
                onChange={(event) => setGroupSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addGroup(groupSearch);
                  }
                }}
              />
              <Button
                size="xs"
                variant="light"
                disabled={!groupSearch.trim()}
                onClick={() => addGroup(groupSearch)}
              >
                Add group
              </Button>
            </Group>
            <ResourceChoices
              connection={connection}
              search={groupSearch}
              onChoose={addGroup}
            />
            <Text fw={600} size="sm">
              Selected groups ({sources.length}/50)
            </Text>
            <div className="source-selected-groups">
              {sources.map((source) => (
                <Paper
                  key={source.logGroup}
                  withBorder
                  p="xs"
                  className={
                    active === source.logGroup
                      ? "source-card source-card-active"
                      : "source-card"
                  }
                >
                  <Group wrap="nowrap" justify="space-between">
                    <button
                      className="source-card-title"
                      onClick={() => {
                        setActive(source.logGroup);
                        setStreamSearch("");
                      }}
                      aria-label={`Choose streams for ${source.logGroup}`}
                    >
                      <strong>{source.logGroup}</strong>
                      <span>
                        {source.logStreams
                          ? `${source.logStreams.length} selected streams`
                          : "All streams"}
                      </span>
                    </button>
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Remove group ${source.logGroup}`}
                      onClick={() => {
                        const next = sources.filter((item) => item !== source);
                        setSources(next);
                        if (active === source.logGroup)
                          setActive(next[0]?.logGroup);
                      }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))}
            </div>
          </Stack>
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {selected
                ? "Streams in selected group"
                : "Select a group to choose streams"}
            </Text>
            {selected && (
              <>
                <Text size="xs" style={{ overflowWrap: "anywhere" }}>
                  {selected.logGroup}
                </Text>
                <Switch
                  label="Include all streams"
                  checked={!selected.logStreams}
                  onChange={(event) =>
                    setSources(
                      sources.map((source) =>
                        source === selected
                          ? {
                              logGroup: source.logGroup,
                              ...(event.currentTarget.checked
                                ? {}
                                : { logStreams: [] }),
                            }
                          : source,
                      ),
                    )
                  }
                />
                {selected.logStreams && (
                  <>
                    <Group gap={5}>
                      {selected.logStreams.map((stream) => (
                        <Badge
                          key={stream}
                          variant="light"
                          style={{
                            maxWidth: "100%",
                            height: "auto",
                            padding: "5px 8px",
                          }}
                          rightSection={
                            <ActionIcon
                              size={14}
                              variant="transparent"
                              aria-label={`Remove stream ${stream}`}
                              onClick={() =>
                                setSources(
                                  sources.map((source) =>
                                    source === selected
                                      ? {
                                          ...source,
                                          logStreams: source.logStreams!.filter(
                                            (name) => name !== stream,
                                          ),
                                        }
                                      : source,
                                  ),
                                )
                              }
                            >
                              <IconX size={11} />
                            </ActionIcon>
                          }
                        >
                          {stream}
                        </Badge>
                      ))}
                    </Group>
                    <Group align="end" wrap="nowrap">
                      <TextInput
                        style={{ flex: 1 }}
                        label="Find or enter a log stream"
                        value={streamSearch}
                        maxLength={512}
                        onChange={(event) =>
                          setStreamSearch(event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addStream(streamSearch);
                          }
                        }}
                      />
                      <Button
                        size="xs"
                        variant="light"
                        disabled={!streamSearch.trim()}
                        onClick={() => addStream(streamSearch)}
                      >
                        Add stream
                      </Button>
                    </Group>
                    <ResourceChoices
                      connection={connection}
                      group={selected.logGroup}
                      search={streamSearch}
                      onChoose={addStream}
                    />
                    {!selected.logStreams.length && (
                      <Text size="xs" c="orange">
                        Choose at least one stream, or include all streams.
                      </Text>
                    )}
                  </>
                )}
              </>
            )}
          </Stack>
        </div>
        <details>
          <summary>Paste multiple group names</summary>
          <Textarea
            mt="xs"
            label="Log groups, one per line"
            autosize
            minRows={3}
            maxRows={8}
            value={sources.map((source) => source.logGroup).join("\n")}
            onChange={(event) => {
              const names = [
                ...new Set(
                  event.currentTarget.value
                    .split("\n")
                    .map((name) => name.trim())
                    .filter(Boolean),
                ),
              ];
              if (names.length > 50) {
                setError("A tab can include at most 50 log groups.");
                return;
              }
              const next = names.map(
                (logGroup) =>
                  sources.find((source) => source.logGroup === logGroup) ?? {
                    logGroup,
                  },
              );
              setSources(next);
              if (!next.some((source) => source.logGroup === active))
                setActive(next[0]?.logGroup);
            }}
          />
        </details>
        <Group justify="space-between">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              try {
                const normalized = mergeSources([], sources);
                onApply({ connectionId, sources: normalized });
                onClose();
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            Apply sources
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
