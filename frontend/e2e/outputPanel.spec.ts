import { expect, test } from "./fixtures";

test("opening the Display Output panel leaves the read-only demo as it is", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
  await expect(page).toHaveURL(/builtin:demo-basic/);
  await page.locator('[data-id="demo-output"]').dblclick();
  await expect(page.getByLabel("View File:")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/builtin:demo-basic/);

  // Without a run there is nothing on the node yet.
  await expect(page.getByRole("status", { name: /^Last run:/ })).toHaveCount(0);
});
