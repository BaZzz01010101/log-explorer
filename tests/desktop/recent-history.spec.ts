import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { desktopExecutablePath } from "./desktop-app";
import { openSettingsWindow } from "./settings-panel";
import type { QueryUpdate } from "../../src/shared/contracts";

for (const theme of ["dark", "light"] as const)
  test(`${theme}: Recent opens at the newest events, pages upwards and returns to recent at the buffer limit`, async () => {
    const root = resolve(".tmp", "recent-desktop");
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "case-"));
    const packaged = process.env.EXPLORER_DESKTOP_PACKAGED === "1";
    const environment: Record<string, string> = {};
    for (const name of [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "COMSPEC",
    ])
      if (process.env[name]) environment[name] = process.env[name]!;
    const app = await electron.launch({
      executablePath: packaged ? desktopExecutablePath() : undefined,
      args: [
        ...(packaged ? [] : [process.cwd()]),
        "--offline-verification",
        "--background-verification",
        "--disable-background-networking",
      ],
      env: {
        ...environment,
        EXPLORER_TEST_USER_DATA: directory,
        USERPROFILE: directory,
        LOCALAPPDATA: directory,
        APPDATA: directory,
        AWS_CONFIG_FILE: join(directory, "missing"),
        AWS_SHARED_CREDENTIALS_FILE: join(directory, "missing"),
        AWS_EC2_METADATA_DISABLED: "true",
      },
    });
    try {
      const page = await app.firstWindow();
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setFocusEmulationEnabled", {
        enabled: true,
      });
      expect(
        await app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
      ).toBe(false);
      await expect(
        page.locator('.query-status[data-query-state="complete"]'),
      ).toBeAttached();
      await openSettingsWindow(page);
      const dialog = page.getByRole("dialog", {
        name: "Settings",
        exact: true,
      });
      await dialog
        .getByRole("tab", { name: "Preferences", exact: true })
        .click();
      if (theme === "light") {
        await dialog.getByRole("combobox", { name: "Theme" }).click();
        await page.getByRole("option", { name: "Light", exact: true }).click();
      }
      const maximum = dialog.getByLabel("Maximum events per view", {
        exact: true,
      });
      await maximum.click();
      await page.keyboard.press("ControlOrMeta+A");
      await maximum.pressSequentially("100");
      await page.keyboard.press("Tab");
      await dialog.getByRole("button", { name: "Close settings" }).click();
      await page.evaluate(() => {
        const probe = window as unknown as { recentUpdates: QueryUpdate[] };
        probe.recentUpdates = [];
        window.explorer.onUpdate((update) => probe.recentUpdates.push(update));
      });
      await page.getByTestId("run-query").click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (
                window as unknown as { recentUpdates: QueryUpdate[] }
              ).recentUpdates.filter((u) => u.state === "complete").length,
          ),
        )
        .toBeGreaterThan(0);
      const updates = () =>
        page.evaluate(
          () =>
            (window as unknown as { recentUpdates: QueryUpdate[] })
              .recentUpdates,
        );
    const previousOldest = (await updates()).find((u) => u.state === "complete")?.events?.at(-1)?.id;
    expect(previousOldest).toBeTruthy();
      expect(
        (await updates()).find((u) => u.state === "complete")?.events?.[0].id,
      ).toMatch(/:539$/);
    await page.getByRole("button", { name: "Live", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop Live" })).toBeVisible();
    await page.getByRole("button", { name: "Stop Live" }).click();
    await expect(page.locator('.query-status[data-query-state="complete"]')).toBeAttached();
      const grid = page.locator(".viewer-scroll");
      await expect
        .poll(() => grid.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      await grid.hover();
      for (let pageNumber = 1; pageNumber <= 4; pageNumber++) {
        await page.mouse.wheel(0, -100000);
        await expect
          .poll(
            async () =>
              (await updates()).filter((u) => u.state === "complete").length,
          )
          .toBeGreaterThan(pageNumber);
      if (pageNumber === 1) await expect(grid.locator(`[data-event-id=${JSON.stringify(previousOldest)}]`)).toBeVisible();
      }
      expect(
        (await updates()).filter((u) => u.state === "complete")[1].events?.[0]
          .id,
      ).toMatch(/:514$/);
      await expect(
        page.getByRole("button", { name: "Return to recent" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Return to recent" }).click();
      await expect
        .poll(
          async () =>
            (await updates()).filter((u) => u.state === "complete").length,
        )
        .toBeGreaterThan(5);
      expect(
        (await updates()).filter((u) => u.state === "complete").at(-1)
          ?.events?.[0].id,
      ).toMatch(/:539$/);
    } finally {
      await app.close();
      if (!resolve(directory).startsWith(root + sep + "case-"))
        throw new Error("Unsafe test cleanup path");
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  });
