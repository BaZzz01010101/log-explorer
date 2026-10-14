# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deep-interactions.spec.ts >> whole tabs reorder near the strip and create highlighted nested splits away from it
- Location: tests\desktop\deep-interactions.spec.ts:300:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: mouse.move: Target page, context or browser has been closed
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
          - tab "orders-api" [ref=e186] [cursor=pointer]
          - button "Close orders-api" [ref=e191] [cursor=pointer]
          - tab "payments-worker" [selected] [ref=e195] [cursor=pointer]
          - button "Close payments-worker" [ref=e200] [cursor=pointer]
          - tab "media-pipeline" [active] [ref=e204] [cursor=pointer]
          - button "Close media-pipeline" [ref=e209] [cursor=pointer]
        - generic [ref=e213]:
          - button "New log view" [ref=e214] [cursor=pointer]
          - button "Add split pane" [ref=e217] [cursor=pointer]
          - button "Workspace tab menu" [ref=e221] [cursor=pointer]
      - generic "Split panes" [ref=e226]:
        - generic [ref=e227]: PANES
        - generic [ref=e228]:
          - button "Reorder pane 1" [ref=e229]
          - button "1 media-pipeline" [ref=e237] [cursor=pointer]:
            - generic [ref=e238]: "1"
            - generic [ref=e239]: media-pipeline
          - button "Close pane 1" [ref=e240] [cursor=pointer]
        - generic [ref=e244]:
          - button "Reorder pane 2" [ref=e245]
          - button "2 orders-api" [ref=e253] [cursor=pointer]:
            - generic [ref=e254]: "2"
            - generic [ref=e255]: orders-api
          - button "Close pane 2" [ref=e256] [cursor=pointer]
        - generic [ref=e260]:
          - button "Reorder pane 3" [ref=e261]
          - button "3 payments-worker" [pressed] [ref=e269] [cursor=pointer]:
            - generic [ref=e270]: "3"
            - generic [ref=e271]: payments-worker
          - button "Close pane 3" [ref=e272] [cursor=pointer]
      - generic [ref=e277]:
        - region "Pane 1" [ref=e281]:
          - generic [ref=e282]:
            - generic [ref=e283]:
              - generic [ref=e284]: "1"
              - paragraph [ref=e286]: media-pipeline
              - paragraph [ref=e289]: eu-west-1
            - generic [ref=e290]:
              - button "Split pane" [ref=e291] [cursor=pointer]
              - button "Close pane 1" [ref=e295] [cursor=pointer]
          - tabpanel "media-pipeline" [ref=e300]:
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
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e441] [cursor=pointer]: Oct 14 16:18:00.000
                    - cell [ref=e442]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e443] [cursor=pointer]:
                        - generic [ref=e444]: unknown
                    - cell [ref=e446]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e447] [cursor=pointer]: —
                    - cell [ref=e448]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e449] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                    - cell [ref=e450]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:0" [ref=e451] [cursor=pointer]: —
                  - row [ref=e453]:
                    - button "Expand event details" [ref=e454] [cursor=pointer]
                    - cell [ref=e457]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e458] [cursor=pointer]: Oct 14 16:18:05.000
                    - cell [ref=e459]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e460] [cursor=pointer]:
                        - generic [ref=e461]: info
                    - cell [ref=e463]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e464] [cursor=pointer]: media-pipeline
                    - cell [ref=e465]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e466] [cursor=pointer]: Request processed
                    - cell [ref=e467]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:1" [ref=e468] [cursor=pointer]: req-000001
                  - row [ref=e470]:
                    - button "Expand event details" [ref=e471] [cursor=pointer]
                    - cell [ref=e474]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e475] [cursor=pointer]: Oct 14 16:18:10.000
                    - cell [ref=e476]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e477] [cursor=pointer]:
                        - generic [ref=e478]: debug
                    - cell [ref=e480]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e481] [cursor=pointer]: media-pipeline
                    - cell [ref=e482]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e483] [cursor=pointer]: Request processed
                    - cell [ref=e484]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:2" [ref=e485] [cursor=pointer]: req-000002
                  - row [ref=e487]:
                    - button "Expand event details" [ref=e488] [cursor=pointer]
                    - cell [ref=e491]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e492] [cursor=pointer]: Oct 14 16:18:15.000
                    - cell [ref=e493]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e494] [cursor=pointer]:
                        - generic [ref=e495]: warn
                    - cell [ref=e497]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e498] [cursor=pointer]: media-pipeline
                    - cell [ref=e499]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e500] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e501]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:3" [ref=e502] [cursor=pointer]: req-000003
                  - row [ref=e504]:
                    - button "Expand event details" [ref=e505] [cursor=pointer]
                    - cell [ref=e508]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e509] [cursor=pointer]: Oct 14 16:18:20.000
                    - cell [ref=e510]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e511] [cursor=pointer]:
                        - generic [ref=e512]: info
                    - cell [ref=e514]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e515] [cursor=pointer]: media-pipeline
                    - cell [ref=e516]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e517] [cursor=pointer]: Request processed
                    - cell [ref=e518]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:4" [ref=e519] [cursor=pointer]: req-000004
                  - row [ref=e521]:
                    - button "Expand event details" [ref=e522] [cursor=pointer]
                    - cell [ref=e525]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e526] [cursor=pointer]: Oct 14 16:18:25.000
                    - cell [ref=e527]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e528] [cursor=pointer]:
                        - generic [ref=e529]: error
                    - cell [ref=e531]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e532] [cursor=pointer]: media-pipeline
                    - cell [ref=e533]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e534] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e535]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:5" [ref=e536] [cursor=pointer]: req-000005
                  - row [ref=e538]:
                    - button "Expand event details" [ref=e539] [cursor=pointer]
                    - cell [ref=e542]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e543] [cursor=pointer]: Oct 14 16:18:30.000
                    - cell [ref=e544]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e545] [cursor=pointer]:
                        - generic [ref=e546]: info
                    - cell [ref=e548]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e549] [cursor=pointer]: media-pipeline
                    - cell [ref=e550]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e551] [cursor=pointer]: Request processed
                    - cell [ref=e552]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:6" [ref=e553] [cursor=pointer]: req-000006
                  - row [ref=e555]:
                    - button "Expand event details" [ref=e556] [cursor=pointer]
                    - cell [ref=e559]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e560] [cursor=pointer]: Oct 14 16:18:35.000
                    - cell [ref=e561]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e562] [cursor=pointer]:
                        - generic [ref=e563]: info
                    - cell [ref=e565]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e566] [cursor=pointer]: media-pipeline
                    - cell [ref=e567]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e568] [cursor=pointer]: Request processed
                    - cell [ref=e569]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:7" [ref=e570] [cursor=pointer]: req-000007
                  - row [ref=e572]:
                    - button "Expand event details" [ref=e573] [cursor=pointer]
                    - cell [ref=e576]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e577] [cursor=pointer]: Oct 14 16:18:40.000
                    - cell [ref=e578]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e579] [cursor=pointer]:
                        - generic [ref=e580]: debug
                    - cell [ref=e582]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e583] [cursor=pointer]: media-pipeline
                    - cell [ref=e584]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e585] [cursor=pointer]: Request processed
                    - cell [ref=e586]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:8" [ref=e587] [cursor=pointer]: req-000008
                  - row [ref=e589]:
                    - button "Expand event details" [ref=e590] [cursor=pointer]
                    - cell [ref=e593]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:9" [ref=e594] [cursor=pointer]: Oct 14 16:18:45.000
                    - cell [ref=e595]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:9" [ref=e596] [cursor=pointer]:
                        - generic [ref=e597]: warn
                    - cell [ref=e599]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:9" [ref=e600] [cursor=pointer]: media-pipeline
                    - cell [ref=e601]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:9" [ref=e602] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e603]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:9" [ref=e604] [cursor=pointer]: req-000009
                  - row [ref=e606]:
                    - button "Expand event details" [ref=e607] [cursor=pointer]
                    - cell [ref=e610]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:10" [ref=e611] [cursor=pointer]: Oct 14 16:18:50.000
                    - cell [ref=e612]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:10" [ref=e613] [cursor=pointer]:
                        - generic [ref=e614]: info
                    - cell [ref=e616]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:10" [ref=e617] [cursor=pointer]: media-pipeline
                    - cell [ref=e618]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:10" [ref=e619] [cursor=pointer]: Request processed
                    - cell [ref=e620]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:10" [ref=e621] [cursor=pointer]: req-00000a
                  - row [ref=e623]:
                    - button "Expand event details" [ref=e624] [cursor=pointer]
                    - cell [ref=e627]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:11" [ref=e628] [cursor=pointer]: Oct 14 16:18:55.000
                    - cell [ref=e629]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:11" [ref=e630] [cursor=pointer]:
                        - generic [ref=e631]: error
                    - cell [ref=e633]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:11" [ref=e634] [cursor=pointer]: media-pipeline
                    - cell [ref=e635]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:11" [ref=e636] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e637]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:11" [ref=e638] [cursor=pointer]: req-00000b
                  - row [ref=e640]:
                    - button "Expand event details" [ref=e641] [cursor=pointer]
                    - cell [ref=e644]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:12" [ref=e645] [cursor=pointer]: Oct 14 16:19:00.000
                    - cell [ref=e646]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:12" [ref=e647] [cursor=pointer]:
                        - generic [ref=e648]: info
                    - cell [ref=e650]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:12" [ref=e651] [cursor=pointer]: media-pipeline
                    - cell [ref=e652]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:12" [ref=e653] [cursor=pointer]: Request processed
                    - cell [ref=e654]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:12" [ref=e655] [cursor=pointer]: req-00000c
                  - row [ref=e657]:
                    - button "Expand event details" [ref=e658] [cursor=pointer]
                    - cell [ref=e661]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:13" [ref=e662] [cursor=pointer]: Oct 14 16:19:05.000
                    - cell [ref=e663]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:13" [ref=e664] [cursor=pointer]:
                        - generic [ref=e665]: info
                    - cell [ref=e667]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:13" [ref=e668] [cursor=pointer]: media-pipeline
                    - cell [ref=e669]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:13" [ref=e670] [cursor=pointer]: Request processed
                    - cell [ref=e671]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:13" [ref=e672] [cursor=pointer]: req-00000d
                  - row [ref=e674]:
                    - button "Expand event details" [ref=e675] [cursor=pointer]
                    - cell [ref=e678]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:14" [ref=e679] [cursor=pointer]: Oct 14 16:19:10.000
                    - cell [ref=e680]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:14" [ref=e681] [cursor=pointer]:
                        - generic [ref=e682]: debug
                    - cell [ref=e684]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:14" [ref=e685] [cursor=pointer]: media-pipeline
                    - cell [ref=e686]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:14" [ref=e687] [cursor=pointer]: Request processed
                    - cell [ref=e688]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:14" [ref=e689] [cursor=pointer]: req-00000e
                  - row [ref=e691]:
                    - button "Expand event details" [ref=e692] [cursor=pointer]
                    - cell [ref=e695]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:15" [ref=e696] [cursor=pointer]: Oct 14 16:19:15.000
                    - cell [ref=e697]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:15" [ref=e698] [cursor=pointer]:
                        - generic [ref=e699]: warn
                    - cell [ref=e701]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:15" [ref=e702] [cursor=pointer]: media-pipeline
                    - cell [ref=e703]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:15" [ref=e704] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e705]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:15" [ref=e706] [cursor=pointer]: req-00000f
                  - row [ref=e708]:
                    - button "Expand event details" [ref=e709] [cursor=pointer]
                    - cell [ref=e712]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:16" [ref=e713] [cursor=pointer]: Oct 14 16:19:20.000
                    - cell [ref=e714]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:16" [ref=e715] [cursor=pointer]:
                        - generic [ref=e716]: info
                    - cell [ref=e718]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:16" [ref=e719] [cursor=pointer]: media-pipeline
                    - cell [ref=e720]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:16" [ref=e721] [cursor=pointer]: Request processed
                    - cell [ref=e722]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:16" [ref=e723] [cursor=pointer]: req-000010
                  - row [ref=e725]:
                    - button "Expand event details" [ref=e726] [cursor=pointer]
                    - cell [ref=e729]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:17" [ref=e730] [cursor=pointer]: Oct 14 16:19:25.000
                    - cell [ref=e731]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:17" [ref=e732] [cursor=pointer]:
                        - generic [ref=e733]: error
                    - cell [ref=e735]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:17" [ref=e736] [cursor=pointer]: media-pipeline
                    - cell [ref=e737]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:17" [ref=e738] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e739]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:17" [ref=e740] [cursor=pointer]: req-000011
                  - row [ref=e742]:
                    - button "Expand event details" [ref=e743] [cursor=pointer]
                    - cell [ref=e746]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:18" [ref=e747] [cursor=pointer]: Oct 14 16:19:30.000
                    - cell [ref=e748]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:18" [ref=e749] [cursor=pointer]:
                        - generic [ref=e750]: info
                    - cell [ref=e752]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:18" [ref=e753] [cursor=pointer]: media-pipeline
                    - cell [ref=e754]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:18" [ref=e755] [cursor=pointer]: Request processed
                    - cell [ref=e756]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:18" [ref=e757] [cursor=pointer]: req-000012
                  - row [ref=e759]:
                    - button "Expand event details" [ref=e760] [cursor=pointer]
                    - cell [ref=e763]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:19" [ref=e764] [cursor=pointer]: Oct 14 16:19:35.000
                    - cell [ref=e765]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:19" [ref=e766] [cursor=pointer]:
                        - generic [ref=e767]: info
                    - cell [ref=e769]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:19" [ref=e770] [cursor=pointer]: media-pipeline
                    - cell [ref=e771]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:19" [ref=e772] [cursor=pointer]: Request processed
                    - cell [ref=e773]:
                      - button "Inspect event fixture:/aws/lambda/media-pipeline:19" [ref=e774] [cursor=pointer]: req-000013
              - generic [ref=e775]:
                - generic [ref=e776]: Expand a row for JSON · Click a cell to inspect
                - generic [ref=e777]: Export covers this loaded selection
            - status [ref=e778]:
              - generic [ref=e779]:
                - paragraph [ref=e781]: complete · 540 loaded
                - paragraph [ref=e782]: 540 scanned
                - paragraph [ref=e783]: 0.0s
        - separator "Resize panes horizontally" [ref=e784]
        - generic [ref=e786]:
          - region "Pane 2" [ref=e790]:
            - generic [ref=e791]:
              - generic [ref=e792]:
                - generic [ref=e793]: "2"
                - paragraph [ref=e795]: orders-api
                - paragraph [ref=e798]: eu-west-1
              - generic [ref=e799]:
                - button "Split pane" [ref=e800] [cursor=pointer]
                - button "Close pane 2" [ref=e804] [cursor=pointer]
            - tabpanel "orders-api" [ref=e809]:
              - generic [ref=e810]:
                - generic [ref=e811]:
                  - generic [ref=e812]:
                    - radiogroup "Server query type" [ref=e813]:
                      - generic [ref=e815]:
                        - radio "Events" [checked]
                        - generic [ref=e816] [cursor=pointer]: Events
                      - generic [ref=e817]:
                        - radio "Insights"
                        - generic [ref=e818] [cursor=pointer]: Insights
                    - button "1 source" [ref=e819] [cursor=pointer]
                  - generic [ref=e825]:
                    - combobox "Time range" [ref=e832] [cursor=pointer]: Last hour
                    - button "Saved queries and presets" [ref=e833] [cursor=pointer]
                - generic [ref=e837]:
                  - generic [ref=e840]:
                    - generic [ref=e841]: SERVER
                    - textbox "CloudWatch filter pattern" [ref=e844]:
                      - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                  - generic [ref=e845]:
                    - button "Run" [ref=e846] [cursor=pointer]
                    - button "Live" [ref=e852] [cursor=pointer]
                - generic [ref=e858]:
                  - paragraph [ref=e859]: CloudWatch pattern • server-side selection • limited fixture interpreter
                  - paragraph [ref=e860]: Control+Enter
              - generic [ref=e862]:
                - generic [ref=e863]:
                  - textbox "Local filter loaded events" [ref=e870]:
                    - /placeholder: Search loaded events…
                  - combobox "Local level filter" [ref=e873] [cursor=pointer]: All levels
                  - button "Local filtering help" [ref=e874] [cursor=pointer]
                  - radiogroup "Event view mode" [ref=e878]:
                    - generic [ref=e880]:
                      - radio "JSON"
                      - generic [ref=e881] [cursor=pointer]: JSON
                    - generic [ref=e888]:
                      - radio "Table"
                      - generic [ref=e889] [cursor=pointer]: Table
                    - generic [ref=e895]:
                      - radio "Hybrid" [checked]
                      - generic [ref=e896] [cursor=pointer]: Hybrid
                  - button "Configure columns" [ref=e902] [cursor=pointer]
                  - button "Toggle line wrap" [ref=e906] [cursor=pointer]
                  - button "Export loaded filtered events" [ref=e910] [cursor=pointer]:
                    - generic [ref=e911]: Export
                - generic [ref=e917]:
                  - generic [ref=e918]: LOCAL · 540 / 540 loaded events
                  - generic [ref=e920]: 511 JSON · Local time
                - region "Log events" [ref=e921]:
                  - row [ref=e922]:
                    - columnheader [ref=e924]:
                      - button "Timestamp" [ref=e925] [cursor=pointer]
                      - separator "Resize Timestamp" [ref=e930]
                    - columnheader [ref=e931]:
                      - button "Level" [ref=e932] [cursor=pointer]
                      - separator "Resize Level" [ref=e933]
                    - columnheader [ref=e934]:
                      - button "/service/name" [ref=e935] [cursor=pointer]
                      - separator "Resize /service/name" [ref=e936]
                    - columnheader [ref=e937]:
                      - button "Message" [ref=e938] [cursor=pointer]
                      - separator "Resize Message" [ref=e939]
                    - columnheader [ref=e940]:
                      - button "/request/id" [ref=e941] [cursor=pointer]
                      - separator "Resize /request/id" [ref=e942]
                  - generic [ref=e943]:
                    - row [ref=e945]:
                      - button "Expand event details" [ref=e946] [cursor=pointer]
                      - cell [ref=e949]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e950] [cursor=pointer]: Oct 14 16:18:00.000
                      - cell [ref=e951]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e952] [cursor=pointer]:
                          - generic [ref=e953]: unknown
                      - cell [ref=e955]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e956] [cursor=pointer]: —
                      - cell [ref=e957]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e958] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                      - cell [ref=e959]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e960] [cursor=pointer]: —
                    - row [ref=e962]:
                      - button "Expand event details" [ref=e963] [cursor=pointer]
                      - cell [ref=e966]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e967] [cursor=pointer]: Oct 14 16:18:05.000
                      - cell [ref=e968]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e969] [cursor=pointer]:
                          - generic [ref=e970]: info
                      - cell [ref=e972]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e973] [cursor=pointer]: orders-api
                      - cell [ref=e974]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e975] [cursor=pointer]: Request processed
                      - cell [ref=e976]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e977] [cursor=pointer]: req-000001
                    - row [ref=e979]:
                      - button "Expand event details" [ref=e980] [cursor=pointer]
                      - cell [ref=e983]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e984] [cursor=pointer]: Oct 14 16:18:10.000
                      - cell [ref=e985]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e986] [cursor=pointer]:
                          - generic [ref=e987]: debug
                      - cell [ref=e989]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e990] [cursor=pointer]: orders-api
                      - cell [ref=e991]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e992] [cursor=pointer]: Request processed
                      - cell [ref=e993]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e994] [cursor=pointer]: req-000002
                    - row [ref=e996]:
                      - button "Expand event details" [ref=e997] [cursor=pointer]
                      - cell [ref=e1000]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e1001] [cursor=pointer]: Oct 14 16:18:15.000
                      - cell [ref=e1002]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e1003] [cursor=pointer]:
                          - generic [ref=e1004]: warn
                      - cell [ref=e1006]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e1007] [cursor=pointer]: orders-api
                      - cell [ref=e1008]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e1009] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e1010]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e1011] [cursor=pointer]: req-000003
                    - row [ref=e1013]:
                      - button "Expand event details" [ref=e1014] [cursor=pointer]
                      - cell [ref=e1017]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e1018] [cursor=pointer]: Oct 14 16:18:20.000
                      - cell [ref=e1019]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e1020] [cursor=pointer]:
                          - generic [ref=e1021]: info
                      - cell [ref=e1023]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e1024] [cursor=pointer]: orders-api
                      - cell [ref=e1025]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e1026] [cursor=pointer]: Request processed
                      - cell [ref=e1027]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e1028] [cursor=pointer]: req-000004
                    - row [ref=e1030]:
                      - button "Expand event details" [ref=e1031] [cursor=pointer]
                      - cell [ref=e1034]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1035] [cursor=pointer]: Oct 14 16:18:25.000
                      - cell [ref=e1036]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1037] [cursor=pointer]:
                          - generic [ref=e1038]: error
                      - cell [ref=e1040]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1041] [cursor=pointer]: orders-api
                      - cell [ref=e1042]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1043] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e1044]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1045] [cursor=pointer]: req-000005
                    - row [ref=e1047]:
                      - button "Expand event details" [ref=e1048] [cursor=pointer]
                      - cell [ref=e1051]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1052] [cursor=pointer]: Oct 14 16:18:30.000
                      - cell [ref=e1053]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1054] [cursor=pointer]:
                          - generic [ref=e1055]: info
                      - cell [ref=e1057]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1058] [cursor=pointer]: orders-api
                      - cell [ref=e1059]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1060] [cursor=pointer]: Request processed
                      - cell [ref=e1061]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1062] [cursor=pointer]: req-000006
                    - row [ref=e1064]:
                      - button "Expand event details" [ref=e1065] [cursor=pointer]
                      - cell [ref=e1068]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1069] [cursor=pointer]: Oct 14 16:18:35.000
                      - cell [ref=e1070]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1071] [cursor=pointer]:
                          - generic [ref=e1072]: info
                      - cell [ref=e1074]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1075] [cursor=pointer]: orders-api
                      - cell [ref=e1076]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1077] [cursor=pointer]: Request processed
                      - cell [ref=e1078]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1079] [cursor=pointer]: req-000007
                    - row [ref=e1081]:
                      - button "Expand event details" [ref=e1082] [cursor=pointer]
                      - cell [ref=e1085]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1086] [cursor=pointer]: Oct 14 16:18:40.000
                      - cell [ref=e1087]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1088] [cursor=pointer]:
                          - generic [ref=e1089]: debug
                      - cell [ref=e1091]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1092] [cursor=pointer]: orders-api
                      - cell [ref=e1093]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1094] [cursor=pointer]: Request processed
                      - cell [ref=e1095]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1096] [cursor=pointer]: req-000008
                - generic [ref=e1097]:
                  - generic [ref=e1098]: Expand a row for JSON · Click a cell to inspect
                  - generic [ref=e1099]: Export covers this loaded selection
              - status [ref=e1100]:
                - generic [ref=e1101]:
                  - paragraph [ref=e1103]: complete · 540 loaded
                  - paragraph [ref=e1104]: 540 scanned
                  - paragraph [ref=e1105]: 0.0s
          - separator "Resize panes vertically" [ref=e1106]
          - region "Pane 3" [ref=e1110]:
            - generic [ref=e1111]:
              - generic [ref=e1112]:
                - generic [ref=e1113]: "3"
                - paragraph [ref=e1115]: payments-worker
                - paragraph [ref=e1118]: eu-west-1
              - generic [ref=e1119]:
                - button "Split pane" [ref=e1120] [cursor=pointer]
                - button "Close pane 3" [ref=e1124] [cursor=pointer]
            - tabpanel "payments-worker" [ref=e1129]:
              - generic [ref=e1130]:
                - generic [ref=e1131]:
                  - generic [ref=e1132]:
                    - radiogroup "Server query type" [ref=e1133]:
                      - generic [ref=e1135]:
                        - radio "Events" [checked]
                        - generic [ref=e1136] [cursor=pointer]: Events
                      - generic [ref=e1137]:
                        - radio "Insights"
                        - generic [ref=e1138] [cursor=pointer]: Insights
                    - button "1 source" [ref=e1139] [cursor=pointer]
                  - generic [ref=e1145]:
                    - combobox "Time range" [ref=e1152] [cursor=pointer]: Last hour
                    - button "Saved queries and presets" [ref=e1153] [cursor=pointer]
                - generic [ref=e1157]:
                  - generic [ref=e1160]:
                    - generic [ref=e1161]: SERVER
                    - textbox "CloudWatch filter pattern" [ref=e1164]:
                      - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                  - generic [ref=e1165]:
                    - button "Run" [ref=e1166] [cursor=pointer]
                    - button "Live" [ref=e1172] [cursor=pointer]
                - generic [ref=e1178]:
                  - paragraph [ref=e1179]: CloudWatch pattern • server-side selection • limited fixture interpreter
                  - paragraph [ref=e1180]: Control+Enter
              - generic [ref=e1182]:
                - generic [ref=e1183]:
                  - textbox "Local filter loaded events" [ref=e1190]:
                    - /placeholder: Search loaded events…
                  - combobox "Local level filter" [ref=e1193] [cursor=pointer]: All levels
                  - button "Local filtering help" [ref=e1194] [cursor=pointer]
                  - radiogroup "Event view mode" [ref=e1198]:
                    - generic [ref=e1200]:
                      - radio "JSON"
                      - generic [ref=e1201] [cursor=pointer]: JSON
                    - generic [ref=e1208]:
                      - radio "Table"
                      - generic [ref=e1209] [cursor=pointer]: Table
                    - generic [ref=e1215]:
                      - radio "Hybrid" [checked]
                      - generic [ref=e1216] [cursor=pointer]: Hybrid
                  - button "Configure columns" [ref=e1222] [cursor=pointer]
                  - button "Toggle line wrap" [ref=e1226] [cursor=pointer]
                  - button "Export loaded filtered events" [ref=e1230] [cursor=pointer]:
                    - generic [ref=e1231]: Export
                - generic [ref=e1237]:
                  - generic [ref=e1238]: LOCAL · 540 / 540 loaded events
                  - generic [ref=e1240]: 511 JSON · Local time
                - region "Log events" [ref=e1241]:
                  - row [ref=e1242]:
                    - columnheader [ref=e1244]:
                      - button "Timestamp" [ref=e1245] [cursor=pointer]
                      - separator "Resize Timestamp" [ref=e1250]
                    - columnheader [ref=e1251]:
                      - button "Level" [ref=e1252] [cursor=pointer]
                      - separator "Resize Level" [ref=e1253]
                    - columnheader [ref=e1254]:
                      - button "/service/name" [ref=e1255] [cursor=pointer]
                      - separator "Resize /service/name" [ref=e1256]
                    - columnheader [ref=e1257]:
                      - button "Message" [ref=e1258] [cursor=pointer]
                      - separator "Resize Message" [ref=e1259]
                    - columnheader [ref=e1260]:
                      - button "/request/id" [ref=e1261] [cursor=pointer]
                      - separator "Resize /request/id" [ref=e1262]
                  - generic [ref=e1263]:
                    - row [ref=e1265]:
                      - button "Expand event details" [ref=e1266] [cursor=pointer]
                      - cell [ref=e1269]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1270] [cursor=pointer]: Oct 14 16:18:00.000
                      - cell [ref=e1271]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1272] [cursor=pointer]:
                          - generic [ref=e1273]: unknown
                      - cell [ref=e1275]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1276] [cursor=pointer]: —
                      - cell [ref=e1277]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1278] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                      - cell [ref=e1279]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e1280] [cursor=pointer]: —
                    - row [ref=e1282]:
                      - button "Expand event details" [ref=e1283] [cursor=pointer]
                      - cell [ref=e1286]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1287] [cursor=pointer]: Oct 14 16:18:05.000
                      - cell [ref=e1288]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1289] [cursor=pointer]:
                          - generic [ref=e1290]: info
                      - cell [ref=e1292]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1293] [cursor=pointer]: payments-worker
                      - cell [ref=e1294]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1295] [cursor=pointer]: Request processed
                      - cell [ref=e1296]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e1297] [cursor=pointer]: req-000001
                    - row [ref=e1299]:
                      - button "Expand event details" [ref=e1300] [cursor=pointer]
                      - cell [ref=e1303]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1304] [cursor=pointer]: Oct 14 16:18:10.000
                      - cell [ref=e1305]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1306] [cursor=pointer]:
                          - generic [ref=e1307]: debug
                      - cell [ref=e1309]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1310] [cursor=pointer]: payments-worker
                      - cell [ref=e1311]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1312] [cursor=pointer]: Request processed
                      - cell [ref=e1313]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e1314] [cursor=pointer]: req-000002
                    - row [ref=e1316]:
                      - button "Expand event details" [ref=e1317] [cursor=pointer]
                      - cell [ref=e1320]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1321] [cursor=pointer]: Oct 14 16:18:15.000
                      - cell [ref=e1322]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1323] [cursor=pointer]:
                          - generic [ref=e1324]: warn
                      - cell [ref=e1326]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1327] [cursor=pointer]: payments-worker
                      - cell [ref=e1328]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1329] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e1330]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e1331] [cursor=pointer]: req-000003
                    - row [ref=e1333]:
                      - button "Expand event details" [ref=e1334] [cursor=pointer]
                      - cell [ref=e1337]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1338] [cursor=pointer]: Oct 14 16:18:20.000
                      - cell [ref=e1339]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1340] [cursor=pointer]:
                          - generic [ref=e1341]: info
                      - cell [ref=e1343]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1344] [cursor=pointer]: payments-worker
                      - cell [ref=e1345]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1346] [cursor=pointer]: Request processed
                      - cell [ref=e1347]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e1348] [cursor=pointer]: req-000004
                    - row [ref=e1350]:
                      - button "Expand event details" [ref=e1351] [cursor=pointer]
                      - cell [ref=e1354]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1355] [cursor=pointer]: Oct 14 16:18:25.000
                      - cell [ref=e1356]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1357] [cursor=pointer]:
                          - generic [ref=e1358]: error
                      - cell [ref=e1360]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1361] [cursor=pointer]: payments-worker
                      - cell [ref=e1362]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1363] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e1364]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e1365] [cursor=pointer]: req-000005
                    - row [ref=e1367]:
                      - button "Expand event details" [ref=e1368] [cursor=pointer]
                      - cell [ref=e1371]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1372] [cursor=pointer]: Oct 14 16:18:30.000
                      - cell [ref=e1373]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1374] [cursor=pointer]:
                          - generic [ref=e1375]: info
                      - cell [ref=e1377]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1378] [cursor=pointer]: payments-worker
                      - cell [ref=e1379]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1380] [cursor=pointer]: Request processed
                      - cell [ref=e1381]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e1382] [cursor=pointer]: req-000006
                    - row [ref=e1384]:
                      - button "Expand event details" [ref=e1385] [cursor=pointer]
                      - cell [ref=e1388]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1389] [cursor=pointer]: Oct 14 16:18:35.000
                      - cell [ref=e1390]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1391] [cursor=pointer]:
                          - generic [ref=e1392]: info
                      - cell [ref=e1394]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1395] [cursor=pointer]: payments-worker
                      - cell [ref=e1396]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1397] [cursor=pointer]: Request processed
                      - cell [ref=e1398]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e1399] [cursor=pointer]: req-000007
                    - row [ref=e1401]:
                      - button "Expand event details" [ref=e1402] [cursor=pointer]
                      - cell [ref=e1405]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1406] [cursor=pointer]: Oct 14 16:18:40.000
                      - cell [ref=e1407]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1408] [cursor=pointer]:
                          - generic [ref=e1409]: debug
                      - cell [ref=e1411]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1412] [cursor=pointer]: payments-worker
                      - cell [ref=e1413]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1414] [cursor=pointer]: Request processed
                      - cell [ref=e1415]:
                        - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e1416] [cursor=pointer]: req-000008
                - generic [ref=e1417]:
                  - generic [ref=e1418]: Expand a row for JSON · Click a cell to inspect
                  - generic [ref=e1419]: Export covers this loaded selection
              - status [ref=e1420]:
                - generic [ref=e1421]:
                  - paragraph [ref=e1423]: complete · 540 loaded
                  - paragraph [ref=e1424]: 540 scanned
                  - paragraph [ref=e1425]: 0.0s
      - status [ref=e1426]: Draggable item tab:tab-2025a0c6-4894-4f33-80b8-83c80727543c was moved over droppable area tab:tab-2025a0c6-4894-4f33-80b8-83c80727543c.
  - contentinfo [ref=e1427]:
    - generic [ref=e1428]:
      - paragraph [ref=e1430]: Isolated local development
      - paragraph [ref=e1431]: 3 tabs · 3 panes
    - generic [ref=e1432]:
      - paragraph [ref=e1433]: Saved locally
      - paragraph [ref=e1434]: v0.1.1
```

# Test source

```ts
  225 |     recursive: true,
  226 |     force: true,
  227 |     maxRetries: 10,
  228 |     retryDelay: 100,
  229 |   });
  230 | });
  231 | 
  232 | test("unsorted and sorted tables settle at idle and remain responsive to trusted typing", async () => {
  233 |   const session = await page.context().newCDPSession(page);
  234 |   await session.send("Performance.enable");
  235 |   try {
  236 |     await expectIdle(session, "unsorted");
  237 |     const timestamp = page.locator('.column-sort[title="Sort by Timestamp"]');
  238 |     const header = page.locator(".log-header-cell").filter({ has: timestamp });
  239 |     await expect(header).toHaveAttribute("aria-sort", "none");
  240 |     await timestamp.click({ timeout: 3000 });
  241 |     await expect(header).not.toHaveAttribute("aria-sort", "none");
  242 |     await expectIdle(session, "sorted");
  243 |     const firstDirection = await header.getAttribute("aria-sort");
  244 |     await timestamp.click({ timeout: 3000 });
  245 |     await expect(header).toHaveAttribute(
  246 |       "aria-sort",
  247 |       firstDirection === "ascending" ? "descending" : "ascending",
  248 |     );
  249 |     await timestamp.click({ timeout: 3000 });
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
  301 |   for (const name of ["payments-worker", "media-pipeline"]) {
  302 |     await page.getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true }).locator(".resource-label").dblclick();
  303 |   }
  304 |   await expect(page.locator(".workspace-tab")).toHaveCount(3);
  305 |   await expect(page.locator(".tab-grip,.tab-menu-button")).toHaveCount(0);
  306 |   const tab = page.getByRole("tab", { name: "orders-api", exact: true });
  307 |   let start = (await tab.boundingBox())!;
  308 |   await page.mouse.move(start.x + 30, start.y + start.height / 2);
  309 |   await page.mouse.down();
  310 |   await page.mouse.move(start.x + 100, start.y + start.height / 2, { steps: 8 });
  311 |   await expect(page.locator(".workspace-tab.is-dragging")).toHaveCount(1);
  312 |   await expect(page.locator(".workspace-drag-preview")).toHaveCount(0);
  313 |   expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  314 |   await page.mouse.up();
  315 | 
  316 |   const splitByDrag = async (sourceName: string, paneIndex: number, edge: "left" | "right" | "top" | "bottom") => {
  317 |     const source = page.getByRole("tab", { name: sourceName, exact: true });
  318 |     const from = (await source.boundingBox())!;
  319 |     const panel = page.locator("[data-pane-drop-target]").nth(paneIndex);
  320 |     const to = (await panel.boundingBox())!;
  321 |     const x = edge === "left" ? to.x + 20 : edge === "right" ? to.x + to.width - 20 : to.x + to.width / 2;
  322 |     const y = edge === "top" ? to.y + 45 : edge === "bottom" ? to.y + to.height - 25 : to.y + to.height / 2;
  323 |     await page.mouse.move(from.x + 30, from.y + from.height / 2);
  324 |     await page.mouse.down();
> 325 |     await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 3 });
      |                      ^ Error: mouse.move: Target page, context or browser has been closed
  326 |     await page.mouse.move(x, y, { steps: 18 });
  327 |     await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  328 |     const preview = page.locator(`[data-split-preview="${edge}"]`);
  329 |     await expect(preview).toBeVisible();
  330 |     const shown = (await preview.boundingBox())!;
  331 |     if (edge === "left" || edge === "right") expect(shown.width).toBeCloseTo(to.width / 2, 0);
  332 |     else expect(shown.height).toBeCloseTo(to.height / 2, 0);
  333 |     await page.mouse.up();
  334 |     await expect(page.locator(".workspace-drag-preview,.pane-drop-overlay")).toHaveCount(0);
  335 |   };
  336 |   await expect(page.getByLabel("Add split pane", { exact: true })).toHaveAttribute("data-split-axis", "horizontal");
  337 |   await splitByDrag("orders-api", 0, "right");
  338 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  339 |   await expect(page.getByLabel("Add split pane", { exact: true })).toHaveAttribute("data-split-axis", "vertical");
  340 |   await splitByDrag("payments-worker", 1, "bottom");
  341 |   await expect(page.locator(".workspace-pane")).toHaveCount(3);
  342 |   const three = await paneRectangles();
  343 |   expect(three[0].x).toBeLessThan(three[1].x);
  344 |   expect(three[1].y).toBeLessThan(three[2].y);
  345 |   expect(Math.abs(three[0].height - three[1].height - three[2].height - 6)).toBeLessThan(3);
  346 |   await splitByDrag("media-pipeline", 2, "left");
  347 |   await expect(page.locator(".workspace-pane")).toHaveCount(4);
  348 |   await expect(page.getByLabel("Add split pane", { exact: true })).toBeDisabled();
  349 |   const four = await paneRectangles();
  350 |   expect(four.every((rect) => rect.width > 100 && rect.height > 100)).toBe(true);
  351 |   expect(four[2].x).toBeLessThan(four[3].x);
  352 |   expect(Math.abs(four[2].y - four[3].y)).toBeLessThan(2);
  353 |   const horizontal = page.getByRole("separator", { name: "Resize panes horizontally", exact: true }).first();
  354 |   await horizontal.click({ position: { x: 3, y: 20 } });
  355 |   await page.keyboard.press("ArrowRight");
  356 |   await expect(horizontal).toHaveAttribute("aria-valuenow", "52");
  357 |   expect(rendererErrors).toEqual([]);
  358 |   await closeNaturally();
  359 |   const saved = JSON.parse(await readFile(join(directory, "workspace.json"), "utf8"));
  360 |   expect(saved.panes).toHaveLength(4);
  361 |   expect(saved.layout.second.second.axis).toBe("horizontal");
  362 | });
  363 | 
  364 | test("right clicking a selection shows those tabs in split mode", async () => {
  365 |   for (const name of ["payments-worker", "media-pipeline"]) {
  366 |     await page.getByRole("treeitem", { name: `/aws/lambda/${name}`, exact: true }).locator(".resource-label").dblclick();
  367 |   }
  368 |   await page.getByRole("tab", { name: "orders-api", exact: true }).click({ modifiers: ["Control"] });
  369 |   await page.getByRole("tab", { name: "payments-worker", exact: true }).click({ modifiers: ["Control"] });
  370 |   await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(2);
  371 |   await page.getByRole("tab", { name: "orders-api", exact: true }).click({ button: "right" });
  372 |   await page.getByRole("menuitem", { name: "Show in split mode", exact: true }).click();
  373 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  374 |   await expect(page.locator(".workspace-pane").nth(0).locator(".pane-heading")).toContainText("orders-api");
  375 |   await expect(page.locator(".workspace-pane").nth(1).locator(".pane-heading")).toContainText("payments-worker");
  376 |   await expect(page.locator(".workspace-tab.is-selected")).toHaveCount(0);
  377 |   expect(rendererErrors).toEqual([]);
  378 |   await closeNaturally();
  379 | });
  380 | 
  381 | test("trusted settings edits and final workspace changes survive a natural restart", async () => {
  382 |   await page.getByLabel("Add split pane", { exact: true }).click();
  383 |   const divider = page.getByRole("separator", {
  384 |     name: "Resize panes horizontally",
  385 |   });
  386 |   const grid = await page.locator(".pane-layout-root").boundingBox();
  387 |   const handle = await divider.boundingBox();
  388 |   expect(grid).not.toBeNull();
  389 |   expect(handle).not.toBeNull();
  390 |   await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 20);
  391 |   await page.mouse.down();
  392 |   await page.mouse.move(grid!.x + grid!.width * 0.6, grid!.y + 20, {
  393 |     steps: 8,
  394 |   });
  395 |   await page.mouse.up();
  396 |   await expect(
  397 |     page.getByRole("separator", { name: "Resize panes horizontally" }),
  398 |   ).toHaveAttribute("aria-valuenow", "60");
  399 |   await page
  400 |     .getByRole("button", { name: "Workspace settings", exact: true })
  401 |     .click();
  402 |   await page
  403 |     .getByRole("tab", { name: "Preferences", exact: true })
  404 |     .click({ timeout: 10000 });
  405 |   await typeText(page.getByLabel("Log font size", { exact: true }), "14");
  406 |   await expect(page.getByLabel("Log font size", { exact: true })).toHaveValue(
  407 |     "14",
  408 |   );
  409 |   await page.keyboard.press("Enter");
  410 |   const maxEvents = page.getByLabel("Maximum events per view", { exact: true });
  411 |   const loadedBeforeLimitEdit =
  412 |     (await page.locator(".viewer-meta").textContent()) ?? "";
  413 |   await typeText(maxEvents, "25000");
  414 |   await expect(maxEvents).toHaveValue("25000");
  415 |   await page.keyboard.press("Tab");
  416 |   await expect(page.locator(".viewer-meta")).toHaveText(loadedBeforeLimitEdit);
  417 |   const refresh = page.getByLabel("Automatic refresh (seconds)", {
  418 |     exact: true,
  419 |   });
  420 |   await typeText(refresh, "120");
  421 |   await expect(refresh).toHaveValue("120");
  422 |   await typeText(refresh, "0");
  423 |   await expect(refresh).toHaveValue("0");
  424 |   await page
  425 |     .getByRole("combobox", { name: "Timestamp display", exact: true })
```