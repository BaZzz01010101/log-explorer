# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer-interactions.spec.ts >> expanded hybrid rows retain aligned geometry through horizontal scrolling
- Location: tests\desktop\viewer-interactions.spec.ts:201:5

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 327
Received:    -92
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e9]:
      - paragraph [ref=e10]: AWS Log Explorer
      - paragraph [ref=e11]: Investigation workspace
    - button "Search commands and tabs Ctrl K" [ref=e12] [cursor=pointer]:
      - generic [ref=e16]: Search commands and tabs
      - generic [ref=e17]: Ctrl K
    - generic [ref=e18]:
      - generic [ref=e19]: Offline · no AWS access
      - button "Workspace settings" [ref=e21] [cursor=pointer]
  - generic [ref=e27]:
    - navigation "Application tools" [ref=e28]:
      - button "Toggle explorer" [ref=e29] [cursor=pointer]
      - button "Commands" [ref=e33] [cursor=pointer]
      - button "Settings" [ref=e37] [cursor=pointer]
    - generic [ref=e43]:
      - complementary "AWS resources" [ref=e44]:
        - generic [ref=e45]:
          - paragraph [ref=e46]: Explorer
          - generic [ref=e47]:
            - button "Refresh resources" [ref=e48] [cursor=pointer]
            - button "Manage connections" [ref=e53] [cursor=pointer]
        - generic [ref=e58]:
          - combobox "AWS connection" [ref=e64]: Offline fixtures
          - generic [ref=e65]:
            - paragraph [ref=e66]: default
            - generic [ref=e67]: Offline fixtures
        - generic [ref=e69]:
          - textbox "Log group prefix" [ref=e76]:
            - /placeholder: Log group prefix…
          - textbox "Filter loaded streams" [ref=e79]:
            - /placeholder: Filter loaded streams…
        - button "eu-west-1 5" [expanded] [ref=e80] [cursor=pointer]:
          - strong [ref=e85]: eu-west-1
          - generic [ref=e86]: "5"
        - tree "Log groups and streams" [ref=e87]:
          - generic [ref=e88]:
            - treeitem "/aws/lambda/orders-api" [level=1] [ref=e90]:
              - button "Expand /aws/lambda/orders-api" [ref=e91] [cursor=pointer]
              - checkbox "Select /aws/lambda/orders-api" [ref=e94]
              - button "/aws/lambda/orders-api" [ref=e95] [cursor=pointer]
              - button "Favorite /aws/lambda/orders-api" [ref=e99] [cursor=pointer]
              - button "Details for /aws/lambda/orders-api" [ref=e102] [cursor=pointer]
            - treeitem "/aws/lambda/payments-worker" [level=1] [ref=e107]:
              - button "Expand /aws/lambda/payments-worker" [ref=e108] [cursor=pointer]
              - checkbox "Select /aws/lambda/payments-worker" [ref=e111]
              - button "/aws/lambda/payments-worker" [ref=e112] [cursor=pointer]
              - button "Favorite /aws/lambda/payments-worker" [ref=e116] [cursor=pointer]
              - button "Details for /aws/lambda/payments-worker" [ref=e119] [cursor=pointer]
            - treeitem "/aws/lambda/media-pipeline" [level=1] [ref=e124]:
              - button "Expand /aws/lambda/media-pipeline" [ref=e125] [cursor=pointer]
              - checkbox "Select /aws/lambda/media-pipeline" [ref=e128]
              - button "/aws/lambda/media-pipeline" [ref=e129] [cursor=pointer]
              - button "Favorite /aws/lambda/media-pipeline" [ref=e133] [cursor=pointer]
              - button "Details for /aws/lambda/media-pipeline" [ref=e136] [cursor=pointer]
            - treeitem "/aws/lambda/notifications" [level=1] [ref=e141]:
              - button "Expand /aws/lambda/notifications" [ref=e142] [cursor=pointer]
              - checkbox "Select /aws/lambda/notifications" [ref=e145]
              - button "/aws/lambda/notifications" [ref=e146] [cursor=pointer]
              - button "Favorite /aws/lambda/notifications" [ref=e150] [cursor=pointer]
              - button "Details for /aws/lambda/notifications" [ref=e153] [cursor=pointer]
            - treeitem "/ecs/checkout" [level=1] [ref=e158]:
              - button "Expand /ecs/checkout" [ref=e159] [cursor=pointer]
              - checkbox "Select /ecs/checkout" [ref=e162]
              - button "/ecs/checkout" [ref=e163] [cursor=pointer]
              - button "Favorite /ecs/checkout" [ref=e167] [cursor=pointer]
              - button "Details for /ecs/checkout" [ref=e170] [cursor=pointer]
        - button "Load more groups" [ref=e174] [cursor=pointer]
        - paragraph [ref=e178]: Arrow keys navigate · Enter opens · Space selects
      - separator "Resize explorer" [ref=e179]
    - main [ref=e180]:
      - generic [ref=e181]:
        - tablist "Log views" [ref=e182]:
          - button "Drag orders-api to reorder or move to a pane" [ref=e183]
          - tab "orders-api" [selected] [ref=e191] [cursor=pointer]
          - button "Actions for orders-api" [ref=e196] [cursor=pointer]
          - button "Close orders-api" [ref=e201] [cursor=pointer]
        - generic [ref=e205]:
          - button "New log view" [ref=e206] [cursor=pointer]
          - button "Add split pane" [ref=e209] [cursor=pointer]
          - button "Workspace tab menu" [ref=e213] [cursor=pointer]
      - generic "Split panes" [ref=e218]:
        - generic [ref=e219]: PANES
        - generic [ref=e220]:
          - button "Reorder pane 1" [ref=e221]
          - button "1 orders-api" [pressed] [ref=e229] [cursor=pointer]:
            - generic [ref=e230]: "1"
            - generic [ref=e231]: orders-api
      - region "Pane 1" [ref=e234]:
        - generic [ref=e235]:
          - generic [ref=e236]:
            - generic [ref=e237]: "1"
            - paragraph [ref=e239]: orders-api
          - button "Split pane" [ref=e243] [cursor=pointer]
        - tabpanel "orders-api" [ref=e247]:
          - generic [ref=e248]:
            - generic [ref=e249]:
              - generic [ref=e250]:
                - radiogroup "Server query type" [ref=e251]:
                  - generic [ref=e253]:
                    - radio "Events" [checked]
                    - generic [ref=e254] [cursor=pointer]: Events
                  - generic [ref=e255]:
                    - radio "Insights"
                    - generic [ref=e256] [cursor=pointer]: Insights
                - button "1 source" [ref=e257] [cursor=pointer]
              - generic [ref=e263]:
                - combobox "Time range" [ref=e270] [cursor=pointer]: Last hour
                - button "Saved queries and presets" [ref=e271] [cursor=pointer]
            - generic [ref=e275]:
              - generic [ref=e278]:
                - generic [ref=e279]: SERVER
                - textbox "CloudWatch filter pattern" [ref=e282]:
                  - /placeholder: "{ $.level = \"error\" } or \"request failed\""
              - generic [ref=e283]:
                - button "Run" [ref=e284] [cursor=pointer]
                - button "Live" [ref=e290] [cursor=pointer]
            - generic [ref=e296]:
              - paragraph [ref=e297]: CloudWatch pattern • server-side selection • limited fixture interpreter
              - paragraph [ref=e298]: Control+Enter
          - generic [ref=e300]:
            - generic [ref=e301]:
              - textbox "Local filter loaded events" [ref=e308]:
                - /placeholder: Search loaded events…
              - combobox "Local level filter" [ref=e311] [cursor=pointer]: All levels
              - button "Local filtering help" [ref=e312] [cursor=pointer]
              - radiogroup "Event view mode" [ref=e316]:
                - generic [ref=e318]:
                  - radio "JSON"
                  - generic [ref=e319] [cursor=pointer]: JSON
                - generic [ref=e325]:
                  - radio "Table"
                  - generic [ref=e326] [cursor=pointer]: Table
                - generic [ref=e331]:
                  - radio "Hybrid" [checked]
                  - generic [ref=e332] [cursor=pointer]: Hybrid
              - button "Configure columns" [ref=e337] [cursor=pointer]
              - button "Toggle line wrap" [ref=e341] [cursor=pointer]
              - button "Export loaded filtered events" [ref=e345] [cursor=pointer]:
                - generic [ref=e346]: Export
            - generic [ref=e352]:
              - generic [ref=e353]: LOCAL · 540 / 540 loaded events
              - generic [ref=e355]: 511 JSON · Local time
            - region "Log events" [ref=e356]:
              - row [ref=e357]:
                - columnheader [ref=e359]:
                  - button "Timestamp" [ref=e360] [cursor=pointer]
                  - separator "Resize Timestamp" [ref=e365]
                - columnheader [ref=e366]:
                  - button "Level" [ref=e367] [cursor=pointer]
                  - separator "Resize Level" [ref=e368]
                - columnheader [ref=e369]:
                  - button "/service/name" [ref=e370] [cursor=pointer]
                  - separator "Resize /service/name" [ref=e371]
                - columnheader [ref=e372]:
                  - button "Message" [ref=e373] [cursor=pointer]
                  - separator "Resize Message" [ref=e374]
                - columnheader [ref=e375]:
                  - button "/request/id" [ref=e376] [cursor=pointer]
                  - separator "Resize /request/id" [ref=e377]
              - generic [ref=e378]:
                - row [ref=e380]:
                  - button "Expand event details" [ref=e381] [cursor=pointer]
                  - cell [ref=e384]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e385] [cursor=pointer]: Oct 14 16:10:00.000
                  - cell [ref=e386]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e387] [cursor=pointer]:
                      - generic [ref=e388]: unknown
                  - cell [ref=e390]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e391] [cursor=pointer]: —
                  - cell [ref=e392]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e393] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                  - cell [ref=e394]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e395] [cursor=pointer]: —
                - generic [ref=e396]:
                  - row [ref=e397]:
                    - button "Collapse event details" [active] [ref=e398] [cursor=pointer]
                    - cell [ref=e401]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e402] [cursor=pointer]: Oct 14 16:10:05.000
                    - cell [ref=e403]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e404] [cursor=pointer]:
                        - generic [ref=e405]: info
                    - cell [ref=e407]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e408] [cursor=pointer]: orders-api
                    - cell [ref=e409]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e410] [cursor=pointer]: Request processed
                    - cell [ref=e411]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e412] [cursor=pointer]: req-000001
                  - generic [ref=e413]:
                    - generic [ref=e414]:
                      - generic [ref=e415]:
                        - button "Collapse root" [ref=e416] [cursor=pointer]
                        - generic "Root" [ref=e419]: $
                        - generic [ref=e420]: ":"
                        - generic [ref=e421]: "{9 keys}"
                        - button "Add root column" [ref=e422] [cursor=pointer]
                      - generic [ref=e425]:
                        - generic "/timestamp" [ref=e426]: "\"timestamp\""
                        - generic [ref=e427]: ":"
                        - generic [ref=e428]: "\"1970-01-01T00:00:01.000Z\""
                        - button "Add /timestamp column" [ref=e429] [cursor=pointer]
                      - generic [ref=e432]:
                        - generic "/level" [ref=e433]: "\"level\""
                        - generic [ref=e434]: ":"
                        - generic [ref=e435]: "\"INFO\""
                        - button "Add /level column" [ref=e436] [cursor=pointer]
                      - generic [ref=e439]:
                        - generic "/message" [ref=e440]: "\"message\""
                        - generic [ref=e441]: ":"
                        - generic [ref=e442]: "\"Request processed\""
                        - button "Add /message column" [ref=e443] [cursor=pointer]
                      - generic [ref=e446]:
                        - button "Expand /service" [ref=e447] [cursor=pointer]
                        - generic "/service" [ref=e450]: "\"service\""
                        - generic [ref=e451]: ":"
                        - generic [ref=e452]: "{3 keys}"
                        - button "Add /service column" [ref=e453] [cursor=pointer]
                      - generic [ref=e456]:
                        - button "Expand /request" [ref=e457] [cursor=pointer]
                        - generic "/request" [ref=e460]: "\"request\""
                        - generic [ref=e461]: ":"
                        - generic [ref=e462]: "{4 keys}"
                        - button "Add /request column" [ref=e463] [cursor=pointer]
                      - generic [ref=e466]:
                        - button "Expand /user" [ref=e467] [cursor=pointer]
                        - generic "/user" [ref=e470]: "\"user\""
                        - generic [ref=e471]: ":"
                        - generic [ref=e472]: "{2 keys}"
                        - button "Add /user column" [ref=e473] [cursor=pointer]
                      - generic [ref=e476]:
                        - button "Expand /items" [ref=e477] [cursor=pointer]
                        - generic "/items" [ref=e480]: "\"items\""
                        - generic [ref=e481]: ":"
                        - generic [ref=e482]: "[2 items]"
                        - button "Add /items column" [ref=e483] [cursor=pointer]
                      - generic [ref=e486]:
                        - generic "/http.status" [ref=e487]: "\"http.status\""
                        - generic [ref=e488]: ":"
                        - generic [ref=e489]: "200"
                        - button "Add /http.status column" [ref=e490] [cursor=pointer]
                      - generic [ref=e493]:
                        - generic "/traceId" [ref=e494]: "\"traceId\""
                        - generic [ref=e495]: ":"
                        - generic [ref=e496]: "\"1-offline-000000000000000000000001\""
                        - button "Add /traceId column" [ref=e497] [cursor=pointer]
                    - generic [ref=e500]:
                      - button "Open inspector" [ref=e501] [cursor=pointer]
                      - button "Copy raw" [ref=e504] [cursor=pointer]
                      - button "Surrounding context" [ref=e511] [cursor=pointer]
                - row [ref=e515]:
                  - button "Expand event details" [ref=e516] [cursor=pointer]
                  - cell [ref=e519]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e520] [cursor=pointer]: Oct 14 16:10:10.000
                  - cell [ref=e521]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e522] [cursor=pointer]:
                      - generic [ref=e523]: debug
                  - cell [ref=e525]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e526] [cursor=pointer]: orders-api
                  - cell [ref=e527]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e528] [cursor=pointer]: Request processed
                  - cell [ref=e529]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e530] [cursor=pointer]: req-000002
                - row [ref=e532]:
                  - button "Expand event details" [ref=e533] [cursor=pointer]
                  - cell [ref=e536]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e537] [cursor=pointer]: Oct 14 16:10:15.000
                  - cell [ref=e538]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e539] [cursor=pointer]:
                      - generic [ref=e540]: warn
                  - cell [ref=e542]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e543] [cursor=pointer]: orders-api
                  - cell [ref=e544]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e545] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e546]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e547] [cursor=pointer]: req-000003
                - row [ref=e549]:
                  - button "Expand event details" [ref=e550] [cursor=pointer]
                  - cell [ref=e553]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e554] [cursor=pointer]: Oct 14 16:10:20.000
                  - cell [ref=e555]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e556] [cursor=pointer]:
                      - generic [ref=e557]: info
                  - cell [ref=e559]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e560] [cursor=pointer]: orders-api
                  - cell [ref=e561]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e562] [cursor=pointer]: Request processed
                  - cell [ref=e563]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e564] [cursor=pointer]: req-000004
                - row [ref=e566]:
                  - button "Expand event details" [ref=e567] [cursor=pointer]
                  - cell [ref=e570]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e571] [cursor=pointer]: Oct 14 16:10:25.000
                  - cell [ref=e572]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e573] [cursor=pointer]:
                      - generic [ref=e574]: error
                  - cell [ref=e576]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e577] [cursor=pointer]: orders-api
                  - cell [ref=e578]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e579] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e580]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e581] [cursor=pointer]: req-000005
                - row [ref=e583]:
                  - button "Expand event details" [ref=e584] [cursor=pointer]
                  - cell [ref=e587]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e588] [cursor=pointer]: Oct 14 16:10:30.000
                  - cell [ref=e589]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e590] [cursor=pointer]:
                      - generic [ref=e591]: info
                  - cell [ref=e593]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e594] [cursor=pointer]: orders-api
                  - cell [ref=e595]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e596] [cursor=pointer]: Request processed
                  - cell [ref=e597]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e598] [cursor=pointer]: req-000006
                - row [ref=e600]:
                  - button "Expand event details" [ref=e601] [cursor=pointer]
                  - cell [ref=e604]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e605] [cursor=pointer]: Oct 14 16:10:35.000
                  - cell [ref=e606]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e607] [cursor=pointer]:
                      - generic [ref=e608]: info
                  - cell [ref=e610]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e611] [cursor=pointer]: orders-api
                  - cell [ref=e612]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e613] [cursor=pointer]: Request processed
                  - cell [ref=e614]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e615] [cursor=pointer]: req-000007
                - row [ref=e617]:
                  - button "Expand event details" [ref=e618] [cursor=pointer]
                  - cell [ref=e621]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e622] [cursor=pointer]: Oct 14 16:10:40.000
                  - cell [ref=e623]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e624] [cursor=pointer]:
                      - generic [ref=e625]: debug
                  - cell [ref=e627]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e628] [cursor=pointer]: orders-api
                  - cell [ref=e629]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e630] [cursor=pointer]: Request processed
                  - cell [ref=e631]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e632] [cursor=pointer]: req-000008
            - generic [ref=e633]:
              - generic [ref=e634]: Expand a row for JSON · Click a cell to inspect
              - generic [ref=e635]: Export covers this loaded selection
          - status [ref=e636]:
            - generic [ref=e637]:
              - paragraph [ref=e639]: complete · 540 loaded
              - paragraph [ref=e640]: 540 scanned
              - paragraph [ref=e641]: 0.0s
      - status [ref=e642]
  - contentinfo [ref=e643]:
    - generic [ref=e644]:
      - paragraph [ref=e646]: Isolated local development
      - paragraph [ref=e647]: 1 tabs · 1 panes
    - generic [ref=e648]:
      - paragraph [ref=e649]: Saved locally
      - paragraph [ref=e650]: v0.1.1
```

# Test source

```ts
  146 |   await expect(page.locator("body")).not.toHaveClass(/resizing-columns/);
  147 |   const resized = (await header.boundingBox())!.width;
  148 |   const next = (await handle.boundingBox())!;
  149 |   await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  150 |   await page.mouse.down();
  151 |   await page.mouse.move(
  152 |     next.x + next.width / 2 - 45,
  153 |     next.y + next.height / 2,
  154 |     { steps: 6 },
  155 |   );
  156 |   await page.mouse.up();
  157 |   await expect
  158 |     .poll(async () => (await header.boundingBox())!.width)
  159 |     .toBeLessThan(resized - 35);
  160 |   await page.getByLabel("Local filter loaded events").fill("Payment");
  161 |   await expect(page.locator(".log-table-row").first()).toContainText("Payment");
  162 |   const savedWidth = Math.round((await header.boundingBox())!.width);
  163 |   await expect
  164 |     .poll(async () => {
  165 |       const stored = JSON.parse(
  166 |         await readFile(join(directory, "workspace.json"), "utf8"),
  167 |       );
  168 |       return stored.tabs[0].view.columns.find(
  169 |         (column: { path: string }) => column.path === "@timestamp",
  170 |       ).width;
  171 |     })
  172 |     .toBe(savedWidth);
  173 | });
  174 | 
  175 | test("all view mode labels keep their icon and text on the same line", async () => {
  176 |   const labels = page
  177 |     .locator(".viewer-toolbar label")
  178 |     .filter({ hasText: /^(JSON|Table|Hybrid)$/ });
  179 |   await expect(labels).toHaveCount(3);
  180 |   const geometries = await labels.evaluateAll((elements) =>
  181 |     elements.map((element) => {
  182 |       const icon = element.querySelector("svg")!.getBoundingClientRect();
  183 |       const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  184 |       let node = walker.nextNode();
  185 |       while (node && !node.textContent?.trim()) node = walker.nextNode();
  186 |       const range = document.createRange();
  187 |       range.selectNodeContents(node!);
  188 |       const text = range.getBoundingClientRect();
  189 |       return {
  190 |         delta: Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
  191 |         height: element.getBoundingClientRect().height,
  192 |       };
  193 |     }),
  194 |   );
  195 |   for (const geometry of geometries) {
  196 |     expect(geometry.delta).toBeLessThan(2);
  197 |     expect(geometry.height).toBeLessThan(25);
  198 |   }
  199 | });
  200 | 
  201 | test("expanded hybrid rows retain aligned geometry through horizontal scrolling", async () => {
  202 |   await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 800));
  203 |   await page
  204 |     .locator("label")
  205 |     .filter({ hasText: /^Hybrid$/ })
  206 |     .click();
  207 |   const events = page.locator(".table-event");
  208 |   await page
  209 |     .getByRole("button", { name: "Expand event details" })
  210 |     .nth(1)
  211 |     .click();
  212 |   const detail = page.locator(".hybrid-detail").first();
  213 |   await expect(detail).toBeVisible();
  214 |   await expect(detail.locator(".json-tree")).toBeVisible();
  215 |   await expect
  216 |     .poll(async () => {
  217 |       const expanded = await events.nth(1).boundingBox();
  218 |       const following = await events.nth(2).boundingBox();
  219 |       return following!.y - expanded!.y - expanded!.height;
  220 |     })
  221 |     .toBeGreaterThanOrEqual(-1);
  222 |   const viewport = page.getByRole("region", {
  223 |     name: "Log events",
  224 |     exact: true,
  225 |   });
  226 |   const rect = (await viewport.boundingBox())!;
  227 |   await page.mouse.move(rect.x + rect.width / 2, rect.y + 15);
  228 |   await page.mouse.wheel(420, 0);
  229 |   await expect
  230 |     .poll(() => viewport.evaluate((element) => element.scrollLeft))
  231 |     .toBeGreaterThan(100);
  232 |   const layout = await page.evaluate(() => {
  233 |     const viewport = document
  234 |       .querySelector(".viewer-scroll")!
  235 |       .getBoundingClientRect();
  236 |     const detail = document
  237 |       .querySelector(".hybrid-detail")!
  238 |       .getBoundingClientRect();
  239 |     const header = document
  240 |       .querySelector(".log-header-cell")!
  241 |       .getBoundingClientRect();
  242 |     const cell = document.querySelector(".log-cell")!.getBoundingClientRect();
  243 |     return { viewport, detail, delta: Math.abs(header.x - cell.x) };
  244 |   });
  245 |   expect(layout.delta).toBeLessThan(1);
> 246 |   expect(layout.detail.x).toBeGreaterThanOrEqual(layout.viewport.x - 1);
      |                           ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  247 |   expect(layout.detail.right).toBeLessThanOrEqual(layout.viewport.right + 1);
  248 |   await page.getByRole("button", { name: "Collapse event details" }).click();
  249 |   await expect(detail).toHaveCount(0);
  250 | });
  251 | 
```