# AWS Log Explorer

A desktop workspace for browsing CloudWatch Logs, inspecting structured events, running queries and monitoring live streams. Built with TypeScript, Electron 44, React 19, Mantine 9, TanStack Table/Virtual and the official AWS SDK v3.

The application starts **offline**. Development and unpackaged builds cannot enable AWS access, read configured AWS profiles or resolve credentials. Packaged builds also start offline; deliberate session authorization is required in Settings. Workspace files never restore authorization.

## Run locally

Use Node.js 24 and npm. From the repository directory:

```sh
npm ci
npx install-electron --no
npm run dev
```

The Electron download command is useful when the runtime binary is missing; it downloads Electron, not AWS data. See the [Electron installation instructions](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md).

The initial tab opens `/aws/lambda/orders-api` from local fixtures. Fixtures include nested objects, arrays, literal dotted keys, long payloads, stack traces and malformed JSON. Their event times are relative to the current session. The **Live** button on an offline connection generates an explicitly simulated local stream.

## Investigate logs

1. Choose a connection/region in the explorer. Its selection remains after the last tab closes. Search for case-sensitive text anywhere in a group name. A single click previews a group or stream in a reusable italic tab; double-click the resource or tab to keep it open. Editing a preview's query also keeps it open. Groups and expanded streams load their next page automatically when you scroll to the end. Stream filtering searches loaded stream names.
2. Use **Events** for CloudWatch filter patterns or **Insights** for CWLI queries. New tabs have a **Clear** date filter, covering available history through now. Open the range picker for **Relative** or **Absolute** dates; the adjacent timezone selector switches Local/UTC while preserving saved instants. Valid changes refresh automatically. **Run** applies query-text changes. Scrolling to the bottom loads the next historical page. Very sparse searches pause after a bounded burst; scroll down again to continue. **Stop** cancels the active operation.
3. Switch between JSON, table and hybrid views. Drag column headers directly in Table or Hybrid to reorder them within their pinned or unpinned section; resize using their edge handles. A simple header click still sorts. Discover nested fields, configure/pin columns and inspect individual events. Column formats include JSON, IEC bytes, durations and local/UTC dates. JSON Pointer column paths preserve literal keys: `/http.status` is distinct from `/http/status`, and `/items/0/sku` selects an array element.
4. Search and filter loaded events locally, save queries or per-group view presets, copy raw events and export the loaded selection as JSON, JSONL or CSV. Surrounding context opens a two-minute window on either side of an event when its source stream is available.
5. Ctrl-click selects individual tabs, starting with the active tab included; Shift-click selects an inclusive range from the anchor. Right-click a selection and choose **Show in split mode** to merge two to four views into one combined tab. Its split icon and tooltip identify the members. Activating a normal tab shows one full pane; activating the combined tab restores its layout. Right-click **Rename tab** to change a label, **Duplicate independent view** to insert a copy beside it, or **Exit split screen** to restore a split's members as normal tabs.
6. Drag a normal or combined tab near the strip to reorder it. Move farther away for a cursor copy; hover another tab to reveal its panes, then drop on a highlighted edge to merge beside a pane. Pane headers use the same floating preview: drop on a center to swap, on an edge to move into the exact highlighted area, or into the tab strip to detach at its insertion marker. A split with one remaining panel becomes a normal tab. Split icons reflect the next direction. Resize dividers with the pointer or arrow keys; double-click or press Home to reset. Layouts and labels persist with the workspace. A normal label resets when its tab closes; a split label lasts until that split ends. Settings control appearance, connections, shortcuts, refresh and buffers. Event payloads are not persisted.

The fold/unfold-all control beside line wrapping applies to JSON, Table and Hybrid messages. Newly loaded messages inherit that choice. JSON and Hybrid also retain individual expansion controls; Table keeps its existing column geometry and uses the bulk control.

`Ctrl+K` opens commands, `Ctrl+Enter` runs a query, `Ctrl+W` closes a tab, `Ctrl+Shift+T` reopens it and `Ctrl+Tab` cycles tabs. Shortcuts are configurable. Automatic refresh is disabled by default (`0`); enable a refresh interval explicitly in Settings. Each view retains at most its configured event count and 16 million raw message characters, with visible eviction reporting.

## Offline query examples

Event patterns support positive words and quoted phrases, with case-sensitive matching:

```text
ERROR
"Payment provider"
ERROR "timed out"
```

Select **Insights** for these fixture-supported examples:

```text
fields @timestamp, @message | sort @timestamp desc | limit 100
filter level = "ERROR" | fields @timestamp, level, request.id | limit 50
filter @message like /Payment/ | fields @timestamp, @message | limit 50
stats count(*) as total by level
```

The offline interpreter supports only this documented subset. JSON filter patterns, boolean/regex CloudWatch patterns, `parse`, SQL/PPL, general expressions and stages following an aggregation are unsupported offline and produce an error. Enabled AWS connections send CloudWatch event patterns or CWLI queries to the actual service.

## Development and release commands

| Command                | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Start the offline development desktop                      |
| `npm run typecheck`    | Check TypeScript                                           |
| `npm test`             | Run isolated unit/integration tests                        |
| `npm run build`        | Typecheck and build main, preload and renderer into `out/` |
| `npm run test:desktop` | Run the fixture-based Electron smoke test after building   |
| `npm run package`      | Build an unpacked application in `release/`                |
| `npm run dist`         | Build distribution artifacts for the host platform         |

Unit tests deny network connections and redirect AWS configuration paths to nonexistent locations. Desktop tests use temporary application storage, an allowlisted environment and trusted Chromium mouse/keyboard input. `--background-verification` keeps their windows hidden and permanently disables AWS for the process, so the tests do not steal desktop focus. Packaged verification also uses `--offline-verification`. **Never enable AWS access or run real AWS CLI/SDK requests during development, tests or verification.** Tool auto-approval does not authorize AWS access.

See [AWS integration](docs/aws-integration.md) for authentication, API behavior and permissions; [release notes](docs/release.md) for packaging and signing; [feature status](docs/feature-status.md) for scope and the final verification record; [renderer freeze investigation](docs/renderer-freeze-investigation.md) for the 0.1.1 fix and revised testing; [the current interaction plan](docs/panel-drag-and-query-controls-plan.md) and [combined-tab fixes](docs/combined-tabs-0.1.3.md) for interaction changes; and [architecture](docs/architecture.md) for module boundaries. This implementation has not been tested against real AWS and is not a verified commercial production release.

MIT licensed; see [LICENSE](LICENSE).
