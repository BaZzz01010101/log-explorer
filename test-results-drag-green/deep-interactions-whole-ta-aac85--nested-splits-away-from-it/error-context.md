# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deep-interactions.spec.ts >> whole tabs reorder near the strip and create highlighted nested splits away from it
- Location: tests\desktop\deep-interactions.spec.ts:300:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.workspace-pane')
Expected: 4
Received: 3
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" locator('.workspace-pane') with timeout 5000ms
  - waiting for locator('.workspace-pane')
    14 × locator resolved to 3 elements
       - unexpected value "3"

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
          - generic [ref=e70]:
            - paragraph [ref=e71]: Matches anywhere · case-sensitive
            - textbox "Search log groups" [ref=e77]:
              - /placeholder: Search log groups…
          - textbox "Filter loaded streams" [ref=e80]:
            - /placeholder: Filter loaded streams…
        - button "eu-west-1 5" [expanded] [ref=e81] [cursor=pointer]:
          - strong [ref=e86]: eu-west-1
          - generic [ref=e87]: "5"
        - tree "Log groups and streams" [ref=e88]:
          - generic [ref=e89]:
            - treeitem "/aws/lambda/orders-api" [level=1] [ref=e91]:
              - button "Expand /aws/lambda/orders-api" [ref=e92] [cursor=pointer]
              - checkbox "Select /aws/lambda/orders-api" [ref=e95]
              - button "/aws/lambda/orders-api" [ref=e96] [cursor=pointer]
              - button "Favorite /aws/lambda/orders-api" [ref=e100] [cursor=pointer]
              - button "Details for /aws/lambda/orders-api" [ref=e103] [cursor=pointer]
            - treeitem "/aws/lambda/payments-worker" [level=1] [ref=e108]:
              - button "Expand /aws/lambda/payments-worker" [ref=e109] [cursor=pointer]
              - checkbox "Select /aws/lambda/payments-worker" [ref=e112]
              - button "/aws/lambda/payments-worker" [ref=e113] [cursor=pointer]
              - button "Favorite /aws/lambda/payments-worker" [ref=e117] [cursor=pointer]
              - button "Details for /aws/lambda/payments-worker" [ref=e120] [cursor=pointer]
            - treeitem "/aws/lambda/media-pipeline" [level=1] [ref=e125]:
              - button "Expand /aws/lambda/media-pipeline" [ref=e126] [cursor=pointer]
              - checkbox "Select /aws/lambda/media-pipeline" [ref=e129]
              - button "/aws/lambda/media-pipeline" [ref=e130] [cursor=pointer]
              - button "Favorite /aws/lambda/media-pipeline" [ref=e134] [cursor=pointer]
              - button "Details for /aws/lambda/media-pipeline" [ref=e137] [cursor=pointer]
            - treeitem "/aws/lambda/notifications" [level=1] [ref=e142]:
              - button "Expand /aws/lambda/notifications" [ref=e143] [cursor=pointer]
              - checkbox "Select /aws/lambda/notifications" [ref=e146]
              - button "/aws/lambda/notifications" [ref=e147] [cursor=pointer]
              - button "Favorite /aws/lambda/notifications" [ref=e151] [cursor=pointer]
              - button "Details for /aws/lambda/notifications" [ref=e154] [cursor=pointer]
            - treeitem "/ecs/checkout" [level=1] [ref=e159]:
              - button "Expand /ecs/checkout" [ref=e160] [cursor=pointer]
              - checkbox "Select /ecs/checkout" [ref=e163]
              - button "/ecs/checkout" [ref=e164] [cursor=pointer]
              - button "Favorite /ecs/checkout" [ref=e168] [cursor=pointer]
              - button "Details for /ecs/checkout" [ref=e171] [cursor=pointer]
        - button "Load more groups" [ref=e175] [cursor=pointer]
        - generic [ref=e178]:
          - paragraph [ref=e179]: Arrow keys navigate · Enter previews · Double-click keeps · Space selects
          - group [ref=e180]:
            - generic "Recent sources" [ref=e181] [cursor=pointer]
      - separator "Resize explorer" [ref=e182]
    - main [ref=e183]:
      - generic [ref=e184]:
        - tablist "Log views" [ref=e185]:
          - tab "payments-worker" [ref=e186] [cursor=pointer]
          - button "Close payments-worker" [ref=e191] [cursor=pointer]
          - tab "media-pipeline" [active] [selected] [ref=e195] [cursor=pointer]
          - button "Close media-pipeline" [ref=e200] [cursor=pointer]
          - tab "orders-api" [ref=e204] [cursor=pointer]
          - button "Close orders-api" [ref=e209] [cursor=pointer]
        - generic [ref=e213]:
          - button "New log view" [ref=e214] [cursor=pointer]
          - button "Add split pane" [ref=e217] [cursor=pointer]
          - button "Workspace tab menu" [ref=e221] [cursor=pointer]
      - generic "Split panes" [ref=e226]:
        - generic [ref=e227]: PANES
        - generic [ref=e228]:
          - button "Reorder pane 1" [ref=e229]
          - button "1 orders-api" [ref=e237] [cursor=pointer]:
            - generic [ref=e238]: "1"
            - generic [ref=e239]: orders-api
          - button "Close pane 1" [ref=e240] [cursor=pointer]
        - generic [ref=e244]:
          - button "Reorder pane 2" [ref=e245]
          - button "2 payments-worker" [ref=e253] [cursor=pointer]:
            - generic [ref=e254]: "2"
            - generic [ref=e255]: payments-worker
          - button "Close pane 2" [ref=e256] [cursor=pointer]
        - generic [ref=e260]:
          - button "Reorder pane 3" [ref=e261]
          - button "3 media-pipeline" [pressed] [ref=e269] [cursor=pointer]:
            - generic [ref=e270]: "3"
            - generic [ref=e271]: media-pipeline
          - button "Close pane 3" [ref=e272] [cursor=pointer]
      - generic [ref=e277]:
        - region "Pane 1" [ref=e281]:
          - generic [ref=e282]:
            - generic [ref=e283]:
              - generic [ref=e284]: "1"
              - paragraph [ref=e286]: orders-api
              - paragraph [ref=e289]: eu-west-1
            - generic [ref=e290]:
              - button "Split pane" [ref=e291] [cursor=pointer]
              - button "Close pane 1" [ref=e295] [cursor=pointer]
          - tabpanel "orders-api" [ref=e300]:
            - generic [ref=e301]:
              - generic [ref=e302]:
                - generic [ref=e303]:
                  - radiogroup "Server query type" [ref=e304]:
                    - generic [ref=e306]:
                      - radio "Events" [checked]
                      - generic [ref=e307] [cursor=pointer]: Events
                    - generic [ref=e308]:
                      - radio "Insights"
                      - generic [ref=e309] [cursor=pointer]: Insights
                  - button "1 source" [ref=e310] [cursor=pointer]
                - generic [ref=e316]:
                  - combobox "Time range" [ref=e323] [cursor=pointer]: Last hour
                  - button "Saved queries and presets" [ref=e324] [cursor=pointer]
              - generic [ref=e328]:
                - generic [ref=e331]:
                  - generic [ref=e332]: SERVER
                  - textbox "CloudWatch filter pattern" [ref=e335]:
                    - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                - generic [ref=e336]:
                  - button "Run" [ref=e337] [cursor=pointer]
                  - button "Live" [ref=e343] [cursor=pointer]
              - generic [ref=e349]:
                - paragraph [ref=e350]: CloudWatch pattern • server-side selection • limited fixture interpreter
                - paragraph [ref=e351]: Control+Enter
            - generic [ref=e353]:
              - generic [ref=e354]:
                - textbox "Local filter loaded events" [ref=e361]:
                  - /placeholder: Search loaded events…
                - combobox "Local level filter" [ref=e364] [cursor=pointer]: All levels
                - button "Local filtering help" [ref=e365] [cursor=pointer]
                - radiogroup "Event view mode" [ref=e369]:
                  - generic [ref=e371]:
                    - radio "JSON"
                    - generic [ref=e372] [cursor=pointer]: JSON
                  - generic [ref=e379]:
                    - radio "Table"
                    - generic [ref=e380] [cursor=pointer]: Table
                  - generic [ref=e386]:
                    - radio "Hybrid" [checked]
                    - generic [ref=e387] [cursor=pointer]: Hybrid
                - button "Configure columns" [ref=e393] [cursor=pointer]
                - button "Toggle line wrap" [ref=e397] [cursor=pointer]
                - button "Export loaded filtered events" [ref=e401] [cursor=pointer]:
                  - generic [ref=e402]: Export
              - generic [ref=e408]:
                - generic [ref=e409]: LOCAL · 540 / 540 loaded events
                - generic [ref=e411]: 511 JSON · Local time
              - region "Log events" [ref=e412]:
                - row [ref=e413]:
                  - columnheader [ref=e415]:
                    - button "Timestamp" [ref=e416] [cursor=pointer]
                    - separator "Resize Timestamp" [ref=e421]
                  - columnheader [ref=e422]:
                    - button "Level" [ref=e423] [cursor=pointer]
                    - separator "Resize Level" [ref=e424]
                  - columnheader [ref=e425]:
                    - button "/service/name" [ref=e426] [cursor=pointer]
                    - separator "Resize /service/name" [ref=e427]
                  - columnheader [ref=e428]:
                    - button "Message" [ref=e429] [cursor=pointer]
                    - separator "Resize Message" [ref=e430]
                  - columnheader [ref=e431]:
                    - button "/request/id" [ref=e432] [cursor=pointer]
                    - separator "Resize /request/id" [ref=e433]
                - generic [ref=e434]:
                  - row [ref=e436]:
                    - button "Expand event details" [ref=e437] [cursor=pointer]
                    - cell [ref=e440]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e441] [cursor=pointer]: Oct 14 16:20:00.000
                    - cell [ref=e442]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e443] [cursor=pointer]:
                        - generic [ref=e444]: unknown
                    - cell [ref=e446]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e447] [cursor=pointer]: —
                    - cell [ref=e448]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e449] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                    - cell [ref=e450]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e451] [cursor=pointer]: —
                  - row [ref=e453]:
                    - button "Expand event details" [ref=e454] [cursor=pointer]
                    - cell [ref=e457]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e458] [cursor=pointer]: Oct 14 16:20:05.000
                    - cell [ref=e459]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e460] [cursor=pointer]:
                        - generic [ref=e461]: info
                    - cell [ref=e463]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e464] [cursor=pointer]: orders-api
                    - cell [ref=e465]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e466] [cursor=pointer]: Request processed
                    - cell [ref=e467]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e468] [cursor=pointer]: req-000001
                  - row [ref=e470]:
                    - button "Expand event details" [ref=e471] [cursor=pointer]
                    - cell [ref=e474]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e475] [cursor=pointer]: Oct 14 16:20:10.000
                    - cell [ref=e476]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e477] [cursor=pointer]:
                        - generic [ref=e478]: debug
                    - cell [ref=e480]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e481] [cursor=pointer]: orders-api
                    - cell [ref=e482]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e483] [cursor=pointer]: Request processed
                    - cell [ref=e484]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e485] [cursor=pointer]: req-000002
                  - row [ref=e487]:
                    - button "Expand event details" [ref=e488] [cursor=pointer]
                    - cell [ref=e491]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e492] [cursor=pointer]: Oct 14 16:20:15.000
                    - cell [ref=e493]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e494] [cursor=pointer]:
                        - generic [ref=e495]: warn
                    - cell [ref=e497]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e498] [cursor=pointer]: orders-api
                    - cell [ref=e499]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e500] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e501]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e502] [cursor=pointer]: req-000003
                  - row [ref=e504]:
                    - button "Expand event details" [ref=e505] [cursor=pointer]
                    - cell [ref=e508]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e509] [cursor=pointer]: Oct 14 16:20:20.000
                    - cell [ref=e510]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e511] [cursor=pointer]:
                        - generic [ref=e512]: info
                    - cell [ref=e514]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e515] [cursor=pointer]: orders-api
                    - cell [ref=e516]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e517] [cursor=pointer]: Request processed
                    - cell [ref=e518]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e519] [cursor=pointer]: req-000004
                  - row [ref=e521]:
                    - button "Expand event details" [ref=e522] [cursor=pointer]
                    - cell [ref=e525]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e526] [cursor=pointer]: Oct 14 16:20:25.000
                    - cell [ref=e527]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e528] [cursor=pointer]:
                        - generic [ref=e529]: error
                    - cell [ref=e531]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e532] [cursor=pointer]: orders-api
                    - cell [ref=e533]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e534] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e535]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e536] [cursor=pointer]: req-000005
                  - row [ref=e538]:
                    - button "Expand event details" [ref=e539] [cursor=pointer]
                    - cell [ref=e542]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e543] [cursor=pointer]: Oct 14 16:20:30.000
                    - cell [ref=e544]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e545] [cursor=pointer]:
                        - generic [ref=e546]: info
                    - cell [ref=e548]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e549] [cursor=pointer]: orders-api
                    - cell [ref=e550]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e551] [cursor=pointer]: Request processed
                    - cell [ref=e552]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e553] [cursor=pointer]: req-000006
                  - row [ref=e555]:
                    - button "Expand event details" [ref=e556] [cursor=pointer]
                    - cell [ref=e559]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e560] [cursor=pointer]: Oct 14 16:20:35.000
                    - cell [ref=e561]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e562] [cursor=pointer]:
                        - generic [ref=e563]: info
                    - cell [ref=e565]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e566] [cursor=pointer]: orders-api
                    - cell [ref=e567]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e568] [cursor=pointer]: Request processed
                    - cell [ref=e569]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e570] [cursor=pointer]: req-000007
                  - row [ref=e572]:
                    - button "Expand event details" [ref=e573] [cursor=pointer]
                    - cell [ref=e576]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e577] [cursor=pointer]: Oct 14 16:20:40.000
                    - cell [ref=e578]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e579] [cursor=pointer]:
                        - generic [ref=e580]: debug
                    - cell [ref=e582]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e583] [cursor=pointer]: orders-api
                    - cell [ref=e584]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e585] [cursor=pointer]: Request processed
                    - cell [ref=e586]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e587] [cursor=pointer]: req-000008
                  - row [ref=e589]:
                    - button "Expand event details" [ref=e590] [cursor=pointer]
                    - cell [ref=e593]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e594] [cursor=pointer]: Oct 14 16:20:45.000
                    - cell [ref=e595]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e596] [cursor=pointer]:
                        - generic [ref=e597]: warn
                    - cell [ref=e599]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e600] [cursor=pointer]: orders-api
                    - cell [ref=e601]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e602] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e603]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e604] [cursor=pointer]: req-000009
              - generic [ref=e605]:
                - generic [ref=e606]: Expand a row for JSON · Click a cell to inspect
                - generic [ref=e607]: Export covers this loaded selection
            - status [ref=e608]:
              - generic [ref=e609]:
                - paragraph [ref=e611]: complete · 540 loaded
                - paragraph [ref=e612]: 540 scanned
                - paragraph [ref=e613]: 0.0s
        - separator "Resize panes vertically" [ref=e614]
        - generic [ref=e616]:
          - region "Pane 3" [ref=e620]:
            - generic [ref=e621]:
              - generic [ref=e622]:
                - generic [ref=e623]: "3"
                - paragraph [ref=e625]: media-pipeline
                - paragraph [ref=e628]: eu-west-1
              - generic [ref=e629]:
                - button "Split pane" [ref=e630] [cursor=pointer]
                - button "Close pane 3" [ref=e634] [cursor=pointer]
            - tabpanel "media-pipeline" [ref=e639]:
              - generic [ref=e640]:
                - generic [ref=e641]:
                  - generic [ref=e642]:
                    - radiogroup "Server query type" [ref=e643]:
                      - generic [ref=e645]:
                        - radio "Events" [checked]
                        - generic [ref=e646] [cursor=pointer]: Events
                      - generic [ref=e647]:
                        - radio "Insights"
                        - generic [ref=e648] [cursor=pointer]: Insights
                    - button "1 source" [ref=e649] [cursor=pointer]
                  - generic [ref=e655]:
                    - combobox "Time range" [ref=e662] [cursor=pointer]: Last hour
                    - button "Saved queries and presets" [ref=e663] [cursor=pointer]
                - generic [ref=e667]:
                  - generic [ref=e670]:
                    - generic [ref=e671]: SERVER
                    - textbox "CloudWatch filter pattern" [ref=e674]:
                      - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                  - generic [ref=e675]:
                    - button "Run" [ref=e676] [cursor=pointer]
                    - button "Live" [ref=e682] [cursor=pointer]
                - generic [ref=e688]:
                  - paragraph [ref=e689]: CloudWatch pattern • server-side selection • limited fixture interpreter
                  - paragraph [ref=e690]: Control+Enter
              - generic [ref=e692]:
                - generic [ref=e693]:
                  - textbox "Local filter loaded events" [ref=e700]:
                    - /placeholder: Search loaded events…
                  - combobox "Local level filter" [ref=e703] [cursor=pointer]: All levels
                  - button "Local filtering help" [ref=e704] [cursor=pointer]
                  - radiogroup "Event view mode" [ref=e708]:
                    - generic [ref=e710]:
                      - radio "JSON"
                      - generic [ref=e711] [cursor=pointer]: JSON
                    - generic [ref=e718]:
                      - radio "Table"
                      - generic [ref=e719] [cursor=pointer]: Table
                    - generic [ref=e725]:
                      - radio "Hybrid" [checked]
                      - generic [ref=e726] [cursor=pointer]: Hybrid
                  - button "Configure columns" [ref=e732] [cursor=pointer]
                  - button "Toggle line wrap" [ref=e736] [cursor=pointer]
                  - button "Export loaded filtered events" [ref=e740] [cursor=pointer]:
                    - generic [ref=e741]: Export
                - generic [ref=e747]:
                  - generic [ref=e748]: LOCAL · 540 / 540 loaded events
                  - generic [ref=e750]: 511 JSON · Local time
                - region "Log events" [ref=e751]:
                  - row [ref=e752]:
                    - columnheader [ref=e754]:
                      - button "Timestamp" [ref=e755] [cursor=pointer]
                      - separator "Resize Timestamp" [ref=e760]
                    - columnheader [ref=e761]:
                      - button "Level" [ref=e762] [cursor=pointer]
                      - separator "Resize Level" [ref=e763]
                    - columnheader [ref=e764]:
                      - button "/service/name" [ref=e765] [cursor=pointer]
                      - separator "Resize /service/name" [ref=e766]
                    - columnheader [ref=e767]:
                      - button "Message" [ref=e768] [cursor=pointer]
                      - separator "Resize Message" [ref=e769]
                    - columnheader [ref=e770]:
                      - button "/request/id" [ref=e771] [cursor=pointer]
                      - separator "Resize /request/id" [ref=e772]
                  - generic [ref=e773]:
                    - row [ref=e775]:
                      - button "Expand event details" [ref=e776] [cursor=pointer]
                      - cell [ref=e779]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e780] [cursor=pointer]: Oct 14 16:20:00.000
                      - cell [ref=e781]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e782] [cursor=pointer]:
                          - generic [ref=e783]: unknown
                      - cell [ref=e785]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e786] [cursor=pointer]: —
                      - cell [ref=e787]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e788] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                      - cell [ref=e789]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e790] [cursor=pointer]: —
                    - row [ref=e792]:
                      - button "Expand event details" [ref=e793] [cursor=pointer]
                      - cell [ref=e796]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e797] [cursor=pointer]: Oct 14 16:20:05.000
                      - cell [ref=e798]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e799] [cursor=pointer]:
                          - generic [ref=e800]: info
                      - cell [ref=e802]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e803] [cursor=pointer]: media-pipeline
                      - cell [ref=e804]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e805] [cursor=pointer]: Request processed
                      - cell [ref=e806]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e807] [cursor=pointer]: req-000001
                    - row [ref=e809]:
                      - button "Expand event details" [ref=e810] [cursor=pointer]
                      - cell [ref=e813]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e814] [cursor=pointer]: Oct 14 16:20:10.000
                      - cell [ref=e815]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e816] [cursor=pointer]:
                          - generic [ref=e817]: debug
                      - cell [ref=e819]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e820] [cursor=pointer]: media-pipeline
                      - cell [ref=e821]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e822] [cursor=pointer]: Request processed
                      - cell [ref=e823]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e824] [cursor=pointer]: req-000002
                    - row [ref=e826]:
                      - button "Expand event details" [ref=e827] [cursor=pointer]
                      - cell [ref=e830]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e831] [cursor=pointer]: Oct 14 16:20:15.000
                      - cell [ref=e832]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e833] [cursor=pointer]:
                          - generic [ref=e834]: warn
                      - cell [ref=e836]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e837] [cursor=pointer]: media-pipeline
                      - cell [ref=e838]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e839] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e840]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e841] [cursor=pointer]: req-000003
                    - row [ref=e843]:
                      - button "Expand event details" [ref=e844] [cursor=pointer]
                      - cell [ref=e847]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e848] [cursor=pointer]: Oct 14 16:20:20.000
                      - cell [ref=e849]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e850] [cursor=pointer]:
                          - generic [ref=e851]: info
                      - cell [ref=e853]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e854] [cursor=pointer]: media-pipeline
                      - cell [ref=e855]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e856] [cursor=pointer]: Request processed
                      - cell [ref=e857]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e858] [cursor=pointer]: req-000004
                    - row [ref=e860]:
                      - button "Expand event details" [ref=e861] [cursor=pointer]
                      - cell [ref=e864]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e865] [cursor=pointer]: Oct 14 16:20:25.000
                      - cell [ref=e866]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e867] [cursor=pointer]:
                          - generic [ref=e868]: error
                      - cell [ref=e870]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e871] [cursor=pointer]: media-pipeline
                      - cell [ref=e872]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e873] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e874]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e875] [cursor=pointer]: req-000005
                    - row [ref=e877]:
                      - button "Expand event details" [ref=e878] [cursor=pointer]
                      - cell [ref=e881]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e882] [cursor=pointer]: Oct 14 16:20:30.000
                      - cell [ref=e883]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e884] [cursor=pointer]:
                          - generic [ref=e885]: info
                      - cell [ref=e887]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e888] [cursor=pointer]: media-pipeline
                      - cell [ref=e889]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e890] [cursor=pointer]: Request processed
                      - cell [ref=e891]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e892] [cursor=pointer]: req-000006
                    - row [ref=e894]:
                      - button "Expand event details" [ref=e895] [cursor=pointer]
                      - cell [ref=e898]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e899] [cursor=pointer]: Oct 14 16:20:35.000
                      - cell [ref=e900]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e901] [cursor=pointer]:
                          - generic [ref=e902]: info
                      - cell [ref=e904]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e905] [cursor=pointer]: media-pipeline
                      - cell [ref=e906]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e907] [cursor=pointer]: Request processed
                      - cell [ref=e908]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e909] [cursor=pointer]: req-000007
                    - row [ref=e911]:
                      - button "Expand event details" [ref=e912] [cursor=pointer]
                      - cell [ref=e915]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e916] [cursor=pointer]: Oct 14 16:20:40.000
                      - cell [ref=e917]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e918] [cursor=pointer]:
                          - generic [ref=e919]: debug
                      - cell [ref=e921]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e922] [cursor=pointer]: media-pipeline
                      - cell [ref=e923]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e924] [cursor=pointer]: Request processed
                      - cell [ref=e925]:
                        - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e926] [cursor=pointer]: req-000008
                - generic [ref=e927]:
                  - generic [ref=e928]: Expand a row for JSON · Click a cell to inspect
                  - generic [ref=e929]: Export covers this loaded selection
              - status [ref=e930]:
                - generic [ref=e931]:
                  - paragraph [ref=e933]: complete · 540 loaded
                  - paragraph [ref=e934]: 540 scanned
                  - paragraph [ref=e935]: 0.0s
          - separator "Resize panes horizontally" [ref=e936]
          - region "Pane 2" [ref=e940]:
            - generic [ref=e941]:
              - generic [ref=e942]:
                - generic [ref=e943]: "2"
                - paragraph [ref=e945]: payments-worker
                - paragraph [ref=e948]: eu-west-1
              - generic [ref=e949]:
                - button "Split pane" [ref=e950] [cursor=pointer]
                - button "Close pane 2" [ref=e954] [cursor=pointer]
            - tabpanel "payments-worker" [ref=e959]:
              - generic [ref=e960]:
                - generic [ref=e961]:
                  - generic [ref=e962]:
                    - radiogroup "Server query type" [ref=e963]:
                      - generic [ref=e965]:
                        - radio "Events" [checked]
                        - generic [ref=e966] [cursor=pointer]: Events
                      - generic [ref=e967]:
                        - radio "Insights"
                        - generic [ref=e968] [cursor=pointer]: Insights
                    - button "1 source" [ref=e969] [cursor=pointer]
                  - generic [ref=e975]:
                    - combobox "Time range" [ref=e982] [cursor=pointer]: Last hour
                    - button "Saved queries and presets" [ref=e983] [cursor=pointer]
                - generic [ref=e987]:
                  - generic [ref=e990]:
                    - generic [ref=e991]: SERVER
                    - textbox "CloudWatch filter pattern" [ref=e994]:
                      - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                  - generic [ref=e995]:
                    - button "Run" [ref=e996] [cursor=pointer]
                    - button "Live" [ref=e1002] [cursor=pointer]
                - generic [ref=e1008]:
                  - paragraph [ref=e1009]: CloudWatch pattern • server-side selection • limited fixture interpreter
                  - paragraph [ref=e1010]: Control+Enter
              - generic [ref=e1012]:
                - generic [ref=e1013]:
                  - textbox "Local filter loaded events" [ref=e1020]:
                    - /placeholder: Search loaded events…
                  - combobox "Local level filter" [ref=e1023] [cursor=pointer]: All levels
                  - button "Local filtering help" [ref=e1024] [cursor=pointer]
                  - radiogroup "Event view mode" [ref=e1028]:
                    - generic [ref=e1030]:
                      - radio "JSON"
                      - generic [ref=e1031] [cursor=pointer]: JSON
                    - generic [ref=e1038]:
                      - radio "Table"
                      - generic [ref=e1039] [cursor=pointer]: Table
                    - generic [ref=e1045]:
                      - radio "Hybrid" [checked]
                      - generic [ref=e1046] [cursor=pointer]: Hybrid
                  - button "Configure columns" [ref=e1052] [cursor=pointer]
                  - button "Toggle line wrap" [ref=e1056] [cursor=pointer]
                  - button "Export loaded filtered events" [ref=e1060] [cursor=pointer]:
                    - generic [ref=e1061]: Export
                - generic [ref=e1067]:
                  - generic [ref=e1068]: LOCAL · 540 / 540 loaded events
                  - generic [ref=e1070]: 511 JSON · Local time
                - region "Log events" [ref=e1071]:
                  - row [ref=e1072]:
                    - columnheader [ref=e1074]:
                      - button "Timestamp" [ref=e1075] [cursor=pointer]
                      - separator "Resize Timestamp" [ref=e1080]
                    - columnheader [ref=e1081]:
                      - button "Level" [ref=e1082] [cursor=pointer]
                      - separator "Resize Level" [ref=e1083]
                    - columnheader [ref=e1084]:
                      - button "/service/name" [ref=e1085] [cursor=pointer]
                      - separator "Resize /service/name" [ref=e1086]
                    - columnheader [ref=e1087]:
                      - button "Message" [ref=e1088] [cursor=pointer]
                      - separator "Resize Message" [ref=e1089]
                    - columnheader [ref=e1090]:
                      - button "/request/id" [ref=e1091] [cursor=pointer]
                      - separator "Resize /request/id" [ref=e1092]
                  - generic [ref=e1093]:
                    - row [ref=e1095]:
                      - button "Expand event details" [ref=e1096] [cursor=pointer]
                      - cell [ref=e1099]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1100] [cursor=pointer]: Oct 14 16:20:00.000
                      - cell [ref=e1101]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1102] [cursor=pointer]:
                          - generic [ref=e1103]: unknown
                      - cell [ref=e1105]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1106] [cursor=pointer]: —
                      - cell [ref=e1107]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1108] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                      - cell [ref=e1109]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1110] [cursor=pointer]: —
                    - row [ref=e1112]:
                      - button "Expand event details" [ref=e1113] [cursor=pointer]
                      - cell [ref=e1116]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1117] [cursor=pointer]: Oct 14 16:20:05.000
                      - cell [ref=e1118]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1119] [cursor=pointer]:
                          - generic [ref=e1120]: info
                      - cell [ref=e1122]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1123] [cursor=pointer]: payments-worker
                      - cell [ref=e1124]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1125] [cursor=pointer]: Request processed
                      - cell [ref=e1126]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1127] [cursor=pointer]: req-000001
                    - row [ref=e1129]:
                      - button "Expand event details" [ref=e1130] [cursor=pointer]
                      - cell [ref=e1133]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1134] [cursor=pointer]: Oct 14 16:20:10.000
                      - cell [ref=e1135]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1136] [cursor=pointer]:
                          - generic [ref=e1137]: debug
                      - cell [ref=e1139]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1140] [cursor=pointer]: payments-worker
                      - cell [ref=e1141]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1142] [cursor=pointer]: Request processed
                      - cell [ref=e1143]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1144] [cursor=pointer]: req-000002
                    - row [ref=e1146]:
                      - button "Expand event details" [ref=e1147] [cursor=pointer]
                      - cell [ref=e1150]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1151] [cursor=pointer]: Oct 14 16:20:15.000
                      - cell [ref=e1152]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1153] [cursor=pointer]:
                          - generic [ref=e1154]: warn
                      - cell [ref=e1156]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1157] [cursor=pointer]: payments-worker
                      - cell [ref=e1158]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1159] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e1160]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1161] [cursor=pointer]: req-000003
                    - row [ref=e1163]:
                      - button "Expand event details" [ref=e1164] [cursor=pointer]
                      - cell [ref=e1167]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1168] [cursor=pointer]: Oct 14 16:20:20.000
                      - cell [ref=e1169]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1170] [cursor=pointer]:
                          - generic [ref=e1171]: info
                      - cell [ref=e1173]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1174] [cursor=pointer]: payments-worker
                      - cell [ref=e1175]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1176] [cursor=pointer]: Request processed
                      - cell [ref=e1177]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1178] [cursor=pointer]: req-000004
                    - row [ref=e1180]:
                      - button "Expand event details" [ref=e1181] [cursor=pointer]
                      - cell [ref=e1184]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1185] [cursor=pointer]: Oct 14 16:20:25.000
                      - cell [ref=e1186]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1187] [cursor=pointer]:
                          - generic [ref=e1188]: error
                      - cell [ref=e1190]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1191] [cursor=pointer]: payments-worker
                      - cell [ref=e1192]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1193] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e1194]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1195] [cursor=pointer]: req-000005
                    - row [ref=e1197]:
                      - button "Expand event details" [ref=e1198] [cursor=pointer]
                      - cell [ref=e1201]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1202] [cursor=pointer]: Oct 14 16:20:30.000
                      - cell [ref=e1203]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1204] [cursor=pointer]:
                          - generic [ref=e1205]: info
                      - cell [ref=e1207]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1208] [cursor=pointer]: payments-worker
                      - cell [ref=e1209]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1210] [cursor=pointer]: Request processed
                      - cell [ref=e1211]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1212] [cursor=pointer]: req-000006
                    - row [ref=e1214]:
                      - button "Expand event details" [ref=e1215] [cursor=pointer]
                      - cell [ref=e1218]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1219] [cursor=pointer]: Oct 14 16:20:35.000
                      - cell [ref=e1220]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1221] [cursor=pointer]:
                          - generic [ref=e1222]: info
                      - cell [ref=e1224]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1225] [cursor=pointer]: payments-worker
                      - cell [ref=e1226]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1227] [cursor=pointer]: Request processed
                      - cell [ref=e1228]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1229] [cursor=pointer]: req-000007
                    - row [ref=e1231]:
                      - button "Expand event details" [ref=e1232] [cursor=pointer]
                      - cell [ref=e1235]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1236] [cursor=pointer]: Oct 14 16:20:40.000
                      - cell [ref=e1237]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1238] [cursor=pointer]:
                          - generic [ref=e1239]: debug
                      - cell [ref=e1241]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1242] [cursor=pointer]: payments-worker
                      - cell [ref=e1243]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1244] [cursor=pointer]: Request processed
                      - cell [ref=e1245]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1246] [cursor=pointer]: req-000008
                - generic [ref=e1247]:
                  - generic [ref=e1248]: Expand a row for JSON · Click a cell to inspect
                  - generic [ref=e1249]: Export covers this loaded selection
              - status [ref=e1250]:
                - generic [ref=e1251]:
                  - paragraph [ref=e1253]: complete · 540 loaded
                  - paragraph [ref=e1254]: 540 scanned
                  - paragraph [ref=e1255]: 0.0s
      - status [ref=e1256]: Draggable item tab:tab-0847fe40-b201-4c51-9a27-45d0f7d2e9d3 was dropped over droppable area pane-panel:pane-3
  - contentinfo [ref=e1257]:
    - generic [ref=e1258]:
      - paragraph [ref=e1260]: Isolated local development
      - paragraph [ref=e1261]: 3 tabs · 3 panes
    - generic [ref=e1262]:
      - paragraph [ref=e1263]: Saved locally
      - paragraph [ref=e1264]: v0.1.1
```

# Test source

```ts
  250 |     await expect(header).toHaveAttribute("aria-sort", "none");
  251 |     await expectIdle(session, "sort-cleared");
  252 | 
  253 |     const search = page.getByLabel("Local filter loaded events");
  254 |     await typeText(search, "Payment");
  255 |     await expect(search).toHaveValue("Payment");
  256 |     await expect(page.locator(".viewer-meta")).not.toContainText("540 / 540");
  257 |     await expect(page.locator(".log-table-row").first()).toContainText(
  258 |       "Payment provider timed out",
  259 |     );
  260 |     await typeText(search, "this-event-does-not-exist-7842");
  261 |     await expect(
  262 |       page.getByText("No loaded events match this filter", { exact: true }),
  263 |     ).toBeVisible();
  264 |     await typeText(search, "");
  265 |     await expect(page.locator(".log-table-row").first()).toBeVisible();
  266 |     await typeText(page.getByLabel("CloudWatch filter pattern"), '"Payment"');
  267 |     await page.getByTestId("run-query").click({ timeout: 3000 });
  268 |     await expect(page.locator(".query-status")).toContainText("complete");
  269 |     await expect(page.locator(".log-table-row").first()).toContainText(
  270 |       "Payment provider timed out",
  271 |     );
  272 |     await closeNaturally();
  273 |     expect(rendererErrors).toEqual([]);
  274 |   } finally {
  275 |     await session.detach().catch(() => {});
  276 |   }
  277 | });
  278 | 
  279 | test("preview tabs replace one slot and become permanent on double click", async () => {
  280 |   const resource = (name: string) => page.getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true }).locator(".resource-label");
  281 |   await resource("payments-worker").click();
  282 |   await expect(page.locator(".workspace-tab")).toHaveCount(2);
  283 |   await expect(page.locator(".workspace-tab.is-preview")).toContainText("payments-worker");
  284 |   await expect(page.getByRole("tab", { name: "payments-worker", exact: true }).locator("span").first()).toHaveCSS("font-style", "italic");
  285 |   await resource("media-pipeline").click();
  286 |   await expect(page.locator(".workspace-tab")).toHaveCount(2);
  287 |   await expect(page.locator(".workspace-tab.is-preview")).toContainText("media-pipeline");
  288 |   await page.getByRole("tab", { name: "media-pipeline", exact: true }).dblclick();
  289 |   await expect(page.locator(".workspace-tab.is-preview")).toHaveCount(0);
  290 |   await resource("payments-worker").dblclick();
  291 |   await expect(page.locator(".workspace-tab")).toHaveCount(3);
  292 |   await expect(page.locator(".workspace-tab.is-preview")).toHaveCount(0);
  293 |   await closeNaturally();
  294 |   const saved = JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"));
  295 |   expect(saved.tabs).toHaveLength(3);
  296 |   expect(saved.tabs.every((tab: { preview?: boolean }) => !tab.preview)).toBe(true);
  297 |   expect(rendererErrors).toEqual([]);
  298 | });
  299 | 
  300 | test("whole tabs reorder near the strip and create highlighted nested splits away from it", async () => {
  301 |   test.setTimeout(150000);
  302 |   for (const name of ["payments-worker", "media-pipeline"]) {
  303 |     await page.getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true }).locator(".resource-label").dblclick();
  304 |   }
  305 |   await expect(page.locator(".workspace-tab")).toHaveCount(3);
  306 |   await expect(page.locator(".tab-grip,.tab-menu-button")).toHaveCount(0);
  307 |   const tab = page.getByRole("tab", { name: "orders-api", exact: true });
  308 |   let start = (await tab.boundingBox())!;
  309 |   const lastTab = (await page.getByRole("tab", { name: "media-pipeline", exact: true }).boundingBox())!;
  310 |   await page.mouse.move(start.x + 30, start.y + start.height / 2);
  311 |   await page.mouse.down();
  312 |   await page.mouse.move(lastTab.x + lastTab.width / 2, start.y + start.height / 2, { steps: 5 });
  313 |   await expect(page.locator(".workspace-tab.is-dragging")).toHaveCount(1);
  314 |   await expect(page.locator(".workspace-drag-preview")).toHaveCount(0);
  315 |   expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  316 |   await page.mouse.up();
  317 |   await expect(page.locator(".workspace-tab-label").last()).toContainText("orders-api");
  318 | 
  319 |   const splitByDrag = async (sourceName: string, paneIndex: number, edge: "left" | "right" | "top" | "bottom") => {
  320 |     const source = page.getByRole("tab", { name: sourceName, exact: true });
  321 |     const from = (await source.boundingBox())!;
  322 |     const panel = page.locator("[data-pane-drop-target]").nth(paneIndex);
  323 |     const to = (await panel.boundingBox())!;
  324 |     const x = edge === "left" ? to.x + 20 : edge === "right" ? to.x + to.width - 20 : to.x + to.width / 2;
  325 |     const y = edge === "top" ? to.y + 45 : edge === "bottom" ? to.y + to.height - 25 : to.y + to.height / 2;
  326 |     await page.mouse.move(from.x + 30, from.y + from.height / 2);
  327 |     await page.mouse.down();
  328 |     await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 3 });
  329 |     await page.mouse.move(x, y, { steps: 5 });
  330 |     await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  331 |     const preview = page.locator(`[data-split-preview="${edge}"]`);
  332 |     await expect(preview).toBeVisible();
  333 |     const shown = (await preview.boundingBox())!;
  334 |     if (edge === "left" || edge === "right") expect(shown.width).toBeCloseTo(to.width / 2, 0);
  335 |     else expect(shown.height).toBeCloseTo(to.height / 2, 0);
  336 |     await page.mouse.up();
  337 |     await expect(page.locator(".workspace-drag-preview,.pane-drop-overlay")).toHaveCount(0);
  338 |   };
  339 |   await expect(page.getByLabel("Add split pane", { exact: true })).toHaveAttribute("data-split-axis", "horizontal");
  340 |   await splitByDrag("orders-api", 0, "right");
  341 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  342 |   await expect(page.getByLabel("Add split pane", { exact: true })).toHaveAttribute("data-split-axis", "vertical");
  343 |   await splitByDrag("payments-worker", 1, "bottom");
  344 |   await expect(page.locator(".workspace-pane")).toHaveCount(3);
  345 |   const three = await paneRectangles();
  346 |   expect(three[0].x).toBeLessThan(three[1].x);
  347 |   expect(three[1].y).toBeLessThan(three[2].y);
  348 |   expect(Math.abs(three[0].height - three[1].height - three[2].height - 6)).toBeLessThan(3);
  349 |   await splitByDrag("media-pipeline", 2, "left");
> 350 |   await expect(page.locator(".workspace-pane")).toHaveCount(4);
      |                                                 ^ Error: expect(locator).toHaveCount(expected) failed
  351 |   await expect(page.getByLabel("Add split pane", { exact: true })).toBeDisabled();
  352 |   const four = await paneRectangles();
  353 |   expect(four.every((rect) => rect.width > 100 && rect.height > 100)).toBe(true);
  354 |   expect(four[2].x).toBeLessThan(four[3].x);
  355 |   expect(Math.abs(four[2].y - four[3].y)).toBeLessThan(2);
  356 |   const horizontal = page.getByRole("separator", { name: "Resize panes horizontally", exact: true }).first();
  357 |   await horizontal.click({ position: { x: 3, y: 20 } });
  358 |   await page.keyboard.press("ArrowRight");
  359 |   await expect(horizontal).toHaveAttribute("aria-valuenow", "52");
  360 |   expect(rendererErrors).toEqual([]);
  361 |   await closeNaturally();
  362 |   const saved = JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"));
  363 |   expect(saved.panes).toHaveLength(4);
  364 |   expect(saved.layout.second.second.axis).toBe("horizontal");
  365 | });
  366 | 
  367 | test("right clicking a selection shows those tabs in split mode", async () => {
  368 |   for (const name of ["payments-worker", "media-pipeline"]) {
  369 |     await page.getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true }).locator(".resource-label").dblclick();
  370 |   }
  371 |   await page.getByRole("tab", { name: "orders-api", exact: true }).click({ modifiers: ["Control"] });
  372 |   await page.getByRole("tab", { name: "payments-worker", exact: true }).click({ modifiers: ["Control"] });
  373 |   await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(2);
  374 |   await page.getByRole("tab", { name: "orders-api", exact: true }).click({ button: "right" });
  375 |   await page.getByRole("menuitem", { name: "Show in split mode", exact: true }).click();
  376 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  377 |   await expect(page.locator(".workspace-pane").nth(0).locator(".pane-heading")).toContainText("orders-api");
  378 |   await expect(page.locator(".workspace-pane").nth(1).locator(".pane-heading")).toContainText("payments-worker");
  379 |   await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(0);
  380 |   expect(rendererErrors).toEqual([]);
  381 |   await closeNaturally();
  382 | });
  383 | 
  384 | test("trusted settings edits and final workspace changes survive a natural restart", async () => {
  385 |   await page.getByLabel("Add split pane", { exact: true }).click();
  386 |   const divider = page.getByRole("separator", {
  387 |     name: "Resize panes horizontally",
  388 |   });
  389 |   const grid = await page.locator(".pane-layout-root").boundingBox();
  390 |   const handle = await divider.boundingBox();
  391 |   expect(grid).not.toBeNull();
  392 |   expect(handle).not.toBeNull();
  393 |   await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 20);
  394 |   await page.mouse.down();
  395 |   await page.mouse.move(grid!.x + grid!.width * 0.6, grid!.y + 20, {
  396 |     steps: 8,
  397 |   });
  398 |   await page.mouse.up();
  399 |   await expect(
  400 |     page.getByRole("separator", { name: "Resize panes horizontally" }),
  401 |   ).toHaveAttribute("aria-valuenow", "60");
  402 |   await page
  403 |     .getByRole("button", { name: "Workspace settings", exact: true })
  404 |     .click();
  405 |   await page
  406 |     .getByRole("tab", { name: "Preferences", exact: true })
  407 |     .click({ timeout: 10000 });
  408 |   await typeText(page.getByLabel("Log font size", { exact: true }), "14");
  409 |   await expect(page.getByLabel("Log font size", { exact: true })).toHaveValue(
  410 |     "14",
  411 |   );
  412 |   await page.keyboard.press("Enter");
  413 |   const maxEvents = page.getByLabel("Maximum events per view", { exact: true });
  414 |   const loadedBeforeLimitEdit =
  415 |     (await page.locator(".viewer-meta").textContent()) ?? "";
  416 |   await typeText(maxEvents, "25000");
  417 |   await expect(maxEvents).toHaveValue("25000");
  418 |   await page.keyboard.press("Tab");
  419 |   await expect(page.locator(".viewer-meta")).toHaveText(loadedBeforeLimitEdit);
  420 |   const refresh = page.getByLabel("Automatic refresh (seconds)", {
  421 |     exact: true,
  422 |   });
  423 |   await typeText(refresh, "120");
  424 |   await expect(refresh).toHaveValue("120");
  425 |   await typeText(refresh, "0");
  426 |   await expect(refresh).toHaveValue("0");
  427 |   await page
  428 |     .getByRole("combobox", { name: "Timestamp display", exact: true })
  429 |     .click();
  430 |   await page.getByRole("option", { name: "UTC", exact: true }).click();
  431 |   await page.getByRole("combobox", { name: "Density", exact: true }).click();
  432 |   await page.getByRole("option", { name: "comfortable", exact: true }).click();
  433 |   await page.getByRole("tab", { name: "Workspace", exact: true }).click();
  434 |   await typeText(page.getByLabel("Workspace name"), "Trusted input restored");
  435 |   // The final edit closes before the save debounce is allowed to elapse.
  436 |   await closeNaturally();
  437 |   const saved = JSON.parse(
  438 |     await readFile(join(directory, "workspace.json"), "utf8"),
  439 |   );
  440 |   expect(saved.name).toBe("Trusted input restored");
  441 |   expect(saved.preferences).toMatchObject({
  442 |     fontSize: 14,
  443 |     maxEvents: 25000,
  444 |     refreshSeconds: 0,
  445 |     timezone: "utc",
  446 |     density: "comfortable",
  447 |   });
  448 |   expect(saved.layout.axis).toBe("horizontal");
  449 |   expect(saved.layout.ratio).toBeCloseTo(0.6, 1);
  450 |   expect(saved.panes).toHaveLength(2);
```