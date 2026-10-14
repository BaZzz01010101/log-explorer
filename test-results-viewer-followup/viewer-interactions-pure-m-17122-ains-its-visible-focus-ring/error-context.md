# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: viewer-interactions.spec.ts >> pure modifier keys leave pointer focus quiet while Tab retains its visible focus ring
- Location: tests\desktop\viewer-interactions.spec.ts:228:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 2.66667
```

# Page snapshot

```yaml
- generic [ref=e1]:
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
          - paragraph [ref=e179]: Arrow keys navigate · Enter previews · Double-click keeps · Space selects
        - separator "Resize explorer" [ref=e180]
      - main [ref=e181]:
        - generic [ref=e182]:
          - tablist "Log views" [ref=e183]:
            - tab "orders-api" [selected] [ref=e184] [cursor=pointer]
            - button "Close orders-api" [ref=e189] [cursor=pointer]
          - generic [ref=e193]:
            - button "New log view" [ref=e194] [cursor=pointer]
            - button "Add split pane" [ref=e197] [cursor=pointer]
            - button "Workspace tab menu" [ref=e201] [cursor=pointer]
        - generic "Split panes" [ref=e206]:
          - generic [ref=e207]: PANES
          - generic [ref=e208]:
            - button "Reorder pane 1" [ref=e209]
            - button "1 orders-api" [pressed] [ref=e217] [cursor=pointer]:
              - generic [ref=e218]: "1"
              - generic [ref=e219]: orders-api
        - region "Pane 1" [ref=e223]:
          - generic [ref=e224]:
            - generic [ref=e225]:
              - generic [ref=e226]: "1"
              - paragraph [ref=e228]: orders-api
              - paragraph [ref=e231]: eu-west-1
            - button "Split pane" [ref=e233] [cursor=pointer]
          - tabpanel "orders-api" [ref=e237]:
            - generic [ref=e238]:
              - generic [ref=e239]:
                - generic [ref=e240]:
                  - radiogroup "Server query type" [ref=e241]:
                    - generic [ref=e243]:
                      - radio "Events" [checked]
                      - generic [ref=e244] [cursor=pointer]: Events
                    - generic [ref=e245]:
                      - radio "Insights"
                      - generic [ref=e246] [cursor=pointer]: Insights
                  - button "1 source" [ref=e247] [cursor=pointer]
                - generic [ref=e253]:
                  - combobox "Time range" [ref=e260] [cursor=pointer]: Last hour
                  - button "Saved queries and presets" [ref=e261] [cursor=pointer]
              - generic [ref=e265]:
                - generic [ref=e268]:
                  - generic [ref=e269]: SERVER
                  - textbox "CloudWatch filter pattern" [ref=e272]:
                    - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                - generic [ref=e273]:
                  - button "Run" [ref=e274] [cursor=pointer]
                  - button "Live" [ref=e280] [cursor=pointer]
              - generic [ref=e286]:
                - paragraph [ref=e287]: CloudWatch pattern • server-side selection • limited fixture interpreter
                - paragraph [ref=e288]: Control+Enter
            - generic [ref=e290]:
              - generic [ref=e291]:
                - textbox "Local filter loaded events" [ref=e298]:
                  - /placeholder: Search loaded events…
                - combobox "Local level filter" [ref=e301] [cursor=pointer]: All levels
                - button "Local filtering help" [ref=e302] [cursor=pointer]
                - radiogroup "Event view mode" [ref=e306]:
                  - generic [ref=e308]:
                    - radio "JSON"
                    - generic [ref=e309] [cursor=pointer]: JSON
                  - generic [ref=e316]:
                    - radio "Table" [checked] [active]
                    - generic [ref=e317] [cursor=pointer]: Table
                  - generic [ref=e323]:
                    - radio "Hybrid"
                    - generic [ref=e324] [cursor=pointer]: Hybrid
                - button "Configure columns" [ref=e330] [cursor=pointer]
                - button "Toggle line wrap" [ref=e334] [cursor=pointer]
                - button "Export loaded filtered events" [ref=e338] [cursor=pointer]:
                  - generic [ref=e339]: Export
              - generic [ref=e345]:
                - generic [ref=e346]: LOCAL · 540 / 540 loaded events
                - generic [ref=e348]: 511 JSON · Local time
              - region "Log events" [ref=e349]:
                - row [ref=e350]:
                  - columnheader [ref=e351]:
                    - button "Timestamp" [ref=e352] [cursor=pointer]
                    - separator "Resize Timestamp" [ref=e357]
                  - columnheader [ref=e358]:
                    - button "Level" [ref=e359] [cursor=pointer]
                    - separator "Resize Level" [ref=e360]
                  - columnheader [ref=e361]:
                    - button "/service/name" [ref=e362] [cursor=pointer]
                    - separator "Resize /service/name" [ref=e363]
                  - columnheader [ref=e364]:
                    - button "Message" [ref=e365] [cursor=pointer]
                    - separator "Resize Message" [ref=e366]
                  - columnheader [ref=e367]:
                    - button "/request/id" [ref=e368] [cursor=pointer]
                    - separator "Resize /request/id" [ref=e369]
                - generic [ref=e370]:
                  - row [ref=e372]:
                    - cell [ref=e373]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e374] [cursor=pointer]: Oct 14 16:18:00.000
                    - cell [ref=e375]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e376] [cursor=pointer]:
                        - generic [ref=e377]: unknown
                    - cell [ref=e379]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e380] [cursor=pointer]: —
                    - cell [ref=e381]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e382] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                    - cell [ref=e383]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e384] [cursor=pointer]: —
                  - row [ref=e386]:
                    - cell [ref=e387]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e388] [cursor=pointer]: Oct 14 16:18:05.000
                    - cell [ref=e389]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e390] [cursor=pointer]:
                        - generic [ref=e391]: info
                    - cell [ref=e393]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e394] [cursor=pointer]: orders-api
                    - cell [ref=e395]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e396] [cursor=pointer]: Request processed
                    - cell [ref=e397]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e398] [cursor=pointer]: req-000001
                  - row [ref=e400]:
                    - cell [ref=e401]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e402] [cursor=pointer]: Oct 14 16:18:10.000
                    - cell [ref=e403]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e404] [cursor=pointer]:
                        - generic [ref=e405]: debug
                    - cell [ref=e407]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e408] [cursor=pointer]: orders-api
                    - cell [ref=e409]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e410] [cursor=pointer]: Request processed
                    - cell [ref=e411]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e412] [cursor=pointer]: req-000002
                  - row [ref=e414]:
                    - cell [ref=e415]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e416] [cursor=pointer]: Oct 14 16:18:15.000
                    - cell [ref=e417]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e418] [cursor=pointer]:
                        - generic [ref=e419]: warn
                    - cell [ref=e421]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e422] [cursor=pointer]: orders-api
                    - cell [ref=e423]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e424] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e425]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e426] [cursor=pointer]: req-000003
                  - row [ref=e428]:
                    - cell [ref=e429]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e430] [cursor=pointer]: Oct 14 16:18:20.000
                    - cell [ref=e431]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e432] [cursor=pointer]:
                        - generic [ref=e433]: info
                    - cell [ref=e435]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e436] [cursor=pointer]: orders-api
                    - cell [ref=e437]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e438] [cursor=pointer]: Request processed
                    - cell [ref=e439]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e440] [cursor=pointer]: req-000004
                  - row [ref=e442]:
                    - cell [ref=e443]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e444] [cursor=pointer]: Oct 14 16:18:25.000
                    - cell [ref=e445]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e446] [cursor=pointer]:
                        - generic [ref=e447]: error
                    - cell [ref=e449]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e450] [cursor=pointer]: orders-api
                    - cell [ref=e451]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e452] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e453]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e454] [cursor=pointer]: req-000005
                  - row [ref=e456]:
                    - cell [ref=e457]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e458] [cursor=pointer]: Oct 14 16:18:30.000
                    - cell [ref=e459]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e460] [cursor=pointer]:
                        - generic [ref=e461]: info
                    - cell [ref=e463]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e464] [cursor=pointer]: orders-api
                    - cell [ref=e465]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e466] [cursor=pointer]: Request processed
                    - cell [ref=e467]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e468] [cursor=pointer]: req-000006
                  - row [ref=e470]:
                    - cell [ref=e471]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e472] [cursor=pointer]: Oct 14 16:18:35.000
                    - cell [ref=e473]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e474] [cursor=pointer]:
                        - generic [ref=e475]: info
                    - cell [ref=e477]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e478] [cursor=pointer]: orders-api
                    - cell [ref=e479]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e480] [cursor=pointer]: Request processed
                    - cell [ref=e481]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e482] [cursor=pointer]: req-000007
                  - row [ref=e484]:
                    - cell [ref=e485]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e486] [cursor=pointer]: Oct 14 16:18:40.000
                    - cell [ref=e487]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e488] [cursor=pointer]:
                        - generic [ref=e489]: debug
                    - cell [ref=e491]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e492] [cursor=pointer]: orders-api
                    - cell [ref=e493]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e494] [cursor=pointer]: Request processed
                    - cell [ref=e495]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e496] [cursor=pointer]: req-000008
                  - row [ref=e498]:
                    - cell [ref=e499]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e500] [cursor=pointer]: Oct 14 16:18:45.000
                    - cell [ref=e501]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e502] [cursor=pointer]:
                        - generic [ref=e503]: warn
                    - cell [ref=e505]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e506] [cursor=pointer]: orders-api
                    - cell [ref=e507]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e508] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e509]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e510] [cursor=pointer]: req-000009
                  - row [ref=e512]:
                    - cell [ref=e513]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e514] [cursor=pointer]: Oct 14 16:18:50.000
                    - cell [ref=e515]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e516] [cursor=pointer]:
                        - generic [ref=e517]: info
                    - cell [ref=e519]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e520] [cursor=pointer]: orders-api
                    - cell [ref=e521]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e522] [cursor=pointer]: Request processed
                    - cell [ref=e523]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e524] [cursor=pointer]: req-00000a
                  - row [ref=e526]:
                    - cell [ref=e527]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e528] [cursor=pointer]: Oct 14 16:18:55.000
                    - cell [ref=e529]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e530] [cursor=pointer]:
                        - generic [ref=e531]: error
                    - cell [ref=e533]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e534] [cursor=pointer]: orders-api
                    - cell [ref=e535]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e536] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e537]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e538] [cursor=pointer]: req-00000b
                  - row [ref=e540]:
                    - cell [ref=e541]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e542] [cursor=pointer]: Oct 14 16:19:00.000
                    - cell [ref=e543]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e544] [cursor=pointer]:
                        - generic [ref=e545]: info
                    - cell [ref=e547]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e548] [cursor=pointer]: orders-api
                    - cell [ref=e549]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e550] [cursor=pointer]: Request processed
                    - cell [ref=e551]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e552] [cursor=pointer]: req-00000c
                  - row [ref=e554]:
                    - cell [ref=e555]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e556] [cursor=pointer]: Oct 14 16:19:05.000
                    - cell [ref=e557]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e558] [cursor=pointer]:
                        - generic [ref=e559]: info
                    - cell [ref=e561]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e562] [cursor=pointer]: orders-api
                    - cell [ref=e563]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e564] [cursor=pointer]: Request processed
                    - cell [ref=e565]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e566] [cursor=pointer]: req-00000d
                  - row [ref=e568]:
                    - cell [ref=e569]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e570] [cursor=pointer]: Oct 14 16:19:10.000
                    - cell [ref=e571]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e572] [cursor=pointer]:
                        - generic [ref=e573]: debug
                    - cell [ref=e575]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e576] [cursor=pointer]: orders-api
                    - cell [ref=e577]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e578] [cursor=pointer]: Request processed
                    - cell [ref=e579]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e580] [cursor=pointer]: req-00000e
                  - row [ref=e582]:
                    - cell [ref=e583]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e584] [cursor=pointer]: Oct 14 16:19:15.000
                    - cell [ref=e585]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e586] [cursor=pointer]:
                        - generic [ref=e587]: warn
                    - cell [ref=e589]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e590] [cursor=pointer]: orders-api
                    - cell [ref=e591]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e592] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e593]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e594] [cursor=pointer]: req-00000f
                  - row [ref=e596]:
                    - cell [ref=e597]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e598] [cursor=pointer]: Oct 14 16:19:20.000
                    - cell [ref=e599]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e600] [cursor=pointer]:
                        - generic [ref=e601]: info
                    - cell [ref=e603]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e604] [cursor=pointer]: orders-api
                    - cell [ref=e605]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e606] [cursor=pointer]: Request processed
                    - cell [ref=e607]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e608] [cursor=pointer]: req-000010
                  - row [ref=e610]:
                    - cell [ref=e611]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e612] [cursor=pointer]: Oct 14 16:19:25.000
                    - cell [ref=e613]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e614] [cursor=pointer]:
                        - generic [ref=e615]: error
                    - cell [ref=e617]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e618] [cursor=pointer]: orders-api
                    - cell [ref=e619]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e620] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e621]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e622] [cursor=pointer]: req-000011
                  - row [ref=e624]:
                    - cell [ref=e625]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e626] [cursor=pointer]: Oct 14 16:19:30.000
                    - cell [ref=e627]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e628] [cursor=pointer]:
                        - generic [ref=e629]: info
                    - cell [ref=e631]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e632] [cursor=pointer]: orders-api
                    - cell [ref=e633]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e634] [cursor=pointer]: Request processed
                    - cell [ref=e635]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e636] [cursor=pointer]: req-000012
                  - row [ref=e638]:
                    - cell [ref=e639]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e640] [cursor=pointer]: Oct 14 16:19:35.000
                    - cell [ref=e641]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e642] [cursor=pointer]:
                        - generic [ref=e643]: info
                    - cell [ref=e645]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e646] [cursor=pointer]: orders-api
                    - cell [ref=e647]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e648] [cursor=pointer]: Request processed
                    - cell [ref=e649]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e650] [cursor=pointer]: req-000013
                  - row [ref=e652]:
                    - cell [ref=e653]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e654] [cursor=pointer]: Oct 14 16:19:40.000
                    - cell [ref=e655]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e656] [cursor=pointer]:
                        - generic [ref=e657]: debug
                    - cell [ref=e659]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e660] [cursor=pointer]: orders-api
                    - cell [ref=e661]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e662] [cursor=pointer]: Request processed
                    - cell [ref=e663]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e664] [cursor=pointer]: req-000014
              - generic [ref=e665]:
                - generic [ref=e666]: Click a cell to inspect · Drag column edges to resize
                - generic [ref=e667]: Export covers this loaded selection
            - status [ref=e668]:
              - generic [ref=e669]:
                - paragraph [ref=e671]: complete · 540 loaded
                - paragraph [ref=e672]: 540 scanned
                - paragraph [ref=e673]: 0.0s
        - status [ref=e674]
    - contentinfo [ref=e675]:
      - generic [ref=e676]:
        - paragraph [ref=e678]: Isolated local development
        - paragraph [ref=e679]: 1 tabs · 1 panes
      - generic [ref=e680]:
        - paragraph [ref=e681]: Saved locally
        - paragraph [ref=e682]: v0.1.1
  - generic:
    - tooltip "Disable line wrapping"
```

# Test source

```ts
  176 |     .poll(async () => {
  177 |       const stored = JSON.parse(
  178 |         await readFile(join(directory, "workspace.json"), "utf8"),
  179 |       );
  180 |       return stored.tabs[0].view.columns.find(
  181 |         (column: { path: string }) => column.path === "@timestamp",
  182 |       ).width;
  183 |     })
  184 |     .toBe(savedWidth);
  185 | });
  186 | 
  187 | test("resizing cancels cleanly with Escape and remains keyboard adjustable", async () => {
  188 |   await page
  189 |     .locator("label")
  190 |     .filter({ hasText: /^Table$/ })
  191 |     .click();
  192 |   const header = page.getByRole("columnheader").first();
  193 |   const handle = page.getByRole("separator", {
  194 |     name: "Resize Timestamp",
  195 |     exact: true,
  196 |   });
  197 |   const original = (await header.boundingBox())!.width;
  198 |   const box = (await handle.boundingBox())!;
  199 |   await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  200 |   await page.mouse.down();
  201 |   try {
  202 |     await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, {
  203 |       steps: 10,
  204 |     });
  205 |     await expect
  206 |       .poll(async () => (await header.boundingBox())!.width)
  207 |       .toBeGreaterThan(original + 80);
  208 |     await page.keyboard.press("Escape");
  209 |     await expect
  210 |       .poll(async () => (await header.boundingBox())!.width)
  211 |       .toBe(original);
  212 |     await expect(page.locator("body")).not.toHaveClass(/resizing-columns/);
  213 |   } finally {
  214 |     await page.mouse.up();
  215 |   }
  216 |   await handle.press("ArrowRight");
  217 |   await expect
  218 |     .poll(async () => (await header.boundingBox())!.width)
  219 |     .toBe(original + 10);
  220 |   await handle.press("ArrowLeft");
  221 |   await expect
  222 |     .poll(async () => (await header.boundingBox())!.width)
  223 |     .toBe(original);
  224 |   await page.getByLabel("Local filter loaded events").fill("Payment");
  225 |   await expect(page.locator(".log-table-row").first()).toContainText("Payment");
  226 | });
  227 | 
  228 | test("pure modifier keys leave pointer focus quiet while Tab retains its visible focus ring", async () => {
  229 |   const wrap = page.getByRole("button", {
  230 |     name: "Toggle line wrap",
  231 |     exact: true,
  232 |   });
  233 |   await wrap.click();
  234 |   for (const key of ["Shift", "Control"]) {
  235 |     await page.keyboard.press(key);
  236 |     await expect(page.locator("html")).toHaveAttribute(
  237 |       "data-input-modality",
  238 |       "pointer",
  239 |     );
  240 |     const outline = await wrap.evaluate((element) => ({
  241 |       width: getComputedStyle(element).outlineWidth,
  242 |       style: getComputedStyle(element).outlineStyle,
  243 |       visible: element.matches(":focus-visible"),
  244 |       focus: element.matches(":focus"),
  245 |       marker: document.documentElement.getAttribute("data-input-modality"),
  246 |     }));
  247 |     expect(outline, JSON.stringify(outline)).toMatchObject({ style: "none" });
  248 |   }
  249 |   await page.keyboard.press("Tab");
  250 |   await expect(page.locator("html")).toHaveAttribute(
  251 |     "data-input-modality",
  252 |     "keyboard",
  253 |   );
  254 |   const focused = await page.evaluate(() => {
  255 |     const element = document.activeElement!;
  256 |     const style = getComputedStyle(element);
  257 |     return {
  258 |       visible: element.matches(":focus-visible"),
  259 |       width: parseFloat(style.outlineWidth),
  260 |       style: style.outlineStyle,
  261 |     };
  262 |   });
  263 |   expect(focused.visible).toBe(true);
  264 |   expect(focused.style).not.toBe("none");
  265 |   expect(focused.width).toBeGreaterThan(0);
  266 |   await page
  267 |     .locator("label")
  268 |     .filter({ hasText: /^Table$/ })
  269 |     .click();
  270 |   await page.keyboard.press("Shift");
  271 |   const tableLabel = page.locator("label").filter({ hasText: /^Table$/ });
  272 |   expect(
  273 |     await tableLabel.evaluate((element) =>
  274 |       parseFloat(getComputedStyle(element).outlineWidth),
  275 |     ),
> 276 |   ).toBe(0);
      |     ^ Error: expect(received).toBe(expected) // Object.is equality
  277 | });
  278 | 
  279 | test("all view mode labels keep their icon and text on the same line", async () => {
  280 |   const labels = page
  281 |     .locator(".viewer-toolbar label")
  282 |     .filter({ hasText: /^(JSON|Table|Hybrid)$/ });
  283 |   await expect(labels).toHaveCount(3);
  284 |   const geometries = await labels.evaluateAll((elements) =>
  285 |     elements.map((element) => {
  286 |       const icon = element.querySelector("svg")!.getBoundingClientRect();
  287 |       const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  288 |       let node = walker.nextNode();
  289 |       while (node && !node.textContent?.trim()) node = walker.nextNode();
  290 |       const range = document.createRange();
  291 |       range.selectNodeContents(node!);
  292 |       const text = range.getBoundingClientRect();
  293 |       return {
  294 |         delta: Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
  295 |         height: element.getBoundingClientRect().height,
  296 |       };
  297 |     }),
  298 |   );
  299 |   for (const geometry of geometries) {
  300 |     expect(geometry.delta).toBeLessThan(2);
  301 |     expect(geometry.height).toBeLessThan(28);
  302 |   }
  303 | });
  304 | 
  305 | test("expanded hybrid rows retain aligned geometry through horizontal scrolling", async () => {
  306 |   await app.evaluate(({ BrowserWindow }) =>
  307 |     BrowserWindow.getAllWindows()[0].setSize(1000, 800),
  308 |   );
  309 |   await page
  310 |     .locator("label")
  311 |     .filter({ hasText: /^Hybrid$/ })
  312 |     .click();
  313 |   const events = page.locator(".table-event");
  314 |   await page
  315 |     .getByRole("button", { name: "Expand event details" })
  316 |     .nth(1)
  317 |     .click();
  318 |   const detail = page.locator(".hybrid-detail").first();
  319 |   await expect(detail).toBeVisible();
  320 |   await expect(detail.locator(".json-tree")).toBeVisible();
  321 |   await expect
  322 |     .poll(async () => {
  323 |       const expanded = await events.nth(1).boundingBox();
  324 |       const following = await events.nth(2).boundingBox();
  325 |       return following!.y - expanded!.y - expanded!.height;
  326 |     })
  327 |     .toBeGreaterThanOrEqual(-1);
  328 |   const viewport = page.getByRole("region", {
  329 |     name: "Log events",
  330 |     exact: true,
  331 |   });
  332 |   const rect = (await viewport.boundingBox())!;
  333 |   await page.mouse.move(rect.x + rect.width / 2, rect.y + 15);
  334 |   await page.mouse.wheel(420, 0);
  335 |   await expect
  336 |     .poll(() => viewport.evaluate((element) => element.scrollLeft))
  337 |     .toBeGreaterThan(100);
  338 |   const layout = await page.evaluate(() => {
  339 |     const viewport = document
  340 |       .querySelector(".viewer-scroll")!
  341 |       .getBoundingClientRect();
  342 |     const detail = document
  343 |       .querySelector(".hybrid-detail")!
  344 |       .getBoundingClientRect();
  345 |     const header = document
  346 |       .querySelector(".log-header-cell")!
  347 |       .getBoundingClientRect();
  348 |     const cell = document.querySelector(".log-cell")!.getBoundingClientRect();
  349 |     return { viewport, detail, delta: Math.abs(header.x - cell.x) };
  350 |   });
  351 |   expect(layout.delta).toBeLessThan(1);
  352 |   expect(layout.detail.x).toBeGreaterThanOrEqual(layout.viewport.x - 1);
  353 |   expect(layout.detail.right).toBeLessThanOrEqual(layout.viewport.right + 1);
  354 |   await page.getByRole("button", { name: "Collapse event details" }).click();
  355 |   await expect(detail).toHaveCount(0);
  356 | });
  357 | 
```