import { readFile } from "node:fs/promises";
import { canvasSettled, expect, test } from "./fixtures";

// Grouping steps into a subworkflow (#221), in a copy of Demo 1.
test.describe("groups of steps", () => {
  test("groups selected steps, shows them framed and as one box, and writes a subworkflow", async ({ page }) => {
    await page.goto("./");
    const demoCard = page.getByRole("link", { name: /Demo 1 - Text basics/ });
    await demoCard.hover();
    await demoCard.getByRole("button", { name: "Duplicate" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(6);

    // Filter (Barry) and Map: the branch that uppercases.
    const filter = page.locator('.react-flow__node[data-id="demo-filter-barry"]');
    const map = page.locator('.react-flow__node[data-id="demo-map-uppercase"]');
    await filter.click();
    await page.keyboard.down("ControlOrMeta");
    await map.click();
    await page.keyboard.up("ControlOrMeta");
    const bar = page.getByRole("toolbar", { name: "Selected steps" });
    await expect(bar).toContainText("2 steps selected");
    await bar.getByRole("button", { name: "Group into subworkflow…" }).click();

    const dialog = page.getByRole("dialog", { name: "Group into a subworkflow" });
    const name = dialog.getByLabel("Name");
    // A name a step already has says why it can't be used.
    await name.fill("Merge");
    await expect(dialog.getByRole("alert")).toContainText("already the name of a step");
    await name.fill("Barry uppercase");
    await expect(dialog.getByText("BARRY_UPPERCASE")).toBeVisible();
    await dialog.getByRole("button", { name: "Group", exact: true }).click();
    await expect(dialog).toBeHidden();

    // All: a frame around the two steps.
    const frame = page.getByRole("region", { name: "Group “Barry Uppercase”" });
    await expect(frame).toContainText("Barry Uppercase2 steps");
    await expect(frame.locator("header")).toHaveAttribute("title", "Subworkflow BARRY_UPPERCASE in the code");

    // Grouped: one box instead of the two steps; Open goes back to them.
    const view = page.getByRole("group", { name: "Canvas view" });
    await view.getByRole("button", { name: "Groups" }).click();
    // A read-only view, drawn as a blueprint with its name in the title block.
    await expect(page.locator('[data-blueprint="true"]')).toBeVisible();
    await expect(page.getByRole("note", { name: "Read-only view" })).toContainText("Groups");
    await expect(filter).toBeHidden();
    const box = page.locator('.react-flow__node[data-id="group:BARRY_UPPERCASE"]');
    await expect(box).toContainText("Filter");
    await expect(box).toContainText("Map");
    // Into the box from File Input, out of it into Merge.
    await expect(page.locator('[data-testid^="rf__edge-grouped:"]')).toHaveCount(2);
    await box.getByRole("button", { name: "Open" }).click();
    await expect(view.getByRole("button", { name: "Editor" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-blueprint="true"]')).toHaveCount(0);
    await expect(filter).toBeVisible();

    // The script: the group is a workflow the entry workflow calls.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Workflow" }).click();
    const script = await readFile(await (await downloadPromise).path(), "utf8");
    expect(script).toContain("workflow BARRY_UPPERCASE {\n    take:\n    ch_files");
    expect(script).toContain("    BARRY_UPPERCASE(ch_files)");
    expect(script).toMatch(/MERGE\(BARRY_UPPERCASE\.out\.map/);

    // Ungroup: the steps on their own again.
    await frame.getByRole("button", { name: "Ungroup" }).click();
    await expect(frame).toHaveCount(0);
    await expect(view.getByRole("button", { name: "Groups" })).toHaveCount(0);
  });

  test("groups what the analysis suggests", async ({ page }) => {
    await page.goto("./");
    const demoCard = page.getByRole("link", { name: /Demo 1 - Text basics/ });
    await demoCard.hover();
    await demoCard.getByRole("button", { name: "Duplicate" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page.locator(".react-flow__node")).toHaveCount(6);

    // The demo's recorded analysis (its outputs are named after the workflow,
    // so under the demo's own name): Filter and Map are parallel branches.
    await page.getByRole("button", { name: "Demo 1 - Text basics Copy" }).dblclick();
    await page.getByLabel("Workflow name").fill("Demo 1 - Text basics");
    await page.getByLabel("Workflow name").press("Enter");
    await canvasSettled(page);
    await page.getByRole("button", { name: "Analyse the workflow" }).click();
    const analysis = page.getByRole("dialog", { name: /Analysis of/ });
    const suggested = analysis.getByRole("list", { name: "Suggested groups" });
    await expect(suggested).toContainText("Parallel branches");
    await expect(suggested).toContainText("Filter, Map");
    await suggested.getByRole("button", { name: "Group into subworkflow…" }).click();

    const dialog = page.getByRole("dialog", { name: "Group into a subworkflow" });
    await expect(dialog.getByLabel("Name")).toHaveValue("GROUP");
    await dialog.getByRole("button", { name: "Group", exact: true }).click();
    await expect(page.getByRole("region", { name: "Group “Group”" })).toContainText("2 steps");
  });
});
