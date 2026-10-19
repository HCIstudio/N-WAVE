import { addNode, connect, expect, fitView, test } from "./fixtures";

test.describe("copy, paste and duplicate", () => {
  test("a copied group pastes into another workflow with its settings and connection", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const firstUrl = page.url();
    const filter = await addNode(page, "Filter");
    const output = await addNode(page, "Display Output");
    await fitView(page);
    await connect(page, filter, output);
    await filter.dblclick();
    await page.getByLabel(/filter text/i).fill("hello");
    await page.getByRole("button", { name: "Close Panel" }).first().click();

    // A corner of the canvas: its middle may hold the connection's delete button.
    await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+c");

    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    expect(page.url()).not.toBe(firstUrl);
    const nodes = page.locator(".react-flow__node");
    await expect(nodes).toHaveCount(0);
    // A paste before the workflow has loaded would be replaced by it.
    await expect(page.getByText("Loading Workflow...")).toHaveCount(0);

    await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    await page.keyboard.press("ControlOrMeta+v");
    await expect(nodes).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await fitView(page);
    await nodes.filter({ hasText: "Filter" }).first().dblclick();
    await expect(page.getByLabel(/filter text/i)).toHaveValue("hello");
  });

  test("Ctrl+D duplicates the selected node, and undo removes the copy", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const filter = await addNode(page, "Filter");
    const nodes = page.locator(".react-flow__node");

    await filter.click();
    await page.keyboard.press("ControlOrMeta+d");
    await expect(nodes).toHaveCount(2);
    await page.keyboard.press("ControlOrMeta+d");
    await expect(nodes).toHaveCount(3);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(nodes).toHaveCount(2);
  });

  test("cut removes the selection and paste brings it back", async ({ page }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const filter = await addNode(page, "Filter");
    const nodes = page.locator(".react-flow__node");

    await filter.click();
    await page.keyboard.press("ControlOrMeta+x");
    await expect(nodes).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+v");
    await expect(nodes).toHaveCount(1);
  });

  test("? and the controls button show the shortcuts", async ({ page }) => {
    await page.goto("./workflow/builtin:demo-basic");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Duplicate the selected nodes");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
    await expect(dialog).toBeVisible();
  });
});
