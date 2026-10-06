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
    const input = await addNode(page, "File Input");
    await moveNode(page, input, -450, 0);
    const filter = await addNode(page, "Filter");
    await moveNode(page, filter, -100, 0);
    const output = await addNode(page, "Display Output");
    await moveNode(page, output, 250, 0);

    await input.locator('input[type="file"]').setInputFiles({
      name: "greetings.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello world\ngoodbye world\n"),
    });
    await expect(input).toContainText("1 file");

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
    const demoCard = page.getByRole("link", { name: /Demo Workflow/ });
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
      page.getByRole("heading", { name: "Workflows" })
    ).toBeVisible();
  });
});
