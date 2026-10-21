import { addNode, connect, expect, fitView, moveNode, test } from "./fixtures";

test.describe("undo and redo", () => {
  test("deleting a node can be undone and redone", async ({ page }) => {
    await page.goto("./");
    const demoCard = page.getByRole("link", { name: /Demo 1 - Text basics/ });
    await demoCard.hover();
    await demoCard.getByRole("button", { name: "Duplicate" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const nodes = page.locator(".react-flow__node");
    const edges = page.locator(".react-flow__edge");
    await expect(nodes).toHaveCount(6);
    await expect(edges).toHaveCount(6);

    // Opening the workflow, and the data its nodes derive, is no step.
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await page.waitForTimeout(1000);
    await expect(undo).toBeDisabled();

    await nodes.nth(1).click();
    await page.keyboard.press("Backspace");
    await expect(nodes).toHaveCount(5);
    const edgesLeft = await edges.count();
    expect(edgesLeft).toBeLessThan(6);

    await page.keyboard.press("ControlOrMeta+z");
    await expect(nodes).toHaveCount(6);
    await expect(edges).toHaveCount(6);

    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(nodes).toHaveCount(5);
    await expect(edges).toHaveCount(edgesLeft);

    await undo.click();
    await expect(nodes).toHaveCount(6);
  });

  test("connecting, typing a setting and moving are each one step", async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "New Workflow" }).click();
    await page.getByRole("button", { name: "Empty workflow" }).click();
    await expect(page).toHaveURL(/\/workflow\//);
    const filter = await addNode(page, "Filter");
    const output = await addNode(page, "Display Output");
    await fitView(page);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    const edges = page.locator(".react-flow__edge");

    await connect(page, filter, output);
    await expect(edges).toHaveCount(1);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(edges).toHaveCount(0);
    await redo.click();
    await expect(edges).toHaveCount(1);

    // Typing a filter text key by key is one step.
    await filter.dblclick();
    const field = page.getByLabel(/filter text/i);
    await field.pressSequentially("hello", { delay: 50 });
    await expect(field).toHaveValue("hello");
    await page.waitForTimeout(800);
    await undo.click();
    await expect(field).toHaveValue("");
    await redo.click();
    await expect(field).toHaveValue("hello");
    await page.getByRole("button", { name: "Close Panel" }).first().click();

    const before = await output.boundingBox();
    await moveNode(page, output, 120, 60);
    await expect
      .poll(async () => (await output.boundingBox())?.x ?? 0)
      .toBeGreaterThan((before?.x ?? 0) + 80);
    await page.waitForTimeout(800);
    await undo.click();
    await expect
      .poll(async () => (await output.boundingBox())?.x ?? 0)
      .toBeCloseTo(before?.x ?? 0, 0);
    await expect(edges).toHaveCount(1);
  });

  test("isn't offered on a read-only example", async ({ page }) => {
    await page.goto("./workflow/builtin:demo-basic");
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
  });
});
