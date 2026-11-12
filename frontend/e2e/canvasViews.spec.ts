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
  test("shows what code connects as dashed lines, and offers the graphs of the code", async ({
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

    // The two read-only graphs of the code are in the view switch. They are
    // drawn from BioFlow-Insight's analysis, which needs an installation:
    // in the demo they are greyed out and say so.
    const view = page.getByRole("group", { name: "Canvas view" });
    const dependencies = view.getByRole("button", { name: "Dependencies" });
    await expect(dependencies).toHaveAttribute("data-unavailable", "true");
    await dependencies.click();
    const titleBlock = page.getByRole("region", { name: "Process dependency graph view" });
    await expect(titleBlock).toContainText("not the editor");
    await expect(page.getByRole("status")).toContainText("Needs a full install of N-WAVE.");
    await expect(page.getByRole("button", { name: "Add node" })).toHaveCount(0);
    await titleBlock.getByRole("button", { name: "Back to the editor" }).click();
    await expect(view.getByRole("button", { name: "Editor" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-derived="code"]')).toHaveCount(2);
  });
});
