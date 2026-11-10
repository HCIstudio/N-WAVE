import { readFile } from "node:fs/promises";
import { expect, test, exportAs } from "./fixtures";

// Export and import through the DAW model (#194).
test.describe("DAW model", () => {
  test("exports a workflow as a DAW model and imports it back as the same canvas", async ({ page }) => {
    await page.goto("./workflow/builtin:demo-basic");
    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(6);

    const downloadPromise = page.waitForEvent("download");
    await exportAs(page, "Download DAW model");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.daw\.json$/);
    const text = await readFile(await download.path(), "utf8");
    const model = JSON.parse(text);
    expect(model.schema).toBe("n-wave-daw/1");
    expect(model.daw.tasks.map((task: { type: string }) => task.type)).toEqual(["Executable", "Executable", "Executable", "Executable"]);
    expect(model.daw.storages.map((storage: { type: string }) => storage.type)).toEqual(["FileStorage", "FileStorage"]);
    expect(model.daw.interconnections).toHaveLength(6);

    await page.goto("./");
    await page.getByRole("button", { name: "Import Workflow" }).click();
    await page.getByLabel("Nextflow Source").fill(text);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(nodes).toHaveCount(6);
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
    // The same model again.
    const again = page.waitForEvent("download");
    await exportAs(page, "Download DAW model");
    expect(await readFile(await (await again).path(), "utf8")).toBe(text);
  });

  test("opens an abstract workflow as placeholders to fill in", async ({ page }) => {
    const abstract = {
      schema: "n-wave-daw/1",
      daw: {
        id: "average",
        name: "Average of values",
        tasks: [
          { id: "sum", name: "Sum", type: "Task", description: "Add up the values." },
          { id: "count", name: "Count", type: "Task" },
          { id: "divide", name: "Divide", type: "Task" },
        ],
        storages: [
          { id: "input", name: "Values", type: "FileStorage" },
          { id: "output", name: "Average", type: "FileStorage" },
        ],
        interconnections: [
          { id: "i1", type: "StreamingInterconnection", from: { element: "input" }, to: { element: "sum" } },
          { id: "i2", type: "StreamingInterconnection", from: { element: "input" }, to: { element: "count" } },
          { id: "i3", type: "StreamingInterconnection", from: { element: "sum" }, to: { element: "divide", port: "sum" } },
          { id: "i4", type: "StreamingInterconnection", from: { element: "count" }, to: { element: "divide", port: "count" } },
          { id: "i5", type: "StreamingInterconnection", from: { element: "divide" }, to: { element: "output" } },
        ],
      },
    };
    await page.goto("./");
    await page.getByRole("button", { name: "Import Workflow" }).click();
    await page.getByLabel("Nextflow Source").fill(JSON.stringify(abstract));
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    await expect(page.locator(".react-flow__node")).toHaveCount(5);
    await expect(page.locator(".react-flow__edge")).toHaveCount(5);
    const sum = page.locator('.react-flow__node[data-id="sum"]');
    await expect(sum).toContainText("To do: no implementation yet");
    await expect(page.getByText(/3 steps have no implementation in the model/)).toBeVisible();
    // The workflow check points at each placeholder.
    await page.getByRole("button", { name: /Workflow check/ }).click();
    await expect(page.getByText("“Sum” has no implementation yet.", { exact: false })).toBeVisible();
  });
});
