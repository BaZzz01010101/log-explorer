import { useEffect, useMemo, useRef, useState } from "react";
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
  IconCopy,
  IconCloudCode,
  IconHexagonLetterK,
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
import { gcpErrorMessage, isGcpAuthorizationError } from "../gcp-errors";
import { shortcutMatches } from "../shortcuts";
import { Tooltip } from "./AppTooltip";
import { Menu } from "./AppMenu";
import { ViewFavorites } from "./ViewFavorites";
import { FilterMatchButtons } from "./FilterMatchButtons";
import { clearEditControl } from "../scoped-edit-history";
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
  onRemoveFavorite,
  onAuthorized,
}: {
  active: boolean;
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
  onSourceAction?(
    source: GcpSource,
    identity: GcpIdentity,
    mode: "add-sources" | "add-splits" | "new-split" | "new-multisource",
  ): void;
  favorites?: ViewFavorite[];
  onOpenFavorite?(id: string): void;
  onRenameFavorite?(id: string, title: string): void;
  onRemoveFavorite?(id: string): void;
  onAuthorized?(configuration: string, account: string): void;
}) {
  const regexShortcut = shortcuts.explorerRegex ?? "Alt+E";
  const caseShortcut = shortcuts.explorerCaseSensitive ?? "Alt+C";
  const [projects, setProjects] = useState<GcpProject[]>([]);
  const [project, setProject] = useState("");
  const [logs, setLogs] = useState<GcpSource[]>([]);
  const [selected, setSelected] = useState<GcpSource | null>(null);
  const [cachedNames, setCachedNames] = useState<Set<string>>(new Set());
  const restoredProject = useRef(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [error, setError] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [authError, setAuthError] = useState("");
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
  const signIn = async () => {
    setAuthenticating(true);
    setAuthError("");
    setProjectError("");
    try {
      await window.explorer.gcpSignIn();
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
    } catch (failure) {
      setAuthError(gcpErrorMessage(failure));
    } finally {
      setAuthenticating(false);
    }
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
          <Button loading={authenticating} onClick={() => void signIn()}>
            Sign in
          </Button>
          {authenticating && (
            <Text size="xs" c="dimmed">
              Complete sign-in in your browser…
            </Text>
          )}
          {authError && (
            <Text size="xs" c="red" role="alert">
              {authError}
            </Text>
          )}
          {/Google Cloud CLI was not found/i.test(authError) && (
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
              void refreshProfiles().then((selected) => {
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
        {authError && (
          <Text size="xs" c="red" role="alert">
            {authError}
          </Text>
        )}
        {/Google Cloud CLI was not found/i.test(authError) && (
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
          onRemove={onRemoveFavorite}
        />
      )}
      <div
        className="gcp-log-list"
        role="listbox"
        aria-label="GCP sources"
        aria-busy={loading}
      >
        {filtered.map((log) => (
          <Menu key={log.name} withinPortal>
            <Menu.ContextMenu>
              <button
                type="button"
                className="resource-row gcp-log-row"
                role="option"
                aria-selected={selected?.name === log.name}
                onClick={() => {
                  setSelected(log);
                  if (identity) onOpen?.(log, identity, "preview");
                }}
                onDoubleClick={() => {
                  if (identity) onOpen?.(log, identity, "permanent");
                }}
              >
                {log.kind === "function" ? (
                  <IconCloudCode size={15} />
                ) : (
                  <IconHexagonLetterK size={15} />
                )}
                <span>
                  {log.label}
                  {duplicateLabels.has(log.label)
                    ? ` (${[log.namespace, log.region].filter(Boolean).join(", ")})`
                    : ""}
                  {cachedNames.has(log.name) ? " · cached" : ""}
                </span>
              </button>
            </Menu.ContextMenu>
            <Menu.Dropdown>
              <Menu.Item
                onClick={() => identity && onOpen?.(log, identity, "permanent")}
              >
                Open in new tab
              </Menu.Item>
              <Menu.Item
                onClick={() =>
                  identity && onSourceAction?.(log, identity, "add-sources")
                }
              >
                Add to current tab
              </Menu.Item>
              <Menu.Item
                onClick={() =>
                  identity && onSourceAction?.(log, identity, "add-splits")
                }
              >
                Add as split
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ))}
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
      <div className="gcp-details">
        <div className="gcp-details-heading">
          <Text size="xs" fw={700}>
            Source details
          </Text>
          {selected && (
            <Tooltip label="Copy source name">
              <ActionIcon
                size="sm"
                variant="subtle"
                aria-label="Copy GCP source name"
                onClick={() => void window.explorer.copy(selected.label)}
              >
                <IconCopy size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        {selected ? (
          <>
            <Text size="xs" c="dimmed">
              Project
            </Text>
            <Text size="xs">{project}</Text>
            <Text size="xs" c="dimmed" mt="xs">
              Source
            </Text>
            <Text size="xs" className="gcp-details-name">
              {selected.label}
            </Text>
            <Text size="xs" c="dimmed" mt="xs">
              Location
            </Text>
            <Text size="xs">{selected.region}</Text>
            {selected.namespace && (
              <>
                <Text size="xs" c="dimmed" mt="xs">
                  Namespace
                </Text>
                <Text size="xs">{selected.namespace}</Text>
              </>
            )}
            {selected.workloads?.length ? (
              <>
                <Text size="xs" c="dimmed" mt="xs">
                  Workloads
                </Text>
                <Text size="xs">{selected.workloads.join(", ")}</Text>
              </>
            ) : null}
          </>
        ) : (
          <Text size="xs" c="dimmed">
            Select a source to view its details.
          </Text>
        )}
      </div>
    </aside>
  );
}
