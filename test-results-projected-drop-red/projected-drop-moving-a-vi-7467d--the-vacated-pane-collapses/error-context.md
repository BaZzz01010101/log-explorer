# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: projected-drop.spec.ts >> moving a visible tab previews its final rectangle after the vacated pane collapses
- Location: tests\desktop\projected-drop.spec.ts:109:5

# Error details

```
Error: {"projected":{"x":616,"y":139.2604217529297,"width":288,"height":752.0729522705078},"actual":{"x":910,"y":139.2604217529297,"width":576,"height":752.0729522705078},"key":"x"}

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    294
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
          - tab "orders-api" [active] [selected] [ref=e186] [cursor=pointer]
          - button "Close orders-api" [ref=e191] [cursor=pointer]
          - tab "payments-worker" [ref=e195] [cursor=pointer]
          - button "Close payments-worker" [ref=e200] [cursor=pointer]
        - generic [ref=e204]:
          - button "New log view" [ref=e205] [cursor=pointer]
          - button "Add split pane" [ref=e208] [cursor=pointer]
          - button "Workspace tab menu" [ref=e212] [cursor=pointer]
      - generic "Split panes" [ref=e217]:
        - generic [ref=e218]: PANES
        - generic [ref=e219]:
          - button "Reorder pane 1" [ref=e220]
          - button "1 payments-worker" [ref=e228] [cursor=pointer]:
            - generic [ref=e229]: "1"
            - generic [ref=e230]: payments-worker
          - button "Close pane 1" [ref=e231] [cursor=pointer]
        - generic [ref=e235]:
          - button "Reorder pane 2" [ref=e236]
          - button "2 orders-api" [pressed] [ref=e244] [cursor=pointer]:
            - generic [ref=e245]: "2"
            - generic [ref=e246]: orders-api
          - button "Close pane 2" [ref=e247] [cursor=pointer]
      - generic [ref=e252]:
        - region "Pane 1" [ref=e256]:
          - generic [ref=e257]:
            - generic [ref=e258]:
              - generic [ref=e259]: "1"
              - paragraph [ref=e261]: payments-worker
              - paragraph [ref=e264]: eu-west-1
            - generic [ref=e265]:
              - button "Split pane" [ref=e266] [cursor=pointer]
              - button "Close pane 1" [ref=e270] [cursor=pointer]
          - tabpanel "payments-worker" [ref=e275]:
            - generic [ref=e276]:
              - generic [ref=e277]:
                - generic [ref=e278]:
                  - radiogroup "Server query type" [ref=e279]:
                    - generic [ref=e281]:
                      - radio "Events" [checked]
                      - generic [ref=e282] [cursor=pointer]: Events
                    - generic [ref=e283]:
                      - radio "Insights"
                      - generic [ref=e284] [cursor=pointer]: Insights
                  - button "1 source" [ref=e285] [cursor=pointer]
                - generic [ref=e291]:
                  - combobox "Time range" [ref=e298] [cursor=pointer]: Last hour
                  - button "Saved queries and presets" [ref=e299] [cursor=pointer]
              - generic [ref=e303]:
                - generic [ref=e306]:
                  - generic [ref=e307]: SERVER
                  - textbox "CloudWatch filter pattern" [ref=e310]:
                    - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                - generic [ref=e311]:
                  - button "Run" [ref=e312] [cursor=pointer]
                  - button "Live" [ref=e318] [cursor=pointer]
              - generic [ref=e324]:
                - paragraph [ref=e325]: CloudWatch pattern • server-side selection • limited fixture interpreter
                - paragraph [ref=e326]: Control+Enter
            - generic [ref=e328]:
              - generic [ref=e329]:
                - textbox "Local filter loaded events" [ref=e336]:
                  - /placeholder: Search loaded events…
                - combobox "Local level filter" [ref=e339] [cursor=pointer]: All levels
                - button "Local filtering help" [ref=e340] [cursor=pointer]
                - radiogroup "Event view mode" [ref=e344]:
                  - generic [ref=e346]:
                    - radio "JSON"
                    - generic [ref=e347] [cursor=pointer]: JSON
                  - generic [ref=e354]:
                    - radio "Table"
                    - generic [ref=e355] [cursor=pointer]: Table
                  - generic [ref=e361]:
                    - radio "Hybrid" [checked]
                    - generic [ref=e362] [cursor=pointer]: Hybrid
                - button "Configure columns" [ref=e368] [cursor=pointer]
                - button "Toggle line wrap" [ref=e372] [cursor=pointer]
                - button "Export loaded filtered events" [ref=e376] [cursor=pointer]:
                  - generic [ref=e377]: Export
              - generic [ref=e383]:
                - generic [ref=e384]: LOCAL · 540 / 540 loaded events
                - generic [ref=e386]: 511 JSON · Local time
              - region "Log events" [ref=e387]:
                - row [ref=e388]:
                  - columnheader [ref=e390]:
                    - button "Timestamp" [ref=e391] [cursor=pointer]
                    - separator "Resize Timestamp" [ref=e396]
                  - columnheader [ref=e397]:
                    - button "Level" [ref=e398] [cursor=pointer]
                    - separator "Resize Level" [ref=e399]
                  - columnheader [ref=e400]:
                    - button "/service/name" [ref=e401] [cursor=pointer]
                    - separator "Resize /service/name" [ref=e402]
                  - columnheader [ref=e403]:
                    - button "Message" [ref=e404] [cursor=pointer]
                    - separator "Resize Message" [ref=e405]
                  - columnheader [ref=e406]:
                    - button "/request/id" [ref=e407] [cursor=pointer]
                    - separator "Resize /request/id" [ref=e408]
                - generic [ref=e409]:
                  - row [ref=e411]:
                    - button "Expand event details" [ref=e412] [cursor=pointer]
                    - cell [ref=e415]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e416] [cursor=pointer]: Oct 14 16:28:00.000
                    - cell [ref=e417]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e418] [cursor=pointer]:
                        - generic [ref=e419]: unknown
                    - cell [ref=e421]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e422] [cursor=pointer]: —
                    - cell [ref=e423]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e424] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                    - cell [ref=e425]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:0" [ref=e426] [cursor=pointer]: —
                  - row [ref=e428]:
                    - button "Expand event details" [ref=e429] [cursor=pointer]
                    - cell [ref=e432]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e433] [cursor=pointer]: Oct 14 16:28:05.000
                    - cell [ref=e434]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e435] [cursor=pointer]:
                        - generic [ref=e436]: info
                    - cell [ref=e438]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e439] [cursor=pointer]: payments-worker
                    - cell [ref=e440]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e441] [cursor=pointer]: Request processed
                    - cell [ref=e442]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:1" [ref=e443] [cursor=pointer]: req-000001
                  - row [ref=e445]:
                    - button "Expand event details" [ref=e446] [cursor=pointer]
                    - cell [ref=e449]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e450] [cursor=pointer]: Oct 14 16:28:10.000
                    - cell [ref=e451]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e452] [cursor=pointer]:
                        - generic [ref=e453]: debug
                    - cell [ref=e455]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e456] [cursor=pointer]: payments-worker
                    - cell [ref=e457]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e458] [cursor=pointer]: Request processed
                    - cell [ref=e459]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:2" [ref=e460] [cursor=pointer]: req-000002
                  - row [ref=e462]:
                    - button "Expand event details" [ref=e463] [cursor=pointer]
                    - cell [ref=e466]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e467] [cursor=pointer]: Oct 14 16:28:15.000
                    - cell [ref=e468]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e469] [cursor=pointer]:
                        - generic [ref=e470]: warn
                    - cell [ref=e472]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e473] [cursor=pointer]: payments-worker
                    - cell [ref=e474]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e475] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e476]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:3" [ref=e477] [cursor=pointer]: req-000003
                  - row [ref=e479]:
                    - button "Expand event details" [ref=e480] [cursor=pointer]
                    - cell [ref=e483]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e484] [cursor=pointer]: Oct 14 16:28:20.000
                    - cell [ref=e485]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e486] [cursor=pointer]:
                        - generic [ref=e487]: info
                    - cell [ref=e489]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e490] [cursor=pointer]: payments-worker
                    - cell [ref=e491]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e492] [cursor=pointer]: Request processed
                    - cell [ref=e493]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:4" [ref=e494] [cursor=pointer]: req-000004
                  - row [ref=e496]:
                    - button "Expand event details" [ref=e497] [cursor=pointer]
                    - cell [ref=e500]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e501] [cursor=pointer]: Oct 14 16:28:25.000
                    - cell [ref=e502]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e503] [cursor=pointer]:
                        - generic [ref=e504]: error
                    - cell [ref=e506]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e507] [cursor=pointer]: payments-worker
                    - cell [ref=e508]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e509] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e510]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:5" [ref=e511] [cursor=pointer]: req-000005
                  - row [ref=e513]:
                    - button "Expand event details" [ref=e514] [cursor=pointer]
                    - cell [ref=e517]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e518] [cursor=pointer]: Oct 14 16:28:30.000
                    - cell [ref=e519]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e520] [cursor=pointer]:
                        - generic [ref=e521]: info
                    - cell [ref=e523]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e524] [cursor=pointer]: payments-worker
                    - cell [ref=e525]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e526] [cursor=pointer]: Request processed
                    - cell [ref=e527]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:6" [ref=e528] [cursor=pointer]: req-000006
                  - row [ref=e530]:
                    - button "Expand event details" [ref=e531] [cursor=pointer]
                    - cell [ref=e534]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e535] [cursor=pointer]: Oct 14 16:28:35.000
                    - cell [ref=e536]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e537] [cursor=pointer]:
                        - generic [ref=e538]: info
                    - cell [ref=e540]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e541] [cursor=pointer]: payments-worker
                    - cell [ref=e542]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e543] [cursor=pointer]: Request processed
                    - cell [ref=e544]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:7" [ref=e545] [cursor=pointer]: req-000007
                  - row [ref=e547]:
                    - button "Expand event details" [ref=e548] [cursor=pointer]
                    - cell [ref=e551]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e552] [cursor=pointer]: Oct 14 16:28:40.000
                    - cell [ref=e553]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e554] [cursor=pointer]:
                        - generic [ref=e555]: debug
                    - cell [ref=e557]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e558] [cursor=pointer]: payments-worker
                    - cell [ref=e559]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e560] [cursor=pointer]: Request processed
                    - cell [ref=e561]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:8" [ref=e562] [cursor=pointer]: req-000008
                  - row [ref=e564]:
                    - button "Expand event details" [ref=e565] [cursor=pointer]
                    - cell [ref=e568]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:9" [ref=e569] [cursor=pointer]: Oct 14 16:28:45.000
                    - cell [ref=e570]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:9" [ref=e571] [cursor=pointer]:
                        - generic [ref=e572]: warn
                    - cell [ref=e574]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:9" [ref=e575] [cursor=pointer]: payments-worker
                    - cell [ref=e576]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:9" [ref=e577] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e578]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:9" [ref=e579] [cursor=pointer]: req-000009
                  - row [ref=e581]:
                    - button "Expand event details" [ref=e582] [cursor=pointer]
                    - cell [ref=e585]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:10" [ref=e586] [cursor=pointer]: Oct 14 16:28:50.000
                    - cell [ref=e587]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:10" [ref=e588] [cursor=pointer]:
                        - generic [ref=e589]: info
                    - cell [ref=e591]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:10" [ref=e592] [cursor=pointer]: payments-worker
                    - cell [ref=e593]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:10" [ref=e594] [cursor=pointer]: Request processed
                    - cell [ref=e595]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:10" [ref=e596] [cursor=pointer]: req-00000a
                  - row [ref=e598]:
                    - button "Expand event details" [ref=e599] [cursor=pointer]
                    - cell [ref=e602]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:11" [ref=e603] [cursor=pointer]: Oct 14 16:28:55.000
                    - cell [ref=e604]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:11" [ref=e605] [cursor=pointer]:
                        - generic [ref=e606]: error
                    - cell [ref=e608]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:11" [ref=e609] [cursor=pointer]: payments-worker
                    - cell [ref=e610]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:11" [ref=e611] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e612]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:11" [ref=e613] [cursor=pointer]: req-00000b
                  - row [ref=e615]:
                    - button "Expand event details" [ref=e616] [cursor=pointer]
                    - cell [ref=e619]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:12" [ref=e620] [cursor=pointer]: Oct 14 16:29:00.000
                    - cell [ref=e621]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:12" [ref=e622] [cursor=pointer]:
                        - generic [ref=e623]: info
                    - cell [ref=e625]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:12" [ref=e626] [cursor=pointer]: payments-worker
                    - cell [ref=e627]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:12" [ref=e628] [cursor=pointer]: Request processed
                    - cell [ref=e629]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:12" [ref=e630] [cursor=pointer]: req-00000c
                  - row [ref=e632]:
                    - button "Expand event details" [ref=e633] [cursor=pointer]
                    - cell [ref=e636]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:13" [ref=e637] [cursor=pointer]: Oct 14 16:29:05.000
                    - cell [ref=e638]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:13" [ref=e639] [cursor=pointer]:
                        - generic [ref=e640]: info
                    - cell [ref=e642]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:13" [ref=e643] [cursor=pointer]: payments-worker
                    - cell [ref=e644]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:13" [ref=e645] [cursor=pointer]: Request processed
                    - cell [ref=e646]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:13" [ref=e647] [cursor=pointer]: req-00000d
                  - row [ref=e649]:
                    - button "Expand event details" [ref=e650] [cursor=pointer]
                    - cell [ref=e653]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:14" [ref=e654] [cursor=pointer]: Oct 14 16:29:10.000
                    - cell [ref=e655]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:14" [ref=e656] [cursor=pointer]:
                        - generic [ref=e657]: debug
                    - cell [ref=e659]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:14" [ref=e660] [cursor=pointer]: payments-worker
                    - cell [ref=e661]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:14" [ref=e662] [cursor=pointer]: Request processed
                    - cell [ref=e663]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:14" [ref=e664] [cursor=pointer]: req-00000e
                  - row [ref=e666]:
                    - button "Expand event details" [ref=e667] [cursor=pointer]
                    - cell [ref=e670]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:15" [ref=e671] [cursor=pointer]: Oct 14 16:29:15.000
                    - cell [ref=e672]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:15" [ref=e673] [cursor=pointer]:
                        - generic [ref=e674]: warn
                    - cell [ref=e676]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:15" [ref=e677] [cursor=pointer]: payments-worker
                    - cell [ref=e678]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:15" [ref=e679] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e680]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:15" [ref=e681] [cursor=pointer]: req-00000f
                  - row [ref=e683]:
                    - button "Expand event details" [ref=e684] [cursor=pointer]
                    - cell [ref=e687]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:16" [ref=e688] [cursor=pointer]: Oct 14 16:29:20.000
                    - cell [ref=e689]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:16" [ref=e690] [cursor=pointer]:
                        - generic [ref=e691]: info
                    - cell [ref=e693]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:16" [ref=e694] [cursor=pointer]: payments-worker
                    - cell [ref=e695]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:16" [ref=e696] [cursor=pointer]: Request processed
                    - cell [ref=e697]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:16" [ref=e698] [cursor=pointer]: req-000010
                  - row [ref=e700]:
                    - button "Expand event details" [ref=e701] [cursor=pointer]
                    - cell [ref=e704]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:17" [ref=e705] [cursor=pointer]: Oct 14 16:29:25.000
                    - cell [ref=e706]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:17" [ref=e707] [cursor=pointer]:
                        - generic [ref=e708]: error
                    - cell [ref=e710]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:17" [ref=e711] [cursor=pointer]: payments-worker
                    - cell [ref=e712]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:17" [ref=e713] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e714]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:17" [ref=e715] [cursor=pointer]: req-000011
                  - row [ref=e717]:
                    - button "Expand event details" [ref=e718] [cursor=pointer]
                    - cell [ref=e721]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:18" [ref=e722] [cursor=pointer]: Oct 14 16:29:30.000
                    - cell [ref=e723]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:18" [ref=e724] [cursor=pointer]:
                        - generic [ref=e725]: info
                    - cell [ref=e727]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:18" [ref=e728] [cursor=pointer]: payments-worker
                    - cell [ref=e729]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:18" [ref=e730] [cursor=pointer]: Request processed
                    - cell [ref=e731]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:18" [ref=e732] [cursor=pointer]: req-000012
                  - row [ref=e734]:
                    - button "Expand event details" [ref=e735] [cursor=pointer]
                    - cell [ref=e738]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:19" [ref=e739] [cursor=pointer]: Oct 14 16:29:35.000
                    - cell [ref=e740]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:19" [ref=e741] [cursor=pointer]:
                        - generic [ref=e742]: info
                    - cell [ref=e744]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:19" [ref=e745] [cursor=pointer]: payments-worker
                    - cell [ref=e746]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:19" [ref=e747] [cursor=pointer]: Request processed
                    - cell [ref=e748]:
                      - button "Inspect event fixture:/aws/lambda/payments-worker:19" [ref=e749] [cursor=pointer]: req-000013
              - generic [ref=e750]:
                - generic [ref=e751]: Expand a row for JSON · Click a cell to inspect
                - generic [ref=e752]: Export covers this loaded selection
            - status [ref=e753]:
              - generic [ref=e754]:
                - paragraph [ref=e756]: complete · 540 loaded
                - paragraph [ref=e757]: 540 scanned
                - paragraph [ref=e758]: 0.0s
        - separator "Resize panes horizontally" [ref=e759]
        - region "Pane 2" [ref=e763]:
          - generic [ref=e764]:
            - generic [ref=e765]:
              - generic [ref=e766]: "2"
              - paragraph [ref=e768]: orders-api
              - paragraph [ref=e771]: eu-west-1
            - generic [ref=e772]:
              - button "Split pane" [ref=e773] [cursor=pointer]
              - button "Close pane 2" [ref=e777] [cursor=pointer]
          - tabpanel "orders-api" [ref=e782]:
            - generic [ref=e783]:
              - generic [ref=e784]:
                - generic [ref=e785]:
                  - radiogroup "Server query type" [ref=e786]:
                    - generic [ref=e788]:
                      - radio "Events" [checked]
                      - generic [ref=e789] [cursor=pointer]: Events
                    - generic [ref=e790]:
                      - radio "Insights"
                      - generic [ref=e791] [cursor=pointer]: Insights
                  - button "1 source" [ref=e792] [cursor=pointer]
                - generic [ref=e798]:
                  - combobox "Time range" [ref=e805] [cursor=pointer]: Last hour
                  - button "Saved queries and presets" [ref=e806] [cursor=pointer]
              - generic [ref=e810]:
                - generic [ref=e813]:
                  - generic [ref=e814]: SERVER
                  - textbox "CloudWatch filter pattern" [ref=e817]:
                    - /placeholder: "{ $.level = \"error\" } or \"request failed\""
                - generic [ref=e818]:
                  - button "Run" [ref=e819] [cursor=pointer]
                  - button "Live" [ref=e825] [cursor=pointer]
              - generic [ref=e831]:
                - paragraph [ref=e832]: CloudWatch pattern • server-side selection • limited fixture interpreter
                - paragraph [ref=e833]: Control+Enter
            - generic [ref=e835]:
              - generic [ref=e836]:
                - textbox "Local filter loaded events" [ref=e843]:
                  - /placeholder: Search loaded events…
                - combobox "Local level filter" [ref=e846] [cursor=pointer]: All levels
                - button "Local filtering help" [ref=e847] [cursor=pointer]
                - radiogroup "Event view mode" [ref=e851]:
                  - generic [ref=e853]:
                    - radio "JSON"
                    - generic [ref=e854] [cursor=pointer]: JSON
                  - generic [ref=e861]:
                    - radio "Table"
                    - generic [ref=e862] [cursor=pointer]: Table
                  - generic [ref=e868]:
                    - radio "Hybrid" [checked]
                    - generic [ref=e869] [cursor=pointer]: Hybrid
                - button "Configure columns" [ref=e875] [cursor=pointer]
                - button "Toggle line wrap" [ref=e879] [cursor=pointer]
                - button "Export loaded filtered events" [ref=e883] [cursor=pointer]:
                  - generic [ref=e884]: Export
              - generic [ref=e890]:
                - generic [ref=e891]: LOCAL · 540 / 540 loaded events
                - generic [ref=e893]: 511 JSON · Local time
              - region "Log events" [ref=e894]:
                - row [ref=e895]:
                  - columnheader [ref=e897]:
                    - button "Timestamp" [ref=e898] [cursor=pointer]
                    - separator "Resize Timestamp" [ref=e903]
                  - columnheader [ref=e904]:
                    - button "Level" [ref=e905] [cursor=pointer]
                    - separator "Resize Level" [ref=e906]
                  - columnheader [ref=e907]:
                    - button "/service/name" [ref=e908] [cursor=pointer]
                    - separator "Resize /service/name" [ref=e909]
                  - columnheader [ref=e910]:
                    - button "Message" [ref=e911] [cursor=pointer]
                    - separator "Resize Message" [ref=e912]
                  - columnheader [ref=e913]:
                    - button "/request/id" [ref=e914] [cursor=pointer]
                    - separator "Resize /request/id" [ref=e915]
                - generic [ref=e916]:
                  - row [ref=e918]:
                    - button "Expand event details" [ref=e919] [cursor=pointer]
                    - cell [ref=e922]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e923] [cursor=pointer]: Oct 14 16:28:00.000
                    - cell [ref=e924]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e925] [cursor=pointer]:
                        - generic [ref=e926]: unknown
                    - cell [ref=e928]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e929] [cursor=pointer]: —
                    - cell [ref=e930]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e931] [cursor=pointer]: "Unexpected upstream response: { invalid JSON"
                    - cell [ref=e932]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:0" [ref=e933] [cursor=pointer]: —
                  - row [ref=e935]:
                    - button "Expand event details" [ref=e936] [cursor=pointer]
                    - cell [ref=e939]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e940] [cursor=pointer]: Oct 14 16:28:05.000
                    - cell [ref=e941]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e942] [cursor=pointer]:
                        - generic [ref=e943]: info
                    - cell [ref=e945]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e946] [cursor=pointer]: orders-api
                    - cell [ref=e947]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e948] [cursor=pointer]: Request processed
                    - cell [ref=e949]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:1" [ref=e950] [cursor=pointer]: req-000001
                  - row [ref=e952]:
                    - button "Expand event details" [ref=e953] [cursor=pointer]
                    - cell [ref=e956]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e957] [cursor=pointer]: Oct 14 16:28:10.000
                    - cell [ref=e958]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e959] [cursor=pointer]:
                        - generic [ref=e960]: debug
                    - cell [ref=e962]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e963] [cursor=pointer]: orders-api
                    - cell [ref=e964]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e965] [cursor=pointer]: Request processed
                    - cell [ref=e966]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:2" [ref=e967] [cursor=pointer]: req-000002
                  - row [ref=e969]:
                    - button "Expand event details" [ref=e970] [cursor=pointer]
                    - cell [ref=e973]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e974] [cursor=pointer]: Oct 14 16:28:15.000
                    - cell [ref=e975]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e976] [cursor=pointer]:
                        - generic [ref=e977]: warn
                    - cell [ref=e979]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e980] [cursor=pointer]: orders-api
                    - cell [ref=e981]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e982] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e983]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:3" [ref=e984] [cursor=pointer]: req-000003
                  - row [ref=e986]:
                    - button "Expand event details" [ref=e987] [cursor=pointer]
                    - cell [ref=e990]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e991] [cursor=pointer]: Oct 14 16:28:20.000
                    - cell [ref=e992]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e993] [cursor=pointer]:
                        - generic [ref=e994]: info
                    - cell [ref=e996]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e997] [cursor=pointer]: orders-api
                    - cell [ref=e998]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e999] [cursor=pointer]: Request processed
                    - cell [ref=e1000]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:4" [ref=e1001] [cursor=pointer]: req-000004
                  - row [ref=e1003]:
                    - button "Expand event details" [ref=e1004] [cursor=pointer]
                    - cell [ref=e1007]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1008] [cursor=pointer]: Oct 14 16:28:25.000
                    - cell [ref=e1009]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1010] [cursor=pointer]:
                        - generic [ref=e1011]: error
                    - cell [ref=e1013]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1014] [cursor=pointer]: orders-api
                    - cell [ref=e1015]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1016] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e1017]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:5" [ref=e1018] [cursor=pointer]: req-000005
                  - row [ref=e1020]:
                    - button "Expand event details" [ref=e1021] [cursor=pointer]
                    - cell [ref=e1024]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1025] [cursor=pointer]: Oct 14 16:28:30.000
                    - cell [ref=e1026]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1027] [cursor=pointer]:
                        - generic [ref=e1028]: info
                    - cell [ref=e1030]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1031] [cursor=pointer]: orders-api
                    - cell [ref=e1032]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1033] [cursor=pointer]: Request processed
                    - cell [ref=e1034]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:6" [ref=e1035] [cursor=pointer]: req-000006
                  - row [ref=e1037]:
                    - button "Expand event details" [ref=e1038] [cursor=pointer]
                    - cell [ref=e1041]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1042] [cursor=pointer]: Oct 14 16:28:35.000
                    - cell [ref=e1043]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1044] [cursor=pointer]:
                        - generic [ref=e1045]: info
                    - cell [ref=e1047]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1048] [cursor=pointer]: orders-api
                    - cell [ref=e1049]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1050] [cursor=pointer]: Request processed
                    - cell [ref=e1051]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:7" [ref=e1052] [cursor=pointer]: req-000007
                  - row [ref=e1054]:
                    - button "Expand event details" [ref=e1055] [cursor=pointer]
                    - cell [ref=e1058]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1059] [cursor=pointer]: Oct 14 16:28:40.000
                    - cell [ref=e1060]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1061] [cursor=pointer]:
                        - generic [ref=e1062]: debug
                    - cell [ref=e1064]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1065] [cursor=pointer]: orders-api
                    - cell [ref=e1066]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1067] [cursor=pointer]: Request processed
                    - cell [ref=e1068]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:8" [ref=e1069] [cursor=pointer]: req-000008
                  - row [ref=e1071]:
                    - button "Expand event details" [ref=e1072] [cursor=pointer]
                    - cell [ref=e1075]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e1076] [cursor=pointer]: Oct 14 16:28:45.000
                    - cell [ref=e1077]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e1078] [cursor=pointer]:
                        - generic [ref=e1079]: warn
                    - cell [ref=e1081]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e1082] [cursor=pointer]: orders-api
                    - cell [ref=e1083]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e1084] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e1085]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:9" [ref=e1086] [cursor=pointer]: req-000009
                  - row [ref=e1088]:
                    - button "Expand event details" [ref=e1089] [cursor=pointer]
                    - cell [ref=e1092]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e1093] [cursor=pointer]: Oct 14 16:28:50.000
                    - cell [ref=e1094]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e1095] [cursor=pointer]:
                        - generic [ref=e1096]: info
                    - cell [ref=e1098]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e1099] [cursor=pointer]: orders-api
                    - cell [ref=e1100]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e1101] [cursor=pointer]: Request processed
                    - cell [ref=e1102]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:10" [ref=e1103] [cursor=pointer]: req-00000a
                  - row [ref=e1105]:
                    - button "Expand event details" [ref=e1106] [cursor=pointer]
                    - cell [ref=e1109]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e1110] [cursor=pointer]: Oct 14 16:28:55.000
                    - cell [ref=e1111]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e1112] [cursor=pointer]:
                        - generic [ref=e1113]: error
                    - cell [ref=e1115]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e1116] [cursor=pointer]: orders-api
                    - cell [ref=e1117]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e1118] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e1119]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:11" [ref=e1120] [cursor=pointer]: req-00000b
                  - row [ref=e1122]:
                    - button "Expand event details" [ref=e1123] [cursor=pointer]
                    - cell [ref=e1126]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e1127] [cursor=pointer]: Oct 14 16:29:00.000
                    - cell [ref=e1128]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e1129] [cursor=pointer]:
                        - generic [ref=e1130]: info
                    - cell [ref=e1132]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e1133] [cursor=pointer]: orders-api
                    - cell [ref=e1134]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e1135] [cursor=pointer]: Request processed
                    - cell [ref=e1136]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:12" [ref=e1137] [cursor=pointer]: req-00000c
                  - row [ref=e1139]:
                    - button "Expand event details" [ref=e1140] [cursor=pointer]
                    - cell [ref=e1143]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e1144] [cursor=pointer]: Oct 14 16:29:05.000
                    - cell [ref=e1145]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e1146] [cursor=pointer]:
                        - generic [ref=e1147]: info
                    - cell [ref=e1149]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e1150] [cursor=pointer]: orders-api
                    - cell [ref=e1151]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e1152] [cursor=pointer]: Request processed
                    - cell [ref=e1153]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:13" [ref=e1154] [cursor=pointer]: req-00000d
                  - row [ref=e1156]:
                    - button "Expand event details" [ref=e1157] [cursor=pointer]
                    - cell [ref=e1160]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e1161] [cursor=pointer]: Oct 14 16:29:10.000
                    - cell [ref=e1162]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e1163] [cursor=pointer]:
                        - generic [ref=e1164]: debug
                    - cell [ref=e1166]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e1167] [cursor=pointer]: orders-api
                    - cell [ref=e1168]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e1169] [cursor=pointer]: Request processed
                    - cell [ref=e1170]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:14" [ref=e1171] [cursor=pointer]: req-00000e
                  - row [ref=e1173]:
                    - button "Expand event details" [ref=e1174] [cursor=pointer]
                    - cell [ref=e1177]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e1178] [cursor=pointer]: Oct 14 16:29:15.000
                    - cell [ref=e1179]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e1180] [cursor=pointer]:
                        - generic [ref=e1181]: warn
                    - cell [ref=e1183]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e1184] [cursor=pointer]: orders-api
                    - cell [ref=e1185]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e1186] [cursor=pointer]: Retrying upstream request
                    - cell [ref=e1187]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:15" [ref=e1188] [cursor=pointer]: req-00000f
                  - row [ref=e1190]:
                    - button "Expand event details" [ref=e1191] [cursor=pointer]
                    - cell [ref=e1194]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e1195] [cursor=pointer]: Oct 14 16:29:20.000
                    - cell [ref=e1196]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e1197] [cursor=pointer]:
                        - generic [ref=e1198]: info
                    - cell [ref=e1200]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e1201] [cursor=pointer]: orders-api
                    - cell [ref=e1202]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e1203] [cursor=pointer]: Request processed
                    - cell [ref=e1204]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:16" [ref=e1205] [cursor=pointer]: req-000010
                  - row [ref=e1207]:
                    - button "Expand event details" [ref=e1208] [cursor=pointer]
                    - cell [ref=e1211]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e1212] [cursor=pointer]: Oct 14 16:29:25.000
                    - cell [ref=e1213]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e1214] [cursor=pointer]:
                        - generic [ref=e1215]: error
                    - cell [ref=e1217]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e1218] [cursor=pointer]: orders-api
                    - cell [ref=e1219]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e1220] [cursor=pointer]: Payment provider timed out
                    - cell [ref=e1221]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:17" [ref=e1222] [cursor=pointer]: req-000011
                  - row [ref=e1224]:
                    - button "Expand event details" [ref=e1225] [cursor=pointer]
                    - cell [ref=e1228]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e1229] [cursor=pointer]: Oct 14 16:29:30.000
                    - cell [ref=e1230]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e1231] [cursor=pointer]:
                        - generic [ref=e1232]: info
                    - cell [ref=e1234]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e1235] [cursor=pointer]: orders-api
                    - cell [ref=e1236]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e1237] [cursor=pointer]: Request processed
                    - cell [ref=e1238]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:18" [ref=e1239] [cursor=pointer]: req-000012
                  - row [ref=e1241]:
                    - button "Expand event details" [ref=e1242] [cursor=pointer]
                    - cell [ref=e1245]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e1246] [cursor=pointer]: Oct 14 16:29:35.000
                    - cell [ref=e1247]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e1248] [cursor=pointer]:
                        - generic [ref=e1249]: info
                    - cell [ref=e1251]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e1252] [cursor=pointer]: orders-api
                    - cell [ref=e1253]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e1254] [cursor=pointer]: Request processed
                    - cell [ref=e1255]:
                      - button "Inspect event fixture:/aws/lambda/orders-api:19" [ref=e1256] [cursor=pointer]: req-000013
              - generic [ref=e1257]:
                - generic [ref=e1258]: Expand a row for JSON · Click a cell to inspect
                - generic [ref=e1259]: Export covers this loaded selection
            - status [ref=e1260]:
              - generic [ref=e1261]:
                - paragraph [ref=e1263]: complete · 540 loaded
                - paragraph [ref=e1264]: 540 scanned
                - paragraph [ref=e1265]: 0.0s
      - status [ref=e1266]: Draggable item tab:tab-orders was dropped over droppable area pane-panel:pane-1
  - contentinfo [ref=e1267]:
    - generic [ref=e1268]:
      - paragraph [ref=e1270]: Isolated local development
      - paragraph [ref=e1271]: 2 tabs · 2 panes
    - generic [ref=e1272]:
      - paragraph [ref=e1273]: Saving
      - paragraph [ref=e1274]: v0.1.2
```

# Test source

```ts
  48  |       "--offline-verification",
  49  |       "--background-verification",
  50  |       "--disable-background-networking",
  51  |       "--disable-component-update",
  52  |     ],
  53  |     env,
  54  |   });
  55  |   child = app.process();
  56  |   page = await app.firstWindow();
  57  |   const session = await page.context().newCDPSession(page);
  58  |   await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  59  |   page.on("pageerror", (error) => errors.push(error.message));
  60  |   expect(
  61  |     (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  62  |   ).toBe(false);
  63  |   expect(
  64  |     await app.evaluate(({ BrowserWindow }) =>
  65  |       BrowserWindow.getAllWindows()[0].isVisible(),
  66  |     ),
  67  |   ).toBe(false);
  68  |   await app.evaluate(({ dialog }) => {
  69  |     dialog.showMessageBox = async () => {
  70  |       throw new Error(
  71  |         "Unexpected native dialog during hidden projected-drop verification",
  72  |       );
  73  |     };
  74  |   });
  75  |   await expect(page.locator(".query-status")).toContainText("complete");
  76  | });
  77  | 
  78  | test.afterEach(async () => {
  79  |   if (child?.exitCode === null) {
  80  |     await Promise.race([
  81  |       app.close().catch(() => {}),
  82  |       new Promise((resolveDelay) => setTimeout(resolveDelay, 4000)),
  83  |     ]);
  84  |     if (child.exitCode === null) {
  85  |       if (process.platform === "win32") {
  86  |         try {
  87  |           execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
  88  |             stdio: "ignore",
  89  |           });
  90  |         } catch {}
  91  |       } else child.kill();
  92  |     }
  93  |   }
  94  |   if (
  95  |     !resolve(directory).startsWith(
  96  |       resolve(tmpdir()) + sep + "aws-log-explorer-projected-drop-",
  97  |     )
  98  |   )
  99  |     throw new Error("Unsafe projected-drop cleanup path");
  100 |   await rm(directory, {
  101 |     recursive: true,
  102 |     force: true,
  103 |     maxRetries: 10,
  104 |     retryDelay: 100,
  105 |   });
  106 |   expect(errors).toEqual([]);
  107 | });
  108 | 
  109 | test("moving a visible tab previews its final rectangle after the vacated pane collapses", async () => {
  110 |   await page
  111 |     .getByRole("treeitem", { name: "/aws/lambda/payments-worker", exact: true })
  112 |     .locator(".resource-label")
  113 |     .dblclick();
  114 |   await page.getByLabel("Add split pane", { exact: true }).click();
  115 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  116 |   const paneFor = (name: string) =>
  117 |     page
  118 |       .locator(".workspace-pane")
  119 |       .filter({ has: page.locator(".pane-heading").filter({ hasText: name }) });
  120 |   const payments = paneFor("payments-worker");
  121 |   const orders = paneFor("orders-api");
  122 |   const left = (await payments.boundingBox())!;
  123 |   const right = (await orders.boundingBox())!;
  124 |   expect(left.x).toBeLessThan(right.x);
  125 |   const tab = page.getByRole("tab", { name: "orders-api", exact: true });
  126 |   const from = (await tab.boundingBox())!;
  127 |   await page.mouse.move(from.x + 30, from.y + from.height / 2);
  128 |   await page.mouse.down();
  129 |   await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 2 });
  130 |   await page.mouse.move(left.x + left.width - 20, left.y + left.height / 2, {
  131 |     steps: 5,
  132 |   });
  133 |   const overlay = page.locator('[data-split-preview="right"]');
  134 |   await expect(overlay).toBeVisible();
  135 |   await expect(page.locator(".workspace-drag-preview")).toBeVisible();
  136 |   const projected = (await overlay.boundingBox())!;
  137 |   await page.mouse.up();
  138 |   await expect(
  139 |     page.locator(".pane-drop-overlay,.workspace-drag-preview"),
  140 |   ).toHaveCount(0);
  141 |   await expect(page.locator(".workspace-pane")).toHaveCount(2);
  142 |   await expect(page.locator(".workspace-tab")).toHaveCount(2);
  143 |   const actual = (await orders.boundingBox())!;
  144 |   for (const key of ["x", "y", "width", "height"] as const)
  145 |     expect(
  146 |       Math.abs(actual[key] - projected[key]),
  147 |       JSON.stringify({ projected, actual, key }),
> 148 |     ).toBeLessThanOrEqual(2);
      |       ^ Error: {"projected":{"x":616,"y":139.2604217529297,"width":288,"height":752.0729522705078},"actual":{"x":910,"y":139.2604217529297,"width":576,"height":752.0729522705078},"key":"x"}
  149 |   const closed = app.waitForEvent("close", { timeout: 10000 });
  150 |   const exited = new Promise<number | null>((resolveExit) =>
  151 |     child.once("exit", resolveExit),
  152 |   );
  153 |   await app.evaluate(({ BrowserWindow }) =>
  154 |     BrowserWindow.getAllWindows()[0].close(),
  155 |   );
  156 |   await closed;
  157 |   expect(await exited).toBe(0);
  158 | });
  159 | 
```