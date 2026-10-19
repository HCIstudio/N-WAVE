import { expect, test } from "@playwright/test";

// A fresh browser: the tutorial hasn't been done yet.
test.describe("home tutorial", () => {
  test("points at the demo and can be skipped from its text", async ({ page }) => {
    await page.goto("./");
    const box = page.getByRole("region", { name: "Tutorial" });
    await expect(box).toContainText(
      "Click on the highlighted demo to open it and start the tutorial, or skip the tutorial."
    );
    // No green scrim over the page any more.
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0);

    await box.getByRole("button", { name: "skip the tutorial" }).click();
    await expect(box).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retake Tutorial" })).toBeVisible();
  });

  test("opening the demo starts the tutorial on the canvas", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    await expect(page.getByRole("region", { name: "Tutorial" })).toBeVisible();
  });

  test("the add-node step asks before copying the demo", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo 1 - Text basics/ }).click();
    const box = page.getByRole("region", { name: "Tutorial" });
    const next = box.getByRole("button", { name: "Next tutorial step" });
    for (let step = 0; step < 4; step++) await next.click();
    await expect(box).toContainText("you'll be asked to make your own copy");

    const dialog = page.getByRole("dialog", { name: "Make your own copy to edit" });
    await next.click();
    await dialog.getByRole("button", { name: "Just look" }).click();
    await expect(page).toHaveURL(/builtin:demo-basic/);
    await expect(box).toContainText("expand the workflow");

    await next.click();
    await dialog.getByRole("button", { name: "Make a copy" }).click();
    await expect(page).not.toHaveURL(/builtin:demo-basic/);
    await expect(box).toContainText("double-click it");
  });
});
