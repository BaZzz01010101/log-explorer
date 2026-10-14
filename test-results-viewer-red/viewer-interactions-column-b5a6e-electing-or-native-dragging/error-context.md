# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer-interactions.spec.ts >> column widths follow trusted pointer movement before release without selecting or native dragging
- Location: tests\desktop\viewer-interactions.spec.ts:113:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 264
Received:   194

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
            - paragraph [ref=e242]: eu-west-1
          - button "Split pane" [ref=e244] [cursor=pointer]
        - tabpanel "orders-api" [ref=e248]:
          - generic [ref=e249]:
            - generic [ref=e250]:
              - generic [ref=e251]:
                - radiogroup "Server query type" [ref=e252]:
                  - generic [ref=e254]:
                    - radio "Events" [checked]
                    - generic [ref=e255] [cursor=pointer]: Events
                  - generic [ref=e256]:
                    - radio "Insights"
                    - generic [ref=e257] [cursor=pointer]: Insights
                - button "1 source" [ref=e258] [cursor=pointer]
              - generic [ref=e264]:
                - combobox "Time range" [ref=e271] [cursor=pointer]: Last hour
                - button "Saved queries and presets" [ref=e272] [cursor=pointer]
            - generic [ref=e276]:
              - generic [ref=e279]:
                - generic [ref=e280]: SERVER
                - textbox "CloudWatch filter pattern" [ref=e283]:
                  - /placeholder: "{ $.level = \"error\" } or \"request failed\""
              - generic [ref=e284]:
                - button "Run" [ref=e285] [cursor=pointer]
                - button "Live" [ref=e291] [cursor=pointer]
            - generic [ref=e297]:
              - paragraph [ref=e298]: CloudWatch pattern • server-side selection • limited fixture interpreter
              - paragraph [ref=e299]: Control+Enter
          - generic [ref=e301]:
            - generic [ref=e302]:
              - textbox "Local filter loaded events" [ref=e309]:
                - /placeholder: Search loaded events…
              - combobox "Local level filter" [ref=e312] [cursor=pointer]: All levels
              - button "Local filtering help" [ref=e313] [cursor=pointer]
              - radiogroup "Event view mode" [ref=e317]:
                - generic [ref=e319]:
                  - radio "JSON"
                  - generic [ref=e320] [cursor=pointer]: JSON
                - generic [ref=e326]:
                  - radio "Table" [checked]
                  - generic [ref=e327] [cursor=pointer]: Table
                - generic [ref=e332]:
                  - radio "Hybrid"
                  - generic [ref=e333] [cursor=pointer]: Hybrid
              - button "Configure columns" [ref=e338] [cursor=pointer]
              - button "Toggle line wrap" [ref=e342] [cursor=pointer]
              - button "Export loaded filtered events" [ref=e346] [cursor=pointer]:
                - generic [ref=e347]: Export
            - generic [ref=e353]:
              - generic [ref=e354]: LOCAL · 540 / 540 loaded events
              - generic [ref=e356]: 511 JSON · Local time
            - region "Log events" [ref=e357]:
              - row [ref=e358]:
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
                  - cell [ref=e381]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e382] [cursor=pointer]: Oct 14 16:08:00.000
                  - cell [ref=e383]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e384] [cursor=pointer]:
                      - generic [ref=e385]: unknown
                  - cell [ref=e387]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e388] [cursor=pointer]: —
                  - cell [ref=e389]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e390] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                  - cell [ref=e391]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e392] [cursor=pointer]: —
                - row [ref=e394]:
                  - cell [ref=e395]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e396] [cursor=pointer]: Oct 14 16:08:05.000
                  - cell [ref=e397]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e398] [cursor=pointer]:
                      - generic [ref=e399]: info
                  - cell [ref=e401]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e402] [cursor=pointer]: orders-api
                  - cell [ref=e403]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e404] [cursor=pointer]: Request processed
                  - cell [ref=e405]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e406] [cursor=pointer]: req-000001
                - row [ref=e408]:
                  - cell [ref=e409]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e410] [cursor=pointer]: Oct 14 16:08:10.000
                  - cell [ref=e411]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e412] [cursor=pointer]:
                      - generic [ref=e413]: debug
                  - cell [ref=e415]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e416] [cursor=pointer]: orders-api
                  - cell [ref=e417]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e418] [cursor=pointer]: Request processed
                  - cell [ref=e419]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e420] [cursor=pointer]: req-000002
                - row [ref=e422]:
                  - cell [ref=e423]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e424] [cursor=pointer]: Oct 14 16:08:15.000
                  - cell [ref=e425]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e426] [cursor=pointer]:
                      - generic [ref=e427]: warn
                  - cell [ref=e429]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e430] [cursor=pointer]: orders-api
                  - cell [ref=e431]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e432] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e433]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e434] [cursor=pointer]: req-000003
                - row [ref=e436]:
                  - cell [ref=e437]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e438] [cursor=pointer]: Oct 14 16:08:20.000
                  - cell [ref=e439]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e440] [cursor=pointer]:
                      - generic [ref=e441]: info
                  - cell [ref=e443]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e444] [cursor=pointer]: orders-api
                  - cell [ref=e445]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e446] [cursor=pointer]: Request processed
                  - cell [ref=e447]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e448] [cursor=pointer]: req-000004
                - row [ref=e450]:
                  - cell [ref=e451]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e452] [cursor=pointer]: Oct 14 16:08:25.000
                  - cell [ref=e453]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e454] [cursor=pointer]:
                      - generic [ref=e455]: error
                  - cell [ref=e457]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e458] [cursor=pointer]: orders-api
                  - cell [ref=e459]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e460] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e461]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e462] [cursor=pointer]: req-000005
                - row [ref=e464]:
                  - cell [ref=e465]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e466] [cursor=pointer]: Oct 14 16:08:30.000
                  - cell [ref=e467]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e468] [cursor=pointer]:
                      - generic [ref=e469]: info
                  - cell [ref=e471]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e472] [cursor=pointer]: orders-api
                  - cell [ref=e473]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e474] [cursor=pointer]: Request processed
                  - cell [ref=e475]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e476] [cursor=pointer]: req-000006
                - row [ref=e478]:
                  - cell [ref=e479]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e480] [cursor=pointer]: Oct 14 16:08:35.000
                  - cell [ref=e481]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e482] [cursor=pointer]:
                      - generic [ref=e483]: info
                  - cell [ref=e485]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e486] [cursor=pointer]: orders-api
                  - cell [ref=e487]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e488] [cursor=pointer]: Request processed
                  - cell [ref=e489]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e490] [cursor=pointer]: req-000007
                - row [ref=e492]:
                  - cell [ref=e493]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e494] [cursor=pointer]: Oct 14 16:08:40.000
                  - cell [ref=e495]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e496] [cursor=pointer]:
                      - generic [ref=e497]: debug
                  - cell [ref=e499]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e500] [cursor=pointer]: orders-api
                  - cell [ref=e501]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e502] [cursor=pointer]: Request processed
                  - cell [ref=e503]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e504] [cursor=pointer]: req-000008
                - row [ref=e506]:
                  - cell [ref=e507]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e508] [cursor=pointer]: Oct 14 16:08:45.000
                  - cell [ref=e509]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e510] [cursor=pointer]:
                      - generic [ref=e511]: warn
                  - cell [ref=e513]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e514] [cursor=pointer]: orders-api
                  - cell [ref=e515]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e516] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e517]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e518] [cursor=pointer]: req-000009
                - row [ref=e520]:
                  - cell [ref=e521]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e522] [cursor=pointer]: Oct 14 16:08:50.000
                  - cell [ref=e523]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e524] [cursor=pointer]:
                      - generic [ref=e525]: info
                  - cell [ref=e527]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e528] [cursor=pointer]: orders-api
                  - cell [ref=e529]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e530] [cursor=pointer]: Request processed
                  - cell [ref=e531]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e532] [cursor=pointer]: req-00000a
                - row [ref=e534]:
                  - cell [ref=e535]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e536] [cursor=pointer]: Oct 14 16:08:55.000
                  - cell [ref=e537]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e538] [cursor=pointer]:
                      - generic [ref=e539]: error
                  - cell [ref=e541]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e542] [cursor=pointer]: orders-api
                  - cell [ref=e543]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e544] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e545]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e546] [cursor=pointer]: req-00000b
                - row [ref=e548]:
                  - cell [ref=e549]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e550] [cursor=pointer]: Oct 14 16:09:00.000
                  - cell [ref=e551]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e552] [cursor=pointer]:
                      - generic [ref=e553]: info
                  - cell [ref=e555]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e556] [cursor=pointer]: orders-api
                  - cell [ref=e557]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e558] [cursor=pointer]: Request processed
                  - cell [ref=e559]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e560] [cursor=pointer]: req-00000c
                - row [ref=e562]:
                  - cell [ref=e563]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e564] [cursor=pointer]: Oct 14 16:09:05.000
                  - cell [ref=e565]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e566] [cursor=pointer]:
                      - generic [ref=e567]: info
                  - cell [ref=e569]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e570] [cursor=pointer]: orders-api
                  - cell [ref=e571]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e572] [cursor=pointer]: Request processed
                  - cell [ref=e573]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e574] [cursor=pointer]: req-00000d
                - row [ref=e576]:
                  - cell [ref=e577]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e578] [cursor=pointer]: Oct 14 16:09:10.000
                  - cell [ref=e579]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e580] [cursor=pointer]:
                      - generic [ref=e581]: debug
                  - cell [ref=e583]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e584] [cursor=pointer]: orders-api
                  - cell [ref=e585]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e586] [cursor=pointer]: Request processed
                  - cell [ref=e587]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e588] [cursor=pointer]: req-00000e
                - row [ref=e590]:
                  - cell [ref=e591]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e592] [cursor=pointer]: Oct 14 16:09:15.000
                  - cell [ref=e593]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e594] [cursor=pointer]:
                      - generic [ref=e595]: warn
                  - cell [ref=e597]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e598] [cursor=pointer]: orders-api
                  - cell [ref=e599]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e600] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e601]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e602] [cursor=pointer]: req-00000f
                - row [ref=e604]:
                  - cell [ref=e605]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e606] [cursor=pointer]: Oct 14 16:09:20.000
                  - cell [ref=e607]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e608] [cursor=pointer]:
                      - generic [ref=e609]: info
                  - cell [ref=e611]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e612] [cursor=pointer]: orders-api
                  - cell [ref=e613]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e614] [cursor=pointer]: Request processed
                  - cell [ref=e615]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e616] [cursor=pointer]: req-000010
                - row [ref=e618]:
                  - cell [ref=e619]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e620] [cursor=pointer]: Oct 14 16:09:25.000
                  - cell [ref=e621]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e622] [cursor=pointer]:
                      - generic [ref=e623]: error
                  - cell [ref=e625]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e626] [cursor=pointer]: orders-api
                  - cell [ref=e627]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e628] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e629]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e630] [cursor=pointer]: req-000011
                - row [ref=e632]:
                  - cell [ref=e633]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e634] [cursor=pointer]: Oct 14 16:09:30.000
                  - cell [ref=e635]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e636] [cursor=pointer]:
                      - generic [ref=e637]: info
                  - cell [ref=e639]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e640] [cursor=pointer]: orders-api
                  - cell [ref=e641]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e642] [cursor=pointer]: Request processed
                  - cell [ref=e643]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e644] [cursor=pointer]: req-000012
                - row [ref=e646]:
                  - cell [ref=e647]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e648] [cursor=pointer]: Oct 14 16:09:35.000
                  - cell [ref=e649]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e650] [cursor=pointer]:
                      - generic [ref=e651]: info
                  - cell [ref=e653]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e654] [cursor=pointer]: orders-api
                  - cell [ref=e655]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e656] [cursor=pointer]: Request processed
                  - cell [ref=e657]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e658] [cursor=pointer]: req-000013
                - row [ref=e660]:
                  - cell [ref=e661]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e662] [cursor=pointer]: Oct 14 16:09:40.000
                  - cell [ref=e663]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e664] [cursor=pointer]:
                      - generic [ref=e665]: debug
                  - cell [ref=e667]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e668] [cursor=pointer]: orders-api
                  - cell [ref=e669]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e670] [cursor=pointer]: Request processed
                  - cell [ref=e671]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e672] [cursor=pointer]: req-000014
            - generic [ref=e673]:
              - generic [ref=e674]: Click a cell to inspect · Drag column edges to resize
              - generic [ref=e675]: Export covers this loaded selection
          - status [ref=e676]:
            - generic [ref=e677]:
              - paragraph [ref=e679]: complete · 540 loaded
              - paragraph [ref=e680]: 540 scanned
              - paragraph [ref=e681]: 0.0s
      - status [ref=e682]
  - contentinfo [ref=e683]:
    - generic [ref=e684]:
      - paragraph [ref=e686]: Isolated local development
      - paragraph [ref=e687]: 1 tabs · 1 panes
    - generic [ref=e688]:
      - paragraph [ref=e689]: Saved locally
      - paragraph [ref=e690]: v0.1.1
```

# Test source

```ts
  32  |   const environment: Record<string, string> = {};
  33  |   for (const key of [
  34  |     "PATH",
  35  |     "SystemRoot",
  36  |     "WINDIR",
  37  |     "TEMP",
  38  |     "TMP",
  39  |     "USERPROFILE",
  40  |     "LOCALAPPDATA",
  41  |     "APPDATA",
  42  |     "COMSPEC",
  43  |   ])
  44  |     if (process.env[key]) environment[key] = process.env[key]!;
  45  |   Object.assign(environment, {
  46  |     EXPLORER_TEST_USER_DATA: directory,
  47  |     AWS_CONFIG_FILE: join(directory, "absent-config"),
  48  |     AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
  49  |     AWS_EC2_METADATA_DISABLED: "true",
  50  |   });
  51  |   app = await electron.launch({
  52  |     executablePath: packaged ? executable : undefined,
  53  |     args: [
  54  |       ...(packaged ? [] : [process.cwd()]),
  55  |       "--offline-verification",
  56  |       "--background-verification",
  57  |       "--disable-background-networking",
  58  |       "--disable-component-update",
  59  |     ],
  60  |     env: environment,
  61  |   });
  62  |   child = app.process();
  63  |   page = await app.firstWindow();
  64  |   await app.evaluate(({ BrowserWindow, dialog }) => {
  65  |     if (BrowserWindow.getAllWindows()[0].isVisible())
  66  |       throw new Error("Viewer verification must remain hidden");
  67  |     dialog.showMessageBox = async () => {
  68  |       throw new Error("Unexpected native dialog in hidden viewer verification");
  69  |     };
  70  |   });
  71  |   const cdp = await page.context().newCDPSession(page);
  72  |   await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  73  |   page.on("pageerror", (error) => errors.push(error.message));
  74  |   await expect(page.locator(".query-status")).toContainText("complete");
  75  |   const info = await page.evaluate(() => window.explorer.environment());
  76  |   expect(info.awsEnabled).toBe(false);
  77  |   expect(info.canEnableAws).toBe(false);
  78  | });
  79  | 
  80  | test.afterEach(async () => {
  81  |   if (child?.exitCode === null) {
  82  |     await Promise.race([
  83  |       app.close().catch(() => {}),
  84  |       new Promise((resolveDelay) => setTimeout(resolveDelay, 4000)),
  85  |     ]);
  86  |     if (child.exitCode === null) {
  87  |       if (process.platform === "win32") {
  88  |         try {
  89  |           execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
  90  |             stdio: "ignore",
  91  |           });
  92  |         } catch {}
  93  |       } else child.kill();
  94  |     }
  95  |   }
  96  |   if (directory) {
  97  |     if (
  98  |       !resolve(directory).startsWith(
  99  |         resolve(tmpdir()) + sep + "aws-log-explorer-viewer-",
  100 |       )
  101 |     )
  102 |       throw new Error("Unsafe viewer verification cleanup path");
  103 |     await rm(directory, {
  104 |       recursive: true,
  105 |       force: true,
  106 |       maxRetries: 10,
  107 |       retryDelay: 100,
  108 |     });
  109 |   }
  110 |   expect(errors).toEqual([]);
  111 | });
  112 | 
  113 | test("column widths follow trusted pointer movement before release without selecting or native dragging", async () => {
  114 |   await page.locator("label").filter({ hasText: /^Table$/ }).click();
  115 |   const header = page.getByRole("columnheader").first();
  116 |   const handle = page.getByRole("separator", {
  117 |     name: "Resize Timestamp",
  118 |     exact: true,
  119 |   });
  120 |   const original = (await header.boundingBox())!;
  121 |   const box = (await handle.boundingBox())!;
  122 |   await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  123 |   await page.mouse.down();
  124 |   try {
  125 |     await page.mouse.move(
  126 |       box.x + box.width / 2 + 90,
  127 |       box.y + box.height / 2 + 45,
  128 |       { steps: 15 },
  129 |     );
  130 |     await expect
  131 |       .poll(async () => (await header.boundingBox())!.width)
> 132 |       .toBeGreaterThan(original.width + 70);
      |        ^ Error: expect(received).toBeGreaterThan(expected)
  133 |     expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
  134 |       "",
  135 |     );
  136 |     await expect(handle).toHaveAttribute(
  137 |       "aria-valuenow",
  138 |       String(Math.round(original.width + 90)),
  139 |     );
  140 |   } finally {
  141 |     await page.mouse.up();
  142 |   }
  143 |   await expect(page.locator("body")).not.toHaveClass(/resizing-columns/);
  144 |   const resized = (await header.boundingBox())!.width;
  145 |   const next = (await handle.boundingBox())!;
  146 |   await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  147 |   await page.mouse.down();
  148 |   await page.mouse.move(
  149 |     next.x + next.width / 2 - 45,
  150 |     next.y + next.height / 2,
  151 |     { steps: 6 },
  152 |   );
  153 |   await page.mouse.up();
  154 |   await expect
  155 |     .poll(async () => (await header.boundingBox())!.width)
  156 |     .toBeLessThan(resized - 35);
  157 |   await page.getByLabel("Local filter loaded events").fill("Payment");
  158 |   await expect(page.locator(".log-table-row").first()).toContainText("Payment");
  159 |   const savedWidth = Math.round((await header.boundingBox())!.width);
  160 |   await expect
  161 |     .poll(async () => {
  162 |       const stored = JSON.parse(
  163 |         await readFile(join(directory, "workspace.json"), "utf8"),
  164 |       );
  165 |       return stored.tabs[0].view.columns.find(
  166 |         (column: { path: string }) => column.path === "@timestamp",
  167 |       ).width;
  168 |     })
  169 |     .toBe(savedWidth);
  170 | });
  171 | 
  172 | test("hybrid labels stay inline and expanded rows retain aligned geometry through horizontal scrolling", async () => {
  173 |   const labels = page.locator(".viewer-toolbar label").filter({ hasText: /^(JSON|Table|Hybrid)$/ });
  174 |   await expect(labels).toHaveCount(3);
  175 |   const geometries = await labels.evaluateAll((elements) =>
  176 |     elements.map((element) => {
  177 |       const icon = element.querySelector("svg")!.getBoundingClientRect();
  178 |       const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  179 |       let node = walker.nextNode();
  180 |       while (node && !node.textContent?.trim()) node = walker.nextNode();
  181 |       const range = document.createRange();
  182 |       range.selectNodeContents(node!);
  183 |       const text = range.getBoundingClientRect();
  184 |       return {
  185 |         delta: Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
  186 |         height: element.getBoundingClientRect().height,
  187 |       };
  188 |     }),
  189 |   );
  190 |   for (const geometry of geometries) {
  191 |     expect(geometry.delta).toBeLessThan(2);
  192 |     expect(geometry.height).toBeLessThan(25);
  193 |   }
  194 |   await page.locator("label").filter({ hasText: /^Hybrid$/ }).click();
  195 |   const events = page.locator(".table-event");
  196 |   await page
  197 |     .getByRole("button", { name: "Expand event details" })
  198 |     .nth(1)
  199 |     .click();
  200 |   const detail = page.locator(".hybrid-detail").first();
  201 |   await expect(detail).toBeVisible();
  202 |   await expect(detail.locator(".json-tree")).toBeVisible();
  203 |   await expect
  204 |     .poll(async () => {
  205 |       const expanded = await events.nth(1).boundingBox();
  206 |       const following = await events.nth(2).boundingBox();
  207 |       return following!.y - expanded!.y - expanded!.height;
  208 |     })
  209 |     .toBeGreaterThanOrEqual(-1);
  210 |   const viewport = page.getByRole("region", {
  211 |     name: "Log events",
  212 |     exact: true,
  213 |   });
  214 |   const rect = (await viewport.boundingBox())!;
  215 |   await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  216 |   await page.mouse.wheel(420, 0);
  217 |   await expect
  218 |     .poll(() => viewport.evaluate((element) => element.scrollLeft))
  219 |     .toBeGreaterThan(100);
  220 |   const layout = await page.evaluate(() => {
  221 |     const viewport = document
  222 |       .querySelector(".viewer-scroll")!
  223 |       .getBoundingClientRect();
  224 |     const detail = document
  225 |       .querySelector(".hybrid-detail")!
  226 |       .getBoundingClientRect();
  227 |     const header = document
  228 |       .querySelector(".log-header-cell")!
  229 |       .getBoundingClientRect();
  230 |     const cell = document.querySelector(".log-cell")!.getBoundingClientRect();
  231 |     return { viewport, detail, delta: Math.abs(header.x - cell.x) };
  232 |   });
```