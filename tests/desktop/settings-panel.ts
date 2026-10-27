import type { Page } from "@playwright/test";

/** Existing modal-focused regressions explicitly use the pane's expand action. */
export async function openSettingsWindow(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  if (
    !(await page
      .getByRole("dialog", { name: "Settings", exact: true })
      .isVisible())
  )
    await page
      .getByRole("button", { name: "Open settings in window", exact: true })
      .click();
}
