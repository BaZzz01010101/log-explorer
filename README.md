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

1. Choose a **Profile** and **Region** from the dropdowns above Explorer. Its tree contains only log groups and their streams for that selection. The selection remains after the last tab closes. Search for case-sensitive text anywhere in a group name. A single click previews a group or stream in a reusable italic tab; double-click the resource or tab to keep it open. Editing a preview's query also keeps it open. Groups and expanded streams load their next page automatically when you scroll to the end.
2. Use **Events** for CloudWatch filter patterns or **Insights** for CWLI queries. New tabs have a **Clear** date filter, covering available history through now. Toolbar time shortcuts apply immediately. **Custom** provides Relative duration/unit choices and an Absolute calendar: click the start day, then the end day. Separate date/time fields default to whole inclusive days; focus a segment and use the wheel or arrow keys to adjust it. **Apply** refreshes results without Run; Cancel, Escape and outside clicks discard draft changes. The adjacent Local/UTC selector preserves saved instants. **Run** applies query-text changes. Scrolling to the bottom loads the next historical page. Very sparse searches pause after a bounded burst; scroll down again to continue. **Stop** cancels the active operation.
3. Switch between JSON, table and hybrid views. Drag column headers directly in Table or Hybrid to reorder them within their pinned or unpinned section; resize using their edge handles. A simple header click still sorts. Single-click an event to select it; double-click or press Enter to open its right-hand inspector. Arrow keys, Home/End and the inspector's Previous/Next buttons move through the current rows. Escape or Hide closes the inspector. Drag its divider or use the focused divider's arrow keys to resize it. Structured content supports individual and bulk folding, Add as column and Add to filter. Column formats include JSON, IEC bytes, durations and local/UTC dates. JSON Pointer column paths preserve literal keys: `/http.status` is distinct from `/http/status`, and `/items/0/sku` selects an array element.
4. Search and filter loaded events locally. The adjacent **Highlight text** field emphasizes literal text without filtering events or querying again; its clear button removes the marks, and the text is saved per view. Save queries or per-group view presets, copy raw events and export the loaded selection as JSON, JSONL or CSV. Surrounding context opens a two-minute window on either side of an event when its source stream is available.
5. Ctrl-click selects individual tabs, starting with the active tab included; Shift-click selects an inclusive range from the anchor. Right-click a selection and choose **Show in split mode** to merge two to four views into one combined tab. Its split icon and tooltip identify the members. Activating a normal tab shows one full pane; activating the combined tab restores its layout. Right-click **Rename tab** to change a label, **Duplicate independent view** to insert a copy beside it, or **Exit split screen** to restore a split's members as normal tabs.
6. Drag a normal or combined tab near the strip to reorder it. Move farther away for a cursor copy; hover another tab to reveal its panes, then drop on a highlighted edge to merge beside a pane. Pane headers use the same floating preview: drop on a center to swap, on an edge to move into the exact highlighted area, or into the tab strip to detach at its insertion marker. A split with one remaining panel becomes a normal tab. Split icons reflect the next direction. Resize dividers with the pointer or arrow keys; double-click or press Home to reset. Layouts and labels persist with the workspace. A normal label resets when its tab closes; a split label lasts until that split ends. Settings control appearance, connections, shortcuts, refresh and buffers. Event payloads are not persisted.

Choose **Settings → Preferences → Tab layout → Multiple rows** to wrap tabs, or **Scroll** for a horizontal strip. Middle-click closes tabs in either mode. Split dividers have visible grips, and each pane's header identifies its active state.

The fold/unfold-all control beside line wrapping applies to JSON, Table and Hybrid messages. Newly loaded messages inherit that choice. JSON and Hybrid also retain individual expansion controls; Table keeps its existing column geometry and uses the bulk control. A single bottom status reports loaded/shown counts and useful query feedback. Initial loading is centered in an empty viewer; continuation loading appears at the end of the list.

Inspector **Add to filter** appends an escaped JSON Pointer property term to the local search, for example `@"/level"="INFO"`. This filters loaded events without sending a CloudWatch query. Local timestamps use the same numeric date/time format as UTC, with the event's local UTC offset.

**Settings → Highlights** manages optional highlight profiles. Leave a profile's log-group regex empty to apply it everywhere, or scope it to matching group names. Rules search the entire message or a JSON Pointer property, and color either the whole event row or matching text. Choose foreground/background colors shared by both themes, or enable separate light/dark colors. Profiles and rules can be disabled and reordered. Quick literal highlighting is available directly beside loaded-event search in each viewer. Regex matching runs in a worker with a timeout; limits and pattern errors are shown in the editor.

Drag an Explorer group or stream onto a log pane to add it to that view's sources. Duplicates merge, an all-stream group includes later stream drops, and sources from another connection/region are rejected. Escape cancels a drag. **Sources → Edit sources** provides searchable groups, selected-group cards, all-stream or individual-stream choices, removable streams and direct name entry. Apply stages the new source selection; Run queries it. Cancel preserves the prior selection.

The main window remembers its normal position/size and maximized state. Restored bounds are kept inside an available monitor's work area, so a disconnected monitor does not leave the window off-screen.

**Settings → Connections → Profiles and regions** lets you **Add profile** from the known list, then **Add region** by code or location. Only added profiles and regions appear as cards and rows. Removing an entry hides it while preserving its saved connection and open tabs; it can be added back later. Known regions come from the installed SDK catalog, including commercial, China and GovCloud partitions; selecting a region does not enable that region in your AWS account. Profile discovery requires the explicitly authorized packaged AWS session. Configured names remain editable offline, and manual fields remain under **Advanced connection settings**. See [Explorer and quick-highlight changes](docs/explorer-selectors-0.1.8.md).

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

Desktop test artifacts, including retained failure traces, default to `.tmp/test-results/`. Keep custom `--output` paths under `.tmp/` as well. For an optional JSON report, set `PLAYWRIGHT_JSON_OUTPUT_FILE=.tmp/test-results/report.json` and use `--reporter=list,json`. For an HTML report, set `PLAYWRIGHT_HTML_OUTPUT_DIR=.tmp/playwright-report` and `PLAYWRIGHT_HTML_OPEN=never` before using `--reporter=list,html`.

See [AWS integration](docs/aws-integration.md) for authentication, API behavior and permissions; [release notes](docs/release.md) for packaging and signing; [feature status](docs/feature-status.md) for scope and the final verification record; [renderer freeze investigation](docs/renderer-freeze-investigation.md) for the 0.1.1 fix and revised testing; [the current interaction plan](docs/panel-drag-and-query-controls-plan.md) and [combined-tab fixes](docs/combined-tabs-0.1.3.md) for interaction changes; and [architecture](docs/architecture.md) for module boundaries. This implementation has not been tested against real AWS and is not a verified commercial production release.

MIT licensed; see [LICENSE](LICENSE).
