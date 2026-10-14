# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: date-range.spec.ts >> trusted date preset selection refreshes without clicking Run and leaves pattern edits manual
- Location: tests\desktop\date-range.spec.ts:116:5

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 540
Received:   540
```

# Test source

```ts
  36  |   Object.assign(env, {
  37  |     EXPLORER_TEST_USER_DATA: directory,
  38  |     AWS_CONFIG_FILE: join(directory, "absent-config"),
  39  |     AWS_SHARED_CREDENTIALS_FILE: join(directory, "absent-credentials"),
  40  |     AWS_EC2_METADATA_DISABLED: "true",
  41  |   });
  42  |   const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
  43  |   app = await electron.launch({
  44  |     executablePath: packaged
  45  |       ? join(process.cwd(), "release/win-unpacked/AWS Log Explorer.exe")
  46  |       : undefined,
  47  |     args: [
  48  |       ...(packaged ? ["--offline-verification"] : [process.cwd()]),
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
  126 |   await expect(page.getByRole("combobox", { name: "Time range", exact: true })).toHaveValue(
  127 |     "Last 5 minutes",
  128 |   );
  129 |   await expect(page.locator(".viewer-meta")).not.toHaveText(initial);
  130 |   await expect(page.locator(".query-status")).toContainText("complete");
  131 |   const reduced = await page.locator(".viewer-meta").innerText();
  132 |   const reducedCount = Number(
  133 |     reduced.match(/([\d,]+) \/ [\d,]+ loaded events/)?.[1].replaceAll(",", ""),
  134 |   );
  135 |   expect(reducedCount).toBeGreaterThan(0);
> 136 |   expect(reducedCount).toBeLessThan(count);
      |                        ^ Error: expect(received).toBeLessThan(expected)
  137 |   const pattern = page.getByLabel("CloudWatch filter pattern", { exact: true });
  138 |   await pattern.click();
  139 |   await page.keyboard.press("ControlOrMeta+A");
  140 |   await pattern.pressSequentially("unmatched-date-regression-54837");
  141 |   await expect(page.getByText(/Query settings changed/)).toBeVisible();
  142 |   await expect(page.locator(".viewer-meta")).toHaveText(reduced);
  143 |   await page.getByRole("combobox", { name: "Time range", exact: true }).click();
  144 |   await page
  145 |     .getByRole("option", { name: "Last 30 minutes", exact: true })
  146 |     .click();
  147 |   await expect(page.locator(".query-status")).toContainText(
  148 |     "complete · 0 loaded",
  149 |   );
  150 |   await expect(page.getByText(/Query settings changed/)).toHaveCount(0);
  151 | });
  152 | 
```