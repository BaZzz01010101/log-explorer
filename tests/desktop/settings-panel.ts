import { expect, type Page } from "@playwright/test";

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

export async function setShortcutBinding(
  page: Page,
  label: string,
  shortcut: string,
) {
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog
    .getByRole("button", { name: `Edit shortcut for ${label}`, exact: true })
    .click();
  await page.keyboard.press(shortcut);
  await expect(dialog.locator('[data-shortcut-recording="true"]')).toHaveCount(
    0,
  );
  await dialog
    .getByRole("button", { name: `Save shortcut for ${label}`, exact: true })
    .click();
}
