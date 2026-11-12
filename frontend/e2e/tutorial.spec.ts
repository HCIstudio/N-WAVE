import { expect, test } from "@playwright/test";

// A fresh browser: the tutorial hasn't been done yet.
test.describe("tutorial", () => {
  test("tours the home page and can be skipped", async ({ page }) => {
    await page.goto("./");
    const box = page.getByRole("region", { name: "Tutorial" });
    await expect(box).toContainText("Welcome to N-WAVE");
    await box.getByRole("button", { name: "Next" }).click();
    await expect(box).toContainText("built-in demos");

    await box.getByRole("button", { name: "Skip tutorial" }).click();
    await expect(box).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retake Tutorial" })).toBeVisible();
  });

  test("goes on in the user's own copy of Demo 1, where they can try things", async ({ page }) => {
    await page.goto("./");
    const box = page.getByRole("region", { name: "Tutorial" });
    const next = box.getByRole("button", { name: "Next" });
    for (let step = 1; step < 8; step++) await next.click();
    await box.getByRole("button", { name: "Duplicate Demo 1" }).click();

    // An editable copy, not the read-only demo.
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page).not.toHaveURL(/builtin:demo-basic/);
    await expect(box).toContainText("your copy");
    await next.click();
    await expect(box).toContainText("double-click Map");
    await next.click();
    await next.click();
    await expect(box).toContainText("Add a node");

    // Adding a node moves on.
    await page.getByRole("button", { name: "Add node" }).click();
    await page.getByPlaceholder(/Search/).first().fill("Filter");
    await page.getByRole("button", { name: /^Filter/ }).first().click();
    await expect(box).toContainText("bottom bar");
    await next.click();
    await next.click();
    await box.getByRole("button", { name: "Finish" }).click();
    await expect(box).toHaveCount(0);

    // Done: not shown again.
    await page.goto("./");
    await expect(page.getByRole("button", { name: "Retake Tutorial" })).toBeVisible();
    await expect(box).toHaveCount(0);
  });
});
