import { expect, test } from "@playwright/test";

// A fresh browser: the tutorial hasn't been done yet.
test.describe("home tutorial", () => {
  test("points at the demo and can be skipped from its text", async ({ page }) => {
    await page.goto("./");
    const box = page.getByRole("region", { name: "Tutorial" });
    await expect(box).toContainText(
      "Click on the above demo to open it and start the tutorial, or skip the tutorial."
    );
    // No green scrim over the page any more.
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0);

    await box.getByRole("button", { name: "skip the tutorial" }).click();
    await expect(box).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retake Tutorial" })).toBeVisible();
  });

  test("opening the demo starts the tutorial on the canvas", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo Workflow/ }).click();
    await expect(page.getByRole("region", { name: "Tutorial" })).toBeVisible();
  });
});
