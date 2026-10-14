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
                  - radio "Table"
                  - generic [ref=e317] [cursor=pointer]: Table
                - generic [ref=e323]:
                  - radio "Hybrid" [checked]
                  - generic [ref=e324] [cursor=pointer]: Hybrid
              - button "Configure columns" [ref=e330] [cursor=pointer]
              - button "Toggle line wrap" [active] [ref=e334] [cursor=pointer]
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e378] [cursor=pointer]: Oct 14 16:17:00.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e395] [cursor=pointer]: Oct 14 16:17:05.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e412] [cursor=pointer]: Oct 14 16:17:10.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e429] [cursor=pointer]: Oct 14 16:17:15.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e446] [cursor=pointer]: Oct 14 16:17:20.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e463] [cursor=pointer]: Oct 14 16:17:25.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e480] [cursor=pointer]: Oct 14 16:17:30.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e497] [cursor=pointer]: Oct 14 16:17:35.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e514] [cursor=pointer]: Oct 14 16:17:40.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e531] [cursor=pointer]: Oct 14 16:17:45.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e548] [cursor=pointer]: Oct 14 16:17:50.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e565] [cursor=pointer]: Oct 14 16:17:55.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e582] [cursor=pointer]: Oct 14 16:18:00.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e599] [cursor=pointer]: Oct 14 16:18:05.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e616] [cursor=pointer]: Oct 14 16:18:10.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e633] [cursor=pointer]: Oct 14 16:18:15.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e650] [cursor=pointer]: Oct 14 16:18:20.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e667] [cursor=pointer]: Oct 14 16:18:25.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e684] [cursor=pointer]: Oct 14 16:18:30.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e701] [cursor=pointer]: Oct 14 16:18:35.000
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
                    - button "Inspect event fixture:/aws/lambda/orders-api:20" [ref=e718] [cursor=pointer]: Oct 14 16:18:40.000
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
      - status [ref=e738]
  - contentinfo [ref=e739]:
    - generic [ref=e740]:
      - paragraph [ref=e742]: Isolated local development
      - paragraph [ref=e743]: 1 tabs · 1 panes
    - generic [ref=e744]:
      - paragraph [ref=e745]: Saved locally
      - paragraph [ref=e746]: v0.1.1
```

# Test source

```ts
  143 |     expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
  144 |       "",
  145 |     );
  146 |     await expect(handle).toHaveAttribute(
  147 |       "aria-valuenow",
  148 |       String(Math.round(original.width + 90)),
  149 |     );
  150 |   } finally {
  151 |     await page.mouse.up();
  152 |   }
  153 |   await expect(page.locator("body")).not.toHaveClass(/resizing-columns/);
  154 |   expect(
  155 |     await page.evaluate(
  156 |       () => (window as unknown as { nativeDrags: number }).nativeDrags,
  157 |     ),
  158 |   ).toBe(0);
  159 |   const resized = (await header.boundingBox())!.width;
  160 |   const next = (await handle.boundingBox())!;
  161 |   await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  162 |   await page.mouse.down();
  163 |   await page.mouse.move(
  164 |     next.x + next.width / 2 - 45,
  165 |     next.y + next.height / 2,
  166 |     { steps: 6 },
  167 |   );
  168 |   await page.mouse.up();
  169 |   await expect
  170 |     .poll(async () => (await header.boundingBox())!.width)
  171 |     .toBeLessThan(resized - 35);
  172 |   await page.getByLabel("Local filter loaded events").fill("Payment");
  173 |   await expect(page.locator(".log-table-row").first()).toContainText("Payment");
  174 |   const savedWidth = Math.round((await header.boundingBox())!.width);
  175 |   await expect
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
  240 |     const outline = await wrap.evaluate(
  241 |       (element) => getComputedStyle(element).outlineWidth,
  242 |     );
> 243 |     expect(parseFloat(outline)).toBe(0);
      |                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  244 |   }
  245 |   await page.keyboard.press("Tab");
  246 |   await expect(page.locator("html")).toHaveAttribute(
  247 |     "data-input-modality",
  248 |     "keyboard",
  249 |   );
  250 |   const focused = await page.evaluate(() => {
  251 |     const element = document.activeElement!;
  252 |     const style = getComputedStyle(element);
  253 |     return {
  254 |       visible: element.matches(":focus-visible"),
  255 |       width: parseFloat(style.outlineWidth),
  256 |       style: style.outlineStyle,
  257 |     };
  258 |   });
  259 |   expect(focused.visible).toBe(true);
  260 |   expect(focused.style).not.toBe("none");
  261 |   expect(focused.width).toBeGreaterThan(0);
  262 |   await page
  263 |     .locator("label")
  264 |     .filter({ hasText: /^Table$/ })
  265 |     .click();
  266 |   await page.keyboard.press("Shift");
  267 |   const tableLabel = page.locator("label").filter({ hasText: /^Table$/ });
  268 |   expect(
  269 |     await tableLabel.evaluate((element) =>
  270 |       parseFloat(getComputedStyle(element).outlineWidth),
  271 |     ),
  272 |   ).toBe(0);
  273 | });
  274 | 
  275 | test("all view mode labels keep their icon and text on the same line", async () => {
  276 |   const labels = page
  277 |     .locator(".viewer-toolbar label")
  278 |     .filter({ hasText: /^(JSON|Table|Hybrid)$/ });
  279 |   await expect(labels).toHaveCount(3);
  280 |   const geometries = await labels.evaluateAll((elements) =>
  281 |     elements.map((element) => {
  282 |       const icon = element.querySelector("svg")!.getBoundingClientRect();
  283 |       const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  284 |       let node = walker.nextNode();
  285 |       while (node && !node.textContent?.trim()) node = walker.nextNode();
  286 |       const range = document.createRange();
  287 |       range.selectNodeContents(node!);
  288 |       const text = range.getBoundingClientRect();
  289 |       return {
  290 |         delta: Math.abs(icon.y + icon.height / 2 - text.y - text.height / 2),
  291 |         height: element.getBoundingClientRect().height,
  292 |       };
  293 |     }),
  294 |   );
  295 |   for (const geometry of geometries) {
  296 |     expect(geometry.delta).toBeLessThan(2);
  297 |     expect(geometry.height).toBeLessThan(25);
  298 |   }
  299 | });
  300 | 
  301 | test("expanded hybrid rows retain aligned geometry through horizontal scrolling", async () => {
  302 |   await app.evaluate(({ BrowserWindow }) =>
  303 |     BrowserWindow.getAllWindows()[0].setSize(1000, 800),
  304 |   );
  305 |   await page
  306 |     .locator("label")
  307 |     .filter({ hasText: /^Hybrid$/ })
  308 |     .click();
  309 |   const events = page.locator(".table-event");
  310 |   await page
  311 |     .getByRole("button", { name: "Expand event details" })
  312 |     .nth(1)
  313 |     .click();
  314 |   const detail = page.locator(".hybrid-detail").first();
  315 |   await expect(detail).toBeVisible();
  316 |   await expect(detail.locator(".json-tree")).toBeVisible();
  317 |   await expect
  318 |     .poll(async () => {
  319 |       const expanded = await events.nth(1).boundingBox();
  320 |       const following = await events.nth(2).boundingBox();
  321 |       return following!.y - expanded!.y - expanded!.height;
  322 |     })
  323 |     .toBeGreaterThanOrEqual(-1);
  324 |   const viewport = page.getByRole("region", {
  325 |     name: "Log events",
  326 |     exact: true,
  327 |   });
  328 |   const rect = (await viewport.boundingBox())!;
  329 |   await page.mouse.move(rect.x + rect.width / 2, rect.y + 15);
  330 |   await page.mouse.wheel(420, 0);
  331 |   await expect
  332 |     .poll(() => viewport.evaluate((element) => element.scrollLeft))
  333 |     .toBeGreaterThan(100);
  334 |   const layout = await page.evaluate(() => {
  335 |     const viewport = document
  336 |       .querySelector(".viewer-scroll")!
  337 |       .getBoundingClientRect();
  338 |     const detail = document
  339 |       .querySelector(".hybrid-detail")!
  340 |       .getBoundingClientRect();
  341 |     const header = document
  342 |       .querySelector(".log-header-cell")!
  343 |       .getBoundingClientRect();
```