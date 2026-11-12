import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";

// Diagrams from the Export dialog: the canvas, and the graphs of the code.
test.describe("diagrams", () => {
  test("exports the canvas as SVG and PNG, and a graph of the code as Mermaid", async ({ page }) => {
    await page.goto("./workflow/builtin:demo-basic");
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    const dialog = page.getByRole("dialog", { name: "Export workflow" });

    // Before an analysis, only the editor's canvas (a single choice: no list).
    await exportButton.click();
    await expect(dialog.getByLabel("Of")).toHaveCount(0);
    let download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download diagram as SVG" }).click();
    const svg = await download;
    expect(svg.suggestedFilename()).toBe("Demo_1_-_Text_basics.svg");
    const drawing = await readFile(await svg.path(), "utf8");
    expect(drawing).toContain("<svg");
    expect(drawing).toContain("Filter");
    expect(drawing.match(/<rect x=/g)).toHaveLength(6);

    await exportButton.click();
    download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download diagram as PNG" }).click();
    const png = await readFile(await (await download).path());
    expect(png.subarray(1, 4).toString()).toBe("PNG");

    // The demo's recorded analysis: the graphs of its code too.
    await page.getByRole("button", { name: "Analyse the workflow" }).click();
    const analysis = page.getByRole("dialog", { name: /Analysis of/ });
    await expect(analysis.getByText("No problems found in the code.")).toBeVisible();
    await page.keyboard.press("Escape");
    await exportButton.click();
    await expect(dialog.getByLabel("Of").locator("option")).toHaveText([
      "Editor: the canvas as drawn",
      "Specification graph: every process, operation and channel",
      "Process dependency graph: which process depends on which",
    ]);
    await dialog.getByLabel("Of").selectOption({ label: "Process dependency graph: which process depends on which" });
    download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download diagram as Mermaid" }).click();
    const mermaid = await download;
    expect(mermaid.suggestedFilename()).toBe("Demo_1_-_Text_basics.dependencies.mmd");
    expect(await readFile(await mermaid.path(), "utf8")).toMatch(/^flowchart LR\n/);
  });
});
