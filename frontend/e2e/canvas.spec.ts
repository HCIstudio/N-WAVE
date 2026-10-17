import { readFile } from "node:fs/promises";
import { addNode, connect, expect, moveNode, test } from "./fixtures";

test.describe("canvas flow", () => {
  test("create a workflow, add and connect nodes, generate the script", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    // Build: File Input -> Filter -> Display Output
    // New nodes are placed next to each other, never on top.
    const input = await addNode(page, "File Input");
    // Upload while the node is in view: setting a file scrolls its field
    // into view, which would shift the canvas.
    await input.locator('input[type="file"]').setInputFiles({
      name: "greetings.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world\ngoodbye world\n"),
    });
    await expect(input).toContainText("1 file");
    await moveNode(page, input, -450, 0);
    const filter = await addNode(page, "Filter");
    const output = await addNode(page, "Display Output");
    await page.getByRole("button", { name: "Fit view" }).click();

    await connect(page, input, filter);
    await connect(page, filter, output);
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);

    // Generating the script downloads it as <workflow name>.nf
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Workflow" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.nf$/);

    const script = await readFile(await download.path(), "utf8");
    expect(script).toContain("workflow {");
    expect(script).toMatch(/process\s+\w*FILTER\w*/i);
    expect(script).toContain("greetings.txt");
  });

  test("saved workflows survive a reload", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);

    await addNode(page, "Filter");
    await page.getByRole("button", { name: "Save Workflow" }).click();

    await page.reload();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
  });

  test("the bundled demo workflow renders and can be duplicated", async ({
    page,
  }) => {
    await page.goto("./");
    const demoCard = page.getByRole("link", { name: /Demo 1 - Text basics/ });
    await demoCard.click();
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
    await expect(page.locator(".react-flow__edge")).toHaveCount(6);
    const demoUrl = page.url();

    await page.goto("./");
    await demoCard.hover();
    await demoCard.getByRole("button", { name: "Duplicate" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    expect(page.url()).not.toBe(demoUrl);
    await expect(page.locator(".react-flow__node")).toHaveCount(6);
  });

  test("unknown workflows show a not-found screen", async ({ page }) => {
    await page.goto("./workflow/does-not-exist");
    await expect(page.getByRole("alert")).toContainText("Workflow not found");
    await page.getByRole("link", { name: "Back to workflow library" }).click();
    await expect(
      page.getByRole("heading", { name: "Workflows", exact: true })
    ).toBeVisible();
  });

  test("dragging a node onto the trash deletes it", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const filter = await addNode(page, "Filter");

    const box = await filter.boundingBox();
    if (!box) throw new Error("node is not visible");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
      steps: 5,
    });
    const trash = page.locator("#delete-drop-zone");
    const zone = await trash.boundingBox();
    if (!zone) throw new Error("the trash doesn't show while dragging");
    await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, {
      steps: 10,
    });
    await expect(trash).toHaveClass(/bg-red-500/);
    await page.mouse.up();

    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });

  test("dragging a node of a built-in demo opens a copy with the node moved", async ({
    page,
  }) => {
    await page.goto("./workflow/builtin:demo-basic");
    const node = page.locator(".react-flow__node").nth(1);
    await expect(node).toBeVisible();
    const before = await node.boundingBox();
    if (!before) throw new Error("node is not visible");

    await moveNode(page, node, 160, 80);
    await expect(page).not.toHaveURL(/builtin:demo-basic/);
    await expect(page).toHaveURL(/\/workflow\//);

    // The copy has the node where it was dropped, the demo is unchanged.
    await expect
      .poll(async () => (await node.boundingBox())?.x ?? 0)
      .toBeGreaterThan(before.x + 100);
    await page.goto("./workflow/builtin:demo-basic");
    await expect(node).toBeVisible();
    expect((await node.boundingBox())?.x).toBeCloseTo(before.x, 0);
  });
});
