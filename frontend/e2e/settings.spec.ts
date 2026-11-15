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
  await page.getByLabel("Use the global limits").uncheck();
  await page.getByLabel("Maximum CPU Cores").fill("3");
  await expect(summary).toContainText("3 CPU cores");
  await page.getByLabel("Execution Timeout (minutes)").fill("45");
  await expect(summary).toContainText("PT45M timeout");
});

// The Settings page: run defaults every workflow uses.
test("run defaults on the Settings page reach new workflows", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "Global Settings" }).click();
  await expect(page.getByRole("heading", { name: "Global Settings", level: 1 })).toBeVisible();

  await page.getByLabel("Maximum CPU Cores").fill("6");
  await page.getByLabel("Execution Timeout (minutes)").fill("90");
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();

  await page.getByRole("link", { name: "Workflows" }).click();
  await page.getByRole("button", { name: "New Workflow" }).click();
  await page.getByRole("button", { name: "Empty workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\//);
  await page.getByRole("button", { name: "Execution Settings" }).click();
  await expect(page.getByText(/6 CPU cores, 4\.GB/)).toBeVisible();
  await expect(page.getByText("PT1H30M timeout")).toBeVisible();
});

test("the I/O monitor in Global Settings: off, in beta, with its privileges, and not in the demo", async ({ page }) => {
  await page.goto("./settings");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "I/O monitor" }) });
  await expect(section).toContainText("privileged");
  await expect(section.getByRole("link", { name: "arXiv:2408.00411" })).toHaveAttribute(
    "href",
    "https://arxiv.org/abs/2408.00411",
  );
  const box = section.getByRole("checkbox", { name: /Monitor file accesses during runs/ });
  await expect(box).not.toBeChecked();
  // The demo has no server: greyed out, with why.
  await expect(page.getByTestId("io-monitor-status")).toHaveText(
    "It can't run here: The browser demo can't run workflows, so it can't monitor them.",
  );
  await expect(page.locator("[data-needs-install]", { has: section })).toContainText("Needs a full install of N-WAVE.");
  // In beta: what is under test, and the form for reports.
  await expect(section.getByRole("note")).toContainText(
    "Under test: on Docker Desktop and WSL 2 the monitor sees the whole machine and can miss file accesses.",
  );
  await expect(section.getByRole("link", { name: "Report how it works on yours" })).toHaveAttribute(
    "href",
    /issues\/new\?template=beta_feedback\.yml&title=%5BBeta%5D%20I%2FO%20monitor/,
  );
});
