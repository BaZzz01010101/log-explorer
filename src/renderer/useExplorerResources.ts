import { useCallback, useEffect, useRef, useState } from "react";
import { ownValue } from "../shared/records";
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
export const resourceScope = (connection: Connection, search: string) =>
  JSON.stringify([
    connection.id,
    connection.profile,
    connection.region,
    connection.mode,
    search,
  ]);
export function useExplorerResources(
  connections: Connection[],
  visibleRegions: string[],
  search: string,
) {
  const [cache, setCache] = useState<Record<string, RegionResources>>({});
  const refs = useRef({ connections, search, cache });
  refs.current = { connections, search, cache };
  const mounted = useRef(true),
    sequence = useRef(0),
    pending = useRef(new Map<string, number>()),
    cursors = useRef(new Map<string, Set<string>>());
  const identities = JSON.stringify(
    connections.map((connection) => resourceScope(connection, search)),
  );
  const visible = JSON.stringify(visibleRegions);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current.clear();
      cursors.current.clear();
    };
  }, []);
  const current = (connection: Connection, scope: string) =>
    mounted.current &&
    refs.current.connections.some(
      (item) =>
        item.id === connection.id &&
        resourceScope(item, refs.current.search) === scope,
    );
  const loadGroups = useCallback(async (connectionId: string, more = false) => {
    const connection = refs.current.connections.find(
      (item) => item.id === connectionId,
    );
    if (!connection) return;
    const scope = resourceScope(connection, refs.current.search),
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
      if (pending.current.get(key) === request) pending.current.delete(key);
    }
  }, []);
  const loadStreams = useCallback(
    async (connectionId: string, group: string, more = false) => {
      const connection = refs.current.connections.find(
        (item) => item.id === connectionId,
      );
      if (!connection) return;
      const scope = resourceScope(connection, refs.current.search),
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
                  ],
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
      connections.map((connection) => resourceScope(connection, search)),
    );
    for (const key of pending.current.keys())
      if (!valid.has(JSON.parse(key)[0])) pending.current.delete(key);
    for (const key of cursors.current.keys())
      if (!valid.has(JSON.parse(key)[0])) cursors.current.delete(key);
    setCache((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id, entry]) =>
          connections.some(
            (connection) =>
              connection.id === id &&
              entry.scope === resourceScope(connection, search),
          ),
        ),
      ),
    );
  }, [identities]);
  useEffect(() => {
    for (const id of visibleRegions) {
      const connection = connections.find((connection) => connection.id === id);
      const entry = ownValue(cache, id);
      if (
        connection &&
        (!entry ||
          entry.scope !== resourceScope(connection, search) ||
          (!entry.groups.loaded &&
            !entry.groups.loading &&
            !entry.groups.error))
      )
        void loadGroups(id);
    }
  }, [identities, visible, cache, loadGroups]);
  return { cache, loadGroups, loadStreams };
}
