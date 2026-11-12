import { expect, test } from "./fixtures";

// The demo has no server: running, and what comes of runs, are shown as in an
// installation but greyed out, with why.
test.describe("run panel", () => {
  test("in the demo, Run and Resume are shown greyed out, with why", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    const run = page.getByRole("button", { name: "Run Workflow" });
    await expect(run).toBeDisabled();
    await expect(run).toHaveAttribute("title", /^Needs N-WAVE installed with Docker/);
    const resume = page.getByRole("switch", { name: "Resume" });
    await expect(resume).toBeDisabled();
    await expect(resume).toHaveAttribute("title", /Needs N-WAVE installed with Docker/);

    // The run cache is in Execution Settings, greyed out.
    await page.getByRole("button", { name: "Execution Settings" }).click();
    const cache = page.getByRole("region", { name: "Run cache" });
    await expect(cache).toBeVisible();
    await expect(page.locator("[data-needs-install]")).toContainText("Needs a full install of N-WAVE.");
  });

  test("the Runs bar opens the run panel, with no runs in the demo", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    await page.getByRole("region", { name: "Runs" }).getByRole("button", { name: "Expand run panel" }).click();
    const panel = page.getByRole("region", { name: "Run panel" });
    await panel.getByRole("tab", { name: "History" }).click();
    await expect(panel).toContainText("hasn't been run on this server");
  });
});
