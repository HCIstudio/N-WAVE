import { expect, test } from "./fixtures";

// The execution settings dialog edits the nested ExecutionSettings model; the
// footer summary reads that model, so it shows whether edits took effect.
test("execution settings edits reach the workflow's settings", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New Workflow" }).click();
  await page.getByRole("button", { name: "Empty workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);

  await page.getByRole("button", { name: "Execution Settings" }).click();
  const summary = page
    .locator("div", { hasText: /CPU cores/ })
    .filter({ hasText: /execution/ })
    .last();
  await expect(summary).toContainText("Docker execution");
  await expect(page.getByLabel("Enable Docker/Container execution")).toBeChecked();

  await page.getByLabel("Enable Docker/Container execution").uncheck({ force: true });
  await expect(summary).toContainText("Local execution");

  await page.getByRole("button", { name: "Resources" }).click();
  // The workflow takes the run defaults until it sets its own limits.
  await expect(page.getByText(/^Runs get 4 CPU cores/)).toBeVisible();
  await page.getByLabel("Use the run defaults").uncheck();
  await page.getByLabel("Maximum CPU Cores").fill("8");
  await expect(summary).toContainText("8 CPU cores");
  await page.getByLabel("Execution Timeout (minutes)").fill("45");
  await expect(summary).toContainText("PT45M timeout");
});

// The Settings page: run defaults every workflow uses.
test("run defaults on the Settings page reach new workflows", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

  await page.getByLabel("Maximum CPU Cores").fill("6");
  await page.getByLabel("Execution Timeout (minutes)").fill("90");
  await page.getByRole("button", { name: "Save run defaults" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.getByRole("link", { name: "Workflows" }).click();
  await page.getByRole("button", { name: "New Workflow" }).click();
  await page.getByRole("button", { name: "Empty workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await page.getByRole("button", { name: "Execution Settings" }).click();
  await expect(page.getByText(/6 CPU cores, 4\.GB/)).toBeVisible();
  await expect(page.getByText("PT1H30M timeout")).toBeVisible();
});
