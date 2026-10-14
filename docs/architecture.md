# AWS Log Explorer

## Intent and constraints

A local, keyboard-friendly desktop workspace for everyday CloudWatch investigation. Resource navigation, queries, live monitoring and structured event inspection share one actual data path. Offline fixtures are explicitly labeled; they never imply verified AWS behavior. Development, tests and unpackaged builds must not read AWS configuration or connect to AWS. No backend infrastructure is needed.

## Architecture

Electron hosts a sandboxed React renderer. Only the main process imports the official AWS SDK, resolves profiles, accesses files or starts network operations. A narrow typed preload bridge validates all incoming requests. The application starts offline, including packaged builds. AWS access can be enabled deliberately in a packaged build; development cannot enable it. Authorization is process-local and is never restored from workspace data.

Electron is selected over Tauri for the mature Node credential-provider ecosystem and Windows integration. Mantine supplies accessible dialogs, menus and forms. TanStack Table and Virtual handle columns and bounded rendering. TypeScript contracts isolate service implementations from workspace and visualization logic.

## Modules and behavior

- `src/shared`: serializable contracts, bounded JSON parsing/flattening, input validation and workspace migration.
- `src/main`: gated CloudWatch adapter, offline adapter, cancellable jobs, bounded concurrency, atomic persistence, export dialogs and desktop lifecycle.
- `src/renderer`: independent tab configurations, named colored groups, four-pane workspace, resource sidebar, query toolbar, reusable queries, preferences and event viewer.
- `tests`: isolated unit/integration tests and Electron smoke coverage. A setup hook denies external network and redirects credential paths to nonexistent fixture locations.

Event fetching uses FilterLogEvents with explicit continuation. Stream selection is passed to AWS. Insights uses StartQuery, bounded polling and StopQuery on cancellation. Aggregation results are retained as structured rows. Live Tail uses the service stream and surfaces sampling. Combining sources is restricted to one connection/region per view; separate panes can use different connections. Cancellation and generation IDs prevent stale responses from replacing newer results. View buffers have a configurable upper bound and report eviction/truncation. Metadata is lazily fetched and cached by connection and search prefix.

JSON, table and hybrid modes share stable event IDs. Flattened paths use JSON Pointer to preserve dotted keys and arrays. Expandable inspection is bounded by depth and node count. Search over loaded events is labeled local; filter patterns and Insights are labeled server-side. Export includes only the loaded/filtered selection. Sessions persist configurations, never log payloads or credentials. Corrupt persistence recovers with a backup and a visible warning.

## Delivery and verification

Implement small vertical steps: contracts and safety; service and fixtures; secure desktop shell; full workspace; structured viewer; integration and packaging. Validate parsing, pagination, cancellation, AWS gating, persistence, tab/split invariants and the real desktop path with fixtures. Build an unpacked Windows application and installer configuration. Code signing and macOS/Linux artifacts require their respective release environments. No production-readiness claim substitutes for these checks.
