import { useCallback, useEffect, useRef, useState } from "react";
import { ownValue } from "../shared/records";
import { matchGroupNames } from "./group-regex";
import type {
  Connection,
  LogGroup,
  LogStream,
  Page,
} from "../shared/contracts";

export interface ResourcePage<T> extends Page<T> {
  loaded?: boolean;
  loading?: boolean;
  error?: string;
}
export interface RegionResources {
  scope: string;
  groups: ResourcePage<LogGroup>;
  streams: Record<string, ResourcePage<LogStream>>;
}
export const resourceScope = (
  connection: Connection,
  search: string,
  regex = false,
  caseSensitive = true,
) =>
  JSON.stringify([
    connection.id,
    connection.profile,
    connection.region,
    connection.mode,
    search,
    ...(regex ? ["regex"] : []),
    ...(!caseSensitive ? ["ignore-case"] : []),
  ]);
export function useExplorerResources(
  connections: Connection[],
  visibleRegions: string[],
  search: string,
  refreshKey = 0,
  regex = false,
  caseSensitive = true,
) {
  const [cache, setCache] = useState<Record<string, RegionResources>>({});
  const refs = useRef({
    connections,
    search,
    cache,
    regex,
    caseSensitive,
    visibleRegions,
  });
  refs.current = {
    connections,
    search,
    cache,
    regex,
    caseSensitive,
    visibleRegions,
  };
  const mounted = useRef(true),
    sequence = useRef(0),
    pending = useRef(new Map<string, number>()),
    cursors = useRef(new Map<string, Set<string>>()),
    regexTasks = useRef(new Map<string, AbortController>());
  const identities = JSON.stringify(
    connections.map((connection) =>
      resourceScope(connection, search, regex, caseSensitive),
    ),
  );
  const visible = JSON.stringify(visibleRegions);
  const observedRefresh = useRef(refreshKey);
  useEffect(() => {
    if (observedRefresh.current === refreshKey) return;
    observedRefresh.current = refreshKey;
    for (const task of regexTasks.current.values()) task.abort();
    regexTasks.current.clear();
    pending.current.clear();
    cursors.current.clear();
    refs.current.cache = {};
    setCache({});
  }, [refreshKey]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const task of regexTasks.current.values()) task.abort();
      regexTasks.current.clear();
      pending.current.clear();
      cursors.current.clear();
    };
  }, []);
  const current = (connection: Connection, scope: string) =>
    mounted.current &&
    ((!refs.current.regex && refs.current.caseSensitive) ||
      refs.current.visibleRegions.includes(connection.id)) &&
    refs.current.connections.some(
      (item) =>
        item.id === connection.id &&
        resourceScope(
          item,
          refs.current.search,
          refs.current.regex,
          refs.current.caseSensitive,
        ) === scope,
    );
  const loadGroups = useCallback(async (connectionId: string, more = false) => {
    const connection = refs.current.connections.find(
      (item) => item.id === connectionId,
    );
    if (!connection) return;
    const scope = resourceScope(
        connection,
        refs.current.search,
        refs.current.regex,
        refs.current.caseSensitive,
      ),
      key = JSON.stringify([scope, "groups"]);
    const prior =
      ownValue(refs.current.cache, connectionId)?.scope === scope
        ? ownValue(refs.current.cache, connectionId)
        : undefined;
    if (pending.current.has(key) || (more && !prior?.groups.cursor)) return;
    const request = ++sequence.current;
    pending.current.set(key, request);
    if (!more) {
      cursors.current.set(key, new Set());
      // A region refresh invalidates stream pages from its previous snapshot.
      for (const streamKey of pending.current.keys()) {
        const [requestScope, kind] = JSON.parse(streamKey);
        if (requestScope === scope && kind === "streams") {
          pending.current.delete(streamKey);
          cursors.current.delete(streamKey);
        }
      }
    }
    setCache((previous) => ({
      ...previous,
      [connectionId]: {
        scope,
        groups: {
          ...(more ? prior?.groups : { items: [] }),
          items: more ? prior!.groups.items : [],
          loading: true,
          error: undefined,
        },
        streams: more ? (prior?.streams ?? {}) : {},
      },
    }));
    try {
      if (
        (refs.current.regex || !refs.current.caseSensitive) &&
        refs.current.search
      ) {
        const task = new AbortController();
        regexTasks.current.set(key, task);
        const {
          search: pattern,
          regex: useRegex,
          caseSensitive: matchCase,
        } = refs.current;
        // Validate before making any enumeration requests.
        if (useRegex)
          await matchGroupNames(pattern, [], task.signal, !matchCase);
        const items = new Map<string, LogGroup>();
        const seen = new Set<string>();
        let cursor: string | undefined;
        do {
          if (
            !current(connection, scope) ||
            pending.current.get(key) !== request
          )
            return;
          const page = await window.explorer.listGroups(connection, "", cursor);
          if (
            !current(connection, scope) ||
            pending.current.get(key) !== request
          )
            return;
          const matches = new Set(
            useRegex
              ? await matchGroupNames(
                  pattern,
                  page.items.map((item) => item.name),
                  task.signal,
                  !matchCase,
                )
              : page.items
                  .filter((item) =>
                    item.name.toLowerCase().includes(pattern.toLowerCase()),
                  )
                  .map((item) => item.name),
          );
          if (
            !current(connection, scope) ||
            pending.current.get(key) !== request
          )
            return;
          for (const item of page.items)
            if (matches.has(item.name)) items.set(item.name, item);
          if (page.cursor && seen.has(page.cursor))
            throw new Error(
              "Group search received a repeated continuation; refresh to retry",
            );
          cursor = page.cursor;
          if (cursor) seen.add(cursor);
          setCache((previous) => {
            const entry = ownValue(previous, connectionId);
            if (entry?.scope !== scope) return previous;
            return {
              ...previous,
              [connectionId]: {
                ...entry,
                groups: {
                  items: [...items.values()],
                  loaded: true,
                  loading: Boolean(cursor),
                },
              },
            };
          });
        } while (cursor);
        return;
      }
      const page = await window.explorer.listGroups(
        connection,
        refs.current.search,
        more ? prior?.groups.cursor : undefined,
      );
      if (!current(connection, scope) || pending.current.get(key) !== request)
        return;
      const seen = cursors.current.get(key) ?? new Set<string>();
      const cursor =
        page.cursor && !seen.has(page.cursor) ? page.cursor : undefined;
      if (cursor) seen.add(cursor);
      cursors.current.set(key, seen);
      setCache((previous) => {
        const entry = ownValue(previous, connectionId);
        if (entry?.scope !== scope) return previous;
        return {
          ...previous,
          [connectionId]: {
            ...entry,
            groups: {
              items: [
                ...new Map(
                  [...(more ? entry.groups.items : []), ...page.items].map(
                    (item) => [item.name, item],
                  ),
                ).values(),
              ],
              cursor,
              loaded: true,
              loading: false,
            },
          },
        };
      });
    } catch (error) {
      if (current(connection, scope) && pending.current.get(key) === request)
        setCache((previous) => {
          const entry = ownValue(previous, connectionId);
          return entry?.scope !== scope
            ? previous
            : {
                ...previous,
                [connectionId]: {
                  ...entry,
                  groups: {
                    ...entry.groups,
                    loading: false,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                },
              };
        });
    } finally {
      if (pending.current.get(key) === request) {
        pending.current.delete(key);
        regexTasks.current.delete(key);
      }
    }
  }, []);
  const loadStreams = useCallback(
    async (connectionId: string, group: string, more = false) => {
      const connection = refs.current.connections.find(
        (item) => item.id === connectionId,
      );
      if (!connection) return;
      const scope = resourceScope(
          connection,
          refs.current.search,
          refs.current.regex,
          refs.current.caseSensitive,
        ),
        key = JSON.stringify([scope, "streams", group]);
      const entry = ownValue(refs.current.cache, connectionId);
      if (entry?.scope !== scope) return;
      const prior = ownValue(entry.streams, group);
      if (pending.current.has(key) || (more && !prior?.cursor)) return;
      const request = ++sequence.current;
      pending.current.set(key, request);
      if (!more) cursors.current.set(key, new Set());
      setCache((previous) => {
        const entry = ownValue(previous, connectionId);
        return entry?.scope !== scope
          ? previous
          : {
              ...previous,
              [connectionId]: {
                ...entry,
                streams: {
                  ...entry.streams,
                  [group]: {
                    ...(more ? prior : undefined),
                    items: more ? prior!.items : [],
                    loading: true,
                    error: undefined,
                  },
                },
              },
            };
      });
      try {
        const page = await window.explorer.listStreams(
          connection,
          group,
          "",
          more ? prior?.cursor : undefined,
        );
        if (!current(connection, scope) || pending.current.get(key) !== request)
          return;
        const seen = cursors.current.get(key) ?? new Set<string>();
        const cursor =
          page.cursor && !seen.has(page.cursor) ? page.cursor : undefined;
        if (cursor) seen.add(cursor);
        cursors.current.set(key, seen);
        setCache((previous) => {
          const entry = ownValue(previous, connectionId);
          if (entry?.scope !== scope) return previous;
          return {
            ...previous,
            [connectionId]: {
              ...entry,
              streams: {
                ...entry.streams,
                [group]: {
                  items: [
                    ...new Map(
                      [
                        ...(more
                          ? (ownValue(entry.streams, group)?.items ?? [])
                          : []),
                        ...page.items,
                      ].map((item) => [item.name, item]),
                    ).values(),
                  ].sort(
                    (a, b) =>
                      (b.lastEventTime ?? -1) - (a.lastEventTime ?? -1) ||
                      a.name.localeCompare(b.name),
                  ),
                  cursor,
                  loaded: true,
                  loading: false,
                },
              },
            },
          };
        });
      } catch (error) {
        if (current(connection, scope) && pending.current.get(key) === request)
          setCache((previous) => {
            const entry = ownValue(previous, connectionId);
            return entry?.scope !== scope
              ? previous
              : {
                  ...previous,
                  [connectionId]: {
                    ...entry,
                    streams: {
                      ...entry.streams,
                      [group]: {
                        items: [],
                        ...ownValue(entry.streams, group),
                        loading: false,
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      },
                    },
                  },
                };
          });
      } finally {
        if (pending.current.get(key) === request) pending.current.delete(key);
      }
    },
    [],
  );
  useEffect(() => {
    const valid = new Set(
      connections
        .filter(
          (connection) =>
            (!regex && caseSensitive) || visibleRegions.includes(connection.id),
        )
        .map((connection) =>
          resourceScope(connection, search, regex, caseSensitive),
        ),
    );
    for (const key of pending.current.keys())
      if (!valid.has(JSON.parse(key)[0])) {
        pending.current.delete(key);
        regexTasks.current.get(key)?.abort();
        regexTasks.current.delete(key);
      }
    for (const key of cursors.current.keys())
      if (!valid.has(JSON.parse(key)[0])) cursors.current.delete(key);
    setCache((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id, entry]) =>
          connections.some(
            (connection) =>
              connection.id === id &&
              entry.scope ===
                resourceScope(connection, search, regex, caseSensitive) &&
              ((!regex && caseSensitive) ||
                visibleRegions.includes(id) ||
                !entry.groups.loading),
          ),
        ),
      ),
    );
  }, [identities, visible]);
  useEffect(() => {
    for (const id of visibleRegions) {
      const connection = connections.find((connection) => connection.id === id);
      const entry = ownValue(cache, id);
      if (
        connection &&
        (!entry ||
          entry.scope !==
            resourceScope(connection, search, regex, caseSensitive) ||
          (!entry.groups.loaded &&
            !entry.groups.loading &&
            !entry.groups.error))
      )
        void loadGroups(id);
    }
  }, [identities, visible, cache, loadGroups]);
  return { cache, loadGroups, loadStreams };
}
