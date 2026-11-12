import { expect, test } from "./fixtures";

// In the demo, the built-in examples' analyses were recorded when the demo
// was built (scripts/record-demo-analysis.sh); other workflows say why not.
test.describe("Analyse", () => {
  test("shows a built-in example's code check, and opens its structure", async ({ page }) => {
    await page.goto("./workflow/builtin:demo-basic");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.getByRole("button", { name: "Analyse the workflow" }).click();
    const dialog = page.getByRole("dialog", { name: /Analysis of/ });
    await expect(dialog.getByText("No problems found in the code.")).toBeVisible();
    // Its structure opens as a graph view, which in the demo needs a full install.
    await dialog.getByRole("button", { name: "Process dependency graph" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Process dependency graph view" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Needs a full install of N-WAVE.");
  });

  test("says that only the built-in examples can be analysed in the demo", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await page.getByRole("button", { name: "Analyse the workflow" }).click();
    const dialog = page.getByRole("dialog", { name: /Analysis of/ });
    await expect(dialog.getByText(/only the built-in examples can be analysed/).first()).toBeVisible();
  });

  test("is gone when switched off", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("nwave-demo-features", JSON.stringify({ analysis: false }));
    });
    await page.goto("./workflow/builtin:demo-basic");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyse the workflow" })).toHaveCount(0);
  });
});
