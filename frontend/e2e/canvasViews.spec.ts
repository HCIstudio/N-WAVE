import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

// The hand-written script whose `if` blocks call steps in code.
const script = await readFile(
  new URL(
    "../src/workflows/import/fixtures/channel-set-in-if-else.nf",
    import.meta.url,
  ),
  "utf8",
);

test.describe("canvas views", () => {
  test("shows what code connects as dashed lines, and the steps on their own", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Import Workflow" }).click();
    await page.getByLabel("Nextflow Source").fill(script);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();

    // TRIM is called in the channel code, and its output read there: dashed, with a warning.
    await expect(page.locator('[data-derived="code"]')).toHaveCount(2);
    await page.getByRole("button", { name: /Workflow check/ }).click();
    await expect(
      page.getByText(/calls “TRIM”, which the canvas doesn't connect to it/),
    ).toBeVisible();

    // Steps only: the channel code is hidden, TRIM reaches ALIGN through it.
    const view = page.getByRole("group", { name: "Canvas view" });
    await view.getByRole("button", { name: "Steps" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Steps only" }),
    ).toBeVisible();
    const channelCode = page
      .locator(".react-flow__node")
      .filter({ hasText: "Channel code" });
    await expect(channelCode).toBeHidden();
    await expect(
      page.locator(".react-flow__node:visible").filter({ hasText: "TRIM" }),
    ).toBeVisible();
    await expect(page.locator('[data-derived="through"]')).toHaveCount(1);
    await expect(view.getByRole("button", { name: "Steps" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Editing goes back to All.
    await page
      .locator(".react-flow__node:visible")
      .filter({ hasText: "ALIGN" })
      .dblclick();
    await expect(view.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(channelCode).toBeVisible();
  });
});
