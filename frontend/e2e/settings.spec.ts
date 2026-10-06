import { expect, test } from "./fixtures";

// The execution settings dialog edits the nested ExecutionSettings model; the
// footer summary reads that model, so it shows whether edits took effect.
test("execution settings edits reach the workflow's settings", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "New Workflow" }).click();
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
  await page.getByLabel("Maximum CPU Cores").fill("8");
  await expect(summary).toContainText("8 CPU cores");
  await page.getByLabel("Execution Timeout (minutes)").fill("45");
  await expect(summary).toContainText("PT45M timeout");
});
