# AWS Log Explorer

A desktop workspace for browsing CloudWatch Logs, inspecting structured events, running queries and monitoring live streams. Built with TypeScript, Electron 44, React 19, Mantine 9, TanStack Table/Virtual and the official AWS SDK v3.

The application initially starts **offline**. Development and unpackaged builds cannot enable AWS access, read configured AWS profiles or resolve credentials. In packaged builds, **Enable AWS access** in Settings is remembered across restarts; enabling it refreshes Explorer and retries AWS log views automatically. This preference is stored separately from workspace files and cannot be enabled by importing a workspace. Offline/background verification always ignores the preference and keeps AWS disabled.

## Run locally

Use Node.js 24 and npm. From the repository directory:

```sh
npm ci
npx install-electron --no
npm run dev
```

The Electron download command is useful when the runtime binary is missing; it downloads Electron, not AWS data. See the [Electron installation instructions](https://github.com/electron/electron/blob/main/docs/tutorial/installation.md).

The initial tab opens `/aws/lambda/orders-api` from local fixtures. Fixtures include nested objects, arrays, literal dotted keys, long payloads, stack traces and malformed JSON. Their event times are relative to the current session. The **Live** button on an offline connection generates an explicitly simulated local stream.

**Live** receives new matching events automatically, preserving matching loaded history. The status distinguishes connecting, connected and stopped sessions and counts newly received events. A connected stream with no matches shows **Waiting for new events**. **Follow Live** scrolls to the newest event; scrolling or selecting pauses following while reception continues. **Stop Live** retains received rows and stays stopped. Time shortcuts, **Run** and changing Events/Insights stop Live and load history; the selected historical time range does not limit a Live stream. Failed connections offer **Retry Live**. See [Live Tail notes](docs/live-tail-0.1.20.md).

## Investigate logs

1. Choose a **Profile** and **Region** from the non-editable dropdowns above Explorer. Its tree contains only log groups and their streams for that selection. The selection remains after the last tab closes. Search text anywhere in a group name; matching ignores case by default. The inner **Match case** and **Regex** toggles refine matching across pages. While the search field is focused, **Alt+C** toggles case sensitivity and **Alt+E** toggles regex; change these in Settings → Shortcuts. Invalid or slow patterns show an error without blocking the window. A single click previews a group or stream in a reusable italic tab; double-click the resource or tab to keep it open. Editing a preview's query also keeps it open. Groups and expanded streams load their next page automatically when you scroll to the end. Right-click a group or stream for copy and source actions.
2. Use **Events** for CloudWatch filter patterns or **Insights** for CWLI queries. Switching modes runs the selected query automatically and retains both text drafts. New tabs have a **Clear** date filter, covering available history through now. Toolbar time shortcuts apply immediately. **Custom** provides Relative duration/unit choices and an Absolute calendar: click the start day, then the end day. Separate date/time fields default to whole inclusive days; focus a segment and use the wheel or arrow keys to adjust it. **Apply** refreshes results without Run; Cancel, Escape and outside clicks discard draft changes. The adjacent Local/UTC selector preserves saved instants. **Run** applies query-text changes. Scrolling to the bottom loads the next historical page. Very sparse searches pause after a bounded burst; scroll down again to continue. **Stop** cancels the active operation.
3. Switch between JSON, table and hybrid views. Drag column headers directly in Table or Hybrid to reorder them within their pinned or unpinned section; resize using their edge handles. A simple header click still sorts. Single-click an event to select it; double-click or press Enter to open its right-hand inspector. Arrow keys, Home/End and the inspector's Previous/Next buttons move through the current rows. Escape or Hide closes the inspector. Drag its divider or use the focused divider's arrow keys to resize it. Structured content supports individual and bulk folding, Add as column and Add to filter. Column formats include JSON, IEC bytes, durations and local/UTC dates. JSON Pointer column paths preserve literal keys: `/http.status` is distinct from `/http/status`, and `/items/0/sku` selects an array element.
4. Search and filter loaded events locally. The adjacent **Highlight text** field emphasizes literal text without filtering events or querying again; its clear button removes the marks, and the text is saved per view. Save queries or per-group view presets, copy raw events and export the loaded selection as JSON, JSONL or CSV. Surrounding context opens a two-minute window on either side of an event when its source stream is available.
5. Ctrl-click selects individual tabs, starting with the active tab included; Shift-click selects an inclusive range from the anchor. Right-click a selection and choose **Show in split mode** to merge views into one combined tab, within the workspace's 100-view budget. Its split icon and tooltip identify the members. Activating a normal tab shows one full pane; activating the combined tab restores its layout. Right-click **Rename tab** to change a label, **Duplicate independent view** to insert a copy beside it, or **Exit split screen** to restore a split's members as normal tabs.
6. Drag a normal or combined tab near the strip to reorder it. Move farther away for a cursor copy; hover another tab to reveal its panes, then drop on a highlighted edge to merge beside a pane. Pane headers use the same floating preview: drop on a center to swap, on an edge to move into the exact highlighted area, or into the tab strip to detach at its insertion marker. A split with one remaining panel becomes a normal tab. Split icons reflect the next direction. Resize dividers with the pointer or arrow keys; double-click or press Home to reset. Layouts and labels persist with the workspace. A normal label resets when its tab closes; a split label lasts until that split ends. Settings control appearance, connections, shortcuts, refresh and buffers. Event payloads are not persisted.

Choose **Settings → Preferences → Tab layout → Multiple rows** to wrap tabs, or **Scroll** for a horizontal strip. Middle-click closes tabs in either mode. Split dividers have visible grips, and each pane's header identifies its active state.

The fold/unfold-all control beside line wrapping applies to JSON, Table and Hybrid messages. Newly loaded messages inherit that choice. JSON and Hybrid also retain individual expansion controls; Table keeps its existing column geometry and uses the bulk control. A single bottom status reports loaded/shown counts and useful query feedback. Initial loading is centered in an empty viewer; continuation loading appears at the end of the list.

Use the **…** before a structured field name for **Add as column**, **Add to filter** and **Deserialize**. Deserialize is available for valid JSON strings and turns them into foldable values marked in violet. This temporary projection applies only to that event in the current view; closing the view or replacing the event clears it. Decoded paths work in columns and local filters, and their displayed values are used in record copies and CSV. Original messages and full-event JSON/JSONL exports remain unchanged.

The level filter supports multiple selections with checkboxes. Clicking a level name selects only that level; Ctrl/Cmd-click toggles it while keeping the other choices. Clearing every checkbox shows no events. Right-click a Table or Hybrid column header for Move left/right, Pin, Pin left, Unpin and Unpin right. Pin moves a column beside the last pinned column; Pin left pins the displayed prefix in place; Unpin right releases the displayed suffix. Hidden column settings and widths remain intact.

The event scrollbar has a compact overview: warning/error/fatal colors on the left, quick and profile highlight colors on the right. Each band scales with its events' occupied area; consecutive events with the same colors join without artificial gaps. Click anywhere in a band to select the event at that position. The map covers the current filtered/sorted loaded rows, including offscreen events; dense pixels combine colors and prioritize higher severity. Background colors identify profile matches, with foreground colors used when no background is set. Decoded JSON and formatted quick-highlight values are included. The native thumb remains draggable.

Multi-source Table and Hybrid views automatically show a **Source** column with shortened group/stream names and profile/region details across connections. Full source details are on hover. You can resize, reorder or hide this column; explicit hidden choices persist. Selected rows keep the theme selection color on hover in all event modes. See [view polish notes](docs/view-polish-0.1.14.md).

New event viewers open the inspector at 30% of their event area. The toggle beside Export shows or hides it; selection and a manually resized width survive toggling. The default proportion follows pane resizing until you choose a width.

Inspector **Add to filter** appends an escaped JSON Pointer property term to the local search, for example `@"/level"="INFO"`. This filters loaded events without sending a CloudWatch query. Local timestamps use the same numeric date/time format as UTC, with the event's local UTC offset.

**Settings → Highlights** manages optional highlight profiles. Leave a profile's log-group regex empty to apply it everywhere, or scope it to matching group names. Rules search the entire message or a JSON Pointer property, and color either the whole event row or matching text. Choose foreground/background colors shared by both themes, or enable separate light/dark colors. Profiles and rules can be disabled and reordered. Quick literal highlighting is available directly beside loaded-event search in each viewer. Regex matching runs in a worker with a timeout; limits and pattern errors are shown in the editor.

Drag Explorer groups or streams onto a **pane** to create or extend its split layout. Use checkboxes, Ctrl/Cmd-click or Shift ranges to select multiple resources. Right-click the selection to open a new multisource/split view or add sources/panes to the current view. Dragging a selected item carries the batch; a whole group includes its streams and suppresses redundant stream selections. Each explicitly selected stream becomes its own pane in split mode. The highlight previews the complete final area; edges choose placement and the center uses the next split direction. Hover another tab to reveal its layout; Escape cancels and restores the original tab. Combined views share the workspace's 100-view budget.

Event rows also support Ctrl/Cmd toggles and Shift ranges, including Shift with arrow keys or Home/End. With the event list focused, Ctrl/Cmd+A selects its currently filtered rows and Ctrl/Cmd+C copies their raw messages in displayed order. Ctrl/Cmd+Shift+C copies records: one JSON object per line, with visible column IDs as field names, original JSON value types and `null` for missing cells. The selection-count button copies messages; its arrow menu and the row context menu offer both formats. Text fields and selected inspector text keep their normal copy behavior. Hybrid row previews stay on one line even for multiline messages; expand details or use the inspector to read the full message.

Drag directly over event text to select a substring for normal text copying, including text with highlights. Highlights settings use a compact profile section, a rule table on the left and the selected rule's editor on the right. Drag rule handles to reorder priority, or use Space/arrow keys, move buttons or the Priority field. **Test and preview** expands the live profile preview below the editor.

Selected event rows use the theme's selection color ahead of profile row colors. Hover adds a subtle gray tint to the row's current color, including selected and regex-highlighted rows; expanded message details keep their colors. Pinned and unpinned columns share the same row background.

Regex results are cached and prepared offscreen, with visible rows taking priority during fast scrolling. Rows still being checked briefly show **Preparing highlights…** instead of unchecked content. The full-result cache is bounded; rule/theme changes invalidate it and stalled regex work still times out. During Live, selecting text pauses following while events continue arriving, and routine updates preserve the selected text nodes and native range. See [scrolling and selection notes](docs/highlight-scroll-and-live-selection-0.1.22.md).

Drop onto the **N Sources** badge list beside Events/Insights to add sources to that view instead. The control is hidden for a single source and appears during Explorer dragging so a second source can be added. The count label has no frame; each separate badge has a rounded border, remove button and full group/stream/profile/region information on hover. Shared directory prefixes are shortened, and stream labels include the first six identifier characters. Generated multi-source and split-tab labels use **Mixed Sources (N)**, counting individual stream sources across all member panes; manual names remain. Adding/removing sources automatically queries the current selection while preserving view settings. Multiple streams from the same group merge without duplicates; a whole-group source already includes its streams. Event queries can combine configured connections/regions, retaining regional identity through pagination and surrounding context. Live Tail and Insights require one connection/region and explain that limit. Explorer streams are ordered newest first. See [Explorer split notes](docs/explorer-splits-0.1.12.md) and [source management details](docs/sources-0.1.11.md).

The main window remembers its normal position/size and maximized state. Restored bounds are kept inside an available monitor's work area, so a disconnected monitor does not leave the window off-screen.

**Settings → Connections → Profiles and regions** lets you **Add profile** from the known list, then **Add region** by code or location. Only added profiles and regions appear as cards and rows. Removing an entry hides it while preserving its saved connection and open tabs; it can be added back later. Known regions come from the installed SDK catalog, including commercial, China and GovCloud partitions; selecting a region does not enable that region in your AWS account. Profile discovery requires enabled AWS access in a packaged build. Configured names remain editable offline. The advanced connection editor has been removed. See [Explorer and quick-highlight changes](docs/explorer-selectors-0.1.8.md).

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

## Saved views

Right-click a normal or combined tab and choose **Save view to Favorites**, or drag the tab into **Favorites**. A favorite saves sources and their profile/region connections, all member tab settings, split layout/proportions, queries, local filters, columns and time windows. Relative windows remain relative when reopened; absolute bounds remain exact. Opening a favorite creates an independent copy named after the favorite, including combined views. Right-click a favorite to rename or remove it. Menus open beside the pointer; Shift+F10 opens one for the focused favorite. A renamed favorite keeps an independent alias for its saved configuration. Existing group/stream favorites migrate automatically. See [saved views and access](docs/saved-views-and-access-0.1.13.md).

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
