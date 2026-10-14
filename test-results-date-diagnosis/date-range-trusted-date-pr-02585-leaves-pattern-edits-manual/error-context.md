# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: date-range.spec.ts >> trusted date preset selection refreshes without clicking Run and leaves pattern edits manual
- Location: tests\desktop\date-range.spec.ts:116:5

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('.viewer-meta')
Timeout: 5000ms
- Expected  - 2
+ Received  + 1

-  LOCAL · 57 / 57 loaded events
- 54 JSON · Local time
+  LOCAL · 57 / 57 loaded events54 JSON · Local time

Call log:
  - Expect "toHaveText" locator('.viewer-meta') with timeout 5000ms
  - waiting for locator('.viewer-meta')
    14 × locator resolved to <div class="viewer-meta">…</div>
       - unexpected value " LOCAL · 57 / 57 loaded events54 JSON · Local time"

```

```yaml
- text: LOCAL · 57 / 57 loaded events 54 JSON · Local time
```

# Test source

```ts
  49  |       "--background-verification",
  50  |       "--disable-background-networking",
  51  |       "--disable-component-update",
  52  |     ],
  53  |     env,
  54  |   });
  55  |   child = app.process();
  56  |   page = await app.firstWindow();
  57  |   page.setDefaultTimeout(6000);
  58  |   const input = await page.context().newCDPSession(page);
  59  |   await input.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  60  |   page.on("pageerror", (error) => errors.push(error.message));
  61  |   expect(
  62  |     (await page.evaluate(() => window.explorer.environment())).canEnableAws,
  63  |   ).toBe(false);
  64  |   expect(
  65  |     await app.evaluate(({ BrowserWindow }) =>
  66  |       BrowserWindow.getAllWindows()[0].isVisible(),
  67  |     ),
  68  |   ).toBe(false);
  69  |   await app.evaluate(({ dialog }) => {
  70  |     dialog.showMessageBox = async () => {
  71  |       throw new Error(
  72  |         "Unexpected native dialog during hidden date verification",
  73  |       );
  74  |     };
  75  |   });
  76  |   await expect(page.locator(".query-status")).toContainText("complete");
  77  | });
  78  | 
  79  | test.afterEach(async () => {
  80  |   if (app && child && child.exitCode === null) {
  81  |     try {
  82  |       const exit = app.waitForEvent("close", { timeout: 7000 });
  83  |       const processExit = new Promise<number | null>((resolveExit) =>
  84  |         child!.once("exit", resolveExit),
  85  |       );
  86  |       await app.evaluate(({ BrowserWindow }) =>
  87  |         BrowserWindow.getAllWindows()[0].close(),
  88  |       );
  89  |       await exit;
  90  |       expect(await processExit).toBe(0);
  91  |     } finally {
  92  |       if (child.exitCode === null) {
  93  |         if (process.platform === "win32")
  94  |           execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
  95  |             stdio: "ignore",
  96  |           });
  97  |         else child.kill();
  98  |       }
  99  |     }
  100 |   }
  101 |   expect(errors).toEqual([]);
  102 |   if (
  103 |     !resolve(directory).startsWith(
  104 |       resolve(tmpdir()) + sep + "aws-log-explorer-dates-",
  105 |     )
  106 |   )
  107 |     throw new Error("Unsafe date-test cleanup path");
  108 |   await rm(directory, {
  109 |     recursive: true,
  110 |     force: true,
  111 |     maxRetries: 10,
  112 |     retryDelay: 100,
  113 |   });
  114 | });
  115 | 
  116 | test("trusted date preset selection refreshes without clicking Run and leaves pattern edits manual", async () => {
  117 |   const initial = await page.locator(".viewer-meta").innerText();
  118 |   const count = Number(
  119 |     initial.match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1].replaceAll(",", ""),
  120 |   );
  121 |   expect(count).toBeGreaterThan(100);
  122 |   await page.getByRole("combobox", { name: "Time range", exact: true }).click();
  123 |   await page
  124 |     .getByRole("option", { name: "Last 5 minutes", exact: true })
  125 |     .click();
  126 |   await expect(
  127 |     page.getByRole("combobox", { name: "Time range", exact: true }),
  128 |   ).toHaveValue("Last 5 minutes");
  129 |   // A completed query can still be showing its previous snapshot while React
  130 |   // schedules the date effect. Wait for the new result count, not incidental
  131 |   // metadata changes or the previous request's already-complete status.
  132 |   await expect.poll(async () => {
  133 |     const metadata = await page.locator(".viewer-meta").innerText();
  134 |     const loaded = Number(metadata.match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1].replaceAll(",", ""));
  135 |     return loaded > 0 && loaded < count;
  136 |   }, { timeout: 10000 }).toBe(true);
  137 |   await expect(page.locator(".query-status")).toContainText("complete");
  138 |   const reduced = await page.locator(".viewer-meta").innerText();
  139 |   const reducedCount = Number(
  140 |     reduced.match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1].replaceAll(",", ""),
  141 |   );
  142 |   expect(reducedCount).toBeGreaterThan(0);
  143 |   expect(reducedCount).toBeLessThan(count);
  144 |   const pattern = page.getByLabel("CloudWatch filter pattern", { exact: true });
  145 |   await pattern.click();
  146 |   await page.keyboard.press("ControlOrMeta+A");
  147 |   await pattern.pressSequentially("unmatched-date-regression-54837");
  148 |   await expect(page.getByText(/Query settings changed/)).toBeVisible();
> 149 |   await expect(page.locator(".viewer-meta")).toHaveText(reduced);
      |                                              ^ Error: expect(locator).toHaveText(expected) failed
  150 |   await page.getByRole("combobox", { name: "Time range", exact: true }).click();
  151 |   await page
  152 |     .getByRole("option", { name: "Last 30 minutes", exact: true })
  153 |     .click();
  154 |   await expect(page.locator(".query-status")).toContainText(
  155 |     "complete · 0 loaded",
  156 |   );
  157 |   await expect(page.getByText(/Query settings changed/)).toHaveCount(0);
  158 | });
  159 | 
```