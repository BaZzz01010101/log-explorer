# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer-interactions.spec.ts >> hybrid labels stay inline and expanded rows retain aligned geometry through horizontal scrolling
- Location: tests\desktop\viewer-interactions.spec.ts:172:5

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 2
Received:   19.16668701171875
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
                  - radio "Table"
                  - generic [ref=e327] [cursor=pointer]: Table
                - generic [ref=e332]:
                  - radio "Hybrid" [checked]
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
                - columnheader [ref=e360]:
                  - button "Timestamp" [ref=e361] [cursor=pointer]
                  - separator "Resize Timestamp" [ref=e366]
                - columnheader [ref=e367]:
                  - button "Level" [ref=e368] [cursor=pointer]
                  - separator "Resize Level" [ref=e369]
                - columnheader [ref=e370]:
                  - button "/service/name" [ref=e371] [cursor=pointer]
                  - separator "Resize /service/name" [ref=e372]
                - columnheader [ref=e373]:
                  - button "Message" [ref=e374] [cursor=pointer]
                  - separator "Resize Message" [ref=e375]
                - columnheader [ref=e376]:
                  - button "/request/id" [ref=e377] [cursor=pointer]
                  - separator "Resize /request/id" [ref=e378]
              - generic [ref=e379]:
                - row [ref=e381]:
                  - button "Expand event details" [ref=e382] [cursor=pointer]
                  - cell [ref=e385]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e386] [cursor=pointer]: Oct 14 16:09:00.000
                  - cell [ref=e387]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e388] [cursor=pointer]:
                      - generic [ref=e389]: unknown
                  - cell [ref=e391]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e392] [cursor=pointer]: —
                  - cell [ref=e393]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e394] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                  - cell [ref=e395]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e396] [cursor=pointer]: —
                - row [ref=e398]:
                  - button "Expand event details" [ref=e399] [cursor=pointer]
                  - cell [ref=e402]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e403] [cursor=pointer]: Oct 14 16:09:05.000
                  - cell [ref=e404]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e405] [cursor=pointer]:
                      - generic [ref=e406]: info
                  - cell [ref=e408]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e409] [cursor=pointer]: orders-api
                  - cell [ref=e410]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e411] [cursor=pointer]: Request processed
                  - cell [ref=e412]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e413] [cursor=pointer]: req-000001
                - row [ref=e415]:
                  - button "Expand event details" [ref=e416] [cursor=pointer]
                  - cell [ref=e419]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e420] [cursor=pointer]: Oct 14 16:09:10.000
                  - cell [ref=e421]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e422] [cursor=pointer]:
                      - generic [ref=e423]: debug
                  - cell [ref=e425]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e426] [cursor=pointer]: orders-api
                  - cell [ref=e427]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e428] [cursor=pointer]: Request processed
                  - cell [ref=e429]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e430] [cursor=pointer]: req-000002
                - row [ref=e432]:
                  - button "Expand event details" [ref=e433] [cursor=pointer]
                  - cell [ref=e436]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e437] [cursor=pointer]: Oct 14 16:09:15.000
                  - cell [ref=e438]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e439] [cursor=pointer]:
                      - generic [ref=e440]: warn
                  - cell [ref=e442]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e443] [cursor=pointer]: orders-api
                  - cell [ref=e444]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e445] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e446]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e447] [cursor=pointer]: req-000003
                - row [ref=e449]:
                  - button "Expand event details" [ref=e450] [cursor=pointer]
                  - cell [ref=e453]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e454] [cursor=pointer]: Oct 14 16:09:20.000
                  - cell [ref=e455]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e456] [cursor=pointer]:
                      - generic [ref=e457]: info
                  - cell [ref=e459]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e460] [cursor=pointer]: orders-api
                  - cell [ref=e461]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e462] [cursor=pointer]: Request processed
                  - cell [ref=e463]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e464] [cursor=pointer]: req-000004
                - row [ref=e466]:
                  - button "Expand event details" [ref=e467] [cursor=pointer]
                  - cell [ref=e470]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e471] [cursor=pointer]: Oct 14 16:09:25.000
                  - cell [ref=e472]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e473] [cursor=pointer]:
                      - generic [ref=e474]: error
                  - cell [ref=e476]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e477] [cursor=pointer]: orders-api
                  - cell [ref=e478]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e479] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e480]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e481] [cursor=pointer]: req-000005
                - row [ref=e483]:
                  - button "Expand event details" [ref=e484] [cursor=pointer]
                  - cell [ref=e487]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e488] [cursor=pointer]: Oct 14 16:09:30.000
                  - cell [ref=e489]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e490] [cursor=pointer]:
                      - generic [ref=e491]: info
                  - cell [ref=e493]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e494] [cursor=pointer]: orders-api
                  - cell [ref=e495]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e496] [cursor=pointer]: Request processed
                  - cell [ref=e497]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e498] [cursor=pointer]: req-000006
                - row [ref=e500]:
                  - button "Expand event details" [ref=e501] [cursor=pointer]
                  - cell [ref=e504]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e505] [cursor=pointer]: Oct 14 16:09:35.000
                  - cell [ref=e506]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e507] [cursor=pointer]:
                      - generic [ref=e508]: info
                  - cell [ref=e510]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e511] [cursor=pointer]: orders-api
                  - cell [ref=e512]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e513] [cursor=pointer]: Request processed
                  - cell [ref=e514]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e515] [cursor=pointer]: req-000007
                - row [ref=e517]:
                  - button "Expand event details" [ref=e518] [cursor=pointer]
                  - cell [ref=e521]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e522] [cursor=pointer]: Oct 14 16:09:40.000
                  - cell [ref=e523]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e524] [cursor=pointer]:
                      - generic [ref=e525]: debug
                  - cell [ref=e527]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e528] [cursor=pointer]: orders-api
                  - cell [ref=e529]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e530] [cursor=pointer]: Request processed
                  - cell [ref=e531]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e532] [cursor=pointer]: req-000008
                - row [ref=e534]:
                  - button "Expand event details" [ref=e535] [cursor=pointer]
                  - cell [ref=e538]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e539] [cursor=pointer]: Oct 14 16:09:45.000
                  - cell [ref=e540]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e541] [cursor=pointer]:
                      - generic [ref=e542]: warn
                  - cell [ref=e544]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e545] [cursor=pointer]: orders-api
                  - cell [ref=e546]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e547] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e548]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e549] [cursor=pointer]: req-000009
                - row [ref=e551]:
                  - button "Expand event details" [ref=e552] [cursor=pointer]
                  - cell [ref=e555]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e556] [cursor=pointer]: Oct 14 16:09:50.000
                  - cell [ref=e557]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e558] [cursor=pointer]:
                      - generic [ref=e559]: info
                  - cell [ref=e561]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e562] [cursor=pointer]: orders-api
                  - cell [ref=e563]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e564] [cursor=pointer]: Request processed
                  - cell [ref=e565]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e566] [cursor=pointer]: req-00000a
                - row [ref=e568]:
                  - button "Expand event details" [ref=e569] [cursor=pointer]
                  - cell [ref=e572]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e573] [cursor=pointer]: Oct 14 16:09:55.000
                  - cell [ref=e574]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e575] [cursor=pointer]:
                      - generic [ref=e576]: error
                  - cell [ref=e578]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e579] [cursor=pointer]: orders-api
                  - cell [ref=e580]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e581] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e582]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e583] [cursor=pointer]: req-00000b
                - row [ref=e585]:
                  - button "Expand event details" [ref=e586] [cursor=pointer]
                  - cell [ref=e589]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e590] [cursor=pointer]: Oct 14 16:10:00.000
                  - cell [ref=e591]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e592] [cursor=pointer]:
                      - generic [ref=e593]: info
                  - cell [ref=e595]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e596] [cursor=pointer]: orders-api
                  - cell [ref=e597]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e598] [cursor=pointer]: Request processed
                  - cell [ref=e599]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e600] [cursor=pointer]: req-00000c
                - row [ref=e602]:
                  - button "Expand event details" [ref=e603] [cursor=pointer]
                  - cell [ref=e606]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e607] [cursor=pointer]: Oct 14 16:10:05.000
                  - cell [ref=e608]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e609] [cursor=pointer]:
                      - generic [ref=e610]: info
                  - cell [ref=e612]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e613] [cursor=pointer]: orders-api
                  - cell [ref=e614]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e615] [cursor=pointer]: Request processed
                  - cell [ref=e616]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e617] [cursor=pointer]: req-00000d
                - row [ref=e619]:
                  - button "Expand event details" [ref=e620] [cursor=pointer]
                  - cell [ref=e623]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e624] [cursor=pointer]: Oct 14 16:10:10.000
                  - cell [ref=e625]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e626] [cursor=pointer]:
                      - generic [ref=e627]: debug
                  - cell [ref=e629]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e630] [cursor=pointer]: orders-api
                  - cell [ref=e631]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e632] [cursor=pointer]: Request processed
                  - cell [ref=e633]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e634] [cursor=pointer]: req-00000e
                - row [ref=e636]:
                  - button "Expand event details" [ref=e637] [cursor=pointer]
                  - cell [ref=e640]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e641] [cursor=pointer]: Oct 14 16:10:15.000
                  - cell [ref=e642]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e643] [cursor=pointer]:
                      - generic [ref=e644]: warn
                  - cell [ref=e646]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e647] [cursor=pointer]: orders-api
                  - cell [ref=e648]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e649] [cursor=pointer]: Retrying upstream request
                  - cell [ref=e650]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e651] [cursor=pointer]: req-00000f
                - row [ref=e653]:
                  - button "Expand event details" [ref=e654] [cursor=pointer]
                  - cell [ref=e657]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e658] [cursor=pointer]: Oct 14 16:10:20.000
                  - cell [ref=e659]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e660] [cursor=pointer]:
                      - generic [ref=e661]: info
                  - cell [ref=e663]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e664] [cursor=pointer]: orders-api
                  - cell [ref=e665]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e666] [cursor=pointer]: Request processed
                  - cell [ref=e667]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e668] [cursor=pointer]: req-000010
                - row [ref=e670]:
                  - button "Expand event details" [ref=e671] [cursor=pointer]
                  - cell [ref=e674]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e675] [cursor=pointer]: Oct 14 16:10:25.000
                  - cell [ref=e676]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e677] [cursor=pointer]:
                      - generic [ref=e678]: error
                  - cell [ref=e680]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e681] [cursor=pointer]: orders-api
                  - cell [ref=e682]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e683] [cursor=pointer]: Payment provider timed out
                  - cell [ref=e684]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e685] [cursor=pointer]: req-000011
                - row [ref=e687]:
                  - button "Expand event details" [ref=e688] [cursor=pointer]
                  - cell [ref=e691]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e692] [cursor=pointer]: Oct 14 16:10:30.000
                  - cell [ref=e693]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e694] [cursor=pointer]:
                      - generic [ref=e695]: info
                  - cell [ref=e697]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e698] [cursor=pointer]: orders-api
                  - cell [ref=e699]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e700] [cursor=pointer]: Request processed
                  - cell [ref=e701]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e702] [cursor=pointer]: req-000012
                - row [ref=e704]:
                  - button "Expand event details" [ref=e705] [cursor=pointer]
                  - cell [ref=e708]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e709] [cursor=pointer]: Oct 14 16:10:35.000
                  - cell [ref=e710]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e711] [cursor=pointer]:
                      - generic [ref=e712]: info
                  - cell [ref=e714]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e715] [cursor=pointer]: orders-api
                  - cell [ref=e716]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e717] [cursor=pointer]: Request processed
                  - cell [ref=e718]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e719] [cursor=pointer]: req-000013
                - row [ref=e721]:
                  - button "Expand event details" [ref=e722] [cursor=pointer]
                  - cell [ref=e725]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e726] [cursor=pointer]: Oct 14 16:10:40.000
                  - cell [ref=e727]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e728] [cursor=pointer]:
                      - generic [ref=e729]: debug
                  - cell [ref=e731]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e732] [cursor=pointer]: orders-api
                  - cell [ref=e733]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e734] [cursor=pointer]: Request processed
                  - cell [ref=e735]:
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e736] [cursor=pointer]: req-000014
            - generic [ref=e737]:
              - generic [ref=e738]: Expand a row for JSON · Click a cell to inspect
              - generic [ref=e739]: Export covers this loaded selection
          - status [ref=e740]:
            - generic [ref=e741]:
              - paragraph [ref=e743]: complete · 540 loaded
              - paragraph [ref=e744]: 540 scanned
              - paragraph [ref=e745]: 0.0s
      - status [ref=e746]
  - contentinfo [ref=e747]:
    - generic [ref=e748]:
      - paragraph [ref=e750]: Isolated local development
      - paragraph [ref=e751]: 1 tabs · 1 panes
    - generic [ref=e752]:
      - paragraph [ref=e753]: Saving
      - paragraph [ref=e754]: v0.1.1
```

# Test source

```ts
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
  132 |       .toBeGreaterThan(original.width + 70);
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
> 191 |     expect(geometry.delta).toBeLessThan(2);
      |                            ^ Error: expect(received).toBeLessThan(expected)
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
  233 |   expect(layout.delta).toBeLessThan(1);
  234 |   expect(layout.detail.x).toBeGreaterThanOrEqual(layout.viewport.x - 1);
  235 |   expect(layout.detail.right).toBeLessThanOrEqual(layout.viewport.right + 1);
  236 |   await page.getByRole("button", { name: "Collapse event details" }).click();
  237 |   await expect(detail).toHaveCount(0);
  238 | });
  239 | 
```