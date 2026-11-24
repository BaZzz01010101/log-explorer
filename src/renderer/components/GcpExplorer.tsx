import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Select,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCloudCode,
  IconHexagonLetterK,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type {
  GcpConfiguration,
  GcpIdentity,
  GcpSource,
  GcpProject,
  ViewFavorite,
} from "../../shared/contracts";
import { collectGcpPages } from "../gcp-pagination";
import { discoverGcpSources } from "../gcp-source-scan";
import { matchGroupNames } from "../group-regex";
import {
  gcpErrorMessage,
  isGcpAuthorizationError,
} from "../gcp-errors";
import { useGcpSignIn } from "../useGcpSignIn";
import { shortcutMatches } from "../../shared/shortcuts";
import { Tooltip } from "./AppTooltip";
import { Menu } from "./AppMenu";
import { Field, SourceDetailsFrame, SourceDetailsName } from "./SourceDetails";
import { ViewFavorites, type FavoriteOpenMode } from "./ViewFavorites";
import { ResourceDragLabel } from "./ResourceDragLabel";
import type { ResourcePayload } from "../resource-drag";
import { FilterMatchButtons } from "./FilterMatchButtons";
import { clearEditControl } from "../scoped-edit-history";
import {
  changeExplorerSelection,
  type SelectedResource,
} from "../explorer-selection";
import "./gcp-explorer.css";

export function GcpExplorer({
  active,
  shortcuts = {},
  initialProject = "",
  initialConfiguration = "",
  initialAccount = "",
  onProjectChange,
  onIdentityChange,
  onOpen,
  onSourceAction,
  favorites = [],
  onOpenFavorite,
  onRenameFavorite,
  onMoveFavorite,
  onRemoveFavorite,
  onDropFavoriteResources,
  dragPayload,
  onAuthorized,
  sourceDetailsHeight,
  onSourceDetailsHeightChange,
}: {
  active: boolean;
  sourceDetailsHeight?: number;
  onSourceDetailsHeightChange?(height: number): void;
  shortcuts?: Record<string, string>;
  initialProject?: string;
  initialConfiguration?: string;
  initialAccount?: string;
  onProjectChange?(project: string): void;
  onIdentityChange?(configuration: string, account: string): void;
  onOpen?(
    source: GcpSource,
    identity: GcpIdentity,
    mode: "preview" | "permanent",
  ): void;
  /** Acts on the checked sources when the row is one of them. */
  onSourceAction?(
    sources: GcpSource[],
    identity: GcpIdentity,
    mode: "add-sources" | "add-splits" | "new-split" | "new-multisource",
  ): void;
  favorites?: ViewFavorite[];
  onOpenFavorite?(id: string, mode?: FavoriteOpenMode): void;
  onRenameFavorite?(id: string, title: string): void;
  onMoveFavorite?(id: string, beforeId: string | null): void;
  onRemoveFavorite?(id: string): void;
  onDropFavoriteResources?(payload: ResourcePayload): void;
  /** Resolves the drag payload (and any connections to create) for sources. */
  dragPayload?(
    sources: GcpSource[],
    identity: GcpIdentity,
  ): ResourcePayload | undefined;
  onAuthorized?(configuration: string, account: string): void;
}) {
  const regexShortcut = shortcuts.explorerRegex ?? "Alt+E";
  const caseShortcut = shortcuts.explorerCaseSensitive ?? "Alt+C";
  const [projects, setProjects] = useState<GcpProject[]>([]);
  const [project, setProject] = useState("");
  const [logs, setLogs] = useState<GcpSource[]>([]);
  const [selected, setSelected] = useState<GcpSource | null>(null);
  // Checked sources, keyed by resource name, as in the AWS explorer.
  const [checked, setChecked] = useState(new Map<string, SelectedResource>());
  const selectionAnchor = useRef<string | null>(null);
  const copy = (value: string) => void window.explorer.copy(value);
  const [cachedNames, setCachedNames] = useState<Set<string>>(new Set());
  const restoredProject = useRef(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const gcpSignIn = useGcpSignIn(async () => {
    setAuthorizationRequired(false);
    setProjectError("");
    setError("");
    const selected = await refreshProfiles(true);
    if (selected?.configuration && selected.account) {
      onAuthorized?.(selected.configuration, selected.account);
      if (
        selected.configuration === configuration &&
        selected.account === account
      ) {
        void discover();
        if (project) void load(project);
      }
    }
  });
  const authenticating = gcpSignIn.signingIn;
  const signInError = authError || gcpSignIn.error;
  const [authorizationRequired, setAuthorizationRequired] = useState(false);
  const [configurations, setConfigurations] = useState<GcpConfiguration[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [configuration, setConfiguration] = useState(initialConfiguration);
  const [account, setAccount] = useState(initialAccount);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesAvailable, setProfilesAvailable] = useState(false);
  const profilesLoaded = useRef(false);
  const config = configurations.find((entry) => entry.name === configuration);
  const identity: GcpIdentity | undefined =
    configuration && account
      ? {
          configuration,
          account,
          ...(config?.quotaProject
            ? { quotaProject: config.quotaProject }
            : {}),
        }
      : undefined;
  const [search, setSearch] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexMatches, setRegexMatches] = useState<string[]>([]);
  const [regexError, setRegexError] = useState("");
  const projectAbort = useRef<AbortController | null>(null);
  const logAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      projectAbort.current?.abort();
      logAbort.current?.abort();
    },
    [],
  );

  const selectIdentity = (nextConfiguration: string, nextAccount: string) => {
    if (nextConfiguration !== configuration || nextAccount !== account) {
      projectAbort.current?.abort();
      logAbort.current?.abort();
      setProjects([]);
      setLogs([]);
      setSelected(null);
      setChecked(new Map());
      setProject("");
      setProjectLoading(false);
      setLoading(false);
      setProjectError("");
      setError("");
    }
    setConfiguration(nextConfiguration);
    setAccount(nextAccount);
    onIdentityChange?.(nextConfiguration, nextAccount);
  };
  const refreshProfiles = async (preferNew = false) => {
    setProfilesLoading(true);
    setAuthError("");
    try {
      const result = await window.explorer.gcpProfiles();
      setProfilesAvailable(true);
      setConfigurations(result.configurations);
      setAccounts(result.accounts);
      const chosen =
        result.configurations.find((item) => item.name === configuration) ??
        result.configurations.find((item) => item.active) ??
        result.configurations[0];
      const added = preferNew
        ? result.accounts.find((item) => !accounts.includes(item))
        : undefined;
      const chosenAccount =
        added ??
        (result.accounts.includes(account) && chosen?.name === configuration
          ? account
          : undefined) ??
        (chosen?.account && result.accounts.includes(chosen.account)
          ? chosen.account
          : undefined) ??
        result.accounts[0] ??
        "";
      selectIdentity(chosen?.name ?? "", chosenAccount);
      return { configuration: chosen?.name ?? "", account: chosenAccount };
    } catch (failure) {
      setAuthError(gcpErrorMessage(failure));
    } finally {
      setProfilesLoading(false);
    }
  };
  useEffect(() => {
    if (active && !profilesLoaded.current) {
      profilesLoaded.current = true;
      void refreshProfiles();
    }
  }, [active]);

  const discover = async () => {
    if (!identity) {
      setProjectError("Select a configuration and signed-in account.");
      return;
    }
    projectAbort.current?.abort();
    const controller = new AbortController();
    projectAbort.current = controller;
    setProjectLoading(true);
    setProjectError("");
    setProjects([]);
    try {
      await collectGcpPages(
        (cursor) => window.explorer.gcpProjects(identity, cursor),
        (items) => {
          setProjects(items);
        },
        (item) => item.id,
        controller.signal,
      );
    } catch (failure) {
      if (!controller.signal.aborted) {
        const message = gcpErrorMessage(failure);
        if (isGcpAuthorizationError(message)) setAuthorizationRequired(true);
        else setProjectError(message);
      }
    } finally {
      if (!controller.signal.aborted) setProjectLoading(false);
    }
  };
  useEffect(() => {
    if (active && configuration && account) void discover();
  }, [active, configuration, account]);
  const load = async (id: string) => {
    const next = id.trim();
    if (!next) return;
    if (!identity) {
      setError("Select a configuration and signed-in account.");
      return;
    }
    logAbort.current?.abort();
    const controller = new AbortController();
    logAbort.current = controller;
    setProject(next);
    const key = `gcp-sources:${JSON.stringify([identity.configuration, identity.account, next])}`;
    let cached: GcpSource[] = [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (Array.isArray(value))
        cached = value
          .filter(
            (item): item is GcpSource =>
              !!item &&
              typeof item.name === "string" &&
              typeof item.label === "string" &&
              (item.kind === "function" || item.kind === "kubernetes") &&
              item.project === next,
          )
          .slice(0, 20000);
    } catch {
      /* A damaged cache does not prevent discovery. */
    }
    const collected = new Map(cached.map((item) => [item.name, item]));
    setCachedNames(new Set(collected.keys()));
    setLogs([...collected.values()]);
    setSelected((current) =>
      current && collected.has(current.name) ? current : null,
    );
    setChecked(new Map());
    selectionAnchor.current = null;
    setLoading(true);
    setError("");
    onProjectChange?.(next);
    try {
      const result = await discoverGcpSources(
        window.explorer,
        identity,
        next,
        (items) => {
          if (controller.signal.aborted) return;
          for (const item of items) collected.set(item.name, item);
          const discovered = new Set(items.map((item) => item.name));
          setCachedNames(
            new Set(
              [...collected.keys()].filter((name) => !discovered.has(name)),
            ),
          );
          setLogs(
            [...collected.values()].sort(
              (a, b) =>
                a.label.localeCompare(b.label) || a.name.localeCompare(b.name),
            ),
          );
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setError(result.warnings.join("\n"));
        if (!result.warnings.length) {
          collected.clear();
          for (const item of result.items) collected.set(item.name, item);
          setCachedNames(new Set());
          setLogs(result.items);
        }
        try {
          localStorage.setItem(key, JSON.stringify([...collected.values()]));
        } catch {
          /* Storage can be unavailable or full. */
        }
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        const message = gcpErrorMessage(failure);
        if (isGcpAuthorizationError(message)) setAuthorizationRequired(true);
        else setError(message);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    if (active && identity && initialProject && !restoredProject.current) {
      restoredProject.current = true;
      void load(initialProject);
    }
  }, [active, configuration, account]);
  const signIn = () => {
    setAuthError("");
    setProjectError("");
    return gcpSignIn.signIn();
  };
  useEffect(() => {
    if (!regex || !search) {
      setRegexMatches([]);
      setRegexError("");
      return;
    }
    const controller = new AbortController();
    void matchGroupNames(
      search,
      logs.map((item) => item.label),
      controller.signal,
      !caseSensitive,
    )
      .then((matches) => {
        setRegexMatches(matches);
        setRegexError("");
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) {
          setRegexMatches([]);
          setRegexError(failure.message);
        }
      });
    return () => controller.abort();
  }, [search, regex, caseSensitive, logs]);
  const filtered = useMemo(() => {
    const typed = logs;
    if (!search) return typed;
    if (regex) {
      const matches = new Set(regexMatches);
      return typed.filter((log) => matches.has(log.label));
    }
    const needle = caseSensitive ? search : search.toLowerCase();
    return typed.filter((log) =>
      (caseSensitive ? log.label : log.label.toLowerCase()).includes(needle),
    );
  }, [logs, search, regex, caseSensitive, regexMatches]);
  useEffect(() => {
    setChecked(new Map());
    selectionAnchor.current = null;
  }, [search, regex, caseSensitive]);
  const resourceOf = (log: GcpSource): SelectedResource => ({
    key: log.name,
    connectionId: "gcp",
    logGroup: log.name,
  });
  const byName = useMemo(
    () => new Map(logs.map((log) => [log.name, log])),
    [logs],
  );
  const checkedSources = [...checked.keys()].flatMap((name) => {
    const log = byName.get(name);
    return log ? [log] : [];
  });
  const targetsFor = (log: GcpSource) =>
    checked.has(log.name) && checkedSources.length ? checkedSources : [log];
  const check = (
    log: GcpSource,
    mode: "toggle" | "range" | "add-range" | "context" | "single" = "toggle",
  ) => {
    setSelected(log);
    const anchor = selectionAnchor.current;
    if (mode !== "range" && mode !== "add-range")
      selectionAnchor.current = log.name;
    setChecked((previous) =>
      changeExplorerSelection(
        previous,
        filtered.map(resourceOf),
        resourceOf(log),
        anchor,
        mode,
      ),
    );
  };
  const checkMode = (event: MouseEvent) =>
    event.shiftKey
      ? event.ctrlKey || event.metaKey
        ? "add-range"
        : "range"
      : "toggle";
  const duplicateLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filtered)
      counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
    return new Set(
      [...counts].filter(([, count]) => count > 1).map(([label]) => label),
    );
  }, [filtered]);
  const needsSignIn =
    authorizationRequired ||
    (profilesAvailable && !profilesLoading && !accounts.length);
  if (needsSignIn)
    return (
      <aside
        className="resource-sidebar gcp-sidebar"
        aria-label="Google Cloud resources"
      >
        <div className="gcp-sign-in-panel">
          <Text fw={600}>Sign in to Google Cloud</Text>
          <Text size="sm" c="dimmed">Sign in to browse projects and logs with your Google Cloud CLI account.</Text>
          <Group gap={6} justify="center">
            <Button loading={authenticating} onClick={() => void signIn()}>
              Sign in
            </Button>
            {authenticating && (
              <Button variant="default" onClick={() => void gcpSignIn.cancel()}>
                Cancel
              </Button>
            )}
          </Group>
          {signInError && (
            <Text size="xs" c="red" role="alert">
              {signInError}
            </Text>
          )}
          {/Google Cloud CLI was not found/i.test(signInError) && (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => void window.explorer.gcpInstallCli()}
            >
              Install Google Cloud CLI
            </Button>
          )}
        </div>
      </aside>
    );
  return (
    <aside
      className="resource-sidebar gcp-sidebar"
      aria-label="Google Cloud resources"
    >
      <div className="sidebar-heading">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Google Cloud Explorer
        </Text>
        <Tooltip label="Refresh Google Cloud Explorer">
          <ActionIcon
            size="sm"
            variant="subtle"
            aria-label="Refresh GCP sources"
            disabled={loading || profilesLoading}
            onClick={() =>
              void Promise.resolve(window.explorer.gcpRefresh?.())
                .catch(() => {})
                .then(() => refreshProfiles())
                .then((selected) => {
                if (
                  selected?.configuration === configuration &&
                  selected.account === account
                ) {
                  void discover();
                  if (project) void load(project);
                  onAuthorized?.(configuration, account);
                }
              })
            }
          >
            <IconRefresh size={15} />
          </ActionIcon>
        </Tooltip>
      </div>
      <div className="sidebar-connection gcp-connection">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" fw={600}>
            Google Cloud CLI
          </Text>
        </Group>
        <Select
          label="Account"
          aria-label="Google Cloud account"
          size="xs"
          placeholder="Sign in to an account"
          data={accounts.map((item) => ({
            value: item,
            label: item.endsWith(".gserviceaccount.com")
              ? `${item} (service account)`
              : item,
          }))}
          value={account || null}
          allowDeselect={false}
          disabled={profilesLoading || authenticating || !accounts.length}
          onChange={(value) => value && selectIdentity(configuration, value)}
        />
        <Select
          label="Configuration"
          aria-label="Google Cloud configuration"
          size="xs"
          placeholder={profilesLoading ? "Loading…" : "Choose a configuration"}
          data={configurations.map((item) => ({
            value: item.name,
            label: item.name,
          }))}
          value={configuration || null}
          allowDeselect={false}
          disabled={profilesLoading || authenticating || !configurations.length}
          onChange={(name) => {
            if (!name) return;
            const selected = configurations.find((item) => item.name === name);
            selectIdentity(
              name,
              account && accounts.includes(account)
                ? account
                : selected?.account && accounts.includes(selected.account)
                  ? selected.account
                  : (accounts[0] ?? ""),
            );
          }}
        />
        {signInError && (
          <Text size="xs" c="red" role="alert">
            {signInError}
          </Text>
        )}
        {/Google Cloud CLI was not found/i.test(signInError) && (
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => void window.explorer.gcpInstallCli()}
          >
            Install Google Cloud CLI
          </Button>
        )}
        <Select
          label="Project"
          aria-label="Google Cloud project"
          placeholder={
            projectLoading ? "Loading projects…" : "Choose a project"
          }
          data={[
            ...(project && !projects.some((item) => item.id === project)
              ? [{ id: project, name: project }]
              : []),
            ...projects,
          ].map((item) => ({
            value: item.id,
            label:
              item.name === item.id ? item.id : `${item.name} (${item.id})`,
          }))}
          value={project || null}
          searchable
          allowDeselect={false}
          onChange={(value) => value && void load(value)}
          disabled={authenticating || !identity}
          size="xs"
        />
        {projectError && (
          <Text size="xs" c="red" role="alert">
            Could not find projects: {projectError}
          </Text>
        )}
      </div>
      <div className="sidebar-search">
        <TextInput
          aria-label="Search GCP sources"
          placeholder="Search logs…"
          description={`${regex ? "Regular expression" : "Log name contains"} · ${caseSensitive ? "case-sensitive" : "ignore case"}`}
          size="xs"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (shortcutMatches(event, regexShortcut)) {
              event.preventDefault();
              event.stopPropagation();
              setRegex((value) => !value);
            } else if (shortcutMatches(event, caseShortcut)) {
              event.preventDefault();
              event.stopPropagation();
              setCaseSensitive((value) => !value);
            }
          }}
          error={regexError || undefined}
          rightSectionWidth={search ? 82 : 56}
          rightSectionPointerEvents="all"
          rightSection={
            <Group gap={2} wrap="nowrap">
              {search && <ActionIcon size={22} variant="subtle" aria-label="Clear log search" onMouseDown={(event) => event.preventDefault()} onClick={(event) => { clearEditControl(event.currentTarget.closest(".mantine-Input-wrapper")?.querySelector<HTMLInputElement>("input") ?? null); setSearch(""); }}><IconX size={13} /></ActionIcon>}
              <FilterMatchButtons scope="explorer" caseSensitive={caseSensitive} regex={regex} caseShortcut={caseShortcut} regexShortcut={regexShortcut} onCaseChange={() => setCaseSensitive((value) => !value)} onRegexChange={() => setRegex((value) => !value)} />
            </Group>
          }
        />
      </div>
      {active && (
        <ViewFavorites
          dropId="gcp-view-favorites"
          favorites={favorites}
          onOpen={onOpenFavorite}
          onRename={onRenameFavorite}
          onMove={onMoveFavorite}
          onRemove={onRemoveFavorite}
          onDropResources={onDropFavoriteResources}
        />
      )}
      <div
        className="gcp-log-list"
        role="listbox"
        aria-label="GCP sources"
        aria-busy={loading}
      >
        {filtered.map((log) => {
          const targets = targetsFor(log);
          const payload = identity && dragPayload?.(targets, identity);
          const click = (event?: MouseEvent<HTMLButtonElement>) => {
            if (event?.shiftKey || event?.ctrlKey || event?.metaKey) {
              check(log, checkMode(event));
              return;
            }
            check(log, "single");
            if (identity) onOpen?.(log, identity, "preview");
          };
          const open = () => {
            if (identity) onOpen?.(log, identity, "permanent");
          };
          const text = `${log.label}${
            duplicateLabels.has(log.label)
              ? ` (${[log.namespace, log.region].filter(Boolean).join(", ")})`
              : ""
          }${cachedNames.has(log.name) ? " · cached" : ""}`;
          const content = (
            <>
              {log.kind === "function" ? (
                <IconCloudCode size={15} />
              ) : (
                <IconHexagonLetterK size={15} />
              )}
              <span>{text}</span>
            </>
          );
          const many = targets.length > 1;
          const act = (
            mode: "add-sources" | "add-splits" | "new-split" | "new-multisource",
          ) => identity && onSourceAction?.(targets, identity, mode);
          return (
          <Menu key={log.name} withinPortal>
            <Menu.ContextMenu>
              <div
                className="resource-row gcp-log-row"
                role="option"
                aria-label={text}
                aria-selected={checked.has(log.name)}
                data-inspected={selected?.name === log.name || undefined}
                onContextMenu={() => check(log, "context")}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${log.label}`}
                  checked={checked.has(log.name)}
                  onChange={() => {}}
                  onClick={(event) => check(log, checkMode(event))}
                />
                {payload ? (
                  // Drag to tabs, panes (splits), view sources or Favorites.
                  <ResourceDragLabel
                    payload={payload}
                    className="resource-label gcp-log-label"
                    onClick={click}
                    onDoubleClick={open}
                  >
                    {content}
                  </ResourceDragLabel>
                ) : (
                  <button
                    type="button"
                    className="resource-label gcp-log-label"
                    onClick={click}
                    onDoubleClick={open}
                  >
                    {content}
                  </button>
                )}
              </div>
            </Menu.ContextMenu>
            <Menu.Dropdown>
              <Menu.Label>
                {many ? `${targets.length} selected sources` : "Source actions"}
              </Menu.Label>
              {many ? (
                <>
                  <Menu.Item onClick={() => act("new-multisource")}>
                    Open in new multi-source tab
                  </Menu.Item>
                  <Menu.Item onClick={() => act("new-split")}>
                    Open in new split tab
                  </Menu.Item>
                </>
              ) : (
                <Menu.Item onClick={open}>Open in new tab</Menu.Item>
              )}
              <Menu.Item onClick={() => act("add-sources")}>
                Add to current tab
              </Menu.Item>
              <Menu.Item onClick={() => act("add-splits")}>
                {many ? "Add as splits" : "Add as split"}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          );
        })}
        {loading && (
          <div className="gcp-list-status">
            <Loader size="xs" /> Discovering sources…
          </div>
        )}
        {!loading && !error && project && !filtered.length && (
          <Text size="xs" c="dimmed" p="sm">
            {logs.length
              ? "No matching sources."
              : "No sources found in this project."}
          </Text>
        )}
        {!project && (
          <Text size="xs" c="dimmed" p="sm">
            Select a project to browse sources.
          </Text>
        )}
        {error && (
          <Text size="xs" c="red" p="sm" role="alert">
            {error}
            {logs.length > 0 ? " The list is incomplete." : ""}
          </Text>
        )}
      </div>
      {checkedSources.length > 0 && (
        <Button
          size="xs"
          mx="xs"
          mb="xs"
          leftSection={<IconPlus size={14} />}
          disabled={!identity}
          onClick={() =>
            identity &&
            onSourceAction?.(checkedSources, identity, "new-multisource")
          }
        >
          Open {checkedSources.length} selected sources
        </Button>
      )}
      <SourceDetailsFrame
        title={
          selected
            ? selected.kind === "function"
              ? "Function details"
              : "Workload details"
            : "Source details"
        }
        emptyText="Choose a source to inspect its details."
        height={sourceDetailsHeight}
        onHeightChange={onSourceDetailsHeightChange}
      >
        {selected ? (
          <>
            <SourceDetailsName
              icon={
                selected.kind === "function" ? (
                  <IconCloudCode size={14} aria-hidden="true" />
                ) : (
                  <IconHexagonLetterK size={14} aria-hidden="true" />
                )
              }
              name={selected.label}
              onCopy={copy}
              copyLabel="Copy GCP source name"
            />
            <dl className="source-details-identity">
              {selected.name !== selected.label && (
                <Field label="Resource" value={selected.name} onCopy={copy} wide>
                  {selected.name}
                </Field>
              )}
              <Field label="Project" value={selected.project || project} onCopy={copy}>
                {selected.project || project}
              </Field>
              <Field label="Location">{selected.region || "Not provided"}</Field>
              {selected.kind === "function" ? (
                <>
                  <Field label="Generation">
                    {selected.generation === "v1"
                      ? "1st gen"
                      : selected.generation === "v2"
                        ? "2nd gen"
                        : "Not provided"}
                  </Field>
                  {selected.service && (
                    <Field label="Service" value={selected.service} onCopy={copy}>
                      {selected.service}
                    </Field>
                  )}
                </>
              ) : (
                <>
                  {selected.cluster && (
                    <Field label="Cluster" value={selected.cluster} onCopy={copy}>
                      {selected.cluster}
                    </Field>
                  )}
                  {selected.namespace && (
                    <Field label="Namespace">{selected.namespace}</Field>
                  )}
                  {selected.container && (
                    <Field label="Container">{selected.container}</Field>
                  )}
                  {selected.workloads?.length ? (
                    <Field label="Workloads" wide>
                      {selected.workloads.join(", ")}
                    </Field>
                  ) : null}
                </>
              )}
            </dl>
          </>
        ) : null}
      </SourceDetailsFrame>
    </aside>
  );
}
