# AWS Log Explorer

## Intent and constraints

A local, keyboard-friendly desktop workspace for everyday CloudWatch investigation. Resource navigation, queries, live monitoring and structured event inspection share one actual data path. Offline fixtures are explicitly labeled; they never imply verified AWS behavior. Development, tests and unpackaged builds must not read AWS configuration or connect to AWS. No backend infrastructure is needed.

## Architecture

Electron hosts a sandboxed React renderer. Only the main process imports the official AWS SDK, resolves profiles, accesses files or starts network operations. A narrow typed preload bridge validates all incoming requests. The application starts offline, including packaged builds. AWS access can be enabled deliberately in a packaged build; development cannot enable it. Authorization is process-local and is never restored from workspace data.

Electron is selected over Tauri for the mature Node credential-provider ecosystem and Windows integration. Mantine supplies accessible dialogs, menus and forms. TanStack Table and Virtual handle columns and bounded rendering. TypeScript contracts isolate service implementations from workspace and visualization logic.

## Modules and behavior

- `src/shared`: serializable contracts, bounded JSON parsing/flattening and the bounded binary split-layout model.
- `src/main`: gated CloudWatch adapter, offline adapter, cancellable jobs, bounded concurrency, atomic persistence, export dialogs and desktop lifecycle.
- `src/renderer`: independent tab configurations, named colored groups, four-pane workspace, resource sidebar, query toolbar, reusable queries, preferences and event viewer.
- `tests`: isolated unit/integration tests and Electron smoke coverage. A setup hook denies external network and redirects credential paths to nonexistent fixture locations.

Event fetching uses FilterLogEvents with explicit continuation and automatically follows bounded runs of empty pages that still have a token. Reaching that scan budget preserves a user-accessible continuation. Stream selection is passed to AWS. Insights uses StartQuery, bounded polling and StopQuery on cancellation. Aggregation results are retained as structured rows. Live Tail uses the service stream and surfaces sampling. Combining sources is restricted to one connection/region per view; separate panes can use different connections. Cancellation and generation IDs prevent stale responses from replacing newer results. View buffers have a configurable upper bound and report eviction/truncation. Metadata is lazily fetched and cached by connection and search text. Group discovery uses AWS's case-sensitive substring search and hydrates the exact matching names to retain complete group metadata.

Resource clicks open transient preview tabs. Another resource replaces an eligible preview in the target pane while previews displayed elsewhere remain intact. Double-clicking a resource or preview label keeps that tab permanently. Changes to its query, filter pattern, source, connection or query kind also promote the preview so that a later resource click cannot discard the edited query. Date and visualization changes alone leave it transient. Tabs can be moved between panes without duplicating a displayed tab; splitting a displayed view creates an independent configuration when a second instance is required.

Pane arrangements are binary split trees with horizontal or vertical branches and persistent proportions. A workspace contains at most four unique pane leaves and three levels of splits; each proportion is bounded to 20–80%. Main-process validation strips unknown layout fields, checks exact pane references and rejects duplicate assignments. Renderer restoration accepts the existing version-0/version-1 workspace formats, retains valid layout and preview fields, and rebuilds a legacy arrangement from pane order and saved split sizes when an older or invalid layout is encountered. Selecting two to four tabs and choosing **Show in split mode** creates their shared workspace arrangement. Divider movement updates the layout locally while dragging, then persists the committed proportion.

JSON, table and hybrid modes share stable event IDs. Flattened paths use JSON Pointer to preserve dotted keys and arrays. Expandable inspection is bounded by depth and node count. Search over loaded events is labeled local; filter patterns and Insights are labeled server-side. Export includes only the loaded/filtered selection. Sessions persist configurations, never log payloads or credentials. Corrupt persistence recovers with a backup and a visible warning.

## Delivery and verification

Implement small vertical steps: contracts and safety; service and fixtures; secure desktop shell; full workspace; structured viewer; integration and packaging. Validate parsing, pagination, cancellation, AWS gating, persistence, tab/split invariants and the real desktop path with fixtures. Build an unpacked Windows application and installer configuration. Code signing and macOS/Linux artifacts require their respective release environments. No production-readiness claim substitutes for these checks.
