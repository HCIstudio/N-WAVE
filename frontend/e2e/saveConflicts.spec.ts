import type { Page } from "@playwright/test";
import { addNode, expect, test } from "./fixtures";

/** Save now and wait until it's saved (the button shows a check, disabled). */
const save = async (page: Page) => {
  const button = page.getByRole("button", { name: "Save Workflow" });
  await button.click();
  await expect(button).toBeDisabled();
};

// Two tabs on one workflow: the demo keeps workflows in localStorage, which
// both tabs share, as two tabs share the backend.
test.describe("saving from two tabs", () => {
  test("a save based on an older version asks instead of overwriting", async ({
    page,
    context,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await addNode(page, "Filter");
    await save(page);

    // Tab B opens it and saves an edit.
    const other = await context.newPage();
    await other.goto(page.url());
    await expect(other.locator(".react-flow__node")).toHaveCount(1);
    await addNode(other, "Display Output");
    await save(other);

    // Tab A, still on the first version, edits too: its autosave is refused.
    await page.bringToFront();
    await addNode(page, "Map");
    const dialog = page.getByRole("dialog", {
      name: "This workflow was changed elsewhere",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("nothing was overwritten");

    // Loading the saved version shows tab B's edit.
    await dialog.getByRole("button", { name: "Load the saved version" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.locator(".react-flow__node", { hasText: "Display Output" })).toBeVisible();

    // Another conflict: keep tab A's version as a copy instead.
    await addNode(other, "Map");
    await save(other);
    const original = page.url();
    await page.bringToFront();
    await addNode(page, "Merge");
    await dialog.getByRole("button", { name: "Keep mine as a copy" }).click();
    await expect(page).not.toHaveURL(original);
    await expect(page.locator(".react-flow__node", { hasText: "Merge" })).toBeVisible();

    // The original keeps tab B's version.
    await other.reload();
    await expect(other.locator(".react-flow__node")).toHaveCount(3);
    await expect(other.locator(".react-flow__node", { hasText: "Merge" })).toHaveCount(0);
  });
});
