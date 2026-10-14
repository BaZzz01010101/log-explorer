# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workspace-drop-safety.spec.ts >> top-edge self-drop clones independent permanent tabs and invalid or cancelled drops preserve the workspace
- Location: tests\desktop\workspace-drop-safety.spec.ts:145:5

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 2
Received:   3.0052261352539062
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
            - tab "orders-api" [active] [selected] [ref=e184] [cursor=pointer]
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
        - generic [ref=e222]:
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
                      - radio "Table"
                      - generic [ref=e317] [cursor=pointer]: Table
                    - generic [ref=e323]:
                      - radio "Hybrid" [checked]
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
                    - columnheader [ref=e352]:
                      - button "Timestamp" [ref=e353] [cursor=pointer]
                      - separator "Resize Timestamp" [ref=e358]
                    - columnheader [ref=e359]:
                      - button "Level" [ref=e360] [cursor=pointer]
                      - separator "Resize Level" [ref=e361]
                    - columnheader [ref=e362]:
                      - button "/service/name" [ref=e363] [cursor=pointer]
                      - separator "Resize /service/name" [ref=e364]
                    - columnheader [ref=e365]:
                      - button "Message" [ref=e366] [cursor=pointer]
                      - separator "Resize Message" [ref=e367]
                    - columnheader [ref=e368]:
                      - button "/request/id" [ref=e369] [cursor=pointer]
                      - separator "Resize /request/id" [ref=e370]
                  - generic [ref=e371]:
                    - row [ref=e373]:
                      - button "Expand event details" [ref=e374] [cursor=pointer]
                      - cell [ref=e377]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e378] [cursor=pointer]: Oct 14 16:30:00.000
                      - cell [ref=e379]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e380] [cursor=pointer]:
                          - generic [ref=e381]: unknown
                      - cell [ref=e383]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e384] [cursor=pointer]: —
                      - cell [ref=e385]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e386] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                      - cell [ref=e387]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e388] [cursor=pointer]: —
                    - row [ref=e390]:
                      - button "Expand event details" [ref=e391] [cursor=pointer]
                      - cell [ref=e394]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e395] [cursor=pointer]: Oct 14 16:30:05.000
                      - cell [ref=e396]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e397] [cursor=pointer]:
                          - generic [ref=e398]: info
                      - cell [ref=e400]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e401] [cursor=pointer]: orders-api
                      - cell [ref=e402]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e403] [cursor=pointer]: Request processed
                      - cell [ref=e404]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e405] [cursor=pointer]: req-000001
                    - row [ref=e407]:
                      - button "Expand event details" [ref=e408] [cursor=pointer]
                      - cell [ref=e411]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e412] [cursor=pointer]: Oct 14 16:30:10.000
                      - cell [ref=e413]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e414] [cursor=pointer]:
                          - generic [ref=e415]: debug
                      - cell [ref=e417]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e418] [cursor=pointer]: orders-api
                      - cell [ref=e419]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e420] [cursor=pointer]: Request processed
                      - cell [ref=e421]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e422] [cursor=pointer]: req-000002
                    - row [ref=e424]:
                      - button "Expand event details" [ref=e425] [cursor=pointer]
                      - cell [ref=e428]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e429] [cursor=pointer]: Oct 14 16:30:15.000
                      - cell [ref=e430]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e431] [cursor=pointer]:
                          - generic [ref=e432]: warn
                      - cell [ref=e434]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e435] [cursor=pointer]: orders-api
                      - cell [ref=e436]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e437] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e438]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e439] [cursor=pointer]: req-000003
                    - row [ref=e441]:
                      - button "Expand event details" [ref=e442] [cursor=pointer]
                      - cell [ref=e445]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e446] [cursor=pointer]: Oct 14 16:30:20.000
                      - cell [ref=e447]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e448] [cursor=pointer]:
                          - generic [ref=e449]: info
                      - cell [ref=e451]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e452] [cursor=pointer]: orders-api
                      - cell [ref=e453]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e454] [cursor=pointer]: Request processed
                      - cell [ref=e455]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e456] [cursor=pointer]: req-000004
                    - row [ref=e458]:
                      - button "Expand event details" [ref=e459] [cursor=pointer]
                      - cell [ref=e462]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e463] [cursor=pointer]: Oct 14 16:30:25.000
                      - cell [ref=e464]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e465] [cursor=pointer]:
                          - generic [ref=e466]: error
                      - cell [ref=e468]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e469] [cursor=pointer]: orders-api
                      - cell [ref=e470]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e471] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e472]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e473] [cursor=pointer]: req-000005
                    - row [ref=e475]:
                      - button "Expand event details" [ref=e476] [cursor=pointer]
                      - cell [ref=e479]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e480] [cursor=pointer]: Oct 14 16:30:30.000
                      - cell [ref=e481]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e482] [cursor=pointer]:
                          - generic [ref=e483]: info
                      - cell [ref=e485]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e486] [cursor=pointer]: orders-api
                      - cell [ref=e487]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e488] [cursor=pointer]: Request processed
                      - cell [ref=e489]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e490] [cursor=pointer]: req-000006
                    - row [ref=e492]:
                      - button "Expand event details" [ref=e493] [cursor=pointer]
                      - cell [ref=e496]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e497] [cursor=pointer]: Oct 14 16:30:35.000
                      - cell [ref=e498]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e499] [cursor=pointer]:
                          - generic [ref=e500]: info
                      - cell [ref=e502]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e503] [cursor=pointer]: orders-api
                      - cell [ref=e504]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e505] [cursor=pointer]: Request processed
                      - cell [ref=e506]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e507] [cursor=pointer]: req-000007
                    - row [ref=e509]:
                      - button "Expand event details" [ref=e510] [cursor=pointer]
                      - cell [ref=e513]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e514] [cursor=pointer]: Oct 14 16:30:40.000
                      - cell [ref=e515]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e516] [cursor=pointer]:
                          - generic [ref=e517]: debug
                      - cell [ref=e519]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e520] [cursor=pointer]: orders-api
                      - cell [ref=e521]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e522] [cursor=pointer]: Request processed
                      - cell [ref=e523]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e524] [cursor=pointer]: req-000008
                    - row [ref=e526]:
                      - button "Expand event details" [ref=e527] [cursor=pointer]
                      - cell [ref=e530]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e531] [cursor=pointer]: Oct 14 16:30:45.000
                      - cell [ref=e532]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e533] [cursor=pointer]:
                          - generic [ref=e534]: warn
                      - cell [ref=e536]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e537] [cursor=pointer]: orders-api
                      - cell [ref=e538]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e539] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e540]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e541] [cursor=pointer]: req-000009
                    - row [ref=e543]:
                      - button "Expand event details" [ref=e544] [cursor=pointer]
                      - cell [ref=e547]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e548] [cursor=pointer]: Oct 14 16:30:50.000
                      - cell [ref=e549]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e550] [cursor=pointer]:
                          - generic [ref=e551]: info
                      - cell [ref=e553]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e554] [cursor=pointer]: orders-api
                      - cell [ref=e555]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e556] [cursor=pointer]: Request processed
                      - cell [ref=e557]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e558] [cursor=pointer]: req-00000a
                    - row [ref=e560]:
                      - button "Expand event details" [ref=e561] [cursor=pointer]
                      - cell [ref=e564]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e565] [cursor=pointer]: Oct 14 16:30:55.000
                      - cell [ref=e566]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e567] [cursor=pointer]:
                          - generic [ref=e568]: error
                      - cell [ref=e570]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e571] [cursor=pointer]: orders-api
                      - cell [ref=e572]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e573] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e574]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e575] [cursor=pointer]: req-00000b
                    - row [ref=e577]:
                      - button "Expand event details" [ref=e578] [cursor=pointer]
                      - cell [ref=e581]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e582] [cursor=pointer]: Oct 14 16:31:00.000
                      - cell [ref=e583]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e584] [cursor=pointer]:
                          - generic [ref=e585]: info
                      - cell [ref=e587]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e588] [cursor=pointer]: orders-api
                      - cell [ref=e589]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e590] [cursor=pointer]: Request processed
                      - cell [ref=e591]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e592] [cursor=pointer]: req-00000c
                    - row [ref=e594]:
                      - button "Expand event details" [ref=e595] [cursor=pointer]
                      - cell [ref=e598]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e599] [cursor=pointer]: Oct 14 16:31:05.000
                      - cell [ref=e600]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e601] [cursor=pointer]:
                          - generic [ref=e602]: info
                      - cell [ref=e604]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e605] [cursor=pointer]: orders-api
                      - cell [ref=e606]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e607] [cursor=pointer]: Request processed
                      - cell [ref=e608]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e609] [cursor=pointer]: req-00000d
                    - row [ref=e611]:
                      - button "Expand event details" [ref=e612] [cursor=pointer]
                      - cell [ref=e615]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e616] [cursor=pointer]: Oct 14 16:31:10.000
                      - cell [ref=e617]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e618] [cursor=pointer]:
                          - generic [ref=e619]: debug
                      - cell [ref=e621]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e622] [cursor=pointer]: orders-api
                      - cell [ref=e623]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e624] [cursor=pointer]: Request processed
                      - cell [ref=e625]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e626] [cursor=pointer]: req-00000e
                    - row [ref=e628]:
                      - button "Expand event details" [ref=e629] [cursor=pointer]
                      - cell [ref=e632]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e633] [cursor=pointer]: Oct 14 16:31:15.000
                      - cell [ref=e634]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e635] [cursor=pointer]:
                          - generic [ref=e636]: warn
                      - cell [ref=e638]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e639] [cursor=pointer]: orders-api
                      - cell [ref=e640]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e641] [cursor=pointer]: Retrying upstream request
                      - cell [ref=e642]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e643] [cursor=pointer]: req-00000f
                    - row [ref=e645]:
                      - button "Expand event details" [ref=e646] [cursor=pointer]
                      - cell [ref=e649]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e650] [cursor=pointer]: Oct 14 16:31:20.000
                      - cell [ref=e651]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e652] [cursor=pointer]:
                          - generic [ref=e653]: info
                      - cell [ref=e655]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e656] [cursor=pointer]: orders-api
                      - cell [ref=e657]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e658] [cursor=pointer]: Request processed
                      - cell [ref=e659]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e660] [cursor=pointer]: req-000010
                    - row [ref=e662]:
                      - button "Expand event details" [ref=e663] [cursor=pointer]
                      - cell [ref=e666]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e667] [cursor=pointer]: Oct 14 16:31:25.000
                      - cell [ref=e668]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e669] [cursor=pointer]:
                          - generic [ref=e670]: error
                      - cell [ref=e672]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e673] [cursor=pointer]: orders-api
                      - cell [ref=e674]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e675] [cursor=pointer]: Payment provider timed out
                      - cell [ref=e676]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e677] [cursor=pointer]: req-000011
                    - row [ref=e679]:
                      - button "Expand event details" [ref=e680] [cursor=pointer]
                      - cell [ref=e683]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e684] [cursor=pointer]: Oct 14 16:31:30.000
                      - cell [ref=e685]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e686] [cursor=pointer]:
                          - generic [ref=e687]: info
                      - cell [ref=e689]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e690] [cursor=pointer]: orders-api
                      - cell [ref=e691]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e692] [cursor=pointer]: Request processed
                      - cell [ref=e693]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e694] [cursor=pointer]: req-000012
                    - row [ref=e696]:
                      - button "Expand event details" [ref=e697] [cursor=pointer]
                      - cell [ref=e700]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e701] [cursor=pointer]: Oct 14 16:31:35.000
                      - cell [ref=e702]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e703] [cursor=pointer]:
                          - generic [ref=e704]: info
                      - cell [ref=e706]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e707] [cursor=pointer]: orders-api
                      - cell [ref=e708]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e709] [cursor=pointer]: Request processed
                      - cell [ref=e710]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e711] [cursor=pointer]: req-000013
                    - row [ref=e713]:
                      - button "Expand event details" [ref=e714] [cursor=pointer]
                      - cell [ref=e717]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e718] [cursor=pointer]: Oct 14 16:31:40.000
                      - cell [ref=e719]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e720] [cursor=pointer]:
                          - generic [ref=e721]: debug
                      - cell [ref=e723]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e724] [cursor=pointer]: orders-api
                      - cell [ref=e725]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e726] [cursor=pointer]: Request processed
                      - cell [ref=e727]:
                        - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e728] [cursor=pointer]: req-000014
                - generic [ref=e729]:
                  - generic [ref=e730]: Expand a row for JSON · Click a cell to inspect
                  - generic [ref=e731]: Export covers this loaded selection
              - status [ref=e732]:
                - generic [ref=e733]:
                  - paragraph [ref=e735]: complete · 540 loaded
                  - paragraph [ref=e736]: 540 scanned
                  - paragraph [ref=e737]: 0.0s
          - generic [aria-hidden]: Split top
        - status [ref=e738]: Draggable item tab:tab-orders was moved over droppable area pane-panel:pane-1.
    - contentinfo [ref=e739]:
      - generic [ref=e740]:
        - paragraph [ref=e742]: Isolated local development
        - paragraph [ref=e743]: 1 tabs · 1 panes
      - generic [ref=e744]:
        - paragraph [ref=e745]: Saved locally
        - paragraph [ref=e746]: v0.1.2
  - generic [ref=e747]: orders-api
```

# Test source

```ts
  56  |   });
  57  |   child = app.process();
  58  |   page = await app.firstWindow();
  59  |   const session = await page.context().newCDPSession(page);
  60  |   await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  61  |   page.on("pageerror", (error) => errors.push(error.message));
  62  |   expect(
  63  |     (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  64  |   ).toBe(false);
  65  |   expect(
  66  |     await app.evaluate(({ BrowserWindow }) =>
  67  |       BrowserWindow.getAllWindows()[0].isVisible(),
  68  |     ),
  69  |   ).toBe(false);
  70  |   await app.evaluate(({ dialog }) => {
  71  |     dialog.showMessageBox = async () => {
  72  |       throw new Error(
  73  |         "Unexpected native dialog during hidden drop verification",
  74  |       );
  75  |     };
  76  |   });
  77  |   await expect(page.locator(".query-status")).toContainText("complete");
  78  | });
  79  | 
  80  | async function closeNaturally() {
  81  |   const closed = app.waitForEvent("close", { timeout: 10000 });
  82  |   const exited = new Promise<number | null>((resolveExit) =>
  83  |     child.once("exit", resolveExit),
  84  |   );
  85  |   await app.evaluate(({ BrowserWindow }) =>
  86  |     BrowserWindow.getAllWindows()[0].close(),
  87  |   );
  88  |   await closed;
  89  |   expect(await exited).toBe(0);
  90  | }
  91  | 
  92  | test.afterEach(async () => {
  93  |   if (child?.exitCode === null) {
  94  |     await Promise.race([
  95  |       app.close().catch(() => {}),
  96  |       new Promise((resolveDelay) => setTimeout(resolveDelay, 4000)),
  97  |     ]);
  98  |     if (child.exitCode === null) {
  99  |       if (process.platform === "win32") {
  100 |         try {
  101 |           execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
  102 |             stdio: "ignore",
  103 |           });
  104 |         } catch {}
  105 |       } else child.kill();
  106 |     }
  107 |   }
  108 |   if (
  109 |     !resolve(directory).startsWith(
  110 |       resolve(tmpdir()) + sep + "aws-log-explorer-drop-safety-",
  111 |     )
  112 |   )
  113 |     throw new Error("Unsafe drop verification cleanup path");
  114 |   await rm(directory, {
  115 |     recursive: true,
  116 |     force: true,
  117 |     maxRetries: 10,
  118 |     retryDelay: 100,
  119 |   });
  120 |   expect(errors).toEqual([]);
  121 | });
  122 | 
  123 | async function startDrag(tab: Locator, target: { x: number; y: number }) {
  124 |   const from = (await tab.boundingBox())!;
  125 |   await page.mouse.move(from.x + 30, from.y + from.height / 2);
  126 |   await page.mouse.down();
  127 |   await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
  128 |   await page.mouse.move(target.x, target.y, { steps: 5 });
  129 | }
  130 | 
  131 | async function snapshot() {
  132 |   return page.evaluate(() => ({
  133 |     tabs: [...document.querySelectorAll<HTMLElement>("[data-tab-id]")].map(
  134 |       (element) => element.dataset.tabId,
  135 |     ),
  136 |     panes: [
  137 |       ...document.querySelectorAll<HTMLElement>("[data-pane-drop-target]"),
  138 |     ].map((element) => element.dataset.paneDropTarget),
  139 |     labels: [...document.querySelectorAll(".pane-heading")].map(
  140 |       (element) => element.textContent,
  141 |     ),
  142 |   }));
  143 | }
  144 | 
  145 | test("top-edge self-drop clones independent permanent tabs and invalid or cancelled drops preserve the workspace", async () => {
  146 |   await expect(page.locator(".workspace-tab")).toHaveCount(1);
  147 |   const panel = (await page.locator("[data-pane-drop-target]").boundingBox())!;
  148 |   await startDrag(page.getByRole("tab", { name: "orders-api", exact: true }), {
  149 |     x: panel.x + panel.width / 2,
  150 |     y: panel.y + 45,
  151 |   });
  152 |   const overlay = page.locator('[data-split-preview="top"]');
  153 |   await expect(overlay).toBeVisible();
  154 |   await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  155 |   const shown = (await overlay.boundingBox())!;
> 156 |   expect(Math.abs(shown.height - (panel.height - 6) / 2)).toBeLessThan(2);
      |                                                           ^ Error: expect(received).toBeLessThan(expected)
  157 |   await page.mouse.up();
  158 |   await expect(
  159 |     page.locator(".workspace-drag-preview,.pane-drop-overlay"),
  160 |   ).toHaveCount(0);
  161 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  162 |   await expect(page.locator(".workspace-tab")).toHaveCount(2);
  163 |   await expect(page.locator(".workspace-tab.is-preview")).toHaveCount(0);
  164 |   const panes = page.locator(".workspace-pane");
  165 |   const first = (await panes.nth(0).boundingBox())!;
  166 |   const second = (await panes.nth(1).boundingBox())!;
  167 |   expect(first.y).toBeLessThan(second.y);
  168 |   expect(Math.abs(first.x - second.x)).toBeLessThan(2);
  169 |   expect(Math.abs(first.width - second.width)).toBeLessThan(2);
  170 |   await expect(
  171 |     page.getByLabel("Add split pane", { exact: true }),
  172 |   ).toHaveAttribute("data-split-axis", "horizontal");
  173 |   await panes.nth(0).getByLabel("Local filter loaded events").fill("Payment");
  174 |   await expect(
  175 |     panes.nth(0).getByLabel("Local filter loaded events"),
  176 |   ).toHaveValue("Payment");
  177 |   await expect(
  178 |     panes.nth(1).getByLabel("Local filter loaded events"),
  179 |   ).toHaveValue("");
  180 | 
  181 |   const before = await snapshot();
  182 |   await startDrag(
  183 |     page.getByRole("tab", { name: "orders-api", exact: true }).first(),
  184 |     { x: -35, y: -35 },
  185 |   );
  186 |   await expect(page.locator(".pane-drop-overlay")).toHaveCount(0);
  187 |   await page.mouse.up();
  188 |   await expect(
  189 |     page.locator(
  190 |       ".workspace-drag-preview,.pane-drop-overlay,.workspace-tab.is-dragging",
  191 |     ),
  192 |   ).toHaveCount(0);
  193 |   expect(await snapshot()).toEqual(before);
  194 | 
  195 |   const target = (await page
  196 |     .locator("[data-pane-drop-target]")
  197 |     .first()
  198 |     .boundingBox())!;
  199 |   await startDrag(
  200 |     page.getByRole("tab", { name: "orders-api", exact: true }).first(),
  201 |     { x: target.x + target.width / 2, y: target.y + 45 },
  202 |   );
  203 |   await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  204 |   await expect(page.locator(".pane-drop-overlay")).toBeVisible();
  205 |   await page.keyboard.press("Escape");
  206 |   await page.mouse.up();
  207 |   await expect(
  208 |     page.locator(
  209 |       ".workspace-drag-preview,.pane-drop-overlay,.workspace-tab.is-dragging",
  210 |     ),
  211 |   ).toHaveCount(0);
  212 |   expect(await snapshot()).toEqual(before);
  213 |   await closeNaturally();
  214 |   const saved = JSON.parse(
  215 |     await readFile(join(directory, "workspace.json"), "utf8"),
  216 |   );
  217 |   expect(saved.tabs).toHaveLength(2);
  218 |   expect(new Set(saved.tabs.map((tab: { id: string }) => tab.id)).size).toBe(2);
  219 |   expect(saved.tabs.every((tab: { preview?: boolean }) => !tab.preview)).toBe(
  220 |     true,
  221 |   );
  222 |   expect(
  223 |     saved.tabs
  224 |       .map((tab: { view: { localSearch: string } }) => tab.view.localSearch)
  225 |       .sort(),
  226 |   ).toEqual(["", "Payment"]);
  227 | });
  228 | 
  229 | test("a full four-pane workspace refuses a fifth split without adding tabs", async () => {
  230 |   const add = page.getByLabel("Add split pane", { exact: true });
  231 |   await add.click();
  232 |   await add.click();
  233 |   await add.click();
  234 |   await expect(page.locator(".workspace-pane")).toHaveCount(4);
  235 |   await expect(page.locator(".workspace-tab")).toHaveCount(4);
  236 |   await expect(add).toBeDisabled();
  237 |   const before = await snapshot();
  238 |   const target = (await page
  239 |     .locator("[data-pane-drop-target]")
  240 |     .first()
  241 |     .boundingBox())!;
  242 |   await startDrag(
  243 |     page.getByRole("tab", { name: "orders-api", exact: true }).first(),
  244 |     { x: target.x + 20, y: target.y + target.height / 2 },
  245 |   );
  246 |   await expect(page.locator(".pane-drop-overlay")).toBeVisible();
  247 |   await expect(page.locator('[data-split-preview="left"]')).toHaveCount(0);
  248 |   await page.mouse.up();
  249 |   await expect(page.locator(".workspace-pane")).toHaveCount(4);
  250 |   await expect(page.locator(".workspace-tab")).toHaveCount(4);
  251 |   expect(await snapshot()).toEqual(before);
  252 |   await closeNaturally();
  253 | });
  254 | 
```