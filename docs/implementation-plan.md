# Implementation plan

The user supplied a comprehensive brief and explicitly delegated product and technical decisions. Proceed autonomously inside this empty workspace, without extra approval gates or commits. The AWS restriction is absolute.

1. Establish TypeScript contracts, Electron/Vite configuration and test isolation. Write behavioral tests for JSON Pointer flattening, safe workspace restoration and pane/tab invariants before implementation.
2. Implement `createLogService(emit, { allowAws })` behind `ExplorerApi` contracts. Cover fixture pagination, query updates/cancellation and denial before any AWS provider/client construction. Implement official FilterLogEvents, Insights and Live Tail adapters without executing them against AWS.
3. Implement a secure Electron main process and preload bridge. Validate request payloads and sender frames; expose explicit methods. Persist versioned workspace atomically; support export/copy and close cleanup. Development AWS enablement must fail.
4. Implement the React workspace: profile/region connections, lazy paginated hierarchy, favorites/recents, tabs/groups and four draggable panes. Persist configuration with debounce; support tab cycling, closing/reopening and command palette.
5. Implement the structured viewer: virtualized JSON/table/hybrid modes, column discovery, resizing/sorting/pinning/order/visibility, local filtering, presets, event inspection/copy/export and highlighting. Cover nested arrays, dotted keys, huge messages and invalid JSON.
6. Connect query execution, progress, cancellation, manual continuation, time presets/custom ranges, multi-group selection, saved queries/history, surrounding context, refresh and Live Tail. Distinguish service and local filtering.
7. Run typecheck, critical tests, production build and an isolated Electron smoke test. Review security and lifecycle independently. Fix material findings. Document commands, release requirements, AWS permissions and any limitations honestly.

## Review focus

- Stale/cancelled query results cannot overwrite an active tab.
- Empty paginated AWS pages retain continuation and repeated tokens terminate safely.
- Malformed or older workspace files never enable AWS or crash startup.
- Large/deep/hostile JSON remains bounded, preserves literal keys and renders as text.
- Closing tabs/windows, changing connections and ending live streams release jobs and listeners.

## Ownership

Main/service, visualization and workspace state are independent implementation tasks sharing `src/shared/contracts.ts`. The root implements the desktop shell, sidebar, query UI and integration. Changes remain reviewable and uncommitted.
