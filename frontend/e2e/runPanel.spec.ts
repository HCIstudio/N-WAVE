import { expect, test } from "./fixtures";

test.describe("run panel", () => {
  test("keeps a failed run open, shows its log and reopens", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("link", { name: /Demo Workflow/ }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    // The demo has no backend, so a run fails at once.
    await page.getByRole("button", { name: "Run Workflow" }).click();
    const panel = page.getByRole("region", { name: "Run panel" });
    await expect(panel.getByRole("heading")).toHaveText("Workflow Failed");

    // The error notice opens the full log.
    await page.getByRole("button", { name: "Show full log" }).click();
    await expect(panel.getByRole("tab", { name: "Log" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panel.getByLabel("Run log")).toContainText("Error:");

    // It no longer hides itself after a few seconds.
    await page.waitForTimeout(11_000);
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Maximize panel" }).click();
    await panel.getByRole("button", { name: "Close run panel" }).click();
    await expect(panel).toHaveCount(0);

    // The bottom bar brings it back, with the last run's log.
    await page.getByRole("button", { name: "Show runs" }).click();
    await expect(panel.getByLabel("Run log")).toContainText("Error:");
    await panel.getByRole("tab", { name: "History" }).click();
    await expect(panel).toContainText("hasn't been run on this server");
  });
});
